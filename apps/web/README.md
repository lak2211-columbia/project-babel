# `apps/web` — Project Babel dashboard

Next.js 16 (App Router) + React 19 + Tailwind CSS 4 + **Geist Sans** (prose) & **Geist Mono** (numbers, codes, tables). Requires **Node.js ≥ 22.18.0**. Dark, research-grade analytical dashboard for Project Babel. Server Components by default; client islands only where interactive filtering, evidence highlighting, or portal popovers pay for themselves.

For the project overview and research thesis, see the [root README](../../README.md).

---

## Table of contents

- [Routes & Public CORS APIs](#routes--public-cors-apis)
- [Data flow, DB ordering & ISR caching](#data-flow-db-ordering--isr-caching)
- [The statistical scoring engine](#the-statistical-scoring-engine)
- [Client islands, typography & accessibility](#client-islands-typography--accessibility)
- [Design system (null-calibrated sequential scale)](#design-system-null-calibrated-sequential-scale)
- [Source file map](#source-file-map)
- [Local development & testing](#local-development--testing)
- [Deployment (Vercel)](#deployment-vercel)
- [Environment variables](#environment-variables)
- [Conventions](#conventions)

---

## Routes & Public CORS APIs

### Pages

| Path | File | Purpose |
|---|---|---|
| `/` | `src/app/page.tsx` | Comparative overview leading with dynamic empirical decoupling findings, honest provenance banner, `POL` vs. `FRM` country cards (90% bootstrap CIs, `COV L1`, distinctive peer gaps, `cards / table` toggle), interactive 2D **Decoupling Map** (`scatter / table`), ONE clean **5×5 Pairwise Matrix**, longitudinal timeline (`chart / table`), and balanced five-jurisdiction latest sources |
| `/matrix` | `src/app/matrix/page.tsx` | Interactive **25×5 Obligation & Clause Matrix** (17 requirements + 8 active enforcement mechanisms × 5 jurisdictions, colored by strongest active binding level `L0–L4`, with group/level/search filters and slide-over instrument + bilingual quote drawer) |
| `/compare` | `src/app/compare/page.tsx` | Head-to-head bilateral diff (`?a=<slug>&b=<slug>&mode=headline\|all`) with dynamic `generateMetadata`, POL breakdown, 8-frame delta butterfly chart, true label-conditioned *"Same Rule, Different Reason"* & *"Same Reason, Different Rule"* diffs (showing `nA`/`nB` and strictly frame-matched quotes) |
| `/documents` | `src/app/documents/page.tsx` | Responsive corpus explorer with country flags, `corpus_role` & `lifecycle_stage` badges/filters, binding/type/requirement/framing/sort filters, full-text + evidence-quote search, and CSV/JSON/BibTeX export links |
| `/documents/[documentId]` | `src/app/documents/[documentId]/page.tsx` | Rebuilt evidence reader with sticky left rail, jumpable Section Contents, NFKC/whitespace/PDF-hyphen `<mark>` highlighting, live `verbatim`/`approx`/`unmatched` grounding badges, `#quote-*` deep permalinks, Copy Citation button, authoritative vs. model binding strength, `obligationStrength`, dual-language `quote` + `[MT] quoteEn` (`lang` attrs, zero CJK italics), and precision-aware dates (never `"January 1"` on year-only dates) |
| `/jurisdictions/[slug]` | `src/app/jurisdictions/[slug]/page.tsx` | Country readout with shared `<TopNav />`, `?mode=headline\|all` toggle, unified scoring-engine shares, longitudinal timeline, distance-to-peers rail, and SQL-filtered source list (SSG + ISR 1h) |
| `/methodology` | `src/app/methodology/page.tsx` | Transparent Claude Sonnet 4.6 machine-coding disclosure (no human review queue), live `provenanceSummary` & grounding stats, starter gold-set disclosure (`data/eval/gold_set_v1.json`), TVD & Regime Coverage formulas, permutation null calibration, 4-specification sensitivity & Spearman `ρ` grid, 8-frame codebook synced from `label-definitions.json`, API catalog, and copyable versioned BibTeX |
| `/opengraph-image` | `src/app/opengraph-image.tsx` | Dynamic Open Graph social preview card |

Prototype `/sandbox/*` routes have been removed. Dark-themed `not-found.tsx`, `error.tsx`, `global-error.tsx`, `robots.ts`, and XML-valid `sitemap.ts` (including `/matrix` and all 10 `/compare` pairs) are included.

### Public Read-Only CORS APIs & Operations

All GET APIs emit `Cache-Control: public, s-maxage=300, stale-while-revalidate=60` and `Access-Control-Allow-Origin: *`:

| Endpoint | Parameters | Response |
|---|---|---|
| `GET /api/overview` | `?mode=headline\|all` *(aliases `weighted\|equal` supported)* | Full `OverviewData` snapshot validated against [`packages/schemas/overview-api.schema.json`](../../packages/schemas/overview-api.schema.json) |
| `GET /api/matrix` | `?mode=headline\|all` | 25×5 `ObligationMatrixData` validated against [`packages/schemas/matrix-api.schema.json`](../../packages/schemas/matrix-api.schema.json) |
| `GET /api/jurisdictions` | `?mode=headline\|all` | All five jurisdiction snapshots and peer-distance metrics |
| `GET /api/jurisdictions/[slug]` | `?mode=headline\|all` | Single jurisdiction snapshot, `pairwise` peer distances, deterministic `analysis`, and latest `documents` |
| `GET /api/documents` | `?j=&role=&life=&b=&f=&s=&t=&r=&q=` | Filtered corpus index |
| `GET /api/documents/[documentId]` | — | Single document detail with parsed sections, extracted obligations, 8-frame scores, and bilingual evidence spans |
| `GET /api/export` | `?format=csv\|json\|bibtex&j=<slug>&mode=headline\|all` | Research exports: CSV with **raw UTF-8 BOM (`0xEF 0xBB 0xBF`)**, canonical taxonomy keys, all 8 `frame_*` scores, `effective_date`, and provenance; JSON; versioned BibTeX separating `datasetVersion` from `latestPublicationDate` |
| `POST /api/revalidate` | `Authorization: Bearer <secret>` or `x-revalidate-secret` | Constant-time checks `OBSERVATORY_REVALIDATE_SECRET` and purges the `"observatory"` ISR cache tag + layout cache |

---

## Data flow, DB ordering & ISR caching

```
Neon Postgres ──── getOverviewData(mode) ─────┐
(authoritative     getObligationMatrix(mode)  │
 in prod;          getLatestSources(opts)     ├──→ Next.js 16 RSC (ISR revalidate = 3600,
 ORDER BY          getDocumentListItems()     │     cache tag "observatory")
 updated_at DESC,  getDocumentDetail(id)      │          │
 id DESC)          getComparisonCorpus()      │          ▼
                   getJurisdictionAnalysis()  │    HTML + small client islands
Local corpus  ──── getBilateralComparison()   │    (OverviewDashboard, DecouplingMap,
(data/parsed +     (when fallback allowed)    │     MatrixClient, EvidenceReader,
 data/analysis)                               │     DocumentsList, CompareControls,
                                              │     JurisdictionView, HoverTip)
Empty prod    ──── explicit "No data loaded" ─┘    (NEVER serves fake seedData under VERCEL_ENV!)
```

- **Production empty-DB refusal (`A1`):** When `process.env.VERCEL_ENV` is set, `allowSeedFallback()` returns `false` — if Neon is empty or `DATABASE_URL` is absent, the app renders an explicit *"No observatory data loaded"* state (`hasData: false`, `buildEmptyOverviewData`) rather than silently serving synthetic `seedData`.
- **Deterministic latest analysis & schema parity (`A2`, `A5`, `A7`, `A8`):** All DB lateral joins order by `m.updated_at DESC, m.id DESC`; scoring uses authoritative manifest `documents.binding_strength` (migration `005` with graceful `42703` fallback); local & DB paths compute identical unified confidence, precision-aware dates, and honest `taxonomyVersion` (`"1.0-legacy"` when `analysis_metadata` is absent — never stamping `"2.1.0"` on legacy data or using file `mtime`).
- **Single-batch comparison corpus (`A10`):** `getComparisonCorpus()` loads the corpus once for `/compare` and `/matrix`, eliminating N+1 per-document fetches.
- **SQL-level jurisdiction filtering:** `getLatestSources({ jurisdiction, limit, perJurisdiction })` filters directly in SQL ordered by official `publication_date DESC` and uses `ROW_NUMBER() OVER (PARTITION BY d.jurisdiction ...)` on `/` so all five jurisdictions (including China) are richly represented.

---

## The statistical scoring engine

Implemented as a pure, zero-IO module in `src/lib/scoring.ts` (covered by **13 unit test suites** in `src/lib/__tests__/scoring.test.ts`).

### Scoring modes (`?mode=headline|all`)

- **`headline` (default — Codebook §8.2):** Strictly filters to `corpus_role === "primary_instrument"` AND `lifecycle_stage` in `["active", "adopted_not_yet_effective"]` (currently `n = 62` across the 5 jurisdictions). Documents with missing role or lifecycle are labeled `"Unclassified"` and excluded.
- **`all`:** Unweighted full-corpus view (`n = 103`), including companion resources, drafts, and historical baselines. Legacy URL query aliases `?mode=weighted` (`→ headline`) and `?mode=equal` (`→ all`) remain supported.

### Dual-axis divergence (`POL` vs. `FRM`), Regime Coverage (`COV L1`) & Uncertainty

- **Policy Divergence (`POL`):** Multi-dimensional TVD across `safety_requirements` (`0.45`), `enforcement_mechanisms` (`0.30`, with symmetric `none_specified` handling), and authoritative manifest `binding_strength` (`0.25`, without circular binding-weight multiplication). Exposed via `policyBreakdown: { requirements, enforcement, binding }`.
- **Framing Divergence (`FRM`):** Prefers explicit `frame_share` when present; on legacy `frame_confidence` vectors, zeroes sub-`0.15` noise values (`frame_mention_floor` from `label-definitions.json`) before normalizing each document to `1.0`. Displayed frame histograms use **Largest Remainder (Hamilton) apportionment** (`hamiltonRound`) summing to exact `100%`.
- **Regime Coverage Index (`COV L1` / `coverageDivergence`):** Computes each jurisdiction's strongest binding level (`L0–L4`: none / voluntary or strategy / guidance or standard / executive action / binding law) across all 25 requirement and enforcement controls, compared via normalized L1 distance — invariant to adding companion FAQs.
- **Composite (`CMP`):** Kept secondary to `POL` vs. `FRM` (`CMP = Math.round(0.6 * rawPOL + 0.4 * rawFRM)`).
- **Seeded bootstrap 90% CIs & permutation null (`B2`):** Uses a deterministic Mulberry32 PRNG for **200 bootstrap resamples** (`policyCI`, `framingCI`, `compositeCI`, `coverageCI`) and **200 label-permutation null draws** (`nullCalibration`, providing distinct single-country vs. pairwise null means and 90th percentiles).
- **4-specification sensitivity grid (`B10`):** Computes `headline`, `binding_weighted`, `coverage_l1`, and `all` with exact Spearman rank correlation (`ρ`) on `/methodology`.
- **Confidence transparency (`B9`):** Relabeled *"Model self-reported"* across the UI using canonical thresholds from `label-definitions.json` (`< 0.70` policy / `< 0.60` framing).

---

## Client islands, typography & accessibility

- **Typography (`C6`):** **Geist Sans** (`font-sans`) for readable prose and explanations; **Geist Mono** (`font-mono`) for numbers, taxonomy codes, tables, and formulas; strict **`>= 11px`** font floor across all components.
- **Interactive 2D Decoupling Map (`src/app/_home/decoupling-map.tsx`):** SVG scatter plotting all 10 country pairs (`X = Policy Distance`, `Y = Framing Distance`, diagonal reference, quadrant labels, click → `/compare`) with an accessible `scatter / table` toggle.
- **Rebuilt Evidence Reader (`src/app/documents/[documentId]/_evidence-reader.tsx` + `src/lib/quote-matcher.ts`):** Sticky desktop rail, jumpable section Contents, NFKC + whitespace/PDF-hyphenation matching mapped back to exact original offsets (`<mark id="active-evidence-mark">`), live `verbatim` / `approx` / `unmatched` badges, `#quote-*` deep permalinks, Copy Citation button, dual-language `quote` + `[MT] quoteEn` with `lang` attributes and zero CJK italics, and zero unused `normalizedText` sent to the browser.
- **Accessible Popovers (`src/app/_home/hover-tip.tsx`):** React Portal popover using `useSyncExternalStore` with hover, focus, tap/click toggle, outside-click & `Escape` dismiss, auto-flip, and viewport-safe `maxWidth`.
- **Accessible Charts & Navigation:** `cards / table`, `scatter / table`, and `chart / table` toggles; `aria-pressed` states; visible `:focus-visible` rings; `@layer base` dark `:root` tokens; `@media (prefers-reduced-motion: reduce)`; `safeExternalUrl()` protocol guard; security headers in `next.config.ts`.

---

## Design system (null-calibrated sequential scale)

Dark terminal palette (`#0a0f18` page, `#0f1623` panels, `#05090f` popovers) verified **WCAG 2.1 AA** (`>= 4.5:1` on 100% of readable text).

Because higher divergence is descriptive rather than morally "bad", divergence bands use a **neutral sequential single-hue scale** calibrated against each mode's permutation null (`src/lib/frame-vocab.ts`):

| Band | Null Threshold | Dark Foreground Hex | Label |
|---|---|---|---|
| `within_null` | `< nullMean` | `#94a3b8` (slate) | *within null noise* |
| `above_null` | `>= nullMean` | `#38bdf8` (sky) | *above random null* |
| `strong_divergence` | `>= nullP90` | `#67e8f9` (bright cyan) | *above 90th-pct null* |

**Eight-frame palette** (definitions synced verbatim with `data/taxonomies/label-definitions.json`):

| Code | Frame | Bar Hue | Text Hue (AA) |
|---|---|---|---|
| `XRS` | Existential & catastrophic risk | `#d64b7d` | `#f27aa5` |
| `SEC` | National security | `#c75146` | `#f07c70` |
| `RGT` | Fundamental rights | `#2f6eba` | `#6ea8f0` |
| `ECO` | Economic competitiveness | `#c98a2b` | `#e6ae49` |
| `INV` | Innovation enablement | `#2f8872` | `#4cc9a8` |
| `SOC` | Social stability & public order | `#7a4ea8` | `#b88ef0` |
| `SAF` | Consumer & public safety | `#2a8aa5` | `#56c2e0` |
| `LAB` | Labor & workforce transition | `#7f8f2a` | `#b4c94b` |

---

## Source file map

```
apps/web/src/
├── app/
│   ├── layout.tsx, globals.css, page.tsx
│   ├── error.tsx, global-error.tsx, not-found.tsx
│   ├── opengraph-image.tsx, robots.ts, sitemap.ts
│   ├── _components/
│   │   ├── copy-button.tsx             Citation & BibTeX copy control
│   │   ├── timeline-chart.tsx          Longitudinal yearly chart (low-n muting + table toggle)
│   │   └── top-nav.tsx                 Shared top navigation (incl. /matrix)
│   ├── _home/
│   │   ├── decoupling-map.tsx          2D Policy vs. Framing scatter + accessible table
│   │   ├── hover-tip.tsx               Accessible React Portal popover
│   │   ├── frame-tip.tsx               FrameTip & MetricTip wrappers
│   │   ├── overview-dashboard.tsx      Findings, mode switcher, cards/table, 5x5 matrix
│   │   └── sources-panel.tsx           Balanced five-jurisdiction source panel
│   ├── compare/
│   │   ├── page.tsx                    /compare — label-conditioned bilateral diff + dynamic metadata
│   │   └── _compare-controls.tsx
│   ├── documents/
│   │   ├── page.tsx                    /documents — role/lifecycle/quote corpus browser
│   │   ├── _documents-list.tsx
│   │   └── [documentId]/
│   │       ├── page.tsx                /documents/[id] — detail view
│   │       └── _evidence-reader.tsx    Sticky rail, NFKC <mark>, permalinks, dual-language quotes
│   ├── jurisdictions/[slug]/
│   │   ├── page.tsx                    /jurisdictions/[slug] — SSG + ISR country readout
│   │   └── _jurisdiction-view.tsx      Unified shares & ?mode=headline|all toggle
│   ├── matrix/
│   │   ├── page.tsx                    /matrix — 25x5 Obligation & Clause Matrix
│   │   └── _matrix-client.tsx          Interactive filters & slide-over evidence drawer
│   ├── methodology/page.tsx            /methodology — provenance, CIs, null, sensitivity & BibTeX
│   └── api/
│       ├── overview/route.ts           GET /api/overview
│       ├── matrix/route.ts             GET /api/matrix
│       ├── jurisdictions/route.ts      GET /api/jurisdictions
│       ├── jurisdictions/[slug]/route.ts
│       ├── documents/route.ts          GET /api/documents
│       ├── documents/[documentId]/route.ts
│       ├── export/route.ts             GET /api/export?format=csv|json|bibtex
│       └── revalidate/route.ts         POST /api/revalidate
└── lib/
    ├── scoring.ts                      Pure TVD, COV L1, bootstrap CIs, null & sensitivity engine
    ├── __tests__/scoring.test.ts       13-suite invariant & label-definitions parity test runner
    ├── quote-matcher.ts                NFKC + whitespace/PDF-hyphenation exact-offset matcher
    ├── overview-data.ts                DB/FS overview & balanced latest-sources fetchers
    ├── matrix-data.ts                  25x5 Obligation Matrix builder
    ├── compare-data.ts                 Label-conditioned bilateral diff & evidence pairing
    ├── document-data.ts                Corpus list, single-batch comparison corpus & doc detail
    ├── jurisdiction-analysis.ts        machine_jurisdiction_analyses loader
    ├── export-formatters.ts            UTF-8 BOM CSV, JSON & versioned BibTeX serializers
    ├── frame-vocab.ts                  8-frame hues, definitions & null-calibrated sequential scale
    ├── taxonomy-vocab.ts               Taxonomy v2.1.0 & label-definitions formatters
    ├── jurisdictions.ts                Jurisdiction order, slugs, metadata
    ├── db.ts                           Memoized Neon client, CORS headers & VERCEL_ENV guards
    ├── seed-data.ts                    OverviewData types, buildEmptyOverviewData & dev seed
    ├── sources-data.ts                 SourceEntry helpers
    ├── url-safety.ts                   safeExternalUrl() protocol guard
    └── use-url-search.ts               SSR-safe query-param hook & RootLayout URL observer
```

---

## Local development & testing

Requires **Node.js ≥ 22.18.0** (uses native TypeScript stripping for `npm test`).

```bash
cd apps/web
npm install
npm run dev
# → http://localhost:3000
```

Verification suite:

```bash
cd apps/web
npm run lint           # ESLint (0 errors, 0 warnings)
npx tsc --noEmit       # Strict TypeScript check
npm test               # 13 unit test suites (scoring, parity, quote-matcher, BOM CSV, BibTeX)
npm run build          # Clean production build (22 routes)
```

Local production smoke test against the committed `data/` corpus without `DATABASE_URL`:

```bash
OBSERVATORY_ALLOW_LOCAL_FALLBACK=1 npm run start
```

---

## Deployment (Vercel)

Linked Vercel project: `babel-observatory` (`https://project-babel.com`). See [`docs/operations/vercel-launch.md`](../../docs/operations/vercel-launch.md) for the **Pre-Deploy Section 0 Re-Run Checklist**, Neon migration `005` cutover, ISR revalidation, and smoke verification.

---

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Production | Neon Postgres connection string. |
| `OBSERVATORY_STRICT_DATABASE` | Production (`1`) | Disables local filesystem and seed fallbacks. |
| `OBSERVATORY_ALLOW_LOCAL_FALLBACK` | Local prod test (`1`) | Explicitly enables reading committed `data/` under `next start` when `DATABASE_URL` is unset. |
| `OBSERVATORY_REVALIDATE_SECRET` | Production | Authorizes `POST /api/revalidate` cache purges. |
| `VERCEL` / `VERCEL_ENV` | Auto | Injected by Vercel; enforces strict DB mode and explicit empty state when DB is empty/missing. |

---

## Conventions

- **Next.js 16 App Router:** `params` and `searchParams` are `Promise<...>` and must be `await`ed.
- **Single source of truth for definitions:** Keep `frame-vocab.ts` and `taxonomy-vocab.ts` synced verbatim with `data/taxonomies/label-definitions.json` (verified in `scoring.test.ts`).
- **Pure scoring & matching:** Keep `scoring.ts` and `quote-matcher.ts` free of Node/DB imports.
- **Portal popovers:** Tooltip/definition overlays always render via `HoverTip` into `document.body`.

See [`services/pipeline/README.md`](../../services/pipeline/README.md) and [`packages/schemas/README.md`](../../packages/schemas/README.md).
