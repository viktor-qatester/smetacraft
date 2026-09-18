const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('./runtime.cjs');

function barCount(span, step) {
  const { context } = createApp();
  return context.barCount(span, step);
}

test('barCount: exact multiples avoid floating-point ceil artifact', () => {
  assert.equal(barCount(3.6, 0.12), 31);
  assert.equal(barCount(4.9, 0.7), 8);
});

test('barCount: non-multiple and previously correct pairs stay unchanged', () => {
  assert.equal(barCount(8, 0.2), 41);
  assert.equal(barCount(8.1, 0.2), 42);
  assert.equal(barCount(40, 0.3), 135);
  assert.equal(barCount(40, 1.2), 35);
  assert.equal(barCount(10, 0.6), 18);
});
