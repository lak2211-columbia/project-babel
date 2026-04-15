from observatory.source_promotion import build_seed_document_from_family, enrich_candidate_record


def test_enrich_candidate_record_extracts_html_metadata(monkeypatch) -> None:
    html = b"""
    <html lang="en-US">
      <head>
        <title>AI Safety Guidance</title>
        <meta property="article:published_time" content="2025-03-14" />
      </head>
      <body>
        <a href="/downloads/ai-safety-guidance.pdf">Download</a>
      </body>
    </html>
    """

    def fake_fetch(url: str, *, use_browser: bool = False) -> dict:
        return {
            "payload": html,
            "resolved_url": url,
            "status_code": 200,
            "content_type": "text/html; charset=utf-8",
            "headers": {},
            "transport": "http",
        }

    monkeypatch.setattr("observatory.source_promotion._fetch_candidate_payload", fake_fetch)

    enriched = enrich_candidate_record(
        candidate={"title": "AI Safety Guidance", "url": "https://example.com/guidance"},
        portal_languages=["en"],
    )

    assert enriched["publication_date"] == "2025-03-14"
    assert enriched["language"] == "en"
    assert enriched["document_format"] == "html"
    assert enriched["linked_pdf_urls"] == ["https://example.com/downloads/ai-safety-guidance.pdf"]


def test_build_seed_document_from_family_prefers_pdf_retrieval_urls() -> None:
    family = {
        "family_id": "title:ai risk management framework",
        "family_label": "ai risk management framework",
        "representative_title": "AI Risk Management Framework",
        "representative_url": "https://example.com/ai-rmf",
        "best_source_role": "primary_text",
        "best_recommendation": "promote_now",
        "coverage_bucket": "implementation_guidance",
        "proposed_document_type": "standards_guideline",
        "proposed_binding_strength": "standards_guideline",
        "proposed_source_tier": "technical_standard",
        "proposed_policy_domains": ["standards_assurance", "frontier_gpai"],
        "members": [
            {"url": "https://example.com/ai-rmf"},
            {"url": "https://example.com/ai-rmf.pdf"},
        ],
    }
    enrichment = {
        "resolved_url": "https://example.com/ai-rmf",
        "resolved_title": "AI Risk Management Framework",
        "publication_date": "2025-01-26",
        "language": "en",
        "linked_pdf_urls": ["https://example.com/ai-rmf.pdf"],
    }

    seed = build_seed_document_from_family(
        jurisdiction="united_states",
        portal_id="us_nist_rmf",
        portal_issuing_body="National Institute of Standards and Technology",
        portal_tags=["standards"],
        family=family,
        enrichment=enrichment,
    )

    assert seed["document_format"] == "pdf"
    assert seed["canonical_url"] == "https://example.com/ai-rmf"
    assert seed["retrieval_urls"] == ["https://example.com/ai-rmf.pdf"]
    assert seed["publication_date"] == "2025-01-26"
    assert seed["source_tier"] == "technical_standard"


def test_build_seed_document_from_family_falls_back_from_low_quality_pdf_title() -> None:
    family = {
        "family_id": "title:medical digital data ai guidance",
        "family_label": "medical digital data ai guidance",
        "representative_title": "Medical Digital Data AI Guidance",
        "representative_url": "https://example.com/medical-ai-guidance.pdf",
        "best_source_role": "primary_text",
        "best_recommendation": "inspect_next",
        "coverage_bucket": "implementation_guidance",
        "proposed_document_type": "regulatory_guidance",
        "proposed_binding_strength": "regulatory_guidance",
        "proposed_source_tier": "regulatory_guidance",
        "proposed_policy_domains": ["healthcare_medical_devices", "frontier_gpai"],
        "members": [
            {"url": "https://example.com/medical-ai-guidance.pdf"},
        ],
    }
    enrichment = {
        "resolved_url": "https://example.com/medical-ai-guidance.pdf",
        "resolved_title": "スライド 1",
        "publication_date": "2024-09-30",
        "language": "ja",
        "linked_pdf_urls": [],
    }

    seed = build_seed_document_from_family(
        jurisdiction="japan",
        portal_id="jp_mhlw_ai_health_data",
        portal_issuing_body="Ministry of Health, Labour and Welfare",
        portal_tags=["healthcare", "medical_data", "ai_research"],
        family=family,
        enrichment=enrichment,
    )

    assert seed["title"] == "Medical Digital Data AI Guidance"


def test_build_seed_document_from_family_uses_portal_slug_for_non_latin_numeric_titles() -> None:
    family = {
        "family_id": "title:non latin title",
        "family_label": "non latin title",
        "representative_title": "デジタル原則を踏まえた著作権法の規定の適用に係る解釈の明確化について（令和8年3月24日）",
        "representative_url": "https://example.com/94350404_01.pdf",
        "best_source_role": "primary_text",
        "best_recommendation": "inspect_next",
        "coverage_bucket": "implementation_guidance",
        "proposed_document_type": "regulatory_guidance",
        "proposed_binding_strength": "regulatory_guidance",
        "proposed_source_tier": "regulatory_guidance",
        "proposed_policy_domains": ["copyright_ip"],
        "members": [{"url": "https://example.com/94350404_01.pdf"}],
    }
    enrichment = {
        "resolved_url": "https://example.com/94350404_01.pdf",
        "resolved_title": "デジタル原則を踏まえた著作権法の規定の適用に係る解釈の明確化について（令和8年3月24日）",
        "publication_date": "2026-03-25",
        "language": "ja",
        "linked_pdf_urls": [],
    }

    seed = build_seed_document_from_family(
        jurisdiction="japan",
        portal_id="jp_bunka_copyright_ai",
        portal_issuing_body="Agency for Cultural Affairs",
        portal_tags=["copyright", "culture", "intellectual_property"],
        family=family,
        enrichment=enrichment,
    )

    assert seed["id"].startswith("jp_jp_bunka_copyright_ai_")
