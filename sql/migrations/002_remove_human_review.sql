ALTER TABLE IF EXISTS machine_document_analyses
    DROP COLUMN IF EXISTS review_recommended;
-- statement-break
DROP TABLE IF EXISTS review_events;
-- statement-break
DROP TABLE IF EXISTS review_tasks;
-- statement-break
DROP TABLE IF EXISTS approved_document_analyses;
