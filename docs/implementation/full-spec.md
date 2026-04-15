# Full Implementation Spec

## Product objective

Build a research-grade platform that lets analysts compare AI governance across jurisdictions along two axes:

1. Policy structure: what rules, obligations, and enforcement mechanisms a jurisdiction uses
2. Risk framing: why the jurisdiction says AI governance is necessary

The system should support reproducible ingestion, conservative machine-assisted classification, automated quality monitoring, and analytical comparison over time.

## Core user journeys

### Research analyst

- Search official documents by jurisdiction, issuing body, date range, and document type
- Read a normalized summary of the document plus quoted evidence
- Compare safety requirements across countries and years
- Compare dominant and secondary risk framings across countries and years
- Inspect the divergence index and drill into what drives it

### Research lead

- Track coverage gaps by jurisdiction and source type
- Monitor extraction quality and framing consistency
- Export publication-ready tables, charts, and evidence bundles

## Scope

### In scope for v1

- Five jurisdictions: United States, European Union, South Korea, Japan, China
- Official primary-source documents
- Structured extraction with evidence spans
- Framing analysis with dominant and secondary frames
- Divergence index based on policy structure and framing distributions
- Analyst-facing web app for browsing and comparison

### Out of scope for v1

- News and commentary ingestion
- Forecasting or scenario simulation
- Full multilingual translation workflow beyond what is needed for extraction
- Automatic public release without quality checks

## Functional requirements

### 1. Source registry

The system must:

- Register each source with stable source and document identifiers
- Store canonical metadata: title, issuer, jurisdiction, source URL, publication date, language, acquisition timestamp
- Preserve raw artifacts and parsed text
- Track source provenance and retrieval status

### 2. Parsing and normalization

The system must:

- Ingest PDF, HTML, and plain-text sources
- Produce normalized plain text with section boundaries where possible
- Preserve language metadata
- Store parsing warnings and OCR flags

### 3. Structured policy extraction

The system must:

- Classify document type and binding strength
- Extract safety requirements and enforcement mechanisms
- Capture covered application domains
- Save evidence spans and confidence scores
- Avoid unsupported inference when the source is ambiguous

### 4. Risk framing analysis

The system must:

- Assign one dominant frame and optional secondary frames
- Save confidence by frame
- Save evidence spans that justify the framing
- Preserve rationale summaries

### 5. Automated quality workflow

The system must:

- Flag low-confidence outputs for monitoring and follow-up
- Preserve machine outputs alongside prompt and taxonomy versions
- Support reruns when prompts or taxonomy versions change
- Expose confidence and evidence quality signals to analysts

### 6. Comparative analytics

The system must:

- Aggregate outputs by jurisdiction and time period
- Compare safety requirement distributions
- Compare framing distributions
- Calculate a divergence index with separate policy and framing components
- Show the evidence that underlies a divergence score

## Non-functional requirements

- Reproducibility: every analytical result must point back to a saved source and versioned prompt/taxonomy
- Auditability: machine outputs, prompts, and taxonomy versions must remain traceable
- Extensibility: adding a new jurisdiction should mostly require taxonomy or source configuration, not rewrites
- Conservative automation: uncertain extraction should surface uncertainty rather than overfit
- Performance: analyst pages should feel fast on precomputed aggregates and focused queries

## Proposed architecture

### Pipeline services

- `source_registry`: manifests, acquisition metadata, and coverage tracking
- `parser`: raw artifact ingestion, OCR hooks, section-aware text normalization
- `extractor`: structured policy extraction
- `framing`: risk framing analysis
- `review`: review-task creation and approval state management
- `analytics`: divergence calculations and precomputed comparison tables

### Storage

- Raw artifacts on disk or object storage
- Postgres for normalized records and review history
- Optional vector or full-text index later if document search needs semantic retrieval

### Web app

- Next.js App Router
- Server-rendered analytical pages backed by typed data contracts
- Visual comparison components with evidence drill-down

## Proposed data model

### `sources`

- `id`
- `jurisdiction`
- `issuing_body`
- `source_url`
- `language`
- `publication_date`
- `retrieved_at`
- `document_type_hint`
- `status`

### `documents`

- `id`
- `source_id`
- `title`
- `raw_artifact_path`
- `normalized_text_path`
- `translation_text_path`
- `parser_version`
- `taxonomy_version`
- `prompt_version`

### `policy_extractions`

- `id`
- `document_id`
- `binding_strength`
- `document_type`
- `effective_date`
- `confidence`
- `status`

### `policy_requirement_labels`

- `id`
- `policy_extraction_id`
- `label`
- `confidence`
- `evidence_span`

### `enforcement_labels`

- `id`
- `policy_extraction_id`
- `label`
- `confidence`
- `evidence_span`

### `framing_analyses`

- `id`
- `document_id`
- `dominant_frame`
- `rationale_summary`
- `status`

### `framing_scores`

- `id`
- `framing_analysis_id`
- `frame`
- `score`
- `evidence_span`

### `reviews`

- `id`
- `document_id`
- `review_type`
- `status`
- `assigned_to`
- `notes`
- `resolved_at`

## Pipeline contract

Each pipeline stage should read a typed input and emit a typed output plus metadata:

- input identifiers
- model or parser version
- prompt version
- start and end timestamps
- warnings
- confidence summary

## Confidence and review thresholds

Initial thresholds:

- `>= 0.85`: auto-accept candidate output, still editable
- `0.60 - 0.84`: accept as draft and queue for review
- `< 0.60`: block from publication and require review

These thresholds should be configurable per task family because framing classification and requirement extraction will likely have different error profiles.

## Divergence index specification

### Policy divergence component

Measure differences across jurisdictions using:

- binding strength distributions
- safety requirement label distributions
- enforcement mechanism distributions
- application-domain coverage

### Framing divergence component

Measure differences across jurisdictions using:

- dominant frame distributions
- secondary frame co-occurrence
- frame intensity or confidence-weighted mixes

### Composite divergence index

Start with a transparent weighted sum:

- `0.6 * policy_divergence`
- `0.4 * framing_divergence`

Expose the components separately so analysts can challenge the weighting rather than treating the composite as magic.

## API and page surface

### Initial pages

- Overview dashboard
- Jurisdiction comparison
- Document explorer
- Document detail page
- Review queue

### Initial API contracts

- `GET /api/overview`
- `GET /api/jurisdictions`
- `GET /api/jurisdictions/:id`
- `GET /api/documents`
- `GET /api/documents/:id`
- `GET /api/reviews`

## Seed dataset for UI-first development

Before the live pipeline exists, the web app may read from local seed files shaped like final contracts. This allows early UI development without coupling to unfinished ingestion code.

## Delivery sequence

1. Finalize taxonomy and manifest format
2. Implement source registry and document parsing
3. Add extraction and framing jobs with saved outputs
4. Add Postgres schema and persistence
5. Compute first divergence metrics
6. Build dashboard and document explorer
7. Build analyst-facing detail and comparison views
8. Add evaluation set and quality reporting

## Acceptance criteria for v1

- At least one complete document set per target jurisdiction is ingested
- Every published label has evidence and provenance
- Analysts can compare jurisdictions by policy and framing
- Confidence signals are visible for uncertain outputs
- Divergence metrics are reproducible from stored inputs
