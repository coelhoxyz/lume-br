CREATE TABLE ingestion_jobs_next (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('catalog', 'expenses-bulk', 'legislation-bulk')),
  scope TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  updated_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  error TEXT
);

INSERT INTO ingestion_jobs_next(id,kind,scope,status,updated_at,attempts,error)
SELECT id,kind,scope,status,updated_at,attempts,error FROM ingestion_jobs;

DROP TABLE ingestion_jobs;
ALTER TABLE ingestion_jobs_next RENAME TO ingestion_jobs;

CREATE UNIQUE INDEX ingestion_jobs_one_active_kind
ON ingestion_jobs(kind) WHERE status IN ('queued', 'running');
