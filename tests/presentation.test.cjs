const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const fixtures = require('./scenarios.cjs');
const { createApp, runScenario } = require('./runtime.cjs');
const {
  AGGREGATE_ORDER_LABEL,
  isSummaryAggregateRow,
  shouldUseAggregateDash,
  expectedDisplayedTotal,
  displayedKopIndependent,
  formatMoneyValueIndependent,
  patchScenarioExpected,
} = require('./presentation-oracle.cjs');
const golden = require('./golden.json');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('presentation total equals sum of Intl-rounded line costs (strip kop gap)', () => {
  const { context: app } = createApp();
  const actual = runScenario(fixtures.scenarios.find((item) => item.id === 'strip'));
  const linesKop = actual.rows.reduce((sum, row) => sum + displayedKopIndependent(row.cost), 0);
  const exactKop = displayedKopIndependent(actual.total);
  assert.notEqual(linesKop, exactKop, 'fixture must expose the classic 1-kopeck presentation gap');
  assert.equal(actual.displayedTotal, expectedDisplayedTotal(actual.rows));
  assert.equal(actual.displayedTotal, '6\u00a0858,29 Br');
  assert.equal(app.formatMoney(actual.total), '6\u00a0858,28 Br');
  assert.equal(app.sumMoneyKop(actual.rows.map((row) => row.cost)), linesKop);
});

test('summary money-only aggregates use em dash; physical work quantities stay', () => {
  const actual = runScenario(fixtures.scenarios.find((item) => item.id === 'summary-all-sections'));
  const aggregates = actual.rows.filter((row) => isSummaryAggregateRow(row.name));
  assert.ok(aggregates.length >= 8);

  const moneyAggregates = aggregates.filter((row) => shouldUseAggregateDash(row) || row.orderLabel === AGGREGATE_ORDER_LABEL);
  // Materials + walls/floor work (formerly bare money) → dash.
  assert.ok(moneyAggregates.some((row) => /материалы/.test(row.name) && row.orderLabel === AGGREGATE_ORDER_LABEL));
  assert.equal(
    actual.rows.find((row) => row.name.startsWith('Стены и перегородки — работы')).orderLabel,
    AGGREGATE_ORDER_LABEL
  );
  assert.equal(
    actual.rows.find((row) => row.name.startsWith('Перекрытия — работы')).orderLabel,
    AGGREGATE_ORDER_LABEL
  );

  const plasterWork = actual.rows.find((row) => row.name.startsWith('Штукатурка — работы'));
  const roofWork = actual.rows.find((row) => row.name.startsWith('Кровля — работы'));
  assert.match(plasterWork.orderLabel, /м²$/);
  assert.match(roofWork.orderLabel, /м²$/);
  assert.notEqual(plasterWork.orderLabel, AGGREGATE_ORDER_LABEL);
  assert.notEqual(roofWork.orderLabel, AGGREGATE_ORDER_LABEL);

  const purchaseRows = actual.rows.filter((row) => !isSummaryAggregateRow(row.name));
  assert.ok(purchaseRows.every((row) => row.orderLabel !== AGGREGATE_ORDER_LABEL));
  assert.ok(purchaseRows.every((row) => /[а-яa-z]/i.test(row.orderLabel)));
});

test('golden tableHtml oracle patches only aggregate money order cells', () => {
  const expected = golden.cases.find((item) => item.id === 'summary-all-sections');
  const patched = patchScenarioExpected(expected);
  assert.equal(patched.display.tableHtml.includes('>6 789,33</td>'), false);
  assert.equal(patched.display.tableHtml.includes('>7 367,13</td>'), false);
  assert.match(patched.display.tableHtml, /Штукатурка — работы[\s\S]*?<td class="num">109,50 м²<\/td>/);
  assert.match(patched.display.tableHtml, /Кровля — работы[\s\S]*?<td class="num">116,75 м²<\/td>/);
  assert.equal(
    patched.display.tableHtml.includes('Бетон М250</td><td class="num">24,00 м³</td><td class="num">1,05</td><td class="num">25,20 м³</td>'),
    true
  );
  // Unrelated purchase order/cost cells stay intact.
  assert.match(patched.display.tableHtml, /25,20 м³<\/td><td class="num">5 292,00 Br<\/td>/);
  assert.deepStrictEqual(
    patched.rows.map((row) => ({ name: row.name, cost: row.cost, netLabel: row.netLabel, coefficient: row.coefficient })),
    expected.rows.map((row) => ({ name: row.name, cost: row.cost, netLabel: row.netLabel, coefficient: row.coefficient }))
  );
});

test('scenario A house summary: visible line sum 24647.19 presentation contract', () => {
  const { context: app, get } = createApp();
  const slab = {
    ...fixtures.slab,
    length: 12,
    width: 8,
    height: 0.25,
  };
  const walls = {
    ...fixtures.walls,
    perimeter: 40,
    height: 3,
    openings: [
      { id: 1, type: 'window', width: 1.5, height: 1.4, count: 5 },
      { id: 2, type: 'entry-door', width: 1, height: 2.1, count: 1 },
    ],
  };
  const plaster = {
    ...fixtures.plaster,
    length: 40,
    wallHeight: 3,
    excludeOpenings: true,
  };
  get('summary-include-found').checked = true;
  get('summary-include-walls').checked = true;
  get('summary-include-plaster').checked = true;
  get('summary-include-roof').checked = false;
  get('summary-include-floor').checked = false;
  app.foundationType = 'slab';
  app.readForm = () => slab;
  app.readStripForm = () => fixtures.strip;
  app.readWallsForm = () => walls;
  app.readPlasterForm = () => plaster;
  app.readRoofForm = () => fixtures.roof;
  app.readFloorForm = () => fixtures.floor;
  app.getOpeningsData = () => walls.openings;
  let captured = null;
  const showBill = app.showBill;
  app.showBill = (rows, total, meta, options) => {
    captured = { rows, total };
    return showBill(rows, total, meta, options);
  };
  app.renderSummary();
  assert.ok(captured);
  const linesKop = captured.rows.reduce((sum, row) => sum + displayedKopIndependent(row.cost), 0);
  assert.equal(linesKop, 2464719);
  assert.equal(app.billTotalEl.textContent, expectedDisplayedTotal(captured.rows));
  assert.equal(app.billTotalEl.textContent, '24\u00a0647,19 Br');
  assert.match(
    captured.rows.find((row) => row.name.startsWith('Штукатурка — работы')).orderLabel,
    /м²$/
  );
  assert.equal(
    captured.rows.find((row) => row.name.startsWith('Стены и перегородки — материалы')).orderLabel,
    AGGREGATE_ORDER_LABEL
  );
  assert.equal(app.billRoundingNoteEl.hidden, false);
  assert.match(indexHtml, /id="bill-rounding-note"/);
  assert.match(indexHtml, /объём, площадь, масса/);
  assert.match(indexHtml, /Прочерк «—»[\s\S]*агрегат/);
});

test('Intl money rounding fixed expectations (not Math.round)', () => {
  const { context: app } = createApp();
  const cases = [
    [1.005, '1,01', 101],
    [1.015, '1,02', 102],
    [2.675, '2,68', 268],
    [-1.005, '-1,01', -101],
    [-1.015, '-1,02', -102],
    [-2.675, '-2,68', -268],
    [1.004, '1,00', 100],
    [10.005, '10,01', 1001],
  ];
  for (const [raw, text, kop] of cases) {
    assert.equal(formatMoneyValueIndependent(raw), text, 'oracle ' + raw);
    assert.equal(displayedKopIndependent(raw), kop, 'oracle kop ' + raw);
    assert.equal(app.formatMoneyValue(raw), text, 'app ' + raw);
    assert.equal(app.moneyToKop(raw), kop, 'app kop ' + raw);
  }
  // Half-up cases where raw Math.round(n*100) diverges from Intl display.
  assert.notEqual(Math.round(1.005 * 100), 101);
  assert.notEqual(Math.round(1.015 * 100), 102);
  assert.notEqual(Math.round(-1.005 * 100), -101);
  assert.notEqual(Math.round(-2.675 * 100), -268);
  assert.equal(app.moneyToKop(675.835), 67584);
});

test('oracle expectedDisplayedTotal does not call production money helpers', () => {
  const { context: app } = createApp();
  const originalSum = app.sumMoneyKop;
  const originalFmt = app.formatMoneyFromKop;
  let touched = false;
  app.sumMoneyKop = function () {
    touched = true;
    return originalSum.apply(this, arguments);
  };
  app.formatMoneyFromKop = function () {
    touched = true;
    return originalFmt.apply(this, arguments);
  };
  const rows = [{ cost: 1.005 }, { cost: 2.675 }];
  assert.equal(expectedDisplayedTotal(rows), '3,69 Br');
  assert.equal(touched, false);
});
