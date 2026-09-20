// Phase 5A: slab form and bill presentation. Calculation remains in js/core/slab.js.
(function (root) {
  "use strict";

  root.SmetaCraftSlabUi = Object.freeze({
    createController: function (deps) {
      const { document, parseNumber, formatQty, defaultRodLengthM, slabIsEmpty, calculateSlab,
        showZeroBill, showBillError, showBill, errorEl, rodLengthManualRef } = deps;

      function readForm() {
        return {
          length: parseNumber(document.getElementById("length").value),
          width: parseNumber(document.getElementById("width").value),
          height: parseNumber(document.getElementById("height").value),
          grade: document.getElementById("grade").value,
          concretePrice: parseNumber(document.getElementById("concrete-price").value),
          diameterMm: parseNumber(document.getElementById("bar-diameter").value),
          rodLengthM: parseNumber(document.getElementById("rod-length").value),
          stepMm: parseNumber(document.getElementById("bar-step").value),
          meshCount: parseNumber(document.getElementById("slab-mesh-count").value),
          rebarPrice: parseNumber(document.getElementById("rebar-price").value),
          wirePrice: parseNumber(document.getElementById("wire-price").value),
          boardPrice: parseNumber(document.getElementById("board-price").value),
          timberPrice: parseNumber(document.getElementById("timber-price").value),
          sandHeight: parseNumber(document.getElementById("sand-height").value),
          sandPrice: parseNumber(document.getElementById("sand-price").value),
          stoneHeight: parseNumber(document.getElementById("stone-height").value),
          stonePrice: parseNumber(document.getElementById("stone-price").value),
          hydroPrice: parseNumber(document.getElementById("hydro-price").value),
        };
      }

      function validate(input) {
        if (!(input.length > 0 && input.width > 0 && input.height > 0)) {
          return "Введите длину, ширину и толщину больше нуля.";
        }
        if (!(input.stepMm > 0 && input.diameterMm > 0 && input.rodLengthM > 0)) {
          return "Введите шаг сетки, диаметр арматуры и длину прутка больше нуля.";
        }
        if (input.meshCount !== 1 && input.meshCount !== 2) {
          return "Выберите одну или две арматурные сетки.";
        }
        if (
          !(
            input.concretePrice > 0 &&
            input.rebarPrice > 0 &&
            input.wirePrice > 0 &&
            input.boardPrice > 0 &&
            input.timberPrice > 0 &&
            input.hydroPrice > 0
          )
        ) {
          return "Введите цены материалов больше нуля.";
        }
        if (input.sandHeight < 0 || input.stoneHeight < 0) {
          return "Толщина подушки не может быть отрицательной.";
        }
        if (input.sandHeight > 0 && !(input.sandPrice > 0)) {
          return "Введите цену песка больше нуля.";
        }
        if (input.stoneHeight > 0 && !(input.stonePrice > 0)) {
          return "Введите цену щебня больше нуля.";
        }
        return "";
      }

      function renderSlab(input, validateInput) {
        if (slabIsEmpty(input)) {
          showZeroBill("Плита не задана — введите длину, ширину и толщину.");
          return;
        }

        const message = validateInput(input);
        if (message) {
          showBillError(message, errorEl);
          return;
        }

        const bill = calculateSlab(input);
        showBill(
          bill.rows,
          bill.total,
          "Плита " +
            formatQty(input.length, 2) +
            " × " +
            formatQty(input.width, 2) +
            " × " +
            formatQty(input.height, 2) +
            " м · периметр " +
            formatQty(bill.perimeter, 2) +
            " м"
        );
      }

      function bindEvents(options) {
        const { form, gradeEl, concretePriceEl, barDiameterEl, rodLengthEl, render,
          syncRoofFootprintFromFoundation, syncFloorFromFoundation,
          syncWallsPerimeterFromFoundation } = options;

        gradeEl.addEventListener("change", function () {
          const option = gradeEl.selectedOptions[0];
          concretePriceEl.value = option.getAttribute("data-price");
          render();
        });

        barDiameterEl.addEventListener("change", function () {
          if (!rodLengthManualRef.value) {
            rodLengthEl.value = String(defaultRodLengthM(parseNumber(barDiameterEl.value)));
          }
        });

        function onFormUpdate(event) {
          if (event && event.target === rodLengthEl) {
            rodLengthManualRef.value = true;
          }
          syncRoofFootprintFromFoundation();
          syncFloorFromFoundation();
          syncWallsPerimeterFromFoundation();
          render();
        }
        form.addEventListener("input", onFormUpdate);
        form.addEventListener("change", onFormUpdate);
        form.addEventListener("submit", function (event) {
          event.preventDefault();
          render();
        });
      }

      return Object.freeze({ readForm, validate, renderSlab, bindEvents });
    }
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
