const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('./runtime.cjs');
const fixtures = require('./scenarios.cjs');

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

test('formatMoney uses selected currency without changing the numeric value', () => {
  const { context, get } = createApp();
  const currency = get('currency');
  currency.value = 'USD';
  assert.equal(context.formatMoney(1234.5), '1 234,50 $');
  assert.equal(context.formatMoneyValue(1234.5), '1 234,50');
});

test('formatMoney falls back to BYN for an unsupported currency', () => {
  const { context, get } = createApp();
  get('currency').value = 'unsupported';
  assert.equal(context.formatMoney(10), '10,00 Br');
});

test('plaster work row uses the selected currency per square metre', () => {
  const { context, get } = createApp();
  get('currency').value = 'EUR';
  const bill = context.calculatePlaster(fixtures.plaster);
  const work = bill.rows.find(row => row.name.startsWith('Штукатурные работы'));
  assert.match(work.name, / €\/м²$/);
});
