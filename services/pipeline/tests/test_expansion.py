import json
from pathlib import Path

import observatory.expansion as expansion_module
import observatory.source_ops as source_ops_module
from observatory.source_registry import JurisdictionManifest


def test_write_source_expansion_plan(tmp_path: Path, monkeypatch) -> None:
    manifest = JurisdictionManifest.model_validate(
        {
            "manifest_version": "2.0",
            "jurisdiction": "european_union",
            "description": "Test fixture",
            "source_portals": [
                {
                    "id": "portal",
                    "name": "Portal",
                    "issuing_body": "Agency",
                    "issuer_type": "executive",
                    "canonical_url": "https://example.com/portal",
                    "portal_kind": "portal",
                    "retrieval_strategy": "html",
                    "languages": ["en"],
                    "priority": "high",
                    "coverage_notes": "Fixture",
                    "tags": ["gpai", "standards"],
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
                    "id": "existing_seed",
                    "title": "Existing Guidance",
                    "issuing_body": "Agency",
                    "canonical_url": "https://example.com/existing-guidance",
                    "document_type": "regulatory_guidance",
                    "binding_strength": "regulatory_guidance",
                    "source_tier": "regulatory_guidance",
                    "policy_domains": ["frontier_gpai"],
                    "lifecycle_stage": "active",
                    "languages": ["en"],
                    "document_format": "html",
                    "source_portal_ids": ["portal"],
                    "priority": "high",
                    "relevance_notes": "Fixture",
                }
            ],
        }
    )

    monkeypatch.setattr(
        source_ops_module,
        "build_source_inventory",
        lambda: {
            "jurisdictions": [
                {
                    "jurisdiction": "european_union",
                    "description": "Test fixture",
                    "portal_count": 1,
                    "seed_document_count": 1,
                    "issuer_type_counts": {"executive": 1},
                    "document_type_counts": {"regulatory_guidance": 1},
                    "source_tier_counts": {"regulatory_guidance": 1},
                    "policy_domain_counts": {"frontier_gpai": 1},
                    "source_portals": [
                        {
                            "id": "portal",
                            "name": "Portal",
                            "issuer_type": "executive",
                            "tags": ["gpai", "standards"],
                            "discovery_candidate_count": 3,
                        }
                    ],
                    "seed_documents": [
                        {
                            "id": "existing_seed",
                            "title": "Existing Guidance",
                            "canonical_url": "https://example.com/existing-guidance",
                            "source_portal_ids": ["portal"],
                        }
                    ],
                }
            ]
        },
    )
    monkeypatch.setattr(source_ops_module, "load_all_source_manifests", lambda: [manifest])
    monkeypatch.setattr(source_ops_module, "DISCOVERY_DIR", tmp_path / "discovery")
    monkeypatch.setattr(expansion_module, "ROOT", tmp_path)
    monkeypatch.setattr(
        expansion_module,
        "EXPANSION_PLAN_JSON_PATH",
        tmp_path / "tracking" / "source_expansion_plan.json",
    )
    monkeypatch.setattr(
        expansion_module,
        "EXPANSION_PLAN_MARKDOWN_PATH",
        tmp_path / "source-expansion-plan.md",
    )

    discovery_path = tmp_path / "discovery" / "european_union" / "portal.json"
    discovery_path.parent.mkdir(parents=True, exist_ok=True)
    discovery_path.write_text(
        json.dumps(
            {
                "candidates": [
                    {
                        "title": "Existing Guidance",
                        "url": "https://example.com/existing-guidance",
                        "discovered_from": "https://example.com/portal",
                    },
                    {
                        "title": "AI Act Code of Practice",
                        "url": "https://example.com/code-of-practice.pdf",
                        "discovered_from": "https://example.com/portal",
                    },
                    {
                        "title": "Quarterly AI Meeting",
                        "url": "https://example.com/news/quarterly-ai-meeting",
                        "discovered_from": "https://example.com/portal",
                    },
                ]
            }
        ),
        encoding="utf-8",
    )

    plan = expansion_module.write_source_expansion_plan()

    assert plan["global_priority_families"][0]["representative_title"] == "AI Act Code of Practice"
    assert plan["global_priority_families"][0]["best_recommendation"] == "promote_now"
    assert plan["global_priority_families"][0]["proposed_source_tier"] == "technical_standard"
    assert plan["jurisdictions"][0]["portal_operations"][0]["suggested_action"] == "inspect_families"

    markdown = (tmp_path / "source-expansion-plan.md").read_text(encoding="utf-8")
    assert "## Highest-Value Next Families" in markdown
    assert "AI Act Code of Practice" in markdown

    json_payload = json.loads((tmp_path / "tracking" / "source_expansion_plan.json").read_text(encoding="utf-8"))
    assert json_payload["jurisdictions"][0]["priority_families"][0]["representative_title"] == "AI Act Code of Practice"
    assert "\\" not in plan["plan_json_path"]
