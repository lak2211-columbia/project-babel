# Project Babel Research Codebook (v2.1.0)

- **Taxonomy artifact:** `data/taxonomies/observatory-taxonomy.json`
- **Machine-readable definitions & thresholds (single source of truth):** `data/taxonomies/label-definitions.json`
- **Taxonomy version:** `2.1.0` (`schema_version: "2.1"`, updated `2026-11-20`)
- **Research objective:** Measure **policy–framing decoupling** across major AI-governing jurisdictions — separating *what governments operationally require and how strongly they enforce it* (**Policy**) from *why they publicly justify intervention* (**Risk Framing**), grounded in verbatim, verifiable primary-text evidence spans.

> **Single Source of Truth Rule:** All operational label definitions (`label`, `short_label`, `definition`, `include_when`, `exclude_when`) and analytical thresholds (`grounding_pass_threshold: 0.90`, `low_confidence_policy: 0.70`, `low_confidence_framing: 0.60`, `frame_mention_floor: 0.15`) are maintained canonically in `data/taxonomies/label-definitions.json` and consumed directly by both Python LLM prompts and the Next.js web UI to eliminate prompt/UI/codebook drift.

---

## 1. Versioning & Compatibility Policy

Project Babel versions `observatory-taxonomy.json` using Semantic Versioning (`MAJOR.MINOR.PATCH`):

- **MAJOR (`X.0.0`):** Breaking renames, merges, or removals of canonical category keys or enum labels that invalidate previously persisted extractions. Requires a documented migration mapping and corpus re-analysis.
- **MINOR (`2.X.0`):** Backwards-compatible additions of new dimensions or enum labels. All existing v1/v2 corpus artifacts remain schema-valid without forced re-analysis; new labels enter analyses as documents are newly ingested or refreshed.
- **PATCH (`2.0.X`):** Clarifications to operational definitions, boundary tests, or non-semantic metadata.

Every `document_analysis.json`, `jurisdiction_analysis.json`, and exported dataset records its taxonomy version / hash so longitudinal comparisons remain reproducible.

---

## 2. Orthogonal Classification Architecture

A recurring source of error in policy coding is conflating a document's **format**, **legal force**, **institutional weight**, **corpus inclusion role**, and **temporal status**. In v2.0.0, these five axes are strictly orthogonal:

| Axis | Question answered | Canonical source of truth |
|---|---|---|
| `document_type` | *What form of publication is this?* (statute, order, guidance, standard, strategy, pledge) | Seed manifest + LLM extraction (aligned via rules below) |
| `binding_strength` | *What legal force do its operative clauses carry?* | Seed manifest (authoritative for official instrument class); LLM extraction must never elevate an FAQ, Q&A, press release, overview slide, or draft notice to `binding_law` |
| `source_tier` | *What analytical tier does it occupy for weighted aggregation?* | Seed manifest |
| `corpus_role` | *How should this artifact participate in live divergence metrics?* | Seed manifest (`primary_instrument` vs companion/draft/historical) |
| `lifecycle_stage` | *Is this text currently in force, pending, draft, or superseded?* | Seed manifest (chained via optional `supersedes_id`) |

### Orthogonal Disambiguation Rules

1. **Q&As, FAQs, press releases, transmittal notices, and 1-page overview slides** are **never** `document_type: "legislation"` or `binding_strength: "binding_law"` — even when summarizing a binding statute. Code them as `corpus_role: "companion_resource"`, `source_tier: "implementation_resource"`, and `binding_strength: "regulatory_guidance"` (or `"strategy_statement"` for press summaries).
2. **Draft bills, consultation notices, and RFCs** are coded `lifecycle_stage: "draft"`, `corpus_role: "draft_consultation"`, and **never** `binding_strength: "binding_law"` until enacted.
3. **Executive orders, cabinet decisions, and binding OMB directives** are `binding_strength: "executive_action"`, distinct from enacted statutes (`binding_law`).
4. **Voluntary standards and technical frameworks** (e.g., NIST AI RMF, ISO-style technical guides) are `document_type: "standards_guideline"` and `binding_strength: "standards_guideline"` — reserve `voluntary_commitment` for signatory pledges or formal codes of conduct/practice (e.g., EU AI Pact, EU GPAI Code of Practice, Hiroshima AI Process Code).
5. **Superseded versions** remain in the registry for longitudinal drift analysis with `lifecycle_stage: "superseded"`, `corpus_role: "historical_baseline"`, and a forward pointer from the replacement document via `supersedes_id`.

---

## 3. Scope & Corpus Metadata Dimensions

### 3.1 `jurisdictions` (5 Sovereign Jurisdictions)

- `united_states` — U.S. federal executive, legislative, independent regulatory, and technical standards bodies (White House/EOP, Congress, OMB, NIST/CAISI, FTC, FDA, CFPB, EEOC, DOJ, etc.). *Sub-national scope rule:* Core sovereign divergence indices exclude U.S. state statutes (e.g., CA SB 53, CO SB 26-189, TX TRAIGA, NY RAISE) to maintain sovereign apples-to-apples comparability; state laws belong only in an explicitly labeled sub-national overlay.
- `european_union` — EU-level legislative, executive, supervisory, and advisory institutions (European Parliament & Council, European Commission, EU AI Office, AI Board, EDPB, EDPS). Excludes single-Member-State domestic acts unless explicitly tagged as national transposition.
- `south_korea` — Republic of Korea national legislature and executive/independent bodies (National Assembly, Ministry of Science and ICT [MSIT], PIPC, MFDS, NIA, MOIS, Korea AISI, NAISC).
- `japan` — Government of Japan national Diet, Cabinet, and ministries/agencies (Cabinet Office / AI Strategy HQ, Cabinet Secretariat, Digital Agency, METI, MIC, MEXT, MHLW, MAFF, PPC, CFA, Agency for Cultural Affairs, Japan AISI).
- `china` — People's Republic of China central authorities (NPC/NPCSC, State Council, CAC, MIIT, MOST, MPS, SAMR, NRTA, CMA, NMPA, TC260/SAC).

### 3.2 `document_types` (6 Labels)

- `legislation` — Enacted primary statute, parliamentary act, EU Regulation/Directive, or binding statutory implementing decree/ministerial measure with general legal force (e.g., EU AI Act, Korea AI Basic Act & Presidential Enforcement Decree, China CAC Departmental Rules, U.S. Public Law).
- `executive_order` — Formal head-of-state, presidential, or cabinet executive directive binding executive agencies (e.g., U.S. Executive Orders, Cabinet Decisions establishing binding agency mandates).
- `regulatory_guidance` — Interpretive guidelines, supervisory opinions, circulars, compliance handbooks, or sector rules issued by a ministry or regulator explaining how legal duties apply.
- `strategy_paper` — National AI plans, action plans, white papers, expert-panel reports, or agenda-setting policy blueprints.
- `standards_guideline` — Technical standards, risk management frameworks, evaluation protocols, red-teaming guides, or contract/assurance checklists issued by standards bodies or technical ministries.
- `voluntary_commitment` — Formal signatory pledges, codes of practice, or multilateral voluntary codes of conduct (e.g., EU GPAI Code of Practice, EU AI Pact, Hiroshima Process Code of Conduct).

### 3.3 `binding_strength` (6 Labels)

Ordered from strongest to weakest legal force:

1. `binding_law` — Enacted statute, EU regulation, presidential enforcement decree, or formally promulgated administrative regulation carrying direct legal obligations and enforceable remedies/sanctions.
2. `executive_action` — Presidential executive order, OMB binding memorandum to federal agencies, or cabinet-level executive order binding government bodies (and indirectly contractors via procurement).
3. `regulatory_guidance` — Interpretive or supervisory guidance from a regulator carrying administrative compliance weight, safe-harbor presumption, or enforcement signaling without creating independent statutory penalties.
4. `standards_guideline` — Technical framework, evaluation guide, or national/voluntary standard (`GB/T`, NIST RMF, J-AISI guides) without direct legal compulsion unless incorporated by reference.
5. `voluntary_commitment` — Signatory code of practice, pledge, or cooperative industry commitment where adherence is opt-in (even when adherence grants a presumption of conformity).
6. `strategy_statement` — Aspirational national plan, policy vision, or research report containing no operative legal or technical compliance duties.

### 3.4 `issuer_types` (5 Labels)

- `executive` — Head of state/government, cabinet office, executive secretariat, or policy ministry acting in an executive capacity (e.g., White House, OMB, European Commission, Cabinet Office, State Council).
- `regulator` — Sectoral or cross-sectoral supervisory/enforcement authority (e.g., CAC, FTC, FDA, CFPB, EDPB, EDPS, PIPC, MFDS, PPC).
- `standards_body` — Technical standards, metrology, or AI safety evaluation institute (e.g., NIST/CAISI, TC260, Japan AISI, Korea AISI, CEN-CENELEC).
- `legal_registry` — Official statutory gazette or legal repository publishing enacted law (e.g., EUR-Lex, Federal Register, Korea National Law Information Center, e-Gov Law Search).
- `multi_agency` — Joint issuance by two or more distinct ministries, regulators, or agencies across institutional silos.

*Institution canonicalization rule:* When aggregating `key_institutions` at the jurisdiction level, surface strings must normalize to a single canonical entity ID (e.g., `"NIST"`, `"National Institute of Standards and Technology (NIST)"`, and `"NIST Information Technology Laboratory (ITL)"` map to `NIST`; `"経済産業省"` and `"METI"` map to `METI`; bilingual PIPC/MSIT/CAC/EC variants collapse to one canonical institution).

### 3.5 `source_tiers` (7 Labels)

Used for tier-weighted analytical views:

- `statutory_rule` — Enacted primary law, binding EU regulation, or binding statutory administrative rule/decree.
- `executive_action` — Binding presidential/cabinet executive order or mandatory government-wide directive (e.g., OMB M-25-21/22).
- `regulatory_guidance` — Substantive regulator guidelines, supervisory opinions, or sectoral compliance manuals.
- `technical_standard` — Formal technical standards, risk frameworks, evaluation profiles, or national standards body guides.
- `policy_strategy` — National AI strategies, basic plans, action plans, and official policy blueprints.
- `voluntary_framework` — Signatory codes of practice, AI pacts, and voluntary industry governance commitments.
- `implementation_resource` — Companion operational tools: FAQs, Q&As, templates, checklists, helpdesk guides, and explanatory summaries.

### 3.6 `corpus_roles` (4 Labels — New in v2.0.0)

Controls inclusion in headline cross-country divergence calculations vs. archival/supporting views:

- `primary_instrument` — Canonical, active (or adopted-pending-effective) primary text of a distinct law, order, substantive regulatory guideline, technical standard, national strategy, or major voluntary framework. **Default population for headline POL / FRM / CMP scores.**
- `companion_resource` — Official supplementary material tied to a primary instrument: FAQs, Q&As, expert interpretations, press announcements, transmittal memos, summary templates, portal overview pages, crosswalks, or bilingual/alternate-format mirrors. Retained for evidence provenance and browsing, **excluded from default headline divergence weights** to prevent double-counting.
- `draft_consultation` — Public consultation drafts, pre-enactment legislative notices, or superseded draft versions (e.g., NIST RMF 2022 drafts, 2024 China labeling draft, 2025 Korea enforcement decree draft notice). Excluded from active snapshot scoring; available in drafting-history views.
- `historical_baseline` — Superseded or revoked official instruments retained explicitly for **longitudinal policy–framing drift analysis** (e.g., superseded Guideline Ver. 1.0 once Ver. 2.0 is active, or revoked executive orders). Excluded from current active snapshot; included in historical time-series views.

### 3.7 `lifecycle_stages` (4 Labels)

- `draft` — Published for comment or interagency review; not yet formally adopted.
- `adopted_not_yet_effective` — Formally enacted or promulgated, with a future statutory effective date (`effective_date` recorded in ISO `YYYY-MM-DD`).
- `active` — Currently in force or actively recommended official policy/guidance.
- `superseded` — Formally replaced, repealed, revoked, or succeeded by a newer version (linked via `supersedes_id` on the replacing document).

### 3.8 `policy_domains` (19 Labels — 15 v1 + 4 v2.0.0)

Manifest-level topical tags (multi-label):

- `frontier_gpai` — Foundation models, large language models, general-purpose AI, and high-compute frontier systems.
- `privacy_data_protection` — Personal data processing, GDPR/PIPA/APPI compliance, anonymization, and privacy impact assessments.
- `civil_rights_nondiscrimination` — Fairness, algorithmic bias, equal protection, human dignity, and anti-discrimination law.
- `consumer_protection` — Deceptive practices, disclosures to end users, product safety, and consumer redress.
- `public_sector_governance` — Government internal deployment of AI, administrative law, agency CAIO structures, and public-sector impact assessments.
- `public_sector_procurement` — Public acquisition rules, vendor requirements, and federal/ministerial AI contracting standards.
- `healthcare_medical_devices` — Clinical AI, SaMD / AI-enabled medical devices, drug regulation, and health data governance.
- `standards_assurance` — Metrology, conformity assessment, ISO/NIST/TC260/AISI evaluation standards, and technical assurance.
- `platform_content_governance` — Algorithmic feeds, deep synthesis, synthetic-content labeling, takedowns, and online information ecosystems.
- `copyright_ip` — Copyrightability, text-and-data-mining exceptions, training-data opt-outs, and IP licensing for AI.
- `national_security` — Defense, intelligence, export/compute controls, CBRN/cyber national security, and strategic competition.
- `industrial_innovation` — R&D funding, startup/SME adoption, regulatory sandboxes, industrial competitiveness, and sector digitization.
- `education` — Generative AI in K–12 schools, universities, pedagogy, and academic integrity.
- `finance` — Algorithmic credit underwriting, banking chatbots, consumer finance, and financial stability.
- `critical_infrastructure` — Energy, telecommunications, transportation, meteorological systems, water, and cyber-physical critical networks.
- `agentic_ai` *(v2.0.0)* — Autonomous/tool-using AI agents, multi-step planning systems, agent identity, delegated permissions, and computer-use systems.
- `embodied_physical_ai` *(v2.0.0)* — Robotics, autonomous vehicles, drones, industrial cyber-physical actuators, and physical-world AI systems.
- `companion_ai` *(v2.0.0)* — Anthropomorphic, emotional-attachment, conversational-companion, and interactive persona AI services (including minor-safety and psychological-harm rules).
- `sovereign_compute` *(v2.0.0)* — Domestic AI compute clusters, semiconductor/chip supply, datacenter energy infrastructure, and national sovereign AI stack capacity.

---

## 4. Operative Policy Extraction Dimensions

### 4.1 `policy_requirements` (17 Labels — 12 v1 + 5 v2.0.0)

Code a requirement **only when the text explicitly expects, recommends, or mandates** that actors perform the control (not merely when describing a generic concept in passing). Every assigned label MUST carry at least one verbatim evidence span.

| Label | Operational definition | Boundary / exclusion test |
|---|---|---|
| `risk_assessment` | Systematic identification, analysis, impact assessment, or classification of AI risks (including fundamental-rights/privacy/high-impact assessments). | Distinct from *executing tests* (`pre_deployment_testing`) or *adversarial probing* (`red_teaming`). |
| `pre_deployment_testing` | Functional validation, accuracy/robustness benchmarking, verification, or conformity testing performed before release or major modification. | Must describe empirical testing/evaluation prior to deployment, not purely paper risk checklists (`risk_assessment`). |
| `red_teaming` | Explicit adversarial testing, penetration testing, jailbreak/misuse probing, or structured hostile-actor simulation against an AI system. | Do NOT code generic QA or unit testing as `red_teaming`; require adversarial/attack-oriented evaluation language. |
| `incident_reporting` | Mandatory or recommended notification of serious AI malfunctions, safety/security breaches, rights infringements, or post-market adverse events to authorities or affected parties. | Distinct from periodic routine compliance filings (`reporting_obligation` in enforcement) — must concern *incidents/harms/failures*. |
| `transparency_disclosure` | Outward-facing notice to users, affected persons, or the public that they are interacting with AI, how decisions are made, system limitations, or rights/opt-outs. | Distinct from *technical developer documentation* (`model_documentation`) and *artifact-level watermarking* (`content_provenance`). |
| `model_documentation` | Creation and maintenance of technical documentation, model cards, system cards, datasheets, logs, compliance records, or training-content summaries for regulators/downstream deployers. | Focuses on structured technical records/artifacts rather than user-facing UX notices (`transparency_disclosure`). |
| `third_party_audit` | Independent external audit, notified-body conformity assessment, accredited certification, or external verification by an entity independent of the developer/deployer. | Exclude purely internal self-assessments (`risk_assessment`). |
| `access_controls` | Cybersecurity controls, authentication, role-based access, model-weight security, API gating, rate-limiting, or data-security safeguards protecting models/inputs. | Distinct from autonomous-agent action permissions/kill-switches (`agentic_autonomy_controls`). |
| `compute_governance` | Obligations triggered by training compute thresholds (e.g., FLOPs thresholds like `10^25` FLOPs), compute-cluster reporting, cloud/chip KYC, or compute-resource oversight. | Do NOT code generic mentions of "computing power" infrastructure investment (use `sovereign_compute` domain instead). |
| `content_provenance` | Explicit or implicit marking, watermarking, cryptographic metadata, C2PA-style provenance, or machine-readable labeling of AI-generated/synthetic text, audio, image, or video outputs. | Specific to marking synthetic *outputs/artifacts*, narrower than general AI interaction disclosure (`transparency_disclosure`). |
| `human_oversight` | Human-in-the-loop / human-on-the-loop review, manual override/stop mechanisms, meaningful human appeal/intervention, or prohibition of solely automated consequential decisions. | Require operational human control/intervention duties, not merely rhetorical "human-centric AI" slogans. |
| `registration_licensing` | Prior registration in a public/regulatory AI or algorithm registry, pre-market filing/approval, conformity declaration filing, or formal license/permit before operating. | Code the *substantive duty on the operator* here; pair with `licensing_requirement` or `reporting_obligation` under `enforcement_mechanisms` when backed by legal sanction/blocking. |
| `agentic_autonomy_controls` *(v2.0.0)* | Controls specific to autonomous/tool-using AI agents: unique agent identity/attribution, least-privilege tool/API permissions, action scoping, credential revocation, default-deny execution, or emergency kill-switches/interruptibility. | Use only when text governs autonomous *action-taking/tool-using agents*, not static chatbot UX. |
| `training_data_governance` *(v2.0.0)* | Operative obligations on training datasets: lawful provenance/licensing verification, copyright opt-out compliance, data quality/bias curation, personal-data minimization/anonymization in training, or public training-data summaries. | Distinct from general runtime user privacy; must govern *training/fine-tuning data*. |
| `frontier_safety_evaluation` *(v2.0.0)* | Government, AISI, or structured frontier-model safety evaluations targeting severe/systemic capabilities (CBRN, offensive cyber, autonomous replication, loss of control), including pre-release government evaluation access. | Distinct from standard sectoral QA (`pre_deployment_testing`); requires frontier/systemic capability evaluation or AISI/AI-Office evaluation frameworks. |
| `open_weight_obligations` *(v2.0.0)* | Specific legal obligations, exemptions, or carve-outs governing open-source / open-weight model releases (e.g., parameter/weight release duties, systemic-risk override of open-source exemptions, downstream modification triggers). | Code only when the text explicitly addresses open-weight / open-source model release rules or carve-outs. |
| `domestic_representative` *(v2.0.0)* | Requirement for foreign/offshore AI providers without a local establishment to appoint an authorized domestic representative or legal contact point inside the jurisdiction. | Distinct from general registration (`registration_licensing`). |

### 4.1a `obligation_strengths` (4 Labels — New in v2.1.0)

Each extracted `safety_requirements[]` record carries an optional `obligation_strength` distinguishing binding statutory mandates from "endeavour to" duties or soft guidance (preventing soft clauses inside binding laws from scoring identically to compulsory mandates):

| Label | Operational definition | Boundary / exclusion test |
|---|---|---|
| `mandatory` | Unconditional binding duty expressed with compulsory legal language (*shall*, *must*, *is required to*, *하여야 한다*, *应当*, *なければならない*). | Operative clause imposes an unqualified compulsory requirement on covered entities. |
| `conditional` | Binding or operational duty triggered only when specified thresholds, risk tiers, procurement contexts, or opt-in safe harbors apply (*where high-risk*, *if compute exceeds...*, *as a condition of...*). | Applies strictly upon meeting explicit scope triggers, thresholds, or opt-in conditions stated in the text. |
| `recommended` | Actionable non-binding expectation, best practice, or soft-law guidance (*should*, *is encouraged to*, *endeavour to*, *권고한다*, *望ましい*, *鼓励*). | Prescribes concrete operational practices without legal compulsion. |
| `aspirational` | High-level principle, strategic vision, or future policy intent (*strive to promote*, *aims to foster*, *will explore*) without concrete compliance steps. | Broad normative vision or exploratory intent rather than actionable operational controls. |

### 4.2 `enforcement_mechanisms` (9 Labels)

Code the concrete consequence, oversight hook, or compliance posture explicitly articulated in the document:

- `civil_penalty` — Administrative fines, statutory monetary penalties, civil damages, or revenue-percentage sanctions (e.g., EU Art. 99 fines, Korea Art. 43 administrative fines, China CAC monetary fines).
- `criminal_penalty` — Imprisonment, criminal fines, or referral for criminal prosecution under penal statutes.
- `market_access_restriction` — Product bans, withdrawal/recall orders, suspension of AI services, app-store takedowns, or prohibition on placing non-compliant systems on the market.
- `procurement_condition` — Mandatory compliance clauses tied to government purchasing, federal/ministerial contracting, or public funding eligibility (e.g., OMB M-25-22, Japan administrative procurement rules).
- `licensing_requirement` — Authority to withhold, suspend, or revoke a mandatory operating license, pre-market approval, or algorithm filing required to legally operate.
- `regulatory_supervision` — Investigatory powers, on-site/remote inspections, information requests, corrective/cease-and-desist orders, or ongoing supervisory oversight by a regulator.
- `reporting_obligation` — Enforceable statutory/administrative duty to submit compliance reports, impact assessments, filings, or disclosures to an authority (even without a specified fine in the same document).
- `soft_enforcement` — Voluntary adherence, best-practice recommendations, self-regulation, naming/public-notice persuasion, safe-harbor incentives, or non-binding guidance explicitly lacking coercive sanctions.
- `none_specified` — Document articulates no enforcement, compliance, or oversight mechanism whatsoever (e.g., pure R&D strategy or procedural notice). Do not co-code `none_specified` alongside active enforcement mechanisms unless the text explicitly carves out unenforceable parts.

### 4.3 `application_domains` (10 Labels)

Multi-label scope of AI use cases explicitly covered by the instrument:

- `general_purpose_models` — Horizontal, cross-sector, foundation, or generative AI models/systems not restricted to a single vertical.
- `critical_infrastructure` — Energy grids, water, transport, telecommunications, meteorology, and vital infrastructure operations.
- `biometrics` — Facial recognition, biometric categorization, emotion recognition, voiceprint, or biometric identification.
- `public_sector_use` — Government agencies, public administration, social benefits, municipal services, and public-sector AI deployment.
- `employment` — Hiring, recruitment, worker evaluation, task allocation, workplace monitoring, and HR decisions.
- `education` — Admissions, grading, K–12/university instruction, student assessment, and educational services.
- `healthcare` — Clinical decision support, diagnostics, medical devices, pharmaceuticals, and patient care.
- `finance` — Credit scoring, lending, insurance underwriting, fraud detection, banking chatbots, and financial markets.
- `law_enforcement` — Policing, predictive crime analytics, forensics, judicial/sentencing support, and border/migration control.
- `defense` — Military, national defense, intelligence, weaponized systems, and dual-use national security applications.

---

## 5. Risk Framing Dimension & Coding Rules

### 5.1 `risk_framings` (8 Canonical Frames)

Classify framing strictly from the document's **explicit stated reasoning** (preamble, purpose clauses, policy justification) — **never** from the analyst's external geopolitical theory.

| Frame | Core stated justification | Boundary / disambiguation test |
|---|---|---|
| `existential_catastrophic` | Severe, irreversible, or civilization-scale harms: CBRN proliferation, mass-casualty cyberattacks, uncontrollable autonomous AI / loss of human control, or systemic catastrophic risk. | Do NOT code ordinary consumer bugs or routine privacy breaches here; require explicit catastrophic, CBRN, loss-of-control, or extreme systemic-risk rationale. |
| `national_security` | Defense readiness, geopolitical/strategic technological supremacy, intelligence/military advantage, foreign-adversary threats, supply-chain/export sovereignty, or critical national-defense resilience. | Distinct from purely commercial growth (`economic_competitiveness`); requires security, defense, adversary, or strategic-sovereignty framing. |
| `economic_competitiveness` | National economic growth, GDP/productivity gains, global market leadership, industrial competitiveness, export/trade advantage, or preventing domestic firms from falling behind foreign peers. | Distinct from `innovation_enablement`: `economic_competitiveness` emphasizes **macroeconomic/industrial competition & leadership**; `innovation_enablement` emphasizes **removing friction and enabling safe adoption/deployment**. |
| `fundamental_rights` | Protection of human dignity, constitutional/civil rights, privacy and personal data rights, non-discrimination, fairness, due process, freedom of expression, democratic values, or rule of law. | Distinct from `consumer_public_safety`: use `fundamental_rights` when text anchors rationale in **rights, equality, privacy, dignity, or democracy** rather than product/physical/market safety. |
| `social_stability` | Public order, socialist core values, social harmony, public-opinion governance, prevention of social unrest, disinformation/rumor containment, cultural/moral norms, or collective societal cohesion. | Distinct from individual `fundamental_rights` and individual `consumer_public_safety`: centers on **collective order, public-opinion ecosystem, and societal cohesion**. |
| `innovation_enablement` | Accelerating beneficial AI R&D, lowering compliance friction, fostering trustworthy ecosystems, regulatory sandboxes, agile/pro-innovation governance, and enabling widespread public/private AI adoption. | Emphasizes *how governance unlocks safe use and experimentation*, distinct from zero-sum international rivalry (`economic_competitiveness`). |
| `consumer_public_safety` | Protecting consumers, patients, children, and the general public from physical injury, financial fraud, deceptive practices, unsafe products, medical errors, or operational system harms. | Anchored in **harm prevention, product/service reliability, and user safety** rather than constitutional rights (`fundamental_rights`) or public order (`social_stability`). |
| `labor_transition` | Workforce disruption, job displacement, worker protections, reskilling/upskilling, collective bargaining, or equitable sharing of AI productivity gains across labor markets. | Require explicit workforce/employment transition rationale as a stated reason for governance (not merely listing `employment` as a high-risk domain). |

### 5.2 Framing Invariants, `frame_share` & Scoring Rules

Every valid `risk_framing` extraction MUST satisfy all six invariants:

1. **Complete 8-key `frame_confidence` vector:** All 8 canonical labels from `observatory-taxonomy.json["risk_framings"]` MUST be present as keys with numeric scores in `[0.0, 1.0]`. Absent/unsupported frames receive `0.0` (never omitted), preventing variable-key aggregation bias.
2. **Proportional `frame_share` vector *(v2.1.0)*:** New v2.1+ analyses also elicit `frame_share` — an 8-key compositional share distribution summing to `1.0` representing each frame's share of the document's stated justification (preventing multi-frame confidence inflation from flattening framing mixes). For legacy artifacts lacking `frame_share`, downstream aggregation MUST zero out `frame_confidence` entries below `frame_mention_floor` (`0.15`, canonicalized in `label-definitions.json`) before normalizing per document to sum to `1.0`.
3. **Dominant-frame consistency:** `dominant_frame` MUST be a valid canonical frame AND MUST achieve the highest confidence score in `frame_confidence` (`frame_confidence[dominant_frame] == max(frame_confidence.values())`) and the highest share in `frame_share` when present.
4. **Disjoint secondary frames:** `secondary_frames` contains only frames that materially shape the document's stated reasoning (typically score `>= 0.25`), MUST NOT contain duplicates, and MUST NOT include `dominant_frame`.
5. **Workforce boundary rule:** Job displacement, worker protections, and **workforce reskilling/retraining** belong strictly under `labor_transition` — NEVER under `economic_competitiveness`.
6. **Mandatory frame-tagged evidence spans:** Every assigned `dominant_frame` and `secondary_frames` entry MUST be backed by at least one verbatim quote in `evidence_spans` (carrying an optional `frame` tag in v2.1+ so each span maps unambiguously to the frame it supports).

---

## 6. Multilingual Evidence-Span & Quote-Grounding Protocol

Because Project Babel analyzes original-language primary texts in **English (`en`), Korean (`ko`), Japanese (`ja`), and Chinese (`zh`)**, auditability depends on strict quote grounding:

1. **Verbatim original-language quotes:** `evidence[].quote` and `evidence_spans[].quote` MUST be copied **verbatim** from `normalized.json["plain_text"]` in the document's original language — no silent translation, paraphrasing, or synthetic ellipses that break substring verification. Evidence should be capped at 2 spans per label (up to ~400 chars per span).
2. **Optional English gloss (`quote_en`):** For non-English quotes, extractors may populate an optional `quote_en` field containing a concise English translation (badged as machine translation in the UI) while preserving the verbatim original in `quote`.
3. **Section attribution & persisted grounding offsets:** `source_section` MUST identify the article, recital, chapter, heading, or page number where the quote appears (e.g., `"Article 50(1)"`, `"제31조제1항"`, `"第十二条"`, `"Page 14"`). In v2.1+, the grounding scorer persists per-span `grounding_status` (`verbatim` / `approximate` / `not_found`) plus `start_char` and `end_char` character offsets using NFKC and whitespace/hyphen-insensitive matching against `normalized.json["plain_text"]`.
4. **Automated grounding gate (`grounding_pass_threshold: 0.90`):** Quality audits verify quote grounding against `normalized.json["plain_text"]`. Empty-evidence extractions return `null` (never `1.0`). Any document falling below **0.90 grounded quotes** (canonicalized in `label-definitions.json`), or exhibiting garbled CID/Shift-JIS font extraction, SPA navigation chrome, or `0` AI-domain keywords, is flagged for re-parse / re-analysis.
5. **Long-document fidelity:** Mega-statutes and long technical guidelines (e.g., EU AI Act, Prohibited Practices Guidelines, METI/NIST/NIA manuals) MUST be parsed with legal-heading sectionizers and analyzed using full-context token-budgeted windows or chapter-aware map-reduce chunking — never prefix-truncated to recitals or tables of contents.

---

## 7. Confidence Calibration Scale (Model Self-Reported)

Both `policy_extraction.confidence` and item-level `confidence` / `frame_confidence` values live on `[0.0, 1.0]` and MUST be presented in UI/reports explicitly as **model self-reported confidence** (distinct from external human inter-rater reliability):

- **High (`0.80 – 1.00`):** Direct, unambiguous, repeated textual support in operative clauses or explicit purpose provisions.
- **Medium (`0.60 – 0.79`):** Clear textual support, but limited to a single passage, broad principle, or minor ambiguity in scope/bindingness.
- **Low (`0.00 – 0.59`):** Sparse evidence, summary/companion language, indirect inference, or partial text extraction. Canonical low-confidence thresholds (`label-definitions.json`): `low_confidence_policy = 0.70` and `low_confidence_framing = 0.60`.

---

## 8. Analytical Validity, Uncertainty & Divergence Index Methodology

1. **Multi-dimensional Policy Divergence (`POL`) & Regime Coverage Index:** Comparing only `policy_requirements` shares compresses divergence across jurisdictions because soft frameworks and hard statutes cite similar core concepts. Authoritative `POL` combines **requirements**, **enforcement mechanisms**, and **binding strength** (sourced from the authoritative manifest rather than model guesses). Alongside document-mix TVD, Project Babel computes a **Regime Coverage Index** — for each requirement and enforcement mechanism, the strongest binding level (`0..4`: none / voluntary / guidance / executive / binding_law) imposed by an active primary instrument, compared via normalized L1 distance — which is invariant to adding FAQs or companion documents.
2. **Active primary-instrument default:** Headline divergence scores **filter** (not merely down-weight) to `lifecycle_stage in {"active", "adopted_not_yet_effective"}` and `corpus_role == "primary_instrument"` (with unclassified docs excluded from headline scoring and an explicit toggle for all-corpus / sensitivity views). Drafts (`draft_consultation`), companions (`companion_resource`), and superseded texts (`historical_baseline`) remain browsable and feed longitudinal timeline charts without distorting current-snapshot metrics.
3. **Small-sample uncertainty & null calibration:** With `n = 11–15` active primary instruments per jurisdiction, raw TVD carries upward finite-sample bias. The scoring engine reports seeded bootstrap confidence intervals over documents alongside a label-permutation null baseline and weight-sensitivity rank stability on `/methodology`.
4. **Decoupling-first reporting & rounding integrity:** Views lead with **POL vs. FRM** directly (keeping `CMP = round(0.6 * POL + 0.4 * FRM)` secondary for continuity). Frame percentage bars use Largest Remainder (Hamilton) apportionment so displayed mixes always sum to `100%`. Country freshness displays the latest underlying document `publication_date` separately from the latest pipeline analysis timestamp (`analyzed_at`).
