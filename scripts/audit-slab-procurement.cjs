// Independent procurement audit, deliberately separate from golden regression.
// Scope: square slabs whose bars fit a stock rod without any splice.
// A failure is a product defect, not permission to change golden expectations.
const assert = require('node:assert/strict');
const { runScenario } = require('../tests/runtime.cjs');
const { slab } = require('../tests/scenarios.cjs');
let defects = 0;
for (const side of [3, 4, 5, 6]) {
  const stock = 6;
  const input = { ...slab, length: side, width: side, height: 0.2, rodLengthM: stock };
  const bill = runScenario({ id: `audit-${side}x${side}`, section: 'slab', input });
  const concrete = bill.rows.find(row => row.name.startsWith('Бетон '));
  assert.ok(Math.abs(concrete.cost - side * side * 0.2 * 1.05 * input.concretePrice) < 1e-8);
  // Independent integer/mm calculation; no production bar-count or lap helpers.
  const bars = (Math.ceil(side * 1000 / 200) + 1) * 2 * 2;
  const piecesPerStock = Math.floor(stock / side);
  const exactStocks = Math.ceil(bars / piecesPerStock);
  const rebar = bill.rows.find(row => row.name.startsWith('Арматура Ø'));
  const actualStocks = Number(rebar.name.match(/, (\d+) шт\./)[1]);
  const ok = actualStocks === exactStocks;
  console.log(JSON.stringify({ slab: `${side}x${side}`, bars, pieceLengthM: side,
    stockLengthM: stock, actualStocks, exactStocks, status: ok ? 'PASS' : 'FAIL' }));
  if (!ok) defects++;
}
console.log(`Procurement discrepancies: ${defects}. Concrete checks passed.`);
process.exitCode = defects ? 1 : 0;
