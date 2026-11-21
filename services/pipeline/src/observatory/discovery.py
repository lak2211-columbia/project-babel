from __future__ import annotations

import json
import socket
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse, urlsplit, urlunsplit
from urllib.request import Request

from bs4 import BeautifulSoup

from observatory.browser_fetch import (
    BrowserFetchError,
    BrowserUnavailableError,
    fetch_url_with_browser,
)
from observatory.source_registry import (
    ROOT,
    DiscoveryTarget,
    load_all_source_manifests,
)
from observatory.url_safety import (
    DEFAULT_DISCOVERY_USER_AGENT,
    DEFAULT_MAX_RESPONSE_BYTES,
    UnsafeURLError,
    decode_html_bytes,
    read_bounded,
    safe_urlopen,
    same_host_family,
    validate_public_http_url,
)


DISCOVERY_DIR = ROOT / "data" / "discovery"
XML_NAMESPACES = {
    "sm": "http://www.sitemaps.org/schemas/sitemap/0.9",
}
RETRYABLE_HTTP_STATUS_CODES = {408, 425, 429, 500, 502, 503, 504}
MAX_SITEMAP_DEPTH = 2
MAX_NESTED_SITEMAPS = 10

# Module-level symbol so tests can monkeypatch `observatory.discovery.urlopen`.
urlopen = safe_urlopen


@dataclass
class DiscoveryCandidate:
    url: str
    title: str | None = None
    last_modified: str | None = None
    discovered_from: str | None = None


def _request_headers() -> dict[str, str]:
    return {
        "User-Agent": DEFAULT_DISCOVERY_USER_AGENT,
    }


def _same_host_family(base_url: str, candidate_url: str) -> bool:
    return same_host_family(base_url, candidate_url)


def _matches_url_patterns(url: str, target: DiscoveryTarget) -> bool:
    if target.same_host_only and not _same_host_family(str(target.url), url):
        return False
    if target.include_url_patterns and not any(pattern in url for pattern in target.include_url_patterns):
        return False
    if any(pattern in url for pattern in target.exclude_url_patterns):
        return False
    return True


def _matches_title_patterns(title: str | None, target: DiscoveryTarget) -> bool:
    normalized_title = (title or "").strip()
    if target.include_title_patterns and not any(
        pattern in normalized_title for pattern in target.include_title_patterns
    ):
        return False
    if any(pattern in normalized_title for pattern in target.exclude_title_patterns):
        return False
    return True


def _normalize_candidate_url(url: str) -> str:
    split_url = urlsplit(url)
    normalized_path = split_url.path.split(";", 1)[0]
    return urlunsplit(
        (
            split_url.scheme,
            split_url.netloc,
            normalized_path,
            split_url.query,
            "",
        )
    )


def _fetch_http_bytes(url: str, *, max_attempts: int = 2) -> tuple[bytes, str]:
    validate_public_http_url(url, resolve_dns=False)
    request = Request(url, headers=_request_headers())
    last_exc: Exception | None = None
    for attempt in range(1, max(max_attempts, 1) + 1):
        try:
            with urlopen(request, timeout=45) as response:
                payload = read_bounded(response, max_bytes=DEFAULT_MAX_RESPONSE_BYTES)
                resolved = response.geturl() if hasattr(response, "geturl") else url
                return payload, resolved
        except HTTPError as exc:
            last_exc = exc
            if exc.code in RETRYABLE_HTTP_STATUS_CODES and attempt < max_attempts:
                time.sleep(0.5 * attempt)
                continue
            raise
        except (URLError, TimeoutError, socket.timeout) as exc:
            last_exc = exc
            if attempt < max_attempts:
                time.sleep(0.5 * attempt)
                continue
            raise
    assert last_exc is not None
    raise last_exc


def _fetch_target_payload(target: DiscoveryTarget, use_browser: bool) -> tuple[bytes, str]:
    target_url = str(target.url)
    validate_public_http_url(target_url, resolve_dns=False)
    if use_browser and target.browser_required:
        browser_result = fetch_url_with_browser(
            target_url,
            wait_for_selector=target.browser_wait_for_selector,
            min_text_length=target.browser_min_text_length,
            click_selectors=target.browser_click_selectors,
            user_agent=_request_headers()["User-Agent"],
        )
        if browser_result.status_code < 200 or browser_result.status_code >= 400:
            raise BrowserFetchError(f"browser discovery returned HTTP {browser_result.status_code} for {target_url}")
        return browser_result.payload, browser_result.resolved_url

    return _fetch_http_bytes(target_url)


def _discover_from_html_links(
    *,
    target: DiscoveryTarget,
    payload: bytes,
    base_url: str,
) -> list[DiscoveryCandidate]:
    soup = BeautifulSoup(decode_html_bytes(payload), "html.parser")
    candidates: list[DiscoveryCandidate] = []
    seen_urls: set[str] = set()
    anchors = soup.select(target.link_selector or "a[href]")
    for anchor in anchors:
        href = anchor.get("href")
        if not isinstance(href, str):
            continue
        candidate_url = _normalize_candidate_url(urljoin(base_url, href.strip()))
        parsed = urlparse(candidate_url)
        if parsed.scheme not in {"http", "https"}:
            continue
        if candidate_url in seen_urls:
            continue
        title = anchor.get_text(" ", strip=True) or None
        if not _matches_url_patterns(candidate_url, target):
            continue
        if not _matches_title_patterns(title, target):
            continue
        seen_urls.add(candidate_url)
        candidates.append(
            DiscoveryCandidate(
                url=candidate_url,
                title=title,
                discovered_from=str(target.url),
            )
        )
        if target.max_candidates is not None and len(candidates) >= target.max_candidates:
            break
    return candidates


def _discover_from_sitemap(
    *,
    target: DiscoveryTarget,
    payload: bytes,
    depth: int = 0,
    seen_sitemaps: set[str] | None = None,
) -> list[DiscoveryCandidate]:
    root = ET.fromstring(payload)
    candidates: list[DiscoveryCandidate] = []
    visited = seen_sitemaps if seen_sitemaps is not None else set()

    if root.tag.endswith("sitemapindex"):
        nested_fetched = 0
        for loc in root.findall(".//sm:sitemap/sm:loc", XML_NAMESPACES):
            if loc.text is None:
                continue
            nested_url = _normalize_candidate_url(loc.text.strip())
            if nested_url in visited:
                continue
            if target.same_host_only and not _same_host_family(str(target.url), nested_url):
                continue
            visited.add(nested_url)
            if depth >= MAX_SITEMAP_DEPTH or nested_fetched >= MAX_NESTED_SITEMAPS:
                break
            nested_fetched += 1
            try:
                nested_payload, _ = _fetch_http_bytes(nested_url, max_attempts=1)
                nested_candidates = _discover_from_sitemap(
                    target=target,
                    payload=nested_payload,
                    depth=depth + 1,
                    seen_sitemaps=visited,
                )
            except (UnsafeURLError, ET.ParseError, HTTPError, URLError, TimeoutError, socket.timeout, ValueError):
                continue
            for item in nested_candidates:
                candidates.append(item)
                if target.max_candidates is not None and len(candidates) >= target.max_candidates:
                    return candidates
        return candidates

    for entry in root.findall(".//sm:url", XML_NAMESPACES):
        loc = entry.find("sm:loc", XML_NAMESPACES)
        if loc is None or loc.text is None:
            continue
        candidate_url = _normalize_candidate_url(loc.text.strip())
        if not _matches_url_patterns(candidate_url, target):
            continue
        lastmod = entry.findtext("sm:lastmod", default=None, namespaces=XML_NAMESPACES)
        candidates.append(
            DiscoveryCandidate(
                url=candidate_url,
                title=None,
                last_modified=lastmod.strip() if isinstance(lastmod, str) else None,
                discovered_from=str(target.url),
            )
        )
        if target.max_candidates is not None and len(candidates) >= target.max_candidates:
            break
    return candidates


def _discover_target_candidates(target: DiscoveryTarget, use_browser: bool) -> list[DiscoveryCandidate]:
    payload, resolved_url = _fetch_target_payload(target, use_browser=use_browser)
    if target.kind == "html_links":
        return _discover_from_html_links(target=target, payload=payload, base_url=resolved_url)
    if target.kind == "sitemap":
        return _discover_from_sitemap(target=target, payload=payload)
    raise ValueError(f"unsupported discovery target kind: {target.kind}")


def _portal_output_path(jurisdiction: str, portal_id: str) -> Path:
    return DISCOVERY_DIR / jurisdiction / f"{portal_id}.json"


def discover_source_candidates(
    *,
    jurisdiction: str | None = None,
    portal_id: str | None = None,
    refresh: bool = False,
    use_browser: bool = False,
) -> list[dict[str, str]]:
    manifests = load_all_source_manifests()
    results: list[dict[str, str]] = []

    for manifest in manifests:
        if jurisdiction is not None and manifest.jurisdiction != jurisdiction:
            continue
        for portal in manifest.source_portals:
            if portal_id is not None and portal.id != portal_id:
                continue
            output_path = _portal_output_path(manifest.jurisdiction, portal.id)
            if not portal.discovery_targets:
                results.append(
                    {
                        "jurisdiction": manifest.jurisdiction,
                        "portal_id": portal.id,
                        "status": "skipped_no_discovery_targets",
                    }
                )
                continue
            if output_path.exists() and not refresh:
                with output_path.open("r", encoding="utf-8") as handle:
                    payload = json.load(handle)
                results.append(
                    {
                        "jurisdiction": manifest.jurisdiction,
                        "portal_id": portal.id,
                        "status": "cached",
                        "candidate_count": str(len(payload.get("candidates", []))),
                    }
                )
                continue

            seen_urls: set[str] = set()
            candidates: list[DiscoveryCandidate] = []
            try:
                for target in portal.discovery_targets:
                    for candidate in _discover_target_candidates(target, use_browser=use_browser):
                        if candidate.url in seen_urls:
                            continue
                        seen_urls.add(candidate.url)
                        candidates.append(candidate)
            except (
                BrowserFetchError,
                BrowserUnavailableError,
                UnsafeURLError,
                ET.ParseError,
                HTTPError,
                URLError,
                TimeoutError,
                socket.timeout,
                ValueError,
            ) as exc:
                results.append(
                    {
                        "jurisdiction": manifest.jurisdiction,
                        "portal_id": portal.id,
                        "status": f"discovery_error:{type(exc).__name__}",
                        "error": str(exc),
                    }
                )
                continue

            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_payload = {
                "jurisdiction": manifest.jurisdiction,
                "portal_id": portal.id,
                "portal_name": portal.name,
                "canonical_url": str(portal.canonical_url),
                "discovery_targets": [
                    {
                        "url": str(target.url),
                        "kind": target.kind,
                    }
                    for target in portal.discovery_targets
                ],
                "candidate_count": len(candidates),
                "candidates": [
                    {
                        "url": candidate.url,
                        "title": candidate.title,
                        "last_modified": candidate.last_modified,
                        "discovered_from": candidate.discovered_from,
                    }
                    for candidate in candidates
                ],
            }
            output_path.write_text(
                json.dumps(output_payload, indent=2, ensure_ascii=False) + "\n",
                encoding="utf-8",
                newline="\n",
            )
            results.append(
                {
                    "jurisdiction": manifest.jurisdiction,
                    "portal_id": portal.id,
                    "status": "discovered",
                    "candidate_count": str(len(candidates)),
                }
            )

    if not results:
        raise ValueError("no source portals matched the requested filters")
    return results
