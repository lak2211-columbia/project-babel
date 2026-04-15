# Comprehensive Source System

## Objective

Move the observatory from a hand-curated seed corpus to a portal-driven, family-aware source system that can support a substantially larger and more defensible policy database.

The goal is not to maximize raw document count. The goal is to maximize official-source coverage while preserving analytical quality.

## Coverage standard

For each jurisdiction, the source system should aim to cover these buckets:

1. `statutory_rule`
2. `strategy_architecture`
3. `implementation_guidance`
4. `enforcement_interpretation`
5. `technical_standard`
6. `sectoral_guidance`
7. `consultation_draft`
8. `voluntary_framework`

## Core design choices

### 1. Family-based planning

Discovery candidates are grouped into document families rather than treated as isolated pages.

Examples:

- wrapper page + downloadable PDF
- English variant + French variant
- main guidance + FAQ
- press release + underlying instrument

This avoids overcounting and lets the promotion process prefer substantive artifacts.

### 2. Source roles

Each candidate is classified into a source role:

- `primary_text`
- `wrapper_page`
- `faq`
- `consultation_draft`
- `implementation_tool`
- `press_release`
- `download_index`
- `navigation_hub`
- `translation_variant`
- `supporting_context`

This gives the system a way to separate primary analytical material from context and navigation surfaces.

### 3. Substantive scoring

Candidates are scored using:

- AI relevance
- instrument-like title signals
- role-based adjustments
- PDF/artifact bonuses
- low-signal penalties

That score drives recommendations:

- `promote_now`
- `inspect_next`
- `monitor_only`
- `context_only`

### 4. Portal completeness planning

Each portal now gets expected coverage buckets inferred from its issuer type, portal kind, and tags.

That makes it possible to ask:

- what this portal should contain
- what the current corpus already covers
- which buckets are still missing
- whether the next action is expansion, inspection, or discovery-filter retuning

## Operating model

1. Run discovery
2. Evaluate candidates
3. Group candidates into families
4. Compare family backlog against portal coverage buckets
5. Promote high-signal families into the seed corpus
6. Fetch, parse, analyze, persist
7. Recompute source inventory and expansion plan

## Practical target ranges

- United States: `40-70`
- European Union: `40-80`
- Japan: `40-70`
- South Korea: `25-50`
- China: `30-60`

These are working ranges for the current research scope, not hard caps.

## Current implementation

The repo now supports:

- family-aware source planning in `services/pipeline/src/observatory/source_ops.py`
- a richer generated source expansion plan in `docs/operations/source-expansion-plan.md`
- automatic regeneration of the expansion plan during `refresh-sources`
- candidate enrichment with publication-date and language extraction before promotion
- manifest promotion of high-signal families into durable seed documents

## Next implementation steps

1. Promote the top backlog families jurisdiction by jurisdiction until each region reaches its minimum corpus floor
2. Add instrument-number-aware deduping for more jurisdictions
3. Add portal-specific discovery templates for low-precision portals
4. Expose source-role and family provenance in the web UI
5. Add recurring refresh automation once the promotion cadence is stable
