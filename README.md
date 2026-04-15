# Project Babel — AI Governance Observatory

**Measuring how five governments differ on what they require of AI — and why they say those rules are necessary.**

Project Babel is a structured, comparative observatory of AI governance. It ingests official government documents from five jurisdictions, runs structured extraction and risk-framing analysis over them with Claude, stores the output in Postgres, and serves a dark, terminal-style analytical dashboard that computes *relative* divergence scores between jurisdictions — not an opinion, not a ranking against an external ideal, just the distance each country sits from the group average on two dimensions: **what is required** (policy) and **why it is required** (framing).

Five jurisdictions are currently tracked: **United States, European Union, South Korea, Japan, China**. All scoring is relative to the other four.

---

## Table of contents

- [Thesis](#thesis)
- [System shape](#system-shape)
- [Data flow](#data-flow)
- [Repository layout](#repository-layout)
- [The pipeline (`services/pipeline`)](#the-pipeline-servicespipeline)
- [The database](#the-database)
- [The web app (`apps/web`)](#the-web-app-appsweb)
- [The scoring model](#the-scoring-model)
- [The framing vocabulary](#the-framing-vocabulary)
- [Local development](#local-development)
- [Source ingestion loop](#source-ingestion-loop)
- [Deployment](#deployment)
- [Testing and validation](#testing-and-validation)
- [Design system](#design-system)
- [Conventions and constraints](#conventions-and-constraints)

---

## Thesis

Governments regulate AI for different reasons. Two jurisdictions that appear coordinated on the surface may be sitting on completely different risk justifications; two that look unaligned on paper may be converging on a shared set of safeguards. Project Babel makes both dimensions inspectable:

1. **Policy** — *what is required*. Extracted from official documents: risk assessments, red-teaming duties, transparency disclosures, registration, enforcement mechanisms, etc.
2. **Framing** — *why it is said to be required*. Classified against a fixed eight-label risk-framing codebook (national security, fundamental rights, economic competitiveness, innovation enablement, social stability, consumer/public safety, existential/catastrophic, labor transition).

Every number on the overview is a **relative distance** from the group — measured, never editorialized. `0` means a country's pattern matches its peers; `100` means nothing in common with the rest. The headline number is the **composite**, `0.6 × policy + 0.4 × framing`.

## System shape

```
┌───────────────────────────────────────────────────────────────────────┐
│                        Project Babel, end to end                      │
└───────────────────────────────────────────────────────────────────────┘

 Official portals (gov.uk, europa.eu, law.go.kr, METI, npc.gov.cn, …)
        │
        │  discovery + fetch (Python, retry/cache/browser fallback)
        ▼
  data/raw/<jurisdiction>/<doc_id>/
        │
        │  parse-raw-documents  →  data/parsed/<jurisdiction>/<doc_id>/normalized.json
        ▼
  data/parsed/<jurisdiction>/<doc_id>/normalized.json
        │
        │  analyze-documents  (Claude Sonnet 4.6, structured outputs)
        ▼
  data/analysis/<jurisdiction>/<doc_id>/document_analysis.json
        │                                        │
        │  persist-analysis-artifacts            │  (same JSON, read directly as
        ▼                                        │   a filesystem fallback by the
  Postgres (Neon)                                │   web app when DB is absent)
  ├─ documents                                   │
  ├─ machine_document_analyses                   │
  ├─ machine_policy_requirements                 ▼
  ├─ machine_enforcement_mechanisms      ┌──────────────────┐
  ├─ machine_frame_scores                │  apps/web        │
  ├─ machine_secondary_frames            │  (Next.js 16)    │
  ├─ jurisdiction_analyses               │                  │
  │                                      │  getOverviewData │
  └─ (human-review tables dropped in ────│  getLatestSources│
      migration 002)                     │  getDocumentList │
                                         │  getJurisdiction │
                                         │  Analysis        │
                                         └──────────────────┘
                                                 │
                                                 ▼
                                         Dark terminal UI
                                         React Server Components
                                         + small client islands
                                         (hover-tip portals, sources filter)
```

Three layers, each independently runnable:

- **Pipeline** — a Python package (`services/pipeline`) that acquires, parses, analyzes, and persists documents.
- **Database** — Postgres schema under `sql/migrations/`, currently deployed on Neon.
- **Web app** — a Next.js 16 App Router project (`apps/web`) that reads from Postgres with a filesystem fallback and renders the comparative dashboard.

Every layer has a degraded-mode fallback so none of the others are strictly required for local development:

- If `DATABASE_URL` is not set or Postgres is unreachable, the web app reads the on-disk corpus under `data/parsed/` and `data/analysis/` directly.
- If the parsed corpus is empty, the web app falls back to a small seed dataset (`apps/web/src/lib/seed-data.ts`) so the UI still renders.
- The pipeline can be run partially — you can parse without analyzing, analyze without persisting, or persist without running a fresh analysis via `persist-analysis-artifacts`.

## Data flow

```
┌─ Discovery ───────────────────────────────────────────────────────────┐
│  observatory.cli discover-source-candidates                           │
│    → data/discovery/<jurisdiction>/*.json                             │
│    → data/source_tracking/candidate_enrichment/                       │
│    → docs/operations/source-expansion-plan.md                         │
└───────────────────────────────────────────────────────────────────────┘
                                │
┌─ Ingestion ───────────────────▼───────────────────────────────────────┐
│  observatory.cli fetch-seed-documents                                 │
│    → HTTP client with retry, SHA-256 content tracking, browser        │
│      fallback via Playwright for JS-heavy portals                     │
│    → data/raw/<jurisdiction>/<doc_id>/{artifact, metadata.json,       │
│                                         retrieval_log.json}           │
└───────────────────────────────────────────────────────────────────────┘
                                │
┌─ Normalization ───────────────▼───────────────────────────────────────┐
│  observatory.cli parse-raw-documents                                  │
│    → HTML/PDF/DOCX-specific extractors                                │
│    → data/parsed/<jurisdiction>/<doc_id>/normalized.json              │
│      (title, language, sections[], plain_text, warnings, parser_ver)  │
└───────────────────────────────────────────────────────────────────────┘
                                │
┌─ Structured extraction ───────▼───────────────────────────────────────┐
│  observatory.cli analyze-documents                                    │
│    → Claude Sonnet 4.6 via Anthropic structured outputs               │
│    → Two structured extractions per document:                         │
│        1. policy_extraction (document_type, issuing_body,             │
│           safety_requirements[], enforcement_mechanisms[])            │
│        2. risk_framing (dominant_frame, secondary_frames[],           │
│           frame_confidence{}, rationale_summary)                      │
│    → data/analysis/<jurisdiction>/<doc_id>/document_analysis.json     │
└───────────────────────────────────────────────────────────────────────┘
                                │
┌─ Persistence ─────────────────▼───────────────────────────────────────┐
│  observatory.cli persist-analysis-artifacts                           │
│    → documents, machine_document_analyses,                            │
│      machine_policy_requirements, machine_enforcement_mechanisms,     │
│      machine_frame_scores, machine_secondary_frames,                  │
│      jurisdiction_analyses                                            │
└───────────────────────────────────────────────────────────────────────┘
                                │
┌─ Aggregation ─────────────────▼───────────────────────────────────────┐
│  observatory.cli aggregate-jurisdictions                              │
│    → Per-jurisdiction narrative + top-N requirements, enforcement,    │
│      binding strengths, document-type mix, framing landscape          │
│    → jurisdiction_analyses table + docs/operations/...                │
└───────────────────────────────────────────────────────────────────────┘
                                │
┌─ Presentation ────────────────▼───────────────────────────────────────┐
│  Next.js 16 / React 19 Server Components                              │
│    → getOverviewData(), getLatestSources(), getDocumentListItems(),   │
│      getDocumentDetail(), getJurisdictionAnalysis()                   │
│    → Divergence matrix computed in-app from machine_*                 │
│      distributions using total-variation distance                     │
│    → Client islands: LatestSourcesPanel, HoverTip (React portal),     │
│      DocumentsList filter                                             │
└───────────────────────────────────────────────────────────────────────┘
```

## Repository layout

```
.
├── README.md                     ← this file
├── AGENTS.md                     ← contributor conventions
├── Makefile                      ← one-liner wrappers for pipeline commands
├── docker-compose.yml            ← local Postgres (if you're not on Neon)
├── .env.example                  ← expected environment variables
│
├── apps/
│   └── web/                      Next.js 16 dashboard (the front of Project Babel)
│       ├── src/
│       │   ├── app/              App Router routes
│       │   │   ├── layout.tsx    Dark terminal chrome, fonts, metadata
│       │   │   ├── page.tsx      / — overview (masthead, country cards,
│       │   │   │                       pairwise small multiples, latest sources)
│       │   │   ├── globals.css   Animation keyframes (ago-bar, ago-bar-x,
│       │   │   │                       ago-fade-up, matrix :has()-based row/col)
│       │   │   ├── _home/        Private client islands (not routed):
│       │   │   │                   hover-tip.tsx    React portal popover
│       │   │   │                   frame-tip.tsx    frame/metric wrappers
│       │   │   │                   sources-panel.tsx  client filter for
│       │   │   │                                     latest_sources
│       │   │   ├── documents/
│       │   │   │   ├── page.tsx            /documents — corpus list with
│       │   │   │   │                         multi-dimension filter
│       │   │   │   ├── _documents-list.tsx Client filter (jurisdiction,
│       │   │   │   │                         state, framing, text search)
│       │   │   │   └── [documentId]/page.tsx /documents/[id] — detail view
│       │   │   ├── jurisdictions/
│       │   │   │   └── [slug]/page.tsx     /jurisdictions/[slug] — country page
│       │   │   │                             (readout, frame histogram,
│       │   │   │                              top requirements, distance to peers)
│       │   │   └── api/overview/           Server route (if used for ISR)
│       │   │
│       │   └── lib/              Pure data + server-only helpers
│       │       ├── seed-data.ts           Deterministic seed OverviewData + types
│       │       ├── frame-vocab.ts         frameHue, frameAbbr, frameShort,
│       │       │                           frameDefinition, scoreHexDark/Light
│       │       ├── jurisdictions.ts       jurisdictionOrder + jurisdictionMeta
│       │       ├── db.ts                  Neon client, failure handling,
│       │       │                           allowLocalFallback()
│       │       ├── overview-data.ts       getOverviewData() + getLatestSources()
│       │       │                           (DB → filesystem → seed fallback chain)
│       │       ├── document-data.ts       getDocumentListItems() +
│       │       │                           getDocumentDetail()
│       │       ├── jurisdiction-analysis.ts  getJurisdictionAnalysis() — the
│       │       │                           per-country narrative panels
│       │       └── sources-data.ts        SourceEntry type + synthetic fallback
│       │
│       └── package.json          next 16, react 19, postgres, @neondatabase/serverless
│
├── services/
│   └── pipeline/                 Python 3.11 package
│       ├── pyproject.toml
│       ├── src/observatory/
│       │   ├── cli.py            Typer entry — every `make` target lives here
│       │   ├── sources/          Registry parsing + discovery scans
│       │   ├── fetch/            HTTP client, retry, SHA-256, Playwright browser fallback
│       │   ├── parse/            HTML/PDF/DOCX normalizers
│       │   ├── analyze/          Anthropic structured-output client
│       │   ├── persist/          Postgres writer (machine_* + jurisdiction_*)
│       │   ├── aggregate/        Per-jurisdiction narrative aggregation
│       │   └── reports/          Coverage, expansion, quality-audit reports
│       └── tests/                pytest suites (one per module)
│
├── packages/
│   └── schemas/                  Shared JSON schemas between pipeline and UI
│
├── sql/
│   └── migrations/
│       ├── 001_initial_observatory.sql    core schema
│       ├── 002_remove_human_review.sql    drop approved_*, review_* (LLM-only pipeline)
│       └── 003_jurisdiction_analyses.sql  precomputed per-jurisdiction narratives
│
├── data/
│   ├── sources/                  per-jurisdiction seed manifests (hand-curated)
│   ├── taxonomies/               canonical labels for extraction + framing
│   ├── discovery/                output of discovery scans (candidate URLs)
│   ├── source_tracking/          enrichment cache, inventory, audit artifacts
│   ├── raw/                      raw fetched documents (HTML/PDF/DOCX)
│   ├── parsed/                   normalized text + metadata
│   └── analysis/                 structured extraction + risk framing JSON
│
├── prompts/                      Anthropic prompt assets (extraction + framing)
│
├── docs/
│   ├── product/brief.md          product thesis + MVP scope
│   ├── architecture.md           high-level architecture
│   ├── research/codebook.md      analytical vocabulary (frames, requirements,
│   │                               enforcement, binding strength)
│   ├── implementation/           spec + long-form notes
│   ├── operations/               database, source-inventory, blocked-source
│   │                               playbook, expansion plan, roadmap
│   └── adr/                      architectural decision records
│
└── scripts/
    ├── bootstrap.sh              set up Python venv + install pipeline deps
    └── run-with-vercel-env.sh    run a command with Vercel env loaded
```

## The pipeline (`services/pipeline`)

A Python 3.11 Typer CLI. Every command is wrapped by a `make` target.

**Discovery + registry**

- `make sources` — `observatory.cli validate-sources` — validates all seed manifests under `data/sources/`.
- `make taxonomy` — `observatory.cli validate-taxonomy` — validates the label vocabulary under `data/taxonomies/`.
- `make discover` — `discover-source-candidates --refresh` — crawls configured portals, writes candidate URLs to `data/discovery/`, caches metadata in `data/source_tracking/candidate_enrichment/`.
- `make coverage` — `report-source-coverage` — writes `data/source_tracking/source_inventory.json` and the Markdown version under `docs/operations/source-inventory.md`.
- `make expansion` — `report-source-expansion-plan` — writes `docs/operations/source-expansion-plan.md` (family-based expansion strategy).
- `make audit` — `report-source-quality-audit` — quality checks against the current registry.
- `make enrich` — `enrich-source-candidates --refresh` — resolves dates, languages, issuing bodies for discovered candidates.
- `make promote` — `promote-source-families` — promotes high-signal families from discovery into the official `seed_documents` registry.

**Fetch + refresh**

- `make fetch` — `fetch-seed-documents` — downloads every registered document into `data/raw/<jurisdiction>/<doc_id>/`, writes `retrieval_log.json` + `metadata.json` alongside the artifact. Content is SHA-256-tracked so refreshes are incremental.
- `make refresh` — `refresh-sources` — shorthand: discover + fetch + coverage report + blocked-source summary, all in one. This is the intended routine loop.
- `make browser-install` — installs Playwright Chromium for JS-heavy official portals (law.go.kr, METI). Then `observatory.cli fetch-seed-documents <jurisdiction> --refresh --with-browser` uses it.

**Parse**

- `make parse` — `parse-raw-documents` — normalizes the raw artifacts into structured `normalized.json` under `data/parsed/`. Each `normalized.json` has: `title`, `language`, `plain_text`, `sections[]` (heading + level + content), `warnings[]`, `parser_version`.

**Analyze**

- `make analyze` — `analyze-documents` — runs Claude Sonnet 4.6 over every parsed document using Anthropic structured outputs. Requires `ANTHROPIC_API_KEY` in the environment. Writes `document_analysis.json` under `data/analysis/<jurisdiction>/<doc_id>/` with two structured extractions:
  - **policy_extraction** — `document_type`, `issuing_body`, `binding_strength`, `safety_requirements[]` (label + span), `enforcement_mechanisms[]` (label + span)
  - **risk_framing** — `dominant_frame`, `secondary_frames[]`, `frame_confidence{}` over all eight framing labels, `rationale_summary`

**Persist**

- `make persist-db` — `persist-analysis-artifacts` — replays every `document_analysis.json` into Postgres, populating `documents`, `machine_document_analyses`, `machine_policy_requirements`, `machine_enforcement_mechanisms`, `machine_frame_scores`, `machine_secondary_frames`. Idempotent — safe to re-run.
- `make migrate` — runs SQL migrations against `DATABASE_URL`.
- `make sync-db` — persist + aggregate in one command.

**Local imports** for official portals blocked from the current environment:

```bash
observatory import-local-document <jurisdiction> <document_id> <file_path>
```

Keeps provenance inside the repo while letting you drop in a manually-downloaded file. Then parse and analyze it normally.

## The database

Migrations live under `sql/migrations/` and apply in numeric order.

```
001_initial_observatory.sql
  - documents                          raw source registry + parsed-text path
  - machine_document_analyses          one row per machine analysis run
  - machine_application_domains        extracted application-domain labels
  - machine_policy_requirements        extracted safeguards + spans
  - machine_enforcement_mechanisms     extracted enforcement hooks + spans
  - machine_secondary_frames           secondary frame labels per analysis
  - machine_frame_scores               confidence per frame per analysis
  - (approved_document_analyses, review_tasks — defined in 001, dropped in 002)

002_remove_human_review.sql
  Drops the approval/review machinery. The pipeline is LLM-only; there is no
  human-review layer in the product. Every analyzed document is considered
  authoritative for downstream aggregation. The web app no longer reads or
  writes review_tasks / approved_document_analyses.

003_jurisdiction_analyses.sql
  - jurisdiction_analyses              per-country precomputed narrative
    (summary, governance_posture, implementation_and_enforcement,
     framing_landscape, source_coverage_note, top_requirements[],
     top_enforcement_mechanisms[], top_binding_strengths[],
     top_document_types[], source_count, source_window_start/end)
```

The web app reads directly from the machine tables (no ORM — plain SQL via `postgres-js` on the serverless Neon client). Distribution distances are computed in-app from the extracted safeguards and frame scores; see [the scoring model](#the-scoring-model).

`apps/web/src/lib/db.ts` wraps the Neon client and provides three helpers:

- `getDatabaseClient()` — returns a `postgres` client or `null` if `DATABASE_URL` is missing.
- `allowLocalFallback()` — returns `true` unless `OBSERVATORY_STRICT_DATABASE=1`; lets the web app degrade gracefully to the filesystem corpus when the DB is unreachable in local dev but hard-fail in production.
- `handleDatabaseReadFailure(where, error)` — uniform logging for DB read errors.

## The web app (`apps/web`)

Next.js 16 (App Router), React 19, Tailwind CSS 4, Geist Mono. All pages are server components by default; client interactivity lives in private `_home/` and `_documents-list` islands.

### Routes

| Path | Component | Data source | Notes |
|---|---|---|---|
| `/` | `apps/web/src/app/page.tsx` | `getOverviewData()` + `getLatestSources(30)` | Masthead, tracking strip, scoring key + framing vocabulary, five country cards, pairwise small multiples, latest sources filter panel |
| `/documents` | `apps/web/src/app/documents/page.tsx` | `getDocumentListItems()` | Corpus list with multi-dimension client-side filter (jurisdiction, state, framing, search) |
| `/documents/[documentId]` | `apps/web/src/app/documents/[documentId]/page.tsx` | `getDocumentDetail(id)` + `getOverviewData()` | Title + metadata card, left rail (dominant/secondary frames, requirements, enforcement, parser notes, jurisdiction context), main pane (normalized text) |
| `/jurisdictions/[slug]` | `apps/web/src/app/jurisdictions/[slug]/page.tsx` | `getOverviewData()` + `getJurisdictionAnalysis(key)` + `getLatestSources(60)` | Country readout, frame histogram, framing landscape, operational profile (requirements + enforcement + binding strengths + document types), distance-to-peers rail, jump-to-other-jurisdictions, latest documents |

Under the hood, server components compose data via:

- `getOverviewData()` — three-tier fallback: (1) Neon Postgres query joining `documents` + `machine_document_analyses`, (2) filesystem replay of `data/parsed/` + `data/analysis/`, (3) `seedData` constant. Returns an `OverviewData` with per-country snapshots, a 5×5 pairwise distance matrix, a queue slice, and a summary.
- `getLatestSources(limit)` — DB query ordered by latest analysis timestamp, mapped to `SourceEntry[]`. Falls back through `getDocumentListItems()` so home-page document links always resolve to real detail pages.
- `getDocumentListItems()` — full corpus list for `/documents`. Filesystem fallback walks `data/parsed/` + `data/analysis/` when no DB is available.
- `getDocumentDetail(id)` — full document view with `secondaryFrames[]`, `enforcementMechanisms[]`, `sections[]`, parser warnings.
- `getJurisdictionAnalysis(key)` — precomputed per-country narrative from the `jurisdiction_analyses` table (summary, governance posture, top-N requirements/enforcement/binding/document-type).

### Client islands

All interactivity is scoped to small client components under `src/app/_home/` and `src/app/documents/_documents-list.tsx`:

- **`HoverTip`** (`_home/hover-tip.tsx`) — a **React Portal** popover. On mouseenter, it reads the trigger's `getBoundingClientRect()` and mounts a `position: fixed` popover into `document.body` with an enormous z-index. This deliberately escapes *every* ancestor stacking context so popovers are never clipped by transforms, filters, or overflow. Keyboard-accessible, closes on scroll/resize, has a 100 ms close delay so the user can move the cursor onto the popover without it vanishing.
- **`FrameTip` / `MetricTip`** (`_home/frame-tip.tsx`) — typed wrappers over `HoverTip` that render the frame-definition or metric-description payloads.
- **`LatestSourcesPanel`** (`_home/sources-panel.tsx`) — the `latest_sources` filter on `/`. Filter state lives in local React state; URL is synced with `window.history.replaceState` (no Next router round-trip), so chip clicks are instant with no scroll reset.
- **`DocumentsList`** (`documents/_documents-list.tsx`) — multi-dimension facet filter on `/documents`. Same URL-sync pattern, faceted counts recomputed contextually so each dimension shows what's still reachable.

### Styling

- Terminal dark palette: background `#0a0f18`, panels `#0f1623`, borders `white/10–white/20`, text `#cdd6e1` primary, `#e6edf5` emphasis, `#7a8697`/`#5d6675`/`#3f4857` muted.
- Mono-first type: Geist Mono across the whole app.
- Framing color palette lives in `frame-vocab.ts` — every frame has a hue, 3-letter code, short/long definitions, and an illustrative example.
- Divergence band palette: green `#29d391` (aligned, 0–44), amber `#f5a623` (different, 45–64), rose `#ff6b6b` (outlier, 65–100).
- Animations: opacity-only fade-in on cards (`ago-fade-up`), vertical bar grow-in for histograms (`ago-bar`), horizontal bar grow-in for pairwise rows (`ago-bar-x`), CSS `:has()`-driven row/column highlighting on the matrix (`ago-matrix`).

## The scoring model

Every country shows three scores — `POL` (policy divergence), `FRM` (framing divergence), `CMP` (composite). They are computed server-side by the web app (no precomputed matrix in the DB) from the machine extraction tables.

```
1.  For each jurisdiction J:
      policy_profile(J)   = normalized distribution over safety_requirements labels
      framing_profile(J)  = normalized distribution over frame_confidence labels

2.  Distance between any two distributions (total variation / 2):
      D(p, q) = sum_label |p(label) − q(label)| / 2
      scaled to 0–100 for display.

3.  Per-country divergence from peers:
      pol(J)  = D(policy_profile(J),  average(policy_profile(K)  for K ≠ J))  × 100
      frm(J)  = D(framing_profile(J), average(framing_profile(K) for K ≠ J))  × 100
      cmp(J)  = 0.6 × pol(J) + 0.4 × frm(J)       (rounded)

4.  Pairwise matrix entry (i, j):
      M[i][j] = 0.6 × D(policy_profile(i), policy_profile(j))  × 100
              + 0.4 × D(framing_profile(i), framing_profile(j)) × 100
```

All of this lives in `apps/web/src/lib/overview-data.ts`:

- `normalizeCounts`
- `distributionDistance`
- `divergenceFromPeers`
- `buildPairwiseMatrix`
- `buildProfiles`

The output is in `CountrySnapshot` (per-country) and `matrix: string[][]` (pairwise). Bands are assigned by `scoreBand()` in `frame-vocab.ts`.

**The scoring is relative, not absolute.** A country with composite 70 isn't "bad" — it's a pattern-outlier relative to this specific group of five. Swapping any jurisdiction in or out would change the numbers. This is by design.

## The framing vocabulary

Defined once in `frame-vocab.ts` and reused everywhere — the shared vocabulary the five jurisdictions are coded against.

| Code | Label | Short definition |
|---|---|---|
| `XRS` | Existential / catastrophic | Talks about AI as a source of extreme or systemic catastrophe |
| `SEC` | National security | Talks about AI as a defense or intelligence issue |
| `RGT` | Fundamental rights | Talks about AI as a risk to people's rights |
| `ECO` | Economic competitiveness | Talks about AI as a matter of jobs, trade, and industry |
| `INV` | Innovation enablement | Argues rules should stay light so deployment isn't slowed |
| `SOC` | Social stability | Talks about AI as a threat to public order and trust |
| `SAF` | Consumer / public safety | Talks about AI as a product-safety issue |
| `LAB` | Labor transition | Talks about AI as a workforce and adjustment issue |

Each frame also has:

- A hue (tinted panel accents, histogram bars, chip borders)
- A long definition (used in hover popovers)
- An illustrative example (used in hover popovers and pipeline training data)

Any place in the UI that mentions a framing label uses the same canonical data so code and narrative stay in sync.

## Local development

### Prerequisites

- Python 3.11
- Node.js ≥ 20
- (optional) Docker for local Postgres via `docker-compose.yml`
- (optional) Playwright Chromium for JS-heavy portals: `make browser-install`

### Environment

Copy `.env.example` → `.env` and fill in:

```bash
ANTHROPIC_API_KEY=...                # required for `make analyze`
ANTHROPIC_MODEL=claude-sonnet-4-6    # default
ANTHROPIC_EFFORT=low                 # structured-output effort budget
DATABASE_URL=postgresql://...        # Neon connection string (optional)
OBSERVATORY_STRICT_DATABASE=0        # 1 = hard-fail if DB read fails (prod)
RAW_DOCUMENTS_DIR=./data/raw
PARSED_DOCUMENTS_DIR=./data/parsed
```

### One-shot bootstrap

```bash
./scripts/bootstrap.sh   # create .venv, install pipeline deps
make test                # pytest the pipeline package
make taxonomy            # validate label vocabulary
make sources             # validate source registry
```

### Full end-to-end dry run (no DB required)

```bash
# 1. Fetch + parse + analyze a few seed documents
make fetch
make parse
make analyze             # requires ANTHROPIC_API_KEY

# 2. Run the web app against the on-disk corpus (filesystem fallback)
cd apps/web && npm install
npm run dev              # http://localhost:3000
```

The web app will happily run with an empty DB and empty corpus — it drops through to `seedData` for a pre-canned demo.

### With a database

```bash
# Option A — local Postgres via docker-compose
docker compose up -d postgres
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/observatory
make migrate
make persist-db          # replays data/analysis/*.json into the DB
cd apps/web && npm run dev

# Option B — Neon (production-like)
export DATABASE_URL=postgresql://...@...neon.tech/observatory
make migrate
make persist-db
```

## Source ingestion loop

The routine update cycle:

```bash
make refresh             # discover + fetch + coverage report + blocked summary
make parse               # normalize any newly fetched documents
make analyze             # Claude Sonnet 4.6 structured extraction + framing
make persist-db          # push to Postgres
```

For documents behind reachability issues:

```bash
# Blocked-source playbook is in docs/operations/blocked-source-playbook.md
observatory import-local-document <jurisdiction> <document_id> <downloaded-file>
make parse
make analyze
make persist-db
```

The discovery → enrichment → promotion sub-loop is independent and documented in `docs/operations/source-expansion-plan.md`.

## Deployment

The web app deploys to Vercel. Postgres is Neon (connection string comes from `DATABASE_URL` in the Vercel env).

```bash
# Pull Vercel envs locally for a production-parity build
make vercel-pull-preview
make vercel-pull-prod
make build-prod          # runs `next build` with the prod env loaded

# Preview + prod deploys
cd apps/web
npm run deploy:preview
npm run deploy:prod
```

Useful Makefile targets tied to deploy ops:

- `make migrate-prod` — migrations against the production `DATABASE_URL`
- `make sync-prod-db` — persist + aggregate against prod
- `make persist-prod` — replay analysis artifacts to prod

Set `OBSERVATORY_STRICT_DATABASE=1` on the production web app so DB read failures *fail the request* instead of silently falling back to filesystem or seed data.

## Testing and validation

- `make test` — pytest suites for the pipeline package (fetch, parse, analyze, persist, aggregate, reports).
- `make taxonomy` — validates the label taxonomy under `data/taxonomies/` against the codebook.
- `make sources` — validates the seed source manifests under `data/sources/`.
- `make audit` — quality audit report over the full current registry.
- `cd apps/web && npx tsc --noEmit` — strict TypeScript typecheck for the frontend.
- `cd apps/web && npm run lint` — ESLint on the frontend.

## Design system

| Element | Spec |
|---|---|
| Background | `#0a0f18` (page) · `#0f1623` (panel) · `#05090f` (popover) |
| Borders | `white/10` default · `white/20` hover · `white/5` hairline |
| Text ranks | `#e6edf5` strongest · `#cdd6e1` primary · `#7a8697` muted · `#5d6675` secondary · `#3f4857` weakest |
| Divergence bands | `#29d391` aligned (0–44) · `#f5a623` divergent (45–64) · `#ff6b6b` outlier (65–100) |
| Framing palette | See `frame-vocab.ts` — eight hand-picked hues, one per framing label |
| Mono type | Geist Mono · 10–14px across the app · uppercase `tracking-[0.08em]–[0.22em]` for labels |
| Hover affordance | Persistent ⓘ circle (60% opacity) brightens to 100%; dashed borders become solid on interactive chips; `cursor: help` on every popover host |
| Animations | Opacity-only fade-in for panels · `scaleY`/`scaleX` grow-in for bars · 140–200ms CSS transitions on hover; popovers use React portals to escape stacking contexts |
| Navigation | No top nav bar. Two-link inline nav (`overview · documents`) on top-level pages; breadcrumbs on detail pages |

## Conventions and constraints

- **LLM-only pipeline.** There is no human review step. Every machine analysis is authoritative. Migration 002 drops the human-review tables.
- **Relative scoring only.** No absolute rankings, no editorial judgments, no stars, no traffic-light "good/bad" coloring — the band palette is about *distance*, not quality.
- **Every label has one definition.** `frame-vocab.ts` is the source of truth; any UI copy about a framing label pulls its short/long/example text from there.
- **Pipeline is idempotent end to end.** `persist-analysis-artifacts` is safe to re-run; fetching uses SHA-256 content tracking; parsing and analysis are pure functions of their inputs.
- **Fallbacks are layered, not alternatives.** Neon → filesystem → seed. Each layer degrades gracefully so the web app renders something meaningful regardless of which layers are available locally.
- **Next.js 16 App Router.** `params` and `searchParams` are `Promise`-typed and must be `await`ed. Every dynamic page uses `export const dynamic = "force-dynamic"`.
- **React Server Components by default.** Client islands live under `_` private folders (`_home/`, `_documents-list.tsx`) and are explicit `"use client"` boundaries.
- **Popovers live in React portals.** Any hover-revealed detail mounts into `document.body` and uses `position: fixed` — no ancestor stacking context can clip them, regardless of transforms, filters, or overflow.

---

For the product thesis and the original product brief, see `docs/product/brief.md`. For the high-level architecture doc, see `docs/architecture.md`. For the analytical vocabulary, see `docs/research/codebook.md`. For database schema, migrations, and operational notes, see `docs/operations/database.md`.
