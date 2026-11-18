/**
 * Presentation-layer oracle for intentional UX fixes that must not rewrite
 * tests/golden.json.
 *
 * Locked to golden: costs, totals, netLabel, coefficients, names, categories,
 * selection, intermediate numeric subtotals, scope/excluded/meta/print text,
 * and tableHtml except the narrow order-cell transform below.
 *
 * Overridden here only:
 * 1) visible money total = sum of Intl-rounded line amounts in minor units
 *    (independent of production moneyToKop / formatMoneyFromKop);
 * 2) summary aggregate rows whose «К заказу» was a bare money amount become «—»;
 *    physical work quantities (e.g. м²) stay unchanged.
 */

'use strict';

const AGGREGATE_ORDER_LABEL = '—';

function isSummaryAggregateRow(name) {
  return /^(Стены и перегородки|Штукатурка|Кровля|Перекрытия) — /.test(String(name || ''));
}

/** Bare money in «К заказу» (no unit letters) becomes an aggregate dash. */
function shouldUseAggregateDash(row) {
  if (!isSummaryAggregateRow(row.name)) return false;
  return !/[a-zа-я]/i.test(String(row.orderLabel || ''));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatMoneyValueIndependent(n) {
  return Number(n).toLocaleString('ru-BY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function displayedKopIndependent(n) {
  const text = formatMoneyValueIndependent(n)
    .replace(/\u00a0/g, '')
    .replace(/\s/g, '')
    .replace(',', '.');
  const value = Number(text);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

function expectedDisplayedTotal(rows, symbol) {
  const currency = symbol || 'Br';
  if (!rows || !rows.length) {
    return formatMoneyValueIndependent(0) + ' ' + currency;
  }
  let kop = 0;
  for (let i = 0; i < rows.length; i++) {
    kop += displayedKopIndependent(rows[i].cost);
  }
  return formatMoneyValueIndependent(kop / 100) + ' ' + currency;
}

function patchOrderLabels(rows) {
  return (rows || []).map(function (row) {
    if (!shouldUseAggregateDash(row)) return row;
    const patched = Object.assign({}, row, { orderLabel: AGGREGATE_ORDER_LABEL });
    if (Object.prototype.hasOwnProperty.call(row, 'order')) {
      patched.order = { displayed: AGGREGATE_ORDER_LABEL, unit: '' };
    }
    return patched;
  });
}

/**
 * Replace only the order cell of money-only aggregate rows inside golden HTML.
 * Category rows, net/k/cost cells, and purchase order labels stay byte-identical.
 */
function patchTableHtml(html, goldenRows) {
  let out = html || '';
  for (let i = 0; i < (goldenRows || []).length; i++) {
    const row = goldenRows[i];
    if (!shouldUseAggregateDash(row)) continue;
    const pattern = new RegExp(
      '(<td>' +
        escapeRegExp(row.name) +
        '</td><td class="num">' +
        escapeRegExp(row.netLabel) +
        '</td><td class="num">[^<]*</td><td class="num">)' +
        escapeRegExp(row.orderLabel) +
        '(</td>)'
    );
    const next = out.replace(pattern, '$1' + AGGREGATE_ORDER_LABEL + '$2');
    if (next === out) {
      throw new Error('presentation oracle failed to patch order cell for: ' + row.name);
    }
    out = next;
  }
  return out;
}

function patchScenarioExpected(expected) {
  const out = JSON.parse(JSON.stringify(expected));
  const originalRows = expected.rows || [];
  if (out.display && Object.prototype.hasOwnProperty.call(out.display, 'tableHtml')) {
    out.display.tableHtml = patchTableHtml(out.display.tableHtml, originalRows);
  }
  out.rows = patchOrderLabels(out.rows);
  if (out.rows && out.rows.length) {
    out.displayedTotal = expectedDisplayedTotal(out.rows);
  }
  return out;
}

function patchSummarySnapshot(summary) {
  if (!summary) return summary;
  const out = JSON.parse(JSON.stringify(summary));
  out.rows = patchOrderLabels(out.rows);
  if (out.rows && out.rows.length) {
    out.displayedTotal = expectedDisplayedTotal(out.rows);
  }
  return out;
}

function patchJsonRoundTripExpected(expected) {
  const out = JSON.parse(JSON.stringify(expected));
  out.summaryBefore = patchSummarySnapshot(out.summaryBefore);
  out.summaryAfter = patchSummarySnapshot(out.summaryAfter);
  return out;
}

module.exports = {
  AGGREGATE_ORDER_LABEL,
  isSummaryAggregateRow,
  shouldUseAggregateDash,
  formatMoneyValueIndependent,
  displayedKopIndependent,
  expectedDisplayedTotal,
  patchOrderLabels,
  patchTableHtml,
  patchScenarioExpected,
  patchJsonRoundTripExpected,
};
