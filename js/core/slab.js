// Phase 4F: pure slab calculation, moved without formula changes.
(function (root) {
  "use strict";
  root.SmetaCraftSlabCore = Object.freeze({
    createCalculator: function (deps) {
      const {
        BOARD_LENGTH, BOARD_THICK, BOARD_WIDTH, COMPACTION, CONCRETE_RESERVE,
        HYDRO_OVERLAP, OVERLAP_DIAMETERS, ROD_LENGTH, ROLL_AREA, STAKE_EXTRA,
        STAKE_SPACING, TIMBER_SIZE, TIMBER_STOCK, WIRE_RATE, formatQty,
        isZeroSize, kgPerMeter, barCount, lengthWithSplices
      } = deps;

      function calculateSlab(input) {
        if (isZeroSize(input.length) || isZeroSize(input.width) || isZeroSize(input.height)) {
          return { rows: [], total: 0, perimeter: 0, area: 0 };
        }
        const area = input.length * input.width;
        const perimeter = 2 * (input.length + input.width);
        const volume = area * input.height;
        const overlap = OVERLAP_DIAMETERS * (input.diameterMm / 1000);
        const stepM = input.stepMm / 1000;

        const nAlongLength = barCount(input.width, stepM) * input.meshCount;
        const nAlongWidth = barCount(input.length, stepM) * input.meshCount;
        const netMeters =
          nAlongLength * input.length + nAlongWidth * input.width;
        const metersWithLap =
          nAlongLength * lengthWithSplices(input.length, ROD_LENGTH, overlap) +
          nAlongWidth * lengthWithSplices(input.width, ROD_LENGTH, overlap);
        const rods = Math.ceil(metersWithLap / ROD_LENGTH);
        const purchasedMeters = rods * ROD_LENGTH;
        const kgM = kgPerMeter(input.diameterMm);
        const netKg = netMeters * kgM;
        const orderKg = purchasedMeters * kgM;
        const wireKg = orderKg * WIRE_RATE;

        const boardRows = Math.ceil(input.height / BOARD_WIDTH);
        const boardsAlong = Math.ceil(perimeter / BOARD_LENGTH);
        const boardCount = boardRows * boardsAlong;
        const boardM3 = boardCount * BOARD_THICK * BOARD_WIDTH * BOARD_LENGTH;

        const stakeCount = Math.ceil(perimeter / STAKE_SPACING);
        const stakeLength = input.height + STAKE_EXTRA;
        const timberCount = Math.ceil((stakeCount * stakeLength) / TIMBER_STOCK);
        const timberM3 = timberCount * TIMBER_SIZE * TIMBER_SIZE * TIMBER_STOCK;

        const rows = [];

        rows.push({
          name: "Бетон " + input.grade,
          netLabel: formatQty(volume, 2) + " м³",
          k: 1 + CONCRETE_RESERVE,
          orderLabel: formatQty(volume * (1 + CONCRETE_RESERVE), 2) + " м³",
          cost: volume * (1 + CONCRETE_RESERVE) * input.concretePrice,
        });

        rows.push({
          name: "Арматура Ø" + input.diameterMm + " мм, " + rods + " шт. × 11.7 м",
          netLabel: formatQty(netKg, 1) + " кг",
          k: netKg > 0 ? orderKg / netKg : 1,
          orderLabel: formatQty(orderKg, 1) + " кг",
          cost: orderKg * input.rebarPrice,
        });

        rows.push({
          name: "Вязальная проволока",
          netLabel: formatQty(wireKg, 2) + " кг",
          k: 1,
          orderLabel: formatQty(wireKg, 2) + " кг",
          cost: wireKg * input.wirePrice,
        });

        rows.push({
          name: "Доска 25×150×6000 (" + formatQty(boardM3, 3) + " м³)",
          netLabel: String(boardCount) + " шт",
          k: 1,
          orderLabel: String(boardCount) + " шт",
          cost: boardCount * input.boardPrice,
        });

        rows.push({
          name: "Брус упоров 50×50×3000 (" + formatQty(timberM3, 3) + " м³)",
          netLabel: String(timberCount) + " шт",
          k: 1,
          orderLabel: String(timberCount) + " шт",
          cost: timberCount * input.timberPrice,
        });

        if (input.sandHeight > 0) {
          const sandNet = area * input.sandHeight;
          const sandOrder = sandNet * COMPACTION;
          rows.push({
            name: "Песок",
            netLabel: formatQty(sandNet, 2) + " м³",
            k: COMPACTION,
            orderLabel: formatQty(sandOrder, 2) + " м³",
            cost: sandOrder * input.sandPrice,
          });
        }

        if (input.stoneHeight > 0) {
          const stoneNet = area * input.stoneHeight;
          const stoneOrder = stoneNet * COMPACTION;
          rows.push({
            name: "Щебень",
            netLabel: formatQty(stoneNet, 2) + " м³",
            k: COMPACTION,
            orderLabel: formatQty(stoneOrder, 2) + " м³",
            cost: stoneOrder * input.stonePrice,
          });
        }

        const hydroNet = area;
        const hydroOrderArea = hydroNet * (1 + HYDRO_OVERLAP);
        const rolls = Math.ceil(hydroOrderArea / ROLL_AREA);
        rows.push({
          name: "Гидроизоляция, рулон 1×10 м",
          netLabel: formatQty(hydroNet, 2) + " м²",
          k: 1 + HYDRO_OVERLAP,
          orderLabel: String(rolls) + " рул.",
          cost: rolls * input.hydroPrice,
        });

        const total = rows.reduce(function (sum, item) {
          return sum + item.cost;
        }, 0);

        return { rows: rows, total: total, perimeter: perimeter, area: area };
      }

      return calculateSlab;
    }
  });
})(globalThis);
