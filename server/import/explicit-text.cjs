const zlib = require('node:zlib');
const { unzipStore } = require('../zip-reader.cjs');

const PDF_MAGIC = Buffer.from('%PDF-', 'ascii');
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const PDF_MEDIA_TYPE = 'application/pdf';
const DOCX_MEDIA_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const NUMBER = String.raw`(\d+(?:[.,]\d+)?)`;
const UNIT = String.raw`(мм|см|м)?`;
const W = String.raw`[а-яa-z]*`;

const CHECKLIST = [
  { fieldId: 'strip-length', label: 'Периметр / длина ленты', unit: 'm' },
  { fieldId: 'strip-width', label: 'Ширина ленты', unit: 'm' },
  { fieldId: 'strip-height', label: 'Высота ленты', unit: 'm' },
  { fieldId: 'strip-stirrup-diameter', label: 'Диаметр хомутов', unit: 'mm' },
  { fieldId: 'strip-stirrup-step', label: 'Шаг хомутов', unit: 'mm' },
  { fieldId: 'walls-perimeter', label: 'Периметр стен', unit: 'm' },
  { fieldId: 'walls-height', label: 'Высота стен', unit: 'm' },
  { fieldId: 'length', label: 'Длина плиты', unit: 'm' },
  { fieldId: 'width', label: 'Ширина плиты', unit: 'm' },
  { fieldId: 'height', label: 'Толщина плиты', unit: 'm' },
  { fieldId: 'plaster-length', label: 'Длина штукатурки', unit: 'm' },
  { fieldId: 'plaster-height', label: 'Высота штукатурки', unit: 'm' },
  { fieldId: 'floor-length', label: 'Длина перекрытия', unit: 'm' },
  { fieldId: 'floor-width', label: 'Ширина перекрытия', unit: 'm' },
  { fieldId: 'roof-length', label: 'Длина кровли', unit: 'm' },
  { fieldId: 'roof-width', label: 'Ширина кровли', unit: 'm' },
];

const PRICE_FIELD_IDS = new Set([
  'concrete-price', 'rebar-price', 'wire-price', 'board-price', 'timber-price',
  'sand-price', 'stone-price', 'hydro-price', 'strip-concrete-price', 'strip-rebar-price',
  'strip-wire-price', 'strip-board-price', 'strip-timber-price', 'strip-sand-price',
  'strip-hydro-price', 'pile-concrete-price', 'pile-work-drilling-price', 'pile-hydro-price',
  'wall-block-price', 'wall-adhesive-price', 'wall-mesh-price', 'partition-block-price',
  'wall-concrete-price', 'wall-work-masonry-price', 'wall-work-partition-price',
  'wall-work-armopoyas-price', 'plaster-mix-price', 'plaster-primer-price',
  'plaster-beacon-price', 'plaster-mesh-price', 'plaster-work-price',
  'floor-wood-beam-price', 'floor-insulation-price', 'floor-membrane-price',
  'floor-board-price', 'floor-concrete-slab-price', 'floor-work-wood-price',
  'floor-work-concrete-price', 'roof-timber-price', 'roof-board-price',
  'roof-metal-price', 'roof-insulation-price', 'roof-membrane-price',
  'roof-vapor-price', 'roof-work-price',
]);

const RULES = [
  {
    fieldId: 'strip-stirrup-step',
    destUnit: 'mm',
    patterns: [
      new RegExp(String.raw`хомут${W}.{0,40}?шаг[ае]?\s*[:\-]?\s*${NUMBER}\s*${UNIT}`),
      new RegExp(String.raw`шаг\s+хомут${W}\s*[:\-]?\s*${NUMBER}\s*${UNIT}`),
    ],
  },
  {
    fieldId: 'strip-stirrup-diameter',
    destUnit: 'mm',
    patterns: [
      new RegExp(String.raw`хомут${W}.{0,40}?диаметр[ае]?\s*[:\-∅ø]?\s*${NUMBER}\s*${UNIT}`),
      new RegExp(String.raw`диаметр\s+хомут${W}\s*[:\-∅ø]?\s*${NUMBER}\s*${UNIT}`),
    ],
  },
  {
    fieldId: 'strip-width',
    destUnit: 'm',
    patterns: [
      new RegExp(String.raw`ленточн${W}\s+фундамент${W}.{0,40}?ширин[аыуе]\s*[:\-]?\s*${NUMBER}\s*${UNIT}`),
      new RegExp(String.raw`лент[аыуе]${W}.{0,40}?ширин[аыуе]\s*[:\-]?\s*${NUMBER}\s*${UNIT}`),
      new RegExp(String.raw`ширин[аыуе]\s+лент[аыуи]\s*[:\-]?\s*${NUMBER}\s*${UNIT}`),
    ],
  },
  {
    fieldId: 'strip-height',
    destUnit: 'm',
    patterns: [
      new RegExp(String.raw`ленточн${W}\s+фундамент${W}.{0,40}?высот[аыуе]\s*[:\-]?\s*${NUMBER}\s*${UNIT}`),
      new RegExp(String.raw`лент[аыуе]${W}.{0,40}?высот[аыуе]\s*[:\-]?\s*${NUMBER}\s*${UNIT}`),
      new RegExp(String.raw`высот[аыуе]\s+лент[аыуи]\s*[:\-]?\s*${NUMBER}\s*${UNIT}`),
    ],
  },
  {
    fieldId: 'strip-length',
    destUnit: 'm',
    patterns: [
      new RegExp(String.raw`ленточн${W}\s+фундамент${W}.{0,48}?(?:периметр[ае]?|длин[аыуе])\s*[:\-]?\s*${NUMBER}\s*${UNIT}`),
      new RegExp(String.raw`периметр\s+(?:ленточн${W}\s+фундамент${W}|лент[аыуи])\s*[:\-]?\s*${NUMBER}\s*${UNIT}`),
      new RegExp(String.raw`лент[аыуе]${W}.{0,40}?(?:периметр[ае]?|длин[аыуе])\s*[:\-]?\s*${NUMBER}\s*${UNIT}`),
    ],
  },
  {
    fieldId: 'walls-height',
    destUnit: 'm',
    patterns: [
      new RegExp(String.raw`стен${W}.{0,40}?высот[аыуе]\s*[:\-]?\s*${NUMBER}\s*${UNIT}`),
      new RegExp(String.raw`высот[аыуе]\s+стен${W}\s*[:\-]?\s*${NUMBER}\s*${UNIT}`),
    ],
  },
  {
    fieldId: 'walls-perimeter',
    destUnit: 'm',
    patterns: [
      new RegExp(String.raw`стен${W}.{0,40}?(?:периметр[ае]?|длин[аыуе])\s*[:\-]?\s*${NUMBER}\s*${UNIT}`),
      new RegExp(String.raw`периметр\s+стен${W}\s*[:\-]?\s*${NUMBER}\s*${UNIT}`),
    ],
  },
  {
    fieldId: 'length',
    destUnit: 'm',
    patterns: [
      new RegExp(String.raw`плит${W}.{0,40}?длин[аыуе]\s*[:\-]?\s*${NUMBER}\s*${UNIT}`),
    ],
  },
  {
    fieldId: 'width',
    destUnit: 'm',
    patterns: [
      new RegExp(String.raw`плит${W}.{0,40}?ширин[аыуе]\s*[:\-]?\s*${NUMBER}\s*${UNIT}`),
    ],
  },
  {
    fieldId: 'height',
    destUnit: 'm',
    patterns: [
      new RegExp(String.raw`плит${W}.{0,40}?(?:толщин[аыуе]|высот[аыуе])\s*[:\-]?\s*${NUMBER}\s*${UNIT}`),
    ],
  },
  {
    fieldId: 'plaster-length',
    destUnit: 'm',
    patterns: [
      new RegExp(String.raw`штукатурк${W}.{0,40}?длин[аыуе]\s*[:\-]?\s*${NUMBER}\s*${UNIT}`),
    ],
  },
  {
    fieldId: 'plaster-height',
    destUnit: 'm',
    patterns: [
      new RegExp(String.raw`штукатурк${W}.{0,40}?высот[аыуе]\s*[:\-]?\s*${NUMBER}\s*${UNIT}`),
    ],
  },
  {
    fieldId: 'floor-length',
    destUnit: 'm',
    patterns: [
      new RegExp(String.raw`перекрыт${W}.{0,40}?длин[аыуе]\s*[:\-]?\s*${NUMBER}\s*${UNIT}`),
    ],
  },
  {
    fieldId: 'floor-width',
    destUnit: 'm',
    patterns: [
      new RegExp(String.raw`перекрыт${W}.{0,40}?ширин[аыуе]\s*[:\-]?\s*${NUMBER}\s*${UNIT}`),
    ],
  },
  {
    fieldId: 'roof-length',
    destUnit: 'm',
    patterns: [
      new RegExp(String.raw`кровл${W}.{0,40}?длин[аыуе]\s*[:\-]?\s*${NUMBER}\s*${UNIT}`),
    ],
  },
  {
    fieldId: 'roof-width',
    destUnit: 'm',
    patterns: [
      new RegExp(String.raw`кровл${W}.{0,40}?ширин[аыуе]\s*[:\-]?\s*${NUMBER}\s*${UNIT}`),
    ],
  },
];

function detectMediaType(buffer, declared) {
  if (buffer.length >= 5 && buffer.subarray(0, 5).equals(PDF_MAGIC)) {
    if (declared && declared !== PDF_MEDIA_TYPE) return null;
    return PDF_MEDIA_TYPE;
  }
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(ZIP_MAGIC)) {
    if (declared && declared !== DOCX_MEDIA_TYPE) return null;
    return DOCX_MEDIA_TYPE;
  }
  return null;
}

function unescapePdfLiteral(source) {
  let out = '';
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    const next = source[i + 1];
    if (next === undefined) break;
    if (next === 'n') { out += '\n'; i += 1; continue; }
    if (next === 'r') { out += '\r'; i += 1; continue; }
    if (next === 't') { out += '\t'; i += 1; continue; }
    if (next === 'b') { out += '\b'; i += 1; continue; }
    if (next === 'f') { out += '\f'; i += 1; continue; }
    if (next === '(' || next === ')' || next === '\\') { out += next; i += 1; continue; }
    if (/[0-7]/.test(next)) {
      let oct = next;
      let consumed = 1;
      if (/[0-7]/.test(source[i + 2] || '')) { oct += source[i + 2]; consumed += 1; }
      if (/[0-7]/.test(source[i + 1 + consumed] || '') && consumed < 3) {
        oct += source[i + 1 + consumed];
        consumed += 1;
      }
      out += String.fromCharCode(parseInt(oct, 8));
      i += consumed;
      continue;
    }
    i += 1;
  }
  return out;
}

function decodePdfHexString(hex) {
  const clean = hex.replace(/\s+/g, '');
  if (clean.length % 2 === 1) return '';
  const bytes = Buffer.from(clean, 'hex');
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let text = '';
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      text += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    }
    return text;
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return bytes.subarray(2).toString('utf16le');
  }
  return bytes.toString('latin1');
}

function stringsFromPdfContent(content) {
  const parts = [];
  const latin = content.toString('latin1');
  const literal = /\((?:\\.|[^\\)])*\)/g;
  let match;
  while ((match = literal.exec(latin))) {
    parts.push(unescapePdfLiteral(match[0].slice(1, -1)));
  }
  const hex = /<([0-9A-Fa-f \t\r\n]+)>/g;
  while ((match = hex.exec(latin))) {
    parts.push(decodePdfHexString(match[1]));
  }
  return parts.join(' ');
}

function inflatePdfStream(dict, data) {
  if (/\/Filter\s*\/FlateDecode/.test(dict) || /\/Filter\s*\[\s*\/FlateDecode/.test(dict)) {
    try {
      return zlib.inflateSync(data);
    } catch {
      try {
        return zlib.inflateRawSync(data);
      } catch {
        return data;
      }
    }
  }
  return data;
}

function extractPdfText(buffer) {
  const latin = buffer.toString('latin1');
  const parts = [stringsFromPdfContent(buffer)];
  const streamRe = /<<([\s\S]*?)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match;
  while ((match = streamRe.exec(latin))) {
    const dict = match[1];
    const data = Buffer.from(match[2], 'latin1');
    const inflated = inflatePdfStream(dict, data);
    parts.push(stringsFromPdfContent(inflated));
  }
  return parts.join(' ');
}

function countPdfPages(buffer) {
  const latin = buffer.toString('latin1');
  const matches = latin.match(/\/Type\s*\/Page(?!\s*s)/g);
  return matches ? matches.length : 0;
}

function decodeXmlEntities(value) {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function extractDocxText(buffer) {
  const files = unzipStore(buffer);
  const types = files.get('[Content_Types].xml');
  if (!types) throw new Error('invalid_docx');
  const typesText = types.toString('utf8');
  if (!/wordprocessingml/i.test(typesText)) throw new Error('invalid_docx');
  if (/spreadsheetml/i.test(typesText) && !/wordprocessingml/i.test(typesText)) {
    throw new Error('invalid_docx');
  }
  const document = files.get('word/document.xml');
  if (!document) throw new Error('invalid_docx');
  const xml = document.toString('utf8');
  const withBreaks = xml
    .replace(/<w:tab\b[^/]*\/>/g, ' ')
    .replace(/<w:br\b[^/]*\/>/g, '\n')
    .replace(/<w:p\b[^>]*>/g, '\n');
  return decodeXmlEntities(withBreaks.replace(/<[^>]+>/g, ' '));
}

function countDocxParagraphs(text) {
  return text.split(/\n+/).filter(line => line.trim()).length;
}

function normalizeText(text) {
  return String(text || '')
    .replace(/ё/g, 'е')
    .replace(/Ё/g, 'Е')
    .toLowerCase()
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/\n+/g, '\n')
    .trim();
}

function parseNumber(raw) {
  const value = Number(String(raw).replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

function convertUnit(value, srcUnit, destUnit) {
  const src = srcUnit || destUnit;
  if (src === destUnit) return value;
  if (src === 'мм' && destUnit === 'm') return value / 1000;
  if (src === 'см' && destUnit === 'm') return value / 100;
  if (src === 'м' && destUnit === 'm') return value;
  if (src === 'м' && destUnit === 'mm') return value * 1000;
  if (src === 'см' && destUnit === 'mm') return value * 10;
  if (src === 'мм' && destUnit === 'mm') return value;
  return value;
}

function formatParameter(value) {
  if (Number.isInteger(value)) return String(value);
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded);
}

function matchRules(normalized) {
  const found = new Map();
  const warnings = [];
  for (const rule of RULES) {
    if (PRICE_FIELD_IDS.has(rule.fieldId)) continue;
    for (const pattern of rule.patterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(normalized);
      if (!match) continue;
      const raw = parseNumber(match[1]);
      if (raw === null) continue;
      const converted = convertUnit(raw, match[2], rule.destUnit);
      if (converted === null || !Number.isFinite(converted) || converted < 0) continue;
      const snippet = match[0].slice(0, 80);
      if (found.has(rule.fieldId)) {
        const prev = found.get(rule.fieldId);
        if (prev.value !== converted) {
          warnings.push(`Конфликт значений для ${rule.fieldId}: оставлено ${prev.value}, проигнорировано ${converted}.`);
        }
        break;
      }
      found.set(rule.fieldId, {
        fieldId: rule.fieldId,
        value: converted,
        unit: rule.destUnit,
        snippet,
      });
      break;
    }
  }
  return { found, warnings };
}

function buildPreview({ format, pageCount, extractedText, warnings = [] }) {
  const normalized = normalizeText(extractedText);
  const { found, warnings: matchWarnings } = matchRules(normalized);
  const allWarnings = [...warnings, ...matchWarnings];
  const parameters = {};
  const fields = CHECKLIST.map(item => {
    const hit = found.get(item.fieldId);
    if (!hit) {
      return {
        fieldId: item.fieldId,
        label: item.label,
        unit: item.unit,
        status: 'manual',
        value: null,
        snippet: null,
      };
    }
    parameters[item.fieldId] = formatParameter(hit.value);
    return {
      fieldId: item.fieldId,
      label: item.label,
      unit: item.unit,
      status: 'found',
      value: hit.value,
      snippet: hit.snippet,
    };
  });

  const foundCount = fields.filter(field => field.status === 'found').length;
  const sourceKind = foundCount === 0 ? 'drawing-plot' : 'explicit-text';
  const message = sourceKind === 'drawing-plot'
    ? 'Явных подписей к размерам нет. Файл можно смотреть; параметры введите вручную.'
    : `Найдено полей с явными подписями: ${foundCount}. Цены не подставляются.`;

  return {
    format,
    pageCount,
    extractedChars: extractedText.replace(/\s+/g, ' ').trim().length,
    sourceKind,
    message,
    fields,
    parameters,
    warnings: allWarnings,
    errors: [],
  };
}

function parsePdf(buffer) {
  if (buffer.length < 8 || !buffer.subarray(0, 5).equals(PDF_MAGIC)) {
    throw new Error('invalid_pdf');
  }
  const extractedText = extractPdfText(buffer);
  const counted = countPdfPages(buffer);
  return buildPreview({
    format: 'pdf',
    pageCount: Math.max(counted, 1),
    extractedText,
  });
}

function parseDocx(buffer) {
  const extractedText = extractDocxText(buffer);
  return buildPreview({
    format: 'docx',
    pageCount: Math.max(countDocxParagraphs(extractedText), 1),
    extractedText,
  });
}

function parseDocument(buffer, mediaType) {
  if (mediaType === PDF_MEDIA_TYPE) return parsePdf(buffer);
  if (mediaType === DOCX_MEDIA_TYPE) return parseDocx(buffer);
  throw new Error('unsupported_media_type');
}

module.exports = {
  CHECKLIST,
  PRICE_FIELD_IDS,
  detectMediaType,
  parseDocument,
  parsePdf,
  parseDocx,
  buildPreview,
  normalizeText,
  PDF_MEDIA_TYPE,
  DOCX_MEDIA_TYPE,
};
