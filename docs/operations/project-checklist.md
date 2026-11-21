# Project Checklist

## Phase 0: Foundations & Contracts

- [x] Create repository scaffold and cross-platform `.gitattributes` (`data/raw/** -text`, LF everywhere)
- [x] Define canonical taxonomy and upgrade to **Taxonomy v2.1.0** (`obligation_strengths`, `corpus_roles`, 17 requirements, 19 policy domains)
- [x] Create single canonical machine-readable definitions & thresholds file (`data/taxonomies/label-definitions.json`) shared by prompts and web UI
- [x] Define semantic versioning policy and publication-grade Codebook v2.1.0 (`docs/research/codebook.md`)
- [x] Populate **nine** Draft 2020-12 JSON Schemas in `packages/schemas/` (incl. `subnational_overlay`/`subnational_unit` on manifests plus `clauses-api.schema.json` & `evolution-api.schema.json`) and enforce via `validate-artifacts` in CI (**`156/156` validated, `0` errors**)
- [x] Write product brief, architecture, implementation spec, and roadmap

## Phase 1: Data acquisition, recovery & Phase 5 corpus expansion

- [x] Create five-jurisdiction registry with **61** official portals and **144** verified seed documents (**138** sovereign: `US 36`, `EU 24`, `KR 20`, `JP 37`, `CN 21` with **91** active primary headline instruments + **6** opt-in U.S. state `subnational_overlay` statutes; **12** `supersedes_id` lineage chains; zero orphans)
- [x] Implement source manifest validation (`validate-sources`) with strict calendar dates, `corpus_role` (incl. `subnational_overlay`), optional `subnational_unit`, and `supersedes_id`
- [x] Add SSRF-hardened HTTP/Playwright fetcher (`is_global` IP checks, shorthand IPv4 defense, redirect validation, Playwright `context.route("**/*", ...)` guard, `%PDF-` magic bytes, conditional `ETag`/`Last-Modified`)
- [x] Enforce selector-aware `browser_required` SPA-overwrite guard (`#bodyContent`) protecting `law.go.kr`
- [x] Recover all 3 South Korean `law.go.kr` binding statutes via Playwright (`제1조`..`부칙`) and upgrade 6 stub/synthetic/mojibake PDFs (CFPB, EU GPAI Guidelines Annex, NIST Playbook, 2 METI PDFs, KR Safety Guideline; zero synthetic manual imports remain)
- [x] Promote and ingest **18** Phase 4 late-2026 landmarks plus **23** Phase 5A sectoral, historical-baseline, and U.S. state overlay instruments (`121 → 144`, logging remaining viewer-gated/unconsolidated targets transparently in `late_2026_priority_targets.json`)
- [x] Add automated weekly Freshness Watch (`observatory check-freshness` / `make freshness` + `.github/workflows/freshness-watch.yml`)

## Phase 2: Offline parsing (`Parser 0.3.0` + PyMuPDF)

- [x] Implement strictly offline normalized text model (`parse-raw-documents` makes zero network calls) recording explicit `extractor` provenance
- [x] Add `pymupdf` (`fitz`) as primary PDF extractor (`pdftotext`/`pypdf` fallback)
- [x] Add legal-heading sectionizer (`Chapter`, `Article N`, `Section N`, `Annex`, `第N条`, `제N조`), PDF repeated header/footer stripping, compound de-hyphenation, paragraph reflow, CAC `cac.gov.cn` nav/footer stripping, and Korean `law.go.kr` `#hisComment`/`.cont_subtit` boilerplate stripping
- [x] Re-parse all **144/144** documents cleanly under Parser `0.3.0` (`93 pymupdf`, `48 beautifulsoup4`, `3 hwpx_xml`; `0` short/wiped docs)
- [ ] Add live OCR engine fallback (e.g., Tesseract / vision OCR) for future image-only scanned PDFs

## Phase 3: Multi-provider extraction, risk framing & grounding

- [x] Build native multi-provider engine: **`GeminiAPIClient`** (`gemini-4-neon` default, 1M-token direct full-text window, thinking-part filtering, `MAX_TOKENS` escalation) + **`ClaudeAPIClient`** (`claude-opus-5-5` fallback, sequential dual-breakpoint prompt caching) + bounded `--workers` concurrency + zero-cost **`ingest-document-analysis`** verifier
- [x] Dynamically inject `label-definitions.json` (`definition`, `include_when`, `exclude_when`) into extraction & framing prompts
- [x] Add `obligation_strength` per requirement, compositional `frame_share`, `analyzed_at` provenance, and `>= 1` evidence span requirement for v2.1 analyses
- [x] Enforce Section 0 provenance guards (`stale_legacy_no_provenance` on analysis; `LegacyProvenanceError` / `--allow-legacy` on persistence)
- [x] Complete homogeneous **144/144** Taxonomy v2.1.0 corpus (`analysis_version: "0.3.0"`, `provider: "gemini"`, `model: "gemini-4-neon"`, `0` legacy rows)
- [x] Achieve **`2,786 / 2,786` (`100.0%`) exact verbatim evidence grounding** across all 144 documents (`0` ungrounded, `flagged = 0`, `min_per_doc = 100.0%`)
- [x] Scope institution aliases by jurisdiction and strictly exclude `subnational_overlay` from sovereign summaries in `analyze-jurisdictions` (`US 36` federal)

## Phase 4: Persistence, quality monitoring & CI

- [x] Author Postgres migrations `001`–`005` (`documents.binding_strength`, longitudinal `document_snapshots`, `idx_machine_document_analyses_doc_updated`, `obligation_strength` CHECK, `frame_shares_json`, `analyzed_at`, FK/UNIQUE/CHECK constraints) and propagate `subnational_unit` & `supersedes_id` via `documents.raw_metadata_json` (zero extra migration needed)
- [x] Verify `144/144` docs (`subnational_in_meta=6`, `supersedes_in_meta=12`) + `5/5` sovereign jurisdictions pass strict `allow_legacy=False` persistence bundle checks (`0` errors)
- [x] Enforce advisory-locked checksummed migrations, single-session idempotent replay, and guarded manifest sync (`--dry-run`, `--max-delete-ratio`)
- [x] Remove manual human-review approval queue (`002_remove_human_review.sql`)
- [x] Pass full pipeline `pytest` (**124/124** tests, zero side effects) and Ubuntu/Windows + **Node 22** CI

## Phase 5: Statistical analytics & living research observatory

- [x] Align headline population with Codebook §8.2 (`mode=headline` strict active/adopted sovereign primary filter `n=91` vs. `mode=all` `n=138` sovereign / `n=144` with opt-in `?states=1`; unclassified & `subnational_overlay` excluded by default) using authoritative manifest `binding_strength`
- [x] Wire Migration `005` `frame_shares_json`, `mpr.obligation_strength`, and `documents.raw_metadata` (`subnational_unit`, `supersedes_id`) into DB queries; add dynamic model formatting (`formatModelDisplayName()`) and prose humanization (`humanizeProseTaxonomyKeys()`)
- [x] Implement multi-dimensional `POL`, compositional `frame_share` `FRM` with Hamilton `100%` rounding, **Regime Coverage Index (`COV L1`)**, deterministic 200-resample **bootstrap 90% CIs**, **200-draw permutation null calibration**, and 4-spec sensitivity grid with Spearman `ρ`
- [x] Ship flagship observatory surfaces: `/` with dynamic decoupling findings, collision-free 2D **Decoupling Map**, **5×5 Pairwise Matrix**, `/matrix` & `/api/matrix`, **`/clauses` & `/api/clauses`** (across `2,786` verbatim quotes), **`/evolution` & `/api/evolution`** (`2019–2026` trajectories & `12` `supersedes_id` diffs), opt-in **`?states=1`** U.S. State Overlay, label-conditioned `/compare`, rebuilt sticky NFKC `<mark>` reader (`/documents/[documentId]`), role/lifecycle/state-overlay `/documents`, unified `/jurisdictions/[slug]`, and `/methodology` with live **25-Doc Blind Gold-Set v2 Scorecard** & **Freshness Ledger (`#freshness`)**
- [x] Upgrade typography & accessibility (Geist Sans prose + Geist Mono data, `>= 11px` floor, `whitespace-nowrap` metric badges, WCAG AA contrast, `:focus-visible`, chart `table` alternatives, dynamic `/opengraph-image`, XML-valid `/sitemap.xml` incl. `/clauses` & `/evolution`)
- [x] Upgrade CORS read APIs (`s-maxage=300, stale-while-revalidate=60` / `s-maxage=3600` on `/api/clauses`), UTF-8 BOM taxonomy-key CSV + versioned BibTeX exports, `POST /api/revalidate`, `VERCEL_ENV` empty-DB refusal, and **18/18** web unit tests (`26` production build routes)

## Phase 6: Evaluation & production cutover

- [x] Commit 25-document stratified multilingual blind gold-set benchmark (`data/eval/gold_set_v2.json`, `5 × 5` across EN/KO/JA/ZH, `stratified_v1.0_blind_internal`, covering all `17/17` v2.1 requirements & `6/6` binding strata) and persist live results (`data/eval/gold_set_results.json` + `apps/web/src/lib/gold-set-results.snapshot.json`: Req F1 `0.899`, Enf F1 `0.954`, Dom Frame Acc `0.800` / `κ=0.747` / `α=0.748`, Binding Acc `0.920` / `κ=0.891` / `α=0.893`)
- [ ] Run Phase 5 Neon production cutover (`make migrate-prod && make sync-prod-db && make persist-prod`), deploy updated `apps/web` to `https://project-babel.com`, and invoke `POST /api/revalidate`
- [ ] Commission external multi-institution dual-annotator inter-rater validation against `gold_set_v2.json` for academic publication
