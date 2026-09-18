      // MODULE: CUSTOMER INTAKE (QUESTIONNAIRE)
      // ==========================================
      function setIntakeStatus(message, isError) {
        intakeStatusEl.textContent = message || "";
        intakeStatusEl.classList.toggle("is-error", Boolean(isError));
      }

      function syncIntakeRoofUi() {
        const on = document.getElementById("intake-include-roof").checked;
        intakeRoofBoxEl.hidden = !on;
      }

      function showIntakeBillHint() {
        intakeErrorEl.classList.remove("visible");
        billWrapEl.hidden = true;
        billPrintEl.hidden = true;
        billEmptyEl.hidden = false;
        billEmptyEl.textContent =
          "Заполните анкету слева и нажмите «Посчитать выбранные части» — здесь появится ведомость.";
        billMetaEl.textContent = "";
        billScopeEl.hidden = true;
        billExcludedEl.hidden = true;
        billNextEl.hidden = true;
        setPrintHead(BILL_PRINT_SUB, "");
      }

      function readIntakeForm() {
        return {
          length: parseNumber(document.getElementById("intake-length").value),
          width: parseNumber(document.getElementById("intake-width").value),
          slabThick: parseNumber(document.getElementById("intake-slab-thick").value),
          wallHeight: parseNumber(document.getElementById("intake-wall-height").value),
          windows: Math.round(parseNumber(document.getElementById("intake-windows").value)),
          doors: Math.round(parseNumber(document.getElementById("intake-doors").value)),
          ridgeHeight: parseNumber(document.getElementById("intake-ridge-height").value),
          eave: parseNumber(document.getElementById("intake-eave").value),
          includeFound: document.getElementById("intake-include-found").checked,
          includeWalls: document.getElementById("intake-include-walls").checked,
          includePlaster: document.getElementById("intake-include-plaster").checked,
          includeFloor: document.getElementById("intake-include-floor").checked,
          includeRoof: document.getElementById("intake-include-roof").checked,
        };
      }

      function validateIntake(input) {
        if (!(input.length > 0 && input.width > 0)) {
          return "Укажите длину и ширину дома больше нуля.";
        }
        if (input.includeFound && !(input.slabThick > 0)) {
          return "Укажите толщину фундаментной плиты больше нуля.";
        }
        if ((input.includeWalls || input.includePlaster) && !(input.wallHeight > 0)) {
          return "Укажите высоту стен больше нуля.";
        }
        if (!(input.windows >= 0 && Number.isInteger(input.windows))) {
          return "Количество окон — целое число, 0 или больше.";
        }
        if (!(input.doors >= 0 && Number.isInteger(input.doors))) {
          return "Количество дверей — целое число, 0 или больше.";
        }
        if (
          !input.includeFound &&
          !input.includeWalls &&
          !input.includePlaster &&
          !input.includeFloor &&
          !input.includeRoof
        ) {
          return "Отметьте хотя бы один блок для расчёта.";
        }
        if (input.includeRoof && !(input.ridgeHeight > 0)) {
          return "Для кровли укажите высоту конька больше нуля.";
        }
        if (input.includeRoof && !(input.eave >= 0)) {
          return "Укажите свес карниза (можно 0).";
        }
        return "";
      }

      function syncIntakeFromProject() {
        setRegressionField("intake-length", document.getElementById("length").value || "10");
        setRegressionField("intake-width", document.getElementById("width").value || "8");
        setRegressionField("intake-slab-thick", document.getElementById("height").value || "0.3");
        setRegressionField("intake-wall-height", document.getElementById("walls-height").value || "3.0");
        setRegressionField("intake-ridge-height", document.getElementById("roof-ridge-height").value || "2.5");
        setRegressionField("intake-eave", document.getElementById("roof-eave").value || "0.5");

        let windows = 0;
        let doors = 0;
        const openings = readOpeningsState();
        for (let i = 0; i < openings.length; i++) {
          const row = openings[i];
          const n = parseNumber(row.count);
          if (row.type === "entry-door") {
            doors += n;
          } else if (row.type === "window") {
            windows += n;
          }
        }
        setRegressionField("intake-windows", String(windows));
        setRegressionField("intake-doors", String(doors));
        syncIntakeRoofUi();
      }

      function applyIntakeCustomerDefaults() {
        document.getElementById("intake-include-found").checked = true;
        document.getElementById("intake-include-walls").checked = true;
        document.getElementById("intake-include-plaster").checked = true;
        document.getElementById("intake-include-floor").checked = false;
        document.getElementById("intake-include-roof").checked = false;
        syncIntakeRoofUi();
      }

      function applyIntakeQuestionnaire() {
        const input = readIntakeForm();
        const message = validateIntake(input);
        if (message) {
          intakeErrorEl.textContent = message;
          intakeErrorEl.classList.add("visible");
          setIntakeStatus("", false);
          return false;
        }
        intakeErrorEl.classList.remove("visible");

        setRegressionField("length", String(input.length));
        setRegressionField("width", String(input.width));
        setRegressionField("height", String(input.slabThick));
        setRegressionField("walls-height", String(input.wallHeight));

        wallsPerimeterManual = false;
        plasterLengthManual = false;
        plasterHeightManual = false;
        roofWidthManual = false;
        roofLengthManual = false;
        floorLengthManual = false;
        floorWidthManual = false;
        lastFoundationBlock = "slab";

        const openings = [];
        if (input.windows > 0) {
          openings.push({
            type: "window",
            width: "1.5",
            height: "1.4",
            count: String(input.windows),
            locked: true,
          });
        }
        if (input.doors > 0) {
          openings.push({
            type: "entry-door",
            width: "1.0",
            height: "2.1",
            count: String(input.doors),
          });
        }
        if (!openings.length) {
          openings.push({
            type: "window",
            width: "1.5",
            height: "1.4",
            count: "0",
            locked: true,
          });
        }
        writeOpeningsState(openings);

        document.getElementById("walls-load-bearing-material").value = "gas-silicate-300";
        document.getElementById("walls-reinforce-mesh").checked = true;
        document.getElementById("walls-armopoyas").checked = true;
        document.getElementById("walls-lintels").checked = true;
        document.getElementById("walls-partitions-enabled").checked = false;
        document.getElementById("plaster-exclude-openings").checked = true;
        document.getElementById("plaster-sides").value = "1";
        plasterMeshEl.checked = false;

        pilesEnabledEl.checked = false;
        writePilesState([]);
        syncPilesUi();
        syncWallsUi();
        syncPlasterMeshUi();

        const slabFoundRadio = summaryForm.querySelector('input[name="summary-found-type"][value="slab"]');
        if (slabFoundRadio) {
          slabFoundRadio.checked = true;
        }

        summaryIncludeFoundEl.checked = input.includeFound;
        summaryIncludeWallsEl.checked = input.includeWalls;
        summaryIncludePlasterEl.checked = input.includePlaster;
        summaryIncludeFloorEl.checked = input.includeFloor;
        summaryIncludeRoofEl.checked = input.includeRoof;

        if (input.includeRoof) {
          roofWidthEl.value = String(input.width);
          roofLengthEl.value = String(input.length);
          setRegressionField("roof-ridge-height", String(input.ridgeHeight));
          setRegressionField("roof-eave", String(input.eave));
          document.getElementById("roof-type").value = "gable";
          roofWarmEl.checked = true;
          roofNeedsCalc = false;
          syncRoofInsulationUi();
        }

        if (input.includeFloor) {
          floorLengthEl.value = String(input.length);
          floorWidthEl.value = String(input.width);
          floorTypeEl.value = "wood";
          floorNeedsCalc = false;
          syncFloorTypeUi();
        }

        syncWallsPerimeterFromFoundation();
        syncPlasterFromWalls();

        setIntakeStatus(
          "Готово: параметры подставлены. Справа — сводная ведомость. При необходимости уточните детали на вкладках «Стены», «Кровля» и др.",
          false
        );
        setActiveBlock("summary");
        saveToLocalStorage();
        return true;
      }

      function setActiveBlock(block) {
        activeBlock = block;
        if (block === "slab" || block === "strip") {
          lastFoundationBlock = block;
        }
        if (BILL_BLOCKS.indexOf(block) !== -1) {
          billBlock = block;
        }
        panelSlab.hidden = block !== "slab";
        panelStrip.hidden = block !== "strip";
        panelWalls.hidden = block !== "walls";
        panelFloor.hidden = block !== "floor";
        panelPlaster.hidden = block !== "plaster";
        panelRoof.hidden = block !== "roof";
        panelSummary.hidden = block !== "summary";
        panelPrice.hidden = block !== "price";
        panelProject.hidden = block !== "project";
        panelIntake.hidden = block !== "intake";
        if (block === "intake") {
          syncIntakeFromProject();
        }
        if (block === "roof") {
          syncRoofFootprintFromFoundation();
        }
        if (block === "floor") {
          syncFloorFromFoundation();
        }
        if (block === "walls") {
          syncWallsPerimeterFromFoundation();
        }
        if (block === "plaster") {
          syncPlasterFromWalls();
        }
        leadEl.textContent = BLOCK_LEADS[block] || SLAB_LEAD;
        document.querySelectorAll(".tab[data-block]").forEach(function (tab) {
          const on = tab.getAttribute("data-block") === block;
          tab.classList.toggle("is-active", on);
          if (on) {
            tab.setAttribute("aria-current", "page");
          } else {
            tab.removeAttribute("aria-current");
          }
        });
        render();
        if (block === "intake") {
          showIntakeBillHint();
        }
      }

      // ==========================================

      function bindIntakeEvents() {
      document.getElementById("intake-include-roof").addEventListener("change", syncIntakeRoofUi);
      billNextEl.addEventListener("click", function () {
        setActiveBlock("summary");
      });
      document.getElementById("intake-new-project").addEventListener("click", function () {
        if (!window.confirm("Очистить параметры проекта и начать новый расчёт? Цены прайс-листа сохранятся.")) {
          return;
        }
        resetProjectToZero();
        summaryIncludeFoundEl.checked = true;
        summaryIncludeWallsEl.checked = false;
        summaryIncludePlasterEl.checked = false;
        summaryIncludeFloorEl.checked = false;
        summaryIncludeRoofEl.checked = false;
        document.getElementById("intake-include-found").checked = true;
        document.getElementById("intake-include-walls").checked = false;
        document.getElementById("intake-include-plaster").checked = false;
        document.getElementById("intake-include-floor").checked = false;
        document.getElementById("intake-include-roof").checked = false;
        syncIntakeRoofUi();
        syncIntakeFromProject();
        setIntakeStatus("Новый проект: укажите размеры и выберите нужные части строительства.", false);
        setActiveBlock("intake");
      });
      intakeForm.addEventListener("submit", function (event) {
        event.preventDefault();
        applyIntakeQuestionnaire();
      });

      }
