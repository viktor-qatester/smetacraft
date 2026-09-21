const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  ROOT, DB_PATH, BLOB_ROOT, MAX_BODY, RECORD_VERSION, IDEMPOTENCY_KEY_PATTERN, PROJECT_ID_PATTERN,
} = require('./config.cjs');
const { validProject } = require('./project-validator.cjs');
const { isStorageReady } = require('./db.cjs');
const {
  createProjectRepository, ConflictError, StorageError,
} = require('./project-repository.cjs');
const { createFileStore } = require('./file-store.cjs');
const { createFileMetadataRepository } = require('./file-metadata-repository.cjs');
const { createFileHandlers } = require('./file-http.cjs');

function sendJson(res, status, value) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(value));
}

function sendRawJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

function fail(res, status, code) {
  sendJson(res, status, { ok: false, error: code });
}

function validLocalAuthority(req) {
  const port = req.socket.localPort;
  if (!Number.isSafeInteger(port) || port <= 0) return false;
  const suffix = port === 80 ? '' : `:${port}`;
  const authorities = new Map([
    [`127.0.0.1${suffix}`, `http://127.0.0.1${suffix}`],
    [`localhost${suffix}`, `http://localhost${suffix}`],
  ]);
  if (port === 80) {
    authorities.set('127.0.0.1:80', 'http://127.0.0.1');
    authorities.set('localhost:80', 'http://localhost');
  }
  const host = typeof req.headers.host === 'string' ? req.headers.host.toLowerCase() : '';
  const expectedOrigin = authorities.get(host);
  if (!expectedOrigin) return false;
  const origin = req.headers.origin;
  return origin === undefined ||
    (typeof origin === 'string' && origin.toLowerCase() === expectedOrigin);
}

function hashIdempotencyKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function capabilityHash(projectId, token) {
  return crypto.createHash('sha256').update(`${projectId}:${token}`).digest('hex');
}

function generateProjectId() {
  return crypto.randomBytes(16).toString('hex');
}

function generateCapabilityToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function readJsonBody(req, res, onBody) {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] || '')) {
    fail(res, 415, 'unsupported_media_type');
    return;
  }
  if (!validLocalAuthority(req)) {
    fail(res, 403, 'origin_forbidden');
    return;
  }
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > MAX_BODY) {
    fail(res, 413, 'body_too_large');
    return;
  }
  const chunks = [];
  let bytes = 0;
  let finished = false;
  req.on('data', chunk => {
    if (finished) return;
    bytes += chunk.length;
    if (bytes > MAX_BODY) {
      finished = true;
      chunks.length = 0;
      fail(res, 413, 'body_too_large');
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => {
    if (finished) return;
    onBody(Buffer.concat(chunks));
  });
}

function migrateEnvelope(record, extra = {}) {
  return {
    ok: true,
    recordVersion: record.recordVersion,
    projectId: record.projectId,
    revision: record.revision,
    bytes: record.bytes,
    sha256: record.sha256,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...extra,
  };
}

function buildGetBody(record) {
  const envelope = JSON.stringify({
    ok: true,
    recordVersion: record.recordVersion,
    projectId: record.projectId,
    revision: record.revision,
    bytes: record.bytes,
    sha256: record.sha256,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ownerId: record.ownerId,
  });
  return `${envelope.slice(0, -1)},"project":${record.projectBytes.toString('utf8')}}`;
}

function parseBearerToken(req) {
  const header = req.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length);
  return token.length > 0 ? token : null;
}

function timingSafeHashEqual(left, right) {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function handleCheck(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'method_not_allowed');
  readJsonBody(req, res, body => {
    let project;
    try {
      project = JSON.parse(body.toString('utf8'));
    } catch {
      return fail(res, 400, 'invalid_json');
    }
    if (!validProject(project)) return fail(res, 422, 'invalid_project_v1');
    sendJson(res, 200, {
      ok: true,
      bytes: body.length,
      sha256: crypto.createHash('sha256').update(body).digest('hex'),
    });
  });
}

function handleMigrate(req, res, repository) {
  if (req.method !== 'POST') return fail(res, 405, 'method_not_allowed');
  const idempotencyKey = req.headers['idempotency-key'];
  if (idempotencyKey === undefined) return fail(res, 400, 'idempotency_key_required');
  if (typeof idempotencyKey !== 'string' || !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    return fail(res, 400, 'invalid_idempotency_key');
  }
  readJsonBody(req, res, body => {
    let project;
    try {
      project = JSON.parse(body.toString('utf8'));
    } catch {
      return fail(res, 400, 'invalid_json');
    }
    if (!validProject(project)) return fail(res, 422, 'invalid_project_v1');
    const sha256 = crypto.createHash('sha256').update(body).digest('hex');
    const now = new Date().toISOString();
    const projectId = generateProjectId();
    const capabilityToken = generateCapabilityToken();
    const hash = capabilityHash(projectId, capabilityToken);
    try {
      const result = repository.createProject({
        projectId,
        bytes: body,
        sha256,
        capabilityHash: hash,
        idempotencyKeyHash: hashIdempotencyKey(idempotencyKey),
        now,
      });
      const payload = migrateEnvelope(result.record, {
        replayed: result.replayed,
      });
      if (!result.replayed) {
        payload.capabilityToken = capabilityToken;
      }
      sendJson(res, result.replayed ? 200 : 201, payload);
    } catch (error) {
      if (error instanceof ConflictError) return fail(res, 409, 'idempotency_key_conflict');
      if (error instanceof StorageError) return fail(res, 503, 'storage_unavailable');
      return fail(res, 503, 'storage_unavailable');
    }
  });
}

function handleGetProject(req, res, projectId, repository) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'method_not_allowed');
  if (!validLocalAuthority(req)) return fail(res, 403, 'origin_forbidden');
  const token = parseBearerToken(req);
  if (!token) return fail(res, 401, 'capability_required');
  let record;
  try {
    record = repository.getProject({ projectId });
  } catch (error) {
    if (error instanceof StorageError) return fail(res, 503, 'storage_unavailable');
    return fail(res, 503, 'storage_unavailable');
  }
  if (!record || !timingSafeHashEqual(record.capabilityHash, capabilityHash(projectId, token))) {
    return fail(res, 404, 'not_found');
  }
  const body = buildGetBody(record);
  if (req.method === 'HEAD') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Length': Buffer.byteLength(body),
    });
    return res.end();
  }
  sendRawJson(res, 200, body);
}

function handleStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'method_not_allowed');
  const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
  if (relative !== 'index.html' && !/^js\/(?:core|ui|app)\/[a-z0-9-]+\.js$/.test(relative)) {
    return fail(res, 404, 'not_found');
  }
  const filename = path.join(ROOT, relative);
  fs.readFile(filename, (error, body) => {
    if (error) return fail(res, 404, 'not_found');
    res.writeHead(200, {
      'Content-Type': relative.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  });
}

function createServer(options = {}) {
  const dbPath = options.dbPath || DB_PATH;
  const blobRoot = options.blobRoot || (options.dbPath
    ? path.join(path.dirname(options.dbPath), 'blobs')
    : BLOB_ROOT);
  const storageReady = isStorageReady(dbPath);
  const repository = storageReady ? createProjectRepository({ dbPath }) : null;
  const fileStore = storageReady ? createFileStore({ blobRoot }) : null;
  const fileMeta = storageReady ? createFileMetadataRepository({ dbPath }) : null;
  const fileHandlers = storageReady ? createFileHandlers({
    fail,
    validLocalAuthority,
    parseBearerToken,
    timingSafeHashEqual,
    capabilityHash,
    projectRepository: repository,
    fileStore,
    fileMeta,
  }) : null;
  if (fileStore) fileStore.cleanupTemps();

  return http.createServer((req, res) => {
    let pathname;
    try {
      pathname = new URL(req.url, 'http://localhost').pathname;
    } catch {
      return fail(res, 400, 'bad_url');
    }
    if (pathname === '/api/project-check') return handleCheck(req, res);
    if (pathname === '/api/projects/migrate') {
      if (!repository) return fail(res, 503, 'storage_unavailable');
      return handleMigrate(req, res, repository);
    }
    if (fileHandlers && fileHandlers.tryHandle(req, res, pathname)) return;
    const projectMatch = pathname.match(/^\/api\/projects\/([0-9a-f]{32})$/);
    if (projectMatch) {
      if (!repository) return fail(res, 503, 'storage_unavailable');
      return handleGetProject(req, res, projectMatch[1], repository);
    }
    if (pathname.startsWith('/api/')) return fail(res, 404, 'not_found');
    handleStatic(req, res, pathname);
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 8000);
  if (!isStorageReady(DB_PATH)) {
    process.stderr.write('Storage unavailable: run node server/db-migrate.cjs before starting the server.\n');
    process.exit(1);
  }
  createServer().listen(port, '127.0.0.1', () => {
    process.stdout.write(`SmetaCraft: http://127.0.0.1:${port}/\n`);
  });
}

module.exports = { createServer };
