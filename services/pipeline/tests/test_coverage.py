import json
from pathlib import Path

import observatory.coverage as coverage_module
from observatory.source_registry import JurisdictionManifest


def test_write_source_inventory(tmp_path: Path, monkeypatch) -> None:
    manifest = JurisdictionManifest.model_validate(
        {
            "manifest_version": "2026-04-14",
            "jurisdiction": "united_states",
            "description": "Test fixture",
            "source_portals": [
                {
                    "id": "portal",
                    "name": "Portal",
                    "issuing_body": "Agency",
                    "canonical_url": "https://example.com/portal",
                    "portal_kind": "portal",
                    "retrieval_strategy": "html",
                    "languages": ["en"],
                    "priority": "high",
                    "coverage_notes": "Fixture coverage note",
                    "discovery_targets": [
                        {
                            "url": "https://example.com/portal",
                            "kind": "html_links",
                            "link_selector": "a[href]",
                        }
                    ],
                }
            ],
            "seed_documents": [
                {
                    "id": "seed",
                    "title": "Seed",
                    "issuing_body": "Agency",
                    "canonical_url": "https://example.com/seed",
                    "retrieval_urls": ["https://example.com/seed-wrapper"],
                    "document_type": "strategy_paper",
                    "binding_strength": "strategy_statement",
                    "languages": ["en"],
                    "document_format": "html",
                    "source_portal_ids": ["portal"],
                    "priority": "high",
                    "relevance_notes": "Fixture",
                },
                {
                    "id": "blocked_seed",
                    "title": "Blocked Seed",
                    "issuing_body": "Agency",
                    "canonical_url": "https://example.com/blocked.pdf",
                    "document_type": "regulatory_guidance",
                    "binding_strength": "regulatory_guidance",
                    "languages": ["en"],
                    "document_format": "pdf",
                    "source_portal_ids": ["portal"],
                    "priority": "medium",
                    "relevance_notes": "Blocked fixture",
                }
            ],
        }
    )

    root = tmp_path
    monkeypatch.setattr(coverage_module, "ROOT", root)
    monkeypatch.setattr(coverage_module, "TRACKING_DIR", root / "data" / "source_tracking")
    monkeypatch.setattr(coverage_module, "INVENTORY_JSON_PATH", root / "data" / "source_tracking" / "source_inventory.json")
    monkeypatch.setattr(coverage_module, "INVENTORY_MARKDOWN_PATH", root / "docs" / "operations" / "source-inventory.md")
    monkeypatch.setattr(coverage_module, "BLOCKED_PLAYBOOK_PATH", root / "docs" / "operations" / "blocked-source-playbook.md")
    monkeypatch.setattr(coverage_module, "RAW_DIR", root / "data" / "raw")
    monkeypatch.setattr(coverage_module, "PARSED_DIR", root / "data" / "parsed")
    monkeypatch.setattr(coverage_module, "ANALYSIS_DIR", root / "data" / "analysis")
    monkeypatch.setattr(coverage_module, "RETRIEVAL_DIR", root / "data" / "retrieval")
    monkeypatch.setattr(coverage_module, "DISCOVERY_DIR", root / "data" / "discovery")
    monkeypatch.setattr(coverage_module, "load_all_source_manifests", lambda: [manifest])

    (root / "data" / "raw" / "united_states" / "seed").mkdir(parents=True, exist_ok=True)
    (root / "data" / "raw" / "united_states" / "seed" / "metadata.json").write_text("{}", encoding="utf-8")
    (root / "data" / "parsed" / "united_states" / "seed").mkdir(parents=True, exist_ok=True)
    (root / "data" / "parsed" / "united_states" / "seed" / "normalized.json").write_text("{}", encoding="utf-8")
    (root / "data" / "analysis" / "united_states" / "seed").mkdir(parents=True, exist_ok=True)
    (root / "data" / "analysis" / "united_states" / "seed" / "document_analysis.json").write_text("{}", encoding="utf-8")
    (root / "data" / "discovery" / "united_states").mkdir(parents=True, exist_ok=True)
    (root / "data" / "discovery" / "united_states" / "portal.json").write_text(
        json.dumps({"candidate_count": 3, "candidates": [{"url": "https://example.com/doc"}]}),
        encoding="utf-8",
    )
    (root / "data" / "retrieval" / "united_states").mkdir(parents=True, exist_ok=True)
    (root / "data" / "retrieval" / "united_states" / "seed.json").write_text(
        json.dumps({"attempts": [{"status": "downloaded_new"}]}),
        encoding="utf-8",
    )
    (root / "data" / "retrieval" / "united_states" / "blocked_seed.json").write_text(
        json.dumps({"attempts": [{"status": "timeout", "error": "timed out"}]}),
        encoding="utf-8",
    )

    inventory = coverage_module.write_source_inventory()

    assert inventory["jurisdictions"][0]["fetched_seed_document_count"] == 1
    assert inventory["jurisdictions"][0]["parsed_seed_document_count"] == 1
    assert inventory["jurisdictions"][0]["analyzed_seed_document_count"] == 1
    assert inventory["jurisdictions"][0]["source_portals"][0]["discovery_candidate_count"] == 3
    assert inventory["jurisdictions"][0]["seed_documents"][0]["latest_retrieval_status"] == "downloaded_new"
    assert inventory["jurisdictions"][0]["seed_documents"][0]["retrieval_urls"] == ["https://example.com/seed-wrapper"]
    assert inventory["jurisdictions"][0]["seed_documents"][1]["latest_retrieval_status"] == "timeout"
    assert "import-local-document united_states blocked_seed" in inventory["jurisdictions"][0]["seed_documents"][1][
        "recommended_import_command"
    ]

    markdown = (root / "docs" / "operations" / "source-inventory.md").read_text(encoding="utf-8")
    assert "## united_states" in markdown
    assert "Fixture coverage note" in markdown
    assert "`seed`" in markdown
    assert "`downloaded_new`" in markdown

    playbook = (root / "docs" / "operations" / "blocked-source-playbook.md").read_text(encoding="utf-8")
    assert "### blocked_seed" in playbook
    assert "Latest retrieval status: `timeout`" in playbook
    assert "import-local-document united_states blocked_seed" in playbook
