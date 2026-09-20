      // MODULE: REGRESSION TESTS
      // ==========================================
      const REGRESSION_EXPECT = {
        slab: 12359.46,
        slabOneMesh: 9871.33,
        walls: 7821.96,
        // Штукатурка: 40 × 3 м, одна сторона, автовычет 13.5 м² проёмов → 106.5 м².
        // 48 меш. × 16.50 + 2 кан. × 28 + 35 маяков × 3.20 + 106.5 м² × 10.00 работ.
        plaster: 2025.0,
        // Сводная регрессия: плита + legacy-стены + материалы штукатурки (без работ).
        summary: 19938.56,
        stripPiles: 10782.49,
        roof: 14955.59,
        // Перекрытия: дерево 10 × 8 м, брус 100×200 шаг 0.6 м, утеплитель 150 мм, накат.
        floor: 5495.14,
      };

      function moneyEqual(actual, expected) {
        if (!Number.isFinite(actual)) {
          return false;
        }
        return Math.abs(actual - expected) < 0.005;
      }

      function isRegressionBadgeVisible() {
        try {
          return new URLSearchParams(window.location.search).has("regression");
        } catch (error) {
          return false;
        }
      }

      function setRegressionField(id, value) {
        const el = document.getElementById(id);
        if (el) {
          el.value = String(value);
        }
      }

      function applyRegressionFixtures() {
        setRegressionField("length", "10");
        setRegressionField("width", "8");
        setRegressionField("height", "0.3");
        gradeEl.value = "М250";
        concretePriceEl.value = "210";
        document.getElementById("bar-diameter").value = "12";
        setRegressionField("rod-length", "5.8");
        rodLengthManual = false;
        setRegressionField("bar-step", "200");
        document.getElementById("slab-mesh-count").value = "2";
        setRegressionField("rebar-price", "3.20");
        setRegressionField("wire-price", "4.50");
        setRegressionField("board-price", "14");
        setRegressionField("timber-price", "8");
        setRegressionField("sand-height", "0.2");
        setRegressionField("sand-price", "32");
        setRegressionField("stone-height", "0.2");
        setRegressionField("stone-price", "55");
        setRegressionField("hydro-price", "28");

        setRegressionField("walls-perimeter", "40");
        wallsPerimeterManual = true;
        setRegressionField("walls-height", "3.0");
        document.getElementById("walls-load-bearing-material").value = "gas-silicate-300";
        setRegressionField("walls-joint-mm", "2");
        document.getElementById("walls-reinforce-mesh").checked = true;
        document.getElementById("walls-armopoyas").checked = true;
        document.getElementById("walls-lintels").checked = true;
        document.getElementById("walls-partitions-enabled").checked = false;
        setRegressionField("walls-block-price", "5.50");
        setRegressionField("walls-glue-price", "18");
        writeOpeningsState([
          { type: "window", width: "1.5", height: "1.4", count: "4", locked: true },
          { type: "entry-door", width: "1.0", height: "2.1", count: "1" },
        ]);
        setRegressionField("walls-rebar-price", "3.20");
        setRegressionField("walls-lintel-price", "28");
        setRegressionField("walls-screw-price", "12");
        setRegressionField("wall-armopoyas-width", "250");
        setRegressionField("wall-armopoyas-height", "250");

        setRegressionField("plaster-length", "44.444444");
        setRegressionField("plaster-height", "2.7");
        document.getElementById("plaster-sides").value = "1";
        document.getElementById("plaster-exclude-openings").checked = false;
        plasterLengthManual = true;
        plasterHeightManual = true;
        plasterMixEl.value = "gypsum";
        plasterMixPriceEl.value = "16.50";
        setRegressionField("plaster-thick", "15");
        document.getElementById("plaster-primer-layers").value = "1";
        setRegressionField("plaster-primer-price", "28");
        setRegressionField("plaster-beacon-step", "1.2");
        setRegressionField("plaster-beacon-price", "3.20");
        setRegressionField("plaster-work-price", "10.00");
        plasterMeshEl.checked = false;

        summaryIncludeFoundEl.checked = true;
        summaryIncludeWallsEl.checked = true;
        summaryIncludePlasterEl.checked = true;
        summaryIncludeRoofEl.checked = false;
        summaryIncludeFloorEl.checked = false;
        roofWidthManual = false;
        roofLengthManual = false;
        roofNeedsCalc = true;
        const slabFoundRadio = summaryForm.querySelector(
          'input[name="summary-found-type"][value="slab"]'
        );
        if (slabFoundRadio) {
          slabFoundRadio.checked = true;
        }

        syncWallsUi();
        syncPlasterMeshUi();
        pilesEnabledEl.checked = false;
        writePilesState([]);
        syncPilesUi();
        setRegressionField("pile-concrete-price", "185.00");
        setRegressionField("pile-work-drilling-price", "45.00");
        setRegressionField("pile-hydro-price", "2.80");
      }

      function applyStripPilesRegressionFixtures() {
        setRegressionField("strip-length", "40");
        setRegressionField("strip-width", "0.4");
        setRegressionField("strip-height", "1.0");
        stripGradeEl.value = "М250";
        stripConcretePriceEl.value = "210";
        document.getElementById("strip-bar-diameter").value = "12";
        setRegressionField("strip-rod-length", "5.8");
        stripRodLengthManual = false;
        setRegressionField("strip-bar-count", "4");
        document.getElementById("strip-stirrup-diameter").value = "8";
        setRegressionField("strip-stirrup-step", "300");
        setRegressionField("strip-rebar-price", "3.20");
        setRegressionField("strip-wire-price", "4.50");
        setRegressionField("strip-board-price", "14");
        setRegressionField("strip-timber-price", "8");
        setRegressionField("strip-sand-height", "0.2");
        setRegressionField("strip-sand-price", "32");
        setRegressionField("strip-hydro-price", "28");
        setRegressionField("pile-concrete-price", "185.00");
        setRegressionField("pile-work-drilling-price", "45.00");
        setRegressionField("pile-hydro-price", "2.80");
        pilesEnabledEl.checked = true;
        writePilesState([
          {
            id: 1,
            locked: true,
            name: "Основная группа",
            diameterMm: 300,
            depthM: 2.5,
            count: 20,
          },
        ]);
        syncPilesUi();
        setActiveBlock("strip");
      }

      function applyRoofRegressionFixtures() {
        roofWidthManual = false;
        roofLengthManual = false;
        roofNeedsCalc = false;
        lastFoundationBlock = "slab";
        setRegressionField("length", "10");
        setRegressionField("width", "8");
        document.getElementById("roof-type").value = "gable";
        setRegressionField("roof-width", "8.0");
        setRegressionField("roof-length", "10.0");
        setRegressionField("roof-ridge-height", "2.5");
        setRegressionField("roof-eave", "0.5");
        document.getElementById("roof-rafter-section").value = "50x200";
        setRegressionField("roof-rafter-step", "600");
        document.getElementById("roof-mauerlat-section").value = "150x150";
        setRegressionField("roof-batten-step", "350");
        document.getElementById("roof-batten-section").value = "25x100";
        roofWarmEl.checked = true;
        setRegressionField("roof-insulation-mm", "150");
        document.getElementById("roof-covering").value = "metal-tile";
        setRegressionField("roof-timber-price", "450.00");
        setRegressionField("roof-board-price", "380.00");
        setRegressionField("roof-metal-price", "28.00");
        setRegressionField("roof-insulation-price", "95.00");
        setRegressionField("roof-membrane-price", "110.00");
        setRegressionField("roof-vapor-price", "85.00");
        setRegressionField("roof-work-price", "65.00");
        syncRoofInsulationUi();
        setActiveBlock("roof");
      }

      function applyWallsRegressionFixtures() {
        wallsPerimeterManual = false;
        setRegressionField("length", "10");
        setRegressionField("width", "8");
        setRegressionField("walls-perimeter", "36");
        setRegressionField("walls-height", "3.0");
        document.getElementById("walls-load-bearing-material").value = "gas-silicate-300";
        setRegressionField("walls-joint-mm", "2");
        document.getElementById("walls-reinforce-mesh").checked = true;
        document.getElementById("walls-armopoyas").checked = true;
        document.getElementById("walls-lintels").checked = true;
        document.getElementById("walls-partitions-enabled").checked = false;
        writeOpeningsState([
          { type: "window", width: "1.5", height: "1.5", count: "6", locked: true },
        ]);
        setRegressionField("wall-block-price", "140.00");
        setRegressionField("wall-adhesive-price", "9.50");
        setRegressionField("wall-mesh-price", "3.20");
        setRegressionField("partition-block-price", "150.00");
        setRegressionField("wall-concrete-price", "185.00");
        setRegressionField("wall-work-masonry-price", "45.00");
        setRegressionField("wall-work-partition-price", "18.00");
        setRegressionField("wall-work-armopoyas-price", "15.00");
        setRegressionField("strip-rebar-price", "3.20");
        setRegressionField("wall-armopoyas-width", "250");
        setRegressionField("wall-armopoyas-height", "250");
        syncWallsUi();
        setActiveBlock("walls");
      }

      function applyPlasterRegressionFixtures() {
        // Длина и высота штукатурки подтягиваются из «Стен»: флаги ручного ввода
        // сброшены, поэтому эталон задаётся периметром 40 м и высотой 3 м.
        setRegressionField("walls-perimeter", "40");
        wallsPerimeterManual = true;
        setRegressionField("walls-height", "3.0");
        writeOpeningsState([
          { type: "window", width: "1.5", height: "1.5", count: "6", locked: true },
        ]);
        plasterLengthManual = false;
        plasterHeightManual = false;
        document.getElementById("plaster-sides").value = "1";
        document.getElementById("plaster-exclude-openings").checked = true;
        plasterMixEl.value = "gypsum";
        plasterMixPriceEl.value = "16.50";
        setRegressionField("plaster-thick", "15");
        document.getElementById("plaster-primer-layers").value = "1";
        setRegressionField("plaster-primer-price", "28");
        setRegressionField("plaster-beacon-step", "1.2");
        setRegressionField("plaster-beacon-price", "3.20");
        setRegressionField("plaster-work-price", "10.00");
        plasterMeshEl.checked = false;
        syncPlasterMeshUi();
        setActiveBlock("plaster");
      }

      function applyFloorRegressionFixtures() {
        floorLengthManual = false;
        floorWidthManual = false;
        setRegressionField("length", "10");
        setRegressionField("width", "8");
        setRegressionField("floor-length", "10");
        setRegressionField("floor-width", "8");
        floorTypeEl.value = "wood";
        document.getElementById("floor-beam-section").value = "100x200";
        setRegressionField("floor-beam-step", "0.6");
        setRegressionField("floor-insulation-mm", "150");
        document.getElementById("floor-board-clad").checked = true;
        setRegressionField("floor-wood-beam-price", "450.00");
        setRegressionField("floor-insulation-price", "95.00");
        setRegressionField("floor-membrane-price", "1.80");
        setRegressionField("floor-board-price", "380.00");
        setRegressionField("floor-work-wood-price", "25.00");
        syncFloorTypeUi();
        floorNeedsCalc = false;
        setActiveBlock("floor");
      }

      function computeRegressionSummaryTotal() {
        const includeFound = summaryIncludeFoundEl.checked;
        const includeWalls = summaryIncludeWallsEl.checked;
        const includePlaster = summaryIncludePlasterEl.checked;
        const foundType = summaryFoundType();
        let total = 0;
        const errors = [];

        if (includeFound && foundType === "slab") {
          const input = readForm();
          const message = validate(input);
          if (message) {
            errors.push("Плита: " + message);
          } else {
            total += calculateSlab(input).total;
          }
        } else if (includeFound) {
          const input = readStripForm();
          const message = validateStrip(input);
          if (message) {
            errors.push("Лента: " + message);
          } else {
            total += calculateStrip(input).total;
          }
        }

        if (includeWalls) {
          const input = _readWallsFormLegacy();
          const message = validateWalls(input);
          if (message) {
            errors.push("Стены: " + message);
          } else {
            total += _calculateWallsLegacy(input).total;
          }
        }

        if (includePlaster) {
          const input = readPlasterForm();
          const message = validatePlaster(input);
          if (message) {
            errors.push("Штукатурка: " + message);
          } else {
            const bill = calculatePlaster(input);
            total += bill.materialsCost;
          }
        }

        return { total: total, errors: errors };
      }

      function updateRegressionBadge(passed, failures) {
        const badge = document.getElementById("regression-badge");
        badge.hidden = passed;
        badge.classList.toggle("fail", !passed);
        if (passed) {
          badge.textContent = "";
          badge.removeAttribute("title");
        } else {
          badge.textContent = "Ошибка регрессии!";
          badge.title = failures.join(" · ");
        }
      }

      function runRegressionTests() {
        const previousPersist = persistSuspended;
        persistSuspended = true;
        applyRegressionFixtures();

        const failures = [];
        if (barCount(8.1, 0.2) !== 42) {
          failures.push("Арматура: для пролёта 8,1 м с шагом 200 мм должно быть 42 стержня.");
        }
        const cases = [
          {
            name: "Плита",
            expected: REGRESSION_EXPECT.slab,
            run: function () {
              const input = readForm();
              const message = validate(input);
              if (message) {
                return { total: NaN, error: message };
              }
              return { total: calculateSlab(input).total, error: "" };
            },
          },
        ];

        for (let i = 0; i < cases.length; i++) {
          const item = cases[i];
          const result = item.run();
          if (result.error) {
            failures.push(item.name + ": " + result.error);
          } else if (!moneyEqual(result.total, item.expected)) {
            failures.push(
              item.name +
                ": " +
                formatMoney(result.total) +
                " ≠ " +
                formatMoney(item.expected)
            );
          }
        }

        document.getElementById("slab-mesh-count").value = "1";
        const oneMeshInput = readForm();
        const oneMeshError = validate(oneMeshInput);
        if (oneMeshError) {
          failures.push("Плита, одна сетка: " + oneMeshError);
        } else {
          const oneMeshBill = calculateSlab(oneMeshInput);
          const rebarRow = oneMeshBill.rows.find(function (row) {
            return row.name.indexOf("Арматура Ø") === 0;
          });
          if (!rebarRow || rebarRow.name.indexOf("149 шт.") === -1 ||
              !moneyEqual(oneMeshBill.total, REGRESSION_EXPECT.slabOneMesh)) {
            failures.push("Плита, одна сетка: ожидается 149 хлыстов × 5,8 м и 9 871,33 Br.");
          }
        }
        document.getElementById("slab-mesh-count").value = "2";

        const summary = computeRegressionSummaryTotal();
        if (summary.errors.length) {
          failures.push.apply(failures, summary.errors);
        } else if (!moneyEqual(summary.total, REGRESSION_EXPECT.summary)) {
          failures.push(
            "Сводная смета: " +
              formatMoney(summary.total) +
              " ≠ " +
              formatMoney(REGRESSION_EXPECT.summary)
          );
        }

        applyStripPilesRegressionFixtures();
        const stripPilesInput = readStripForm();
        const stripPilesMessage = validateStrip(stripPilesInput);
        let stripPilesTotal = NaN;
        if (stripPilesMessage) {
          failures.push("Лента со сваями: " + stripPilesMessage);
        } else {
          stripPilesTotal = calculateStrip(stripPilesInput).total;
          if (!moneyEqual(stripPilesTotal, REGRESSION_EXPECT.stripPiles)) {
            failures.push(
              "Лента со сваями: " +
                formatMoney(stripPilesTotal) +
                " ≠ " +
                formatMoney(REGRESSION_EXPECT.stripPiles)
            );
          }
        }

        applyRoofRegressionFixtures();
        const roofInput = readRoofForm();
        const roofMessage = validateRoof(roofInput);
        let roofTotal = NaN;
        if (roofMessage) {
          failures.push("Кровля: " + roofMessage);
        } else {
          roofTotal = calculateRoof(roofInput).total;
          if (!moneyEqual(roofTotal, REGRESSION_EXPECT.roof)) {
            failures.push(
              "Кровля: " +
                formatMoney(roofTotal) +
                " ≠ " +
                formatMoney(REGRESSION_EXPECT.roof)
            );
          }
        }

        applyWallsRegressionFixtures();
        const wallsInput = readWallsForm();
        const wallsMessage = validateWallsEngine(wallsInput);
        let wallsTotal = NaN;
        if (wallsMessage) {
          failures.push("Стены: " + wallsMessage);
        } else {
          wallsTotal = calculateWalls(wallsInput).total;
          if (!moneyEqual(wallsTotal, REGRESSION_EXPECT.walls)) {
            failures.push(
              "Стены: " +
                formatMoney(wallsTotal) +
                " ≠ " +
                formatMoney(REGRESSION_EXPECT.walls)
            );
          }
        }

        applyPlasterRegressionFixtures();
        const plasterInput = readPlasterForm();
        const plasterMessage = validatePlaster(plasterInput);
        let plasterTotal = NaN;
        if (plasterMessage) {
          failures.push("Штукатурка: " + plasterMessage);
        } else if (!document.getElementById("plaster-exclude-openings").checked) {
          failures.push("Штукатурка: автовычет проёмов выключен.");
        } else {
          plasterTotal = calculatePlaster(plasterInput).total;
          if (!moneyEqual(plasterTotal, REGRESSION_EXPECT.plaster)) {
            failures.push(
              "Штукатурка: " +
                formatMoney(plasterTotal) +
                " ≠ " +
                formatMoney(REGRESSION_EXPECT.plaster)
            );
          }
        }

        applyFloorRegressionFixtures();
        const floorInput = readFloorForm();
        const floorMessage = validateFloor(floorInput);
        let floorTotal = NaN;
        if (floorMessage) {
          failures.push("Перекрытия: " + floorMessage);
        } else {
          floorTotal = calculateFloor(floorInput).total;
          if (!moneyEqual(floorTotal, REGRESSION_EXPECT.floor)) {
            failures.push(
              "Перекрытия: " +
                formatMoney(floorTotal) +
                " ≠ " +
                formatMoney(REGRESSION_EXPECT.floor)
            );
          }
        }

        applyRegressionFixtures();
        summaryIncludeWallsEl.checked = false;
        summaryIncludePlasterEl.checked = false;
        setActiveBlock("summary");

        const passed = failures.length === 0;
        updateRegressionBadge(passed, failures);
        persistSuspended = previousPersist;
        return passed;
      }

      // ==========================================
