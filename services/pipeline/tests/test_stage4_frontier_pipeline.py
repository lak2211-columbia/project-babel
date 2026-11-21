import io
import json
import threading
import time
from pathlib import Path
from urllib.error import HTTPError

import pytest

import observatory.analysis as analysis_module
import observatory.cli as cli_module
import observatory.parser as parser_module
from observatory.models import DocumentAnalysis, PolicyExtraction, RiskFramingAnalysis
from observatory.source_registry import ROOT, JurisdictionManifest


def _manifest_for(jurisdiction: str, doc_ids: list[str]) -> JurisdictionManifest:
    return JurisdictionManifest.model_validate(
        {
            "manifest_version": "2.0",
            "jurisdiction": jurisdiction,
            "description": "Stage 4 Fixture",
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
                    "title": f"Document {doc_id}",
                    "issuing_body": "Agency",
                    "canonical_url": f"https://example.com/{doc_id}",
                    "document_type": "legislation",
                    "binding_strength": "binding_law",
                    "source_tier": "statutory_rule",
                    "corpus_role": "primary_instrument",
                    "lifecycle_stage": "active",
                    "publication_date": "2026-06-01",
                    "languages": ["en"],
                    "document_format": "html",
                    "source_portal_ids": ["p"],
                    "priority": "high",
                    "relevance_notes": "Fixture",
                }
                for doc_id in doc_ids
            ],
        }
    )


def test_gemini_client_filters_thoughts_sends_header_key_and_parses_usage(monkeypatch) -> None:
    captured: list[tuple[str, dict[str, str], dict, int]] = []

    class FakeResp:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    def fake_urlopen(request, timeout=None):
        headers = {k.lower(): v for k, v in request.header_items()}
        body = json.loads(request.data.decode("utf-8"))
        captured.append((request.full_url, headers, body, timeout))
        return FakeResp()

    gemini_raw = {
        "responseId": "resp-123",
        "modelVersion": "gemini-4-neon",
        "candidates": [
            {
                "finishReason": "STOP",
                "content": {
                    "role": "model",
                    "parts": [
                        {"thought": True, "text": "Internal reasoning: consider EU AI Act Article 5..."},
                        {"text": '```json\n{"status": "ok", "count": 3}\n```'},
                    ],
                },
            }
        ],
        "usageMetadata": {
            "promptTokenCount": 12000,
            "candidatesTokenCount": 450,
            "thoughtsTokenCount": 1800,
            "cachedContentTokenCount": 4000,
        },
    }
    monkeypatch.setattr(analysis_module, "urlopen", fake_urlopen)
    monkeypatch.setattr(analysis_module.json, "load", lambda _r: gemini_raw)

    secret_key = "SUPER-SECRET-GEMINI-KEY-XYZ"
    client = analysis_module.GeminiAPIClient(api_key=secret_key, effort="high")
    assert client.model == "gemini-4-neon"
    assert client.effort == "high"
    assert client.timeout_seconds == 600
    assert client.direct_full_text_max_tokens == 450_000

    parsed, raw = client.create_json_response(
        system_prefix="CODEBOOK",
        system_prompt="TASK_SYS",
        cached_document_context="DOC_TEXT",
        user_prompt="TASK_USER",
        schema={"type": "object"},
        max_tokens=32768,
    )
    assert parsed == {"status": "ok", "count": 3}

    url, headers, body, timeout = captured[0]
    assert url == "https://generativelanguage.googleapis.com/v1beta/models/gemini-4-neon:generateContent"
    assert secret_key not in url
    assert headers["x-goog-api-key"] == secret_key
    assert timeout == 600
    assert body["generationConfig"] == {
        "responseMimeType": "application/json",
        "maxOutputTokens": 32768,
        "thinkingConfig": {"thinkingLevel": "high"},
        "temperature": 0.0,
    }
    assert "CODEBOOK" in body["systemInstruction"]["parts"][0]["text"]
    assert "DOC_TEXT" in body["contents"][0]["parts"][0]["text"]
    # API key must NEVER appear in persisted raw response
    assert secret_key not in json.dumps(raw)
    assert raw["provider"] == "gemini"
    assert raw["model"] == "gemini-4-neon"

    usage = analysis_module._accumulate_usage([raw], provider="gemini")
    assert usage["input_tokens"] == 12000
    assert usage["output_tokens"] == 450
    assert usage["thoughts_tokens"] == 1800
    assert usage["cache_read_input_tokens"] == 4000
    # Gemini promptTokenCount (12000) includes cachedContentTokenCount (4000):
    # uncached 8000 @ $1.25/M ($0.01) + cached 4000 @ $0.3125/M ($0.00125) + 2250 out/thoughts @ $10/M ($0.0225) = $0.03375
    assert usage["estimated_cost_usd"] == 0.03375


def test_gemini_client_retries_429_escalates_max_tokens_and_redacts_key(monkeypatch) -> None:
    slept: list[float] = []
    seen_max_outputs: list[int] = []

    class FakeResp:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    call_idx = {"n": 0}

    def fake_urlopen(request, timeout=None):
        call_idx["n"] += 1
        body = json.loads(request.data.decode("utf-8"))
        seen_max_outputs.append(body["generationConfig"]["maxOutputTokens"])
        if call_idx["n"] == 1:
            raise HTTPError(
                url=request.full_url,
                code=429,
                msg="Too Many Requests",
                hdrs={"Retry-After": "1"},
                fp=io.BytesIO(b"rate limit exceeded"),
            )
        return FakeResp()

    responses = [
        {"candidates": [{"finishReason": "MAX_TOKENS", "content": {"parts": [{"text": '{"partial":'}]}}]},
        {
            "candidates": [{"finishReason": "STOP", "content": {"parts": [{"text": '{"recovered": true}'}]}}],
            "usageMetadata": {"promptTokenCount": 500, "candidatesTokenCount": 100},
        },
    ]

    monkeypatch.setattr(analysis_module, "urlopen", fake_urlopen)
    monkeypatch.setattr(analysis_module.json, "load", lambda _r: responses.pop(0))
    monkeypatch.setattr(analysis_module.time, "sleep", lambda s: slept.append(s))

    client = analysis_module.GeminiAPIClient(api_key="SECRET-KEY-999", max_retries=2)
    parsed, _raw = analysis_module._call_structured_client(
        client,
        system_prompt="sys",
        user_prompt="usr",
        schema={},
        max_tokens=client.controls_max_tokens,  # 32768 -> escalates to 65536
    )
    assert parsed == {"recovered": True}
    assert slept == [1.0]
    assert seen_max_outputs == [32768, 32768, 65536]

    # Non-retryable 400 error redacts API key if echoed
    def fake_400(request, timeout=None):
        raise HTTPError(
            url=request.full_url,
            code=400,
            msg="Bad Request",
            hdrs={},
            fp=io.BytesIO(b"Invalid key SECRET-KEY-999"),
        )

    monkeypatch.setattr(analysis_module, "urlopen", fake_400)
    with pytest.raises(RuntimeError) as exc_info:
        client.create_json_response(system_prompt="s", user_prompt="u", schema={}, max_tokens=1024)
    assert "SECRET-KEY-999" not in str(exc_info.value)
    assert "[REDACTED]" in str(exc_info.value)


def test_provider_auto_selection_and_gemini_1m_single_pass_window(monkeypatch) -> None:
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

    # No keys configured -> explicit error
    with pytest.raises(ValueError, match="GEMINI_API_KEY"):
        analysis_module.create_llm_client()

    # Anthropic-only fallback uses modern default claude-opus-5-5
    monkeypatch.setenv("ANTHROPIC_API_KEY", "ant-test-key")
    anth = analysis_module.create_llm_client()
    assert isinstance(anth, analysis_module.ClaudeAPIClient)
    assert anth.model == "claude-opus-5-5"

    # When GEMINI_API_KEY is also set, auto prefers gemini-4-neon
    monkeypatch.setenv("GEMINI_API_KEY", "gem-test-key")
    gem = analysis_module.create_llm_client()
    assert isinstance(gem, analysis_module.GeminiAPIClient)
    assert gem.model == "gemini-4-neon"
    assert gem.effort == "medium"

    # Explicit override works
    anth_explicit = analysis_module.create_llm_client(provider="anthropic", model="claude-sonnet-4-6", effort="high")
    assert isinstance(anth_explicit, analysis_module.ClaudeAPIClient)
    assert anth_explicit.model == "claude-sonnet-4-6"
    assert anth_explicit.effort == "high"

    # 582k-char EU AI Act-scale document fits in 1 single pass under Gemini's 450k-token budget,
    # whereas Anthropic's 90k-token budget chunks it cleanly.
    sections = [
        parser_module.ParsedSection(
            heading=f"Article {i}",
            level=2,
            content=(f"Article {i} establishes obligations for high-risk artificial intelligence providers. " * 40),
        )
        for i in range(1, 180)
    ]
    mega_record = analysis_module.ParsedDocumentRecord(
        jurisdiction="european_union",
        document_id="eu_mega_statute",
        parsed_path=Path("data/parsed/european_union/eu_mega_statute/normalized.json"),
        parsed_document=parser_module.ParsedDocument(
            parser_version="0.3.0",
            title="EU Mega Statute",
            language="en",
            document_format="html",
            plain_text="\n\n".join(s.content for s in sections),
            sections=sections,
            warnings=[],
            source_artifact_path="data/raw/european_union/eu_mega_statute/source.html",
        ),
        raw_metadata={},
    )
    assert len(mega_record.parsed_document.plain_text) > 500_000
    gemini_chunks = analysis_module._chunk_document_for_analysis(
        mega_record,
        direct_max_chars=gem.direct_full_text_max_chars,
        chunk_max_chars=gem.chunk_max_chars,
        direct_max_tokens=gem.direct_full_text_max_tokens,
        chunk_max_tokens=gem.chunk_max_tokens,
    )
    anthropic_chunks = analysis_module._chunk_document_for_analysis(mega_record)
    assert len(gemini_chunks) == 1
    assert len(anthropic_chunks) >= 3


def test_verbatim_quote_snap_upgrades_approximate_and_respects_450_char_cap() -> None:
    plain_text = (
        "Article 1: ＡＩ providers shall implement a regu-\nlation compliant risk management system.\n"
        + ("Filler statutory detail clause. " * 20)
        + "Final penalty clause: non-compliance triggers administrative fines."
    )
    doc = DocumentAnalysis(
        source_id="snap_doc",
        title="Snap Test",
        language="en",
        policy_extraction=PolicyExtraction.model_validate(
            {
                "jurisdiction": "european_union",
                "issuing_body": "European Commission",
                "document_type": "legislation",
                "binding_strength": "binding_law",
                "safety_requirements": [
                    {
                        "label": "risk_assessment",
                        "confidence": 0.92,
                        "obligation_strength": "mandatory",
                        "evidence": [
                            # NFKC + PDF line-wrap hyphen mismatch -> snaps verbatim to plain_text[s:e]
                            {"quote": "AI providers shall implement a regulation compliant risk management system."},
                        ],
                    }
                ],
                "enforcement_mechanisms": [
                    {
                        "label": "civil_penalty",
                        "confidence": 0.9,
                        "evidence": [
                            # Ellipsis span spanning > 600 chars (>450 cap) -> stays approximate, not expanded >450 chars!
                            {
                                "quote": "Article 1: AI providers shall implement ... non-compliance triggers administrative fines."
                            },
                        ],
                    }
                ],
                "confidence": 0.91,
            }
        ),
        risk_framing=RiskFramingAnalysis.model_validate(
            {
                "dominant_frame": "consumer_public_safety",
                "secondary_frames": [],
                "frame_confidence": {"consumer_public_safety": 0.9},
                "rationale_summary": "Safety rationale.",
                "evidence_spans": [
                    {"quote": "completely hallucinated ungrounded sentence", "frame": "consumer_public_safety"},
                ],
            }
        ),
    )

    snapped, summary = analysis_module.ground_document_analysis(doc, plain_text, snap_to_verbatim=True)
    req_span = snapped.policy_extraction.safety_requirements[0].evidence[0]
    assert req_span.grounding_status == "verbatim"
    assert req_span.start_char is not None and req_span.end_char is not None
    assert plain_text[req_span.start_char : req_span.end_char] == req_span.quote
    assert "ＡＩ providers" in req_span.quote
    assert "regu-\nlation" in req_span.quote

    # >450-char ellipsis span was NOT blown up beyond cap
    enf_span = snapped.policy_extraction.enforcement_mechanisms[0].evidence[0]
    assert enf_span.grounding_status == "approximate"
    assert len(enf_span.quote) <= 450

    # Ungrounded span stays not_found
    frm_span = snapped.risk_framing.evidence_spans[0]
    assert frm_span.grounding_status == "not_found"
    assert frm_span.start_char is None
    assert summary["snapped_quotes"] == 1
    assert summary["exact_matches"] == 1
    assert summary["fuzzy_matches"] == 1
    assert summary["ungrounded_quotes"] == 1


def test_concurrent_workers_execution_is_thread_safe_and_preserves_order(tmp_path: Path, monkeypatch) -> None:
    parsed_dir = tmp_path / "parsed"
    raw_dir = tmp_path / "raw"
    analysis_dir = tmp_path / "analysis"
    doc_ids = ["doc_alpha", "doc_beta", "doc_gamma", "doc_delta"]

    for doc_id in doc_ids:
        (parsed_dir / "japan" / doc_id).mkdir(parents=True)
        (raw_dir / "japan" / doc_id).mkdir(parents=True)
        text = f"{doc_id}: Providers must conduct risk assessment and protect public safety across all AI systems. " * 4
        (parsed_dir / "japan" / doc_id / "normalized.json").write_text(
            json.dumps(
                {
                    "parser_version": "0.3.0",
                    "title": f"Document {doc_id}",
                    "language": "en",
                    "document_format": "html",
                    "plain_text": text,
                    "sections": [{"heading": "Main", "level": 1, "content": text}],
                    "warnings": [],
                    "source_artifact_path": f"data/raw/japan/{doc_id}/source.html",
                }
            ),
            encoding="utf-8",
            newline="\n",
        )
        (raw_dir / "japan" / doc_id / "metadata.json").write_text(
            json.dumps({"title": f"Document {doc_id}", "canonical_url": f"https://example.com/{doc_id}"}),
            encoding="utf-8",
            newline="\n",
        )

    monkeypatch.setattr(analysis_module, "PARSED_DATA_DIR", parsed_dir)
    monkeypatch.setattr(analysis_module, "RAW_DATA_DIR", raw_dir)
    monkeypatch.setattr(analysis_module, "ANALYSIS_DIR", analysis_dir)
    monkeypatch.setattr(
        analysis_module,
        "load_all_source_manifests",
        lambda: [_manifest_for("japan", doc_ids)],
    )

    seen_threads: set[int] = set()
    lock = threading.Lock()

    class ConcurrentMockClient:
        provider = "gemini"
        model = "gemini-4-neon"
        effort = "medium"
        temperature = 0.0

        def create_json_response(self, *, system_prompt, user_prompt, schema, max_tokens, system_prefix=None, cached_document_context=None):
            with lock:
                seen_threads.add(threading.get_ident())
            time.sleep(0.02)
            if "policy_metadata" in user_prompt:
                return (
                    {
                        "issuing_body": "METI",
                        "document_type": "legislation",
                        "binding_strength": "binding_law",
                        "publication_date": "2026-06-01",
                        "effective_date": None,
                        "covered_actors": ["providers"],
                        "covered_application_domains": ["general_purpose_models"],
                        "prohibited_practices": [],
                        "enforcement_authorities": ["METI"],
                        "compliance_deadlines": [],
                        "penalties_summary": None,
                        "implementation_notes": "Concurrent test.",
                        "confidence": 0.9,
                    },
                    {"usageMetadata": {"promptTokenCount": 100, "candidatesTokenCount": 30}},
                )
            if "policy_controls" in user_prompt:
                return (
                    {
                        "safety_requirements": [
                            {
                                "label": "risk_assessment",
                                "confidence": 0.9,
                                "obligation_strength": "mandatory",
                                "evidence": [{"quote": "Providers must conduct risk assessment"}],
                            }
                        ],
                        "enforcement_mechanisms": [
                            {
                                "label": "soft_enforcement",
                                "confidence": 0.8,
                                "evidence": [{"quote": "protect public safety across all AI systems"}],
                            }
                        ],
                    },
                    {"usageMetadata": {"promptTokenCount": 100, "candidatesTokenCount": 40}},
                )
            return (
                {
                    "dominant_frame": "consumer_public_safety",
                    "secondary_frames": [],
                    "frame_confidence": {
                        "existential_catastrophic": 0.0,
                        "national_security": 0.0,
                        "economic_competitiveness": 0.1,
                        "fundamental_rights": 0.1,
                        "social_stability": 0.0,
                        "innovation_enablement": 0.2,
                        "consumer_public_safety": 0.9,
                        "labor_transition": 0.0,
                    },
                    "frame_share": {
                        "existential_catastrophic": 0.0,
                        "national_security": 0.0,
                        "economic_competitiveness": 0.05,
                        "fundamental_rights": 0.05,
                        "social_stability": 0.0,
                        "innovation_enablement": 0.1,
                        "consumer_public_safety": 0.8,
                        "labor_transition": 0.0,
                    },
                    "rationale_summary": "Protects public safety.",
                    "evidence_spans": [{"quote": "protect public safety", "frame": "consumer_public_safety"}],
                },
                {"usageMetadata": {"promptTokenCount": 100, "candidatesTokenCount": 35}},
            )

    class ThreadSafeStore:
        def __init__(self) -> None:
            self.doc_ids: list[str] = []
            self.in_persist = False

        def persist_analysis_bundle(self, bundle) -> None:
            # Verify store_lock serializes persist calls across worker threads
            assert not self.in_persist
            self.in_persist = True
            time.sleep(0.01)
            self.doc_ids.append(bundle.document_id)
            self.in_persist = False

        def persist_jurisdiction_analysis_bundle(self, bundle) -> None:
            pass

    store = ThreadSafeStore()
    results = analysis_module.analyze_parsed_documents(
        jurisdiction="japan",
        client=ConcurrentMockClient(),
        store=store,
        workers=4,
    )
    doc_results = [r for r in results if "document_id" in r]
    assert [r["document_id"] for r in doc_results] == sorted(doc_ids)
    assert all(r["status"] == "analyzed" for r in doc_results)
    assert len(seen_threads) >= 2
    assert set(store.doc_ids) == set(doc_ids)
    for doc_id in doc_ids:
        saved = json.loads((analysis_dir / "japan" / doc_id / "document_analysis.json").read_text(encoding="utf-8"))
        assert saved["analysis_metadata"]["provider"] == "gemini"
        assert saved["analysis_metadata"]["model"] == "gemini-4-neon"


def test_pymupdf_primary_extractor_and_graceful_fallback(tmp_path: Path, monkeypatch) -> None:
    # Real PDF should use PyMuPDF as primary extractor when fitz is installed
    real_pdf = ROOT / "data" / "raw" / "japan" / "jp_social_principles_human_centric_ai" / "source.pdf"
    parsed_real = parser_module.parse_pdf_artifact(real_pdf, {"title": "Social Principles of Human-Centric AI"})
    assert parsed_real.extractor == "pymupdf"
    assert parsed_real.parser_version == "0.3.0"
    assert "AI" in parsed_real.plain_text

    # When PyMuPDF is unavailable, gracefully falls back to pypdf (or pdftotext)
    dummy_pdf = tmp_path / "fallback.pdf"
    dummy_pdf.write_bytes(b"%PDF-1.7\n")
    monkeypatch.setattr(
        parser_module,
        "_extract_pdf_sections_with_pymupdf",
        lambda _p: ([], ["pymupdf_unavailable"], None),
    )
    monkeypatch.setattr(
        parser_module,
        "_extract_pdf_sections_with_pdftotext",
        lambda _p: ([], ["pdftotext_unavailable"]),
    )
    monkeypatch.setattr(
        parser_module,
        "_extract_pdf_sections_with_pypdf",
        lambda _p: ([parser_module.ParsedSection(heading="Page 1", level=1, content="Fallback pypdf content.")], [], None),
    )
    parsed_fb = parser_module.parse_pdf_artifact(dummy_pdf, {"title": "Fallback Doc"})
    assert parsed_fb.extractor == "pypdf"
    assert "Fallback pypdf content." in parsed_fb.plain_text
    assert "pymupdf_unavailable" in parsed_fb.warnings

    # P0 regression: Wingdings PUA bullets (\uf06c) + Hancom \x07 markers must NEVER trigger fallback to empty pdftotext!
    bullet_heavy_text = ("\uf06c 人工知能安全ガイドラインの要点\n" * 100) + ("\x07 인공지능 안전성 기준 항목\n" * 50)
    monkeypatch.setattr(
        parser_module,
        "_extract_pdf_sections_with_pymupdf",
        lambda _p: ([parser_module.ParsedSection(heading="Page 1", level=1, content=bullet_heavy_text)], [], None),
    )
    monkeypatch.setattr(
        parser_module,
        "_extract_pdf_sections_with_pdftotext",
        lambda _p: ([], ["pdftotext_unavailable"]),
    )
    parsed_bullets = parser_module.parse_pdf_artifact(dummy_pdf, {"title": "CJK Bullet Guide"})
    assert parsed_bullets.extractor == "pymupdf"
    assert "人工知能安全ガイドラインの要点" in parsed_bullets.plain_text
    assert "인공지능 안전성 기준 항목" in parsed_bullets.plain_text
    assert "\uf06c" not in parsed_bullets.plain_text
    assert "\x07" not in parsed_bullets.plain_text
    assert "used_pdftotext_fallback" not in parsed_bullets.warnings


def test_cli_evaluate_gold_set_output_json_and_analyze_flags(tmp_path: Path, monkeypatch) -> None:
    out_json = tmp_path / "gold_results.json"
    cli_module.app(["evaluate-gold-set", str(ROOT / "data" / "eval" / "gold_set_v1.json"), "--output-json", str(out_json)])
    assert out_json.exists()
    data = json.loads(out_json.read_text(encoding="utf-8"))
    assert data["benchmark_status"] == "starter_v0.1_internal"
    assert data["evaluated_count"] == 5

    captured_kwargs: dict = {}

    def fake_analyze(**kwargs):
        captured_kwargs.update(kwargs)
        return []

    monkeypatch.setattr(cli_module, "analyze_parsed_documents", fake_analyze)
    cli_module.app(
        [
            "analyze-documents",
            "japan",
            "--provider",
            "gemini",
            "--model=gemini-4-neon",
            "--effort",
            "high",
            "--workers",
            "6",
            "--refresh",
        ]
    )
    assert captured_kwargs == {
        "jurisdiction": "japan",
        "document_id": None,
        "provider": "gemini",
        "model": "gemini-4-neon",
        "effort": "high",
        "workers": 6,
        "refresh_existing": True,
    }


def test_cli_ingest_document_analysis_grounds_validates_and_enforces_gate(
    tmp_path: Path,
    monkeypatch,
    capsys,
) -> None:
    parsed_dir = tmp_path / "parsed"
    raw_dir = tmp_path / "raw"
    analysis_dir = tmp_path / "analysis"
    doc_id = "kr_test_statute_2026"

    (parsed_dir / "south_korea" / doc_id).mkdir(parents=True)
    (raw_dir / "south_korea" / doc_id).mkdir(parents=True)
    plain_text = (
        "제1조(목적) 이 법은 인공지능의 건전한 발전과 신뢰 기반 조성에 필요한 사항을 규정함으로써 "
        "국민의 권익과 존엄성을 보호하고 국가경쟁력을 강화함을 목적으로 한다.\n"
        "제32조(고영향 인공지능 사업자의 책무) 인공지능사업자는 위험관리방안을 수립·운영하여야 하며, "
        "과학기술정보통신부장관은 위반 시 시정명령을 할 수 있다."
    )
    (parsed_dir / "south_korea" / doc_id / "normalized.json").write_text(
        json.dumps(
            {
                "parser_version": "0.3.0",
                "title": "Test Korean AI Statute",
                "language": "ko",
                "document_format": "html",
                "plain_text": plain_text,
                "sections": [{"heading": "제1조", "level": 3, "content": plain_text}],
                "warnings": [],
                "source_artifact_path": f"data/raw/south_korea/{doc_id}/source.html",
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
        newline="\n",
    )
    (raw_dir / "south_korea" / doc_id / "metadata.json").write_text(
        json.dumps(
            {
                "title": "Test Korean AI Statute",
                "language": "ko",
                "canonical_url": "https://www.law.go.kr/test",
            }
        ),
        encoding="utf-8",
        newline="\n",
    )

    monkeypatch.setattr(analysis_module, "PARSED_DATA_DIR", parsed_dir)
    monkeypatch.setattr(analysis_module, "RAW_DATA_DIR", raw_dir)
    monkeypatch.setattr(analysis_module, "ANALYSIS_DIR", analysis_dir)
    monkeypatch.setattr(
        analysis_module,
        "load_all_source_manifests",
        lambda: [_manifest_for("south_korea", [doc_id])],
    )

    # 1) Grounding gate failure must exit non-zero, list exact ungrounded quotes, and write NO files.
    bad_input = tmp_path / "bad_analysis.json"
    bad_payload = {
        "policy_extraction": {
            "issuing_body": "National Assembly of the Republic of Korea",
            "document_type": "legislation",
            "binding_strength": "binding_law",
            "publication_date": "2026-01-22",
            "effective_date": "2026-01-22",
            "covered_actors": ["AI operators"],
            "covered_application_domains": ["general_purpose_models"],
            "prohibited_practices": [],
            "safety_requirements": [
                {
                    "label": "risk_assessment",
                    "confidence": 0.92,
                    "obligation_strength": "mandatory",
                    "evidence": [
                        {
                            "quote": "completely fabricated nonexistent sentence that never appears anywhere",
                            "source_section": "Article 32",
                            "quote_en": "Fabricated quote",
                        }
                    ],
                }
            ],
            "enforcement_mechanisms": [
                {
                    "label": "regulatory_supervision",
                    "confidence": 0.9,
                    "evidence": [
                        {
                            "quote": "과학기술정보통신부장관은 위반 시 시정명령을 할 수 있다.",
                            "source_section": "Article 32",
                            "quote_en": "The Minister of MSIT may issue corrective orders upon violation.",
                        }
                    ],
                }
            ],
            "enforcement_authorities": ["Ministry of Science and ICT"],
            "compliance_deadlines": [],
            "penalties_summary": None,
            "implementation_notes": "Test bad grounding.",
            "confidence": 0.9,
        },
        "risk_framing": {
            "dominant_frame": "fundamental_rights",
            "secondary_frames": ["economic_competitiveness"],
            "frame_confidence": {
                "existential_catastrophic": 0.0,
                "national_security": 0.0,
                "economic_competitiveness": 0.7,
                "fundamental_rights": 0.85,
                "social_stability": 0.0,
                "innovation_enablement": 0.4,
                "consumer_public_safety": 0.3,
                "labor_transition": 0.0,
            },
            "frame_share": {
                "existential_catastrophic": 0.0,
                "national_security": 0.0,
                "economic_competitiveness": 0.3,
                "fundamental_rights": 0.5,
                "social_stability": 0.0,
                "innovation_enablement": 0.2,
                "consumer_public_safety": 0.0,
                "labor_transition": 0.0,
            },
            "rationale_summary": "Balances rights protection with national competitiveness.",
            "evidence_spans": [
                {
                    "quote": "국민의 권익과 존엄성을 보호하고 국가경쟁력을 강화함을 목적으로 한다.",
                    "source_section": "Article 1",
                    "quote_en": "Aims to protect citizens' rights and dignity and strengthen national competitiveness.",
                    "frame": "fundamental_rights",
                }
            ],
        },
    }
    bad_input.write_text(json.dumps(bad_payload, ensure_ascii=False), encoding="utf-8", newline="\n")

    with pytest.raises(SystemExit) as exc_info:
        cli_module.app(
            [
                "ingest-document-analysis",
                "south_korea",
                doc_id,
                str(bad_input),
                "--min-grounding=0.90",
            ]
        )
    assert exc_info.value.code == 1
    captured = capsys.readouterr()
    assert "completely fabricated nonexistent sentence" in captured.err
    assert not (analysis_dir / "south_korea" / doc_id / "document_analysis.json").exists()

    # 2) Valid v2.1.0 ingestion snaps quotes, stamps authentic provenance, validates schema, and removes stale files.
    target_dir = analysis_dir / "south_korea" / doc_id
    target_dir.mkdir(parents=True, exist_ok=True)
    for stale in (
        "analysis_skipped.json",
        "policy_response.raw.json",
        "framing_response.raw.json",
        "policy_metadata.json",
        "policy_controls.json",
    ):
        (target_dir / stale).write_text("{}", encoding="utf-8", newline="\n")

    good_payload = json.loads(json.dumps(bad_payload))
    good_payload["policy_extraction"]["safety_requirements"][0]["evidence"][0]["quote"] = (
        "인공지능사업자는 위험관리방안을 수립·운영하여야 하며"
    )
    good_input = tmp_path / "good_analysis.json"
    good_input.write_text(json.dumps(good_payload, ensure_ascii=False), encoding="utf-8", newline="\n")

    cli_module.app(
        [
            "ingest-document-analysis",
            "south_korea",
            doc_id,
            str(good_input),
            "--provider=gemini",
            "--model=gemini-4-neon",
            "--effort=xhigh",
            "--min-grounding=0.90",
        ]
    )
    out = capsys.readouterr().out
    assert "-> ingested" in out
    assert "gemini-4-neon/xhigh" in out

    doc_path = target_dir / "document_analysis.json"
    assert doc_path.exists()
    assert (target_dir / "policy_extraction.json").exists()
    assert (target_dir / "risk_framing.json").exists()
    assert b"\r\n" not in doc_path.read_bytes()
    for stale in (
        "analysis_skipped.json",
        "policy_response.raw.json",
        "framing_response.raw.json",
        "policy_metadata.json",
        "policy_controls.json",
    ):
        assert not (target_dir / stale).exists()

    saved = json.loads(doc_path.read_text(encoding="utf-8"))
    meta = saved["analysis_metadata"]
    assert meta["provider"] == "gemini"
    assert meta["model"] == "gemini-4-neon"
    assert meta["effort"] == "xhigh"
    assert meta["taxonomy_version"] == "2.1.0"
    assert meta["chunk_count"] == 1
    assert meta["usage"]["total_chars"] == len(plain_text)
    assert meta["grounding_summary"]["grounding_ratio"] == 1.0
    assert meta["grounding_summary"]["exact_ratio"] == 1.0
    assert saved["policy_extraction"]["safety_requirements"][0]["evidence"][0]["grounding_status"] == "verbatim"
    assert saved["policy_extraction"]["safety_requirements"][0]["evidence"][0]["start_char"] is not None


def test_parser_strips_cac_nav_breadcrumb_and_footer_chrome(tmp_path: Path) -> None:
    cac_html = """<!doctype html>
<html lang="zh">
<head><title>人工智能拟人化互动服务管理暂行办法</title></head>
<body>
  <div class="header">
    <div class="top-nav"><ul id="nav" class="nav clearfix">
      <li id="central" class="nLi"><h3><a>时政要闻</a></h3></li>
      <li class="nLi"><h3><a>网信政务</a></h3></li>
      <li class="nLi"><h3><a>互动服务</a></h3></li>
      <li class="nLi"><h3><a>热点专题</a></h3></li>
    </ul></div>
  </div>
  <div class="current-path"><p>当前位置： 首页 &gt; 正文</p></div>
  <div class="mobile-header"><p>首页 时政要闻 网信政务 互动服务 热点专题</p></div>
  <div class="main">
    <div class="main-content">
      <div id="BodyLabel">
        <p>第一条 为了促进人工智能拟人化互动服务健康发展和规范应用，维护国家安全和社会公共利益，制定本办法。</p>
        <p>第二条 在中华人民共和国境内向公众提供拟人化互动服务，适用本办法。</p>
      </div>
    </div>
  </div>
  <div class="footer"><div class="foot">
    <p>中央网络安全和信息化委员会办公室</p>
    <p>中华人民共和国国家互联网信息办公室 © 版权所有</p>
    <p>联系我们 承办：国家互联网应急中心 技术支持：长安通信科技有限责任公司</p>
    <p><a>京ICP备14042428号</a> <a>京公网安备11040102700108号</a></p>
  </div></div>
  <div class="right-nav"><ul><li class="top"><h6>返回顶部</h6></li></ul></div>
  <div class="footer mobile-footer"><p>京ICP备14042428号</p><p class="picture"><a><span class="pc">PC版</span></a></p></div>
</body>
</html>"""
    html_path = tmp_path / "source.html"
    html_path.write_text(cac_html, encoding="utf-8", newline="\n")
    parsed = parser_module.parse_html_artifact(
        html_path,
        {"title": "人工智能拟人化互动服务管理暂行办法", "language": "zh"},
    )
    assert "为了促进人工智能拟人化互动服务健康发展和规范应用" in parsed.plain_text
    assert "在中华人民共和国境内向公众提供拟人化互动服务" in parsed.plain_text
    for forbidden in ("当前位置", "时政要闻", "网信政务", "热点专题", "京ICP备", "返回顶部", "PC版", "联系我们"):
        assert forbidden not in parsed.plain_text
        assert all(forbidden not in section.heading for section in parsed.sections)
