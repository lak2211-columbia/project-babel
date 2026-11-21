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

The dashboard leads with **POL vs. FRM** decoupling findings, an interactive **2D Decoupling Map**, a **5×5 Pairwise Matrix**, a **25×5 Obligation & Clause Matrix** (`/matrix`), and label-conditioned bilateral diffs (`/compare`) traceable down to verified verbatim source quotes.

## How the scoring works

Each jurisdiction receives dual-axis peer-distance metrics alongside a regime-level binding coverage index:

- **Policy Divergence (`POL`)** — weighted multi-dimensional Total Variation Distance (TVD) across per-document normalized `safety_requirements` (`0.45`), `enforcement_mechanisms` (`0.30`), and authoritative manifest `binding_strength` (`0.25`), exposed via `policyBreakdown`.
- **Framing Divergence (`FRM`)** — TVD across the eight-frame distribution (using explicit `frame_share` when present, or zeroing sub-`0.15` noise before normalizing per-document `frame_confidence` to `1.0`), displayed with Largest Remainder (Hamilton) rounding summing to exact `100%`.
- **Regime Coverage Index (`COV L1`)** — normalized L1 distance across each jurisdiction's strongest active binding level (`L0–L4`) for all 25 requirement and enforcement controls, invariant to companion FAQ volume.
- **Composite (`CMP`)** — secondary blend `round(0.6 × rawPOL + 0.4 × rawFRM)` with zero post-hoc min-max stretching.
- **Uncertainty & Null Calibration:** Deterministic 200-resample bootstrap **90% confidence intervals** (`[low, high]`) per jurisdiction plus a **200-draw label-permutation null baseline** calibrating a neutral sequential single-hue visual scale (*within null noise* → *above random null* → *above 90th-pct null*).
- **Transparent scoring modes (`?mode=headline|all`):**
  - **`headline` (default — Codebook §8.2):** Strictly filters to `active` or `adopted_not_yet_effective` `primary_instrument`s (`n = 62`), excluding companion resources, drafts, superseded texts, and unclassified rows.
  - **`all`:** Equally weights the full analyzed corpus (`n = 103`), paired with a 4-specification sensitivity & Spearman `ρ` grid on `/methodology`.

## Who this is for

- **Policy researchers & political scientists** studying comparative regulation, longitudinal institutional drift, and policy–framing decoupling
- **AI safety & standards teams** auditing which jurisdictions impose binding rules across 25 concrete controls (`/matrix`)
- **Journalists & think-tank analysts** needing label-conditioned bilateral comparisons (`/compare`), dual-language original + machine-translated evidence quotes, and UTF-8 BOM CSV / JSON / versioned BibTeX exports
- **Builders & compliance teams** contextualizing the EU AI Act & Digital Omnibus, US Executive Orders & NIST CAISI frameworks, South Korea's AI Basic Act, Japan's AI Promotion Act & Basic Plans, and China's CAC measures & TC260 frameworks

## Scope, corpus & provenance honesty

- **Tracked sovereign jurisdictions (5):** United States, European Union, South Korea, Japan, China. *(Major US state statutes — e.g., CA SB 53/AB 2013, CO SB 26-189, TX TRAIGA, NY RAISE — are tracked explicitly as sub-national context rather than mixed silently into federal sovereign scores.)*
- **Curated corpus:** **103** verified, deduplicated official documents (**62** active/adopted primary instruments) across **52** official portals, plus a curated **19-target late-2026 expansion queue** (`data/source_tracking/late_2026_priority_targets.json`) and a 5-document multilingual starter gold-set benchmark (`data/eval/gold_set_v1.json`, `starter_v0.1_internal`).
- **Pre-deploy provenance note:** The committed `data/analysis/` files on disk are legacy April 2026 analyses (`taxonomyVersion: "1.0-legacy"`) preserved until the full Parser `0.3.0` + Taxonomy `2.1.0` re-run is executed with `ANTHROPIC_API_KEY`. The pipeline (`LegacyProvenanceError`) and UI (`provenanceSummary`) surface this explicitly and never fabricate v2 provenance on legacy files; see [`docs/operations/vercel-launch.md`](docs/operations/vercel-launch.md) for the exact pre-deploy re-run checklist.

## Architecture & repository map

| Layer | Path | Documentation |
|---|---|---|
| **Web app** — Next.js 16 (Node 22+) dashboard, statistical engine, `/matrix`, `/compare`, `/methodology`, CORS APIs & UTF-8 BOM CSV/JSON/BibTeX exports | `apps/web/` | [`apps/web/README.md`](apps/web/README.md) |
| **Pipeline** — Python 3.11 discovery, SSRF-hardened HTTP/Playwright retrieval, Parser `0.3.0` offline parsing, Claude Sonnet 4.6 token-aware chunked analysis, NFKC grounding & gold-set eval | `services/pipeline/` | [`services/pipeline/README.md`](services/pipeline/README.md) |
| **Database** — Neon Postgres migrations `001`–`005` (`documents` + authoritative `binding_strength`, longitudinal `document_snapshots`, indexed `machine_*` tables, `machine_jurisdiction_analyses`) | `sql/migrations/` | [`sql/migrations/README.md`](sql/migrations/README.md) |
| **Shared schemas** — CI-enforced Draft 2020-12 JSON Schemas (`validate-artifacts`) across taxonomy, label definitions, manifests, analyses, `/api/overview`, and `/api/matrix` | `packages/schemas/` | [`packages/schemas/README.md`](packages/schemas/README.md) |
| **Data corpus** — Taxonomy v2.1.0, `label-definitions.json`, manifests, starter gold set, raw/parsed/analyzed artifacts, recovery & expansion queues | `data/` | [`data/README.md`](data/README.md) |
| **Documentation** — Product brief, architecture, Codebook v2.1.0, operational runbooks | `docs/` | [`docs/README.md`](docs/README.md) |

## Getting started

Run the dashboard locally against the committed `data/` corpus without Postgres (requires **Node.js ≥ 22.18.0**):

```bash
cd apps/web
npm install
npm run dev
# → http://localhost:3000
```

Run pipeline validation, schema checks, gold-set evaluation, and tests (POSIX or Windows):

```bash
# POSIX
./scripts/bootstrap.sh && make taxonomy && make sources && make validate-artifacts && make test

# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File scripts/bootstrap.ps1
$env:PYTHONPATH="services/pipeline/src"
services\pipeline\.venv\Scripts\python.exe -m observatory.cli validate-taxonomy
services\pipeline\.venv\Scripts\python.exe -m observatory.cli validate-sources
services\pipeline\.venv\Scripts\python.exe -m observatory.cli validate-artifacts
services\pipeline\.venv\Scripts\python.exe -m observatory.cli evaluate-gold-set data/eval/gold_set_v1.json
services\pipeline\.venv\Scripts\python.exe -m pytest -c services/pipeline/pyproject.toml services/pipeline/tests
```

## License and attribution

Code in this repository is published as an open research project. Raw government documents under `data/raw/` are retained copies of official public publications for reproducibility — each retrieval log records the canonical URL, and the authoritative source is always the issuing government. See [`data/README.md`](data/README.md) for per-jurisdiction licensing notes.
