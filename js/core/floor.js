// Phase 4E: pure floor calculation. Form and rendering code remain in index.html.
(function (root) {
  "use strict";
  root.SmetaCraftFloorCore = Object.freeze({
    createCalculator: function (deps) {
      const { FLOOR_BOARD_RESERVE, FLOOR_BOARD_THICK, FLOOR_INSULATION_RESERVE, FLOOR_JOINT_CONCRETE, FLOOR_JOINT_RESERVE, FLOOR_MEMBRANE_LAYERS, FLOOR_MEMBRANE_OVERLAP, FLOOR_MONO_HEIGHT, FLOOR_MONO_MIN_LEFT, FLOOR_MONO_RESERVE, FLOOR_REBAR_KG_M3, FLOOR_TIMBER_RESERVE, parseFloorBeamSection, formatFloorBeamSection, formatQty, isZeroSize } = deps;

      function calculateFloor(input) {
        if (isZeroSize(input.length) || isZeroSize(input.width)) {
          return { rows: [], total: 0, area: 0, type: input.type };
        }

        const L = input.length;
        const W = input.width;
        const area = L * W;
        const rows = [];
        let total = 0;

        if (input.type === "wood") {
          const section = parseFloorBeamSection(input.beamSection);
          const B = section.width;
          const H = section.height;
          const Sbeam = input.beamStep;
          const Nbeams = Math.ceil(L / Sbeam) + 1;

          const beamsNetVol = Nbeams * B * H * W;
          const beamsOrderVol = beamsNetVol * FLOOR_TIMBER_RESERVE;

          const areaIns = Math.max(0, L * W - Nbeams * B * W);
          const Hins = input.insulationMm / 1000;
          const insNetVol = areaIns * Hins;
          const insOrderVol = insNetVol * FLOOR_INSULATION_RESERVE;

          const membNetArea = area;
          const membOrderArea = L * W * FLOOR_MEMBRANE_LAYERS * FLOOR_MEMBRANE_OVERLAP;

          rows.push({
            name:
              "Брус несущий деревянный " +
              formatFloorBeamSection(input.beamSection) +
              " (длина пролёта " +
              formatQty(W, 1) +
              " м, шаг " +
              formatQty(Sbeam, 1) +
              " м): " +
              formatQty(beamsOrderVol, 2) +
              " м³",
            netLabel: formatQty(beamsNetVol, 2) + " м³",
            k: beamsNetVol > 0 ? beamsOrderVol / beamsNetVol : FLOOR_TIMBER_RESERVE,
            orderLabel: formatQty(beamsOrderVol, 2) + " м³",
            cost: beamsOrderVol * input.woodBeamPrice,
          });

          rows.push({
            name:
              "Минеральный утеплитель (толщина " +
              formatQty(input.insulationMm, 0) +
              " мм с запасом 5%): " +
              formatQty(insOrderVol, 2) +
              " м³",
            netLabel: formatQty(insNetVol, 2) + " м³",
            k: insNetVol > 0 ? insOrderVol / insNetVol : FLOOR_INSULATION_RESERVE,
            orderLabel: formatQty(insOrderVol, 2) + " м³",
            cost: insOrderVol * input.insulationPrice,
          });

          rows.push({
            name:
              "Пароизоляция и ветрозащита (2 слоя с нахлёстом 10%): " +
              formatQty(membOrderArea, 1) +
              " м²",
            netLabel: formatQty(membNetArea, 2) + " м²",
            k: FLOOR_MEMBRANE_LAYERS * FLOOR_MEMBRANE_OVERLAP,
            orderLabel: formatQty(membOrderArea, 1) + " м²",
            cost: membOrderArea * input.membranePrice,
          });

          if (input.boardClad) {
            const boardNetVol = L * W * FLOOR_BOARD_THICK;
            const boardOrderVol = boardNetVol * FLOOR_BOARD_RESERVE;
            rows.push({
              name:
                "Черновая доска наката 25 мм (запас 10%): " +
                formatQty(boardOrderVol, 2) +
                " м³",
              netLabel: formatQty(boardNetVol, 2) + " м³",
              k: FLOOR_BOARD_RESERVE,
              orderLabel: formatQty(boardOrderVol, 2) + " м³",
              cost: boardOrderVol * input.boardPrice,
            });
          }

          rows.push({
            name:
              "Монтаж деревянного перекрытия (" +
              formatQty(area, 2) +
              " м²): " +
              formatQty(area, 2) +
              " м²",
            netLabel: formatQty(area, 2) + " м²",
            k: 1,
            orderLabel: formatQty(area, 2) + " м²",
            cost: area * input.workWoodPrice,
          });
        } else {
          const Wslab = input.slabWidth;
          const Nslabs = Math.floor(L / Wslab);
          const Lleft = L - Nslabs * Wslab;

          const jointsNetVol = Nslabs * FLOOR_JOINT_CONCRETE;
          const jointsOrderVol = jointsNetVol * FLOOR_JOINT_RESERVE;

          let monoNetVol = 0;
          let monoOrderVol = 0;
          if (input.monolith && Lleft > FLOOR_MONO_MIN_LEFT) {
            monoNetVol = Lleft * W * FLOOR_MONO_HEIGHT;
            monoOrderVol = monoNetVol * FLOOR_MONO_RESERVE;
          }

          const concreteNetVol = jointsNetVol + monoNetVol;
          const concreteOrderVol = jointsOrderVol + monoOrderVol;

          if (Nslabs > 0) {
            rows.push({
              name:
                "Плита перекрытия ЖБ шириной " +
                formatQty(Wslab, 1) +
                " м: " +
                Nslabs +
                " шт.",
              netLabel: String(Nslabs) + " шт",
              k: 1,
              orderLabel: String(Nslabs) + " шт",
              cost: Nslabs * input.concreteSlabPrice,
            });
          }

          if (concreteOrderVol > 0) {
            let concreteName =
              "Бетон " +
              input.concreteGrade +
              " (заделка швов " +
              formatQty(jointsOrderVol, 2) +
              " м³";
            if (monoOrderVol > 0) {
              concreteName +=
                " + монолитный участок " + formatQty(monoOrderVol, 2) + " м³";
            }
            concreteName += "): " + formatQty(concreteOrderVol, 2) + " м³";

            rows.push({
              name: concreteName,
              netLabel: formatQty(concreteNetVol, 2) + " м³",
              k: concreteNetVol > 0 ? concreteOrderVol / concreteNetVol : 1,
              orderLabel: formatQty(concreteOrderVol, 2) + " м³",
              cost: concreteOrderVol * input.wallConcretePrice,
            });
          }

          if (monoOrderVol > 0) {
            const rebarNetKg = monoNetVol * FLOOR_REBAR_KG_M3;
            const rebarOrderKg = monoOrderVol * FLOOR_REBAR_KG_M3;
            const rebarNetT = rebarNetKg / 1000;
            const rebarOrderT = rebarOrderKg / 1000;
            rows.push({
              name:
                "Арматура для монолитного участка (" +
                formatQty(rebarOrderKg, 0) +
                " кг, " +
                formatQty(FLOOR_REBAR_KG_M3, 0) +
                " кг/м³): " +
                formatQty(rebarOrderT, 3) +
                " т",
              netLabel: formatQty(rebarNetT, 3) + " т",
              k: 1,
              orderLabel: formatQty(rebarOrderT, 3) + " т",
              cost: rebarOrderKg * input.stripRebarPrice,
            });
          }

          if (Nslabs > 0) {
            rows.push({
              name:
                "Монтаж плит перекрытия краном (" +
                Nslabs +
                " шт.): " +
                Nslabs +
                " шт.",
              netLabel: String(Nslabs) + " шт",
              k: 1,
              orderLabel: String(Nslabs) + " шт",
              cost: Nslabs * input.workConcretePrice,
            });
          }
        }

        for (let i = 0; i < rows.length; i++) {
          total += rows[i].cost;
        }

        return { rows: rows, total: total, area: area, type: input.type };
      }

      return calculateFloor;
    }
  });
})(globalThis);
