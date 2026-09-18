// Phase 4C: pure plaster calculation. Existing helpers are explicit dependencies.
(function (root) {
  "use strict";
  root.SmetaCraftPlasterCore = Object.freeze({
    createCalculator: function (deps) {
      const { BEACON_LENGTH, CPS_BAG_KG, CPS_RATE, GYPSUM_BAG_KG, GYPSUM_RATE, MESH_OVERLAP, MESH_ROLL_M2, PLASTER_LOSS, PRIMER_CAN_L, PRIMER_L_PER_M2, PRIMER_RESERVE, isZeroSize, computePlasterArea, zeroPlasterBill, barCount, formatQty } = deps;

      function calculatePlaster(input) {
        if (
          isZeroSize(input.length) ||
          isZeroSize(input.wallHeight) ||
          isZeroSize(input.thicknessMm) ||
          isZeroSize(computePlasterArea(input))
        ) {
          return zeroPlasterBill();
        }
        const rate = input.mix === "cps" ? CPS_RATE : GYPSUM_RATE;
        const bagKg = input.mix === "cps" ? CPS_BAG_KG : GYPSUM_BAG_KG;
        const mixTitle =
          input.mix === "cps" ? "Цементно-песчаная штукатурка" : "Гипсовая штукатурка";
        const area = computePlasterArea(input);
        const netKg = area * (input.thicknessMm / 10) * rate;
        const orderKg = netKg * (1 + PLASTER_LOSS);
        const bags = Math.ceil(orderKg / bagKg);

        const primerNet = area * PRIMER_L_PER_M2 * input.primerLayers;
        const primerOrder = primerNet * (1 + PRIMER_RESERVE);
        const cans = Math.ceil(primerOrder / PRIMER_CAN_L);

        const wallLength = input.length;
        const beaconLines = barCount(wallLength, input.beaconStep);
        const profilesPerLine = Math.ceil(input.wallHeight / BEACON_LENGTH);
        const beacons = beaconLines * profilesPerLine;

        const rows = [];

        rows.push({
          name: mixTitle + ", мешок " + bagKg + " кг",
          netLabel: formatQty(netKg, 1) + " кг",
          k: 1 + PLASTER_LOSS,
          orderLabel: String(bags) + " меш.",
          cost: bags * input.mixPrice,
        });

        rows.push({
          name:
            "Грунтовка глубокого проникновения, " +
            input.primerLayers +
            (input.primerLayers === 1 ? " слой" : " слоя") +
            ", канистра 10 л",
          netLabel: formatQty(primerNet, 2) + " л",
          k: 1 + PRIMER_RESERVE,
          orderLabel: String(cans) + " кан.",
          cost: cans * input.primerPrice,
        });

        rows.push({
          name: "Маячковый профиль 6 мм × 3.0 м, шаг " + formatQty(input.beaconStep, 2) + " м",
          netLabel: String(beaconLines) + " шт",
          k: profilesPerLine,
          orderLabel: String(beacons) + " шт",
          cost: beacons * input.beaconPrice,
        });

        if (input.useMesh) {
          const meshOrder = area * (1 + MESH_OVERLAP);
          const rolls = Math.ceil(meshOrder / MESH_ROLL_M2);
          rows.push({
            name: "Стеклосетка армирующая, рулон 50 м²",
            netLabel: formatQty(area, 2) + " м²",
            k: 1 + MESH_OVERLAP,
            orderLabel: String(rolls) + " рул.",
            cost: rolls * input.meshPrice,
          });
        }

        const materialsCost = rows.reduce(function (sum, item) {
          return sum + item.cost;
        }, 0);

        const workCost = area * input.workPrice;
        rows.push({
          name:
            "Штукатурные работы по маякам, " +
            formatQty(area, 2) +
            " м² × " +
            formatQty(input.workPrice, 2) +
            " Br/м²",
          netLabel: formatQty(area, 2) + " м²",
          k: 1,
          orderLabel: formatQty(area, 2) + " м²",
          cost: workCost,
        });

        return {
          rows: rows,
          total: materialsCost + workCost,
          area: area,
          netKg: netKg,
          orderKg: orderKg,
          bags: bags,
          primerNet: primerNet,
          primerOrder: primerOrder,
          cans: cans,
          wallLength: wallLength,
          beacons: beacons,
          materialsCost: materialsCost,
          workCost: workCost,
        };
      }

      return calculatePlaster;
    }
  });
})(globalThis);
