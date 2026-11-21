# Project Checklist

## Phase 0: Foundations & Contracts

- [x] Create repository scaffold and cross-platform `.gitattributes` (`data/raw/** -text`, LF everywhere)
- [x] Define canonical taxonomy and upgrade to **Taxonomy v2.1.0** (`obligation_strengths`, `corpus_roles`, 17 requirements, 19 policy domains)
- [x] Create single canonical machine-readable definitions & thresholds file (`data/taxonomies/label-definitions.json`) shared by prompts and web UI
- [x] Define semantic versioning policy and publication-grade Codebook v2.1.0 (`docs/research/codebook.md`)
- [x] Populate seven Draft 2020-12 JSON Schemas in `packages/schemas/` and enforce via `validate-artifacts` in CI (**`133/133` validated, `0` errors**)
- [x] Write product brief, architecture, implementation spec, and roadmap

## Phase 1: Data acquisition, recovery & late-2026 ingestion

- [x] Create five-jurisdiction registry with **52** official portals and **121** verified seed documents (`US 29`, `EU 21`, `KR 17`, `JP 34`, `CN 20`; **77** active primary headline instruments; zero orphans)
- [x] Implement source manifest validation (`validate-sources`) with strict calendar dates, `corpus_role`, and `supersedes_id`
- [x] Add SSRF-hardened HTTP/Playwright fetcher (`is_global` IP checks, shorthand IPv4 defense, redirect validation, Playwright `context.route("**/*", ...)` guard, `%PDF-` magic bytes, conditional `ETag`/`Last-Modified`)
- [x] Enforce selector-aware `browser_required` SPA-overwrite guard (`#bodyContent`) protecting `law.go.kr`
- [x] Recover all 3 South Korean `law.go.kr` binding statutes via Playwright (`제1조`..`부칙`) and upgrade 6 stub/synthetic/mojibake PDFs (CFPB, EU GPAI Guidelines Annex, NIST Playbook, 2 METI PDFs, KR Safety Guideline; zero synthetic manual imports remain)
- [x] Promote and ingest **18** verified late-2026 / landmark sovereign instruments across US, EU, South Korea, Japan, and China (logging deferred viewer-gated targets transparently in `late_2026_priority_targets.json`)

## Phase 2: Offline parsing (`Parser 0.3.0` + PyMuPDF)

- [x] Implement strictly offline normalized text model (`parse-raw-documents` makes zero network calls) recording explicit `extractor` provenance
- [x] Add `pymupdf` (`fitz`) as primary PDF extractor (`pdftotext`/`pypdf` fallback)
- [x] Add legal-heading sectionizer (`Chapter`, `Article N`, `Section N`, `Annex`, `第N条`, `제N조`) + PDF repeated header/footer stripping (preserving legal headings), compound de-hyphenation, and paragraph reflow
- [x] Re-parse all **121/121** documents cleanly under Parser `0.3.0` (`77 pymupdf`, `43 beautifulsoup4`, `1 hwpx_xml`; `0` short/wiped docs)
- [ ] Add live OCR engine fallback (e.g., Tesseract / vision OCR) for future image-only scanned PDFs

## Phase 3: Multi-provider extraction, risk framing & grounding

- [x] Build native multi-provider engine: **`GeminiAPIClient`** (`gemini-4-neon` default, 1M-token direct full-text window, thinking-part filtering, `MAX_TOKENS` escalation) + **`ClaudeAPIClient`** (`claude-opus-5-5` fallback, sequential dual-breakpoint prompt caching) + bounded `--workers` concurrency + zero-cost **`ingest-document-analysis`** verifier
- [x] Dynamically inject `label-definitions.json` (`definition`, `include_when`, `exclude_when`) into extraction & framing prompts
- [x] Add `obligation_strength` per requirement, compositional `frame_share`, `analyzed_at` provenance, and `>= 1` evidence span requirement for v2.1 analyses
- [x] Enforce Section 0 provenance guards (`stale_legacy_no_provenance` on analysis; `LegacyProvenanceError` / `--allow-legacy` on persistence)
- [x] Complete homogeneous **121/121** Taxonomy v2.1.0 re-analysis (`analysis_version: "0.3.0"`, `provider: "gemini"`, `model: "gemini-4-neon"`, `0` legacy rows)
- [x] Achieve **`2,271 / 2,271` (`100.0%`) exact verbatim evidence grounding** across all 121 documents (`0` ungrounded, `flagged = 0`, `min_per_doc = 100.0%`)
- [x] Scope institution aliases by jurisdiction in `analyze-jurisdictions` and regenerate all 5 jurisdiction readouts cleanly

## Phase 4: Persistence, quality monitoring & CI

- [x] Author Postgres migrations `001`–`005` (`documents.binding_strength`, longitudinal `document_snapshots`, `idx_machine_document_analyses_doc_updated`, `obligation_strength` CHECK, `frame_shares_json`, `analyzed_at`, FK/UNIQUE/CHECK constraints)
- [x] Verify `121/121` docs + `5/5` jurisdictions pass strict `allow_legacy=False` persistence bundle checks (`0` errors)
- [x] Enforce advisory-locked checksummed migrations, single-session idempotent replay, and guarded manifest sync (`--dry-run`, `--max-delete-ratio`)
- [x] Remove manual human-review approval queue (`002_remove_human_review.sql`)
- [x] Pass full pipeline `pytest` (**118/118** tests, zero side effects) and Ubuntu/Windows + **Node 22** CI

## Phase 5: Statistical analytics & web product

- [x] Align headline population with Codebook §8.2 (`mode=headline` strict active/adopted primary filter `n=77` vs. `mode=all` `n=121`; unclassified excluded) using authoritative manifest `binding_strength`
- [x] Wire Migration `005` `frame_shares_json` & `mpr.obligation_strength` into DB queries and dynamic frontier model formatting (`formatModelDisplayName()`, zero hardcoded `Claude`/`Sonnet` strings, cyan `v2.1 verified provenance` bar when `legacyCount === 0`)
- [x] Implement multi-dimensional `POL`, compositional `frame_share` `FRM` with Hamilton `100%` rounding, **Regime Coverage Index (`COV L1`)**, deterministic 200-resample **bootstrap 90% CIs**, **200-draw permutation null calibration**, and 4-spec sensitivity grid with Spearman `ρ`
- [x] Ship `/` leading with dynamic decoupling findings, 2D **Decoupling Map**, **5×5 Pairwise Matrix**, `/matrix` & `/api/matrix`, label-conditioned `/compare`, rebuilt sticky NFKC `<mark>` reader (`/documents/[documentId]`), role/lifecycle/quote `/documents`, unified `/jurisdictions/[slug]`, and `/methodology` with live **Starter Gold-Set Benchmark Scorecard**
- [x] Upgrade typography & accessibility (Geist Sans prose + Geist Mono data, `>= 11px` floor, mobile hero separator polish, WCAG AA contrast, `:focus-visible`, chart `table` alternatives, dynamic `/opengraph-image`, XML-valid `/sitemap.xml`)
- [x] Upgrade CORS read APIs (`s-maxage=300, stale-while-revalidate=60`), UTF-8 BOM taxonomy-key CSV + versioned BibTeX exports, `POST /api/revalidate`, `VERCEL_ENV` empty-DB refusal, and **15/15** web unit tests

## Phase 6: Evaluation & production cutover

- [x] Commit 5-document multilingual starter gold-set benchmark (`data/eval/gold_set_v1.json`, `starter_v0.1_internal`) and persist live results (`data/eval/gold_set_results.json` + `apps/web/src/lib/gold-set-results.snapshot.json`: Req F1 `0.833`, Enf F1 `0.929`, Dom Frame Acc `0.800` / `κ=0.706`, Binding Acc `0.800` / `κ=0.706`)
- [ ] Expand gold-labeled benchmark to 25–30 independently double-coded multilingual documents across all 5 jurisdictions
- [ ] Run Neon production cutover (`make migrate-prod && make sync-prod-db && make persist-prod`), deploy `apps/web` to `https://project-babel.com`, and invoke `POST /api/revalidate`
