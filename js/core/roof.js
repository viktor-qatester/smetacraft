// Phase 4D: pure roof geometry and calculation. UI helpers are injected.
(function (root) {
  "use strict";
  root.SmetaCraftRoofCore = Object.freeze({
    createCalculator: function (deps) {
      const { ROOF_COUNTER_BATTON, ROOF_INSULATION_FRAME, ROOF_MEMBRANE_OVERLAP, ROOF_MEMBRANE_ROLL, ROOF_TIMBER_RESERVE, parseRoofSection, roofCoveringReserve, roofCoveringLabel, formatRoofSection, roofCoveringReserveLabel, formatQty, isZeroSize } = deps;

      function calculateRoofGeometry(input) {
        const W = input.width;
        const L = input.length;
        const H = input.ridgeHeight;
        const S = input.eave;
        const Wtotal = W + 2 * S;
        const Ltotal = L + 2 * S;
        let area;
        let Lraf;
        let alpha;
        let slopeCount;

        if (input.type === "mono") {
          const X = W + 2 * S;
          alpha = Math.atan2(H, W);
          Lraf = X / Math.cos(alpha);
          area = Lraf * Ltotal;
          slopeCount = 1;
        } else if (input.type === "hip") {
          alpha = Math.atan2(H, W / 2);
          const hFace = (W / 2 + S) / Math.cos(alpha);
          const triArea = Wtotal * hFace;
          const trapArea = 2 * (Ltotal - W / 2 + S) * hFace;
          area = triArea + trapArea;
          Lraf = hFace;
          slopeCount = 4;
        } else {
          const X = W / 2 + S;
          alpha = Math.atan2(H, W / 2);
          Lraf = X / Math.cos(alpha);
          area = 2 * Lraf * Ltotal;
          slopeCount = 2;
        }

        return {
          area: area,
          Lraf: Lraf,
          alpha: alpha,
          slopeCount: slopeCount,
          Wtotal: Wtotal,
          Ltotal: Ltotal,
        };
      }

      function calculateRoof(input) {
        if (isZeroSize(input.width) || isZeroSize(input.length) || isZeroSize(input.ridgeHeight)) {
          return {
            rows: [],
            total: 0,
            area: 0,
            Lraf: 0,
            alpha: 0,
            Wtotal: 0,
            Ltotal: 0,
            rafterCount: 0,
          };
        }
        const geom = calculateRoofGeometry(input);
        const area = geom.area;
        const Lraf = geom.Lraf;
        const slopeCount = geom.slopeCount;
        const rafterSection = parseRoofSection(input.rafterSection);
        const mauerlatSection = parseRoofSection(input.mauerlatSection);
        const battenSection = parseRoofSection(input.battenSection);
        const stepM = input.rafterStepMm / 1000;
        const battenStepM = input.battenStepMm / 1000;
        const rafterRows = Math.ceil(input.length / stepM) + 1;
        const rafterCount =
          input.type === "mono" ? rafterRows : rafterRows * 2;

        const rafterNetVol =
          rafterCount * Lraf * rafterSection.width * rafterSection.height;
        const rafterOrderVol = rafterNetVol * ROOF_TIMBER_RESERVE;

        const mauerlatLength = 2 * (input.width + input.length);
        const mauerlatNetVol =
          mauerlatLength * mauerlatSection.width * mauerlatSection.height;
        const mauerlatOrderVol = mauerlatNetVol * ROOF_TIMBER_RESERVE;

        const counterNetLength = rafterCount * Lraf;
        const counterNetVol =
          counterNetLength * ROOF_COUNTER_BATTON * ROOF_COUNTER_BATTON;
        const counterOrderVol = counterNetVol * ROOF_TIMBER_RESERVE;

        const timberNetVol = rafterNetVol + mauerlatNetVol + counterNetVol;
        const timberOrderVol = rafterOrderVol + mauerlatOrderVol + counterOrderVol;

        const battenRows = Math.ceil(Lraf / battenStepM) + 1;
        const battenNetLength = battenRows * geom.Ltotal * slopeCount;
        const battenNetVol =
          battenNetLength * battenSection.width * battenSection.height;
        const battenOrderVol = battenNetVol * ROOF_TIMBER_RESERVE;

        const insulationTh = input.insulationMm / 1000;
        const insulationNetVol = input.warmRoof ? area * insulationTh * ROOF_INSULATION_FRAME : 0;
        const insulationOrderVol = insulationNetVol;

        const membraneNetArea = area * ROOF_MEMBRANE_OVERLAP;
        const membraneRolls = Math.ceil(membraneNetArea / ROOF_MEMBRANE_ROLL);
        const vaporRolls = membraneRolls;

        const coverReserve = roofCoveringReserve(input.covering);
        const coverNetArea = area;
        const coverOrderArea = area * coverReserve;

        const rows = [];

        rows.push({
          name:
            "Брус стропил и мауэрлат " +
            formatRoofSection(input.rafterSection) +
            "/" +
            formatRoofSection(input.mauerlatSection) +
            " (стропила " +
            formatQty(rafterOrderVol, 2) +
            " м³ + мауэрлат " +
            formatQty(mauerlatOrderVol, 2) +
            " м³ + контр-обр. " +
            formatQty(counterOrderVol, 2) +
            " м³): " +
            formatQty(timberOrderVol, 2) +
            " м³",
          netLabel: formatQty(timberNetVol, 2) + " м³",
          k: timberNetVol > 0 ? timberOrderVol / timberNetVol : ROOF_TIMBER_RESERVE,
          orderLabel: formatQty(timberOrderVol, 2) + " м³",
          cost: timberOrderVol * input.timberPrice,
        });

        rows.push({
          name:
            "Доска обрешётки " +
            formatRoofSection(input.battenSection) +
            " (рядов " +
            battenRows +
            " × " +
            formatQty(geom.Ltotal, 2) +
            " м × " +
            slopeCount +
            " скат.): " +
            formatQty(battenOrderVol, 2) +
            " м³",
          netLabel: formatQty(battenNetVol, 2) + " м³",
          k: battenNetVol > 0 ? battenOrderVol / battenNetVol : ROOF_TIMBER_RESERVE,
          orderLabel: formatQty(battenOrderVol, 2) + " м³",
          cost: battenOrderVol * input.boardPrice,
        });

        if (input.warmRoof) {
          rows.push({
            name:
              "Утеплитель минвата " +
              formatQty(input.insulationMm, 0) +
              " мм (с учётом каркаса 90%): " +
              formatQty(insulationOrderVol, 2) +
              " м³",
            netLabel: formatQty(insulationNetVol, 2) + " м³",
            k: ROOF_INSULATION_FRAME,
            orderLabel: formatQty(insulationOrderVol, 2) + " м³",
            cost: insulationOrderVol * input.insulationPrice,
          });
        }

        rows.push({
          name:
            "Гидро-ветрозащитная мембрана (с нахлёстом 15%): " +
            membraneRolls +
            " рул. (" +
            formatQty(membraneNetArea, 2) +
            " м²)",
          netLabel: formatQty(area, 2) + " м²",
          k: ROOF_MEMBRANE_OVERLAP,
          orderLabel: membraneRolls + " рул.",
          cost: membraneRolls * input.membranePrice,
        });

        rows.push({
          name:
            "Пароизоляция (с нахлёстом 15%): " +
            vaporRolls +
            " рул. (" +
            formatQty(membraneNetArea, 2) +
            " м²)",
          netLabel: formatQty(area, 2) + " м²",
          k: ROOF_MEMBRANE_OVERLAP,
          orderLabel: vaporRolls + " рул.",
          cost: vaporRolls * input.vaporPrice,
        });

        rows.push({
          name:
            roofCoveringLabel(input.covering) +
            " (площадь скатов " +
            formatQty(coverNetArea, 2) +
            " м², запас " +
            roofCoveringReserveLabel(input.covering) +
            "): " +
            formatQty(coverOrderArea, 2) +
            " м²",
          netLabel: formatQty(coverNetArea, 2) + " м²",
          k: coverReserve,
          orderLabel: formatQty(coverOrderArea, 2) + " м²",
          cost: coverOrderArea * input.metalPrice,
        });

        rows.push({
          name:
            "Монтаж кровли «под ключ» (" +
            formatQty(area, 2) +
            " м² скатов)",
          netLabel: formatQty(area, 2) + " м²",
          k: 1,
          orderLabel: formatQty(area, 2) + " м²",
          cost: area * input.workPrice,
        });

        const total = rows.reduce(function (sum, item) {
          return sum + item.cost;
        }, 0);

        return {
          rows: rows,
          total: total,
          area: area,
          Lraf: Lraf,
          alpha: geom.alpha,
          Wtotal: geom.Wtotal,
          Ltotal: geom.Ltotal,
          rafterCount: rafterCount,
        };
      }

      return { calculateRoofGeometry, calculateRoof };
    }
  });
})(globalThis);
