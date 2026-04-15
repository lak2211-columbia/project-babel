from __future__ import annotations

import json
from pathlib import Path

import observatory.metadata_sync as metadata_sync
from observatory.source_registry import JurisdictionManifest


def test_sync_source_metadata_overwrites_stale_manifest_dates(tmp_path: Path, monkeypatch) -> None:
    raw_dir = tmp_path / "raw"
    parsed_dir = tmp_path / "parsed"
    analysis_dir = tmp_path / "analysis"

    raw_doc_dir = raw_dir / "china" / "doc"
    raw_doc_dir.mkdir(parents=True)
    (raw_doc_dir / "metadata.json").write_text(
        json.dumps(
            {
                "jurisdiction": "china",
                "document_id": "doc",
                "title": "Doc",
                "issuing_body": "Agency",
                "canonical_url": "https://example.com/doc",
                "source_url": "https://example.com/doc",
                "languages": ["zh"],
                "language": "zh",
                "publication_date": "2026-04-01",
                "seed_publication_date": "2026-04-01",
                "effective_date": None,
                "seed_effective_date": None,
                "source_portal_ids": ["portal"],
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    parsed_doc_dir = parsed_dir / "china" / "doc"
    parsed_doc_dir.mkdir(parents=True)
    (parsed_doc_dir / "normalized.json").write_text(
        json.dumps({"language": "zh"}, ensure_ascii=False),
        encoding="utf-8",
    )

    analysis_doc_dir = analysis_dir / "china" / "doc"
    analysis_doc_dir.mkdir(parents=True)
    (analysis_doc_dir / "document_analysis.json").write_text(
        json.dumps({"language": "zh"}, ensure_ascii=False),
        encoding="utf-8",
    )

    manifest = JurisdictionManifest.model_validate(
        {
            "manifest_version": "2026-04-14",
            "jurisdiction": "china",
            "description": "Test fixture",
            "source_portals": [
                {
                    "id": "portal",
                    "name": "Portal",
                    "issuing_body": "Agency",
                    "canonical_url": "https://example.com",
                    "portal_kind": "portal",
                    "retrieval_strategy": "html",
                    "languages": ["zh"],
                    "priority": "high",
                    "coverage_notes": "Fixture",
                }
            ],
            "seed_documents": [
                {
                    "id": "doc",
                    "title": "Doc",
                    "issuing_body": "Agency",
                    "canonical_url": "https://example.com/doc",
                    "document_type": "regulatory_guidance",
                    "binding_strength": "regulatory_guidance",
                    "publication_date": "2026-04-03",
                    "languages": ["zh"],
                    "document_format": "html",
                    "source_portal_ids": ["portal"],
                    "priority": "high",
                    "relevance_notes": "Fixture",
                }
            ],
        }
    )

    monkeypatch.setattr(metadata_sync, "RAW_DATA_DIR", raw_dir)
    monkeypatch.setattr(metadata_sync, "PARSED_DATA_DIR", parsed_dir)
    monkeypatch.setattr(metadata_sync, "ANALYSIS_DIR", analysis_dir)
    monkeypatch.setattr(metadata_sync, "load_all_source_manifests", lambda: [manifest])

    results = metadata_sync.sync_source_metadata()

    assert len(results) == 1
    assert results[0]["jurisdiction"] == "china"
    assert results[0]["document_id"] == "doc"
    assert results[0]["status"] == "updated"
    assert str(results[0]["metadata_path"]).endswith("raw/china/doc/metadata.json")

    synced_metadata = json.loads((raw_doc_dir / "metadata.json").read_text(encoding="utf-8"))
    assert synced_metadata["publication_date"] == "2026-04-03"
    assert synced_metadata["seed_publication_date"] == "2026-04-03"
