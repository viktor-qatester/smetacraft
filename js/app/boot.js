      // MODULE: DOM EVENTS & BOOT
      // ==========================================
      document.querySelectorAll(".tab[data-block]").forEach(function (tab) {
        tab.addEventListener("click", function () {
          setActiveBlock(tab.getAttribute("data-block"));
        });
      });

      slabUi.bindEvents({
        form, gradeEl, concretePriceEl, barDiameterEl, rodLengthEl, render,
        syncRoofFootprintFromFoundation, syncFloorFromFoundation,
        syncWallsPerimeterFromFoundation
      });

      stripUi.bindEvents({
        stripForm, stripGradeEl, stripConcretePriceEl, stripBarDiameterEl,
        stripRodLengthEl, pilesBodyEl, render, syncRoofFootprintFromFoundation,
        syncFloorFromFoundation, syncWallsPerimeterFromFoundation, syncPilesUi,
        pileRowTemplate
      });

      bindWallsEvents();
      bindPlasterEvents();
      bindFloorEvents();
      bindRoofEvents();
      bindPriceEvents();
      bindProjectEvents();
      bindBackendCheck();
      bindProjectMigration();
      bindDocumentImport();

      projectFileEl.addEventListener("change", handleProjectFileChange);

      document.getElementById("project-form").addEventListener("submit", function (event) {
        event.preventDefault();
      });

      billPrintEl.addEventListener("click", function () {
        stampPrintDate();
        window.print();
      });

      bindSummaryEvents();

      bindIntakeEvents();

      syncWallsUi();
      syncPlasterMeshUi();
      syncRoofInsulationUi();
      syncFloorTypeUi();
      syncOpeningSeq();
      syncPileSeq();
      syncPilesUi();
      demoProjectSnapshot = collectProject();
      runRegressionTests();
      const storedProjectPresent = hasStoredProjectValue();
      const hadStoredProject = loadFromLocalStorage();
      if (!hadStoredProject) {
        applyDemoTemplate();
        syncIntakeFromProject();
        applyIntakeCustomerDefaults();
        if (!storedProjectPresent) {
          saveToLocalStorage();
        }
        setActiveBlock("intake");
      }

      const releaseEl = document.getElementById("app-release");
      if (releaseEl && typeof fetch === "function") {
        fetch("version.json", { cache: "no-store" })
          .then(function (response) { return response.ok ? response.json() : null; })
          .then(function (data) {
            if (data && data.releaseId) releaseEl.textContent = String(data.releaseId);
          })
          .catch(function () {});
        fetch("api/version", { cache: "no-store" })
          .then(function (response) { return response.ok ? response.json() : null; })
          .then(function (data) {
            if (!data || data.ok !== true || !data.releaseId) return;
            releaseEl.textContent = String(data.releaseId);
          })
          .catch(function () {});
      }
