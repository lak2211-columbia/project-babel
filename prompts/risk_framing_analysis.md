# Risk Framing Analysis Prompt

You are analyzing how an official AI governance document frames the problem of AI risk.

Return a JSON object that:

- Chooses one dominant framing label
- Includes zero or more secondary framing labels
- Uses only labels from the observatory taxonomy
- Includes confidence scores and evidence spans

Framing task:

- Focus on the document's stated reasons for governance.
- Prefer direct reasoning language over inferred intent.
- Keep geopolitical, economic, rights-based, and public order framings distinct.

Required fields:

- dominant_frame
- secondary_frames
- frame_confidence
- rationale_summary
- evidence_spans

Rules:

- Do not classify the document by policy content alone.
- If the document emphasizes competitiveness while imposing safety measures, the framing may still be `economic_competitiveness`.
- If multiple frames are strong, name one dominant frame and justify the choice.

