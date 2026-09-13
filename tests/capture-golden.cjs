const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { sourceHash, runScenario, runJsonRoundTrip, runLegacyControl } = require('./runtime.cjs');
const fixtures = require('./scenarios.cjs');
const { scenarios, slab, plaster } = fixtures;

function capture() {
  return {
    description: 'Observed outputs from the unchanged index.html calculation and render functions',
    sourceSha256: sourceHash,
    projectSchemaVersion: 1,
    cases: scenarios.map(runScenario),
    jsonRoundTrip: runJsonRoundTrip(fixtures),
    legacyControl: runLegacyControl(slab, plaster),
  };
}

const first = capture();
const second = capture();
assert.deepStrictEqual(second, first, 'Two independent captures must match before baseline is saved');
assert.deepStrictEqual(first.jsonRoundTrip.imported, first.jsonRoundTrip.exported);
assert.deepStrictEqual(first.jsonRoundTrip.summaryAfter, first.jsonRoundTrip.summaryBefore);
assert.ok(first.jsonRoundTrip.summaryBefore.rows.length > 0);
assert.ok(first.jsonRoundTrip.exported.openings.length && first.jsonRoundTrip.exported.piles.length);
const summary = first.cases.find(x => x.id === 'summary-current');
if (!summary?.rows.length || !summary.display.tableHtml) throw new Error('Visible summary was not captured');
for (const id of ['summary-all-sections', 'summary-strip-piles-floor-roof']) {
  const item = first.cases.find(x => x.id === id);
  if (!item?.rows.length || !item.display.scope || !item.display.tableHtml) throw new Error(`Incomplete summary ${id}`);
}
for (const item of first.cases) {
  console.log(`${item.id}: ${item.rows.length} rows, ${item.displayedTotal || item.display.error || item.display.empty}`);
}
console.log(`Captured twice: ${first.cases.length} scenarios; visible summary ${summary.displayedTotal}`);
console.log(`Existing legacy method: ${first.legacyControl.displayedTotal}`);

if (process.argv.includes('--write')) {
  const target = path.join(__dirname, 'golden.json');
  if (fs.existsSync(target) && !process.argv.includes('--replace')) {
    throw new Error('golden.json already exists; use --replace only after reviewing intentional behavior changes');
  }
  fs.writeFileSync(target, JSON.stringify(first, null, 2) + '\n');
  console.log(`Saved ${target}`);
}
