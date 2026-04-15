# `apps/web` — Project Babel dashboard

Next.js 16 (App Router) + React 19 + Tailwind CSS 4 + Geist Mono. Dark, terminal-style analytical dashboard for Project Babel. Server components by default; client islands only where local interactivity pays for itself.

For the project overview and the research thesis, see the [root README](../../README.md).

---

## Table of contents

- [Routes](#routes)
- [Data flow](#data-flow)
- [Client islands](#client-islands)
- [Styling and design system](#styling-and-design-system)
- [The scoring model](#the-scoring-model)
- [Animations + hover affordances](#animations--hover-affordances)
- [Source file map](#source-file-map)
- [Local development](#local-development)
- [Deployment (Vercel)](#deployment-vercel)
- [Environment variables](#environment-variables)
- [Conventions](#conventions)

---

## Routes

| Path | File | Data source | Purpose |
|---|---|---|---|
| `/` | `src/app/page.tsx` | `getOverviewData()` + `getLatestSources(30)` | Masthead, tracking strip, scoring key, framing vocabulary, five country cards, pairwise small-multiples, latest sources (filterable) |
| `/documents` | `src/app/documents/page.tsx` | `getDocumentListItems()` | Full corpus list with multi-dimension client-side filter (jurisdiction, state, framing, text search) |
| `/documents/[documentId]` | `src/app/documents/[documentId]/page.tsx` | `getDocumentDetail(id)` + `getOverviewData()` | Single-document view: metadata card, classification, extracted requirements + enforcement, parser notes, jurisdiction context, normalized text |
| `/jurisdictions/[slug]` | `src/app/jurisdictions/[slug]/page.tsx` | `getOverviewData()` + `getJurisdictionAnalysis(key)` + `getLatestSources(60)` | Country detail page: narrative readout, frame histogram, framing landscape, operational profile (requirements + enforcement + binding strengths + document types), distance-to-peers rail, latest documents filtered to the jurisdiction |

Every page uses `export const dynamic = "force-dynamic"` because data is refreshed on demand via `make persist-db` + `make sync-prod-db` and the pipeline doesn't currently drive an ISR revalidation loop.

## Data flow

```
                                     ┌──────────────────────────┐
                                     │  Next.js RSC (server)    │
Postgres (Neon)  ──── getOverviewData ──→                        │
                                     │  getLatestSources        │
                                     │  getDocumentListItems    │
filesystem       ──── fallback   ──→ │  getDocumentDetail       │
(data/parsed,                        │  getJurisdictionAnalysis │
 data/analysis)                      └──────────────┬───────────┘
                                                    │
seed snapshot    ──── last resort ──→               │
(lib/seed-data)                                     ▼
                                     ┌──────────────────────────┐
                                     │  Server-rendered HTML    │
                                     │  + small client islands  │
                                     └──────────────────────────┘
                                                    │
                                                    ▼
                                         • LatestSourcesPanel (client filter)
                                         • HoverTip (React portal popover)
                                         • FrameTip / MetricTip
                                         • DocumentsList (faceted filter)
```

Three layered fallbacks, chosen in this order:

1. **Database (Neon Postgres).** When `DATABASE_URL` is set and the query succeeds. Canonical source in production.
2. **Filesystem corpus.** When the DB is missing or unreachable and `OBSERVATORY_STRICT_DATABASE` is not `1`, the app reads the committed parsed and analyzed JSON under `data/parsed/` and `data/analysis/` directly. This is what the repo ships to make local development frictionless.
3. **Seed snapshot.** When neither the DB nor the filesystem corpus has any documents, the app falls back to a hand-crafted `OverviewData` constant in `src/lib/seed-data.ts` so the UI still renders meaningfully.

Each fetcher in `src/lib/` implements that chain explicitly. The key fetchers:

- **`getOverviewData()`** — `src/lib/overview-data.ts` — composes country snapshots, the pairwise distance matrix, the summary counts, the dataset label, and the queue. Runs `buildOverviewFromRows` over either the DB rows or the filesystem walk.
- **`getLatestSources(limit)`** — same file — returns the N most recent analyzed documents as `SourceEntry[]`. Has its own degradation chain: DB query → `getDocumentListItems()` fallback (which itself reads the filesystem corpus) → synthetic seed list.
- **`getDocumentListItems()`** — `src/lib/document-data.ts` — full corpus list for `/documents`.
- **`getDocumentDetail(id)`** — `src/lib/document-data.ts` — single document (metadata + classification + extraction + sections + parser warnings).
- **`getJurisdictionAnalysis(key)`** — `src/lib/jurisdiction-analysis.ts` — the precomputed per-country narrative (summary, governance posture, implementation, framing landscape, top-N requirements/enforcement/binding/document-type). Sourced from the `jurisdiction_analyses` table written by the Python aggregator.

The database client wrapper is in `src/lib/db.ts`. It exposes `getDatabaseClient()` (returns a Neon `sql` instance or `null`), `allowLocalFallback()` (false in production or with `OBSERVATORY_STRICT_DATABASE=1`), and `currentDatasetLabel()` (used for the "dataset" chip on the masthead).

## Client islands

Server components are the default. Client islands live in private `_` folders so they don't get routed, and each has a single, well-bounded job:

- **`src/app/_home/hover-tip.tsx`** — the bulletproof hover popover. On mouseenter/focus, reads the trigger element's `getBoundingClientRect()` and mounts the popover content **into `document.body` via a React Portal**, positioned `position: fixed` with an enormous z-index. This deliberately escapes every ancestor stacking context — nothing on the page (transforms, `overflow: hidden`, animations, filters) can clip a hover popover regardless of what the trigger's ancestors do. Includes a 100 ms close delay so the user can move from trigger onto the popover without it vanishing, and closes on scroll/resize to avoid ghost popovers.
- **`src/app/_home/frame-tip.tsx`** — `FrameTip` and `MetricTip` thin wrappers around `HoverTip` that render the frame-definition or metric-description payloads (header + short + long + `Example` block) with the correct accent color.
- **`src/app/_home/sources-panel.tsx`** — `LatestSourcesPanel`, the client filter for the home page's `latest_sources` panel. Filter state lives in local React state. URL is synced via `window.history.replaceState` rather than the Next router so chip clicks are instant and don't trigger a server round-trip or scroll reset. Bookmarks to `/?j=japan` etc. still work because the server page reads `searchParams.j` for initial state and passes it to the client component as `initialFilter`.
- **`src/app/documents/_documents-list.tsx`** — `DocumentsList`, the multi-dimension faceted filter on `/documents`. Four axes: jurisdiction, analysis state, risk framing, free-text title search. Facet counts are recomputed contextually — applying one filter updates the others' counts to show what's still reachable. Same URL-sync pattern via `history.replaceState`.

## Styling and design system

Everything is monospaced and dark. The palette is spare and rule-driven:

| Role | Hex |
|---|---|
| Page background | `#0a0f18` |
| Panel background | `#0f1623` |
| Popover background | `#05090f` |
| Default border | `white/10` |
| Hover border | `white/20` |
| Hairline rule | `white/5` |
| Text — strongest | `#e6edf5` |
| Text — primary | `#cdd6e1` |
| Text — muted | `#7a8697` |
| Text — secondary | `#5d6675` |
| Text — weakest | `#3f4857` |

**Divergence band colors** (used anywhere a divergence score is rendered — country cards, pairwise bars, distance-to-peers, matrix cells, masthead scale bar):

| Band | Score | Color | Label |
|---|---|---|---|
| aligned | 0–44 | `#29d391` (green) | *looks like peers* |
| divergent | 45–64 | `#f5a623` (amber) | *noticeably different* |
| outlier | 65–100 | `#ff6b6b` (rose) | *outlier in this group* |

`scoreHexDark(score)` / `scoreHexLight(score)` / `scoreBand(score)` in `src/lib/frame-vocab.ts` map any numeric score to the correct color and band label.

**Framing palette.** Each of the eight risk-framing labels has a hand-picked hue used consistently across histograms, chips, popover accent bars, and cell tints. Source of truth is the `frameHue` map in `src/lib/frame-vocab.ts`:

| Code | Label | Hue |
|---|---|---|
| `XRS` | Existential / catastrophic | `#d64b7d` |
| `SEC` | National security | `#c75146` |
| `RGT` | Fundamental rights | `#2f6eba` |
| `ECO` | Economic competitiveness | `#c98a2b` |
| `INV` | Innovation enablement | `#2f8872` |
| `SOC` | Social stability | `#7a4ea8` |
| `SAF` | Consumer / public safety | `#2a8aa5` |
| `LAB` | Labor transition | `#7f8f2a` |

Each frame also has a short definition, a long definition, and an illustrative example (all in `frameDefinition` in the same file). UI copy never invents phrasing — it pulls from the vocab.

**Type.** Geist Mono across the whole app. Label type is 10–11 px uppercase with `tracking-[0.08em]` to `tracking-[0.22em]` depending on prominence. Body text is 12–14 px.

**Navigation.** Deliberately has no top nav bar. Top-level pages (home, documents) show a two-link inline nav (`overview · documents`) centered above the masthead rule, with the active link highlighted. Detail pages (jurisdictions, documents/[id]) use a left-aligned breadcrumb (`overview / documents / [id]`) that doubles as nav. No duplicated brand link — the masthead on each page *is* the brand.

## The scoring model

The three scores on every country card — POL, FRM, CMP — and the pairwise matrix are computed in-app, not stored in the database. See `src/lib/overview-data.ts` for the full implementation.

```
For each jurisdiction J:

  policy_profile(J)   = normalized distribution over the safety_requirement
                        labels extracted from J's analyzed documents.

  framing_profile(J)  = normalized distribution over the frame_confidence
                        scores from J's analyzed documents.

Distance between two distributions (total variation / 2, ∈ [0, 1]):

  D(p, q) = (1/2) · sum_over_labels |p(label) − q(label)|

Per-country divergence from peers:

  pol(J) = D(policy_profile(J),  average(policy_profile(K)  for K ≠ J))  × 100
  frm(J) = D(framing_profile(J), average(framing_profile(K) for K ≠ J))  × 100
  cmp(J) = 0.6 × pol(J) + 0.4 × frm(J)      rounded

Pairwise matrix entry (i, j):

  M[i][j] = 0.6 × D(policy_profile(i),  policy_profile(j))  × 100
          + 0.4 × D(framing_profile(i), framing_profile(j)) × 100
```

Supporting functions in `overview-data.ts`:

- `normalizeCounts` — probability-normalize a `Map<string, number>`.
- `distributionDistance` — total-variation distance between two maps.
- `buildProfiles` — build the policy_profile and framing_profile maps per jurisdiction from the extracted rows.
- `divergenceFromPeers` — per-jurisdiction distance to the average of the other four.
- `buildPairwiseMatrix` — the 5×5 pairwise matrix.

The scoring is **relative to this specific five-jurisdiction group**. Swap any jurisdiction in or out and every score changes. That's by design and documented on the scoring ribbon in the UI itself.

## Animations + hover affordances

CSS keyframes live in `src/app/globals.css`:

- `ago-fade-up` — opacity-only fade-in for panels. **Does not use `transform`** on purpose — transforms create stacking contexts that trap descendant popovers.
- `ago-bar` — vertical bar grow-in (`scaleY(0) → scaleY(1)`, `transform-origin: bottom`), 550 ms cubic-bezier, used for the country-card histograms. Staggered by `animationDelay: index * 40ms`.
- `ago-bar-x` — horizontal bar grow-in (`scaleX(0) → scaleX(1)`, `transform-origin: left`), 600 ms cubic-bezier, used for the distance-to-peers bars on the pairwise panels and jurisdiction pages.
- `ago-pop-in` — popover fade + slight translate, 140 ms.
- `ago-matrix` — CSS `:has()`-driven row + column highlighting on matrix hover. Pure CSS, no JS.

**Hover affordances.** Every interactive element on the page that reveals more detail uses the same primitives:

- A dashed-border → solid-border transition on chips (`MetricChip`, dominant-frame box).
- A `cursor: help` everywhere a popover lives.
- A persistent low-opacity `ⓘ` circle (`HoverHint`) that brightens on hover — signals "more info here" at rest, not only on hover.
- The popover itself (`HoverTip`) renders into `document.body` via React Portal so it's never clipped.

## Source file map

```
apps/web/src/
├── app/
│   ├── layout.tsx                      Fonts, metadata, dark body background.
│   │                                   No top nav — pages carry their own.
│   ├── page.tsx                        / — overview (masthead, tracking strip,
│   │                                   scoring+vocab panels, country cards,
│   │                                   pairwise small-multiples, sources panel)
│   ├── globals.css                     Tailwind + custom ago-* keyframes
│   │
│   ├── _home/                          Private client islands (not routed)
│   │   ├── hover-tip.tsx               React Portal popover primitive
│   │   ├── frame-tip.tsx               FrameTip + MetricTip wrappers
│   │   └── sources-panel.tsx           Latest sources client filter
│   │
│   ├── api/
│   │   └── overview/                   API route (reserved for future ISR use)
│   │
│   ├── documents/
│   │   ├── page.tsx                    /documents — corpus list
│   │   ├── _documents-list.tsx         Multi-dimension client filter
│   │   └── [documentId]/
│   │       └── page.tsx                /documents/[id] — detail view
│   │
│   ├── jurisdictions/
│   │   └── [slug]/
│   │       └── page.tsx                /jurisdictions/[slug] — country page
│   │
│   └── sandbox/                        Design exploration pages (kept as
│                                       historical reference; not linked from
│                                       the live nav). Safe to prune any time.
│
└── lib/
    ├── seed-data.ts                    OverviewData shape + types +
    │                                   deterministic demo data
    ├── frame-vocab.ts                  frameHue, frameAbbr, frameShort,
    │                                   frameDefinition, scoreHexDark/Light,
    │                                   scoreBand
    ├── jurisdictions.ts                jurisdictionOrder + jurisdictionMeta
    │                                   (slug, name, shortName, flagUrl)
    ├── db.ts                           Neon client wrapper +
    │                                   allowLocalFallback + dataset label
    ├── overview-data.ts                getOverviewData, getLatestSources,
    │                                   scoring helpers, filesystem fallback
    ├── document-data.ts                getDocumentListItems,
    │                                   getDocumentDetail, filesystem fallback
    ├── jurisdiction-analysis.ts        getJurisdictionAnalysis,
    │                                   humanize helpers
    └── sources-data.ts                 SourceEntry type, synthetic fallback,
                                        countByJurisdiction
```

## Local development

### Prerequisites

- Node.js ≥ 20
- npm (or pnpm/yarn — scripts are npm-flavored but portable)

### Running against the committed corpus (no DB, no env)

```bash
cd apps/web
npm install
npm run dev
# → http://localhost:3000
```

The web app will discover the parsed/analyzed JSON under `../../data/parsed/` and `../../data/analysis/` and render the full dashboard against it. No `DATABASE_URL` needed.

### Running against a local Postgres

```bash
# from repo root
docker compose up -d postgres
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/observatory
make migrate
make persist-db   # replays data/analysis/*.json into the DB

cd apps/web && npm run dev
```

### Running against Neon (production-like)

```bash
# from repo root
make vercel-pull-preview        # or vercel-pull-prod
cd apps/web
npm run dev                     # dev loads .vercel/.env.preview.local automatically
```

Set `OBSERVATORY_STRICT_DATABASE=1` locally to force DB-only reads (no filesystem fallback). Useful when you want to confirm the production path is healthy.

## Deployment (Vercel)

Linked Vercel project: `babel-observatory`. Production URL: `https://project-babel.com`.

From the repo root:

```bash
make vercel-pull-prod           # pulls .vercel/.env.production.local
make build-prod                 # next build with prod env loaded
cd apps/web
npm run deploy:preview          # npx vercel deploy --yes
npm run deploy:prod             # npx vercel deploy --prod --yes
```

Database-side deploy ops also live in the root Makefile:

- `make migrate-prod` — applies SQL migrations against the production `DATABASE_URL`.
- `make sync-prod-db` — persist + aggregate in one command.
- `make persist-prod` — replay the filesystem corpus into production.

Set `OBSERVATORY_STRICT_DATABASE=1` on the production Vercel project environment so failed DB reads raise a real error instead of silently falling through to the filesystem or seed data.

## Environment variables

All consumed by `src/lib/db.ts` and downstream fetchers:

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Prod only | Neon Postgres connection string. If absent, the app falls back to the filesystem corpus. |
| `OBSERVATORY_STRICT_DATABASE` | No | `1` = fail the request if a DB read fails. Default `0` allows filesystem fallback. Set to `1` in production. |
| `VERCEL` / `VERCEL_ENV` | Auto | Vercel sets these. The presence of either enables strict DB behavior. |

`.env.example` at the repo root lists the Anthropic-related variables too — those are only consumed by the pipeline, not the web app.

## Conventions

- **Next.js 16 App Router.** `params` and `searchParams` are `Promise<…>` and must be `await`ed. See `next/dist/docs/` inside `node_modules` for the canonical conventions.
- **React Server Components are the default.** Client boundaries are explicit (`"use client"`) and live under underscore-prefixed private folders (`_home/`, `_documents-list.tsx`).
- **No editorial content.** Every label, frame definition, score, and number traces back to the pipeline or the canonical vocab file.
- **Popovers always use React Portals.** Any hover-revealed content mounts into `document.body`. This is non-negotiable — any time someone adds a new popover by inlining it inside a card, a stacking context somewhere else on the page will eventually trap it.
- **TypeScript is strict.** Run `npx tsc --noEmit` before committing. `npm run lint` for ESLint.

---

For the product thesis and research motivation, see the [root README](../../README.md) and [docs/product/brief.md](../../docs/product/brief.md). For the pipeline that feeds this app, see [services/pipeline/README.md](../../services/pipeline/README.md). For the schema the app reads, see [sql/migrations/README.md](../../sql/migrations/README.md).
