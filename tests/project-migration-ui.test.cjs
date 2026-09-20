const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('./runtime.cjs');
const { createServer } = require('../server/server.cjs');
const { applyMigrations } = require('../server/db.cjs');
const golden = require('./golden.json');

function tempDbPath(name) {
  return path.join(os.tmpdir(), `smetacraft-ui-${name}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`);
}

function canonicalBody(app) {
  return JSON.stringify(app.parseProjectText(JSON.stringify(golden.jsonRoundTrip.exported)));
}

function digest(body) {
  return crypto.createHash('sha256').update(body).digest('hex');
}

function createMigrationApp(options = {}) {
  const { context: app, get } = createApp();
  const hostname = options.hostname || '127.0.0.1';
  const fetchCalls = [];
  app.window.location = { hostname };
  app.window.crypto = {
    subtle: {
      digest: async (_algo, bytes) => crypto.createHash('sha256').update(Buffer.from(bytes)).digest(),
    },
  };
  app.fetch = async (url, init = {}) => {
    fetchCalls.push({ url, init });
    if (options.fetchImpl) {
      return options.fetchImpl(url, init, fetchCalls.length);
    }
    throw new Error('Failed to fetch');
  };
  app.window.fetch = app.fetch;
  app.document.querySelector = selector => {
    if (selector === '.tab[data-block="project"]') {
      return { addEventListener() {} };
    }
    return app.document.getElementById(selector.slice(1)) || null;
  };
  app.crypto = crypto;
  app.TextEncoder = TextEncoder;
  app.AbortController = AbortController;
  app.setTimeout = setTimeout;
  app.clearTimeout = clearTimeout;
  const fieldset = { hidden: false };
  const button = { disabled: false, textContent: '', listeners: {} };
  const status = { textContent: '' };
  get('project-migration-fieldset').hidden = false;
  get('project-migrate').addEventListener = (event, handler) => {
    button.listeners[event] = handler;
  };
  Object.defineProperty(get('project-migration-fieldset'), 'hidden', {
    get: () => fieldset.hidden,
    set: value => { fieldset.hidden = value; },
  });
  get('project-migrate').disabled = false;
  Object.defineProperty(get('project-migrate'), 'disabled', {
    get: () => button.disabled,
    set: value => { button.disabled = value; },
  });
  Object.defineProperty(get('project-migration-status'), 'textContent', {
    get: () => status.textContent,
    set: value => { status.textContent = value; },
  });
  app.exportProjectV1Snapshot = () => golden.jsonRoundTrip.exported;
  app.hasStoredProjectValue = () => true;
  return { app, get, fetchCalls, fieldset, button, status };
}

test('project-migration loads in the documented script order', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(match => match[1]);
  const migrationIndex = scripts.indexOf('js/app/project-migration.js');
  const bootIndex = scripts.indexOf('js/app/boot.js');
  assert.notEqual(migrationIndex, -1);
  assert.ok(migrationIndex < bootIndex);
  assert.equal(scripts[migrationIndex + 1], 'js/app/boot.js');
});

test('no request is issued on bindProjectMigration', async () => {
  const { app, fetchCalls } = createMigrationApp();
  app.bindProjectMigration();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(fetchCalls.length, 0);
});

test('POST without readback is reported as failed, not as migrated', async () => {
  const body = canonicalBody(createApp().context);
  const key = crypto.randomUUID();
  const { app, status } = createMigrationApp({
    fetchImpl: async (url, init) => {
      if (url === '/api/projects/migrate') {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            ok: true,
            projectId: 'a'.repeat(32),
            revision: 1,
            sha256: digest(body),
            capabilityToken: 'token-' + 'b'.repeat(40),
            replayed: false,
          }),
        };
      }
      if (url.startsWith('/api/projects/')) {
        return {
          ok: false,
          status: 404,
          json: async () => ({ ok: false, error: 'not_found' }),
        };
      }
      throw new Error('unexpected');
    },
  });
  app.window.localStorage.setItem('smetacraft_project', body);
  const before = app.window.localStorage.getItem('smetacraft_project');
  app.bindProjectMigration();
  await app.runProjectMigration();
  const receipt = JSON.parse(app.window.localStorage.getItem('smetacraft_project_migration_v1'));
  assert.equal(receipt.state, 'failed');
  assert.notEqual(receipt.state, 'server verified');
  assert.equal(app.window.localStorage.getItem('smetacraft_project'), before);
  assert.match(status.textContent, /Перенос не выполнен/);
});

test('receipt is written only to smetacraft_project_migration_v1', async () => {
  await new Promise((resolve, reject) => {
    const dbPath = tempDbPath('receipt-key');
    applyMigrations(dbPath);
    const server = createServer({ dbPath });
    server.listen(0, '127.0.0.1', async () => {
      const port = server.address().port;
      const base = `http://127.0.0.1:${port}`;
      try {
        const { app } = createMigrationApp({
          fetchImpl: async (url, init) => fetch(base + url, init),
        });
        const body = canonicalBody(app);
        app.window.localStorage.setItem('smetacraft_project', body);
        app.bindProjectMigration();
        await app.runProjectMigration();
        assert.ok(app.window.localStorage.getItem('smetacraft_project_migration_v1'));
        assert.doesNotMatch(app.window.localStorage.getItem('smetacraft_project'), /projectId/);
        const receipt = JSON.parse(app.window.localStorage.getItem('smetacraft_project_migration_v1'));
        assert.equal(receipt.receiptVersion, 1);
        assert.equal(receipt.state, 'server verified');
      } catch (error) {
        reject(error);
      } finally {
        server.close(resolve);
      }
    });
  });
});

test('smetacraft_project is byte-identical after success, failure and timeout', async () => {
  const body = canonicalBody(createApp().context);
  const cases = [
    {
      name: 'success',
      fetchImpl: async (url, init, callIndex) => {
        if (callIndex === 1) {
          return {
            ok: true,
            status: 201,
            json: async () => ({
              ok: true,
              projectId: 'c'.repeat(32),
              revision: 1,
              sha256: digest(body),
              capabilityToken: 'tok-' + 'd'.repeat(40),
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            projectId: 'c'.repeat(32),
            revision: 1,
            sha256: digest(body),
            project: golden.jsonRoundTrip.exported,
          }),
        };
      },
    },
    {
      name: 'failure',
      fetchImpl: async () => ({
        ok: false,
        status: 422,
        json: async () => ({ ok: false, error: 'invalid_project_v1' }),
      }),
    },
    {
      name: 'timeout',
      fetchImpl: async () => {
        const error = new Error('Aborted');
        error.name = 'AbortError';
        throw error;
      },
    },
  ];

  for (const scenario of cases) {
    const { app } = createMigrationApp({ fetchImpl: scenario.fetchImpl });
    app.window.localStorage.setItem('smetacraft_project', body);
    const before = app.window.localStorage.getItem('smetacraft_project');
    await app.runProjectMigration();
    assert.equal(app.window.localStorage.getItem('smetacraft_project'), before, scenario.name);
  }
});

test('server response never modifies form fields or bill rows', async () => {
  await new Promise((resolve, reject) => {
    const dbPath = tempDbPath('no-dom-mutation');
    applyMigrations(dbPath);
    const server = createServer({ dbPath });
    server.listen(0, '127.0.0.1', async () => {
      const port = server.address().port;
      const base = `http://127.0.0.1:${port}`;
      try {
        const { app, get } = createMigrationApp({
          fetchImpl: async (url, init) => fetch(base + url, init),
        });
        const body = canonicalBody(app);
        app.window.localStorage.setItem('smetacraft_project', body);
        get('length').value = '8';
        get('width').value = '10';
        const beforeFields = { length: get('length').value, width: get('width').value };
        const billBefore = app.billBodyEl.innerHTML;
        await app.runProjectMigration();
        assert.deepEqual({ length: get('length').value, width: get('width').value }, beforeFields);
        assert.equal(app.billBodyEl.innerHTML, billBefore);
      } catch (error) {
        reject(error);
      } finally {
        server.close(resolve);
      }
    });
  });
});

test('retry after a network error reuses the stored idempotency key', async () => {
  const body = canonicalBody(createApp().context);
  let attempts = 0;
  const sharedKey = crypto.randomUUID();
  const { app } = createMigrationApp({
    fetchImpl: async (url, init) => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('Failed to fetch');
      }
      return {
        ok: true,
        status: 201,
        json: async () => ({
          ok: true,
          projectId: 'e'.repeat(32),
          revision: 1,
          sha256: digest(body),
          capabilityToken: 'tok-' + 'f'.repeat(40),
        }),
      };
    },
  });
  app.window.localStorage.setItem('smetacraft_project', body);
  app.window.localStorage.setItem('smetacraft_project_migration_v1', JSON.stringify({
    receiptVersion: 1,
    idempotencyKey: sharedKey,
    sha256: digest(body),
    state: 'failed',
    lastError: 'network',
  }));
  await app.runProjectMigration();
  const receipt = JSON.parse(app.window.localStorage.getItem('smetacraft_project_migration_v1'));
  assert.equal(receipt.idempotencyKey, sharedKey);
});

test('changed local project returns the UI to local only', async () => {
  const { app, status } = createMigrationApp();
  const body = canonicalBody(app);
  app.window.localStorage.setItem('smetacraft_project', body);
  app.window.localStorage.setItem('smetacraft_project_migration_v1', JSON.stringify({
    receiptVersion: 1,
    projectId: 'f'.repeat(32),
    revision: 1,
    sha256: 'deadbeef',
    idempotencyKey: crypto.randomUUID(),
    capabilityToken: 'tok',
    verifiedAt: '2026-09-19T12:00:00.000Z',
    state: 'server verified',
  }));
  await app.refreshMigrationUi();
  assert.match(status.textContent, /только в этом браузере/);
});

test('status text is written through textContent', async () => {
  const { app, get, status } = createMigrationApp();
  app.bindProjectMigration();
  await app.refreshMigrationUi();
  assert.equal(get('project-migration-status').textContent, status.textContent);
  assert.equal(get('project-migration-status').innerHTML, '');
});

test('migration block is hidden on a non-loopback host', () => {
  const { app, fieldset } = createMigrationApp({ hostname: 'pages.github.io' });
  app.bindProjectMigration();
  assert.equal(fieldset.hidden, true);
});

test('end-to-end migrate readback via HTTP', async () => {
  await new Promise((resolve, reject) => {
    const dbPath = tempDbPath('e2e');
    applyMigrations(dbPath);
    const server = createServer({ dbPath });
    server.listen(0, '127.0.0.1', async () => {
      const port = server.address().port;
      const base = `http://127.0.0.1:${port}`;
      try {
        const { app, status } = createMigrationApp({
          fetchImpl: async (url, init) => fetch(base + url, init),
        });
        const body = canonicalBody(app);
        app.window.localStorage.setItem('smetacraft_project', body);
        await app.runProjectMigration();
        const receipt = JSON.parse(app.window.localStorage.getItem('smetacraft_project_migration_v1'));
        assert.equal(receipt.state, 'server verified');
        assert.match(status.textContent, /проверена чтением/);
        assert.equal(app.window.localStorage.getItem('smetacraft_project'), body);
      } catch (error) {
        reject(error);
      } finally {
        server.close(resolve);
      }
    });
  });
});
