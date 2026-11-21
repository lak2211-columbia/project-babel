from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Callable
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup, Tag

from observatory.url_safety import decode_html_bytes, same_host_family


DOWNLOAD_URL_MARKERS = ("/download/", "/document/", "redirection/document/", "/down.do", "filedown.do")
PIPC_DOWNLOAD_PATTERN = re.compile(
    r"fn_egov_downFile(?:Cnv)?\(\s*['\"](?P<atch>FILE_[^'\"]+)['\"]\s*,\s*['\"](?P<sn>\d+)['\"]\s*,\s*['\"](?P<ext>[^'\"]+)['\"]",
    re.IGNORECASE,
)
QUOTED_URL_PATTERN = re.compile(r"['\"](?P<url>(?:https?://|/)[^'\"]+)['\"]", re.IGNORECASE)
MSIT_DOWNLOAD_PATTERN = re.compile(
    r"fn_download\(\s*['\"](?P<atch>\d+)['\"]\s*,\s*['\"](?P<ord>\d+)['\"]\s*,\s*['\"](?P<ext>[^'\"]+)['\"]",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class LinkedArtifactCandidate:
    url: str
    context_text: str
    anchor_text: str
    has_download_attr: bool
    pdf_hint: bool
    format_hint: str | None


def _normalize_text(value: str) -> str:
    return " ".join(value.replace("\xa0", " ").split())


def _context_text(anchor: Tag) -> str:
    for parent in anchor.parents:
        if not isinstance(parent, Tag):
            continue
        if parent.name not in {"div", "li", "article", "section", "tr", "td"}:
            continue
        text = _normalize_text(parent.get_text(" ", strip=True))
        if 20 <= len(text) <= 600:
            return text
    return _normalize_text(anchor.get_text(" ", strip=True))


def _default_same_host_family(base_url: str, candidate_url: str) -> bool:
    return same_host_family(base_url, candidate_url)


def _is_http_url(candidate_url: str) -> bool:
    return urlparse(candidate_url).scheme in {"http", "https"}


def _is_download_like_url(candidate_url: str) -> bool:
    normalized = candidate_url.lower()
    parsed = urlparse(candidate_url)
    combined = f"{parsed.path}{parsed.query}".lower()
    return any(ext in combined for ext in (".pdf", ".hwpx", ".hwp", ".odt")) or any(
        marker in normalized for marker in DOWNLOAD_URL_MARKERS
    )


def _format_hint_from_url(candidate_url: str) -> str | None:
    combined = f"{urlparse(candidate_url).path}{urlparse(candidate_url).query}".lower()
    if ".pdf" in combined or "fileextsn=pdf" in combined:
        return "pdf"
    if ".hwpx" in combined:
        return "hwpx"
    if ".hwp" in combined:
        return "hwp"
    if ".odt" in combined:
        return "odt"
    return None


def _append_candidate(
    candidates: dict[str, LinkedArtifactCandidate],
    candidate: LinkedArtifactCandidate,
) -> None:
    existing = candidates.get(candidate.url)
    if existing is None:
        candidates[candidate.url] = candidate
        return
    existing_score = (2 if existing.pdf_hint else 0) + (1 if existing.has_download_attr else 0) + len(existing.context_text)
    candidate_score = (2 if candidate.pdf_hint else 0) + (1 if candidate.has_download_attr else 0) + len(candidate.context_text)
    if candidate_score > existing_score:
        candidates[candidate.url] = candidate


def _onclick_candidate_urls(onclick: str, *, base_url: str) -> list[tuple[str, str | None]]:
    urls: list[tuple[str, str | None]] = []

    for match in PIPC_DOWNLOAD_PATTERN.finditer(onclick):
        attachment_id = match.group("atch")
        file_sn = match.group("sn")
        extension = match.group("ext")
        url = urljoin(
            base_url,
            f"/np/cmm/fms/FileDown.do?atchFileId={attachment_id}&fileSn={file_sn}&fileExtsn={extension}&cnvCnt=",
        )
        candidate = (url, extension.lower())
        if candidate not in urls:
            urls.append(candidate)

    for match in MSIT_DOWNLOAD_PATTERN.finditer(onclick):
        attachment_id = match.group("atch")
        file_ord = match.group("ord")
        extension = match.group("ext").lower()
        url = urljoin(base_url, f"/ssm/file/fileDown.do?atchFileNo={attachment_id}&fileOrd={file_ord}")
        candidate = (url, extension)
        if candidate not in urls:
            urls.append(candidate)

    for match in QUOTED_URL_PATTERN.finditer(onclick):
        candidate_url = urljoin(base_url, match.group("url"))
        candidate = (candidate_url, _format_hint_from_url(candidate_url))
        if candidate not in urls and _is_download_like_url(candidate_url):
            urls.append(candidate)

    return urls


def extract_linked_artifact_candidates(
    payload_or_soup: bytes | str | BeautifulSoup,
    *,
    base_url: str,
    same_host_family: Callable[[str, str], bool] | None = None,
) -> list[LinkedArtifactCandidate]:
    if isinstance(payload_or_soup, BeautifulSoup):
        soup = payload_or_soup
    elif isinstance(payload_or_soup, bytes):
        soup = BeautifulSoup(decode_html_bytes(payload_or_soup), "html.parser")
    else:
        soup = BeautifulSoup(payload_or_soup, "html.parser")

    host_checker = same_host_family or _default_same_host_family
    candidates: dict[str, LinkedArtifactCandidate] = {}

    for anchor in soup.find_all("a"):
        context_text = _context_text(anchor)
        anchor_text = _normalize_text(anchor.get_text(" ", strip=True))
        has_download_attr = anchor.has_attr("download")

        href = anchor.get("href")
        if isinstance(href, str):
            candidate_url = urljoin(base_url, href)
            format_hint = _format_hint_from_url(candidate_url)
            pdf_hint = format_hint == "pdf" or "pdf" in context_text.lower() or "pdf" in anchor_text.lower()
            if format_hint is None and pdf_hint:
                format_hint = "pdf"
            if _is_http_url(candidate_url) and host_checker(base_url, candidate_url) and (
                has_download_attr or _is_download_like_url(candidate_url)
            ):
                _append_candidate(
                    candidates,
                    LinkedArtifactCandidate(
                        url=candidate_url,
                        context_text=context_text,
                        anchor_text=anchor_text,
                        has_download_attr=has_download_attr,
                        pdf_hint=pdf_hint,
                        format_hint=format_hint,
                    ),
                )

        onclick = anchor.get("onclick")
        if not isinstance(onclick, str):
            continue
        for candidate_url, format_hint in _onclick_candidate_urls(onclick, base_url=base_url):
            if not _is_http_url(candidate_url) or not host_checker(base_url, candidate_url):
                continue
            combined = f"{urlparse(candidate_url).path}{urlparse(candidate_url).query}".lower()
            pdf_hint = format_hint == "pdf" or ".pdf" in combined or "fileextsn=pdf" in combined or "pdf" in context_text.lower()
            if format_hint is None and pdf_hint:
                format_hint = "pdf"
            _append_candidate(
                candidates,
                LinkedArtifactCandidate(
                    url=candidate_url,
                    context_text=context_text,
                    anchor_text=anchor_text,
                    has_download_attr=has_download_attr,
                    pdf_hint=pdf_hint,
                    format_hint=format_hint,
                ),
            )

    return list(candidates.values())


def extract_linked_pdf_urls(
    payload_or_soup: bytes | str | BeautifulSoup,
    *,
    base_url: str,
    same_host_family: Callable[[str, str], bool] | None = None,
) -> list[str]:
    return [
        candidate.url
        for candidate in extract_linked_artifact_candidates(
            payload_or_soup,
            base_url=base_url,
            same_host_family=same_host_family,
        )
        if candidate.pdf_hint
    ]
