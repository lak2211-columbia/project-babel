# LLM Analysis Workflow

The analysis layer turns parsed source documents into two structured outputs and one derived jurisdiction artifact:

1. `PolicyExtraction`: what the document requires, who issued it, how binding it is, and how it is enforced.
2. `RiskFramingAnalysis`: the dominant and secondary reasons the document gives for governing AI.
3. `JurisdictionAnalysis`: a jurisdiction-level synthesis built from the saved document analyses, not from ad hoc UI logic.

`PolicyExtraction` now also reserves fields for:

- `covered_actors`
- `prohibited_practices`
- `enforcement_authorities`
- `compliance_deadlines`
- `penalties_summary`

## Default model

The primary model is Anthropic Sonnet 4.6, configured through:

- `ANTHROPIC_API_KEY`
- `ANTHROPIC_MODEL` with default `claude-sonnet-4-6`
- `ANTHROPIC_EFFORT` with default `low`

The runner is implemented in `services/pipeline/src/observatory/analysis.py` and uses Anthropic's Messages API with structured JSON-schema outputs.

## Execution flow

1. Read normalized documents from `data/parsed/<jurisdiction>/<document_id>/normalized.json`
2. Load prompt instructions from `prompts/structured_extraction.md` and `prompts/risk_framing_analysis.md`
3. Constrain responses with the observatory taxonomy
4. Validate model outputs against Pydantic schemas
5. Refresh jurisdiction synthesis under `data/analysis/jurisdictions/<jurisdiction>/`
6. Persist analysis artifacts under `data/analysis/<jurisdiction>/<document_id>/`
7. When `DATABASE_URL` is set, persist machine outputs to Postgres
8. When analyses already exist on disk, replay them into Postgres with `persist-analysis-artifacts`

## Output artifacts

Each analyzed document currently produces:

- `policy_extraction.json`
- `risk_framing.json`
- `document_analysis.json`
- `policy_response.raw.json`
- `framing_response.raw.json`

The raw response payloads are kept so we can audit prompt behavior and provider output formatting.

Each jurisdiction synthesis currently produces:

- `jurisdiction_analysis.json`
- `jurisdiction_input_digest.json`

## Jurisdiction synthesis stage

Inputs:

- Latest saved `document_analysis.json` artifacts for the jurisdiction
- Raw metadata dates and titles from `data/raw/.../metadata.json`

Outputs:

- A concise jurisdiction-specific readout for the UI
- Top requirement, enforcement, binding-strength, and framing mixes
- Key-source references with short contribution notes
- A saved input digest so the readout stays auditable

Review checkpoints:

- The narrative should stay faithful to the saved source corpus, not outside knowledge
- Labels in the mixes should come directly from the taxonomy-backed document analyses
- The key-source list should point to concrete analyzed documents in the jurisdiction
- Confidence should remain explicit at the jurisdiction level

## Current guardrails

- Taxonomy labels are enforced in the JSON schema before inference.
- Output validation rejects unexpected fields.
- The pipeline saves evidence snippets for both policy labels and framing labels.
- Analysis failures are surfaced per document without stopping the entire batch.

## Current gaps

- No automated quality dashboard yet
- No evaluation harness for extraction or framing quality yet
- No automatic retries, rate limiting, or backoff yet

## Commands

Analyze every parsed document:

```bash
make analyze
```

Refresh jurisdiction analyses from the saved document analyses:

```bash
cd services/pipeline
. .venv/bin/activate
PYTHONPATH=src python -m observatory.cli analyze-jurisdictions --refresh
```

Analyze one jurisdiction:

```bash
cd services/pipeline
. .venv/bin/activate
PYTHONPATH=src python -m observatory.cli analyze-documents japan
```

Analyze one document:

```bash
cd services/pipeline
. .venv/bin/activate
PYTHONPATH=src python -m observatory.cli analyze-documents japan jp_social_principles_human_centric_ai
```

Replay saved artifacts into Postgres:

```bash
cd services/pipeline
. .venv/bin/activate
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/observatory \
PYTHONPATH=src python -m observatory.cli persist-analysis-artifacts
```
