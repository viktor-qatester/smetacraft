// Phase 4A: pure strip and pile calculation. The host supplies existing
// constants and math/format helpers; this file never reads DOM or storage.
(function (root) {
  "use strict";

  root.SmetaCraftStripCore = Object.freeze({
    createCalculator: function (deps) {
      const {
        BOARD_LENGTH, BOARD_THICK, BOARD_WIDTH, COMPACTION, CONCRETE_RESERVE,
        COVER, HOOK_DIAMETERS, HOOK_MIN, HYDRO_OVERLAP, OVERLAP_DIAMETERS,
        PILE_CONCRETE_LOSS, PILE_LONG_BARS, PILE_LONG_KG_M, PILE_REBAR_RESERVE,
        PILE_ROSTRVERK, PILE_RUBEROID_RESERVE, PILE_STIRRUP_INNER,
        PILE_STIRRUP_KG_M, PILE_STIRRUP_STEP, PILE_WIRE_KG_NODE, PILE_WIRE_NODES,
        ROD_LENGTH, ROLL_AREA, STAKE_EXTRA, STAKE_SPACING, TIMBER_SIZE,
        TIMBER_STOCK, WIRE_RATE, formatQty, isZeroSize, kgPerMeter, barCount,
        lengthWithSplices, stirrupBarLength
      } = deps;

      // ==========================================
      // MODULE: ENGINE — PILES
      // ==========================================
      function computePileTotals(piles) {
        const totals = {
          concreteNet: 0,
          concreteOrder: 0,
          longNetM: 0,
          longOrderM: 0,
          longNetKg: 0,
          longOrderKg: 0,
          stirrupNetM: 0,
          stirrupOrderM: 0,
          stirrupNetKg: 0,
          stirrupOrderKg: 0,
          wireKg: 0,
          ruberoidNet: 0,
          ruberoidOrder: 0,
          drillingM: 0,
          pileCount: 0,
        };

        for (let i = 0; i < piles.length; i++) {
          const group = piles[i];
          const dM = group.diameterMm / 1000;
          const hM = group.depthM;
          const n = group.count;
          if (!(dM > 0 && hM > 0 && n > 0)) {
            continue;
          }

          const concreteNet = Math.PI * Math.pow(dM / 2, 2) * hM * n;
          totals.concreteNet += concreteNet;
          totals.concreteOrder += concreteNet * (1 + PILE_CONCRETE_LOSS);

          const longNetM = (hM + PILE_ROSTRVERK) * PILE_LONG_BARS * n;
          const longOrderM = longNetM * (1 + PILE_REBAR_RESERVE);
          totals.longNetM += longNetM;
          totals.longOrderM += longOrderM;
          totals.longNetKg += longNetM * PILE_LONG_KG_M;
          totals.longOrderKg += longOrderM * PILE_LONG_KG_M;

          const stirrupsPerPile = Math.floor(hM / PILE_STIRRUP_STEP) + 1;
          const stirrupLen = Math.PI * (dM - PILE_STIRRUP_INNER);
          const stirrupNetM = stirrupLen * stirrupsPerPile * n;
          const stirrupOrderM = stirrupNetM * (1 + PILE_REBAR_RESERVE);
          totals.stirrupNetM += stirrupNetM;
          totals.stirrupOrderM += stirrupOrderM;
          totals.stirrupNetKg += stirrupNetM * PILE_STIRRUP_KG_M;
          totals.stirrupOrderKg += stirrupOrderM * PILE_STIRRUP_KG_M;

          totals.wireKg += PILE_WIRE_NODES * stirrupsPerPile * n * PILE_WIRE_KG_NODE;

          const ruberoidNet = Math.PI * dM * hM * n;
          totals.ruberoidNet += ruberoidNet;
          totals.ruberoidOrder += ruberoidNet * (1 + PILE_RUBEROID_RESERVE);

          totals.drillingM += hM * n;
          totals.pileCount += n;
        }

        return totals;
      }

      function pileTotalsCost(totals, prices) {
        return {
          concrete: totals.concreteOrder * prices.pileConcretePrice,
          longRebar: totals.longOrderKg * prices.rebarPrice,
          stirrupRebar: totals.stirrupOrderKg * prices.rebarPrice,
          wire: totals.wireKg * prices.wirePrice,
          ruberoid: totals.ruberoidOrder * prices.pileHydroPrice,
          drilling: totals.drillingM * prices.pileDrillingPrice,
        };
      }

      // ==========================================
      // MODULE: ENGINE — STRIP
      // ==========================================
      function calculateStrip(input) {
        if (isZeroSize(input.length) || isZeroSize(input.width) || isZeroSize(input.height)) {
          return {
            rows: [],
            total: 0,
            volume: 0,
            formLength: 0,
            stirrupN: 0,
            pileTotals: null,
          };
        }
        const volume = input.length * input.width * input.height;
        const overlap = OVERLAP_DIAMETERS * (input.diameterMm / 1000);
        const kgLong = kgPerMeter(input.diameterMm);
        const netMeters = input.barCount * input.length;
        const metersWithLap =
          input.barCount * lengthWithSplices(input.length, ROD_LENGTH, overlap);
        const rods = Math.ceil(metersWithLap / ROD_LENGTH);
        const purchasedMeters = rods * ROD_LENGTH;
        const netKg = netMeters * kgLong;
        const orderKg = purchasedMeters * kgLong;

        const stepM = input.stirrupStepMm / 1000;
        const stirrupLen = stirrupBarLength(
          input.width,
          input.height,
          COVER,
          input.stirrupMm
        );
        const stirrupN = barCount(input.length, stepM);
        const kgStirrup = kgPerMeter(input.stirrupMm);
        const stirrupNetM = stirrupN * stirrupLen;
        const perRod = Math.floor(ROD_LENGTH / stirrupLen);
        const stirrupOverlap = OVERLAP_DIAMETERS * (input.stirrupMm / 1000);
        let stirrupRods;
        if (perRod < 1) {
          const oneWithLap = lengthWithSplices(stirrupLen, ROD_LENGTH, stirrupOverlap);
          stirrupRods = Math.ceil((stirrupN * oneWithLap) / ROD_LENGTH);
        } else {
          stirrupRods = Math.ceil(stirrupN / perRod);
        }
        const stirrupPurchasedM = stirrupRods * ROD_LENGTH;
        const stirrupNetKg = stirrupNetM * kgStirrup;
        const stirrupOrderKg = stirrupPurchasedM * kgStirrup;
        const hookM = Math.max(HOOK_MIN, HOOK_DIAMETERS * (input.stirrupMm / 1000));
        const wireKg = (orderKg + stirrupOrderKg) * WIRE_RATE;

        const formLength = 2 * input.length;
        const boardRows = Math.ceil(input.height / BOARD_WIDTH);
        const boardsAlong = Math.ceil(formLength / BOARD_LENGTH);
        const boardCount = boardRows * boardsAlong;
        const boardM3 = boardCount * BOARD_THICK * BOARD_WIDTH * BOARD_LENGTH;
        const stakeCount = Math.ceil(formLength / STAKE_SPACING);
        const stakeLength = input.height + STAKE_EXTRA;
        const timberCount = Math.ceil((stakeCount * stakeLength) / TIMBER_STOCK);
        const timberM3 = timberCount * TIMBER_SIZE * TIMBER_SIZE * TIMBER_STOCK;

        const hydroNet = input.length * input.width + formLength * input.height;
        const hydroOrderArea = hydroNet * (1 + HYDRO_OVERLAP);
        const rolls = Math.ceil(hydroOrderArea / ROLL_AREA);

        const rows = [];

        rows.push({
          name: "Бетон " + input.grade,
          netLabel: formatQty(volume, 2) + " м³",
          k: 1 + CONCRETE_RESERVE,
          orderLabel: formatQty(volume * (1 + CONCRETE_RESERVE), 2) + " м³",
          cost: volume * (1 + CONCRETE_RESERVE) * input.concretePrice,
        });

        rows.push({
          name:
            "Арматура рабочая Ø" +
            input.diameterMm +
            " мм, " +
            rods +
            " шт. × 11.7 м",
          netLabel: formatQty(netKg, 1) + " кг",
          k: netKg > 0 ? orderKg / netKg : 1,
          orderLabel: formatQty(orderKg, 1) + " кг",
          cost: orderKg * input.rebarPrice,
        });

        rows.push({
          name:
            "Хомуты Ø" +
            input.stirrupMm +
            " мм, " +
            stirrupN +
            " шт., гибы 2×" +
            Math.round(hookM * 1000) +
            " мм",
          netLabel: formatQty(stirrupNetKg, 1) + " кг",
          k: stirrupNetKg > 0 ? stirrupOrderKg / stirrupNetKg : 1,
          orderLabel: formatQty(stirrupOrderKg, 1) + " кг",
          cost: stirrupOrderKg * input.rebarPrice,
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
          const sandNet = input.length * input.width * input.sandHeight;
          const sandOrder = sandNet * COMPACTION;
          rows.push({
            name: "Песок",
            netLabel: formatQty(sandNet, 2) + " м³",
            k: COMPACTION,
            orderLabel: formatQty(sandOrder, 2) + " м³",
            cost: sandOrder * input.sandPrice,
          });
        }

        rows.push({
          id: "strip-hydro",
          name: "Гидроизоляция, рулон 1×10 м",
          netLabel: formatQty(hydroNet, 2) + " м²",
          k: 1 + HYDRO_OVERLAP,
          orderLabel: String(rolls) + " рул.",
          cost: rolls * input.hydroPrice,
        });

        let pileTotals = null;
        let pileCosts = null;
        if (input.pilesEnabled && input.piles && input.piles.length) {
          pileTotals = computePileTotals(input.piles);
          if (pileTotals.pileCount > 0) {
            pileCosts = pileTotalsCost(pileTotals, {
              pileConcretePrice: input.pileConcretePrice,
              pileDrillingPrice: input.pileDrillingPrice,
              rebarPrice: input.rebarPrice,
              wirePrice: input.wirePrice,
              pileHydroPrice: input.pileHydroPrice,
            });

            const stripConcreteNet = volume;
            const stripConcreteOrder = volume * (1 + CONCRETE_RESERVE);
            const stripConcreteCost = stripConcreteOrder * input.concretePrice;
            const pileConcreteOrder = pileTotals.concreteOrder;
            const combinedConcreteOrder = stripConcreteOrder + pileConcreteOrder;
            rows[0].name =
              "Бетон " +
              input.grade +
              " (лента " +
              formatQty(stripConcreteOrder, 2) +
              " м³ + сваи " +
              formatQty(pileConcreteOrder, 2) +
              " м³): " +
              formatQty(combinedConcreteOrder, 2) +
              " м³";
            rows[0].netLabel =
              formatQty(stripConcreteNet + pileTotals.concreteNet, 2) + " м³";
            rows[0].orderLabel = formatQty(combinedConcreteOrder, 2) + " м³";
            rows[0].k =
              stripConcreteNet + pileTotals.concreteNet > 0
                ? combinedConcreteOrder / (stripConcreteNet + pileTotals.concreteNet)
                : 1;
            rows[0].cost = stripConcreteCost + pileCosts.concrete;

            const combinedLongNetKg = netKg + pileTotals.longNetKg;
            const combinedLongOrderKg = orderKg + pileTotals.longOrderKg;
            rows[1].netLabel = formatQty(combinedLongNetKg, 1) + " кг";
            rows[1].orderLabel = formatQty(combinedLongOrderKg, 1) + " кг";
            rows[1].k = combinedLongNetKg > 0 ? combinedLongOrderKg / combinedLongNetKg : 1;
            rows[1].name =
              "Арматура рабочая А3 Ø12 (лента " +
              formatQty(orderKg, 1) +
              " кг + сваи " +
              formatQty(pileTotals.longOrderKg, 1) +
              " кг): " +
              formatQty(combinedLongOrderKg, 1) +
              " кг";
            rows[1].cost += pileCosts.longRebar;

            const combinedStirrupNetKg = stirrupNetKg + pileTotals.stirrupNetKg;
            const combinedStirrupOrderKg = stirrupOrderKg + pileTotals.stirrupOrderKg;
            rows[2].name =
              "Хомуты Ø" +
              input.stirrupMm +
              " мм + кольца свай Ø6 (лента " +
              formatQty(stirrupOrderKg, 1) +
              " кг + сваи " +
              formatQty(pileTotals.stirrupOrderKg, 1) +
              " кг): " +
              formatQty(combinedStirrupOrderKg, 1) +
              " кг";
            rows[2].netLabel = formatQty(combinedStirrupNetKg, 1) + " кг";
            rows[2].orderLabel = formatQty(combinedStirrupOrderKg, 1) + " кг";
            rows[2].k =
              combinedStirrupNetKg > 0 ? combinedStirrupOrderKg / combinedStirrupNetKg : 1;
            rows[2].cost += pileCosts.stirrupRebar;

            const combinedWireKg = wireKg + pileTotals.wireKg;
            rows[3].name =
              "Вязальная проволока (лента " +
              formatQty(wireKg, 2) +
              " кг + сваи " +
              formatQty(pileTotals.wireKg, 2) +
              " кг): " +
              formatQty(combinedWireKg, 2) +
              " кг";
            rows[3].netLabel = formatQty(combinedWireKg, 2) + " кг";
            rows[3].orderLabel = formatQty(combinedWireKg, 2) + " кг";
            rows[3].cost += pileCosts.wire;

            const hydroIdx = rows.findIndex(function (row) {
              return row.id === "strip-hydro";
            });
            if (hydroIdx !== -1) {
              rows.splice(hydroIdx + 1, 0, {
                id: "strip-pile-hydro",
                name: "Рубероид гильз свай",
                netLabel: formatQty(pileTotals.ruberoidNet, 2) + " м²",
                k:
                  pileTotals.ruberoidNet > 0
                    ? pileTotals.ruberoidOrder / pileTotals.ruberoidNet
                    : 1 + PILE_RUBEROID_RESERVE,
                orderLabel: formatQty(pileTotals.ruberoidOrder, 2) + " м²",
                cost: pileCosts.ruberoid,
              });
            }

            rows.push({
              name: "Бурение и заливка свай",
              netLabel: formatQty(pileTotals.drillingM, 2) + " м.п.",
              k: 1,
              orderLabel: formatQty(pileTotals.drillingM, 2) + " м.п.",
              cost: pileCosts.drilling,
            });
          }
        }

        const total = rows.reduce(function (sum, item) {
          return sum + item.cost;
        }, 0);

        return {
          rows: rows,
          total: total,
          volume: volume,
          formLength: formLength,
          stirrupN: stirrupN,
          pileTotals: pileTotals,
        };
      }

      return calculateStrip;
    }
  });
})(globalThis);
