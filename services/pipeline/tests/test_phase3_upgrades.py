import json
from pathlib import Path

import pytest

import observatory.analysis as analysis_module
import observatory.audit as audit_module
import observatory.browser_fetch as browser_fetch_module
import observatory.cli as cli_module
import observatory.db as db_module
import observatory.parser as parser_module
from observatory.models import (
    AnalysisProvenance,
    DocumentAnalysis,
    PolicyExtraction,
    RiskFramingAnalysis,
)
from observatory.persistence import build_analysis_persistence_bundle
from observatory.prompts import build_shared_codebook_system_prefix, load_prompt
from observatory.schema_validation import validate_repository_artifacts
from observatory.source_registry import ROOT, JurisdictionManifest
from observatory.taxonomy import get_canonical_thresholds, load_label_definitions, load_taxonomy


def _sample_manifest(jurisdiction: str, doc_id: str, *, binding_strength: str = "binding_law") -> JurisdictionManifest:
    return JurisdictionManifest.model_validate(
        {
            "manifest_version": "2.0",
            "jurisdiction": jurisdiction,
            "description": "Fixture",
            "source_portals": [
                {
                    "id": "p",
                    "name": "P",
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
                    "title": "Sample Law",
                    "issuing_body": "Agency",
                    "canonical_url": f"https://example.com/{doc_id}",
                    "document_type": "legislation",
                    "binding_strength": binding_strength,
                    "source_tier": "statutory_rule",
                    "corpus_role": "primary_instrument",
                    "lifecycle_stage": "active",
                    "publication_date": "2026-01-01",
                    "languages": ["en"],
                    "document_format": "html",
                    "source_portal_ids": ["p"],
                    "priority": "high",
                    "relevance_notes": "Fixture",
                }
            ],
        }
    )


def _sample_extraction(**overrides) -> PolicyExtraction:
    payload = {
        "jurisdiction": "european_union",
        "issuing_body": "European Commission",
        "document_type": "legislation",
        "binding_strength": "binding_law",
        "publication_date": "2024-06-13",
        "effective_date": "2026-08-02",
        "covered_actors": ["providers"],
        "covered_application_domains": ["general_purpose_models"],
        "prohibited_practices": [],
        "safety_requirements": [
            {
                "label": "risk_assessment",
                "confidence": 0.9,
                "obligation_strength": "mandatory",
                "evidence": [{"quote": "Providers shall conduct a risk assessment."}],
            }
        ],
        "enforcement_mechanisms": [
            {
                "label": "civil_penalty",
                "confidence": 0.88,
                "evidence": [{"quote": "Non-compliance is subject to administrative fines."}],
            }
        ],
        "enforcement_authorities": ["European Commission"],
        "compliance_deadlines": ["2026-08-02"],
        "penalties_summary": "Administrative fines up to 35M EUR.",
        "implementation_notes": "Enacted regulation.",
        "confidence": 0.91,
    }
    payload.update(overrides)
    return PolicyExtraction.model_validate(payload)


def _sample_framing(**overrides) -> RiskFramingAnalysis:
    payload = {
        "dominant_frame": "fundamental_rights",
        "secondary_frames": ["consumer_public_safety"],
        "frame_confidence": {
            "existential_catastrophic": 0.05,
            "national_security": 0.1,
            "economic_competitiveness": 0.2,
            "fundamental_rights": 0.9,
            "social_stability": 0.05,
            "innovation_enablement": 0.3,
            "consumer_public_safety": 0.7,
            "labor_transition": 0.05,
        },
        "frame_share": {
            "existential_catastrophic": 0.0,
            "national_security": 0.05,
            "economic_competitiveness": 0.1,
            "fundamental_rights": 0.5,
            "social_stability": 0.0,
            "innovation_enablement": 0.1,
            "consumer_public_safety": 0.25,
            "labor_transition": 0.0,
        },
        "rationale_summary": "Protects fundamental rights and public safety.",
        "evidence_spans": [
            {"quote": "protect fundamental rights", "frame": "fundamental_rights"},
            {"quote": "ensure public safety", "frame": "consumer_public_safety"},
        ],
    }
    payload.update(overrides)
    return RiskFramingAnalysis.model_validate(payload)


def test_section0_currency_and_persistence_provenance_guards(tmp_path: Path) -> None:
    legacy_path = tmp_path / "document_analysis.json"
    legacy_path.write_text(json.dumps({"source_id": "legacy_doc"}), encoding="utf-8", newline="\n")

    is_current, status = analysis_module._analysis_currency_status(
        analysis_path=legacy_path,
        input_sha256="abc",
        model="claude-sonnet-4-6",
        effort="low",
        taxonomy_hash="tax",
        extraction_prompt_hash="ext",
        framing_prompt_hash="frm",
    )
    assert is_current is False
    assert status == "stale_legacy_no_provenance"

    # build_analysis_persistence_bundle refuses missing analysis_metadata unless allow_legacy=True
    with pytest.raises(ValueError, match="without analysis_metadata"):
        build_analysis_persistence_bundle(
            document_id="legacy_doc",
            jurisdiction="european_union",
            title="Legacy",
            canonical_url="https://example.com/legacy",
            language="en",
            parser_version="0.1.0",
            raw_artifact_path="data/raw/european_union/legacy_doc/source.html",
            normalized_text_path="data/parsed/european_union/legacy_doc/normalized.json",
            normalized_text="Providers shall conduct a risk assessment.",
            raw_metadata={},
            extraction=_sample_extraction(),
            framing=_sample_framing(),
            raw_policy_response={},
            raw_framing_response={},
        )

    # allow_legacy=True stamps legacy sentinels and NEVER fabricates current hashes or effort
    legacy_bundle = build_analysis_persistence_bundle(
        document_id="legacy_doc",
        jurisdiction="european_union",
        title="Legacy",
        canonical_url="https://example.com/legacy",
        language="en",
        parser_version="0.1.0",
        raw_artifact_path="data/raw/european_union/legacy_doc/source.html",
        normalized_text_path="data/parsed/european_union/legacy_doc/normalized.json",
        normalized_text="Providers shall conduct a risk assessment.",
        raw_metadata={},
        extraction=_sample_extraction(),
        framing=_sample_framing(),
        raw_policy_response={"model": "claude-sonnet-4-6"},
        raw_framing_response={},
        allow_legacy=True,
        provider="anthropic",
        model="claude-sonnet-4-6",
        effort=None,
        binding_strength="binding_law",
    )
    assert legacy_bundle.taxonomy_version == "legacy"
    assert legacy_bundle.analysis_version == "legacy_v1"
    assert legacy_bundle.taxonomy_hash == "legacy"
    assert legacy_bundle.prompt_hashes == {}
    assert legacy_bundle.extraction_prompt_hash == ""
    assert legacy_bundle.framing_prompt_hash == ""
    assert legacy_bundle.effort is None
    assert legacy_bundle.binding_strength == "binding_law"

    # Modern artifact strictly preserves analysis_metadata provenance (even if current prompts/taxonomy differ)
    recorded_prov = AnalysisProvenance(
        provider="anthropic",
        model="claude-sonnet-4-6",
        effort="medium",
        analyzed_at="2026-11-20T18:00:00Z",
        analysis_version="0.3.0",
        taxonomy_version="2.0.0",
        taxonomy_hash="historical_tax_hash",
        extraction_prompt_hash="historical_ext_hash",
        framing_prompt_hash="historical_frm_hash",
        input_sha256="historical_input_sha",
    )
    modern_bundle = build_analysis_persistence_bundle(
        document_id="modern_doc",
        jurisdiction="european_union",
        title="Modern",
        canonical_url="https://example.com/modern",
        language="en",
        parser_version="0.3.0",
        raw_artifact_path="data/raw/european_union/modern_doc/source.html",
        normalized_text_path="data/parsed/european_union/modern_doc/normalized.json",
        normalized_text="Different text",
        raw_metadata={},
        extraction=_sample_extraction(),
        framing=_sample_framing(),
        raw_policy_response={},
        raw_framing_response={},
        analysis_metadata=recorded_prov,
        binding_strength="binding_law",
    )
    assert modern_bundle.taxonomy_version == "2.0.0"
    assert modern_bundle.taxonomy_hash == "historical_tax_hash"
    assert modern_bundle.extraction_prompt_hash == "historical_ext_hash"
    assert modern_bundle.framing_prompt_hash == "historical_frm_hash"
    assert modern_bundle.content_sha256 == "historical_input_sha"
    assert modern_bundle.analyzed_at == "2026-11-20T18:00:00Z"
    assert modern_bundle.frame_shares == _sample_framing().frame_share


def test_migration_005_and_db_binding_strength_persistence(monkeypatch) -> None:
    mig_005 = db_module.MIGRATIONS_DIR / "005_authoritative_manifest_binding.sql"
    assert mig_005.exists()
    chunks = db_module._split_migration_statements(mig_005.read_text(encoding="utf-8"))
    assert len(chunks) >= 5
    for chunk in chunks:
        non_comment = [ln.strip() for ln in chunk.splitlines() if ln.strip() and not ln.strip().startswith("--")]
        assert non_comment
    joined = "\n".join(chunks)
    assert "binding_strength TEXT" in joined
    assert "idx_machine_document_analyses_doc_updated" in joined
    assert "obligation_strength TEXT" in joined
    assert "frame_shares_json JSONB" in joined
    assert "analyzed_at TIMESTAMPTZ" in joined

    executed_calls: list[tuple[str, object]] = []

    class FakeCursor:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def execute(self, sql, params=None):
            executed_calls.append((sql, params))

        def fetchone(self):
            return (42,)

    class FakeConn:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def cursor(self):
            return FakeCursor()

    monkeypatch.setattr(db_module, "connect", lambda _url: FakeConn())
    prov = AnalysisProvenance(
        provider="anthropic",
        model="claude-sonnet-4-6",
        effort="low",
        analyzed_at="2026-11-20T18:00:00Z",
        analysis_version="0.3.0",
        taxonomy_version="2.1.0",
        taxonomy_hash="th",
        extraction_prompt_hash="eh",
        framing_prompt_hash="fh",
        input_sha256="ih",
    )
    bundle = build_analysis_persistence_bundle(
        document_id="eu_ai_act",
        jurisdiction="european_union",
        title="AI Act",
        canonical_url="https://example.com/ai-act",
        language="en",
        parser_version="0.3.0",
        raw_artifact_path="data/raw/european_union/eu_ai_act/source.html",
        normalized_text_path="data/parsed/european_union/eu_ai_act/normalized.json",
        normalized_text="Providers shall conduct a risk assessment.",
        raw_metadata={},
        extraction=_sample_extraction(),
        framing=_sample_framing(),
        raw_policy_response={},
        raw_framing_response={},
        analysis_metadata=prov,
        binding_strength="binding_law",
    )
    store = db_module.PostgresAnalysisStore("postgresql://fake")
    store.persist_analysis_bundle(bundle)

    doc_insert = next(params for sql, params in executed_calls if "INSERT INTO documents" in sql)
    assert doc_insert["binding_strength"] == "binding_law"
    analysis_insert = next(params for sql, params in executed_calls if "INSERT INTO machine_document_analyses" in sql)
    assert analysis_insert["analyzed_at"] == "2026-11-20T18:00:00Z"
    assert analysis_insert["frame_shares_json"] is not None
    req_insert = next(params for sql, params in executed_calls if "INSERT INTO machine_policy_requirements" in sql)
    assert req_insert[3] == "mandatory"


def test_ci_node22_gitattributes_and_validate_artifacts_cli() -> None:
    gitattributes = (ROOT / ".gitattributes").read_text(encoding="utf-8")
    assert "data/raw/** -text" in gitattributes
    assert "*.json text eol=lf" in gitattributes

    ci_yml = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
    assert 'node-version: "22"' in ci_yml
    assert "validate-artifacts" in ci_yml

    report = validate_repository_artifacts()
    assert report["error_count"] == 0
    assert report["validated_count"] >= 115

    # CLI exits cleanly
    cli_module.app(["validate-artifacts"])


def test_d1_parser_0_3_0_legal_sectionizer_and_pdf_reflow(tmp_path: Path, monkeypatch) -> None:
    assert parser_module.PARSER_VERSION == "0.3.0"

    # Flat <p>-only statutory HTML (like EUR-Lex AI Act) splits into clean legal sections without false inline splits
    eu_html = tmp_path / "eu_law.html"
    eu_html.write_text(
        """
        <html lang="en"><body><main>
          <p>CHAPTER I GENERAL PROVISIONS</p>
          <p>Article 1</p>
          <p>This Regulation lays down harmonised rules on artificial intelligence.</p>
          <p>Article 2</p>
          <p>Article 5 shall apply to providers placing systems on the Union market.</p>
          <p>ANNEX I</p>
          <p>List of Union harmonisation legislation.</p>
        </main></body></html>
        """,
        encoding="utf-8",
        newline="\n",
    )
    parsed_eu = parser_module.parse_html_artifact(eu_html, {"title": "AI Act", "language": "en"})
    assert parsed_eu.extractor == "beautifulsoup4"
    headings = [s.heading for s in parsed_eu.sections]
    assert any("Article 1" in h for h in headings)
    assert any("Article 2" in h for h in headings)
    assert any("ANNEX I" in h for h in headings)
    # Inline prose "Article 5 shall apply..." must NOT become a heading!
    assert not any(h.startswith("Article 5") for h in headings)

    # Chinese and Korean statutory articles split cleanly while preserving full text
    cjk_html = tmp_path / "cn_law.html"
    cjk_html.write_text(
        """
        <html lang="zh"><body><main>
          <p>第一章 总则</p>
          <p>第一条 为了促进生成式人工智能健康发展和规范应用，制定本办法。</p>
          <p>第二条 利用生成式人工智能技术向中华人民共和国境内公众提供服务的，适用本办法。</p>
        </main></body></html>
        """,
        encoding="utf-8",
        newline="\n",
    )
    parsed_cn = parser_module.parse_html_artifact(cjk_html, {"title": "暂行办法", "language": "zh"})
    assert len(parsed_cn.sections) >= 2
    assert any("第一条" in s.heading for s in parsed_cn.sections)
    assert any("第二条" in s.heading for s in parsed_cn.sections)
    assert "为了促进生成式人工智能健康发展和规范应用" in parsed_cn.plain_text

    # PDF cleaner strips repeated headers/footers, de-hyphenates wrapped words, keeps compound hyphens, reflows lines
    fake_pdf = tmp_path / "statute.pdf"
    fake_pdf.write_bytes(b"%PDF-1.7\n")
    raw_pages = [
        parser_module.ParsedSection(
            heading="Page 1",
            level=1,
            content=(
                "Official Journal of the EU 1/3\n"
                "Providers must comply with the regu-\n"
                "lation covering high-\n"
                "risk artificial intelligence systems\n"
                "across the internal market.\n"
                "- 1 -"
            ),
        ),
        parser_module.ParsedSection(
            heading="Page 2",
            level=1,
            content=(
                "Official Journal of the EU 2/3\n"
                "Additional transparency obliga-\n"
                "tions apply to deployers.\n"
                "- 2 -"
            ),
        ),
        parser_module.ParsedSection(
            heading="Page 3",
            level=1,
            content=(
                "Official Journal of the EU 3/3\n"
                "Authorities enforce compliance.\n"
                "- 3 -"
            ),
        ),
    ]
    monkeypatch.setattr(parser_module, "_extract_pdf_sections_with_pypdf", lambda _p: (raw_pages, [], None))
    monkeypatch.setattr(parser_module, "_extract_pdf_sections_with_pdftotext", lambda _p: ([], ["pdftotext_unavailable"]))

    parsed_pdf = parser_module.parse_pdf_artifact(fake_pdf, {"title": "EU Regulation", "language": "en"})
    assert parsed_pdf.extractor == "pypdf"
    assert "Official Journal of the EU" not in parsed_pdf.plain_text
    assert "- 1 -" not in parsed_pdf.plain_text
    assert "regulation covering high-risk artificial intelligence systems across the internal market." in parsed_pdf.plain_text
    assert "obligations apply to deployers." in parsed_pdf.plain_text

    # Running header stripper must NEVER strip legal headings (Article N / 第N条) appearing at page tops
    en_article_pages = [
        parser_module.ParsedSection(heading=f"Page {i}", level=1, content=f"Official Gazette 2025\nArticle {i}\nOperative rule {i} applies to providers.\n- {i} -")
        for i in range(1, 4)
    ]
    cleaned_en = parser_module._clean_pdf_page_sections(en_article_pages)
    assert [s.heading for s in cleaned_en] == ["Article 1", "Article 2", "Article 3"]
    assert all("Official Gazette 2025" not in s.content for s in cleaned_en)

    cjk_article_pages = [
        parser_module.ParsedSection(heading=f"Page {i}", level=1, content=f"国务院公报 2025\n第{i}条 人工智能提供者应当履行第{i}项安全义务。\n- {i} -")
        for i in range(1, 4)
    ]
    cleaned_cjk = parser_module._clean_pdf_page_sections(cjk_article_pages)
    assert [s.heading for s in cleaned_cjk] == ["第1条", "第2条", "第3条"]
    assert all("国务院公报 2025" not in s.content for s in cleaned_cjk)


def test_d2_codebook_injected_prompts_and_thresholds() -> None:
    thresholds = get_canonical_thresholds()
    assert thresholds["grounding_pass_threshold"] == 0.90
    assert thresholds["low_confidence_policy"] == 0.70
    assert thresholds["low_confidence_framing"] == 0.60
    assert thresholds["frame_mention_floor"] == 0.15

    defs = load_label_definitions()
    taxonomy = load_taxonomy()
    assert "obligation_strengths" in taxonomy
    assert set(defs["categories"]["risk_framings"]) == set(taxonomy["risk_framings"])

    prefix = build_shared_codebook_system_prefix()
    assert "Include when:" in prefix
    assert "Exclude when:" in prefix
    assert "human-centric AI" in prefix
    assert "labor_transition" in prefix

    ext_prompt = load_prompt("structured_extraction.md")
    assert "Do not collapse distinct obligations" not in ext_prompt
    assert "400 characters" in ext_prompt
    assert "obligation_strength" in ext_prompt

    frm_prompt = load_prompt("risk_framing_analysis.md")
    assert "frame_share" in frm_prompt
    assert "No explicit framing language in this chunk." in frm_prompt

    framing_schema = analysis_module._risk_framing_schema()
    assert "frame_share" in framing_schema["properties"]
    assert framing_schema["properties"]["frame_share"]["additionalProperties"] is False
    span_props = framing_schema["$defs"]["EvidenceSpan"]["properties"]
    assert "frame" in span_props
    assert "start_char" not in span_props
    assert "grounding_status" not in span_props


def test_d3_d7_d8_budgets_retry_timeout_and_true_prompt_caching(tmp_path: Path, monkeypatch) -> None:
    assert analysis_module.POLICY_CONTROLS_MAX_TOKENS >= 8192
    client = analysis_module.ClaudeAPIClient(api_key="test-key")
    assert client.timeout_seconds == 600

    # Verify timeout=600 and dual cache_control breakpoints (system_prefix + cached_document_context)
    captured_requests: list[tuple[dict, int]] = []

    class FakeResp:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    def fake_urlopen(request, timeout=None):
        body = json.loads(request.data.decode("utf-8"))
        captured_requests.append((body, timeout))
        return FakeResp()

    monkeypatch.setattr(analysis_module, "urlopen", fake_urlopen)
    monkeypatch.setattr(
        analysis_module.json,
        "load",
        lambda _r: {
            "stop_reason": "end_turn",
            "usage": {"input_tokens": 200, "output_tokens": 50, "cache_read_input_tokens": 1200},
            "content": [{"type": "text", "text": '{"ok": true}'}],
        },
    )
    payload, raw = client.create_json_response(
        system_prefix="SHARED_CODEBOOK_PREFIX",
        system_prompt="TASK_INSTRUCTIONS",
        cached_document_context="FULL_DOCUMENT_TEXT",
        user_prompt="RUN_TASK",
        schema={"type": "object", "properties": {"ok": {"type": "boolean"}}},
        max_tokens=8192,
    )
    assert payload == {"ok": True}
    body, used_timeout = captured_requests[0]
    assert used_timeout == 600
    assert body["system"] == [
        {
            "type": "text",
            "text": "SHARED_CODEBOOK_PREFIX",
            "cache_control": {"type": "ephemeral"},
        }
    ]
    assert body["messages"][0]["content"][0] == {
        "type": "text",
        "text": "FULL_DOCUMENT_TEXT",
        "cache_control": {"type": "ephemeral"},
    }
    assert body["messages"][0]["content"][1] == {
        "type": "text",
        "text": "TASK_INSTRUCTIONS\n\nRUN_TASK",
    }

    # Verify across 3 sequential chunk calls (metadata, controls, framing) that BOTH `system` and
    # `messages[0].content[0]` remain 100% byte-identical so Anthropic prompt caching hits on calls 2 & 3!
    captured_requests.clear()
    for task_sys, task_usr in (
        ("METADATA_PROMPT", "Task: policy_metadata"),
        ("CONTROLS_PROMPT", "Task: policy_controls"),
        ("FRAMING_PROMPT", "Task: risk_framing"),
    ):
        client.create_json_response(
            system_prefix="SHARED_CODEBOOK_PREFIX",
            system_prompt=task_sys,
            cached_document_context="CHUNK_DOCUMENT_CONTEXT",
            user_prompt=task_usr,
            schema={"type": "object", "properties": {"ok": {"type": "boolean"}}},
            max_tokens=8192,
        )
    assert len(captured_requests) == 3
    p0, p1, p2 = (req[0] for req in captured_requests)
    assert p0["system"] == p1["system"] == p2["system"]
    assert p0["messages"][0]["content"][0] == p1["messages"][0]["content"][0] == p2["messages"][0]["content"][0]
    assert p0["messages"][0]["content"][1]["text"] != p1["messages"][0]["content"][1]["text"]
    assert p1["messages"][0]["content"][1]["text"] != p2["messages"][0]["content"][1]["text"]

    # Verify _call_structured_client retries ONCE on MaxTokensTruncatedError with escalated budget
    seen_budgets: list[int] = []

    class TruncatingOnceClient:
        def create_json_response(self, *, system_prompt, user_prompt, schema, max_tokens, system_prefix=None, cached_document_context=None):
            seen_budgets.append(max_tokens)
            if len(seen_budgets) == 1:
                raise analysis_module.MaxTokensTruncatedError(f"truncated at {max_tokens}")
            return {"ok": True}, {"usage": {"cache_read_input_tokens": 500}}

    res, _raw = analysis_module._call_structured_client(
        TruncatingOnceClient(),
        system_prompt="sys",
        user_prompt="usr",
        schema={},
        max_tokens=8192,
    )
    assert res == {"ok": True}
    assert seen_budgets == [8192, 16384]


def test_d4_d5_token_aware_cjk_chunking_and_all_five_chunk_merge_fixes() -> None:
    # D5: CJK text estimates ~1.2 chars/token so 150k Chinese chars (>90k tokens, <350k chars) MUST chunk!
    cjk_chunk_text = "人工智能服务提供者应当依法开展安全评估与算法备案。" * 700  # ~16,800 chars -> ~14,000 tokens
    sections = [
        parser_module.ParsedSection(heading=f"第{i}条", level=2, content=cjk_chunk_text)
        for i in range(1, 10)  # ~151k chars (<350k chars), ~126k tokens (>90k tokens)
    ]
    cjk_record = analysis_module.ParsedDocumentRecord(
        jurisdiction="china",
        document_id="cn_big_law",
        parsed_path=Path("data/parsed/china/cn_big_law/normalized.json"),
        parsed_document=parser_module.ParsedDocument(
            parser_version="0.3.0",
            title="Big CN Law",
            language="zh",
            document_format="html",
            plain_text="\n\n".join(s.content for s in sections),
            sections=sections,
            warnings=[],
            source_artifact_path="data/raw/china/cn_big_law/source.html",
        ),
        raw_metadata={},
    )
    assert len(cjk_record.parsed_document.plain_text) < analysis_module.DIRECT_FULL_TEXT_MAX_CHARS
    assert analysis_module._estimate_tokens(cjk_record.parsed_document.plain_text) > analysis_module.DIRECT_FULL_TEXT_MAX_TOKENS
    cjk_chunks = analysis_module._chunk_document_for_analysis(cjk_record)
    assert len(cjk_chunks) >= 3

    # D4 #1: Overlap must NEVER emit a chunk that is a subset of the previous chunk
    for prev_chunk, next_chunk in zip(cjk_chunks, cjk_chunks[1:]):
        assert next_chunk not in prev_chunk

    # D4 #2 & #3: Framing merge weights by framing evidence (not char length), skips no-framing chunks, aggregates ALL rationales/evidence
    recitals_chunk = RiskFramingAnalysis.model_validate(
        {
            "dominant_frame": "fundamental_rights",
            "secondary_frames": ["consumer_public_safety"],
            "frame_confidence": {
                "existential_catastrophic": 0.0,
                "national_security": 0.0,
                "economic_competitiveness": 0.1,
                "fundamental_rights": 0.92,
                "social_stability": 0.0,
                "innovation_enablement": 0.2,
                "consumer_public_safety": 0.6,
                "labor_transition": 0.0,
            },
            "frame_share": {
                "existential_catastrophic": 0.0,
                "national_security": 0.0,
                "economic_competitiveness": 0.05,
                "fundamental_rights": 0.65,
                "social_stability": 0.0,
                "innovation_enablement": 0.1,
                "consumer_public_safety": 0.2,
                "labor_transition": 0.0,
            },
            "rationale_summary": "Recitals prioritize human dignity and fundamental rights.",
            "evidence_spans": [
                {"quote": "protect fundamental rights", "frame": "fundamental_rights"},
                {"quote": "health and safety of persons", "frame": "consumer_public_safety"},
            ],
        }
    )
    annex_no_framing_chunk = RiskFramingAnalysis.model_validate(
        {
            "dominant_frame": "consumer_public_safety",
            "secondary_frames": [],
            "frame_confidence": {k: 0.0 for k in load_taxonomy()["risk_framings"]},
            "frame_share": {k: 0.0 for k in load_taxonomy()["risk_framings"]},
            "rationale_summary": "No explicit framing language in this chunk.",
            "evidence_spans": [],
        }
    )
    later_chunk = RiskFramingAnalysis.model_validate(
        {
            "dominant_frame": "fundamental_rights",
            "secondary_frames": ["innovation_enablement"],
            "frame_confidence": {
                "existential_catastrophic": 0.0,
                "national_security": 0.0,
                "economic_competitiveness": 0.1,
                "fundamental_rights": 0.85,
                "social_stability": 0.0,
                "innovation_enablement": 0.55,
                "consumer_public_safety": 0.3,
                "labor_transition": 0.0,
            },
            "frame_share": {
                "existential_catastrophic": 0.0,
                "national_security": 0.0,
                "economic_competitiveness": 0.05,
                "fundamental_rights": 0.55,
                "social_stability": 0.0,
                "innovation_enablement": 0.3,
                "consumer_public_safety": 0.1,
                "labor_transition": 0.0,
            },
            "rationale_summary": "Sandbox articles reinforce trustworthy innovation.",
            "evidence_spans": [
                {"quote": "regulatory sandboxes foster innovation", "frame": "innovation_enablement"},
            ],
        }
    )
    # Give the empty annex chunk 200,000 chars vs 5,000 for recitals — evidence weighting ignores the empty annex!
    merged_framing = analysis_module._merge_risk_framing_chunks(
        [recitals_chunk, annex_no_framing_chunk, later_chunk],
        [5_000, 200_000, 8_000],
    )
    assert merged_framing.dominant_frame == "fundamental_rights"
    assert merged_framing.frame_confidence["fundamental_rights"] >= 0.85
    assert merged_framing.frame_share is not None
    assert abs(sum(merged_framing.frame_share.values()) - 1.0) < 1e-3
    assert "Sandbox articles reinforce trustworthy innovation." in merged_framing.rationale_summary
    assert "No explicit framing language" not in merged_framing.rationale_summary
    assert any(span.quote == "regulatory sandboxes foster innovation" for span in merged_framing.evidence_spans)

    # D4 #4: Metadata confidence NOT diluted by uninformed annex chunks
    meta_merged = analysis_module._merge_policy_metadata_chunks(
        [
            analysis_module.PolicyMetadataExtraction(
                issuing_body="EU",
                document_type="legislation",
                binding_strength="binding_law",
                publication_date="2024-06-13",
                effective_date="2026-08-02",
                covered_actors=["providers"],
                enforcement_authorities=["AI Office"],
                confidence=0.95,
            ),
            analysis_module.PolicyMetadataExtraction(
                issuing_body="EU",
                document_type="legislation",
                binding_strength="binding_law",
                confidence=0.20,
            ),
            analysis_module.PolicyMetadataExtraction(
                issuing_body="EU",
                document_type="legislation",
                binding_strength="binding_law",
                confidence=0.15,
            ),
        ]
    )
    assert meta_merged.confidence == 0.95

    # D4 #5: Multi-chunk controls merge drops ungrounded labels and keeps strongest obligation_strength
    source_text = "Providers shall conduct a documented risk assessment before deployment."
    controls_merged = analysis_module._merge_policy_controls_chunks(
        [
            analysis_module.PolicyControlsExtraction.model_validate(
                {
                    "safety_requirements": [
                        {
                            "label": "risk_assessment",
                            "confidence": 0.8,
                            "obligation_strength": "recommended",
                            "evidence": [{"quote": "Providers shall conduct a documented risk assessment"}],
                        },
                        {
                            "label": "compute_governance",
                            "confidence": 0.9,
                            "obligation_strength": "mandatory",
                            "evidence": [{"quote": "Hallucinated 10^26 FLOP compute reporting threshold"}],
                        },
                    ],
                    "enforcement_mechanisms": [],
                }
            ),
            analysis_module.PolicyControlsExtraction.model_validate(
                {
                    "safety_requirements": [
                        {
                            "label": "risk_assessment",
                            "confidence": 0.92,
                            "obligation_strength": "mandatory",
                            "evidence": [{"quote": "conduct a documented risk assessment before deployment"}],
                        }
                    ],
                    "enforcement_mechanisms": [],
                }
            ),
        ],
        plain_text=source_text,
    )
    assert [r.label for r in controls_merged.safety_requirements] == ["risk_assessment"]
    assert controls_merged.safety_requirements[0].obligation_strength == "mandatory"


def test_a12_d6_grounding_empty_none_nfkc_hyphen_ordered_window_and_offsets() -> None:
    # A12: Empty quotes return None (never 1.0)
    empty_doc = DocumentAnalysis(
        source_id="empty_q",
        title="Empty",
        language="en",
        policy_extraction=_sample_extraction(safety_requirements=[], enforcement_mechanisms=[]),
        risk_framing=_sample_framing(evidence_spans=[]),
    )
    empty_score = analysis_module.score_document_grounding(empty_doc, "Some source text.")
    assert empty_score["total_quotes"] == 0
    assert empty_score["grounding_ratio"] is None
    assert empty_score["exact_ratio"] is None

    # D6: NFKC fullwidth match -> verbatim with exact offsets
    src = "Section 1: ＡＩ providers shall ensure safety. Next, regu-\nlation applies to deployers. Finally, fines apply."
    st1, s1, e1 = analysis_module._match_span_in_text("AI providers shall ensure safety.", src)
    assert st1 == "verbatim"
    assert s1 is not None and e1 is not None
    assert "ＡＩ providers" in src[s1:e1]

    # Hyphen-insensitive match -> approximate with offsets
    st2, s2, e2 = analysis_module._match_span_in_text("regulation applies to deployers", src)
    assert st2 == "approximate"
    assert s2 is not None and e2 is not None
    assert "regu-\nlation" in src[s2:e2]

    # Ordered-window ellipsis match succeeds in order, fails when reversed!
    st3, s3, e3 = analysis_module._match_span_in_text("providers shall ensure safety ... Finally, fines apply", src)
    assert st3 == "approximate"
    assert s3 is not None and e3 is not None and e3 > s3

    st_rev, sr, er = analysis_module._match_span_in_text("Finally, fines apply ... providers shall ensure safety", src)
    assert st_rev == "not_found"
    assert sr is None and er is None


def test_d9_jurisdiction_scoped_institution_aliases() -> None:
    assert analysis_module._canonicalize_institution_name("Most federal agencies", jurisdiction="united_states") == "Most federal agencies"
    assert analysis_module._canonicalize_institution_name("Most federal agencies") == "Most federal agencies"
    assert analysis_module._canonicalize_institution_name("State Council of New York", jurisdiction="united_states") == "State Council of New York"
    assert analysis_module._canonicalize_institution_name("State Council", jurisdiction="china") == "State Council of China"
    assert analysis_module._canonicalize_institution_name("MOST", jurisdiction="china") == "Ministry of Science and Technology (MOST)"
    assert analysis_module._canonicalize_institution_name("NIST", jurisdiction="united_states") == "National Institute of Standards and Technology (NIST)"


def test_d10_stale_analysis_deleted_on_low_fidelity_skip_and_skip_marker_honored(tmp_path: Path, monkeypatch) -> None:
    parsed_dir = tmp_path / "parsed"
    raw_dir = tmp_path / "raw"
    analysis_dir = tmp_path / "analysis"

    for d in (parsed_dir, raw_dir, analysis_dir):
        (d / "south_korea" / "kr_bad_doc").mkdir(parents=True)

    (parsed_dir / "south_korea" / "kr_bad_doc" / "normalized.json").write_text(
        json.dumps(
            {
                "parser_version": "0.3.0",
                "title": "Bad Doc",
                "language": "ko",
                "document_format": "html",
                "plain_text": "",
                "sections": [],
                "warnings": ["image_only_html_content"],
                "source_artifact_path": "data/raw/south_korea/kr_bad_doc/source.html",
            }
        ),
        encoding="utf-8",
        newline="\n",
    )
    (raw_dir / "south_korea" / "kr_bad_doc" / "metadata.json").write_text(
        json.dumps({"title": "Bad Doc", "canonical_url": "https://example.com/bad"}),
        encoding="utf-8",
        newline="\n",
    )
    stale_doc = analysis_dir / "south_korea" / "kr_bad_doc" / "document_analysis.json"
    stale_doc.write_text(json.dumps({"source_id": "kr_bad_doc"}), encoding="utf-8", newline="\n")

    monkeypatch.setattr(analysis_module, "PARSED_DATA_DIR", parsed_dir)
    monkeypatch.setattr(analysis_module, "RAW_DATA_DIR", raw_dir)
    monkeypatch.setattr(analysis_module, "ANALYSIS_DIR", analysis_dir)
    monkeypatch.setattr(
        analysis_module,
        "load_all_source_manifests",
        lambda: [_sample_manifest("south_korea", "kr_bad_doc")],
    )

    class UnusedClient:
        provider = "test"
        model = "claude-sonnet-4-6"
        effort = "low"

        def create_json_response(self, **kwargs):
            raise AssertionError("client should not be called")

    # Even with refresh_existing=False, stale document_analysis.json is deleted when low-fidelity triggers!
    res = analysis_module.analyze_parsed_documents(
        jurisdiction="south_korea",
        client=UnusedClient(),
        refresh_existing=False,
    )
    assert res == [{"jurisdiction": "south_korea", "document_id": "kr_bad_doc", "status": "skipped_low_fidelity"}]
    assert not stale_doc.exists()
    assert (analysis_dir / "south_korea" / "kr_bad_doc" / "analysis_skipped.json").exists()

    # Even if a stale file is manually dropped back in, _load_analysis_artifacts honors analysis_skipped.json
    stale_doc.write_text("{}", encoding="utf-8", newline="\n")
    records = analysis_module._load_parsed_document_records(jurisdiction="south_korea")
    with pytest.raises(ValueError, match="skipped due to low fidelity"):
        analysis_module._load_analysis_artifacts(records[0])


def test_d11_playwright_context_route_ssrf_guard() -> None:
    registered = {}

    class FakeContext:
        def route(self, pattern, handler):
            registered["pattern"] = pattern
            registered["handler"] = handler

    class FakeRequest:
        def __init__(self, url: str, is_nav: bool) -> None:
            self.url = url
            self._is_nav = is_nav

        def is_navigation_request(self) -> bool:
            return self._is_nav

    class FakeRoute:
        def __init__(self, url: str, is_nav: bool = False) -> None:
            self.request = FakeRequest(url, is_nav)
            self.action = None

        def continue_(self) -> None:
            self.action = "continue"

        def abort(self, reason: str = "") -> None:
            self.action = f"abort:{reason}"

    ctx = FakeContext()
    blocked_all, blocked_nav = browser_fetch_module._install_ssrf_route_guard(ctx, resolve_dns=False)
    assert registered["pattern"] == "**/*"
    handler = registered["handler"]

    r_ok = FakeRoute("https://www.law.go.kr/lsInfoP.do", is_nav=True)
    handler(r_ok)
    assert r_ok.action == "continue"

    for unsafe_url, is_nav in (
        ("http://169.254.169.254/latest/meta-data/", False),
        ("http://100.100.100.200/latest/meta-data/", True),
        ("file:///etc/passwd", False),
    ):
        r_bad = FakeRoute(unsafe_url, is_nav=is_nav)
        handler(r_bad)
        assert r_bad.action == "abort:blockedbyclient"

    assert len(blocked_all) == 3
    assert blocked_nav == ["http://100.100.100.200/latest/meta-data/"]


def test_d12_gold_set_empty_f1_kappa_per_label_and_seeded_bootstrap() -> None:
    # Empty sets must return None (NEVER 1.0)
    assert analysis_module._precision_recall_f1(0, 0, 0) == (None, None, None)

    # Analytical Cohen's kappa check
    assert analysis_module._cohens_kappa(["a", "b", "a", "b"], ["a", "b", "a", "b"]) == 1.0
    assert analysis_module._cohens_kappa(["a", "b", "a", "b"], ["b", "a", "b", "a"]) == -1.0

    # End-to-end evaluation against committed starter gold_set_v1.json is deterministic with seeded bootstrap CIs
    gold_file = ROOT / "data" / "eval" / "gold_set_v1.json"
    assert gold_file.exists()
    r1 = analysis_module.evaluate_gold_set(gold_file, n_bootstrap=200, seed=42)
    r2 = analysis_module.evaluate_gold_set(gold_file, n_bootstrap=200, seed=42)
    assert r1 == r2
    assert r1["benchmark_status"] == "starter_v0.1_internal"
    assert r1["evaluated_count"] == 5
    assert r1["dominant_frame_cohens_kappa"] is not None
    assert r1["per_label_requirements"]
    assert r1["per_label_enforcement"]
    assert len(r1["bootstrap_95_ci"]["requirement_micro_f1"]) == 2


def test_end_to_end_analyze_persists_grounding_offsets_caching_and_full_error_status(
    tmp_path: Path,
    monkeypatch,
) -> None:
    parsed_dir = tmp_path / "parsed"
    raw_dir = tmp_path / "raw"
    analysis_dir = tmp_path / "analysis"
    for root in (parsed_dir, raw_dir):
        (root / "european_union" / "eu_cache_test").mkdir(parents=True)

    text = (
        "Providers shall conduct a risk assessment. "
        "Non-compliance is subject to administrative fines. "
        "This law aims to protect fundamental rights and ensure public safety."
    )
    (parsed_dir / "european_union" / "eu_cache_test" / "normalized.json").write_text(
        json.dumps(
            {
                "parser_version": "0.3.0",
                "title": "EU Cache Test",
                "language": "en",
                "document_format": "html",
                "plain_text": text,
                "sections": [{"heading": "Article 1", "level": 1, "content": text}],
                "warnings": [],
                "source_artifact_path": "data/raw/european_union/eu_cache_test/source.html",
                "extractor": "beautifulsoup4",
            }
        ),
        encoding="utf-8",
        newline="\n",
    )
    (raw_dir / "european_union" / "eu_cache_test" / "metadata.json").write_text(
        json.dumps({"title": "EU Cache Test", "canonical_url": "https://example.com/eu-cache"}),
        encoding="utf-8",
        newline="\n",
    )

    monkeypatch.setattr(analysis_module, "PARSED_DATA_DIR", parsed_dir)
    monkeypatch.setattr(analysis_module, "RAW_DATA_DIR", raw_dir)
    monkeypatch.setattr(analysis_module, "ANALYSIS_DIR", analysis_dir)
    monkeypatch.setattr(
        analysis_module,
        "load_all_source_manifests",
        lambda: [_sample_manifest("european_union", "eu_cache_test", binding_strength="binding_law")],
    )

    seen_calls: list[dict] = []

    class CachingMockClient:
        provider = "anthropic"
        model = "claude-sonnet-4-6"
        effort = "low"
        temperature = 0.0

        def create_json_response(
            self,
            *,
            system_prompt,
            user_prompt,
            schema,
            max_tokens,
            system_prefix=None,
            cached_document_context=None,
        ):
            idx = len(seen_calls) + 1
            seen_calls.append(
                {
                    "system_prefix": system_prefix,
                    "cached_document_context": cached_document_context,
                    "max_tokens": max_tokens,
                }
            )
            if idx == 1:
                return (
                    {
                        "issuing_body": "European Commission",
                        "document_type": "legislation",
                        "binding_strength": "binding_law",
                        "publication_date": "2024-06-13",
                        "effective_date": "2026-08-02",
                        "covered_actors": ["providers"],
                        "covered_application_domains": ["general_purpose_models"],
                        "prohibited_practices": [],
                        "enforcement_authorities": ["European Commission"],
                        "compliance_deadlines": ["2026-08-02"],
                        "penalties_summary": "Fines apply.",
                        "implementation_notes": "Notes.",
                        "confidence": 0.92,
                    },
                    {"usage": {"input_tokens": 100, "output_tokens": 60, "cache_creation_input_tokens": 2000}},
                )
            if idx == 2:
                return (
                    {
                        "safety_requirements": [
                            {
                                "label": "risk_assessment",
                                "confidence": 0.93,
                                "obligation_strength": "mandatory",
                                "evidence": [{"quote": "Providers shall conduct a risk assessment."}],
                            }
                        ],
                        "enforcement_mechanisms": [
                            {
                                "label": "civil_penalty",
                                "confidence": 0.9,
                                "evidence": [{"quote": "Non-compliance is subject to administrative fines."}],
                            }
                        ],
                    },
                    {"usage": {"input_tokens": 40, "output_tokens": 80, "cache_read_input_tokens": 2000}},
                )
            return (
                _sample_framing().model_dump(mode="json"),
                {"usage": {"input_tokens": 40, "output_tokens": 90, "cache_read_input_tokens": 2000}},
            )

    results = analysis_module.analyze_parsed_documents(
        jurisdiction="european_union",
        client=CachingMockClient(),
    )
    assert {"jurisdiction": "european_union", "document_id": "eu_cache_test", "status": "analyzed"} in results
    assert len(seen_calls) == 3
    # D8: Identical system_prefix and cached_document_context across all 3 calls of the chunk
    assert seen_calls[0]["system_prefix"] == seen_calls[1]["system_prefix"] == seen_calls[2]["system_prefix"]
    assert seen_calls[0]["cached_document_context"] == seen_calls[1]["cached_document_context"] == seen_calls[2]["cached_document_context"]
    assert seen_calls[1]["max_tokens"] >= 8192

    saved = DocumentAnalysis.model_validate(
        json.loads((analysis_dir / "european_union" / "eu_cache_test" / "document_analysis.json").read_text(encoding="utf-8"))
    )
    assert saved.analysis_metadata is not None
    assert saved.analysis_metadata.analyzed_at is not None
    assert saved.analysis_metadata.usage["cache_read_input_tokens"] == 4000
    req_span = saved.policy_extraction.safety_requirements[0].evidence[0]
    assert req_span.grounding_status == "verbatim"
    assert req_span.start_char == 0
    assert text[req_span.start_char : req_span.end_char] == "Providers shall conduct a risk assessment."
    assert saved.policy_extraction.safety_requirements[0].obligation_strength == "mandatory"
    assert saved.risk_framing.frame_share is not None

    # D3: Full exception details preserved in status on error
    class FailingClient:
        provider = "anthropic"
        model = "claude-sonnet-4-6"
        effort = "low"

        def create_json_response(self, **kwargs):
            raise RuntimeError("boom detailed message 42")

    err_results = analysis_module.analyze_parsed_documents(
        jurisdiction="european_union",
        client=FailingClient(),
        refresh_existing=True,
    )
    assert err_results[0]["status"] == "analysis_error:RuntimeError: boom detailed message 42"


def test_audit_flags_zero_quote_analyses_and_pyproject_pins_pydantic_2_11(
    tmp_path: Path,
    monkeypatch,
) -> None:
    pyproject_text = (ROOT / "services" / "pipeline" / "pyproject.toml").read_text(encoding="utf-8")
    assert '"pydantic>=2.11,<3.0"' in pyproject_text

    manifest = _sample_manifest("european_union", "eu_zero_quotes", binding_strength="binding_law")
    for sub in ("raw", "parsed", "analysis"):
        (tmp_path / sub / "european_union" / "eu_zero_quotes").mkdir(parents=True)

    (tmp_path / "raw" / "european_union" / "eu_zero_quotes" / "metadata.json").write_text(
        json.dumps({"sha256": "abc123", "publication_date": "2026-01-01"}),
        encoding="utf-8",
        newline="\n",
    )
    (tmp_path / "parsed" / "european_union" / "eu_zero_quotes" / "normalized.json").write_text(
        json.dumps(
            {
                "plain_text": "Artificial intelligence governance regulation establishing rules for AI systems. " * 20
            }
        ),
        encoding="utf-8",
        newline="\n",
    )
    zero_quote_doc = DocumentAnalysis(
        source_id="eu_zero_quotes",
        title="Sample Law",
        language="en",
        policy_extraction=_sample_extraction(safety_requirements=[], enforcement_mechanisms=[]),
        risk_framing=_sample_framing(evidence_spans=[]),
    )
    (tmp_path / "analysis" / "european_union" / "eu_zero_quotes" / "document_analysis.json").write_text(
        zero_quote_doc.model_dump_json(indent=2),
        encoding="utf-8",
        newline="\n",
    )

    monkeypatch.setattr(audit_module, "load_all_source_manifests", lambda: [manifest])
    monkeypatch.setattr(audit_module, "RAW_DIR", tmp_path / "raw")
    monkeypatch.setattr(audit_module, "PARSED_DIR", tmp_path / "parsed")
    monkeypatch.setattr(audit_module, "ANALYSIS_DIR", tmp_path / "analysis")

    audit = audit_module.build_source_quality_audit()
    doc_entry = audit["jurisdictions"][0]["documents"][0]
    assert doc_entry["grounding_ratio"] is None
    assert "zero evidence quotes extracted" in doc_entry["fidelity_findings"]
