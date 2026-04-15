CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    jurisdiction TEXT NOT NULL,
    title TEXT NOT NULL,
    canonical_url TEXT,
    issuing_body_hint TEXT,
    language TEXT NOT NULL,
    publication_date DATE,
    raw_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    raw_artifact_path TEXT,
    normalized_text_path TEXT NOT NULL,
    normalized_text TEXT NOT NULL,
    parser_version TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- statement-break
CREATE INDEX IF NOT EXISTS documents_jurisdiction_publication_idx
    ON documents (jurisdiction, publication_date DESC);
-- statement-break
CREATE TABLE IF NOT EXISTS machine_document_analyses (
    id BIGSERIAL PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    analysis_fingerprint TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    effort TEXT,
    analysis_version TEXT NOT NULL,
    taxonomy_hash TEXT NOT NULL,
    extraction_prompt_hash TEXT NOT NULL,
    framing_prompt_hash TEXT NOT NULL,
    policy_extraction JSONB NOT NULL,
    risk_framing JSONB NOT NULL,
    raw_policy_response JSONB NOT NULL,
    raw_framing_response JSONB NOT NULL,
    overall_confidence NUMERIC(4, 3) NOT NULL,
    dominant_frame_confidence NUMERIC(4, 3) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- statement-break
CREATE INDEX IF NOT EXISTS machine_document_analyses_document_created_idx
    ON machine_document_analyses (document_id, created_at DESC);
-- statement-break
CREATE TABLE IF NOT EXISTS machine_application_domains (
    id BIGSERIAL PRIMARY KEY,
    machine_analysis_id BIGINT NOT NULL REFERENCES machine_document_analyses(id) ON DELETE CASCADE,
    label TEXT NOT NULL
);
-- statement-break
CREATE INDEX IF NOT EXISTS machine_application_domains_label_idx
    ON machine_application_domains (label);
-- statement-break
CREATE TABLE IF NOT EXISTS machine_policy_requirements (
    id BIGSERIAL PRIMARY KEY,
    machine_analysis_id BIGINT NOT NULL REFERENCES machine_document_analyses(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    confidence NUMERIC(4, 3) NOT NULL,
    evidence JSONB NOT NULL DEFAULT '[]'::jsonb
);
-- statement-break
CREATE INDEX IF NOT EXISTS machine_policy_requirements_label_idx
    ON machine_policy_requirements (label);
-- statement-break
CREATE TABLE IF NOT EXISTS machine_enforcement_mechanisms (
    id BIGSERIAL PRIMARY KEY,
    machine_analysis_id BIGINT NOT NULL REFERENCES machine_document_analyses(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    confidence NUMERIC(4, 3) NOT NULL,
    evidence JSONB NOT NULL DEFAULT '[]'::jsonb
);
-- statement-break
CREATE INDEX IF NOT EXISTS machine_enforcement_mechanisms_label_idx
    ON machine_enforcement_mechanisms (label);
-- statement-break
CREATE TABLE IF NOT EXISTS machine_secondary_frames (
    id BIGSERIAL PRIMARY KEY,
    machine_analysis_id BIGINT NOT NULL REFERENCES machine_document_analyses(id) ON DELETE CASCADE,
    frame TEXT NOT NULL
);
-- statement-break
CREATE INDEX IF NOT EXISTS machine_secondary_frames_frame_idx
    ON machine_secondary_frames (frame);
-- statement-break
CREATE TABLE IF NOT EXISTS machine_frame_scores (
    id BIGSERIAL PRIMARY KEY,
    machine_analysis_id BIGINT NOT NULL REFERENCES machine_document_analyses(id) ON DELETE CASCADE,
    frame TEXT NOT NULL,
    score NUMERIC(4, 3) NOT NULL
);
-- statement-break
CREATE INDEX IF NOT EXISTS machine_frame_scores_frame_idx
    ON machine_frame_scores (frame);
-- statement-break
