# Project Babel

**An open, reproducible observatory for comparative AI governance. Measuring how five governments differ on *what* they require of AI — and *why* they say those rules are necessary.**

Live observatory: **[project-babel.com](https://project-babel.com)**

---

## What this is

Project Babel tracks how the **United States, European Union, South Korea, Japan, and China** govern artificial intelligence using primary official government documents — legislation, executive orders, regulatory guidance, technical standards, national strategies, and voluntary commitments.

Every document is converted into two independent, quote-grounded structures governed by **Taxonomy v2.1.0** (`data/taxonomies/observatory-taxonomy.json`) and a single canonical definitions registry (`data/taxonomies/label-definitions.json`):

1. **Policy structure (*what is required*)** — concrete safety requirements (17 labels spanning risk assessments, red-teaming, agentic autonomy controls, frontier safety evaluations, training data governance, content provenance, and domestic representatives, each with optional deontic `obligation_strength`: `mandatory` | `conditional` | `recommended` | `aspirational`), enforcement mechanisms (9 labels), and authoritative manifest legal binding strength (`binding_law` through `strategy_statement`).
2. **Risk framing (*why it is required*)** — stated rationales scored across a fixed **eight-label framing vocabulary**: existential/catastrophic risk, national security, fundamental rights, economic competitiveness, innovation enablement, social stability & public order, consumer & public safety, and labor & workforce transition.

Comparing both axes across all five jurisdictions produces **relative, null-calibrated peer-distance scores with bootstrap 90% confidence intervals** — never editorial letter grades or normative rankings.

## Why Policy–Framing Decoupling matters

Traditional trackers catalog either *which laws exist* or *subjective corporate safety grades*. Project Babel isolates the gap between rules and rationales:

1. **Same rule, different reason (fragile alignment):** Two governments can converge on identical technical controls — e.g., AI agent identity/permission controls or synthetic-media watermarking — while justifying them through incompatible rationales (national security vs. social stability vs. fundamental rights). When underlying rationales diverge, technical convergence sits on unstable ground.
2. **Same reason, different rule (convergence candidates):** Two governments that justify AI governance through compatible framings while differing on current statutory teeth are stronger candidates for durable future alignment.

The dashboard leads with **POL vs. FRM** decoupling findings, an interactive **2D Decoupling Map**, a **5×5 Pairwise Matrix**, a **25×5 Obligation & Clause Matrix** (`/matrix`), a **Cross-Jurisdiction Clause & Citation Explorer** (`/clauses`), a **Longitudinal Regime Evolution & Amendment Diff** view (`/evolution`), and label-conditioned bilateral diffs (`/compare`) traceable down to verified verbatim source quotes.

## How the scoring works

Each jurisdiction receives dual-axis peer-distance metrics alongside a regime-level binding coverage index:

- **Policy Divergence (`POL`)** — weighted multi-dimensional Total Variation Distance (TVD) across per-document normalized `safety_requirements` (`0.45`), `enforcement_mechanisms` (`0.30`), and authoritative manifest `binding_strength` (`0.25`), exposed via `policyBreakdown`.
- **Framing Divergence (`FRM`)** — TVD across the eight-frame distribution using explicit compositional `frame_share` allocations (or sub-`0.15` noise-filtered normalized `frame_confidence` on legacy rows), displayed with Largest Remainder (Hamilton) rounding summing to exact `100%`.
- **Regime Coverage Index (`COV L1`)** — normalized L1 distance across each jurisdiction's strongest active binding level (`L0–L4`) for all 25 requirement and enforcement controls, invariant to companion FAQ volume.
- **Composite (`CMP`)** — secondary blend `round(0.6 × rawPOL + 0.4 × rawFRM)` with zero post-hoc min-max stretching.
- **Uncertainty & Null Calibration:** Deterministic 200-resample bootstrap **90% confidence intervals** (`[low, high]`) per jurisdiction plus a **200-draw label-permutation null baseline** calibrating a neutral sequential single-hue visual scale (*within null noise* → *above random null* → *above 90th-pct null*).
- **Transparent scoring modes (`?mode=headline|all` + opt-in `?states=1`):**
  - **`headline` (default — Codebook §8.2):** Strictly filters to sovereign `active` or `adopted_not_yet_effective` `primary_instrument`s (**`n = 91`** across the 5 sovereign jurisdictions), excluding companion resources, drafts, superseded texts, unclassified rows, and opt-in subnational overlays.
  - **`all`:** Equally weights all sovereign analyzed documents (**`n = 138`** sovereign; **`n = 144`** with `?states=1`), paired with a 4-specification sensitivity & Spearman `ρ` grid on `/methodology`.
  - **Opt-in U.S. State Statutory Overlay (`?states=1`):** Adds **6** enacted U.S. state AI statutes (`corpus_role: "subnational_overlay"`: CA SB 53, CA AB 2013, CO SB 24-205, CO SB 26-189, TX TRAIGA, NY RAISE — `5` active + `1` superseded) across `/`, `/matrix`, `/clauses`, `/evolution`, `/compare`, `/jurisdictions/[slug]`, and public APIs while keeping sovereign baselines apples-to-apples by default.

## Who this is for

- **Policy researchers & political scientists** studying comparative regulation, longitudinal institutional drift (`/evolution`), and policy–framing decoupling
- **AI safety & standards teams** auditing which jurisdictions impose binding rules across 25 concrete controls (`/matrix`) and searching `2,786` grounded multilingual clauses (`/clauses`)
- **Journalists & think-tank analysts** needing label-conditioned bilateral comparisons (`/compare`), dual-language original + machine-translated evidence quotes, and UTF-8 BOM CSV / JSON / versioned BibTeX exports
- **Builders & compliance teams** contextualizing the EU AI Act & Digital Omnibus, US Executive Orders, sectoral rules (HHS ONC, Treasury, BIS, Copyright Office, DoD), opt-in state AI laws & NIST CAISI frameworks, South Korea's AI Basic Act & National AI Action Plan, Japan's AI Promotion Act, Second AI Basic Plan & FSA/METI/Bunka guidance, and China's CAC measures, MIIT standards & TC260 Framework 3.0

## Scope, corpus & verified provenance

- **Tracked sovereign jurisdictions (5) + opt-in state overlay:** United States (**42** total: **36** federal sovereign + **6** opt-in `subnational_overlay` state statutes), European Union (**24**), South Korea (**20**), Japan (**37**), China (**21**). *(Major U.S. state statutes — CA SB 53, CA AB 2013, CO SB 24-205, CO SB 26-189, TX HB 149 TRAIGA, NY RAISE Act — are excluded from sovereign baselines by default and opt-in via `?states=1`.)*
- **Curated corpus (2017 – Nov 19, 2026):** **144** verified, deduplicated official documents (**91** active primary sovereign headline instruments + **47** sovereign supporting/superseded/draft instruments + **6** opt-in U.S. state statutes; **`12`** `supersedes_id` amendment lineage chains) across **61** official portals. Includes 2026 landmarks across all five jurisdictions (EU Digital Omnibus Regulation (EU) 2026/1744 & Art. 50 Guidelines, EU 2020–2021 historical baselines, US BIS Nov 2026 remote-access rule / EO 14409 / EO 14365 / EO 14434 / TAKE IT DOWN Act / HHS ONC HTI-1 / Treasury / Copyright Office / DoD 3000.09, KR National AI Action Plan, FSC guidelines & all 3 recovered `law.go.kr` statutes, JP Second AI Basic Plan, AI Promotion Act, FSA/METI/Bunka guides, and CN TC260 Framework 3.0 & MIIT standardization guidelines).
- **Parsing & homogeneous v2.1.0 analysis:** **144/144** documents parsed offline under **Parser `0.3.0`** (`93 pymupdf`, `48 beautifulsoup4`, `3 hwpx_xml`; `0` stub/wiped documents; Korean `law.go.kr` `#hisComment`/`.cont_subtit` and CAC nav/footer chrome stripped cleanly) and analyzed homogeneously under **Taxonomy v2.1.0** (`analysis_version: "0.3.0"`, `provider: "gemini"`, `model: "gemini-4-neon"`, `0` legacy rows; multi-provider pipeline also supports Anthropic `claude-opus-5-5` fallback and zero-cost `ingest-document-analysis` verification).
- **100.0% verbatim evidence grounding, 25-doc blind gold set & freshness automation:** **`2,786 / 2,786` (`100.0%`)** exact verbatim evidence spans across all 144 documents (`0` ungrounded, `min_per_doc = 100.0%`), **`156 / 156`** committed artifacts passing **9** Draft 2020-12 JSON Schemas (`0` errors), automated weekly **Freshness Watch** (`.github/workflows/freshness-watch.yml` + `observatory check-freshness`), and stratified 25-document multilingual blind gold-set benchmark (`data/eval/gold_set_v2.json`, `n=25`, `5 × 5` across EN/KO/JA/ZH, `stratified_v1.0_blind_internal`, mirrored to `/methodology#validation`): Requirement Micro F1 **`0.899`** (Macro `0.887`), Enforcement Micro F1 **`0.954`** (Macro `0.964`), Dominant Frame Acc **`0.800`** (`κ = 0.747`, `α = 0.748`), Binding Strength Acc **`0.920`** (`κ = 0.891`, `α = 0.893`).

## Architecture & repository map

| Layer | Path | Documentation |
|---|---|---|
| **Web app** — Next.js 16 (Node 22+) dashboard, statistical engine, `/matrix`, `/clauses`, `/evolution`, `/compare`, `/methodology` (25-doc gold-set scorecard & freshness ledger), opt-in `?states=1`, CORS APIs & UTF-8 BOM CSV/JSON/BibTeX exports | `apps/web/` | [`apps/web/README.md`](apps/web/README.md) |
| **Pipeline** — Python 3.11 discovery, SSRF-hardened HTTP/Playwright retrieval, Parser `0.3.0` (`pymupdf` primary PDF), multi-provider `gemini-4-neon` (1M context) / `claude-opus-5-5` concurrent runner, `ingest-document-analysis`, NFKC grounding, `check-freshness`, gold-set v2 eval (with Krippendorff's α & per-jurisdiction F1) | `services/pipeline/` | [`services/pipeline/README.md`](services/pipeline/README.md) |
| **Database** — Neon Postgres migrations `001`–`005` (`documents` + authoritative `binding_strength` + `subnational_unit`/`supersedes_id` in `raw_metadata`, longitudinal `document_snapshots`, indexed `machine_*` tables, `machine_jurisdiction_analyses`) | `sql/migrations/` | [`sql/migrations/README.md`](sql/migrations/README.md) |
| **Shared schemas** — Nine Draft 2020-12 JSON Schemas (`validate-artifacts`: `156/156` validated, `0` errors) across taxonomy, label definitions, manifests (incl. `subnational_overlay`), analyses, `/api/overview`, `/api/matrix`, `/api/clauses`, and `/api/evolution` | `packages/schemas/` | [`packages/schemas/README.md`](packages/schemas/README.md) |
| **Data corpus** — Taxonomy v2.1.0, `label-definitions.json`, manifests (`61` portals / `144` seeds), 25-doc blind gold set (`gold_set_v2.json`) + results, 144 raw/parsed/analyzed documents, recovery & freshness logs | `data/` | [`data/README.md`](data/README.md) |
| **Documentation** — Product brief, architecture, Codebook v2.1.0, operational runbooks | `docs/` | [`docs/README.md`](docs/README.md) |

## Getting started

Run the dashboard locally against the committed 144-document `data/` corpus without Postgres (requires **Node.js ≥ 22.18.0**):

```bash
cd apps/web
npm install
npm run dev
# → http://localhost:3000
```

Run pipeline validation, schema checks, grounding, gold-set evaluation, and tests (POSIX or Windows):

```bash
# POSIX
./scripts/bootstrap.sh && make taxonomy && make sources && make validate-artifacts && make grounding && make test

# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File scripts/bootstrap.ps1
$env:PYTHONPATH="services/pipeline/src"
services\pipeline\.venv\Scripts\python.exe -m observatory.cli validate-taxonomy
services\pipeline\.venv\Scripts\python.exe -m observatory.cli validate-sources
services\pipeline\.venv\Scripts\python.exe -m observatory.cli validate-artifacts
services\pipeline\.venv\Scripts\python.exe -m observatory.cli check-grounding
services\pipeline\.venv\Scripts\python.exe -m observatory.cli evaluate-gold-set data/eval/gold_set_v2.json
services\pipeline\.venv\Scripts\python.exe -m pytest -c services/pipeline/pyproject.toml services/pipeline/tests
```

## License and attribution

Code in this repository is published as an open research project. Raw government documents under `data/raw/` are retained copies of official public publications for reproducibility — each retrieval log records the canonical URL, and the authoritative source is always the issuing government. See [`data/README.md`](data/README.md) for per-jurisdiction licensing notes.
