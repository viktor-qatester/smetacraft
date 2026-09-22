const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const fixtures = require('./scenarios.cjs');
const { projectFixture } = require('./runtime.cjs');
const golden = require('./golden.json');
const { parseDocument } = require('../server/import/explicit-text.cjs');
const { explicitLabelsPdf, autocadLikePdf, PDF_MEDIA_TYPE } = require('./phase8-fixtures.cjs');

function setupApplyApp() {
  const { app, get } = projectFixture(fixtures);
  app.applyProject(app.parseProjectText(JSON.stringify(golden.jsonRoundTrip.exported)));
  return { app, get };
}

test('document-import loads immediately before boot', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(match => match[1]);
  const parserIndex = scripts.indexOf('js/app/explicit-text.js');
  const importIndex = scripts.indexOf('js/app/document-import.js');
  const bootIndex = scripts.indexOf('js/app/boot.js');
  assert.equal(scripts[bootIndex - 1], 'js/app/document-import.js');
  assert.equal(scripts[bootIndex - 2], 'js/app/explicit-text.js');
  assert.equal(scripts[bootIndex - 3], 'js/app/extracted-facts.js');
  assert.equal(importIndex, bootIndex - 1);
  assert.equal(parserIndex, importIndex - 1);
  assert.match(html, /project-document-import-fieldset/);
  assert.match(html, /smetacraft-public-origin/);
  assert.match(html, /Автоподстановка размеров/);
  assert.match(html, /Цены не подставляются/);
  assert.match(html, /id="project-document-import-fieldset" hidden/);
  assert.match(html, /id="project-document-clear"/);
  assert.match(html, /Удалить файл/);
});

test('apply overlays labeled params and leaves prices untouched', () => {
  const { app } = setupApplyApp();
  const before = JSON.parse(JSON.stringify(app.collectProject()));
  const preview = parseDocument(explicitLabelsPdf(), PDF_MEDIA_TYPE);
  const applied = app.applyDocumentImportParameters(preview.parameters);
  assert.ok(applied > 0);
  const after = app.collectProject();
  assert.equal(String(after.fields['strip-length']), '42');
  assert.equal(String(after.fields['strip-width']), '0.5');
  assert.equal(String(after.fields['strip-height']), '0.7');
  assert.equal(String(after.fields['strip-stirrup-diameter']), '10');
  assert.equal(String(after.fields['strip-stirrup-step']), '250');
  assert.equal(String(after.fields['walls-perimeter']), '50');
  assert.equal(String(after.fields['walls-height']), '3');
  assert.equal(after.fields['strip-concrete-price'], before.fields['strip-concrete-price']);
  assert.equal(after.fields['concrete-price'], before.fields['concrete-price']);
  assert.equal(after.fields['rebar-price'], before.fields['rebar-price']);
});

test('AutoCAD-like preview apply is a no-op on project fields', () => {
  const { app } = setupApplyApp();
  const before = JSON.parse(JSON.stringify(app.collectProject()));
  const preview = parseDocument(autocadLikePdf(), PDF_MEDIA_TYPE);
  assert.deepEqual(preview.parameters, {});
  const applied = app.applyDocumentImportParameters(preview.parameters);
  assert.equal(applied, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(app.collectProject())), before);
});

test('price keys in overlay are ignored', () => {
  const { app } = setupApplyApp();
  const before = app.collectProject().fields['concrete-price'];
  const applied = app.applyDocumentImportParameters({
    'strip-length': '41',
    'concrete-price': '1',
    'strip-concrete-price': '2',
  });
  assert.ok(applied > 0);
  const after = app.collectProject();
  assert.equal(String(after.fields['strip-length']), '41');
  assert.equal(after.fields['concrete-price'], before);
  assert.notEqual(String(after.fields['strip-concrete-price']), '2');
});

test('preview table uses textContent and lists manual AutoCAD fields', () => {
  const { app, get } = setupApplyApp();
  const rows = [];
  const body = get('project-document-preview-body');
  body.firstChild = null;
  body.removeChild = function () { this.firstChild = null; };
  body.appendChild = function (row) { rows.push(row); return row; };
  const originalCreate = app.document.createElement;
  app.document.createElement = function (tag) {
    const children = [];
    return {
      tagName: String(tag).toUpperCase(),
      textContent: '',
      children,
      appendChild(child) { children.push(child); return child; },
    };
  };
  try {
    const preview = parseDocument(autocadLikePdf(), PDF_MEDIA_TYPE);
    app.renderDocumentPreview(preview);
    assert.ok(rows.length > 0);
    assert.ok(rows.every(row => row.children[6].textContent === "Не найдено"));
    assert.ok(rows.every(row => typeof row.children[1].textContent === "string" && !row.children[1].innerHTML));
    assert.equal(get('project-document-apply').disabled, true);
    assert.match(get('project-document-preview-message').textContent, /вручную/);
  } finally {
    app.document.createElement = originalCreate;
  }
});

test('failed apply overlay does not keep a partial candidate', () => {
  const { app } = setupApplyApp();
  const before = JSON.parse(JSON.stringify(app.collectProject()));
  const storageBefore = app.window.localStorage.getItem('smetacraft_project');
  assert.throws(() => app.applyDocumentImportParameters({ 'strip-length': { bad: true } }));
  assert.deepEqual(JSON.parse(JSON.stringify(app.collectProject())), before);
  assert.equal(app.window.localStorage.getItem('smetacraft_project'), storageBefore);
});

function stubPreviewTable(get) {
  const rows = [];
  const body = get('project-document-preview-body');
  body.firstChild = null;
  body.removeChild = function () { this.firstChild = null; };
  body.appendChild = function (row) { rows.push(row); return row; };
  return rows;
}

function setupDocumentImportHost(hostname, origin, fetchImpl) {
  const { app, get } = setupApplyApp();
  app.window.location = {
    hostname: hostname,
    origin: origin || ('http://' + hostname),
  };
  app.window.SMETACRAFT_PUBLIC_ORIGINS = [
    'http://31.172.78.193',
    'http://333428.fornex.cloud',
  ];
  app.window.crypto = {
    subtle: {
      digest: async (_algo, bytes) => crypto.createHash('sha256').update(Buffer.from(bytes)).digest(),
    },
  };
  app.crypto = crypto;
  app.TextEncoder = TextEncoder;
  app.AbortController = AbortController;
  app.setTimeout = setTimeout;
  app.clearTimeout = clearTimeout;
  app.Date = Date;
  const revoked = [];
  app.URL = {
    createObjectURL(file) { return 'blob:test:' + (file && file.name || 'file'); },
    revokeObjectURL(url) { revoked.push(url); },
  };
  const iframe = get('project-document-viewer');
  iframe.dataset = {};
  iframe.src = '';
  iframe.removeAttribute = function (name) { if (name === 'src') this.src = ''; };
  const fetches = [];
  let migrated = 0;
  app.fetch = async (url, init = {}) => {
    fetches.push({ url, init });
    if (fetchImpl) return fetchImpl(url, init, fetches);
    throw new Error('Failed to fetch');
  };
  app.runProjectMigration = async () => { migrated += 1; };
  get('project-document-file').addEventListener = function () {};
  get('project-document-apply').addEventListener = function () {};
  get('project-document-clear').addEventListener = function () {};
  get('project-document-clear').hidden = true;
  stubPreviewTable(get);
  return { app, get, fetches, migrated: () => migrated, revoked };
}

function pdfFile(name, bytes) {
  return {
    name,
    type: 'application/pdf',
    size: bytes.length,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}

function successfulFornexFetch(app, fetches) {
  return async (url, init = {}) => {
    if (url === '/api/projects/migrate') {
      const sha = crypto.createHash('sha256').update(String(init.body || '')).digest('hex');
      return {
        ok: true,
        status: 201,
        json: async () => ({
          ok: true,
          projectId: 'a'.repeat(32),
          revision: 1,
          sha256: sha,
          capabilityToken: 'tok-' + 'b'.repeat(40),
        }),
      };
    }
    if (String(url) === '/api/projects/' + 'a'.repeat(32) && (!init.method || init.method === 'GET')) {
      const migrate = fetches.find(item => item.url === '/api/projects/migrate');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          project: JSON.parse(migrate.init.body),
        }),
      };
    }
    if (String(url).endsWith('/files') && init.method === 'POST') {
      const preview = app.parseDocument(autocadLikePdf(), PDF_MEDIA_TYPE);
      return {
        ok: true,
        status: 201,
        json: async () => ({
          ok: true,
          objectId: 'c'.repeat(32),
          preview,
        }),
      };
    }
    if (init.method === 'DELETE') {
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, objectId: 'c'.repeat(32), status: 'rejected' }),
      };
    }
    throw new Error('Failed to fetch');
  };
}

test('document import fieldset is hidden on GitHub Pages', () => {
  const { app, get, fetches } = setupDocumentImportHost(
    'viktor-qatester.github.io',
    'https://viktor-qatester.github.io',
  );
  get('project-document-import-fieldset').hidden = true;
  app.bindDocumentImport();
  assert.equal(get('project-document-import-fieldset').hidden, true);
  assert.equal(app.isAllowedServerOrigin(), false);
  assert.equal(fetches.length, 0);
});

test('document import fieldset is visible on Fornex public origin', () => {
  const { app, get } = setupDocumentImportHost('31.172.78.193', 'http://31.172.78.193');
  get('project-document-import-fieldset').hidden = true;
  app.bindDocumentImport();
  assert.equal(get('project-document-import-fieldset').hidden, false);
  assert.equal(app.isAllowedServerOrigin(), true);
  assert.equal(app.isDocumentImportLoopback(), false);
});

test('client AutoCAD-like preview maps zero fields', () => {
  const { app, get } = setupApplyApp();
  stubPreviewTable(get);
  const preview = app.parseDocument(autocadLikePdf(), PDF_MEDIA_TYPE);
  assert.equal(preview.sourceKind, 'drawing-plot');
  assert.equal(Object.keys(preview.parameters || {}).length, 0);
  assert.ok(preview.fields.every(field => field.status === 'manual'));
  app.renderDocumentPreview(preview);
  assert.equal(get('project-document-apply').disabled, true);
  assert.match(get('project-document-preview-message').textContent, /вручную/);
});

test('client explicit-labels preview apply overlays params and never prices', () => {
  const { app, get } = setupApplyApp();
  stubPreviewTable(get);
  const before = JSON.parse(JSON.stringify(app.collectProject()));
  const preview = app.parseDocument(explicitLabelsPdf(), PDF_MEDIA_TYPE);
  assert.equal(preview.sourceKind, 'explicit-text');
  assert.equal(preview.parameters['strip-length'], '42');
  app.renderDocumentPreview(preview);
  assert.equal(get('project-document-apply').disabled, false);
  const applied = app.applyDocumentImportParameters(preview.parameters);
  assert.ok(applied > 0);
  const after = app.collectProject();
  assert.equal(String(after.fields['strip-length']), '42');
  assert.equal(String(after.fields['walls-height']), '3');
  assert.equal(after.fields['concrete-price'], before.fields['concrete-price']);
  assert.equal(after.fields['strip-concrete-price'], before.fields['strip-concrete-price']);
});

test('GitHub Pages does not POST, migrate, or parse on bind', async () => {
  const { app, get, fetches, migrated } = setupDocumentImportHost(
    'viktor-qatester.github.io',
    'https://viktor-qatester.github.io',
  );
  const storageBefore = app.window.localStorage.getItem('smetacraft_project');
  const pdf = explicitLabelsPdf();
  get('project-document-file').files = [pdfFile('labels.pdf', pdf)];
  get('project-document-file').value = 'labels.pdf';
  app.bindDocumentImport();
  await app.handleDocumentFileChange();
  assert.equal(fetches.length, 0);
  assert.equal(migrated(), 0);
  assert.equal(app.window.localStorage.getItem('smetacraft_project'), storageBefore);
  assert.match(get('project-document-status').textContent, /статическом сайте/);
});

test('Fornex PDF upload without migrate click does not say server unavailable', async () => {
  const { app, get, fetches } = setupDocumentImportHost(
    '31.172.78.193',
    'http://31.172.78.193',
  );
  app.fetch = async (url, init = {}) => {
    fetches.push({ url, init });
    return successfulFornexFetch(app, fetches)(url, init);
  };
  assert.equal(app.window.localStorage.getItem('smetacraft_project_migration_v1'), null);
  const pdf = autocadLikePdf();
  get('project-document-file').files = [pdfFile('plot.pdf', pdf)];
  get('project-document-file').value = 'plot.pdf';
  app.bindDocumentImport();
  await app.handleDocumentFileChange();
  const status = get('project-document-status').textContent;
  assert.equal(/сервер недоступен/i.test(status), false);
  assert.match(status, /Автоподстановка 0/);
  assert.match(status, /вручную/);
  assert.match(status, /сохранён/);
  assert.ok(fetches.some(item => item.url === '/api/projects/migrate'));
  assert.ok(fetches.some(item => /\/files$/.test(String(item.url)) && item.init.method === 'POST'));
  assert.equal(get('project-document-clear').hidden, false);
  assert.equal(get('project-document-viewer-wrap').hidden, false);
  assert.equal(get('project-document-viewer').src, 'blob:test:plot.pdf');
});

test('AutoCAD fallback without migrate does not say server unavailable', async () => {
  const { app, get, fetches, migrated } = setupDocumentImportHost(
    '31.172.78.193',
    'http://31.172.78.193',
  );
  assert.equal(app.window.localStorage.getItem('smetacraft_project_migration_v1'), null);
  const pdf = autocadLikePdf();
  get('project-document-file').files = [pdfFile('plot.pdf', pdf)];
  get('project-document-file').value = 'plot.pdf';
  app.bindDocumentImport();
  await app.handleDocumentFileChange();
  const status = get('project-document-status').textContent;
  assert.equal(/сервер недоступен/i.test(status), false);
  assert.match(status, /Автоподстановка 0/);
  assert.match(status, /вручную/);
  assert.match(status, /\(network\)/);
  assert.ok(fetches.some(item => item.url === '/api/projects/migrate'));
  assert.equal(migrated(), 0);
  assert.equal(get('project-document-viewer-wrap').hidden, false);
  assert.equal(get('project-document-clear').hidden, false);
});

test('real fetch HTTP error is shown as a short code, not server unavailable', async () => {
  const { app, get } = setupDocumentImportHost(
    '31.172.78.193',
    'http://31.172.78.193',
    async () => ({
      ok: false,
      status: 403,
      json: async () => ({ ok: false, error: 'origin_forbidden' }),
    }),
  );
  const pdf = autocadLikePdf();
  get('project-document-file').files = [pdfFile('plot.pdf', pdf)];
  get('project-document-file').value = 'plot.pdf';
  app.bindDocumentImport();
  await app.handleDocumentFileChange();
  const status = get('project-document-status').textContent;
  assert.equal(/сервер недоступен/i.test(status), false);
  assert.match(status, /\(403\)/);
  assert.match(status, /Автоподстановка 0/);
});

test('delete file clears viewer, preview, object URL, state and input', async () => {
  const { app, get, fetches, revoked } = setupDocumentImportHost(
    '31.172.78.193',
    'http://31.172.78.193',
  );
  app.fetch = async (url, init = {}) => {
    fetches.push({ url, init });
    return successfulFornexFetch(app, fetches)(url, init);
  };
  const pdf = autocadLikePdf();
  get('project-document-file').files = [pdfFile('plot.pdf', pdf)];
  get('project-document-file').value = 'plot.pdf';
  app.bindDocumentImport();
  await app.handleDocumentFileChange();
  assert.equal(get('project-document-viewer-wrap').hidden, false);
  assert.equal(get('project-document-clear').hidden, false);
  await app.handleDocumentClear();
  assert.equal(get('project-document-viewer-wrap').hidden, true);
  assert.equal(get('project-document-preview-wrap').hidden, true);
  assert.equal(get('project-document-viewer').src, '');
  assert.equal(get('project-document-file').value, '');
  assert.equal(get('project-document-file-name').textContent, 'Файл не выбран');
  assert.equal(get('project-document-clear').hidden, true);
  assert.equal(get('project-document-apply').disabled, true);
  assert.ok(revoked.includes('blob:test:plot.pdf'));
  assert.ok(fetches.some(item => item.init.method === 'DELETE' && /\/files\/c{32}$/.test(String(item.url))));
  assert.match(get('project-document-status').textContent, /убран/);
  get('project-document-file').files = [pdfFile('other.pdf', pdf)];
  get('project-document-file').value = 'other.pdf';
  await app.handleDocumentFileChange();
  assert.equal(get('project-document-viewer-wrap').hidden, false);
  assert.equal(get('project-document-file-name').textContent, 'other.pdf');
});

test('delete without objectId still clears the client UI', async () => {
  const { app, get, fetches, revoked } = setupDocumentImportHost(
    '31.172.78.193',
    'http://31.172.78.193',
  );
  const pdf = autocadLikePdf();
  get('project-document-file').files = [pdfFile('plot.pdf', pdf)];
  get('project-document-file').value = 'plot.pdf';
  app.bindDocumentImport();
  await app.handleDocumentFileChange();
  const fetchCount = fetches.length;
  await app.handleDocumentClear();
  assert.equal(fetches.filter(item => item.init && item.init.method === 'DELETE').length, 0);
  assert.equal(fetches.length, fetchCount);
  assert.equal(get('project-document-viewer-wrap').hidden, true);
  assert.equal(get('project-document-file').value, '');
  assert.equal(get('project-document-file-name').textContent, 'Файл не выбран');
  assert.ok(revoked.includes('blob:test:plot.pdf'));
});
