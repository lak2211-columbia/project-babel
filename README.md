# Project Babel

**An observatory for AI governance. Measuring how five governments differ on what they require of AI — and why they say those rules are necessary.**

---

## What this is

Project Babel is a research observatory that tracks how the United States, the European Union, South Korea, Japan, and China govern artificial intelligence. It reads official government documents — legislation, executive directives, regulatory guidance, strategy papers, voluntary commitments — and turns each one into two structured things: the *rules* it imposes, and the *reasons* it gives for imposing them.

The rules and the reasons are then compared across all five jurisdictions to produce a **relative** divergence score for each country: how far its approach sits from the group average on two axes, and how different each pair of countries is from each other. None of this is a ranking against an external ideal. The numbers measure distance between peers, not quality or correctness.

If the goal is to answer *"which governments are quietly converging, and which are drifting apart?"* without relying on an editorial take, Project Babel is an attempt to build the apparatus that answers it with data.

## Why this exists

AI governance has moved from speeches to enforceable instruments in the space of two or three years. Two problems follow from that speed:

1. **Apparent coordination may be illusory.** Two countries can sign the same international communiqué and still regulate AI for completely different reasons — one for national security, one for individual rights. When the framing drifts, the rules eventually drift with it.
2. **Apparent fragmentation may be temporary.** Two countries can look unaligned at first glance while converging on a shared set of concrete requirements (risk assessments, red-teaming, transparency duties). If the *reasoning* behind those rules is similar, the fragmentation may resolve on its own.

Neither pattern shows up in summary-level reporting. You need to read the documents, extract what they actually require, classify what they actually say about risk, and then do the math. Project Babel does all three, reproducibly, for as many official documents as can be found and verified.

## The two questions

Every document in the corpus is coded against two independent dimensions:

1. **What is required?** — concrete safeguards and enforcement mechanisms named in the text (risk assessment, red-teaming, incident reporting, transparency disclosure, registration, procurement control, civil penalty, licensing, etc.). This is the **policy** dimension.
2. **Why is it required?** — the stated rationale the document offers for its rules, classified against a fixed eight-label vocabulary: national security, fundamental rights, economic competitiveness, innovation enablement, social stability, consumer/public safety, existential/catastrophic, and labor transition. This is the **framing** dimension.

Every number the dashboard shows is derived from those two extractions and nothing else. There is no editorial scoring, no expert-panel weighting, no external benchmark. Just structured extraction and distance math over the distributions of what governments require and what reasons they give.

## How the scoring works (in plain language)

Each country gets three scores: **policy divergence (POL)**, **framing divergence (FRM)**, and a **composite (CMP)**.

Each score asks one question: *how much does this country stand out from the other four?*

- **0** means the country's pattern matches its peers almost exactly.
- **100** means nothing in common with the rest of the group.
- Composite is the headline number — a weighted blend of policy (0.6) and framing (0.4).

There are three visual bands:

- **0–44** — looks like peers (green)
- **45–64** — noticeably different (amber)
- **65–100** — an outlier in this group (rose)

The math is total-variation distance between each country's extracted distributions and the average of the other four. Swap any jurisdiction in or out of the group and the numbers change — by design. Nothing here is an absolute judgment about any country's AI regulation. It's a group portrait of comparative distance.

## Who this is for

- **Policy researchers** who need a reproducible snapshot of cross-jurisdictional AI governance for longitudinal work.
- **Standards and safety teams** trying to understand which concrete requirements are converging and which aren't.
- **Journalists and think-tank analysts** who need a structured view of five governments' posture without hand-coding hundreds of documents themselves.
- **Anyone building on the AI Act, the Executive Orders, the Korean AI Basic Act, the Hiroshima AI Process, or China's generative-AI measures** who needs to place their work in the comparative context.

Everything the platform shows is traceable back to the original government source. Clicking any document in the dashboard takes you to its extracted policy structure, its framing analysis, and the normalized text itself.

## Scope

**Currently tracked jurisdictions (five):**

- United States — federal legislation, executive orders, NIST guidance, congressional mandates, agency rulemaking
- European Union — the AI Act, GPAI code of practice, Commission guidelines, standardisation work, the AI Pact
- South Korea — the AI Basic Act and enforcement decrees, MOGAHA/KISDI guidelines, industrial strategy papers
- Japan — METI guidance, Cabinet Office strategy, Hiroshima AI Process code, expert-panel reports
- China — CAC generative-AI measures, algorithmic recommendation rules, national AI supervision regulations

**Document classes in scope:**

- Enacted legislation
- Executive orders and presidential/cabinet directives
- National AI strategies
- Regulatory guidance (binding and advisory)
- Standards and voluntary commitments

**Document classes out of scope:**

- Think-tank white papers, op-eds, academic literature
- Industry self-regulation outside of voluntary government-adjacent commitments
- Non-AI-specific regulation that happens to touch AI (e.g., general data protection law)

## What's in this repository

Project Babel is a **single repository with three independently-runnable layers**:

1. **Pipeline** (`services/pipeline/`) — a Python CLI that discovers, fetches, parses, and analyzes official documents using Claude Sonnet 4.6 with structured outputs, then writes results to Postgres.
2. **Database** (`sql/migrations/`) — Postgres schema deployed on Neon, storing documents, machine analyses, extracted policy requirements, enforcement mechanisms, and per-frame confidence scores.
3. **Web app** (`apps/web/`) — a Next.js 16 analytical dashboard that reads from the database (with filesystem and seed fallbacks) and renders the comparative view, the per-country pages, the corpus browser, and the document detail views.

Each layer has its own README with the technical detail:

| Layer | Path | README |
|---|---|---|
| **Web app** — dashboard UI, routes, data fetching | `apps/web/` | [apps/web/README.md](apps/web/README.md) |
| **Pipeline** — Python ingestion + analysis CLI | `services/pipeline/` | [services/pipeline/README.md](services/pipeline/README.md) |
| **Database** — schema + migrations | `sql/migrations/` | [sql/migrations/README.md](sql/migrations/README.md) |
| **Data** — raw/parsed/analyzed corpus | `data/` | [data/README.md](data/README.md) |
| **Docs** — product brief, architecture, codebook, ops | `docs/` | [docs/README.md](docs/README.md) |

## Repository map

```
.
├── README.md                  ← this file
├── AGENTS.md                  contributor conventions
├── Makefile                   one-liner wrappers for pipeline + deploy ops
├── docker-compose.yml         local Postgres for offline dev
├── .env.example               expected environment variables
│
├── apps/web/                  Next.js dashboard (see apps/web/README.md)
├── services/pipeline/         Python ingestion pipeline (see services/pipeline/README.md)
├── sql/migrations/            Postgres schema (see sql/migrations/README.md)
├── data/                      Raw, parsed, and analyzed corpus (see data/README.md)
├── docs/                      Product + research + ops docs (see docs/README.md)
├── packages/schemas/          Shared JSON schemas between pipeline and UI
├── prompts/                   Anthropic prompt assets for extraction and framing
└── scripts/                   bootstrap + Vercel env helpers
```

## Methodology principles

The project holds itself to a few deliberate constraints:

- **Every claim in the UI traces back to a source document.** There is no hand-edited narrative sitting on top of the data. Frame definitions, requirement labels, rationale text — all derived from the extraction pipeline and a single vocabulary file (`apps/web/src/lib/frame-vocab.ts`).
- **Scoring is relative, not absolute.** Comparison across five jurisdictions. Distance from peers, not distance from an ideal. No rankings, no stars, no traffic-light quality judgments.
- **LLM-only extraction.** Every analysis in production is produced by Claude Sonnet 4.6 with structured outputs. There is no human-review layer; every machine analysis is considered authoritative for downstream aggregation. This is a deliberate choice — see `docs/operations/` for rationale.
- **Reproducible from scratch.** Clone, bootstrap, `make fetch && make parse && make analyze && make persist-db`, and you recover the same corpus and the same scores (allowing for upstream document revisions the next time `make refresh` runs).
- **Fallbacks are layered, not alternative paths.** Database → filesystem corpus → baked-in seed data. The dashboard always renders something truthful, even when a layer is missing or unreachable.

## Getting started

If you want to run the web app locally against the repo's committed corpus, without setting up a database:

```bash
cd apps/web
npm install
npm run dev
# → http://localhost:3000
```

That's the minimum path. The web app will find the parsed/analyzed documents in `data/` and render the dashboard against them.

If you want to run the full ingestion + analysis pipeline, see [services/pipeline/README.md](services/pipeline/README.md). If you want to deploy or work against a real database, see [apps/web/README.md](apps/web/README.md) and [sql/migrations/README.md](sql/migrations/README.md).

## Status

Five jurisdictions, ~120 analyzed documents at the time of writing, one snapshot refreshed on demand via `make refresh`. The corpus grows when new official publications are discovered and promoted from `data/source_tracking/`. The source registry is hand-curated; discovery runs find candidates, enrichment resolves metadata, and a promotion step moves high-signal candidates into the tracked manifest.

Live production: Neon Postgres + Vercel (Next.js 16).

## Project documentation

- **Product thesis + MVP scope** — [docs/product/brief.md](docs/product/brief.md)
- **Architecture overview** — [docs/architecture.md](docs/architecture.md)
- **Research codebook** — [docs/research/codebook.md](docs/research/codebook.md) (label vocabulary, framing rules, confidence guidance)
- **Operations** — [docs/operations/](docs/operations/) (database, source inventory, blocked-source playbook, roadmap)
- **Decision records** — [docs/adr/](docs/adr/)

## License and attribution

Code in this repository is published as an open research project. The raw government documents under `data/raw/` are copies of public government publications retained for pipeline reproducibility — each retrieval log records the canonical URL, and the authoritative source is always the issuing government. See [data/README.md](data/README.md) for per-jurisdiction licensing notes.

---

*Project Babel is an ongoing research effort, not a finished product. The scope, the scoring, and the framing vocabulary will keep evolving as more documents are added and as the underlying pipeline is refined.*
