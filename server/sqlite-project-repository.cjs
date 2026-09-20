const { RECORD_VERSION } = require('./config.cjs');
const { openDatabase } = require('./db.cjs');
const { ConflictError, StorageError } = require('./project-repository.cjs');

function mapRecord(row) {
  if (!row) return null;
  return {
    recordVersion: row.record_version,
    projectId: row.project_id,
    revision: row.revision,
    projectBytes: Buffer.from(row.project_bytes),
    bytes: row.bytes,
    sha256: row.sha256,
    capabilityHash: row.capability_hash,
    ownerId: row.owner_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isUniqueConstraintError(error) {
  const message = error && typeof error.message === 'string' ? error.message : '';
  return message.includes('UNIQUE constraint failed') ||
    message.includes('SQLITE_CONSTRAINT_UNIQUE') ||
    (error && error.code === 'SQLITE_CONSTRAINT_UNIQUE');
}

function createSqliteProjectRepository(options = {}) {
  const dbPath = options.dbPath;
  if (!dbPath) throw new StorageError(new Error('dbPath required'));

  const db = openDatabase(dbPath);

  function readByIdempotency(idempotencyKeyHash) {
    return db.prepare(
      'SELECT sha256, project_id FROM idempotency_keys WHERE key_hash = ?'
    ).get(idempotencyKeyHash);
  }

  function readProject(projectId) {
    return mapRecord(db.prepare('SELECT * FROM projects WHERE project_id = ?').get(projectId));
  }

  function createProject({ projectId, bytes, sha256, capabilityHash, idempotencyKeyHash, now }) {
    try {
      db.exec('BEGIN IMMEDIATE');
      const existing = readByIdempotency(idempotencyKeyHash);
      if (existing) {
        if (existing.sha256 !== sha256) {
          db.exec('ROLLBACK');
          throw new ConflictError();
        }
        const record = readProject(existing.project_id);
        db.exec('COMMIT');
        return { record, replayed: true };
      }

      db.prepare(`
        INSERT INTO projects (
          project_id, record_version, revision, project_bytes, bytes, sha256,
          capability_hash, owner_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        projectId,
        RECORD_VERSION,
        1,
        bytes,
        bytes.length,
        sha256,
        capabilityHash,
        null,
        now,
        now,
      );
      db.prepare(`
        INSERT INTO idempotency_keys (key_hash, sha256, project_id, created_at)
        VALUES (?, ?, ?, ?)
      `).run(idempotencyKeyHash, sha256, projectId, now);
      db.exec('COMMIT');
      return { record: readProject(projectId), replayed: false };
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch {}
      if (error instanceof ConflictError) throw error;
      if (isUniqueConstraintError(error)) {
        const existing = readByIdempotency(idempotencyKeyHash);
        if (!existing) throw new StorageError(error);
        if (existing.sha256 !== sha256) throw new ConflictError();
        return { record: readProject(existing.project_id), replayed: true };
      }
      throw new StorageError(error);
    }
  }

  function getProject({ projectId }) {
    try {
      return readProject(projectId);
    } catch (error) {
      throw new StorageError(error);
    }
  }

  function countProjects() {
    return db.prepare('SELECT COUNT(*) AS count FROM projects').get().count;
  }

  function close() {
    db.close();
  }

  return { createProject, getProject, countProjects, close };
}

module.exports = { createSqliteProjectRepository, mapRecord };
