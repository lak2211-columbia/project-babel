# Source Quality Audit

This file is generated from the seeded corpus plus parsed and analyzed artifacts.

- Generated at: `2026-11-21T02:27:35.387850+00:00`
- JSON mirror: `data/source_tracking/source_quality_audit.json`

## Global Recommendations

| Action | Jurisdiction | Score | Source tier | Document | Why flagged |
| --- | --- | ---: | --- | --- | --- |
| `review_for_removal` | `united_states` | `40` | `implementation_resource` | `us_ai_congressional_mandates_executive_orders_nist` | contextual or strategic document type; implementation-resource tier; moderate extracted text; title or notes indicate a substantive policy instrument; context-heavy or companion-page language |
| `review_for_removal` | `united_states` | `46` | `implementation_resource` | `us_crosswalks_to_the_nist_artificial_intelligence_r_8c897d8c` | substantive document type; implementation-resource tier; title or notes indicate a substantive policy instrument; context-heavy or companion-page language |
| `review_for_removal` | `united_states` | `48` | `implementation_resource` | `us_technical_contributions_ai_governance_nist` | contextual or strategic document type; implementation-resource tier |
| `review_for_removal` | `japan` | `50` | `implementation_resource` | `jp_ai_act_2025_overview_en_pdf` | substantive document type; implementation-resource tier; title or notes indicate a substantive policy instrument; context-heavy or companion-page language; useful official translation |

## Source Repairs

| Jurisdiction | Link status | Action | Document | Issue |
| --- | --- | --- | --- | --- |
| `south_korea` | `spa_shell_capture` | `refetch_with_browser` | `kr_ai_and_data_administration_act` | law.go.kr SPA shell capture (<500 chars, missing statutory articles '제1조'); low quote grounding (0/14 matched, ratio=0.00) |
| `south_korea` | `spa_shell_capture` | `refetch_with_browser` | `kr_ai_basic_act` | law.go.kr SPA shell capture (<500 chars, missing statutory articles '제1조'); low quote grounding (0/21 matched, ratio=0.00) |
| `south_korea` | `spa_shell_capture` | `refetch_with_browser` | `kr_ai_basic_act_enforcement_decree` | law.go.kr SPA shell capture (<500 chars, missing statutory articles '제1조'); low quote grounding (0/16 matched, ratio=0.00) |
| `china` | `direct_document` | `quality_check` | `cn_ai_safety_governance_framework_2024` | low quote grounding (2/28 matched, ratio=0.07) |
| `china` | `direct_document` | `quality_check` | `cn_ai_standardization_guide_2024` | low quote grounding (10/20 matched, ratio=0.50) |
| `european_union` | `direct_document` | `quality_check` | `eu_gpai_code_copyright_chapter_2025` | low quote grounding (11/19 matched, ratio=0.58) |
| `european_union` | `direct_document` | `quality_check` | `eu_gpai_code_safety_security_chapter_2025` | low quote grounding (20/28 matched, ratio=0.71) |
| `european_union` | `direct_document` | `quality_check` | `eu_gpai_code_transparency_chapter_2025` | low quote grounding (8/12 matched, ratio=0.67) |
| `european_union` | `direct_document` | `quality_check` | `eu_prohibited_ai_practices_guidelines` | low quote grounding (13/19 matched, ratio=0.68) |
| `european_union` | `direct_document` | `quality_check` | `eu_edps_genai_guidance_2025` | low quote grounding (17/25 matched, ratio=0.68) |
| `european_union` | `direct_document` | `quality_check` | `eu_edpb_ai_models_opinion_28_2024` | low quote grounding (7/20 matched, ratio=0.35) |
| `european_union` | `direct_document` | `quality_check` | `eu_ai_act_navigation_qa` | low quote grounding (20/25 matched, ratio=0.80) |
| `european_union` | `direct_document` | `quality_check` | `eu_request_for_an_article_64_2_opinion_from_efe0d88a` | low quote grounding (8/11 matched, ratio=0.73) |
| `european_union` | `direct_document` | `quality_check` | `eu_training_content_public_summary_template_2025` | low quote grounding (1/8 matched, ratio=0.12) |
| `european_union` | `direct_document` | `quality_check` | `eu_gpai_vademecum_2025` | low quote grounding (5/8 matched, ratio=0.62) |
| `japan` | `direct_document` | `quality_check` | `jp_ai_contract_checklist_2025` | low quote grounding (4/16 matched, ratio=0.25) |
| `japan` | `direct_document` | `quality_check` | `jp_ai_data_contract_guidelines_1_1_2019` | low quote grounding (0/4 matched, ratio=0.00) |
| `japan` | `direct_document` | `quality_check` | `jp_ai_guideline_2025_en_pdf` | low quote grounding (6/16 matched, ratio=0.38) |
| `japan` | `direct_document` | `quality_check` | `jp_social_principles_human_centric_ai` | low quote grounding (8/12 matched, ratio=0.67) |
| `japan` | `direct_document` | `quality_check` | `jp_medical_digital_data_ai_guideline_notice_2024` | low quote grounding (1/5 matched, ratio=0.20) |
| `japan` | `direct_document` | `quality_check` | `jp_medical_digital_data_ai_guideline_points_2024` | low quote grounding (2/10 matched, ratio=0.20) |
| `japan` | `direct_document` | `quality_check` | `jp_ai_q_a_pdf_493kb_1812c77d` | low quote grounding (1/10 matched, ratio=0.10) |
| `japan` | `direct_document` | `quality_check` | `jp_content_genai_guidebook_2024` | low quote grounding (1/17 matched, ratio=0.06) |
| `japan` | `direct_document` | `quality_check` | `jp_basic_ai_plan_page` | low quote grounding (6/24 matched, ratio=0.25) |
| `japan` | `direct_document` | `quality_check` | `jp_ai_expert_panel_c4f43cef` | low quote grounding (0/3 matched, ratio=0.00) |
| `japan` | `direct_document` | `quality_check` | `jp_ai_guideline_2025_page` | low quote grounding (1/22 matched, ratio=0.04) |
| `japan` | `direct_document` | `quality_check` | `jp_school_genai_guideline_ver_2_2024` | low quote grounding (2/20 matched, ratio=0.10) |
| `japan` | `direct_document` | `quality_check` | `jp_medical_digital_data_ai_guideline_2024` | low quote grounding (7/14 matched, ratio=0.50) |
| `japan` | `direct_document` | `quality_check` | `jp_university_genai_teaching_guidance_2023` | low quote grounding (0/8 matched, ratio=0.00) |
| `japan` | `direct_document` | `quality_check` | `jp_childcare_genai_handbook_2025` | low quote grounding (1/17 matched, ratio=0.06) |
| `japan` | `direct_document` | `quality_check` | `jp_ai_72333136` | low quote grounding (0/13 matched, ratio=0.00) |
| `japan` | `direct_document` | `quality_check` | `jp_genai_privacy_alert_2023` | low quote grounding (1/10 matched, ratio=0.10) |
| `japan` | `direct_document` | `quality_check` | `jp_ai_senryaku_5eb91d1a` | low quote grounding (4/17 matched, ratio=0.23) |
| `japan` | `direct_document` | `quality_check` | `jp_admin_genai_procurement_guideline_2025` | low quote grounding (1/18 matched, ratio=0.06) |
| `japan` | `direct_document` | `quality_check` | `jp_ai_copyright_thinking_2024` | low quote grounding (2/6 matched, ratio=0.33) |
| `japan` | `direct_document` | `quality_check` | `jp_kaigi_3537a511` | low quote grounding (0/10 matched, ratio=0.00) |
| `japan` | `direct_document` | `quality_check` | `jp_ai_68c2d8ca` | low quote grounding (1/12 matched, ratio=0.08) |
| `south_korea` | `direct_document` | `quality_check` | `kr_high_impact_ai_operator_obligations_guideline_2026` | low quote grounding (10/21 matched, ratio=0.48) |
| `south_korea` | `direct_document` | `quality_check` | `kr_public_sector_ai_privacy_strengthening_2025` | low quote grounding (6/12 matched, ratio=0.50) |
| `south_korea` | `direct_document` | `quality_check` | `kr_public_sector_hyperscale_ai_guideline_2_0` | low quote grounding (10/23 matched, ratio=0.43) |
| `south_korea` | `direct_document` | `quality_check` | `kr_public_sector_hyperscale_ai_guideline_2024` | low quote grounding (8/15 matched, ratio=0.53) |
| `south_korea` | `direct_document` | `quality_check` | `kr_genai_medical_device_guideline_2025` | low quote grounding (10/23 matched, ratio=0.43) |
| `south_korea` | `direct_document` | `quality_check` | `kr_genai_personal_data_guide_2025` | low quote grounding (10/26 matched, ratio=0.39) |
| `south_korea` | `direct_document` | `quality_check` | `kr_ai_basic_act_enforcement_decree_draft_notice_2025` | low quote grounding (13/16 matched, ratio=0.81) |
| `south_korea` | `direct_document` | `quality_check` | `kr_ai_safety_guideline_2026_draft` | low quote grounding (18/23 matched, ratio=0.78) |
| `south_korea` | `direct_document` | `quality_check` | `kr_ai_impact_assessment_guideline_2026` | low quote grounding (17/20 matched, ratio=0.85) |
| `south_korea` | `direct_document` | `quality_check` | `kr_public_personal_data_ai_guide_2024` | low quote grounding (14/20 matched, ratio=0.70) |
| `south_korea` | `direct_document` | `quality_check` | `kr_ai_privacy_risk_management_model_2024` | low quote grounding (5/14 matched, ratio=0.36) |
| `united_states` | `direct_document` | `quality_check` | `us_ai_risk_management_framework_initial_draft_march_fb5a1e0e` | low quote grounding (4/16 matched, ratio=0.25) |
| `united_states` | `direct_document` | `quality_check` | `us_nist_ai_rmf_1_0` | low quote grounding (11/23 matched, ratio=0.48) |
| `united_states` | `direct_document` | `quality_check` | `us_nist_genai_profile` | low quote grounding (16/29 matched, ratio=0.55) |
| `united_states` | `direct_document` | `quality_check` | `us_ai_bill_of_rights_blueprint_2022` | low quote grounding (12/15 matched, ratio=0.80) |
| `united_states` | `direct_document` | `quality_check` | `us_cfpb_chatbots_issue_spotlight_2023` | low quote grounding (0/7 matched, ratio=0.00) |
| `united_states` | `direct_document` | `quality_check` | `us_ftc_online_harms_ai_report_2022` | low quote grounding (15/20 matched, ratio=0.75) |
| `united_states` | `direct_document` | `quality_check` | `us_cfpb_circular_2022_03_complex_algorithms` | low quote grounding (8/11 matched, ratio=0.73) |
| `united_states` | `direct_document` | `quality_check` | `us_joint_statement_ai_discrimination_2023` | low quote grounding (7/11 matched, ratio=0.64) |
| `united_states` | `direct_document` | `quality_check` | `us_omb_m_25_21` | low quote grounding (12/23 matched, ratio=0.52) |
| `united_states` | `direct_document` | `quality_check` | `us_omb_m_25_22` | low quote grounding (14/22 matched, ratio=0.64) |
| `united_states` | `direct_document` | `quality_check` | `us_fda_ai_pccp_guidance_2025` | low quote grounding (17/28 matched, ratio=0.61) |
| `united_states` | `direct_document` | `quality_check` | `us_ai_action_plan_pdf` | low quote grounding (23/29 matched, ratio=0.79) |

## china

- Seed documents audited: `18`
- Actions: `keep_core=18`
- Buckets: `core=18`

| Action | Score | Tier | Link status | Link action | Document | Notes |
| --- | ---: | --- | --- | --- | --- | --- |
| `keep_core` | `106` | `technical_standard` | `direct_document` | `n/a` | `cn_ai_safety_governance_framework_2024` | substantive document type; high-signal source tier; substantive extracted text; title or notes indicate a substantive policy instrument; low quote grounding (2/28 matched, ratio=0.07) |
| `keep_core` | `106` | `technical_standard` | `direct_document` | `n/a` | `cn_ai_standardization_guide_2024` | substantive document type; high-signal source tier; substantive extracted text; title or notes indicate a substantive policy instrument; low quote grounding (10/20 matched, ratio=0.50) |

## european_union

- Seed documents audited: `18`
- Actions: `keep_core=14`, `keep_supporting=4`
- Buckets: `core=14`, `supporting=4`

| Action | Score | Tier | Link status | Link action | Document | Notes |
| --- | ---: | --- | --- | --- | --- | --- |
| `keep_supporting` | `52` | `implementation_resource` | `direct_document` | `n/a` | `eu_ai_act_standardisation_page` | substantive document type; implementation-resource tier; moderate extracted text; title or notes indicate a substantive policy instrument; context-heavy or companion-page language |
| `keep_supporting` | `58` | `implementation_resource` | `direct_document` | `n/a` | `eu_training_content_template_faq_2025` | substantive document type; implementation-resource tier; substantive extracted text; title or notes indicate a substantive policy instrument; context-heavy or companion-page language |
| `keep_supporting` | `58` | `implementation_resource` | `direct_document` | `n/a` | `eu_training_content_public_summary_template_2025` | substantive document type; implementation-resource tier; substantive extracted text; title or notes indicate a substantive policy instrument; context-heavy or companion-page language; low quote grounding (1/8 matched, ratio=0.12) |
| `keep_supporting` | `64` | `voluntary_framework` | `direct_document` | `n/a` | `eu_gpai_code_copyright_chapter_2025` | contextual or strategic document type; secondary source tier; substantive extracted text; title or notes indicate a substantive policy instrument; context-heavy or companion-page language; low quote grounding (11/19 matched, ratio=0.58) |
| `keep_core` | `74` | `implementation_resource` | `direct_document` | `n/a` | `eu_gpai_vademecum_2025` | substantive document type; implementation-resource tier; moderate extracted text; title or notes indicate a substantive policy instrument; low quote grounding (5/8 matched, ratio=0.62) |
| `keep_core` | `84` | `implementation_resource` | `direct_document` | `n/a` | `eu_ai_act_navigation_qa` | substantive document type; implementation-resource tier; substantive extracted text; title or notes indicate a substantive policy instrument; interpretive or Q&A companion value; low quote grounding (20/25 matched, ratio=0.80) |
| `keep_core` | `84` | `implementation_resource` | `direct_document` | `n/a` | `eu_request_for_an_article_64_2_opinion_from_efe0d88a` | substantive document type; implementation-resource tier; substantive extracted text; title or notes indicate a substantive policy instrument; interpretive or Q&A companion value; low quote grounding (8/11 matched, ratio=0.73) |
| `keep_core` | `86` | `voluntary_framework` | `direct_document` | `n/a` | `eu_gpai_code_safety_security_chapter_2025` | contextual or strategic document type; secondary source tier; substantive extracted text; title or notes indicate a substantive policy instrument; low quote grounding (20/28 matched, ratio=0.71) |
| `keep_core` | `86` | `voluntary_framework` | `direct_document` | `n/a` | `eu_gpai_code_transparency_chapter_2025` | contextual or strategic document type; secondary source tier; substantive extracted text; title or notes indicate a substantive policy instrument; low quote grounding (8/12 matched, ratio=0.67) |
| `keep_core` | `106` | `regulatory_guidance` | `direct_document` | `n/a` | `eu_prohibited_ai_practices_guidelines` | substantive document type; high-signal source tier; substantive extracted text; title or notes indicate a substantive policy instrument; low quote grounding (13/19 matched, ratio=0.68) |
| `keep_core` | `106` | `regulatory_guidance` | `direct_document` | `n/a` | `eu_edps_genai_guidance_2025` | substantive document type; high-signal source tier; substantive extracted text; title or notes indicate a substantive policy instrument; low quote grounding (17/25 matched, ratio=0.68) |
| `keep_core` | `110` | `regulatory_guidance` | `direct_document` | `n/a` | `eu_edpb_ai_models_opinion_28_2024` | substantive document type; high-signal source tier; substantive extracted text; title or notes indicate a substantive policy instrument; interpretive or Q&A companion value; low quote grounding (7/20 matched, ratio=0.35) |

## japan

- Seed documents audited: `28`
- Actions: `keep_core=25`, `keep_supporting=2`, `review_for_removal=1`
- Buckets: `context=1`, `core=25`, `supporting=2`

| Action | Score | Tier | Link status | Link action | Document | Notes |
| --- | ---: | --- | --- | --- | --- | --- |
| `review_for_removal` | `50` | `implementation_resource` | `direct_document` | `n/a` | `jp_ai_act_2025_overview_en_pdf` | substantive document type; implementation-resource tier; title or notes indicate a substantive policy instrument; context-heavy or companion-page language; useful official translation |
| `keep_supporting` | `56` | `implementation_resource` | `direct_document` | `n/a` | `jp_ai_expert_panel_c4f43cef` | contextual or strategic document type; implementation-resource tier; title or notes indicate a substantive policy instrument; low quote grounding (0/3 matched, ratio=0.00) |
| `keep_supporting` | `62` | `implementation_resource` | `direct_document` | `n/a` | `jp_ai_68c2d8ca` | contextual or strategic document type; implementation-resource tier; moderate extracted text; title or notes indicate a substantive policy instrument; low quote grounding (1/12 matched, ratio=0.08) |
| `keep_core` | `68` | `implementation_resource` | `direct_document` | `n/a` | `jp_medical_digital_data_ai_guideline_notice_2024` | substantive document type; implementation-resource tier; title or notes indicate a substantive policy instrument; low quote grounding (1/5 matched, ratio=0.20) |
| `keep_core` | `68` | `implementation_resource` | `direct_document` | `n/a` | `jp_ai_72333136` | contextual or strategic document type; implementation-resource tier; substantive extracted text; title or notes indicate a substantive policy instrument; low quote grounding (0/13 matched, ratio=0.00) |
| `keep_core` | `80` | `implementation_resource` | `direct_document` | `n/a` | `jp_medical_digital_data_ai_guideline_points_2024` | substantive document type; implementation-resource tier; substantive extracted text; title or notes indicate a substantive policy instrument; low quote grounding (2/10 matched, ratio=0.20) |
| `keep_core` | `80` | `implementation_resource` | `direct_document` | `n/a` | `jp_ai_senryaku_5eb91d1a` | contextual or strategic document type; implementation-resource tier; substantive extracted text; title or notes indicate a substantive policy instrument; foundational policy framing or strategy document; low quote grounding (4/17 matched, ratio=0.23) |
| `keep_core` | `84` | `implementation_resource` | `direct_document` | `n/a` | `jp_ai_guideline_2025_en_pdf` | substantive document type; implementation-resource tier; substantive extracted text; title or notes indicate a substantive policy instrument; useful official translation; low quote grounding (6/16 matched, ratio=0.38) |
| `keep_core` | `84` | `implementation_resource` | `direct_document` | `n/a` | `jp_ai_q_a_pdf_493kb_1812c77d` | substantive document type; implementation-resource tier; substantive extracted text; title or notes indicate a substantive policy instrument; interpretive or Q&A companion value; low quote grounding (1/10 matched, ratio=0.10) |
| `keep_core` | `86` | `policy_strategy` | `direct_document` | `n/a` | `jp_social_principles_human_centric_ai` | contextual or strategic document type; secondary source tier; substantive extracted text; title or notes indicate a substantive policy instrument; low quote grounding (8/12 matched, ratio=0.67) |
| `keep_core` | `98` | `policy_strategy` | `direct_document` | `n/a` | `jp_basic_ai_plan_page` | contextual or strategic document type; secondary source tier; substantive extracted text; title or notes indicate a substantive policy instrument; foundational policy framing or strategy document; low quote grounding (6/24 matched, ratio=0.25) |
| `keep_core` | `98` | `policy_strategy` | `direct_document` | `n/a` | `jp_kaigi_3537a511` | contextual or strategic document type; secondary source tier; substantive extracted text; title or notes indicate a substantive policy instrument; foundational policy framing or strategy document; low quote grounding (0/10 matched, ratio=0.00) |
| `keep_core` | `106` | `regulatory_guidance` | `direct_document` | `n/a` | `jp_ai_contract_checklist_2025` | substantive document type; high-signal source tier; substantive extracted text; title or notes indicate a substantive policy instrument; low quote grounding (4/16 matched, ratio=0.25) |
| `keep_core` | `106` | `technical_standard` | `direct_document` | `n/a` | `jp_ai_data_contract_guidelines_1_1_2019` | substantive document type; high-signal source tier; substantive extracted text; title or notes indicate a substantive policy instrument; low quote grounding (0/4 matched, ratio=0.00) |
| `keep_core` | `106` | `regulatory_guidance` | `direct_document` | `n/a` | `jp_content_genai_guidebook_2024` | substantive document type; high-signal source tier; substantive extracted text; title or notes indicate a substantive policy instrument; low quote grounding (1/17 matched, ratio=0.06) |
| `keep_core` | `106` | `technical_standard` | `direct_document` | `n/a` | `jp_ai_guideline_2025_page` | substantive document type; high-signal source tier; substantive extracted text; title or notes indicate a substantive policy instrument; low quote grounding (1/22 matched, ratio=0.04) |
| `keep_core` | `106` | `technical_standard` | `direct_document` | `n/a` | `jp_school_genai_guideline_ver_2_2024` | substantive document type; high-signal source tier; substantive extracted text; title or notes indicate a substantive policy instrument; low quote grounding (2/20 matched, ratio=0.10) |
| `keep_core` | `106` | `technical_standard` | `direct_document` | `n/a` | `jp_medical_digital_data_ai_guideline_2024` | substantive document type; high-signal source tier; substantive extracted text; title or notes indicate a substantive policy instrument; low quote grounding (7/14 matched, ratio=0.50) |
| `keep_core` | `106` | `regulatory_guidance` | `direct_document` | `n/a` | `jp_university_genai_teaching_guidance_2023` | substantive document type; high-signal source tier; substantive extracted text; title or notes indicate a substantive policy instrument; low quote grounding (0/8 matched, ratio=0.00) |
| `keep_core` | `106` | `regulatory_guidance` | `direct_document` | `n/a` | `jp_childcare_genai_handbook_2025` | substantive document type; high-signal source tier; substantive extracted text; title or notes indicate a substantive policy instrument; low quote grounding (1/17 matched, ratio=0.06) |
| `keep_core` | `106` | `regulatory_guidance` | `direct_document` | `n/a` | `jp_genai_privacy_alert_2023` | substantive document type; high-signal source tier; substantive extracted text; title or notes indicate a substantive policy instrument; low quote grounding (1/10 matched, ratio=0.10) |
| `keep_core` | `106` | `regulatory_guidance` | `direct_document` | `n/a` | `jp_admin_genai_procurement_guideline_2025` | substantive document type; high-signal source tier; substantive extracted text; title or notes indicate a substantive policy instrument; low quote grounding (1/18 matched, ratio=0.06) |
| `keep_core` | `106` | `regulatory_guidance` | `direct_document` | `n/a` | `jp_ai_copyright_thinking_2024` | substantive document type; high-signal source tier; substantive extracted text; title or notes indicate a substantive policy instrument; low quote grounding (2/6 matched, ratio=0.33) |

## south_korea

- Seed documents audited: `16`
- Actions: `keep_core=12`, `keep_supporting=4`
- Buckets: `core=12`, `supporting=4`

| Action | Score | Tier | Link status | Link action | Document | Notes |
| --- | ---: | --- | --- | --- | --- | --- |
| `keep_supporting` | `52` | `implementation_resource` | `direct_document` | `n/a` | `kr_public_sector_ai_privacy_strengthening_2025` | substantive document type; implementation-resource tier; moderate extracted text; title or notes indicate a substantive policy instrument; context-heavy or companion-page language; low quote grounding (6/12 matched, ratio=0.50) |
| `keep_supporting` | `64` | `statutory_rule` | `spa_shell_capture` | `refetch_with_browser` | `kr_ai_and_data_administration_act` | substantive document type; high-signal source tier; title or notes indicate a substantive policy instrument; law.go.kr SPA shell capture (<500 chars, missing statutory articles '제1조'); low quote grounding (0/14 matched, ratio=0.00) |
| `keep_supporting` | `64` | `statutory_rule` | `spa_shell_capture` | `refetch_with_browser` | `kr_ai_basic_act` | substantive document type; high-signal source tier; title or notes indicate a substantive policy instrument; law.go.kr SPA shell capture (<500 chars, missing statutory articles '제1조'); low quote grounding (0/21 matched, ratio=0.00) |
| `keep_supporting` | `64` | `statutory_rule` | `spa_shell_capture` | `refetch_with_browser` | `kr_ai_basic_act_enforcement_decree` | substantive document type; high-signal source tier; title or notes indicate a substantive policy instrument; law.go.kr SPA shell capture (<500 chars, missing statutory articles '제1조'); low quote grounding (0/16 matched, ratio=0.00) |
| `keep_core` | `106` | `regulatory_guidance` | `direct_document` | `n/a` | `kr_high_impact_ai_operator_obligations_guideline_2026` | substantive document type; high-signal source tier; substantive extracted text; title or notes indicate a substantive policy instrument; low quote grounding (10/21 matched, ratio=0.48) |
| `keep_core` | `106` | `regulatory_guidance` | `direct_document` | `n/a` | `kr_public_sector_hyperscale_ai_guideline_2_0` | substantive document type; high-signal source tier; substantive extracted text; title or notes indicate a substantive policy instrument; low quote grounding (10/23 matched, ratio=0.43) |
| `keep_core` | `106` | `regulatory_guidance` | `direct_document` | `n/a` | `kr_public_sector_hyperscale_ai_guideline_2024` | substantive document type; high-signal source tier; substantive extracted text; title or notes indicate a substantive policy instrument; low quote grounding (8/15 matched, ratio=0.53) |
| `keep_core` | `106` | `regulatory_guidance` | `direct_document` | `n/a` | `kr_genai_medical_device_guideline_2025` | substantive document type; high-signal source tier; substantive extracted text; title or notes indicate a substantive policy instrument; low quote grounding (10/23 matched, ratio=0.43) |
| `keep_core` | `106` | `regulatory_guidance` | `direct_document` | `n/a` | `kr_genai_personal_data_guide_2025` | substantive document type; high-signal source tier; substantive extracted text; title or notes indicate a substantive policy instrument; low quote grounding (10/26 matched, ratio=0.39) |
| `keep_core` | `106` | `regulatory_guidance` | `direct_document` | `n/a` | `kr_ai_basic_act_enforcement_decree_draft_notice_2025` | substantive document type; high-signal source tier; substantive extracted text; title or notes indicate a substantive policy instrument; low quote grounding (13/16 matched, ratio=0.81) |
| `keep_core` | `106` | `regulatory_guidance` | `direct_document` | `n/a` | `kr_ai_safety_guideline_2026_draft` | substantive document type; high-signal source tier; substantive extracted text; title or notes indicate a substantive policy instrument; low quote grounding (18/23 matched, ratio=0.78) |
| `keep_core` | `106` | `regulatory_guidance` | `direct_document` | `n/a` | `kr_ai_impact_assessment_guideline_2026` | substantive document type; high-signal source tier; substantive extracted text; title or notes indicate a substantive policy instrument; low quote grounding (17/20 matched, ratio=0.85) |
| `keep_core` | `106` | `regulatory_guidance` | `direct_document` | `n/a` | `kr_public_personal_data_ai_guide_2024` | substantive document type; high-signal source tier; substantive extracted text; title or notes indicate a substantive policy instrument; low quote grounding (14/20 matched, ratio=0.70) |
| `keep_core` | `106` | `regulatory_guidance` | `direct_document` | `n/a` | `kr_ai_privacy_risk_management_model_2024` | substantive document type; high-signal source tier; substantive extracted text; title or notes indicate a substantive policy instrument; low quote grounding (5/14 matched, ratio=0.36) |

## united_states

- Seed documents audited: `23`
- Actions: `keep_core=16`, `keep_supporting=4`, `review_for_removal=3`
- Buckets: `context=3`, `core=16`, `supporting=4`

| Action | Score | Tier | Link status | Link action | Document | Notes |
| --- | ---: | --- | --- | --- | --- | --- |
| `review_for_removal` | `40` | `implementation_resource` | `direct_document` | `n/a` | `us_ai_congressional_mandates_executive_orders_nist` | contextual or strategic document type; implementation-resource tier; moderate extracted text; title or notes indicate a substantive policy instrument; context-heavy or companion-page language |
| `review_for_removal` | `46` | `implementation_resource` | `direct_document` | `n/a` | `us_crosswalks_to_the_nist_artificial_intelligence_r_8c897d8c` | substantive document type; implementation-resource tier; title or notes indicate a substantive policy instrument; context-heavy or companion-page language |
| `review_for_removal` | `48` | `implementation_resource` | `direct_document` | `n/a` | `us_technical_contributions_ai_governance_nist` | contextual or strategic document type; implementation-resource tier |
| `keep_supporting` | `52` | `implementation_resource` | `direct_document` | `n/a` | `us_ai_risk_management_framework_engage_nist_0abb57bc` | substantive document type; implementation-resource tier; moderate extracted text; title or notes indicate a substantive policy instrument; context-heavy or companion-page language |
| `keep_supporting` | `52` | `policy_strategy` | `direct_document` | `n/a` | `us_cfpb_chatbots_issue_spotlight_2023` | contextual or strategic document type; secondary source tier; title or notes indicate a substantive policy instrument; context-heavy or companion-page language; low quote grounding (0/7 matched, ratio=0.00) |
| `keep_supporting` | `60` | `implementation_resource` | `direct_document` | `n/a` | `us_nist_ai_rmf_playbook` | substantive document type; implementation-resource tier |
| `keep_supporting` | `66` | `executive_action` | `direct_document` | `n/a` | `us_omb_m_25_22` | substantive document type; substantive extracted text; title or notes indicate a substantive policy instrument; context-heavy or companion-page language; low quote grounding (14/22 matched, ratio=0.64) |
| `keep_core` | `80` | `executive_action` | `direct_document` | `n/a` | `us_omb_m_25_21` | substantive document type; substantive extracted text; low quote grounding (12/23 matched, ratio=0.52) |
| `keep_core` | `86` | `policy_strategy` | `direct_document` | `n/a` | `us_ai_bill_of_rights_blueprint_2022` | contextual or strategic document type; secondary source tier; substantive extracted text; title or notes indicate a substantive policy instrument; low quote grounding (12/15 matched, ratio=0.80) |
| `keep_core` | `86` | `policy_strategy` | `direct_document` | `n/a` | `us_ftc_online_harms_ai_report_2022` | contextual or strategic document type; secondary source tier; substantive extracted text; title or notes indicate a substantive policy instrument; low quote grounding (15/20 matched, ratio=0.75) |
| `keep_core` | `86` | `policy_strategy` | `direct_document` | `n/a` | `us_ai_action_plan_pdf` | contextual or strategic document type; secondary source tier; substantive extracted text; title or notes indicate a substantive policy instrument; low quote grounding (23/29 matched, ratio=0.79) |
| `keep_core` | `92` | `regulatory_guidance` | `direct_document` | `n/a` | `us_joint_statement_ai_discrimination_2023` | substantive document type; high-signal source tier; moderate extracted text; low quote grounding (7/11 matched, ratio=0.64) |
| `keep_core` | `106` | `technical_standard` | `direct_document` | `n/a` | `us_ai_risk_management_framework_initial_draft_march_fb5a1e0e` | substantive document type; high-signal source tier; substantive extracted text; title or notes indicate a substantive policy instrument; low quote grounding (4/16 matched, ratio=0.25) |
| `keep_core` | `106` | `technical_standard` | `direct_document` | `n/a` | `us_nist_ai_rmf_1_0` | substantive document type; high-signal source tier; substantive extracted text; title or notes indicate a substantive policy instrument; low quote grounding (11/23 matched, ratio=0.48) |
| `keep_core` | `106` | `technical_standard` | `direct_document` | `n/a` | `us_nist_genai_profile` | substantive document type; high-signal source tier; substantive extracted text; title or notes indicate a substantive policy instrument; low quote grounding (16/29 matched, ratio=0.55) |
| `keep_core` | `106` | `regulatory_guidance` | `direct_document` | `n/a` | `us_cfpb_circular_2022_03_complex_algorithms` | substantive document type; high-signal source tier; substantive extracted text; title or notes indicate a substantive policy instrument; low quote grounding (8/11 matched, ratio=0.73) |
| `keep_core` | `106` | `regulatory_guidance` | `direct_document` | `n/a` | `us_fda_ai_pccp_guidance_2025` | substantive document type; high-signal source tier; substantive extracted text; title or notes indicate a substantive policy instrument; low quote grounding (17/28 matched, ratio=0.61) |
