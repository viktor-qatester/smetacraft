const test = require('node:test');
const assert = require('node:assert/strict');
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
  assert.equal(importIndex, bootIndex - 1);
  assert.equal(parserIndex, importIndex - 1);
  assert.match(html, /project-document-import-fieldset/);
  assert.match(html, /smetacraft-public-origin/);
  assert.match(html, /Автоподстановка размеров/);
  assert.match(html, /Цены не подставляются/);
  assert.match(html, /id="project-document-import-fieldset" hidden/);
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
    assert.ok(rows.every(row => /вручную/.test(row.children[1].textContent)));
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

function setupDocumentImportHost(hostname, origin) {
  const { app, get } = setupApplyApp();
  app.window.location = {
    hostname: hostname,
    origin: origin || ('http://' + hostname),
  };
  app.window.SMETACRAFT_PUBLIC_ORIGINS = [
    'http://31.172.78.193',
    'http://333428.fornex.cloud',
  ];
  const fetches = [];
  let migrated = 0;
  app.fetch = async (url, init) => {
    fetches.push({ url, init });
    throw new Error('Failed to fetch');
  };
  app.runProjectMigration = async () => { migrated += 1; };
  get('project-document-file').addEventListener = function () {};
  get('project-document-apply').addEventListener = function () {};
  stubPreviewTable(get);
  return { app, get, fetches, migrated: () => migrated };
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
  get('project-document-file').files = [{
    name: 'labels.pdf',
    type: 'application/pdf',
    size: pdf.length,
    arrayBuffer: async () => pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength),
  }];
  get('project-document-file').value = 'labels.pdf';
  app.bindDocumentImport();
  await app.handleDocumentFileChange();
  assert.equal(fetches.length, 0);
  assert.equal(migrated(), 0);
  assert.equal(app.window.localStorage.getItem('smetacraft_project'), storageBefore);
  assert.match(get('project-document-status').textContent, /статическом сайте/);
});
