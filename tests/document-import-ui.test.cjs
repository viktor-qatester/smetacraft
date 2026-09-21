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
  const importIndex = scripts.indexOf('js/app/document-import.js');
  const bootIndex = scripts.indexOf('js/app/boot.js');
  assert.equal(scripts[bootIndex - 1], 'js/app/document-import.js');
  assert.equal(importIndex, bootIndex - 1);
  assert.match(html, /project-document-import-fieldset/);
  assert.match(html, /Автоподстановка размеров/);
  assert.match(html, /Цены не подставляются/);
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
