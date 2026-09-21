const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { applyMigrations, expectedSchemaVersion } = require('../server/db.cjs');
const { createFileStore } = require('../server/file-store.cjs');
const { createFileMetadataRepository } = require('../server/file-metadata-repository.cjs');
const { createProjectRepository } = require('../server/project-repository.cjs');
const { createServer } = require('../server/server.cjs');
const { autocadLikePdf } = require('./phase8-fixtures.cjs');
const golden = require('./golden.json');

function tempDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `smetacraft-fs-${name}-`));
}

function seedProject(dbPath) {
  const repo = createProjectRepository({ dbPath });
  const body = Buffer.from(JSON.stringify(golden.jsonRoundTrip.exported));
  const projectId = crypto.randomBytes(16).toString('hex');
  const token = crypto.randomBytes(32).toString('base64url');
  const capabilityHash = crypto.createHash('sha256').update(`${projectId}:${token}`).digest('hex');
  repo.createProject({
    projectId,
    bytes: body,
    sha256: crypto.createHash('sha256').update(body).digest('hex'),
    capabilityHash,
    idempotencyKeyHash: crypto.createHash('sha256').update(crypto.randomUUID()).digest('hex'),
    now: new Date().toISOString(),
  });
  repo.close();
  return { projectId, token };
}

test('schema version includes file_objects migration', () => {
  const dir = tempDir('schema');
  const dbPath = path.join(dir, 'db.sqlite');
  applyMigrations(dbPath);
  assert.equal(expectedSchemaVersion(), 2);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('file store writes blobs under random objectId outside web root', () => {
  const dir = tempDir('store');
  const store = createFileStore({ blobRoot: dir });
  const objectId = crypto.randomBytes(16).toString('hex');
  const payload = Buffer.from('blob-bytes');
  const dest = store.writeAtomic(objectId, payload);
  assert.equal(path.dirname(dest), dir);
  assert.equal(path.basename(dest), objectId);
  assert.equal(store.read(objectId).equals(payload), true);
  const leftovers = fs.readdirSync(dir).filter(name => name.startsWith('.tmp-'));
  assert.deepEqual(leftovers, []);
  store.remove(objectId);
  assert.equal(store.exists(objectId), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('file store rejects non-hex objectId path traversal', () => {
  const dir = tempDir('traverse');
  const store = createFileStore({ blobRoot: dir });
  assert.throws(() => store.pathFor('../etc/passwd'), /invalid_object_id/);
  assert.throws(() => store.pathFor('..'), /invalid_object_id/);
  assert.throws(() => store.writeAtomic('not-hex', Buffer.from('x')), /invalid_object_id/);
  assert.deepEqual(fs.readdirSync(dir).filter(name => !name.startsWith('.')), []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('file metadata round-trips and follows quarantine to available', () => {
  const dir = tempDir('meta');
  const dbPath = path.join(dir, 'db.sqlite');
  applyMigrations(dbPath);
  const { projectId } = seedProject(dbPath);
  const meta = createFileMetadataRepository({ dbPath });
  const objectId = crypto.randomBytes(16).toString('hex');
  const now = new Date().toISOString();
  const created = meta.insertFileObject({
    objectId,
    projectId,
    originalName: 'plot.pdf',
    mediaType: 'application/pdf',
    bytes: 12,
    sha256: 'a'.repeat(64),
    status: 'quarantine',
    now,
  });
  assert.equal(created.status, 'quarantine');
  assert.equal(meta.getFileObject({ objectId, projectId }).originalName, 'plot.pdf');
  meta.updateStatus({ objectId, projectId, status: 'validated', now });
  meta.updateStatus({ objectId, projectId, status: 'available', now });
  assert.equal(meta.getFileObject({ objectId, projectId }).status, 'available');
  assert.equal(meta.countByProject({ projectId }), 1);
  meta.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('static handler does not serve blob directory', async () => {
  const dir = tempDir('static');
  const dbPath = path.join(dir, 'db.sqlite');
  const blobRoot = path.join(dir, 'blobs');
  applyMigrations(dbPath);
  const store = createFileStore({ blobRoot });
  const objectId = crypto.randomBytes(16).toString('hex');
  store.writeAtomic(objectId, autocadLikePdf());
  const server = createServer({ dbPath, blobRoot });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const route of [
      `/data/blobs/${objectId}`,
      `/data/${objectId}`,
      `/blobs/${objectId}`,
      `/${objectId}`,
    ]) {
      const response = await fetch(base + route);
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { ok: false, error: 'not_found' });
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
