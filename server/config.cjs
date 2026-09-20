const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const DB_PATH = path.join(DATA_DIR, 'smetacraft.sqlite');
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

const MAX_BODY = 1024 * 1024;
const MAX_ROWS = 500;
const RECORD_VERSION = 1;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const PROJECT_ID_PATTERN = /^[0-9a-f]{32}$/;

module.exports = {
  ROOT,
  DATA_DIR,
  DB_PATH,
  MIGRATIONS_DIR,
  MAX_BODY,
  MAX_ROWS,
  RECORD_VERSION,
  IDEMPOTENCY_KEY_PATTERN,
  PROJECT_ID_PATTERN,
};
