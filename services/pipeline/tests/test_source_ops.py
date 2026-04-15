from observatory.source_ops import (
    evaluate_candidate,
    existing_document_indexes,
    expected_coverage_buckets,
    family_id,
    family_signature,
    family_signature_matches,
    infer_source_role,
)
from observatory.source_registry import SourcePortal


def test_family_id_groups_language_variants() -> None:
    english = {
        "title": "Guidelines on prohibited AI practices (English)",
        "url": "https://example.com/guidelines-prohibited-ai-practices-en.pdf",
    }
    french = {
        "title": "Guidelines on prohibited AI practices (French)",
        "url": "https://example.com/guidelines-prohibited-ai-practices-fr.pdf",
    }

    assert family_id(english) == family_id(french)


def test_infer_source_role_distinguishes_hub_and_primary_text() -> None:
    assert infer_source_role(
        {
            "title": "Artificial Intelligence",
            "url": "https://example.com/policies/artificial-intelligence",
        }
    ) == "navigation_hub"
    assert infer_source_role(
        {
            "title": "Generative AI Medical Device Guidance",
            "url": "https://example.com/library/generative-ai-medical-device-guidance.pdf",
        }
    ) == "primary_text"


def test_evaluate_candidate_scores_primary_text_higher_than_press_release() -> None:
    portal = SourcePortal(
        id="test_portal",
        name="Test Portal",
        issuing_body="Test Ministry",
        issuer_type="regulator",
        canonical_url="https://example.com",
        portal_kind="portal",
        retrieval_strategy="html",
        languages=["en"],
        priority="high",
        coverage_notes="Test coverage",
        tags=["privacy"],
        discovery_targets=[],
    )
    primary = evaluate_candidate(
        candidate={
            "title": "AI Incident Reporting Guidance",
            "url": "https://example.com/library/ai-incident-reporting-guidance.pdf",
        },
        portal=portal,
        existing_urls=set(),
        existing_titles=set(),
        existing_family_labels=set(),
    )
    press = evaluate_candidate(
        candidate={
            "title": "Press release on AI incident reporting guidance",
            "url": "https://example.com/news/press-release-ai-incident-reporting-guidance",
        },
        portal=portal,
        existing_urls=set(),
        existing_titles=set(),
        existing_family_labels=set(),
    )

    assert primary["score"] > press["score"]
    assert primary["recommendation"] in {"promote_now", "inspect_next"}
    assert press["source_role"] == "press_release"


def test_evaluate_candidate_keeps_implementation_tools_out_of_seed_queue() -> None:
    portal = SourcePortal(
        id="test_portal",
        name="Test Portal",
        issuing_body="Test Ministry",
        issuer_type="executive",
        canonical_url="https://example.com",
        portal_kind="helpdesk",
        retrieval_strategy="html",
        languages=["en"],
        priority="medium",
        coverage_notes="Implementation support surface",
        tags=["implementation", "compliance"],
        discovery_targets=[],
    )

    candidate = evaluate_candidate(
        candidate={
            "title": "AI Act Explorer",
            "url": "https://example.com/ai-act-explorer",
        },
        portal=portal,
        existing_urls=set(),
        existing_titles=set(),
        existing_family_labels=set(),
    )

    assert candidate["source_role"] == "implementation_tool"
    assert candidate["recommendation"] == "context_only"


def test_evaluate_candidate_keeps_structural_pages_out_of_seed_queue() -> None:
    portal = SourcePortal(
        id="test_portal",
        name="Test Portal",
        issuing_body="Test Ministry",
        issuer_type="executive",
        canonical_url="https://example.com",
        portal_kind="portal",
        retrieval_strategy="html",
        languages=["ja"],
        priority="medium",
        coverage_notes="Strategy portal",
        tags=["governance"],
        discovery_targets=[],
    )

    meeting_status = evaluate_candidate(
        candidate={
            "title": "人工知能戦略推進会議 開催状況",
            "url": "https://example.com/ai_spc/ai_spc.html",
        },
        portal=portal,
        existing_urls=set(),
        existing_titles=set(),
        existing_family_labels=set(),
    )
    guideline_index = evaluate_candidate(
        candidate={
            "title": "各府省庁等のガイドライン等の一覧（概要）",
            "url": "https://example.com/ai_gl_list.pdf",
        },
        portal=portal,
        existing_urls=set(),
        existing_titles=set(),
        existing_family_labels=set(),
    )

    assert meeting_status["source_role"] == "navigation_hub"
    assert meeting_status["recommendation"] == "context_only"
    assert guideline_index["source_role"] == "download_index"
    assert guideline_index["recommendation"] == "context_only"


def test_expected_coverage_buckets_for_regulator_privacy_portal() -> None:
    portal = SourcePortal(
        id="privacy_regulator",
        name="Privacy Regulator",
        issuing_body="Privacy Regulator",
        issuer_type="regulator",
        canonical_url="https://example.com/privacy",
        portal_kind="library",
        retrieval_strategy="mixed",
        languages=["ja"],
        priority="high",
        coverage_notes="Privacy guidance and enforcement",
        tags=["privacy"],
        discovery_targets=[],
    )

    buckets = expected_coverage_buckets(portal)

    assert "implementation_guidance" in buckets
    assert "enforcement_interpretation" in buckets
    assert "sectoral_guidance" in buckets


def test_evaluate_candidate_marks_existing_family_as_existing_seed() -> None:
    portal = SourcePortal(
        id="test_portal",
        name="Test Portal",
        issuing_body="Test Ministry",
        issuer_type="standards_body",
        canonical_url="https://example.com",
        portal_kind="library",
        retrieval_strategy="mixed",
        languages=["en"],
        priority="high",
        coverage_notes="Test coverage",
        tags=["standards"],
        discovery_targets=[],
    )

    candidate = evaluate_candidate(
        candidate={
            "title": "Initial draft of the AI Risk Management Framework",
            "url": "https://example.com/library/initial-draft",
        },
        portal=portal,
        existing_urls=set(),
        existing_titles=set(),
        existing_family_labels={family_signature("initial draft of the ai risk management framework")},
    )

    assert candidate["status"] == "existing_seed"


def test_family_signature_matches_near_duplicate_seed_family() -> None:
    existing = {
        family_signature("The guidelines on prohibited artificial intelligence practices as defined by the AI Act"),
        family_signature("Guidelines on AI system definition to facilitate the first AI Act's rules application"),
    }

    assert family_signature_matches("Guidelines on prohibited AI practices under the AI Act", existing)
    assert family_signature_matches("Guidelines on the AI system definition of the AI Act", existing)
    assert not family_signature_matches("AI Act timeline", existing)


def test_evaluate_candidate_marks_wrapper_retrieval_url_as_existing_seed() -> None:
    portal = SourcePortal(
        id="test_portal",
        name="Test Portal",
        issuing_body="Test Ministry",
        issuer_type="executive",
        canonical_url="https://example.com",
        portal_kind="portal",
        retrieval_strategy="html",
        languages=["en"],
        priority="high",
        coverage_notes="Test coverage",
        tags=["gpai"],
        discovery_targets=[],
    )
    existing_urls, existing_titles, existing_family_labels = existing_document_indexes(
        [
            {
                "title": "Guidelines on prohibited AI practices",
                "canonical_url": "https://example.com/direct-guidelines.pdf",
                "retrieval_urls": ["https://example.com/library/guidelines-prohibited-ai-practices"],
            }
        ]
    )

    candidate = evaluate_candidate(
        candidate={
            "title": "Guidelines on prohibited AI practices",
            "url": "https://example.com/library/guidelines-prohibited-ai-practices",
        },
        portal=portal,
        existing_urls=existing_urls,
        existing_titles=existing_titles,
        existing_family_labels=existing_family_labels,
    )

    assert candidate["status"] == "existing_seed"
