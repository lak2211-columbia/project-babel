# `services/pipeline` — Project Babel ingestion pipeline

Python 3.11 package. A Typer CLI that discovers, fetches, parses, analyzes, and persists official AI governance documents for the observatory.

Every `make` target at the repository root is a thin wrapper around one of the subcommands defined here.

For the project overview and the research thesis, see the [root README](../../README.md).

---

## Table of contents

- [What the pipeline does](#what-the-pipeline-does)
- [Stages and CLI commands](#stages-and-cli-commands)
- [Outputs on disk](#outputs-on-disk)
- [Environment variables](#environment-variables)
- [Local setup](#local-setup)
- [The routine refresh loop](#the-routine-refresh-loop)
- [Handling blocked sources](#handling-blocked-sources)
- [Testing](#testing)
- [Package layout](#package-layout)

---

## What the pipeline does

Start from nothing. Produce a structured comparative dataset.

The pipeline takes **official government AI governance documents** — legislation, executive orders, strategy papers, regulatory guidance, voluntary commitments — and turns each one into two structured extractions:

1. **`policy_extraction`** — concrete safeguards and enforcement mechanisms named in the text (risk assessments, red-teaming, transparency duties, incident reporting, licensing, procurement controls, civil penalties, …), each with a quoted evidence span.
2. **`risk_framing`** — how the document justifies its rules, classified against a fixed eight-label vocabulary (national security, fundamental rights, economic competitiveness, innovation enablement, social stability, consumer/public safety, existential/catastrophic, labor transition), with per-frame confidence scores and evidence spans.

Both extractions are produced by **Claude Sonnet 4.6 via Anthropic structured outputs**. The pipeline is LLM-only — there is no human-review layer — and every artifact stays traceable back to the original document through the retrieval log and the stored evidence spans.

The outputs feed three things: the filesystem corpus under `data/`, the Postgres database (via `persist-analysis-artifacts`), and the precomputed per-jurisdiction narrative aggregation used by the web app's country pages.

## Stages and CLI commands

The pipeline has six stages. Each is runnable independently; the `make refresh` target chains discovery, fetch, and coverage reporting together for routine use.

### 1 · Source registry + discovery

Keep the list of known documents up to date.

| Make target | CLI command | Purpose |
|---|---|---|
| `make sources` | `validate-sources` | Validates every manifest under `data/sources/*` against the schema. |
| `make taxonomy` | `validate-taxonomy` | Validates the label vocabulary under `data/taxonomies/` against the research codebook. |
| `make discover` | `discover-source-candidates --refresh` | Crawls configured official portals to find candidate documents. Writes candidate URLs + metadata to `data/discovery/<jurisdiction>/` and cache to `data/source_tracking/candidate_enrichment/`. |
| `make coverage` | `report-source-coverage` | Generates `data/source_tracking/source_inventory.json` and `docs/operations/source-inventory.md`. |
| `make expansion` | `report-source-expansion-plan` | Writes `docs/operations/source-expansion-plan.md` — a family-based prioritization for the next discovery pass. |
| `make audit` | `report-source-quality-audit` | Structural quality check over every registered source. |
| `make enrich` | `enrich-source-candidates --refresh` | Resolves publication dates, languages, issuing bodies for discovered candidates. |
| `make promote` | `promote-source-families` | Promotes high-signal families from discovery into the official `seed_documents` registry. |

### 2 · Fetch

Download the raw artifacts.

| Make target | CLI command | Purpose |
|---|---|---|
| `make fetch` | `fetch-seed-documents` | Downloads every registered document into `data/raw/<jurisdiction>/<doc_id>/`. |
| `make refresh` | `refresh-sources` | Full routine loop: discover → fetch → coverage → blocked-source summary, in one command. |
| `make browser-install` | (Playwright install) | Installs Chromium for the browser fallback used by JS-heavy portals. |

The HTTP client in `observatory.fetch` supports retry with exponential backoff, SHA-256 content tracking for incremental refreshes, and a **browser fallback** via Playwright for portals that require JavaScript rendering (e.g., `law.go.kr`, METI report pages). Invoke with:

```bash
observatory fetch-seed-documents japan --refresh --with-browser
```

Each successful fetch writes three files alongside the artifact:

- The artifact itself (`<doc_id>.pdf`, `.html`, `.docx`, `.hwpx`, etc.)
- `metadata.json` — canonical URL, publication date, language, issuing body, content-type
- `retrieval_log.json` — timestamps, content-sha256, HTTP status, retry count, any warnings

### 3 · Parse

Normalize raw artifacts into structured text.

| Make target | CLI command | Purpose |
|---|---|---|
| `make parse` | `parse-raw-documents` | Runs format-specific normalizers (HTML / PDF / DOCX / HWPX) and writes `data/parsed/<jurisdiction>/<doc_id>/normalized.json`. |

Each `normalized.json` has:

- `title` — authoritative document title
- `language` — ISO language code
- `plain_text` — full normalized text
- `sections[]` — array of `{heading, level, content}`
- `warnings[]` — parser issues (broken tables, missing headings, OCR confidence, etc.)
- `parser_version` — version of the normalizer that produced this file

### 4 · Analyze

Structured extraction via Claude.

| Make target | CLI command | Purpose |
|---|---|---|
| `make analyze` | `analyze-documents` | Runs Claude Sonnet 4.6 on every parsed document. Writes `data/analysis/<jurisdiction>/<doc_id>/document_analysis.json`. |

Requires `ANTHROPIC_API_KEY` in the environment. The Anthropic client uses structured outputs with JSON schemas defined under `packages/schemas/`; prompts live in `prompts/structured_extraction.md` and `prompts/risk_framing_analysis.md`.

Each `document_analysis.json` contains:

```jsonc
{
  "document_id": "...",
  "analysis_timestamp": "...",
  "policy_extraction": {
    "document_type": "legislation | executive_order | ...",
    "issuing_body": "...",
    "binding_strength": "binding_law | regulatory_guidance | ...",
    "safety_requirements": [
      { "label": "risk_assessment", "confidence": 0.85, "evidence": [ { "quote": "...", "source_section": "..." } ] }
    ],
    "enforcement_mechanisms": [
      { "label": "regulatory_supervision", "confidence": 0.7, "evidence": [ ... ] }
    ]
  },
  "risk_framing": {
    "dominant_frame": "national_security",
    "secondary_frames": ["economic_competitiveness"],
    "frame_confidence": { "national_security": 0.78, "fundamental_rights": 0.12, ... },
    "rationale_summary": "...",
    "evidence_spans": [ { "quote": "...", "source_section": "..." } ]
  }
}
```

### 5 · Persist

Write analysis artifacts into Postgres.

| Make target | CLI command | Purpose |
|---|---|---|
| `make migrate` | `migrate-db` | Applies pending migrations from `sql/migrations/` against `DATABASE_URL`. |
| `make persist-db` | `persist-analysis-artifacts` | Replays every `document_analysis.json` into Postgres. Idempotent. |
| `make sync-db` | persist + aggregate | One-shot combined step used locally. |

Populates:

- `documents` — the document registry (title, jurisdiction, publication date, normalized text path, parser version)
- `machine_document_analyses` — one row per analysis run
- `machine_policy_requirements` — extracted safeguards with confidence + evidence
- `machine_enforcement_mechanisms` — extracted enforcement hooks with confidence + evidence
- `machine_secondary_frames` — secondary framing labels per analysis
- `machine_frame_scores` — per-frame confidence per analysis
- `machine_application_domains` — extracted application-domain labels

See [`../../sql/migrations/README.md`](../../sql/migrations/README.md) for the schema.

### 6 · Aggregate (per-jurisdiction narrative)

Roll up per-country summary + top-N lists used by the web app's country pages.

| Make target | CLI command | Purpose |
|---|---|---|
| (part of `make sync-db` / `make sync-prod-db`) | `aggregate-jurisdictions` | Writes `jurisdiction_analyses` rows with summary, governance posture, implementation + enforcement narrative, framing landscape, top requirements/enforcement/binding/document-type, source window. |

## Outputs on disk

```
data/
├── sources/                           hand-curated seed manifests
│   └── <jurisdiction>/seed_documents.json
├── taxonomies/                        canonical label vocabulary
│   ├── framing.json
│   ├── requirements.json
│   └── enforcement.json
├── discovery/                         output of discovery scans
│   └── <jurisdiction>/candidates-*.json
├── source_tracking/
│   ├── source_inventory.json          full inventory
│   ├── candidate_enrichment/          enrichment cache (per-URL metadata)
│   └── audit_snapshots/
├── retrieval/                         fetch run logs
│
├── raw/                               raw fetched artifacts
│   └── <jurisdiction>/<doc_id>/
│       ├── <artifact>                 (pdf/html/docx/hwpx/json/...)
│       ├── metadata.json              canonical URL, language, issuing body
│       └── retrieval_log.json         timestamps, sha256, retries
│
├── parsed/                            normalized text
│   └── <jurisdiction>/<doc_id>/
│       └── normalized.json
│
└── analysis/                          structured extraction + framing
    ├── <jurisdiction>/<doc_id>/
    │   ├── document_analysis.json     authoritative output
    │   ├── policy_extraction.json     materialized subset
    │   ├── risk_framing.json          materialized subset
    │   ├── policy_response.raw.json   raw Anthropic structured-output envelope
    │   └── framing_response.raw.json  raw Anthropic structured-output envelope
    └── jurisdictions/
        └── <jurisdiction>/jurisdiction_input_digest.json
```

Everything under `data/` is committed to the repo so the full pipeline is reproducible from a fresh clone — you only need to re-run `make analyze` if you want to regenerate the structured extractions, and `make persist-db` if you want them in a database. See [`../../data/README.md`](../../data/README.md) for provenance and per-jurisdiction licensing notes.

## Environment variables

Expected in `.env` at the repo root (or exported into the shell):

| Variable | Required for | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | `make analyze` | Anthropic API key. |
| `ANTHROPIC_MODEL` | Optional | Defaults to `claude-sonnet-4-6`. |
| `ANTHROPIC_EFFORT` | Optional | Structured-output effort budget (`low` / `medium` / `high`). Defaults to `low`. |
| `DATABASE_URL` | `make migrate` / `make persist-db` | Postgres connection string (Neon or local). |
| `OBSERVATORY_STRICT_DATABASE` | Optional | Web-app concern, documented here for reference: `1` disables filesystem fallback on production reads. |
| `RAW_DOCUMENTS_DIR` | Optional | Override default `./data/raw`. |
| `PARSED_DOCUMENTS_DIR` | Optional | Override default `./data/parsed`. |

The `scripts/run-with-vercel-env.sh` helper wraps a command with `.vercel/.env.production.local` or `.vercel/.env.preview.local` automatically — useful for running migrations or persistence against the Neon production database with the same env Vercel uses.

## Local setup

### Prerequisites

- Python 3.11 (the expected interpreter for this package)
- Virtualenv support (`python3 -m venv`)
- Anthropic API key if you want to run `make analyze`
- Postgres (local via `docker-compose`, or remote via Neon) if you want to run `make persist-db`
- Playwright-installed Chromium if you want to use the browser fallback

### Bootstrap

From the repository root:

```bash
./scripts/bootstrap.sh          # create .venv and install services/pipeline[dev]
make test                       # pytest the package
make taxonomy                   # validate the label vocabulary
make sources                    # validate the source registry
```

This creates `services/pipeline/.venv/` with the package installed in editable mode. All pipeline commands should be run either via `make <target>` (which activates the venv for you) or from inside `services/pipeline/` with the venv activated.

Direct invocation pattern (what `make` targets do under the hood):

```bash
cd services/pipeline
. .venv/bin/activate
PYTHONPATH=src python -m observatory.cli <subcommand>
```

## The routine refresh loop

Intended cadence for keeping the corpus up to date:

```bash
# 1. Pull new candidates + re-download updated documents
make refresh

# 2. Re-parse anything that changed
make parse

# 3. Re-run Claude on new or updated parsed documents
make analyze

# 4. Push to the database
make persist-db        # or `make persist-prod` for Neon
```

`refresh` is idempotent: SHA-256 content tracking means unchanged documents are skipped. `parse` and `analyze` are also idempotent — they only process documents whose upstream artifact changed.

## Handling blocked sources

Some official portals are intermittently unreachable from the current environment. Two escape hatches are built in:

### Browser fallback

```bash
cd services/pipeline && . .venv/bin/activate
PYTHONPATH=src python -m observatory.cli fetch-seed-documents japan --refresh --with-browser
```

Uses Playwright Chromium (installed via `make browser-install`) to render the page fully before extracting. Works for JS-heavy portals like METI report indexes and `law.go.kr`.

### Manual local import

For documents you've downloaded manually:

```bash
PYTHONPATH=src python -m observatory.cli import-local-document \
  <jurisdiction> <document_id> <path-to-file>
```

This copies the file into `data/raw/<jurisdiction>/<doc_id>/` and writes a `retrieval_log.json` that marks the source as `manual_import`, preserving provenance in the repo. You can then `make parse && make analyze && make persist-db` as usual.

The blocked-source playbook with recovery procedures lives in [`docs/operations/blocked-source-playbook.md`](../../docs/operations/blocked-source-playbook.md).

## Testing

`pytest` suites under `tests/` cover each module. Run with:

```bash
make test
# or directly:
cd services/pipeline && . .venv/bin/activate && pytest
```

The CI workflow (`.github/workflows/ci.yml`) runs `validate-taxonomy` + `pytest` on every push and PR.

## Package layout

```
services/pipeline/
├── pyproject.toml
├── src/observatory/
│   ├── cli.py                 Typer entry — every make target dispatches here
│   ├── config/                settings + taxonomy loading
│   ├── sources/               source registry parsing + discovery scans
│   ├── fetch/                 HTTP client, retry, SHA-256, Playwright fallback
│   ├── parse/                 HTML / PDF / DOCX / HWPX normalizers
│   ├── analyze/               Anthropic structured-output client
│   ├── persist/               Postgres writer (machine_* + jurisdiction_*)
│   ├── aggregate/             Per-jurisdiction narrative aggregation
│   ├── reports/               Coverage, expansion, quality-audit reports
│   ├── taxonomy/              Label validation
│   └── utils/                 Shared helpers
└── tests/                     pytest modules (one per observatory submodule)
```

---

For the schema the pipeline writes into, see [`../../sql/migrations/README.md`](../../sql/migrations/README.md). For the data it produces, see [`../../data/README.md`](../../data/README.md). For the web app that consumes it, see [`../../apps/web/README.md`](../../apps/web/README.md).
