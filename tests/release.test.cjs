const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../server/server.cjs');
const { applyMigrations } = require('../server/db.cjs');
const {
  isForbiddenPath,
  hasSecretAssignment,
  readRelease,
  nextReleaseId,
} = require('../scripts/release-lib.cjs');

const root = path.join(__dirname, '..');

function tempDb() {
  return path.join(os.tmpdir(), `smetacraft-release-${process.pid}-${Date.now()}.sqlite`);
}

test('release id in the page matches version.json', () => {
  const release = readRelease(root);
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(release.releaseId, /^\d{4}-\d{2}-\d{2}\.\d+$/);
  assert.match(html, new RegExp(`<meta name="smetacraft-release" content="${release.releaseId}" />`));
  assert.match(html, new RegExp(`<span id="app-release">${release.releaseId}</span>`));
});

test('publication refuses secrets, databases and server settings', () => {
  assert.equal(isForbiddenPath('.env'), true);
  assert.equal(isForbiddenPath('deploy/aeza.local.env'), true);
  assert.equal(isForbiddenPath('data/smetacraft.sqlite'), true);
  assert.equal(isForbiddenPath('data/blobs/secret.pdf'), true);
  assert.equal(isForbiddenPath('backups/db.sqlite'), true);
  assert.equal(isForbiddenPath('deploy/aeza.local.env.example'), false);
  assert.equal(isForbiddenPath('data/training/annotations/v0.1/README.md'), false);
  assert.equal(isForbiddenPath('version.json'), false);
  assert.equal(hasSecretAssignment(['GEMINI_API_KEY', 'secret-value'].join('=')), true);
  assert.equal(hasSecretAssignment('переменная GEMINI_API_KEY хранится на сервере'), false);
});

test('next release id does not reuse a number from the same day', () => {
  const now = new Date('2026-10-12T12:00:00');
  assert.equal(nextReleaseId(new Set(['2026-10-12.1', '2026-10-12.2']), now), '2026-10-12.3');
});

test('AEZA script stays inside vic-smetacraft and keeps the database', () => {
  const source = fs.readFileSync(path.join(root, 'scripts', 'aeza-remote.sh'), 'utf8');
  assert.match(source, /vic-smetacraft/);
  assert.match(source, /compose\.vic\.yaml/);
  assert.match(source, /smetacraft\.sqlite/);
  assert.match(source, /src\.backup\(dst\)/);
  assert.match(source, /restore_sqlite_file/);
  assert.match(source, /chown "\$DB_OWNER"/);
  assert.match(source, /chown "\$APP_OWNER"/);
  assert.doesNotMatch(source, /chmod 777|install-fornex|ufw|iptables|xray|compose down|git push/);
});

test('version endpoint and version.json do not expose server settings', async () => {
  const dbPath = tempDb();
  applyMigrations(dbPath);
  const server = createServer({ dbPath });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const version = await fetch(`${base}/api/version`);
    assert.equal(version.status, 200);
    const body = await version.json();
    const expected = readRelease(root);
    assert.equal(body.ok, true);
    assert.equal(body.releaseId, expected.releaseId);
    assert.equal(body.pagesDirectory, '/');
    assert.match(body.commit, /^$|^[0-9a-f]{40}$/);
    assert.equal(typeof body.schemaVersion, 'number');
    assert.equal(JSON.stringify(body).includes('GEMINI'), false);
    assert.equal(JSON.stringify(body).includes('sqlite'), false);
    const file = await fetch(`${base}/version.json`);
    assert.equal(file.status, 200);
    assert.equal((await file.json()).releaseId, expected.releaseId);
    const hidden = await fetch(`${base}/.env`);
    assert.equal(hidden.status, 404);
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.rmSync(dbPath + suffix, { force: true }); } catch { /* Windows может ещё держать файл SQLite. */ }
    }
  }
});
