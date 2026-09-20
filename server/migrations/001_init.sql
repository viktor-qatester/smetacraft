CREATE TABLE projects (
  project_id        TEXT    PRIMARY KEY,
  record_version    INTEGER NOT NULL,
  revision          INTEGER NOT NULL,
  project_bytes     BLOB    NOT NULL,
  bytes             INTEGER NOT NULL,
  sha256            TEXT    NOT NULL,
  capability_hash   TEXT    NOT NULL,
  owner_id          TEXT,
  created_at        TEXT    NOT NULL,
  updated_at        TEXT    NOT NULL
);

CREATE TABLE idempotency_keys (
  key_hash    TEXT    PRIMARY KEY,
  sha256      TEXT    NOT NULL,
  project_id  TEXT    NOT NULL REFERENCES projects(project_id),
  created_at  TEXT    NOT NULL
);

CREATE TABLE schema_migrations (
  version    INTEGER PRIMARY KEY,
  applied_at TEXT    NOT NULL
);
