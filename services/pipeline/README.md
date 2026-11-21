# `services/pipeline` — Project Babel ingestion & analysis pipeline

Python 3.11+ package (`observatory`) providing a standalone CLI (`python -m observatory.cli`) that discovers, safely fetches, offline-parses (`Parser 0.3.0`), analyzes with Claude Sonnet 4.6, validates against JSON Schemas (`validate-artifacts`), evaluates against gold benchmarks, and persists official AI governance documents to Postgres.

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
2. **`risk_framing`** (`RiskFramingAnalysis`) — dominant frame, secondary frames, complete eight-frame `frame_confidence` vector, optional explicit `frame_share` allocation summing to `~1.0`, rationale summary, and frame-tagged verbatim evidence spans (`quote` + optional `quote_en`, persisted `grounding_status`, `start_char`, `end_char`).
3. **`jurisdiction_analysis`** (`JurisdictionAnalysis`) — deterministic per-jurisdiction synthesis derived purely from saved document analyses with jurisdiction-scoped institution canonicalization and active statutory anchors ranked ahead of companion FAQs/drafts.

Every analysis is machine-produced by **Claude Sonnet 4.6** via Anthropic structured outputs (`temperature=0.0`, `600s` timeout, genuine dual-breakpoint prompt caching, codebook-injected prompts from `label-definitions.json`, language/token-aware chunking, `8192→16384` controls token budget, and HTTP `529`/`Retry-After` retries). There is no human-review approval queue; quality is governed via strict Pydantic/JSON Schema contracts, NFKC quote-grounding verification (`0.90` canonical gate), corpus quality audits, and gold-set evaluation.

---

## Stages and CLI commands

Invoke via `make <target>` at the repo root or directly with `PYTHONPATH=services/pipeline/src python -m observatory.cli <command>`.

### 1 · Taxonomy, registry, schema enforcement, discovery & audit

| Make target | CLI command | Purpose |
|---|---|---|
| `make taxonomy` | `validate-taxonomy` | Validates `observatory-taxonomy.json` (v2.1.0) and checks 1:1 parity with `label-definitions.json`. |
| `make sources` | `validate-sources` | Validates all `data/sources/*.json` manifests (unique IDs, portal refs, Taxonomy v2.1.0 enums, strict calendar dates, `corpus_role`, `supersedes_id`). |
| `make validate-artifacts` | `validate-artifacts` | Validates all committed taxonomy, label-definitions, manifest, document-analysis, and jurisdiction-analysis JSONs against `packages/schemas/*.schema.json` using Draft 2020-12 `jsonschema`. |
| — | `summarize-sources` | Prints per-jurisdiction portal and seed document counts. |
| `make discover` | `discover-source-candidates [jurisdiction] [--portal-id=ID] [--refresh] [--with-browser]` | Crawls official HTML link lists and recursive `sitemap`/`sitemapindex` feeds (`ProjectBabelObservatory/0.2` UA). |
| `make coverage` | `report-source-coverage` | Regenerates `data/source_tracking/source_inventory.json` and `docs/operations/source-inventory.md`. |
| `make expansion` | `report-source-expansion-plan` | Regenerates family-ranked discovery priorities in `data/source_tracking/source_expansion_plan.json` and `docs/operations/source-expansion-plan.md`. |
| `make audit` | `report-source-quality-audit` | Audits corpus health: CJK-aware text length, SPA shells (`refetch_with_browser`), Shift-JIS/CID mojibake, zero-AI-keyword off-topic docs, duplicate SHA-256 hashes, and grounding gate (`0.90`). |
| — | `sync-source-metadata` | Synchronizes updated manifest metadata (`language`, `title`, `publication_date`) into raw/parsed/analysis artifacts. |
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

### 3 · Offline parse (`Parser 0.3.0`)

| Make target | CLI command | Purpose |
|---|---|---|
| `make parse` | `parse-raw-documents [jurisdiction] [document_id] [--refresh]` | Strictly offline HTML / PDF / HWPX / ODT normalizer writing `data/parsed/<jurisdiction>/<doc_id>/normalized.json`. |

`parser.py` (`0.3.0`) performs **zero live network calls** and records explicit `extractor` provenance (`html`, `pdftotext`, `pypdf`, `hwpx`, `odt_xml`, `textutil`):
- **Legal-heading sectionizer:** Splits statutory texts along `Chapter`, `Article N`, `Section N`, `Annex`, `第N条`, and `제N조` boundaries (prose-safe) so mega-statutes like the EU AI Act never collapse into a single section.
- **PDF normalization:** Strips repeated headers/footers, applies compound-aware de-hyphenation, and reflows broken PDF paragraphs.
- **Multilingual HTML & dates:** Clean CJK charset detection, nested `<li><p>`/`<blockquote><p>` deduplication, NIST `.gov` & China CAC nav-chrome stripping, ISO/CJK/Japanese era date parsing, and incremental SHA-256 skipping.

### 4 · Analyze, ground-check & evaluate

| Make target | CLI command | Purpose |
|---|---|---|
| `make analyze` | `analyze-documents [jurisdiction] [document_id] [--refresh]` | Runs Claude Sonnet 4.6 full-context / token-chunked analysis; refuses to treat provenance-free legacy files as current (`stale_legacy_no_provenance`); removes stale analysis if low-fidelity skip triggers. |
| `make analyze-jurisdictions` | `analyze-jurisdictions [jurisdiction] [--refresh \| --refresh-existing]` | Deterministically rebuilds `data/analysis/jurisdictions/<jurisdiction>/jurisdiction_analysis.json` and `jurisdiction_input_digest.json` (no LLM calls). |
| `make grounding` | `check-grounding [jurisdiction] [document_id] [--min-ratio=F] [--json]` | NFKC + whitespace/hyphen + ordered-window grounding scorer (default `0.90` gate from `label-definitions.json`; returns `None` on empty evidence). |
| — | `evaluate-gold-set <gold_path>` | Evaluates pipeline outputs against a gold bundle (e.g., `data/eval/gold_set_v1.json`) or directory, reporting micro/macro & per-label P/R/F1, Cohen's κ, and seeded 95% bootstrap CIs. |
| — | `export-schemas <output_dir>` | Exports live Pydantic JSON Schemas for diffing against `packages/schemas/`. |

### 5 · Persist & synchronize Postgres

| Make target | CLI command | Purpose |
|---|---|---|
| `make migrate` | `migrate-db` | Applies SQL migrations (`sql/migrations/001`–`005`) with Postgres advisory locking and checksum verification. |
| `make sync-db-dry-run` | `sync-db-to-source-manifests [jurisdiction] --dry-run` | Previews orphaned DB rows without deleting. |
| `make sync-db` | `sync-db-to-source-manifests [jurisdiction] [--max-delete-ratio=0.20] [--force] [--reset-jurisdiction-analyses]` | Prunes orphaned DB rows with a 20% deletion-ratio safety guard (never pre-deletes `machine_jurisdiction_analyses` by default). |
| `make persist-db` | `persist-analysis-artifacts [jurisdiction] [document_id] [--allow-legacy]` | Replays analyses idempotently over a single DB session; reads provenance strictly from `analysis_metadata` and refuses legacy artifacts unless `--allow-legacy` is explicitly passed. |

Populated Postgres tables (`001`–`005`): `schema_migrations`, `documents` (with authoritative manifest `binding_strength`), `document_snapshots`, `machine_document_analyses` (with `frame_shares_json`, `analyzed_at`, `grounding_ratio`, `taxonomy_version`), `machine_application_domains`, `machine_policy_requirements` (with `obligation_strength`), `machine_enforcement_mechanisms`, `machine_secondary_frames`, `machine_frame_scores`, and `machine_jurisdiction_analyses`.

---

## Outputs on disk

```
data/
├── taxonomies/
│   ├── observatory-taxonomy.json              Canonical Taxonomy v2.1.0 registry
│   └── label-definitions.json                 Single source of truth for prompts, UI & thresholds
├── eval/
│   └── gold_set_v1.json                       5-doc multilingual starter benchmark (starter_v0.1_internal)
├── sources/
│   └── <jurisdiction>.json                    Curated portals + seed_documents manifests
├── discovery/
│   └── <jurisdiction>/<portal_id>.json        Cached portal discovery candidates
├── source_tracking/
│   ├── source_inventory.json                  Coverage report JSON
│   ├── source_expansion_plan.json             Family prioritization JSON
│   ├── source_quality_audit.json              Quality/grounding/SPA audit JSON
│   ├── late_2026_priority_targets.json        Curated 19-target late-2026 expansion queue
│   ├── kr_statutory_recovery_status.json      Forensic recovery & Section 0 tracker
│   └── candidate_enrichment/                  Per-portal metadata cache
├── retrieval/<jurisdiction>/<doc_id>.json     Append-only retrieval logs
├── raw/<jurisdiction>/<doc_id>/               Raw artifact (gitattributes -text) + metadata.json
├── parsed/<jurisdiction>/<doc_id>/normalized.json
└── analysis/
    ├── <jurisdiction>/<doc_id>/               document_analysis.json + subsets + raw envelopes
    └── jurisdictions/<jurisdiction>/          jurisdiction_analysis.json + input digest
```

---

## Environment variables

Defined in root `.env.example`:

| Variable | Required for | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | `analyze-documents` | Anthropic API key. |
| `ANTHROPIC_MODEL` | Optional | Defaults to `claude-sonnet-4-6`. |
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
make taxonomy && make sources && make validate-artifacts && make test
```

```powershell
# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File scripts/bootstrap.ps1
$env:PYTHONPATH = "services/pipeline/src"
services\pipeline\.venv\Scripts\python.exe -m observatory.cli validate-taxonomy
services\pipeline\.venv\Scripts\python.exe -m observatory.cli validate-sources
services\pipeline\.venv\Scripts\python.exe -m observatory.cli validate-artifacts
services\pipeline\.venv\Scripts\python.exe -m pytest -c services/pipeline/pyproject.toml services/pipeline/tests
```

---

## Routine refresh & safe DB sync loop

```bash
make refresh
make parse
make analyze
make analyze-jurisdictions
make grounding
make audit
make validate-artifacts
make migrate            # or make migrate-prod
make sync-db-dry-run
make sync-db            # or make sync-prod-db
make persist-db         # or make persist-prod
```

---

## Testing & CI

`make test` runs the full `pytest` suite (**108 tests**) with zero tracked file mutations. GitHub Actions (`.github/workflows/ci.yml`) runs `validate-taxonomy`, `validate-sources`, `validate-artifacts`, and `pytest` across an **Ubuntu + Windows** matrix alongside the **Node 22** `apps/web` lint, typecheck, unit test, and build job.

---

## Package layout

```
services/pipeline/
├── pyproject.toml           Dependencies (pydantic, httpx, bs4, pypdf, psycopg, jsonschema, playwright)
├── src/observatory/
│   ├── __init__.py
│   ├── analysis.py          Token-aware full-context/chunked Claude runner, dual prompt caching, NFKC grounding, gold-set eval & jurisdiction synthesis
│   ├── audit.py             CJK-aware corpus quality, SPA shell, mojibake, duplicate & 0.90 grounding detector
│   ├── browser_fetch.py     Playwright BrowserSession with context.route SSRF guard, locale & status validation
│   ├── cli.py               CLI entrypoint dispatching all subcommands
│   ├── coverage.py          Source inventory & coverage reporting
│   ├── db.py                Migrations (001–005), advisory locks, checksum checks, guarded sync & persistence store
│   ├── discovery.py         HTML link & recursive sitemapindex portal discovery
│   ├── expansion.py         Family-based expansion planning
│   ├── freshness.py         Orchestrated discover -> fetch -> coverage refresh loop
│   ├── linked_artifacts.py  Official linked-PDF candidate resolution
│   ├── metadata_sync.py     Manifest-to-artifact metadata synchronization
│   ├── models.py            Strict Pydantic contracts (DocumentAnalysis, AnalysisProvenance, EvidenceSpan, JurisdictionAnalysis)
│   ├── parser.py            Parser 0.3.0 strictly offline HTML/PDF/HWPX/ODT normalizer with legal-heading sectionizer & PDF reflow
│   ├── persistence.py       Strict analysis_metadata provenance extraction, LegacyProvenanceError guard, partial-date & binding persistence
│   ├── prompts.py           Dynamic codebook prompt builder from data/taxonomies/label-definitions.json
│   ├── retrieval.py         Safe HTTP/browser downloader, conditional refresh, %PDF- check & selector-aware SPA-overwrite guard
│   ├── schema_validation.py Draft 2020-12 jsonschema validator backing validate-artifacts
│   ├── source_ops.py        Word-boundary multilingual classification & candidate triage heuristics
│   ├── source_promotion.py  Candidate enrichment & atomic manifest promotion
│   ├── source_registry.py   Manifest Pydantic validation (Taxonomy v2.1.0) & atomic LF persistence
│   ├── taxonomy.py          Canonical Taxonomy v2.1.0 + label-definitions.json parity loader/validator
│   └── url_safety.py        Shared SSRF validator (is_global + shorthand IPv4 defense) & repo_rel_posix()
└── tests/                   pytest unit & regression suite
```

See [`../../sql/migrations/README.md`](../../sql/migrations/README.md), [`../../packages/schemas/README.md`](../../packages/schemas/README.md), and [`../../apps/web/README.md`](../../apps/web/README.md).
