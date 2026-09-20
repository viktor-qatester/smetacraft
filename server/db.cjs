const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { MIGRATIONS_DIR } = require('./config.cjs');

function listMigrationFiles() {
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter(name => /^\d+_.+\.sql$/.test(name))
    .sort((left, right) => Number(left.slice(0, 3)) - Number(right.slice(0, 3)));
}

function expectedSchemaVersion() {
  const files = listMigrationFiles();
  if (files.length === 0) return 0;
  return Number(files[files.length - 1].slice(0, 3));
}

function openDatabase(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA synchronous = FULL');
  return db;
}

function appliedSchemaVersion(db) {
  try {
    const row = db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get();
    return row && Number.isInteger(row.version) ? row.version : 0;
  } catch {
    return 0;
  }
}

function applyMigrations(dbPath) {
  const db = openDatabase(dbPath);
  const now = new Date().toISOString();
  try {
    for (const file of listMigrationFiles()) {
      const version = Number(file.slice(0, 3));
      const current = appliedSchemaVersion(db);
      if (version <= current) continue;
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      db.exec('BEGIN');
      try {
        db.exec(sql);
        db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(version, now);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    }
  } finally {
    db.close();
  }
  return expectedSchemaVersion();
}

function isStorageReady(dbPath) {
  try {
    const db = openDatabase(dbPath);
    try {
      return appliedSchemaVersion(db) === expectedSchemaVersion();
    } finally {
      db.close();
    }
  } catch {
    return false;
  }
}

module.exports = {
  applyMigrations,
  expectedSchemaVersion,
  isStorageReady,
  openDatabase,
  appliedSchemaVersion,
};
