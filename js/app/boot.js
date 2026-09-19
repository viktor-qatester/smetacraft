      // MODULE: DOM EVENTS & BOOT
      // ==========================================
      document.querySelectorAll(".tab[data-block]").forEach(function (tab) {
        tab.addEventListener("click", function () {
          setActiveBlock(tab.getAttribute("data-block"));
        });
      });

      slabUi.bindEvents({
        form, gradeEl, concretePriceEl, render,
        syncRoofFootprintFromFoundation, syncFloorFromFoundation,
        syncWallsPerimeterFromFoundation
      });

      stripUi.bindEvents({
        stripForm, stripGradeEl, stripConcretePriceEl, pilesBodyEl,
        render, syncRoofFootprintFromFoundation, syncFloorFromFoundation,
        syncWallsPerimeterFromFoundation, syncPilesUi, pileRowTemplate
      });

      bindWallsEvents();
      bindPlasterEvents();
      bindFloorEvents();
      bindRoofEvents();
      bindPriceEvents();
      bindProjectEvents();
      bindBackendCheck();

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
