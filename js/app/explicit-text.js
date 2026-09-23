      // MODULE: EXPLICIT-TEXT DOCUMENT PARSER (Phase 8, client)
      // Same contract as docs/IMPORT_PDF.md. No OCR/LLM. No js/core.
      // ==========================================
      var PDF_MEDIA_TYPE = "application/pdf";
      var DOCX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      var PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d];
      var ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
      var MAX_ZIP_ENTRIES = 64;
      var MAX_ENTRY_UNCOMPRESSED = 2 * 1024 * 1024;
      var MAX_TOTAL_UNCOMPRESSED = 4 * 1024 * 1024;
      var MAX_COMPRESSION_RATIO = 100;
      var MAX_INFLATE_OUTPUT = 8 * 1024 * 1024;

      var NUMBER = String.raw`(\d+(?:[.,]\d+)?)`;
      var UNIT = String.raw`(мм|см|м)?`;
      var W = String.raw`[а-яa-z]*`;

      var CHECKLIST = [
        { fieldId: "strip-length", label: "Периметр / длина ленты", unit: "m" },
        { fieldId: "strip-width", label: "Ширина ленты", unit: "m" },
        { fieldId: "strip-height", label: "Высота ленты", unit: "m" },
        { fieldId: "strip-stirrup-diameter", label: "Диаметр хомутов", unit: "mm" },
        { fieldId: "strip-stirrup-step", label: "Шаг хомутов", unit: "mm" },
        { fieldId: "walls-perimeter", label: "Периметр стен", unit: "m" },
        { fieldId: "walls-height", label: "Высота стен", unit: "m" },
        { fieldId: "length", label: "Длина плиты", unit: "m" },
        { fieldId: "width", label: "Ширина плиты", unit: "m" },
        { fieldId: "height", label: "Толщина плиты", unit: "m" },
        { fieldId: "plaster-length", label: "Длина штукатурки", unit: "m" },
        { fieldId: "plaster-height", label: "Высота штукатурки", unit: "m" },
        { fieldId: "floor-length", label: "Длина перекрытия", unit: "m" },
        { fieldId: "floor-width", label: "Ширина перекрытия", unit: "m" },
        { fieldId: "roof-length", label: "Длина кровли", unit: "m" },
        { fieldId: "roof-width", label: "Ширина кровли", unit: "m" },
      ];

      var PRICE_FIELD_IDS = new Set([
        "concrete-price", "rebar-price", "wire-price", "board-price", "timber-price",
        "sand-price", "stone-price", "hydro-price", "strip-concrete-price", "strip-rebar-price",
        "strip-wire-price", "strip-board-price", "strip-timber-price", "strip-sand-price",
        "strip-hydro-price", "pile-concrete-price", "pile-work-drilling-price", "pile-hydro-price",
        "wall-block-price", "wall-adhesive-price", "wall-mesh-price", "partition-block-price",
        "wall-concrete-price", "wall-work-masonry-price", "wall-work-partition-price",
        "wall-work-armopoyas-price", "plaster-mix-price", "plaster-primer-price",
        "plaster-beacon-price", "plaster-mesh-price", "plaster-work-price",
        "floor-wood-beam-price", "floor-insulation-price", "floor-membrane-price",
        "floor-board-price", "floor-concrete-slab-price", "floor-work-wood-price",
        "floor-work-concrete-price", "roof-timber-price", "roof-board-price",
        "roof-metal-price", "roof-insulation-price", "roof-membrane-price",
        "roof-vapor-price", "roof-work-price",
      ]);

      var RULES = [
        {
          fieldId: "strip-stirrup-step",
          destUnit: "mm",
          patterns: [
            new RegExp(String.raw`хомут${W}.{0,40}?шаг[ае]?\s*[:\-]?\s*${NUMBER}\s*${UNIT}`),
            new RegExp(String.raw`шаг\s+хомут${W}\s*[:\-]?\s*${NUMBER}\s*${UNIT}`),
          ],
        },
        {
          fieldId: "strip-stirrup-diameter",
          destUnit: "mm",
          patterns: [
            new RegExp(String.raw`хомут${W}.{0,40}?диаметр[ае]?\s*[:\-∅ø]?\s*${NUMBER}\s*${UNIT}`),
            new RegExp(String.raw`диаметр\s+хомут${W}\s*[:\-∅ø]?\s*${NUMBER}\s*${UNIT}`),
          ],
        },
        {
          fieldId: "strip-width",
          destUnit: "m",
          patterns: [
            new RegExp(String.raw`ленточн${W}\s+фундамент${W}.{0,40}?ширин[аыуе]\s*[:\-]?\s*${NUMBER}\s*${UNIT}`),
            new RegExp(String.raw`лент[аыуе]${W}.{0,40}?ширин[аыуе]\s*[:\-]?\s*${NUMBER}\s*${UNIT}`),
            new RegExp(String.raw`ширин[аыуе]\s+лент[аыуи]\s*[:\-]?\s*${NUMBER}\s*${UNIT}`),
          ],
        },
        {
          fieldId: "strip-height",
          destUnit: "m",
          patterns: [
            new RegExp(String.raw`ленточн${W}\s+фундамент${W}.{0,40}?высот[аыуе]\s*[:\-]?\s*${NUMBER}\s*${UNIT}`),
            new RegExp(String.raw`лент[аыуе]${W}.{0,40}?высот[аыуе]\s*[:\-]?\s*${NUMBER}\s*${UNIT}`),
            new RegExp(String.raw`высот[аыуе]\s+лент[аыуи]\s*[:\-]?\s*${NUMBER}\s*${UNIT}`),
          ],
        },
        {
          fieldId: "strip-length",
          destUnit: "m",
          patterns: [
            new RegExp(String.raw`ленточн${W}\s+фундамент${W}.{0,48}?(?:периметр[ае]?|длин[аыуе])\s*[:\-]?\s*${NUMBER}\s*${UNIT}`),
            new RegExp(String.raw`периметр\s+(?:ленточн${W}\s+фундамент${W}|лент[аыуи])\s*[:\-]?\s*${NUMBER}\s*${UNIT}`),
            new RegExp(String.raw`лент[аыуе]${W}.{0,40}?(?:периметр[ае]?|длин[аыуе])\s*[:\-]?\s*${NUMBER}\s*${UNIT}`),
          ],
        },
        {
          fieldId: "walls-height",
          destUnit: "m",
          patterns: [
            new RegExp(String.raw`стен${W}.{0,40}?высот[аыуе]\s*[:\-]?\s*${NUMBER}\s*${UNIT}`),
            new RegExp(String.raw`высот[аыуе]\s+стен${W}\s*[:\-]?\s*${NUMBER}\s*${UNIT}`),
          ],
        },
        {
          fieldId: "walls-perimeter",
          destUnit: "m",
          patterns: [
            new RegExp(String.raw`стен${W}.{0,40}?(?:периметр[ае]?|длин[аыуе])\s*[:\-]?\s*${NUMBER}\s*${UNIT}`),
            new RegExp(String.raw`периметр\s+стен${W}\s*[:\-]?\s*${NUMBER}\s*${UNIT}`),
          ],
        },
        {
          fieldId: "length",
          destUnit: "m",
          patterns: [
            new RegExp(String.raw`плит${W}.{0,40}?длин[аыуе]\s*[:\-]?\s*${NUMBER}\s*${UNIT}`),
          ],
        },
        {
          fieldId: "width",
          destUnit: "m",
          patterns: [
            new RegExp(String.raw`плит${W}.{0,40}?ширин[аыуе]\s*[:\-]?\s*${NUMBER}\s*${UNIT}`),
          ],
        },
        {
          fieldId: "height",
          destUnit: "m",
          patterns: [
            new RegExp(String.raw`плит${W}.{0,40}?(?:толщин[аыуе]|высот[аыуе])\s*[:\-]?\s*${NUMBER}\s*${UNIT}`),
          ],
        },
        {
          fieldId: "plaster-length",
          destUnit: "m",
          patterns: [
            new RegExp(String.raw`штукатурк${W}.{0,40}?длин[аыуе]\s*[:\-]?\s*${NUMBER}\s*${UNIT}`),
          ],
        },
        {
          fieldId: "plaster-height",
          destUnit: "m",
          patterns: [
            new RegExp(String.raw`штукатурк${W}.{0,40}?высот[аыуе]\s*[:\-]?\s*${NUMBER}\s*${UNIT}`),
          ],
        },
        {
          fieldId: "floor-length",
          destUnit: "m",
          patterns: [
            new RegExp(String.raw`перекрыт${W}.{0,40}?длин[аыуе]\s*[:\-]?\s*${NUMBER}\s*${UNIT}`),
          ],
        },
        {
          fieldId: "floor-width",
          destUnit: "m",
          patterns: [
            new RegExp(String.raw`перекрыт${W}.{0,40}?ширин[аыуе]\s*[:\-]?\s*${NUMBER}\s*${UNIT}`),
          ],
        },
        {
          fieldId: "roof-length",
          destUnit: "m",
          patterns: [
            new RegExp(String.raw`кровл${W}.{0,40}?длин[аыуе]\s*[:\-]?\s*${NUMBER}\s*${UNIT}`),
          ],
        },
        {
          fieldId: "roof-width",
          destUnit: "m",
          patterns: [
            new RegExp(String.raw`кровл${W}.{0,40}?ширин[аыуе]\s*[:\-]?\s*${NUMBER}\s*${UNIT}`),
          ],
        },
      ];

      var LEN_BASE = [
        3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59,
        67, 83, 99, 115, 131, 163, 195, 227, 258,
      ];
      var LEN_EXTRA = [
        0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
      ];
      var DIST_BASE = [
        1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769,
        1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577,
      ];
      var DIST_EXTRA = [
        0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
      ];
      var CLEN_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

      function asUint8(data) {
        if (data instanceof Uint8Array) return data;
        if (data && typeof data.length === "number") return new Uint8Array(data);
        throw new Error("invalid_file");
      }

      function bytesEqual(bytes, offset, magic) {
        if (!bytes || bytes.length < offset + magic.length) return false;
        for (let i = 0; i < magic.length; i++) {
          if (bytes[offset + i] !== magic[i]) return false;
        }
        return true;
      }

      function bytesToLatin1(bytes) {
        const chunk = 0x8000;
        let out = "";
        for (let i = 0; i < bytes.length; i += chunk) {
          const slice = bytes.subarray(i, Math.min(i + chunk, bytes.length));
          out += String.fromCharCode.apply(null, slice);
        }
        return out;
      }

      function utf8FromBytes(bytes) {
        try {
          return new TextDecoder("utf-8").decode(bytes);
        } catch (error) {
          return bytesToLatin1(bytes);
        }
      }

      function readU16LE(bytes, offset) {
        return bytes[offset] | (bytes[offset + 1] << 8);
      }

      function readU32LE(bytes, offset) {
        return (
          (bytes[offset] |
            (bytes[offset + 1] << 8) |
            (bytes[offset + 2] << 16) |
            (bytes[offset + 3] << 24)) >>> 0
        );
      }

      function concatBytes(chunks, total) {
        const out = new Uint8Array(total);
        let offset = 0;
        for (let i = 0; i < chunks.length; i++) {
          out.set(chunks[i], offset);
          offset += chunks[i].length;
        }
        return out;
      }

      function buildHuffmanTable(lengths) {
        let max = 0;
        for (let i = 0; i < lengths.length; i++) {
          if (lengths[i] > max) max = lengths[i];
        }
        const count = new Uint16Array(max + 1);
        for (let i = 0; i < lengths.length; i++) {
          if (lengths[i]) count[lengths[i]]++;
        }
        const nextCode = new Uint16Array(max + 1);
        let code = 0;
        for (let bits = 1; bits <= max; bits++) {
          code = (code + count[bits - 1]) << 1;
          nextCode[bits] = code;
        }
        const symbols = new Int32Array(lengths.length);
        const map = new Map();
        for (let i = 0; i < lengths.length; i++) {
          const len = lengths[i];
          if (!len) {
            symbols[i] = -1;
            continue;
          }
          const assigned = nextCode[len];
          symbols[i] = assigned;
          map.set((len << 16) | assigned, i);
          nextCode[len]++;
        }
        return { max: max, map: map };
      }

      function inflateRawFrom(src, start) {
        let pos = start;
        let bitBuf = 0;
        let bitCnt = 0;
        const chunks = [];
        let total = 0;

        function needByte() {
          if (pos >= src.length) throw new Error("inflate");
          return src[pos++];
        }

        function bits(n) {
          while (bitCnt < n) {
            bitBuf |= needByte() << bitCnt;
            bitCnt += 8;
          }
          const value = bitBuf & ((1 << n) - 1);
          bitBuf >>>= n;
          bitCnt -= n;
          return value;
        }

        function decode(table) {
          let code = 0;
          for (let len = 1; len <= table.max; len++) {
            code = (code << 1) | bits(1);
            const hit = table.map.get((len << 16) | code);
            if (hit !== undefined) return hit;
          }
          throw new Error("inflate");
        }

        function pushByte(value) {
          if (total >= MAX_INFLATE_OUTPUT) throw new Error("inflate_limit");
          if (!chunks.length || chunks[chunks.length - 1].length === 65536) {
            chunks.push([]);
          }
          chunks[chunks.length - 1].push(value);
          total += 1;
        }

        function outputByte(value) {
          pushByte(value & 0xff);
        }

        function copyFrom(distance, length) {
          for (let n = 0; n < length; n++) {
            const index = total - distance;
            if (index < 0) throw new Error("inflate");
            let seen = 0;
            let value = 0;
            for (let c = 0; c < chunks.length; c++) {
              const chunk = chunks[c];
              if (index < seen + chunk.length) {
                value = chunk[index - seen];
                break;
              }
              seen += chunk.length;
            }
            outputByte(value);
          }
        }

        function flushChunks() {
          const out = new Uint8Array(total);
          let offset = 0;
          for (let c = 0; c < chunks.length; c++) {
            const chunk = chunks[c];
            for (let j = 0; j < chunk.length; j++) out[offset++] = chunk[j];
          }
          return out;
        }

        function fixedLit() {
          const lengths = new Uint8Array(288);
          for (let i = 0; i <= 143; i++) lengths[i] = 8;
          for (let i = 144; i <= 255; i++) lengths[i] = 9;
          for (let i = 256; i <= 279; i++) lengths[i] = 7;
          for (let i = 280; i <= 287; i++) lengths[i] = 8;
          return buildHuffmanTable(lengths);
        }

        function fixedDist() {
          const lengths = new Uint8Array(32);
          for (let i = 0; i < 32; i++) lengths[i] = 5;
          return buildHuffmanTable(lengths);
        }

        const fixedLitTable = fixedLit();
        const fixedDistTable = fixedDist();

        function decodeLengths(count, lengthTable) {
          const lengths = new Uint8Array(count);
          let i = 0;
          while (i < count) {
            const sym = decode(lengthTable);
            if (sym < 16) {
              lengths[i++] = sym;
            } else if (sym === 16) {
              if (i === 0) throw new Error("inflate");
              const prev = lengths[i - 1];
              const reps = 3 + bits(2);
              for (let r = 0; r < reps; r++) lengths[i++] = prev;
            } else if (sym === 17) {
              const reps = 3 + bits(3);
              i += reps;
            } else if (sym === 18) {
              const reps = 11 + bits(7);
              i += reps;
            } else {
              throw new Error("inflate");
            }
            if (i > count) throw new Error("inflate");
          }
          return lengths;
        }

        function inflateBlock(litTable, distTable) {
          while (true) {
            const sym = decode(litTable);
            if (sym < 256) {
              outputByte(sym);
              continue;
            }
            if (sym === 256) return;
            const lenIndex = sym - 257;
            if (lenIndex < 0 || lenIndex >= LEN_BASE.length) throw new Error("inflate");
            const length = LEN_BASE[lenIndex] + bits(LEN_EXTRA[lenIndex]);
            const distSym = decode(distTable);
            if (distSym >= DIST_BASE.length) throw new Error("inflate");
            const distance = DIST_BASE[distSym] + bits(DIST_EXTRA[distSym]);
            copyFrom(distance, length);
          }
        }

        let last = 0;
        do {
          last = bits(1);
          const type = bits(2);
          if (type === 0) {
            bitBuf = 0;
            bitCnt = 0;
            if (pos + 4 > src.length) throw new Error("inflate");
            const len = readU16LE(src, pos);
            const nlen = readU16LE(src, pos + 2);
            pos += 4;
            if ((len ^ 0xffff) !== nlen) throw new Error("inflate");
            if (pos + len > src.length) throw new Error("inflate");
            for (let n = 0; n < len; n++) outputByte(src[pos++]);
          } else if (type === 1) {
            inflateBlock(fixedLitTable, fixedDistTable);
          } else if (type === 2) {
            const nlit = bits(5) + 257;
            const ndist = bits(5) + 1;
            const nclen = bits(4) + 4;
            const clen = new Uint8Array(19);
            for (let i = 0; i < nclen; i++) clen[CLEN_ORDER[i]] = bits(3);
            const lengthTable = buildHuffmanTable(clen);
            const all = decodeLengths(nlit + ndist, lengthTable);
            const litTable = buildHuffmanTable(all.subarray(0, nlit));
            const distTable = buildHuffmanTable(all.subarray(nlit));
            inflateBlock(litTable, distTable);
          } else {
            throw new Error("inflate");
          }
        } while (!last);

        return flushChunks();
      }

      function inflateZlib(src) {
        if (src.length < 2) throw new Error("inflate");
        const cmf = src[0];
        const flg = src[1];
        if ((cmf & 0x0f) !== 8) throw new Error("inflate");
        if (((cmf << 8) + flg) % 31 !== 0) throw new Error("inflate");
        if (flg & 0x20) throw new Error("inflate");
        return inflateRawFrom(src, 2);
      }

      function inflateBytes(data, raw) {
        const src = asUint8(data);
        if (raw) return inflateRawFrom(src, 0);
        return inflateZlib(src);
      }

      function inflatePdfStream(data) {
        try {
          return inflateBytes(data, false);
        } catch (error) {
          try {
            return inflateBytes(data, true);
          } catch (rawError) {
            return data;
          }
        }
      }

      function unzipStore(buffer) {
        const src = asUint8(buffer);
        if (!bytesEqual(src, 0, ZIP_MAGIC)) throw new Error("invalid_zip");
        const files = new Map();
        let offset = 0;
        let totalUncompressed = 0;
        let entries = 0;
        while (offset + 30 <= src.length) {
          const sig = readU32LE(src, offset);
          if (sig === 0x02014b50 || sig === 0x06054b50) break;
          if (sig !== 0x04034b50) throw new Error("invalid_zip");
          const flags = readU16LE(src, offset + 6);
          const method = readU16LE(src, offset + 8);
          const compressedSize = readU32LE(src, offset + 18);
          const uncompressedSize = readU32LE(src, offset + 22);
          const nameLength = readU16LE(src, offset + 26);
          const extraLength = readU16LE(src, offset + 28);
          if (flags & 0x0008) throw new Error("invalid_zip");
          entries += 1;
          if (entries > MAX_ZIP_ENTRIES) throw new Error("zip_limit");
          if (uncompressedSize > MAX_ENTRY_UNCOMPRESSED) throw new Error("zip_limit");
          totalUncompressed += uncompressedSize;
          if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED) throw new Error("zip_limit");
          if (compressedSize > 0 && uncompressedSize / compressedSize > MAX_COMPRESSION_RATIO) {
            throw new Error("zip_limit");
          }
          const nameStart = offset + 30;
          const nameEnd = nameStart + nameLength;
          const dataStart = nameEnd + extraLength;
          const dataEnd = dataStart + compressedSize;
          if (dataEnd > src.length) throw new Error("invalid_zip");
          const name = utf8FromBytes(src.subarray(nameStart, nameEnd));
          if (name.includes("..") || name.startsWith("/") || name.includes("\\") || name.includes("\0")) {
            throw new Error("invalid_zip");
          }
          const compressed = src.subarray(dataStart, dataEnd);
          let data;
          if (method === 0) {
            if (compressed.length !== uncompressedSize) throw new Error("invalid_zip");
            data = compressed.slice();
          } else if (method === 8) {
            data = inflateBytes(compressed, true);
            if (data.length !== uncompressedSize) throw new Error("invalid_zip");
          } else {
            throw new Error("invalid_zip");
          }
          files.set(name, data);
          offset = dataEnd;
        }
        return files;
      }

      function detectMediaType(buffer, declared) {
        const bytes = asUint8(buffer);
        if (bytesEqual(bytes, 0, PDF_MAGIC)) {
          if (declared && declared !== PDF_MEDIA_TYPE) return null;
          return PDF_MEDIA_TYPE;
        }
        if (bytesEqual(bytes, 0, ZIP_MAGIC)) {
          if (declared && declared !== DOCX_MEDIA_TYPE) return null;
          return DOCX_MEDIA_TYPE;
        }
        return null;
      }

      function unescapePdfLiteral(source) {
        let out = "";
        for (let i = 0; i < source.length; i++) {
          const ch = source[i];
          if (ch !== "\\") {
            out += ch;
            continue;
          }
          const next = source[i + 1];
          if (next === undefined) break;
          if (next === "n") { out += "\n"; i += 1; continue; }
          if (next === "r") { out += "\r"; i += 1; continue; }
          if (next === "t") { out += "\t"; i += 1; continue; }
          if (next === "b") { out += "\b"; i += 1; continue; }
          if (next === "f") { out += "\f"; i += 1; continue; }
          if (next === "(" || next === ")" || next === "\\") { out += next; i += 1; continue; }
          if (/[0-7]/.test(next)) {
            let oct = next;
            let consumed = 1;
            if (/[0-7]/.test(source[i + 2] || "")) { oct += source[i + 2]; consumed += 1; }
            if (/[0-7]/.test(source[i + 1 + consumed] || "") && consumed < 3) {
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

      function hexToBytes(hex) {
        const clean = hex.replace(/\s+/g, "");
        if (clean.length % 2 === 1) return new Uint8Array(0);
        const bytes = new Uint8Array(clean.length / 2);
        for (let i = 0; i < bytes.length; i++) {
          bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
        }
        return bytes;
      }

      function decodePdfHexString(hex) {
        const bytes = hexToBytes(hex);
        if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
          let text = "";
          for (let i = 2; i + 1 < bytes.length; i += 2) {
            text += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
          }
          return text;
        }
        if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
          let text = "";
          for (let i = 2; i + 1 < bytes.length; i += 2) {
            text += String.fromCharCode(bytes[i] | (bytes[i + 1] << 8));
          }
          return text;
        }
        return bytesToLatin1(bytes);
      }

      function stringsFromPdfContent(content) {
        const parts = [];
        const latin = bytesToLatin1(asUint8(content));
        const literal = /\((?:\\.|[^\\)])*\)/g;
        let match;
        while ((match = literal.exec(latin))) {
          parts.push(unescapePdfLiteral(match[0].slice(1, -1)));
        }
        const hex = /<([0-9A-Fa-f \t\r\n]+)>/g;
        while ((match = hex.exec(latin))) {
          parts.push(decodePdfHexString(match[1]));
        }
        return parts.join(" ");
      }

      function extractPdfStreamText(buffer) {
        const bytes = asUint8(buffer);
        const latin = bytesToLatin1(bytes);
        const parts = [];
        const streamRe = /<<([\s\S]*?)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g;
        let match;
        while ((match = streamRe.exec(latin))) {
          const dict = match[1];
          const data = new Uint8Array(match[2].length);
          for (let i = 0; i < match[2].length; i++) data[i] = match[2].charCodeAt(i) & 0xff;
          const inflated = (/\/Filter\s*\/FlateDecode/.test(dict) || /\/Filter\s*\[\s*\/FlateDecode/.test(dict))
            ? inflatePdfStream(data)
            : data;
          parts.push(stringsFromPdfContent(inflated));
        }
        return parts.join(" ");
      }

      function extractPdfText(buffer) {
        const bytes = asUint8(buffer);
        return [stringsFromPdfContent(bytes), extractPdfStreamText(bytes)].join(" ");
      }

      function factsApi() {
        if (typeof module !== "undefined" && module.exports) {
          return require("./extracted-facts.js");
        }
        return {
          extractDocumentFacts: extractDocumentFacts,
          factsFromRuleHits: factsFromRuleHits,
          mergeFactLists: mergeFactLists,
          syncFactParameters: syncFactParameters,
        };
      }

      function countPdfPages(buffer) {
        const latin = bytesToLatin1(asUint8(buffer));
        const matches = latin.match(/\/Type\s*\/Page(?!\s*s)/g);
        return matches ? matches.length : 0;
      }

      function decodeXmlEntities(value) {
        return value
          .replace(/&#x([0-9a-fA-F]+);/g, function (_, hex) {
            return String.fromCharCode(parseInt(hex, 16));
          })
          .replace(/&#(\d+);/g, function (_, dec) {
            return String.fromCharCode(Number(dec));
          })
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'");
      }

      function extractDocxText(buffer) {
        const files = unzipStore(buffer);
        const types = files.get("[Content_Types].xml");
        if (!types) throw new Error("invalid_docx");
        const typesText = utf8FromBytes(types);
        if (!/wordprocessingml/i.test(typesText)) throw new Error("invalid_docx");
        if (/spreadsheetml/i.test(typesText) && !/wordprocessingml/i.test(typesText)) {
          throw new Error("invalid_docx");
        }
        const documentBytes = files.get("word/document.xml");
        if (!documentBytes) throw new Error("invalid_docx");
        const xml = utf8FromBytes(documentBytes);
        const withBreaks = xml
          .replace(/<w:tab\b[^/]*\/>/g, " ")
          .replace(/<w:br\b[^/]*\/>/g, "\n")
          .replace(/<w:p\b[^>]*>/g, "\n");
        return decodeXmlEntities(withBreaks.replace(/<[^>]+>/g, " "));
      }

      function countDocxParagraphs(text) {
        return text.split(/\n+/).filter(function (line) { return line.trim(); }).length;
      }

      function normalizeText(text) {
        return String(text || "")
          .replace(/ё/g, "е")
          .replace(/Ё/g, "Е")
          .toLowerCase()
          .replace(/[ \t\r\f\v]+/g, " ")
          .replace(/\n+/g, "\n")
          .trim();
      }

      function parseNumber(raw) {
        const value = Number(String(raw).replace(",", "."));
        return Number.isFinite(value) ? value : null;
      }

      function convertUnit(value, srcUnit, destUnit) {
        const src = srcUnit || destUnit;
        if (src === destUnit) return value;
        if (src === "мм" && destUnit === "m") return value / 1000;
        if (src === "см" && destUnit === "m") return value / 100;
        if (src === "м" && destUnit === "m") return value;
        if (src === "м" && destUnit === "mm") return value * 1000;
        if (src === "см" && destUnit === "mm") return value * 10;
        if (src === "мм" && destUnit === "mm") return value;
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
        for (let r = 0; r < RULES.length; r++) {
          const rule = RULES[r];
          if (PRICE_FIELD_IDS.has(rule.fieldId)) continue;
          for (let p = 0; p < rule.patterns.length; p++) {
            const pattern = rule.patterns[p];
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
                warnings.push(
                  "Конфликт значений для " + rule.fieldId + ": оставлено " + prev.value +
                    ", проигнорировано " + converted + "."
                );
              }
              break;
            }
            found.set(rule.fieldId, {
              fieldId: rule.fieldId,
              value: converted,
              unit: rule.destUnit,
              snippet: snippet,
            });
            break;
          }
        }
        return { found: found, warnings: warnings };
      }

      function buildPreview(options) {
        const format = options.format;
        const pageCount = options.pageCount;
        const extractedText = options.extractedText || "";
        const warnings = options.warnings || [];
        const includeExtractedText = options.includeExtractedText === true;
        const normalized = normalizeText(extractedText);
        const matched = matchRules(normalized);
        const allWarnings = warnings.concat(matched.warnings);
        const parameters = {};
        const fields = CHECKLIST.map(function (item) {
          const hit = matched.found.get(item.fieldId);
          if (!hit) {
            return {
              fieldId: item.fieldId,
              label: item.label,
              unit: item.unit,
              status: "manual",
              value: null,
              snippet: null,
            };
          }
          parameters[item.fieldId] = formatParameter(hit.value);
          return {
            fieldId: item.fieldId,
            label: item.label,
            unit: item.unit,
            status: "found",
            value: hit.value,
            snippet: hit.snippet,
          };
        });
        const api = factsApi();
        const extracted = api.extractDocumentFacts({
          text: extractedText,
          format: format,
          pageCount: pageCount,
          contentChars: options.contentChars,
          objectId: options.objectId || null,
        });
        const mirrored = api.factsFromRuleHits(matched.found, CHECKLIST, {
          pageCount: pageCount,
          objectId: options.objectId || null,
        });
        const facts = api.mergeFactLists(mirrored, extracted.facts);
        api.syncFactParameters(parameters, facts);
        fields.forEach(function (field) {
          if (parameters[field.fieldId] !== undefined && field.status !== "found") {
            const numeric = Number(parameters[field.fieldId]);
            field.status = "found";
            field.value = Number.isFinite(numeric) ? numeric : parameters[field.fieldId];
          } else if (field.status === "found" && parameters[field.fieldId] === undefined) {
            field.status = "manual";
            field.value = null;
            field.snippet = null;
          }
        });
        const foundCount = Object.keys(parameters).length;
        const sourceKind = foundCount === 0 ? "drawing-plot" : "explicit-text";
        let message = sourceKind === "drawing-plot"
          ? "Явных подписей к размерам нет. Файл можно смотреть; параметры введите вручную."
          : "Найдено полей с явными подписями: " + foundCount + ". Цены не подставляются.";
        if (facts.some(function (fact) { return fact.status === "ocr_required"; })) {
          message += " Текстовый слой не найден: нужен OCR. Платные сервисы не вызываются.";
        }
        const preview = {
          format: format,
          pageCount: pageCount,
          extractedChars: extractedText.replace(/\s+/g, " ").trim().length,
          sourceKind: sourceKind,
          message: message,
          fields: fields,
          facts: facts,
          factsSchema: extracted.schema,
          parameters: parameters,
          warnings: allWarnings,
          errors: [],
        };
        if (includeExtractedText) preview.extractedText = extractedText;
        return preview;
      }

      function parsePdf(buffer) {
        const bytes = asUint8(buffer);
        if (bytes.length < 8 || !bytesEqual(bytes, 0, PDF_MAGIC)) {
          throw new Error("invalid_pdf");
        }
        const extractedText = extractPdfText(bytes);
        const streamText = extractPdfStreamText(bytes);
        const counted = countPdfPages(bytes);
        return buildPreview({
          format: "pdf",
          pageCount: Math.max(counted, 1),
          extractedText: extractedText,
          contentChars: streamText.replace(/\s+/g, "").length,
        });
      }

      function parseDocx(buffer) {
        const extractedText = extractDocxText(buffer);
        return buildPreview({
          format: "docx",
          pageCount: Math.max(countDocxParagraphs(extractedText), 1),
          extractedText: extractedText,
          includeExtractedText: true,
        });
      }

      function parseDocument(buffer, mediaType) {
        if (mediaType === PDF_MEDIA_TYPE) return parsePdf(buffer);
        if (mediaType === DOCX_MEDIA_TYPE) return parseDocx(buffer);
        throw new Error("unsupported_media_type");
      }

      if (typeof module !== "undefined" && module.exports) {
        module.exports = {
          CHECKLIST: CHECKLIST,
          PRICE_FIELD_IDS: PRICE_FIELD_IDS,
          detectMediaType: detectMediaType,
          parseDocument: parseDocument,
          parsePdf: parsePdf,
          parseDocx: parseDocx,
          buildPreview: buildPreview,
          normalizeText: normalizeText,
          inflateBytes: inflateBytes,
          PDF_MEDIA_TYPE: PDF_MEDIA_TYPE,
          DOCX_MEDIA_TYPE: DOCX_MEDIA_TYPE,
        };
      }
