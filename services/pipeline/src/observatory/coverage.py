from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from observatory.discovery import DISCOVERY_DIR
from observatory.source_registry import ROOT, load_all_source_manifests
from observatory.url_safety import repo_rel_posix


TRACKING_DIR = ROOT / "data" / "source_tracking"
INVENTORY_JSON_PATH = TRACKING_DIR / "source_inventory.json"
INVENTORY_MARKDOWN_PATH = ROOT / "docs" / "operations" / "source-inventory.md"
BLOCKED_PLAYBOOK_PATH = ROOT / "docs" / "operations" / "blocked-source-playbook.md"
RAW_DIR = ROOT / "data" / "raw"
PARSED_DIR = ROOT / "data" / "parsed"
ANALYSIS_DIR = ROOT / "data" / "analysis"
RETRIEVAL_DIR = ROOT / "data" / "retrieval"


def _count_values(items: list[dict], key: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for item in items:
        value = item.get(key)
        if not value:
            continue
        counts[str(value)] = counts.get(str(value), 0) + 1
    return dict(sorted(counts.items()))


def _count_list_values(items: list[dict], key: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for item in items:
        values = item.get(key) or []
        for value in values:
            counts[str(value)] = counts.get(str(value), 0) + 1
    return dict(sorted(counts.items()))


def _format_counts(counts: dict[str, int]) -> str:
    if not counts:
        return "n/a"
    return ", ".join(f"`{label}={count}`" for label, count in counts.items())


def _document_state(jurisdiction: str, document_id: str) -> dict[str, bool]:
    raw_metadata_path = RAW_DIR / jurisdiction / document_id / "metadata.json"
    parsed_path = PARSED_DIR / jurisdiction / document_id / "normalized.json"
    analysis_path = ANALYSIS_DIR / jurisdiction / document_id / "document_analysis.json"
    return {
        "fetched": raw_metadata_path.exists(),
        "parsed": parsed_path.exists(),
        "analyzed": analysis_path.exists(),
    }


def _count_seed_documents_with_state(jurisdiction: str, manifest_document_ids: list[str], state_key: str) -> int:
    count = 0
    for document_id in manifest_document_ids:
        if _document_state(jurisdiction, document_id)[state_key]:
            count += 1
    return count


def _load_discovery_payload(jurisdiction: str, portal_id: str) -> dict | None:
    path = DISCOVERY_DIR / jurisdiction / f"{portal_id}.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def _latest_retrieval_attempt(jurisdiction: str, document_id: str) -> dict | None:
    path = RETRIEVAL_DIR / jurisdiction / f"{document_id}.json"
    if not path.exists():
        return None
    payload = json.loads(path.read_text(encoding="utf-8"))
    attempts = payload.get("attempts", [])
    if not isinstance(attempts, list) or not attempts:
        return None
    latest = attempts[-1]
    return latest if isinstance(latest, dict) else None


def _default_import_filename(document: dict) -> str:
    extension = ".html" if document["document_format"] == "html" else ".pdf"
    return f"{document['id']}{extension}"


def _recommended_import_command(jurisdiction: str, document: dict) -> str:
    content_type = "text/html" if document["document_format"] == "html" else "application/pdf"
    return (
        "cd services/pipeline && . .venv/bin/activate && PYTHONPATH=src "
        f"python -m observatory.cli import-local-document {jurisdiction} {document['id']} "
        f"/absolute/path/to/{_default_import_filename(document)} "
        f"--source-url={document['canonical_url']} --content-type={content_type}"
    )


def build_source_inventory() -> dict:
    manifests = load_all_source_manifests()
    generated_at = datetime.now(timezone.utc).isoformat()
    jurisdictions: list[dict] = []

    for manifest in manifests:
        document_ids = [document.id for document in manifest.seed_documents]
        jurisdiction_payload = {
            "jurisdiction": manifest.jurisdiction,
            "description": manifest.description,
            "portal_count": len(manifest.source_portals),
            "seed_document_count": len(manifest.seed_documents),
            "fetched_seed_document_count": _count_seed_documents_with_state(
                manifest.jurisdiction,
                document_ids,
                "fetched",
            ),
            "parsed_seed_document_count": _count_seed_documents_with_state(
                manifest.jurisdiction,
                document_ids,
                "parsed",
            ),
            "analyzed_seed_document_count": _count_seed_documents_with_state(
                manifest.jurisdiction,
                document_ids,
                "analyzed",
            ),
            "source_portals": [],
            "seed_documents": [],
        }

        for portal in manifest.source_portals:
            discovery_payload = _load_discovery_payload(manifest.jurisdiction, portal.id)
            jurisdiction_payload["source_portals"].append(
                {
                    "id": portal.id,
                    "name": portal.name,
                    "issuing_body": portal.issuing_body,
                    "issuer_type": portal.issuer_type,
                    "portal_kind": portal.portal_kind,
                    "retrieval_strategy": portal.retrieval_strategy,
                    "canonical_url": str(portal.canonical_url),
                    "priority": portal.priority,
                    "languages": portal.languages,
                    "coverage_notes": portal.coverage_notes,
                    "tags": portal.tags,
                    "discovery_target_count": len(portal.discovery_targets),
                    "discovery_candidate_count": (
                        discovery_payload.get("candidate_count", 0) if discovery_payload is not None else 0
                    ),
                    "discovery_output_path": (
                        repo_rel_posix(DISCOVERY_DIR / manifest.jurisdiction / f"{portal.id}.json", root=ROOT)
                        if discovery_payload is not None
                        else None
                    ),
                }
            )

        for document in manifest.seed_documents:
            state = _document_state(manifest.jurisdiction, document.id)
            latest_attempt = _latest_retrieval_attempt(manifest.jurisdiction, document.id) or {}
            document_payload = {
                "id": document.id,
                "title": document.title,
                "issuing_body": document.issuing_body,
                "document_type": document.document_type,
                "binding_strength": document.binding_strength,
                "source_tier": document.source_tier,
                "policy_domains": document.policy_domains,
                "lifecycle_stage": document.lifecycle_stage,
                "priority": document.priority,
                "languages": document.languages,
                "document_format": document.document_format,
                "canonical_url": str(document.canonical_url),
                "retrieval_urls": [str(url) for url in document.retrieval_urls],
                "source_portal_ids": document.source_portal_ids,
                "fetched": state["fetched"],
                "parsed": state["parsed"],
                "analyzed": state["analyzed"],
                "latest_retrieval_status": latest_attempt.get("status"),
                "latest_retrieval_error": latest_attempt.get("error"),
                "raw_path": (
                    repo_rel_posix(RAW_DIR / manifest.jurisdiction / document.id, root=ROOT)
                    if state["fetched"]
                    else None
                ),
                "parsed_path": (
                    repo_rel_posix(PARSED_DIR / manifest.jurisdiction / document.id / "normalized.json", root=ROOT)
                    if state["parsed"]
                    else None
                ),
                "analysis_path": (
                    repo_rel_posix(ANALYSIS_DIR / manifest.jurisdiction / document.id / "document_analysis.json", root=ROOT)
                    if state["analyzed"]
                    else None
                ),
            }
            if not state["fetched"]:
                document_payload["recommended_import_command"] = _recommended_import_command(
                    manifest.jurisdiction,
                    document_payload,
                )
            jurisdiction_payload["seed_documents"].append(document_payload)

        jurisdiction_payload["portal_kind_counts"] = _count_values(
            jurisdiction_payload["source_portals"],
            "portal_kind",
        )
        jurisdiction_payload["issuer_type_counts"] = _count_values(
            jurisdiction_payload["source_portals"],
            "issuer_type",
        )
        jurisdiction_payload["document_type_counts"] = _count_values(
            jurisdiction_payload["seed_documents"],
            "document_type",
        )
        jurisdiction_payload["binding_strength_counts"] = _count_values(
            jurisdiction_payload["seed_documents"],
            "binding_strength",
        )
        jurisdiction_payload["source_tier_counts"] = _count_values(
            jurisdiction_payload["seed_documents"],
            "source_tier",
        )
        jurisdiction_payload["lifecycle_stage_counts"] = _count_values(
            jurisdiction_payload["seed_documents"],
            "lifecycle_stage",
        )
        jurisdiction_payload["policy_domain_counts"] = _count_list_values(
            jurisdiction_payload["seed_documents"],
            "policy_domains",
        )

        jurisdictions.append(jurisdiction_payload)

    return {
        "generated_at": generated_at,
        "inventory_json_path": repo_rel_posix(INVENTORY_JSON_PATH, root=ROOT),
        "inventory_markdown_path": repo_rel_posix(INVENTORY_MARKDOWN_PATH, root=ROOT),
        "jurisdictions": jurisdictions,
    }


def _render_markdown(inventory: dict) -> str:
    lines: list[str] = []
    lines.append("# Source Inventory")
    lines.append("")
    lines.append(
        "This file is generated from `data/sources/` manifests plus cached discovery outputs and local corpus state."
    )
    lines.append("")
    lines.append(f"- Generated at: `{inventory['generated_at']}`")
    lines.append(f"- JSON mirror: `{inventory['inventory_json_path']}`")
    lines.append("")

    for jurisdiction in inventory["jurisdictions"]:
        lines.append(f"## {jurisdiction['jurisdiction']}")
        lines.append("")
        lines.append(jurisdiction["description"])
        lines.append("")
        lines.append(
            f"- Portals: `{jurisdiction['portal_count']}`"
            f" | Seed documents: `{jurisdiction['seed_document_count']}`"
            f" | Fetched: `{jurisdiction['fetched_seed_document_count']}`"
            f" | Parsed: `{jurisdiction['parsed_seed_document_count']}`"
            f" | Analyzed: `{jurisdiction['analyzed_seed_document_count']}`"
        )
        lines.append("")
        lines.append(f"- Portal kinds: {_format_counts(jurisdiction['portal_kind_counts'])}")
        lines.append(f"- Portal issuer types: {_format_counts(jurisdiction['issuer_type_counts'])}")
        lines.append(f"- Document types: {_format_counts(jurisdiction['document_type_counts'])}")
        lines.append(f"- Binding strength: {_format_counts(jurisdiction['binding_strength_counts'])}")
        lines.append(f"- Source tiers: {_format_counts(jurisdiction['source_tier_counts'])}")
        lines.append(f"- Lifecycle stages: {_format_counts(jurisdiction['lifecycle_stage_counts'])}")
        lines.append(f"- Policy domains: {_format_counts(jurisdiction['policy_domain_counts'])}")
        lines.append("")
        lines.append("### Portals")
        lines.append("")
        lines.append("| Portal | Kind | Issuer | Retrieval | Why it matters | Discovery candidates |")
        lines.append("| --- | --- | --- | --- | --- | ---: |")
        for portal in jurisdiction["source_portals"]:
            lines.append(
                f"| `{portal['id']}` | `{portal['portal_kind']}` | `{portal['issuer_type'] or 'n/a'}` | `{portal['retrieval_strategy']}` | "
                f"{portal['coverage_notes']} | {portal['discovery_candidate_count']} |"
            )
        lines.append("")
        lines.append("### Seed documents")
        lines.append("")
        lines.append("| Document | Type | Binding | Tier | Lifecycle | Portals | Fetched | Parsed | Analyzed | Latest retrieval |")
        lines.append("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |")
        for document in jurisdiction["seed_documents"]:
            lines.append(
                f"| `{document['id']}` | `{document['document_type']}` | `{document['binding_strength']}` | "
                f"`{document['source_tier'] or 'n/a'}` | `{document['lifecycle_stage'] or 'n/a'}` | "
                f"`{', '.join(document['source_portal_ids'])}` | "
                f"{'yes' if document['fetched'] else 'no'} | "
                f"{'yes' if document['parsed'] else 'no'} | "
                f"{'yes' if document['analyzed'] else 'no'} | "
                f"`{document['latest_retrieval_status'] or 'n/a'}` |"
            )
        lines.append("")

    return "\n".join(lines) + "\n"


def _render_blocked_playbook(inventory: dict) -> str:
    lines: list[str] = []
    lines.append("# Blocked Source Playbook")
    lines.append("")
    lines.append("This file is generated from the source inventory.")
    lines.append("")
    lines.append(
        "It lists official seed documents that are still missing from the local corpus and gives the exact import command shape to recover them without losing provenance."
    )
    lines.append("")
    lines.append(f"- Generated at: `{inventory['generated_at']}`")
    lines.append(f"- Source inventory: `{inventory['inventory_markdown_path']}`")
    lines.append("")

    blocked_count = 0
    for jurisdiction in inventory["jurisdictions"]:
        blocked_documents = [document for document in jurisdiction["seed_documents"] if not document["fetched"]]
        if not blocked_documents:
            continue
        blocked_count += len(blocked_documents)
        lines.append(f"## {jurisdiction['jurisdiction']}")
        lines.append("")
        for document in blocked_documents:
            lines.append(f"### {document['id']}")
            lines.append("")
            lines.append(f"- Title: {document['title']}")
            lines.append(f"- Canonical URL: {document['canonical_url']}")
            lines.append(f"- Format: `{document['document_format']}`")
            lines.append(f"- Latest retrieval status: `{document['latest_retrieval_status'] or 'n/a'}`")
            if document["latest_retrieval_error"]:
                lines.append(f"- Latest retrieval error: `{document['latest_retrieval_error']}`")
            lines.append("- Recovery command:")
            lines.append("")
            lines.append("```bash")
            lines.append(document["recommended_import_command"])
            lines.append("```")
            lines.append("")
            lines.append("After import:")
            lines.append("")
            lines.append("```bash")
            lines.append(
                "cd services/pipeline && . .venv/bin/activate && PYTHONPATH=src "
                f"python -m observatory.cli parse-raw-documents {jurisdiction['jurisdiction']}"
            )
            lines.append(
                "cd services/pipeline && . .venv/bin/activate && PYTHONPATH=src "
                f"python -m observatory.cli analyze-documents {jurisdiction['jurisdiction']} {document['id']}"
            )
            lines.append(
                "cd services/pipeline && . .venv/bin/activate && PYTHONPATH=src "
                "python -m observatory.cli report-source-coverage"
            )
            lines.append("```")
            lines.append("")

    if blocked_count == 0:
        lines.append("All seed documents are present in the local corpus.")
        lines.append("")

    return "\n".join(lines) + "\n"


def write_source_inventory(*, write_blocked_playbook: bool = True) -> dict:
    inventory = build_source_inventory()
    TRACKING_DIR.mkdir(parents=True, exist_ok=True)
    INVENTORY_MARKDOWN_PATH.parent.mkdir(parents=True, exist_ok=True)
    INVENTORY_JSON_PATH.write_text(
        json.dumps(inventory, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    INVENTORY_MARKDOWN_PATH.write_text(_render_markdown(inventory), encoding="utf-8", newline="\n")
    if write_blocked_playbook:
        BLOCKED_PLAYBOOK_PATH.parent.mkdir(parents=True, exist_ok=True)
        BLOCKED_PLAYBOOK_PATH.write_text(_render_blocked_playbook(inventory), encoding="utf-8", newline="\n")
    return inventory
