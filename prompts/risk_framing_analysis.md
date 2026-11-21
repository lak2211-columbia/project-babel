# Risk Framing Analysis Prompt

You are analyzing how an official AI governance document frames *why* AI governance is necessary against the Project Babel Observatory Taxonomy (v2.1, eight risk framing labels).

Return a JSON object that:

- Selects exactly one `dominant_frame` from the eight taxonomy labels
- Lists zero or more distinct `secondary_frames` (NEVER repeating `dominant_frame`)
- Assigns a calibrated presence confidence score in `[0.0, 1.0]` for **all eight** taxonomy labels in `frame_confidence`
- Assigns a normalized justification share in `[0.0, 1.0]` for **all eight** taxonomy labels in `frame_share` summing to `1.0` (or all `0.0` only when a chunk contains no framing language)
- Grounds the classification in verbatim evidence spans copied from the document, with each span explicitly tagged with its `frame` label

Framing task:

- Focus on the document's **stated reasons and justifications** for governance, not merely the technical controls it imposes.
- Prefer explicit reasoning language (recitals, purpose clauses, preambles, policy objectives) over inferred intent.
- Follow the canonical codebook `include_when` and `exclude_when` boundaries strictly — in particular, code workforce displacement and worker reskilling under `labor_transition`, NOT `economic_competitiveness`.

Required fields:

- `dominant_frame`
- `secondary_frames`
- `frame_confidence` (all 8 labels in `[0.0, 1.0]`, measuring confidence that each rationale is present)
- `frame_share` (all 8 labels in `[0.0, 1.0]` summing to `1.0`, measuring relative share of justification emphasis)
- `rationale_summary`
- `evidence_spans` (each tagged with `frame`, at most 2 spans per prominent frame, each `quote` <= 400 characters)

Rules:

1. **Score consistency**: Provide numeric scores in `[0.0, 1.0]` for all eight framing labels in both `frame_confidence` and `frame_share`. The `dominant_frame` MUST have the highest (or tied-highest) score in `frame_confidence`, and MUST NOT appear in `secondary_frames`. `frame_share` values MUST sum to `1.0` whenever framing language is present (use `0.0` for absent frames rather than omitting keys).
2. **Separation from policy controls**: Do not classify framing from policy mechanics alone. A document imposing risk assessments to strengthen industrial adoption or global market leadership may still have `economic_competitiveness` or `innovation_enablement` as its dominant frame.
3. **Verbatim original-language quotes with frame tags (capped at 2 spans/frame x 400 chars)**: Every entry in `evidence_spans` MUST include `frame` (the canonical risk framing label it supports) and put an exact, contiguous verbatim substring from the document text in `quote` (<= 400 characters, no ellipses `...`, no paraphrasing). Cap at 2 spans per frame (at most 6 spans total). For non-English documents (Chinese, Japanese, Korean), put the exact original-language passage in `quote` and include a faithful English translation in `quote_en`.
4. **Chunking & no-framing-language escape**: When analyzing chunk `i/N` of a longer document, score ONLY the rationale language actually present in that chunk. If a chunk consists purely of technical tables, definitions, conformity templates, or administrative provisions with NO explicit governance rationale or framing language, set every entry in `frame_confidence` and `frame_share` to `0.0`, set `secondary_frames` to `[]`, set `evidence_spans` to `[]`, and write `"No explicit framing language in this chunk."` in `rationale_summary`.
5. **Transparent trade-offs**: When two or more frames are prominent, justify why `dominant_frame` edges out the runner-up in `rationale_summary`.
