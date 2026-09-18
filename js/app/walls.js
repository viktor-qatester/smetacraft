      // MODULE: ENGINE — WALLS
      // ==========================================
      function parseBlockSize(value) {
        const parts = String(value).split("x");
        return {
          length: Number(parts[0]) / 1000,
          thick: Number(parts[1]) / 1000,
          height: Number(parts[2]) / 1000,
        };
      }

      function brickFormat(code) {
        if (code === "14nf") {
          return { name: "1.4 НФ", length: 0.25, width: 0.12, height: 0.088 };
        }
        return { name: "1 НФ", length: 0.25, width: 0.12, height: 0.065 };
      }

      function brickWythes(thickM, brickWidth) {
        const pitch = brickWidth + BRICK_V_JOINT;
        return Math.max(1, Math.round((thickM + BRICK_V_JOINT) / pitch));
      }

      function wallLoadMaterialThickness(loadMaterial) {
        if (loadMaterial === "gas-silicate-400") {
          return 0.4;
        }
        if (loadMaterial === "ceramic-380" || loadMaterial === "brick-380") {
          return 0.38;
        }
        return 0.3;
      }

      function wallLoadMaterialLabel(loadMaterial) {
        if (loadMaterial === "gas-silicate-400") {
          return "газосиликатные 400 мм";
        }
        if (loadMaterial === "ceramic-380") {
          return "керамические 380 мм";
        }
        if (loadMaterial === "brick-380") {
          return "кирпичная кладка 380 мм";
        }
        return "газосиликатные 300 мм";
      }

      function isLintelOpeningType(type) {
        return type === "window" || type === "entry-door" || type === "interior-door";
      }

      function wallsLegacyMaterialFromUi() {
        const sel = document.getElementById("walls-load-bearing-material").value;
        if (sel === "gas-silicate-400") {
          return { material: "block", blockSize: "600x400x200", glueType: "bag" };
        }
        if (sel === "ceramic-380") {
          return { material: "block", blockSize: "600x380x200", glueType: "bag" };
        }
        if (sel === "brick-380") {
          return { material: "brick", brickFormat: "1nf", brickThick: 380, glueType: "bag" };
        }
        return { material: "block", blockSize: "600x300x200", glueType: "bag" };
      }

      function nextOpeningId() {
        openingSeq += 1;
        return openingSeq;
      }

      function syncOpeningSeq() {
        let max = 0;
        const nodes = wallsOpeningsBody.querySelectorAll("[data-opening-id]");
        for (let i = 0; i < nodes.length; i++) {
          const n = Number(nodes[i].getAttribute("data-opening-id"));
          if (n > max) {
            max = n;
          }
        }
        openingSeq = max;
      }

      function wallsOpeningRowTemplate(opts) {
        const options = opts || {};
        const id = options.id != null ? Number(options.id) : nextOpeningId();
        if (id > openingSeq) {
          openingSeq = id;
        }
        const locked = Boolean(options.locked);
        const type = options.type != null ? String(options.type) : "window";
        const width = options.width != null ? String(options.width) : "1.5";
        const height = options.height != null ? String(options.height) : "1.5";
        const count = options.count != null ? String(options.count) : "1";
        const tr = document.createElement("tr");
        tr.className = "opening-row";
        tr.id = "opening-row-" + id;
        tr.setAttribute("data-opening-id", String(id));
        if (locked) {
          tr.setAttribute("data-opening-locked", "true");
        }
        const typeCell = document.createElement("td");
        const select = document.createElement("select");
        select.id = "opening-type-" + id;
        select.className = "js-opening-type";
        [
          ["window", "Окно"],
          ["entry-door", "Входная дверь"],
          ["interior-door", "Межкомнатная дверь"],
        ].forEach(function (item) {
          const option = document.createElement("option");
          option.value = item[0];
          option.textContent = item[1];
          select.appendChild(option);
        });
        select.value = type;
        typeCell.appendChild(select);
        tr.appendChild(typeCell);
        [["width", width, "decimal", "0.1", "0.1"], ["height", height, "decimal", "0.1", "0.1"], ["count", count, "numeric", "1", "1"]].forEach(function (item) {
          const td = document.createElement("td");
          const input = document.createElement("input");
          input.id = "opening-" + item[0] + "-" + id;
          input.className = "js-opening-" + item[0];
          input.type = "number";
          input.setAttribute("inputmode", item[2]);
          input.setAttribute("step", item[3]);
          input.setAttribute("min", item[4]);
          input.setAttribute("autocomplete", "off");
          input.value = item[1];
          td.appendChild(input);
          tr.appendChild(td);
        });
        const actionCell = document.createElement("td");
        actionCell.className = "pile-action";
        const action = document.createElement(locked ? "span" : "button");
        action.className = locked ? "pile-locked" : "btn-text js-opening-del";
        if (!locked) {
          action.type = "button";
          action.setAttribute("aria-label", "Удалить проём");
        }
        action.textContent = locked ? "—" : "Удалить 🗑️";
        actionCell.appendChild(action);
        tr.appendChild(actionCell);
        return tr;
      }

      function getOpeningsData() {
        const rows = [];
        const nodes = wallsOpeningsBody.querySelectorAll(".opening-row");
        for (let i = 0; i < nodes.length; i++) {
          rows.push({
            id: Number(nodes[i].getAttribute("data-opening-id")),
            type: nodes[i].querySelector(".js-opening-type").value,
            width: parseNumber(nodes[i].querySelector(".js-opening-width").value),
            height: parseNumber(nodes[i].querySelector(".js-opening-height").value),
            count: parseNumber(nodes[i].querySelector(".js-opening-count").value),
          });
        }
        return rows;
      }

      function readWallPrices() {
        return {
          blockPrice: parseNumber(document.getElementById("wall-block-price").value),
          adhesivePrice: parseNumber(document.getElementById("wall-adhesive-price").value),
          meshPrice: parseNumber(document.getElementById("wall-mesh-price").value),
          partitionBlockPrice: parseNumber(document.getElementById("partition-block-price").value),
          concretePrice: parseNumber(document.getElementById("wall-concrete-price").value),
          workMasonryPrice: parseNumber(document.getElementById("wall-work-masonry-price").value),
          workPartitionPrice: parseNumber(document.getElementById("wall-work-partition-price").value),
          workArmopoyasPrice: parseNumber(document.getElementById("wall-work-armopoyas-price").value),
        };
      }

      function computeFoundationPerimeter() {
        const source = foundationFootprintSource();
        if (source === "strip") {
          return parseNumber(document.getElementById("strip-length").value);
        }
        const width = parseNumber(document.getElementById("width").value);
        const length = parseNumber(document.getElementById("length").value);
        if (Number.isFinite(width) && Number.isFinite(length)) {
          return 2 * (width + length);
        }
        return NaN;
      }

      function syncWallsPerimeterFromFoundation() {
        if (wallsPerimeterManual) {
          return;
        }
        const perimeter = computeFoundationPerimeter();
        if (Number.isFinite(perimeter) && perimeter > 0) {
          wallsPerimeterEl.value = String(perimeter);
        }
      }

      function syncWallsUi() {
        const armopoyasOn = wallsArmopoyasEl.checked;
        wallsArmopoyasBoxEl.classList.toggle("is-open", armopoyasOn);
        wallsArmopoyasBoxEl.setAttribute("aria-hidden", armopoyasOn ? "false" : "true");
        const partitionsOn = wallsPartitionsEl.checked;
        wallsPartitionsBoxEl.classList.toggle("is-open", partitionsOn);
        wallsPartitionsBoxEl.setAttribute("aria-hidden", partitionsOn ? "false" : "true");
      }

      function readOpeningRows() {
        const rows = [];
        const nodes = wallsOpeningsBody.querySelectorAll(".opening-row");
        for (let i = 0; i < nodes.length; i++) {
          const w = parseNumber(nodes[i].querySelector(".js-opening-width").value);
          const h = parseNumber(nodes[i].querySelector(".js-opening-height").value);
          const n = parseNumber(nodes[i].querySelector(".js-opening-count").value);
          const blank =
            String(nodes[i].querySelector(".js-opening-width").value).trim() === "" &&
            String(nodes[i].querySelector(".js-opening-height").value).trim() === "" &&
            String(nodes[i].querySelector(".js-opening-count").value).trim() === "";
          rows.push({ w: w, h: h, n: n, blank: blank });
        }
        return rows;
      }

      function summarizeOpenings(mode, areaRaw, listRows) {
        if (mode === "area") {
          return { area: areaRaw, lintelM: 0, count: 0, fromList: false };
        }
        let area = 0;
        let lintelM = 0;
        let count = 0;
        for (let i = 0; i < listRows.length; i++) {
          const row = listRows[i];
          if (row.blank) continue;
          area += row.w * row.h * row.n;
          lintelM += (row.w + 2 * LINTEL_BEARING) * row.n;
          count += row.n;
        }
        return { area: area, lintelM: lintelM, count: count, fromList: true };
      }

      function _calculateWallsLegacy(input) {
        if (isZeroSize(input.perimeter) || isZeroSize(input.height) || isZeroSize(input.thick)) {
          return { rows: [], total: 0, sGross: 0, sOpen: 0, sNet: 0, volume: 0 };
        }
        const sGross = input.perimeter * input.height;
        const sOpen = input.openings.area;
        const sNet = sGross - sOpen;
        const thick = input.thick;
        const volume = sNet * thick;
        const rowHeight = input.rowHeight;
        const nRows = Math.floor(input.height / rowHeight + 1e-9);
        const belts = Math.floor(nRows / WALL_ROWS_PER_BELT);
        const overlap = OVERLAP_DIAMETERS * (WALL_REBAR_MM / 1000);
        const kgM = kgPerMeter(WALL_REBAR_MM);
        const netMeters = belts * WALL_BARS_PER_BELT * input.perimeter;
        const metersWithLap =
          belts * WALL_BARS_PER_BELT * lengthWithSplices(input.perimeter, ROD_LENGTH, overlap);
        const rods = metersWithLap > 0 ? Math.ceil(metersWithLap / ROD_LENGTH) : 0;
        const orderKg = rods * ROD_LENGTH * kgM;
        const netKg = netMeters * kgM;
        const screwPcs = input.openings.count * FRAME_SCREWS_PER_OPENING;
        const screwPacks = screwPcs > 0 ? Math.ceil(screwPcs / SCREW_PACK) : 0;

        const rows = [];

        if (input.material === "block") {
          const blockFace = input.block.length * input.block.height;
          const blockVol = input.block.length * input.block.thick * input.block.height;
          const netPcs = sNet / blockFace;
          const orderPcs = Math.ceil(netPcs * (1 + WALL_CUT_RESERVE));
          const orderM3 = orderPcs * blockVol;
          const palletSize = Math.max(1, Math.round(PALLET_M3 / blockVol));
          const pallets = Math.ceil(orderPcs / palletSize);
          rows.push({
            name:
              "Газоблок " +
              Math.round(input.block.length * 1000) +
              "×" +
              Math.round(input.block.thick * 1000) +
              "×" +
              Math.round(input.block.height * 1000) +
              ", " +
              pallets +
              " подд. (" +
              formatQty(orderM3, 3) +
              " м³)",
            netLabel: formatQty(netPcs, 1) + " шт",
            k: 1 + WALL_CUT_RESERVE,
            orderLabel: String(orderPcs) + " шт",
            cost: orderPcs * input.blockPrice,
          });

          if (input.glueType === "foam") {
            const foamNet = sNet / FOAM_M2_PER_CAN;
            const foamOrder = Math.ceil((sNet * (1 + WALL_CUT_RESERVE)) / FOAM_M2_PER_CAN);
            rows.push({
              name: "Клей-пена для блоков, баллон",
              netLabel: formatQty(foamNet, 2) + " бал.",
              k: 1 + WALL_CUT_RESERVE,
              orderLabel: String(foamOrder) + " бал.",
              cost: foamOrder * input.gluePrice,
            });
          } else {
            const glueNetKg = volume * GLUE_KG_PER_M3;
            const glueOrderKg = glueNetKg * (1 + WALL_CUT_RESERVE);
            const bags = Math.ceil(glueOrderKg / GLUE_BAG_KG);
            rows.push({
              name: "Клей для блоков, мешок 25 кг",
              netLabel: formatQty(glueNetKg, 1) + " кг",
              k: 1 + WALL_CUT_RESERVE,
              orderLabel: String(bags) + " меш.",
              cost: bags * input.gluePrice,
            });
          }
        } else {
          const brick = input.brick;
          const wythes = brickWythes(thick, brick.width);
          const effL = brick.length + BRICK_V_JOINT;
          const effH = brick.height + BRICK_H_JOINT;
          const netPcs = (sNet * wythes) / (effL * effH);
          const orderPcs = Math.ceil(netPcs * (1 + WALL_CUT_RESERVE));
          const brickSolid = brick.length * brick.width * brick.height;
          const mortarNet = Math.max(0, volume - netPcs * brickSolid);
          const mortarOrder = mortarNet * (1 + WALL_CUT_RESERVE);
          const mortarBags = Math.ceil((mortarOrder * MORTAR_DRY_KG_PER_M3) / MORTAR_BAG_KG);
          const meshNet = input.perimeter * thick * belts;

          rows.push({
            name: "Кирпич " + brick.name + ", стена " + Math.round(thick * 1000) + " мм",
            netLabel: formatQty(netPcs, 1) + " шт",
            k: 1 + WALL_CUT_RESERVE,
            orderLabel: String(orderPcs) + " шт",
            cost: orderPcs * input.brickPrice,
          });

          rows.push({
            name: "Кладочный раствор ЦПС, мешок 25 кг",
            netLabel: formatQty(mortarNet, 3) + " м³",
            k: 1 + WALL_CUT_RESERVE,
            orderLabel: String(mortarBags) + " меш.",
            cost: mortarBags * input.mortarPrice,
          });

          if (meshNet > 0) {
            rows.push({
              name: "Сетка кладочная перевязки",
              netLabel: formatQty(meshNet, 2) + " м²",
              k: 1,
              orderLabel: formatQty(meshNet, 2) + " м²",
              cost: meshNet * input.meshPrice,
            });
          }
        }

        if (belts > 0) {
          rows.push({
            name:
              "Арматура штроб Ø8 мм, 2 прутка × " +
              belts +
              " пояса, " +
              rods +
              " шт. × 11.7 м",
            netLabel: formatQty(netKg, 1) + " кг",
            k: netKg > 0 ? orderKg / netKg : 1,
            orderLabel: formatQty(orderKg, 1) + " кг",
            cost: orderKg * input.rebarPrice,
          });
        }

        if (input.openings.lintelM > 0) {
          rows.push({
            name:
              "Перемычки над проёмами, " +
              formatQty(input.openings.count, 0) +
              " шт. (опирание 2×250 мм)",
            netLabel: formatQty(input.openings.lintelM, 2) + " м",
            k: 1,
            orderLabel: formatQty(input.openings.lintelM, 2) + " м",
            cost: input.openings.lintelM * input.lintelPrice,
          });
        }

        if (screwPacks > 0) {
          rows.push({
            name: "Дюбели рамные, 8 шт./проём",
            netLabel: String(screwPcs) + " шт",
            k: 1,
            orderLabel: String(screwPacks) + " упак.",
            cost: screwPacks * input.screwPrice,
          });
        }

        const total = rows.reduce(function (sum, item) {
          return sum + item.cost;
        }, 0);

        return {
          rows: rows,
          total: total,
          sGross: sGross,
          sOpen: sOpen,
          sNet: sNet,
          volume: volume,
        };
      }

      function _readWallsFormLegacy() {
        const mat = wallsLegacyMaterialFromUi();
        const block = mat.material === "block" ? parseBlockSize(mat.blockSize) : parseBlockSize("600x300x200");
        const brick = brickFormat(mat.brickFormat || "1nf");
        const brickThick = mat.material === "brick" ? mat.brickThick / 1000 : 0;
        const openingRows = readOpeningRows();
        const openings = summarizeOpenings("list", 0, openingRows);
        return {
          perimeter: parseNumber(document.getElementById("walls-perimeter").value),
          height: parseNumber(document.getElementById("walls-height").value),
          material: mat.material,
          block: block,
          brick: brick,
          thick: mat.material === "block" ? block.thick : brickThick,
          rowHeight: mat.material === "block" ? block.height : brick.height + BRICK_H_JOINT,
          glueType: mat.glueType,
          blockPrice: parseNumber(document.getElementById("walls-block-price").value),
          gluePrice: parseNumber(document.getElementById("walls-glue-price").value),
          brickPrice: parseNumber(document.getElementById("walls-brick-price").value),
          mortarPrice: parseNumber(document.getElementById("walls-mortar-price").value),
          meshPrice: parseNumber(document.getElementById("walls-mesh-price").value),
          rebarPrice: parseNumber(document.getElementById("walls-rebar-price").value),
          lintelPrice: parseNumber(document.getElementById("walls-lintel-price").value),
          screwPrice: parseNumber(document.getElementById("walls-screw-price").value),
          openings: openings,
          openingMode: "list",
          openingRows: openingRows,
        };
      }

      function readWallsForm() {
        return {
          perimeter: parseNumber(document.getElementById("walls-perimeter").value),
          loadMaterial: document.getElementById("walls-load-bearing-material").value,
          height: parseNumber(document.getElementById("walls-height").value),
          jointMm: parseNumber(document.getElementById("walls-joint-mm").value),
          reinforceMesh: document.getElementById("walls-reinforce-mesh").checked,
          openings: getOpeningsData(),
          armopoyas: document.getElementById("walls-armopoyas").checked,
          armopoyasWidthMm: parseNumber(document.getElementById("wall-armopoyas-width").value),
          armopoyasHeightMm: parseNumber(document.getElementById("wall-armopoyas-height").value),
          armopoyasRebarMm: parseNumber(document.getElementById("walls-armopoyas-rebar").value),
          lintels: document.getElementById("walls-lintels").checked,
          partitionsEnabled: document.getElementById("walls-partitions-enabled").checked,
          partitionMaterial: document.getElementById("walls-partition-material").value,
          partitionLength: parseNumber(document.getElementById("walls-partition-length").value),
          partitionHeight: parseNumber(document.getElementById("walls-partition-height").value),
          prices: readWallPrices(),
          stripRebarPrice: parseNumber(document.getElementById("strip-rebar-price").value),
        };
      }

      function validateWallsEngine(input) {
        if (!(input.perimeter > 0 && input.height > 0)) {
          return "Введите периметр и высоту стен больше нуля.";
        }
        const prices = input.prices || {};
        if (!(prices.blockPrice > 0 && prices.adhesivePrice > 0)) {
          return "Введите цены стеновых блоков и клея больше нуля.";
        }
        if (!(prices.workMasonryPrice > 0)) {
          return "Введите цену кладки несущих стен больше нуля.";
        }
        if (input.reinforceMesh && !(prices.meshPrice > 0)) {
          return "Введите цену армирующей сетки больше нуля.";
        }
        if ((input.armopoyas || input.lintels) && !(prices.concretePrice > 0)) {
          return "Введите цену бетона для армопояса и перемычек больше нуля.";
        }
        if ((input.armopoyas || input.lintels) && !(input.stripRebarPrice > 0)) {
          return "Введите цену арматуры в прайсе ленточного фундамента больше нуля.";
        }
        if ((input.armopoyas || input.lintels) && !(prices.workArmopoyasPrice > 0)) {
          return "Введите цену работ по армопоясу и перемычкам больше нуля.";
        }
        if (input.armopoyas) {
          if (!(input.armopoyasWidthMm > 0 && input.armopoyasHeightMm > 0)) {
            return "Введите ширину и высоту армопояса больше нуля.";
          }
        }
        if (input.partitionsEnabled) {
          if (!(input.partitionLength > 0 && input.partitionHeight > 0)) {
            return "Введите длину и высоту перегородок больше нуля.";
          }
          if (!(prices.partitionBlockPrice > 0 && prices.workPartitionPrice > 0)) {
            return "Введите цены перегородочных блоков и кладки перегородок больше нуля.";
          }
        }

        let openingArea = 0;
        for (let i = 0; i < input.openings.length; i++) {
          const row = input.openings[i];
          if (!(row.width > 0 && row.height > 0 && row.count >= 1 && Number.isInteger(row.count))) {
            return "У каждого проёма ширина, высота > 0 и целое количество от 1.";
          }
          if (row.width >= input.perimeter) {
            return "Ширина проёма не должна превышать периметр стен.";
          }
          if (row.height > input.height) {
            return "Высота проёма не должна превышать высоту стен.";
          }
          openingArea += row.width * row.height * row.count;
        }
        if (openingArea > input.perimeter * input.height) {
          return "Площадь проёмов больше площади стен.";
        }

        const D = wallLoadMaterialThickness(input.loadMaterial);
        const vGross = input.perimeter * input.height * D;
        let vOpTotal = 0;
        for (let j = 0; j < input.openings.length; j++) {
          const op = input.openings[j];
          vOpTotal += op.width * op.height * op.count * D;
        }
        let vBeltDisplace = 0;
        if (input.armopoyas) {
          const beltW = input.armopoyasWidthMm / 1000;
          const beltH = input.armopoyasHeightMm / 1000;
          if (!(beltW > 0 && beltH > 0)) {
            return "Введите ширину и высоту армопояса больше нуля.";
          }
          vBeltDisplace = input.perimeter * beltW * beltH;
        }
        let vLintelDisplace = 0;
        if (input.lintels) {
          for (let k = 0; k < input.openings.length; k++) {
            const lintelOp = input.openings[k];
            if (!isLintelOpeningType(lintelOp.type)) {
              continue;
            }
            vLintelDisplace += (lintelOp.width + 0.4) * 0.2 * D * lintelOp.count;
          }
        }
        const vNet = vGross - vOpTotal - vBeltDisplace - vLintelDisplace;
        if (!(vNet > 0)) {
          return "После вычета проёмов и железобетона чистый объём кладки должен быть больше нуля.";
        }
        return "";
      }

      // Phase 4B: use the extracted walls calculator.
      var calculateWalls = SmetaCraftWallsCore.createCalculator({
        formatQty, isZeroSize, wallLoadMaterialThickness, wallLoadMaterialLabel, isLintelOpeningType
      });

      function validateWalls(input) {
        if (!(input.perimeter > 0 && input.height > 0)) {
          return "Введите периметр и высоту стен больше нуля.";
        }
        if (!(input.thick > 0 && input.rowHeight > 0)) {
          return "Проверьте размер блока или толщину кирпичной стены.";
        }
        if (input.openingMode === "area") {
          if (!(input.openings.area >= 0)) {
            return "Введите площадь проёмов ноль или больше.";
          }
        } else {
          for (let i = 0; i < input.openingRows.length; i++) {
            const row = input.openingRows[i];
            if (row.blank) continue;
            if (!(row.w > 0 && row.h > 0 && row.n >= 1 && Number.isInteger(row.n))) {
              return "У каждого проёма ширина, высота > 0 и целое количество от 1.";
            }
            if (row.w >= input.perimeter || row.h > input.height) {
              return "Габарит проёма не должен превышать периметр или высоту стен.";
            }
          }
        }
        if (input.openings.area > input.perimeter * input.height) {
          return "Площадь проёмов больше площади стен.";
        }
        if (input.perimeter * input.height - input.openings.area <= 0) {
          return "После вычета проёмов площадь кладки должна быть больше нуля.";
        }
        if (input.material === "block") {
          if (!(input.blockPrice > 0 && input.gluePrice > 0)) {
            return "Введите цены блока и клея больше нуля.";
          }
        } else if (!(input.brickPrice > 0 && input.mortarPrice > 0 && input.meshPrice > 0)) {
          return "Введите цены кирпича, раствора и сетки больше нуля.";
        }
        if (!(input.rebarPrice > 0 && input.lintelPrice > 0 && input.screwPrice > 0)) {
          return "Введите цены арматуры, перемычек и крепежа больше нуля.";
        }
        return "";
      }

      // ==========================================

      function bindWallsEvents() {
      wallsArmopoyasEl.addEventListener("change", syncWallsUi);
      wallsPartitionsEl.addEventListener("change", syncWallsUi);

      wallsPerimeterEl.addEventListener("input", function () {
        wallsPerimeterManual = true;
      });

      document.getElementById("walls-add-opening").addEventListener("click", function () {
        wallsOpeningsBody.appendChild(
          wallsOpeningRowTemplate({
            locked: false,
            type: "window",
            width: "1.5",
            height: "1.5",
            count: "1",
          })
        );
        saveToLocalStorage();
      });

      wallsForm.addEventListener("click", function (event) {
        const del = event.target.closest(".js-opening-del");
        if (!del) {
          return;
        }
        const row = del.closest("tr.opening-row");
        if (!row || row.getAttribute("data-opening-locked") === "true") {
          return;
        }
        row.remove();
        saveToLocalStorage();
      });

      wallsForm.addEventListener("input", function () {
        syncWallsUi();
        saveToLocalStorage();
      });
      wallsForm.addEventListener("change", function () {
        syncWallsUi();
        saveToLocalStorage();
      });
      wallsForm.addEventListener("submit", function (event) {
        event.preventDefault();
        render();
      });

      }

      function renderWalls() {
        syncWallsUi();
        const input = readWallsForm();

        if (wallsIsEmpty(input)) {
          showZeroBill("Стены не заданы — введите периметр и высоту.");
          return;
        }

        const message = validateWallsEngine(input);

        if (message) {
          showBillError(message, wallsErrorEl);
          return;
        }

        const bill = calculateWalls(input);
        showBill(bill.rows, bill.total, bill.meta);
      }
