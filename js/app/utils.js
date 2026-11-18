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

      const CURRENCY_OPTIONS = Object.freeze({
        BYN: Object.freeze({ code: "BYN", symbol: "Br", heading: "BYN (Br)" }),
        RUB: Object.freeze({ code: "RUB", symbol: "₽", heading: "RUB (₽)" }),
        USD: Object.freeze({ code: "USD", symbol: "$", heading: "USD ($)" }),
        EUR: Object.freeze({ code: "EUR", symbol: "€", heading: "EUR (€)" }),
        PLN: Object.freeze({ code: "PLN", symbol: "zł", heading: "PLN (zł)" }),
        UAH: Object.freeze({ code: "UAH", symbol: "₴", heading: "UAH (₴)" }),
        KZT: Object.freeze({ code: "KZT", symbol: "₸", heading: "KZT (₸)" }),
        GBP: Object.freeze({ code: "GBP", symbol: "£", heading: "GBP (£)" }),
      });

      function getCurrency() {
        const el = document.getElementById("currency");
        const code = el && Object.prototype.hasOwnProperty.call(CURRENCY_OPTIONS, el.value)
          ? el.value
          : "BYN";
        return CURRENCY_OPTIONS[code];
      }

      // Presentation money: keep Intl half-up-to-2-decimals semantics for each
      // visible line, then sum those displayed amounts in integer minor units.
      function formatMoneyValue(n) {
        return Number(n).toLocaleString("ru-BY", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
      }

      function moneyToKop(n) {
        const text = formatMoneyValue(n)
          .replace(/\u00a0/g, "")
          .replace(/\s/g, "")
          .replace(",", ".");
        const value = Number(text);
        if (!Number.isFinite(value)) return 0;
        return Math.round(value * 100);
      }

      function formatMoney(n) {
        return formatMoneyValue(n) + " " + getCurrency().symbol;
      }

      function formatMoneyFromKop(kop) {
        return formatMoneyValue(Number(kop) / 100) + " " + getCurrency().symbol;
      }

      function sumMoneyKop(values) {
        let kop = 0;
        for (let i = 0; i < values.length; i++) {
          kop += moneyToKop(values[i]);
        }
        return kop;
      }

      function syncCurrencyUi() {
        const currency = getCurrency();
        const el = document.getElementById("currency");
        if (el && el.value !== currency.code) {
          el.value = currency.code;
        }
        document.querySelectorAll(".js-currency-heading").forEach(function (node) {
          node.textContent = currency.heading;
        });
        document.querySelectorAll(".js-currency-symbol").forEach(function (node) {
          node.textContent = currency.symbol;
        });
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
