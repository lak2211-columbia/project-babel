# Database Workflow

Project Babel persists normalized documents, longitudinal content snapshots, structured extractions, and deterministic jurisdiction syntheses in Postgres (local Docker Postgres for offline dev, Neon Postgres in production).

## Migrations (`sql/migrations/`)

Applied in order via `migrate-db` (with Postgres advisory locking and migration checksum verification stored in `schema_migrations.checksum`):

1. `001_initial_observatory.sql` — `documents`, `machine_document_analyses`, and five normalized child label tables.
2. `002_remove_human_review.sql` — removes legacy human review/approval tables so the observatory stays purely machine-operated and reproducible.
3. `003_jurisdiction_analyses.sql` — adds `machine_jurisdiction_analyses`.
4. `004_observatory_hardening.sql` — adds:
   - `schema_migrations.checksum`
   - `documents` enrichment columns: `content_sha256`, `effective_date`, `publication_date_precision`, `source_tier`, `corpus_role`, `lifecycle_stage`, `sections_json`, `parser_warnings_json`
   - `machine_document_analyses` provenance columns: `content_sha256`, `taxonomy_version`, `grounding_ratio`
   - Longitudinal versioning table `document_snapshots` (`UNIQUE (document_id, content_sha256, parser_version)` + `(document_id, captured_at DESC)` index)
   - Foreign-key indexes on `machine_analysis_id` and deduplicated `UNIQUE` indexes on `(machine_analysis_id, label|frame)` across all five child tables
   - `[0, 1]` `CHECK` constraints on all confidence, score, and `grounding_ratio` columns
5. `005_authoritative_manifest_binding.sql` — adds:
   - `documents.binding_strength TEXT` — authoritatively populated from the jurisdiction seed manifest (Codebook §2), separated from model-extracted `policy_extraction.binding_strength`
   - `idx_machine_document_analyses_doc_updated` on `machine_document_analyses (document_id, updated_at DESC, id DESC)` so latest-analysis lookups always pick the most recently persisted row after upserts
   - `machine_policy_requirements.obligation_strength TEXT` with `CHECK (obligation_strength IS NULL OR obligation_strength IN ('mandatory', 'conditional', 'recommended', 'aspirational'))`
   - `machine_document_analyses.frame_shares_json JSONB` and `machine_document_analyses.analyzed_at TIMESTAMPTZ`

## Tables

- `schema_migrations` — applied SQL migration versions and SHA-256 checksums
- `documents` — active document registry (**121** documents), authoritative manifest `binding_strength`, metadata, normalized text, `sections_json`, and `parser_warnings_json` (POSIX repo-relative `normalized_text_path`)
- `document_snapshots` — append-only content snapshots keyed by `(document_id, content_sha256, parser_version)`
- `machine_document_analyses` — idempotently fingerprinted machine analyses (`analysis_fingerprint`), `taxonomy_version` (`"2.1.0"`), `analyzed_at`, `frame_shares_json`, `grounding_ratio` (`1.000` across all 121 committed docs), raw provider responses, and confidence metadata
- `machine_application_domains`
- `machine_policy_requirements` (with `obligation_strength`)
- `machine_enforcement_mechanisms`
- `machine_secondary_frames`
- `machine_frame_scores`
- `machine_jurisdiction_analyses` — deterministic jurisdiction syntheses (**5** jurisdictions; `analysis_fingerprint` excludes `generated_at` for true idempotency)

## Provenance honesty & idempotency guarantees

- **Zero fabricated provenance:** `persist-analysis-artifacts` reads `provider`, `model`, `effort`, `analyzed_at`, `analysis_version`, `taxonomy_version`, `taxonomy_hash`, `prompt_hashes`, and `content_sha256` strictly from `document_analysis.json`'s `analysis_metadata`. All **121/121** committed documents plus **5/5** jurisdiction syntheses pass strict `build_analysis_persistence_bundle(allow_legacy=False)` with **0 errors**. Legacy provenance-free artifacts remain refused (`LegacyProvenanceError`) unless `--allow-legacy` is explicitly passed.
- **Single-session batching:** `PostgresAnalysisStore` reuses a single database connection across batch runs and catches `psycopg.Error` per document.
- **Safe dates & paths:** Partial dates (`YYYY`, `YYYY-MM`) normalize cleanly into `DATE` + `publication_date_precision`; `normalized_text_path` always stores POSIX repo-relative paths.
- **Guarded manifest sync:** `sync-db-to-source-manifests` supports `--dry-run` and enforces `--max-delete-ratio` (default `0.20`, overrideable with `--force`). By default it does **not** pre-delete `machine_jurisdiction_analyses`.

## Commands

Apply migrations locally or against production Neon:

```bash
make migrate              # local DATABASE_URL
make vercel-pull-prod
make migrate-prod         # production Neon (applies 001–005)
```

Preview and execute manifest synchronization safely:

```bash
make sync-db-dry-run      # preview orphaned DB rows without deleting
make sync-db              # guarded local sync (max 20% delete ratio)
make sync-prod-db         # guarded production sync
```

Replay saved v2.1.0 analyses into Postgres without re-calling any LLM:

```bash
make persist-db           # local Postgres (strict allow_legacy=False; 121/121 docs + 5/5 jurisdictions)
make persist-prod         # production Neon

# Scoped replay
PYTHONPATH=services/pipeline/src python -m observatory.cli persist-analysis-artifacts european_union eu_ai_act_regulation_2024_1689
```

After updating production Neon rows, purge the web app's ISR cache via `POST /api/revalidate` (see [`vercel-launch.md`](vercel-launch.md)).

## Read path

`apps/web` queries Neon Postgres ordering latest analyses by `m.updated_at DESC, m.id DESC` (supported by `idx_machine_document_analyses_doc_updated`), selects migration `004`/`005` columns (`documents.binding_strength`, `grounding_ratio`, `taxonomy_version`, `publication_date_precision`, `frame_shares_json`, `analyzed_at`, and lateral `obligation_strengths_json` over `machine_policy_requirements`, plus `sections_json` and `parser_warnings_json`) with graceful `42703` fallback for earlier schemas, and refuses to serve fake `seedData` when `VERCEL_ENV` is set and Neon is empty or unreachable.
