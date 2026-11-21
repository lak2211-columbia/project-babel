# Source Inventory

This file is generated from `data/sources/` manifests plus cached discovery outputs and local corpus state.

- Generated at: `2026-11-21T02:27:33.846956+00:00`
- JSON mirror: `data/source_tracking/source_inventory.json`

## china

Official State Council, CAC, and sectoral sources for China's AI governance regime and implementation measures.

- Portals: `8` | Seed documents: `18` | Fetched: `18` | Parsed: `18` | Analyzed: `18`

- Portal kinds: `library=1`, `portal=6`, `registry=1`
- Portal issuer types: `executive=3`, `legal_registry=1`, `regulator=3`, `standards_body=1`
- Document types: `legislation=5`, `regulatory_guidance=7`, `standards_guideline=3`, `strategy_paper=3`
- Binding strength: `binding_law=5`, `regulatory_guidance=7`, `standards_guideline=3`, `strategy_statement=3`
- Source tiers: `implementation_resource=4`, `policy_strategy=3`, `regulatory_guidance=3`, `statutory_rule=5`, `technical_standard=3`
- Lifecycle stages: `active=17`, `superseded=1`
- Policy domains: `civil_rights_nondiscrimination=1`, `companion_ai=3`, `consumer_protection=10`, `critical_infrastructure=1`, `frontier_gpai=4`, `healthcare_medical_devices=1`, `industrial_innovation=5`, `national_security=1`, `platform_content_governance=11`, `standards_assurance=3`

### Portals

| Portal | Kind | Issuer | Retrieval | Why it matters | Discovery candidates |
| --- | --- | --- | --- | --- | ---: |
| `cn_state_council_policy` | `portal` | `executive` | `mixed` | Central policy and normative-document repository for State Council AI plans and policy guidance. | 1 |
| `cn_cac` | `portal` | `regulator` | `mixed` | Primary source for algorithmic, generative AI, labeling, and platform-governance rules. | 4 |
| `cn_english_state_council` | `portal` | `executive` | `html` | English-language summaries and ministry announcements relevant to AI policy rollout. | 0 |
| `cn_most_ai_governance` | `portal` | `executive` | `html` | Primary source for China's national AI governance principles, ethics norms, and related soft-law governance documents. | 0 |
| `cn_tc260` | `library` | `standards_body` | `mixed` | Official standards and technical governance materials for AI safety and content-labeling implementation. | 0 |
| `cn_cma_ai_measures` | `portal` | `regulator` | `html` | Sectoral implementation rules showing how AI governance is being operationalized in regulated domains. | 2 |
| `cn_npc_laws` | `registry` | `legal_registry` | `html` | National statutory registry covering primary PRC legislation such as the Amended Cybersecurity Law (effective Jan 1, 2026, Art. 20 AI governance clause). | 0 |
| `cn_miit_ai` | `portal` | `regulator` | `mixed` | Industrial AI policy, AI+ manufacturing/embodied AI directives, and national mandatory AI standards (e.g., GB 45438-2025). | 0 |

### Seed documents

| Document | Type | Binding | Tier | Lifecycle | Portals | Fetched | Parsed | Analyzed | Latest retrieval |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `cn_new_generation_ai_plan_2017` | `strategy_paper` | `strategy_statement` | `policy_strategy` | `active` | `cn_state_council_policy` | yes | yes | yes | `skipped_existing` |
| `cn_ai_governance_principles_2019` | `strategy_paper` | `strategy_statement` | `policy_strategy` | `active` | `cn_most_ai_governance` | yes | yes | yes | `skipped_existing` |
| `cn_ai_ethics_norms_2021` | `standards_guideline` | `standards_guideline` | `technical_standard` | `active` | `cn_most_ai_governance` | yes | yes | yes | `skipped_existing` |
| `cn_algorithm_governance_guidance_2021` | `strategy_paper` | `strategy_statement` | `policy_strategy` | `active` | `cn_cac` | yes | yes | yes | `skipped_existing` |
| `cn_algorithm_recommendation_provisions_2021` | `legislation` | `binding_law` | `statutory_rule` | `active` | `cn_cac, cn_state_council_policy` | yes | yes | yes | `skipped_existing` |
| `cn_deep_synthesis_provisions_2022` | `legislation` | `binding_law` | `statutory_rule` | `active` | `cn_cac, cn_state_council_policy` | yes | yes | yes | `skipped_existing` |
| `cn_genai_interim_measures_2023` | `legislation` | `binding_law` | `statutory_rule` | `active` | `cn_cac, cn_state_council_policy` | yes | yes | yes | `skipped_existing` |
| `cn_ai_standardization_guide_2024` | `standards_guideline` | `standards_guideline` | `technical_standard` | `active` | `cn_state_council_policy` | yes | yes | yes | `skipped_existing` |
| `cn_ai_safety_governance_framework_2024` | `standards_guideline` | `standards_guideline` | `technical_standard` | `active` | `cn_tc260` | yes | yes | yes | `skipped_existing` |
| `cn_ai_labeling_draft_2024` | `regulatory_guidance` | `regulatory_guidance` | `regulatory_guidance` | `superseded` | `cn_cac` | yes | yes | yes | `skipped_existing` |
| `cn_ai_content_labeling_measures_2025` | `legislation` | `binding_law` | `statutory_rule` | `active` | `cn_cac, cn_state_council_policy, cn_tc260` | yes | yes | yes | `skipped_existing` |
| `cn_ai_labeling_expert_interpretation_2025` | `regulatory_guidance` | `regulatory_guidance` | `implementation_resource` | `active` | `cn_cac` | yes | yes | yes | `skipped_existing` |
| `cn_ai_abuse_cleanup_2025` | `regulatory_guidance` | `regulatory_guidance` | `regulatory_guidance` | `active` | `cn_cac` | yes | yes | yes | `skipped_existing` |
| `cn_meteorological_ai_measures_2025` | `regulatory_guidance` | `regulatory_guidance` | `regulatory_guidance` | `active` | `cn_cma_ai_measures, cn_cac` | yes | yes | yes | `skipped_existing` |
| `cn_anthropomorphic_interaction_measures_2026` | `legislation` | `binding_law` | `statutory_rule` | `active` | `cn_cac` | yes | yes | yes | `skipped_existing` |
| `cn_anthropomorphic_interaction_measures_qa_2026` | `regulatory_guidance` | `regulatory_guidance` | `implementation_resource` | `active` | `cn_cac` | yes | yes | yes | `skipped_existing` |
| `cn_ai_drug_regulation_implementation_opinion_interpretation_2026` | `regulatory_guidance` | `regulatory_guidance` | `implementation_resource` | `active` | `cn_state_council_policy` | yes | yes | yes | `skipped_existing` |
| `cn_anthropomorphic_interaction_expert_interpretation_2026` | `regulatory_guidance` | `regulatory_guidance` | `implementation_resource` | `active` | `cn_cac` | yes | yes | yes | `skipped_existing` |

## european_union

Official EU legal text, implementation guidance, and data-protection sources for the AI Act and related governance instruments.

- Portals: `6` | Seed documents: `18` | Fetched: `18` | Parsed: `18` | Analyzed: `18`

- Portal kinds: `helpdesk=1`, `library=3`, `portal=2`
- Portal issuer types: `executive=3`, `legal_registry=1`, `regulator=2`
- Document types: `legislation=1`, `regulatory_guidance=13`, `voluntary_commitment=4`
- Binding strength: `binding_law=1`, `regulatory_guidance=13`, `voluntary_commitment=4`
- Source tiers: `implementation_resource=8`, `regulatory_guidance=5`, `statutory_rule=1`, `voluntary_framework=4`
- Lifecycle stages: `active=18`
- Policy domains: `civil_rights_nondiscrimination=2`, `consumer_protection=4`, `copyright_ip=4`, `frontier_gpai=18`, `industrial_innovation=3`, `privacy_data_protection=4`, `public_sector_governance=1`, `standards_assurance=9`

### Portals

| Portal | Kind | Issuer | Retrieval | Why it matters | Discovery candidates |
| --- | --- | --- | --- | --- | ---: |
| `eu_eur_lex` | `library` | `legal_registry` | `mixed` | Canonical legal text repository for EU regulations, directives, and official journal publications. | 0 |
| `eu_digital_strategy_ai` | `portal` | `executive` | `html` | Commission policy and implementation hub for the AI Act and related guidance. | 15 |
| `eu_ai_act_service_desk` | `helpdesk` | `executive` | `html` | Implementation support surface for obligations, compliance tools, and rollout timelines. | 4 |
| `eu_edpb_ai_privacy` | `library` | `regulator` | `mixed` | Authoritative EU-wide GDPR interpretation for AI models, including anonymity, legitimate interest, and downstream use of models trained on unlawful data. | 3 |
| `eu_edps_genai` | `library` | `regulator` | `mixed` | Operational data-protection guidance for generative AI use and development within EU institutions and bodies, with broader relevance for rights-based EU AI governance. | 2 |
| `eu_ai_office_policies` | `portal` | `executive` | `mixed` | Central policy hub for 2026 EU AI Office outputs including Article 50 Transparency Code/Guidelines, Article 6 High-Risk Guidelines, and the Apply AI Strategy. | 0 |

### Seed documents

| Document | Type | Binding | Tier | Lifecycle | Portals | Fetched | Parsed | Analyzed | Latest retrieval |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `eu_ai_act_regulation_2024_1689` | `legislation` | `binding_law` | `statutory_rule` | `active` | `eu_eur_lex, eu_digital_strategy_ai` | yes | yes | yes | `downloaded_unchanged` |
| `eu_ai_system_definition_guidelines` | `regulatory_guidance` | `regulatory_guidance` | `regulatory_guidance` | `active` | `eu_digital_strategy_ai` | yes | yes | yes | `downloaded_unchanged` |
| `eu_gpai_provider_guidelines` | `regulatory_guidance` | `regulatory_guidance` | `implementation_resource` | `active` | `eu_digital_strategy_ai, eu_ai_act_service_desk` | yes | yes | yes | `downloaded_updated` |
| `eu_gpai_code_transparency_chapter_2025` | `voluntary_commitment` | `voluntary_commitment` | `voluntary_framework` | `active` | `eu_digital_strategy_ai` | yes | yes | yes | `downloaded_unchanged` |
| `eu_gpai_code_copyright_chapter_2025` | `voluntary_commitment` | `voluntary_commitment` | `voluntary_framework` | `active` | `eu_digital_strategy_ai` | yes | yes | yes | `downloaded_unchanged` |
| `eu_gpai_code_safety_security_chapter_2025` | `voluntary_commitment` | `voluntary_commitment` | `voluntary_framework` | `active` | `eu_digital_strategy_ai` | yes | yes | yes | `downloaded_unchanged` |
| `eu_gpai_vademecum_2025` | `regulatory_guidance` | `regulatory_guidance` | `implementation_resource` | `active` | `eu_digital_strategy_ai` | yes | yes | yes | `downloaded_unchanged` |
| `eu_prohibited_ai_practices_guidelines` | `regulatory_guidance` | `regulatory_guidance` | `regulatory_guidance` | `active` | `eu_digital_strategy_ai, eu_ai_act_service_desk` | yes | yes | yes | `downloaded_unchanged` |
| `eu_edpb_ai_models_opinion_28_2024` | `regulatory_guidance` | `regulatory_guidance` | `regulatory_guidance` | `active` | `eu_edpb_ai_privacy` | yes | yes | yes | `downloaded_unchanged` |
| `eu_edps_genai_guidance_2025` | `regulatory_guidance` | `regulatory_guidance` | `regulatory_guidance` | `active` | `eu_edps_genai` | yes | yes | yes | `downloaded_unchanged` |
| `eu_training_content_template_faq_2025` | `regulatory_guidance` | `regulatory_guidance` | `implementation_resource` | `active` | `eu_digital_strategy_ai, eu_ai_act_service_desk` | yes | yes | yes | `downloaded_updated` |
| `eu_gpai_code_qa_2025` | `regulatory_guidance` | `regulatory_guidance` | `implementation_resource` | `active` | `eu_digital_strategy_ai, eu_ai_act_service_desk` | yes | yes | yes | `downloaded_updated` |
| `eu_ai_pact_page` | `voluntary_commitment` | `voluntary_commitment` | `voluntary_framework` | `active` | `eu_digital_strategy_ai` | yes | yes | yes | `downloaded_updated` |
| `eu_ai_act_navigation_qa` | `regulatory_guidance` | `regulatory_guidance` | `implementation_resource` | `active` | `eu_digital_strategy_ai` | yes | yes | yes | `downloaded_updated` |
| `eu_ai_act_standardisation_page` | `regulatory_guidance` | `regulatory_guidance` | `implementation_resource` | `active` | `eu_digital_strategy_ai` | yes | yes | yes | `downloaded_updated` |
| `eu_gpai_scope_obligations_guidelines_2025` | `regulatory_guidance` | `regulatory_guidance` | `regulatory_guidance` | `active` | `eu_digital_strategy_ai` | yes | yes | yes | `downloaded_unchanged` |
| `eu_training_content_public_summary_template_2025` | `regulatory_guidance` | `regulatory_guidance` | `implementation_resource` | `active` | `eu_digital_strategy_ai, eu_ai_act_service_desk` | yes | yes | yes | `downloaded_unchanged` |
| `eu_request_for_an_article_64_2_opinion_from_efe0d88a` | `regulatory_guidance` | `regulatory_guidance` | `implementation_resource` | `active` | `eu_edpb_ai_privacy` | yes | yes | yes | `downloaded_unchanged` |

## japan

Official Cabinet Secretariat, Cabinet Office, Digital Agency, METI, MIC, MEXT, PPC, MHLW, MAFF, CFA, and Cultural Affairs materials for Japan's AI governance approach.

- Portals: `17` | Seed documents: `28` | Fetched: `28` | Parsed: `28` | Analyzed: `28`

- Portal kinds: `library=2`, `portal=14`, `registry=1`
- Portal issuer types: `executive=14`, `legal_registry=1`, `regulator=1`, `standards_body=1`
- Document types: `regulatory_guidance=12`, `standards_guideline=7`, `strategy_paper=9`
- Binding strength: `regulatory_guidance=12`, `standards_guideline=7`, `strategy_statement=9`
- Source tiers: `implementation_resource=9`, `policy_strategy=5`, `regulatory_guidance=8`, `technical_standard=6`
- Lifecycle stages: `active=24`, `superseded=4`
- Policy domains: `civil_rights_nondiscrimination=1`, `copyright_ip=2`, `education=3`, `frontier_gpai=17`, `healthcare_medical_devices=3`, `industrial_innovation=13`, `platform_content_governance=1`, `privacy_data_protection=4`, `public_sector_governance=1`, `public_sector_procurement=5`, `standards_assurance=5`

### Portals

| Portal | Kind | Issuer | Retrieval | Why it matters | Discovery candidates |
| --- | --- | --- | --- | --- | ---: |
| `jp_cas_human_centric_ai` | `portal` | `executive` | `mixed` | Cabinet Secretariat landing page for human-centric AI principles and related government materials. | 2 |
| `jp_meti_press_ai` | `portal` | `executive` | `html` | Press-release surface for AI guidelines, standards, and industry-governance announcements. | 0 |
| `jp_meti_ai_governance_docs` | `library` | `executive` | `browser` | Meeting materials and PDFs for METI's AI governance guidelines and related expert-group work. | 0 |
| `jp_regulatory_sandbox` | `portal` | `executive` | `html` | Official portal for experimental regulatory pathways relevant to AI deployment and innovation enablement. | 0 |
| `jp_cao_ai_strategy` | `portal` | `executive` | `html` | Central Cabinet Office hub for the AI Act, government AI guidelines, and the cross-ministry index of official AI guidance. | 22 |
| `jp_digital_agency_ai` | `portal` | `executive` | `html` | Government-wide administrative AI procurement, utilization, and governance guidance for ministries and agencies. | 3 |
| `jp_mext_genai` | `portal` | `executive` | `html` | Education-sector guidance for generative AI use in schools, universities, and colleges of technology. | 3 |
| `jp_bunka_copyright_ai` | `portal` | `executive` | `html` | Official copyright-law interpretations and explanatory materials relevant to generative AI. | 15 |
| `jp_ppc_guidance` | `portal` | `regulator` | `html` | Official privacy and personal-data guidance for generative AI services and AI deployment. | 49 |
| `jp_cfa_genai` | `portal` | `executive` | `html` | Operational guidance for generative AI use in child and family policy and services. | 5 |
| `jp_mhlw_ai_health_data` | `portal` | `executive` | `html` | Official guidance on medical digital data use for AI research and development. | 3 |
| `jp_maff_ai_data` | `portal` | `executive` | `html` | Agriculture-sector AI and data contract guidance, including practical compliance expectations for smart agriculture. | 8 |
| `jp_meti_data_contracts` | `portal` | `executive` | `html` | Cross-sector contract guidance, checklists, and related legal reference material for AI and data use. | 0 |
| `jp_meti_content_ai` | `portal` | `executive` | `html` | Content-sector guidance for lawful and responsible generative AI use in creative production. | 0 |
| `jp_aisi` | `library` | `standards_body` | `mixed` | Official technical evaluation and red-teaming framework publications of the Japan AI Safety Institute. | 0 |
| `jp_mic_ai_guidelines` | `portal` | `executive` | `mixed` | Official MIC repository for AI Guidelines for Business Ver. 1.2 (including AI agent and physical AI governance) and Hiroshima AI Process International Code of Conduct. | 0 |
| `jp_egov_law` | `registry` | `legal_registry` | `browser` | Authoritative statutory text registry for enacted Japanese legislation including the AI Promotion Act (Act No. 53 of 2025). | 0 |

### Seed documents

| Document | Type | Binding | Tier | Lifecycle | Portals | Fetched | Parsed | Analyzed | Latest retrieval |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `jp_social_principles_human_centric_ai` | `strategy_paper` | `strategy_statement` | `policy_strategy` | `active` | `jp_cas_human_centric_ai` | yes | yes | yes | `downloaded_unchanged` |
| `jp_ai_governance_guidelines_2021` | `standards_guideline` | `standards_guideline` | `technical_standard` | `superseded` | `jp_meti_ai_governance_docs, jp_cas_human_centric_ai` | yes | yes | yes | `timeout` |
| `jp_ai_governance_ver_1_1_report` | `strategy_paper` | `strategy_statement` | `policy_strategy` | `superseded` | `jp_meti_ai_governance_docs` | yes | yes | yes | `skipped_existing` |
| `jp_ai_guidelines_for_business_ver_1_0` | `standards_guideline` | `standards_guideline` | `technical_standard` | `active` | `jp_meti_press_ai, jp_meti_ai_governance_docs` | yes | yes | yes | `downloaded_new` |
| `jp_ai_act_2025_overview_en_pdf` | `regulatory_guidance` | `regulatory_guidance` | `implementation_resource` | `active` | `jp_cao_ai_strategy` | yes | yes | yes | `skipped_existing` |
| `jp_ai_guideline_2025_page` | `standards_guideline` | `standards_guideline` | `technical_standard` | `active` | `jp_cao_ai_strategy` | yes | yes | yes | `imported_local_updated` |
| `jp_ai_guideline_2025_en_pdf` | `standards_guideline` | `standards_guideline` | `implementation_resource` | `active` | `jp_cao_ai_strategy` | yes | yes | yes | `skipped_existing` |
| `jp_admin_genai_procurement_guideline_2025` | `regulatory_guidance` | `regulatory_guidance` | `regulatory_guidance` | `active` | `jp_digital_agency_ai` | yes | yes | yes | `skipped_existing` |
| `jp_school_genai_guideline_ver_2_2024` | `standards_guideline` | `standards_guideline` | `technical_standard` | `active` | `jp_mext_genai` | yes | yes | yes | `downloaded_unchanged` |
| `jp_university_genai_teaching_guidance_2023` | `regulatory_guidance` | `regulatory_guidance` | `regulatory_guidance` | `active` | `jp_mext_genai` | yes | yes | yes | `skipped_existing` |
| `jp_ai_copyright_thinking_2024` | `regulatory_guidance` | `regulatory_guidance` | `regulatory_guidance` | `active` | `jp_bunka_copyright_ai` | yes | yes | yes | `downloaded_unchanged` |
| `jp_genai_privacy_alert_2023` | `regulatory_guidance` | `regulatory_guidance` | `regulatory_guidance` | `active` | `jp_ppc_guidance` | yes | yes | yes | `skipped_existing` |
| `jp_childcare_genai_handbook_2025` | `regulatory_guidance` | `regulatory_guidance` | `regulatory_guidance` | `active` | `jp_cfa_genai` | yes | yes | yes | `downloaded_unchanged` |
| `jp_medical_digital_data_ai_guideline_2024` | `standards_guideline` | `standards_guideline` | `technical_standard` | `active` | `jp_mhlw_ai_health_data` | yes | yes | yes | `downloaded_unchanged` |
| `jp_ai_data_contract_guidelines_1_1_2019` | `standards_guideline` | `standards_guideline` | `technical_standard` | `active` | `jp_meti_data_contracts` | yes | yes | yes | `downloaded_new` |
| `jp_ai_contract_checklist_2025` | `regulatory_guidance` | `regulatory_guidance` | `regulatory_guidance` | `active` | `jp_meti_data_contracts` | yes | yes | yes | `downloaded_new` |
| `jp_content_genai_guidebook_2024` | `regulatory_guidance` | `regulatory_guidance` | `regulatory_guidance` | `active` | `jp_meti_content_ai` | yes | yes | yes | `downloaded_new` |
| `jp_agri_ai_data_contract_guideline_2020` | `regulatory_guidance` | `regulatory_guidance` | `regulatory_guidance` | `active` | `jp_maff_ai_data` | yes | yes | yes | `imported_local_updated` |
| `jp_medical_digital_data_ai_guideline_notice_2024` | `regulatory_guidance` | `regulatory_guidance` | `implementation_resource` | `active` | `jp_mhlw_ai_health_data` | yes | yes | yes | `skipped_existing` |
| `jp_medical_digital_data_ai_guideline_points_2024` | `regulatory_guidance` | `regulatory_guidance` | `implementation_resource` | `active` | `jp_mhlw_ai_health_data` | yes | yes | yes | `skipped_existing` |
| `jp_basic_ai_plan_page` | `strategy_paper` | `strategy_statement` | `policy_strategy` | `active` | `jp_cao_ai_strategy` | yes | yes | yes | `imported_local_updated` |
| `jp_ai_senryaku_5eb91d1a` | `strategy_paper` | `strategy_statement` | `implementation_resource` | `active` | `jp_cao_ai_strategy` | yes | yes | yes | `downloaded_unchanged` |
| `jp_ai_68c2d8ca` | `strategy_paper` | `strategy_statement` | `implementation_resource` | `active` | `jp_cao_ai_strategy` | yes | yes | yes | `downloaded_unchanged` |
| `jp_kaigi_3537a511` | `strategy_paper` | `strategy_statement` | `policy_strategy` | `superseded` | `jp_cao_ai_strategy` | yes | yes | yes | `downloaded_unchanged` |
| `jp_index_12711198` | `strategy_paper` | `strategy_statement` | `policy_strategy` | `superseded` | `jp_cao_ai_strategy` | yes | yes | yes | `downloaded_unchanged` |
| `jp_ai_expert_panel_c4f43cef` | `strategy_paper` | `strategy_statement` | `implementation_resource` | `active` | `jp_cao_ai_strategy` | yes | yes | yes | `downloaded_unchanged` |
| `jp_ai_72333136` | `strategy_paper` | `strategy_statement` | `implementation_resource` | `active` | `jp_cfa_genai` | yes | yes | yes | `skipped_existing` |
| `jp_ai_q_a_pdf_493kb_1812c77d` | `regulatory_guidance` | `regulatory_guidance` | `implementation_resource` | `active` | `jp_maff_ai_data` | yes | yes | yes | `downloaded_new` |

## south_korea

Official legal, public-sector, privacy, and medical-device sources for South Korea's AI framework and implementation.

- Portals: `9` | Seed documents: `16` | Fetched: `16` | Parsed: `16` | Analyzed: `16`

- Portal kinds: `helpdesk=2`, `library=3`, `portal=3`, `registry=1`
- Portal issuer types: `executive=5`, `legal_registry=1`, `regulator=2`, `standards_body=1`
- Document types: `legislation=3`, `regulatory_guidance=13`
- Binding strength: `binding_law=3`, `regulatory_guidance=13`
- Source tiers: `implementation_resource=2`, `regulatory_guidance=11`, `statutory_rule=3`
- Lifecycle stages: `active=13`, `draft=1`, `superseded=2`
- Policy domains: `consumer_protection=1`, `critical_infrastructure=1`, `frontier_gpai=13`, `healthcare_medical_devices=1`, `privacy_data_protection=7`, `public_sector_governance=10`, `standards_assurance=4`

### Portals

| Portal | Kind | Issuer | Retrieval | Why it matters | Discovery candidates |
| --- | --- | --- | --- | --- | ---: |
| `kr_law_center` | `registry` | `legal_registry` | `browser` | Canonical legal-text portal for Korean statutes and decrees. | 0 |
| `kr_msit_ai_request` | `helpdesk` | `executive` | `html` | Implementation portal for high-impact AI confirmation and guidance under Korea's AI framework. | 0 |
| `kr_msit_main` | `portal` | `executive` | `html` | Primary ministry surface for AI policy announcements and implementation notices. | 4 |
| `kr_public_sector_ai_law` | `portal` | `executive` | `html` | Public-sector AI and data-governance law relevant to administrative deployment of AI. | 0 |
| `kr_nia_public_ai` | `library` | `executive` | `mixed` | Official NIA library for Korean public-sector AI guidance and AI Basic Act implementation materials, including hyperscale adoption guidance and support-desk guideline packages. | 3 |
| `kr_pipc_guidance` | `library` | `regulator` | `mixed` | Official privacy-law guidance, press releases, and practical materials on generative AI development and public-sector AI deployment. | 0 |
| `kr_mfds_ai_medical` | `library` | `regulator` | `mixed` | Official review and compliance guidance for generative AI medical devices and other regulated digital-health applications. | 4 |
| `kr_ai_act_helpdesk` | `helpdesk` | `executive` | `mixed` | Official implementation helpdesk distributing finalized 2026 MSIT AI Basic Act guidelines (Safety Assurance, High-Impact Determination, Transparency, Impact Assessment). | 0 |
| `kr_aisi` | `portal` | `standards_body` | `mixed` | Statutory AI safety research and evaluation body designated under Presidential Decree No. 36053 of the AI Basic Act. | 0 |

### Seed documents

| Document | Type | Binding | Tier | Lifecycle | Portals | Fetched | Parsed | Analyzed | Latest retrieval |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `kr_ai_basic_act` | `legislation` | `binding_law` | `statutory_rule` | `active` | `kr_law_center, kr_msit_main` | yes | yes | yes | `skipped_existing` |
| `kr_ai_basic_act_enforcement_decree` | `legislation` | `binding_law` | `statutory_rule` | `active` | `kr_law_center, kr_msit_main` | yes | yes | yes | `skipped_existing` |
| `kr_ai_basic_act_enforcement_decree_draft_notice_2025` | `regulatory_guidance` | `regulatory_guidance` | `regulatory_guidance` | `superseded` | `kr_msit_main` | yes | yes | yes | `imported_local_updated` |
| `kr_ai_and_data_administration_act` | `legislation` | `binding_law` | `statutory_rule` | `active` | `kr_public_sector_ai_law, kr_law_center` | yes | yes | yes | `skipped_existing` |
| `kr_public_sector_hyperscale_ai_guideline_2024` | `regulatory_guidance` | `regulatory_guidance` | `regulatory_guidance` | `superseded` | `kr_nia_public_ai` | yes | yes | yes | `skipped_existing` |
| `kr_public_sector_hyperscale_ai_guideline_2_0` | `regulatory_guidance` | `regulatory_guidance` | `regulatory_guidance` | `active` | `kr_nia_public_ai` | yes | yes | yes | `skipped_existing` |
| `kr_ai_transparency_guideline_2026` | `regulatory_guidance` | `regulatory_guidance` | `regulatory_guidance` | `active` | `kr_nia_public_ai` | yes | yes | yes | `imported_local_new` |
| `kr_ai_safety_guideline_2026_draft` | `regulatory_guidance` | `regulatory_guidance` | `regulatory_guidance` | `draft` | `kr_nia_public_ai` | yes | yes | yes | `imported_local_new` |
| `kr_high_impact_ai_operator_obligations_guideline_2026` | `regulatory_guidance` | `regulatory_guidance` | `regulatory_guidance` | `active` | `kr_nia_public_ai` | yes | yes | yes | `imported_local_new` |
| `kr_ai_impact_assessment_guideline_2026` | `regulatory_guidance` | `regulatory_guidance` | `regulatory_guidance` | `active` | `kr_nia_public_ai` | yes | yes | yes | `imported_local_new` |
| `kr_public_personal_data_ai_guide_2024` | `regulatory_guidance` | `regulatory_guidance` | `regulatory_guidance` | `active` | `kr_pipc_guidance` | yes | yes | yes | `skipped_existing` |
| `kr_ai_privacy_risk_management_model_2024` | `regulatory_guidance` | `regulatory_guidance` | `regulatory_guidance` | `active` | `kr_pipc_guidance` | yes | yes | yes | `skipped_existing` |
| `kr_genai_personal_data_guide_2025` | `regulatory_guidance` | `regulatory_guidance` | `regulatory_guidance` | `active` | `kr_pipc_guidance` | yes | yes | yes | `skipped_existing` |
| `kr_public_sector_ai_privacy_strengthening_2025` | `regulatory_guidance` | `regulatory_guidance` | `implementation_resource` | `active` | `kr_pipc_guidance` | yes | yes | yes | `skipped_existing` |
| `kr_public_sector_ai_privacy_pia_items_2025` | `regulatory_guidance` | `regulatory_guidance` | `implementation_resource` | `active` | `kr_pipc_guidance` | yes | yes | yes | `downloaded_new` |
| `kr_genai_medical_device_guideline_2025` | `regulatory_guidance` | `regulatory_guidance` | `regulatory_guidance` | `active` | `kr_mfds_ai_medical` | yes | yes | yes | `skipped_existing` |

## united_states

Official executive, standards, civil-rights, consumer-protection, and health-regulation sources for U.S. AI governance.

- Portals: `12` | Seed documents: `23` | Fetched: `23` | Parsed: `23` | Analyzed: `23`

- Portal kinds: `library=6`, `portal=4`, `registry=2`
- Portal issuer types: `executive=3`, `legal_registry=2`, `multi_agency=1`, `regulator=3`, `standards_body=3`
- Document types: `executive_order=1`, `regulatory_guidance=6`, `standards_guideline=10`, `strategy_paper=6`
- Binding strength: `executive_action=3`, `regulatory_guidance=3`, `standards_guideline=10`, `strategy_statement=6`, `voluntary_commitment=1`
- Source tiers: `executive_action=3`, `implementation_resource=8`, `policy_strategy=4`, `regulatory_guidance=3`, `technical_standard=5`
- Lifecycle stages: `active=19`, `superseded=4`
- Policy domains: `civil_rights_nondiscrimination=5`, `consumer_protection=5`, `finance=3`, `frontier_gpai=18`, `healthcare_medical_devices=1`, `industrial_innovation=4`, `national_security=3`, `privacy_data_protection=1`, `public_sector_governance=3`, `public_sector_procurement=1`, `sovereign_compute=1`, `standards_assurance=13`

### Portals

| Portal | Kind | Issuer | Retrieval | Why it matters | Discovery candidates |
| --- | --- | --- | --- | --- | ---: |
| `us_white_house_actions` | `portal` | `executive` | `html` | Executive orders and presidential directives that shape federal AI policy. | 1 |
| `us_white_house_releases` | `portal` | `executive` | `html` | Fact sheets, policy announcements, and implementation updates tied to AI governance. | 1 |
| `us_nist_ai` | `portal` | `standards_body` | `html` | Federal technical standards, frameworks, and implementation resources for trustworthy AI. | 13 |
| `us_nist_rmf` | `library` | `standards_body` | `mixed` | Framework pages, profiles, and playbooks for AI risk management. | 13 |
| `us_ostp_ai_rights` | `library` | `executive` | `mixed` | Official White House OSTP materials on rights-protective AI governance, including the Blueprint for an AI Bill of Rights and companion implementation guidance. | 5 |
| `us_ftc_ai_policy` | `library` | `regulator` | `mixed` | Official FTC reports and policy materials addressing consumer protection, bias, surveillance, and deceptive or unfair AI practices. | 3 |
| `us_interagency_ai_enforcement` | `library` | `multi_agency` | `mixed` | Official interagency civil-rights, consumer-protection, and equal-opportunity materials on unlawful discrimination and bias in automated systems. | 0 |
| `us_fda_ai_medical` | `library` | `regulator` | `mixed` | Official FDA guidance and supporting materials for AI-enabled medical devices, including premarket, lifecycle, and change-control expectations. | 8 |
| `us_cfpb_ai_finance` | `library` | `regulator` | `mixed` | Official CFPB circulars and research reports on algorithmic credit decisions, chatbot deployment, and AI-related consumer-finance harms. | 1 |
| `us_federal_register_ai` | `registry` | `legal_registry` | `html` | Authoritative federal gazette for Executive Orders (EO 14409, EO 14434, Dec 2025 National Policy Framework EO) and federal AI/Super Intelligence rulemaking. | 0 |
| `us_nist_caisi_si` | `portal` | `standards_body` | `mixed` | Official portal for NIST CAISI frontier evaluations, the 2026 AI/SI Agent Standards Initiative, NCCoE agent-IAM concept papers, and CSRC Cyber AI Profile (NIST IR 8596). | 0 |
| `us_congress_govinfo` | `registry` | `legal_registry` | `mixed` | Canonical federal statutory repository for enacted U.S. AI legislation (e.g., TAKE IT DOWN Act, Pub. L. 119-12). | 0 |

### Seed documents

| Document | Type | Binding | Tier | Lifecycle | Portals | Fetched | Parsed | Analyzed | Latest retrieval |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `us_eo_14179_removing_barriers_ai` | `executive_order` | `executive_action` | `executive_action` | `active` | `us_white_house_actions` | yes | yes | yes | `downloaded_unchanged` |
| `us_ai_action_plan_pdf` | `strategy_paper` | `strategy_statement` | `policy_strategy` | `active` | `us_white_house_releases, us_white_house_actions` | yes | yes | yes | `downloaded_unchanged` |
| `us_omb_m_25_21` | `regulatory_guidance` | `executive_action` | `executive_action` | `active` | `us_white_house_releases, us_white_house_actions` | yes | yes | yes | `downloaded_unchanged` |
| `us_omb_m_25_22` | `regulatory_guidance` | `executive_action` | `executive_action` | `active` | `us_white_house_releases, us_white_house_actions` | yes | yes | yes | `downloaded_unchanged` |
| `us_nist_ai_rmf_1_0` | `standards_guideline` | `standards_guideline` | `technical_standard` | `active` | `us_nist_ai, us_nist_rmf` | yes | yes | yes | `downloaded_unchanged` |
| `us_nist_ai_rmf_playbook` | `standards_guideline` | `standards_guideline` | `implementation_resource` | `active` | `us_nist_ai, us_nist_rmf` | yes | yes | yes | `downloaded_updated` |
| `us_nist_genai_profile` | `standards_guideline` | `standards_guideline` | `technical_standard` | `active` | `us_nist_ai, us_nist_rmf` | yes | yes | yes | `downloaded_unchanged` |
| `us_ai_standards_nist` | `standards_guideline` | `standards_guideline` | `technical_standard` | `active` | `us_nist_ai` | yes | yes | yes | `downloaded_new` |
| `us_technical_contributions_ai_governance_nist` | `strategy_paper` | `strategy_statement` | `implementation_resource` | `active` | `us_nist_ai` | yes | yes | yes | `downloaded_new` |
| `us_ai_congressional_mandates_executive_orders_nist` | `strategy_paper` | `strategy_statement` | `implementation_resource` | `active` | `us_nist_ai` | yes | yes | yes | `downloaded_new` |
| `us_ai_bill_of_rights_blueprint_2022` | `strategy_paper` | `strategy_statement` | `policy_strategy` | `superseded` | `us_ostp_ai_rights` | yes | yes | yes | `downloaded_unchanged` |
| `us_ftc_online_harms_ai_report_2022` | `strategy_paper` | `strategy_statement` | `policy_strategy` | `active` | `us_ftc_ai_policy` | yes | yes | yes | `downloaded_unchanged` |
| `us_joint_statement_ai_discrimination_2023` | `regulatory_guidance` | `regulatory_guidance` | `regulatory_guidance` | `active` | `us_interagency_ai_enforcement` | yes | yes | yes | `downloaded_unchanged` |
| `us_fda_ai_pccp_guidance_2025` | `regulatory_guidance` | `regulatory_guidance` | `regulatory_guidance` | `active` | `us_fda_ai_medical` | yes | yes | yes | `downloaded_unchanged` |
| `us_cfpb_circular_2022_03_complex_algorithms` | `regulatory_guidance` | `regulatory_guidance` | `regulatory_guidance` | `active` | `us_cfpb_ai_finance` | yes | yes | yes | `downloaded_unchanged` |
| `us_cfpb_chatbots_issue_spotlight_2023` | `strategy_paper` | `strategy_statement` | `policy_strategy` | `active` | `us_cfpb_ai_finance` | yes | yes | yes | `downloaded_unchanged` |
| `us_crosswalks_to_the_nist_artificial_intelligence_r_8c897d8c` | `standards_guideline` | `standards_guideline` | `implementation_resource` | `active` | `us_nist_rmf` | yes | yes | yes | `downloaded_updated` |
| `us_roadmap_for_the_nist_artificial_intelligence_ris_bc6cf1d8` | `standards_guideline` | `standards_guideline` | `implementation_resource` | `active` | `us_nist_rmf` | yes | yes | yes | `downloaded_updated` |
| `us_ai_risk_management_framework_engage_nist_0abb57bc` | `standards_guideline` | `standards_guideline` | `implementation_resource` | `active` | `us_nist_rmf` | yes | yes | yes | `downloaded_updated` |
| `us_ai_risk_management_framework_faqs_nist_56d7e05a` | `standards_guideline` | `standards_guideline` | `implementation_resource` | `active` | `us_nist_rmf` | yes | yes | yes | `downloaded_updated` |
| `us_ai_risk_management_framework_initial_draft_march_fb5a1e0e` | `standards_guideline` | `standards_guideline` | `technical_standard` | `superseded` | `us_nist_rmf` | yes | yes | yes | `downloaded_unchanged` |
| `us_ai_risk_management_framework_second_draft_august_e303aeb7` | `standards_guideline` | `standards_guideline` | `technical_standard` | `superseded` | `us_nist_rmf` | yes | yes | yes | `downloaded_unchanged` |
| `us_from_principles_to_practice_ostp_the_white_house_8a01bf26` | `regulatory_guidance` | `voluntary_commitment` | `implementation_resource` | `superseded` | `us_ostp_ai_rights` | yes | yes | yes | `downloaded_unchanged` |

