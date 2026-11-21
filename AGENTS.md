# Agent Guide

## Mission

Build and maintain Project Babel — an open, reproducible research observatory measuring comparative AI governance divergence across five jurisdictions (United States, European Union, South Korea, Japan, China) along two independent axes:

1. **Structured policy extraction** — what governments require, how strongly rules bind, obligation modality (`obligation_strength`), and how rules are enforced.
2. **Risk framing analysis** — why governments say those rules are necessary across a fixed eight-label vocabulary (`frame_share` & `frame_confidence`).

Every change should make one of these surfaces more accurate, more statistically defensible, better grounded in primary text, or easier to audit.

## Read this first

1. [`README.md`](README.md)
2. [`docs/product/brief.md`](docs/product/brief.md)
3. [`docs/architecture.md`](docs/architecture.md)
4. [`docs/research/codebook.md`](docs/research/codebook.md)
5. [`data/taxonomies/label-definitions.json`](data/taxonomies/label-definitions.json)
6. [`packages/schemas/README.md`](packages/schemas/README.md)
7. [`docs/operations/project-checklist.md`](docs/operations/project-checklist.md)

## Ground rules

- Treat `data/taxonomies/observatory-taxonomy.json` (**v2.1.0**) and `data/taxonomies/label-definitions.json` as the single canonical source of truth for labels, inclusion/exclusion rules, and thresholds (`grounding_pass_threshold: 0.90`, `low_confidence_policy: 0.70`, `low_confidence_framing: 0.60`, `frame_mention_floor: 0.15`). Never invent labels or drift definitions between prompts and web UI.
- Keep `packages/schemas/*.schema.json` synchronized with `data/taxonomies/`, `services/pipeline/src/observatory/models.py`, and `apps/web/src/lib/seed-data.ts` — CI enforces `make validate-artifacts` (`133/133` artifacts, `0` errors).
- Never hardcode provider or model names in UI copy — render dynamically from `analysis_metadata.model` (`formatModelDisplayName()`) and never fabricate provenance (`persist-analysis-artifacts` refuses legacy files unless `--allow-legacy` is explicitly passed; under `VERCEL_ENV`, `apps/web` never serves fake `seedData`).
- Keep parsing strictly offline (`parse-raw-documents` makes zero network calls, using `Parser 0.3.0` with `pymupdf` primary PDF extraction); all HTTP and Playwright fetches route through `url_safety.py` (including Playwright `context.route("**/*", ...)`).
- Keep Project Babel machine-operated with **no human review approval queue** (`002_remove_human_review.sql`). Surface quality transparently via `"Model self-reported"` confidence badges, persisted NFKC verbatim grounding (`check-grounding`, currently `2,271 / 2,271 = 100.0%`), corpus audits, and gold-set benchmarks (`data/eval/gold_set_v1.json` + `gold_set_results.json`).
- Respect cross-platform reproducibility: root `.gitattributes` keeps `data/raw/**` binary (`-text`) and text/JSON/SQL/code files `eol=lf`; all Python writes pass `newline="\n"`; all stored repo paths use `repo_rel_posix()` (`/`).

## Repo shape

- `services/pipeline/` — Python 3.11+ discovery, SSRF-hardened retrieval, Parser `0.3.0` (`pymupdf` primary PDF) offline parsing, multi-provider concurrent LLM runner (`gemini-4-neon` default 1M context, `claude-opus-5-5` Anthropic fallback, zero-cost `ingest-document-analysis`), Draft 2020-12 `validate-artifacts`, gold-set eval, and Postgres persistence CLI.
- `apps/web/` — Next.js 16 (**Node ≥ 22.18.0**) + React 19 + Tailwind CSS 4 dashboard, pure statistical scoring engine (`scoring.ts` with bootstrap 90% CIs, permutation null, Regime Coverage `COV L1`), `/matrix`, `/compare`, `/methodology` (live gold-set scorecard), CORS read APIs, and UTF-8 BOM CSV/JSON/BibTeX exports.
- `packages/schemas/` — Seven Draft 2020-12 JSON Schema contracts covering taxonomy, label definitions, manifests, document/jurisdiction analyses, `/api/overview`, and `/api/matrix`.
- `sql/migrations/` — Incremental Postgres migrations (`001`–`005`) deployed to Neon.
- `data/` — Taxonomy v2.1.0, `label-definitions.json`, manifests (**121** seeds / **77** active primary), starter gold set + results (`data/eval/gold_set_{v1,results}.json`), source-tracking queues, and committed raw/parsed/analyzed artifacts.
- `prompts/` — Versioned prompt templates dynamically enriched from `data/taxonomies/label-definitions.json`.
- `docs/` — Product thesis, architecture, Codebook v2.1.0, implementation spec, and operational runbooks.

## Verification commands

Pipeline (POSIX via `make` or Windows PowerShell with `PYTHONPATH=services/pipeline/src`):

- `validate-taxonomy` — validates Taxonomy v2.1.0 + 1:1 parity with `label-definitions.json`
- `validate-sources` — validates all 5 `data/sources/*.json` manifests (`121` seeds)
- `validate-artifacts` — validates all `133` committed corpus artifacts against `packages/schemas/*.schema.json`
- `check-grounding` — verifies verbatim grounding (`2,271 / 2,271 = 100.0%`, `0` flagged)
- `evaluate-gold-set data/eval/gold_set_v1.json --output-json data/eval/gold_set_results.json` — evaluates extraction/framing metrics with Cohen's κ & 95% CIs
- `pytest -c services/pipeline/pyproject.toml services/pipeline/tests` — runs full suite (**118 tests**) with zero git mutations

Web app (inside `apps/web/`, **Node ≥ 22.18.0**):

- `npm run lint` — ESLint (0 errors, 0 warnings)
- `npx tsc --noEmit` — strict TypeScript check
- `npm test` — **15** scoring, model-formatting, `frame_share`, label-definitions parity, quote-matcher, BOM CSV, BibTeX, and gold-set parser test suites
- `npm run build` — production Next.js build verification

## Definition of done for analytical work

- Labels and thresholds match `data/taxonomies/observatory-taxonomy.json` and `data/taxonomies/label-definitions.json`.
- `make validate-artifacts` passes with zero schema errors (`133/133`).
- Provenance (`analysis_metadata` + `analyzed_at`) is explicit and truthful; model names render dynamically across the UI.
- Scoring preserves exact invariants (`CMP = round(0.6 * rawPOL + 0.4 * rawFRM)`, Hamilton `100%` sums, `headline` strict filtering, `frame_share` preference, seeded bootstrap CIs, permutation null calibration, and authoritative manifest `binding_strength`).
