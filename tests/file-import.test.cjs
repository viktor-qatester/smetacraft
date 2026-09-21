const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../server/server.cjs');
const { applyMigrations } = require('../server/db.cjs');
const { createApp } = require('./runtime.cjs');
const { parseDocument, PRICE_FIELD_IDS } = require('../server/import/explicit-text.cjs');
const {
  PDF_MEDIA_TYPE, DOCX_MEDIA_TYPE,
  autocadLikePdf, explicitLabelsPdf, explicitLabelsDocx, xlsxLikeZip, buildPdf,
} = require('./phase8-fixtures.cjs');
const golden = require('./golden.json');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'smetacraft-p8-'));
}

function canonicalBody() {
  const { context } = createApp();
  return JSON.stringify(context.parseProjectText(JSON.stringify(golden.jsonRoundTrip.exported)));
}

async function withServer(run, serverOptions = {}) {
  const dir = tempDir();
  const dbPath = path.join(dir, 'db.sqlite');
  const blobRoot = path.join(dir, 'blobs');
  applyMigrations(dbPath);
  const server = createServer({ dbPath, blobRoot, ...serverOptions });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await run({ base, dbPath, blobRoot, dir });
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function migrate(base) {
  const body = canonicalBody();
  const response = await fetch(`${base}/api/projects/migrate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': crypto.randomUUID(),
    },
    body,
  });
  assert.equal(response.status, 201);
  return response.json();
}

function upload(base, projectId, token, body, contentType, filename, extraHeaders = {}) {
  return fetch(`${base}/api/projects/${projectId}/files`, {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      Authorization: `Bearer ${token}`,
      'X-Smetacraft-Filename': filename,
      ...extraHeaders,
    },
    body,
  });
}

test('explicit PDF maps labeled params and never prices', () => {
  const preview = parseDocument(explicitLabelsPdf(), PDF_MEDIA_TYPE);
  assert.equal(preview.sourceKind, 'explicit-text');
  assert.equal(preview.parameters['strip-length'], '42');
  assert.equal(preview.parameters['strip-width'], '0.5');
  assert.equal(preview.parameters['strip-height'], '0.7');
  assert.equal(preview.parameters['strip-stirrup-diameter'], '10');
  assert.equal(preview.parameters['strip-stirrup-step'], '250');
  assert.equal(preview.parameters['walls-perimeter'], '50');
  assert.equal(preview.parameters['walls-height'], '3');
  for (const key of Object.keys(preview.parameters)) {
    assert.equal(PRICE_FIELD_IDS.has(key), false);
  }
  const found = preview.fields.filter(field => field.status === 'found');
  assert.equal(found.length, 7);
});

test('AutoCAD-like PDF maps zero fields and asks for manual entry', () => {
  const preview = parseDocument(autocadLikePdf(), PDF_MEDIA_TYPE);
  assert.equal(preview.format, 'pdf');
  assert.equal(preview.pageCount, 2);
  assert.equal(preview.sourceKind, 'drawing-plot');
  assert.deepEqual(preview.parameters, {});
  assert.ok(preview.fields.every(field => field.status === 'manual'));
  assert.match(preview.message, /вручную/);
});

test('explicit DOCX maps the same labeled params', () => {
  const preview = parseDocument(explicitLabelsDocx(), DOCX_MEDIA_TYPE);
  assert.equal(preview.format, 'docx');
  assert.equal(preview.parameters['strip-length'], '42');
  assert.equal(preview.parameters['walls-height'], '3');
  assert.equal(preview.sourceKind, 'explicit-text');
});

test('price-like text is ignored even next to a number', () => {
  const pdf = buildPdf(['лента цена 100', 'бетон цена 85.00 руб']);
  const preview = parseDocument(pdf, PDF_MEDIA_TYPE);
  assert.equal(preview.parameters['strip-length'], undefined);
  for (const key of Object.keys(preview.parameters)) {
    assert.equal(PRICE_FIELD_IDS.has(key), false);
  }
});

test('upload PDF stores blob, returns preview, download requires capability', async () => {
  await withServer(async ({ base, blobRoot }) => {
    const receipt = await migrate(base);
    const pdf = explicitLabelsPdf();
    const post = await upload(
      base, receipt.projectId, receipt.capabilityToken, pdf, PDF_MEDIA_TYPE, 'labels.pdf',
    );
    assert.equal(post.status, 201);
    const payload = await post.json();
    assert.equal(payload.ok, true);
    assert.match(payload.objectId, /^[0-9a-f]{32}$/);
    assert.equal(payload.preview.parameters['strip-length'], '42');
    assert.equal(payload.status, 'validated');
    assert.equal(fs.existsSync(path.join(blobRoot, payload.objectId)), true);

    const downloaded = await fetch(
      `${base}/api/projects/${receipt.projectId}/files/${payload.objectId}`,
      { headers: { Authorization: `Bearer ${receipt.capabilityToken}` } },
    );
    assert.equal(downloaded.status, 200);
    assert.equal(downloaded.headers.get('x-content-type-options'), 'nosniff');
    assert.match(downloaded.headers.get('content-disposition') || '', /attachment/);
    assert.equal(Buffer.from(await downloaded.arrayBuffer()).equals(pdf), true);

    const other = await migrate(base);
    const stolen = await fetch(
      `${base}/api/projects/${receipt.projectId}/files/${payload.objectId}`,
      { headers: { Authorization: `Bearer ${other.capabilityToken}` } },
    );
    assert.equal(stolen.status, 404);

    const noAuth = await fetch(
      `${base}/api/projects/${receipt.projectId}/files/${payload.objectId}`,
    );
    assert.equal(noAuth.status, 401);
  });
});

test('duplicate upload of the same digest returns the original object', async () => {
  await withServer(async ({ base }) => {
    const receipt = await migrate(base);
    const pdf = autocadLikePdf();
    const first = await upload(
      base, receipt.projectId, receipt.capabilityToken, pdf, PDF_MEDIA_TYPE, 'a.pdf',
    );
    const second = await upload(
      base, receipt.projectId, receipt.capabilityToken, pdf, PDF_MEDIA_TYPE, 'b.pdf',
    );
    assert.equal(first.status, 201);
    assert.equal(second.status, 200);
    const a = await first.json();
    const b = await second.json();
    assert.equal(a.objectId, b.objectId);
    assert.deepEqual(b.preview.parameters, {});
  });
});

test('apply ack keeps the blob and marks available', async () => {
  await withServer(async ({ base, blobRoot }) => {
    const receipt = await migrate(base);
    const post = await upload(
      base, receipt.projectId, receipt.capabilityToken, explicitLabelsPdf(), PDF_MEDIA_TYPE, 'x.pdf',
    );
    const created = await post.json();
    const ack = await fetch(
      `${base}/api/projects/${receipt.projectId}/files/${created.objectId}/apply`,
      { method: 'POST', headers: { Authorization: `Bearer ${receipt.capabilityToken}` } },
    );
    assert.equal(ack.status, 200);
    const body = await ack.json();
    assert.equal(body.status, 'available');
    assert.equal(fs.existsSync(path.join(blobRoot, created.objectId)), true);
  });
});

test('oversize, MIME mismatch, XLSX and path-like names are rejected', async () => {
  await withServer(async ({ base, blobRoot }) => {
    const receipt = await migrate(base);
    const huge = await upload(
      base, receipt.projectId, receipt.capabilityToken,
      Buffer.alloc(5 * 1024 * 1024 + 1, 37), PDF_MEDIA_TYPE, 'big.pdf',
    );
    assert.equal(huge.status, 413);
    assert.equal((await huge.json()).error, 'body_too_large');

    const mismatch = await upload(
      base, receipt.projectId, receipt.capabilityToken,
      explicitLabelsDocx(), PDF_MEDIA_TYPE, 'x.pdf',
    );
    assert.equal(mismatch.status, 422);

    const xlsx = await upload(
      base, receipt.projectId, receipt.capabilityToken,
      xlsxLikeZip(), DOCX_MEDIA_TYPE, 'book.xlsx',
    );
    assert.equal(xlsx.status, 422);

    const weird = await upload(
      base, receipt.projectId, receipt.capabilityToken,
      autocadLikePdf(), PDF_MEDIA_TYPE, '../../etc/passwd.pdf',
    );
    assert.equal(weird.status, 201);
    const stored = await weird.json();
    assert.equal(stored.originalName, 'upload.pdf');
    assert.equal(fs.existsSync(path.join(blobRoot, '..', 'etc', 'passwd.pdf')), false);
  });
});

test('foreign origin cannot upload files', async () => {
  await withServer(async ({ base }) => {
    const receipt = await migrate(base);
    const target = new URL(base);
    const pdf = autocadLikePdf();
    const result = await new Promise((resolve, reject) => {
      const request = http.request({
        hostname: target.hostname,
        port: target.port,
        path: `/api/projects/${receipt.projectId}/files`,
        method: 'POST',
        headers: {
          'Content-Type': PDF_MEDIA_TYPE,
          Authorization: `Bearer ${receipt.capabilityToken}`,
          Origin: 'https://example.invalid',
          'Content-Length': pdf.length,
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
      request.end(pdf);
    });
    assert.equal(result.status, 403);
    assert.deepEqual(JSON.parse(result.body), { ok: false, error: 'origin_forbidden' });
  });
});

test('GitHub Pages Host/Origin cannot upload files even when Fornex origins are configured', async () => {
  const publicOrigins = ['http://31.172.78.193', 'http://333428.fornex.cloud'];
  await withServer(async ({ base }) => {
    const receipt = await migrate(base);
    const target = new URL(base);
    const pdf = autocadLikePdf();
    const result = await new Promise((resolve, reject) => {
      const request = http.request({
        hostname: target.hostname,
        port: target.port,
        path: `/api/projects/${receipt.projectId}/files`,
        method: 'POST',
        headers: {
          Host: 'viktor-qatester.github.io',
          Origin: 'https://viktor-qatester.github.io',
          'Content-Type': PDF_MEDIA_TYPE,
          Authorization: `Bearer ${receipt.capabilityToken}`,
          'Content-Length': pdf.length,
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
      request.end(pdf);
    });
    assert.equal(result.status, 403);
    assert.deepEqual(JSON.parse(result.body), { ok: false, error: 'origin_forbidden' });
  }, { publicOrigins });
});

test('DOCX upload returns preview and is not served as static', async () => {
  await withServer(async ({ base, blobRoot }) => {
    const receipt = await migrate(base);
    const docx = explicitLabelsDocx();
    const post = await upload(
      base, receipt.projectId, receipt.capabilityToken, docx, DOCX_MEDIA_TYPE, 'note.docx',
    );
    assert.equal(post.status, 201);
    const payload = await post.json();
    assert.equal(payload.preview.parameters['walls-perimeter'], '50');
    const staticHit = await fetch(`${base}/data/blobs/${payload.objectId}`);
    assert.equal(staticHit.status, 404);
    assert.equal(fs.existsSync(path.join(blobRoot, payload.objectId)), true);
  });
});
