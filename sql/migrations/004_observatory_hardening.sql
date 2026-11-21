-- Migration 004: Observatory schema hardening, FK indexes, constraints, and longitudinal versioning
ALTER TABLE IF EXISTS schema_migrations
    ADD COLUMN IF NOT EXISTS checksum TEXT;
-- statement-break
ALTER TABLE IF EXISTS documents
    ADD COLUMN IF NOT EXISTS content_sha256 TEXT,
    ADD COLUMN IF NOT EXISTS effective_date DATE,
    ADD COLUMN IF NOT EXISTS publication_date_precision TEXT,
    ADD COLUMN IF NOT EXISTS source_tier TEXT,
    ADD COLUMN IF NOT EXISTS corpus_role TEXT,
    ADD COLUMN IF NOT EXISTS lifecycle_stage TEXT,
    ADD COLUMN IF NOT EXISTS sections_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS parser_warnings_json JSONB NOT NULL DEFAULT '[]'::jsonb;
-- statement-break
ALTER TABLE IF EXISTS machine_document_analyses
    ADD COLUMN IF NOT EXISTS content_sha256 TEXT,
    ADD COLUMN IF NOT EXISTS taxonomy_version TEXT,
    ADD COLUMN IF NOT EXISTS grounding_ratio NUMERIC(4, 3);
-- statement-break
CREATE INDEX IF NOT EXISTS documents_jurisdiction_corpus_role_idx
    ON documents (jurisdiction, corpus_role, publication_date DESC);
-- statement-break
CREATE INDEX IF NOT EXISTS machine_application_domains_analysis_idx
    ON machine_application_domains (machine_analysis_id);
-- statement-break
CREATE INDEX IF NOT EXISTS machine_policy_requirements_analysis_idx
    ON machine_policy_requirements (machine_analysis_id);
-- statement-break
CREATE INDEX IF NOT EXISTS machine_enforcement_mechanisms_analysis_idx
    ON machine_enforcement_mechanisms (machine_analysis_id);
-- statement-break
CREATE INDEX IF NOT EXISTS machine_secondary_frames_analysis_idx
    ON machine_secondary_frames (machine_analysis_id);
-- statement-break
CREATE INDEX IF NOT EXISTS machine_frame_scores_analysis_idx
    ON machine_frame_scores (machine_analysis_id);
-- statement-break
DELETE FROM machine_application_domains a
USING machine_application_domains b
WHERE a.id > b.id
  AND a.machine_analysis_id = b.machine_analysis_id
  AND a.label = b.label;
-- statement-break
CREATE UNIQUE INDEX IF NOT EXISTS machine_application_domains_unique_idx
    ON machine_application_domains (machine_analysis_id, label);
-- statement-break
DELETE FROM machine_policy_requirements a
USING machine_policy_requirements b
WHERE a.id > b.id
  AND a.machine_analysis_id = b.machine_analysis_id
  AND a.label = b.label;
-- statement-break
CREATE UNIQUE INDEX IF NOT EXISTS machine_policy_requirements_unique_idx
    ON machine_policy_requirements (machine_analysis_id, label);
-- statement-break
DELETE FROM machine_enforcement_mechanisms a
USING machine_enforcement_mechanisms b
WHERE a.id > b.id
  AND a.machine_analysis_id = b.machine_analysis_id
  AND a.label = b.label;
-- statement-break
CREATE UNIQUE INDEX IF NOT EXISTS machine_enforcement_mechanisms_unique_idx
    ON machine_enforcement_mechanisms (machine_analysis_id, label);
-- statement-break
DELETE FROM machine_secondary_frames a
USING machine_secondary_frames b
WHERE a.id > b.id
  AND a.machine_analysis_id = b.machine_analysis_id
  AND a.frame = b.frame;
-- statement-break
CREATE UNIQUE INDEX IF NOT EXISTS machine_secondary_frames_unique_idx
    ON machine_secondary_frames (machine_analysis_id, frame);
-- statement-break
DELETE FROM machine_frame_scores a
USING machine_frame_scores b
WHERE a.id > b.id
  AND a.machine_analysis_id = b.machine_analysis_id
  AND a.frame = b.frame;
-- statement-break
CREATE UNIQUE INDEX IF NOT EXISTS machine_frame_scores_unique_idx
    ON machine_frame_scores (machine_analysis_id, frame);
-- statement-break
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'machine_document_analyses_confidence_bounds_chk'
    ) THEN
        ALTER TABLE machine_document_analyses
            ADD CONSTRAINT machine_document_analyses_confidence_bounds_chk
            CHECK (
                overall_confidence >= 0 AND overall_confidence <= 1
                AND dominant_frame_confidence >= 0 AND dominant_frame_confidence <= 1
                AND (grounding_ratio IS NULL OR (grounding_ratio >= 0 AND grounding_ratio <= 1))
            );
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'machine_policy_requirements_confidence_chk'
    ) THEN
        ALTER TABLE machine_policy_requirements
            ADD CONSTRAINT machine_policy_requirements_confidence_chk
            CHECK (confidence >= 0 AND confidence <= 1);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'machine_enforcement_mechanisms_confidence_chk'
    ) THEN
        ALTER TABLE machine_enforcement_mechanisms
            ADD CONSTRAINT machine_enforcement_mechanisms_confidence_chk
            CHECK (confidence >= 0 AND confidence <= 1);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'machine_frame_scores_score_chk'
    ) THEN
        ALTER TABLE machine_frame_scores
            ADD CONSTRAINT machine_frame_scores_score_chk
            CHECK (score >= 0 AND score <= 1);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'machine_jurisdiction_analyses_confidence_chk'
    ) THEN
        ALTER TABLE machine_jurisdiction_analyses
            ADD CONSTRAINT machine_jurisdiction_analyses_confidence_chk
            CHECK (overall_confidence >= 0 AND overall_confidence <= 1);
    END IF;
END $$;
-- statement-break
CREATE TABLE IF NOT EXISTS document_snapshots (
    id BIGSERIAL PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    content_sha256 TEXT NOT NULL,
    parser_version TEXT NOT NULL,
    title TEXT NOT NULL,
    publication_date DATE,
    effective_date DATE,
    normalized_text TEXT NOT NULL,
    sections_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    raw_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (document_id, content_sha256, parser_version)
);
-- statement-break
CREATE INDEX IF NOT EXISTS document_snapshots_document_captured_idx
    ON document_snapshots (document_id, captured_at DESC);
-- statement-break
