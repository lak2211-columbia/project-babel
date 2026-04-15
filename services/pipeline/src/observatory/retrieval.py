from __future__ import annotations

import json
import mimetypes
import re
import socket
import time
from hashlib import sha256
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from observatory.browser_fetch import (
    BrowserFetchError,
    BrowserUnavailableError,
    fetch_binary_url_with_browser,
    fetch_url_with_browser,
)
from observatory.linked_artifacts import extract_linked_pdf_urls
from observatory.source_registry import ROOT, JurisdictionManifest, SeedDocument, load_all_source_manifests


RAW_DATA_DIR = ROOT / "data" / "raw"
RETRIEVAL_DATA_DIR = ROOT / "data" / "retrieval"
RETRYABLE_HTTP_STATUS_CODES = {408, 425, 429, 500, 502, 503, 504}


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
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


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
) -> dict[str, str]:
    target_dir = _document_directory(jurisdiction, document)
    target_dir.mkdir(parents=True, exist_ok=True)
    metadata_path = target_dir / "metadata.json"
    log_path = _retrieval_log_path(jurisdiction, document)
    extension = _extension_for(document, content_type, source_url=resolved_url)
    artifact_path = target_dir / f"source{extension}"
    artifact_path.write_bytes(payload)
    current_hash = sha256(payload).hexdigest()
    previous_metadata = _load_json_file(metadata_path) or {}
    previous_hash = previous_metadata.get("sha256")
    if previous_hash is not None and not isinstance(previous_hash, str):
        raise ValueError(f"metadata '{metadata_path}' has non-string sha256 value")
    artifact_state = _artifact_state(previous_hash, current_hash)
    retrieval_log_path = _display_path(log_path)
    retrieval_count = 1
    existing_retrieval_count = previous_metadata.get("retrieval_count")
    if isinstance(existing_retrieval_count, int):
        retrieval_count = existing_retrieval_count + 1

    metadata = {
        "jurisdiction": jurisdiction,
        "document_id": document.id,
        "title": document.title,
        "issuing_body": document.issuing_body,
        "canonical_url": str(document.canonical_url),
        "source_url": str(document.canonical_url),
        "retrieval_urls": [str(url) for url in document.retrieval_urls],
        "document_format": document.document_format,
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
    _write_json_file(metadata_path, metadata)

    _append_retrieval_attempt(
        log_path=log_path,
        jurisdiction=jurisdiction,
        document=document,
        entry={
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
        },
    )

    return _final_result(
        jurisdiction=jurisdiction,
        document_id=document.id,
        status=f"{log_status_prefix}_{artifact_state}",
        attempts=attempt_count,
        artifact_state=artifact_state,
        status_code=status_code,
    )


def _request_headers() -> dict[str, str]:
    return {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf;q=0.8,*/*;q=0.7",
        "Accept-Language": "en-US,en;q=0.9",
    }


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _artifact_state(previous_hash: str | None, current_hash: str) -> str:
    if previous_hash is None:
        return "new"
    if previous_hash == current_hash:
        return "unchanged"
    return "updated"


def _display_path(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


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
    prioritize_canonical = document.document_format != "html" or _looks_like_direct_document_url(canonical_url)

    if prioritize_canonical:
        _append_candidate_url(candidates, canonical_url)

    for retrieval_url in document.retrieval_urls:
        _append_candidate_url(candidates, str(retrieval_url))

    celex_code = _eurlex_celex_code(document)
    if celex_code is not None:
        _append_candidate_url(
            candidates,
            f"https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:{celex_code}",
        )

    if not prioritize_canonical:
        _append_candidate_url(candidates, canonical_url)

    return candidates


def _is_html_content_type(content_type: str | None) -> bool:
    if content_type is None:
        return False
    return content_type.split(";")[0].strip().lower() in {"text/html", "application/xhtml+xml"}


def _payload_looks_like_pdf(payload: bytes) -> bool:
    return payload.lstrip().startswith(b"%PDF-")


def _is_pdf_like_response(content_type: str | None, url: str, payload: bytes) -> bool:
    if _payload_looks_like_pdf(payload):
        return True
    normalized_content_type = content_type.split(";")[0].strip().lower() if content_type is not None else None
    if normalized_content_type == "application/pdf":
        return True
    if normalized_content_type == "application/octet-stream" and _payload_looks_like_pdf(payload):
        return True
    parsed = urlparse(url)
    return ".pdf" in f"{parsed.path}{parsed.query}".lower()


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
        browser_result = fetch_binary_url_with_browser(
            fetch_url,
            timeout_seconds=_browser_timeout_seconds(document),
            user_agent=_request_headers()["User-Agent"],
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


def _download_document(
    *,
    jurisdiction: str,
    document: SeedDocument,
    log_path: Path,
    max_attempts: int,
    use_browser: bool,
) -> tuple[dict[str, object] | None, dict[str, str] | None]:
    candidate_urls = _candidate_fetch_urls(document)
    fetch_urls = list(candidate_urls)
    timeout_seconds = _request_timeout_seconds(document)
    attempt_number = 0
    last_result: dict[str, str] | None = None
    seen_fetch_urls: set[str] = set()

    if use_browser:
        for fetch_url in candidate_urls:
            attempt_number += 1
            attempted_at = _iso_now()
            try:
                browser_result = fetch_url_with_browser(
                    fetch_url,
                    wait_for_selector=document.browser_wait_for_selector,
                    min_text_length=document.browser_min_text_length,
                    click_selectors=document.browser_click_selectors,
                    timeout_seconds=_browser_timeout_seconds(document),
                    user_agent=_request_headers()["User-Agent"],
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
                                "transport": "browser",
                            },
                        )

                        while fetch_urls:
                            candidate_url = fetch_urls.pop(0)
                            if candidate_url in seen_fetch_urls:
                                continue
                            seen_fetch_urls.add(candidate_url)
                            request = Request(candidate_url, headers=_request_headers())
                            attempt_number += 1
                            linked_attempted_at = _iso_now()
                            try:
                                with urlopen(request, timeout=timeout_seconds) as response:
                                    linked_payload = response.read()
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
                            except (HTTPError, URLError, TimeoutError, socket.timeout):
                                continue

                            if linked_payload:
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
            )

    while fetch_urls:
        fetch_url = fetch_urls.pop(0)
        if fetch_url in seen_fetch_urls:
            continue
        seen_fetch_urls.add(fetch_url)
        request = Request(fetch_url, headers=_request_headers())
        for candidate_attempt in range(1, max_attempts + 1):
            attempt_number += 1
            attempted_at = _iso_now()
            try:
                with urlopen(request, timeout=timeout_seconds) as response:
                    payload = response.read()
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
            except HTTPError as exc:
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
                if _should_try_browser_binary_fetch(document, fetch_url):
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
                if _should_try_browser_binary_fetch(document, fetch_url):
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

        download, error_result = _download_document(
            jurisdiction=document_jurisdiction,
            document=document,
            log_path=log_path,
            max_attempts=max_attempts,
            use_browser=use_browser and document.browser_required,
        )
        if error_result is not None:
            results.append(error_result)
            continue

        assert download is not None
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
    )
