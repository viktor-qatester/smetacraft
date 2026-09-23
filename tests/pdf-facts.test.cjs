const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createApp } = require('./runtime.cjs');
const { parseDocument, PDF_MEDIA_TYPE } = require('../server/import/explicit-text.cjs');
const { buildPdf, autocadLikePdf } = require('./phase8-fixtures.cjs');
const factsApi = require('../js/app/extracted-facts.js');

function extract(text, extra = {}) {
  return factsApi.extractDocumentFacts({
    text,
    format: 'pdf',
    pageCount: extra.pageCount || 1,
    contentChars: extra.contentChars == null ? 40 : extra.contentChars,
    objectId: extra.objectId || null,
  }).facts;
}

function factById(list, fieldId) {
  return list.find(item => item.fieldId === fieldId) || null;
}

function mountPreview(get) {
  const body = get('project-document-preview-body');
  const rows = [];
  body.firstChild = null;
  body.removeChild = function () { this.firstChild = null; rows.length = 0; };
  body.appendChild = function (row) { rows.push(row); return row; };
  body.querySelectorAll = function (selector) {
    const found = [];
    for (const row of rows) {
      if (typeof row.querySelectorAll === 'function') found.push(...row.querySelectorAll(selector));
    }
    return found;
  };
  return { body, rows };
}

function fillSlab(get) {
  const values = {
    length: '10', width: '8', height: '0.3', grade: 'М250', currency: 'USD',
    'concrete-price': '210', 'bar-diameter': '12', 'rod-length': '5.8', 'bar-step': '200',
    'slab-mesh-count': '2', 'rebar-price': '3.2', 'wire-price': '4.5', 'board-price': '14',
    'timber-price': '8', 'sand-height': '0.2', 'sand-price': '32', 'stone-height': '0.2',
    'stone-price': '55', 'hydro-price': '28',
  };
  for (const [id, value] of Object.entries(values)) get(id).value = value;
}

function stubActiveBlock(app) {
  app.setActiveBlock = () => {};
}

test('russian slab thickness keeps evidence and converts mm to m', () => {
  const found = extract('Монолитная ж/б плита h=200 мм');
  const fact = factById(found, 'foundation.slab.thickness_mm');
  assert.equal(fact.status, 'confirmed');
  assert.equal(fact.normalizedValue, 200);
  assert.equal(fact.unit, 'mm');
  assert.match(fact.source.evidence, /h=200 мм/);
  assert.equal(fact.target.projectFieldId, 'height');
  assert.equal(fact.target.conversion, 'mm_to_m');
  assert.equal(fact.target.applyValue, '0.2');
  assert.equal(fact.defaultSelected, true);
  assert.equal(factsApi.validateExtractedFact(fact).ok, true);
});

test('english length and decimal comma or dot convert explicitly', () => {
  const dotted = factById(extract('slab length 10.5 m'), 'length');
  const comma = factById(extract('slab width 8,25 m'), 'width');
  assert.equal(dotted.normalizedValue, 10.5);
  assert.equal(dotted.target.applyValue, '10.5');
  assert.equal(comma.normalizedValue, 8.25);
  assert.equal(comma.target.applyValue, '8.25');
  const cm = factById(extract('slab thickness 20 cm'), 'foundation.slab.thickness_mm');
  assert.equal(cm.normalizedValue, 200);
  assert.equal(cm.target.conversion, 'cm_to_m');
  assert.equal(cm.target.applyValue, '0.2');
});

test('two thicknesses of one field become a conflict and are not selected', () => {
  const found = extract('Монолитная плита h=200 мм. Монолитная плита h=300 мм');
  const fact = factById(found, 'foundation.slab.thickness_mm');
  assert.equal(fact.status, 'conflict');
  assert.equal(fact.normalizedValue, null);
  assert.equal(fact.defaultSelected, false);
  const plan = factsApi.planDocumentFactApply(found, [fact.fieldId]);
  assert.ok(plan.errors.length > 0);
  assert.deepEqual(plan.fields, {});
});

test('thickness without a unit is not applied and not stored as zero', () => {
  const fact = factById(extract('плита толщина 200'), 'foundation.slab.thickness_mm');
  assert.equal(fact.status, 'needs_review');
  assert.equal(fact.normalizedValue, 200);
  assert.equal(fact.target, null);
  assert.equal(fact.defaultSelected, false);
  const plan = factsApi.planDocumentFactApply([fact], [fact.fieldId]);
  assert.ok(plan.errors.length > 0);
});

test('not_found wording does not become a confirmed zero', () => {
  const noisy = extract('Initial OCR is too noisy; do not infer foundation type');
  const missing = extract('No value can be confirmed from current OCR');
  assert.equal(factById(noisy, 'foundation.type'), null);
  assert.equal(factById(missing, 'foundation.slab.thickness_mm'), null);
  assert.equal(noisy.some(fact => fact.normalizedValue === 0 || fact.normalizedValue === '0'), false);
  assert.equal(missing.some(fact => fact.defaultSelected), false);
});

test('image-only PDF asks for OCR and does not invent geometry', () => {
  const preview = parseDocument(buildPdf([''], { title: 'scan' }), PDF_MEDIA_TYPE);
  assert.equal(preview.sourceKind, 'drawing-plot');
  assert.deepEqual(preview.parameters, {});
  assert.equal(preview.facts.some(fact => fact.status === 'ocr_required'), true);
  assert.match(preview.message, /OCR/);
  const adapter = factsApi.createLocalOcrAdapter();
  assert.equal(adapter.available, false);
  assert.equal(adapter.recognize().status, 'unsupported');
});

test('AutoCAD plot without labels still maps nothing', () => {
  const preview = parseDocument(autocadLikePdf(), PDF_MEDIA_TYPE);
  assert.equal(preview.sourceKind, 'drawing-plot');
  assert.deepEqual(preview.parameters, {});
  assert.equal(preview.facts.some(fact => fact.defaultSelected), false);
});

test('damaged and wrong files are rejected before facts', () => {
  assert.throws(() => parseDocument(Buffer.from('not a pdf'), PDF_MEDIA_TYPE));
  const truncated = parseDocument(Buffer.from('%PDF-1.4\n%%EOF\n'), PDF_MEDIA_TYPE);
  assert.deepEqual(truncated.parameters, {});
  assert.equal(truncated.facts.some(fact => fact.defaultSelected), false);
  assert.throws(() => parseDocument(buildPdf(['плита h=200 мм']), 'text/plain'));
});

test('concrete class, section and reference volume are not calculator fields', () => {
  const klass = factById(extract('Бетон B22,5 W6 F150'), 'foundation.slab.concrete_class');
  assert.equal(klass.normalizedValue, 'B22.5');
  assert.equal(klass.target, null);
  const section = factById(extract('Сечение 300x300 мм'), 'foundation.pile.primary.section_mm');
  assert.equal(section.normalizedValue, '300x300');
  assert.equal(section.target, null);
  const volume = factById(extract('Объём бетона для фундамента: 34,75 м3'), 'foundation.slab.concrete_volume_m3');
  assert.equal(volume.normalizedValue, 34.75);
  assert.equal(volume.selectable, false);
  const plan = factsApi.planDocumentFactApply([klass, section, volume], [klass.fieldId, section.fieldId, volume.fieldId]);
  assert.ok(plan.errors.length > 0);
  assert.deepEqual(plan.fields, {});
});

test('markup price and currency targets are rejected', () => {
  const fact = {
    fieldId: 'note',
    rawValue: 'цена 85',
    normalizedValue: 85,
    unit: null,
    status: 'confirmed',
    confidence: 1,
    source: { objectId: null, page: 1, evidence: 'цена 85' },
    target: { projectFieldId: 'concrete-price', conversion: 'identity', applyValue: '85', kind: 'field' },
    warnings: [],
    selectable: true,
    defaultSelected: false,
  };
  assert.equal(factsApi.validateExtractedFact(fact).ok, false);
  const currency = { ...fact, fieldId: 'cur', target: { ...fact.target, projectFieldId: 'currency', applyValue: 'USD' } };
  assert.equal(factsApi.validateExtractedFact(currency).ok, false);
});

test('script evidence stays text in the preview and preview does not change the project', () => {
  const { context: app, get } = createApp();
  fillSlab(get);
  app.window.localStorage.setItem('smetacraft_project', '{"format":"smetacraft-project","version":1}');
  const stored = app.window.localStorage.getItem('smetacraft_project');
  const before = app.collectProject();
  const payload = '<script>alert(1)</script><img src=x onerror=alert(1)>';
  const preview = app.buildPreview({
    format: 'pdf',
    pageCount: 1,
    extractedText: 'Монолитная ж/б плита h=200 мм ' + payload,
    contentChars: 80,
  });
  const fact = factById(preview.facts, 'foundation.slab.thickness_mm');
  fact.source.evidence = payload;
  mountPreview(get);
  app.renderDocumentPreview(preview);
  const evidence = get('project-document-preview-body').querySelectorAll('.js-fact-evidence');
  assert.ok(evidence.some(cell => cell.textContent === payload));
  assert.equal(evidence.some(cell => cell.innerHTML && cell.innerHTML.includes('<script>')), false);
  assert.equal(app.window.localStorage.getItem('smetacraft_project'), stored);
  assert.deepEqual(app.collectProject(), before);
  assert.equal(get('height').value, '0.3');
  assert.equal(get('currency').value, 'USD');
  assert.equal(get('concrete-price').value, '210');
});

test('apply writes only the checked row and leaves price and currency', async () => {
  const { context: app, get } = createApp();
  fillSlab(get);
  stubActiveBlock(app);
  app.renderSlab(false);
  const totalBefore = app.billTotalEl.textContent;
  const rowsBefore = app.billBodyEl.innerHTML;
  const same = app.buildPreview({
    format: 'pdf',
    pageCount: 1,
    extractedText: 'Монолитная ж/б плита h=300 мм',
    contentChars: 40,
  });
  app.applySelectedDocumentFacts(same.facts, ['foundation.slab.thickness_mm']);
  app.renderSlab(false);
  assert.equal(get('height').value, '0.3');
  assert.equal(app.billTotalEl.textContent, totalBefore);
  assert.equal(app.billBodyEl.innerHTML, rowsBefore);

  const preview = app.buildPreview({
    format: 'pdf',
    pageCount: 1,
    extractedText: 'Монолитная ж/б плита h=200 мм. Марка бетона М300. Спецификация свай: 75 шт.',
    contentChars: 80,
  });
  mountPreview(get);
  app.renderDocumentPreview(preview);
  const boxes = get('project-document-preview-body').querySelectorAll('.js-fact-apply');
  assert.ok(boxes.some(box => box.value === 'foundation.slab.thickness_mm' && box.checked));
  for (const box of boxes) {
    if (box.value !== 'foundation.slab.thickness_mm') box.checked = false;
  }
  app.window.localStorage.setItem('smetacraft_project', 'kept');
  app.documentImportState = { preview, storedOnServer: false };
  await app.handleDocumentApply();
  assert.equal(get('height').value, '0.2');
  assert.equal(get('grade').value, 'М250');
  assert.equal(get('concrete-price').value, '210');
  assert.equal(get('currency').value, 'USD');
  assert.equal(app.window.localStorage.getItem('smetacraft_project'), 'kept');
  const project = app.collectProject();
  assert.equal(project.format, 'smetacraft-project');
  assert.equal(project.version, 1);
  assert.notEqual(project.piles[0] && project.piles[0].count, 75);
});

test('a critical fact error applies nothing', () => {
  const { context: app, get } = createApp();
  fillSlab(get);
  stubActiveBlock(app);
  const good = factById(extract('Монолитная ж/б плита h=200 мм'), 'foundation.slab.thickness_mm');
  const bad = {
    fieldId: 'foundation.pile.primary.diameter_mm',
    rawValue: 'диаметр сваи 89 мм',
    normalizedValue: 89,
    unit: 'mm',
    status: 'confirmed',
    confidence: 0.9,
    source: { objectId: null, page: 1, evidence: 'диаметр сваи 89 мм' },
    target: {
      projectFieldId: 'piles.0.diameterMm',
      conversion: 'identity_mm',
      applyValue: '89',
      kind: 'pile',
      pile: { diameterMm: 89 },
    },
    warnings: [],
    selectable: true,
    defaultSelected: false,
  };
  assert.throws(() => app.applySelectedDocumentFacts([good, bad], [good.fieldId, bad.fieldId]));
  assert.equal(get('height').value, '0.3');
  assert.equal(get('concrete-price').value, '210');
  assert.equal(get('currency').value, 'USD');
});

test('explicit M grade can be applied without changing the price field', () => {
  const { context: app, get } = createApp();
  fillSlab(get);
  stubActiveBlock(app);
  const grade = factById(extract('Марка бетона М300'), 'concrete.grade_m');
  assert.equal(grade.defaultSelected, false);
  assert.equal(grade.target.projectFieldId, 'grade');
  app.applySelectedDocumentFacts([grade], [grade.fieldId]);
  assert.equal(get('grade').value, 'М300');
  assert.equal(get('concrete-price').value, '210');
  assert.equal(get('currency').value, 'USD');
});
