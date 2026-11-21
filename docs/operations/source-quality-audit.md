# Source Quality Audit

This file is generated from the seeded corpus plus parsed and analyzed artifacts.

- Generated at: `2026-11-21T06:30:45.183905+00:00`
- JSON mirror: `data/source_tracking/source_quality_audit.json`

## Global Recommendations

| Action | Jurisdiction | Score | Source tier | Document | Why flagged |
| --- | --- | ---: | --- | --- | --- |
| `remove_from_seed` | `european_union` | `24` | `implementation_resource` | `eu_ai_act_navigation_qa` | substantive document type; implementation-resource tier; substantive extracted text; title or notes indicate a substantive policy instrument; explicitly non-substantive or navigational; interpretive or Q&A companion value |
| `remove_from_seed` | `united_states` | `26` | `implementation_resource` | `us_technical_contributions_ai_governance_nist` | contextual or strategic document type; implementation-resource tier; context-heavy or companion-page language |
| `review_for_removal` | `japan` | `39` | `implementation_resource` | `jp_ai_q_a_pdf_493kb_1812c77d` | substantive document type; implementation-resource tier; substantive extracted text; title or notes indicate a substantive policy instrument; interpretive or Q&A companion value; off-topic document: zero AI governance keywords in title or text |
| `review_for_removal` | `united_states` | `40` | `implementation_resource` | `us_ai_congressional_mandates_executive_orders_nist` | contextual or strategic document type; implementation-resource tier; moderate extracted text; title or notes indicate a substantive policy instrument; context-heavy or companion-page language |
| `review_for_removal` | `south_korea` | `44` | `implementation_resource` | `kr_public_sector_ai_privacy_pia_items_2025` | substantive document type; implementation-resource tier; moderate extracted text; context-heavy or companion-page language |
| `review_for_removal` | `united_states` | `46` | `implementation_resource` | `us_ai_risk_management_framework_engage_nist_0abb57bc` | substantive document type; implementation-resource tier; title or notes indicate a substantive policy instrument; context-heavy or companion-page language |
| `review_for_removal` | `united_states` | `46` | `implementation_resource` | `us_crosswalks_to_the_nist_artificial_intelligence_r_8c897d8c` | substantive document type; implementation-resource tier; title or notes indicate a substantive policy instrument; context-heavy or companion-page language |
| `review_for_removal` | `japan` | `50` | `implementation_resource` | `jp_ai_act_2025_overview_en_pdf` | substantive document type; implementation-resource tier; title or notes indicate a substantive policy instrument; context-heavy or companion-page language; useful official translation |

## Source Repairs

| Jurisdiction | Link status | Action | Document | Issue |
| --- | --- | --- | --- | --- |
| `japan` | `resolved_to_different_asset` | `retarget_canonical_url` | `jp_aisi_red_teaming_guide_2025` | canonical URL resolves to a different document asset |
| `japan` | `resolved_to_different_asset` | `retarget_canonical_url` | `jp_aisi_evaluation_perspectives_guide_2026` | canonical URL resolves to a different document asset |
| `japan` | `resolved_to_different_asset` | `retarget_canonical_url` | `jp_ai_guidelines_for_business_ver_1_2_2026` | canonical URL resolves to a different document asset |
| `japan` | `resolved_to_different_asset` | `retarget_canonical_url` | `jp_hiroshima_ai_process_code_of_conduct_2023` | canonical URL resolves to a different document asset |
| `japan` | `resolved_to_different_asset` | `retarget_canonical_url` | `jp_second_basic_ai_plan_2026` | canonical URL resolves to a different document asset |
| `south_korea` | `resolved_to_different_asset` | `retarget_canonical_url` | `kr_high_impact_ai_determination_guideline_2026` | canonical URL resolves to a different document asset |
| `south_korea` | `resolved_to_updated_asset` | `refresh_canonical_url` | `kr_ai_safety_guideline_2026_draft` | canonical URL redirects to a different file asset |
| `united_states` | `resolved_to_different_asset` | `retarget_canonical_url` | `us_cfpb_chatbots_issue_spotlight_2023` | canonical URL resolves to a different document asset |
| `united_states` | `resolved_to_different_asset` | `retarget_canonical_url` | `us_nist_ai_rmf_playbook` | canonical URL resolves to a different document asset |
| `united_states` | `resolved_to_different_asset` | `retarget_canonical_url` | `us_nist_ir_8596_cyber_ai_profile_2025` | canonical URL resolves to a different document asset |
| `united_states` | `resolved_to_different_asset` | `retarget_canonical_url` | `us_take_it_down_act_2025` | canonical URL resolves to a different document asset |
| `china` | `direct_document` | `quality_check` | `cn_anthropomorphic_interaction_measures_2026` | low quote grounding (19/24 matched, ratio=0.79) |
| `china` | `direct_document` | `quality_check` | `cn_ai_content_labeling_measures_2025` | low quote grounding (5/7 matched, ratio=0.71) |
| `china` | `direct_document` | `quality_check` | `cn_ai_labeling_draft_2024` | low quote grounding (6/9 matched, ratio=0.67) |
| `european_union` | `resolved_to_different_page` | `quality_check` | `eu_code_practice_transparency_ai_content_2026` | canonical URL resolves to a different page |
| `european_union` | `resolved_to_different_page` | `quality_check` | `eu_article_50_transparency_guidelines_2026` | canonical URL resolves to a different page |
| `european_union` | `resolved_to_different_page` | `quality_check` | `eu_gpai_scope_obligations_guidelines_2025` | canonical URL resolves to a different page |
| `european_union` | `resolved_to_different_page` | `quality_check` | `eu_digital_omnibus_ai_regulation_2026_1744` | canonical URL resolves to a different page |
| `japan` | `direct_document` | `quality_check` | `jp_ai_q_a_pdf_493kb_1812c77d` | off-topic document: zero AI keywords detected |
| `south_korea` | `resolved_to_different_page` | `quality_check` | `kr_ai_basic_act_enforcement_decree` | canonical URL resolves to a different page |
| `united_states` | `resolved_to_different_page` | `quality_check` | `us_eo_14365_national_policy_framework_ai_2025` | canonical URL resolves to a different page |
| `united_states` | `resolved_to_different_page` | `quality_check` | `us_eo_14409_advanced_ai_innovation_security_2026` | canonical URL resolves to a different page |
| `united_states` | `resolved_to_different_page` | `quality_check` | `us_eo_14434_super_intelligence_2026` | canonical URL resolves to a different page |

## china

- Seed documents audited: `20`
- Actions: `keep_core=20`
- Buckets: `core=20`

| Action | Score | Tier | Link status | Link action | Document | Notes |
| --- | ---: | --- | --- | --- | --- | --- |
| `keep_core` | `100` | `statutory_rule` | `direct_document` | `n/a` | `cn_ai_content_labeling_measures_2025` | substantive document type; high-signal source tier; moderate extracted text; title or notes indicate a substantive policy instrument; low quote grounding (5/7 matched, ratio=0.71) |
| `keep_core` | `100` | `regulatory_guidance` | `direct_document` | `n/a` | `cn_ai_labeling_draft_2024` | substantive document type; high-signal source tier; moderate extracted text; title or notes indicate a substantive policy instrument; low quote grounding (6/9 matched, ratio=0.67) |
| `keep_core` | `106` | `statutory_rule` | `direct_document` | `n/a` | `cn_anthropomorphic_interaction_measures_2026` | substantive document type; high-signal source tier; substantive extracted text; title or notes indicate a substantive policy instrument; low quote grounding (19/24 matched, ratio=0.79) |

## european_union

- Seed documents audited: `21`
- Actions: `keep_core=16`, `keep_supporting=4`, `remove_from_seed=1`
- Buckets: `core=16`, `remove=1`, `supporting=4`

| Action | Score | Tier | Link status | Link action | Document | Notes |
| --- | ---: | --- | --- | --- | --- | --- |
| `remove_from_seed` | `24` | `implementation_resource` | `direct_document` | `n/a` | `eu_ai_act_navigation_qa` | substantive document type; implementation-resource tier; substantive extracted text; title or notes indicate a substantive policy instrument; explicitly non-substantive or navigational; interpretive or Q&A companion value |
| `keep_supporting` | `52` | `implementation_resource` | `direct_document` | `n/a` | `eu_ai_act_standardisation_page` | substantive document type; implementation-resource tier; moderate extracted text; title or notes indicate a substantive policy instrument; context-heavy or companion-page language |
| `keep_supporting` | `58` | `implementation_resource` | `direct_document` | `n/a` | `eu_training_content_public_summary_template_2025` | substantive document type; implementation-resource tier; substantive extracted text; title or notes indicate a substantive policy instrument; context-heavy or companion-page language |
| `keep_supporting` | `62` | `implementation_resource` | `direct_document` | `n/a` | `eu_training_content_template_faq_2025` | substantive document type; implementation-resource tier; substantive extracted text; title or notes indicate a substantive policy instrument; context-heavy or companion-page language; interpretive or Q&A companion value |
| `keep_supporting` | `64` | `voluntary_framework` | `direct_document` | `n/a` | `eu_gpai_code_safety_security_chapter_2025` | contextual or strategic document type; secondary source tier; substantive extracted text; title or notes indicate a substantive policy instrument; context-heavy or companion-page language |
| `keep_core` | `86` | `voluntary_framework` | `resolved_to_different_page` | `n/a` | `eu_code_practice_transparency_ai_content_2026` | contextual or strategic document type; secondary source tier; substantive extracted text; title or notes indicate a substantive policy instrument; canonical URL resolves to a different page |
| `keep_core` | `106` | `regulatory_guidance` | `resolved_to_different_page` | `n/a` | `eu_article_50_transparency_guidelines_2026` | substantive document type; high-signal source tier; substantive extracted text; title or notes indicate a substantive policy instrument; canonical URL resolves to a different page |
| `keep_core` | `106` | `regulatory_guidance` | `resolved_to_different_page` | `n/a` | `eu_gpai_scope_obligations_guidelines_2025` | substantive document type; high-signal source tier; substantive extracted text; title or notes indicate a substantive policy instrument; canonical URL resolves to a different page |
| `keep_core` | `118` | `statutory_rule` | `resolved_to_different_page` | `n/a` | `eu_digital_omnibus_ai_regulation_2026_1744` | substantive document type; high-signal source tier; substantive extracted text; title or notes indicate a substantive policy instrument; foundational policy framing or strategy document; canonical URL resolves to a different page |

## japan

- Seed documents audited: `34`
- Actions: `keep_core=29`, `keep_supporting=3`, `review_for_removal=2`
- Buckets: `context=2`, `core=29`, `supporting=3`

| Action | Score | Tier | Link status | Link action | Document | Notes |
| --- | ---: | --- | --- | --- | --- | --- |
| `review_for_removal` | `39` | `implementation_resource` | `direct_document` | `n/a` | `jp_ai_q_a_pdf_493kb_1812c77d` | substantive document type; implementation-resource tier; substantive extracted text; title or notes indicate a substantive policy instrument; interpretive or Q&A companion value; off-topic document: zero AI governance keywords in title or text; off-topic document: zero AI keywords detected |
| `review_for_removal` | `50` | `implementation_resource` | `direct_document` | `n/a` | `jp_ai_act_2025_overview_en_pdf` | substantive document type; implementation-resource tier; title or notes indicate a substantive policy instrument; context-heavy or companion-page language; useful official translation |
| `keep_supporting` | `56` | `implementation_resource` | `direct_document` | `n/a` | `jp_ai_expert_panel_c4f43cef` | contextual or strategic document type; implementation-resource tier; title or notes indicate a substantive policy instrument |
| `keep_supporting` | `60` | `implementation_resource` | `direct_document` | `n/a` | `jp_ai_72333136` | contextual or strategic document type; implementation-resource tier; substantive extracted text |
| `keep_supporting` | `62` | `implementation_resource` | `direct_document` | `n/a` | `jp_ai_68c2d8ca` | contextual or strategic document type; implementation-resource tier; moderate extracted text; title or notes indicate a substantive policy instrument |
| `keep_core` | `86` | `voluntary_framework` | `resolved_to_different_asset` | `retarget_canonical_url` | `jp_hiroshima_ai_process_code_of_conduct_2023` | contextual or strategic document type; secondary source tier; substantive extracted text; title or notes indicate a substantive policy instrument; canonical URL resolves to a different document asset |
| `keep_core` | `98` | `technical_standard` | `resolved_to_different_asset` | `retarget_canonical_url` | `jp_aisi_red_teaming_guide_2025` | substantive document type; high-signal source tier; substantive extracted text; canonical URL resolves to a different document asset |
| `keep_core` | `98` | `policy_strategy` | `resolved_to_different_asset` | `retarget_canonical_url` | `jp_second_basic_ai_plan_2026` | contextual or strategic document type; secondary source tier; substantive extracted text; title or notes indicate a substantive policy instrument; foundational policy framing or strategy document; canonical URL resolves to a different document asset |
| `keep_core` | `106` | `technical_standard` | `resolved_to_different_asset` | `retarget_canonical_url` | `jp_aisi_evaluation_perspectives_guide_2026` | substantive document type; high-signal source tier; substantive extracted text; title or notes indicate a substantive policy instrument; canonical URL resolves to a different document asset |
| `keep_core` | `106` | `technical_standard` | `resolved_to_different_asset` | `retarget_canonical_url` | `jp_ai_guidelines_for_business_ver_1_2_2026` | substantive document type; high-signal source tier; substantive extracted text; title or notes indicate a substantive policy instrument; canonical URL resolves to a different document asset |

## south_korea

- Seed documents audited: `17`
- Actions: `keep_core=15`, `keep_supporting=1`, `review_for_removal=1`
- Buckets: `context=1`, `core=15`, `supporting=1`

| Action | Score | Tier | Link status | Link action | Document | Notes |
| --- | ---: | --- | --- | --- | --- | --- |
| `review_for_removal` | `44` | `implementation_resource` | `direct_document` | `n/a` | `kr_public_sector_ai_privacy_pia_items_2025` | substantive document type; implementation-resource tier; moderate extracted text; context-heavy or companion-page language |
| `keep_supporting` | `52` | `implementation_resource` | `direct_document` | `n/a` | `kr_public_sector_ai_privacy_strengthening_2025` | substantive document type; implementation-resource tier; moderate extracted text; title or notes indicate a substantive policy instrument; context-heavy or companion-page language |
| `keep_core` | `106` | `statutory_rule` | `resolved_to_different_page` | `n/a` | `kr_ai_basic_act_enforcement_decree` | substantive document type; high-signal source tier; substantive extracted text; title or notes indicate a substantive policy instrument; canonical URL resolves to a different page |
| `keep_core` | `106` | `regulatory_guidance` | `resolved_to_updated_asset` | `refresh_canonical_url` | `kr_ai_safety_guideline_2026_draft` | substantive document type; high-signal source tier; substantive extracted text; title or notes indicate a substantive policy instrument; canonical URL redirects to a different file asset |
| `keep_core` | `110` | `regulatory_guidance` | `resolved_to_different_asset` | `retarget_canonical_url` | `kr_high_impact_ai_determination_guideline_2026` | substantive document type; high-signal source tier; substantive extracted text; title or notes indicate a substantive policy instrument; interpretive or Q&A companion value; canonical URL resolves to a different document asset |

## united_states

- Seed documents audited: `29`
- Actions: `keep_core=20`, `keep_supporting=5`, `remove_from_seed=1`, `review_for_removal=3`
- Buckets: `context=3`, `core=20`, `remove=1`, `supporting=5`

| Action | Score | Tier | Link status | Link action | Document | Notes |
| --- | ---: | --- | --- | --- | --- | --- |
| `remove_from_seed` | `26` | `implementation_resource` | `direct_document` | `n/a` | `us_technical_contributions_ai_governance_nist` | contextual or strategic document type; implementation-resource tier; context-heavy or companion-page language |
| `review_for_removal` | `40` | `implementation_resource` | `direct_document` | `n/a` | `us_ai_congressional_mandates_executive_orders_nist` | contextual or strategic document type; implementation-resource tier; moderate extracted text; title or notes indicate a substantive policy instrument; context-heavy or companion-page language |
| `review_for_removal` | `46` | `implementation_resource` | `direct_document` | `n/a` | `us_ai_risk_management_framework_engage_nist_0abb57bc` | substantive document type; implementation-resource tier; title or notes indicate a substantive policy instrument; context-heavy or companion-page language |
| `review_for_removal` | `46` | `implementation_resource` | `direct_document` | `n/a` | `us_crosswalks_to_the_nist_artificial_intelligence_r_8c897d8c` | substantive document type; implementation-resource tier; title or notes indicate a substantive policy instrument; context-heavy or companion-page language |
| `keep_supporting` | `52` | `implementation_resource` | `direct_document` | `n/a` | `us_from_principles_to_practice_ostp_the_white_house_8a01bf26` | substantive document type; implementation-resource tier; moderate extracted text; title or notes indicate a substantive policy instrument; context-heavy or companion-page language |
| `keep_supporting` | `52` | `implementation_resource` | `direct_document` | `n/a` | `us_roadmap_for_the_nist_artificial_intelligence_ris_bc6cf1d8` | substantive document type; implementation-resource tier; moderate extracted text; title or notes indicate a substantive policy instrument; context-heavy or companion-page language |
| `keep_supporting` | `56` | `implementation_resource` | `direct_document` | `n/a` | `us_ai_risk_management_framework_faqs_nist_56d7e05a` | substantive document type; implementation-resource tier; moderate extracted text; title or notes indicate a substantive policy instrument; context-heavy or companion-page language; interpretive or Q&A companion value |
| `keep_supporting` | `56` | `policy_strategy` | `resolved_to_different_asset` | `retarget_canonical_url` | `us_cfpb_chatbots_issue_spotlight_2023` | contextual or strategic document type; secondary source tier; substantive extracted text; context-heavy or companion-page language; canonical URL resolves to a different document asset |
| `keep_supporting` | `56` | `policy_strategy` | `direct_document` | `n/a` | `us_ftc_online_harms_ai_report_2022` | contextual or strategic document type; secondary source tier; substantive extracted text; context-heavy or companion-page language |
| `keep_core` | `80` | `executive_action` | `resolved_to_different_page` | `n/a` | `us_eo_14409_advanced_ai_innovation_security_2026` | substantive document type; substantive extracted text; canonical URL resolves to a different page |
| `keep_core` | `82` | `executive_action` | `resolved_to_different_page` | `n/a` | `us_eo_14434_super_intelligence_2026` | substantive document type; moderate extracted text; title or notes indicate a substantive policy instrument; canonical URL resolves to a different page |
| `keep_core` | `88` | `executive_action` | `resolved_to_different_page` | `n/a` | `us_eo_14365_national_policy_framework_ai_2025` | substantive document type; substantive extracted text; title or notes indicate a substantive policy instrument; canonical URL resolves to a different page |
| `keep_core` | `106` | `technical_standard` | `resolved_to_different_asset` | `retarget_canonical_url` | `us_nist_ai_rmf_playbook` | substantive document type; high-signal source tier; substantive extracted text; title or notes indicate a substantive policy instrument; canonical URL resolves to a different document asset |
| `keep_core` | `106` | `technical_standard` | `resolved_to_different_asset` | `retarget_canonical_url` | `us_nist_ir_8596_cyber_ai_profile_2025` | substantive document type; high-signal source tier; substantive extracted text; title or notes indicate a substantive policy instrument; canonical URL resolves to a different document asset |
| `keep_core` | `106` | `statutory_rule` | `resolved_to_different_asset` | `retarget_canonical_url` | `us_take_it_down_act_2025` | substantive document type; high-signal source tier; substantive extracted text; title or notes indicate a substantive policy instrument; canonical URL resolves to a different document asset |
