from __future__ import annotations

import json
import re
import socket
import subprocess
import unicodedata
from io import BytesIO
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from shutil import which
from tempfile import TemporaryDirectory
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen
from xml.etree import ElementTree as ET
from zipfile import BadZipFile, ZipFile

from bs4 import BeautifulSoup, Tag
from pydantic import BaseModel, Field
from pypdf import PdfReader

from observatory.linked_artifacts import extract_linked_artifact_candidates
from observatory.source_registry import ROOT


PARSER_VERSION = "0.1.0"
RAW_DATA_DIR = ROOT / "data" / "raw"
PARSED_DATA_DIR = ROOT / "data" / "parsed"
CONTENT_ROOT_SELECTORS = (
    ".board_view",
    ".view_head",
    ".view_cont",
    "#UCAP-CONTENT",
    "#bodyContent",
    "#contentBody",
    "#conScroll",
    ".boardViewArea",
    ".tbView",
    ".pages_content",
    ".lawcon",
    ".cont_area",
    "main",
    "article",
    "[role='main']",
    ".article",
    ".article-body",
    ".article__body",
    ".article-content",
    ".entry-content",
    ".post-content",
    ".content",
    ".content-body",
    ".detail",
    ".detail-content",
    ".txt",
    ".texte",
)
TEXT_BLOCK_TAGS = {"h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "blockquote", "pre", "td", "th"}
DATE_INPUT_FORMATS = (
    "%Y-%m-%d",
    "%Y/%m/%d",
    "%d %B %Y",
    "%d %b %Y",
    "%B %d, %Y",
    "%b %d, %Y",
    "%d.%m.%Y",
)
LANGUAGE_HINTS = {
    "en": {"english"},
    "ja": {"japanese"},
    "ko": {"korean"},
    "zh": {"chinese"},
}
SUPPLEMENTARY_ATTACHMENT_MARKERS = (
    "pledges",
    "vademecum",
    "technical guidance",
    "submitting documents",
    "eu send",
    "concept paper",
    "second draft",
    "initial draft",
    "request for information",
    "responses",
    "policy principles",
    "federal engagement",
)
DATE_INLINE_PATTERNS = (
    re.compile(r"\b\d{4}-\d{2}-\d{2}\b"),
    re.compile(r"\b\d{4}/\d{2}/\d{2}\b"),
    re.compile(
        r"\b\d{1,2}\s+"
        r"(January|February|March|April|May|June|July|August|September|October|November|December)"
        r"\s+\d{4}\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b"
        r"(January|February|March|April|May|June|July|August|September|October|November|December)"
        r"\s+\d{1,2},\s+\d{4}\b",
        re.IGNORECASE,
    ),
)
PUBLICATION_LABEL_PATTERN = re.compile(
    r"^(publication|published|published on|date published|date of publication|posted)\s*:?\s+(.+)$",
    re.IGNORECASE,
)
UPDATED_LABEL_PATTERN = re.compile(
    r"^(last update|last updated|updated|updated on|date updated|last modified|modified)\s*:?\s+(.+)$",
    re.IGNORECASE,
)
PUBLICATION_META_KEYS = {
    "article:published_time",
    "article:published",
    "date",
    "datecreated",
    "datepublished",
    "dc.date",
    "dc.date.created",
    "dcterms.created",
    "pubdate",
    "publishdate",
}
UPDATED_META_KEYS = {
    "article:modified_time",
    "date.modified",
    "datemodified",
    "dcterms.modified",
    "last-modified",
    "lastmodified",
    "modified",
}
PUBLICATION_JSON_KEYS = {"datepublished", "datecreated", "uploaddate"}
UPDATED_JSON_KEYS = {"datemodified", "dateupdated"}


@dataclass(frozen=True)
class SourceDateCandidate:
    field: str
    value: str
    text: str
    method: str
    priority: int


class ParsedSection(BaseModel):
    heading: str
    level: int
    content: str


class ParsedDocument(BaseModel):
    parser_version: str
    title: str
    language: str | None = None
    document_format: str
    plain_text: str
    sections: list[ParsedSection] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    source_artifact_path: str


@dataclass
class RawDocumentRecord:
    jurisdiction: str
    document_id: str
    metadata_path: Path
    metadata: dict[str, Any]


def _normalize_text(value: str) -> str:
    lines = [" ".join(line.split()) for line in value.replace("\xa0", " ").splitlines()]
    cleaned = "\n".join(line for line in lines if line)
    return cleaned.strip()


def _parse_date_value(value: str) -> str | None:
    normalized = _normalize_text(value)
    if not normalized:
        return None

    iso_candidate = normalized.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(iso_candidate).date().isoformat()
    except ValueError:
        pass

    for fmt in DATE_INPUT_FORMATS:
        try:
            return datetime.strptime(normalized, fmt).date().isoformat()
        except ValueError:
            continue

    for pattern in DATE_INLINE_PATTERNS:
        match = pattern.search(normalized)
        if match is None:
            continue
        extracted = match.group(0)
        for fmt in DATE_INPUT_FORMATS:
            try:
                return datetime.strptime(extracted, fmt).date().isoformat()
            except ValueError:
                continue

    return None


def _metadata_language(metadata: dict[str, Any]) -> str | None:
    language = metadata.get("language")
    if isinstance(language, str) and language:
        return language
    languages = metadata.get("languages")
    if isinstance(languages, list) and languages:
        primary = languages[0]
        if isinstance(primary, str) and primary:
            return primary
    return None


def _display_path(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def _same_host_family(base_url: str, candidate_url: str) -> bool:
    base_host = urlparse(base_url).netloc.lower()
    candidate_host = urlparse(candidate_url).netloc.lower()
    if base_host.endswith(".europa.eu") and candidate_host.endswith(".europa.eu"):
        return True
    return (
        candidate_host == base_host
        or candidate_host.endswith(f".{base_host}")
        or base_host.endswith(f".{candidate_host}")
    )


def _keyword_tokens(value: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-z0-9]{3,}", value.lower())
        if token not in {"the", "and", "for", "with", "from", "that", "this", "page"}
    }


def _next_textual_sibling(element: Tag) -> str | None:
    for sibling in element.next_siblings:
        if not isinstance(sibling, Tag):
            continue
        text = _normalize_text(sibling.get_text(" ", strip=True))
        if text:
            return text
    return None


def _meta_date_candidates(soup: BeautifulSoup) -> list[SourceDateCandidate]:
    candidates: list[SourceDateCandidate] = []
    for tag in soup.find_all("meta"):
        raw_key = tag.get("property") or tag.get("name") or tag.get("itemprop")
        content = tag.get("content")
        if not isinstance(raw_key, str) or not isinstance(content, str):
            continue
        key = raw_key.strip().lower()
        parsed = _parse_date_value(content)
        if not parsed:
            continue
        if key in PUBLICATION_META_KEYS:
            candidates.append(
                SourceDateCandidate(
                    field="publication_date",
                    value=parsed,
                    text=content.strip(),
                    method=f"meta:{key}",
                    priority=120,
                )
            )
        if key in UPDATED_META_KEYS:
            candidates.append(
                SourceDateCandidate(
                    field="last_updated_date",
                    value=parsed,
                    text=content.strip(),
                    method=f"meta:{key}",
                    priority=120,
                )
            )
    return candidates


def _walk_jsonld(value: Any) -> list[tuple[str, Any]]:
    if isinstance(value, dict):
        collected: list[tuple[str, Any]] = list(value.items())
        for nested in value.values():
            collected.extend(_walk_jsonld(nested))
        return collected
    if isinstance(value, list):
        collected = []
        for item in value:
            collected.extend(_walk_jsonld(item))
        return collected
    return []


def _jsonld_date_candidates(soup: BeautifulSoup) -> list[SourceDateCandidate]:
    candidates: list[SourceDateCandidate] = []
    for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
        raw_payload = script.string or script.get_text()
        if not raw_payload:
            continue
        try:
            payload = json.loads(raw_payload)
        except json.JSONDecodeError:
            continue
        for key, value in _walk_jsonld(payload):
            if not isinstance(value, str):
                continue
            normalized_key = key.strip().lower()
            parsed = _parse_date_value(value)
            if not parsed:
                continue
            if normalized_key in PUBLICATION_JSON_KEYS:
                candidates.append(
                    SourceDateCandidate(
                        field="publication_date",
                        value=parsed,
                        text=value.strip(),
                        method=f"jsonld:{normalized_key}",
                        priority=110,
                    )
                )
            if normalized_key in UPDATED_JSON_KEYS:
                candidates.append(
                    SourceDateCandidate(
                        field="last_updated_date",
                        value=parsed,
                        text=value.strip(),
                        method=f"jsonld:{normalized_key}",
                        priority=110,
                    )
                )
    return candidates


def _visible_date_candidates(soup: BeautifulSoup) -> list[SourceDateCandidate]:
    candidates: list[SourceDateCandidate] = []
    body = soup.body or soup

    for element in body.find_all(["li", "p", "div", "span", "time"]):
        text = _normalize_text(element.get_text(" ", strip=True))
        if not text or len(text) > 120:
            continue

        publication_match = PUBLICATION_LABEL_PATTERN.match(text)
        if publication_match is not None:
            parsed = _parse_date_value(publication_match.group(2))
            if parsed:
                candidates.append(
                    SourceDateCandidate(
                        field="publication_date",
                        value=parsed,
                        text=text,
                        method="visible_inline_label",
                        priority=100,
                    )
                )

        updated_match = UPDATED_LABEL_PATTERN.match(text)
        if updated_match is not None:
            parsed = _parse_date_value(updated_match.group(2))
            if parsed:
                candidates.append(
                    SourceDateCandidate(
                        field="last_updated_date",
                        value=parsed,
                        text=text,
                        method="visible_inline_label",
                        priority=100,
                    )
                )

    for element in body.find_all(["h1", "h2", "h3", "h4", "h5", "h6", "dt", "th", "strong", "b"]):
        label = _normalize_text(element.get_text(" ", strip=True)).lower().rstrip(":")
        if not label:
            continue
        sibling_text = _next_textual_sibling(element)
        if not sibling_text:
            continue
        parsed = _parse_date_value(sibling_text)
        if not parsed:
            continue
        if label in {"publication", "published", "published on", "date published", "date of publication"}:
            candidates.append(
                SourceDateCandidate(
                    field="publication_date",
                    value=parsed,
                    text=f"{label}: {sibling_text}",
                    method="visible_label_sibling",
                    priority=105,
                )
            )
        if label in {"last update", "last updated", "updated", "updated on", "date updated", "last modified", "modified"}:
            candidates.append(
                SourceDateCandidate(
                    field="last_updated_date",
                    value=parsed,
                    text=f"{label}: {sibling_text}",
                    method="visible_label_sibling",
                    priority=105,
                )
            )

    return candidates


def extract_html_source_metadata(artifact_path: Path) -> dict[str, str]:
    html = artifact_path.read_text(encoding="utf-8", errors="ignore")
    soup = BeautifulSoup(html, "html.parser")

    candidates = [
        *_meta_date_candidates(soup),
        *_jsonld_date_candidates(soup),
        *_visible_date_candidates(soup),
    ]

    best_by_field: dict[str, SourceDateCandidate] = {}
    for candidate in candidates:
        current = best_by_field.get(candidate.field)
        if current is None or candidate.priority > current.priority:
            best_by_field[candidate.field] = candidate

    metadata: dict[str, str] = {}
    publication = best_by_field.get("publication_date")
    if publication is not None:
        metadata["source_publication_date"] = publication.value
        metadata["source_publication_date_text"] = publication.text
        metadata["source_publication_date_method"] = publication.method

    last_updated = best_by_field.get("last_updated_date")
    if last_updated is not None:
        metadata["source_last_updated_date"] = last_updated.value
        metadata["source_last_updated_date_text"] = last_updated.text
        metadata["source_last_updated_date_method"] = last_updated.method

    return metadata


def _apply_extracted_source_metadata(metadata: dict[str, Any], extracted: dict[str, str]) -> bool:
    changed = False
    for key, value in extracted.items():
        if metadata.get(key) != value:
            metadata[key] = value
            changed = True

    source_publication_date = extracted.get("source_publication_date")
    current_publication_date = metadata.get("publication_date")
    if source_publication_date:
        if current_publication_date and current_publication_date != source_publication_date:
            if metadata.get("seed_publication_date") != current_publication_date:
                metadata["seed_publication_date"] = current_publication_date
                changed = True
        if metadata.get("publication_date") != source_publication_date:
            metadata["publication_date"] = source_publication_date
            changed = True

    source_last_updated_date = extracted.get("source_last_updated_date")
    if source_last_updated_date and metadata.get("last_updated_date") != source_last_updated_date:
        metadata["last_updated_date"] = source_last_updated_date
        changed = True

    return changed


def _load_raw_document_records(
    jurisdiction: str | None = None,
    document_id: str | None = None,
) -> list[RawDocumentRecord]:
    records: list[RawDocumentRecord] = []
    if not RAW_DATA_DIR.exists():
        return records

    for metadata_path in sorted(RAW_DATA_DIR.glob("*/*/metadata.json")):
        with metadata_path.open("r", encoding="utf-8") as handle:
            metadata = json.load(handle)

        record = RawDocumentRecord(
            jurisdiction=metadata["jurisdiction"],
            document_id=metadata["document_id"],
            metadata_path=metadata_path,
            metadata=metadata,
        )
        if jurisdiction is not None and record.jurisdiction != jurisdiction:
            continue
        if document_id is not None and record.document_id != document_id:
            continue
        records.append(record)

    return records


def _artifact_path(metadata: dict[str, Any]) -> Path:
    embedded_artifact_path = metadata.get("embedded_artifact_path")
    if embedded_artifact_path:
        embedded = ROOT / embedded_artifact_path
        if embedded.exists():
            return embedded
    return ROOT / metadata["artifact_path"]


def _prune_noise_nodes(root: Tag) -> None:
    for node in root.find_all(["script", "style", "noscript", "header", "footer", "nav", "aside"]):
        node.decompose()
    for node in root.find_all("form"):
        node.unwrap()
    for selector in (
        ".cont_icon",
        ".shareLayer",
        "#share_popup",
        "#bodyContentError",
        ".lawico01",
        ".open_mark",
        ".view_nav",
        ".prev_next",
        ".board_file",
        ".file_area",
        ".pagination",
        ".breadcrumb",
        ".breadcrumbs",
    ):
        for node in root.select(selector):
            node.decompose()


def _content_root_score(element: Tag) -> int:
    text = _normalize_text(element.get_text("\n", strip=True))
    if not text:
        return -1
    heading_count = len(element.find_all(["h1", "h2", "h3", "h4", "h5", "h6"]))
    block_count = len(element.find_all(["p", "li", "blockquote", "pre"]))
    link_count = len(element.find_all("a"))
    score = len(text) + (heading_count * 400) + (block_count * 40) - (link_count * 6)
    element_id = element.get("id") or ""
    element_classes = set(element.get("class") or [])
    if element_id in {"bodyContent", "contentBody", "conScroll"}:
        score += 4000
    if {"lawcon", "cont_area", "boardViewArea", "tbView"} & element_classes:
        score += 2500
    return score


def _select_content_root(body: Tag) -> Tag:
    candidates: list[Tag] = []
    seen: set[int] = set()
    for selector in CONTENT_ROOT_SELECTORS:
        for candidate in body.select(selector):
            marker = id(candidate)
            if marker in seen:
                continue
            seen.add(marker)
            candidates.append(candidate)

    if candidates:
        best_candidate = max(candidates, key=_content_root_score)
        if _content_root_score(best_candidate) > 500:
            return best_candidate

    return body


def _content_text_nodes(root: Tag) -> list[Tag]:
    collected: list[Tag] = []
    for element in root.find_all(TEXT_BLOCK_TAGS):
        if element.name in {"td", "th"} and element.find(TEXT_BLOCK_TAGS - {"td", "th"}):
            continue
        text = _normalize_text(element.get_text("\n", strip=True))
        if not text:
            continue
        collected.append(element)
    return collected


def _looks_like_image_only_content(root: Tag) -> bool:
    image_count = len(root.find_all("img"))
    if image_count < 2:
        return False

    text_fragments: list[str] = []
    for element in root.find_all(TEXT_BLOCK_TAGS):
        text = _normalize_text(element.get_text(" ", strip=True))
        if text:
            text_fragments.append(text)

    non_whitespace = len("".join(" ".join(text_fragments).split()))
    return non_whitespace < 120


def _finalize_section(sections: list[ParsedSection], heading: str, level: int, content_lines: list[str]) -> None:
    content = "\n".join(line for line in content_lines if line).strip()
    if content:
        sections.append(ParsedSection(heading=heading, level=level, content=content))


def _is_emphasized_heading(element: Tag, text: str) -> bool:
    if element.name not in {"p", "td", "th"}:
        return False
    if len(text) > 120:
        return False

    style = (element.get("style") or "").lower()
    if "font-weight: bold" in style:
        return True

    if element.find(["strong", "b"]) is not None:
        return True

    for descendant in element.find_all(["span", "font"]):
        descendant_style = (descendant.get("style") or "").lower()
        if "font-weight: bold" in descendant_style:
            return True

    return False


def _fetch_embedded_html_if_needed(
    artifact_path: Path,
    metadata: dict[str, Any],
) -> tuple[Path, list[str]]:
    warnings: list[str] = []
    if artifact_path.suffix.lower() != ".html":
        return artifact_path, warnings

    html = artifact_path.read_text(encoding="utf-8", errors="ignore")
    soup = BeautifulSoup(html, "html.parser")
    iframe = soup.find("iframe")
    visible_text = _normalize_text(soup.get_text("\n"))
    if iframe is None or len(visible_text) > 300:
        return artifact_path, warnings

    iframe_src = iframe.get("src")
    if not iframe_src:
        warnings.append("iframe_shell_without_src")
        return artifact_path, warnings

    embedded_path = artifact_path.with_name("embedded_source.html")
    if embedded_path.exists():
        metadata["embedded_artifact_path"] = str(embedded_path.relative_to(ROOT))
        metadata_path = artifact_path.with_name("metadata.json")
        metadata_path.write_text(json.dumps(metadata, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        warnings.append("used_cached_embedded_html")
        return embedded_path, warnings

    target_url = urljoin(metadata["canonical_url"], iframe_src)
    request = Request(
        target_url,
        headers={"User-Agent": "AI-Governance-Observatory/0.1 (+https://github.com/openai/codex)"},
    )
    try:
        with urlopen(request, timeout=15) as response:
            embedded_payload = response.read()
    except (HTTPError, URLError, TimeoutError, socket.timeout) as exc:
        warnings.append(f"iframe_fetch_failed:{exc}")
        warnings.append(f"iframe_src:{target_url}")
        return artifact_path, warnings

    embedded_path.write_bytes(embedded_payload)
    metadata["embedded_artifact_path"] = str(embedded_path.relative_to(ROOT))
    metadata_path = artifact_path.with_name("metadata.json")
    metadata_path.write_text(json.dumps(metadata, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    warnings.append(f"fetched_embedded_html:{target_url}")
    return embedded_path, warnings


def _wrapper_page_visible_text(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    _prune_noise_nodes(soup)
    content_root = _select_content_root(soup)
    return _normalize_text(content_root.get_text("\n"))


def _download_context_text(anchor: Tag) -> str:
    for parent in anchor.parents:
        if not isinstance(parent, Tag):
            continue
        if parent.name not in {"div", "li", "article", "section", "tr", "td"}:
            continue
        text = _normalize_text(parent.get_text(" ", strip=True))
        if 20 <= len(text) <= 600:
            return text
    return _normalize_text(anchor.get_text(" ", strip=True))


def _artifact_selection_bonus(title: str | None, context_lower: str, format_hint: str | None) -> int:
    if not isinstance(title, str):
        return 0
    title_lower = title.lower()
    bonus = 0
    if format_hint == "hwpx":
        bonus += 20
    elif format_hint == "odt":
        bonus += 10
    elif format_hint == "hwp":
        bonus -= 20
    if any(marker in title_lower for marker in {"입법예고", "행정예고", "draft notice", "notice"}):
        if any(marker in context_lower for marker in {"시행령(안)", "시행규칙(안)", "법률안", "(안)"}):
            bonus += 70
        if "입법예고" in context_lower or "행정예고" in context_lower:
            bonus -= 20
    return bonus


def _effective_linked_format(candidate_url: str, context_lower: str, has_download_attr: bool, format_hint: str | None, pdf_hint: bool) -> str | None:
    if format_hint in {"pdf", "hwpx", "odt"}:
        return format_hint
    if pdf_hint:
        return "pdf"
    if has_download_attr:
        return "pdf"
    if any(marker in candidate_url.lower() for marker in {"/download/", "/document/", "redirection/document/"}):
        return "pdf"
    if any(marker in context_lower for marker in {"downloads", "download", "다운로드"}):
        return "pdf"
    return None


def _select_primary_linked_artifact(
    soup: BeautifulSoup,
    *,
    base_url: str,
    metadata: dict[str, Any],
) -> tuple[str, str, str] | None:
    title = metadata.get("title")
    title_tokens = _keyword_tokens(title) if isinstance(title, str) else set()
    title_lower = title.lower() if isinstance(title, str) else ""
    preferred_language = _metadata_language(metadata)
    preferred_hints = LANGUAGE_HINTS.get(preferred_language or "", set())

    best_score = 0
    best_candidate: tuple[str, str, str] | None = None

    for candidate in extract_linked_artifact_candidates(
        soup,
        base_url=base_url,
        same_host_family=_same_host_family,
    ):
        candidate_url = candidate.url
        context_text = candidate.context_text or candidate.anchor_text
        context_lower = context_text.lower()
        effective_format = _effective_linked_format(
            candidate_url,
            context_lower,
            candidate.has_download_attr,
            candidate.format_hint,
            candidate.pdf_hint,
        )
        if effective_format not in {"pdf", "hwpx", "odt"}:
            continue
        anchor_text = candidate.anchor_text.lower()
        score = 0

        if effective_format == "pdf" or candidate.pdf_hint or "pdf" in context_lower or ".pdf" in candidate_url.lower():
            score += 80
        if effective_format == "hwpx":
            score += 70
        if effective_format == "odt":
            score += 45
        if any(marker in context_lower for marker in {"download", "downloads", "다운로드"}):
            score += 20
        if any(marker in anchor_text for marker in {"download", "다운로드"}) or candidate.has_download_attr:
            score += 20
        if any(marker in candidate_url.lower() for marker in {"/download/", "/document/", "redirection/document/"}):
            score += 20

        overlap = title_tokens & _keyword_tokens(context_text)
        score += len(overlap) * 8
        if len(overlap) >= 3:
            score += 20
        if candidate.has_download_attr and len(overlap) >= 3:
            score += 20
        if preferred_language == "en" and title_tokens and len(overlap) < 3:
            score -= 75

        if any(marker in context_lower and marker not in title_lower for marker in SUPPLEMENTARY_ATTACHMENT_MARKERS):
            score -= 90

        if preferred_hints and any(hint in context_lower for hint in preferred_hints):
            score += 15

        score += _artifact_selection_bonus(title if isinstance(title, str) else None, context_lower, effective_format)

        if any(term in context_lower for term in {"chapter", "annex", "appendix", "part "}):
            if not any(term.strip() in title_tokens for term in {"chapter", "annex", "appendix", "part"}):
                score -= 40

        if score > best_score:
            best_score = score
            best_candidate = (candidate_url, context_text, effective_format)

    if best_score < 90:
        return None
    return best_candidate


def _payload_looks_like_hwpx(payload: bytes) -> bool:
    if not payload.startswith(b"PK"):
        return False
    try:
        with ZipFile(BytesIO(payload)) as archive:
            if "mimetype" not in archive.namelist():
                return False
            mimetype = archive.read("mimetype").decode("utf-8", errors="ignore").strip().lower()
    except (BadZipFile, KeyError):
        return False
    return mimetype == "application/hwp+zip"


def _payload_looks_like_odt(payload: bytes) -> bool:
    if not payload.startswith(b"PK"):
        return False
    try:
        with ZipFile(BytesIO(payload)) as archive:
            if "mimetype" not in archive.namelist():
                return False
            mimetype = archive.read("mimetype").decode("utf-8", errors="ignore").strip().lower()
    except (BadZipFile, KeyError):
        return False
    return mimetype == "application/vnd.oasis.opendocument.text"


def _fetch_linked_artifact_if_needed(
    artifact_path: Path,
    metadata: dict[str, Any],
) -> tuple[Path, list[str]]:
    warnings: list[str] = []
    if artifact_path.suffix.lower() != ".html":
        return artifact_path, warnings

    html = artifact_path.read_text(encoding="utf-8", errors="ignore")
    visible_text = _wrapper_page_visible_text(html)
    pdf_marker_count = html.lower().count("(pdf)")

    soup = BeautifulSoup(html, "html.parser")
    download_anchor_count = sum(
        1 for anchor in soup.find_all("a", href=True) if anchor.has_attr("download")
    )
    linked_candidates = [
        candidate
        for candidate in extract_linked_artifact_candidates(
            soup,
            base_url=str(metadata.get("resolved_url") or metadata.get("canonical_url") or ""),
            same_host_family=_same_host_family,
        )
        if _effective_linked_format(
            candidate.url,
            (candidate.context_text or candidate.anchor_text).lower(),
            candidate.has_download_attr,
            candidate.format_hint,
            candidate.pdf_hint,
        )
        in {"pdf", "hwpx", "odt"}
    ]
    if len(visible_text) > 1800 and pdf_marker_count < 3 and download_anchor_count < 2 and not linked_candidates:
        return artifact_path, warnings

    selected_download = _select_primary_linked_artifact(
        soup,
        base_url=str(metadata.get("resolved_url") or metadata.get("canonical_url") or ""),
        metadata=metadata,
    )
    if selected_download is None:
        stale_keys = ("linked_artifact_path", "linked_artifact_url", "linked_artifact_label", "linked_artifact_format")
        if any(key in metadata for key in stale_keys):
            for key in stale_keys:
                metadata.pop(key, None)
            metadata_path = artifact_path.with_name("metadata.json")
            metadata_path.write_text(json.dumps(metadata, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        return artifact_path, warnings

    candidate_url, candidate_label, format_hint = selected_download
    linked_suffix = ".pdf" if format_hint == "pdf" else ".hwpx" if format_hint == "hwpx" else ".odt"
    linked_path = artifact_path.with_name(f"linked_source{linked_suffix}")
    if linked_path.exists():
        metadata["linked_artifact_path"] = _display_path(linked_path)
        metadata["linked_artifact_url"] = candidate_url
        metadata["linked_artifact_label"] = candidate_label
        metadata["linked_artifact_format"] = format_hint
        metadata_path = artifact_path.with_name("metadata.json")
        metadata_path.write_text(json.dumps(metadata, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        warnings.append("used_cached_linked_artifact")
        return linked_path, warnings

    request = Request(
        candidate_url,
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
            "Referer": str(metadata.get("resolved_url") or metadata.get("canonical_url") or candidate_url),
            "Accept": "application/pdf,application/octet-stream,text/html;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        },
    )
    try:
        with urlopen(request, timeout=30) as response:
            payload = response.read()
            content_type = response.headers.get("Content-Type")
    except (HTTPError, URLError, TimeoutError, socket.timeout) as exc:
        warnings.append(f"linked_artifact_fetch_failed:{exc}")
        warnings.append(f"linked_artifact_url:{candidate_url}")
        return artifact_path, warnings

    normalized_content_type = content_type.split(";")[0].strip().lower() if content_type else ""
    if format_hint == "pdf":
        if normalized_content_type != "application/pdf" and not payload.lstrip().startswith(b"%PDF-"):
            warnings.append(f"linked_artifact_unexpected_content_type:{content_type or 'unknown'}")
            warnings.append(f"linked_artifact_url:{candidate_url}")
            return artifact_path, warnings
    elif format_hint == "hwpx":
        if not _payload_looks_like_hwpx(payload):
            warnings.append(f"linked_artifact_unexpected_content_type:{content_type or 'unknown'}")
            warnings.append(f"linked_artifact_url:{candidate_url}")
            return artifact_path, warnings
    elif format_hint == "odt":
        if not _payload_looks_like_odt(payload):
            warnings.append(f"linked_artifact_unexpected_content_type:{content_type or 'unknown'}")
            warnings.append(f"linked_artifact_url:{candidate_url}")
            return artifact_path, warnings

    linked_path.write_bytes(payload)
    metadata["linked_artifact_path"] = _display_path(linked_path)
    metadata["linked_artifact_url"] = candidate_url
    metadata["linked_artifact_label"] = candidate_label
    metadata["linked_artifact_format"] = format_hint
    metadata_path = artifact_path.with_name("metadata.json")
    metadata_path.write_text(json.dumps(metadata, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    warnings.append(f"fetched_linked_artifact:{candidate_url}")
    return linked_path, warnings


def parse_html_artifact(artifact_path: Path, metadata: dict[str, Any]) -> ParsedDocument:
    parse_source_path, prefetch_warnings = _fetch_embedded_html_if_needed(artifact_path, metadata)
    parse_source_path, linked_warnings = _fetch_linked_artifact_if_needed(parse_source_path, metadata)
    if parse_source_path.suffix.lower() == ".pdf":
        parsed_pdf = parse_pdf_artifact(parse_source_path, metadata)
        parsed_pdf.warnings = [*prefetch_warnings, *linked_warnings, *parsed_pdf.warnings]
        parsed_pdf.source_artifact_path = _display_path(parse_source_path)
        return parsed_pdf
    if parse_source_path.suffix.lower() == ".hwpx":
        parsed_hwpx = parse_hwpx_artifact(parse_source_path, metadata)
        parsed_hwpx.warnings = [*prefetch_warnings, *linked_warnings, *parsed_hwpx.warnings]
        parsed_hwpx.source_artifact_path = _display_path(parse_source_path)
        return parsed_hwpx
    if parse_source_path.suffix.lower() == ".odt":
        parsed_odt = parse_odt_artifact(parse_source_path, metadata)
        parsed_odt.warnings = [*prefetch_warnings, *linked_warnings, *parsed_odt.warnings]
        parsed_odt.source_artifact_path = _display_path(parse_source_path)
        return parsed_odt

    html = parse_source_path.read_text(encoding="utf-8", errors="ignore")
    soup = BeautifulSoup(html, "html.parser")

    _prune_noise_nodes(soup)

    title = _normalize_text(soup.title.get_text(" ", strip=True)) if soup.title else metadata["title"]
    language = None
    html_tag = soup.find("html")
    if html_tag is not None:
        language = html_tag.get("lang") or html_tag.get("xml:lang")
    if not language:
        language = _metadata_language(metadata)

    document_root = soup
    content_root = _select_content_root(document_root)
    warnings = [*prefetch_warnings, *linked_warnings]
    sections: list[ParsedSection] = []
    if _looks_like_image_only_content(content_root):
        warnings.append("image_only_html_content")
    else:
        current_heading = title or "Document"
        current_level = 1
        current_lines: list[str] = []

        for element in _content_text_nodes(content_root):
            text = _normalize_text(element.get_text("\n", strip=True))
            if not text:
                continue

            is_heading_tag = (
                element.name is not None
                and element.name.startswith("h")
                and len(element.name) == 2
                and element.name[1].isdigit()
            )
            if is_heading_tag or _is_emphasized_heading(element, text):
                _finalize_section(sections, current_heading, current_level, current_lines)
                current_heading = text
                current_level = int(element.name[1]) if is_heading_tag else 2
                current_lines = []
                continue

            current_lines.append(text)

        _finalize_section(sections, current_heading, current_level, current_lines)

        if not sections:
            fallback_text = _normalize_text(content_root.get_text("\n"))
            if fallback_text:
                sections = [ParsedSection(heading=title or "Document", level=1, content=fallback_text)]
            else:
                warnings.append("empty_html_after_cleaning")

    plain_text = "\n\n".join(section.content for section in sections if section.content).strip()
    if parse_source_path != artifact_path:
        source_artifact_path = _display_path(parse_source_path)
    else:
        source_artifact_path = _display_path(artifact_path)

    return ParsedDocument(
        parser_version=PARSER_VERSION,
        title=title or metadata["title"],
        language=language,
        document_format="html",
        plain_text=plain_text,
        sections=sections,
        warnings=warnings,
        source_artifact_path=source_artifact_path,
    )


def _plain_text_from_sections(sections: Sequence[ParsedSection]) -> str:
    return "\n\n".join(section.content for section in sections if section.content).strip()


def _pdf_extraction_score(sections: Sequence[ParsedSection]) -> int:
    plain_text = _plain_text_from_sections(sections)
    non_whitespace = len("".join(plain_text.split()))
    populated_pages = len(sections)
    longest_section = max((len(section.content) for section in sections), default=0)
    suspicious_codepoints = sum(
        1
        for character in plain_text
        if (unicodedata.category(character).startswith("C") and character not in {"\n", "\t"})
        or character == "\ufffd"
    )
    return non_whitespace + (populated_pages * 200) + longest_section - (suspicious_codepoints * 1000)


def _extract_pdf_sections_with_pypdf(artifact_path: Path) -> tuple[list[ParsedSection], list[str], str | None]:
    reader = PdfReader(str(artifact_path))
    sections: list[ParsedSection] = []
    warnings: list[str] = []
    for page_index, page in enumerate(reader.pages, start=1):
        text = _normalize_text(page.extract_text() or "")
        if not text:
            warnings.append(f"empty_pdf_page:{page_index}")
            continue
        sections.append(
            ParsedSection(
                heading=f"Page {page_index}",
                level=1,
                content=text,
            )
        )

    title = None
    if reader.metadata and reader.metadata.title:
        title = _normalize_text(str(reader.metadata.title)) or None

    return sections, warnings, title


def _extract_pdf_sections_with_pdftotext(artifact_path: Path) -> tuple[list[ParsedSection], list[str]]:
    executable = which("pdftotext")
    if executable is None:
        return [], ["pdftotext_unavailable"]

    result = subprocess.run(
        [executable, "-layout", "-enc", "UTF-8", str(artifact_path), "-"],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        return [], [f"pdftotext_failed:{result.returncode}"]

    sections: list[ParsedSection] = []
    warnings: list[str] = []
    for page_index, page_text in enumerate(result.stdout.replace("\r\n", "\n").split("\f"), start=1):
        text = _normalize_text(page_text)
        if not text:
            warnings.append(f"empty_pdftotext_page:{page_index}")
            continue
        sections.append(
            ParsedSection(
                heading=f"Page {page_index}",
                level=1,
                content=text,
            )
        )

    return sections, warnings


def parse_pdf_artifact(artifact_path: Path, metadata: dict[str, Any]) -> ParsedDocument:
    sections, warnings, extracted_title = _extract_pdf_sections_with_pypdf(artifact_path)
    pdftotext_sections, pdftotext_warnings = _extract_pdf_sections_with_pdftotext(artifact_path)

    if _pdf_extraction_score(pdftotext_sections) > (_pdf_extraction_score(sections) + 250):
        sections = pdftotext_sections
        warnings = [warning for warning in warnings if not warning.startswith("empty_pdf_page:")]
        warnings.extend(pdftotext_warnings)
        warnings.append("used_pdftotext_fallback")
    elif pdftotext_sections:
        warnings.extend(pdftotext_warnings)

    plain_text = _plain_text_from_sections(sections)
    title = metadata["title"]
    if extracted_title:
        title = extracted_title

    return ParsedDocument(
        parser_version=PARSER_VERSION,
        title=title,
        language=_metadata_language(metadata),
        document_format="pdf",
        plain_text=plain_text,
        sections=sections,
        warnings=warnings,
        source_artifact_path=_display_path(artifact_path),
    )


def _extract_hwpx_metadata(artifact_path: Path) -> tuple[str | None, str | None, list[str]]:
    try:
        with ZipFile(artifact_path) as archive:
            payload = archive.read("Contents/content.hpf")
    except (BadZipFile, FileNotFoundError, KeyError) as exc:
        return None, None, [f"hwpx_metadata_unavailable:{type(exc).__name__}"]

    try:
        root = ET.fromstring(payload)
    except ET.ParseError:
        return None, None, ["hwpx_metadata_parse_failed"]

    title: str | None = None
    language: str | None = None
    for element in root.iter():
        tag = element.tag.rsplit("}", 1)[-1]
        text = _normalize_text(element.text or "")
        if tag == "title" and text and title is None:
            title = text
        elif tag == "language" and text and language is None:
            language = text
        elif tag == "meta" and str(element.attrib.get("name", "")).lower() == "subject" and text:
            title = text
    return title, language, []


def _extract_hwpx_sections(artifact_path: Path) -> tuple[list[ParsedSection], list[str]]:
    warnings: list[str] = []
    sections: list[ParsedSection] = []
    try:
        with ZipFile(artifact_path) as archive:
            section_names = sorted(
                (
                    name
                    for name in archive.namelist()
                    if name.startswith("Contents/section") and name.endswith(".xml")
                ),
                key=lambda name: int(re.search(r"section(\d+)\.xml$", name).group(1)) if re.search(r"section(\d+)\.xml$", name) else 0,
            )
            for section_index, name in enumerate(section_names, start=1):
                try:
                    root = ET.fromstring(archive.read(name))
                except ET.ParseError:
                    warnings.append(f"hwpx_section_parse_failed:{name}")
                    continue

                paragraphs: list[str] = []
                for element in root.iter():
                    if element.tag.rsplit("}", 1)[-1] != "p":
                        continue
                    text = _normalize_text("".join(text_node for text_node in element.itertext() if text_node))
                    if text:
                        paragraphs.append(text)

                if paragraphs:
                    sections.append(
                        ParsedSection(
                            heading=f"Section {section_index}",
                            level=1,
                            content="\n".join(paragraphs),
                        )
                    )
    except (BadZipFile, FileNotFoundError) as exc:
        return [], [f"hwpx_unreadable:{type(exc).__name__}"]

    if sections:
        return sections, warnings

    try:
        with ZipFile(artifact_path) as archive:
            preview_text = _normalize_text(archive.read("Preview/PrvText.txt").decode("utf-8", errors="ignore"))
    except (BadZipFile, FileNotFoundError, KeyError) as exc:
        return [], [*warnings, f"hwpx_preview_unavailable:{type(exc).__name__}"]

    if preview_text:
        return [ParsedSection(heading="Preview", level=1, content=preview_text)], [*warnings, "used_hwpx_preview_fallback"]

    return [], [*warnings, "empty_hwpx_after_extraction"]


def parse_hwpx_artifact(artifact_path: Path, metadata: dict[str, Any]) -> ParsedDocument:
    title, language, metadata_warnings = _extract_hwpx_metadata(artifact_path)
    sections, section_warnings = _extract_hwpx_sections(artifact_path)
    return ParsedDocument(
        parser_version=PARSER_VERSION,
        title=title or metadata["title"],
        language=language or _metadata_language(metadata),
        document_format="hwpx",
        plain_text=_plain_text_from_sections(sections),
        sections=sections,
        warnings=[*metadata_warnings, *section_warnings],
        source_artifact_path=_display_path(artifact_path),
    )


def _extract_odt_sections_with_textutil(artifact_path: Path) -> tuple[list[ParsedSection], list[str]]:
    textutil_path = which("textutil")
    if not textutil_path:
        return [], ["textutil_unavailable"]

    try:
        with TemporaryDirectory(prefix="observatory-odt-") as temp_dir:
            output_path = Path(temp_dir) / "source.txt"
            subprocess.run(
                [textutil_path, "-convert", "txt", "-output", str(output_path), str(artifact_path)],
                check=True,
                capture_output=True,
                text=True,
            )
            plain_text = _normalize_text(output_path.read_text(encoding="utf-8", errors="ignore"))
    except (FileNotFoundError, OSError, subprocess.CalledProcessError) as exc:
        return [], [f"textutil_failed:{type(exc).__name__}"]

    if not plain_text:
        return [], ["textutil_empty_output"]

    return [ParsedSection(heading="Document", level=1, content=plain_text)], []


def _extract_odt_sections_from_xml(artifact_path: Path) -> tuple[list[ParsedSection], list[str]]:
    try:
        with ZipFile(artifact_path) as archive:
            payload = archive.read("content.xml")
    except (BadZipFile, FileNotFoundError, KeyError) as exc:
        return [], [f"odt_content_unavailable:{type(exc).__name__}"]

    try:
        root = ET.fromstring(payload)
    except ET.ParseError:
        return [], ["odt_content_parse_failed"]

    paragraphs: list[str] = []
    for element in root.iter():
        if not isinstance(element.tag, str):
            continue
        if element.tag.rsplit("}", 1)[-1] != "p":
            continue
        text = _normalize_text("".join(text_node for text_node in element.itertext() if text_node))
        if text:
            paragraphs.append(text)

    if not paragraphs:
        return [], ["empty_odt_after_extraction"]

    return [ParsedSection(heading="Document", level=1, content="\n".join(paragraphs))], []


def parse_odt_artifact(artifact_path: Path, metadata: dict[str, Any]) -> ParsedDocument:
    sections, warnings = _extract_odt_sections_with_textutil(artifact_path)
    if not sections:
        sections, xml_warnings = _extract_odt_sections_from_xml(artifact_path)
        warnings = [*warnings, *xml_warnings]

    return ParsedDocument(
        parser_version=PARSER_VERSION,
        title=metadata["title"],
        language=_metadata_language(metadata),
        document_format="odt",
        plain_text=_plain_text_from_sections(sections),
        sections=sections,
        warnings=warnings,
        source_artifact_path=_display_path(artifact_path),
    )


def _sniff_archive_artifact_type(artifact_path: Path) -> str | None:
    try:
        with ZipFile(artifact_path) as archive:
            names = set(archive.namelist())
            if "mimetype" in names:
                try:
                    mimetype = archive.read("mimetype").decode("utf-8", errors="ignore").strip().lower()
                except KeyError:
                    mimetype = ""
                if mimetype == "application/hwp+zip":
                    return ".hwpx"
                if mimetype == "application/vnd.oasis.opendocument.text":
                    return ".odt"
            if any(name.startswith("Contents/section") for name in names):
                return ".hwpx"
            if "content.xml" in names:
                return ".odt"
    except BadZipFile:
        return None
    return None


def _infer_artifact_suffix(artifact_path: Path, metadata: dict[str, Any]) -> str:
    suffix = artifact_path.suffix.lower()
    if suffix in {".html", ".pdf", ".hwpx", ".odt"}:
        return suffix

    source_candidates = [
        metadata.get("source_url"),
        metadata.get("resolved_url"),
        metadata.get("canonical_url"),
        metadata.get("linked_artifact_url"),
    ]
    for candidate in source_candidates:
        if not isinstance(candidate, str):
            continue
        lowered = candidate.lower()
        for known_suffix in (".pdf", ".hwpx", ".odt", ".html"):
            if known_suffix in lowered:
                return known_suffix

    content_type = str(metadata.get("content_type") or "").lower()
    if "pdf" in content_type:
        return ".pdf"
    sniffed = _sniff_archive_artifact_type(artifact_path)
    if sniffed is not None:
        return sniffed
    return suffix


def parse_artifact(artifact_path: Path, metadata: dict[str, Any]) -> ParsedDocument:
    suffix = _infer_artifact_suffix(artifact_path, metadata)
    if suffix == ".html":
        return parse_html_artifact(artifact_path, metadata)
    if suffix == ".pdf":
        return parse_pdf_artifact(artifact_path, metadata)
    if suffix == ".hwpx":
        return parse_hwpx_artifact(artifact_path, metadata)
    if suffix == ".odt":
        return parse_odt_artifact(artifact_path, metadata)
    raise ValueError(f"unsupported artifact type '{suffix}'")


def parse_raw_documents(
    jurisdiction: str | None = None,
    document_id: str | None = None,
) -> list[dict[str, str]]:
    records = _load_raw_document_records(jurisdiction=jurisdiction, document_id=document_id)
    if not records:
        raise ValueError("no raw documents matched the requested filters")

    results: list[dict[str, str]] = []
    for record in records:
        artifact_path = _artifact_path(record.metadata)
        if artifact_path.suffix.lower() == ".html":
            extracted_metadata = extract_html_source_metadata(artifact_path)
            if extracted_metadata and _apply_extracted_source_metadata(record.metadata, extracted_metadata):
                record.metadata_path.write_text(
                    json.dumps(record.metadata, indent=2, ensure_ascii=False) + "\n",
                    encoding="utf-8",
                )
        try:
            parsed = parse_artifact(artifact_path, record.metadata)
        except Exception as exc:
            results.append(
                {
                    "jurisdiction": record.jurisdiction,
                    "document_id": record.document_id,
                    "status": f"parse_error:{type(exc).__name__}",
                }
            )
            continue

        target_dir = PARSED_DATA_DIR / record.jurisdiction / record.document_id
        target_dir.mkdir(parents=True, exist_ok=True)
        parsed_json_path = target_dir / "normalized.json"
        parsed_text_path = target_dir / "normalized.txt"

        parsed_json_path.write_text(
            parsed.model_dump_json(indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        parsed_text_path.write_text(parsed.plain_text + ("\n" if parsed.plain_text else ""), encoding="utf-8")

        results.append(
            {
                "jurisdiction": record.jurisdiction,
                "document_id": record.document_id,
                "status": "parsed",
            }
        )

    return results
