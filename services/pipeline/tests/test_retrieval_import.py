from pathlib import Path

import observatory.retrieval as retrieval_module
from observatory.source_registry import JurisdictionManifest


def test_import_local_seed_document(tmp_path: Path, monkeypatch) -> None:
    manifest = JurisdictionManifest.model_validate(
        {
            "manifest_version": "2026-04-14",
            "jurisdiction": "japan",
            "description": "Test fixture",
            "source_portals": [
                {
                    "id": "portal",
                    "name": "Portal",
                    "issuing_body": "Agency",
                    "canonical_url": "https://example.com/portal",
                    "portal_kind": "portal",
                    "retrieval_strategy": "manual",
                    "languages": ["en"],
                    "priority": "high",
                    "coverage_notes": "Fixture",
                }
            ],
            "seed_documents": [
                {
                    "id": "seed",
                    "title": "Seed",
                    "issuing_body": "Agency",
                    "canonical_url": "https://example.com/seed.pdf",
                    "document_type": "standards_guideline",
                    "binding_strength": "standards_guideline",
                    "languages": ["en"],
                    "document_format": "pdf",
                    "source_portal_ids": ["portal"],
                    "priority": "high",
                    "relevance_notes": "Fixture",
                }
            ],
        }
    )

    monkeypatch.setattr(retrieval_module, "ROOT", tmp_path)
    monkeypatch.setattr(retrieval_module, "RAW_DATA_DIR", tmp_path / "data" / "raw")
    monkeypatch.setattr(retrieval_module, "RETRIEVAL_DATA_DIR", tmp_path / "data" / "retrieval")
    monkeypatch.setattr(retrieval_module, "load_all_source_manifests", lambda: [manifest])

    local_file = tmp_path / "fixture.pdf"
    local_file.write_bytes(b"%PDF-1.4 fixture")

    result = retrieval_module.import_local_seed_document(
        jurisdiction="japan",
        document_id="seed",
        file_path=local_file,
        source_url="https://example.com/seed.pdf",
    )

    assert result["status"] == "imported_local_new"
    metadata_path = tmp_path / "data" / "raw" / "japan" / "seed" / "metadata.json"
    assert metadata_path.exists()
    assert "manual_import" in metadata_path.read_text(encoding="utf-8")
