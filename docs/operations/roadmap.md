# Roadmap

## Phase 0: Research design, canonical definitions & JSON Schemas (Complete)

- **Taxonomy v2.1.0** (`data/taxonomies/observatory-taxonomy.json`) with semantic versioning policy, `obligation_strengths`, `corpus_roles`, 17 `policy_requirements`, and 19 `policy_domains`
- Single machine-readable definitions & thresholds file (`data/taxonomies/label-definitions.json`) shared across Python prompts and Next.js UI
- Publication-grade **Codebook v2.1.0** (`docs/research/codebook.md`)
- Seven CI-enforced Draft 2020-12 JSON Schemas (`packages/schemas/` + `make validate-artifacts`) and cross-platform `.gitattributes`

## Phase 1: Source registry and SSRF-hardened ingestion (Complete)

- Five-jurisdiction registry of 52 official portals and **121** clean seed documents (`US 29`, `EU 21`, `KR 17`, `JP 34`, `CN 20`; **77** active primary headline instruments + **44** supporting/draft/superseded/non-primary; zero orphans, zero synthetic imports)
- End-to-end SSRF validation (`is_global`, shorthand IPv4 defense, redirect hops, Playwright `context.route("**/*", ...)`)
- Selector-aware `browser_required` SPA-overwrite guard (`#bodyContent`), `%PDF-` magic-byte verification, conditional HTTP (`ETag`/`Last-Modified`), and SHA-256 logs
- Completed forensic recovery of all 3 South Korean `law.go.kr` statutes, upgraded 6 full official PDFs (EU GPAI Guidelines, CFPB Chatbots Spotlight, NIST AI RMF Playbook, Japan AI Governance Guidelines 2021 & Ver. 1.1, KR AI Safety Guideline UTF-8 revision), and ingested 18 late-2026 & landmark instruments (EU Digital Omnibus & Art. 50 Guidelines/Code, US EO 14409/14365/14434, TAKE IT DOWN Act & NIST CAISI/IR 8596, KR High-Impact AI Determination Guideline, JP 2nd Basic AI Plan, full AI Promotion Act, Guidelines Ver. 1.2, J-AISI guides & Hiroshima Code, CN TC260 Framework 3.0 & State Council "AI+" Opinion)
- Family-based portal discovery (HTML links + recursive `sitemapindex`), enrichment, and promotion

## Phase 2: Offline Parser `0.3.0`, multi-provider frontier extraction & full v2.1 corpus (Complete)

- Strictly offline HTML/PDF/HWPX/ODT parser using **PyMuPDF (`pymupdf`)** as primary PDF extractor (with `pypdf` fallback), legal-heading sectionizer (`Article N`, `第N条`, `제N조`), PDF repeated header/footer stripping, de-hyphenation, paragraph reflow, and explicit `extractor` provenance (`77 pymupdf`, `43 beautifulsoup4`, `1 hwpx_xml`; `0` short/wiped docs)
- Multi-provider codebook-injected structured extraction and 8-frame risk analysis (`analysis_version: "0.3.0"`): **Google Gemini** (`GeminiAPIClient`, default `gemini-4-neon`, `thinking_level=medium`/`xhigh`), **Anthropic Claude** (`ClaudeAPIClient`, fallback `claude-opus-5-5`, dual-breakpoint prompt caching, HTTP `529`/`Retry-After` resilience), and zero-cost `ingest-document-analysis`, with `obligation_strength`, `frame_share`, token-aware CJK/Latin chunking, `8192→16384` controls retry, `600s` timeout, and Section 0 legacy provenance guards
- Completed homogeneous **121 / 121 Taxonomy v2.1.0** corpus analysis (`provider: "gemini"`, `model: "gemini-4-neon"`, `0` legacy rows) with **`2,271 / 2,271` (`100.0%`)** exact NFKC verbatim quote grounding (`flagged = 0`, canonical `0.90` gate) and live starter gold-set benchmark (`data/eval/gold_set_results.json`: Req Micro F1 `0.833`, Enf Micro F1 `0.929`, Dominant Frame Acc `0.800`, Binding Strength Acc `0.800`)

## Phase 3: Database hardening (`001`–`005`) & CI enforcement (Complete)

- Neon Postgres migrations `001`–`005`: authoritative manifest `documents.binding_strength`, longitudinal `document_snapshots`, `idx_machine_document_analyses_doc_updated`, `obligation_strength` CHECK, `frame_shares_json`, `analyzed_at`, and indexed/constrained child tables
- Strict provenance replay (`LegacyProvenanceError` / `--allow-legacy` — verified `121/121` docs + `5/5` jurisdictions passing strict `allow_legacy=False` dry-run), guarded manifest sync (`--dry-run`, `--max-delete-ratio`), and Ubuntu/Windows + Node 22 CI enforcing `validate-artifacts` (**133 / 133**, `0` errors) and `118 / 118` pipeline tests

## Phase 4: Statistical web observatory & CORS APIs (Complete)

- Codebook §8.2 `mode=headline` (`77` active primary) vs. `mode=all` (`121` total), multi-dimensional `POL`, `frame_share` / sub-`0.15` noise-filtered `FRM`, Regime Coverage Index (`COV L1`), deterministic 200-resample bootstrap 90% CIs, 200-draw permutation null calibration, and 4-spec sensitivity grid with Spearman `ρ`
- Flagship analyst surfaces: findings-led `/` with dynamic `formatModelDisplayName()` & verified cyan `v2.1` provenance strip, 2D **Decoupling Map** & **5×5 Matrix**, **25×5 Obligation & Clause Matrix** (`/matrix`), label-conditioned `/compare`, rebuilt sticky NFKC `<mark>` evidence reader (`/documents/[documentId]`), role/lifecycle/quote `/documents`, unified `/jurisdictions/[slug]`, and transparent `/methodology` with live gold-set scorecard (`eval-parser.ts` / `eval-data.ts` / `gold-set-results.snapshot.json`)
- Postgres query layer wired directly to Migration `005` `frame_shares_json` and lateral `obligation_strengths_json`, Geist Sans prose + Geist Mono data (`>= 11px` floor, WCAG AA, neutral sequential single-hue scale), CORS read APIs, UTF-8 BOM taxonomy-key CSV & versioned BibTeX exports, `/opengraph-image`, `VERCEL_ENV` empty-DB refusal, and `15 / 15` web tests

## Phase 5: Neon Production Cutover, Deferred Sources & External Calibration (Next)

- Execute the **Neon Production Cutover Checklist** (`docs/operations/vercel-launch.md`): apply migrations `001`–`005` on production Neon Postgres → `sync-db-to-source-manifests` → strict `persist-analysis-artifacts` (`121/121` verified `v2.1.0` rows, `0` legacy) → `POST /api/revalidate` on `https://project-babel.com`
- Monitor and ingest the honestly deferred targets tracked in `docs/operations/blocked-source-playbook.md` and `data/source_tracking/late_2026_priority_targets.json` (`cn_amended_cybersecurity_law_2025_art20`, `GB 45438-2025`, `kr_national_ai_action_plan_2026_2028`, `kr_ai_basic_act_data_amendment_2026`, and standalone canonical full-text upgrades for `cn_ai_ethics_norms_2021` / `cn_ai_governance_principles_2019`)
- Expand the starter 5-doc internal benchmark (`data/eval/gold_set_v1.json`) to a 25–30 document double-coded external gold set and refresh `data/eval/gold_set_results.json` + web snapshot on `/methodology#validation`
- Optional sub-national (US benchmark states) and technical-standards-body analytical overlays
