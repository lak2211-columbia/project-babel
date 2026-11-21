from __future__ import annotations

import json
import re
import socket
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from hashlib import sha1
from io import BytesIO
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request

from bs4 import BeautifulSoup
from pypdf import PdfReader

from observatory.browser_fetch import BrowserFetchError, BrowserUnavailableError, fetch_url_with_browser
from observatory.retrieval import _linked_pdf_candidates
from observatory.source_ops import build_source_operations_model, normalize_url
from observatory.source_registry import (
    ROOT,
    SeedDocument,
    load_all_source_manifests,
    source_manifest_path,
    write_source_manifest,
)
from observatory.url_safety import (
    BROWSER_USER_AGENT,
    DEFAULT_MAX_RESPONSE_BYTES,
    UnsafeURLError,
    decode_html_bytes,
    read_bounded,
    repo_rel_posix,
    safe_urlopen,
    validate_public_http_url,
)

urlopen = safe_urlopen


CANDIDATE_ENRICHMENT_DIR = ROOT / "data" / "source_tracking" / "candidate_enrichment"
JURISDICTION_PREFIX = {
    "united_states": "us",
    "european_union": "eu",
    "japan": "jp",
    "south_korea": "kr",
    "china": "cn",
}
PUBLICATION_META_KEYS = {
    "article:published_time",
    "article:published",
    "date",
    "datepublished",
    "datecreated",
    "dc.date",
    "dc.date.issued",
    "dcterms.created",
    "dcterms.issued",
    "publishdate",
    "pubdate",
}
PUBLICATION_JSON_KEYS = {
    "datepublished",
    "datecreated",
    "uploaddate",
    "pubdate",
    "dateissued",
}
LANGUAGE_META_KEYS = {"content-language", "dc.language", "dcterms.language"}
LOW_QUALITY_TITLE_PATTERNS = (
    re.compile(r"^slide\s+\d+$", re.IGNORECASE),
    re.compile(r"^スライド\s*\d+$"),
    re.compile(r"^page\s+\d+$", re.IGNORECASE),
    re.compile(r"^microsoft word", re.IGNORECASE),
    re.compile(r"^document\d*$", re.IGNORECASE),
)


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _display_path(path: Path) -> str:
    return repo_rel_posix(path, root=ROOT)


def _portal_output_path(jurisdiction: str, portal_id: str) -> Path:
    return CANDIDATE_ENRICHMENT_DIR / jurisdiction / f"{portal_id}.json"


def _request_headers() -> dict[str, str]:
    return {
        "User-Agent": BROWSER_USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf;q=0.8,*/*;q=0.7",
        "Accept-Language": "en-US,en;q=0.9",
    }


def _normalize_language(value: str | None) -> str | None:
    if not value:
        return None
    lowered = value.strip().lower().replace("_", "-")
    primary = lowered.split(",", 1)[0].split(";", 1)[0].strip().split("-", 1)[0]
    if primary in {"en", "ja", "ko", "zh"}:
        return primary
    return None


def _extract_language_from_text(text: str | None) -> str | None:
    if not text:
        return None
    if re.search(r"[\uac00-\ud7af]", text):
        return "ko"
    if re.search(r"[\u3040-\u30ff]", text):
        return "ja"
    if re.search(r"[\u4e00-\u9fff]", text):
        return "zh"
    return None


def _parse_date_value(value: str | None) -> str | None:
    if not value:
        return None
    text = value.strip()
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).date().isoformat()
    except ValueError:
        pass
    try:
        return parsedate_to_datetime(text).date().isoformat()
    except (TypeError, ValueError, IndexError, OverflowError):
        pass

    patterns = (
        r"D:(?P<year>20\d{2})(?P<month>\d{2})(?P<day>\d{2})",
        r"(?P<year>20\d{2})[-/.](?P<month>\d{1,2})[-/.](?P<day>\d{1,2})",
        r"(?P<year>20\d{2})年\s*(?P<month>\d{1,2})月\s*(?P<day>\d{1,2})日",
        r"(?P<year>20\d{2})\s*년\s*(?P<month>\d{1,2})\s*월\s*(?P<day>\d{1,2})\s*일",
    )
    for pattern in patterns:
        match = re.search(pattern, text)
        if not match:
            continue
        try:
            return datetime(
                year=int(match.group("year")),
                month=int(match.group("month")),
                day=int(match.group("day")),
                tzinfo=timezone.utc,
            ).date().isoformat()
        except ValueError:
            continue
    return None


def _walk_json(value: Any) -> list[tuple[str, Any]]:
    if isinstance(value, dict):
        pairs: list[tuple[str, Any]] = list(value.items())
        for nested in value.values():
            pairs.extend(_walk_json(nested))
        return pairs
    if isinstance(value, list):
        pairs = []
        for item in value:
            pairs.extend(_walk_json(item))
        return pairs
    return []


def _extract_html_metadata(payload: bytes, *, resolved_url: str, content_type: str | None = None) -> dict[str, Any]:
    html = decode_html_bytes(payload, content_type=content_type)
    soup = BeautifulSoup(html, "html.parser")
    metadata: dict[str, Any] = {}

    title_tag = soup.find("title")
    if title_tag is not None:
        title = title_tag.get_text(" ", strip=True)
        if title:
            metadata["resolved_title"] = title

    html_tag = soup.find("html")
    if html_tag is not None:
        language = _normalize_language(html_tag.get("lang") or html_tag.get("xml:lang"))
        if language:
            metadata["language"] = language
            metadata["language_method"] = "html_lang"

    for tag in soup.find_all("meta"):
        key = tag.get("property") or tag.get("name") or tag.get("http-equiv") or tag.get("itemprop")
        content = tag.get("content")
        if not isinstance(key, str) or not isinstance(content, str):
            continue
        normalized_key = key.strip().lower()
        if "resolved_title" not in metadata and normalized_key in {"og:title", "twitter:title", "headline"}:
            title = content.strip()
            if title:
                metadata["resolved_title"] = title
        if "publication_date" not in metadata and normalized_key in PUBLICATION_META_KEYS:
            parsed = _parse_date_value(content)
            if parsed:
                metadata["publication_date"] = parsed
                metadata["publication_date_method"] = f"meta:{normalized_key}"
        if "language" not in metadata and normalized_key in LANGUAGE_META_KEYS:
            language = _normalize_language(content)
            if language:
                metadata["language"] = language
                metadata["language_method"] = f"meta:{normalized_key}"

    for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
        raw_payload = script.string or script.get_text()
        if not raw_payload:
            continue
        try:
            data = json.loads(raw_payload)
        except json.JSONDecodeError:
            continue
        for key, value in _walk_json(data):
            if not isinstance(value, str):
                continue
            normalized_key = key.strip().lower()
            if "publication_date" not in metadata and normalized_key in PUBLICATION_JSON_KEYS:
                parsed = _parse_date_value(value)
                if parsed:
                    metadata["publication_date"] = parsed
                    metadata["publication_date_method"] = f"jsonld:{normalized_key}"
            if "language" not in metadata and normalized_key == "inlanguage":
                language = _normalize_language(value)
                if language:
                    metadata["language"] = language
                    metadata["language_method"] = "jsonld:inLanguage"

    if "publication_date" not in metadata:
        for element in soup.find_all(["time", "span", "div", "p", "li"]):
            text = element.get_text(" ", strip=True)
            if not text or len(text) > 120:
                continue
            parsed = _parse_date_value(text)
            if parsed:
                metadata["publication_date"] = parsed
                metadata["publication_date_method"] = "visible_text"
                break

    linked_pdf_urls = _linked_pdf_candidates(payload, base_url=resolved_url)
    if linked_pdf_urls:
        metadata["linked_pdf_urls"] = linked_pdf_urls

    if "language" not in metadata:
        language = _extract_language_from_text(metadata.get("resolved_title"))
        if language:
            metadata["language"] = language
            metadata["language_method"] = "title_script"

    return metadata


def _extract_pdf_metadata(payload: bytes) -> dict[str, Any]:
    metadata: dict[str, Any] = {}
    try:
        reader = PdfReader(BytesIO(payload))
    except Exception:
        return metadata

    document_metadata = reader.metadata or {}
    title = document_metadata.get("/Title")
    if isinstance(title, str) and title.strip():
        metadata["resolved_title"] = title.strip()

    for key in ("/CreationDate", "/ModDate"):
        value = document_metadata.get(key)
        if not isinstance(value, str):
            continue
        parsed = _parse_date_value(value)
        if parsed:
            metadata["publication_date"] = parsed
            metadata["publication_date_method"] = f"pdf:{key.lstrip('/')}"
            break

    return metadata


def _fetch_candidate_payload(url: str, *, use_browser: bool = False) -> dict[str, Any]:
    validate_public_http_url(url, resolve_dns=False)
    if use_browser:
        browser_result = fetch_url_with_browser(url, user_agent=_request_headers()["User-Agent"])
        if browser_result.status_code < 200 or browser_result.status_code >= 400:
            raise BrowserFetchError(f"browser enrichment returned HTTP {browser_result.status_code} for {url}")
        return {
            "payload": browser_result.payload,
            "resolved_url": browser_result.resolved_url,
            "status_code": browser_result.status_code,
            "content_type": browser_result.content_type,
            "headers": {},
            "transport": "browser",
        }

    request = Request(url, headers=_request_headers())
    with urlopen(request, timeout=45) as response:
        payload = read_bounded(response, max_bytes=DEFAULT_MAX_RESPONSE_BYTES)
        headers = {
            "content_language": response.headers.get("Content-Language"),
            "etag": response.headers.get("ETag"),
            "last_modified": response.headers.get("Last-Modified"),
        }
        return {
            "payload": payload,
            "resolved_url": response.geturl() if hasattr(response, "geturl") else url,
            "status_code": getattr(response, "status", 200),
            "content_type": response.headers.get("Content-Type"),
            "headers": headers,
            "transport": "http",
        }


def enrich_candidate_record(
    *,
    candidate: dict[str, Any],
    portal_languages: list[str],
    use_browser: bool = False,
) -> dict[str, Any]:
    fetch_result = _fetch_candidate_payload(candidate["url"], use_browser=use_browser)
    payload = fetch_result["payload"]
    resolved_url = str(fetch_result["resolved_url"])
    content_type = fetch_result["content_type"]

    metadata: dict[str, Any] = {}
    if payload.lstrip().startswith(b"%PDF-"):
        metadata.update(_extract_pdf_metadata(payload))
        metadata["document_format"] = "pdf"
    else:
        metadata.update(
            _extract_html_metadata(
                payload,
                resolved_url=resolved_url,
                content_type=content_type if isinstance(content_type, str) else None,
            )
        )
        metadata["document_format"] = "html"

    headers = fetch_result["headers"] if isinstance(fetch_result["headers"], dict) else {}
    if "publication_date" not in metadata:
        publication_date = _parse_date_value(headers.get("last_modified")) or _parse_date_value(candidate.get("last_modified"))
        if publication_date:
            metadata["publication_date"] = publication_date
            metadata["publication_date_method"] = "http_last_modified"
    if "publication_date" not in metadata:
        publication_date = _parse_date_value(candidate.get("url")) or _parse_date_value(candidate.get("title"))
        if publication_date:
            metadata["publication_date"] = publication_date
            metadata["publication_date_method"] = "url_or_title_pattern"

    if "language" not in metadata:
        language = _normalize_language(headers.get("content_language"))
        if language:
            metadata["language"] = language
            metadata["language_method"] = "http_content_language"
    if "language" not in metadata:
        language = _extract_language_from_text(candidate.get("title"))
        if language:
            metadata["language"] = language
            metadata["language_method"] = "candidate_title_script"
    if "language" not in metadata and portal_languages:
        metadata["language"] = portal_languages[0]
        metadata["language_method"] = "portal_default"

    return {
        **candidate,
        "resolved_url": resolved_url,
        "resolved_title": metadata.get("resolved_title") or candidate.get("title"),
        "content_type": content_type,
        "status_code": fetch_result["status_code"],
        "transport": fetch_result["transport"],
        "content_bytes": len(payload),
        "publication_date": metadata.get("publication_date"),
        "publication_date_method": metadata.get("publication_date_method"),
        "language": metadata.get("language"),
        "language_method": metadata.get("language_method"),
        "document_format": metadata.get("document_format"),
        "linked_pdf_urls": metadata.get("linked_pdf_urls", []),
        "enriched_at": _iso_now(),
    }


def enrich_source_candidates(
    *,
    jurisdiction: str | None = None,
    portal_id: str | None = None,
    refresh: bool = False,
    recommendations: set[str] | None = None,
    limit: int = 5,
    use_browser: bool = False,
) -> list[dict[str, str]]:
    plan = build_source_operations_model()
    manifests = {manifest.jurisdiction: manifest for manifest in load_all_source_manifests()}
    results: list[dict[str, str]] = []

    for jurisdiction_payload in plan["jurisdictions"]:
        current_jurisdiction = jurisdiction_payload["jurisdiction"]
        if jurisdiction is not None and current_jurisdiction != jurisdiction:
            continue
        manifest = manifests[current_jurisdiction]
        portal_by_id = {portal.id: portal for portal in manifest.source_portals}
        for portal_operation in jurisdiction_payload["portal_operations"]:
            if portal_id is not None and portal_operation["portal_id"] != portal_id:
                continue
            output_path = _portal_output_path(current_jurisdiction, portal_operation["portal_id"])
            if output_path.exists() and not refresh:
                payload = json.loads(output_path.read_text(encoding="utf-8"))
                results.append(
                    {
                        "jurisdiction": current_jurisdiction,
                        "portal_id": portal_operation["portal_id"],
                        "status": "cached",
                        "candidate_count": str(len(payload.get("candidates", []))),
                    }
                )
                continue

            selected_families = []
            for family in portal_operation["priority_families"]:
                if recommendations and family["best_recommendation"] not in recommendations:
                    continue
                selected_families.append(family)
                if len(selected_families) >= limit:
                    break

            portal = portal_by_id[portal_operation["portal_id"]]
            enriched_candidates: list[dict[str, Any]] = []
            errors: list[dict[str, str]] = []
            for family in selected_families:
                representative = {
                    "title": family["representative_title"],
                    "url": family["representative_url"],
                    "family_id": family["family_id"],
                    "family_label": family["family_label"],
                    "source_role": family["best_source_role"],
                    "recommendation": family["best_recommendation"],
                    "score": family["best_candidate_score"],
                    "coverage_bucket": family["coverage_bucket"],
                    "proposed_document_type": family["proposed_document_type"],
                    "proposed_binding_strength": family["proposed_binding_strength"],
                    "proposed_source_tier": family["proposed_source_tier"],
                    "proposed_policy_domains": family["proposed_policy_domains"],
                }
                try:
                    enriched_candidates.append(
                        enrich_candidate_record(
                            candidate=representative,
                            portal_languages=portal.languages,
                            use_browser=use_browser,
                        )
                    )
                except (
                    BrowserFetchError,
                    BrowserUnavailableError,
                    UnsafeURLError,
                    HTTPError,
                    URLError,
                    TimeoutError,
                    socket.timeout,
                    ValueError,
                ) as exc:
                    errors.append({"url": representative["url"], "error": f"{type(exc).__name__}: {exc}"})

            output_payload = {
                "jurisdiction": current_jurisdiction,
                "portal_id": portal_operation["portal_id"],
                "portal_name": portal_operation["portal_name"],
                "generated_at": _iso_now(),
                "recommendation_filters": sorted(recommendations or []),
                "candidate_count": len(enriched_candidates),
                "candidates": enriched_candidates,
                "errors": errors,
            }
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(
                json.dumps(output_payload, indent=2, ensure_ascii=False) + "\n",
                encoding="utf-8",
                newline="\n",
            )
            results.append(
                {
                    "jurisdiction": current_jurisdiction,
                    "portal_id": portal_operation["portal_id"],
                    "status": "enriched",
                    "candidate_count": str(len(enriched_candidates)),
                    "output_path": _display_path(output_path),
                }
            )

    if not results:
        raise ValueError("no portals matched the requested enrichment filters")
    return results


def _slugify(value: str) -> str:
    tokens = re.findall(r"[a-z0-9]+", value.lower())
    if not tokens:
        return ""
    return "_".join(tokens[:8])


def _jurisdiction_prefix(jurisdiction: str) -> str:
    if jurisdiction in JURISDICTION_PREFIX:
        return JURISDICTION_PREFIX[jurisdiction]
    parts = [part for part in jurisdiction.lower().split("_") if part]
    if len(parts) >= 2:
        return f"{parts[0][0]}{parts[1][0]}"
    return (jurisdiction.lower()[:2] or "xx")


def _build_document_id(*, jurisdiction: str, portal_id: str, title: str, canonical_url: str, family_id: str) -> str:
    prefix = _jurisdiction_prefix(jurisdiction)
    slug = _slugify(title)
    if not slug or not any(char.isalpha() for char in slug):
        slug = _slugify(Path(urlparse(canonical_url).path).stem) or _slugify(portal_id) or "document"
    if not any(char.isalpha() for char in slug):
        slug = _slugify(portal_id) or "document"
    digest = sha1(f"{family_id}|{canonical_url}".encode("utf-8")).hexdigest()[:8]
    return f"{prefix}_{slug[:48]}_{digest}"


def _load_enriched_candidate(jurisdiction: str, portal_id: str, family_id: str) -> dict[str, Any] | None:
    path = _portal_output_path(jurisdiction, portal_id)
    if not path.exists():
        return None
    payload = json.loads(path.read_text(encoding="utf-8"))
    for candidate in payload.get("candidates", []):
        if candidate.get("family_id") == family_id:
            return candidate
    return None


def _choose_retrieval_urls(family: dict[str, Any], enrichment: dict[str, Any]) -> tuple[str, list[str], str]:
    representative_url = str(enrichment.get("resolved_url") or family["representative_url"])
    family_member_urls = [normalize_url(member["url"]) for member in family.get("members", [])]
    linked_pdf_urls = [normalize_url(url) for url in enrichment.get("linked_pdf_urls", []) if isinstance(url, str)]
    direct_pdf_urls = [url for url in family_member_urls if ".pdf" in url.lower()]
    retrieval_urls: list[str] = []
    for url in [*direct_pdf_urls, *linked_pdf_urls]:
        if url == representative_url or url in retrieval_urls:
            continue
        retrieval_urls.append(url)
    document_format = "pdf" if ".pdf" in representative_url.lower() or retrieval_urls else "html"
    return representative_url, retrieval_urls, document_format


def _preferred_title(family: dict[str, Any], enrichment: dict[str, Any], canonical_url: str) -> str:
    resolved_title = enrichment.get("resolved_title")
    if isinstance(resolved_title, str):
        normalized = resolved_title.strip()
        if normalized and not any(pattern.search(normalized) for pattern in LOW_QUALITY_TITLE_PATTERNS):
            return normalized
    representative_title = family.get("representative_title")
    if isinstance(representative_title, str) and representative_title.strip():
        return representative_title.strip()
    return canonical_url


def build_seed_document_from_family(
    *,
    jurisdiction: str,
    portal_id: str,
    portal_issuing_body: str,
    portal_tags: list[str],
    family: dict[str, Any],
    enrichment: dict[str, Any],
) -> dict[str, Any]:
    canonical_url, retrieval_urls, document_format = _choose_retrieval_urls(family, enrichment)
    title = _preferred_title(family, enrichment, canonical_url)
    publication_date = enrichment.get("publication_date")
    if not publication_date:
        raise ValueError(f"family '{family['family_id']}' is missing publication_date")

    language = enrichment.get("language")
    if not isinstance(language, str) or not language:
        raise ValueError(f"family '{family['family_id']}' is missing language")

    priority = "high" if family["best_recommendation"] == "promote_now" else "medium"
    lifecycle_stage = "draft" if family["best_source_role"] == "consultation_draft" else "active"
    source_tier = family["proposed_source_tier"]
    if source_tier == "consultation_draft":
        source_tier = "regulatory_guidance"
    relevance_note_parts = [
        f"Auto-promoted from {portal_id}",
        f"role={family['best_source_role']}",
        f"bucket={family['coverage_bucket']}",
    ]
    if family.get("family_label"):
        relevance_note_parts.append(f"family={family['family_label']}")

    tags = list(dict.fromkeys([*portal_tags, family["best_source_role"], "auto_promoted"]))
    return {
        "id": _build_document_id(
            jurisdiction=jurisdiction,
            portal_id=portal_id,
            title=title,
            canonical_url=canonical_url,
            family_id=family["family_id"],
        ),
        "title": title,
        "issuing_body": portal_issuing_body,
        "canonical_url": canonical_url,
        "retrieval_urls": retrieval_urls,
        "document_type": family["proposed_document_type"],
        "binding_strength": family["proposed_binding_strength"],
        "source_tier": source_tier,
        "policy_domains": family["proposed_policy_domains"],
        "lifecycle_stage": lifecycle_stage,
        "publication_date": publication_date,
        "languages": [language],
        "document_format": document_format,
        "source_portal_ids": [portal_id],
        "priority": priority,
        "relevance_notes": "; ".join(relevance_note_parts),
        "tags": tags,
    }


def promote_source_families(
    *,
    jurisdiction: str | None = None,
    portal_id: str | None = None,
    recommendations: set[str] | None = None,
    limit: int = 10,
    use_browser: bool = False,
) -> list[dict[str, str]]:
    plan = build_source_operations_model()
    manifests = {manifest.jurisdiction: manifest for manifest in load_all_source_manifests()}
    results: list[dict[str, str]] = []
    writes: set[str] = set()
    promoted_count = 0

    for jurisdiction_payload in plan["jurisdictions"]:
        current_jurisdiction = jurisdiction_payload["jurisdiction"]
        if jurisdiction is not None and current_jurisdiction != jurisdiction:
            continue
        manifest = manifests[current_jurisdiction]
        portal_by_id = {portal.id: portal for portal in manifest.source_portals}
        existing_urls = {normalize_url(str(document.canonical_url)) for document in manifest.seed_documents}
        existing_titles = {document.title.casefold() for document in manifest.seed_documents}

        for portal_operation in jurisdiction_payload["portal_operations"]:
            if portal_id is not None and portal_operation["portal_id"] != portal_id:
                continue
            portal = portal_by_id[portal_operation["portal_id"]]
            for family in portal_operation["priority_families"]:
                if recommendations and family["best_recommendation"] not in recommendations:
                    continue
                if promoted_count >= limit:
                    break

                enrichment = _load_enriched_candidate(current_jurisdiction, portal.id, family["family_id"])
                if enrichment is None:
                    try:
                        enrichment = enrich_candidate_record(
                            candidate={
                                "title": family["representative_title"],
                                "url": family["representative_url"],
                                "family_id": family["family_id"],
                            },
                            portal_languages=portal.languages,
                            use_browser=use_browser,
                        )
                    except Exception as exc:  # pragma: no cover
                        results.append(
                            {
                                "jurisdiction": current_jurisdiction,
                                "portal_id": portal.id,
                                "family_id": family["family_id"],
                                "status": "skipped_enrichment_error",
                                "error": str(exc),
                            }
                        )
                        continue

                try:
                    proposed_document = build_seed_document_from_family(
                        jurisdiction=current_jurisdiction,
                        portal_id=portal.id,
                        portal_issuing_body=portal.issuing_body,
                        portal_tags=portal.tags,
                        family=family,
                        enrichment=enrichment,
                    )
                except ValueError as exc:
                    results.append(
                        {
                            "jurisdiction": current_jurisdiction,
                            "portal_id": portal.id,
                            "family_id": family["family_id"],
                            "status": "skipped_quality_gate",
                            "error": str(exc),
                        }
                    )
                    continue

                if normalize_url(proposed_document["canonical_url"]) in existing_urls or proposed_document["title"].casefold() in existing_titles:
                    results.append(
                        {
                            "jurisdiction": current_jurisdiction,
                            "portal_id": portal.id,
                            "family_id": family["family_id"],
                            "status": "skipped_existing",
                            "document_id": proposed_document["id"],
                        }
                    )
                    continue

                seed_document = SeedDocument.model_validate(proposed_document)
                manifest.seed_documents.append(seed_document)
                existing_urls.add(normalize_url(str(seed_document.canonical_url)))
                existing_titles.add(seed_document.title.casefold())
                writes.add(current_jurisdiction)
                promoted_count += 1
                results.append(
                    {
                        "jurisdiction": current_jurisdiction,
                        "portal_id": portal.id,
                        "family_id": family["family_id"],
                        "status": "promoted",
                        "document_id": seed_document.id,
                    }
                )
            if promoted_count >= limit:
                break
        if promoted_count >= limit:
            break

    for updated_jurisdiction in writes:
        write_source_manifest(manifests[updated_jurisdiction], path=source_manifest_path(updated_jurisdiction))

    if not results:
        raise ValueError("no source families matched the requested promotion filters")
    return results
