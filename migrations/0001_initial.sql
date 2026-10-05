CREATE TABLE IF NOT EXISTS deputies (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  source_url TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  catalog_version TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

CREATE INDEX IF NOT EXISTS deputies_active_name ON deputies(active, id);

CREATE TABLE IF NOT EXISTS datasets (
  scope TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  since TEXT NOT NULL,
  until TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  count INTEGER NOT NULL CHECK (count >= 0),
  source_url TEXT NOT NULL,
  raw_key TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS records (
  scope TEXT NOT NULL,
  version TEXT NOT NULL,
  id TEXT NOT NULL,
  date TEXT NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (scope, version, id)
);

CREATE INDEX IF NOT EXISTS records_current_lookup ON records(scope, version, date DESC);

CREATE TABLE IF NOT EXISTS ingestion_jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('catalog', 'expenses-bulk')),
  scope TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  updated_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  error TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS ingestion_jobs_one_active_kind
ON ingestion_jobs(kind) WHERE status IN ('queued', 'running');
