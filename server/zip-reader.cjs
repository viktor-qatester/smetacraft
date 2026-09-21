const zlib = require('node:zlib');

const MAX_ZIP_ENTRIES = 64;
const MAX_ENTRY_UNCOMPRESSED = 2 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED = 4 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 100;

function readUInt16(buffer, offset) {
  return buffer.readUInt16LE(offset);
}

function readUInt32(buffer, offset) {
  return buffer.readUInt32LE(offset);
}

function inflateRaw(data, size) {
  return zlib.inflateRawSync(data, { maxOutputLength: size });
}

function unzipStore(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
    throw new Error('invalid_zip');
  }
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b || buffer[2] !== 0x03 || buffer[3] !== 0x04) {
    throw new Error('invalid_zip');
  }

  const files = new Map();
  let offset = 0;
  let totalUncompressed = 0;
  let entries = 0;

  while (offset + 30 <= buffer.length) {
    const sig = readUInt32(buffer, offset);
    if (sig === 0x02014b50 || sig === 0x06054b50) break;
    if (sig !== 0x04034b50) throw new Error('invalid_zip');

    const flags = readUInt16(buffer, offset + 6);
    const method = readUInt16(buffer, offset + 8);
    const compressedSize = readUInt32(buffer, offset + 18);
    const uncompressedSize = readUInt32(buffer, offset + 22);
    const nameLength = readUInt16(buffer, offset + 26);
    const extraLength = readUInt16(buffer, offset + 28);

    if (flags & 0x0008) throw new Error('invalid_zip');
    entries += 1;
    if (entries > MAX_ZIP_ENTRIES) throw new Error('zip_limit');
    if (uncompressedSize > MAX_ENTRY_UNCOMPRESSED) throw new Error('zip_limit');
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED) throw new Error('zip_limit');
    if (compressedSize > 0 && uncompressedSize / compressedSize > MAX_COMPRESSION_RATIO) {
      throw new Error('zip_limit');
    }

    const nameStart = offset + 30;
    const nameEnd = nameStart + nameLength;
    const dataStart = nameEnd + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > buffer.length) throw new Error('invalid_zip');

    const name = buffer.slice(nameStart, nameEnd).toString('utf8');
    if (name.includes('..') || name.startsWith('/') || name.includes('\\') || name.includes('\0')) {
      throw new Error('invalid_zip');
    }

    const compressed = buffer.slice(dataStart, dataEnd);
    let data;
    if (method === 0) {
      if (compressed.length !== uncompressedSize) throw new Error('invalid_zip');
      data = Buffer.from(compressed);
    } else if (method === 8) {
      data = inflateRaw(compressed, uncompressedSize);
      if (data.length !== uncompressedSize) throw new Error('invalid_zip');
    } else {
      throw new Error('invalid_zip');
    }

    files.set(name, data);
    offset = dataEnd;
  }

  return files;
}

module.exports = {
  unzipStore,
  MAX_ZIP_ENTRIES,
  MAX_ENTRY_UNCOMPRESSED,
  MAX_TOTAL_UNCOMPRESSED,
};
