      // MODULE: EXTRACTED FACTS (PDF/DOCX evidence contract)
      // Neutral facts only. No DOM, no js/core, no paid OCR.
      // ==========================================
      var FACTS_SCHEMA = "smetacraft-extracted-facts/1";
      var FACT_STATUSES = ["confirmed", "needs_review", "not_found", "unsupported", "conflict", "ocr_required"];
      var MAX_FACTS = 80;
      var MAX_EVIDENCE = 240;
      var MAX_RAW = 160;
      var MAX_WARNING = 200;
      var MAX_WARNINGS = 8;
      var SLAB_BAR_DIAMETERS = [8, 10, 12, 14, 16];
      var FACT_PILE_DIAMETERS = [200, 250, 300, 350, 400];
      var CONCRETE_GRADES = ["М150", "М200", "М250", "М300", "М350", "М400", "М450", "М500"];
      var SUPPORTED_FIELD_IDS = [
        "foundation.type",
        "foundation.slab.thickness_mm",
        "foundation.slab.concrete_class",
        "foundation.slab.rebar_layers",
        "foundation.slab.rebar_top_diameter_mm",
        "foundation.slab.rebar_bottom_diameter_mm",
        "foundation.slab.rebar_top_spacing_mm",
        "foundation.slab.rebar_bottom_spacing_mm",
        "foundation.rib.height_mm",
        "foundation.rib.width_mm",
        "foundation.pile.primary.count",
        "foundation.pile.primary.section_mm",
        "foundation.pile.primary.length_mm",
        "foundation.pile.secondary.count",
        "foundation.pile.secondary.diameter_mm",
        "foundation.slab.concrete_volume_m3",
        "foundation.slab.rebar_mass_total_kg",
        "foundation.slab.rebar_mass_d12_kg",
        "foundation.slab.rebar_mass_d8_kg",
        "length",
        "width",
      ];
      var FACT_LABELS = {
        "foundation.type": "Тип фундамента",
        "foundation.slab.thickness_mm": "Толщина плиты",
        "foundation.slab.concrete_class": "Класс бетона",
        "concrete.grade_m": "Марка бетона",
        "foundation.slab.rebar_layers": "Число сеток арматуры",
        "foundation.slab.rebar_top_diameter_mm": "Диаметр верхней сетки",
        "foundation.slab.rebar_bottom_diameter_mm": "Диаметр нижней сетки",
        "foundation.slab.rebar_top_spacing_mm": "Шаг верхней сетки",
        "foundation.slab.rebar_bottom_spacing_mm": "Шаг нижней сетки",
        "foundation.rib.height_mm": "Высота ребра",
        "foundation.rib.width_mm": "Ширина ребра",
        "foundation.pile.primary.count": "Количество свай",
        "foundation.pile.primary.section_mm": "Сечение сваи",
        "foundation.pile.primary.length_mm": "Длина сваи",
        "foundation.pile.primary.diameter_mm": "Диаметр сваи",
        "foundation.pile.secondary.count": "Количество дополнительных свай",
        "foundation.pile.secondary.diameter_mm": "Диаметр дополнительной сваи",
        "foundation.slab.concrete_volume_m3": "Объём бетона (справочно)",
        "foundation.slab.rebar_mass_total_kg": "Масса арматуры, всего (справочно)",
        "foundation.slab.rebar_mass_d12_kg": "Масса арматуры d12 (справочно)",
        "foundation.slab.rebar_mass_d8_kg": "Масса арматуры d8 (справочно)",
        "document.ocr_required": "Текстовый слой",
        "length": "Длина плиты",
        "width": "Ширина плиты",
        "height": "Толщина плиты",
        "strip-length": "Периметр / длина ленты",
        "strip-width": "Ширина ленты",
        "strip-height": "Высота ленты",
        "strip-stirrup-diameter": "Диаметр хомутов",
        "strip-stirrup-step": "Шаг хомутов",
        "walls-perimeter": "Периметр стен",
        "walls-height": "Высота стен",
        "bar-diameter": "Диаметр арматуры плиты",
        "bar-step": "Шаг сетки",
        "slab-mesh-count": "Количество сеток",
        grade: "Марка бетона плиты",
      };
      var STATUS_LABELS = {
        confirmed: "Подтверждено",
        needs_review: "Проверить",
        not_found: "Не найдено",
        unsupported: "Не поддерживается",
        conflict: "Конфликт",
        ocr_required: "Нужен OCR",
      };

      function foldFactText(text) {
        return String(text || "").replace(/ё/g, "е").replace(/Ё/g, "Е").toLowerCase();
      }

      function clipFactText(text, max) {
        var value = String(text || "").replace(/\s+/g, " ").trim();
        if (value.length <= max) return value;
        return value.slice(0, max);
      }

      function parseFactNumber(raw) {
        if (typeof raw !== "string" && typeof raw !== "number") return null;
        var normalized = String(raw).replace(",", ".");
        if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
        var value = Number(normalized);
        return Number.isFinite(value) ? value : null;
      }

      function formatFactApply(value) {
        if (!Number.isFinite(value)) return null;
        if (Math.abs(value - Math.round(value)) < 1e-9) return String(Math.round(value));
        return String(Math.round(value * 1000) / 1000);
      }

      function lengthToMeters(value, unit) {
        var name = String(unit || "").toLowerCase();
        if (name === "мм" || name === "mm") return value / 1000;
        if (name === "см" || name === "cm") return value / 100;
        if (name === "м" || name === "m") return value;
        return null;
      }

      function conversionName(unit, dest) {
        var name = String(unit || "").toLowerCase();
        if (dest === "m" && (name === "мм" || name === "mm")) return "mm_to_m";
        if (dest === "m" && (name === "см" || name === "cm")) return "cm_to_m";
        if (dest === "m") return "identity_m";
        if (dest === "mm") return "identity_mm";
        return "identity";
      }

      function isPriceFieldId(fieldId) {
        return fieldId === "currency" || /-price$/.test(String(fieldId || ""));
      }

      function evidenceSlice(original, match) {
        return original.slice(match.index, match.index + match[0].length);
      }

      function eachMatch(folded, original, regex, visit) {
        var flags = regex.flags.indexOf("g") === -1 ? regex.flags + "g" : regex.flags;
        var re = new RegExp(regex.source, flags);
        var match;
        while ((match = re.exec(folded))) {
          visit(match, evidenceSlice(original, match));
          if (match[0].length === 0) re.lastIndex += 1;
        }
      }

      function makeFact(partial) {
        var source = partial.source || {};
        return {
          fieldId: partial.fieldId,
          rawValue: clipFactText(partial.rawValue, MAX_RAW),
          normalizedValue: partial.normalizedValue == null ? null : partial.normalizedValue,
          unit: partial.unit || null,
          status: partial.status,
          confidence: partial.confidence,
          source: {
            objectId: source.objectId || partial.objectId || null,
            page: source.page == null ? (partial.page == null ? null : partial.page) : source.page,
            evidence: clipFactText(source.evidence || partial.evidence || partial.rawValue, MAX_EVIDENCE),
          },
          target: partial.target || null,
          warnings: (partial.warnings || []).slice(0, MAX_WARNINGS).map(function (item) {
            return clipFactText(item, MAX_WARNING);
          }),
          selectable: partial.selectable === true,
          defaultSelected: partial.defaultSelected === true && partial.selectable === true,
        };
      }

      function fieldTarget(fieldId, conversion, applyValue) {
        if (!fieldId || isPriceFieldId(fieldId) || applyValue == null) return null;
        return {
          projectFieldId: fieldId,
          conversion: conversion,
          applyValue: String(applyValue),
          kind: "field",
        };
      }

      function pileTarget(key, value, conversion) {
        var pile = {};
        pile[key] = value;
        return {
          projectFieldId: "piles.0." + key,
          conversion: conversion,
          applyValue: String(value),
          kind: "pile",
          pile: pile,
        };
      }

      function referenceFact(options, fieldId, raw, value, unit, evidence, warning) {
        return makeFact({
          fieldId: fieldId,
          rawValue: raw,
          normalizedValue: value,
          unit: unit,
          status: "confirmed",
          confidence: 0.9,
          objectId: options.objectId || null,
          page: options.pageCount === 1 ? 1 : null,
          evidence: evidence,
          target: null,
          warnings: warning ? [warning] : ["Справочное значение. В формулы калькулятора не подставляется."],
          selectable: false,
          defaultSelected: false,
        });
      }

      function pushUnique(hits, fact) {
        hits.push(fact);
      }

      function collectFoundationType(folded, original, options, hits) {
        var rules = [
          [/свайно-ростверков\S*плитн/, "pile_grillage_slab"],
          [/монолитн\S*\s+плит\S*\s+и\s+ленточн\S*\s+ребр/, "slab_with_strip_ribs"],
        ];
        for (var i = 0; i < rules.length; i++) {
          eachMatch(folded, original, rules[i][0], function (match, raw) {
            pushUnique(hits, makeFact({
              fieldId: "foundation.type",
              rawValue: raw,
              normalizedValue: rules[i][1],
              unit: null,
              status: "confirmed",
              confidence: 0.92,
              objectId: options.objectId || null,
              page: options.pageCount === 1 ? 1 : null,
              evidence: raw,
              target: null,
              warnings: ["Тип показан справочно: в калькуляторе нет того же переключателя."],
              selectable: false,
              defaultSelected: false,
            }));
          });
        }
      }

      function collectSlabThickness(folded, original, options, hits) {
        var pattern = /(?:плит\S+|slab).{0,48}?(?:толщин\S+|thickness|высот\S+|\bh)\s*[=:]?\s*(\d+(?:[.,]\d+)?)\s*(мм|mm|см|cm|м|m)(?![a-zа-я])/g;
        eachMatch(folded, original, pattern, function (match, raw) {
          var value = parseFactNumber(match[1]);
          if (value === null) return;
          var meters = lengthToMeters(value, match[2]);
          if (meters === null || meters <= 0) return;
          pushUnique(hits, makeFact({
            fieldId: "foundation.slab.thickness_mm",
            rawValue: raw,
            normalizedValue: match[2] === "мм" || match[2] === "mm" ? value : Math.round(meters * 1000),
            unit: "mm",
            status: "confirmed",
            confidence: 0.95,
            objectId: options.objectId || null,
            page: options.pageCount === 1 ? 1 : null,
            evidence: raw,
            target: fieldTarget("height", conversionName(match[2], "m"), formatFactApply(meters)),
            warnings: ["Толщина плиты переводится в метры поля «Толщина»."],
            selectable: true,
            defaultSelected: true,
          }));
        });
        if (!/плит|slab/.test(folded)) return;
        var bare = /(?:плит\S+|slab).{0,40}?толщин\S*\s*[=:]?\s*(\d+(?:[.,]\d+)?)(?!\s*(?:мм|mm|см|cm|м|m)(?![a-zа-я]))/g;
        eachMatch(folded, original, bare, function (match, raw) {
          pushUnique(hits, makeFact({
            fieldId: "foundation.slab.thickness_mm",
            rawValue: raw,
            normalizedValue: parseFactNumber(match[1]),
            unit: null,
            status: "needs_review",
            confidence: 0.4,
            objectId: options.objectId || null,
            page: options.pageCount === 1 ? 1 : null,
            evidence: raw,
            target: null,
            warnings: ["Нет единицы. Значение не подставляется."],
            selectable: false,
            defaultSelected: false,
          }));
        });
      }

      function collectSlabPlanSize(folded, original, options, hits) {
        var specs = [
          [/(?:плит\S+|slab)\s+(?:длин\S+|length)\s*[=:]?\s*(\d+(?:[.,]\d+)?)\s*(мм|mm|см|cm|м|m)(?![a-zа-я])/g, "length"],
          [/(?:плит\S+|slab)\s+(?:ширин\S+|width)\s*[=:]?\s*(\d+(?:[.,]\d+)?)\s*(мм|mm|см|cm|м|m)(?![a-zа-я])/g, "width"],
        ];
        specs.forEach(function (spec) {
          eachMatch(folded, original, spec[0], function (match, raw) {
            var value = parseFactNumber(match[1]);
            var meters = value === null ? null : lengthToMeters(value, match[2]);
            if (meters === null || meters <= 0) return;
            pushUnique(hits, makeFact({
              fieldId: spec[1],
              rawValue: raw,
              normalizedValue: meters,
              unit: "m",
              status: "confirmed",
              confidence: 0.93,
              objectId: options.objectId || null,
              page: options.pageCount === 1 ? 1 : null,
              evidence: raw,
              target: fieldTarget(spec[1], conversionName(match[2], "m"), formatFactApply(meters)),
              warnings: conversionName(match[2], "m") === "identity_m" ? [] : ["Единица переводится в метры."],
              selectable: true,
              defaultSelected: true,
            }));
          });
        });
      }

      function collectConcreteClass(folded, original, options, hits) {
        var pattern = /(?:бетон\S*|concrete|класс\S*|плит\S*).{0,40}?\b[bв]\s*(\d{2}(?:[.,]\d+)?)\b/g;
        eachMatch(folded, original, pattern, function (match, raw) {
          var grade = "B" + match[1].replace(",", ".");
          pushUnique(hits, makeFact({
            fieldId: "foundation.slab.concrete_class",
            rawValue: raw,
            normalizedValue: grade,
            unit: null,
            status: "confirmed",
            confidence: 0.94,
            objectId: options.objectId || null,
            page: options.pageCount === 1 ? 1 : null,
            evidence: raw,
            target: null,
            warnings: ["Класс B не переводится в марку М и не меняет цену."],
            selectable: false,
            defaultSelected: false,
          }));
        });
        var gradePattern = /(?:марка\s+бетона|бетон\S*\s+марк\S+)\s*(м\s*(?:150|200|250|300|350|400|450|500))\b/g;
        eachMatch(folded, original, gradePattern, function (match, raw) {
          var grade = match[1].replace(/\s+/g, "").replace("м", "М");
          if (CONCRETE_GRADES.indexOf(grade) === -1) return;
          pushUnique(hits, makeFact({
            fieldId: "concrete.grade_m",
            rawValue: raw,
            normalizedValue: grade,
            unit: null,
            status: "confirmed",
            confidence: 0.9,
            objectId: options.objectId || null,
            page: options.pageCount === 1 ? 1 : null,
            evidence: raw,
            target: fieldTarget("grade", "identity_grade", grade),
            warnings: ["Марка меняет подпись бетона. Цена прайса не меняется."],
            selectable: true,
            defaultSelected: false,
          }));
        });
      }

      function diameterFact(options, fieldId, projectFieldId, raw, millimeters, evidence) {
        var allowed = SLAB_BAR_DIAMETERS.indexOf(millimeters) !== -1;
        var auto = allowed && fieldId === "foundation.slab.rebar_top_diameter_mm";
        return makeFact({
          fieldId: fieldId,
          rawValue: raw,
          normalizedValue: millimeters,
          unit: "mm",
          status: "confirmed",
          confidence: allowed ? 0.93 : 0.8,
          objectId: options.objectId || null,
          page: options.pageCount === 1 ? 1 : null,
          evidence: evidence,
          target: allowed ? fieldTarget(projectFieldId, "identity_mm", String(millimeters)) : null,
          warnings: allowed ? [] : ["Диаметр нет в списке калькулятора, значение только в предпросмотре."],
          selectable: allowed,
          defaultSelected: auto,
        });
      }

      function collectRebar(folded, original, options, hits) {
        eachMatch(folded, original, /верхн\S+\s+зон\S*.{0,50}?\bd\s*(\d{1,2})\b/g, function (match, raw) {
          var mm = parseFactNumber(match[1]);
          if (mm === null) return;
          hits.push(diameterFact(options, "foundation.slab.rebar_top_diameter_mm", "bar-diameter", raw, mm, raw));
        });
        eachMatch(folded, original, /нижн\S+\s+зон\S*.{0,50}?\bd\s*(\d{1,2})\b/g, function (match, raw) {
          var mm = parseFactNumber(match[1]);
          if (mm === null) return;
          hits.push(diameterFact(options, "foundation.slab.rebar_bottom_diameter_mm", "bar-diameter", raw, mm, raw));
        });
        eachMatch(folded, original, /стержн\S+\s+d\s*(\d{1,2})\s*мм/g, function (match, raw) {
          var mm = parseFactNumber(match[1]);
          if (mm === null) return;
          var both = /верхн/.test(folded) && /нижн/.test(folded);
          hits.push(diameterFact(options, "foundation.slab.rebar_top_diameter_mm", "bar-diameter", raw, mm, raw));
          if (both) {
            hits.push(diameterFact(options, "foundation.slab.rebar_bottom_diameter_mm", "bar-diameter", raw, mm, raw));
          }
        });
        eachMatch(folded, original, /верхн\S+\s+зон\S*.{0,40}?шаг\s*(\d+(?:[.,]\d+)?)\s*(мм|mm)(?![a-zа-я])/g, function (match, raw) {
          var step = parseFactNumber(match[1]);
          if (step === null) return;
          hits.push(makeFact({
            fieldId: "foundation.slab.rebar_top_spacing_mm",
            rawValue: raw,
            normalizedValue: step,
            unit: "mm",
            status: "confirmed",
            confidence: 0.92,
            objectId: options.objectId || null,
            page: options.pageCount === 1 ? 1 : null,
            evidence: raw,
            target: fieldTarget("bar-step", "identity_mm", formatFactApply(step)),
            warnings: [],
            selectable: true,
            defaultSelected: true,
          }));
        });
        eachMatch(folded, original, /нижн\S+\s+зон\S*.{0,40}?шаг\s*(\d+(?:[.,]\d+)?)\s*(мм|mm)(?![a-zа-я])/g, function (match, raw) {
          var step = parseFactNumber(match[1]);
          if (step === null) return;
          hits.push(makeFact({
            fieldId: "foundation.slab.rebar_bottom_spacing_mm",
            rawValue: raw,
            normalizedValue: step,
            unit: "mm",
            status: "confirmed",
            confidence: 0.9,
            objectId: options.objectId || null,
            page: options.pageCount === 1 ? 1 : null,
            evidence: raw,
            target: null,
            warnings: ["Шаг нижней сетки показан отдельно и не затирает верхний, если они различаются."],
            selectable: false,
            defaultSelected: false,
          }));
        });
        eachMatch(folded, original, /шаг\s*(\d+(?:[.,]\d+)?)\s*(мм|mm)(?![a-zа-я])\s+в\s+обоих\s+направлен/g, function (match, raw) {
          var step = parseFactNumber(match[1]);
          if (step === null) return;
          hits.push(makeFact({
            fieldId: "foundation.slab.rebar_top_spacing_mm",
            rawValue: raw,
            normalizedValue: step,
            unit: "mm",
            status: "confirmed",
            confidence: 0.9,
            objectId: options.objectId || null,
            page: options.pageCount === 1 ? 1 : null,
            evidence: raw,
            target: fieldTarget("bar-step", "identity_mm", formatFactApply(step)),
            warnings: [],
            selectable: true,
            defaultSelected: true,
          }));
        });
        eachMatch(folded, original, /верхн\S*.{0,40}нижн\S*\s+зон\S*/g, function (match, raw) {
          hits.push(makeFact({
            fieldId: "foundation.slab.rebar_layers",
            rawValue: raw,
            normalizedValue: 2,
            unit: "layer",
            status: "confirmed",
            confidence: 0.88,
            objectId: options.objectId || null,
            page: options.pageCount === 1 ? 1 : null,
            evidence: raw,
            target: fieldTarget("slab-mesh-count", "identity_count", "2"),
            warnings: [],
            selectable: true,
            defaultSelected: true,
          }));
        });
      }

      function collectPiles(folded, original, options, hits) {
        eachMatch(folded, original, /спецификац\S+\s+винтов\S+\s+свай\S*\s*:\s*(\d+)\s*шт/g, function (match, raw) {
          var count = parseFactNumber(match[1]);
          if (count === null) return;
          hits.push(makeFact({
            fieldId: "foundation.pile.secondary.count",
            rawValue: raw,
            normalizedValue: count,
            unit: "piece",
            status: "confirmed",
            confidence: 0.9,
            objectId: options.objectId || null,
            page: options.pageCount === 1 ? 1 : null,
            evidence: raw,
            target: null,
            warnings: ["Дополнительные сваи не записываются во первую строку калькулятора."],
            selectable: false,
            defaultSelected: false,
          }));
        });
        eachMatch(folded, original, /спецификац\S+\s+свай\S*\s*:\s*(\d+)\s*шт/g, function (match, raw) {
          if (/винтов/.test(match[0])) return;
          var count = parseFactNumber(match[1]);
          if (count === null) return;
          hits.push(makeFact({
            fieldId: "foundation.pile.primary.count",
            rawValue: raw,
            normalizedValue: count,
            unit: "piece",
            status: "confirmed",
            confidence: 0.9,
            objectId: options.objectId || null,
            page: options.pageCount === 1 ? 1 : null,
            evidence: raw,
            target: pileTarget("count", count, "identity_count"),
            warnings: ["Количество попадёт в первую строку свай только если отметить галочку. Включение свай в смете не меняется."],
            selectable: true,
            defaultSelected: false,
          }));
        });
        eachMatch(folded, original, /сечени\S*\s*(\d{2,4})\s*[xх×]\s*(\d{2,4})\s*мм/g, function (match, raw) {
          hits.push(makeFact({
            fieldId: "foundation.pile.primary.section_mm",
            rawValue: raw,
            normalizedValue: match[1] + "x" + match[2],
            unit: "mm",
            status: "confirmed",
            confidence: 0.93,
            objectId: options.objectId || null,
            page: options.pageCount === 1 ? 1 : null,
            evidence: raw,
            target: null,
            warnings: ["Квадратное сечение не подставляется в диаметр буронабивной сваи."],
            selectable: false,
            defaultSelected: false,
          }));
        });
        eachMatch(folded, original, /длин\S+\s+сваи\s*(\d+(?:[.,]\d+)?)\s*(мм|mm|м|m)(?![a-zа-я])/g, function (match, raw) {
          var value = parseFactNumber(match[1]);
          if (value === null) return;
          var mm = match[2] === "м" || match[2] === "m" ? Math.round(value * 1000) : value;
          var meters = mm / 1000;
          hits.push(makeFact({
            fieldId: "foundation.pile.primary.length_mm",
            rawValue: raw,
            normalizedValue: mm,
            unit: "mm",
            status: "confirmed",
            confidence: 0.9,
            objectId: options.objectId || null,
            page: options.pageCount === 1 ? 1 : null,
            evidence: raw,
            target: pileTarget("depthM", meters, "mm_to_m"),
            warnings: ["Длина сваи переводится в глубину первой строки, только по галочке."],
            selectable: true,
            defaultSelected: false,
          }));
        });
        eachMatch(folded, original, /винтов\S+\s+сва\S*\s*d\s*(\d+)/g, function (match, raw) {
          var mm = parseFactNumber(match[1]);
          if (mm === null) return;
          hits.push(makeFact({
            fieldId: "foundation.pile.secondary.diameter_mm",
            rawValue: raw,
            normalizedValue: mm,
            unit: "mm",
            status: "confirmed",
            confidence: 0.88,
            objectId: options.objectId || null,
            page: options.pageCount === 1 ? 1 : null,
            evidence: raw,
            target: FACT_PILE_DIAMETERS.indexOf(mm) === -1 ? null : pileTarget("diameterMm", mm, "identity_mm"),
            warnings: ["Диаметр вне списка 200–400 мм в калькулятор не записывается."],
            selectable: false,
            defaultSelected: false,
          }));
        });
        eachMatch(folded, original, /диаметр\s+сваи\s*(\d+(?:[.,]\d+)?)\s*(мм|mm)(?![a-zа-я])/g, function (match, raw) {
          var mm = parseFactNumber(match[1]);
          if (mm === null || /винтов/.test(folded)) return;
          var allowed = FACT_PILE_DIAMETERS.indexOf(mm) !== -1;
          hits.push(makeFact({
            fieldId: "foundation.pile.primary.diameter_mm",
            rawValue: raw,
            normalizedValue: mm,
            unit: "mm",
            status: "confirmed",
            confidence: 0.9,
            objectId: options.objectId || null,
            page: options.pageCount === 1 ? 1 : null,
            evidence: raw,
            target: allowed ? pileTarget("diameterMm", mm, "identity_mm") : null,
            warnings: allowed ? ["Диаметр записывается в первую строку свай только по галочке."] : ["Диаметр нет в списке калькулятора."],
            selectable: allowed,
            defaultSelected: false,
          }));
        });
      }

      function collectRibs(folded, original, options, hits) {
        eachMatch(folded, original, /ленточн\S+\s+ребр\S*\s+высот\S+\s*(\d+(?:[.,]\d+)?)\s*(мм|mm|см|cm|м|m)(?![a-zа-я])/g, function (match, raw) {
          var value = parseFactNumber(match[1]);
          if (value === null) return;
          var mm = match[2] === "м" || match[2] === "m" ? value * 1000 : (match[2] === "см" || match[2] === "cm" ? value * 10 : value);
          hits.push(makeFact({
            fieldId: "foundation.rib.height_mm",
            rawValue: raw,
            normalizedValue: mm,
            unit: "mm",
            status: "confirmed",
            confidence: 0.9,
            objectId: options.objectId || null,
            page: options.pageCount === 1 ? 1 : null,
            evidence: raw,
            target: null,
            warnings: ["Ребро не подставляется в высоту ленты автоматически."],
            selectable: false,
            defaultSelected: false,
          }));
        });
        eachMatch(folded, original, /ленточн\S+\s+ребр\S*\s+ширин\S+\s*(\d+(?:[.,]\d+)?)\s*(мм|mm|см|cm|м|m)(?![a-zа-я])/g, function (match, raw) {
          var value = parseFactNumber(match[1]);
          if (value === null) return;
          var mm = match[2] === "м" || match[2] === "m" ? value * 1000 : (match[2] === "см" || match[2] === "cm" ? value * 10 : value);
          hits.push(makeFact({
            fieldId: "foundation.rib.width_mm",
            rawValue: raw,
            normalizedValue: mm,
            unit: "mm",
            status: "confirmed",
            confidence: 0.9,
            objectId: options.objectId || null,
            page: options.pageCount === 1 ? 1 : null,
            evidence: raw,
            target: null,
            warnings: ["Ребро не подставляется в ширину ленты автоматически."],
            selectable: false,
            defaultSelected: false,
          }));
        });
      }

      function collectReferenceQuantities(folded, original, options, hits) {
        if (/плит|бетон/.test(folded)) {
          eachMatch(folded, original, /объем\s+бетона[\s\S]{0,40}?(\d+(?:[.,]\d+)?)\s*м\s*3/g, function (match, raw) {
            var value = parseFactNumber(match[1]);
            if (value === null) return;
            hits.push(referenceFact(options, "foundation.slab.concrete_volume_m3", raw, value, "m3", raw));
          });
          eachMatch(folded, original, /всего\s+(\d+(?:[.,]\d+)?)\s*м\s*3/g, function (match, raw) {
            var value = parseFactNumber(match[1]);
            if (value === null) return;
            hits.push(referenceFact(options, "foundation.slab.concrete_volume_m3", raw, value, "m3", raw));
          });
        }
        if (/стал|арматур/.test(folded)) {
          eachMatch(folded, original, /ведомост\S+\s+расхода\s+стали\s*:\s*всего\s+(\d+(?:[.,]\d+)?)\s*кг/g, function (match, raw) {
            var value = parseFactNumber(match[1]);
            if (value === null) return;
            hits.push(referenceFact(options, "foundation.slab.rebar_mass_total_kg", raw, value, "kg", raw));
          });
          eachMatch(folded, original, /a-500c\s+d\s*12\s*:\s*(\d+(?:[.,]\d+)?)\s*кг/g, function (match, raw) {
            var value = parseFactNumber(match[1]);
            if (value === null) return;
            hits.push(referenceFact(options, "foundation.slab.rebar_mass_d12_kg", raw, value, "kg", raw));
          });
          eachMatch(folded, original, /a-500c\s+d\s*8\s*:\s*(\d+(?:[.,]\d+)?)\s*кг/g, function (match, raw) {
            var value = parseFactNumber(match[1]);
            if (value === null) return;
            hits.push(referenceFact(options, "foundation.slab.rebar_mass_d8_kg", raw, value, "kg", raw));
          });
        }
      }

      function collapseFactConflicts(facts) {
        var groups = new Map();
        facts.forEach(function (fact) {
          if (!groups.has(fact.fieldId)) groups.set(fact.fieldId, []);
          groups.get(fact.fieldId).push(fact);
        });
        var out = [];
        groups.forEach(function (group) {
          var comparable = group.filter(function (fact) {
            return fact.status === "confirmed" || fact.status === "needs_review";
          });
          var values = [];
          comparable.forEach(function (fact) {
            var key = JSON.stringify(fact.normalizedValue);
            if (values.indexOf(key) === -1) values.push(key);
          });
          if (values.length > 1) {
            out.push(makeFact({
              fieldId: group[0].fieldId,
              rawValue: group.map(function (fact) { return fact.rawValue; }).join(" | "),
              normalizedValue: null,
              unit: group[0].unit,
              status: "conflict",
              confidence: 0.3,
              evidence: group.map(function (fact) { return fact.source.evidence; }).join(" | "),
              warnings: ["Несколько разных значений. Ни одно не выбрано."],
              selectable: false,
              defaultSelected: false,
              target: null,
            }));
            return;
          }
          out.push(group[0]);
        });
        return out;
      }

      function ocrRequiredFact(options) {
        return makeFact({
          fieldId: "document.ocr_required",
          rawValue: "",
          normalizedValue: true,
          unit: null,
          status: "ocr_required",
          confidence: 0.95,
          objectId: options.objectId || null,
          page: null,
          evidence: "В содержимом страниц почти нет текстового слоя.",
          target: null,
          warnings: ["Локальный OCR не подключён. Платные API не вызываются."],
          selectable: false,
          defaultSelected: false,
        });
      }

      function extractDocumentFacts(input) {
        var options = input || {};
        var original = String(options.text || "");
        var folded = foldFactText(original);
        var hits = [];
        collectFoundationType(folded, original, options, hits);
        collectSlabThickness(folded, original, options, hits);
        collectSlabPlanSize(folded, original, options, hits);
        collectConcreteClass(folded, original, options, hits);
        collectRebar(folded, original, options, hits);
        collectPiles(folded, original, options, hits);
        collectRibs(folded, original, options, hits);
        collectReferenceQuantities(folded, original, options, hits);
        var facts = collapseFactConflicts(hits);
        if (options.format === "pdf" && typeof options.contentChars === "number" && options.contentChars < 8) {
          facts.push(ocrRequiredFact(options));
        }
        if (facts.length > MAX_FACTS) facts = facts.slice(0, MAX_FACTS);
        return {
          schema: FACTS_SCHEMA,
          facts: facts,
        };
      }

      function factsFromRuleHits(foundMap, checklist, options) {
        var facts = [];
        if (!foundMap || typeof foundMap.forEach !== "function") return facts;
        var labels = {};
        (checklist || []).forEach(function (item) { labels[item.fieldId] = item; });
        foundMap.forEach(function (hit) {
          var item = labels[hit.fieldId] || { label: hit.fieldId, unit: hit.unit };
          facts.push(makeFact({
            fieldId: hit.fieldId,
            rawValue: hit.snippet,
            normalizedValue: hit.value,
            unit: hit.unit || item.unit || null,
            status: "confirmed",
            confidence: 0.9,
            objectId: options && options.objectId || null,
            page: options && options.pageCount === 1 ? 1 : null,
            evidence: hit.snippet,
            target: fieldTarget(hit.fieldId, "explicit_label", formatFactApply(hit.value)),
            warnings: [],
            selectable: true,
            defaultSelected: true,
          }));
        });
        return facts;
      }

      function mergeFactLists(primary, extra) {
        return collapseFactConflicts((primary || []).concat(extra || []));
      }

      function syncFactParameters(parameters, facts) {
        var groups = new Map();
        (facts || []).forEach(function (fact) {
          if (!fact || !fact.defaultSelected || !fact.target || fact.target.kind !== "field") return;
          var id = fact.target.projectFieldId;
          if (isPriceFieldId(id)) return;
          if (!groups.has(id)) groups.set(id, []);
          groups.get(id).push(fact);
        });
        groups.forEach(function (group, id) {
          var values = [];
          group.forEach(function (fact) {
            var key = String(fact.target.applyValue);
            if (values.indexOf(key) === -1) values.push(key);
          });
          var current = parameters[id];
          var clashes = values.length > 1 || (current !== undefined && values.indexOf(String(current)) === -1);
          if (clashes) {
            delete parameters[id];
            group.forEach(function (fact) {
              fact.defaultSelected = false;
              fact.selectable = false;
              fact.target = null;
              fact.warnings = (fact.warnings || []).concat(["Конфликт с другим значением того же поля. В калькулятор не подставляется."]);
              if (fact.fieldId === id) {
                fact.status = "conflict";
                fact.normalizedValue = null;
              }
            });
            return;
          }
          parameters[id] = group[0].target.applyValue;
        });
        return facts;
      }

      function validateExtractedFact(fact) {
        var errors = [];
        if (!fact || typeof fact !== "object" || Array.isArray(fact)) {
          return { ok: false, errors: ["fact: ожидался объект"] };
        }
        if (typeof fact.fieldId !== "string" || !/^[a-z0-9._-]{1,80}$/i.test(fact.fieldId)) {
          errors.push("fieldId");
        }
        if (FACT_STATUSES.indexOf(fact.status) === -1) errors.push("status");
        if (typeof fact.confidence !== "number" || fact.confidence < 0 || fact.confidence > 1) errors.push("confidence");
        if (typeof fact.rawValue !== "string" || fact.rawValue.length > MAX_RAW) errors.push("rawValue");
        var value = fact.normalizedValue;
        var valueOk = value === null || typeof value === "number" || typeof value === "boolean" ||
          (typeof value === "string" && value.length <= 80);
        if (!valueOk) errors.push("normalizedValue");
        if (fact.unit !== null && typeof fact.unit !== "string") errors.push("unit");
        var source = fact.source;
        if (!source || typeof source !== "object") errors.push("source");
        else {
          if (source.objectId !== null && !/^[0-9a-f]{32}$/.test(String(source.objectId || ""))) errors.push("objectId");
          if (source.page !== null && (!Number.isInteger(source.page) || source.page < 1)) errors.push("page");
          if (typeof source.evidence !== "string" || source.evidence.length > MAX_EVIDENCE) errors.push("evidence");
        }
        if (!Array.isArray(fact.warnings) || fact.warnings.length > MAX_WARNINGS) errors.push("warnings");
        if (fact.target !== null) {
          if (!fact.target || typeof fact.target.projectFieldId !== "string" || isPriceFieldId(fact.target.projectFieldId)) {
            errors.push("target");
          }
        }
        if (fact.defaultSelected && (fact.status !== "confirmed" || fact.selectable !== true)) errors.push("defaultSelected");
        return { ok: errors.length === 0, errors: errors };
      }

      function validateFactBatch(facts) {
        if (!Array.isArray(facts)) return { ok: false, errors: ["facts: ожидался массив"] };
        if (facts.length > MAX_FACTS) return { ok: false, errors: ["facts: слишком много"] };
        var errors = [];
        facts.forEach(function (fact, index) {
          var result = validateExtractedFact(fact);
          result.errors.forEach(function (error) { errors.push(index + ":" + error); });
        });
        return { ok: errors.length === 0, errors: errors };
      }

      function planDocumentFactApply(facts, selectedIds) {
        var errors = [];
        var selected = {};
        (selectedIds || []).forEach(function (id) { selected[id] = true; });
        var fields = {};
        var pile = null;
        var batch = validateFactBatch(facts || []);
        if (!batch.ok) {
          return { fields: {}, pile: null, errors: batch.errors };
        }
        (facts || []).forEach(function (fact) {
          if (!selected[fact.fieldId]) return;
          if (!fact.selectable || fact.status !== "confirmed" || !fact.target) {
            errors.push(fact.fieldId + ": нельзя применить статус " + fact.status);
            return;
          }
          if (fact.target.kind === "pile") {
            pile = pile || {};
            Object.keys(fact.target.pile || {}).forEach(function (key) {
              pile[key] = fact.target.pile[key];
            });
            return;
          }
          var id = fact.target.projectFieldId;
          if (isPriceFieldId(id) || typeof fact.target.applyValue !== "string") {
            errors.push(fact.fieldId + ": небезопасное поле");
            return;
          }
          if (fields[id] !== undefined && fields[id] !== fact.target.applyValue) {
            errors.push(fact.fieldId + ": конфликт " + id);
            return;
          }
          fields[id] = fact.target.applyValue;
        });
        (selectedIds || []).forEach(function (id) {
          var known = (facts || []).some(function (fact) { return fact.fieldId === id; });
          if (!known) errors.push(id + ": нет такого факта");
        });
        return { fields: fields, pile: pile, errors: errors };
      }

      function statusLabel(status) {
        return STATUS_LABELS[status] || status;
      }

      function rowFromFact(fact) {
        var target = fact.target;
        var targetText = target && target.projectFieldId ? target.projectFieldId : "не подставляется";
        if (target && target.conversion && target.conversion !== "identity" && target.conversion !== "explicit_label" && target.conversion !== "identity_m" && target.conversion !== "identity_mm" && target.conversion !== "identity_count" && target.conversion !== "identity_grade") {
          targetText += " (" + target.conversion + ")";
        }
        var valueText = fact.normalizedValue == null ? "" : String(fact.normalizedValue);
        if (fact.unit) valueText = valueText ? valueText + " " + fact.unit : "";
        return {
          fieldId: fact.fieldId,
          label: FACT_LABELS[fact.fieldId] || fact.fieldId,
          valueText: valueText,
          pageText: fact.source && fact.source.page ? String(fact.source.page) : "",
          evidence: fact.source && fact.source.evidence ? fact.source.evidence : "",
          targetText: targetText,
          status: fact.status,
          statusLabel: statusLabel(fact.status),
          warning: (fact.warnings || []).join(" "),
          selectable: fact.selectable === true,
          defaultSelected: fact.defaultSelected === true,
        };
      }

      function previewRows(preview) {
        var facts = preview && Array.isArray(preview.facts) ? preview.facts : [];
        var seen = {};
        var rows = [];
        facts.forEach(function (fact) {
          rows.push(rowFromFact(fact));
          seen[fact.fieldId] = true;
          if (fact.target && fact.target.projectFieldId) seen[fact.target.projectFieldId] = true;
        });
        var fields = preview && Array.isArray(preview.fields) ? preview.fields : [];
        fields.forEach(function (field) {
          if (seen[field.fieldId]) return;
          var found = field.status === "found";
          rows.push({
            fieldId: field.fieldId,
            label: field.label || field.fieldId,
            valueText: found && field.value != null ? String(field.value) + (field.unit ? " " + field.unit : "") : "",
            pageText: "",
            evidence: field.snippet || "",
            targetText: found ? field.fieldId : "не подставляется",
            status: found ? "confirmed" : "not_found",
            statusLabel: found ? "Подтверждено" : "Не найдено",
            warning: "",
            selectable: found,
            defaultSelected: found,
          });
        });
        return rows;
      }

      function sameFactValue(actual, expected) {
        if (typeof expected === "number" && typeof actual === "number") {
          return Math.abs(actual - expected) < 0.001;
        }
        if (typeof expected === "string" && typeof actual === "string") {
          return actual.replace(/\s+/g, "").toLowerCase() === expected.replace(/\s+/g, "").toLowerCase();
        }
        return actual === expected;
      }

      function scoreEvidenceLabels(labels, extract) {
        var supported = {};
        SUPPORTED_FIELD_IDS.forEach(function (id) { supported[id] = true; });
        var result = {
          truePositive: 0,
          falsePositive: [],
          recallMiss: [],
          unsupportedHonest: 0,
          downgraded: 0,
          notFoundViolations: [],
          reviewViolations: [],
        };
        (labels || []).forEach(function (label) {
          var facts = extract(String(label.evidence || ""));
          var fact = null;
          (facts || []).forEach(function (item) {
            if (item.fieldId === label.field_id) fact = item;
          });
          if (label.status === "not_found") {
            if (fact && fact.defaultSelected) result.notFoundViolations.push(label.field_id);
            if (fact && fact.status === "confirmed" && fact.normalizedValue !== null && fact.normalizedValue !== undefined) {
              result.notFoundViolations.push(label.field_id);
            }
            if (fact && (fact.normalizedValue === 0 || fact.normalizedValue === "0")) {
              result.notFoundViolations.push(label.field_id + ":zero");
            }
            return;
          }
          if (label.status === "needs_review") {
            if (fact && fact.defaultSelected) result.reviewViolations.push(label.field_id);
            return;
          }
          if (!supported[label.field_id]) {
            if (fact && fact.status === "confirmed" && !sameFactValue(fact.normalizedValue, label.value)) {
              result.falsePositive.push(label.field_id);
            } else result.unsupportedHonest += 1;
            return;
          }
          if (!fact || fact.status === "conflict" || fact.status === "unsupported" || fact.status === "ocr_required") {
            result.recallMiss.push(label.field_id);
            return;
          }
          if (fact.status === "needs_review") {
            result.downgraded += 1;
            if (fact.defaultSelected) result.reviewViolations.push(label.field_id);
            return;
          }
          if (fact.status === "confirmed" && sameFactValue(fact.normalizedValue, label.value)) {
            result.truePositive += 1;
            if (fact.defaultSelected && fact.target && isPriceFieldId(fact.target.projectFieldId)) {
              result.reviewViolations.push(label.field_id + ":price");
            }
            return;
          }
          if (fact.status === "confirmed") result.falsePositive.push(label.field_id);
          else result.recallMiss.push(label.field_id);
        });
        var decided = result.truePositive + result.falsePositive.length;
        result.precision = decided === 0 ? 1 : result.truePositive / decided;
        return result;
      }

      function createLocalOcrAdapter() {
        return {
          name: "none",
          available: false,
          recognize: function () {
            return { status: "unsupported", text: "", reason: "local_ocr_not_installed" };
          },
        };
      }

      if (typeof module !== "undefined" && module.exports) {
        module.exports = {
          FACTS_SCHEMA: FACTS_SCHEMA,
          FACT_STATUSES: FACT_STATUSES,
          SUPPORTED_FIELD_IDS: SUPPORTED_FIELD_IDS,
          extractDocumentFacts: extractDocumentFacts,
          factsFromRuleHits: factsFromRuleHits,
          mergeFactLists: mergeFactLists,
          syncFactParameters: syncFactParameters,
          validateExtractedFact: validateExtractedFact,
          validateFactBatch: validateFactBatch,
          planDocumentFactApply: planDocumentFactApply,
          previewRows: previewRows,
          scoreEvidenceLabels: scoreEvidenceLabels,
          createLocalOcrAdapter: createLocalOcrAdapter,
          isPriceFieldId: isPriceFieldId,
        };
      }
