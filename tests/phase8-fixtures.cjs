const zlib = require('node:zlib');
const { PDF_MEDIA_TYPE, DOCX_MEDIA_TYPE } = require('../server/config.cjs');

function utf16beHex(text) {
  const units = [0xfe, 0xff];
  for (const char of text) {
    const code = char.codePointAt(0);
    if (code > 0xffff) {
      const cp = code - 0x10000;
      const hi = 0xd800 + (cp >> 10);
      const lo = 0xdc00 + (cp & 0x3ff);
      units.push(hi >> 8, hi & 0xff, lo >> 8, lo & 0xff);
    } else {
      units.push(code >> 8, code & 0xff);
    }
  }
  return Buffer.from(units).toString('hex').toUpperCase();
}

function buildPdf(pages, info = {}) {
  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };

  const fontId = 3;
  const pageIds = [];
  const contentBodies = pages.map(text => {
    const hex = utf16beHex(text);
    return `BT /F1 12 Tf 72 720 Td <${hex}> Tj ET`;
  });

  add('<< /Type /Catalog /Pages 2 0 R >>');
  const pagesId = add('');
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  const contentIds = contentBodies.map(body => {
    const stream = Buffer.from(body, 'ascii');
    return add(`<< /Length ${stream.length} >>\nstream\n${body}\nendstream`);
  });

  for (let i = 0; i < pages.length; i++) {
    pageIds.push(add(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 1191] /Contents ${contentIds[i]} 0 R ` +
      `/Resources << /Font << /F1 ${fontId} 0 R >> >> >>`
    ));
  }

  const producer = info.producer || 'SmetaCraft fixtures';
  const title = info.title || 'Phase 8 fixture';
  const infoId = add(`<< /Producer (${producer}) /Title (${title}) >>`);
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefAt = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoId} 0 R >>\n`;
  pdf += `startxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

function crc32(buffer) {
  return zlib.crc32(buffer);
}

function zipStore(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc >>> 0, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc >>> 0, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const localBuf = Buffer.concat(localParts);
  const centralBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(localBuf.length, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([localBuf, centralBuf, eocd]);
}

function buildDocx(paragraphs) {
  const body = paragraphs.map(text => (
    `<w:p><w:r><w:t xml:space="preserve">${text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')}</w:t></w:r></w:p>`
  )).join('');
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:body>${body}</w:body></w:document>`;
  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `</Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
    `</Relationships>`;
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
  return zipStore([
    { name: '[Content_Types].xml', data: types },
    { name: '_rels/.rels', data: rels },
    { name: 'word/document.xml', data: document },
    { name: 'word/_rels/document.xml.rels', data: docRels },
  ]);
}

const EXPLICIT_LINES = [
  'ленточный фундамент периметр 42 м',
  'лента ширина 0.5 м',
  'лента высота 0.7 м',
  'хомуты диаметр 10 мм шаг 250 мм',
  'стены периметр 50 м',
  'стены высота 3 м',
];

function autocadLikePdf() {
  return buildPdf([
    '10 50 700 1900',
    '200 300 400 800 1200',
  ], { producer: 'pdfplot16.hdi AutoCAD 2021', title: 'A3 plot fixture' });
}

function explicitLabelsPdf() {
  return buildPdf([EXPLICIT_LINES.join('\n')], { title: 'Explicit labels' });
}

function explicitLabelsDocx() {
  return buildDocx(EXPLICIT_LINES);
}

function xlsxLikeZip() {
  const types = `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `</Types>`;
  return zipStore([
    { name: '[Content_Types].xml', data: types },
    { name: 'xl/workbook.xml', data: '<workbook/>' },
  ]);
}

module.exports = {
  PDF_MEDIA_TYPE,
  DOCX_MEDIA_TYPE,
  EXPLICIT_LINES,
  buildPdf,
  buildDocx,
  zipStore,
  autocadLikePdf,
  explicitLabelsPdf,
  explicitLabelsDocx,
  xlsxLikeZip,
};
