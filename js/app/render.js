      // MODULE: RENDER & TABS
      // ==========================================
      function renderSlab() {
        slabUi.renderSlab(readForm(), validate);
      }

      function renderStrip() {
        stripUi.renderStrip(readStripForm(), validateStrip);
      }

      function render() {
        syncCurrencyUi();
        if (billBlock === "strip") {
          renderStrip();
        } else if (billBlock === "walls") {
          renderWalls();
        } else if (billBlock === "plaster") {
          renderPlaster();
        } else if (billBlock === "floor") {
          renderFloor();
        } else if (billBlock === "roof") {
          renderRoof();
        } else if (billBlock === "summary") {
          renderSummary();
        } else {
          renderSlab();
        }
        saveToLocalStorage();
      }

      // ==========================================
