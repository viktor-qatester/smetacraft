const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../server/server.cjs');
const { applyMigrations, isStorageReady, expectedSchemaVersion } = require('../server/db.cjs');
const { createProjectRepository } = require('../server/project-repository.cjs');
const { createApp } = require('./runtime.cjs');
const golden = require('./golden.json');

function tempDbPath(name) {
  return path.join(os.tmpdir(), `smetacraft-${name}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`);
}

function canonicalBody(raw) {
  const { context } = createApp();
  return JSON.stringify(context.parseProjectText(JSON.stringify(raw)));
}

function digest(body) {
  return crypto.createHash('sha256').update(body).digest('hex');
}

async function withServer(dbPath, run) {
  applyMigrations(dbPath);
  const server = createServer({ dbPath });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(base, server, dbPath);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

function migrate(base, body, idempotencyKey, headers = {}) {
  return fetch(`${base}/api/projects/migrate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
      ...headers,
    },
    body,
  });
}

function getProject(base, projectId, token, headers = {}) {
  return fetch(`${base}/api/projects/${projectId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      ...headers,
    },
  });
}

function rawRequest(base, pathname, method, headers = {}, body) {
  const target = new URL(base);
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: target.hostname,
      port: target.port,
      path: pathname,
      method,
      headers,
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        body: Buffer.concat(chunks).toString('utf8'),
        headers: response.headers,
      }));
    });
    request.on('error', reject);
    if (body !== undefined) request.end(body);
    else request.end();
  });
}

test('migrate stores project and readback returns identical canonical bytes', async () => {
  await withServer(tempDbPath('readback'), async (base) => {
    const body = canonicalBody(golden.jsonRoundTrip.exported);
    const key = crypto.randomUUID();
    const post = await migrate(base, body, key);
    assert.equal(post.status, 201);
    const receipt = await post.json();
    assert.equal(receipt.ok, true);
    assert.match(receipt.projectId, /^[0-9a-f]{32}$/);
    assert.equal(receipt.sha256, digest(body));
    const read = await getProject(base, receipt.projectId, receipt.capabilityToken);
    assert.equal(read.status, 200);
    const text = await read.text();
    const parsed = JSON.parse(text);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.sha256, receipt.sha256);
    assert.deepEqual(JSON.stringify(parsed.project), body);
  });
});

test('readback sha256 matches the digest computed before POST', async () => {
  await withServer(tempDbPath('digest'), async (base) => {
    const body = canonicalBody(golden.jsonRoundTrip.exported);
    const expected = digest(body);
    const post = await migrate(base, body, crypto.randomUUID());
    const receipt = await post.json();
    assert.equal(receipt.sha256, expected);
    const read = await getProject(base, receipt.projectId, receipt.capabilityToken);
    const envelope = JSON.parse(await read.text());
    assert.equal(envelope.sha256, expected);
    const readbackBody = JSON.stringify(envelope.project);
    assert.equal(digest(readbackBody), expected);
  });
});

test('same idempotency key and same digest returns the first receipt and creates no second row', async () => {
  await withServer(tempDbPath('replay'), async (base, _server, dbPath) => {
    const body = canonicalBody(golden.jsonRoundTrip.exported);
    const key = 'same-idempotency-key-01';
    const first = await migrate(base, body, key);
    assert.equal(first.status, 201);
    const receipt = await first.json();
    const second = await migrate(base, body, key);
    assert.equal(second.status, 200);
    const replay = await second.json();
    assert.equal(replay.replayed, true);
    assert.equal(replay.projectId, receipt.projectId);
    assert.equal(replay.sha256, receipt.sha256);
    assert.equal(replay.capabilityToken, undefined);
    const repo = createProjectRepository({ dbPath });
    assert.equal(repo.countProjects(), 1);
    repo.close();
  });
});

test('same idempotency key and different body returns 409 idempotency_key_conflict', async () => {
  await withServer(tempDbPath('conflict'), async (base, _server, dbPath) => {
    const key = 'conflict-idempotency-key';
    const bodyA = canonicalBody(golden.jsonRoundTrip.exported);
    const bodyB = canonicalBody({ ...golden.jsonRoundTrip.exported, block: 'slab' });
    assert.notEqual(digest(bodyA), digest(bodyB));
    assert.equal((await migrate(base, bodyA, key)).status, 201);
    const conflict = await migrate(base, bodyB, key);
    assert.equal(conflict.status, 409);
    assert.deepEqual(await conflict.json(), { ok: false, error: 'idempotency_key_conflict' });
    const repo = createProjectRepository({ dbPath });
    assert.equal(repo.countProjects(), 1);
    repo.close();
  });
});

test('missing Idempotency-Key returns 400 idempotency_key_required', async () => {
  await withServer(tempDbPath('missing-key'), async (base) => {
    const response = await fetch(`${base}/api/projects/migrate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: canonicalBody(golden.jsonRoundTrip.exported),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { ok: false, error: 'idempotency_key_required' });
  });
});

test('malformed Idempotency-Key returns 400 invalid_idempotency_key', async () => {
  await withServer(tempDbPath('bad-key'), async (base) => {
    const response = await migrate(base, canonicalBody(golden.jsonRoundTrip.exported), 'short');
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { ok: false, error: 'invalid_idempotency_key' });
  });
});

test('GET without Authorization returns 401 capability_required', async () => {
  await withServer(tempDbPath('no-auth'), async (base) => {
    const post = await migrate(base, canonicalBody(golden.jsonRoundTrip.exported), crypto.randomUUID());
    const receipt = await post.json();
    const response = await fetch(`${base}/api/projects/${receipt.projectId}`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { ok: false, error: 'capability_required' });
  });
});

test('GET with unknown projectId returns 404 not_found', async () => {
  await withServer(tempDbPath('unknown-id'), async (base) => {
    const response = await getProject(base, '0'.repeat(32), 'token');
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { ok: false, error: 'not_found' });
  });
});

test('GET with wrong token for an existing project returns 404 not_found', async () => {
  await withServer(tempDbPath('wrong-token'), async (base) => {
    const post = await migrate(base, canonicalBody(golden.jsonRoundTrip.exported), crypto.randomUUID());
    const receipt = await post.json();
    const response = await getProject(base, receipt.projectId, 'wrong-token-value');
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { ok: false, error: 'not_found' });
  });
});

test('capability token of project A cannot read project B', async () => {
  await withServer(tempDbPath('cross-token'), async (base) => {
    const body = canonicalBody(golden.jsonRoundTrip.exported);
    const a = await (await migrate(base, body, crypto.randomUUID())).json();
    const b = await (await migrate(base, body, crypto.randomUUID())).json();
    const response = await getProject(base, b.projectId, a.capabilityToken);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { ok: false, error: 'not_found' });
  });
});

test('malformed projectId in the route returns 404 not_found', async () => {
  await withServer(tempDbPath('bad-route'), async (base) => {
    const response = await fetch(`${base}/api/projects/not-a-valid-id`, {
      headers: { Authorization: 'Bearer token' },
    });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { ok: false, error: 'not_found' });
  });
});

test('invalid JSON v1 returns 422 and creates no row', async () => {
  await withServer(tempDbPath('invalid-v1'), async (base, _server, dbPath) => {
    const body = JSON.stringify({ format: 'smetacraft-project', version: 1, fields: [] });
    const response = await migrate(base, body, crypto.randomUUID());
    assert.equal(response.status, 422);
    const repo = createProjectRepository({ dbPath });
    assert.equal(repo.countProjects(), 0);
    repo.close();
  });
});

test('body over 1 MiB returns 413 and creates no row', async () => {
  await withServer(tempDbPath('large-body'), async (base, _server, dbPath) => {
    const body = JSON.stringify({
      format: 'smetacraft-project',
      version: 1,
      extra: 'x'.repeat(1024 * 1024),
    });
    const response = await migrate(base, body, crypto.randomUUID());
    assert.equal(response.status, 413);
    const repo = createProjectRepository({ dbPath });
    assert.equal(repo.countProjects(), 0);
    repo.close();
  });
});

test('foreign Host or Origin returns 403 on both endpoints', async () => {
  await withServer(tempDbPath('origin'), async (base) => {
    const body = canonicalBody(golden.jsonRoundTrip.exported);
    const port = new URL(base).port;
    const post = await rawRequest(
      base,
      '/api/projects/migrate',
      'POST',
      {
        Host: `evil.test:${port}`,
        Origin: `http://evil.test:${port}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': crypto.randomUUID(),
        'Content-Length': Buffer.byteLength(body),
      },
      body,
    );
    assert.equal(post.status, 403);
    assert.deepEqual(JSON.parse(post.body), { ok: false, error: 'origin_forbidden' });
    const get = await rawRequest(
      base,
      `/api/projects/${'a'.repeat(32)}`,
      'GET',
      {
        Host: `evil.test:${port}`,
        Origin: `http://evil.test:${port}`,
        Authorization: 'Bearer token',
      },
    );
    assert.equal(get.status, 403);
    assert.deepEqual(JSON.parse(get.body), { ok: false, error: 'origin_forbidden' });
  });
});

test('wrong method and wrong media type are rejected', async () => {
  await withServer(tempDbPath('method'), async (base) => {
    assert.equal((await fetch(`${base}/api/projects/migrate`)).status, 405);
    const badType = await fetch(`${base}/api/projects/migrate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: '{}',
    });
    assert.equal(badType.status, 415);
    const post = await migrate(base, canonicalBody(golden.jsonRoundTrip.exported), crypto.randomUUID());
    const receipt = await post.json();
    assert.equal((await fetch(`${base}/api/projects/${receipt.projectId}`, { method: 'POST' })).status, 405);
  });
});

test('storage failure returns 503 and leaves no partial row', async () => {
  const dirPath = path.join(os.tmpdir(), `smetacraft-dir-${process.pid}`);
  fs.mkdirSync(dirPath, { recursive: true });
  const server = createServer({ dbPath: dirPath });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await migrate(base, canonicalBody(golden.jsonRoundTrip.exported), crypto.randomUUID());
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ok: false, error: 'storage_unavailable' });
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
});

test('records survive server restart and are readable with the same token', async () => {
  const dbPath = tempDbPath('restart');
  applyMigrations(dbPath);
  const body = canonicalBody(golden.jsonRoundTrip.exported);
  const key = crypto.randomUUID();
  let receipt;
  {
    const server = createServer({ dbPath });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    receipt = await (await migrate(base, body, key)).json();
    await new Promise(resolve => server.close(resolve));
  }
  {
    const server = createServer({ dbPath });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const read = await getProject(base, receipt.projectId, receipt.capabilityToken);
    assert.equal(read.status, 200);
    const envelope = JSON.parse(await read.text());
    assert.equal(envelope.sha256, receipt.sha256);
    assert.deepEqual(JSON.stringify(envelope.project), body);
    await new Promise(resolve => server.close(resolve));
  }
  fs.rmSync(dbPath, { force: true });
});

test('concurrent identical migrate requests create exactly one row', async () => {
  await withServer(tempDbPath('concurrent'), async (base, _server, dbPath) => {
    const body = canonicalBody(golden.jsonRoundTrip.exported);
    const key = 'concurrent-idempotency-key';
    const responses = await Promise.all(Array.from({ length: 8 }, () => migrate(base, body, key)));
    const statuses = responses.map(response => response.status).sort();
    assert.ok(statuses.every(status => status === 200 || status === 201));
    const payloads = await Promise.all(responses.map(response => response.json()));
    const projectIds = new Set(payloads.map(payload => payload.projectId));
    assert.equal(projectIds.size, 1);
    const repo = createProjectRepository({ dbPath });
    assert.equal(repo.countProjects(), 1);
    repo.close();
  });
});

test('capabilityToken never appears in a GET response', async () => {
  await withServer(tempDbPath('no-token-get'), async (base) => {
    const post = await migrate(base, canonicalBody(golden.jsonRoundTrip.exported), crypto.randomUUID());
    const receipt = await post.json();
    const text = await (await getProject(base, receipt.projectId, receipt.capabilityToken)).text();
    assert.doesNotMatch(text, /capabilityToken/);
    assert.doesNotMatch(text, /capabilityHash/);
  });
});

test('revision is 1 on create and unchanged by replay', async () => {
  await withServer(tempDbPath('revision'), async (base) => {
    const body = canonicalBody(golden.jsonRoundTrip.exported);
    const key = crypto.randomUUID();
    const first = await (await migrate(base, body, key)).json();
    assert.equal(first.revision, 1);
    const replay = await (await migrate(base, body, key)).json();
    assert.equal(replay.revision, 1);
  });
});

test('static routes never serve data/ or the SQLite file', async () => {
  await withServer(tempDbPath('static'), async (base) => {
    for (const route of ['/data/smetacraft.sqlite', '/data/', '/data']) {
      const response = await fetch(`${base}${route}`);
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { ok: false, error: 'not_found' });
    }
  });
});

test('server sources contain no calculation core identifiers or constants', () => {
  const serverDir = path.join(__dirname, '..', 'server');
  const forbidden = [
    'CONCRETE_RESERVE', 'PILE_REBAR_RESERVE', 'barCount', 'kgPerMeter',
    'lengthWithSplices', 'formatQty', 'js/core/', 'require(\'../js/core',
  ];
  const sources = fs.readdirSync(serverDir)
    .filter(name => name.endsWith('.cjs'))
    .map(name => fs.readFileSync(path.join(serverDir, name), 'utf8'))
    .join('\n');
  for (const token of forbidden) {
    assert.doesNotMatch(sources, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('migrations apply idempotently and record their version', () => {
  const dbPath = tempDbPath('migrate-idempotent');
  applyMigrations(dbPath);
  assert.equal(isStorageReady(dbPath), true);
  applyMigrations(dbPath);
  assert.equal(isStorageReady(dbPath), true);
  assert.equal(expectedSchemaVersion(), 1);
  fs.rmSync(dbPath, { force: true });
});
