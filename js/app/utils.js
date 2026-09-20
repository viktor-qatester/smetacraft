      // MODULE: UTILS
      // ==========================================
      function parseNumber(value) {
        const n = Number(String(value).trim().replace(",", "."));
        return Number.isFinite(n) ? n : NaN;
      }

      function formatQty(n, digits) {
        return n.toLocaleString("ru-RU", {
          minimumFractionDigits: digits,
          maximumFractionDigits: digits,
        });
      }

      function formatMoney(n) {
        return (
          n.toLocaleString("ru-BY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " Br"
        );
      }

      function isZeroSize(value) {
        return !(Number(value) > ZERO_SIZE);
      }

      function kgPerMeter(diameterMm) {
        return (diameterMm * diameterMm) / 162.3;
      }

      function barCount(span, step) {
        const quotient = span / step;
        const nearest = Math.round(quotient);
        const adjusted =
          Math.abs(quotient - nearest) < 1e-9 ? nearest : quotient;
        return Math.ceil(adjusted) + 1;
      }

      function defaultRodLengthM(diameterMm) {
        return diameterMm === 12 ? 5.8 : 6.0;
      }

      function lengthWithSplices(span, rodLength, overlap) {
        if (span <= rodLength) return span;
        const usable = rodLength - overlap;
        const pieces = Math.ceil((span - overlap) / usable);
        return span + (pieces - 1) * overlap;
      }

      function stirrupBarLength(width, height, cover, stirrupMm) {
        const innerW = width - 2 * cover;
        const innerH = height - 2 * cover;
        const hook = Math.max(HOOK_MIN, HOOK_DIAMETERS * (stirrupMm / 1000));
        return 2 * (innerW + innerH) + 2 * hook;
      }

      // ==========================================
