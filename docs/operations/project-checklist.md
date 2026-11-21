# Project Checklist

## Phase 0: Foundations & Contracts

- [x] Create repository scaffold and cross-platform `.gitattributes` (`data/raw/** -text`, LF everywhere)
- [x] Define canonical taxonomy and upgrade to **Taxonomy v2.1.0** (`obligation_strengths`, `corpus_roles`, 17 requirements, 19 policy domains)
- [x] Create single canonical machine-readable definitions & thresholds file (`data/taxonomies/label-definitions.json`) shared by prompts and web UI
- [x] Define semantic versioning policy and publication-grade Codebook v2.1.0 (`docs/research/codebook.md`)
- [x] Populate seven Draft 2020-12 JSON Schemas in `packages/schemas/` and enforce via `validate-artifacts` in CI
- [x] Write product brief, architecture, implementation spec, and roadmap

## Phase 1: Data acquisition & safe retrieval

- [x] Create five-jurisdiction registry with 52 official portals and 103 clean seed documents (zero orphans)
- [x] Implement source manifest validation (`validate-sources`) with strict calendar dates, `corpus_role`, and `supersedes_id`
- [x] Add SSRF-hardened HTTP/Playwright fetcher (`is_global` IP checks, shorthand IPv4 defense, redirect validation, Playwright `context.route("**/*", ...)` guard, `%PDF-` magic bytes, conditional `ETag`/`Last-Modified`)
- [x] Enforce selector-aware `browser_required` SPA-overwrite guard (`#bodyContent`) protecting `law.go.kr`
- [x] Add portal discovery (HTML links + recursive `sitemapindex`) and family-based expansion planning
- [x] Curate late-2026 priority expansion queue (`data/source_tracking/late_2026_priority_targets.json`) and resolve Section 0 forensic manifest fixes (`us_cfpb_chatbots_issue_spotlight_2023`)
- [ ] Re-fetch the 3 South Korean `law.go.kr` statutory texts (`--with-browser`), re-fetch CFPB Chatbots PDF, and ingest the 19-target late-2026 expansion queue

## Phase 2: Offline parsing (`Parser 0.3.0`)

- [x] Implement strictly offline normalized text model (`parse-raw-documents` makes zero network calls) recording explicit `extractor` provenance
- [x] Add legal-heading sectionizer (`Chapter`, `Article N`, `Section N`, `Annex`, `第N条`, `제N조`) preventing mega-statutes from collapsing into one section
- [x] Add PDF repeated header/footer stripping (preserving top-of-page legal headings), compound-aware de-hyphenation, and paragraph reflow
- [x] Parse HTML with CJK charset detection, nested block deduplication, nav-chrome stripping, and ISO/CJK/Japanese era dates
- [x] Add comprehensive parser unit & regression tests
- [ ] Re-parse the 103-document corpus offline under Parser `0.3.0` (`parse-raw-documents --refresh`)
- [ ] Add live OCR engine fallback (e.g., Tesseract / vision OCR) for image-only scanned PDFs

## Phase 3: Structured extraction & risk framing

- [x] Dynamically inject `label-definitions.json` (`definition`, `include_when`, `exclude_when`) into extraction & framing prompts
- [x] Add `obligation_strength` per requirement, `frame_share` allocation, `analyzed_at` provenance, and `>= 1` evidence span requirement for v2 analyses
- [x] Replace raw character caps with language/token-aware CJK/Latin chunking (`90k`/`45k` token budgets) and fix all 5 multi-chunk merge defects
- [x] Raise controls budget (`8192→16384` retry on `max_tokens`), set `600s` timeout, `temperature=0.0`, HTTP `529`/`Retry-After` retries, and wire genuine dual-breakpoint Anthropic prompt caching (`cache_read_input_tokens`)
- [x] Enforce Section 0 legacy provenance guard (`stale_legacy_no_provenance` on analysis; `LegacyProvenanceError` / `--allow-legacy` on persistence)
- [x] Add NFKC + whitespace/hyphen + ordered-window grounding scorer persisting per-span `grounding_status`, `start_char`, `end_char` (`0.90` canonical gate, `None` on empty evidence)
- [x] Scope institution aliases by jurisdiction in `analyze-jurisdictions` and delete stale analyses on low-fidelity skip
- [ ] Execute full authenticated corpus re-analysis (`analyze-documents --refresh` with `ANTHROPIC_API_KEY`) to replace legacy April 2026 artifacts

## Phase 4: Persistence, quality monitoring & CI

- [x] Author Postgres migrations `001`–`005` (`documents.binding_strength`, longitudinal `document_snapshots`, `idx_machine_document_analyses_doc_updated`, `obligation_strength`, `frame_shares_json`, `analyzed_at`, FK/UNIQUE/CHECK constraints)
- [x] Enforce advisory-locked checksummed migrations, single-session idempotent replay, and guarded manifest sync (`--dry-run`, `--max-delete-ratio`)
- [x] Remove manual human-review approval queue (`002_remove_human_review.sql`)
- [x] Add CJK-aware quality audit detecting SPA shells, mojibake, off-topic docs, duplicates, zero-quote analyses, and grounding failures
- [x] Upgrade `.github/workflows/ci.yml` (`validate-taxonomy`, `validate-sources`, `validate-artifacts`, `pytest` on Ubuntu + Windows, and **Node 22** `apps/web` lint/typecheck/test/build)

## Phase 5: Statistical analytics & web product

- [x] Align headline population with Codebook §8.2 (`mode=headline` strict active/adopted primary filter vs. `mode=all`; unclassified excluded) using authoritative manifest `binding_strength`
- [x] Implement multi-dimensional `POL`, sub-`0.15` noise-filtered / `frame_share` `FRM` with Hamilton `100%` rounding, **Regime Coverage Index (`COV L1`)**, deterministic 200-resample **bootstrap 90% CIs**, **200-draw permutation null calibration**, and 4-spec sensitivity grid with Spearman `ρ`
- [x] Ship `/` leading with dynamic decoupling findings, honest provenance banner, `POL` vs. `FRM` cards, interactive **2D Decoupling Map**, **5×5 Pairwise Matrix**, and neutral sequential single-hue scale (`#94a3b8` / `#38bdf8` / `#67e8f9`)
- [x] Ship `/matrix` & `/api/matrix` (25×5 Obligation & Clause Matrix with `L0–L4` slide-over evidence drawer)
- [x] Upgrade `/compare` to true label-conditioned *"Same Rule, Different Reason"* & *"Same Reason, Different Rule"* diffs with dynamic `generateMetadata`
- [x] Rebuild `/documents/[documentId]` with sticky rail, NFKC/PDF-hyphen `<mark>` highlighter, live grounding badges, `#quote-*` permalinks, dual-language `quote` + `[MT] quoteEn`, and precision-aware dates
- [x] Upgrade `/documents` (role/lifecycle badges & filters, quote search), `/jurisdictions/[slug]` (`<TopNav />`, `?mode=`, unified shares), `/methodology` (Sonnet 4.6 disclosure, CIs, null, sensitivity grid, gold set, BibTeX)
- [x] Upgrade typography & accessibility (Geist Sans prose + Geist Mono data, `>= 11px` floor, WCAG AA contrast, `:focus-visible`, chart `table` alternatives, dynamic `/opengraph-image`, XML-valid `/sitemap.xml`)
- [x] Upgrade CORS read APIs (`s-maxage=300, stale-while-revalidate=60`), UTF-8 BOM taxonomy-key CSV + versioned BibTeX exports, `POST /api/revalidate`, and `VERCEL_ENV` empty-DB refusal (never serving fake `seedData`)

## Phase 6: Evaluation & production cutover

- [x] Commit 5-document multilingual starter gold-set benchmark (`data/eval/gold_set_v1.json`, `starter_v0.1_internal`) and upgrade `evaluate-gold-set` with per-label P/R/F1, Cohen's κ, and 95% bootstrap CIs
- [ ] Expand gold-labeled benchmark to 25–30 independently double-coded multilingual documents across all 5 jurisdictions
- [ ] Run Pre-Deploy Section 0 re-run checklist (browser recovery → Parser `0.3.0` → Claude v2.1 re-analysis → Neon migration `005` → guarded sync → `persist-prod` → `POST /api/revalidate`)
