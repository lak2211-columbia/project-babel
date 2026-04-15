# Source Registry

## Goal

Build the source layer for maximum analytical coverage without diluting provenance quality.

The registry should prioritize:

1. Official primary sources
2. Cross-jurisdiction comparability
3. Stable retrieval paths
4. Clear separation between source portals and seed documents

## Inclusion rules

- Include only official government, legislative, regulatory, or standards-body sources in the primary registry.
- Prefer canonical publication pages over third-party mirrors.
- Use seed documents for high-value instruments that are analytically important enough to ingest immediately.
- Use source portals for broader coverage surfaces that should later be crawled or reviewed periodically.

## Manifest layout

Each jurisdiction manifest lives in `data/sources/<jurisdiction>.json`.

Each manifest contains:

- `manifest_version`
- `jurisdiction`
- `description`
- `source_portals`
- `seed_documents`

## Source portal guidance

Use source portals for:

- legal text repositories
- ministry or commission policy portals
- implementation helpdesks
- official document libraries

Portals should make it easy to expand coverage later without rewriting the schema.

Portals can also define `discovery_targets` for recurring candidate scans. A discovery target points at an official landing page or sitemap and can filter candidates by:

- URL substring patterns
- visible link-title patterns
- same-host restrictions
- optional browser-backed rendering for JS-heavy official sites

## Seed document guidance

Seed documents should represent:

- binding laws or executive actions
- foundational strategies
- current regulator guidance
- high-signal implementation materials

Each seed document should include:

- canonical URL
- optional retrieval URLs when the canonical page is not the most stable machine fetch target
- optional browser flags for JS-heavy official portals
- document type
- binding strength
- source portal references
- language metadata
- priority
- short relevance note

## Storage conventions

- Raw artifacts: `data/raw/<jurisdiction>/<document_id>/`
- Parsed text: `data/parsed/<jurisdiction>/<document_id>/`
- Retrieval logs: `data/retrieval/<jurisdiction>/<document_id>.json`
- Discovery candidates: `data/discovery/<jurisdiction>/<portal_id>.json`
- Candidate enrichment snapshots: `data/source_tracking/candidate_enrichment/<jurisdiction>/<portal_id>.json`
- Source inventory snapshots: `data/source_tracking/source_inventory.json`
- Source expansion plan snapshots: `data/source_tracking/source_expansion_plan.json`
- Human-readable source inventory: `docs/operations/source-inventory.md`
- Human-readable source expansion plan: `docs/operations/source-expansion-plan.md`
- Blocked-source recovery playbook: `docs/operations/blocked-source-playbook.md`

Each successful fetch updates `metadata.json` under the raw artifact directory with:

- `sha256` content hash
- `content_bytes`
- `artifact_state` (`new`, `updated`, or `unchanged`)
- `retrieval_count`
- `fetch_url` and `resolved_url` so the exact machine retrieval path is auditable
- `etag` and `last_modified` when exposed by the upstream server
- `retrieval_log_path`

## Validation

Run:

```bash
make sources
cd services/pipeline && . .venv/bin/activate && PYTHONPATH=src python -m observatory.cli summarize-sources
cd services/pipeline && . .venv/bin/activate && PYTHONPATH=src python -m observatory.cli discover-source-candidates --refresh
cd services/pipeline && . .venv/bin/activate && PYTHONPATH=src python -m observatory.cli discover-source-candidates japan --refresh --with-browser
cd services/pipeline && . .venv/bin/activate && PYTHONPATH=src python -m observatory.cli report-source-coverage
cd services/pipeline && . .venv/bin/activate && PYTHONPATH=src python -m observatory.cli report-source-expansion-plan
cd services/pipeline && . .venv/bin/activate && PYTHONPATH=src python -m observatory.cli refresh-sources
make fetch
# refresh an existing jurisdiction and compare hashes
cd services/pipeline && . .venv/bin/activate && PYTHONPATH=src python -m observatory.cli fetch-seed-documents united_states --refresh --max-attempts=5
make parse
```

Validation currently checks:

- manifest filename and jurisdiction match
- unique ids
- known taxonomy labels for document type and binding strength
- valid portal references
- basic URL and date structure

The fetch command now also:

- retries transient network and HTTP failures
- writes an append-only retrieval log for each document
- preserves fetch-attempt history across refresh runs
- distinguishes unchanged source refreshes from source updates using SHA-256 hashes
- supports ranked `retrieval_urls` before the canonical URL
- can discover linked official PDFs from an official HTML landing page for PDF-type documents
- can use `--with-browser` for documents marked as browser-required in the manifest
- records whether the successful artifact came from `http` or `browser` transport

The discovery command:

- scans official portals without immediately promoting every candidate into the corpus
- writes cached candidate lists per portal for later review and diffing
- supports browser-backed discovery for sites that render links client-side
- can be used as the front half of a recurring freshness workflow

The coverage report command:

- writes a machine-readable source inventory inside the repo
- writes a markdown inventory that explains where information is flowing from by jurisdiction
- writes a blocked-source playbook with recovery commands for any official seed document still missing locally
- records, for each seed document, whether it has been fetched, parsed, and analyzed
- records, for each seed document, the latest retrieval status so blocked sources stay visible
- records, for each portal, how many cached discovery candidates are currently available

The expansion plan command:

- ranks discovery candidates before they become seed documents
- identifies which portals deserve immediate promotion work versus discovery-filter cleanup
- proposes a first-pass source tier and policy-domain classification for each high-signal candidate

The enrichment command:

- fetches representative high-signal candidates before promotion
- extracts publication dates, languages, resolved titles, and linked PDF artifacts when possible
- writes a persistent metadata layer that promotion can reuse

The promotion command:

- converts high-signal candidate families into new seed documents
- refuses promotion when publication date or language metadata is missing
- preserves canonical URLs while adding retrieval URLs for downloadable PDF artifacts

The refresh command:

- runs discovery, fetch, and coverage generation in one pass
- accepts jurisdiction scoping plus portal scoping for targeted refresh runs
- can enable browser-backed discovery and fetch separately
- prints the remaining blocked seed documents at the end so the next recovery action is explicit

When an official source is blocked from the current runtime environment but the official file can be acquired manually, use:

```bash
cd services/pipeline && . .venv/bin/activate && PYTHONPATH=src \
  python -m observatory.cli import-local-document <jurisdiction> <document_id> /absolute/path/to/file
```

This preserves provenance by writing the raw artifact, metadata, and retrieval log into the same tracked layout used by automated fetches.

## Completeness strategy

The registry should expand in layers:

1. Official portals per jurisdiction
2. Foundational laws, strategies, and guidance
3. Sector-specific or implementation-level guidance
4. Historical backfill
5. Portal discovery scans and candidate review
6. Automated freshness checks

This keeps the system useful early while still moving toward broad coverage.
