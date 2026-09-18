      function parseFloorBeamSection(value) {
        const parts = String(value).split("x");
        return {
          width: parseNumber(parts[0]) / 1000,
          height: parseNumber(parts[1]) / 1000,
        };
      }

      function formatFloorBeamSection(value) {
        const parts = String(value).split("x");
        if (parts.length === 2) {
          return parts[0] + "×" + parts[1] + " мм";
        }
        return String(value);
      }

      function readFloorPrices() {
        return {
          woodBeamPrice: parseNumber(document.getElementById("floor-wood-beam-price").value),
          insulationPrice: parseNumber(document.getElementById("floor-insulation-price").value),
          membranePrice: parseNumber(document.getElementById("floor-membrane-price").value),
          boardPrice: parseNumber(document.getElementById("floor-board-price").value),
          concreteSlabPrice: parseNumber(document.getElementById("floor-concrete-slab-price").value),
          workWoodPrice: parseNumber(document.getElementById("floor-work-wood-price").value),
          workConcretePrice: parseNumber(document.getElementById("floor-work-concrete-price").value),
          wallConcretePrice: parseNumber(document.getElementById("wall-concrete-price").value),
          stripRebarPrice: parseNumber(document.getElementById("strip-rebar-price").value),
        };
      }

      function readFloorForm() {
        const prices = readFloorPrices();
        return {
          type: floorTypeEl.value,
          length: parseNumber(floorLengthEl.value),
          width: parseNumber(floorWidthEl.value),
          beamSection: document.getElementById("floor-beam-section").value,
          beamStep: parseNumber(document.getElementById("floor-beam-step").value),
          insulationMm: parseNumber(document.getElementById("floor-insulation-mm").value),
          boardClad: document.getElementById("floor-board-clad").checked,
          slabWidth: parseNumber(document.getElementById("floor-slab-width").value),
          monolith: document.getElementById("floor-monolith").checked,
          concreteGrade: stripGradeEl.value,
          woodBeamPrice: prices.woodBeamPrice,
          insulationPrice: prices.insulationPrice,
          membranePrice: prices.membranePrice,
          boardPrice: prices.boardPrice,
          concreteSlabPrice: prices.concreteSlabPrice,
          workWoodPrice: prices.workWoodPrice,
          workConcretePrice: prices.workConcretePrice,
          wallConcretePrice: prices.wallConcretePrice,
          stripRebarPrice: prices.stripRebarPrice,
        };
      }

      function validateFloor(input) {
        if (!(input.length > 0 && input.width > 0)) {
          return "Введите длину и ширину пролёта больше нуля.";
        }
        if (input.type === "wood") {
          if (!(input.beamStep > 0)) {
            return "Введите шаг укладки балок больше нуля.";
          }
          if (!(input.insulationMm > 0)) {
            return "Введите толщину утеплителя больше нуля.";
          }
          if (
            !(
              input.woodBeamPrice > 0 &&
              input.insulationPrice > 0 &&
              input.membranePrice > 0 &&
              input.workWoodPrice > 0
            )
          ) {
            return "Введите цены материалов и работ деревянного перекрытия в прайс-листе.";
          }
          if (input.boardClad && !(input.boardPrice > 0)) {
            return "Введите цену черновой доски наката в прайс-листе.";
          }
        } else {
          if (!(input.slabWidth > 0)) {
            return "Выберите ширину плиты перекрытия.";
          }
          if (
            !(
              input.concreteSlabPrice > 0 &&
              input.wallConcretePrice > 0 &&
              input.workConcretePrice > 0
            )
          ) {
            return "Введите цены плит, бетона и монтажа в прайс-листе.";
          }
          if (input.monolith && !(input.stripRebarPrice > 0)) {
            return "Введите цену арматуры в блоке «Ленточный фундамент» прайс-листа.";
          }
        }
        return "";
      }

      // Phase 4E: use the extracted floor calculator.
      var calculateFloor = SmetaCraftFloorCore.createCalculator({
        FLOOR_BOARD_RESERVE, FLOOR_BOARD_THICK, FLOOR_INSULATION_RESERVE, FLOOR_JOINT_CONCRETE, FLOOR_JOINT_RESERVE, FLOOR_MEMBRANE_LAYERS, FLOOR_MEMBRANE_OVERLAP, FLOOR_MONO_HEIGHT, FLOOR_MONO_MIN_LEFT, FLOOR_MONO_RESERVE, FLOOR_REBAR_KG_M3, FLOOR_TIMBER_RESERVE, parseFloorBeamSection, formatFloorBeamSection, formatQty, isZeroSize
      });


      function syncFloorTypeUi() {
        const isWood = floorTypeEl.value === "wood";
        floorWoodBoxEl.classList.toggle("is-open", isWood);
        floorWoodBoxEl.setAttribute("aria-hidden", isWood ? "false" : "true");
        floorConcreteBoxEl.classList.toggle("is-open", !isWood);
        floorConcreteBoxEl.setAttribute("aria-hidden", isWood ? "true" : "false");
      }

      function showFloorPending() {
        floorErrorEl.classList.remove("visible");
        billWrapEl.hidden = true;
        billPrintEl.hidden = true;
        billEmptyEl.hidden = false;
        billEmptyEl.textContent =
          "Параметры изменены. Нажмите «Рассчитать смету» для получения результатов.";
        billMetaEl.textContent = "";
        billScopeEl.hidden = true;
        billExcludedEl.hidden = true;
        billNextEl.hidden = true;
        setPrintHead(BILL_PRINT_SUB, "");
      }

      function renderFloor(forcePending) {
        syncFloorTypeUi();
        syncFloorFromFoundation();
        const input = readFloorForm();

        if (floorIsEmpty(input)) {
          showZeroBill("Перекрытия не заданы — введите длину и ширину пролёта.");
          return;
        }

        if (forcePending !== false && floorNeedsCalc) {
          showFloorPending();
          return;
        }

        const message = validateFloor(input);
        if (message) {
          showBillError(message, floorErrorEl);
          return;
        }

        const bill = calculateFloor(input);
        const typeLabel = input.type === "wood" ? "деревянные балки" : "ЖБ плиты";
        showBill(
          bill.rows,
          bill.total,
          "Перекрытия · " +
            typeLabel +
            " · " +
            formatQty(input.length, 2) +
            " × " +
            formatQty(input.width, 2) +
            " м · площадь " +
            formatQty(bill.area, 2) +
            " м²",
          {
            printNodes:
              "Перекрытия " +
              formatQty(input.length, 2) +
              " × " +
              formatQty(input.width, 2) +
              " м · " +
              typeLabel,
          }
        );
      }


      function bindFloorEvents() {
      floorTypeEl.addEventListener("change", function () {
        syncFloorTypeUi();
        floorNeedsCalc = true;
        if (billBlock === "floor") {
          renderFloor();
        }
      });
      floorLengthEl.addEventListener("input", function () {
        floorLengthManual = true;
        floorNeedsCalc = true;
        if (billBlock === "floor") {
          renderFloor();
        }
      });
      floorWidthEl.addEventListener("input", function () {
        floorWidthManual = true;
        floorNeedsCalc = true;
        if (billBlock === "floor") {
          renderFloor();
        }
      });
      floorForm.addEventListener("input", function (event) {
        if (event.target !== floorLengthEl && event.target !== floorWidthEl) {
          floorNeedsCalc = true;
        }
        if (billBlock === "floor") {
          renderFloor();
        }
      });
      floorForm.addEventListener("change", function () {
        floorNeedsCalc = true;
        if (billBlock === "floor") {
          renderFloor();
        }
      });
      floorForm.addEventListener("submit", function (event) {
        event.preventDefault();
        floorNeedsCalc = false;
        renderFloor(false);
      });

      }
