# Official Source Manifests

These manifests define the official source surface for each target jurisdiction.

They are intentionally split into:

- `source_portals`: authoritative places to monitor
- `seed_documents`: high-value documents to ingest first

Source portals may also include `discovery_targets`, which define how the pipeline should scan an official portal or sitemap for new candidate documents. Discovery targets are meant for recurring refresh workflows and write cached outputs into `data/discovery/`.

Promotion workflow:

1. `observatory discover-source-candidates --refresh`
2. `observatory report-source-expansion-plan`
3. `observatory enrich-source-candidates --refresh`
4. `observatory promote-source-families`

Current manifests:

- `china.json`
- `european_union.json`
- `japan.json`
- `south_korea.json`
- `united_states.json`

Use `observatory validate-sources` before adding or editing entries.
Use `observatory discover-source-candidates --refresh` to test new discovery targets against live official sources.
