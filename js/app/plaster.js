      // MODULE: ENGINE — PLASTER
      // ==========================================
      function plasterSidesMultiplier(sides) {
        return Number(sides) === 2 ? 2 : 1;
      }

      function computePlasterArea(input) {
        let area = input.length * input.wallHeight * plasterSidesMultiplier(input.sides);
        if (input.excludeOpenings) {
          const openings = getOpeningsData();
          let sOpTotal = 0;
          for (let i = 0; i < openings.length; i++) {
            sOpTotal += openings[i].width * openings[i].height * openings[i].count;
          }
          area -= sOpTotal * plasterSidesMultiplier(input.sides);
        }
        return area;
      }

      function syncPlasterFromWalls() {
        if (!plasterLengthManual) {
          plasterLengthEl.value = wallsPerimeterEl.value;
        }
        if (!plasterHeightManual) {
          plasterHeightEl.value = document.getElementById("walls-height").value;
        }
      }

      function syncPlasterMeshUi() {
        plasterMeshPriceWrap.hidden = !plasterMeshEl.checked;
      }

      function zeroPlasterBill() {
        return {
          rows: [],
          total: 0,
          area: 0,
          netKg: 0,
          orderKg: 0,
          bags: 0,
          primerNet: 0,
          primerOrder: 0,
          cans: 0,
          wallLength: 0,
          beacons: 0,
          materialsCost: 0,
          workCost: 0,
        };
      }

      // Phase 4C: use the extracted plaster calculator.
      var calculatePlaster = SmetaCraftPlasterCore.createCalculator({
        BEACON_LENGTH, CPS_BAG_KG, CPS_RATE, GYPSUM_BAG_KG, GYPSUM_RATE, MESH_OVERLAP, MESH_ROLL_M2, PLASTER_LOSS, PRIMER_CAN_L, PRIMER_L_PER_M2, PRIMER_RESERVE, isZeroSize, computePlasterArea, zeroPlasterBill, barCount, formatQty, getCurrency
      });

      function readPlasterForm() {
        return {
          length: parseNumber(plasterLengthEl.value),
          wallHeight: parseNumber(plasterHeightEl.value),
          sides: document.getElementById("plaster-sides").value,
          excludeOpenings: document.getElementById("plaster-exclude-openings").checked,
          mix: plasterMixEl.value,
          thicknessMm: parseNumber(document.getElementById("plaster-thick").value),
          mixPrice: parseNumber(plasterMixPriceEl.value),
          primerLayers: parseNumber(document.getElementById("plaster-primer-layers").value),
          primerPrice: parseNumber(document.getElementById("plaster-primer-price").value),
          beaconStep: parseNumber(document.getElementById("plaster-beacon-step").value),
          beaconPrice: parseNumber(document.getElementById("plaster-beacon-price").value),
          useMesh: plasterMeshEl.checked,
          meshPrice: parseNumber(document.getElementById("plaster-mesh-price").value),
          workPrice: parseNumber(document.getElementById("plaster-work-price").value),
        };
      }

      function validatePlaster(input) {
        if (!(input.length > 0 && input.wallHeight > 0)) {
          return "Введите длину и высоту стен больше нуля.";
        }
        const area = computePlasterArea(input);
        if (!(area > 0)) {
          return "Площадь оштукатуривания после вычета проёмов должна быть больше нуля.";
        }
        if (!(input.thicknessMm > 0)) {
          return "Введите толщину слоя больше нуля.";
        }
        if (!(input.primerLayers === 1 || input.primerLayers === 2)) {
          return "Число слоёв грунтовки — 1 или 2.";
        }
        if (!(input.beaconStep > 0)) {
          return "Введите шаг маяков больше нуля.";
        }
        if (!(input.mixPrice > 0 && input.primerPrice > 0 && input.beaconPrice > 0)) {
          return "Введите цены смеси, грунтовки и маяков больше нуля.";
        }
        if (!(input.workPrice > 0)) {
          return "Введите цену штукатурных работ больше нуля.";
        }
        if (input.useMesh && !(input.meshPrice > 0)) {
          return "Введите цену рулона сетки больше нуля.";
        }
        return "";
      }

      // ==========================================

      function bindPlasterEvents() {
      plasterMixEl.addEventListener("change", function () {
        const option = plasterMixEl.selectedOptions[0];
        plasterMixPriceEl.value = option.getAttribute("data-price");
        render();
      });

      plasterMeshEl.addEventListener("change", function () {
        syncPlasterMeshUi();
        render();
      });

      plasterLengthEl.addEventListener("input", function () {
        plasterLengthManual = true;
      });
      plasterHeightEl.addEventListener("input", function () {
        plasterHeightManual = true;
      });

      plasterForm.addEventListener("input", render);
      plasterForm.addEventListener("change", render);
      plasterForm.addEventListener("submit", function (event) {
        event.preventDefault();
        render();
      });

      }

      function renderPlaster() {
        syncPlasterMeshUi();
        const input = readPlasterForm();

        if (plasterIsEmpty(input)) {
          showZeroBill("Штукатурка не задана — введите длину и высоту стен.");
          return;
        }

        const message = validatePlaster(input);

        if (message) {
          showBillError(message, plasterErrorEl);
          return;
        }

        const bill = calculatePlaster(input);
        const mixLabel = input.mix === "cps" ? "ЦПС" : "гипс";
        showBill(
          bill.rows,
          bill.total,
          "Штукатурка " +
            formatQty(bill.area, 2) +
            " м² · " +
            mixLabel +
            " · слой " +
            formatQty(input.thicknessMm, 0) +
            " мм · грунтовка " +
            input.primerLayers +
            " сл. · длина стен " +
            formatQty(bill.wallLength, 2) +
            " м"
        );
      }
