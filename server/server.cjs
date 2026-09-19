const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const MAX_BODY = 1024 * 1024;
const MAX_ROWS = 500;

function sendJson(res, status, value) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(value));
}

function fail(res, status, code) {
  sendJson(res, status, { ok: false, error: code });
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function numeric(value, integer = false) {
  const validString = typeof value === 'string' &&
    /^\s*[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?\s*$/.test(value);
  const number = typeof value === 'number' ? value :
    validString ? Number(value.trim().replace(',', '.')) : NaN;
  return Number.isFinite(number) && (!integer || (Number.isSafeInteger(number) && number > 0));
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

// Transport preflight for JSON v1. The browser's established importer remains
// the authority for applying a project to the form.
function validProject(project) {
  if (!isObject(project) || project.format !== 'smetacraft-project' || project.version !== 1) return false;
  if (project.block !== undefined &&
      !['intake', 'slab', 'strip', 'walls', 'plaster', 'floor', 'roof', 'summary', 'price', 'project'].includes(project.block)) return false;
  if (project.billBlock !== undefined &&
      !['slab', 'strip', 'walls', 'floor', 'plaster', 'roof', 'summary'].includes(project.billBlock)) return false;
  for (const section of ['fields', 'checks', 'radios', 'flags']) {
    if (project[section] !== undefined && !isObject(project[section])) return false;
  }
  if (project.fields && Object.values(project.fields).some(value =>
    typeof value !== 'string' && !(typeof value === 'number' && Number.isFinite(value)))) return false;
  if (project.checks && Object.values(project.checks).some(value => typeof value !== 'boolean')) return false;
  if (project.radios && project.radios['summary-found-type'] !== undefined &&
      !['slab', 'strip'].includes(project.radios['summary-found-type'])) return false;
  if (project.flags && Object.entries(project.flags).some(([key, value]) =>
    key === 'lastFoundationBlock' ? !['slab', 'strip'].includes(value) : typeof value !== 'boolean')) return false;
  for (const section of ['openings', 'piles']) {
    const rows = project[section];
    if (rows === undefined) continue;
    if (!Array.isArray(rows) || rows.length > MAX_ROWS) return false;
    if (rows.some((row, index) => {
      if (!isObject(row) || (row.id !== undefined &&
          (typeof row.id !== 'number' || !numeric(row.id, true))) ||
          (row.locked !== undefined && typeof row.locked !== 'boolean')) return true;
      if (section === 'openings') {
        if (row.type !== undefined && !['window', 'entry-door', 'interior-door'].includes(row.type)) return true;
        return [['width', 'w'], ['height', 'h'], ['count', 'n']].some(([name, alias]) =>
          row[name] !== undefined || row[alias] !== undefined
            ? !numeric(row[name] !== undefined ? row[name] : row[alias]) : false);
      }
      return (row.name !== undefined && (typeof row.name !== 'string' || row.name.length > 256)) ||
        (row.diameterMm !== undefined && ![200, 250, 300, 350, 400].includes(row.diameterMm)) ||
        (row.depthM !== undefined && !numeric(row.depthM)) ||
        (row.count !== undefined && !numeric(row.count, true));
    })) return false;
  }
  return true;
}

function handleCheck(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'method_not_allowed');
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] || '')) {
    return fail(res, 415, 'unsupported_media_type');
  }
  if (!validLocalAuthority(req)) {
    return fail(res, 403, 'origin_forbidden');
  }
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > MAX_BODY) return fail(res, 413, 'body_too_large');
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
    let project;
    const body = Buffer.concat(chunks);
    try {
      project = JSON.parse(body.toString('utf8'));
    } catch {
      return fail(res, 400, 'invalid_json');
    }
    if (!validProject(project)) return fail(res, 422, 'invalid_project_v1');
    sendJson(res, 200, {
      ok: true,
      bytes,
      sha256: crypto.createHash('sha256').update(body).digest('hex'),
    });
  });
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

function createServer() {
  return http.createServer((req, res) => {
    let pathname;
    try {
      pathname = new URL(req.url, 'http://localhost').pathname;
    } catch {
      return fail(res, 400, 'bad_url');
    }
    if (pathname === '/api/project-check') return handleCheck(req, res);
    if (pathname.startsWith('/api/')) return fail(res, 404, 'not_found');
    handleStatic(req, res, pathname);
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 8000);
  createServer().listen(port, '127.0.0.1', () => {
    process.stdout.write(`SmetaCraft: http://127.0.0.1:${port}/\n`);
  });
}

module.exports = { createServer };
