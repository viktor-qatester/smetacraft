CREATE TABLE file_objects (
  object_id     TEXT    PRIMARY KEY,
  project_id    TEXT    NOT NULL REFERENCES projects(project_id),
  original_name TEXT    NOT NULL,
  media_type    TEXT    NOT NULL,
  bytes         INTEGER NOT NULL,
  sha256        TEXT    NOT NULL,
  status        TEXT    NOT NULL CHECK (status IN ('quarantine', 'validated', 'available', 'rejected')),
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL
);

CREATE INDEX file_objects_project ON file_objects(project_id);
CREATE INDEX file_objects_project_sha ON file_objects(project_id, sha256);
