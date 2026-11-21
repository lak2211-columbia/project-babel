# Product Brief

## Core thesis

AI governance divergence matters along two independent dimensions:

1. **Policy structure — what governments require in practice:** concrete safeguards, deontic obligation strength (`mandatory` / `conditional` / `recommended` / `aspirational`), enforcement hooks, and authoritative legal binding strength.
2. **Risk framing — why governments say those requirements are necessary:** the stated rationale across an eight-frame analytical vocabulary.

Separating these two axes exposes **policy–framing decoupling**:

- Jurisdictions that converge on operational mechanics (e.g., agentic identity/permission controls, synthetic-media watermarking, incident reporting) while diverging on underlying rationale sit on fragile, reversible alignment (*same rule, different reason*).
- Jurisdictions that share compatible risk framing while differing on current binding instruments are stronger candidates for durable future convergence (*same reason, different rule*).

Project Babel is a non-normative comparative research instrument. Scores measure relative, null-calibrated peer distance with explicit bootstrap 90% confidence intervals across the five-jurisdiction group — never editorial quality, traffic-light moral grades, or compliance rankings against an external ideal.

## Core users

- **Policy researchers & political scientists** studying comparative regulation, uncertainty-quantified divergence, and longitudinal institutional drift
- **AI safety, governance, and standards teams** auditing binding coverage across 25 concrete controls (`/matrix`) and tracking technical convergence
- **Journalists and think-tank analysts** who need label-conditioned bilateral comparisons (`/compare`), dual-language original + machine-translated evidence quotes, and UTF-8 BOM CSV / JSON / versioned BibTeX exports
- **Builders and legal/compliance practitioners** placing national instruments (EU AI Act & Digital Omnibus, US Executive Orders & NIST CAISI standards, South Korea AI Basic Act, Japan AI Promotion Act & Basic Plans, China CAC measures & TC260 frameworks) in comparative context

## Primary research questions

- Which jurisdictions are converging or fragmenting on concrete AI governance requirements, enforcement mechanisms, and authoritative binding strength?
- Which jurisdictions justify AI governance through compatible or incompatible risk framings?
- Where do concrete rules align despite divergent rationales (*same rule, different reason*), and where does shared rationale diverge in legal teeth (*same reason, different rule*)?
- Which gaps exceed small-sample random permutation noise, and how sensitive are peer distances to document-mix vs. regime-level binding coverage (`COV L1`)?
- Does framing alignment predict subsequent policy convergence over time?

## Tracked scope & methodological boundaries

### Sovereign baseline (five jurisdictions)

- **United States** — federal statutes, executive orders, OMB directives, NIST/CAISI frameworks, federal agency guidance
- **European Union** — AI Act & amending regulations (e.g., Digital Omnibus), Commission guidelines, GPAI & Transparency Codes of Practice, EDPB/EDPS opinions
- **South Korea** — AI Basic Act & Enforcement Decree, MSIT/PIPC/MFDS guidelines, national AI action plans
- **Japan** — AI Promotion Act, Cabinet AI Basic Plans, MIC/METI business guidelines, J-AISI technical safety guides, Hiroshima AI Process commitments
- **China** — NPC statutory amendments, State Council strategies, CAC binding administrative measures, TC260 national standards & AI Safety Governance Frameworks

*Federalism & sub-national note:* For apples-to-apples sovereign comparison, the core index tracks national/supranational authorities. Major US state statutes (e.g., California SB 53/AB 2013, Colorado SB 26-189, Texas TRAIGA, New York RAISE Act) are documented explicitly as sub-national context rather than mixed silently into federal counts.

### Document lifecycle & headline population (Codebook §8.2)

Every manifest document carries both a `lifecycle_stage` (`draft`, `adopted_not_yet_effective`, `active`, `superseded`) and a `corpus_role` (`primary_instrument`, `companion_resource`, `draft_consultation`, `historical_baseline`). Headline divergence scoring (`mode=headline`) strictly filters to `active` or `adopted_not_yet_effective` `primary_instrument`s (excluding unclassified rows), with an explicit `mode=all` toggle and a 4-specification sensitivity grid (`headline`, `binding_weighted`, `coverage_l1`, `all`) on `/methodology`.

### Non-goals

- Broad news, op-ed, or social media sentiment scraping
- Editorial letter grades or normative "best regulator" scorecards
- Human approval queues blocking machine-reproducible updates (quality is enforced transparently via Draft 2020-12 JSON Schemas, NFKC quote grounding, `"Model self-reported"` confidence disclosures, and gold-set calibration benchmarks instead)
