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
  assert.equal(entries.length, 99);
  assert.equal(new Set(entries.map(entry => entry.id)).size, 99);
  assert.deepStrictEqual(entries.map(entry => entry.id).sort(), Object.keys(project.fields).sort());
  assert.ok(entries.every(entry => entry.unit && entry.group));
});

test('representative v1 project round-trips with exact strings, rows and UI state', () => {
  const { app, project } = setup();
  project.fields.length = '10.0';
  project.fields['rebar-price'] = '3,20';
  project.openings[0].locked = false;
  project.openings[1].locked = true;
  const model = app.projectV1ToModel(project);
  assert.equal(model.slab.length.value, 10);
  assert.equal(model.slab.length.raw, '10.0');
  assert.equal(model.prices['rebar-price'].value, 3.2);
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
