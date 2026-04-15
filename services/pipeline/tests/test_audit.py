from pathlib import Path

import observatory.audit as audit_module
from observatory.source_registry import JurisdictionManifest


def test_build_source_quality_audit_flags_tool_pages_and_keeps_law(tmp_path: Path, monkeypatch) -> None:
    manifest = JurisdictionManifest.model_validate(
        {
            "manifest_version": "2026-04-14",
            "jurisdiction": "european_union",
            "description": "Test fixture",
            "source_portals": [
                {
                    "id": "portal",
                    "name": "Portal",
                    "issuing_body": "Agency",
                    "issuer_type": "executive",
                    "canonical_url": "https://example.com",
                    "portal_kind": "portal",
                    "retrieval_strategy": "html",
                    "languages": ["en"],
                    "priority": "high",
                    "coverage_notes": "Fixture",
                    "tags": ["implementation"],
                }
            ],
            "seed_documents": [
                {
                    "id": "law_doc",
                    "title": "AI Act Regulation",
                    "issuing_body": "Agency",
                    "canonical_url": "https://example.com/law",
                    "document_type": "legislation",
                    "binding_strength": "binding_law",
                    "source_tier": "statutory_rule",
                    "policy_domains": ["frontier_gpai"],
                    "lifecycle_stage": "active",
                    "languages": ["en"],
                    "document_format": "html",
                    "source_portal_ids": ["portal"],
                    "priority": "high",
                    "relevance_notes": "Fixture",
                },
                {
                    "id": "tool_doc",
                    "title": "AI Act Explorer",
                    "issuing_body": "Agency",
                    "canonical_url": "https://example.com/explorer",
                    "document_type": "regulatory_guidance",
                    "binding_strength": "regulatory_guidance",
                    "source_tier": "implementation_resource",
                    "policy_domains": ["frontier_gpai"],
                    "lifecycle_stage": "active",
                    "languages": ["en"],
                    "document_format": "html",
                    "source_portal_ids": ["portal"],
                    "priority": "medium",
                    "relevance_notes": "Fixture",
                },
            ],
        }
    )

    monkeypatch.setattr(audit_module, "load_all_source_manifests", lambda: [manifest])
    monkeypatch.setattr(audit_module, "RAW_DIR", tmp_path / "raw")
    monkeypatch.setattr(audit_module, "PARSED_DIR", tmp_path / "parsed")
    monkeypatch.setattr(audit_module, "ANALYSIS_DIR", tmp_path / "analysis")

    (tmp_path / "parsed" / "european_union" / "law_doc").mkdir(parents=True, exist_ok=True)
    (tmp_path / "parsed" / "european_union" / "tool_doc").mkdir(parents=True, exist_ok=True)
    (tmp_path / "analysis" / "european_union" / "tool_doc").mkdir(parents=True, exist_ok=True)

    (tmp_path / "parsed" / "european_union" / "law_doc" / "normalized.json").write_text(
        '{"plain_text":"Article 1 "}',
        encoding="utf-8",
    )
    (tmp_path / "parsed" / "european_union" / "tool_doc" / "normalized.json").write_text(
        '{"plain_text":"Find AI Act obligations"}',
        encoding="utf-8",
    )
    (tmp_path / "analysis" / "european_union" / "tool_doc" / "document_analysis.json").write_text(
        '{"policy_extraction":{"implementation_notes":"This is not a policy document itself. It is a service desk directory."}}',
        encoding="utf-8",
    )

    audit = audit_module.build_source_quality_audit()
    docs = {item["document_id"]: item for item in audit["jurisdictions"][0]["documents"]}

    assert docs["law_doc"]["action"] == "keep_core"
    assert docs["tool_doc"]["action"] == "remove_from_seed"


def test_build_source_quality_audit_keeps_foundational_strategy_and_flags_link_repairs(
    tmp_path: Path,
    monkeypatch,
) -> None:
    manifest = JurisdictionManifest.model_validate(
        {
            "manifest_version": "2026-04-15",
            "jurisdiction": "china",
            "description": "Test fixture",
            "source_portals": [
                {
                    "id": "portal",
                    "name": "Portal",
                    "issuing_body": "Agency",
                    "issuer_type": "executive",
                    "canonical_url": "https://example.com",
                    "portal_kind": "portal",
                    "retrieval_strategy": "html",
                    "languages": ["en"],
                    "priority": "high",
                    "coverage_notes": "Fixture",
                    "tags": ["governance"],
                }
            ],
            "seed_documents": [
                {
                    "id": "principles_doc",
                    "title": "New Generation AI Governance Principles",
                    "issuing_body": "Agency",
                    "canonical_url": "https://example.com/principles",
                    "document_type": "strategy_paper",
                    "binding_strength": "strategy_statement",
                    "source_tier": "policy_strategy",
                    "policy_domains": ["frontier_gpai"],
                    "lifecycle_stage": "active",
                    "publication_date": "2019-06-17",
                    "languages": ["en"],
                    "document_format": "html",
                    "source_portal_ids": ["portal"],
                    "priority": "high",
                    "relevance_notes": "Foundational national governance principles for responsible AI.",
                    "tags": ["governance_principles", "responsible_ai"],
                },
                {
                    "id": "guideline_doc",
                    "title": "Guidelines Page",
                    "issuing_body": "Agency",
                    "canonical_url": "https://example.com/guidelines",
                    "document_type": "regulatory_guidance",
                    "binding_strength": "regulatory_guidance",
                    "source_tier": "regulatory_guidance",
                    "policy_domains": ["frontier_gpai"],
                    "lifecycle_stage": "active",
                    "publication_date": "2025-02-06",
                    "languages": ["en"],
                    "document_format": "html",
                    "source_portal_ids": ["portal"],
                    "priority": "high",
                    "relevance_notes": "Operational guidance.",
                },
            ],
        }
    )

    monkeypatch.setattr(audit_module, "load_all_source_manifests", lambda: [manifest])
    monkeypatch.setattr(audit_module, "RAW_DIR", tmp_path / "raw")
    monkeypatch.setattr(audit_module, "PARSED_DIR", tmp_path / "parsed")
    monkeypatch.setattr(audit_module, "ANALYSIS_DIR", tmp_path / "analysis")

    (tmp_path / "parsed" / "china" / "principles_doc").mkdir(parents=True, exist_ok=True)
    (tmp_path / "parsed" / "china" / "guideline_doc").mkdir(parents=True, exist_ok=True)
    (tmp_path / "raw" / "china" / "guideline_doc").mkdir(parents=True, exist_ok=True)

    (tmp_path / "parsed" / "china" / "principles_doc" / "normalized.json").write_text(
        '{"plain_text":"Responsible AI principles for governance fairness safety and accountability."}',
        encoding="utf-8",
    )
    (tmp_path / "parsed" / "china" / "guideline_doc" / "normalized.json").write_text(
        '{"plain_text":"Download the guidelines PDF here."}',
        encoding="utf-8",
    )
    (tmp_path / "raw" / "china" / "guideline_doc" / "metadata.json").write_text(
        '{"linked_artifact_url":"https://example.com/guidelines.pdf","publication_date":"2025-02-06"}',
        encoding="utf-8",
    )

    audit = audit_module.build_source_quality_audit()
    docs = {item["document_id"]: item for item in audit["jurisdictions"][0]["documents"]}

    assert docs["principles_doc"]["action"] == "keep_core"
    assert docs["guideline_doc"]["source_link_action"] == "retarget_canonical_url"
    assert docs["guideline_doc"]["source_link_status"] == "hub_page_with_linked_artifact"


def test_build_source_quality_audit_treats_linked_artifact_as_direct_when_canonical_matches(
    tmp_path: Path,
    monkeypatch,
) -> None:
    manifest = JurisdictionManifest.model_validate(
        {
            "manifest_version": "2026-04-15",
            "jurisdiction": "china",
            "description": "Test fixture",
            "source_portals": [
                {
                    "id": "portal",
                    "name": "Portal",
                    "issuing_body": "Agency",
                    "issuer_type": "executive",
                    "canonical_url": "https://example.com",
                    "portal_kind": "portal",
                    "retrieval_strategy": "html",
                    "languages": ["en"],
                    "priority": "high",
                    "coverage_notes": "Fixture",
                    "tags": ["governance"],
                }
            ],
            "seed_documents": [
                {
                    "id": "guideline_doc",
                    "title": "Guidelines PDF",
                    "issuing_body": "Agency",
                    "canonical_url": "https://example.com/guidelines.pdf",
                    "document_type": "regulatory_guidance",
                    "binding_strength": "regulatory_guidance",
                    "source_tier": "regulatory_guidance",
                    "policy_domains": ["frontier_gpai"],
                    "lifecycle_stage": "active",
                    "publication_date": "2025-02-06",
                    "languages": ["en"],
                    "document_format": "pdf",
                    "source_portal_ids": ["portal"],
                    "priority": "high",
                    "relevance_notes": "Operational guidance.",
                }
            ],
        }
    )

    monkeypatch.setattr(audit_module, "load_all_source_manifests", lambda: [manifest])
    monkeypatch.setattr(audit_module, "RAW_DIR", tmp_path / "raw")
    monkeypatch.setattr(audit_module, "PARSED_DIR", tmp_path / "parsed")
    monkeypatch.setattr(audit_module, "ANALYSIS_DIR", tmp_path / "analysis")

    (tmp_path / "parsed" / "china" / "guideline_doc").mkdir(parents=True, exist_ok=True)
    (tmp_path / "raw" / "china" / "guideline_doc").mkdir(parents=True, exist_ok=True)

    (tmp_path / "parsed" / "china" / "guideline_doc" / "normalized.json").write_text(
        '{"plain_text":"Full guideline text with substantive requirements and controls."}',
        encoding="utf-8",
    )
    (tmp_path / "raw" / "china" / "guideline_doc" / "metadata.json").write_text(
        '{"linked_artifact_url":"https://example.com/guidelines.pdf","publication_date":"2025-02-06"}',
        encoding="utf-8",
    )

    audit = audit_module.build_source_quality_audit()
    docs = {item["document_id"]: item for item in audit["jurisdictions"][0]["documents"]}

    assert docs["guideline_doc"]["source_link_status"] == "direct_document"
    assert docs["guideline_doc"]["source_link_action"] is None


def test_build_source_quality_audit_flags_manual_import_html_standin(
    tmp_path: Path,
    monkeypatch,
) -> None:
    manifest = JurisdictionManifest.model_validate(
        {
            "manifest_version": "2026-04-15",
            "jurisdiction": "japan",
            "description": "Test fixture",
            "source_portals": [
                {
                    "id": "portal",
                    "name": "Portal",
                    "issuing_body": "Agency",
                    "issuer_type": "executive",
                    "canonical_url": "https://example.com",
                    "portal_kind": "portal",
                    "retrieval_strategy": "html",
                    "languages": ["ja"],
                    "priority": "high",
                    "coverage_notes": "Fixture",
                    "tags": ["guidance"],
                }
            ],
            "seed_documents": [
                {
                    "id": "standin_doc",
                    "title": "AI guidance checklist",
                    "issuing_body": "Agency",
                    "canonical_url": "https://example.com/guidance",
                    "document_type": "regulatory_guidance",
                    "binding_strength": "regulatory_guidance",
                    "source_tier": "regulatory_guidance",
                    "policy_domains": ["frontier_gpai"],
                    "lifecycle_stage": "active",
                    "publication_date": "2025-02-18",
                    "languages": ["ja"],
                    "document_format": "html",
                    "source_portal_ids": ["portal"],
                    "priority": "high",
                    "relevance_notes": "Fixture",
                }
            ],
        }
    )

    monkeypatch.setattr(audit_module, "load_all_source_manifests", lambda: [manifest])
    monkeypatch.setattr(audit_module, "RAW_DIR", tmp_path / "raw")
    monkeypatch.setattr(audit_module, "PARSED_DIR", tmp_path / "parsed")
    monkeypatch.setattr(audit_module, "ANALYSIS_DIR", tmp_path / "analysis")

    (tmp_path / "parsed" / "japan" / "standin_doc").mkdir(parents=True, exist_ok=True)
    (tmp_path / "raw" / "japan" / "standin_doc").mkdir(parents=True, exist_ok=True)

    (tmp_path / "parsed" / "japan" / "standin_doc" / "normalized.json").write_text(
        '{"plain_text":"Short synthetic summary of the guidance."}',
        encoding="utf-8",
    )
    (tmp_path / "raw" / "japan" / "standin_doc" / "metadata.json").write_text(
        '{"transport":"manual_import","content_type":"text/html","publication_date":"2025-02-18"}',
        encoding="utf-8",
    )

    audit = audit_module.build_source_quality_audit()
    docs = {item["document_id"]: item for item in audit["jurisdictions"][0]["documents"]}

    assert docs["standin_doc"]["source_link_status"] == "manual_import_html_standin"
    assert docs["standin_doc"]["source_link_action"] == "replace_with_direct_document"
