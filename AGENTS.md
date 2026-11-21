# Agent Guide

## Mission

Build and maintain Project Babel — an open, reproducible research observatory measuring comparative AI governance divergence across five jurisdictions (United States, European Union, South Korea, Japan, China) along two independent axes:

1. **Structured policy extraction** — what governments require, how strongly rules bind, obligation modality (`obligation_strength`), and how rules are enforced.
2. **Risk framing analysis** — why governments say those rules are necessary across a fixed eight-label vocabulary.

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
- Keep `packages/schemas/*.schema.json` synchronized with `data/taxonomies/`, `services/pipeline/src/observatory/models.py`, and `apps/web/src/lib/seed-data.ts` — CI enforces `make validate-artifacts`.
- Never fabricate provenance on legacy artifacts: `persist-analysis-artifacts` must read provenance strictly from `analysis_metadata` (refusing legacy files unless `--allow-legacy` is explicitly passed), and the web UI must report honest `taxonomyVersion` (`"1.0-legacy"` vs. `"2.1.0"`) and never serve fake `seedData` under `VERCEL_ENV`.
- Keep parsing strictly offline (`parse-raw-documents` makes zero network calls); all HTTP and Playwright fetches route through `url_safety.py` (including Playwright `context.route("**/*", ...)`).
- Keep Project Babel machine-operated with **no human review approval queue** (`002_remove_human_review.sql`). Surface quality transparently via `"Model self-reported"` confidence badges, persisted NFKC grounding offsets (`check-grounding`), corpus audits, and gold-set benchmarks (`data/eval/gold_set_v1.json`).
- Respect cross-platform reproducibility: root `.gitattributes` keeps `data/raw/**` binary (`-text`) and text/JSON/SQL/code files `eol=lf`; all Python writes pass `newline="\n"`; all stored repo paths use `repo_rel_posix()` (`/`).

## Repo shape

- `services/pipeline/` — Python 3.11+ discovery, SSRF-hardened retrieval, Parser `0.3.0` offline parsing, Claude Sonnet 4.6 token-aware chunked analysis, Draft 2020-12 `validate-artifacts`, gold-set eval, and Postgres persistence CLI.
- `apps/web/` — Next.js 16 (**Node ≥ 22.18.0**) + React 19 + Tailwind CSS 4 dashboard, pure statistical scoring engine (`scoring.ts` with bootstrap 90% CIs, permutation null, Regime Coverage `COV L1`), `/matrix`, `/compare`, `/methodology`, CORS read APIs, and UTF-8 BOM CSV/JSON/BibTeX exports.
- `packages/schemas/` — Seven Draft 2020-12 JSON Schema contracts covering taxonomy, label definitions, manifests, document/jurisdiction analyses, `/api/overview`, and `/api/matrix`.
- `sql/migrations/` — Incremental Postgres migrations (`001`–`005`) deployed to Neon.
- `data/` — Taxonomy v2.1.0, `label-definitions.json`, manifests, starter gold set (`data/eval/gold_set_v1.json`), source-tracking queues, and committed raw/parsed/analyzed artifacts.
- `prompts/` — Versioned prompt templates dynamically enriched from `data/taxonomies/label-definitions.json`.
- `docs/` — Product thesis, architecture, Codebook v2.1.0, implementation spec, and operational runbooks.

## Verification commands

Pipeline (POSIX via `make` or Windows PowerShell with `PYTHONPATH=services/pipeline/src`):

- `validate-taxonomy` — validates Taxonomy v2.1.0 + 1:1 parity with `label-definitions.json`
- `validate-sources` — validates all 5 `data/sources/*.json` manifests
- `validate-artifacts` — validates all 115 committed corpus artifacts against `packages/schemas/*.schema.json`
- `evaluate-gold-set data/eval/gold_set_v1.json` — evaluates extraction/framing metrics with Cohen's κ & 95% CIs
- `pytest -c services/pipeline/pyproject.toml services/pipeline/tests` — runs full suite with zero git mutations

Web app (inside `apps/web/`, **Node ≥ 22.18.0**):

- `npm run lint` — ESLint (0 errors, 0 warnings)
- `npx tsc --noEmit` — strict TypeScript check
- `npm test` — 13-suite scoring, label-definitions parity, quote-matcher, BOM CSV, and BibTeX invariant tests
- `npm run build` — production Next.js build verification

## Definition of done for analytical work

- Labels and thresholds match `data/taxonomies/observatory-taxonomy.json` and `data/taxonomies/label-definitions.json`.
- `make validate-artifacts` passes with zero schema errors.
- Provenance (`analysis_metadata` + `analyzed_at`) is explicit and truthful; legacy files are never disguised as v2.
- Scoring preserves exact invariants (`CMP = round(0.6 * rawPOL + 0.4 * rawFRM)`, Hamilton `100%` sums, `headline` strict filtering, seeded bootstrap CIs, permutation null calibration, and authoritative manifest `binding_strength`).
