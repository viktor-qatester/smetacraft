// Phase 5B: strip form and bill presentation. Calculation remains in js/core/strip.js.
(function (root) {
  "use strict";

  root.SmetaCraftStripUi = Object.freeze({
    createController: function (deps) {
      const { document, parseNumber, formatQty, COVER, stirrupBarLength,
        pilesEnabledEl, getPilesData, stripIsEmpty, calculateStrip,
        showZeroBill, showBillError, showBill, stripErrorEl } = deps;

      function readStripForm() {
        return {
          length: parseNumber(document.getElementById("strip-length").value),
          width: parseNumber(document.getElementById("strip-width").value),
          height: parseNumber(document.getElementById("strip-height").value),
          grade: document.getElementById("strip-grade").value,
          concretePrice: parseNumber(document.getElementById("strip-concrete-price").value),
          diameterMm: parseNumber(document.getElementById("strip-bar-diameter").value),
          barCount: parseNumber(document.getElementById("strip-bar-count").value),
          rebarPrice: parseNumber(document.getElementById("strip-rebar-price").value),
          stirrupMm: parseNumber(document.getElementById("strip-stirrup-diameter").value),
          stirrupStepMm: parseNumber(document.getElementById("strip-stirrup-step").value),
          wirePrice: parseNumber(document.getElementById("strip-wire-price").value),
          boardPrice: parseNumber(document.getElementById("strip-board-price").value),
          timberPrice: parseNumber(document.getElementById("strip-timber-price").value),
          sandHeight: parseNumber(document.getElementById("strip-sand-height").value),
          sandPrice: parseNumber(document.getElementById("strip-sand-price").value),
          hydroPrice: parseNumber(document.getElementById("strip-hydro-price").value),
          pilesEnabled: pilesEnabledEl.checked,
          pileConcretePrice: parseNumber(document.getElementById("pile-concrete-price").value),
          pileDrillingPrice: parseNumber(document.getElementById("pile-work-drilling-price").value),
          pileHydroPrice: parseNumber(document.getElementById("pile-hydro-price").value),
          piles: getPilesData(),
        };
      }

      function validateStrip(input) {
        if (!(input.length > 0 && input.width > 0 && input.height > 0)) {
          return "Введите длину, ширину и высоту ленты больше нуля.";
        }
        if (!(input.width > 2 * COVER && input.height > 2 * COVER)) {
          return "Ширина и высота должны быть больше 80 мм (два защитных слоя по 40 мм).";
        }
        if (!(input.barCount >= 2 && Number.isInteger(input.barCount))) {
          return "Число рабочих стержней — целое число от 2.";
        }
        if (!(input.diameterMm > 0 && input.stirrupMm > 0 && input.stirrupStepMm > 0)) {
          return "Введите диаметры арматуры и шаг хомутов больше нуля.";
        }
        if (stirrupBarLength(input.width, input.height, COVER, input.stirrupMm) <= 0) {
          return "Длина хомута получилась некорректной. Проверьте сечение ленты.";
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
        if (input.sandHeight < 0) {
          return "Толщина подушки не может быть отрицательной.";
        }
        if (input.sandHeight > 0 && !(input.sandPrice > 0)) {
          return "Введите цену песка больше нуля.";
        }
        if (input.pilesEnabled) {
          if (
            !(
              input.pileConcretePrice > 0 &&
              input.pileDrillingPrice > 0 &&
              input.pileHydroPrice > 0
            )
          ) {
            return "Введите цены бетона свай, бурения и рубероида гильз больше нуля.";
          }
          if (!input.piles.length) {
            return "Добавьте хотя бы одну группу свай.";
          }
          for (let i = 0; i < input.piles.length; i++) {
            const pile = input.piles[i];
            if (!(pile.diameterMm > 0)) {
              return "Укажите диаметр свай в группе «" + (pile.name || i + 1) + "».";
            }
            if (!(pile.depthM > 0)) {
              return "Укажите глубину заложения свай в группе «" + (pile.name || i + 1) + "».";
            }
            if (!(pile.count >= 1 && Number.isInteger(pile.count))) {
              return "Количество свай в группе «" + (pile.name || i + 1) + "» — целое число от 1.";
            }
          }
        }
        return "";
      }

      function renderStrip(input, validateInput) {
        if (stripIsEmpty(input)) {
          showZeroBill("Лента не задана — введите длину, ширину и высоту.");
          return;
        }

        const message = validateInput(input);
        if (message) {
          showBillError(message, stripErrorEl);
          return;
        }

        const bill = calculateStrip(input);
        let meta =
          "Лента " +
          formatQty(input.length, 2) +
          " × " +
          formatQty(input.width, 2) +
          " × " +
          formatQty(input.height, 2) +
          " м · объём " +
          formatQty(bill.volume, 2) +
          " м³ · опалубка " +
          formatQty(bill.formLength, 2) +
          " м";
        if (bill.pileTotals && bill.pileTotals.pileCount > 0) {
          meta += " · сваи " + bill.pileTotals.pileCount + " шт";
        }
        showBill(bill.rows, bill.total, meta);
      }

      function bindEvents(options) {
        const { stripForm, stripGradeEl, stripConcretePriceEl, pilesBodyEl,
          render, syncRoofFootprintFromFoundation, syncFloorFromFoundation,
          syncWallsPerimeterFromFoundation, syncPilesUi, pileRowTemplate } = options;

        stripGradeEl.addEventListener("change", function () {
          const option = stripGradeEl.selectedOptions[0];
          stripConcretePriceEl.value = option.getAttribute("data-price");
          render();
        });

        function onFormUpdate() {
          syncRoofFootprintFromFoundation();
          syncFloorFromFoundation();
          syncWallsPerimeterFromFoundation();
          render();
        }
        stripForm.addEventListener("input", onFormUpdate);
        stripForm.addEventListener("change", onFormUpdate);
        stripForm.addEventListener("submit", function (event) {
          event.preventDefault();
          render();
        });

        pilesEnabledEl.addEventListener("change", function () {
          syncPilesUi();
          render();
        });

        document.getElementById("strip-add-pile").addEventListener("click", function () {
          pilesBodyEl.appendChild(
            pileRowTemplate({
              locked: false,
              name: "",
              diameterMm: 300,
              depthM: "2.5",
              count: "10",
            })
          );
          render();
        });

        stripForm.addEventListener("click", function (event) {
          const del = event.target.closest(".js-pile-del");
          if (!del) {
            return;
          }
          const row = del.closest("tr.pile-row");
          if (!row || row.getAttribute("data-pile-locked") === "true") {
            return;
          }
          row.remove();
          render();
        });
      }

      return Object.freeze({ readStripForm, validateStrip, renderStrip, bindEvents });
    }
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
