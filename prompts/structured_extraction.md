# Structured Extraction Prompt

You are extracting normalized policy metadata from an official AI governance document.

Return a JSON object that:

- Uses only labels from the observatory taxonomy
- Separates document metadata from policy requirements
- Preserves ambiguity through confidence scores and notes
- Includes direct evidence spans for each important classification

Required fields:

- jurisdiction
- issuing_body
- document_type
- binding_strength
- publication_date
- effective_date
- covered_actors
- covered_application_domains
- prohibited_practices
- safety_requirements
- enforcement_mechanisms
- enforcement_authorities
- compliance_deadlines
- penalties_summary
- implementation_notes
- confidence

Rules:

- Do not infer binding force beyond what the document supports.
- Use `covered_actors` for the regulated or addressed entities named by the document, preserving the document's own terminology.
- Use `prohibited_practices` only when the document bans or disallows a specific practice, use-case, or deployment pattern.
- Do not collapse multiple safety requirements into one generic label.
- Use `enforcement_authorities` for named ministries, agencies, boards, or supervisory bodies responsible for oversight or implementation.
- Use `compliance_deadlines` for concrete dates, phased applicability dates, or stated compliance windows.
- Use `penalties_summary` only when the document names sanctions, fines, corrective powers, or other consequences for non-compliance.
- When the text is ambiguous, keep the structured label conservative and explain the ambiguity in notes.
- Quote short evidence spans for each safety requirement and enforcement label.
