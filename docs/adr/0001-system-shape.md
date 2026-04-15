# ADR 0001: System Shape

## Status

Accepted

## Context

The observatory needs a product surface, a multilingual analysis pipeline, and a clean path from raw government documents to reproducible research outputs.

## Decision

Use a mixed-stack monorepo:

- Python services for ingestion, normalization, extraction, and evaluation
- A future web app for exploration and analytics
- Canonical taxonomy and prompt assets stored in the repo
- Postgres as the system of record for normalized data

## Rationale

- Python is the pragmatic choice for document parsing and LLM-oriented evaluation workflows.
- A dedicated UI layer should not own analytical logic.
- Keeping prompts and taxonomies in-repo makes agentic work more reliable and auditable.
- Postgres fits the need for structured cross-country analytical queries.

## Consequences

- The repo needs clear boundaries between pipeline, UI, and shared contracts.
- Shared schemas should be versioned deliberately.
- Automated quality checks remain part of the product, not an afterthought.
