# SQL Migrations

Migrations are applied by the pipeline CLI:

```bash
make migrate
```

The migration runner records applied files in `schema_migrations` and executes each `.sql` file in lexical order.

Each migration file must separate statements with:

```sql
-- statement-break
```

That keeps the in-repo runner simple and deterministic without introducing a full migration framework yet.

The initial schema covers:

- `documents`
- `machine_document_analyses`
- normalized machine label tables for requirements, enforcement, domains, and frames

Migration `002_remove_human_review.sql` drops the legacy human-review tables and review flag column so the schema stays aligned with the fully automated pipeline.
