# Full Implementation Spec

## Product objective

Project Babel is a research-grade platform that lets analysts compare AI governance across five jurisdictions along two independent axes:

1. **Policy structure:** what concrete safeguards, deontic obligation strengths, enforcement mechanisms, and authoritative binding force a jurisdiction applies.
2. **Risk framing:** why the jurisdiction says AI governance is necessary across a fixed eight-frame analytical vocabulary.

The system delivers reproducible official-source ingestion, offline section-aware parsing (`Parser 0.3.0`), codebook-injected machine classification with persisted NFKC quote grounding, uncertainty-quantified statistical scoring (bootstrap 90% CIs, permutation null calibration, Regime Coverage Index), longitudinal snapshot tracking, and open CORS APIs / research exports.

## Core user journeys

### Policy researcher / political scientist

- Filter official documents by jurisdiction, `corpus_role`, `lifecycle_stage`, binding strength, document type, safety requirement, framing, and full-text / quote search
- Inspect normalized multi-section text with sticky evidence navigation, verified NFKC `<mark>` highlighting, dual-language `quote` + `[MT] quoteEn`, `#quote-*` permalinks, and honest model/taxonomy provenance
- Compare jurisdictions via the 2D **Decoupling Map** (`/`), **25×5 Obligation & Clause Matrix** (`/matrix`), **Cross-Jurisdiction Clause & Citation Explorer** (`/clauses`), **Longitudinal Regime Evolution & Amendment Diffs** (`/evolution`), and label-conditioned bilateral diffs (`/compare`), with an opt-in **`?states=1`** U.S. State Statutory Overlay
- Evaluate statistical uncertainty (bootstrap 90% CIs), small-sample permutation null thresholds, 4-specification rank stability (Spearman `ρ`), the 25-document blind multilingual gold-set scorecard, and corpus freshness on `/methodology`
- Export UTF-8 BOM taxonomy-key CSV, JSON, and versioned BibTeX artifacts via UI controls or public CORS APIs

### Safety, standards, and governance teams

- Audit strongest active binding obligations (`L0–L4`) across 25 controls (17 requirements + 8 active enforcement mechanisms) on `/matrix` and `GET /api/matrix`, and search all `2,786` grounded multilingual clauses on `/clauses` and `GET /api/clauses`
- Toggle between strict Codebook §8.2 active primary sovereign instruments (`mode=headline`, `n = 91`), full-corpus (`mode=all`, `n = 138` sovereign), and opt-in U.S. State Overlay (`?states=1`, `+6` state statutes)
- Track corpus provenance, grounding ratios (`0.90` canonical gate; live `100.0%`), weekly `freshness-watch.yml` drift status, and 25-doc stratified multilingual gold-set metrics (`data/eval/gold_set_v2.json`)

## Scope

### In scope

- **Five sovereign/supranational jurisdictions + opt-in U.S. state overlay:** United States (`36` federal + `6` opt-in `subnational_overlay` state statutes), European Union (`24`), South Korea (`20`), Japan (`37`), China (`21`) — `144` total official primary-source instruments across `61` portals
- **Official primary-source documents:** Legislation, executive actions, regulatory guidance, technical standards, voluntary government-adjacent frameworks, and national strategies
- **Taxonomy v2.1.0 + `label-definitions.json`:** 17 `policy_requirements`, 4 `obligation_strengths`, 9 `enforcement_mechanisms`, 10 `application_domains`, 19 `policy_domains`, 8 `risk_framings`, 7 `source_tiers`, 5 `corpus_roles` (incl. opt-in `subnational_overlay` + `subnational_unit`), and 4 `lifecycle_stages`
- **Statistical comparative engine:** `POL` vs. `FRM` lead, Regime Coverage Index (`COV L1`), secondary `CMP`, seeded 200-resample bootstrap 90% CIs, 200-draw permutation null calibration, and 4-spec sensitivity grid
- **Public CORS read-only APIs & open exports:** Governed by nine Draft 2020-12 JSON Schemas in `packages/schemas/`

### Out of scope

- Broad news, op-ed, or social-media scraping
- Normative letter grades or subjective "best regulator" rankings
- Human approval queues (removed in `sql/migrations/002_remove_human_review.sql`)

## Functional requirements

### 1. Source registry & SSRF-hardened ingestion

- Register official portals and seed documents under `data/sources/<jurisdiction>.json`, validated against `packages/schemas/source-manifest.schema.json` and `validate-artifacts`.
- Track `corpus_role`, `lifecycle_stage`, `source_tier`, authoritative `binding_strength`, `supersedes_id`, canonical/retrieval URLs, and browser-capture settings.
- Enforce `url_safety.py` (`http`/`https` only, globally routable IPs via `is_global`, shorthand IPv4 defense, redirect hop validation) plus Playwright `context.route("**/*", ...)`, HTTP `2xx` checks, `%PDF-` magic-byte checks, conditional HTTP (`ETag`/`Last-Modified`), and selector-aware SPA-overwrite protection (`#bodyContent`).

### 2. Offline parsing (`Parser 0.3.0`)

- Strictly offline HTML/PDF/HWPX/ODT parsing using **PyMuPDF (`pymupdf`)** as the primary PDF extractor (with `pdftotext`/`pypdf` fallback), alongside `beautifulsoup4` and `hwpx_xml`, recording explicit `extractor` provenance (`93 pymupdf`, `48 beautifulsoup4`, `3 hwpx_xml` across the 144-document corpus; `0` short or wiped documents).
- Legal-heading sectionizer (`Chapter`, `Article N`, `Section N`, `Annex`, `第N条`, `제N조`), PDF repeated header/footer stripping (preserving legal headings), compound-aware de-hyphenation, paragraph reflow, CJK charset detection, NIST/CAC (`cac.gov.cn`) and Korean `law.go.kr` (`#hisComment` / `.cont_subtit`) boilerplate stripping, and ISO/CJK/Japanese era date parsing.

### 3. Structured extraction, risk framing & grounding

- Dynamic codebook injection from `data/taxonomies/label-definitions.json` (`definition`, `include_when`, `exclude_when`) into a multi-provider frontier structured-output layer (`analysis_version: "0.3.0"`, `temperature=0.0`, `600s` timeout, `8192→16384` controls retry): **Google Gemini** (`GeminiAPIClient`, default `gemini-4-neon`, `thinking_level=medium`/`xhigh`) primary, **Anthropic Claude** (`ClaudeAPIClient`, default `claude-opus-5-5`, `effort=low`/`medium`/`high`, genuine dual-breakpoint prompt caching, HTTP `529`/`Retry-After` backoff) fallback, plus zero-cost `ingest-document-analysis` for schema- and grounding-validated offline ingestion.
- Token-aware CJK/Latin chunking (`90k`/`45k` token budgets) with subset deduplication, evidence-weighted framing merges, multi-chunk grounded-span verification, `obligation_strength`, `frame_share`, and required `>= 1` evidence span per v2 label.
- Strict Section 0 provenance guards: legacy files without `analysis_metadata` are flagged `stale_legacy_no_provenance` and refused by `persist-analysis-artifacts` unless `--allow-legacy` is explicitly passed. The committed corpus is 100% homogeneous **Taxonomy v2.1.0** (`144/144` documents analyzed with `gemini-4-neon`, `0` legacy rows).
- NFKC + whitespace/hyphen + ordered-window grounding scorer (`check-grounding`, canonical `0.90` gate, `None` on empty evidence) persisting per-span `grounding_status`, `start_char`, and `end_char` — achieving **`2,786 / 2,786` (`100.0%`)** exact verbatim grounding (`flagged = 0`) across the 144-document corpus.

### 4. Statistical comparative engine (`apps/web/src/lib/scoring.ts`)

- **Population modes (`?mode=headline|all`, legacy aliases `weighted|equal`, plus opt-in `?states=1`):**
  - `headline` (default — Codebook §8.2): strictly filters to sovereign `corpus_role === "primary_instrument"` AND `lifecycle_stage` in `["active", "adopted_not_yet_effective"]` (`n = 91`; unclassified and `subnational_overlay` excluded by default).
  - `all`: equally weights all sovereign analyzed documents (`n = 138`; `n = 144` when `?states=1` opts in the 6 U.S. state statutes).
- **Policy Divergence (`POL`):** Multi-dimensional TVD across `safety_requirements` (`0.45`), `enforcement_mechanisms` (`0.30`, symmetric `none_specified`), and authoritative manifest `binding_strength` (`0.25`, no circular binding-weight multiplication), exposed via `policyBreakdown`.
- **Framing Divergence (`FRM`):** Prefers `frame_share` when present; zeroes sub-`0.15` noise in legacy `frame_confidence` before per-doc normalization; Hamilton `100%` rounding for display.
- **Regime Coverage Index (`COV L1`):** Normalized L1 distance over max binding levels (`0..4`) across all 25 requirement and enforcement controls.
- **Composite (`CMP`):** Secondary invariant `Math.round(0.6 * rawPOL + 0.4 * rawFRM)`.
- **Uncertainty & Sensitivity:** Seeded Mulberry32 200-resample bootstrap 90% CIs + 200-draw permutation null baseline (`nullCalibration`) driving a neutral sequential single-hue scale (`#94a3b8` / `#38bdf8` / `#67e8f9`), plus a 4-mode sensitivity grid with Spearman `ρ`.

## Database schema (`sql/migrations/001`–`005`)

Authoritative production storage runs on Neon Postgres:

- `schema_migrations` (advisory-locked with SHA-256 `checksum`)
- `documents` — authoritative manifest `binding_strength`, `content_sha256`, `publication_date`, `publication_date_precision`, `effective_date`, `source_tier`, `corpus_role`, `lifecycle_stage`, POSIX `normalized_text_path`, `normalized_text`, `sections_json`, `parser_warnings_json`, `parser_version`.
- `document_snapshots` — longitudinal content snapshots (`UNIQUE (document_id, content_sha256, parser_version)`).
- `machine_document_analyses` — indexed on `(document_id, updated_at DESC, id DESC)`, storing `analysis_fingerprint`, `taxonomy_version`, `analyzed_at`, `frame_shares_json`, `grounding_ratio`, `policy_extraction`, `risk_framing`, raw envelopes, and confidence scores.
- Indexed/constrained child tables: `machine_application_domains`, `machine_policy_requirements` (incl. `obligation_strength` CHECK), `machine_enforcement_mechanisms`, `machine_secondary_frames`, `machine_frame_scores`.
- `machine_jurisdiction_analyses` — deterministic jurisdiction syntheses (`analysis_fingerprint` excludes `generated_at`).

## Web & CORS API surface (`apps/web/`, Node ≥ 22.18.0)

### Pages

- `/` — Dynamic decoupling findings, honest provenance banner, opt-in `?states=1` toggle, `POL` vs. `FRM` cards (90% CIs + distinctive gaps + `whitespace-nowrap` badges + `cards/table`), collision-free 2D **Decoupling Map** (`scatter/table`), **5×5 Pairwise Matrix**, longitudinal timeline (`chart/table`, `n < 3` muted), and balanced latest sources
- `/matrix` — Interactive 25×5 Obligation & Clause Matrix with `?states=1` toggle, amber state badges, and `L0–L4` slide-over drawer
- `/clauses` — Cross-Jurisdiction Clause & Citation Explorer across all `2,786` verbatim multilingual quotes with faceted filters, `#quote-*` deep links, and filtered BOM CSV / JSON export
- `/evolution` — Longitudinal Regime Evolution (`2019–2026` SVG trajectory chart + table toggle) and `12` live `supersedes_id` amendment diff cards
- `/compare` — Label-conditioned bilateral diffs (`?a=&b=&mode=headline|all&states=0|1`) with dynamic `generateMetadata`
- `/documents` — Faceted corpus explorer with role/lifecycle/state-overlay badges & filters + quote search
- `/documents/[documentId]` — Rebuilt evidence reader (sticky rail, `Supersedes →` links, humanized taxonomy prose, NFKC `<mark>`, grounding badges, `#quote-*` permalinks, dual-language `quote` + `[MT] quoteEn`, precision dates)
- `/jurisdictions/[slug]` — Unified country readout with 7-link `<TopNav />` and `?mode=headline|all` + `?states=1`
- `/methodology` — Dynamic provider/model provenance disclosure (`formatModelDisplayName()`, verified `v2.1.0` `gemini-4-neon` corpus), live provenance & grounding stats (`2,786 / 2,786 = 100.0%`), live 25-doc stratified multilingual Gold-Set v2 Scorecard (`data/eval/gold_set_v2.json` → `gold_set_results.json` mirrored to `apps/web/src/lib/gold-set-results.snapshot.json`: Req F1 `0.899`, Enf F1 `0.954`, Cohen's κ `0.747`, Krippendorff's α `0.748`, `by_jurisdiction` & per-label P/R/F1), **Corpus Freshness & Supersession Ledger (`#freshness`)**, CIs, null calibration, 4-spec sensitivity grid, 8-frame codebook, API catalog, versioned BibTeX
- `/opengraph-image`, `/robots.txt`, `/sitemap.xml` (including `/matrix`, `/clauses`, `/evolution`, and all 10 compare pairs)

### Public CORS APIs (`Cache-Control: public, s-maxage=300, stale-while-revalidate=60` / `s-maxage=3600` on `/api/clauses`, `Access-Control-Allow-Origin: *`)

- `GET /api/overview?mode=headline|all&states=0|1`
- `GET /api/matrix?mode=headline|all&states=0|1`
- `GET /api/clauses` (`?mode=&states=&category=&control=&j=&minLevel=&obligation=&q=&limit=&offset=&format=json|csv&download=1`)
- `GET /api/evolution?states=0|1`
- `GET /api/jurisdictions?mode=headline|all&states=0|1`
- `GET /api/jurisdictions/[slug]?mode=headline|all&states=0|1`
- `GET /api/documents` (`?j=&role=&life=&b=&f=&s=&t=&r=&q=`)
- `GET /api/documents/[documentId]`
- `GET /api/export?format=csv|json|bibtex&j=&mode=` (UTF-8 BOM taxonomy-key CSV, JSON, versioned BibTeX)
- `POST /api/revalidate` (constant-time `OBSERVATORY_REVALIDATE_SECRET` auth)

## Acceptance criteria

- `make taxonomy && make sources && make validate-artifacts` pass with 0 errors across all **156** committed artifacts (`1` taxonomy, `1` label-definitions, `5` manifests, `144` document analyses, `5` jurisdiction analyses) and **9** Draft 2020-12 JSON Schemas.
- Pipeline `pytest` (`124/124`) and web `npm run lint`, `npx tsc --noEmit`, `npm test` (`18/18`), and `npm run build` (`26` routes) pass 100% on Node 22+ and Ubuntu/Windows CI.
- Production deploys under `VERCEL_ENV` refuse fake `seedData`, surface honest dynamic provenance (`2.1.0` verified `gemini-4-neon` across all 144 documents: `91` active primary sovereign / `138` sovereign + `6` opt-in state overlay), pass WCAG 2.1 AA with `>= 11px` floor and Geist Sans prose, and serve zero exposed prototype routes.
