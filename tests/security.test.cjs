const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const fixtures = require('./scenarios.cjs');
const { projectFixture, plain } = require('./runtime.cjs');
const wallsSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'app', 'walls.js'), 'utf8');
const pilesSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'app', 'piles.js'), 'utf8');

function setup() {
  const { app, get } = projectFixture(fixtures);
  const original = plain(app.collectProject());
  return { app, get, original };
}

function rejectWithoutMutation(change) {
  const { app, original } = setup();
  const candidate = plain(original);
  change(candidate);
  const beforeStorage = app.window.localStorage.getItem('smetacraft_project');
  assert.throws(() => app.applyProject(app.parseProjectText(JSON.stringify(candidate))), /./);
  assert.deepStrictEqual(plain(app.collectProject()), original);
  assert.equal(app.window.localStorage.getItem('smetacraft_project'), beforeStorage);
}

test('v1 allowlists exactly match the representative export', () => {
  const { app, original } = setup();
  assert.equal(original.format, 'smetacraft-project');
  assert.equal(original.version, 1);
  assert.equal(Object.keys(original.fields).length, 99);
  assert.equal(Object.keys(original.checks).length, 15);
  assert.deepStrictEqual(original.radios, { 'summary-found-type': 'strip' });
  assert.equal(Object.keys(original.flags).length, 10);
  const parsed = app.parseProjectText(JSON.stringify(original));
  assert.deepStrictEqual(plain(parsed), original);
});

test('v1 openings preserve explicit locked values through import and full JSON round-trip', () => {
  const { app, original } = setup();
  const exported = plain(original);
  exported.openings[0].locked = false;
  exported.openings[1].locked = true;
  const json = JSON.stringify(exported);
  app.applyProject(app.parseProjectText(json));
  const restored = plain(app.collectProject());
  assert.equal(restored.openings[0].locked, false);
  assert.equal(restored.openings[1].locked, true);
  assert.deepStrictEqual(restored, exported);
  assert.deepStrictEqual(plain(app.parseProjectText(JSON.stringify(restored))), exported);
});

test('v1 openings retain the prior locked fallback when the key is absent', () => {
  const { app, original } = setup();
  delete original.openings[0].locked;
  delete original.openings[1].locked;
  app.applyProject(app.parseProjectText(JSON.stringify(original)));
  const rows = app.collectProject().openings;
  assert.equal(rows[0].locked, true);
  assert.equal(rows[1].locked, false);
});

for (const [name, change] of [
  ['null root', () => null],
  ['array root', () => []],
  ['missing format', x => { delete x.format; }],
  ['wrong format', x => { x.format = 'other'; }],
  ['missing version', x => { delete x.version; }],
  ['string version', x => { x.version = '1'; }],
  ['version 2', x => { x.version = 2; }],
  ...['fields', 'checks', 'radios', 'flags'].flatMap(key => [
    [`${key} null`, x => { x[key] = null; }],
    [`${key} array`, x => { x[key] = []; }],
    [`${key} primitive`, x => { x[key] = 'bad'; }],
  ]),
  ['openings object', x => { x.openings = {}; }],
  ['piles object', x => { x.piles = {}; }],
  ['null opening', x => { x.openings.push(null); }],
  ['primitive opening', x => { x.openings.push(4); }],
  ['null pile', x => { x.piles.push(null); }],
  ['primitive pile', x => { x.piles.push('bad'); }],
  ['string checkbox', x => { x.checks['roof-warm'] = 'false'; }],
  ['bad field type', x => { x.fields.length = {}; }],
  ['bad radio', x => { x.radios['summary-found-type'] = 'other'; }],
  ['bad flag', x => { x.flags.roofNeedsCalc = 'false'; }],
  ['bad block', x => { x.block = '__proto__'; }],
  ['bad billBlock', x => { x.billBlock = 'price'; }],
  ['bad opening id', x => { x.openings[0].id = 0; }],
  ['bad opening type', x => { x.openings[0].type = 'script'; }],
  ['bad pile diameter', x => { x.piles[0].diameterMm = 500; }],
  ['long pile name', x => { x.piles[0].name = 'x'.repeat(257); }],
  ['too many openings', x => { x.openings = Array.from({ length: 501 }, () => ({})); }],
  ['too many piles', x => { x.piles = Array.from({ length: 501 }, () => ({})); }],
]) {
  test(`rejects ${name} atomically`, () => {
    const { app, original } = setup();
    const candidate = plain(original);
    const changed = change(candidate);
    const value = changed === undefined ? candidate : changed;
    assert.throws(() => app.applyProject(app.parseProjectText(JSON.stringify(value))), /./);
    assert.deepStrictEqual(plain(app.collectProject()), original);
  });
}

for (const [section, key] of [
  ['openings', 'width'], ['openings', 'height'], ['openings', 'count'],
  ['piles', 'depthM'], ['piles', 'count'],
]) {
  test(`rejects HTML in ${section}.${key} before DOM`, () => {
    rejectWithoutMutation(x => { x[section][0][key] = '<img src=x onerror="window.__smetacraftXss=1">'; });
  });
}

test('unknown metadata and IDs are ignored, including an unrelated DOM id', () => {
  const { app, get, original } = setup();
  const unrelated = get('project-status');
  unrelated.id = 'project-status';
  unrelated.value = 'untouched';
  const before = plain(app.collectProject());
  const candidate = plain(original);
  candidate.extra = { anything: true };
  candidate.fields['project-status'] = 'overwrite';
  candidate.checks['project-status'] = true;
  candidate.radios.unrelated = 'strip';
  candidate.flags.unrelated = true;
  app.applyProject(app.parseProjectText(JSON.stringify(candidate)));
  assert.equal(unrelated.value, 'untouched');
  assert.deepStrictEqual(plain(app.collectProject()), before);
});

test('pile HTML payload stays an input value; row builders use no HTML parser sink', () => {
  const { app, original } = setup();
  const payload = '<img src=x onerror="window.__smetacraftXss=1">';
  const candidate = plain(original);
  candidate.piles[0].name = payload;
  app.applyProject(app.parseProjectText(JSON.stringify(candidate)));
  const row = app.pilesBodyEl.querySelector('tr.pile-row');
  assert.equal(row.querySelector('.js-pile-name').value, payload);
  assert.equal(row.querySelector('.js-pile-name').tagName, 'INPUT');
  assert.equal(app.window.__smetacraftXss, undefined);
  for (const name of ['wallsOpeningRowTemplate', 'pileRowTemplate']) {
    const source = name === 'pileRowTemplate' ? pilesSource : wallsSource;
    const start = source.indexOf('function ' + name + '(');
    const end = source.indexOf('\n      function ', start + 1);
    assert.ok(start >= 0);
    assert.doesNotMatch(source.slice(start, end), /innerHTML|insertAdjacentHTML|outerHTML|onerror\s*=/);
  }
});

test('aliases w/h/n and compatible numeric strings remain accepted', () => {
  const { app, original } = setup();
  const candidate = plain(original);
  const row = candidate.openings[0];
  row.w = row.width; row.h = row.height; row.n = row.count;
  delete row.width; delete row.height; delete row.count;
  candidate.piles[0].depthM = '2,5';
  app.applyProject(app.parseProjectText(JSON.stringify(candidate)));
  assert.equal(app.collectProject().openings[0].width, original.openings[0].width);
  assert.equal(app.collectProject().piles[0].depthM, 2.5);
});

test('oversized file is rejected before FileReader and leaves project untouched', () => {
  const { app, original } = setup();
  let reads = 0;
  app.FileReader = class { readAsText() { reads++; } };
  app.projectFileEl = { files: [{ name: '<img onerror=x>', size: 1024 * 1024 + 1 }], value: 'selected' };
  app.projectFileNameEl = { textContent: '' };
  app.projectStatusEl = { textContent: '', classList: { toggle() {} } };
  app.handleProjectFileChange();
  assert.equal(reads, 0);
  assert.equal(app.projectFileNameEl.textContent, '<img onerror=x>');
  assert.match(app.projectStatusEl.textContent, /больше 1 MiB/);
  assert.deepStrictEqual(plain(app.collectProject()), original);
});

test('invalid stored JSON is ignored without deleting or overwriting storage', () => {
  const { app, original } = setup();
  const bad = JSON.stringify({ ...original, version: '1' });
  app.window.localStorage.setItem('smetacraft_project', bad);
  assert.equal(app.hasStoredProjectValue(), true);
  assert.equal(app.loadFromLocalStorage(), false);
  assert.equal(app.window.localStorage.getItem('smetacraft_project'), bad);
  assert.deepStrictEqual(plain(app.collectProject()), original);
});
