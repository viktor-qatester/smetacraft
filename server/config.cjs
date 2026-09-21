const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const DB_PATH = path.join(DATA_DIR, 'smetacraft.sqlite');
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

const MAX_BODY = 1024 * 1024;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_FILES_PER_PROJECT = 20;
const MAX_ROWS = 500;
const RECORD_VERSION = 1;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const PROJECT_ID_PATTERN = /^[0-9a-f]{32}$/;
const OBJECT_ID_PATTERN = /^[0-9a-f]{32}$/;
const BLOB_ROOT = path.join(DATA_DIR, 'blobs');
const PDF_MEDIA_TYPE = 'application/pdf';
const DOCX_MEDIA_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

module.exports = {
  ROOT,
  DATA_DIR,
  DB_PATH,
  MIGRATIONS_DIR,
  BLOB_ROOT,
  MAX_BODY,
  MAX_FILE_BYTES,
  MAX_FILES_PER_PROJECT,
  MAX_ROWS,
  RECORD_VERSION,
  IDEMPOTENCY_KEY_PATTERN,
  PROJECT_ID_PATTERN,
  OBJECT_ID_PATTERN,
  PDF_MEDIA_TYPE,
  DOCX_MEDIA_TYPE,
};
