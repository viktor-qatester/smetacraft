      function summaryFoundType() {
        const checked = summaryForm.querySelector('input[name="summary-found-type"]:checked');
        return checked ? checked.value : "slab";
      }

      function syncSummaryUi() {
        const on = summaryIncludeFoundEl.checked;
        summaryFoundChoiceEl.querySelectorAll("input").forEach(function (el) {
          el.disabled = !on;
        });
      }

      function wallsSummaryRows(bill, input) {
        let workCost = 0;
        let materialsCost = 0;
        for (let i = 0; i < bill.rows.length; i++) {
          const row = bill.rows[i];
          if (
            row.name.indexOf("Кладка") === 0 ||
            row.name.indexOf("Устройство армопояса") === 0
          ) {
            workCost += row.cost;
          } else {
            materialsCost += row.cost;
          }
        }
        return [
          {
            name:
              "Стены и перегородки — материалы (" +
              wallLoadMaterialLabel(input.loadMaterial) +
              ", чистая кладка " +
              formatQty(bill.vNet, 2) +
              " м³)",
            netLabel: formatQty(bill.vNet, 2) + " м³",
            k: 1,
            orderLabel: formatMoney(materialsCost).replace(" Br", ""),
            cost: materialsCost,
          },
          {
            name:
              "Стены и перегородки — работы (кладка, армопояс, перемычки" +
              (input.partitionsEnabled ? ", перегородки" : "") +
              ")",
            netLabel: formatQty(input.perimeter, 1) + " м перим.",
            k: 1,
            orderLabel: formatMoney(workCost).replace(" Br", ""),
            cost: workCost,
          },
        ];
      }

      function plasterSummaryRows(bill, input) {
        const mixTitle = input.mix === "cps" ? "ЦПС" : "гипс";
        return [
          {
            name:
              "Штукатурка — материалы (" +
              mixTitle +
              ", слой " +
              formatQty(input.thicknessMm, 0) +
              " мм, " +
              formatQty(bill.area, 2) +
              " м²)",
            netLabel: formatQty(bill.area, 2) + " м²",
            k: 1,
            orderLabel: formatMoney(bill.materialsCost).replace(" Br", ""),
            cost: bill.materialsCost,
          },
          {
            name:
              "Штукатурка — работы (по маякам, " + formatQty(bill.area, 2) + " м²)",
            netLabel: formatQty(bill.area, 2) + " м²",
            k: 1,
            orderLabel: formatQty(bill.area, 2) + " м²",
            cost: bill.workCost,
          },
        ];
      }

      function roofSummaryRows(bill, input) {
        let workCost = 0;
        let materialsCost = 0;
        for (let i = 0; i < bill.rows.length; i++) {
          const row = bill.rows[i];
          if (row.name.indexOf("Монтаж кровли") === 0) {
            workCost += row.cost;
          } else {
            materialsCost += row.cost;
          }
        }
        return [
          {
            name:
              "Кровля — материалы (скаты " +
              formatQty(bill.area, 2) +
              " м², " +
              roofTypeLabel(input.type) +
              ")",
            netLabel: formatQty(bill.area, 2) + " м²",
            k: 1,
            orderLabel: formatMoney(materialsCost).replace(" Br", ""),
            cost: materialsCost,
          },
          {
            name:
              "Кровля — работы (монтаж под ключ, " + formatQty(bill.area, 2) + " м²)",
            netLabel: formatQty(bill.area, 2) + " м²",
            k: 1,
            orderLabel: formatQty(bill.area, 2) + " м²",
            cost: workCost,
          },
        ];
      }

      function floorSummaryRows(bill, input) {
        let workCost = 0;
        let materialsCost = 0;
        for (let i = 0; i < bill.rows.length; i++) {
          const row = bill.rows[i];
          if (
            row.name.indexOf("Монтаж деревянного перекрытия") === 0 ||
            row.name.indexOf("Монтаж плит перекрытия") === 0
          ) {
            workCost += row.cost;
          } else {
            materialsCost += row.cost;
          }
        }
        const typeLabel = input.type === "wood" ? "деревянные балки" : "ЖБ плиты";
        return [
          {
            name:
              "Перекрытия — материалы (" +
              typeLabel +
              ", " +
              formatQty(bill.area, 2) +
              " м²)",
            netLabel: formatQty(bill.area, 2) + " м²",
            k: 1,
            orderLabel: formatMoney(materialsCost).replace(" Br", ""),
            cost: materialsCost,
          },
          {
            name:
              "Перекрытия — работы (" +
              typeLabel +
              ", " +
              formatQty(bill.area, 2) +
              " м²)",
            netLabel: formatQty(bill.area, 2) + " м²",
            k: 1,
            orderLabel: formatMoney(workCost).replace(" Br", ""),
            cost: workCost,
          },
        ];
      }


      function renderSummary() {
        syncSummaryUi();
        const includeFound = summaryIncludeFoundEl.checked;
        const includeWalls = summaryIncludeWallsEl.checked;
        const includePlaster = summaryIncludePlasterEl.checked;
        const includeRoof = summaryIncludeRoofEl.checked;
        const includeFloor = summaryIncludeFloorEl.checked;
        const foundType = summaryFoundType();

        const slabInput = readForm();
        const stripInput = readStripForm();
        const wallsInput = readWallsForm();
        const plasterInput = readPlasterForm();
        const roofInput = readRoofForm();
        const floorInput = readFloorForm();

        summarySnapFoundEl.textContent =
          foundType === "strip"
            ? "Лента " +
              formatQty(stripInput.length, 2) +
              " × " +
              formatQty(stripInput.width, 2) +
              " × " +
              formatQty(stripInput.height, 2) +
              " м"
            : "Плита " +
              formatQty(slabInput.length, 2) +
              " × " +
              formatQty(slabInput.width, 2) +
              " × " +
              formatQty(slabInput.height, 2) +
              " м";
        summarySnapWallsEl.textContent =
          "Стены " +
          formatQty(wallsInput.perimeter, 1) +
          " × " +
          formatQty(wallsInput.height, 1) +
          " м · " +
          wallLoadMaterialLabel(wallsInput.loadMaterial) +
          " · проёмы " +
          formatQty(
            wallsInput.openings.reduce(function (sum, op) {
              return sum + op.width * op.height * op.count;
            }, 0),
            2
          ) +
          " м²";
        summarySnapPlasterEl.textContent =
          "Штукатурка " +
          formatQty(computePlasterArea(plasterInput), 2) +
          " м² · " +
          formatQty(plasterInput.length, 1) +
          " × " +
          formatQty(plasterInput.wallHeight, 1) +
          " м · слой " +
          formatQty(plasterInput.thicknessMm, 0) +
          " мм";
        summarySnapRoofEl.textContent =
          "Кровля " +
          roofTypeLabel(roofInput.type) +
          " · " +
          formatQty(roofInput.width, 2) +
          " × " +
          formatQty(roofInput.length, 2) +
          " м · конёк " +
          formatQty(roofInput.ridgeHeight, 2) +
          " м · свес " +
          formatQty(roofInput.eave, 2) +
          " м";
        summarySnapFloorEl.textContent =
          "Перекрытия " +
          (floorInput.type === "wood" ? "деревянные" : "ЖБ") +
          " · " +
          formatQty(floorInput.length, 2) +
          " × " +
          formatQty(floorInput.width, 2) +
          " м · площадь " +
          formatQty(floorInput.length * floorInput.width, 2) +
          " м²";

        if (!includeFound && !includeWalls && !includePlaster && !includeRoof && !includeFloor) {
          showBillError("Включите хотя бы один узел объекта.", summaryErrorEl);
          return;
        }

        const errors = [];
        const rows = [];
        const nodes = [];
        const calculatedSections = [];
        let total = 0;

        if (includeFound && foundType === "slab") {
          if (!slabIsEmpty(slabInput)) {
            const message = validate(slabInput);
            if (message) {
              errors.push("Плита: " + message);
            } else {
              const bill = calculateSlab(slabInput);
              rows.push.apply(rows, bill.rows);
              total += bill.total;
              calculatedSections.push({ id: "foundation", label: "плитный фундамент" });
              nodes.push(
                "плита " +
                  formatQty(slabInput.length, 2) +
                  " × " +
                  formatQty(slabInput.width, 2) +
                  " × " +
                  formatQty(slabInput.height, 2) +
                  " м"
              );
            }
          }
        } else if (includeFound) {
          if (!stripIsEmpty(stripInput)) {
            const message = validateStrip(stripInput);
            if (message) {
              errors.push("Лента: " + message);
            } else {
              const bill = calculateStrip(stripInput);
              rows.push.apply(rows, bill.rows);
              total += bill.total;
              calculatedSections.push({ id: "foundation", label: "ленточный фундамент" });
              nodes.push(
                "лента " +
                  formatQty(stripInput.length, 2) +
                  " × " +
                  formatQty(stripInput.width, 2) +
                  " × " +
                  formatQty(stripInput.height, 2) +
                  " м"
              );
            }
          }
        }

        if (includeWalls && !wallsIsEmpty(wallsInput)) {
          const message = validateWallsEngine(wallsInput);
          if (message) {
            errors.push("Стены: " + message);
          } else {
            const bill = calculateWalls(wallsInput);
            rows.push.apply(rows, wallsSummaryRows(bill, wallsInput));
            total += bill.total;
            calculatedSections.push({ id: "walls", label: "стены и перегородки" });
            nodes.push(
              "стены " +
                formatQty(wallsInput.perimeter, 1) +
                " × " +
                formatQty(wallsInput.height, 1) +
                " м, проёмы " +
                formatQty(bill.sOpTotal, 2) +
                " м²"
            );
          }
        }

        if (includePlaster && !plasterIsEmpty(plasterInput)) {
          syncPlasterMeshUi();
          const message = validatePlaster(plasterInput);
          if (message) {
            errors.push("Штукатурка: " + message);
          } else {
            const bill = calculatePlaster(plasterInput);
            rows.push.apply(rows, plasterSummaryRows(bill, plasterInput));
            total += bill.total;
            calculatedSections.push({ id: "plaster", label: "штукатурка" });
            nodes.push("штукатурка " + formatQty(bill.area, 2) + " м²");
          }
        }

        if (includeRoof && !roofIsEmpty(roofInput)) {
          const message = validateRoof(roofInput);
          if (message) {
            errors.push("Кровля: " + message);
          } else {
            const bill = calculateRoof(roofInput);
            rows.push.apply(rows, roofSummaryRows(bill, roofInput));
            total += bill.total;
            calculatedSections.push({ id: "roof", label: "кровля" });
            nodes.push(
              "кровля " +
                roofTypeLabel(roofInput.type) +
                " " +
                formatQty(roofInput.width, 2) +
                " × " +
                formatQty(roofInput.length, 2) +
                " м"
            );
          }
        }

        if (includeFloor && !floorIsEmpty(floorInput)) {
          const message = validateFloor(floorInput);
          if (message) {
            errors.push("Перекрытия: " + message);
          } else if (floorNeedsCalc) {
            errors.push("Перекрытия: нажмите «Рассчитать смету» на вкладке перекрытий.");
          } else {
            const bill = calculateFloor(floorInput);
            rows.push.apply(rows, floorSummaryRows(bill, floorInput));
            total += bill.total;
            calculatedSections.push({ id: "floor", label: "перекрытия" });
            nodes.push(
              "перекрытия " +
                formatQty(floorInput.length, 2) +
                " × " +
                formatQty(floorInput.width, 2) +
                " м"
            );
          }
        }

        if (errors.length) {
          showBillError(errors.join(" "), summaryErrorEl);
          return;
        }

        if (!nodes.length) {
          showZeroBill("Объект: параметры не заданы — новый проект.", {
            grouped: true,
            sections: [],
            printTitle: SUMMARY_PRINT_SUB,
            printNodes: "Узлы: не заданы",
          });
          return;
        }

        showBill(rows, total, "Объект: " + nodes.join(" · "), {
          grouped: true,
          sections: calculatedSections,
          printTitle: SUMMARY_PRINT_SUB,
          printNodes: "Узлы: " + nodes.join(" · "),
        });
      }


      function bindSummaryEvents() {
      summaryForm.addEventListener("change", render);
      summaryForm.addEventListener("submit", function (event) {
        event.preventDefault();
        render();
      });

      document.getElementById("summary-jump-found").addEventListener("click", function () {
        setActiveBlock(summaryFoundType() === "strip" ? "strip" : "slab");
      });
      document.getElementById("summary-jump-walls").addEventListener("click", function () {
        setActiveBlock("walls");
      });
      document.getElementById("summary-jump-plaster").addEventListener("click", function () {
        setActiveBlock("plaster");
      });
      document.getElementById("summary-jump-roof").addEventListener("click", function () {
        setActiveBlock("roof");
      });
      document.getElementById("summary-jump-floor").addEventListener("click", function () {
        setActiveBlock("floor");
      });

      }
