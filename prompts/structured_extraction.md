# Structured Extraction Prompt

You are extracting normalized AI governance policy metadata, concrete safeguards, obligation strengths, and enforcement mechanisms from an official government document against the Project Babel Observatory Taxonomy (v2.1).

Return a JSON object that:

- Uses only canonical labels from the observatory taxonomy and strictly follows the canonical codebook `include_when` and `exclude_when` boundaries provided in the system codebook
- Separates document classification (`document_type`) from legal force (`binding_strength`)
- Classifies each extracted safety requirement's `obligation_strength` (`mandatory`, `conditional`, `recommended`, or `aspirational`)
- Preserves ambiguity through explicit confidence scores (`[0.0, 1.0]`) and concise implementation notes
- Includes at least 1 and at most 2 verbatim direct evidence spans (each <= 400 characters) from the source document for every safety requirement and enforcement label

Required fields (when extracting full policy structure; task-focused calls populate their scoped subset):

- `jurisdiction`
- `issuing_body`
- `document_type`
- `binding_strength`
- `publication_date`
- `effective_date`
- `covered_actors`
- `covered_application_domains`
- `prohibited_practices`
- `safety_requirements` (each with `label`, `confidence`, `obligation_strength`, and 1–2 `evidence` spans)
- `enforcement_mechanisms` (each with `label`, `confidence`, and 1–2 `evidence` spans)
- `enforcement_authorities`
- `compliance_deadlines`
- `penalties_summary`
- `implementation_notes`
- `confidence`

Rules:

1. **Binding force hygiene**: Do not infer `binding_law` beyond what the text supports. FAQs, Q&As (`答记者问`, `질의응답`), press releases, consultation drafts, strategy papers, and slide overviews are NOT `binding_law` even when they describe an enacted statute.
2. **Verbatim original-language quotes (capped at 2 spans x 400 chars)**: Every `evidence[].quote` MUST be an exact, contiguous verbatim substring copied directly from the provided document text in its original language (no ellipses `...`, no paraphrasing, no stitched clauses) and at most 400 characters long. Emit at least 1 and at most 2 evidence spans per label. If the document is non-English (e.g., Chinese, Japanese, Korean), put the exact original-language excerpt in `quote` and provide an accurate English translation in `quote_en`.
3. **No duplicate labels**: Emit each taxonomy label at most once in `safety_requirements`, `enforcement_mechanisms`, and `covered_application_domains`. When multiple provisions map to the same canonical label, consolidate them under that single label entry and cite up to 2 representative verbatim spans.
4. **Obligation strength**: Assign `obligation_strength` on each safety requirement (`mandatory` for unconditional binding duties like "shall"/"must", `conditional` for threshold- or scope-triggered binding duties, `recommended` for non-binding "should"/"endeavour to" expectations, and `aspirational` for broad principles without concrete compliance steps).
5. **Canonical dates**: Format `publication_date` and `effective_date` as ISO `YYYY-MM-DD` whenever the exact date appears in the text (or `YYYY-MM` / `YYYY` only when finer precision is genuinely absent; otherwise `null`).
6. **Named actors & authorities**: Use `covered_actors` for the regulated or addressed entities named in the text, and `enforcement_authorities` for named ministries, agencies, boards, or supervisory bodies.
7. **Prohibitions & sanctions**: Populate `prohibited_practices` only when the text bans or disallows a specific practice or deployment pattern. Populate `penalties_summary` only when the text names sanctions, fines, corrective orders, or legal consequences.
8. **Chunking discipline**: When analyzing chunk `i/N` of a longer document, extract ONLY metadata, requirements, enforcement mechanisms, and verbatim quotes that appear directly inside that chunk. Do not speculate about omitted articles or emit ungrounded labels.
9. **Conservative calibration**: Keep `confidence` scores well-calibrated in `[0.0, 1.0]`. Strictly apply codebook `exclude_when` exclusions (for example, do not code "human-centric AI" slogans as `human_oversight`, or applicability self-checks as `pre_deployment_testing`).
