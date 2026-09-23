const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const factsApi = require('../js/app/extracted-facts.js');
const { parseDocument } = require('../server/import/explicit-text.cjs');

const root = path.join(__dirname, '..', 'data', 'training', 'annotations', 'v0.1');
const annotations = JSON.parse(fs.readFileSync(path.join(root, 'annotations.json'), 'utf8'));
const manifest = fs.readFileSync(path.join(root, 'dataset_manifest.csv'), 'utf8');

function labelsOf(projects) {
  return projects.flatMap(project => project.labels);
}

test('annotation evidence keeps precision and does not apply review or missing values', () => {
  const score = factsApi.scoreEvidenceLabels(labelsOf(annotations.projects), text => {
    return factsApi.extractDocumentFacts({
      text,
      format: 'pdf',
      pageCount: 2,
      contentChars: 80,
    }).facts;
  });
  assert.deepEqual(score.falsePositive, []);
  assert.deepEqual(score.notFoundViolations, []);
  assert.deepEqual(score.reviewViolations, []);
  assert.equal(score.precision, 1);
  assert.ok(score.truePositive >= 20, `true positives ${score.truePositive}`);
  assert.ok(score.recallMiss.length > 0);
  assert.ok(score.unsupportedHonest > 0);
});

test('extraction of B22.5 is separate from mapping into the calculator', () => {
  const label = labelsOf(annotations.projects).find(item => item.field_id === 'foundation.slab.concrete_class');
  const fact = factsApi.extractDocumentFacts({
    text: label.evidence,
    format: 'pdf',
    pageCount: 2,
    contentChars: 40,
  }).facts.find(item => item.fieldId === label.field_id);
  assert.equal(fact.normalizedValue, 'B22.5');
  assert.equal(fact.target, null);
  assert.equal(fact.defaultSelected, false);
});

test('dataset manifest forbids committing source PDFs', () => {
  assert.match(manifest, /лицензия на распространение не подтверждена|перед распространением/i);
  const training = path.join(__dirname, '..', 'data', 'training');
  const pending = [training];
  const pdfs = [];
  while (pending.length) {
    const dir = pending.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) pending.push(full);
      else if (entry.name.toLowerCase().endsWith('.pdf')) pdfs.push(full);
    }
  }
  assert.deepEqual(pdfs, []);
});

test('available PDF corpus does not contradict confirmed labels', { skip: !process.env.SMETACRAFT_CORPUS_DIR }, () => {
  const corpus = path.resolve(process.env.SMETACRAFT_CORPUS_DIR);
  const contradictions = [];
  for (const project of annotations.projects) {
    const filePath = path.join(corpus, project.source_pdf);
    if (!fs.existsSync(filePath)) continue;
    let preview;
    try {
      preview = parseDocument(fs.readFileSync(filePath), 'application/pdf');
    } catch (error) {
      continue;
    }
    for (const label of project.labels) {
      const fact = (preview.facts || []).find(item => item.fieldId === label.field_id && item.status === 'confirmed');
      if (!fact) continue;
      if (label.status === 'not_found' || label.status === 'needs_review') {
        contradictions.push(`${project.project_id}:${label.field_id}`);
        continue;
      }
      const same = typeof label.value === 'number' && typeof fact.normalizedValue === 'number'
        ? Math.abs(label.value - fact.normalizedValue) < 0.001
        : fact.normalizedValue === label.value;
      if (!same) contradictions.push(`${project.project_id}:${label.field_id}`);
    }
  }
  assert.deepEqual(contradictions, []);
});
