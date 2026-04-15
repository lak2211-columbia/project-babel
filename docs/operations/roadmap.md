# Roadmap

## Phase 0: Research design and codebook

Deliverables:

- Stable taxonomy
- Framing codebook
- Prompt assets
- Initial schema design

## Phase 1: Source registry

Deliverables:

- Jurisdiction registry
- Source manifest format
- Raw document storage convention
- Document parsing pipeline for PDF and HTML

## Phase 2: Analytical extraction

Deliverables:

- Structured extraction job
- Risk framing job
- Confidence scoring
- Review queue specification

## Phase 3: Database and analytics

Deliverables:

- Postgres schema
- Load jobs
- Derived analytical tables
- Divergence index prototype

## Phase 4: Product interface

Deliverables:

- Searchable document explorer
- Country comparison views
- Time-series framing views
- Divergence index dashboard

## Phase 5: Evaluation and publication

Deliverables:

- Gold-label evaluation set
- Extraction and framing quality reports
- Research memo or paper-ready export workflow

## First implementation slice

The highest-leverage first slice is:

1. Add a manifest for official documents in one jurisdiction.
2. Parse and normalize those documents.
3. Run extraction and framing on a small sample.
4. Review outputs manually.
5. Use the results to harden the taxonomy before scaling.

