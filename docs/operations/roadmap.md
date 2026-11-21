# Roadmap

## Phase 0: Research design, canonical definitions & JSON Schemas (Complete)

- **Taxonomy v2.1.0** (`data/taxonomies/observatory-taxonomy.json`) with semantic versioning policy, `obligation_strengths`, `corpus_roles`, 17 `policy_requirements`, and 19 `policy_domains`
- Single machine-readable definitions & thresholds file (`data/taxonomies/label-definitions.json`) shared across Python prompts and Next.js UI
- Publication-grade **Codebook v2.1.0** (`docs/research/codebook.md`)
- Seven CI-enforced Draft 2020-12 JSON Schemas (`packages/schemas/` + `make validate-artifacts`) and cross-platform `.gitattributes`

## Phase 1: Source registry and SSRF-hardened ingestion (Complete)

- Five-jurisdiction registry of 52 official portals and 103 clean seed documents (zero orphans)
- End-to-end SSRF validation (`is_global`, shorthand IPv4 defense, redirect hops, Playwright `context.route("**/*", ...)`)
- Selector-aware `browser_required` SPA-overwrite guard (`#bodyContent`), `%PDF-` magic-byte verification, conditional HTTP (`ETag`/`Last-Modified`), and SHA-256 logs
- Family-based portal discovery (HTML links + recursive `sitemapindex`), enrichment, and promotion

## Phase 2: Offline Parser `0.3.0` & codebook-injected analytical extraction (Complete)

- Strictly offline HTML/PDF/HWPX/ODT parser with legal-heading sectionizer (`Article N`, `第N条`, `제N조`), PDF repeated header/footer stripping, de-hyphenation, paragraph reflow, and explicit `extractor` provenance
- Claude Sonnet 4.6 structured extraction and 8-frame risk analysis with dynamic codebook prompt injection, `obligation_strength`, `frame_share`, token-aware CJK/Latin chunking, `8192→16384` controls retry, `600s` timeout, genuine dual-breakpoint prompt caching, and Section 0 legacy provenance guards
- NFKC + whitespace/hyphen + ordered-window grounding scorer persisting `grounding_status` and `start_char`/`end_char` (`0.90` canonical gate) and jurisdiction-scoped institution canonicalization

## Phase 3: Database hardening (`001`–`005`) & CI enforcement (Complete)

- Neon Postgres migrations `001`–`005`: authoritative manifest `documents.binding_strength`, longitudinal `document_snapshots`, `idx_machine_document_analyses_doc_updated`, `obligation_strength` CHECK, `frame_shares_json`, `analyzed_at`, and indexed/constrained child tables
- Strict provenance replay (`LegacyProvenanceError` / `--allow-legacy`), guarded manifest sync (`--dry-run`, `--max-delete-ratio`), and Ubuntu/Windows + Node 22 CI enforcing `validate-artifacts`

## Phase 4: Statistical web observatory & CORS APIs (Complete)

- Codebook §8.2 `mode=headline` vs. `mode=all`, multi-dimensional `POL`, sub-`0.15` noise-filtered / `frame_share` `FRM`, Regime Coverage Index (`COV L1`), deterministic 200-resample bootstrap 90% CIs, 200-draw permutation null calibration, and 4-spec sensitivity grid with Spearman `ρ`
- Flagship analyst surfaces: findings-led `/` with 2D **Decoupling Map** & **5×5 Matrix**, **25×5 Obligation & Clause Matrix** (`/matrix`), label-conditioned `/compare`, rebuilt sticky NFKC `<mark>` evidence reader (`/documents/[documentId]`), role/lifecycle/quote `/documents`, unified `/jurisdictions/[slug]`, and transparent `/methodology`
- Geist Sans prose + Geist Mono data (`>= 11px` floor, WCAG AA, neutral sequential single-hue scale), CORS read APIs, UTF-8 BOM taxonomy-key CSV & versioned BibTeX exports, `/opengraph-image`, and `VERCEL_ENV` empty-DB refusal

## Phase 5: Live Corpus Re-Run, Late-2026 Expansion & External Calibration (Next)

- Execute the **Pre-Deploy Section 0 Re-Run Checklist** (`docs/operations/vercel-launch.md`): browser-recover the 3 South Korean `law.go.kr` statutes + CFPB PDF → re-parse offline under Parser `0.3.0` → run authenticated Claude Sonnet 4.6 v2.1 re-analysis across all 103 docs → migrate `005` + `persist-prod` + `POST /api/revalidate`
- Promote and ingest the 19-target late-2026 priority queue (`data/source_tracking/late_2026_priority_targets.json` — EU Digital Omnibus & Art. 50 Code/Guidelines, US EO 14409/14434 & NIST CAISI Agent Standards Initiative, South Korea finalized MSIT guidelines & Oct 2026 amendments, Japan Second AI Basic Plan, Guidelines Ver. 1.2 & J-AISI guides, China TC260 Framework 3.0 & Amended Cybersecurity Law)
- Expand the starter 5-doc multilingual benchmark (`data/eval/gold_set_v1.json`) to a 25–30 document double-coded external gold set and publish updated κ/F1 calibration on `/methodology`
- Optional sub-national (US benchmark states) and technical-standards-body analytical overlays
