# System Architecture

## Product layers

### 1. Source registry and ingestion

The platform starts from official source documents:

- Government websites
- Legislative texts
- Regulatory guidance
- Strategy documents
- Standards or voluntary commitments from public institutions

Core outputs:

- Source metadata
- Raw artifact storage
- Parsed plain text
- Language and translation metadata

### 2. Structured extraction pipeline

Each parsed document is analyzed for:

- Jurisdiction
- Issuing body
- Document type
- Binding strength
- Effective dates
- Covered AI applications
- Safety requirements
- Enforcement mechanism
- References to standards, audits, testing, disclosure, or incident reporting

This layer produces normalized records that can be compared across jurisdictions and time.

### 3. Risk framing analysis pipeline

The same document is separately scored for its dominant and secondary framings:

- Existential or catastrophic risk
- National security
- Economic competitiveness
- Fundamental rights and civil liberties
- Social stability and public order
- Innovation enablement
- Consumer or public safety
- Labor and economic transition

This layer should preserve:

- Per-frame confidence scores
- Representative evidence spans
- Dominant frame
- Secondary frames

### 4. Automated quality gates

Low-confidence outputs should be flagged for follow-up, but the platform should stay fully machine-operated. Confidence scores and validation checks should inform monitoring, not a human approval queue.

### 5. Jurisdiction synthesis layer

After document-level extraction and framing run, the platform should derive a jurisdiction-level readout from the saved machine analyses. This layer should stay reproducible from saved artifacts rather than introducing analyst-only summary text.

Core outputs:

- Jurisdiction-specific narrative summary
- Binding-strength and document-type mix
- Dominant requirements and enforcement hooks
- Framing landscape grounded in the current corpus
- Key-source shortlist with contribution notes

### 6. Analytical serving layer

The product UI should query:

- Documents
- Extracted policy requirements
- Risk framing scores
- Jurisdiction snapshots
- Jurisdiction analyses
- Divergence index views

## Proposed technical shape

- Database: Postgres for normalized analytical data
- Pipeline: Python for ingestion, parsing, extraction, and evaluation
- UI: Next.js app for comparative analysis and search
- Shared contracts: schemas versioned in-repo

## Data flow

1. Register a source document.
2. Store raw artifact and parsed text.
3. Run structured extraction.
4. Run framing analysis.
5. Refresh jurisdiction synthesis from the saved document analyses.
6. Score confidence and flag uncertain outputs.
7. Persist machine outputs.
8. Refresh analytical views and derived divergence metrics.
