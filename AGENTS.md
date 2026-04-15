# Agent Guide

## Mission

Build the AI Governance Observatory as a research-grade platform for comparative AI governance analysis.

The repo has two primary analytical surfaces:

1. Structured policy extraction
2. Risk framing analysis

Every change should make one of these surfaces more reliable, more auditable, or easier to extend across jurisdictions.

## Read this first

1. `README.md`
2. `docs/product/brief.md`
3. `docs/architecture.md`
4. `docs/research/codebook.md`
5. `docs/operations/roadmap.md`

## Ground rules

- Treat `data/taxonomies/observatory-taxonomy.json` as the canonical label registry.
- Do not invent new framing labels or policy dimensions in code before updating the codebook and taxonomy.
- Prefer additive changes that preserve auditability over clever abstractions.
- Keep prompts versioned in `prompts/` and align them with the codebook.
- When you add a new pipeline stage, document its inputs, outputs, and review checkpoints.

## Repo shape

- `services/pipeline/` owns ingestion, parsing, extraction, scoring, and validation logic.
- `apps/web/` will own the analyst-facing product UI.
- `packages/schemas/` will hold shared schemas for cross-language contracts when the UI is implemented.
- `sql/migrations/` will own database evolution.

## Near-term priorities

1. Build a source registry and ingestion manifest format.
2. Add parsers for PDF, HTML, and official government web pages.
3. Persist normalized documents plus extracted records in Postgres.
4. Implement confidence scoring and human review queues.
5. Expose comparative analytics in the web app.

## Commands

- `./scripts/bootstrap.sh` sets up the Python environment.
- `make test` runs pipeline tests.
- `make taxonomy` validates the taxonomy file.

## Definition of done for analytical work

- Labels match the codebook.
- Outputs are reproducible from saved source material.
- Confidence signals are explicit.
- Review paths exist for uncertain cases.
- Cross-jurisdiction comparison remains possible without ad hoc cleanup.

