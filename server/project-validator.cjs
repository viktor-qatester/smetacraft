const { MAX_ROWS } = require('./config.cjs');

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function numeric(value, integer = false) {
  const validString = typeof value === 'string' &&
    /^\s*[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?\s*$/.test(value);
  const number = typeof value === 'number' ? value :
    validString ? Number(value.trim().replace(',', '.')) : NaN;
  return Number.isFinite(number) && (!integer || (Number.isSafeInteger(number) && number > 0));
}

function validProject(project) {
  if (!isObject(project) || project.format !== 'smetacraft-project' || project.version !== 1) return false;
  if (project.block !== undefined &&
      !['intake', 'slab', 'strip', 'walls', 'plaster', 'floor', 'roof', 'summary', 'price', 'project'].includes(project.block)) return false;
  if (project.billBlock !== undefined &&
      !['slab', 'strip', 'walls', 'floor', 'plaster', 'roof', 'summary'].includes(project.billBlock)) return false;
  for (const section of ['fields', 'checks', 'radios', 'flags']) {
    if (project[section] !== undefined && !isObject(project[section])) return false;
  }
  if (project.fields && Object.values(project.fields).some(value =>
    typeof value !== 'string' && !(typeof value === 'number' && Number.isFinite(value)))) return false;
  if (project.checks && Object.values(project.checks).some(value => typeof value !== 'boolean')) return false;
  if (project.radios && project.radios['summary-found-type'] !== undefined &&
      !['slab', 'strip'].includes(project.radios['summary-found-type'])) return false;
  if (project.flags && Object.entries(project.flags).some(([key, value]) =>
    key === 'lastFoundationBlock' ? !['slab', 'strip'].includes(value) : typeof value !== 'boolean')) return false;
  for (const section of ['openings', 'piles']) {
    const rows = project[section];
    if (rows === undefined) continue;
    if (!Array.isArray(rows) || rows.length > MAX_ROWS) return false;
    if (rows.some((row) => {
      if (!isObject(row) || (row.id !== undefined &&
          (typeof row.id !== 'number' || !numeric(row.id, true))) ||
          (row.locked !== undefined && typeof row.locked !== 'boolean')) return true;
      if (section === 'openings') {
        if (row.type !== undefined && !['window', 'entry-door', 'interior-door'].includes(row.type)) return true;
        return [['width', 'w'], ['height', 'h'], ['count', 'n']].some(([name, alias]) =>
          row[name] !== undefined || row[alias] !== undefined
            ? !numeric(row[name] !== undefined ? row[name] : row[alias]) : false);
      }
      return (row.name !== undefined && (typeof row.name !== 'string' || row.name.length > 256)) ||
        (row.diameterMm !== undefined && ![200, 250, 300, 350, 400].includes(row.diameterMm)) ||
        (row.depthM !== undefined && !numeric(row.depthM)) ||
        (row.count !== undefined && !numeric(row.count, true));
    })) return false;
  }
  return true;
}

module.exports = { validProject };
