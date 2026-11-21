import io
import json
from pathlib import Path
from urllib.error import HTTPError

import pytest

import observatory.analysis as analysis_module
import observatory.db as db_module
from observatory.models import (
    AnalysisProvenance,
    DocumentAnalysis,
    JurisdictionAnalysis,
    PolicyExtraction,
    RiskFramingAnalysis,
)
from observatory.parser import ParsedDocument, ParsedSection
from observatory.persistence import (
    build_analysis_persistence_bundle,
    build_jurisdiction_analysis_persistence_bundle,
)
from observatory.source_registry import JurisdictionManifest
from observatory.url_safety import normalize_date_for_db


def _sample_extraction(**overrides) -> PolicyExtraction:
    payload = {
        "jurisdiction": "european_union",
        "issuing_body": "European Commission",
        "document_type": "regulatory_guidance",
        "binding_strength": "regulatory_guidance",
        "publication_date": "2026-04",
        "effective_date": "2026",
        "covered_actors": ["providers"],
        "covered_application_domains": ["general_purpose_models"],
        "prohibited_practices": [],
        "safety_requirements": [
            {
                "label": "risk_assessment",
                "confidence": 0.9,
                "evidence": [{"quote": "Providers must conduct a risk assessment."}],
            }
        ],
        "enforcement_mechanisms": [
            {
                "label": "regulatory_supervision",
                "confidence": 0.85,
                "evidence": [{"quote": "Supervisory authorities oversee compliance."}],
            }
        ],
        "enforcement_authorities": ["European Commission"],
        "compliance_deadlines": ["2026-08-02"],
        "penalties_summary": None,
        "implementation_notes": "Operational guidance.",
        "confidence": 0.88,
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
            "fundamental_rights": 0.85,
            "social_stability": 0.1,
            "innovation_enablement": 0.3,
            "consumer_public_safety": 0.55,
            "labor_transition": 0.0,
        },
        "rationale_summary": "Protects fundamental rights and safety.",
        "evidence_spans": [{"quote": "protect fundamental rights"}],
    }
    payload.update(overrides)
    return RiskFramingAnalysis.model_validate(payload)


def test_partial_date_normalization_for_db() -> None:
    assert normalize_date_for_db("2025-03-14") == ("2025-03-14", "day")
    assert normalize_date_for_db("2026-04") == ("2026-04-01", "month")
    assert normalize_date_for_db("2025") == ("2025-01-01", "year")
    assert normalize_date_for_db("2025-02-30") == (None, None)
    assert normalize_date_for_db("not-a-date") == (None, None)


def test_persistence_bundle_normalizes_partial_dates_and_posix_paths() -> None:
    provenance = AnalysisProvenance(
        provider="anthropic",
        model="claude-sonnet-4-6",
        effort="low",
        analyzed_at="2026-11-20T12:00:00Z",
        analysis_version="0.3.0",
        taxonomy_version="2.1.0",
        taxonomy_hash="a" * 64,
        extraction_prompt_hash="b" * 64,
        framing_prompt_hash="c" * 64,
        input_sha256="d" * 64,
    )
    bundle = build_analysis_persistence_bundle(
        document_id="eu_sample",
        jurisdiction="european_union",
        title="EU Sample",
        canonical_url="https://example.com/eu",
        language="en",
        parser_version="0.3.0",
        raw_artifact_path="data\\raw\\european_union\\eu_sample\\source.html",
        normalized_text_path="data\\parsed\\european_union\\eu_sample\\normalized.json",
        normalized_text="Providers must conduct a risk assessment. Protect fundamental rights.",
        raw_metadata={},
        extraction=_sample_extraction(),
        framing=_sample_framing(),
        raw_policy_response={},
        raw_framing_response={},
        analysis_metadata=provenance,
        binding_strength="regulatory_guidance",
        sections=[{"heading": "Main", "level": 1, "content": "Text"}],
        parser_warnings=["empty_pdf_page:2"],
        source_tier="regulatory_guidance",
        corpus_role="primary_instrument",
        lifecycle_stage="active",
        grounding_ratio=1.0,
    )

    assert bundle.publication_date == "2026-04-01"
    assert bundle.publication_date_precision == "month"
    assert bundle.effective_date == "2026-01-01"
    assert "\\" not in bundle.normalized_text_path
    assert "\\" not in (bundle.raw_artifact_path or "")
    assert bundle.content_sha256 == "d" * 64
    assert bundle.binding_strength == "regulatory_guidance"
    assert bundle.analyzed_at == "2026-11-20T12:00:00Z"
    assert bundle.prompt_hashes == {"extraction": "b" * 64, "framing": "c" * 64}
    assert bundle.corpus_role == "primary_instrument"
    assert bundle.grounding_ratio == 1.0


def test_jurisdiction_fingerprint_is_idempotent_across_generated_at() -> None:
    base = {
        "jurisdiction": "japan",
        "analysis_method": "deterministic_v2",
        "analysis_version": "0.2.0",
        "generated_at": "2026-04-15T00:00:00Z",
        "source_count": 1,
        "source_document_ids": ["jp_doc"],
        "source_window_start": "2024-04",
        "source_window_end": "2025",
        "summary": "Summary",
        "governance_posture": "Posture",
        "framing_landscape": "Framing",
        "implementation_and_enforcement": "Impl",
        "source_coverage_note": "Coverage",
        "confidence": 0.85,
    }
    a1 = JurisdictionAnalysis.model_validate(base)
    a2 = JurisdictionAnalysis.model_validate({**base, "generated_at": "2026-11-20T12:34:56Z"})
    digest = {"jurisdiction": "japan", "source_count": 1}

    b1 = build_jurisdiction_analysis_persistence_bundle(analysis=a1, input_digest=digest)
    b2 = build_jurisdiction_analysis_persistence_bundle(analysis=a2, input_digest=digest)

    assert b1.analysis_fingerprint == b2.analysis_fingerprint
    assert b1.source_window_start == "2024-04-01"
    assert b1.source_window_end == "2025-01-01"


def test_analyze_and_persist_produce_identical_document_fingerprint(tmp_path: Path, monkeypatch) -> None:
    parsed_dir = tmp_path / "parsed"
    raw_dir = tmp_path / "raw"
    analysis_dir = tmp_path / "analysis"
    for root_dir in (parsed_dir, raw_dir):
        (root_dir / "european_union" / "eu_demo").mkdir(parents=True)

    text = (
        "Providers must conduct a risk assessment before placing high-risk AI systems on the market. "
        "Supervisory authorities oversee compliance to protect fundamental rights and consumer safety."
    )
    (parsed_dir / "european_union" / "eu_demo" / "normalized.json").write_text(
        json.dumps(
            {
                "parser_version": "0.2.0",
                "title": "EU Demo Guidance",
                "language": "en",
                "document_format": "html",
                "plain_text": text,
                "sections": [{"heading": "Article 1", "level": 1, "content": text}],
                "warnings": [],
                "source_artifact_path": "data/raw/european_union/eu_demo/source.html",
            }
        ),
        encoding="utf-8",
    )
    (raw_dir / "european_union" / "eu_demo" / "metadata.json").write_text(
        json.dumps(
            {
                "jurisdiction": "european_union",
                "document_id": "eu_demo",
                "title": "EU Demo Guidance",
                "canonical_url": "https://example.com/eu-demo",
                "publication_date": "2025-03-01",
                "language": "en",
            }
        ),
        encoding="utf-8",
    )

    manifest = JurisdictionManifest.model_validate(
        {
            "manifest_version": "2.0",
            "jurisdiction": "european_union",
            "description": "Fixture",
            "source_portals": [
                {
                    "id": "p",
                    "name": "P",
                    "issuing_body": "European Commission",
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
                    "id": "eu_demo",
                    "title": "EU Demo Guidance",
                    "issuing_body": "European Commission",
                    "canonical_url": "https://example.com/eu-demo",
                    "document_type": "regulatory_guidance",
                    "binding_strength": "regulatory_guidance",
                    "source_tier": "regulatory_guidance",
                    "corpus_role": "primary_instrument",
                    "lifecycle_stage": "active",
                    "publication_date": "2025-03-01",
                    "languages": ["en"],
                    "document_format": "html",
                    "source_portal_ids": ["p"],
                    "priority": "high",
                    "relevance_notes": "Fixture",
                }
            ],
        }
    )

    class FakeClient:
        provider = "anthropic"
        model = "claude-sonnet-4-6"
        effort = "low"
        temperature = 0.0

        def __init__(self) -> None:
            self.calls = 0

        def create_json_response(self, *, system_prompt, user_prompt, schema, max_tokens):
            self.calls += 1
            if self.calls == 1:
                return (
                    {
                        "issuing_body": "European Commission",
                        "document_type": "regulatory_guidance",
                        "binding_strength": "regulatory_guidance",
                        "publication_date": "2025-03-01",
                        "effective_date": None,
                        "covered_actors": ["providers"],
                        "covered_application_domains": ["general_purpose_models"],
                        "prohibited_practices": [],
                        "enforcement_authorities": ["European Commission"],
                        "compliance_deadlines": [],
                        "penalties_summary": None,
                        "implementation_notes": "Operational guidance.",
                        "confidence": 0.9,
                    },
                    {"model": "claude-sonnet-4-6", "usage": {"input_tokens": 100, "output_tokens": 50}},
                )
            if self.calls == 2:
                return (
                    {
                        "safety_requirements": [
                            {
                                "label": "risk_assessment",
                                "confidence": 0.9,
                                "evidence": [{"quote": "Providers must conduct a risk assessment"}],
                            }
                        ],
                        "enforcement_mechanisms": [
                            {
                                "label": "regulatory_supervision",
                                "confidence": 0.85,
                                "evidence": [{"quote": "Supervisory authorities oversee compliance"}],
                            }
                        ],
                    },
                    {"model": "claude-sonnet-4-6", "usage": {"input_tokens": 100, "output_tokens": 60}},
                )
            return (
                _sample_framing().model_dump(mode="json"),
                {"model": "claude-sonnet-4-6", "usage": {"input_tokens": 100, "output_tokens": 40}},
            )

    class CapturingStore:
        def __init__(self) -> None:
            self.doc_bundles = []
            self.jur_bundles = []

        def persist_analysis_bundle(self, bundle) -> None:
            self.doc_bundles.append(bundle)

        def persist_jurisdiction_analysis_bundle(self, bundle) -> None:
            self.jur_bundles.append(bundle)

    monkeypatch.setattr(analysis_module, "PARSED_DATA_DIR", parsed_dir)
    monkeypatch.setattr(analysis_module, "RAW_DATA_DIR", raw_dir)
    monkeypatch.setattr(analysis_module, "ANALYSIS_DIR", analysis_dir)
    monkeypatch.setattr(analysis_module, "load_all_source_manifests", lambda: [manifest])

    analyze_store = CapturingStore()
    replay_store = CapturingStore()

    analysis_module.analyze_parsed_documents(
        jurisdiction="european_union",
        client=FakeClient(),
        store=analyze_store,
    )
    analysis_module.persist_analysis_artifacts(
        jurisdiction="european_union",
        store=replay_store,
    )

    assert len(analyze_store.doc_bundles) == 1
    assert len(replay_store.doc_bundles) == 1
    assert analyze_store.doc_bundles[0].analysis_fingerprint == replay_store.doc_bundles[0].analysis_fingerprint
    assert analyze_store.jur_bundles[0].analysis_fingerprint == replay_store.jur_bundles[0].analysis_fingerprint


def test_validate_taxonomy_alignment_enforces_strict_invariants() -> None:
    ext = _sample_extraction()

    # Dominant frame duplicated in secondary_frames
    with pytest.raises(ValueError, match="must not also appear in secondary_frames"):
        analysis_module._validate_taxonomy_alignment(
            ext,
            _sample_framing(secondary_frames=["fundamental_rights"]),
        )

    # Dominant frame scored below another frame
    bad_scores = _sample_framing().frame_confidence
    bad_scores["fundamental_rights"] = 0.4
    bad_scores["innovation_enablement"] = 0.9
    with pytest.raises(ValueError, match="is scored below"):
        analysis_module._validate_taxonomy_alignment(
            ext,
            _sample_framing(frame_confidence=bad_scores),
        )

    # Duplicate requirement labels
    dup_ext = _sample_extraction(
        safety_requirements=[
            {"label": "risk_assessment", "confidence": 0.9, "evidence": [{"quote": "q1"}]},
            {"label": "risk_assessment", "confidence": 0.7, "evidence": [{"quote": "q2"}]},
        ]
    )
    with pytest.raises(ValueError, match="duplicate safety requirement"):
        analysis_module._validate_taxonomy_alignment(dup_ext, _sample_framing())

    # Empty evidence array rejected by model (A12)
    with pytest.raises(ValueError):
        _sample_extraction(
            safety_requirements=[
                {"label": "risk_assessment", "confidence": 0.9, "evidence": []},
            ]
        )

    # Unknown obligation_strength rejected
    bad_ob_ext = _sample_extraction(
        safety_requirements=[
            {
                "label": "risk_assessment",
                "confidence": 0.9,
                "obligation_strength": "super_mandatory",
                "evidence": [{"quote": "Providers must assess risks."}],
            }
        ]
    )
    with pytest.raises(ValueError, match="unknown obligation_strength"):
        analysis_module._validate_taxonomy_alignment(bad_ob_ext, _sample_framing())


def test_chunk_and_merge_long_documents() -> None:
    sections = [
        ParsedSection(heading=f"Chapter {i}", level=1, content=("Section content " + str(i) + " ") * 120)
        for i in range(1, 7)
    ]
    record = analysis_module.ParsedDocumentRecord(
        jurisdiction="european_union",
        document_id="eu_mega_law",
        parsed_path=Path("data/parsed/european_union/eu_mega_law/normalized.json"),
        parsed_document=ParsedDocument(
            parser_version="0.2.0",
            title="Mega Law",
            language="en",
            document_format="html",
            plain_text="\n\n".join(s.content for s in sections),
            sections=sections,
            warnings=[],
            source_artifact_path="data/raw/european_union/eu_mega_law/source.html",
        ),
        raw_metadata={},
    )
    chunks = analysis_module._chunk_document_for_analysis(
        record,
        direct_max_chars=4000,
        chunk_max_chars=3000,
        overlap_sections=1,
    )
    assert len(chunks) >= 3
    assert "Chapter 1" in chunks[0]
    assert "Chapter 6" in chunks[-1]

    merged_controls = analysis_module._merge_policy_controls_chunks(
        [
            analysis_module.PolicyControlsExtraction.model_validate(
                {
                    "safety_requirements": [
                        {"label": "risk_assessment", "confidence": 0.7, "evidence": [{"quote": "q1"}]},
                    ],
                    "enforcement_mechanisms": [
                        {"label": "none_specified", "confidence": 0.5, "evidence": [{"quote": "no sanctions"}]},
                    ],
                }
            ),
            analysis_module.PolicyControlsExtraction.model_validate(
                {
                    "safety_requirements": [
                        {"label": "risk_assessment", "confidence": 0.92, "evidence": [{"quote": "q2"}]},
                        {"label": "red_teaming", "confidence": 0.85, "evidence": [{"quote": "q3"}]},
                    ],
                    "enforcement_mechanisms": [
                        {"label": "civil_penalty", "confidence": 0.95, "evidence": [{"quote": "fine"}]},
                    ],
                }
            ),
        ]
    )
    req_map = {r.label: r for r in merged_controls.safety_requirements}
    assert set(req_map) == {"risk_assessment", "red_teaming"}
    assert req_map["risk_assessment"].confidence == 0.92
    assert len(req_map["risk_assessment"].evidence) == 2
    assert [m.label for m in merged_controls.enforcement_mechanisms] == ["civil_penalty"]


def test_claude_client_retries_529_and_detects_max_tokens(monkeypatch) -> None:
    slept: list[float] = []
    calls = {"count": 0}

    class FakeResp:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    def fake_urlopen(request, timeout=180):
        calls["count"] += 1
        body = json.loads(request.data.decode("utf-8"))
        assert body["temperature"] == 0.0
        assert isinstance(body["system"], list)
        assert body["system"][0]["cache_control"] == {"type": "ephemeral"}
        if calls["count"] == 1:
            raise HTTPError(
                url=request.full_url,
                code=529,
                msg="Overloaded",
                hdrs={"Retry-After": "2"},
                fp=io.BytesIO(b"overloaded"),
            )
        return FakeResp()

    monkeypatch.setattr(analysis_module, "urlopen", fake_urlopen)
    monkeypatch.setattr(analysis_module.time, "sleep", lambda seconds: slept.append(seconds))
    monkeypatch.setattr(
        analysis_module.json,
        "load",
        lambda _resp: {"stop_reason": "max_tokens", "content": [{"type": "text", "text": '{"partial":'}]},
    )

    client = analysis_module.ClaudeAPIClient(api_key="test-key", max_retries=2)
    with pytest.raises(RuntimeError, match="truncated at max_tokens"):
        client.create_json_response(
            system_prompt="sys",
            user_prompt="usr",
            schema={"type": "object", "properties": {}},
            max_tokens=100,
        )

    assert calls["count"] == 2
    assert slept == [2.0]


def test_grounding_scorer_and_institution_canonicalization() -> None:
    analysis = DocumentAnalysis(
        source_id="doc1",
        title="Doc",
        language="en",
        policy_extraction=_sample_extraction(),
        risk_framing=_sample_framing(),
    )
    plain_text = "Providers must conduct a risk assessment. Supervisory authorities oversee compliance."
    score = analysis_module.score_document_grounding(analysis, plain_text)
    assert score["total_quotes"] == 3
    assert score["exact_matches"] == 2
    assert score["ungrounded_quotes"] == 1
    assert score["grounding_ratio"] == round(2 / 3, 3)

    assert analysis_module._canonicalize_institution_name("NIST") == "National Institute of Standards and Technology (NIST)"
    assert analysis_module._canonicalize_institution_name("NIST Information Technology Laboratory (ITL)") == "National Institute of Standards and Technology (NIST)"
    assert analysis_module._canonicalize_institution_name("経済産業省") == "Ministry of Economy, Trade and Industry (METI)"
    assert analysis_module._canonicalize_institution_name("AI Office") == "European Commission (AI Office)"


def test_migration_004_statements_and_db_sync_guard(monkeypatch) -> None:
    migration_004 = db_module.MIGRATIONS_DIR / "004_observatory_hardening.sql"
    assert migration_004.exists()
    statements = db_module._split_migration_statements(migration_004.read_text(encoding="utf-8"))
    joined = "\n".join(statements)
    assert "document_snapshots" in joined
    assert "machine_policy_requirements_analysis_idx" in joined
    assert "machine_frame_scores_unique_idx" in joined
    assert "sections_json" in joined
    assert "corpus_role" in joined

    # Every migration file must split into purely executable SQL statements (zero comment-only chunks)
    migration_files = sorted(db_module.MIGRATIONS_DIR.glob("*.sql"))
    assert len(migration_files) >= 4
    for mig_file in migration_files:
        chunks = db_module._split_migration_statements(mig_file.read_text(encoding="utf-8"))
        assert chunks, f"{mig_file.name} yielded no statements"
        for idx, chunk in enumerate(chunks):
            non_comment_lines = [
                line.strip()
                for line in chunk.splitlines()
                if line.strip() and not line.strip().startswith("--")
            ]
            assert non_comment_lines, f"{mig_file.name} chunk {idx} is comment-only"

    # Explicit defensive check on splitter when a header or trailing comment is separated by -- statement-break
    assert db_module._split_migration_statements(
        "-- header comment only\n-- statement-break\nSELECT 1;\n-- statement-break\n-- trailing comment\n"
    ) == ["SELECT 1;"]

    # Mock Postgres connection for sync_database_to_source_manifests dry-run and max-delete-ratio guard
    executed: list[str] = []

    class FakeCursor:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def execute(self, sql, params=None):
            executed.append(sql.strip())

        def fetchall(self):
            return [("keep_1",), ("stale_1",), ("stale_2",)]

    class FakeConn:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def cursor(self):
            return FakeCursor()

    manifest = JurisdictionManifest.model_validate(
        {
            "manifest_version": "2.0",
            "jurisdiction": "japan",
            "description": "Fixture",
            "source_portals": [
                {
                    "id": "p",
                    "name": "P",
                    "issuing_body": "METI",
                    "canonical_url": "https://example.com",
                    "portal_kind": "portal",
                    "retrieval_strategy": "html",
                    "languages": ["ja"],
                    "priority": "high",
                    "coverage_notes": "Fixture",
                }
            ],
            "seed_documents": [
                {
                    "id": "keep_1",
                    "title": "Keep",
                    "issuing_body": "METI",
                    "canonical_url": "https://example.com/keep",
                    "document_type": "legislation",
                    "binding_strength": "binding_law",
                    "languages": ["ja"],
                    "document_format": "html",
                    "source_portal_ids": ["p"],
                    "priority": "high",
                    "relevance_notes": "Fixture",
                }
            ],
        }
    )

    monkeypatch.setattr(db_module, "connect", lambda _url: FakeConn())
    monkeypatch.setattr(db_module, "load_all_source_manifests", lambda: [manifest])

    # 2/3 (66.7%) > 20% guard must raise without --force
    with pytest.raises(ValueError, match="refusing to delete"):
        db_module.sync_database_to_source_manifests(
            "postgresql://fake",
            jurisdiction="japan",
            max_delete_ratio=0.20,
        )

    # Dry-run succeeds without executing DELETE
    executed.clear()
    dry = db_module.sync_database_to_source_manifests(
        "postgresql://fake",
        jurisdiction="japan",
        dry_run=True,
    )
    assert dry["dry_run"] is True
    assert dry["deleted_document_ids"] == ["stale_1", "stale_2"]
    assert not any("DELETE" in sql for sql in executed)

    # Force allows DELETE
    executed.clear()
    forced = db_module.sync_database_to_source_manifests(
        "postgresql://fake",
        jurisdiction="japan",
        force=True,
    )
    assert forced["dry_run"] is False
    assert any("DELETE FROM documents" in sql for sql in executed)


def test_apply_sql_migrations_checks_checksum_and_advisory_lock(tmp_path: Path, monkeypatch) -> None:
    mig_dir = tmp_path / "migrations"
    mig_dir.mkdir()
    mig_file = mig_dir / "001_init.sql"
    mig_file.write_text("CREATE TABLE foo (id INT);\n", encoding="utf-8")

    executed: list[str] = []
    stored_checksum = {"001_init.sql": "deadbeef"}

    class FakeCursor:
        def __init__(self) -> None:
            self._last_row = None

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def execute(self, sql, params=None):
            executed.append(sql.strip())
            if "SELECT checksum FROM schema_migrations" in sql:
                ver = params[0]
                self._last_row = (stored_checksum[ver],) if ver in stored_checksum else None

        def fetchone(self):
            return self._last_row

    class FakeConn:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def cursor(self):
            return FakeCursor()

    monkeypatch.setattr(db_module, "MIGRATIONS_DIR", mig_dir)
    monkeypatch.setattr(db_module, "connect", lambda _url: FakeConn())

    with pytest.raises(ValueError, match="migration checksum mismatch"):
        db_module.apply_sql_migrations("postgresql://fake")

    assert any("pg_advisory_xact_lock" in sql for sql in executed)
