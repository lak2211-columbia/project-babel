# LLM Analysis & Parsing Workflow

The parsing and analysis stack (`parser.py` `0.3.0`, `prompts.py`, `analysis.py`, `models.py`) transforms saved raw government artifacts into schema-validated structured extractions and deterministic jurisdiction syntheses:

1. **`ParsedDocument` (Parser `0.3.0`)** — strictly offline HTML/PDF/HWPX/ODT extraction with legal-heading sectionizing (`Chapter`, `Article N`, `Section N`, `Annex`, `第N条`, `제N조`), PDF repeated header/footer stripping, compound-aware de-hyphenation, paragraph reflow, and explicit `extractor` provenance.
2. **`PolicyExtraction`** — issuing body, document type, binding strength, publication/effective dates, covered actors, application domains (10 labels), prohibited practices, concrete safety requirements (Taxonomy v2.1.0: 17 labels, each with optional deontic `obligation_strength`: `mandatory` | `conditional` | `recommended` | `aspirational`), enforcement mechanisms (9 labels), authorities, compliance deadlines, penalties summary, implementation notes, and required verbatim evidence spans (`>= 1` span per label).
3. **`RiskFramingAnalysis`** — dominant frame, secondary frames, complete eight-frame `frame_confidence` vector, optional explicit `frame_share` allocation summing to `~1.0`, rationale summary, and frame-tagged verbatim evidence spans.
4. **`JurisdictionAnalysis`** — deterministic per-jurisdiction narrative synthesis built strictly from saved document analyses (zero LLM calls) with jurisdiction-scoped institution alias canonicalization (e.g., `\bmost\b` and `State Council` restricted strictly to `china`).

## Model, codebook injection & prompt caching

Configured via `.env` or environment variables:

- `ANTHROPIC_API_KEY` — required for `analyze-documents`
- `ANTHROPIC_MODEL` — defaults to `claude-sonnet-4-6`
- `ANTHROPIC_EFFORT` — defaults to `low` (`low` / `medium` / `high`)

Execution guardrails in `ClaudeAPIClient` & `prompts.py`:

- **Single-source codebook injection:** `prompts.py` dynamically injects `definition`, `include_when`, and `exclude_when` from [`data/taxonomies/label-definitions.json`](../../data/taxonomies/label-definitions.json) directly into the extraction and framing prompts (shared verbatim with the web UI). Evidence is capped at 2 spans × 400 chars per label; framing spans carry explicit `frame` tags and an explicit `"No explicit framing language in this chunk."` escape for non-framing operative chunks.
- **Deterministic inference & extended budgets:** `temperature=0.0`, `600s` HTTP timeout, `POLICY_CONTROLS_MAX_TOKENS = 8192` with automatic 1× retry up to `16384` on `stop_reason == "max_tokens"`, HTTP `429`/`5xx`/`529` retries honoring `Retry-After`, and full exception detail (`Type: message`) recorded on failures.
- **Genuine dual-breakpoint Anthropic prompt caching:** Shares both `system_prefix` and `cached_document_context` with `cache_control: {"type": "ephemeral"}` across metadata, controls, and framing calls per chunk, recording `cache_read_input_tokens` and estimated USD cost in `analysis_metadata.usage`.
- **Strict legacy provenance guard:** `_analysis_currency_status()` never treats artifacts lacking `analysis_metadata` as current — it emits `stale_legacy_no_provenance` and queues them for re-analysis. When a document is skipped for low-fidelity parsed text, any stale `document_analysis.json` is deleted and `analysis_skipped.json` is honored by loaders.

## Token-aware full-context & chunk merging

- **Language-aware token budgets:** Budgets chunking by estimated tokens rather than raw characters (`~1.2` chars/token for CJK vs. `~3.8` chars/token for Latin; `90k` single-pass / `45k` chunk budgets) so long Chinese, Japanese, and Korean statutes never overflow the context window.
- **Hardened multi-chunk merging:**
  - Deduplicates overlap chunks that are strict subsets of the previous chunk.
  - Weights framing merges by framing-evidence strength (ignoring chunks with no framing language) rather than raw character length so operative clauses do not dilute recitals.
  - Aggregates rationale summaries and evidence spans across *all* chunks, not only opening chunks.
  - Computes informativeness-weighted metadata confidence instead of averaging over uninformed later chunks.
  - Requires `>= 1` grounded evidence span per merged requirement and preserves the strongest `obligation_strength`.

## Grounding verification & gold-set evaluation

All canonical quality thresholds are loaded from `data/taxonomies/label-definitions.json`:
- `grounding_pass_threshold: 0.90`
- `low_confidence_policy: 0.70`
- `low_confidence_framing: 0.60`
- `frame_mention_floor: 0.15`

- **NFKC & offset-persisted grounding (`check-grounding`):** Normalizes Unicode via NFKC, performs whitespace- and hyphen-insensitive + ordered-window matching, returns `None` (never `1.0`) when zero quotes exist, and persists per-span `grounding_status` (`verbatim` | `approximate` | `not_found`) plus `start_char` / `end_char` offsets directly into `EvidenceSpan`.
- **Gold-set evaluation (`evaluate-gold-set`):** Supports both bundle JSON files (such as the 5-document multilingual starter benchmark [`data/eval/gold_set_v1.json`](../../data/eval/gold_set_v1.json), `benchmark_status: "starter_v0.1_internal"`) and per-document directories. Reports micro/macro and per-label Precision/Recall/F1 (returning `None` on empty sets), Cohen's κ on dominant frame and binding strength, and seeded 95% bootstrap confidence intervals.

## Output artifacts & schema enforcement

Each analyzed document writes under `data/analysis/<jurisdiction>/<document_id>/`:

- `document_analysis.json` — validated by `validate-artifacts` against [`packages/schemas/document-analysis.schema.json`](../../packages/schemas/document-analysis.schema.json), including `analysis_metadata` (`AnalysisProvenance` with `analyzed_at`, model/prompt/taxonomy hashes, `chunked`/`chunk_count`, `usage`, and `grounding_summary`).
- `policy_extraction.json`, `risk_framing.json`, `policy_response.raw.json`, `framing_response.raw.json`.

## Commands

```bash
# Re-parse offline under Parser 0.3.0
make parse

# Analyze all stale/legacy/changed documents
make analyze
python -m observatory.cli analyze-documents european_union eu_ai_act_regulation_2024_1689 --refresh

# Deterministically refresh jurisdiction readouts (no LLM API calls)
make analyze-jurisdictions

# Audit NFKC/offset verbatim quote grounding (canonical 0.90 gate)
make grounding
python -m observatory.cli check-grounding south_korea --min-ratio=0.90 --json

# Validate all committed artifacts against packages/schemas/*.schema.json
make validate-artifacts

# Run starter multilingual gold-set evaluation
python -m observatory.cli evaluate-gold-set data/eval/gold_set_v1.json

# Persist v2 analyses idempotently to Postgres (refuses legacy artifacts unless --allow-legacy)
make persist-db
```
