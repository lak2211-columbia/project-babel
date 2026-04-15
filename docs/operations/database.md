# Database Workflow

The observatory now has an initial Postgres schema for two distinct layers of state:

1. `documents`: normalized source metadata and parsed text
2. `machine_document_analyses`: model-generated policy and framing outputs plus normalized child labels
3. `machine_jurisdiction_analyses`: jurisdiction-level synthesized readouts derived from the saved document analyses

## Current tables

- `documents`
- `machine_document_analyses`
- `machine_application_domains`
- `machine_policy_requirements`
- `machine_enforcement_mechanisms`
- `machine_secondary_frames`
- `machine_frame_scores`
- `machine_jurisdiction_analyses`

## Commands

Apply migrations locally:

```bash
make migrate
```

Pull the current production environment from Vercel and apply migrations to Neon:

```bash
make vercel-pull-prod
make migrate-prod
```

Trim Neon back to the currently curated manifest set and reset jurisdiction rollups before replaying analyses:

```bash
make sync-prod-db
```

Run parsing and analysis with DB persistence enabled:

```bash
export DATABASE_URL=postgresql://<neon-connection-string-from-vercel>
make parse
make analyze
```

When `DATABASE_URL` is set, the analysis runner will continue writing filesystem artifacts and will also persist analyzed documents plus jurisdiction readouts into Postgres.

Replay saved analysis artifacts into Postgres without re-calling the model:

```bash
export DATABASE_URL=postgresql://<neon-connection-string-from-vercel>
make persist-db
```

Replay the saved corpus directly into the production Neon database:

```bash
make persist-prod
```

Scope the replay to one jurisdiction or one document:

```bash
PYTHONPATH=src python -m observatory.cli persist-analysis-artifacts european_union
PYTHONPATH=src python -m observatory.cli persist-analysis-artifacts european_union eu_ai_system_definition_guidelines
```

The pipeline now writes only machine outputs. Confidence scores remain in the stored analysis so downstream monitoring and evaluation can identify weak spots without requiring a human adjudication layer.

## Current read path

The web app in `apps/web` now uses the production Neon database as the authoritative read path on Vercel. Local fallback to filesystem or seed data remains available for interface work only when the app is not running in strict deployed mode.

## Current gaps

- no migration rollback workflow yet
- no precomputed analytics tables yet
