# Source Registry

## Goal

Build the official-source layer for maximum cross-jurisdiction comparability without diluting legal or provenance quality.

The registry prioritizes:

1. **Official primary sources** (legislatures, executive offices, regulators, ministries, national standards bodies, AI safety institutes)
2. **Cross-jurisdiction comparability** across the five tracked jurisdictions (US, EU, South Korea, Japan, China)
3. **Stable, safe retrieval paths** with verifiable SHA-256 content hashes and append-only logs
4. **Clear analytical separation** between primary instruments, companion resources, consultations/drafts, and historical baselines

## Inclusion rules

- Include only official government, legislative, regulatory, or public standards-body sources.
- Prefer canonical legal texts and full PDFs over landing-page wrappers, press summaries, or FAQs.
- Never ingest synthetic summaries as primary documents; every manual import must preserve the original official publication and provenance URL.
- Use `source_portals` for recurring discovery surfaces and `seed_documents` for curated instruments tracked directly in the corpus.

## Manifest layout & schema contract

Each jurisdiction manifest lives in `data/sources/<jurisdiction>.json` and is validated against [`packages/schemas/source-manifest.schema.json`](../../packages/schemas/source-manifest.schema.json) and `data/taxonomies/observatory-taxonomy.json` (Taxonomy v2.1.0) via `validate-sources` and `validate-artifacts`.

Top-level fields:

- `manifest_version`
- `jurisdiction`
- `description`
- `source_portals`
- `seed_documents`

### Seed document fields (Taxonomy v2.1.0)

Each `seed_documents[]` entry defines:

- `id`, `title`, `issuing_body`, `canonical_url`, optional `retrieval_urls[]`
- Browser-capture directives (`browser_required`, `browser_wait_for_selector`, `browser_min_text_length`, `browser_click_selectors`)
- Orthogonal classification axes:
  - `document_type` (`legislation`, `executive_order`, `regulatory_guidance`, `strategy_paper`, `standards_guideline`, `voluntary_commitment`)
  - `binding_strength` (`binding_law`, `executive_action`, `regulatory_guidance`, `standards_guideline`, `voluntary_commitment`, `strategy_statement`)
  - `source_tier` (`statutory_rule`, `executive_action`, `regulatory_guidance`, `technical_standard`, `policy_strategy`, `implementation_resource`, `voluntary_framework`)
  - `corpus_role` (`primary_instrument`, `companion_resource`, `draft_consultation`, `historical_baseline`)
  - `lifecycle_stage` (`draft`, `adopted_not_yet_effective`, `active`, `superseded`)
  - `supersedes_id` (optional document ID link for longitudinal supersession chains)
  - `policy_domains[]` (19 domains including `agentic_ai`, `embodied_physical_ai`, `companion_ai`, `sovereign_compute`)
- Strict ISO calendar dates (`publication_date`, optional `effective_date` in `YYYY-MM-DD`)
- `languages[]`, `document_format` (`html` | `pdf` | `mixed`), `source_portal_ids[]`, `priority`, `relevance_notes`, `tags[]`

### Source portals & discovery targets

Portals register official registries, ministry libraries, AI safety institutes (`aisi.go.jp`, `nist.gov`, `tc260.org.cn`, `eur-lex.europa.eu`, `federalregister.gov`, `msit.go.kr`, `npc.gov.cn`), and helpdesks. `discovery_targets[]` support `html_links` and recursive `sitemap` / `sitemapindex` crawls with URL/title filters, `same_host_only` guards, and optional browser rendering.

## Storage conventions

All paths persisted inside JSON metadata and Postgres are POSIX repo-relative paths (`/`):

- Raw artifacts & metadata: `data/raw/<jurisdiction>/<document_id>/`
- Parsed text & sections: `data/parsed/<jurisdiction>/<document_id>/normalized.json`
- Append-only retrieval logs: `data/retrieval/<jurisdiction>/<document_id>.json`
- Discovery candidate scans: `data/discovery/<jurisdiction>/<portal_id>.json`
- Enrichment cache: `data/source_tracking/candidate_enrichment/<jurisdiction>/<portal_id>.json`
- Tracking snapshots:
  - `data/source_tracking/source_inventory.json`
  - `data/source_tracking/source_expansion_plan.json`
  - `data/source_tracking/source_quality_audit.json`
  - `data/source_tracking/late_2026_priority_targets.json` (curated late-2026 expansion queue)
- Generated markdown reports:
  - `docs/operations/source-inventory.md`
  - `docs/operations/source-expansion-plan.md`
  - `docs/operations/source-quality-audit.md`
  - `docs/operations/blocked-source-playbook.md`

## Retrieval & parsing safety guarantees

- **SSRF protection:** Shared URL validator allows only `http`/`https`, resolves hosts, and blocks loopback, private, link-local, and multicast IPs (including redirect targets), enforcing a response byte cap.
- **Strict HTTP & PDF checks:** Browser and HTTP downloads reject non-`2xx` responses (`<200` or `>=400`), verify `%PDF-` magic bytes before classifying payloads as PDFs, and validate/log linked PDFs.
- **SPA-overwrite protection:** Plain HTTP fetches cannot overwrite a larger existing artifact belonging to a `browser_required: true` document with a smaller client-rendered shell (protecting `law.go.kr` and similar JS portals).
- **Conditional refresh & metadata preservation:** Fetch sends `If-None-Match` / `If-Modified-Since` when available and preserves parser-populated metadata keys across `--refresh` runs.
- **Strictly offline parsing:** All embedded/linked artifact fetching occurs during retrieval; `parse-raw-documents` reads local raw artifacts only.

## Validation & routine commands

POSIX (`make`) or cross-platform (`python -m observatory.cli` from `services/pipeline` with `PYTHONPATH=src`):

```bash
# Validate taxonomy and all five source manifests
python -m observatory.cli validate-taxonomy
python -m observatory.cli validate-sources
python -m observatory.cli summarize-sources

# Discovery, enrichment, and promotion
python -m observatory.cli discover-source-candidates --refresh
python -m observatory.cli report-source-coverage
python -m observatory.cli report-source-expansion-plan
python -m observatory.cli report-source-quality-audit
python -m observatory.cli enrich-source-candidates --refresh
python -m observatory.cli promote-source-families

# Fetch (with optional browser fallback) and offline parse
python -m observatory.cli fetch-seed-documents --refresh
python -m observatory.cli fetch-seed-documents south_korea --refresh --with-browser
python -m observatory.cli parse-raw-documents

# Full discovery + fetch + coverage refresh loop
python -m observatory.cli refresh-sources
```

For blocked official portals where the authentic primary file was acquired manually:

```bash
python -m observatory.cli import-local-document \
  <jurisdiction> <document_id> /path/to/official_file.pdf \
  --source-url=<canonical_url>
```

See [`docs/operations/blocked-source-playbook.md`](blocked-source-playbook.md) for portal-specific recovery procedures and the late-2026 ingestion queue.
