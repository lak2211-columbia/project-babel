from __future__ import annotations

import json
import socket
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse, urlsplit, urlunsplit
from urllib.request import Request, urlopen

from bs4 import BeautifulSoup

from observatory.browser_fetch import (
    BrowserFetchError,
    BrowserUnavailableError,
    fetch_url_with_browser,
)
from observatory.source_registry import (
    ROOT,
    DiscoveryTarget,
    SourcePortal,
    load_all_source_manifests,
)


DISCOVERY_DIR = ROOT / "data" / "discovery"
XML_NAMESPACES = {
    "sm": "http://www.sitemaps.org/schemas/sitemap/0.9",
}


@dataclass
class DiscoveryCandidate:
    url: str
    title: str | None = None
    last_modified: str | None = None
    discovered_from: str | None = None


def _request_headers() -> dict[str, str]:
    return {
        "User-Agent": (
            "Mozilla/5.0 (compatible; AIGovernanceObservatory/0.1; "
            "+https://example.invalid/observatory)"
        )
    }


def _same_host_family(base_url: str, candidate_url: str) -> bool:
    base_host = urlparse(base_url).netloc.lower()
    candidate_host = urlparse(candidate_url).netloc.lower()
    return (
        candidate_host == base_host
        or candidate_host.endswith(f".{base_host}")
        or base_host.endswith(f".{candidate_host}")
    )


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


def _fetch_target_payload(target: DiscoveryTarget, use_browser: bool) -> tuple[bytes, str]:
    if use_browser and target.browser_required:
        browser_result = fetch_url_with_browser(
            str(target.url),
            wait_for_selector=target.browser_wait_for_selector,
            min_text_length=target.browser_min_text_length,
            click_selectors=target.browser_click_selectors,
            user_agent=_request_headers()["User-Agent"],
        )
        return browser_result.payload, browser_result.resolved_url

    request = Request(str(target.url), headers=_request_headers())
    with urlopen(request, timeout=45) as response:
        return response.read(), response.geturl() if hasattr(response, "geturl") else str(target.url)


def _discover_from_html_links(
    *,
    target: DiscoveryTarget,
    payload: bytes,
    base_url: str,
) -> list[DiscoveryCandidate]:
    soup = BeautifulSoup(payload, "html.parser")
    candidates: list[DiscoveryCandidate] = []
    anchors = soup.select(target.link_selector or "a[href]")
    for anchor in anchors:
        href = anchor.get("href")
        if not isinstance(href, str):
            continue
        candidate_url = _normalize_candidate_url(urljoin(base_url, href.strip()))
        parsed = urlparse(candidate_url)
        if parsed.scheme not in {"http", "https"}:
            continue
        title = anchor.get_text(" ", strip=True) or None
        if not _matches_url_patterns(candidate_url, target):
            continue
        if not _matches_title_patterns(title, target):
            continue
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
) -> list[DiscoveryCandidate]:
    root = ET.fromstring(payload)
    candidates: list[DiscoveryCandidate] = []

    if root.tag.endswith("sitemapindex"):
        for loc in root.findall(".//sm:sitemap/sm:loc", XML_NAMESPACES):
            if loc.text is None:
                continue
            nested_url = _normalize_candidate_url(loc.text.strip())
            if not _matches_url_patterns(nested_url, target):
                continue
            candidates.append(
                DiscoveryCandidate(
                    url=nested_url,
                    title=None,
                    discovered_from=str(target.url),
                )
            )
            if target.max_candidates is not None and len(candidates) >= target.max_candidates:
                break
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
                ET.ParseError,
                HTTPError,
                URLError,
                TimeoutError,
                socket.timeout,
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
            output_path.write_text(json.dumps(output_payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
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
