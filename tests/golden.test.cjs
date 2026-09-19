const test = require('node:test');
const assert = require('node:assert/strict');
const golden = require('./golden.json');
const fixtures = require('./scenarios.cjs');
const { sourceHash, runScenario, runJsonRoundTrip, runLocalStorageRoundTrip, runIntakeSlabSmoke, runLegacyControl, runExistingRegression } = require('./runtime.cjs');

if (process.env.SMETA_TEST_MUTATE === '1') {
  // A test-only proof that a changed golden line price really fails the suite.
  golden.cases[0].rows[0].cost += 0.01;
}

test('baseline provenance and complete scenario list', () => {
  assert.equal(golden.projectSchemaVersion, 1);
  assert.deepStrictEqual(golden.cases.map(x => x.id), fixtures.scenarios.map(x => x.id));
  assert.match(golden.sourceSha256, /^[0-9a-f]{64}$/);
  // The source hash documents capture provenance; a harmless UI edit must not
  // suppress behavior comparisons after the Calculation Core is extracted.
  if (sourceHash !== golden.sourceSha256) {
    console.log('index.html has changed since capture; comparing behavior against the saved baseline.');
  }
});

for (const scenario of fixtures.scenarios) {
  test(`golden: ${scenario.id}`, () => {
    const expected = golden.cases.find(item => item.id === scenario.id);
    assert.deepStrictEqual(runScenario(scenario), expected);
  });
}

test('summary branches cover all sections and strip with piles and exclusions', () => {
  const full = golden.cases.find(x => x.id === 'summary-all-sections');
  const alternate = golden.cases.find(x => x.id === 'summary-strip-piles-floor-roof');
  assert.deepStrictEqual(full.selection, { found: true, walls: true, plaster: true, roof: true, floor: true });
  assert.deepStrictEqual(Object.keys(full.intermediate.sectionSubtotals),
    ['foundation', 'walls', 'plaster', 'roof', 'floor']);
  assert.match(full.display.scope, /плитный фундамент.*кровля.*перекрытия/);
  assert.match(full.display.excluded, /Все доступные разделы включены/);
  assert.equal(alternate.input.strip.pilesEnabled, true);
  assert.ok(alternate.input.strip.piles.length > 0);
  assert.deepStrictEqual(Object.keys(alternate.intermediate.sectionSubtotals), ['foundation', 'roof', 'floor']);
  assert.match(alternate.display.scope, /ленточный фундамент/);
  assert.match(alternate.display.excluded, /стены и перегородки, штукатурка/);
  assert.notDeepStrictEqual(full.selection, alternate.selection);
  assert.notEqual(full.displayedTotal, alternate.displayedTotal);
});

test('version 1 JSON export → clear → import → identical inputs, rows and cost', () => {
  const actual = runJsonRoundTrip(fixtures);
  assert.equal(actual.projectSchemaVersion, 1);
  assert.equal(actual.afterClear.length, '0');
  assert.deepStrictEqual(actual.afterClear.openings, []);
  assert.deepStrictEqual(actual.afterClear.piles, []);
  assert.ok(Object.keys(actual.exported.fields).length > 70);
  assert.ok(actual.exported.openings.some(row => row.type === 'window'));
  assert.ok(actual.exported.openings.some(row => row.type === 'entry-door'));
  assert.ok(actual.exported.piles.length > 0);
  assert.equal(actual.exported.radios['summary-found-type'], 'strip');
  assert.equal(actual.exported.flags.wallsPerimeterManual, true);
  assert.equal(actual.exported.checks['summary-include-roof'], true);
  assert.equal(actual.afterClear.metalPrice, '1');
  assert.equal(actual.afterClear.foundType, 'slab');
  assert.deepStrictEqual(actual.imported, actual.exported);
  assert.ok(actual.summaryBefore.rows.length > 0);
  assert.deepStrictEqual(actual.summaryAfter, actual.summaryBefore);
  assert.deepStrictEqual(actual, golden.jsonRoundTrip);
});

test('localStorage saves and restores the representative project, prices, openings and piles', () => {
  const actual = runLocalStorageRoundTrip(fixtures);
  assert.equal(actual.loaded, true);
  assert.deepStrictEqual(actual.saved, actual.before);
  assert.notDeepStrictEqual(actual.cleared, actual.before);
  assert.deepStrictEqual(actual.restored, actual.before);
  assert.ok(actual.restored.openings.length > 0 && actual.restored.piles.length > 0);
  assert.equal(actual.restored.fields['roof-metal-price'], String(fixtures.roof.metalPrice));
});

test('first-time questionnaire: slab only → summary names its scope and exclusions', () => {
  const actual = runIntakeSlabSmoke(fixtures);
  const slab = golden.cases.find(x => x.id === 'slab-two-meshes');
  assert.equal(actual.applied, true);
  assert.equal(actual.activeBlock, 'summary');
  assert.deepStrictEqual(actual.afterIntake, fixtures.slab);
  assert.deepStrictEqual(actual.bill.rows, slab.rows.map(row => ({
    name: row.name, netLabel: row.netLabel, k: row.coefficient,
    orderLabel: row.orderLabel, cost: row.cost,
  })));
  assert.equal(actual.displayedTotal, slab.displayedTotal);
  assert.match(actual.scope, /плитный фундамент/);
  assert.match(actual.excluded, /Не рассчитано: стены и перегородки, перекрытия, штукатурка, кровля/);
  assert.equal(actual.error, '');
});

test('legacy 19 678,29 Br control is distinct from renderSummary', () => {
  const actual = runLegacyControl(fixtures.slab, fixtures.plaster);
  assert.deepStrictEqual(actual, golden.legacyControl);
  assert.equal(actual.displayedTotal, '19\u00a0678,29 Br');
  const visible = golden.cases.find(x => x.id === 'summary-legacy-fixture-visible');
  assert.notEqual(visible.displayedTotal, actual.displayedTotal);
});

test('existing runRegressionTests passes with deterministic Node form fixtures', () => {
  const result = runExistingRegression(fixtures);
  assert.equal(result.passed, true, result.badge);
  assert.equal(result.hidden, true);
  assert.equal(result.badge, '');
});

test('failed runRegressionTests remains visible with diagnostic details', () => {
  const broken = { ...fixtures, slab: { ...fixtures.slab, length: fixtures.slab.length + 1 } };
  const result = runExistingRegression(broken);
  assert.equal(result.passed, false);
  assert.equal(result.hidden, false);
  assert.equal(result.badge, 'Ошибка регрессии!');
  assert.match(result.title, /Плита/);
});
