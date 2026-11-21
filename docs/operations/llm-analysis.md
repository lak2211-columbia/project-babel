# LLM Analysis & Parsing Workflow

The parsing and analysis stack (`parser.py` `0.3.0`, `prompts.py`, `analysis.py`, `models.py`) transforms saved raw government artifacts into schema-validated structured extractions and deterministic jurisdiction syntheses:

1. **`ParsedDocument` (Parser `0.3.0` + PyMuPDF)** — strictly offline HTML/PDF/HWPX/ODT extraction using **`pymupdf` (`fitz`) as the primary PDF extractor** (`pdftotext`/`pypdf` fallback), legal-heading sectionizing (`Chapter`, `Article N`, `Section N`, `Annex`, `第N条`, `제N조`), PDF repeated header/footer stripping (preserving top-of-page legal headings), compound-aware de-hyphenation, paragraph reflow, CAC (`cac.gov.cn`) and Korean `law.go.kr` (`#hisComment` & `.cont_subtit`) boilerplate stripping, and explicit `extractor` provenance (`93 pymupdf`, `48 beautifulsoup4`, `3 hwpx_xml` across the 144-document corpus).
2. **`PolicyExtraction`** — issuing body, document type, binding strength, publication/effective dates, covered actors, application domains (10 labels), prohibited practices, concrete safety requirements (Taxonomy v2.1.0: 17 labels, each with optional deontic `obligation_strength`: `mandatory` | `conditional` | `recommended` | `aspirational`), enforcement mechanisms (9 labels), authorities, compliance deadlines, penalties summary, implementation notes, and required verbatim evidence spans (`>= 1` span per label).
3. **`RiskFramingAnalysis`** — dominant frame, secondary frames, complete eight-frame `frame_confidence` vector, compositional `frame_share` allocation summing to `~1.0`, rationale summary, and frame-tagged verbatim evidence spans.
4. **`JurisdictionAnalysis`** — deterministic sovereign per-jurisdiction narrative synthesis built strictly from saved document analyses (zero LLM calls; strictly excluding `corpus_role == "subnational_overlay"` by default so the 6 opt-in U.S. state statutes never pollute federal summaries) with jurisdiction-scoped institution alias canonicalization (e.g., `\bmost\b` and `State Council` restricted strictly to `china`).

## Multi-provider frontier engine & concurrency

Configured via `.env` or environment variables (or CLI flags `--provider`, `--model`, `--effort`, `--workers`):

- **`LLM_PROVIDER`** — `auto` (default: selects `gemini` if `GEMINI_API_KEY` is set, else `anthropic`), `gemini`, or `anthropic`
- **Primary provider (`GeminiAPIClient`, default):**
  - `GEMINI_API_KEY` (sent via `x-goog-api-key` header, redacted on errors, never persisted)
  - `GEMINI_MODEL` — defaults to **`gemini-4-neon`** (1M-token context window; `GEMINI_DIRECT_FULL_TEXT_MAX_TOKENS = 450_000` enables single-pass full-document extraction even on the 581,688-character EU AI Act with zero chunking loss)
  - `GEMINI_THINKING_LEVEL` — `low` / `medium` (default) / `high`
  - Handles thinking models cleanly: filters `thought` parts before JSON parsing, enforces `temperature=0.0` + `responseMimeType: "application/json"`, retries `finishReason == "MAX_TOKENS"` by escalating `maxOutputTokens` (`16384→32768→65536`), retries HTTP `408/425/429/500/502/503/504` with `Retry-After` + `600s` timeout, and records `usageMetadata` (`promptTokenCount`, `candidatesTokenCount`, `thoughtsTokenCount`, `cachedContentTokenCount`)
- **Fallback provider (`ClaudeAPIClient`):**
  - `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (defaults to **`claude-opus-5-5`**), `ANTHROPIC_EFFORT` (`low` / `medium` / `high`)
  - Uses sequential dual-breakpoint prompt caching (byte-identical `system` + `messages[0].content[0]` across all 3 chunk calls), `8192→16384` controls token escalation, `600s` timeout, and HTTP `429`/`5xx`/`529` retries
- **Zero-cost verified ingestion (`ingest-document-analysis`):**
  - Ingests externally produced or harness-evaluated v2.1.0 JSON payloads (`{"policy_extraction": ..., "risk_framing": ...}`) through full taxonomy validation, NFKC verbatim snapping (`snap_to_verbatim=True`), strict `--min-grounding` gating (default `0.90`), and full `AnalysisProvenance` stamping
- **Bounded concurrency & atomic writes:**
  - `analyze-documents --workers N` (default `1`, safe up to `8`) uses `ThreadPoolExecutor` with thread-safe logging and atomic temp-file + `os.replace` writes

## Codebook injection, chunking & provenance guards

- **Single-source codebook injection:** `prompts.py` dynamically injects `definition`, `include_when`, and `exclude_when` from [`data/taxonomies/label-definitions.json`](../../data/taxonomies/label-definitions.json) directly into extraction and framing prompts (shared verbatim with the web UI). Evidence is capped at 2 spans × 400 chars per label; framing spans carry explicit `frame` tags and a `"No explicit framing language in this chunk."` escape for operative chunks.
- **Language-aware token budgets:** For documents exceeding a provider's direct window (e.g., Anthropic's `90k` single-pass / `45k` chunk budgets; Gemini runs single-pass up to `450k` tokens), chunking estimates CJK (`~1.2` chars/tok) vs. Latin (`~3.8` chars/tok) tokens, deduplicates subset overlap chunks, weights framing merges by framing-evidence strength, aggregates rationales across all chunks, and requires `>= 1` grounded span per merged requirement.
- **Strict legacy provenance guard:** `_analysis_currency_status()` rejects artifacts lacking `analysis_metadata` (`stale_legacy_no_provenance`); low-fidelity skips delete stale `document_analysis.json` and honor `analysis_skipped.json`.

## Grounding verification & 25-document blind gold-set evaluation

All canonical quality thresholds load from `data/taxonomies/label-definitions.json` (`grounding_pass_threshold: 0.90`, `low_confidence_policy: 0.70`, `low_confidence_framing: 0.60`, `frame_mention_floor: 0.15`):

- **NFKC verbatim snapping & offset persistence (`check-grounding`):** Normalizes Unicode via NFKC, performs whitespace/hyphen-insensitive + ordered-window matching, snaps near-verbatim quotes back to exact `plain_text` substrings, returns `None` (never `1.0`) when zero quotes exist, and persists `grounding_status` (`verbatim` | `approximate` | `not_found`) + `start_char`/`end_char` into every `EvidenceSpan`.
  - **Current verified corpus (144/144 `gemini-4-neon`, Taxonomy v2.1.0, `analysis_version: "0.3.0"`):** **`2,786 / 2,786` (`100.0%`) exact verbatim grounding**, `0` ungrounded, `flagged = 0`, `min_per_doc = 100.0%`.
- **25-document stratified multilingual blind gold-set benchmark (`evaluate-gold-set data/eval/gold_set_v2.json`, `n=25`, `5 × 5` across EN/KO/JA/ZH, `stratified_v1.0_blind_internal`):**
  - Every document coded strictly blind from its full `normalized.json` text without consulting `data/analysis/` (spanning all `6/6` binding strata, all `17/17` v2.1 requirements, and all `8/8` active enforcement mechanisms). Persisted in [`data/eval/gold_set_results.json`](../../data/eval/gold_set_results.json) and mirrored byte-identically to [`apps/web/src/lib/gold-set-results.snapshot.json`](../../apps/web/src/lib/gold-set-results.snapshot.json) for `/methodology#validation`:
  - **Policy requirements:** Micro F1 **`0.899`** (`P=0.876`, `R=0.923`, 95% CI `[0.850, 0.936]`) | Macro F1 **`0.887`**
  - **Enforcement mechanisms:** Micro F1 **`0.954`** (`P=0.947`, `R=0.960`, 95% CI `[0.918, 0.982]`) | Macro F1 **`0.964`**
  - **Dominant risk frame:** Accuracy **`0.800`** (`20/25`) | **Cohen's κ = `0.747`** | **Nominal Krippendorff's α = `0.748`** (`[0.510, 0.901]`)
  - **Binding strength:** Accuracy **`0.920`** (`23/25`) | **Cohen's κ = `0.891`** | **Nominal Krippendorff's α = `0.893`**
  - **Multilingual `by_jurisdiction` (Req F1 / Enf F1):** `US 0.913 / 0.917` · `EU 0.912 / 1.000` · `KR 0.923 / 0.944` · `JP 0.820 / 0.933` · `CN 0.911 / 0.947`.

## Commands

```bash
# Re-parse offline under Parser 0.3.0 (PyMuPDF primary PDF)
make parse

# Run concurrent Gemini 4 Neon analysis (default provider when GEMINI_API_KEY is set)
PYTHONPATH=services/pipeline/src python -m observatory.cli analyze-documents \
  --provider gemini --model gemini-4-neon --effort medium --workers 6

# Or run Anthropic fallback on one document
PYTHONPATH=services/pipeline/src python -m observatory.cli analyze-documents \
  european_union eu_ai_act_regulation_2024_1689 --provider anthropic --model claude-opus-5-5 --refresh

# Ingest & verbatim-snap an offline/harness JSON analysis
PYTHONPATH=services/pipeline/src python -m observatory.cli ingest-document-analysis \
  united_states us_eo_14409_advanced_ai_innovation_security_2026 /path/to/payload.json \
  --provider=gemini --model=gemini-4-neon --effort=xhigh --min-grounding=0.90

# Deterministically refresh sovereign jurisdiction readouts (no LLM API calls)
make analyze-jurisdictions

# Audit grounding, 25-doc gold set v2, freshness, and Draft 2020-12 schemas
make grounding
PYTHONPATH=services/pipeline/src python -m observatory.cli evaluate-gold-set \
  data/eval/gold_set_v2.json --output-json data/eval/gold_set_results.json
make freshness
make validate-artifacts

# Replay verified v2.1 analyses idempotently into Postgres
make persist-db
```
