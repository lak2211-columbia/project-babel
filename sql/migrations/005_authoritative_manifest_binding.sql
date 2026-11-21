-- Migration 005: Authoritative manifest binding strength, deterministic latest-analysis index, obligation strength, frame shares, and analyzed_at provenance
ALTER TABLE IF EXISTS documents
    ADD COLUMN IF NOT EXISTS binding_strength TEXT;
-- statement-break
CREATE INDEX IF NOT EXISTS idx_machine_document_analyses_doc_updated
    ON machine_document_analyses (document_id, updated_at DESC, id DESC);
-- statement-break
ALTER TABLE IF EXISTS machine_policy_requirements
    ADD COLUMN IF NOT EXISTS obligation_strength TEXT;
-- statement-break
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'machine_policy_requirements_obligation_strength_chk'
    ) THEN
        ALTER TABLE machine_policy_requirements
            ADD CONSTRAINT machine_policy_requirements_obligation_strength_chk
            CHECK (
                obligation_strength IS NULL
                OR obligation_strength IN ('mandatory', 'conditional', 'recommended', 'aspirational')
            );
    END IF;
END $$;
-- statement-break
ALTER TABLE IF EXISTS machine_document_analyses
    ADD COLUMN IF NOT EXISTS frame_shares_json JSONB,
    ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMPTZ;
-- statement-break
