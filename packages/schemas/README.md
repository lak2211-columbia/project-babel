# `packages/schemas` — Shared Cross-Language Contracts

Versioned **JSON Schema (Draft 2020-12)** contracts shared between the Python pipeline (`services/pipeline/`), committed corpus artifacts (`data/`), and the TypeScript web application (`apps/web/`).

All schemas align with **Taxonomy v2.1.0** (`data/taxonomies/observatory-taxonomy.json`) and canonical definitions (`data/taxonomies/label-definitions.json`), and are enforced automatically in CI via `make validate-artifacts` (`observatory.schema_validation`).

## Schema catalog

| Schema file | Governs | CI-enforced? |
|---|---|---|
| [`observatory-taxonomy.schema.json`](observatory-taxonomy.schema.json) | `data/taxonomies/observatory-taxonomy.json` — semantic versioning metadata and all 13 canonical label registries (including `obligation_strengths`, `corpus_roles`, 17 `policy_requirements`, 19 `policy_domains`, and 8 `risk_framings`). | Yes (`validate-artifacts`) |
| [`label-definitions.schema.json`](label-definitions.schema.json) | `data/taxonomies/label-definitions.json` — single machine-readable source of truth for `definition`, `include_when`, `exclude_when` across all 7 categories plus canonical thresholds (`grounding_pass_threshold: 0.90`, `low_confidence_policy: 0.70`, `low_confidence_framing: 0.60`, `frame_mention_floor: 0.15`). | Yes (`validate-artifacts`) |
| [`source-manifest.schema.json`](source-manifest.schema.json) | `data/sources/<jurisdiction>.json` — `source_portals`, `discovery_targets`, and `seed_documents` (`corpus_role`, `lifecycle_stage`, `supersedes_id`, `source_tier`, authoritative `binding_strength`, browser settings). | Yes (`validate-artifacts`) |
| [`document-analysis.schema.json`](document-analysis.schema.json) | `data/analysis/<jurisdiction>/<document_id>/document_analysis.json` — `PolicyExtraction` (incl. `obligation_strength`), `RiskFramingAnalysis` (incl. optional `frame_share`), `EvidenceSpan` (`quote`, `quote_en`, `frame`, `grounding_status`, `start_char`, `end_char`), and `analysis_metadata` (`AnalysisProvenance` incl. `analyzed_at`). Uses conditional `if`/`then` rules to require `>= 1` evidence span on all v2 analyses while keeping legacy April 2026 read compatibility. | Yes (`validate-artifacts`) |
| [`jurisdiction-analysis.schema.json`](jurisdiction-analysis.schema.json) | `data/analysis/jurisdictions/<jurisdiction>/jurisdiction_analysis.json` and `machine_jurisdiction_analyses.analysis_payload` — deterministic per-jurisdiction synthesis and aggregate mixes. | Yes (`validate-artifacts`) |
| [`overview-api.schema.json`](overview-api.schema.json) | `GET /api/overview?mode=headline\|all` — `OverviewData` comparative snapshot (`hasData`, `scoringMode`, honest `taxonomyVersion`, `datasetVersion`, `provenanceSummary`, `nullCalibration`, `findings`, `sensitivityGrid`, per-country bootstrap 90% CIs, `coverageDivergence`, `distinctiveGaps`, `obligationLevels`, `pairwiseDetails`, `timeline`, `queue`). | Verified by `@web-verifier` & `apps/web` TypeScript/unit tests |
| [`matrix-api.schema.json`](matrix-api.schema.json) | `GET /api/matrix?mode=headline\|all` — 25×5 Obligation & Clause Matrix (`ObligationMatrixData` with `L0–L4` strongest binding levels and linked instruments/bilingual quotes). | Verified by `@web-verifier` & `apps/web` TypeScript/unit tests |

## Enforcement & synchronization

1. **Automated CI validation:** `.github/workflows/ci.yml` executes `make taxonomy && make sources && make validate-artifacts` (`jsonschema` Draft 2020-12 with `FormatChecker`), validating all **115** committed corpus artifacts (`observatory-taxonomy.json`, `label-definitions.json`, 5 manifests, 103 document analyses, and 5 jurisdiction analyses) with zero errors.
2. **Taxonomy updates:** Update `observatory-taxonomy.json`, `label-definitions.json`, the schemas here, `services/pipeline/src/observatory/models.py`, and `apps/web/src/lib/taxonomy-vocab.ts` together (the web test suite asserts verbatim parity with `label-definitions.json`).
3. **Pydantic schema export:** Diff live Python models against these files at any time:
   ```bash
   PYTHONPATH=services/pipeline/src python -m observatory.cli export-schemas /tmp/exported-schemas
   ```
