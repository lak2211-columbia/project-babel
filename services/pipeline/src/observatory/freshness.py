from __future__ import annotations

import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request

from observatory.coverage import write_source_inventory
from observatory.discovery import discover_source_candidates
from observatory.expansion import write_source_expansion_plan
from observatory.retrieval import fetch_seed_documents
from observatory.source_registry import ROOT, SeedDocument, load_all_source_manifests
from observatory.url_safety import (
    DEFAULT_DISCOVERY_USER_AGENT,
    UnsafeURLError,
    repo_rel_posix,
    safe_urlopen,
    validate_public_http_url,
)


RAW_DATA_DIR = ROOT / "data" / "raw"
RETRIEVAL_DATA_DIR = ROOT / "data" / "retrieval"
FRESHNESS_REPORT_JSON_PATH = ROOT / "data" / "source_tracking" / "freshness_report.json"
FRESHNESS_REPORT_MD_PATH = ROOT / "data" / "source_tracking" / "freshness_report.md"
HEAD_FALLBACK_STATUS_CODES = {400, 403, 405, 501}
BLOCKED_HTTP_STATUS_CODES = {401, 403, 429}
MAX_FRESHNESS_WORKERS = 8


def run_source_refresh(
    jurisdiction: str | None = None,
    *,
    portal_id: str | None = None,
    max_attempts: int = 3,
    discover: bool = True,
    fetch: bool = True,
    refresh_discovery: bool = True,
    refresh_fetch: bool = True,
    use_browser_discovery: bool = False,
    use_browser_fetch: bool = False,
) -> dict[str, object]:
    if not discover and not fetch:
        raise ValueError("source refresh requires discover or fetch to be enabled")
    if max_attempts < 1:
        raise ValueError("max_attempts must be at least 1")

    discovery_results: list[dict[str, str]] = []
    fetch_results: list[dict[str, str]] = []

    if discover:
        discovery_results = discover_source_candidates(
            jurisdiction=jurisdiction,
            portal_id=portal_id,
            refresh=refresh_discovery,
            use_browser=use_browser_discovery,
        )

    if fetch:
        fetch_results = fetch_seed_documents(
            jurisdiction=jurisdiction,
            refresh=refresh_fetch,
            max_attempts=max_attempts,
            use_browser=use_browser_fetch,
        )

    inventory = write_source_inventory()
    expansion = write_source_expansion_plan()
    jurisdictions = inventory["jurisdictions"]
    if jurisdiction is not None:
        jurisdictions = [item for item in jurisdictions if item["jurisdiction"] == jurisdiction]

    blocked_documents: list[dict[str, str]] = []
    for jurisdiction_payload in jurisdictions:
        for document in jurisdiction_payload["seed_documents"]:
            if document["fetched"]:
                continue
            blocked_documents.append(
                {
                    "jurisdiction": jurisdiction_payload["jurisdiction"],
                    "document_id": document["id"],
                    "latest_retrieval_status": document["latest_retrieval_status"] or "n/a",
                }
            )

    return {
        "jurisdiction": jurisdiction,
        "portal_id": portal_id,
        "discovery_results": discovery_results,
        "fetch_results": fetch_results,
        "blocked_documents": blocked_documents,
        "inventory_json_path": inventory["inventory_json_path"],
        "inventory_markdown_path": inventory["inventory_markdown_path"],
        "expansion_json_path": expansion["plan_json_path"],
        "expansion_markdown_path": expansion["plan_markdown_path"],
    }


def _load_cached_http_validators(
    jurisdiction: str,
    document_id: str,
    *,
    raw_data_dir: Path = RAW_DATA_DIR,
    retrieval_data_dir: Path = RETRIEVAL_DATA_DIR,
) -> dict[str, str | None]:
    """Read cached ETag / Last-Modified / resolved_url metadata without modifying disk."""
    cached: dict[str, str | None] = {
        "etag": None,
        "last_modified": None,
        "retrieved_at": None,
        "resolved_url": None,
    }
    candidates = [
        raw_data_dir / jurisdiction / document_id / "metadata.json",
        retrieval_data_dir / jurisdiction / f"{document_id}.json",
    ]
    for path in candidates:
        if not path.exists():
            continue
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if not isinstance(payload, dict):
            continue
        for key in ("etag", "last_modified", "retrieved_at", "resolved_url"):
            if cached[key] is None and isinstance(payload.get(key), str) and payload[key].strip():
                cached[key] = payload[key].strip()
        # Retrieval logs may nest latest attempt headers under `attempts[-1]` or `response_headers`.
        headers = payload.get("response_headers")
        if isinstance(headers, dict):
            lowered = {str(k).lower(): str(v).strip() for k, v in headers.items() if v is not None}
            if cached["etag"] is None and lowered.get("etag"):
                cached["etag"] = lowered["etag"]
            if cached["last_modified"] is None and lowered.get("last-modified"):
                cached["last_modified"] = lowered["last-modified"]
    return cached


def _normalize_etag(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = value.strip()
    if cleaned.startswith("W/") or cleaned.startswith("w/"):
        cleaned = cleaned[2:].strip()
    return cleaned or None


def _probe_single_url(
    target_url: str,
    *,
    cached_etag: str | None,
    cached_last_modified: str | None,
    timeout: int,
    resolve_dns: bool,
) -> dict[str, Any]:
    """Send a polite SSRF-validated HEAD probe with lightweight GET fallback."""
    try:
        validated_url = validate_public_http_url(target_url, resolve_dns=resolve_dns)
    except UnsafeURLError as exc:
        return {
            "method": "HEAD",
            "status_code": None,
            "freshness_status": "unreachable",
            "resolved_url": target_url,
            "etag": None,
            "last_modified": None,
            "etag_changed": False,
            "last_modified_changed": False,
            "error": f"unsafe_url: {exc}",
        }

    base_headers: dict[str, str] = {"User-Agent": DEFAULT_DISCOVERY_USER_AGENT}
    if cached_etag:
        base_headers["If-None-Match"] = cached_etag
    if cached_last_modified:
        base_headers["If-Modified-Since"] = cached_last_modified

    def _attempt(method: str) -> tuple[int | None, str, str | None, str | None, str | None]:
        headers = dict(base_headers)
        if method == "GET":
            headers["Range"] = "bytes=0-0"
        request = Request(validated_url, headers=headers, method=method)
        try:
            with safe_urlopen(request, timeout=timeout, resolve_dns=resolve_dns) as response:
                status_code = getattr(response, "status", None)
                if status_code is None and hasattr(response, "getcode"):
                    status_code = response.getcode()
                resp_headers = getattr(response, "headers", None)
                resp_etag = resp_headers.get("ETag") if resp_headers is not None else None
                resp_last_mod = resp_headers.get("Last-Modified") if resp_headers is not None else None
                final_url = response.geturl() if hasattr(response, "geturl") else validated_url
                return (
                    int(status_code) if status_code is not None else 200,
                    str(final_url or validated_url),
                    resp_etag.strip() if isinstance(resp_etag, str) and resp_etag.strip() else None,
                    resp_last_mod.strip() if isinstance(resp_last_mod, str) and resp_last_mod.strip() else None,
                    None,
                )
        except HTTPError as exc:
            err_headers = getattr(exc, "headers", None)
            resp_etag = err_headers.get("ETag") if err_headers is not None else None
            resp_last_mod = err_headers.get("Last-Modified") if err_headers is not None else None
            final_url = exc.geturl() if hasattr(exc, "geturl") else validated_url
            return (
                int(exc.code),
                str(final_url or validated_url),
                resp_etag.strip() if isinstance(resp_etag, str) and resp_etag.strip() else None,
                resp_last_mod.strip() if isinstance(resp_last_mod, str) and resp_last_mod.strip() else None,
                f"HTTP {exc.code}: {exc.reason}" if exc.code != 304 else None,
            )
        except UnsafeURLError as exc:
            return None, validated_url, None, None, f"unsafe_redirect: {exc}"
        except (URLError, TimeoutError, OSError) as exc:
            return None, validated_url, None, None, f"{type(exc).__name__}: {exc}"

    method_used = "HEAD"
    status_code, final_url, resp_etag, resp_last_mod, error = _attempt("HEAD")
    if status_code in HEAD_FALLBACK_STATUS_CODES:
        method_used = "GET"
        status_code, final_url, resp_etag, resp_last_mod, error = _attempt("GET")

    etag_changed = False
    last_modified_changed = False
    if status_code == 304:
        freshness_status = "unchanged"
    elif status_code is not None and 200 <= status_code < 300:
        norm_cached_etag = _normalize_etag(cached_etag)
        norm_resp_etag = _normalize_etag(resp_etag)
        if norm_cached_etag and norm_resp_etag and norm_cached_etag != norm_resp_etag:
            etag_changed = True
        if cached_last_modified and resp_last_mod and cached_last_modified != resp_last_mod:
            last_modified_changed = True
        if etag_changed or last_modified_changed:
            freshness_status = "drifted"
        elif (norm_cached_etag and norm_resp_etag) or (cached_last_modified and resp_last_mod):
            freshness_status = "unchanged"
        else:
            freshness_status = "ok"
    elif status_code in BLOCKED_HTTP_STATUS_CODES:
        freshness_status = "blocked"
    else:
        freshness_status = "unreachable"

    return {
        "method": method_used,
        "status_code": status_code,
        "freshness_status": freshness_status,
        "resolved_url": final_url,
        "etag": resp_etag,
        "last_modified": resp_last_mod,
        "etag_changed": etag_changed,
        "last_modified_changed": last_modified_changed,
        "error": error,
    }


def _render_freshness_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Corpus Source Freshness Report",
        "",
        f"- **Generated at**: `{report['generated_at']}`",
        f"- **Scope**: `{report['jurisdiction'] or 'all jurisdictions'}`",
        f"- **Checked documents**: `{report['checked_count']}`",
        f"- **Unchanged (`304` or matching validators)**: `{report['unchanged_count']}`",
        f"- **Reachable (`2xx`, no cached validator baseline)**: `{report['ok_count']}`",
        f"- **Drifted (`ETag` / `Last-Modified` changed)**: `{report['drifted_count']}`",
        f"- **Blocked (`401`/`403`/`429` WAF/bot-gated)**: `{report['blocked_count']}`",
        f"- **Unreachable (`404`/`410`/`5xx`/network/SSRF)**: `{report['unreachable_count']}`",
        "",
    ]

    if report["drifted_documents"]:
        lines.extend(
            [
                "## Drifted Official Sources",
                "",
                "| Jurisdiction | Document ID | HTTP | Cached ETag / Last-Modified | Live ETag / Last-Modified | URL |",
                "| :--- | :--- | :---: | :--- | :--- | :--- |",
            ]
        )
        for item in report["drifted_documents"]:
            cached_val = item["cached_etag"] or item["cached_last_modified"] or "—"
            live_val = item["etag"] or item["last_modified"] or "—"
            lines.append(
                f"| `{item['jurisdiction']}` | `{item['document_id']}` | `{item['status_code']}` | "
                f"`{cached_val}` | `{live_val}` | {item['target_url']} |"
            )
        lines.append("")

    if report["unreachable_documents"]:
        lines.extend(
            [
                "## Unreachable or Broken Official Sources",
                "",
                "| Jurisdiction | Document ID | HTTP | Method | Error | URL |",
                "| :--- | :--- | :---: | :---: | :--- | :--- |",
            ]
        )
        for item in report["unreachable_documents"]:
            status_label = str(item["status_code"]) if item["status_code"] is not None else "ERR"
            error_text = (item["error"] or "").replace("|", "\\|")
            lines.append(
                f"| `{item['jurisdiction']}` | `{item['document_id']}` | `{status_label}` | "
                f"`{item['method']}` | {error_text} | {item['target_url']} |"
            )
        lines.append("")

    if report["blocked_documents"]:
        lines.extend(
            [
                "## Bot-Gated / WAF-Blocked Official Portals (Manual/Browser Refresh)",
                "",
                "| Jurisdiction | Document ID | HTTP | URL |",
                "| :--- | :--- | :---: | :--- |",
            ]
        )
        for item in report["blocked_documents"]:
            lines.append(
                f"| `{item['jurisdiction']}` | `{item['document_id']}` | `{item['status_code']}` | {item['target_url']} |"
            )
        lines.append("")

    if not report["drifted_documents"] and not report["unreachable_documents"]:
        lines.append("All checked official sources are reachable or unchanged (zero actionable drift detected).")
        lines.append("")

    return "\n".join(lines)


def check_source_freshness(
    jurisdiction: str | None = None,
    *,
    timeout: int = 15,
    output_json_path: Path | None = None,
    output_md_path: Path | None = None,
    write_reports: bool = True,
    max_workers: int = 4,
    request_delay_seconds: float = 0.15,
    resolve_dns: bool = True,
    raw_data_dir: Path | None = None,
    retrieval_data_dir: Path | None = None,
) -> dict[str, Any]:
    """Check official source URLs for HTTP drift or breakage without mutating raw artifacts."""
    if timeout < 1:
        raise ValueError("timeout must be at least 1 second")
    if max_workers < 1 or max_workers > MAX_FRESHNESS_WORKERS:
        raise ValueError(f"max_workers must be between 1 and {MAX_FRESHNESS_WORKERS} (got {max_workers})")

    effective_raw_dir = raw_data_dir if raw_data_dir is not None else RAW_DATA_DIR
    effective_retrieval_dir = retrieval_data_dir if retrieval_data_dir is not None else RETRIEVAL_DATA_DIR

    manifests = load_all_source_manifests()
    if jurisdiction is not None:
        manifests = [m for m in manifests if m.jurisdiction == jurisdiction]
        if not manifests:
            raise ValueError(f"no source manifest found for jurisdiction '{jurisdiction}'")

    targets: list[tuple[str, SeedDocument]] = [
        (manifest.jurisdiction, document)
        for manifest in sorted(manifests, key=lambda m: m.jurisdiction)
        for document in sorted(manifest.seed_documents, key=lambda d: d.id)
    ]

    def _check_one(item: tuple[str, SeedDocument]) -> dict[str, Any]:
        jur, document = item
        if request_delay_seconds > 0:
            time.sleep(request_delay_seconds)
        target_url = str(document.retrieval_urls[0] if document.retrieval_urls else document.canonical_url)
        cached = _load_cached_http_validators(
            jur,
            document.id,
            raw_data_dir=effective_raw_dir,
            retrieval_data_dir=effective_retrieval_dir,
        )
        probe = _probe_single_url(
            target_url,
            cached_etag=cached["etag"],
            cached_last_modified=cached["last_modified"],
            timeout=timeout,
            resolve_dns=resolve_dns,
        )
        return {
            "jurisdiction": jur,
            "document_id": document.id,
            "title": document.title,
            "corpus_role": document.corpus_role,
            "target_url": target_url,
            "cached_etag": cached["etag"],
            "cached_last_modified": cached["last_modified"],
            "cached_retrieved_at": cached["retrieved_at"],
            **probe,
        }

    results: list[dict[str, Any]] = []
    if max_workers == 1 or len(targets) <= 1:
        results = [_check_one(item) for item in targets]
    else:
        ordered: list[dict[str, Any] | None] = [None] * len(targets)
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_idx = {executor.submit(_check_one, item): idx for idx, item in enumerate(targets)}
            for future in as_completed(future_to_idx):
                ordered[future_to_idx[future]] = future.result()
        results = [entry for entry in ordered if entry is not None]

    drifted = [item for item in results if item["freshness_status"] == "drifted"]
    unreachable = [item for item in results if item["freshness_status"] == "unreachable"]
    blocked = [item for item in results if item["freshness_status"] == "blocked"]
    unchanged = [item for item in results if item["freshness_status"] == "unchanged"]
    ok = [item for item in results if item["freshness_status"] == "ok"]

    json_path = output_json_path or FRESHNESS_REPORT_JSON_PATH
    md_path = output_md_path or FRESHNESS_REPORT_MD_PATH

    report: dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "jurisdiction": jurisdiction,
        "timeout_seconds": timeout,
        "checked_count": len(results),
        "unchanged_count": len(unchanged),
        "ok_count": len(ok),
        "drifted_count": len(drifted),
        "blocked_count": len(blocked),
        "unreachable_count": len(unreachable),
        "has_actionable_drift": bool(drifted or unreachable),
        "report_json_path": repo_rel_posix(json_path) if write_reports else None,
        "report_markdown_path": repo_rel_posix(md_path) if write_reports else None,
        "drifted_documents": drifted,
        "unreachable_documents": unreachable,
        "blocked_documents": blocked,
        "documents": results,
    }

    if write_reports:
        json_path.parent.mkdir(parents=True, exist_ok=True)
        md_path.parent.mkdir(parents=True, exist_ok=True)
        json_path.write_text(
            json.dumps(report, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
            newline="\n",
        )
        md_path.write_text(
            _render_freshness_markdown(report),
            encoding="utf-8",
            newline="\n",
        )

    return report
