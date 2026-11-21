import json
from pathlib import Path
from urllib.error import URLError

import observatory.analysis as analysis_module
from observatory.persistence import build_analysis_persistence_bundle
from observatory.source_registry import JurisdictionManifest
from observatory.taxonomy import load_taxonomy


def _fake_manifest(jurisdiction: str, document_ids: list[str]) -> JurisdictionManifest:
    return JurisdictionManifest.model_validate(
        {
            "manifest_version": "2.0",
            "jurisdiction": jurisdiction,
            "description": "Test fixture",
            "source_portals": [
                {
                    "id": "portal",
                    "name": "Portal",
                    "issuing_body": "Agency",
                    "canonical_url": "https://example.com",
                    "portal_kind": "portal",
                    "retrieval_strategy": "html",
                    "languages": ["en"],
                    "priority": "high",
                    "coverage_notes": "Fixture",
                }
            ],
            "seed_documents": [
                {
                    "id": doc_id,
                    "title": f"Fixture {doc_id}",
                    "issuing_body": "Agency",
                    "canonical_url": f"https://example.com/{doc_id}",
                    "document_type": "regulatory_guidance",
                    "binding_strength": "regulatory_guidance",
                    "publication_date": "2025-02-01",
                    "languages": ["en"],
                    "document_format": "html",
                    "source_portal_ids": ["portal"],
                    "priority": "high",
                    "relevance_notes": "Fixture",
                }
                for doc_id in document_ids
            ],
        }
    )


class FakeStructuredOutputClient:
    provider = "test-provider"
    model = "claude-sonnet-4-6"
    effort = "low"

    def __init__(self) -> None:
        self.calls = 0

    def create_json_response(self, *, system_prompt: str, user_prompt: str, schema: dict, max_tokens: int):
        self.calls += 1
        if self.calls == 1:
            return (
                {
                    "issuing_body": "Cabinet Secretariat",
                    "document_type": "strategy_paper",
                    "binding_strength": "strategy_statement",
                    "publication_date": "2019-02-15",
                    "effective_date": None,
                    "covered_application_domains": ["general_purpose_models"],
                    "implementation_notes": "Guidance-oriented principles document.",
                    "confidence": 0.84,
                },
                {"id": "policy-metadata-response"},
            )
        if self.calls == 2:
            return (
                {
                    "safety_requirements": [
                        {
                            "label": "human_oversight",
                            "confidence": 0.86,
                            "evidence": [{"quote": "people must judge and decide for themselves"}],
                        }
                    ],
                    "enforcement_mechanisms": [
                        {
                            "label": "soft_enforcement",
                            "confidence": 0.73,
                            "evidence": [{"quote": "non-regulatory, non-binding framework"}],
                        }
                    ],
                },
                {"id": "policy-controls-response"},
            )
        return (
            {
                "dominant_frame": "innovation_enablement",
                "secondary_frames": ["fundamental_rights"],
                "frame_confidence": {
                    "innovation_enablement": 0.81,
                    "fundamental_rights": 0.62,
                },
                "rationale_summary": "The document emphasizes social adaptation and beneficial deployment of AI.",
                "evidence_spans": [
                    {"quote": "realize Society 5.0"},
                    {"quote": "benefit society"},
                ],
            },
            {"id": "framing-response"},
        )


class RecordingStore:
    def __init__(self) -> None:
        self.bundles = []
        self.jurisdiction_bundles = []

    def persist_analysis_bundle(self, bundle) -> None:
        self.bundles.append(bundle)

    def persist_jurisdiction_analysis_bundle(self, bundle) -> None:
        self.jurisdiction_bundles.append(bundle)


def test_analyze_parsed_documents_persists_outputs(tmp_path: Path, monkeypatch) -> None:
    parsed_dir = tmp_path / "parsed"
    raw_dir = tmp_path / "raw"
    analysis_dir = tmp_path / "analysis"

    parsed_doc_dir = parsed_dir / "japan" / "jp_social_principles_human_centric_ai"
    parsed_doc_dir.mkdir(parents=True)
    raw_doc_dir = raw_dir / "japan" / "jp_social_principles_human_centric_ai"
    raw_doc_dir.mkdir(parents=True)

    (parsed_doc_dir / "normalized.json").write_text(
        json.dumps(
            {
                "parser_version": "0.1.0",
                "title": "Social Principles of Human-Centric AI",
                "language": "en",
                "document_format": "pdf",
                "plain_text": "AI should benefit society and support human judgment.",
                "sections": [
                    {
                        "heading": "Overview",
                        "level": 1,
                        "content": "AI should benefit society and support human judgment.",
                    }
                ],
                "warnings": [],
                "source_artifact_path": "data/raw/japan/jp_social_principles_human_centric_ai/source.pdf",
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    (raw_doc_dir / "metadata.json").write_text(
        json.dumps(
            {
                "jurisdiction": "japan",
                "document_id": "jp_social_principles_human_centric_ai",
                "title": "Social Principles of Human-Centric AI",
                "canonical_url": "https://example.com/japan-ai-principles",
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    monkeypatch.setattr(analysis_module, "PARSED_DATA_DIR", parsed_dir)
    monkeypatch.setattr(analysis_module, "RAW_DATA_DIR", raw_dir)
    monkeypatch.setattr(analysis_module, "ANALYSIS_DIR", analysis_dir)

    results = analysis_module.analyze_parsed_documents(
        jurisdiction="japan",
        client=FakeStructuredOutputClient(),
    )

    assert {
        "jurisdiction": "japan",
        "document_id": "jp_social_principles_human_centric_ai",
        "status": "analyzed",
    } in results
    assert (
        analysis_dir
        / "japan"
        / "jp_social_principles_human_centric_ai"
        / "document_analysis.json"
    ).exists()
    assert (analysis_dir / "jurisdictions" / "japan" / "jurisdiction_analysis.json").exists()

    store = RecordingStore()
    results = analysis_module.analyze_parsed_documents(
        jurisdiction="japan",
        client=FakeStructuredOutputClient(),
        store=store,
        refresh_existing=True,
    )
    assert any(item.get("status") == "analyzed" and item.get("document_id") == "jp_social_principles_human_centric_ai" for item in results)
    assert len(store.bundles) == 1
    assert len(store.jurisdiction_bundles) == 1
    assert store.bundles[0].model == "claude-sonnet-4-6"
    assert store.bundles[0].document_id == "jp_social_principles_human_centric_ai"


def test_analyze_parsed_documents_skips_existing_artifacts(tmp_path: Path, monkeypatch) -> None:
    parsed_dir = tmp_path / "parsed"
    raw_dir = tmp_path / "raw"
    analysis_dir = tmp_path / "analysis"

    parsed_doc_dir = parsed_dir / "japan" / "jp_social_principles_human_centric_ai"
    parsed_doc_dir.mkdir(parents=True)
    raw_doc_dir = raw_dir / "japan" / "jp_social_principles_human_centric_ai"
    raw_doc_dir.mkdir(parents=True)
    existing_analysis_dir = analysis_dir / "japan" / "jp_social_principles_human_centric_ai"
    existing_analysis_dir.mkdir(parents=True)

    (parsed_doc_dir / "normalized.json").write_text(
        json.dumps(
            {
                "parser_version": "0.3.0",
                "title": "Social Principles of Human-Centric AI",
                "language": "en",
                "document_format": "pdf",
                "plain_text": "AI should benefit society and people must judge and decide for themselves in a non-regulatory, non-binding framework to realize Society 5.0.",
                "sections": [
                    {
                        "heading": "Overview",
                        "level": 1,
                        "content": "AI should benefit society and people must judge and decide for themselves in a non-regulatory, non-binding framework to realize Society 5.0.",
                    }
                ],
                "warnings": [],
                "source_artifact_path": "data/raw/japan/jp_social_principles_human_centric_ai/source.pdf",
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    (raw_doc_dir / "metadata.json").write_text(
        json.dumps(
            {
                "jurisdiction": "japan",
                "document_id": "jp_social_principles_human_centric_ai",
                "title": "Social Principles of Human-Centric AI",
                "canonical_url": "https://example.com/japan-ai-principles",
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    # Section 0: Legacy artifact without analysis_metadata must NEVER be treated as current.
    (existing_analysis_dir / "document_analysis.json").write_text("{}", encoding="utf-8")

    monkeypatch.setattr(analysis_module, "PARSED_DATA_DIR", parsed_dir)
    monkeypatch.setattr(analysis_module, "RAW_DATA_DIR", raw_dir)
    monkeypatch.setattr(analysis_module, "ANALYSIS_DIR", analysis_dir)

    first_client = FakeStructuredOutputClient()
    first_results = analysis_module.analyze_parsed_documents(
        jurisdiction="japan",
        client=first_client,
    )
    assert first_client.calls == 3
    assert {
        "jurisdiction": "japan",
        "document_id": "jp_social_principles_human_centric_ai",
        "status": "analyzed",
        "previous_status": "stale_legacy_no_provenance",
    } in first_results

    # Second run with matching analysis_metadata skips cleanly without calling the client.
    second_client = FakeStructuredOutputClient()
    second_results = analysis_module.analyze_parsed_documents(
        jurisdiction="japan",
        client=second_client,
    )
    assert second_client.calls == 0
    assert second_results == [
        {
            "jurisdiction": "japan",
            "document_id": "jp_social_principles_human_centric_ai",
            "status": "skipped_existing",
        }
    ]


def test_analyze_parsed_documents_skips_low_fidelity_input(tmp_path: Path, monkeypatch) -> None:
    parsed_dir = tmp_path / "parsed"
    raw_dir = tmp_path / "raw"
    analysis_dir = tmp_path / "analysis"

    parsed_doc_dir = parsed_dir / "south_korea" / "kr_ai_top3_powerhouse_strategy_2026"
    parsed_doc_dir.mkdir(parents=True)
    raw_doc_dir = raw_dir / "south_korea" / "kr_ai_top3_powerhouse_strategy_2026"
    raw_doc_dir.mkdir(parents=True)

    (parsed_doc_dir / "normalized.json").write_text(
        json.dumps(
            {
                "parser_version": "0.1.0",
                "title": "카드뉴스 - 과학기술정보통신부",
                "language": "ko",
                "document_format": "html",
                "plain_text": "",
                "sections": [],
                "warnings": ["image_only_html_content"],
                "source_artifact_path": "data/raw/south_korea/kr_ai_top3_powerhouse_strategy_2026/source.html",
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    (raw_doc_dir / "metadata.json").write_text(
        json.dumps(
            {
                "jurisdiction": "south_korea",
                "document_id": "kr_ai_top3_powerhouse_strategy_2026",
                "title": "세계가 인정한 AI 3대 강국 대한민국",
                "canonical_url": "https://example.com/cardnews",
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    monkeypatch.setattr(analysis_module, "PARSED_DATA_DIR", parsed_dir)
    monkeypatch.setattr(analysis_module, "RAW_DATA_DIR", raw_dir)
    monkeypatch.setattr(analysis_module, "ANALYSIS_DIR", analysis_dir)
    monkeypatch.setattr(
        analysis_module,
        "load_all_source_manifests",
        lambda: [_fake_manifest("south_korea", ["kr_ai_top3_powerhouse_strategy_2026"])],
    )

    client = FakeStructuredOutputClient()
    results = analysis_module.analyze_parsed_documents(
        jurisdiction="south_korea",
        client=client,
    )

    assert results == [
        {
            "jurisdiction": "south_korea",
            "document_id": "kr_ai_top3_powerhouse_strategy_2026",
            "status": "skipped_low_fidelity",
        }
    ]
    assert client.calls == 0
    marker = analysis_dir / "south_korea" / "kr_ai_top3_powerhouse_strategy_2026" / "analysis_skipped.json"
    assert marker.exists()


def test_claude_client_retries_network_errors(monkeypatch) -> None:
    calls = {"count": 0}

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def read(self, *args, **kwargs):
            return b""

    def fake_json_load(response):
        return {"content": [{"type": "text", "text": "{\"ok\": true}"}]}

    def fake_urlopen(request, timeout=120):
        calls["count"] += 1
        if calls["count"] == 1:
            raise URLError("temporary failure")
        return FakeResponse()

    monkeypatch.setattr(analysis_module, "urlopen", fake_urlopen)
    monkeypatch.setattr(analysis_module.json, "load", fake_json_load)
    monkeypatch.setattr(analysis_module.time, "sleep", lambda *_args, **_kwargs: None)

    client = analysis_module.ClaudeAPIClient(api_key="test-key", max_retries=2)
    payload, raw_response = client.create_json_response(
        system_prompt="system",
        user_prompt="user",
        schema={"type": "object", "properties": {"ok": {"type": "boolean"}}, "required": ["ok"]},
        max_tokens=50,
    )

    assert calls["count"] == 2
    assert payload == {"ok": True}
    assert raw_response == {"content": [{"type": "text", "text": "{\"ok\": true}"}]}


def test_policy_schema_includes_nested_taxonomy_enums() -> None:
    taxonomy = load_taxonomy()
    schema = analysis_module._policy_extraction_schema()

    assert (
        schema["$defs"]["SafetyRequirement"]["properties"]["label"]["enum"]
        == taxonomy["policy_requirements"]
    )
    assert (
        schema["$defs"]["EnforcementMechanism"]["properties"]["label"]["enum"]
        == taxonomy["enforcement_mechanisms"]
    )


def test_policy_subschemas_include_taxonomy_enums() -> None:
    taxonomy = load_taxonomy()
    metadata_schema = analysis_module._policy_metadata_schema()
    controls_schema = analysis_module._policy_controls_schema()

    assert metadata_schema["properties"]["document_type"]["enum"] == taxonomy["document_types"]
    assert metadata_schema["properties"]["binding_strength"]["enum"] == taxonomy["binding_strength"]
    assert (
        controls_schema["$defs"]["SafetyRequirement"]["properties"]["label"]["enum"]
        == taxonomy["policy_requirements"]
    )


def test_build_analysis_excerpt_prioritizes_matching_sections(tmp_path: Path, monkeypatch) -> None:
    record = analysis_module.ParsedDocumentRecord(
        jurisdiction="united_states",
        document_id="us_test_doc",
        parsed_path=tmp_path / "normalized.json",
        parsed_document=analysis_module.ParsedDocument.model_validate(
            {
                "parser_version": "0.1.0",
                "title": "Test AI Framework",
                "language": "en",
                "document_format": "html",
                "plain_text": "Intro text\nRisk management section\nEconomic competitiveness section",
                "sections": [
                    {"heading": "Overview", "level": 1, "content": "General overview content."},
                    {"heading": "Risk Management", "level": 2, "content": "Risk management and testing obligations apply."},
                    {"heading": "Competitiveness", "level": 2, "content": "The policy supports innovation and economic competitiveness."},
                ],
                "warnings": [],
                "source_artifact_path": "data/raw/united_states/us_test_doc/source.html",
            }
        ),
        raw_metadata={"title": "Test AI Framework", "canonical_url": "https://example.com/us-test-doc"},
    )

    excerpt = analysis_module._build_analysis_excerpt(
        record,
        keywords=analysis_module.POLICY_CONTROLS_KEYWORDS,
        max_chars=240,
    )

    assert "Risk Management" in excerpt
    assert "testing obligations apply" in excerpt


def test_anthropic_schema_sanitizer_strips_numeric_bounds() -> None:
    schema = analysis_module._policy_extraction_schema()

    sanitized = analysis_module._sanitize_schema_for_anthropic(schema)

    serialized = json.dumps(sanitized)
    assert '"minimum"' not in serialized
    assert '"maximum"' not in serialized
    assert (
        sanitized["$defs"]["SafetyRequirement"]["properties"]["label"]["enum"]
        == schema["$defs"]["SafetyRequirement"]["properties"]["label"]["enum"]
    )


def test_risk_framing_schema_closes_frame_confidence_keys() -> None:
    taxonomy = load_taxonomy()
    schema = analysis_module._risk_framing_schema()

    frame_confidence = schema["properties"]["frame_confidence"]

    assert frame_confidence["type"] == "object"
    assert frame_confidence["additionalProperties"] is False
    assert set(frame_confidence["properties"]) == set(taxonomy["risk_framings"])


def test_persistence_bundle_uses_machine_outputs_without_review_queue() -> None:
    extraction = analysis_module.PolicyExtraction.model_validate(
        {
            "jurisdiction": "japan",
            "issuing_body": "Cabinet Secretariat",
            "document_type": "strategy_paper",
            "binding_strength": "strategy_statement",
            "publication_date": "2019-02-15",
            "effective_date": None,
            "covered_application_domains": ["general_purpose_models"],
            "safety_requirements": [
                {
                    "label": "human_oversight",
                    "confidence": 0.58,
                    "evidence": [{"quote": "people must judge and decide for themselves"}],
                }
            ],
            "enforcement_mechanisms": [],
            "implementation_notes": "Guidance-oriented principles document.",
            "confidence": 0.79,
        }
    )
    framing = analysis_module.RiskFramingAnalysis.model_validate(
        {
            "dominant_frame": "innovation_enablement",
            "secondary_frames": ["fundamental_rights"],
            "frame_confidence": {
                "innovation_enablement": 0.63,
                "fundamental_rights": 0.52,
            },
            "rationale_summary": "The document emphasizes social adaptation and beneficial deployment of AI.",
            "evidence_spans": [{"quote": "benefit society"}],
        }
    )

    provenance = analysis_module.AnalysisProvenance(
        provider="test-provider",
        model="claude-sonnet-4-6",
        effort="low",
        analyzed_at="2026-11-20T00:00:00Z",
        analysis_version="0.3.0",
        taxonomy_version="2.1.0",
        taxonomy_hash="taxhash123",
        extraction_prompt_hash="exthash123",
        framing_prompt_hash="frmhash123",
        input_sha256="inputhash123",
    )
    bundle = build_analysis_persistence_bundle(
        document_id="jp_social_principles_human_centric_ai",
        jurisdiction="japan",
        title="Social Principles of Human-Centric AI",
        canonical_url="https://example.com/japan-ai-principles",
        language="en",
        parser_version="0.3.0",
        raw_artifact_path="data/raw/japan/jp_social_principles_human_centric_ai/source.pdf",
        normalized_text_path="data/parsed/japan/jp_social_principles_human_centric_ai/normalized.json",
        normalized_text="AI should benefit society and support human judgment.",
        raw_metadata={"language": "en"},
        extraction=extraction,
        framing=framing,
        raw_policy_response={"id": "policy-response"},
        raw_framing_response={"id": "framing-response"},
        analysis_metadata=provenance,
        binding_strength="strategy_statement",
    )

    assert bundle.overall_confidence == 0.71
    assert bundle.dominant_frame_confidence == 0.63
    assert bundle.analyzed_at == "2026-11-20T00:00:00Z"
    assert bundle.binding_strength == "strategy_statement"
    assert bundle.extraction_prompt_hash == "exthash123"
    assert bundle.framing_prompt_hash == "frmhash123"


def test_persist_analysis_artifacts_replays_saved_outputs(tmp_path: Path, monkeypatch) -> None:
    parsed_dir = tmp_path / "parsed"
    raw_dir = tmp_path / "raw"
    analysis_dir = tmp_path / "analysis"

    parsed_doc_dir = parsed_dir / "european_union" / "eu_test_guidance"
    parsed_doc_dir.mkdir(parents=True)
    raw_doc_dir = raw_dir / "european_union" / "eu_test_guidance"
    raw_doc_dir.mkdir(parents=True)
    saved_analysis_dir = analysis_dir / "european_union" / "eu_test_guidance"
    saved_analysis_dir.mkdir(parents=True)

    (parsed_doc_dir / "normalized.json").write_text(
        json.dumps(
            {
                "parser_version": "0.1.0",
                "title": "EU Test Guidance",
                "language": "en",
                "document_format": "pdf",
                "plain_text": "Providers must report serious incidents and document testing.",
                "sections": [
                    {
                        "heading": "Main",
                        "level": 1,
                        "content": "Providers must report serious incidents and document testing.",
                    }
                ],
                "warnings": [],
                "source_artifact_path": "data/raw/european_union/eu_test_guidance/source.pdf",
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    (raw_doc_dir / "metadata.json").write_text(
        json.dumps(
            {
                "jurisdiction": "european_union",
                "document_id": "eu_test_guidance",
                "title": "EU Test Guidance",
                "canonical_url": "https://example.com/eu-test-guidance",
                "publication_date": "2025-02-01",
                "language": "en",
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    (saved_analysis_dir / "document_analysis.json").write_text(
        json.dumps(
            {
                "source_id": "eu_test_guidance",
                "title": "EU Test Guidance",
                "language": "en",
                "policy_extraction": {
                    "jurisdiction": "european_union",
                    "issuing_body": "European Commission",
                    "document_type": "regulatory_guidance",
                    "binding_strength": "regulatory_guidance",
                    "publication_date": "2025-02-01",
                    "effective_date": None,
                    "covered_actors": ["providers of AI systems"],
                    "covered_application_domains": ["general_purpose_models"],
                    "prohibited_practices": [],
                    "safety_requirements": [
                        {
                            "label": "incident_reporting",
                            "confidence": 0.88,
                            "evidence": [{"quote": "Providers must report serious incidents."}],
                        }
                    ],
                    "enforcement_mechanisms": [
                        {
                            "label": "reporting_obligation",
                            "confidence": 0.9,
                            "evidence": [{"quote": "Providers must report serious incidents."}],
                        }
                    ],
                    "enforcement_authorities": ["European Commission"],
                    "compliance_deadlines": ["2025-08-02"],
                    "penalties_summary": "The guidance references downstream supervisory enforcement under the AI Act.",
                    "implementation_notes": "Guidance clarifies reporting expectations.",
                    "confidence": 0.91,
                },
                "risk_framing": {
                    "dominant_frame": "consumer_public_safety",
                    "secondary_frames": ["fundamental_rights"],
                    "frame_confidence": {
                        "consumer_public_safety": 0.86,
                        "fundamental_rights": 0.53,
                    },
                    "rationale_summary": "The guidance focuses on preventing public harms and ensuring accountability.",
                    "evidence_spans": [{"quote": "serious incidents"}],
                },
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    (saved_analysis_dir / "policy_response.raw.json").write_text(
        json.dumps({"model": "claude-sonnet-4-6", "id": "policy-msg"}, ensure_ascii=False),
        encoding="utf-8",
    )
    (saved_analysis_dir / "framing_response.raw.json").write_text(
        json.dumps({"model": "claude-sonnet-4-6", "id": "framing-msg"}, ensure_ascii=False),
        encoding="utf-8",
    )

    monkeypatch.setattr(analysis_module, "PARSED_DATA_DIR", parsed_dir)
    monkeypatch.setattr(analysis_module, "RAW_DATA_DIR", raw_dir)
    monkeypatch.setattr(analysis_module, "ANALYSIS_DIR", analysis_dir)
    monkeypatch.setattr(
        analysis_module,
        "load_all_source_manifests",
        lambda: [_fake_manifest("european_union", ["eu_test_guidance"])],
    )

    store = RecordingStore()
    # Section 0: Legacy artifacts without analysis_metadata are REFUSED unless allow_legacy=True.
    try:
        analysis_module.persist_analysis_artifacts(
            jurisdiction="european_union",
            store=store,
        )
    except analysis_module.LegacyProvenanceError as exc:
        assert "analysis_metadata" in str(exc)
    else:
        raise AssertionError("Expected LegacyProvenanceError for legacy artifact without allow_legacy=True")
    assert len(store.bundles) == 0

    # Explicit allow_legacy=True stamps legacy sentinels without fabricating current hashes or effort.
    results = analysis_module.persist_analysis_artifacts(
        jurisdiction="european_union",
        store=store,
        allow_legacy=True,
    )

    assert {
        "jurisdiction": "european_union",
        "document_id": "eu_test_guidance",
        "status": "persisted",
    } in results
    assert {"jurisdiction": "european_union", "status": "analyzed"} in results
    assert len(store.bundles) == 1
    assert len(store.jurisdiction_bundles) == 1
    assert store.bundles[0].provider == "anthropic"
    assert store.bundles[0].model == "claude-sonnet-4-6"
    assert store.bundles[0].effort is None
    assert store.bundles[0].taxonomy_version == "legacy"
    assert store.bundles[0].analysis_version == "legacy_v1"
    assert store.bundles[0].prompt_hashes == {}
    assert store.bundles[0].extraction_prompt_hash == ""
    assert store.bundles[0].framing_prompt_hash == ""
    assert store.bundles[0].binding_strength == "regulatory_guidance"
    assert store.bundles[0].policy_extraction["covered_actors"] == ["providers of AI systems"]
    assert store.bundles[0].policy_extraction["compliance_deadlines"] == ["2025-08-02"]


def test_analyze_jurisdictions_builds_tailored_artifact(tmp_path: Path, monkeypatch) -> None:
    parsed_dir = tmp_path / "parsed"
    raw_dir = tmp_path / "raw"
    analysis_dir = tmp_path / "analysis"

    documents = [
        {
            "document_id": "kr_ai_basic_act",
            "title": "AI Basic Act",
            "publication_date": "2025-01-21",
            "issuing_body": "Ministry of Science and ICT",
            "document_type": "legislation",
            "binding_strength": "binding_law",
            "dominant_frame": "economic_competitiveness",
            "secondary_frames": ["consumer_public_safety"],
            "frame_confidence": {
                "economic_competitiveness": 0.72,
                "consumer_public_safety": 0.44,
            },
            "requirements": ["risk_assessment", "transparency_disclosure"],
            "enforcement": ["regulatory_supervision"],
        },
        {
            "document_id": "kr_genai_personal_data_guide_2025",
            "title": "Generative AI Personal Data Guide",
            "publication_date": "2025-08",
            "issuing_body": "Personal Information Protection Commission",
            "document_type": "regulatory_guidance",
            "binding_strength": "regulatory_guidance",
            "dominant_frame": "fundamental_rights",
            "secondary_frames": ["consumer_public_safety"],
            "frame_confidence": {
                "fundamental_rights": 0.77,
                "consumer_public_safety": 0.31,
            },
            "requirements": ["risk_assessment", "red_teaming", "transparency_disclosure"],
            "enforcement": ["soft_enforcement", "regulatory_supervision"],
        },
    ]

    for payload in documents:
        parsed_doc_dir = parsed_dir / "south_korea" / payload["document_id"]
        raw_doc_dir = raw_dir / "south_korea" / payload["document_id"]
        saved_analysis_dir = analysis_dir / "south_korea" / payload["document_id"]
        parsed_doc_dir.mkdir(parents=True)
        raw_doc_dir.mkdir(parents=True)
        saved_analysis_dir.mkdir(parents=True)

        (parsed_doc_dir / "normalized.json").write_text(
            json.dumps(
                {
                    "parser_version": "0.1.0",
                    "title": payload["title"],
                    "language": "en",
                    "document_format": "html",
                    "plain_text": payload["title"],
                    "sections": [{"heading": "Main", "level": 1, "content": payload["title"]}],
                    "warnings": [],
                    "source_artifact_path": f"data/raw/south_korea/{payload['document_id']}/source.html",
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        (raw_doc_dir / "metadata.json").write_text(
            json.dumps(
                {
                    "jurisdiction": "south_korea",
                    "document_id": payload["document_id"],
                    "title": payload["title"],
                    "canonical_url": f"https://example.com/{payload['document_id']}",
                    "publication_date": payload["publication_date"],
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        (saved_analysis_dir / "document_analysis.json").write_text(
            json.dumps(
                {
                    "source_id": payload["document_id"],
                    "title": payload["title"],
                    "language": "en",
                    "policy_extraction": {
                        "jurisdiction": "south_korea",
                        "issuing_body": payload["issuing_body"],
                        "document_type": payload["document_type"],
                        "binding_strength": payload["binding_strength"],
                        "publication_date": payload["publication_date"],
                        "effective_date": None,
                        "covered_actors": [],
                        "covered_application_domains": ["general_purpose_models"],
                        "prohibited_practices": [],
                        "safety_requirements": [
                            {
                                "label": label,
                                "confidence": 0.8,
                                "evidence": [{"quote": label}],
                            }
                            for label in payload["requirements"]
                        ],
                        "enforcement_mechanisms": [
                            {
                                "label": label,
                                "confidence": 0.75,
                                "evidence": [{"quote": label}],
                            }
                            for label in payload["enforcement"]
                        ],
                        "enforcement_authorities": [payload["issuing_body"]],
                        "compliance_deadlines": [],
                        "penalties_summary": None,
                        "implementation_notes": payload["title"],
                        "confidence": 0.86,
                    },
                    "risk_framing": {
                        "dominant_frame": payload["dominant_frame"],
                        "secondary_frames": payload["secondary_frames"],
                        "frame_confidence": payload["frame_confidence"],
                        "rationale_summary": payload["title"],
                        "evidence_spans": [{"quote": payload["title"]}],
                    },
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )

    monkeypatch.setattr(analysis_module, "PARSED_DATA_DIR", parsed_dir)
    monkeypatch.setattr(analysis_module, "RAW_DATA_DIR", raw_dir)
    monkeypatch.setattr(analysis_module, "ANALYSIS_DIR", analysis_dir)

    results = analysis_module.analyze_jurisdictions(
        jurisdiction="south_korea",
        refresh_existing=True,
    )

    assert results == [{"jurisdiction": "south_korea", "status": "analyzed"}]
    artifact_path = analysis_dir / "jurisdictions" / "south_korea" / "jurisdiction_analysis.json"
    assert artifact_path.exists()
    artifact = json.loads(artifact_path.read_text(encoding="utf-8"))
    assert artifact["jurisdiction"] == "south_korea"
    assert artifact["source_count"] == 2
    assert artifact["top_requirements"][0]["label"] == "risk_assessment"
    assert artifact["key_sources"][0]["document_id"] in {"kr_ai_basic_act", "kr_genai_personal_data_guide_2025"}
    assert "South Korea" in artifact["summary"]
