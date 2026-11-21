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
| `/` | `src/app/page.tsx` | Comparative overview leading with dynamic empirical decoupling findings, dynamic **v2.1 verified provenance** strip (`Gemini 4 Neon`, `Taxonomy v2.1.0`, `100%` grounding — falling back to amber warning only if `legacyCount > 0`), opt-in **`+ U.S. State Laws`** (`?states=1`) toggle, `POL` vs. `FRM` country cards (90% bootstrap CIs, `COV L1`, distinctive peer gaps, `whitespace-nowrap` badges, `cards / table` toggle), collision-free interactive 2D **Decoupling Map** (`scatter / table`), ONE clean **5×5 Pairwise Matrix**, longitudinal timeline (`chart / table`), and balanced five-jurisdiction latest sources |
| `/matrix` | `src/app/matrix/page.tsx` | Interactive **25×5 Obligation & Clause Matrix** (17 requirements + 8 active enforcement mechanisms × 5 jurisdictions, colored by strongest active binding level `L0–L4`, with `?states=1` opt-in state overlay, amber state badges, group/level/search filters, and slide-over instrument + `obligation_strength` + bilingual quote drawer) |
| `/clauses` | `src/app/clauses/page.tsx` | **Cross-Jurisdiction Clause & Citation Explorer** searching and filtering all **`2,786`** grounded verbatim quotes across `144` instruments by control (17 req / 8 enf / 8 frames), jurisdiction, binding level (`L1–L4`), `obligation_strength`, scope (`headline` / `all` + `?states=1`), and full-text query (native + `[MT]` English), with `#quote-*` deep links, copyable citations, and filtered UTF-8 BOM CSV + JSON downloads |
| `/evolution` | `src/app/evolution/page.tsx` | **Longitudinal Regime Evolution (2019–2026) & Amendment Lineage** featuring a multi-jurisdiction SVG trajectory chart (`breadth`, `active`, `bindingCount`, `bindingShare` + accessible `table` toggle), `?states=1` support, and **12 live `supersedes_id` "Then vs. Now" amendment diff cards** (`#supersessions`) |
| `/compare` | `src/app/compare/page.tsx` | Head-to-head bilateral diff (`?a=<slug>&b=<slug>&mode=headline\|all&states=0\|1`) with dynamic `generateMetadata`, POL breakdown, 8-frame delta butterfly chart, true label-conditioned *"Same Rule, Different Reason"* & *"Same Reason, Different Rule"* diffs (showing `nA`/`nB` and strictly frame-matched quotes) |
| `/documents` | `src/app/documents/page.tsx` | Responsive corpus explorer with country flags, `corpus_role` (incl. `subnational_overlay` amber state badges) & `lifecycle_stage` badges/filters, binding/type/requirement/framing/sort filters, full-text + evidence-quote search, and CSV/JSON/BibTeX export links |
| `/documents/[documentId]` | `src/app/documents/[documentId]/page.tsx` | Rebuilt evidence reader with sticky left rail, jumpable Section Contents, clickable `Supersedes →` links, NFKC/whitespace/PDF-hyphen `<mark>` highlighting, live `verbatim`/`approx`/`unmatched` grounding badges, `#quote-*` deep permalinks, Copy Citation button, dynamic model provenance, humanized taxonomy prose (`humanizeProseTaxonomyKeys()`), authoritative vs. model binding strength, `obligationStrength` pills, dual-language `quote` + `[MT] quoteEn` (`lang` attrs, zero CJK italics), and precision-aware dates |
| `/jurisdictions/[slug]` | `src/app/jurisdictions/[slug]/page.tsx` | Country readout with shared 7-link `<TopNav />`, `?mode=headline\|all` & `?states=1` toggles, unified scoring-engine shares, longitudinal timeline, distance-to-peers rail, and SQL-filtered source list (SSG + ISR 1h) |
| `/methodology` | `src/app/methodology/page.tsx` | Dynamic machine-coding disclosure (zero hardcoded model names, no human review queue), live `provenanceSummary` & grounding stats (`100%`, `n=138` sovereign / `n=144` with `?states=1`), live **25-Doc Stratified Multilingual Gold-Set v2 Scorecard** (`#validation` — Req F1 `0.899`, Enf F1 `0.954`, Cohen's κ `0.747`, nominal Krippendorff's α `0.748`, Per-Jurisdiction EN/KO/JA/ZH table, collapsible Per-Label P/R/F1 table), **Corpus Freshness & Supersession Ledger (`#freshness`)** referencing `freshness-watch.yml`, TVD & Regime Coverage formulas, permutation null calibration, 4-specification sensitivity & Spearman `ρ` grid, 8-frame codebook synced from `label-definitions.json`, API catalog, and copyable versioned BibTeX |
| `/opengraph-image` | `src/app/opengraph-image.tsx` | Dynamic Open Graph social preview card |

Prototype `/sandbox/*` routes have been removed. Dark-themed `not-found.tsx`, `error.tsx`, `global-error.tsx`, `robots.ts`, and XML-valid `sitemap.ts` (including `/matrix`, `/clauses`, `/evolution`, and all 10 `/compare` pairs) are included.

### Public Read-Only CORS APIs & Operations

All GET APIs emit `Cache-Control: public, s-maxage=300, stale-while-revalidate=60` (or `s-maxage=3600` on `/api/clauses`) and `Access-Control-Allow-Origin: *`:

| Endpoint | Parameters | Response |
|---|---|---|
| `GET /api/overview` | `?mode=headline\|all&states=0\|1` *(aliases `weighted\|equal` supported)* | Full `OverviewData` snapshot validated against [`packages/schemas/overview-api.schema.json`](../../packages/schemas/overview-api.schema.json) |
| `GET /api/matrix` | `?mode=headline\|all&states=0\|1` | 25×5 `ObligationMatrixData` validated against [`packages/schemas/matrix-api.schema.json`](../../packages/schemas/matrix-api.schema.json) |
| `GET /api/clauses` | `?mode=&states=&category=&control=&j=&minLevel=&obligation=&q=&limit=&offset=&format=json\|csv&download=1` | Paginated verbatim clauses JSON validated against [`packages/schemas/clauses-api.schema.json`](../../packages/schemas/clauses-api.schema.json), or filtered RFC 4180 UTF-8 BOM CSV |
| `GET /api/evolution` | `?states=0\|1` | Annual 2019–2026 trajectories, 12 `supersedes_id` diffs, and freshness rows validated against [`packages/schemas/evolution-api.schema.json`](../../packages/schemas/evolution-api.schema.json) |
| `GET /api/jurisdictions` | `?mode=headline\|all&states=0\|1` | All five jurisdiction snapshots and peer-distance metrics |
| `GET /api/jurisdictions/[slug]` | `?mode=headline\|all&states=0\|1` | Single jurisdiction snapshot, `pairwise` peer distances, deterministic `analysis`, and latest `documents` |
| `GET /api/documents` | `?j=&role=&life=&b=&f=&s=&t=&r=&q=` | Filtered corpus index (`144` docs) |
| `GET /api/documents/[documentId]` | — | Single document detail with parsed sections, extracted obligations, 8-frame scores, `subnationalUnit`, `supersedesId`, and bilingual evidence spans |
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
(data/parsed +     getGoldSetEvaluation()     │     MatrixClient, EvidenceReader,
 data/analysis)    (when fallback allowed)    │     DocumentsList, CompareControls,
                                              │     JurisdictionView, HoverTip)
Empty prod    ──── explicit "No data loaded" ─┘    (NEVER serves fake seedData under VERCEL_ENV!)
```

- **Production empty-DB refusal (`A1`):** When `process.env.VERCEL_ENV` is set, `allowSeedFallback()` returns `false` — if Neon is empty or `DATABASE_URL` is absent, the app renders an explicit *"No observatory data loaded"* state (`hasData: false`, `buildEmptyOverviewData`) rather than silently serving synthetic `seedData`.
- **Deterministic latest analysis & Migration `005` wiring:** All DB lateral joins order by `m.updated_at DESC, m.id DESC`; Tier-1 v5 SQL queries select authoritative manifest `documents.binding_strength`, `latest_machine.frame_shares_json`, `latest_machine.analyzed_at`, and lateral `obligation_strengths_json` over `machine_policy_requirements` (with graceful `42703` fallback to earlier schemas). Local and DB paths compute identical unified confidence, precision-aware dates, and honest `taxonomyVersion` (`"2.1.0"` on current corpus; `"1.0-legacy"` only if `analysis_metadata` is absent).
- **Dynamic frontier model attribution:** `formatModelDisplayName()` and `formatModelList()` (`src/lib/taxonomy-vocab.ts`) render live model provenance dynamically (`"gemini-4-neon"` → `"Gemini 4 Neon"`, `"claude-opus-5-5"` → `"Claude Opus 5.5"`, fallback `"automated LLM extraction"`) with zero hardcoded model names in UI components.
- **Single-batch comparison corpus:** `getComparisonCorpus()` loads the corpus once for `/compare` and `/matrix`, eliminating N+1 per-document fetches.
- **SQL-level jurisdiction filtering:** `getLatestSources({ jurisdiction, limit, perJurisdiction })` filters directly in SQL ordered by official `publication_date DESC` and uses `ROW_NUMBER() OVER (PARTITION BY d.jurisdiction ...)` on `/` so all five jurisdictions (including China) are richly represented.

---

## The statistical scoring engine

Implemented as a pure, zero-IO module in `src/lib/scoring.ts` (covered by **18 unit test suites** in `src/lib/__tests__/scoring.test.ts`).

### Scoring modes (`?mode=headline|all` + opt-in `?states=1`)

- **`headline` (default — Codebook §8.2):** Strictly filters to sovereign `corpus_role === "primary_instrument"` AND `lifecycle_stage` in `["active", "adopted_not_yet_effective"]` (currently **`n = 91`** across the 5 sovereign jurisdictions: US 25, EU 15, KR 14, JP 22, CN 15). Documents with missing role or lifecycle are labeled `"Unclassified"` and excluded, and `corpus_role === "subnational_overlay"` is strictly excluded by default (`isHeadlineEligible(doc, { includeSubnational: false }) === false`).
- **`all`:** Unweighted full-corpus view (**`n = 138`** sovereign: US 36, EU 24, KR 20, JP 37, CN 21; **`n = 144`** when `?states=1` opts in the 6 U.S. state statutes), including companion resources, drafts, and historical baselines. Legacy URL query aliases `?mode=weighted` (`→ headline`) and `?mode=equal` (`→ all`) remain supported.
- **Opt-in U.S. State Overlay (`?states=1`):** Includes active `subnational_overlay` instruments (`5` active state laws in `headline`, all `6` in `all` including superseded CO SB 24-205) across `/`, `/matrix`, `/clauses`, `/evolution`, `/compare`, `/jurisdictions/[slug]`, and JSON APIs while surfacing amber state badges (`California · State Law`, etc.) and a methodological disclosure banner.

### Dual-axis divergence (`POL` vs. `FRM`), Regime Coverage (`COV L1`) & Uncertainty

- **Policy Divergence (`POL`):** Multi-dimensional TVD across `safety_requirements` (`0.45`), `enforcement_mechanisms` (`0.30`, with symmetric `none_specified` handling), and authoritative manifest `binding_strength` (`0.25`, without circular binding-weight multiplication). Exposed via `policyBreakdown: { requirements, enforcement, binding }`.
- **Framing Divergence (`FRM`):** Uses explicit compositional `frame_share` directly (populated on all 144/144 v2.1.0 documents); falls back to zeroing sub-`0.15` noise in `frame_confidence` before normalizing to `1.0` for legacy artifacts. Displayed frame histograms use **Largest Remainder (Hamilton) apportionment** (`hamiltonRound`) summing to exact `100%`.
- **Regime Coverage Index (`COV L1` / `coverageDivergence`):** Computes each jurisdiction's strongest binding level (`L0–L4`: none / voluntary or strategy / guidance or standard / executive action / binding law) across all 25 requirement and enforcement controls, compared via normalized L1 distance — invariant to adding companion FAQs.
- **Composite (`CMP`):** Kept secondary to `POL` vs. `FRM` (`CMP = Math.round(0.6 * rawPOL + 0.4 * rawFRM)`).
- **Seeded bootstrap 90% CIs & permutation null:** Deterministic Mulberry32 PRNG for **200 bootstrap resamples** (`policyCI`, `framingCI`, `compositeCI`, `coverageCI`) and **200 label-permutation null draws** (`nullCalibration`, providing distinct single-country vs. pairwise null means and 90th percentiles).
- **4-specification sensitivity grid:** Computes `headline`, `binding_weighted`, `coverage_l1`, and `all` with exact Spearman rank correlation (`ρ`) on `/methodology`.
- **Confidence transparency:** Relabeled *"Model self-reported"* across the UI using canonical thresholds from `label-definitions.json` (`< 0.70` policy / `< 0.60` framing).

---

## Client islands, typography & accessibility

- **Typography:** **Geist Sans** (`font-sans`) for readable prose and explanations; **Geist Mono** (`font-mono`) for numbers, taxonomy codes, tables, and formulas; strict **`>= 11px`** font floor across all components; responsive mobile metadata strips (`hidden sm:inline` separators so `390px` viewports never show orphan trailing dots).
- **Interactive 2D Decoupling Map (`src/app/_home/decoupling-map.tsx`):** SVG scatter plotting all 10 country pairs (`X = Policy Distance`, `Y = Framing Distance`, diagonal reference, quadrant labels, deterministic 16-candidate bounding-box label collision avoidance with leader ticks, click → `/compare`) with an accessible `scatter / table` toggle.
- **Rebuilt Evidence Reader (`src/app/documents/[documentId]/_evidence-reader.tsx` + `src/lib/quote-matcher.ts`):** Sticky desktop rail, jumpable section Contents, verified persisted-offset + NFKC whitespace/PDF-hyphenation matching (`<mark id="active-evidence-mark">`), live `verbatim` / `approx` / `unmatched` badges, `#quote-*` deep permalinks, Copy Citation button, dual-language `quote` + `[MT] quoteEn` with `lang` attributes and zero CJK italics, and zero unused `normalizedText` sent to the browser.
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
│   │   └── top-nav.tsx                 Shared 7-link top navigation (/matrix, /clauses, /evolution, /compare, /documents, /methodology)
│   ├── _home/
│   │   ├── decoupling-map.tsx          2D Policy vs. Framing scatter (collision-free labels) + accessible table
│   │   ├── hover-tip.tsx               Accessible React Portal popover
│   │   ├── frame-tip.tsx               FrameTip & MetricTip wrappers
│   │   ├── overview-dashboard.tsx      Findings, v2.1 provenance strip, mode + ?states=1 switchers, cards/table, 5x5 matrix
│   │   └── sources-panel.tsx           Balanced five-jurisdiction source panel
│   ├── clauses/
│   │   ├── page.tsx                    /clauses — Cross-Jurisdiction Clause & Citation Explorer
│   │   └── _clauses-explorer.tsx       Client filters, debounced /api/clauses queries & CSV/JSON export
│   ├── evolution/
│   │   ├── page.tsx                    /evolution — Longitudinal Regime Evolution (2019–2026) & Amendment Diffs
│   │   └── _evolution-client.tsx       SVG trajectory chart, table toggle & 12 supersedes_id diff cards
│   ├── compare/
│   │   ├── page.tsx                    /compare — label-conditioned bilateral diff + dynamic metadata
│   │   └── _compare-controls.tsx
│   ├── documents/
│   │   ├── page.tsx                    /documents — role/lifecycle/state-overlay/quote corpus browser
│   │   ├── _documents-list.tsx
│   │   └── [documentId]/
│   │       ├── page.tsx                /documents/[id] — detail view (with Supersedes link & state badge)
│   │       └── _evidence-reader.tsx    Sticky rail, NFKC <mark>, permalinks, dual-language quotes
│   ├── jurisdictions/[slug]/
│   │   ├── page.tsx                    /jurisdictions/[slug] — SSG + ISR country readout
│   │   └── _jurisdiction-view.tsx      Unified shares & ?mode=headline|all + ?states=1 toggles
│   ├── matrix/
│   │   ├── page.tsx                    /matrix — 25x5 Obligation & Clause Matrix
│   │   └── _matrix-client.tsx          Interactive filters, ?states=1 toggle & slide-over evidence drawer
│   ├── methodology/page.tsx            /methodology — provenance, 25-doc gold-set v2 scorecard, freshness ledger, CIs, null, sensitivity & BibTeX
│   └── api/
│       ├── overview/route.ts           GET /api/overview
│       ├── matrix/route.ts             GET /api/matrix
│       ├── clauses/route.ts            GET /api/clauses (JSON + UTF-8 BOM CSV)
│       ├── evolution/route.ts          GET /api/evolution
│       ├── jurisdictions/route.ts      GET /api/jurisdictions
│       ├── jurisdictions/[slug]/route.ts
│       ├── documents/route.ts          GET /api/documents
│       ├── documents/[documentId]/route.ts
│       ├── export/route.ts             GET /api/export?format=csv|json|bibtex
│       └── revalidate/route.ts         POST /api/revalidate
└── lib/
    ├── scoring.ts                      Pure TVD, COV L1, bootstrap CIs, null, subnational overlay & sensitivity engine
    ├── __tests__/scoring.test.ts       18-suite invariant, subnational, clauses, evolution, prose-humanizer, gold-set v2 & parity tests
    ├── clauses-filter.ts               Pure clause search, filtering & RFC 4180 UTF-8 BOM CSV serializer
    ├── clauses-data.ts                 React cache()-backed flat clause index builder over getComparisonCorpus()
    ├── evolution-engine.ts             Pure 2019–2026 annual trajectory, supersedes_id diff & freshness engine
    ├── evolution-data.ts               Cached evolution loader reading DB raw_metadata / local manifests
    ├── eval-parser.ts                  Pure gold-set v1/v2 evaluation JSON parser (Krippendorff's α, by_jurisdiction, per-label P/R/F1)
    ├── eval-data.ts                    Cached loader reading data/eval/gold_set_results.json or bundled snapshot
    ├── gold-set-results.snapshot.json  Byte-identical mirror of data/eval/gold_set_results.json (25-doc v2) for Vercel
    ├── quote-matcher.ts                Verified offset + NFKC whitespace/PDF-hyphenation matcher
    ├── overview-data.ts                DB/FS overview & balanced latest-sources fetchers
    ├── matrix-data.ts                  25x5 Obligation Matrix builder
    ├── compare-data.ts                 Label-conditioned bilateral diff & evidence pairing
    ├── document-data.ts                Corpus list, single-batch comparison corpus & doc detail
    ├── jurisdiction-analysis.ts        machine_jurisdiction_analyses loader
    ├── export-formatters.ts            UTF-8 BOM CSV, JSON & versioned BibTeX serializers
    ├── frame-vocab.ts                  8-frame hues, definitions & null-calibrated sequential scale
    ├── taxonomy-vocab.ts               Taxonomy v2.1.0, model formatters, humanizeProseTaxonomyKeys() & subnational helpers
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
npm test               # 18 unit test suites (scoring, subnational, clauses, evolution, prose humanizer, gold-set v2, quote-matcher, BOM CSV, BibTeX)
npm run build          # Clean production build (26 routes)
```

Local production smoke test against the committed 144-doc `data/` corpus without `DATABASE_URL`:

```bash
OBSERVATORY_ALLOW_LOCAL_FALLBACK=1 npm run start
```

---

## Deployment (Vercel)

Linked Vercel project: `babel-observatory` (`https://project-babel.com`). See [`docs/operations/vercel-launch.md`](../../docs/operations/vercel-launch.md) for the Neon migration `005` cutover, strict v2.1 persistence (`allow_legacy=False`), ISR revalidation, and smoke verification runbook.

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
- **Dynamic provenance:** Never hardcode LLM provider or model names in UI copy; use `formatModelDisplayName()` / `formatModelList()`.
- **Pure scoring & matching:** Keep `scoring.ts`, `quote-matcher.ts`, and `eval-parser.ts` free of Node/DB imports.
- **Portal popovers:** Tooltip/definition overlays always render via `HoverTip` into `document.body`.

See [`services/pipeline/README.md`](../../services/pipeline/README.md) and [`packages/schemas/README.md`](../../packages/schemas/README.md).
