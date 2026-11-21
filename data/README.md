# `data/` — Project Babel Corpus

Everything the observatory registers, ingests, parses, and analyzes lives here. Checked in so the project is reproducible from a fresh clone without hitting any external service.

For the project overview, see the [root README](../README.md). For how these files are produced, see [`../services/pipeline/README.md`](../services/pipeline/README.md).

---

## Layout

```
data/
├── sources/                   Hand-curated v2.0 seed manifests per jurisdiction
│                              (52 official portals, 103 registered seed documents
│                              with explicit corpus_role, lifecycle_stage, and
│                              optional supersedes_id chains).
│
├── taxonomies/                Canonical Taxonomy v2.0.0 vocabulary
│   └── observatory-taxonomy.json
│                              Versioned label sets (jurisdictions, document_types,
│                              binding_strength, issuer_types, source_tiers,
│                              corpus_roles, policy_domains, lifecycle_stages,
│                              policy_requirements, enforcement_mechanisms,
│                              application_domains, risk_framings).
│
├── discovery/                 Cached output of official-portal discovery scans.
│
├── source_tracking/
│   ├── source_inventory.json            Full source inventory
│   ├── source_quality_audit.json        Automated corpus quality audit
│   ├── source_expansion_plan.json       Family-based expansion plan
│   ├── late_2026_priority_targets.json  Curated Apr–Nov 2026 expansion queue
│   ├── kr_statutory_recovery_status.json Browser recovery & stub-replacement tracker
│   └── candidate_enrichment/            Per-URL enrichment cache
│
├── retrieval/                 Append-only fetch run logs and retry history (1:1 with seeds).
│
├── manual_imports/            Local files imported via `observatory import-local-document`
│                              when an official portal is unreachable.
│
├── raw/                       Raw fetched artifacts (1:1 with seeds).
│   └── <jurisdiction>/<document_id>/
│       ├── source.<ext>                 PDF / HTML / HWPX / BIN
│       └── metadata.json                Canonical URL, dates, language, SHA-256, transport
│
├── parsed/                    Normalized text extracted offline from raw/ (1:1 with seeds).
│   └── <jurisdiction>/<document_id>/
│       └── normalized.json              title, language, plain_text, sections[], warnings[]
│
└── analysis/                  Structured policy extraction & 8-frame risk framing (1:1 with seeds).
    ├── <jurisdiction>/<document_id>/
    │   ├── document_analysis.json       Authoritative combined output (all 8 frame keys)
    │   ├── policy_extraction.json       Materialized policy subset
    │   ├── risk_framing.json            Materialized framing subset
    │   ├── policy_response.raw.json     Raw Anthropic API envelope
    │   └── framing_response.raw.json
    └── jurisdictions/<jurisdiction>/
        ├── jurisdiction_input_digest.json
        └── jurisdiction_analysis.json   Aggregated per-jurisdiction synthesis
```

## Scope

Five sovereign jurisdictions are currently tracked (with U.S. state statutes isolated in `late_2026_priority_targets.json#subnational_overlay_candidates`):

- **`united_states`** — 12 portals, 23 registered documents (federal EOs, OMB directives, NIST/CAISI frameworks, FTC/FDA/CFPB/DOJ guidance)
- **`european_union`** — 6 portals, 18 registered documents (AI Act, Commission/AI Office guidelines, GPAI Code of Practice, EDPB/EDPS opinions)
- **`south_korea`** — 9 portals, 16 registered documents (AI Basic Act & Enforcement Decree, AI & Data Administration Act, MSIT/NIA/PIPC/MFDS guidelines)
- **`japan`** — 17 portals, 28 registered documents (Cabinet Office AI Basic Plan & Guidelines, Digital Agency/MIC/METI/MEXT/MHLW/MAFF/PPC/CFA guidance, J-AISI portal)
- **`china`** — 8 portals, 18 registered documents (State Council plans, CAC algorithm/deep-synthesis/GenAI/labeling/anthropomorphic measures, TC260/CMA guidance, NPC/MIIT portals)

Directory names use `snake_case` to match the `JurisdictionKey` enum across Python and TypeScript.

## Provenance & Known Recovery Items

Each document's `raw/<jurisdiction>/<document_id>/metadata.json` records its `canonical_url`, `fetch_url`, `transport` (`http`, `browser`, or `manual_import`), and `sha256`.

Known provenance/recovery items tracked explicitly in [`source_tracking/kr_statutory_recovery_status.json`](source_tracking/kr_statutory_recovery_status.json):

- **South Korea statutory browser recovery:** Three `law.go.kr` statutes (`kr_ai_basic_act`, `kr_ai_and_data_administration_act`, `kr_ai_basic_act_enforcement_decree`) were overwritten with unrendered SPA HTML during an earlier plain-HTTP refresh before initial commit; do not overwrite their existing `analysis/` outputs until re-fetched with `--with-browser`.
- **Historical manual-import summaries:** Two superseded 2021 METI documents (`jp_ai_governance_guidelines_2021`, `jp_ai_governance_ver_1_1_report`, both marked `historical_baseline`/`superseded`) retain compact local excerpt PDFs from `manual_imports/japan/` pending full official PDF retrieval.
- **Truncated long-document re-analysis queue:** Flagship long texts analyzed under the legacy truncated split-pass run (notably `eu_ai_act_regulation_2024_1689`) are queued for full-context/chunked re-analysis once API credentials are configured.

## Licensing Notes

Tracked artifacts are copies of publicly available government publications retained for pipeline reproducibility; the issuing government remains the authoritative source.

| Jurisdiction | Typical licensing regime |
|---|---|
| **United States** | Federal government works are in the public domain under 17 U.S.C. § 105. |
| **European Union** | Commission Decision 2011/833/EU permits reuse with attribution. |
| **Japan** | Government open-data / reuse-with-attribution terms apply across Cabinet Office and ministries. |
| **South Korea** | KOGL (Korea Open Government License) permits reuse with attribution. |
| **China** | Administrative and legislative texts published on official portals (`gov.cn`, `cac.gov.cn`, `tc260.org.cn`). |

## Related Docs

- Research Codebook (v2.0.0): [`../docs/research/codebook.md`](../docs/research/codebook.md)
- Pipeline technical guide: [`../services/pipeline/README.md`](../services/pipeline/README.md)
- Source inventory: [`../docs/operations/source-inventory.md`](../docs/operations/source-inventory.md)
- Source quality audit: [`../docs/operations/source-quality-audit.md`](../docs/operations/source-quality-audit.md)
- Source expansion plan: [`../docs/operations/source-expansion-plan.md`](../docs/operations/source-expansion-plan.md)
- Blocked-source playbook: [`../docs/operations/blocked-source-playbook.md`](../docs/operations/blocked-source-playbook.md)
