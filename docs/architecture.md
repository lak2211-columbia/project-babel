# System Architecture

Project Babel is a single-repository, three-layer comparative AI governance observatory governed by nine Draft 2020-12 JSON Schema contracts (`packages/schemas/`), **Taxonomy v2.1.0** (`data/taxonomies/observatory-taxonomy.json`), and a single machine-readable label definitions file (`data/taxonomies/label-definitions.json`).

## Product layers

### 1. Source registry, discovery, freshness watch & SSRF-hardened retrieval

Official government sources are registered in per-jurisdiction manifests (`data/sources/<jurisdiction>.json`) validated against `packages/schemas/source-manifest.schema.json` (**61** portals, **144** documents: **138** sovereign + **6** opt-in U.S. state `subnational_overlay` statutes carrying `subnational_unit`, and **12** `supersedes_id` amendment lineage chains).

- **Source portals, discovery & weekly freshness watch:** Configured official portals (legal registries, ministries, safety institutes, standards bodies) support HTML link and recursive `sitemap`/`sitemapindex` discovery with optional Playwright rendering. Automated weekly drift checks run via `observatory check-freshness` (`make freshness`) and `.github/workflows/freshness-watch.yml` (Monday `06:00 UTC` + manual dispatch) using polite SSRF-validated conditional `HEAD`/`GET` probes without mutating raw artifacts or spending LLM tokens.
- **End-to-end SSRF & SPA safety:** `url_safety.py` enforces `http`/`https` schemes and globally routable IPs (`is_global`, blocking loopback, RFC1918, CGNAT `100.64.0.0/10`, link-local, multicast, and shorthand IPv4 literals across redirect hops); Playwright enforces `context.route("**/*", ...)` on every sub-request. Selector-aware SPA-overwrite protection (`#bodyContent`), `%PDF-` magic-byte verification, HTTP status checks, and conditional `ETag`/`Last-Modified` prevent empty shells or error pages from corrupting raw artifacts.
- **Cross-platform reproducibility:** `.gitattributes` keeps `data/raw/**` binary (`-text`) and text/JSON/SQL/code `eol=lf`; all Python writes pass `newline="\n"`; all stored paths use `repo_rel_posix()`.

### 2. Offline section-aware parsing (`Parser 0.3.0`)

`parse-raw-documents` is strictly offline and deterministic — zero live network imports or calls.

- **Primary PDF extraction (`pymupdf`) & fallbacks:** Uses PyMuPDF (`pymupdf`) as the primary PDF extractor (with `pdftotext`/`pypdf` fallback), alongside HTML (`beautifulsoup4`), HWPX (`hwpx_xml`), and ODT readers, recording explicit `extractor` provenance across all 144 documents (`93 pymupdf`, `48 beautifulsoup4`, `3 hwpx_xml`; `0` short or wiped documents).
- **Legal-heading sectionizer:** Splits statutory texts on `Chapter`, `Article N`, `Section N`, `Annex`, `第N条`, and `제N조` boundaries (prose-safe).
- **PDF normalization:** Strips repeated running headers/footers (preserving top-of-page legal headings), de-hyphenates wrapped words, and reflows paragraphs.
- **Multilingual HTML & dates:** Clean CJK charset detection, nested block deduplication, NIST `.gov`, China CAC (`cac.gov.cn` top-nav/breadcrumb/footer), and Korean `law.go.kr` (`#hisComment` & `.cont_subtit` contact chrome) boilerplate stripping, and ISO/CJK/Japanese era date parsing.

### 3. Codebook-injected extraction & risk framing pipeline

Each normalized document is analyzed independently along two surfaces using a multi-provider frontier structured-extraction layer (`analysis_version: "0.3.0"`, `temperature=0.0`, `600s` timeout, `8192→16384` controls token retry):

- **Providers & zero-cost ingestion:** Defaults to **Google Gemini** (`GeminiAPIClient`, default `gemini-4-neon`, `thinking_level=medium`/`xhigh`) with **Anthropic Claude** (`ClaudeAPIClient`, default `claude-opus-5-5`, `effort=low`/`medium`/`high`, genuine dual-breakpoint prompt caching, HTTP `529`/`Retry-After` resilience) as an alternate provider (`LLM_PROVIDER=auto|gemini|anthropic`), plus `ingest-document-analysis` for schema-validated, NFKC-grounding-gated (`--min-grounding=0.90`) offline ingestion.
- **Single-source codebook prompts:** `prompts.py` dynamically injects `definition`, `include_when`, and `exclude_when` from `data/taxonomies/label-definitions.json`.
- **Policy extraction (`PolicyExtraction`):** Authoritative policy controls across 17 requirements (with deontic `obligation_strength` and required `>= 1` verbatim evidence span), 9 enforcement mechanisms, 10 application domains, actors, deadlines, and penalties.
- **Risk framing (`RiskFramingAnalysis`):** Dominant frame, secondary frames, complete 8-frame `frame_confidence` vector, `frame_share` summing to `~1.0`, rationale summary, and frame-tagged verbatim spans (`quote` + optional `quote_en`).
- **Token-aware CJK/Latin chunking:** Budgets by estimated tokens (`~1.2` chars/tok CJK vs. `~3.8` chars/tok Latin; `90k`/`45k` budgets) with evidence-weighted framing merges, subset-chunk deduplication, and multi-chunk grounded-span verification.

### 4. Automated quality gates, grounding & gold-set evaluation

Project Babel is machine-operated without a human approval queue:

- **Schema & provenance guards:** `validate-artifacts` validates all **156** committed corpus artifacts (`1` taxonomy, `1` label-definitions, `5` source manifests, `144` document analyses, `5` jurisdiction analyses) against `packages/schemas/*.schema.json` with `0` errors; `_analysis_currency_status()` flags legacy provenance-free files (`stale_legacy_no_provenance`); `persist-analysis-artifacts` refuses to fabricate provenance (`LegacyProvenanceError` unless `--allow-legacy`). The committed 144-document corpus is 100% homogeneous **Taxonomy v2.1.0** (`analysis_version: "0.3.0"`, `provider: "gemini"`, `model: "gemini-4-neon"`, `0` legacy rows).
- **NFKC offset grounding (`check-grounding`):** Persists `grounding_status` (`verbatim` | `approximate` | `not_found`) and `start_char`/`end_char` offsets against `normalized.json` using the canonical `0.90` gate (`None` on zero quotes). The committed 144-document corpus achieves **`2,786 / 2,786` (`100.0%`)** exact verbatim grounding (`flagged = 0`).
- **Gold-set evaluation (`evaluate-gold-set`):** Scores extraction/framing against the 25-document stratified multilingual blind benchmark `data/eval/gold_set_v2.json` (`stratified_v1.0_blind_internal`, `5 × 5` across EN/KO/JA/ZH) with per-label P/R/F1, `by_jurisdiction` breakdowns, Cohen's κ, nominal Krippendorff's α, and seeded 95% bootstrap CIs, persisting machine-readable output via `--output-json=data/eval/gold_set_results.json` (mirrored byte-identically to `apps/web/src/lib/gold-set-results.snapshot.json` and rendered live on `/methodology#validation`).
- **Corpus quality audits (`report-source-quality-audit`):** Flags SPA shells, mojibake, zero-AI-keyword docs, zero-quote analyses, duplicate SHA-256s, and CJK-aware text length.

### 5. Deterministic jurisdiction synthesis

`analyze-jurisdictions` derives reproducible sovereign jurisdiction readouts purely from saved document analyses (excluding `corpus_role == "subnational_overlay"` by default so the 6 opt-in U.S. state statutes never pollute federal summaries) with jurisdiction-scoped institution alias canonicalization (`\bmost\b` / `State Council` strictly China-only), active statutory anchors ranked ahead of FAQs/drafts, and idempotent fingerprints excluding `generated_at`.

### 6. Postgres persistence (`001`–`005`) & analytical serving layer

- **Database (Neon Postgres):** Migrations `001`–`005` store `documents` (with authoritative manifest `binding_strength`, `content_sha256`, `effective_date`, `publication_date_precision`, `source_tier`, `corpus_role` incl. `subnational_overlay`, `lifecycle_stage`, `raw_metadata_json` carrying `subnational_unit` & `supersedes_id`, `sections_json`, `parser_warnings_json`), longitudinal `document_snapshots`, `machine_document_analyses` (`updated_at DESC, id DESC` index, `frame_shares_json`, `analyzed_at`, `grounding_ratio`, `taxonomy_version`), indexed/constrained child tables (incl. `obligation_strength`), and `machine_jurisdiction_analyses`.
- **Web app (`apps/web/`, Next.js 16, Node 22+):** ISR caching (`revalidate = 3600`, tag `"observatory"`, `POST /api/revalidate`), CORS read APIs (`s-maxage=300, stale-while-revalidate=60`), strict `VERCEL_ENV` empty-DB refusal (never serving fake `seedData`), Postgres queries wired to Migration `005` `frame_shares_json`, lateral `obligation_strengths_json`, and `raw_metadata` (`subnational_unit`, `supersedes_id`), dynamic provider/model provenance (`formatModelDisplayName()`, `humanizeProseTaxonomyKeys()`, verified cyan `v2.1` strip), live 25-doc gold-set v2 scorecard & freshness ledger (`eval-parser.ts` / `eval-data.ts`), pure statistical engine (`headline` `91` active primary sovereign vs. `all` `138` sovereign / `144` with opt-in `?states=1`, multi-dimensional `POL`, `frame_share` / sub-`0.15` noise-filtered `FRM`, Regime Coverage `COV L1`, deterministic 200-resample bootstrap 90% CIs, 200-draw permutation null calibration, 4-spec sensitivity & Spearman `ρ`), collision-free 2D Decoupling Map, `/matrix`, **`/clauses` + `/api/clauses`** (across `2,786` verbatim quotes), **`/evolution` + `/api/evolution`** (`2019–2026` trajectories & `12` `supersedes_id` diffs), label-conditioned `/compare`, NFKC `<mark>` evidence reader, UTF-8 BOM taxonomy-key CSV & versioned BibTeX exports, and neutral sequential single-hue visuals.

## End-to-end data flow

1. Validate taxonomy (`validate-taxonomy`), manifests (`validate-sources`), and schemas (`validate-artifacts`).
2. Discover candidates, monitor drift (`check-freshness`), and safely fetch official raw artifacts (`refresh-sources` / `fetch-seed-documents`).
3. Parse raw artifacts strictly offline under Parser `0.3.0` (`parse-raw-documents`).
4. Run codebook-injected frontier analysis (`analyze-documents --provider=gemini --model=gemini-4-neon`, `--provider=anthropic --model=claude-opus-5-5`, or `ingest-document-analysis`), NFKC grounding (`check-grounding`), and gold-set eval (`evaluate-gold-set data/eval/gold_set_v2.json --output-json=data/eval/gold_set_results.json`).
5. Synthesize sovereign jurisdiction readouts (`analyze-jurisdictions`) and run corpus quality audit (`report-source-quality-audit`).
6. Apply SQL migrations `001`–`005` (`migrate-db`), dry-run manifest sync (`sync-db-to-source-manifests --dry-run`), and replay v2.1 analyses idempotently (`persist-analysis-artifacts`).
7. Purge Next.js ISR caches (`POST /api/revalidate`).
