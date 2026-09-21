const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const { createServer } = require('../server/server.cjs');
const golden = require('./golden.json');

async function withServer(run, options = {}) {
  const server = createServer(options);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

function post(base, body, headers = {}) {
  return fetch(base + '/api/project-check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  });
}

function rawPost(base, body, headers = {}) {
  const target = new URL(base);
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: target.hostname,
      port: target.port,
      path: '/api/project-check',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...headers,
      },
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    request.on('error', reject);
    request.end(body);
  });
}

test('browser project reaches API and receives matching receipt', async () => {
  await withServer(async base => {
    const body = JSON.stringify(golden.jsonRoundTrip.exported);
    const response = await post(base, body);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      bytes: Buffer.byteLength(body),
      sha256: crypto.createHash('sha256').update(body).digest('hex'),
    });
    const page = await fetch(base);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /project-server-check/);
    const script = await fetch(base + '/js/app/backend-check.js');
    assert.equal(script.status, 200);
    assert.match(script.headers.get('content-type'), /javascript/);
  });
});

test('API rejects bad method, route, media type and foreign origin', async () => {
  await withServer(async base => {
    assert.equal((await fetch(base + '/api/project-check')).status, 405);
    assert.equal((await fetch(base + '/api/missing')).status, 404);
    assert.equal((await post(base, '{}', { 'Content-Type': 'text/plain' })).status, 415);
    assert.equal((await post(base, '{}', { Origin: 'https://example.invalid' })).status, 403);
    assert.equal((await fetch(base + '/js/%2e%2e/server/server.cjs')).status, 404);
  });
});

test('API accepts only the actual loopback Host and matching browser Origin', async () => {
  await withServer(async base => {
    const body = JSON.stringify({ format: 'smetacraft-project', version: 1 });
    const port = new URL(base).port;
    const loopback = await rawPost(base, body, {
      Host: `127.0.0.1:${port}`,
      Origin: `http://127.0.0.1:${port}`,
    });
    assert.equal(loopback.status, 200);
    const localhost = await rawPost(base, body, {
      Host: `localhost:${port}`,
      Origin: `http://localhost:${port}`,
    });
    assert.equal(localhost.status, 200);
    for (const headers of [
      { Host: `evil.test:${port}`, Origin: `http://evil.test:${port}` },
      { Host: `evil.test:${port}` },
      { Host: '127.0.0.1:1', Origin: 'http://127.0.0.1:1' },
    ]) {
      const response = await rawPost(base, body, headers);
      assert.equal(response.status, 403);
      assert.deepEqual(JSON.parse(response.body), { ok: false, error: 'origin_forbidden' });
    }
  });
});

test('configured public origin is allowed and GitHub Pages origin is forbidden', async () => {
  const publicOrigins = ['http://31.172.78.193', 'http://333428.fornex.cloud'];
  await withServer(async base => {
    const body = JSON.stringify({ format: 'smetacraft-project', version: 1 });
    const ipOk = await rawPost(base, body, {
      Host: '31.172.78.193',
      Origin: 'http://31.172.78.193',
    });
    assert.equal(ipOk.status, 200);
    const hostOk = await rawPost(base, body, {
      Host: '333428.fornex.cloud',
      Origin: 'http://333428.fornex.cloud',
    });
    assert.equal(hostOk.status, 200);
    const pages = await rawPost(base, body, {
      Host: 'viktor-qatester.github.io',
      Origin: 'https://viktor-qatester.github.io',
    });
    assert.equal(pages.status, 403);
    assert.deepEqual(JSON.parse(pages.body), { ok: false, error: 'origin_forbidden' });
    const pagesHostOnly = await rawPost(base, body, {
      Host: 'viktor-qatester.github.io',
    });
    assert.equal(pagesHostOnly.status, 403);
    const mixed = await rawPost(base, body, {
      Host: '31.172.78.193',
      Origin: 'https://viktor-qatester.github.io',
    });
    assert.equal(mixed.status, 403);
  }, { publicOrigins });
});

test('API rejects invalid JSON and v1 structure without keeping project state', async () => {
  await withServer(async base => {
    assert.equal((await post(base, '{')).status, 400);
    assert.equal((await post(base, JSON.stringify({ format: 'smetacraft-project', version: '1' }))).status, 422);
    assert.equal((await post(base, JSON.stringify({ format: 'smetacraft-project', version: 1, fields: [] }))).status, 422);
    assert.equal((await post(base, JSON.stringify({ format: 'smetacraft-project', version: 1, block: 'unknown' }))).status, 422);
    assert.equal((await post(base, JSON.stringify({ format: 'smetacraft-project', version: 1, piles: [{ id: '1' }] }))).status, 422);
    assert.equal((await post(base, JSON.stringify({ format: 'smetacraft-project', version: 1, openings: [{}], checks: { 'summary-include-found': 'yes' } }))).status, 422);
    const body = JSON.stringify(golden.jsonRoundTrip.exported);
    assert.equal((await post(base, body)).status, 200);
    assert.equal((await post(base, body)).status, 200);
  });
});

test('API enforces 1 MiB limit', async () => {
  await withServer(async base => {
    const response = await post(base, JSON.stringify({
      format: 'smetacraft-project', version: 1, extra: 'x'.repeat(1024 * 1024),
    }));
    assert.equal(response.status, 413);
    assert.equal((await response.json()).error, 'body_too_large');
  });
});
