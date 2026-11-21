# Roadmap

## Phase 0: Research design, canonical definitions & JSON Schemas (Complete)

- **Taxonomy v2.1.0** (`data/taxonomies/observatory-taxonomy.json`) with semantic versioning policy, `obligation_strengths`, `corpus_roles`, 17 `policy_requirements`, and 19 `policy_domains`
- Single machine-readable definitions & thresholds file (`data/taxonomies/label-definitions.json`) shared across Python prompts and Next.js UI
- Publication-grade **Codebook v2.1.0** (`docs/research/codebook.md`)
- Nine Draft 2020-12 JSON Schemas (`packages/schemas/` + `make validate-artifacts`) and cross-platform `.gitattributes`

## Phase 1: Source registry and SSRF-hardened ingestion (Complete)

- Five-jurisdiction registry of **61** official portals and **144** clean seed documents (**138** sovereign: `US 36`, `EU 24`, `KR 20`, `JP 37`, `CN 21` with **91** active primary headline instruments + **6** opt-in U.S. state `subnational_overlay` statutes; **12** `supersedes_id` lineage chains; zero orphans, zero synthetic imports)
- End-to-end SSRF validation (`is_global`, shorthand IPv4 defense, redirect hops, Playwright `context.route("**/*", ...)`)
- Selector-aware `browser_required` SPA-overwrite guard (`#bodyContent`), `%PDF-` magic-byte verification, conditional HTTP (`ETag`/`Last-Modified`), and SHA-256 logs
- Completed forensic recovery of all 3 South Korean `law.go.kr` statutes, upgraded 6 full official PDFs, ingested 18 Phase 4 late-2026 landmarks, and added 23 Phase 5A sectoral/historical/state-overlay instruments (HHS ONC HTI-1, Treasury, BIS Nov 2026 & Jan 2026, U.S. Copyright Office Parts 2–3, DoD 3000.09, 6 U.S. state AI statutes, EU 2020/2021 baselines & (EU) 2025/454, KR National AI Action Plan & FSC guidelines, JP FSA/METI/Bunka guides, CN MIIT standardization guidelines)
- Automated weekly **Freshness Watch** (`observatory check-freshness` + `.github/workflows/freshness-watch.yml`)

## Phase 2: Offline Parser `0.3.0`, multi-provider frontier extraction & full v2.1 corpus (Complete)

- Strictly offline HTML/PDF/HWPX/ODT parser using **PyMuPDF (`pymupdf`)** as primary PDF extractor (`pdftotext`/`pypdf` fallback), legal-heading sectionizer (`Article N`, `第N条`, `제N조`), PDF repeated header/footer stripping, de-hyphenation, paragraph reflow, CAC `cac.gov.cn` & Korean `law.go.kr` (`#hisComment`/`.cont_subtit`) chrome stripping, and explicit `extractor` provenance (`93 pymupdf`, `48 beautifulsoup4`, `3 hwpx_xml`; `0` short/wiped docs)
- Multi-provider codebook-injected structured extraction and 8-frame risk analysis (`analysis_version: "0.3.0"`): **Google Gemini** (`GeminiAPIClient`, default `gemini-4-neon`, `thinking_level=medium`/`xhigh`), **Anthropic Claude** (`ClaudeAPIClient`, fallback `claude-opus-5-5`, dual-breakpoint prompt caching, HTTP `529`/`Retry-After` resilience), and zero-cost `ingest-document-analysis`, with `obligation_strength`, `frame_share`, token-aware CJK/Latin chunking, `8192→16384` controls retry, `600s` timeout, and Section 0 legacy provenance guards
- Completed homogeneous **144 / 144 Taxonomy v2.1.0** corpus analysis (`provider: "gemini"`, `model: "gemini-4-neon"`, `0` legacy rows) with **`2,786 / 2,786` (`100.0%`)** exact NFKC verbatim quote grounding (`flagged = 0`, canonical `0.90` gate) and 25-document blind stratified multilingual gold-set benchmark (`data/eval/gold_set_v2.json` → `gold_set_results.json`: Req Micro F1 `0.899`, Enf Micro F1 `0.954`, Dominant Frame Acc `0.800` / `κ=0.747` / `α=0.748`, Binding Strength Acc `0.920` / `κ=0.891` / `α=0.893`)

## Phase 3: Database hardening (`001`–`005`) & CI enforcement (Complete)

- Neon Postgres migrations `001`–`005`: authoritative manifest `documents.binding_strength`, longitudinal `document_snapshots`, `idx_machine_document_analyses_doc_updated`, `obligation_strength` CHECK, `frame_shares_json`, `analyzed_at`, `subnational_unit` / `supersedes_id` propagation inside `documents.raw_metadata_json`, and indexed/constrained child tables
- Strict provenance replay (`LegacyProvenanceError` / `--allow-legacy` — verified `144/144` docs + `5/5` sovereign jurisdictions passing strict `allow_legacy=False` dry-run), guarded manifest sync (`--dry-run`, `--max-delete-ratio`), and Ubuntu/Windows + Node 22 CI enforcing `validate-artifacts` (**156 / 156**, `0` errors across **9** schemas) and **124 / 124** pipeline tests

## Phase 4 & 5: Living Research Observatory — Clauses, Evolution, State Overlay & Gold-Set v2 (Complete)

- Codebook §8.2 `mode=headline` (`91` active primary sovereign) vs. `mode=all` (`138` sovereign / `144` with opt-in `?states=1`), multi-dimensional `POL`, `frame_share` / sub-`0.15` noise-filtered `FRM`, Regime Coverage Index (`COV L1`), deterministic 200-resample bootstrap 90% CIs, 200-draw permutation null calibration, and 4-spec sensitivity grid with Spearman `ρ`
- Flagship research workbench: findings-led `/` with dynamic `formatModelDisplayName()` & cyan `v2.1` provenance strip, collision-free 2D **Decoupling Map** & **5×5 Matrix**, **25×5 Obligation & Clause Matrix** (`/matrix`), **Cross-Jurisdiction Clause & Citation Explorer** (`/clauses` + `/api/clauses` across `2,786` verbatim quotes), **Longitudinal Regime Evolution & Amendment Diffs** (`/evolution` + `/api/evolution`, `2019–2026` trajectories + `12` `supersedes_id` diffs), opt-in **`?states=1`** U.S. State Overlay, label-conditioned `/compare`, rebuilt sticky NFKC `<mark>` evidence reader with humanized prose (`/documents/[documentId]`), role/lifecycle/state-overlay `/documents`, unified `/jurisdictions/[slug]`, and transparent `/methodology` with live 25-doc Gold-Set v2 Scorecard (`by_jurisdiction`, Krippendorff's α, per-label P/R/F1) & `#freshness` ledger
- Postgres query layer wired directly to Migration `005` `frame_shares_json`, lateral `obligation_strengths_json`, and `raw_metadata`, Geist Sans prose + Geist Mono data (`>= 11px` floor, WCAG AA, neutral sequential single-hue scale), CORS read APIs, UTF-8 BOM taxonomy-key CSV & versioned BibTeX exports, `/opengraph-image`, `VERCEL_ENV` empty-DB refusal, and **18 / 18** web tests (`26` production build routes)

## Phase 6: Production Cutover, External Multi-Institution Calibration & Deferred Sources (Next)

- Execute the **Phase 5 Neon Production Cutover Checklist** (`docs/operations/vercel-launch.md`): replay all `144/144` verified `v2.1.0` rows strictly to production Neon Postgres → deploy updated `apps/web` to `https://project-babel.com` → `POST /api/revalidate`
- Commission external multi-institution dual-annotator review of `data/eval/gold_set_v2.json` (`n=25`) to publish independent human-vs-human inter-rater Krippendorff's α alongside model benchmarks
- Monitor and ingest the remaining honestly deferred sovereign targets (`docs/operations/blocked-source-playbook.md` & `data/source_tracking/late_2026_priority_targets.json`: `cn_amended_cybersecurity_law_2025_art20`, `GB 45438-2025`, `kr_ai_basic_act_data_amendment_2026`, and standalone canonical full-text upgrades for `cn_ai_ethics_norms_2021` / `cn_ai_governance_principles_2019`)
- Optional additional overlays (technical-standards-body ISO/IEC 42001/CEN-CENELEC mappings, live OCR fallback for scanned PDFs, and additional sovereign jurisdictions)
