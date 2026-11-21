from __future__ import annotations

import json
import mimetypes
import re
import socket
import time
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from typing import Iterable
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import Request

from bs4 import BeautifulSoup

from observatory.browser_fetch import (
    BrowserFetchError,
    BrowserUnavailableError,
    fetch_binary_url_with_browser,
    fetch_url_with_browser,
    locale_for_languages,
)
from observatory.linked_artifacts import extract_linked_pdf_urls
from observatory.parser import (
    _payload_looks_like_hwpx,
    _payload_looks_like_odt,
    _select_primary_linked_artifact,
    _wrapper_page_visible_text,
)
from observatory.source_registry import ROOT, JurisdictionManifest, SeedDocument, load_all_source_manifests
from observatory.url_safety import (
    BROWSER_USER_AGENT,
    DEFAULT_MAX_RESPONSE_BYTES,
    UnsafeURLError,
    decode_html_bytes,
    read_bounded,
    repo_rel_posix,
    safe_urlopen,
    same_host_family,
    validate_public_http_url,
)


RAW_DATA_DIR = ROOT / "data" / "raw"
RETRIEVAL_DATA_DIR = ROOT / "data" / "retrieval"
RETRYABLE_HTTP_STATUS_CODES = {408, 425, 429, 500, 502, 503, 504}
BROWSER_FALLBACK_HTTP_STATUS_CODES = {403, 429, 503}
PRESERVED_METADATA_KEYS_WHEN_UNCHANGED = (
    "source_publication_date",
    "source_publication_date_text",
    "source_publication_date_method",
    "source_last_updated_date",
    "source_last_updated_date_text",
    "source_last_updated_date_method",
    "last_updated_date",
    "embedded_artifact_path",
    "linked_artifact_path",
    "linked_artifact_url",
    "linked_artifact_label",
    "linked_artifact_format",
)

# Kept as a module-level symbol so tests can monkeypatch `observatory.retrieval.urlopen`.
urlopen = safe_urlopen


def _all_seed_documents(
    manifests: Iterable[JurisdictionManifest],
    jurisdiction: str | None = None,
) -> list[tuple[str, SeedDocument]]:
    documents: list[tuple[str, SeedDocument]] = []
    for manifest in manifests:
        if jurisdiction is not None and manifest.jurisdiction != jurisdiction:
            continue
        for document in manifest.seed_documents:
            documents.append((manifest.jurisdiction, document))
    return documents


def _find_seed_document(
    manifests: Iterable[JurisdictionManifest],
    *,
    jurisdiction: str,
    document_id: str,
) -> SeedDocument:
    for manifest in manifests:
        if manifest.jurisdiction != jurisdiction:
            continue
        for document in manifest.seed_documents:
            if document.id == document_id:
                return document
    raise ValueError(f"seed document '{document_id}' was not found for jurisdiction '{jurisdiction}'")


def _extension_for(
    document: SeedDocument,
    content_type: str | None,
    *,
    source_url: str | None = None,
) -> str:
    if document.document_format == "pdf":
        return ".pdf"
    if document.document_format == "html":
        return ".html"
    if content_type:
        guessed = mimetypes.guess_extension(content_type.split(";")[0].strip())
        if guessed:
            return guessed
    parsed = urlparse(source_url or str(document.canonical_url))
    suffix = Path(parsed.path).suffix
    return suffix or ".bin"


def _document_directory(jurisdiction: str, document: SeedDocument) -> Path:
    return RAW_DATA_DIR / jurisdiction / document.id


def _retrieval_log_path(jurisdiction: str, document: SeedDocument) -> Path:
    return RETRIEVAL_DATA_DIR / jurisdiction / f"{document.id}.json"


def _load_json_file(path: Path) -> dict[str, object] | None:
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict):
        raise ValueError(f"expected object payload in {path}")
    return payload


def _write_json_file(path: Path, payload: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")


def _visible_html_text_length(
    payload: bytes,
    content_type: str | None,
    *,
    wait_for_selector: str | None = None,
) -> tuple[int, bool]:
    """Return `(visible_chars, selector_matched)` after stripping scripts/chrome."""
    html = decode_html_bytes(payload, content_type=content_type)
    soup = BeautifulSoup(html, "html.parser")
    if wait_for_selector:
        target = soup.select_one(wait_for_selector)
        if target is None:
            return 0, False
        for node in target.find_all(["script", "style", "noscript"]):
            node.decompose()
        text = " ".join(target.get_text(" ", strip=True).split())
        return len(text), True

    for node in soup.find_all(["script", "style", "noscript", "header", "nav", "footer", "aside"]):
        node.decompose()
    text = " ".join(soup.get_text(" ", strip=True).split())
    return len(text), True


def _is_blocked_spa_overwrite(
    *,
    document: SeedDocument,
    previous_metadata: dict[str, object],
    payload: bytes,
    content_type: str | None,
    transport: str,
) -> str | None:
    """Prevent plain-HTTP SPA shells from overwriting or seeding rendered browser_required sources."""
    if not document.browser_required or transport != "http":
        return None

    previous_transport = previous_metadata.get("transport")
    previous_bytes = previous_metadata.get("content_bytes")
    if previous_transport == "browser":
        return "existing artifact was captured via browser; refusing plain-HTTP overwrite for browser_required source"

    if isinstance(previous_bytes, int) and previous_bytes >= 5000 and len(payload) < int(previous_bytes * 0.7):
        return (
            f"plain-HTTP payload ({len(payload)} bytes) is materially smaller than existing "
            f"artifact ({previous_bytes} bytes) for browser_required source"
        )

    if _is_html_content_type(content_type) or document.document_format == "html":
        if document.browser_wait_for_selector:
            min_chars = document.browser_min_text_length or 500
            visible_chars, selector_matched = _visible_html_text_length(
                payload,
                content_type,
                wait_for_selector=document.browser_wait_for_selector,
            )
            if not selector_matched:
                return (
                    f"plain-HTTP HTML is missing required selector '{document.browser_wait_for_selector}' "
                    "for browser_required source"
                )
            if visible_chars < min_chars:
                return (
                    f"plain-HTTP HTML selector '{document.browser_wait_for_selector}' contains only "
                    f"{visible_chars} visible chars (< {min_chars}) for browser_required source"
                )
        else:
            min_chars = max(document.browser_min_text_length or 0, 500)
            visible_chars, _ = _visible_html_text_length(payload, content_type)
            if visible_chars < min_chars:
                return (
                    f"plain-HTTP HTML contains only {visible_chars} visible chars "
                    f"(< {min_chars}) for browser_required source"
                )

    return None


def _maybe_fetch_companion_artifacts(
    *,
    artifact_path: Path,
    metadata: dict[str, object],
    timeout_seconds: int = 30,
) -> list[str]:
    """Download embedded iframe HTML or primary linked PDF/HWPX/ODT during retrieval."""
    notes: list[str] = []
    if artifact_path.suffix.lower() != ".html" or not artifact_path.exists():
        return notes

    html = decode_html_bytes(
        artifact_path.read_bytes(),
        content_type=metadata.get("content_type") if isinstance(metadata.get("content_type"), str) else None,
    )
    soup = BeautifulSoup(html, "html.parser")
    base_url = str(metadata.get("resolved_url") or metadata.get("canonical_url") or "")

    # 1. Check for thin iframe shell (e.g. legacy legal portals)
    iframe = soup.find("iframe")
    visible_text = " ".join(soup.get_text(" ", strip=True).split())
    if iframe is not None and len(visible_text) <= 300:
        iframe_src = iframe.get("src")
        if isinstance(iframe_src, str) and iframe_src.strip():
            target_url = urljoin(base_url, iframe_src.strip())
            try:
                validate_public_http_url(target_url, resolve_dns=False)
                if same_host_family(base_url, target_url):
                    request = Request(target_url, headers=_request_headers())
                    with urlopen(request, timeout=min(timeout_seconds, 20)) as response:
                        embedded_payload = read_bounded(response, max_bytes=DEFAULT_MAX_RESPONSE_BYTES)
                    if embedded_payload:
                        embedded_path = artifact_path.with_name("embedded_source.html")
                        embedded_path.write_bytes(embedded_payload)
                        metadata["embedded_artifact_path"] = _display_path(embedded_path)
                        notes.append(f"fetched_embedded_html:{target_url}")
            except (UnsafeURLError, HTTPError, URLError, TimeoutError, socket.timeout, ValueError) as exc:
                notes.append(f"embedded_html_fetch_failed:{type(exc).__name__}")

    # 2. Check for wrapper page with a primary downloadable artifact (PDF / HWPX / ODT)
    wrapper_visible = _wrapper_page_visible_text(html)
    pdf_marker_count = html.lower().count("(pdf)")
    download_anchor_count = sum(1 for anchor in soup.find_all("a", href=True) if anchor.has_attr("download"))
    selected = _select_primary_linked_artifact(soup, base_url=base_url, metadata=dict(metadata))
    if selected is None:
        return notes
    if len(wrapper_visible) > 1800 and pdf_marker_count < 3 and download_anchor_count < 2:
        # Still allow when `_select_primary_linked_artifact` strongly matched a downloadable file.
        pass

    candidate_url, candidate_label, format_hint = selected
    linked_suffix = ".pdf" if format_hint == "pdf" else ".hwpx" if format_hint == "hwpx" else ".odt"
    linked_path = artifact_path.with_name(f"linked_source{linked_suffix}")
    if linked_path.exists() and metadata.get("linked_artifact_url") == candidate_url:
        metadata["linked_artifact_path"] = _display_path(linked_path)
        return notes

    try:
        validate_public_http_url(candidate_url, resolve_dns=False)
        headers = {
            **_request_headers(),
            "Referer": base_url or candidate_url,
            "Accept": "application/pdf,application/octet-stream,text/html;q=0.9,*/*;q=0.8",
        }
        request = Request(candidate_url, headers=headers)
        with urlopen(request, timeout=timeout_seconds) as response:
            payload = read_bounded(response, max_bytes=DEFAULT_MAX_RESPONSE_BYTES)
            content_type = response.headers.get("Content-Type")
    except (UnsafeURLError, HTTPError, URLError, TimeoutError, socket.timeout, ValueError) as exc:
        notes.append(f"linked_artifact_fetch_failed:{type(exc).__name__}")
        return notes

    if format_hint == "pdf" and not _payload_looks_like_pdf(payload):
        notes.append(f"linked_artifact_unexpected_content_type:{content_type or 'unknown'}")
        return notes
    if format_hint == "hwpx" and not _payload_looks_like_hwpx(payload):
        notes.append(f"linked_artifact_unexpected_content_type:{content_type or 'unknown'}")
        return notes
    if format_hint == "odt" and not _payload_looks_like_odt(payload):
        notes.append(f"linked_artifact_unexpected_content_type:{content_type or 'unknown'}")
        return notes

    linked_path.write_bytes(payload)
    metadata["linked_artifact_path"] = _display_path(linked_path)
    metadata["linked_artifact_url"] = candidate_url
    metadata["linked_artifact_label"] = candidate_label
    metadata["linked_artifact_format"] = format_hint
    notes.append(f"fetched_linked_artifact:{candidate_url}")
    return notes


def _store_download_artifact(
    *,
    jurisdiction: str,
    document: SeedDocument,
    payload: bytes,
    content_type: str | None,
    status_code: int,
    attempted_at: str,
    attempt_count: int,
    fetch_url: str,
    resolved_url: str,
    transport: str,
    headers: dict[str, object] | None = None,
    log_status_prefix: str = "downloaded",
    fetch_companions: bool = False,
) -> dict[str, str]:
    target_dir = _document_directory(jurisdiction, document)
    target_dir.mkdir(parents=True, exist_ok=True)
    metadata_path = target_dir / "metadata.json"
    log_path = _retrieval_log_path(jurisdiction, document)
    previous_metadata = _load_json_file(metadata_path) or {}

    spa_block_reason = _is_blocked_spa_overwrite(
        document=document,
        previous_metadata=previous_metadata,
        payload=payload,
        content_type=content_type,
        transport=transport,
    )
    if spa_block_reason is not None:
        _append_retrieval_attempt(
            log_path=log_path,
            jurisdiction=jurisdiction,
            document=document,
            entry={
                "attempted_at": attempted_at,
                "attempt_number": attempt_count,
                "status": "blocked_spa_overwrite",
                "status_code": status_code,
                "content_type": content_type,
                "content_bytes": len(payload),
                "fetch_url": fetch_url,
                "resolved_url": resolved_url,
                "transport": transport,
                "error": spa_block_reason,
            },
        )
        return _final_result(
            jurisdiction=jurisdiction,
            document_id=document.id,
            status="blocked_spa_overwrite",
            attempts=attempt_count,
            status_code=status_code,
            error=spa_block_reason,
        )

    extension = _extension_for(document, content_type, source_url=resolved_url)
    artifact_path = target_dir / f"source{extension}"

    # Remove stale source.<old_ext> if format extension changed on update.
    previous_artifact_rel = previous_metadata.get("artifact_path")
    if isinstance(previous_artifact_rel, str):
        previous_artifact = ROOT / previous_artifact_rel
        if previous_artifact.exists() and previous_artifact.resolve() != artifact_path.resolve():
            try:
                previous_artifact.unlink()
            except OSError:
                pass

    current_hash = sha256(payload).hexdigest()
    previous_hash = previous_metadata.get("sha256")
    if previous_hash is not None and not isinstance(previous_hash, str):
        raise ValueError(f"metadata '{metadata_path}' has non-string sha256 value")
    artifact_state = _artifact_state(previous_hash, current_hash)

    if artifact_state != "unchanged" or not artifact_path.exists():
        artifact_path.write_bytes(payload)

    retrieval_log_path = _display_path(log_path)
    retrieval_count = 1
    existing_retrieval_count = previous_metadata.get("retrieval_count")
    if isinstance(existing_retrieval_count, int):
        retrieval_count = existing_retrieval_count + 1

    metadata: dict[str, object] = {
        "jurisdiction": jurisdiction,
        "document_id": document.id,
        "title": document.title,
        "issuing_body": document.issuing_body,
        "canonical_url": str(document.canonical_url),
        "source_url": str(document.canonical_url),
        "retrieval_urls": [str(url) for url in document.retrieval_urls],
        "document_format": document.document_format,
        "source_tier": document.source_tier,
        "corpus_role": document.corpus_role,
        "lifecycle_stage": document.lifecycle_stage,
        "languages": list(document.languages),
        "language": document.languages[0],
        "publication_date": document.publication_date,
        "seed_publication_date": document.publication_date,
        "effective_date": document.effective_date,
        "seed_effective_date": document.effective_date,
        "source_portal_ids": list(document.source_portal_ids),
        "browser_required": document.browser_required,
        "browser_wait_for_selector": document.browser_wait_for_selector,
        "browser_min_text_length": document.browser_min_text_length,
        "browser_click_selectors": document.browser_click_selectors,
        "fetch_url": fetch_url,
        "resolved_url": resolved_url,
        "transport": transport,
        "content_type": content_type,
        "status_code": status_code,
        "retrieved_at": attempted_at,
        "first_retrieved_at": previous_metadata.get("first_retrieved_at", attempted_at),
        "retrieval_count": retrieval_count,
        "sha256": current_hash,
        "content_bytes": len(payload),
        "artifact_state": artifact_state,
        "etag": headers.get("etag") if isinstance(headers, dict) else None,
        "last_modified": headers.get("last_modified") if isinstance(headers, dict) else None,
        "artifact_path": _display_path(artifact_path),
        "retrieval_log_path": retrieval_log_path,
    }

    # Preserve non-conflicting extracted metadata across unchanged refreshes.
    if artifact_state == "unchanged":
        for preserved_key in PRESERVED_METADATA_KEYS_WHEN_UNCHANGED:
            if preserved_key in previous_metadata and previous_metadata[preserved_key] is not None:
                metadata[preserved_key] = previous_metadata[preserved_key]
        if previous_metadata.get("source_publication_date") and previous_metadata.get("publication_date"):
            metadata["publication_date"] = previous_metadata["publication_date"]

    companion_notes: list[str] = []
    if fetch_companions and transport != "manual_import":
        companion_notes = _maybe_fetch_companion_artifacts(
            artifact_path=artifact_path,
            metadata=metadata,
        )

    _write_json_file(metadata_path, metadata)

    attempt_entry: dict[str, object] = {
        "attempted_at": attempted_at,
        "attempt_number": attempt_count,
        "status": f"{log_status_prefix}_{artifact_state}",
        "status_code": status_code,
        "content_type": content_type,
        "content_bytes": len(payload),
        "sha256": current_hash,
        "artifact_state": artifact_state,
        "fetch_url": fetch_url,
        "resolved_url": resolved_url,
        "transport": transport,
        "artifact_path": _display_path(artifact_path),
        "etag": headers.get("etag") if isinstance(headers, dict) else None,
        "last_modified": headers.get("last_modified") if isinstance(headers, dict) else None,
    }
    if companion_notes:
        attempt_entry["companion_notes"] = companion_notes
    _append_retrieval_attempt(
        log_path=log_path,
        jurisdiction=jurisdiction,
        document=document,
        entry=attempt_entry,
    )

    return _final_result(
        jurisdiction=jurisdiction,
        document_id=document.id,
        status=f"{log_status_prefix}_{artifact_state}",
        attempts=attempt_count,
        artifact_state=artifact_state,
        status_code=status_code,
    )


def _request_headers(
    *,
    languages: list[str] | None = None,
    etag: str | None = None,
    last_modified: str | None = None,
) -> dict[str, str]:
    accept_language = "en-US,en;q=0.9"
    if languages:
        primary = languages[0].strip().lower()
        if primary == "ja":
            accept_language = "ja-JP,ja;q=0.9,en;q=0.5"
        elif primary == "ko":
            accept_language = "ko-KR,ko;q=0.9,en;q=0.5"
        elif primary == "zh":
            accept_language = "zh-CN,zh;q=0.9,en;q=0.5"
    headers = {
        "User-Agent": BROWSER_USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf;q=0.8,*/*;q=0.7",
        "Accept-Language": accept_language,
    }
    if etag:
        headers["If-None-Match"] = etag
    if last_modified:
        headers["If-Modified-Since"] = last_modified
    return headers


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _artifact_state(previous_hash: str | None, current_hash: str) -> str:
    if previous_hash is None:
        return "new"
    if previous_hash == current_hash:
        return "unchanged"
    return "updated"


def _display_path(path: Path) -> str:
    return repo_rel_posix(path, root=ROOT)


def _append_retrieval_attempt(
    *,
    log_path: Path,
    jurisdiction: str,
    document: SeedDocument,
    entry: dict[str, object],
) -> dict[str, object]:
    payload = _load_json_file(log_path) or {
        "jurisdiction": jurisdiction,
        "document_id": document.id,
        "canonical_url": str(document.canonical_url),
        "attempts": [],
    }
    attempts = payload.setdefault("attempts", [])
    if not isinstance(attempts, list):
        raise ValueError(f"retrieval log '{log_path}' has non-list attempts field")
    attempts.append(entry)
    _write_json_file(log_path, payload)
    return payload


def _final_result(
    *,
    jurisdiction: str,
    document_id: str,
    status: str,
    attempts: int,
    artifact_state: str | None = None,
    status_code: int | None = None,
    error: str | None = None,
) -> dict[str, str]:
    result = {
        "jurisdiction": jurisdiction,
        "document_id": document_id,
        "status": status,
        "attempts": str(attempts),
    }
    if artifact_state is not None:
        result["artifact_state"] = artifact_state
    if status_code is not None:
        result["status_code"] = str(status_code)
    if error is not None:
        result["error"] = error
    return result


def _eurlex_celex_code(document: SeedDocument) -> str | None:
    parsed = urlparse(str(document.canonical_url))
    if parsed.netloc != "eur-lex.europa.eu":
        return None
    match = re.match(r"^/eli/(reg|dir|dec)/(\d{4})/(\d+)/oj(?:/|$)", parsed.path)
    if not match:
        return None
    instrument_type, year, number = match.groups()
    celex_type = {"reg": "R", "dir": "L", "dec": "D"}[instrument_type]
    return f"3{year}{celex_type}{number.zfill(4)}"


def _append_candidate_url(candidates: list[str], candidate: str | None) -> None:
    if candidate and candidate not in candidates:
        candidates.append(candidate)


def _looks_like_direct_document_url(url: str) -> bool:
    parsed = urlparse(url)
    candidate = f"{parsed.path}?{parsed.query}".lower()
    if any(extension in candidate for extension in (".pdf", ".doc", ".docx", ".txt", ".xml", ".xhtml")):
        return True
    return any(marker in candidate for marker in ("download-handler", "format=xhtml"))


def _candidate_fetch_urls(document: SeedDocument) -> list[str]:
    candidates: list[str] = []
    canonical_url = str(document.canonical_url)

    # Explicit manifest retrieval_urls always take precedence (e.g., landing pages or mirrors).
    for retrieval_url in document.retrieval_urls:
        _append_candidate_url(candidates, str(retrieval_url))

    celex_code = _eurlex_celex_code(document)
    if celex_code is not None:
        _append_candidate_url(
            candidates,
            f"https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:{celex_code}",
        )

    _append_candidate_url(candidates, canonical_url)
    return candidates


def _is_html_content_type(content_type: str | None) -> bool:
    if content_type is None:
        return False
    return content_type.split(";")[0].strip().lower() in {"text/html", "application/xhtml+xml"}


def _payload_looks_like_pdf(payload: bytes) -> bool:
    return payload.lstrip().startswith(b"%PDF-")


def _is_pdf_like_response(content_type: str | None, url: str, payload: bytes) -> bool:
    """Require actual %PDF- magic bytes so HTML WAF/404 pages at .pdf URLs are rejected."""
    _ = content_type, url
    return _payload_looks_like_pdf(payload)


def _same_host_family(base_url: str, candidate_url: str) -> bool:
    return same_host_family(base_url, candidate_url)


def _linked_pdf_candidates(payload: bytes, *, base_url: str) -> list[str]:
    candidates: list[str] = []
    for candidate_url in extract_linked_pdf_urls(payload, base_url=base_url, same_host_family=_same_host_family):
        _append_candidate_url(candidates, candidate_url)
    return candidates


def _prioritize_linked_artifact_urls(document: SeedDocument, linked_urls: list[str]) -> list[str]:
    prioritized: list[str] = []
    canonical_url = str(document.canonical_url)
    _append_candidate_url(prioritized, canonical_url if canonical_url in linked_urls else None)

    for retrieval_url in document.retrieval_urls:
        retrieval_url_str = str(retrieval_url)
        if retrieval_url_str in linked_urls:
            _append_candidate_url(prioritized, retrieval_url_str)

    for linked_url in linked_urls:
        _append_candidate_url(prioritized, linked_url)

    return prioritized


def _request_timeout_seconds(document: SeedDocument) -> int:
    if document.document_format == "pdf":
        return 60
    return 20


def _browser_timeout_seconds(document: SeedDocument) -> int:
    if document.document_format == "pdf":
        return 90
    return 45


def _should_try_browser_binary_fetch(document: SeedDocument, fetch_url: str) -> bool:
    return document.document_format != "html" or _looks_like_direct_document_url(fetch_url)


def _is_success_http_status(status_code: int) -> bool:
    return 200 <= status_code < 400


def _browser_binary_download(
    *,
    jurisdiction: str,
    document: SeedDocument,
    log_path: Path,
    fetch_url: str,
    attempt_number: int,
) -> tuple[dict[str, object] | None, dict[str, str] | None]:
    attempted_at = _iso_now()
    try:
        validate_public_http_url(fetch_url, resolve_dns=False)
        browser_result = fetch_binary_url_with_browser(
            fetch_url,
            timeout_seconds=_browser_timeout_seconds(document),
            user_agent=_request_headers(languages=document.languages)["User-Agent"],
            locale=locale_for_languages(document.languages),
        )
    except UnsafeURLError as exc:
        _append_retrieval_attempt(
            log_path=log_path,
            jurisdiction=jurisdiction,
            document=document,
            entry={
                "attempted_at": attempted_at,
                "attempt_number": attempt_number,
                "status": "unsafe_url",
                "fetch_url": fetch_url,
                "error": str(exc),
                "transport": "browser_request",
            },
        )
        return None, _final_result(
            jurisdiction=jurisdiction,
            document_id=document.id,
            status="unsafe_url",
            attempts=attempt_number,
            error=str(exc),
        )
    except BrowserUnavailableError as exc:
        _append_retrieval_attempt(
            log_path=log_path,
            jurisdiction=jurisdiction,
            document=document,
            entry={
                "attempted_at": attempted_at,
                "attempt_number": attempt_number,
                "status": "browser_unavailable",
                "fetch_url": fetch_url,
                "error": str(exc),
                "transport": "browser_request",
            },
        )
        return None, _final_result(
            jurisdiction=jurisdiction,
            document_id=document.id,
            status="browser_unavailable",
            attempts=attempt_number,
            error=str(exc),
        )
    except BrowserFetchError as exc:
        _append_retrieval_attempt(
            log_path=log_path,
            jurisdiction=jurisdiction,
            document=document,
            entry={
                "attempted_at": attempted_at,
                "attempt_number": attempt_number,
                "status": "browser_error",
                "fetch_url": fetch_url,
                "error": str(exc),
                "transport": "browser_request",
            },
        )
        return None, _final_result(
            jurisdiction=jurisdiction,
            document_id=document.id,
            status="browser_error",
            attempts=attempt_number,
            error=str(exc),
        )

    payload = browser_result.payload
    content_type = browser_result.content_type
    status_code = browser_result.status_code
    resolved_url = browser_result.resolved_url

    if not _is_success_http_status(status_code):
        _append_retrieval_attempt(
            log_path=log_path,
            jurisdiction=jurisdiction,
            document=document,
            entry={
                "attempted_at": attempted_at,
                "attempt_number": attempt_number,
                "status": "http_error",
                "status_code": status_code,
                "fetch_url": fetch_url,
                "resolved_url": resolved_url,
                "error": f"browser request returned HTTP {status_code}",
                "transport": "browser_request",
            },
        )
        return None, _final_result(
            jurisdiction=jurisdiction,
            document_id=document.id,
            status="http_error",
            attempts=attempt_number,
            status_code=status_code,
            error=f"HTTP {status_code}",
        )

    if not payload:
        _append_retrieval_attempt(
            log_path=log_path,
            jurisdiction=jurisdiction,
            document=document,
            entry={
                "attempted_at": attempted_at,
                "attempt_number": attempt_number,
                "status": "empty_response",
                "status_code": status_code,
                "fetch_url": fetch_url,
                "resolved_url": resolved_url,
                "transport": "browser_request",
            },
        )
        return None, _final_result(
            jurisdiction=jurisdiction,
            document_id=document.id,
            status="empty_response",
            attempts=attempt_number,
            status_code=status_code,
        )

    if document.document_format == "pdf" and not _is_pdf_like_response(content_type, resolved_url, payload):
        _append_retrieval_attempt(
            log_path=log_path,
            jurisdiction=jurisdiction,
            document=document,
            entry={
                "attempted_at": attempted_at,
                "attempt_number": attempt_number,
                "status": "unexpected_content_type",
                "status_code": status_code,
                "content_type": content_type,
                "fetch_url": fetch_url,
                "resolved_url": resolved_url,
                "transport": "browser_request",
            },
        )
        return None, _final_result(
            jurisdiction=jurisdiction,
            document_id=document.id,
            status="unexpected_content_type",
            attempts=attempt_number,
            status_code=status_code,
            error=content_type or "unknown content type",
        )

    return (
        {
            "payload": payload,
            "content_type": content_type,
            "status_code": status_code,
            "headers": {},
            "attempted_at": attempted_at,
            "attempts": attempt_number,
            "fetch_url": fetch_url,
            "resolved_url": resolved_url,
            "transport": "browser_request",
        },
        None,
    )


def _browser_html_download(
    *,
    jurisdiction: str,
    document: SeedDocument,
    log_path: Path,
    candidate_urls: list[str],
    fetch_urls: list[str],
    seen_fetch_urls: set[str],
    timeout_seconds: int,
    attempt_number: int,
) -> tuple[dict[str, object] | None, dict[str, str] | None, int]:
    last_result: dict[str, str] | None = None
    for fetch_url in candidate_urls:
        attempt_number += 1
        attempted_at = _iso_now()
        try:
            validate_public_http_url(fetch_url, resolve_dns=False)
            browser_result = fetch_url_with_browser(
                fetch_url,
                wait_for_selector=document.browser_wait_for_selector,
                min_text_length=document.browser_min_text_length,
                click_selectors=document.browser_click_selectors,
                timeout_seconds=_browser_timeout_seconds(document),
                user_agent=_request_headers(languages=document.languages)["User-Agent"],
                locale=locale_for_languages(document.languages),
            )
        except UnsafeURLError as exc:
            _append_retrieval_attempt(
                log_path=log_path,
                jurisdiction=jurisdiction,
                document=document,
                entry={
                    "attempted_at": attempted_at,
                    "attempt_number": attempt_number,
                    "status": "unsafe_url",
                    "fetch_url": fetch_url,
                    "error": str(exc),
                    "transport": "browser",
                },
            )
            last_result = _final_result(
                jurisdiction=jurisdiction,
                document_id=document.id,
                status="unsafe_url",
                attempts=attempt_number,
                error=str(exc),
            )
            continue
        except BrowserUnavailableError as exc:
            _append_retrieval_attempt(
                log_path=log_path,
                jurisdiction=jurisdiction,
                document=document,
                entry={
                    "attempted_at": attempted_at,
                    "attempt_number": attempt_number,
                    "status": "browser_unavailable",
                    "fetch_url": fetch_url,
                    "error": str(exc),
                },
            )
            last_result = _final_result(
                jurisdiction=jurisdiction,
                document_id=document.id,
                status="browser_unavailable",
                attempts=attempt_number,
                error=str(exc),
            )
            break
        except BrowserFetchError as exc:
            _append_retrieval_attempt(
                log_path=log_path,
                jurisdiction=jurisdiction,
                document=document,
                entry={
                    "attempted_at": attempted_at,
                    "attempt_number": attempt_number,
                    "status": "browser_error",
                    "fetch_url": fetch_url,
                    "error": str(exc),
                },
            )
            last_result = _final_result(
                jurisdiction=jurisdiction,
                document_id=document.id,
                status="browser_error",
                attempts=attempt_number,
                error=str(exc),
            )
            continue

        payload = browser_result.payload
        content_type = browser_result.content_type
        status_code = browser_result.status_code
        resolved_url = browser_result.resolved_url

        if not _is_success_http_status(status_code):
            _append_retrieval_attempt(
                log_path=log_path,
                jurisdiction=jurisdiction,
                document=document,
                entry={
                    "attempted_at": attempted_at,
                    "attempt_number": attempt_number,
                    "status": "http_error",
                    "status_code": status_code,
                    "fetch_url": fetch_url,
                    "resolved_url": resolved_url,
                    "error": f"browser returned HTTP {status_code}",
                    "transport": "browser",
                },
            )
            last_result = _final_result(
                jurisdiction=jurisdiction,
                document_id=document.id,
                status="http_error",
                attempts=attempt_number,
                status_code=status_code,
                error=f"HTTP {status_code}",
            )
            continue

        if not payload:
            _append_retrieval_attempt(
                log_path=log_path,
                jurisdiction=jurisdiction,
                document=document,
                entry={
                    "attempted_at": attempted_at,
                    "attempt_number": attempt_number,
                    "status": "empty_response",
                    "status_code": status_code,
                    "fetch_url": fetch_url,
                    "transport": "browser",
                },
            )
            last_result = _final_result(
                jurisdiction=jurisdiction,
                document_id=document.id,
                status="empty_response",
                attempts=attempt_number,
                status_code=status_code,
            )
            continue

        if document.document_format == "pdf" and not _is_pdf_like_response(content_type, resolved_url, payload):
            if _is_html_content_type(content_type):
                linked_pdf_urls = _linked_pdf_candidates(payload, base_url=resolved_url)
                if linked_pdf_urls:
                    prioritized_linked_pdf_urls = _prioritize_linked_artifact_urls(document, linked_pdf_urls)
                    fetch_urls[:] = [
                        *[url for url in prioritized_linked_pdf_urls if url not in seen_fetch_urls],
                        *fetch_urls,
                    ]
                    _append_retrieval_attempt(
                        log_path=log_path,
                        jurisdiction=jurisdiction,
                        document=document,
                        entry={
                            "attempted_at": attempted_at,
                            "attempt_number": attempt_number,
                            "status": "discovered_linked_artifact",
                            "content_type": content_type,
                            "fetch_url": fetch_url,
                            "resolved_url": resolved_url,
                            "linked_urls": linked_pdf_urls,
                            "transport": "browser",
                        },
                    )

                    while fetch_urls:
                        candidate_url = fetch_urls.pop(0)
                        if candidate_url in seen_fetch_urls:
                            continue
                        seen_fetch_urls.add(candidate_url)
                        attempt_number += 1
                        linked_attempted_at = _iso_now()
                        try:
                            validate_public_http_url(candidate_url, resolve_dns=False)
                            request = Request(candidate_url, headers=_request_headers(languages=document.languages))
                            with urlopen(request, timeout=timeout_seconds) as response:
                                linked_payload = read_bounded(response, max_bytes=DEFAULT_MAX_RESPONSE_BYTES)
                                linked_content_type = response.headers.get("Content-Type")
                                linked_status_code = getattr(response, "status", 200)
                                linked_headers = {
                                    "etag": response.headers.get("ETag"),
                                    "last_modified": response.headers.get("Last-Modified"),
                                }
                                try:
                                    linked_resolved_url = response.geturl() if hasattr(response, "geturl") else candidate_url
                                except AttributeError:
                                    linked_resolved_url = candidate_url
                        except (UnsafeURLError, HTTPError, URLError, TimeoutError, socket.timeout, ValueError) as exc:
                            _append_retrieval_attempt(
                                log_path=log_path,
                                jurisdiction=jurisdiction,
                                document=document,
                                entry={
                                    "attempted_at": linked_attempted_at,
                                    "attempt_number": attempt_number,
                                    "status": "linked_fetch_error",
                                    "fetch_url": candidate_url,
                                    "error": f"{type(exc).__name__}: {exc}",
                                    "transport": "http",
                                },
                            )
                            continue

                        if linked_payload and _is_pdf_like_response(linked_content_type, linked_resolved_url, linked_payload):
                            return (
                                {
                                    "payload": linked_payload,
                                    "content_type": linked_content_type,
                                    "status_code": linked_status_code,
                                    "headers": linked_headers,
                                    "attempted_at": linked_attempted_at,
                                    "attempts": attempt_number,
                                    "fetch_url": candidate_url,
                                    "resolved_url": linked_resolved_url,
                                    "transport": "http",
                                },
                                None,
                                attempt_number,
                            )

                        _append_retrieval_attempt(
                            log_path=log_path,
                            jurisdiction=jurisdiction,
                            document=document,
                            entry={
                                "attempted_at": linked_attempted_at,
                                "attempt_number": attempt_number,
                                "status": "unexpected_content_type",
                                "status_code": linked_status_code,
                                "content_type": linked_content_type,
                                "fetch_url": candidate_url,
                                "resolved_url": linked_resolved_url,
                                "transport": "http",
                            },
                        )

            _append_retrieval_attempt(
                log_path=log_path,
                jurisdiction=jurisdiction,
                document=document,
                entry={
                    "attempted_at": attempted_at,
                    "attempt_number": attempt_number,
                    "status": "unexpected_content_type",
                    "status_code": status_code,
                    "content_type": content_type,
                    "fetch_url": fetch_url,
                    "resolved_url": resolved_url,
                    "transport": "browser",
                },
            )
            last_result = _final_result(
                jurisdiction=jurisdiction,
                document_id=document.id,
                status="unexpected_content_type",
                attempts=attempt_number,
                status_code=status_code,
                error=content_type or "unknown content type",
            )
            continue

        return (
            {
                "payload": payload,
                "content_type": content_type,
                "status_code": status_code,
                "headers": {},
                "attempted_at": attempted_at,
                "attempts": attempt_number,
                "fetch_url": fetch_url,
                "resolved_url": resolved_url,
                "transport": "browser",
            },
            None,
            attempt_number,
        )

    return None, last_result, attempt_number


def _download_document(
    *,
    jurisdiction: str,
    document: SeedDocument,
    log_path: Path,
    max_attempts: int,
    use_browser: bool,
    allow_browser_fallback: bool = False,
    etag: str | None = None,
    last_modified: str | None = None,
) -> tuple[dict[str, object] | None, dict[str, str] | None]:
    candidate_urls = _candidate_fetch_urls(document)
    fetch_urls = list(candidate_urls)
    timeout_seconds = _request_timeout_seconds(document)
    attempt_number = 0
    last_result: dict[str, str] | None = None
    seen_fetch_urls: set[str] = set()

    if use_browser:
        browser_download, browser_error, attempt_number = _browser_html_download(
            jurisdiction=jurisdiction,
            document=document,
            log_path=log_path,
            candidate_urls=candidate_urls,
            fetch_urls=fetch_urls,
            seen_fetch_urls=seen_fetch_urls,
            timeout_seconds=timeout_seconds,
            attempt_number=attempt_number,
        )
        if browser_download is not None:
            return browser_download, None
        last_result = browser_error

    while fetch_urls:
        fetch_url = fetch_urls.pop(0)
        if fetch_url in seen_fetch_urls:
            continue
        seen_fetch_urls.add(fetch_url)
        try:
            validate_public_http_url(fetch_url, resolve_dns=False)
        except UnsafeURLError as exc:
            attempt_number += 1
            _append_retrieval_attempt(
                log_path=log_path,
                jurisdiction=jurisdiction,
                document=document,
                entry={
                    "attempted_at": _iso_now(),
                    "attempt_number": attempt_number,
                    "status": "unsafe_url",
                    "error": str(exc),
                    "fetch_url": fetch_url,
                },
            )
            last_result = _final_result(
                jurisdiction=jurisdiction,
                document_id=document.id,
                status="unsafe_url",
                attempts=attempt_number,
                error=str(exc),
            )
            continue

        request = Request(
            fetch_url,
            headers=_request_headers(
                languages=document.languages,
                etag=etag,
                last_modified=last_modified,
            ),
        )
        for candidate_attempt in range(1, max_attempts + 1):
            attempt_number += 1
            attempted_at = _iso_now()
            try:
                with urlopen(request, timeout=timeout_seconds) as response:
                    payload = read_bounded(response, max_bytes=DEFAULT_MAX_RESPONSE_BYTES)
                    content_type = response.headers.get("Content-Type")
                    status_code = getattr(response, "status", 200)
                    headers = {
                        "etag": response.headers.get("ETag"),
                        "last_modified": response.headers.get("Last-Modified"),
                    }
                    try:
                        resolved_url = response.geturl() if hasattr(response, "geturl") else fetch_url
                    except AttributeError:
                        resolved_url = fetch_url
            except UnsafeURLError as exc:
                _append_retrieval_attempt(
                    log_path=log_path,
                    jurisdiction=jurisdiction,
                    document=document,
                    entry={
                        "attempted_at": attempted_at,
                        "attempt_number": attempt_number,
                        "status": "unsafe_url",
                        "error": str(exc),
                        "fetch_url": fetch_url,
                    },
                )
                last_result = _final_result(
                    jurisdiction=jurisdiction,
                    document_id=document.id,
                    status="unsafe_url",
                    attempts=attempt_number,
                    error=str(exc),
                )
                break
            except HTTPError as exc:
                if exc.code == 304:
                    _append_retrieval_attempt(
                        log_path=log_path,
                        jurisdiction=jurisdiction,
                        document=document,
                        entry={
                            "attempted_at": attempted_at,
                            "attempt_number": attempt_number,
                            "status": "not_modified",
                            "status_code": 304,
                            "fetch_url": fetch_url,
                            "transport": "http",
                        },
                    )
                    return (
                        {
                            "not_modified": True,
                            "status_code": 304,
                            "attempted_at": attempted_at,
                            "attempts": attempt_number,
                            "fetch_url": fetch_url,
                            "resolved_url": fetch_url,
                            "transport": "http",
                        },
                        None,
                    )

                _append_retrieval_attempt(
                    log_path=log_path,
                    jurisdiction=jurisdiction,
                    document=document,
                    entry={
                        "attempted_at": attempted_at,
                        "attempt_number": attempt_number,
                        "status": "http_error",
                        "status_code": exc.code,
                        "error": str(exc.reason),
                        "fetch_url": fetch_url,
                    },
                )
                last_result = _final_result(
                    jurisdiction=jurisdiction,
                    document_id=document.id,
                    status="http_error",
                    attempts=attempt_number,
                    status_code=exc.code,
                    error=str(exc.reason),
                )
                if exc.code in RETRYABLE_HTTP_STATUS_CODES and candidate_attempt < max_attempts:
                    time.sleep(0.5 * candidate_attempt)
                    continue
                if allow_browser_fallback and exc.code in BROWSER_FALLBACK_HTTP_STATUS_CODES:
                    browser_download, browser_error, attempt_number = _browser_html_download(
                        jurisdiction=jurisdiction,
                        document=document,
                        log_path=log_path,
                        candidate_urls=[fetch_url],
                        fetch_urls=fetch_urls,
                        seen_fetch_urls=seen_fetch_urls,
                        timeout_seconds=timeout_seconds,
                        attempt_number=attempt_number,
                    )
                    if browser_download is not None:
                        return browser_download, None
                    if browser_error is not None:
                        last_result = browser_error
                break
            except URLError as exc:
                reason = str(exc.reason)
                _append_retrieval_attempt(
                    log_path=log_path,
                    jurisdiction=jurisdiction,
                    document=document,
                    entry={
                        "attempted_at": attempted_at,
                        "attempt_number": attempt_number,
                        "status": "url_error",
                        "error": reason,
                        "fetch_url": fetch_url,
                    },
                )
                last_result = _final_result(
                    jurisdiction=jurisdiction,
                    document_id=document.id,
                    status="url_error",
                    attempts=attempt_number,
                    error=reason,
                )
                if candidate_attempt < max_attempts:
                    time.sleep(0.5 * candidate_attempt)
                    continue
                if allow_browser_fallback and _should_try_browser_binary_fetch(document, fetch_url):
                    attempt_number += 1
                    browser_download, browser_error = _browser_binary_download(
                        jurisdiction=jurisdiction,
                        document=document,
                        log_path=log_path,
                        fetch_url=fetch_url,
                        attempt_number=attempt_number,
                    )
                    if browser_download is not None:
                        return browser_download, None
                    last_result = browser_error
                break
            except (TimeoutError, socket.timeout):
                _append_retrieval_attempt(
                    log_path=log_path,
                    jurisdiction=jurisdiction,
                    document=document,
                    entry={
                        "attempted_at": attempted_at,
                        "attempt_number": attempt_number,
                        "status": "timeout",
                        "fetch_url": fetch_url,
                    },
                )
                last_result = _final_result(
                    jurisdiction=jurisdiction,
                    document_id=document.id,
                    status="timeout",
                    attempts=attempt_number,
                )
                if candidate_attempt < max_attempts:
                    time.sleep(0.5 * candidate_attempt)
                    continue
                if allow_browser_fallback and _should_try_browser_binary_fetch(document, fetch_url):
                    attempt_number += 1
                    browser_download, browser_error = _browser_binary_download(
                        jurisdiction=jurisdiction,
                        document=document,
                        log_path=log_path,
                        fetch_url=fetch_url,
                        attempt_number=attempt_number,
                    )
                    if browser_download is not None:
                        return browser_download, None
                    last_result = browser_error
                break
            except ValueError as exc:
                _append_retrieval_attempt(
                    log_path=log_path,
                    jurisdiction=jurisdiction,
                    document=document,
                    entry={
                        "attempted_at": attempted_at,
                        "attempt_number": attempt_number,
                        "status": "response_error",
                        "error": str(exc),
                        "fetch_url": fetch_url,
                    },
                )
                last_result = _final_result(
                    jurisdiction=jurisdiction,
                    document_id=document.id,
                    status="response_error",
                    attempts=attempt_number,
                    error=str(exc),
                )
                break

            if not payload:
                _append_retrieval_attempt(
                    log_path=log_path,
                    jurisdiction=jurisdiction,
                    document=document,
                    entry={
                        "attempted_at": attempted_at,
                        "attempt_number": attempt_number,
                        "status": "empty_response",
                        "status_code": status_code,
                        "fetch_url": fetch_url,
                    },
                )
                last_result = _final_result(
                    jurisdiction=jurisdiction,
                    document_id=document.id,
                    status="empty_response",
                    attempts=attempt_number,
                    status_code=status_code,
                )
                break

            if document.document_format == "pdf" and not _is_pdf_like_response(content_type, resolved_url, payload):
                if _is_html_content_type(content_type):
                    linked_pdf_urls = _linked_pdf_candidates(payload, base_url=resolved_url)
                    if linked_pdf_urls:
                        prioritized_linked_pdf_urls = _prioritize_linked_artifact_urls(document, linked_pdf_urls)
                        fetch_urls = [
                            *[url for url in prioritized_linked_pdf_urls if url not in seen_fetch_urls],
                            *fetch_urls,
                        ]
                        _append_retrieval_attempt(
                            log_path=log_path,
                            jurisdiction=jurisdiction,
                            document=document,
                            entry={
                                "attempted_at": attempted_at,
                                "attempt_number": attempt_number,
                                "status": "discovered_linked_artifact",
                                "content_type": content_type,
                                "fetch_url": fetch_url,
                                "resolved_url": resolved_url,
                                "linked_urls": linked_pdf_urls,
                            },
                        )
                        last_result = _final_result(
                            jurisdiction=jurisdiction,
                            document_id=document.id,
                            status="discovered_linked_artifact",
                            attempts=attempt_number,
                        )
                        break

                _append_retrieval_attempt(
                    log_path=log_path,
                    jurisdiction=jurisdiction,
                    document=document,
                    entry={
                        "attempted_at": attempted_at,
                        "attempt_number": attempt_number,
                        "status": "unexpected_content_type",
                        "status_code": status_code,
                        "content_type": content_type,
                        "fetch_url": fetch_url,
                        "resolved_url": resolved_url,
                    },
                )
                last_result = _final_result(
                    jurisdiction=jurisdiction,
                    document_id=document.id,
                    status="unexpected_content_type",
                    attempts=attempt_number,
                    status_code=status_code,
                    error=content_type or "unknown content type",
                )
                break

            return (
                {
                    "payload": payload,
                    "content_type": content_type,
                    "status_code": status_code,
                    "headers": headers,
                    "attempted_at": attempted_at,
                    "attempts": attempt_number,
                    "fetch_url": fetch_url,
                    "resolved_url": resolved_url,
                    "transport": "http",
                },
                None,
            )

    return None, last_result or _final_result(
        jurisdiction=jurisdiction,
        document_id=document.id,
        status="url_error",
        attempts=attempt_number or max_attempts,
        error="download failed without a terminal error",
    )


def fetch_seed_documents(
    jurisdiction: str | None = None,
    *,
    refresh: bool = False,
    max_attempts: int = 3,
    use_browser: bool = False,
    fetch_companions: bool = False,
) -> list[dict[str, str]]:
    if max_attempts < 1:
        raise ValueError("max_attempts must be at least 1")

    manifests = load_all_source_manifests()
    documents = _all_seed_documents(manifests, jurisdiction=jurisdiction)
    if not documents:
        raise ValueError("no seed documents matched the requested jurisdiction")

    results: list[dict[str, str]] = []
    for document_jurisdiction, document in documents:
        target_dir = _document_directory(document_jurisdiction, document)
        target_dir.mkdir(parents=True, exist_ok=True)
        metadata_path = target_dir / "metadata.json"
        log_path = _retrieval_log_path(document_jurisdiction, document)

        previous_metadata = _load_json_file(metadata_path) or {}
        if metadata_path.exists() and not refresh:
            _append_retrieval_attempt(
                log_path=log_path,
                jurisdiction=document_jurisdiction,
                document=document,
                entry={
                    "attempted_at": _iso_now(),
                    "attempt_number": 0,
                    "status": "skipped_existing",
                },
            )
            results.append(
                _final_result(
                    jurisdiction=document_jurisdiction,
                    document_id=document.id,
                    status="skipped_existing",
                    attempts=0,
                )
            )
            continue

        prior_etag = previous_metadata.get("etag") if refresh else None
        prior_last_modified = previous_metadata.get("last_modified") if refresh else None

        download, error_result = _download_document(
            jurisdiction=document_jurisdiction,
            document=document,
            log_path=log_path,
            max_attempts=max_attempts,
            use_browser=use_browser and document.browser_required,
            allow_browser_fallback=use_browser,
            etag=prior_etag if isinstance(prior_etag, str) else None,
            last_modified=prior_last_modified if isinstance(prior_last_modified, str) else None,
        )
        if error_result is not None:
            results.append(error_result)
            continue

        if download is None:
            results.append(
                _final_result(
                    jurisdiction=document_jurisdiction,
                    document_id=document.id,
                    status="url_error",
                    attempts=max_attempts,
                    error="download returned no payload",
                )
            )
            continue

        if download.get("not_modified"):
            results.append(
                _final_result(
                    jurisdiction=document_jurisdiction,
                    document_id=document.id,
                    status="not_modified",
                    attempts=int(download["attempts"]),
                    artifact_state="unchanged",
                    status_code=304,
                )
            )
            continue

        payload = download["payload"]
        if not isinstance(payload, bytes):
            raise ValueError("download payload must be bytes")
        content_type = download["content_type"] if isinstance(download["content_type"], str | type(None)) else None
        status_code = int(download["status_code"])
        headers = download["headers"]
        attempted_at = str(download["attempted_at"])
        attempt_count = int(download["attempts"])
        fetch_url = str(download["fetch_url"])
        resolved_url = str(download["resolved_url"])
        transport = str(download.get("transport", "http"))
        results.append(
            _store_download_artifact(
                jurisdiction=document_jurisdiction,
                document=document,
                payload=payload,
                content_type=content_type,
                status_code=status_code,
                attempted_at=attempted_at,
                attempt_count=attempt_count,
                fetch_url=fetch_url,
                resolved_url=resolved_url,
                transport=transport,
                headers=headers if isinstance(headers, dict) else None,
                fetch_companions=fetch_companions,
            )
        )

    return results


def import_local_seed_document(
    *,
    jurisdiction: str,
    document_id: str,
    file_path: Path,
    source_url: str | None = None,
    resolved_url: str | None = None,
    content_type: str | None = None,
) -> dict[str, str]:
    manifests = load_all_source_manifests()
    document = _find_seed_document(manifests, jurisdiction=jurisdiction, document_id=document_id)
    if not file_path.exists() or not file_path.is_file():
        raise ValueError(f"local file does not exist: {file_path}")

    payload = file_path.read_bytes()
    if not payload:
        raise ValueError(f"local file is empty: {file_path}")

    guessed_content_type, _ = mimetypes.guess_type(file_path.name)
    return _store_download_artifact(
        jurisdiction=jurisdiction,
        document=document,
        payload=payload,
        content_type=content_type or guessed_content_type,
        status_code=200,
        attempted_at=_iso_now(),
        attempt_count=1,
        fetch_url=source_url or str(document.canonical_url),
        resolved_url=resolved_url or source_url or str(document.canonical_url),
        transport="manual_import",
        headers=None,
        log_status_prefix="imported_local",
        fetch_companions=False,
    )
