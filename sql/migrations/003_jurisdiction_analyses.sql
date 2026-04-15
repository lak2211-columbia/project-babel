CREATE TABLE IF NOT EXISTS machine_jurisdiction_analyses (
    id BIGSERIAL PRIMARY KEY,
    jurisdiction TEXT NOT NULL,
    analysis_fingerprint TEXT NOT NULL UNIQUE,
    analysis_version TEXT NOT NULL,
    analysis_method TEXT NOT NULL,
    taxonomy_hash TEXT NOT NULL,
    source_document_count INTEGER NOT NULL,
    source_document_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    source_window_start DATE,
    source_window_end DATE,
    analysis_payload JSONB NOT NULL,
    input_digest JSONB NOT NULL,
    overall_confidence NUMERIC(4, 3) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- statement-break
CREATE INDEX IF NOT EXISTS machine_jurisdiction_analyses_jurisdiction_created_idx
    ON machine_jurisdiction_analyses (jurisdiction, created_at DESC);
-- statement-break
