const { openDatabase } = require('./db.cjs');
const { StorageError } = require('./project-repository.cjs');

const STATUSES = new Set(['quarantine', 'validated', 'available', 'rejected']);

function mapRecord(row) {
  if (!row) return null;
  return {
    objectId: row.object_id,
    projectId: row.project_id,
    originalName: row.original_name,
    mediaType: row.media_type,
    bytes: row.bytes,
    sha256: row.sha256,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createSqliteFileMetadataRepository(options = {}) {
  const dbPath = options.dbPath;
  if (!dbPath) throw new StorageError(new Error('dbPath required'));
  const db = options.db || openDatabase(dbPath);

  function insertFileObject({
    objectId, projectId, originalName, mediaType, bytes, sha256, status, now,
  }) {
    if (!STATUSES.has(status)) throw new StorageError(new Error('invalid_status'));
    try {
      db.prepare(`
        INSERT INTO file_objects (
          object_id, project_id, original_name, media_type, bytes, sha256, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(objectId, projectId, originalName, mediaType, bytes, sha256, status, now, now);
      return getFileObject({ objectId, projectId });
    } catch (error) {
      throw new StorageError(error);
    }
  }

  function getFileObject({ objectId, projectId }) {
    try {
      return mapRecord(db.prepare(
        'SELECT * FROM file_objects WHERE object_id = ? AND project_id = ?'
      ).get(objectId, projectId));
    } catch (error) {
      throw new StorageError(error);
    }
  }

  function findBySha256({ projectId, sha256 }) {
    try {
      return mapRecord(db.prepare(
        `SELECT * FROM file_objects
         WHERE project_id = ? AND sha256 = ? AND status != 'rejected'
         ORDER BY created_at ASC LIMIT 1`
      ).get(projectId, sha256));
    } catch (error) {
      throw new StorageError(error);
    }
  }

  function updateStatus({ objectId, projectId, status, now }) {
    if (!STATUSES.has(status)) throw new StorageError(new Error('invalid_status'));
    try {
      db.prepare(`
        UPDATE file_objects SET status = ?, updated_at = ?
        WHERE object_id = ? AND project_id = ?
      `).run(status, now, objectId, projectId);
      return getFileObject({ objectId, projectId });
    } catch (error) {
      throw new StorageError(error);
    }
  }

  function listByProject({ projectId }) {
    try {
      return db.prepare(
        `SELECT * FROM file_objects WHERE project_id = ? AND status != 'rejected' ORDER BY created_at ASC`
      ).all(projectId).map(mapRecord);
    } catch (error) {
      throw new StorageError(error);
    }
  }

  function countByProject({ projectId }) {
    try {
      return db.prepare(
        `SELECT COUNT(*) AS count FROM file_objects WHERE project_id = ? AND status != 'rejected'`
      ).get(projectId).count;
    } catch (error) {
      throw new StorageError(error);
    }
  }

  function close() {
    if (!options.db) db.close();
  }

  return {
    insertFileObject,
    getFileObject,
    findBySha256,
    updateStatus,
    listByProject,
    countByProject,
    close,
  };
}

module.exports = { createSqliteFileMetadataRepository, mapRecord };
