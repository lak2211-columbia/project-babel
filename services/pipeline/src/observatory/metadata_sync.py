from __future__ import annotations

import json
from pathlib import Path

from observatory.analysis import ANALYSIS_DIR
from observatory.parser import PARSED_DATA_DIR
from observatory.source_registry import ROOT, load_all_source_manifests
from observatory.url_safety import repo_rel_posix


RAW_DATA_DIR = ROOT / "data" / "raw"


def _display_path(path: Path) -> str:
    return repo_rel_posix(path, root=ROOT)


def _manifest_document_index() -> dict[tuple[str, str], dict]:
    index: dict[tuple[str, str], dict] = {}
    for manifest in load_all_source_manifests():
        for document in manifest.seed_documents:
            index[(manifest.jurisdiction, document.id)] = {
                "title": document.title,
                "issuing_body": document.issuing_body,
                "canonical_url": str(document.canonical_url),
                "source_url": str(document.canonical_url),
                "source_tier": document.source_tier,
                "corpus_role": document.corpus_role,
                "subnational_unit": document.subnational_unit,
                "supersedes_id": document.supersedes_id,
                "lifecycle_stage": document.lifecycle_stage,
                "languages": list(document.languages),
                "language": document.languages[0],
                "publication_date": document.publication_date,
                "effective_date": document.effective_date,
                "source_portal_ids": list(document.source_portal_ids),
            }
    return index


def _write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")


def sync_source_metadata() -> list[dict[str, str]]:
    document_index = _manifest_document_index()
    results: list[dict[str, str]] = []

    for metadata_path in sorted(RAW_DATA_DIR.glob("*/*/metadata.json")):
        jurisdiction = metadata_path.parts[-3]
        document_id = metadata_path.parts[-2]
        manifest_document = document_index.get((jurisdiction, document_id))
        if manifest_document is None:
            continue

        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        changed = False

        for key, value in manifest_document.items():
            if value is None:
                continue
            if key in {"publication_date", "effective_date"}:
                seed_key = f"seed_{key}"
                source_key = f"source_{key}"
                if metadata.get(seed_key) != value:
                    metadata[seed_key] = value
                    changed = True
                preferred_value = metadata.get(source_key) if metadata.get(source_key) not in (None, "") else value
                if metadata.get(key) != preferred_value:
                    metadata[key] = preferred_value
                    changed = True
                continue
            if metadata.get(key) != value:
                metadata[key] = value
                changed = True

        if changed:
            _write_json(metadata_path, metadata)

        language = metadata.get("language")
        if not isinstance(language, str) or not language:
            language = manifest_document["language"]

        parsed_path = PARSED_DATA_DIR / jurisdiction / document_id / "normalized.json"
        if parsed_path.exists():
            parsed_payload = json.loads(parsed_path.read_text(encoding="utf-8"))
            if not parsed_payload.get("language"):
                parsed_payload["language"] = language
                _write_json(parsed_path, parsed_payload)
                changed = True

        analysis_path = ANALYSIS_DIR / jurisdiction / document_id / "document_analysis.json"
        if analysis_path.exists():
            analysis_payload = json.loads(analysis_path.read_text(encoding="utf-8"))
            if analysis_payload.get("language") != language:
                analysis_payload["language"] = language
                _write_json(analysis_path, analysis_payload)
                changed = True

        results.append(
            {
                "jurisdiction": jurisdiction,
                "document_id": document_id,
                "status": "updated" if changed else "unchanged",
                "metadata_path": _display_path(metadata_path),
            }
        )

    return results
