#!/usr/bin/env node
const { DB_PATH } = require('./config.cjs');
const { applyMigrations, expectedSchemaVersion, isStorageReady } = require('./db.cjs');

const dbPath = process.argv[2] || DB_PATH;
applyMigrations(dbPath);
if (!isStorageReady(dbPath)) {
  process.stderr.write(`Migration incomplete for ${dbPath}\n`);
  process.exit(1);
}
process.stdout.write(`Applied migrations through version ${expectedSchemaVersion()} at ${dbPath}\n`);
