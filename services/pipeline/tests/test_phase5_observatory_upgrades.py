from __future__ import annotations

import json
from pathlib import Path
from urllib.error import HTTPError

import pytest

from observatory import analysis as analysis_module
from observatory import cli as cli_module
from observatory import freshness as freshness_module
from observatory import parser as parser_module
from observatory.models import (
    AnalysisProvenance,
    DocumentAnalysis,
    EnforcementMechanism,
    EvidenceSpan,
    PolicyExtraction,
    RiskFramingAnalysis,
    SafetyRequirement,
)
from observatory.persistence import build_analysis_persistence_bundle
from observatory.source_registry import (
    ROOT,
    JurisdictionManifest,
    SeedDocument,
    SourcePortal,
    load_source_manifest,
)


def _sample_extraction_and_framing(
    *,
    jurisdiction: str = "united_states",
    binding_strength: str = "binding_law",
    dominant_frame: str = "consumer_public_safety",
    reqs: list[str] | None = None,
    enfs: list[str] | None = None,
) -> tuple[PolicyExtraction, RiskFramingAnalysis]:
    req_labels = reqs if reqs is not None else ["risk_assessment", "transparency_disclosure"]
    enf_labels = enfs if enfs is not None else ["civil_penalty"]
    extraction = PolicyExtraction(
        jurisdiction=jurisdiction,
        issuing_body="California Legislature",
        document_type="legislation",
        binding_strength=binding_strength,
        publication_date="2025-09-29",
        effective_date="2026-01-01",
        covered_actors=["frontier AI developers"],
        covered_application_domains=["general_purpose_models"],
        prohibited_practices=[],
        safety_requirements=[
            SafetyRequirement(
                label=label,
                confidence=0.9,
                obligation_strength="mandatory",
                evidence=[EvidenceSpan(quote="Frontier developers shall publish safety frameworks.")],
            )
            for label in req_labels
        ],
        enforcement_mechanisms=[
            EnforcementMechanism(
                label=label,
                confidence=0.9,
                evidence=[EvidenceSpan(quote="Violations are subject to civil penalties.")],
            )
            for label in enf_labels
        ],
        enforcement_authorities=["California Attorney General"],
        compliance_deadlines=[],
        penalties_summary="Civil penalties enforced by the Attorney General.",
        implementation_notes="Subnational state AI law.",
        confidence=0.92,
    )
    frame_conf = {
        "existential_catastrophic": 0.1,
        "national_security": 0.0,
        "economic_competitiveness": 0.1,
        "fundamental_rights": 0.2,
        "social_stability": 0.0,
        "innovation_enablement": 0.2,
        "consumer_public_safety": 0.2,
        "labor_transition": 0.0,
    }
    frame_conf[dominant_frame] = 0.9
    frame_share = {k: 0.0 for k in frame_conf}
    frame_share[dominant_frame] = 1.0
    framing = RiskFramingAnalysis(
        dominant_frame=dominant_frame,
        secondary_frames=[],
        frame_confidence=frame_conf,
        frame_share=frame_share,
        rationale_summary="Protects public safety around frontier AI deployment.",
        evidence_spans=[
            EvidenceSpan(
                quote="Frontier developers shall publish safety frameworks.",
                frame=dominant_frame,
            )
        ],
    )
    return extraction, framing


def test_subnational_overlay_manifest_and_supersedes_persistence(tmp_path: Path) -> None:
    manifest_payload = {
        "manifest_version": "1.0",
        "jurisdiction": "united_states",
        "description": "Test manifest with opt-in subnational overlay and supersedes lineage.",
        "source_portals": [
            {
                "id": "us_ca_leginfo",
                "name": "California Legislative Information",
                "issuing_body": "California Legislature",
                "issuer_type": "legal_registry",
                "canonical_url": "https://leginfo.legislature.ca.gov/",
                "portal_kind": "registry",
                "retrieval_strategy": "html",
                "languages": ["en"],
                "priority": "high",
                "coverage_notes": "Official California statutory portal.",
            }
        ],
        "seed_documents": [
            {
                "id": "us_ca_sb_53_tfaia_2025",
                "title": "California SB 53: Transparency in Frontier Artificial Intelligence Act",
                "issuing_body": "California Legislature",
                "canonical_url": "https://leginfo.legislature.ca.gov/faces/billNavClient.xhtml?bill_id=202520260SB53",
                "document_type": "legislation",
                "binding_strength": "binding_law",
                "source_tier": "statutory_rule",
                "corpus_role": "subnational_overlay",
                "subnational_unit": "  California  ",
                "supersedes_id": "us_ca_sb_1047_vetoed_2024",
                "policy_domains": ["frontier_gpai"],
                "lifecycle_stage": "active",
                "publication_date": "2025-09-29",
                "effective_date": "2026-01-01",
                "languages": ["en"],
                "document_format": "html",
                "source_portal_ids": ["us_ca_leginfo"],
                "priority": "high",
                "relevance_notes": "Opt-in California frontier AI statute.",
            }
        ],
    }
    manifest_path = tmp_path / "united_states.json"
    manifest_path.write_text(json.dumps(manifest_payload, indent=2) + "\n", encoding="utf-8", newline="\n")

    loaded = load_source_manifest(manifest_path)
    doc = loaded.seed_documents[0]
    assert doc.corpus_role == "subnational_overlay"
    assert doc.subnational_unit == "California"
    assert doc.supersedes_id == "us_ca_sb_1047_vetoed_2024"

    # Unknown corpus roles must still be rejected.
    bad_payload = json.loads(json.dumps(manifest_payload))
    bad_payload["seed_documents"][0]["corpus_role"] = "invalid_role_name"
    bad_path = tmp_path / "united_states.json"
    bad_path.write_text(json.dumps(bad_payload, indent=2) + "\n", encoding="utf-8", newline="\n")
    with pytest.raises(ValueError, match="unknown corpus role"):
        load_source_manifest(bad_path)

    # Persistence bundle carries corpus_role + subnational_unit + supersedes_id into raw_metadata without mutating caller dict.
    extraction, framing = _sample_extraction_and_framing()
    provenance = AnalysisProvenance(
        provider="gemini",
        model="gemini-4-neon",
        effort="xhigh",
        temperature=0.0,
        analyzed_at="2026-11-21T00:00:00Z",
        analysis_version="0.3.0",
        taxonomy_version="2.1.0",
        taxonomy_hash="taxhash",
        extraction_prompt_hash="exthash",
        framing_prompt_hash="frmhash",
        input_sha256="inphash",
    )
    caller_raw_metadata = {"title": doc.title, "retrieved_at": "2026-11-21T00:00:00Z"}
    bundle = build_analysis_persistence_bundle(
        document_id=doc.id,
        jurisdiction="united_states",
        title=doc.title,
        canonical_url=str(doc.canonical_url),
        language="en",
        parser_version="0.3.0",
        raw_artifact_path="data/raw/united_states/us_ca_sb_53_tfaia_2025/source.html",
        normalized_text_path="data/parsed/united_states/us_ca_sb_53_tfaia_2025/normalized.json",
        normalized_text="Frontier developers shall publish safety frameworks. Violations are subject to civil penalties.",
        raw_metadata=caller_raw_metadata,
        extraction=extraction,
        framing=framing,
        raw_policy_response={},
        raw_framing_response={},
        analysis_metadata=provenance,
        allow_legacy=False,
        binding_strength=doc.binding_strength,
        source_tier=doc.source_tier,
        corpus_role=doc.corpus_role,
        subnational_unit=doc.subnational_unit,
        supersedes_id=doc.supersedes_id,
        lifecycle_stage=doc.lifecycle_stage,
        grounding_ratio=1.0,
    )
    assert bundle.corpus_role == "subnational_overlay"
    assert bundle.raw_metadata["subnational_unit"] == "California"
    assert bundle.raw_metadata["supersedes_id"] == "us_ca_sb_1047_vetoed_2024"
    assert "subnational_unit" not in caller_raw_metadata
    assert "supersedes_id" not in caller_raw_metadata


def test_analyze_jurisdictions_excludes_subnational_overlay_by_default(tmp_path: Path, monkeypatch) -> None:
    parsed_dir = tmp_path / "parsed"
    raw_dir = tmp_path / "raw"
    analysis_dir = tmp_path / "analysis"

    docs = [
        ("us_fed_anchor", "primary_instrument", None),
        ("us_ca_sb_53_tfaia_2025", "subnational_overlay", "California"),
    ]
    seed_docs = []
    for doc_id, role, unit in docs:
        (parsed_dir / "united_states" / doc_id).mkdir(parents=True)
        (raw_dir / "united_states" / doc_id).mkdir(parents=True)
        (analysis_dir / "united_states" / doc_id).mkdir(parents=True)
        (parsed_dir / "united_states" / doc_id / "normalized.json").write_text(
            json.dumps(
                {
                    "parser_version": "0.3.0",
                    "title": doc_id,
                    "language": "en",
                    "document_format": "html",
                    "plain_text": "Frontier developers shall publish safety frameworks. Violations are subject to civil penalties.",
                    "sections": [{"heading": "Main", "level": 1, "content": "Frontier developers shall publish safety frameworks."}],
                    "warnings": [],
                    "source_artifact_path": f"data/raw/united_states/{doc_id}/source.html",
                }
            )
            + "\n",
            encoding="utf-8",
            newline="\n",
        )
        (raw_dir / "united_states" / doc_id / "metadata.json").write_text(
            json.dumps({"title": doc_id, "corpus_role": role, "subnational_unit": unit, "canonical_url": f"https://example.gov/{doc_id}"})
            + "\n",
            encoding="utf-8",
            newline="\n",
        )
        ext, frm = _sample_extraction_and_framing()
        da = DocumentAnalysis(
            source_id=doc_id,
            title=doc_id,
            language="en",
            policy_extraction=ext,
            risk_framing=frm,
        )
        (analysis_dir / "united_states" / doc_id / "document_analysis.json").write_text(
            da.model_dump_json(indent=2) + "\n",
            encoding="utf-8",
            newline="\n",
        )
        seed_docs.append(
            SeedDocument(
                id=doc_id,
                title=doc_id,
                issuing_body="Test Body",
                canonical_url=f"https://example.gov/{doc_id}",
                document_type="legislation",
                binding_strength="binding_law",
                corpus_role=role,
                subnational_unit=unit,
                lifecycle_stage="active",
                languages=["en"],
                document_format="html",
                source_portal_ids=["us_test"],
                priority="high",
                relevance_notes="Test",
            )
        )

    manifest = JurisdictionManifest(
        manifest_version="1.0",
        jurisdiction="united_states",
        description="Test",
        source_portals=[
            SourcePortal(
                id="us_test",
                name="Test",
                issuing_body="Test Body",
                canonical_url="https://example.gov/",
                portal_kind="portal",
                retrieval_strategy="html",
                languages=["en"],
                priority="high",
                coverage_notes="Test",
            )
        ],
        seed_documents=seed_docs,
    )
    monkeypatch.setattr(analysis_module, "PARSED_DATA_DIR", parsed_dir)
    monkeypatch.setattr(analysis_module, "RAW_DATA_DIR", raw_dir)
    monkeypatch.setattr(analysis_module, "ANALYSIS_DIR", analysis_dir)
    monkeypatch.setattr(analysis_module, "load_all_source_manifests", lambda: [manifest])

    analysis_module.analyze_jurisdictions(jurisdiction="united_states", refresh_existing=True)
    jur_data = json.loads((analysis_dir / "jurisdictions" / "united_states" / "jurisdiction_analysis.json").read_text(encoding="utf-8"))
    assert jur_data["source_count"] == 1
    assert jur_data["source_document_ids"] == ["us_fed_anchor"]


def test_parser_strips_korean_law_go_kr_header_boilerplate(tmp_path: Path) -> None:
    kr_html = """<!doctype html>
<html lang="ko">
<head><title>인공지능 발전과 신뢰 기반 조성 등에 관한 기본법 &gt; 법령 &gt; 본문 | 국가법령정보센터</title></head>
<body>
  <div id="bodyContent">
    <div id="contentBody" class="scr_ctrl contentBody">
      <div id="sideCenter" class="cont_area sideCenter">
        <div id="hisComment" class="pgroup">
          <p class="gtit">※ 본 법령은 공포 후 시행전 개정된 사항을 모두 포함한 법령이며, 개별 시행일별로 공포된 내용은 상단 메뉴의 '<a href="#">연혁</a>' 또는 조문 앞의 '<img alt="" />' 아이콘을 통해 확인할 수 있습니다.</p>
        </div>
        <div id="conScroll" class="scr_area conScroll">
          <div class="conTop">
            <h2>인공지능 발전과 신뢰 기반 조성 등에 관한 기본법<br/>( 약칭: 인공지능기본법 )</h2>
          </div>
          <div class="cont_subtit">
            <p>과학기술정보통신부(<a>인공지능안전신뢰정책과</a>), 044-202-6293</p>
          </div>
          <div class="lawcon">
            <p>제1조(목적) 이 법은 인공지능의 건전한 발전과 신뢰 기반 조성에 필요한 기본적인 사항을 규정함을 목적으로 한다.</p>
            <p>제2조(정의) 이 법에서 사용하는 용어의 뜻은 다음과 같다.</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>"""
    html_path = tmp_path / "source.html"
    html_path.write_text(kr_html, encoding="utf-8", newline="\n")

    parsed = parser_module.parse_html_artifact(
        html_path,
        {"title": "인공지능 발전과 신뢰 기반 조성 등에 관한 기본법", "language": "ko"},
    )
    assert "제1조(목적)" in parsed.plain_text
    assert "이 법은 인공지능의 건전한 발전과 신뢰 기반 조성에 필요한 기본적인 사항을 규정함을 목적으로 한다." in parsed.plain_text
    assert parsed.sections[0].heading == "제1조(목적)"
    for forbidden in ("※ 본 법령은", "아이콘을 통해 확인할 수 있습니다", "044-202-6293", "인공지능안전신뢰정책과"):
        assert forbidden not in parsed.plain_text
        assert all(forbidden not in section.heading for section in parsed.sections)


def test_evaluate_gold_set_per_jurisdiction_and_krippendorffs_alpha(
    tmp_path: Path,
    monkeypatch,
) -> None:
    # Exact nominal Krippendorff's alpha math check.
    assert analysis_module._krippendorffs_alpha_nominal([], []) is None
    assert analysis_module._krippendorffs_alpha_nominal(["a", "b"], ["a", "b"]) == 1.0
    assert analysis_module._krippendorffs_alpha_nominal(["a", "a"], ["a", "a"]) == 1.0
    # 4/5 agreement with combined marginals fr=3, ie=3, ss=4 -> Do=0.2, De=66/90 -> alpha=48/66=0.727
    assert (
        analysis_module._krippendorffs_alpha_nominal(
            ["fundamental_rights", "fundamental_rights", "social_stability", "innovation_enablement", "social_stability"],
            ["fundamental_rights", "innovation_enablement", "social_stability", "innovation_enablement", "social_stability"],
        )
        == 0.727
    )

    analysis_dir = tmp_path / "analysis"
    docs = [
        ("united_states", "us_doc_1", "en", "binding_law", "consumer_public_safety", ["risk_assessment"], ["civil_penalty"]),
        ("united_states", "us_doc_2", "en", "standards_guideline", "innovation_enablement", ["red_teaming"], ["soft_enforcement"]),
        ("european_union", "eu_doc_1", "en", "binding_law", "fundamental_rights", ["risk_assessment", "human_oversight"], ["civil_penalty"]),
        ("china", "cn_doc_1", "zh", "binding_law", "social_stability", ["content_provenance"], ["regulatory_supervision"]),
    ]
    for jur, doc_id, lang, bind, dom, reqs, enfs in docs:
        ext, frm = _sample_extraction_and_framing(
            jurisdiction=jur,
            binding_strength=bind,
            dominant_frame=dom,
            reqs=reqs,
            enfs=enfs,
        )
        da = DocumentAnalysis(
            source_id=doc_id,
            title=doc_id,
            language=lang,
            policy_extraction=ext,
            risk_framing=frm,
        )
        out_dir = analysis_dir / jur / doc_id
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "document_analysis.json").write_text(
            da.model_dump_json(indent=2) + "\n",
            encoding="utf-8",
            newline="\n",
        )

    gold_bundle = {
        "benchmark_id": "gold_set_v2_test",
        "benchmark_status": "stratified_v1.0_blind_internal",
        "taxonomy_version": "2.1.0",
        "created_at": "2026-11-21",
        "documents": [
            {
                "jurisdiction": "united_states",
                "document_id": "us_doc_1",
                "language": "en",
                "stratum": "binding_law",
                "binding_strength": "binding_law",
                "dominant_frame": "consumer_public_safety",
                "safety_requirements": ["risk_assessment"],
                "enforcement_mechanisms": ["civil_penalty"],
            },
            {
                "jurisdiction": "united_states",
                "document_id": "us_doc_2",
                "language": "en",
                "stratum": "standards_guideline",
                "binding_strength": "regulatory_guidance",  # mismatch
                "dominant_frame": "innovation_enablement",
                "safety_requirements": ["red_teaming", "access_controls"],  # 1 FN
                "enforcement_mechanisms": ["soft_enforcement"],
            },
            {
                "jurisdiction": "european_union",
                "document_id": "eu_doc_1",
                "language": "en",
                "stratum": "binding_law",
                "binding_strength": "binding_law",
                "dominant_frame": "fundamental_rights",
                "safety_requirements": ["risk_assessment", "human_oversight"],
                "enforcement_mechanisms": ["civil_penalty"],
            },
            {
                "jurisdiction": "china",
                "document_id": "cn_doc_1",
                "language": "zh",
                "stratum": "binding_law",
                "binding_strength": "binding_law",
                "dominant_frame": "consumer_public_safety",  # mismatch
                "safety_requirements": ["content_provenance"],
                "enforcement_mechanisms": ["regulatory_supervision"],
            },
        ],
    }
    gold_path = tmp_path / "gold_v2.json"
    gold_path.write_text(json.dumps(gold_bundle, indent=2) + "\n", encoding="utf-8", newline="\n")

    monkeypatch.setattr(analysis_module, "ANALYSIS_DIR", analysis_dir)
    report = analysis_module.evaluate_gold_set(gold_path, n_bootstrap=50, seed=7)

    assert report["evaluated_count"] == 4
    assert report["dominant_frame_accuracy"] == 0.75
    assert report["binding_strength_accuracy"] == 0.75
    assert isinstance(report["dominant_frame_krippendorffs_alpha"], float)
    assert isinstance(report["binding_strength_krippendorffs_alpha"], float)
    assert "dominant_frame_krippendorffs_alpha" in report["bootstrap_95_ci"]

    by_jur = report["by_jurisdiction"]
    assert set(by_jur.keys()) == {"china", "european_union", "united_states"}
    assert by_jur["united_states"]["evaluated_count"] == 2
    assert by_jur["united_states"]["dominant_frame_accuracy"] == 1.0
    assert by_jur["united_states"]["binding_strength_accuracy"] == 0.5
    assert by_jur["united_states"]["requirement_micro_precision"] == 1.0
    assert by_jur["united_states"]["requirement_micro_recall"] == 0.667
    assert by_jur["european_union"]["requirement_micro_f1"] == 1.0
    assert by_jur["china"]["dominant_frame_accuracy"] == 0.0
    assert report["details"][0]["stratum"] == "binding_law"
    assert report["details"][0]["language"] == "en"


def test_check_source_freshness_ssrf_head_fallback_drift_and_cli(
    tmp_path: Path,
    monkeypatch,
    capsys,
) -> None:
    manifest = JurisdictionManifest(
        manifest_version="1.0",
        jurisdiction="united_states",
        description="Freshness test manifest",
        source_portals=[
            SourcePortal(
                id="us_test",
                name="US Test Portal",
                issuing_body="Test Agency",
                canonical_url="https://example.gov/",
                portal_kind="portal",
                retrieval_strategy="html",
                languages=["en"],
                priority="high",
                coverage_notes="Test",
            )
        ],
        seed_documents=[
            SeedDocument(
                id="doc_unchanged",
                title="Unchanged Doc",
                issuing_body="Test Agency",
                canonical_url="https://example.gov/unchanged",
                document_type="legislation",
                binding_strength="binding_law",
                languages=["en"],
                document_format="html",
                source_portal_ids=["us_test"],
                priority="high",
                relevance_notes="Test",
            ),
            SeedDocument(
                id="doc_drifted_head405",
                title="Drifted Doc (HEAD 405 -> GET fallback)",
                issuing_body="Test Agency",
                canonical_url="https://example.gov/drifted",
                document_type="legislation",
                binding_strength="binding_law",
                languages=["en"],
                document_format="html",
                source_portal_ids=["us_test"],
                priority="high",
                relevance_notes="Test",
            ),
            SeedDocument(
                id="doc_blocked_403",
                title="WAF Blocked Doc",
                issuing_body="Test Agency",
                canonical_url="https://example.gov/blocked",
                document_type="legislation",
                binding_strength="binding_law",
                languages=["en"],
                document_format="html",
                source_portal_ids=["us_test"],
                priority="high",
                relevance_notes="Test",
            ),
            SeedDocument(
                id="doc_broken_404",
                title="Broken Doc",
                issuing_body="Test Agency",
                canonical_url="https://example.gov/missing",
                document_type="legislation",
                binding_strength="binding_law",
                languages=["en"],
                document_format="html",
                source_portal_ids=["us_test"],
                priority="high",
                relevance_notes="Test",
            ),
            SeedDocument(
                id="doc_ssrf_loopback",
                title="Unsafe SSRF URL",
                issuing_body="Test Agency",
                canonical_url="http://127.0.0.1/private-admin",
                document_type="legislation",
                binding_strength="binding_law",
                languages=["en"],
                document_format="html",
                source_portal_ids=["us_test"],
                priority="high",
                relevance_notes="Test",
            ),
        ],
    )

    raw_dir = tmp_path / "raw"
    retrieval_dir = tmp_path / "retrieval"
    (raw_dir / "united_states" / "doc_unchanged").mkdir(parents=True)
    unchanged_meta_path = raw_dir / "united_states" / "doc_unchanged" / "metadata.json"
    unchanged_meta_original = json.dumps({"etag": '"v1"', "last_modified": "Mon, 01 Jan 2026 00:00:00 GMT"}) + "\n"
    unchanged_meta_path.write_text(unchanged_meta_original, encoding="utf-8", newline="\n")

    (raw_dir / "united_states" / "doc_drifted_head405").mkdir(parents=True)
    (raw_dir / "united_states" / "doc_drifted_head405" / "metadata.json").write_text(
        json.dumps({"etag": '"old-etag"'}) + "\n",
        encoding="utf-8",
        newline="\n",
    )

    seen_requests: list[tuple[str, str, dict[str, str]]] = []

    class FakeResponse:
        def __init__(self, status: int, url: str, headers: dict[str, str]):
            self.status = status
            self._url = url
            self.headers = headers

        def geturl(self) -> str:
            return self._url

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    def fake_safe_urlopen(request, *, timeout: int = 15, resolve_dns: bool = True):
        method = request.get_method()
        url = request.full_url
        hdrs = {k.lower(): v for k, v in request.header_items()}
        seen_requests.append((method, url, hdrs))
        if url.endswith("/unchanged"):
            assert hdrs.get("if-none-match") == '"v1"'
            raise HTTPError(url, 304, "Not Modified", {}, None)
        if url.endswith("/drifted"):
            if method == "HEAD":
                raise HTTPError(url, 405, "Method Not Allowed", {}, None)
            assert method == "GET" and hdrs.get("range") == "bytes=0-0"
            return FakeResponse(206, url, {"ETag": '"new-etag"', "Last-Modified": "Fri, 20 Nov 2026 00:00:00 GMT"})
        if url.endswith("/blocked"):
            raise HTTPError(url, 403, "Forbidden", {}, None)
        if url.endswith("/missing"):
            raise HTTPError(url, 404, "Not Found", {}, None)
        raise AssertionError(f"unexpected URL opened: {url}")

    monkeypatch.setattr(freshness_module, "load_all_source_manifests", lambda: [manifest])
    monkeypatch.setattr(freshness_module, "safe_urlopen", fake_safe_urlopen)
    monkeypatch.setattr(freshness_module, "RAW_DATA_DIR", raw_dir)
    monkeypatch.setattr(freshness_module, "RETRIEVAL_DATA_DIR", retrieval_dir)

    out_json = tmp_path / "freshness_report.json"
    out_md = tmp_path / "freshness_report.md"
    report = freshness_module.check_source_freshness(
        jurisdiction="united_states",
        timeout=10,
        output_json_path=out_json,
        output_md_path=out_md,
        write_reports=True,
        max_workers=2,
        request_delay_seconds=0.0,
        resolve_dns=False,
    )

    assert report["checked_count"] == 5
    assert report["unchanged_count"] == 1
    assert report["drifted_count"] == 1
    assert report["blocked_count"] == 1
    assert report["unreachable_count"] == 2  # 404 + SSRF loopback
    assert report["has_actionable_drift"] is True
    assert all("127.0.0.1" not in url for _, url, _ in seen_requests)

    by_id = {entry["document_id"]: entry for entry in report["documents"]}
    assert by_id["doc_unchanged"]["freshness_status"] == "unchanged"
    assert by_id["doc_drifted_head405"]["freshness_status"] == "drifted"
    assert by_id["doc_drifted_head405"]["method"] == "GET"
    assert by_id["doc_drifted_head405"]["etag_changed"] is True
    assert by_id["doc_blocked_403"]["freshness_status"] == "blocked"
    assert by_id["doc_broken_404"]["freshness_status"] == "unreachable"
    assert by_id["doc_ssrf_loopback"]["freshness_status"] == "unreachable"
    assert "unsafe_url" in (by_id["doc_ssrf_loopback"]["error"] or "")

    assert out_json.exists() and b"\r\n" not in out_json.read_bytes()
    assert out_md.exists() and b"\r\n" not in out_md.read_bytes()
    assert "Drifted Official Sources" in out_md.read_text(encoding="utf-8")
    assert "Unreachable or Broken Official Sources" in out_md.read_text(encoding="utf-8")
    # Raw metadata was NEVER mutated!
    assert unchanged_meta_path.read_text(encoding="utf-8") == unchanged_meta_original

    # CLI flag wiring check
    captured: dict = {}

    def fake_check(**kwargs):
        captured.update(kwargs)
        return report

    monkeypatch.setattr(cli_module, "check_source_freshness", fake_check)
    cli_module.app(
        [
            "check-freshness",
            "--jurisdiction=united_states",
            "--timeout",
            "12",
            "--workers=3",
            "--no-write",
        ]
    )
    stdout = capsys.readouterr().out
    assert "freshness: checked=5" in stdout
    assert captured["jurisdiction"] == "united_states"
    assert captured["timeout"] == 12
    assert captured["max_workers"] == 3
    assert captured["write_reports"] is False


def test_freshness_watch_workflow_exists_and_is_secret_free() -> None:
    workflow_path = ROOT / ".github" / "workflows" / "freshness-watch.yml"
    assert workflow_path.exists()
    raw_bytes = workflow_path.read_bytes()
    assert b"\r\n" not in raw_bytes
    text = raw_bytes.decode("utf-8")
    assert 'cron: "0 6 * * 1"' in text
    assert "workflow_dispatch:" in text
    for cmd in ("validate-taxonomy", "validate-sources", "validate-artifacts", "check-grounding", "check-freshness"):
        assert cmd in text
    assert "actions/upload-artifact@v4" in text
    assert "freshness-watch" in text
    for secret_name in ("GEMINI_API_KEY", "ANTHROPIC_API_KEY", "DATABASE_URL"):
        assert secret_name not in text
