      // MODULE: ENGINE — ROOF
      // ==========================================
      function roofTypeLabel(type) {
        if (type === "mono") {
          return "односкатная";
        }
        if (type === "hip") {
          return "вальмовая";
        }
        return "двухскатная";
      }

      function roofCoveringLabel(type) {
        if (type === "soft-tile") {
          return "мягкая черепица";
        }
        if (type === "profiled") {
          return "профнастил";
        }
        return "металлочерепица";
      }

      function parseRoofSection(code) {
        const parts = String(code).split("x");
        return {
          width: Number(parts[0]) / 1000,
          height: Number(parts[1]) / 1000,
        };
      }

      function formatRoofSection(code) {
        return String(code).replace(/x/gi, "×");
      }

      function roofCoveringReserve(type) {
        if (type === "profiled") {
          return ROOF_COVER_PROFILED_RESERVE;
        }
        if (type === "soft-tile") {
          return ROOF_COVER_SOFT_RESERVE;
        }
        return ROOF_COVER_METAL_RESERVE;
      }

      function roofCoveringReserveLabel(type) {
        if (type === "profiled") {
          return "+8%";
        }
        if (type === "soft-tile") {
          return "+5%";
        }
        return "+10%";
      }

      // Phase 4D: use the extracted roof geometry and calculator.
      var roofCore = SmetaCraftRoofCore.createCalculator({
        ROOF_COUNTER_BATTON, ROOF_INSULATION_FRAME, ROOF_MEMBRANE_OVERLAP, ROOF_MEMBRANE_ROLL, ROOF_TIMBER_RESERVE, parseRoofSection, roofCoveringReserve, roofCoveringLabel, formatRoofSection, roofCoveringReserveLabel, formatQty, isZeroSize
      });
      var calculateRoofGeometry = roofCore.calculateRoofGeometry;
      var calculateRoof = roofCore.calculateRoof;

      function validateRoof(input) {
        if (!(input.width > 0 && input.length > 0)) {
          return "Введите ширину и длину дома больше нуля.";
        }
        if (input.ridgeHeight < 0) {
          return "Высота конька не может быть отрицательной.";
        }
        if (input.eave < 0) {
          return "Ширина свеса карниза не может быть отрицательной.";
        }
        if (input.type !== "mono" && !(input.width / 2 > 0)) {
          return "Ширина дома должна быть больше нуля для расчёта скатов.";
        }
        if (input.type === "mono" && !(input.width > 0)) {
          return "Ширина дома должна быть больше нуля для односкатной крыши.";
        }
        if (!(input.rafterStepMm > 0 && input.battenStepMm > 0)) {
          return "Введите шаг стропил и обрешётки больше нуля.";
        }
        if (input.warmRoof && !(input.insulationMm > 0)) {
          return "Введите толщину утеплителя больше нуля.";
        }
        if (
          !(
            input.timberPrice > 0 &&
            input.boardPrice > 0 &&
            input.metalPrice > 0 &&
            input.membranePrice > 0 &&
            input.vaporPrice > 0 &&
            input.workPrice > 0
          )
        ) {
          return "Введите цены кровельных материалов и работ в прайс-листе.";
        }
        if (input.warmRoof && !(input.insulationPrice > 0)) {
          return "Введите цену утеплителя в прайс-листе.";
        }
        return "";
      }


      function readRoofPrices() {
        return {
          timberPrice: parseNumber(document.getElementById("roof-timber-price").value),
          boardPrice: parseNumber(document.getElementById("roof-board-price").value),
          metalPrice: parseNumber(document.getElementById("roof-metal-price").value),
          insulationPrice: parseNumber(document.getElementById("roof-insulation-price").value),
          membranePrice: parseNumber(document.getElementById("roof-membrane-price").value),
          vaporPrice: parseNumber(document.getElementById("roof-vapor-price").value),
          workPrice: parseNumber(document.getElementById("roof-work-price").value),
        };
      }


      function readRoofForm() {
        const prices = readRoofPrices();
        return {
          type: document.getElementById("roof-type").value,
          width: parseNumber(roofWidthEl.value),
          length: parseNumber(roofLengthEl.value),
          ridgeHeight: parseNumber(document.getElementById("roof-ridge-height").value),
          eave: parseNumber(document.getElementById("roof-eave").value),
          rafterSection: document.getElementById("roof-rafter-section").value,
          rafterStepMm: parseNumber(document.getElementById("roof-rafter-step").value),
          mauerlatSection: document.getElementById("roof-mauerlat-section").value,
          battenStepMm: parseNumber(document.getElementById("roof-batten-step").value),
          battenSection: document.getElementById("roof-batten-section").value,
          warmRoof: roofWarmEl.checked,
          insulationMm: parseNumber(document.getElementById("roof-insulation-mm").value),
          covering: document.getElementById("roof-covering").value,
          timberPrice: prices.timberPrice,
          boardPrice: prices.boardPrice,
          metalPrice: prices.metalPrice,
          insulationPrice: prices.insulationPrice,
          membranePrice: prices.membranePrice,
          vaporPrice: prices.vaporPrice,
          workPrice: prices.workPrice,
        };
      }

      function syncRoofInsulationUi() {
        roofInsulationWrap.hidden = !roofWarmEl.checked;
      }

      function showRoofPending() {
        roofErrorEl.classList.remove("visible");
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

      function renderRoof(forcePending) {
        syncRoofInsulationUi();
        syncRoofFootprintFromFoundation();
        const input = readRoofForm();

        if (roofIsEmpty(input)) {
          showZeroBill("Кровля не задана — введите габариты дома и высоту конька.");
          return;
        }

        if (forcePending !== false && roofNeedsCalc) {
          showRoofPending();
          return;
        }

        const message = validateRoof(input);
        if (message) {
          showBillError(message, roofErrorEl);
          return;
        }

        const bill = calculateRoof(input);
        const alphaDeg = (bill.alpha * 180) / Math.PI;
        showBill(
          bill.rows,
          bill.total,
          "Кровля · " +
            roofTypeLabel(input.type) +
            " · " +
            formatQty(input.width, 2) +
            " × " +
            formatQty(input.length, 2) +
            " м + свес " +
            formatQty(input.eave, 2) +
            " м · скаты " +
            formatQty(bill.area, 2) +
            " м² · угол " +
            formatQty(alphaDeg, 1) +
            "° · стропило " +
            formatQty(bill.Lraf, 2) +
            " м",
          {
            printNodes:
              "Кровля " +
              formatQty(bill.Wtotal, 2) +
              " × " +
              formatQty(bill.Ltotal, 2) +
              " м в плане · " +
              bill.rafterCount +
              " стропил",
          }
        );
      }

      // ==========================================


      function bindRoofEvents() {
      roofWarmEl.addEventListener("change", function () {
        syncRoofInsulationUi();
        roofNeedsCalc = true;
        if (billBlock === "roof") {
          renderRoof();
        }
      });
      roofWidthEl.addEventListener("input", function () {
        roofWidthManual = true;
        roofNeedsCalc = true;
        if (billBlock === "roof") {
          renderRoof();
        }
      });
      roofLengthEl.addEventListener("input", function () {
        roofLengthManual = true;
        roofNeedsCalc = true;
        if (billBlock === "roof") {
          renderRoof();
        }
      });
      roofForm.addEventListener("input", function (event) {
        if (event.target !== roofWidthEl && event.target !== roofLengthEl) {
          roofNeedsCalc = true;
        }
        if (billBlock === "roof") {
          renderRoof();
        }
      });
      roofForm.addEventListener("change", function () {
        roofNeedsCalc = true;
        if (billBlock === "roof") {
          renderRoof();
        }
      });
      roofForm.addEventListener("submit", function (event) {
        event.preventDefault();
        roofNeedsCalc = false;
        renderRoof(false);
      });

      }
