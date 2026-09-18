// Phase 4B: pure walls calculation. UI and validation remain in index.html.
(function (root) {
  "use strict";
  root.SmetaCraftWallsCore = Object.freeze({
    createCalculator: function (deps) {
      const { formatQty, isZeroSize, wallLoadMaterialThickness, wallLoadMaterialLabel, isLintelOpeningType } = deps;

      function calculateWalls(input) {
        if (isZeroSize(input.perimeter) || isZeroSize(input.height)) {
          return {
            rows: [],
            total: 0,
            meta: "Стены не заданы",
            vGross: 0,
            vNet: 0,
            sOpTotal: 0,
            vOpTotal: 0,
          };
        }
        const P = input.perimeter;
        const H = input.height;
        const D = wallLoadMaterialThickness(input.loadMaterial);
        const prices = input.prices;
        const rebarPriceKg = input.stripRebarPrice;
        const reserve = 1.05;
        const rows = [];

        let sOpTotal = 0;
        let vOpTotal = 0;
        for (let i = 0; i < input.openings.length; i++) {
          const op = input.openings[i];
          const sOp = op.width * op.height * op.count;
          sOpTotal += sOp;
          vOpTotal += sOp * D;
        }

        let vBeltDisplace = 0;
        let beltConcreteNet = 0;
        let beltConcreteOrder = 0;
        let beltRebarA3Kg = 0;
        let beltStirrupKg = 0;
        let beltWorkM = 0;
        const beltWm = input.armopoyasWidthMm / 1000;
        const beltHm = input.armopoyasHeightMm / 1000;
        if (input.armopoyas) {
          vBeltDisplace = P * beltWm * beltHm;
          beltConcreteNet = vBeltDisplace;
          beltConcreteOrder = beltConcreteNet * reserve;
          const beltRebarLen = P * 4 * reserve;
          beltRebarA3Kg = beltRebarLen * 0.888;
          const stirrupCount = Math.ceil(P / 0.25);
          const stirrupUnitLen = 2 * (beltWm - 0.1) + 2 * (beltHm - 0.1) + 0.1;
          const stirrupTotalLen = stirrupCount * stirrupUnitLen * reserve;
          beltStirrupKg = stirrupTotalLen * 0.222;
          beltWorkM = P;
        }

        let vLintelDisplace = 0;
        let lintelConcreteNet = 0;
        let lintelConcreteOrder = 0;
        let lintelRebarLenNet = 0;
        let lintelRebarLenOrder = 0;
        let lintelWorkM = 0;
        if (input.lintels) {
          for (let j = 0; j < input.openings.length; j++) {
            const lintelOp = input.openings[j];
            if (!isLintelOpeningType(lintelOp.type)) {
              continue;
            }
            const lintelSpan = lintelOp.width + 0.4;
            vLintelDisplace += lintelSpan * 0.2 * D * lintelOp.count;
            lintelRebarLenNet += lintelSpan * 4 * lintelOp.count;
            lintelWorkM += lintelSpan * lintelOp.count;
          }
          lintelConcreteNet = vLintelDisplace;
          lintelConcreteOrder = vLintelDisplace * reserve;
          lintelRebarLenOrder = lintelRebarLenNet * reserve;
        }

        const vGross = P * H * D;
        const vNet = vGross - vOpTotal - vBeltDisplace - vLintelDisplace;
        const vBlocksOrder = vNet * reserve;
        const glueBagsNet = vNet * 1.2;
        const glueBags = Math.ceil(glueBagsNet);

        let meshLenNet = 0;
        let meshLenOrder = 0;
        if (input.reinforceMesh) {
          const blockRows = Math.ceil(H / 0.25);
          const armoredRows = Math.floor(blockRows / 4);
          meshLenNet = P * 2 * armoredRows;
          meshLenOrder = meshLenNet * reserve;
        }

        const blockDeductionParts = [
          "проёмы " + formatQty(vOpTotal, 2) + " м³",
        ];
        if (input.armopoyas && vBeltDisplace > 0) {
          blockDeductionParts.push("армопояс " + formatQty(vBeltDisplace, 2) + " м³");
        }
        if (input.lintels && vLintelDisplace > 0) {
          blockDeductionParts.push("перемычки " + formatQty(vLintelDisplace, 2) + " м³");
        }
        rows.push({
          name:
            "Стеновые блоки " +
            wallLoadMaterialLabel(input.loadMaterial) +
            " (грязный объём " +
            formatQty(vGross, 2) +
            " м³ − " +
            blockDeductionParts.join(" − ") +
            "): " +
            formatQty(vNet, 2) +
            " м³",
          netLabel: formatQty(vNet, 2) + " м³",
          k: reserve,
          orderLabel: formatQty(vBlocksOrder, 2) + " м³",
          cost: vBlocksOrder * prices.blockPrice,
        });

        rows.push({
          name: "Клей для блоков (расход 1,2 мешка/м³): " + glueBags + " меш.",
          netLabel: formatQty(glueBagsNet, 1) + " меш.",
          k: 1,
          orderLabel: String(glueBags) + " меш.",
          cost: glueBags * prices.adhesivePrice,
        });

        if (input.reinforceMesh && meshLenOrder > 0) {
          rows.push({
            name:
              "Армирующая сетка (2 полосы × " +
              Math.floor(Math.ceil(H / 0.25) / 4) +
              " рядов): " +
              formatQty(meshLenOrder, 1) +
              " м.п.",
            netLabel: formatQty(meshLenNet, 1) + " м.п.",
            k: reserve,
            orderLabel: formatQty(meshLenOrder, 1) + " м.п.",
            cost: meshLenOrder * prices.meshPrice,
          });
        }

        const concreteNet = beltConcreteNet + lintelConcreteNet;
        const concreteOrder = beltConcreteOrder + lintelConcreteOrder;
        if (concreteOrder > 0) {
          const concreteParts = [];
          if (beltConcreteNet > 0) {
            concreteParts.push("армопояс " + formatQty(beltConcreteNet, 2) + " м³");
          }
          if (lintelConcreteNet > 0) {
            concreteParts.push("перемычки " + formatQty(lintelConcreteNet, 2) + " м³");
          }
          rows.push({
            name: "Бетон М250 (" + concreteParts.join(" + ") + "): " + formatQty(concreteOrder, 2) + " м³",
            netLabel: formatQty(concreteNet, 2) + " м³",
            k: reserve,
            orderLabel: formatQty(concreteOrder, 2) + " м³",
            cost: concreteOrder * prices.concretePrice,
          });
        }

        const lintelRebarA3Kg = lintelRebarLenOrder * 0.888;
        const rebarA3Kg = beltRebarA3Kg + lintelRebarA3Kg;
        if (rebarA3Kg > 0) {
          const rebarParts = [];
          if (beltRebarA3Kg > 0) {
            rebarParts.push("армопояс " + formatQty(beltRebarA3Kg, 0) + " кг");
          }
          if (lintelRebarA3Kg > 0) {
            rebarParts.push("перемычки " + formatQty(lintelRebarA3Kg, 0) + " кг");
          }
          rows.push({
            name:
              "Арматура А3 Ø12 мм (" +
              rebarParts.join(" + ") +
              "): " +
              formatQty(rebarA3Kg / 1000, 3) +
              " т",
            netLabel: formatQty(rebarA3Kg, 1) + " кг",
            k: reserve,
            orderLabel: formatQty(rebarA3Kg / 1000, 3) + " т",
            cost: rebarA3Kg * rebarPriceKg,
          });
        }

        if (beltStirrupKg > 0) {
          rows.push({
            name:
              "Арматура А1 Ø6 мм (хомуты армопояса): " + formatQty(beltStirrupKg / 1000, 3) + " т",
            netLabel: formatQty(beltStirrupKg, 1) + " кг",
            k: reserve,
            orderLabel: formatQty(beltStirrupKg / 1000, 3) + " т",
            cost: beltStirrupKg * rebarPriceKg,
          });
        }

        rows.push({
          name: "Кладка несущих стен: " + formatQty(vNet, 2) + " м³",
          netLabel: formatQty(vNet, 2) + " м³",
          k: 1,
          orderLabel: formatQty(vNet, 2) + " м³",
          cost: vNet * prices.workMasonryPrice,
        });

        const rbWorkM = beltWorkM + lintelWorkM;
        if (rbWorkM > 0) {
          const workParts = [];
          if (beltWorkM > 0) {
            workParts.push("армопояс " + formatQty(beltWorkM, 1) + " м.п.");
          }
          if (lintelWorkM > 0) {
            workParts.push("перемычки " + formatQty(lintelWorkM, 1) + " м.п.");
          }
          rows.push({
            name: "Устройство армопояса и перемычек (" + workParts.join(" + ") + ")",
            netLabel: formatQty(rbWorkM, 1) + " м.п.",
            k: 1,
            orderLabel: formatQty(rbWorkM, 1) + " м.п.",
            cost: rbWorkM * prices.workArmopoyasPrice,
          });
        }

        if (input.partitionsEnabled) {
          const dPart = input.partitionMaterial === "brick-edge-120" ? 0.12 : 0.1;
          const partLabel =
            input.partitionMaterial === "brick-edge-120"
              ? "кирпич на ребро 120 мм"
              : "перегородочный блок 100 мм";
          const vPartNet = input.partitionLength * input.partitionHeight * dPart;
          const vPartOrder = vPartNet * reserve;
          const partGlueNet = vPartNet * 1.5;
          const partGlueBags = Math.ceil(partGlueNet);
          const partArea = input.partitionLength * input.partitionHeight;

          rows.push({
            name:
              "Перегородочные блоки " +
              partLabel +
              " (" +
              formatQty(input.partitionLength, 1) +
              " × " +
              formatQty(input.partitionHeight, 1) +
              " × " +
              formatQty(dPart, 2) +
              " м): " +
              formatQty(vPartOrder, 2) +
              " м³",
            netLabel: formatQty(vPartNet, 2) + " м³",
            k: reserve,
            orderLabel: formatQty(vPartOrder, 2) + " м³",
            cost: vPartOrder * prices.partitionBlockPrice,
          });
          rows.push({
            name: "Клей для перегородок (расход 1,5 мешка/м³): " + partGlueBags + " меш.",
            netLabel: formatQty(partGlueNet, 1) + " меш.",
            k: 1,
            orderLabel: String(partGlueBags) + " меш.",
            cost: partGlueBags * prices.adhesivePrice,
          });
          rows.push({
            name: "Кладка перегородок: " + formatQty(partArea, 1) + " м²",
            netLabel: formatQty(partArea, 1) + " м²",
            k: 1,
            orderLabel: formatQty(partArea, 1) + " м²",
            cost: partArea * prices.workPartitionPrice,
          });
        }

        const total = rows.reduce(function (sum, item) {
          return sum + item.cost;
        }, 0);

        return {
          rows: rows,
          total: total,
          meta:
            "Стены " +
            formatQty(P, 1) +
            " × " +
            formatQty(H, 1) +
            " м · " +
            wallLoadMaterialLabel(input.loadMaterial) +
            " · чистая кладка " +
            formatQty(vNet, 2) +
            " м³ · проёмы " +
            formatQty(sOpTotal, 2) +
            " м²",
          vGross: vGross,
          vNet: vNet,
          sOpTotal: sOpTotal,
          vOpTotal: vOpTotal,
        };
      }

      return calculateWalls;
    }
  });
})(globalThis);
