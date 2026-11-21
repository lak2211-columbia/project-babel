# `services/pipeline` — Project Babel ingestion & analysis pipeline

Python 3.11+ package (`observatory`) providing a standalone CLI (`python -m observatory.cli`) that discovers, safely fetches, offline-parses (`Parser 0.3.0` with **PyMuPDF** primary PDF extraction), analyzes with a multi-provider frontier LLM engine (**`gemini-4-neon`** default 1M-token context + Anthropic **`claude-opus-5-5`** fallback + zero-cost **`ingest-document-analysis`** verification), validates against JSON Schemas (`validate-artifacts`), evaluates against gold benchmarks, and persists official AI governance documents to Postgres.

Every `make` target at the repository root wraps one of the subcommands documented below, with cross-platform support on POSIX and Windows.

For the project overview and research thesis, see the [root README](../../README.md).

---

## Table of contents

- [What the pipeline does](#what-the-pipeline-does)
- [Stages and CLI commands](#stages-and-cli-commands)
- [Outputs on disk](#outputs-on-disk)
- [Environment variables](#environment-variables)
- [Local setup (POSIX & Windows)](#local-setup-posix--windows)
- [Routine refresh & safe DB sync loop](#routine-refresh--safe-db-sync-loop)
- [Testing & CI](#testing--ci)
- [Package layout](#package-layout)

---

## What the pipeline does

The pipeline converts official government AI governance publications into taxonomy-constrained extractions plus deterministic jurisdiction syntheses governed by **Taxonomy v2.1.0** (`data/taxonomies/observatory-taxonomy.json`) and canonical label definitions (`data/taxonomies/label-definitions.json`):

1. **`policy_extraction`** (`PolicyExtraction`) — issuing body, document type, binding strength, dates, covered actors, application domains (10 labels), prohibited practices, concrete safety requirements (17 labels, each with optional deontic `obligation_strength` and required `>= 1` evidence span), enforcement mechanisms (9 labels), authorities, deadlines, penalties summary, and implementation notes.
2. **`risk_framing`** (`RiskFramingAnalysis`) — dominant frame, secondary frames, complete eight-frame `frame_confidence` vector, compositional `frame_share` allocation summing to `~1.0`, rationale summary, and frame-tagged verbatim evidence spans (`quote` + optional `quote_en`, persisted `grounding_status`, `start_char`, `end_char`).
3. **`jurisdiction_analysis`** (`JurisdictionAnalysis`) — deterministic per-jurisdiction synthesis derived purely from saved document analyses with jurisdiction-scoped institution canonicalization and active statutory anchors ranked ahead of companion FAQs/drafts.

The multi-provider engine defaults to **Gemini 4 Neon (`gemini-4-neon`, 1M-token direct full-document context)** via pure-stdlib `GeminiAPIClient` (with `temperature=0.0`, non-thought part extraction, `MAX_TOKENS` escalation `16384→32768→65536`, HTTP `429`/`5xx` retries + `600s` timeout, and bounded `--workers N` concurrency), supports Anthropic **`claude-opus-5-5`** fallback (`ClaudeAPIClient` with sequential dual-breakpoint prompt caching and HTTP `529`/`Retry-After` retries), and provides `ingest-document-analysis` for strict schema + verbatim-snap ingestion of offline/harness extractions. Every committed document (**144/144**) currently carries `taxonomy_version: "2.1.0"`, `analysis_version: "0.3.0"`, `provider: "gemini"`, `model: "gemini-4-neon"`, and **`2,786 / 2,786` (`100.0%`)** exact verbatim evidence grounding.

---

## Stages and CLI commands

Invoke via `make <target>` at the repo root or directly with `PYTHONPATH=services/pipeline/src python -m observatory.cli <command>`.

### 1 · Taxonomy, registry, schema enforcement, discovery & audit

| Make target | CLI command | Purpose |
|---|---|---|
| `make taxonomy` | `validate-taxonomy` | Validates `observatory-taxonomy.json` (v2.1.0) and checks 1:1 parity with `label-definitions.json`. |
| `make sources` | `validate-sources` | Validates all `data/sources/*.json` manifests (**144** seeds across **61** portals: unique IDs, portal refs, Taxonomy v2.1.0 enums, strict calendar dates, `corpus_role` incl. `subnational_overlay`, optional `subnational_unit`, and `supersedes_id`). |
| `make validate-artifacts` | `validate-artifacts [--json]` | Validates all **156** committed taxonomy, label-definitions, manifest, document-analysis, and jurisdiction-analysis JSONs against `packages/schemas/*.schema.json` using Draft 2020-12 `jsonschema`. |
| — | `summarize-sources` | Prints per-jurisdiction portal and seed document counts. |
| `make freshness` | `check-freshness [jurisdiction] [--jurisdiction=JUR] [--timeout=N] [--workers=N] [--output-json=PATH] [--output-md=PATH] [--no-write] [--json]` | Polite SSRF-validated `HEAD` (with `Range: bytes=0-0` `GET` fallback) conditional freshness monitor (`If-None-Match` / `If-Modified-Since`) writing LF JSON + Markdown reports without mutating raw artifacts; invoked weekly by `.github/workflows/freshness-watch.yml`. |
| `make discover` | `discover-source-candidates [jurisdiction] [--portal-id=ID] [--refresh] [--with-browser]` | Crawls official HTML link lists and recursive `sitemap`/`sitemapindex` feeds (`ProjectBabelObservatory/0.2` UA). |
| `make coverage` | `report-source-coverage` | Regenerates `data/source_tracking/source_inventory.json` and `docs/operations/source-inventory.md`. |
| `make expansion` | `report-source-expansion-plan` | Regenerates family-ranked discovery priorities in `data/source_tracking/source_expansion_plan.json` and `docs/operations/source-expansion-plan.md`. |
| `make audit` | `report-source-quality-audit` | Audits corpus health: CJK-aware text length, SPA shells (`refetch_with_browser`), Shift-JIS/CID mojibake, zero-AI-keyword off-topic docs, zero-quote analyses, duplicate SHA-256 hashes, and grounding gate (`0.90`). |
| — | `sync-source-metadata` | Synchronizes updated manifest metadata (`language`, `title`, `publication_date`, `subnational_unit`, `supersedes_id`) into raw/parsed/analysis artifacts. |
| `make enrich` | `enrich-source-candidates [jurisdiction] [--portal-id=ID] [--recommendations=LIST] [--limit=N] [--refresh] [--with-browser]` | Fetches candidate pages to resolve publication dates, languages, titles, and linked PDFs. |
| `make promote` | `promote-source-families [jurisdiction] [--portal-id=ID] [--recommendations=LIST] [--limit=N] [--with-browser]` | Promotes enriched candidate families into `data/sources/<jurisdiction>.json` using atomic LF-normalized writes. |

### 2 · Fetch (safe HTTP + Playwright browser)

| Make target | CLI command | Purpose |
|---|---|---|
| `make fetch` | `fetch-seed-documents [jurisdiction] [--refresh] [--with-browser] [--with-companions] [--max-attempts=N]` | Downloads registered seed artifacts into `data/raw/<jurisdiction>/<doc_id>/`. |
| `make refresh` | `refresh-sources [jurisdiction] [--portal-id=ID] [--discover-with-browser] [--fetch-with-browser] [--skip-discovery] [--skip-fetch]` | Orchestrated discover → fetch → coverage → expansion refresh loop. |
| — | `import-local-document <jurisdiction> <doc_id> <file_path> [--source-url=URL] [--resolved-url=URL] [--content-type=TYPE]` | Imports a manually acquired official primary file while preserving retrieval-log provenance. |
| `make browser-install` | `python -m playwright install chromium` | Installs Playwright Chromium for `browser_required` portals. |

Safety & reliability guarantees (`retrieval.py`, `browser_fetch.py`, `url_safety.py`):

- **End-to-end SSRF protection:** Allows only `http`/`https`, requires globally routable IPs (`is_global`, blocking loopback, RFC1918, CGNAT `100.64.0.0/10`, link-local, multicast, and shorthand/decimal/hex/octal IPv4 literals), validates redirect hops, and enforces Playwright `context.route("**/*", ...)` across every browser sub-request and navigation.
- **Strict HTTP & PDF checks:** Rejects HTTP `<200` and `>=400` across both HTTP and Playwright paths; requires `%PDF-` magic bytes; validates and logs linked PDF artifacts; propagates document locale on CJK browser fetches.
- **SPA-overwrite guard:** Inspects `browser_wait_for_selector` (e.g., `#bodyContent` on `law.go.kr`) and nav-stripped text thresholds so plain HTTP fetches never overwrite `browser_required` documents with empty SPA shells (`blocked_spa_overwrite`).
- **Conditional refresh & LF/POSIX hygiene:** Sends `If-None-Match` / `If-Modified-Since` (`304 Not Modified`), preserves metadata across unchanged refreshes, writes LF (`newline="\n"`) everywhere, and normalizes all stored paths via `repo_rel_posix()`.

### 3 · Offline parse (`Parser 0.3.0` + PyMuPDF)

| Make target | CLI command | Purpose |
|---|---|---|
| `make parse` | `parse-raw-documents [jurisdiction] [document_id] [--refresh]` | Strictly offline HTML / PDF / HWPX / ODT normalizer writing `data/parsed/<jurisdiction>/<doc_id>/normalized.json`. |

`parser.py` (`0.3.0`) performs **zero live network calls** and records explicit `extractor` provenance (`pymupdf`, `pdftotext`, `pypdf`, `beautifulsoup4`, `hwpx_xml`, `odt_xml`, `textutil`):
- **PyMuPDF primary PDF extractor:** Uses `fitz` (`pymupdf>=1.25,<2.0`) first for high-fidelity CJK and multi-column PDF extraction (`93 pymupdf`, `48 beautifulsoup4`, `3 hwpx_xml` across the 144-doc corpus), falling back cleanly to `pdftotext` and `pypdf`.
- **Legal-heading sectionizer:** Splits statutory texts along `Chapter`, `Article N`, `Section N`, `Annex`, `第N条`, and `제N조` boundaries (prose-safe — e.g., EU AI Act splits into 158 sections).
- **PDF normalization:** Strips repeated running headers/footers while preserving top-of-page legal headings, applies compound-aware de-hyphenation, and reflows broken PDF paragraphs.
- **Multilingual HTML & dates:** Clean CJK charset detection, nested `<li><p>`/`<blockquote><p>` deduplication, NIST `.gov`, China CAC (`cac.gov.cn` top-nav/breadcrumb/footer), and Korean `law.go.kr` (`#hisComment` & `.cont_subtit` ministry contact) boilerplate stripping, ISO/CJK/Japanese era date parsing, and incremental SHA-256 skipping.

### 4 · Analyze, ingest, ground-check & evaluate

| Make target | CLI command | Purpose |
|---|---|---|
| `make analyze` | `analyze-documents [jurisdiction] [document_id] [--provider=auto\|gemini\|anthropic] [--model=ID] [--effort=low\|medium\|high] [--workers=N] [--refresh]` | Runs full-context / token-chunked multi-provider extraction & 8-frame risk analysis with atomic writes, verbatim quote snapping, and bounded concurrency (`--workers 1..8`). |
| — | `ingest-document-analysis <jurisdiction> <doc_id> <input_json_path> [--provider=gemini] [--model=gemini-4-neon] [--effort=xhigh] [--min-grounding=0.90]` | Validates, verbatim-snaps (`snap_to_verbatim=True`), checks `grounding_ratio >= min_grounding`, stamps full v2.1 `AnalysisProvenance`, and atomically writes `document_analysis.json` from offline/harness JSON payloads. |
| `make analyze-jurisdictions` | `analyze-jurisdictions [jurisdiction] [--refresh \| --refresh-existing]` | Deterministically rebuilds `data/analysis/jurisdictions/<jurisdiction>/jurisdiction_analysis.json` and `jurisdiction_input_digest.json` (no LLM calls; strictly excludes `subnational_overlay` docs from sovereign summaries). |
| `make grounding` | `check-grounding [jurisdiction] [document_id] [--min-ratio=F] [--json]` | NFKC + whitespace/hyphen + ordered-window grounding scorer (default `0.90` gate from `label-definitions.json`; returns `None` on empty evidence). Current corpus: **`2,786 / 2,786` (`100.0%`) exact**. |
| `make eval-gold-set` | `evaluate-gold-set <gold_path> [--output-json=PATH]` | Evaluates pipeline outputs against a gold bundle (default `GOLD_SET ?= data/eval/gold_set_v2.json`, `n=25`) or directory, reporting micro/macro & per-label P/R/F1, `by_jurisdiction` multilingual breakdown, Cohen's κ, nominal Krippendorff's α, and seeded 95% bootstrap CIs. |
| — | `export-schemas <output_dir>` | Exports live Pydantic JSON Schemas for diffing against `packages/schemas/`. |

### 5 · Persist & synchronize Postgres

| Make target | CLI command | Purpose |
|---|---|---|
| `make migrate` | `migrate-db` | Applies SQL migrations (`sql/migrations/001`–`005`) with Postgres advisory locking and checksum verification. |
| `make sync-db-dry-run` | `sync-db-to-source-manifests [jurisdiction] --dry-run` | Previews orphaned DB rows without deleting. |
| `make sync-db` | `sync-db-to-source-manifests [jurisdiction] [--max-delete-ratio=0.20] [--force] [--reset-jurisdiction-analyses]` | Prunes orphaned DB rows with a 20% deletion-ratio safety guard (never pre-deletes `machine_jurisdiction_analyses` by default). |
| `make persist-db` | `persist-analysis-artifacts [jurisdiction] [document_id] [--allow-legacy]` | Replays analyses idempotently over a single DB session; propagates `subnational_unit` & `supersedes_id` into `documents.raw_metadata_json` and stores `corpus_role="subnational_overlay"` cleanly with zero DB migration needed; refuses legacy artifacts unless `--allow-legacy` is explicitly passed. |

Populated Postgres tables (`001`–`005`): `schema_migrations`, `documents` (with authoritative manifest `binding_strength` plus `subnational_unit`/`supersedes_id` in `raw_metadata_json`), `document_snapshots`, `machine_document_analyses` (with `frame_shares_json`, `analyzed_at`, `grounding_ratio`, `taxonomy_version`), `machine_application_domains`, `machine_policy_requirements` (with `obligation_strength`), `machine_enforcement_mechanisms`, `machine_secondary_frames`, `machine_frame_scores`, and `machine_jurisdiction_analyses`.

---

## Outputs on disk

```
data/
├── taxonomies/
│   ├── observatory-taxonomy.json              Canonical Taxonomy v2.1.0 registry
│   └── label-definitions.json                 Single source of truth for prompts, UI & thresholds
├── eval/
│   ├── gold_set_v1.json                       5-doc multilingual starter benchmark (starter_v0.1_internal)
│   ├── gold_set_v2.json                       25-doc stratified multilingual blind benchmark (stratified_v1.0_blind_internal)
│   └── gold_set_results.json                  Latest gold-set v2 metrics (mirrored to apps/web snapshot)
├── sources/
│   └── <jurisdiction>.json                    Curated portals (61) + seed_documents (144: 138 sovereign + 6 state overlay)
├── discovery/
│   └── <jurisdiction>/<portal_id>.json        Cached portal discovery candidates
├── source_tracking/
│   ├── source_inventory.json                  Coverage report JSON
│   ├── source_expansion_plan.json             Family prioritization JSON
│   ├── source_quality_audit.json              Quality/grounding/SPA audit JSON
│   ├── late_2026_priority_targets.json        Late-2026 ingestion & deferred audit log
│   ├── kr_statutory_recovery_status.json      Forensic recovery tracker
│   ├── freshness_report.{json,md}             Weekly check-freshness output (written by make freshness)
│   └── candidate_enrichment/                  Per-portal metadata cache
├── retrieval/<jurisdiction>/<doc_id>.json     Append-only retrieval logs (144)
├── raw/<jurisdiction>/<doc_id>/               Raw artifact (gitattributes -text) + metadata.json (144)
├── parsed/<jurisdiction>/<doc_id>/normalized.json  Parser 0.3.0 structured output (144)
└── analysis/
    ├── <jurisdiction>/<doc_id>/               document_analysis.json (v2.1.0) + subsets + raw envelopes (144)
    └── jurisdictions/<jurisdiction>/          jurisdiction_analysis.json + input digest (5 sovereign summaries)
```

---

## Environment variables

Defined in root `.env.example` (never commit `.env` or echo API keys):

| Variable | Required for | Notes |
|---|---|---|
| `LLM_PROVIDER` | Optional | `auto` (default: prefers `gemini` when `GEMINI_API_KEY` is set, else `anthropic`), `gemini`, or `anthropic`. |
| `GEMINI_API_KEY` | `analyze-documents --provider=gemini` | Gemini API key passed via `x-goog-api-key` header (redacted on errors, never persisted). |
| `GEMINI_MODEL` | Optional | Defaults to `gemini-4-neon` (1M-token context). |
| `GEMINI_THINKING_LEVEL` | Optional | Thinking budget level (`low` / `medium` / `high`). Defaults to `medium`. |
| `ANTHROPIC_API_KEY` | `analyze-documents --provider=anthropic` | Anthropic API key for fallback provider. |
| `ANTHROPIC_MODEL` | Optional | Defaults to `claude-opus-5-5`. |
| `ANTHROPIC_EFFORT` | Optional | Structured-output effort (`low` / `medium` / `high`). Defaults to `low`. |
| `DATABASE_URL` | `migrate-db`, `persist-analysis-artifacts`, `sync-db-to-source-manifests` | Postgres connection string (local Docker or Neon). |
| `OBSERVATORY_STRICT_DATABASE` | Web app (`apps/web`) | `1` disables filesystem/seed fallback in production. |
| `OBSERVATORY_REVALIDATE_SECRET` | Web app (`POST /api/revalidate`) | Authorizes ISR cache tag purges after DB sync. |

`scripts/run-with-vercel-env.sh` safely parses `.vercel/.env.<env>.local` without shell evaluation and cleans temporary state via an `EXIT` trap.

---

## Local setup (POSIX & Windows)

Requires Python 3.11+.

```bash
# POSIX
./scripts/bootstrap.sh
make taxonomy && make sources && make validate-artifacts && make grounding && make test
```

```powershell
# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File scripts/bootstrap.ps1
$env:PYTHONPATH = "services/pipeline/src"
services\pipeline\.venv\Scripts\python.exe -m observatory.cli validate-taxonomy
services\pipeline\.venv\Scripts\python.exe -m observatory.cli validate-sources
services\pipeline\.venv\Scripts\python.exe -m observatory.cli validate-artifacts
services\pipeline\.venv\Scripts\python.exe -m observatory.cli check-grounding
services\pipeline\.venv\Scripts\python.exe -m pytest -c services/pipeline/pyproject.toml services/pipeline/tests
```

---

## Routine refresh & safe DB sync loop

```bash
make refresh
make parse
python -m observatory.cli analyze-documents --provider gemini --model gemini-4-neon --effort medium --workers 6
make analyze-jurisdictions
make grounding
make audit
python -m observatory.cli evaluate-gold-set data/eval/gold_set_v2.json --output-json data/eval/gold_set_results.json
make validate-artifacts
make freshness          # polite weekly source-drift probe (also automated in .github/workflows/freshness-watch.yml)
make migrate            # or make migrate-prod
make sync-db-dry-run
make sync-db            # or make sync-prod-db
make persist-db         # or make persist-prod
```

---

## Testing & CI

`make test` runs the full `pytest` suite (**124 tests**) with zero tracked file mutations. GitHub Actions (`.github/workflows/ci.yml`) runs `validate-taxonomy`, `validate-sources`, `validate-artifacts` (`156/156`), and `pytest` across an **Ubuntu + Windows** matrix alongside the **Node 22** `apps/web` lint, typecheck, unit test, and build job. A separate weekly workflow (`.github/workflows/freshness-watch.yml`, Monday `06:00 UTC` + manual dispatch) runs `validate-taxonomy`, `validate-sources`, `validate-artifacts`, `check-grounding`, and `check-freshness` without paid API keys, auto-managing a `freshness-watch` GitHub issue on drift or breakage.

---

## Package layout

```
services/pipeline/
├── pyproject.toml           Dependencies (pydantic>=2.11, pymupdf>=1.25, pypdf, bs4, psycopg, jsonschema, playwright)
├── src/observatory/
│   ├── __init__.py
│   ├── analysis.py          Multi-provider GeminiAPIClient (1M context) + ClaudeAPIClient, --workers concurrency, ingest-document-analysis, NFKC verbatim snapping, gold-set v2 eval (Krippendorff's α + by_jurisdiction) & sovereign jurisdiction synthesis
│   ├── audit.py             CJK-aware corpus quality, SPA shell, mojibake, zero-quote, duplicate & 0.90 grounding detector
│   ├── browser_fetch.py     Playwright BrowserSession with context.route SSRF guard, locale & status validation
│   ├── cli.py               CLI entrypoint dispatching all subcommands (incl. check-freshness)
│   ├── coverage.py          Source inventory & coverage reporting
│   ├── db.py                Migrations (001–005), advisory locks, checksum checks, guarded sync & persistence store
│   ├── discovery.py         HTML link & recursive sitemapindex portal discovery
│   ├── expansion.py         Family-based expansion planning
│   ├── freshness.py         Orchestrated refresh loop + SSRF-safe check_source_freshness() conditional drift monitor
│   ├── linked_artifacts.py  Official linked-PDF candidate resolution
│   ├── metadata_sync.py     Manifest-to-artifact metadata synchronization (incl. subnational_unit & supersedes_id)
│   ├── models.py            Strict Pydantic contracts (DocumentAnalysis, AnalysisProvenance, EvidenceSpan, JurisdictionAnalysis)
│   ├── parser.py            Parser 0.3.0 strictly offline HTML/PDF (PyMuPDF primary)/HWPX/ODT normalizer with legal-heading sectionizer, PDF reflow & CAC/law.go.kr chrome stripping
│   ├── persistence.py       Strict analysis_metadata provenance extraction, LegacyProvenanceError guard, partial-date, binding & subnational_unit/supersedes_id raw_metadata persistence
│   ├── prompts.py           Dynamic codebook prompt builder from data/taxonomies/label-definitions.json
│   ├── retrieval.py         Safe HTTP/browser downloader, conditional refresh, %PDF- check & selector-aware SPA-overwrite guard
│   ├── schema_validation.py Draft 2020-12 jsonschema validator backing validate-artifacts (156/156)
│   ├── source_ops.py        Word-boundary multilingual classification & candidate triage heuristics
│   ├── source_promotion.py  Candidate enrichment & atomic manifest promotion
│   ├── source_registry.py   Manifest Pydantic validation (Taxonomy v2.1.0 + subnational_overlay/subnational_unit) & atomic LF persistence
│   ├── taxonomy.py          Canonical Taxonomy v2.1.0 + label-definitions.json parity loader/validator
│   └── url_safety.py        Shared SSRF validator (is_global + shorthand IPv4 defense) & repo_rel_posix()
└── tests/                   pytest unit & regression suite (124 tests)
```

See [`../../sql/migrations/README.md`](../../sql/migrations/README.md), [`../../packages/schemas/README.md`](../../packages/schemas/README.md), and [`../../apps/web/README.md`](../../apps/web/README.md).
