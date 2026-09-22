const test = require('node:test');
const assert = require('node:assert/strict');
const fixtures = require('./scenarios.cjs');
const { projectFixture, plain } = require('./runtime.cjs');

function setup() {
  const { app } = projectFixture(fixtures);
  return { app, project: plain(app.collectProject()) };
}

test('Phase 3A mapping covers the complete JSON v1 allowlist', () => {
  const { app, project } = setup();
  const entries = plain(app.modelFieldEntries());
  assert.equal(entries.length, 102);
  assert.equal(new Set(entries.map(entry => entry.id)).size, 102);
  assert.deepStrictEqual(entries.map(entry => entry.id).sort(), Object.keys(project.fields).sort());
  assert.ok(entries.every(entry => entry.unit && entry.group));
});

test('representative v1 project round-trips with exact strings, rows and UI state', () => {
  const { app, project } = setup();
  project.fields.length = '10.0';
  project.fields['rebar-price'] = '3,20';
  project.fields.currency = 'EUR';
  project.openings[0].locked = false;
  project.openings[1].locked = true;
  const model = app.projectV1ToModel(project);
  assert.equal(model.slab.length.value, 10);
  assert.equal(model.slab.length.raw, '10.0');
  assert.equal(model.prices['rebar-price'].value, 3.2);
  assert.equal(model.prices.currency.value, 'EUR');
  assert.deepStrictEqual(plain(app.modelToProjectV1(model)), project);
});

test('missing, zero, invalid and inactive values remain distinct', () => {
  const { app, project } = setup();
  delete project.fields.length;
  project.fields.width = '0';
  project.fields.height = 'not-a-number';
  project.fields['roof-insulation-mm'] = '150';
  project.checks['roof-warm'] = false;
  const model = app.projectV1ToModel(project);
  assert.equal(model.slab.length.state, 'unknown');
  assert.equal(model.slab.width.state, 'known');
  assert.equal(model.slab.width.value, 0);
  assert.equal(model.slab.height.state, 'unparsed');
  assert.equal(model.roof['roof-insulation-mm'].value, 150);
  assert.equal(model.roof['roof-insulation-mm'].applicable, false);
  assert.deepStrictEqual(plain(app.modelToProjectV1(model)), project);
});

test('an intentional model edit reaches JSON while unchanged formatting stays intact', () => {
  const { app, project } = setup();
  project.fields.length = '10.0';
  const model = app.projectV1ToModel(project);
  model.slab.length.value = 11;
  const result = plain(app.modelToProjectV1(model));
  assert.equal(result.fields.length, 11);
  assert.equal(result.fields.width, project.fields.width);
});

test('legacy aliases normalize once and keep row order and locked fallback', () => {
  const { app, project } = setup();
  project.openings[0].w = project.openings[0].width;
  project.openings[0].h = project.openings[0].height;
  project.openings[0].n = project.openings[0].count;
  delete project.openings[0].width;
  delete project.openings[0].height;
  delete project.openings[0].count;
  delete project.openings[0].locked;
  const expected = plain(app.validateProjectV1(project));
  const model = app.projectV1ToModel(project);
  assert.equal(model.openings[0].locked, true);
  assert.deepStrictEqual(plain(app.modelToProjectV1(model)), expected);
});

test('invalid v1 and incompatible model versions are rejected', () => {
  const { app, project } = setup();
  project.version = '1';
  assert.throws(() => app.projectV1ToModel(project), /version/);
  project.version = 1;
  const model = app.projectV1ToModel(project);
  model.schemaVersion = 2;
  assert.throws(() => app.modelToProjectV1(model), /модели/);
});

test('Phase 3B export retains DOM-only fields, while import ignores them', () => {
  const { app, get } = projectFixture(fixtures);
  const intake = get('intake-length');
  intake.id = 'intake-length'; intake.type = 'text'; intake.value = '12.5';
  const intakeCheck = get('intake-include-found');
  intakeCheck.id = 'intake-include-found'; intakeCheck.type = 'checkbox'; intakeCheck.checked = true;
  const exported = plain(app.exportProjectV1Snapshot());
  assert.equal(exported.fields['intake-length'], '12.5');
  assert.equal(exported.checks['intake-include-found'], true);
  const imported = plain(app.parseProjectText(JSON.stringify(exported)));
  assert.equal(imported.fields['intake-length'], undefined);
  assert.equal(imported.checks['intake-include-found'], undefined);
  assert.equal(imported.fields.length, exported.fields.length);
});

test('Phase 3B export keeps an incomplete form row and current storage shape', () => {
  const { app } = setup();
  const original = plain(app.collectProject());
  app.writeOpeningsState([{ id: 1, type: 'window', width: '', height: '1.5', count: '1', locked: true }]);
  const raw = plain(app.collectProject());
  assert.equal(raw.openings[0].width, '');
  assert.deepStrictEqual(plain(app.exportProjectV1Snapshot()), raw);
  app.writeOpeningsState(original.openings);
  assert.deepStrictEqual(plain(app.exportProjectV1Snapshot()), original);
});

test('Phase 3B file import and localStorage restore pass through the model', () => {
  const { app, project } = setup();
  app.resetProjectToZero();
  app.projectFileEl = { files: [{ name: 'fixture.json', size: 1024 }], value: 'selected' };
  app.projectFileNameEl = { textContent: '' };
  app.projectStatusEl = { textContent: '', classList: { toggle() {} } };
  app.FileReader = class {
    readAsText() { this.result = JSON.stringify(project); this.onload(); }
  };
  app.handleProjectFileChange();
  assert.deepStrictEqual(plain(app.collectProject()), project);
  assert.match(app.projectStatusEl.textContent, /Проект загружен/);
  app.persistSuspended = false;
  app.saveToLocalStorage();
  assert.deepStrictEqual(JSON.parse(app.window.localStorage.getItem('smetacraft_project')), project);
  app.resetProjectToZero();
  assert.equal(app.loadFromLocalStorage(), true);
  assert.deepStrictEqual(plain(app.collectProject()), project);
});

test('Phase 3C manual DOM and JSON produce the same model and restore the same project', () => {
  const { app, get } = projectFixture(fixtures);
  get('strip-length').value = '42,5';
  get('roof-metal-price').value = '31.00';
  get('summary-include-roof').checked = false;
  app.writeOpeningsState([
    { id: 1, type: 'window', width: '1.5', height: '1.4', count: '4', locked: false },
    { id: 2, type: 'entry-door', width: '1', height: '2.1', count: '1', locked: true },
  ]);
  const before = plain(app.collectProject());
  const fromDom = plain(app.projectModelFromDom());
  const fromJson = plain(app.parseProjectModelText(JSON.stringify(before)));
  delete fromDom.compatibility.domExtras;
  assert.deepStrictEqual(fromDom, fromJson);
  assert.equal(fromDom.strip['strip-length'].value, 42.5);
  assert.equal(fromDom.prices['roof-metal-price'].raw, '31.00');
  assert.equal(fromDom.openings[0].locked, false);
  app.resetProjectToZero();
  app.applyProjectModel(fromDom);
  assert.deepStrictEqual(plain(app.collectProject()), before);
});

test('Phase 3C rejects a malformed model before changing DOM or storage', () => {
  const { app } = setup();
  const before = plain(app.collectProject());
  const model = app.projectModelFromDom();
  model.scope.checks['roof-warm'] = 'false';
  const stored = app.window.localStorage.getItem('smetacraft_project');
  assert.throws(() => app.applyProjectModel(model), /boolean/);
  assert.deepStrictEqual(plain(app.collectProject()), before);
  assert.equal(app.window.localStorage.getItem('smetacraft_project'), stored);
});
