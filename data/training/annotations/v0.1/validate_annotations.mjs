import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const annotations = JSON.parse(fs.readFileSync(new URL('./annotations.json', import.meta.url), 'utf8'));
const csv = fs.readFileSync(new URL('./field_catalog.csv', import.meta.url), 'utf8').trim().split(/\r?\n/);
const catalog = new Map(csv.slice(1).map((line) => {
  const [fieldId, type] = line.split(',');
  return [fieldId, type];
}));
const fieldIds = new Set(catalog.keys());
const statuses = new Set(annotations.status_values);
const errors = [];
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const corpusDir = process.env.SMETACRAFT_CORPUS_DIR
  ? path.resolve(process.env.SMETACRAFT_CORPUS_DIR)
  : null;
const manifestLines = fs.readFileSync(new URL('./dataset_manifest.csv', import.meta.url), 'utf8').trim().split(/\r?\n/);

function parseCsvLine(line) {
  const cells = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && quoted && line[i + 1] === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      cells.push(value);
      value = '';
    } else {
      value += char;
    }
  }
  cells.push(value);
  return cells;
}

const manifestHeaders = parseCsvLine(manifestLines[0]);
const manifest = new Map(manifestLines.slice(1).map((line) => {
  const values = parseCsvLine(line);
  const row = Object.fromEntries(manifestHeaders.map((header, index) => [header, values[index]]));
  return [row.filename, row];
}));
let labelCount = 0;
let confirmedCount = 0;
let needsReviewCount = 0;
let notFoundCount = 0;

for (const project of annotations.projects) {
  const source = manifest.get(project.source_pdf);
  if (!source) {
    errors.push(`${project.project_id}: source is missing from dataset_manifest.csv: ${project.source_pdf}`);
    continue;
  }
  let actualPages = Number(source.pages);
  if (corpusDir) {
    const sourcePath = path.join(corpusDir, project.source_pdf);
    if (!fs.existsSync(sourcePath)) {
      errors.push(`${project.project_id}: source PDF not found: ${project.source_pdf}`);
      continue;
    }
    const pdfInfo = execFileSync('pdfinfo', [sourcePath], { encoding: 'utf8' });
    actualPages = Number(pdfInfo.match(/^Pages:\s+(\d+)/m)?.[1]);
    const actualHash = crypto.createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex');
    if (actualHash !== source.sha256) {
      errors.push(`${project.project_id}: SHA-256 does not match dataset_manifest.csv`);
    }
  }
  const declaredPages = project.labels.find((label) => label.field_id === 'document.page_count')?.value;
  if (declaredPages !== actualPages) {
    errors.push(`${project.project_id}: page count ${declaredPages} does not match PDF ${actualPages}`);
  }
  const seen = new Set();
  for (const label of project.labels) {
    labelCount += 1;
    if (!fieldIds.has(label.field_id)) errors.push(`${project.project_id}: unknown field ${label.field_id}`);
    if (!statuses.has(label.status)) errors.push(`${project.project_id}: invalid status ${label.status}`);
    if (seen.has(label.field_id)) errors.push(`${project.project_id}: duplicate field ${label.field_id}`);
    seen.add(label.field_id);
    if (label.page !== null && (!Number.isInteger(label.page) || label.page < 1)) {
      errors.push(`${project.project_id}: invalid page for ${label.field_id}`);
    }
    if (label.page !== null && label.page > actualPages) {
      errors.push(`${project.project_id}: page ${label.page} exceeds PDF page count for ${label.field_id}`);
    }
    const expectedType = catalog.get(label.field_id);
    const actualType = Array.isArray(label.value) ? 'array' : typeof label.value;
    if (label.value !== null && expectedType === 'integer' && !Number.isInteger(label.value)) {
      errors.push(`${project.project_id}: expected integer for ${label.field_id}`);
    } else if (label.value !== null && expectedType === 'number' && actualType !== 'number') {
      errors.push(`${project.project_id}: expected number for ${label.field_id}`);
    } else if (label.value !== null && !['number', 'integer'].includes(expectedType) && actualType !== expectedType) {
      errors.push(`${project.project_id}: expected ${expectedType} for ${label.field_id}`);
    }
    if (label.status === 'confirmed') {
      confirmedCount += 1;
      if (label.value === null || label.value === undefined) errors.push(`${project.project_id}: confirmed null ${label.field_id}`);
      if (!label.evidence) errors.push(`${project.project_id}: confirmed without evidence ${label.field_id}`);
    } else if (label.status === 'needs_review') {
      needsReviewCount += 1;
    } else if (label.status === 'not_found') {
      notFoundCount += 1;
      if (label.value !== null) errors.push(`${project.project_id}: not_found must use null for ${label.field_id}`);
    }
  }
}

const summary = {
  schema_version: annotations.schema_version,
  projects: annotations.projects.length,
  catalog_fields: fieldIds.size,
  labels: labelCount,
  confirmed: confirmedCount,
  needs_review: needsReviewCount,
  not_found: notFoundCount,
  source_pdfs_checked: Boolean(corpusDir),
  errors,
};

console.log(JSON.stringify(summary, null, 2));
if (errors.length) process.exitCode = 1;
