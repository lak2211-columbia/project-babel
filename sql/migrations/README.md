# SQL Migrations

Migrations are applied by the pipeline CLI:

```bash
make migrate
```

The migration runner acquires a Postgres transaction advisory lock (`pg_advisory_xact_lock`), records applied files and their SHA-256 checksums in `schema_migrations`, verifies that previously applied migration files have not been modified, and executes each `.sql` file in lexical order.

Each migration file must separate statements with:

```sql
-- statement-break
```

## Migration history

- `001_initial_observatory.sql`: Initial `documents`, `machine_document_analyses`, and normalized child tables (`machine_application_domains`, `machine_policy_requirements`, `machine_enforcement_mechanisms`, `machine_secondary_frames`, `machine_frame_scores`).
- `002_remove_human_review.sql`: Drops legacy human-review tables and review-flag column so the schema stays aligned with the automated pipeline.
- `003_jurisdiction_analyses.sql`: Adds `machine_jurisdiction_analyses` for synthesized jurisdiction-level readouts.
- `004_observatory_hardening.sql`: Adds missing foreign-key indexes, composite unique constraints, and `[0, 1]` check constraints across all child tables; extends `documents` with `content_sha256`, `effective_date`, `publication_date_precision`, `source_tier`, `corpus_role`, `lifecycle_stage`, `sections_json`, and `parser_warnings_json`; extends `machine_document_analyses` with `content_sha256`, `taxonomy_version`, and `grounding_ratio`; adds `document_snapshots` for longitudinal text versioning; adds `schema_migrations.checksum`.
- `005_authoritative_manifest_binding.sql`: Adds authoritative manifest `documents.binding_strength`; adds `idx_machine_document_analyses_doc_updated` on `(document_id, updated_at DESC, id DESC)` for deterministic latest-analysis lookup; adds `machine_policy_requirements.obligation_strength` with check constraint; adds `machine_document_analyses.frame_shares_json` and `analyzed_at`.
