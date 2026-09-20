      // MODULE: NEW PROJECT (SAFE RESET)
      // ==========================================
      // Обнуляется только геометрия объекта. Инженерные настройки (марки бетона,
      // диаметры и шаги арматуры, сечения бруса, толщина слоёв) и цены прайс-листа
      // остаются — новый проект начинается с рабочих нормативов, а не с пустых полей.
      const RESET_GEOMETRY_IDS = [
        "length",
        "width",
        "height",
        "sand-height",
        "stone-height",
        "strip-length",
        "strip-width",
        "strip-height",
        "strip-sand-height",
        "walls-perimeter",
        "walls-height",
        "walls-partition-length",
        "walls-partition-height",
        "plaster-length",
        "plaster-height",
        "floor-length",
        "floor-width",
        "roof-width",
        "roof-length",
        "roof-ridge-height",
        "roof-eave",
      ];

      const RESET_OPTION_CHECKBOX_IDS = [
        "strip-piles-enabled",
        "walls-reinforce-mesh",
        "walls-armopoyas",
        "walls-lintels",
        "walls-partitions-enabled",
        "plaster-exclude-openings",
        "plaster-mesh",
        "roof-warm",
      ];

      function clearTableBody(tbody) {
        while (tbody.firstElementChild) {
          tbody.firstElementChild.remove();
        }
      }

      function resetProjectToZero() {
        RESET_GEOMETRY_IDS.forEach(function (id) {
          const el = document.getElementById(id);
          if (el) {
            el.value = "0";
          }
        });

        RESET_OPTION_CHECKBOX_IDS.forEach(function (id) {
          const el = document.getElementById(id);
          if (el) {
            el.checked = false;
          }
        });

        clearTableBody(wallsOpeningsBody);
        openingSeq = 0;
        clearTableBody(pilesBodyEl);
        pileSeq = 0;

        rodLengthManual = false;
        stripRodLengthManual = false;
        wallsPerimeterManual = false;
        roofWidthManual = false;
        roofLengthManual = false;
        floorLengthManual = false;
        floorWidthManual = false;
        plasterLengthManual = false;
        plasterHeightManual = false;
        roofNeedsCalc = false;
        floorNeedsCalc = true;

        syncWallsUi();
        syncPlasterMeshUi();
        syncRoofInsulationUi();
        syncFloorTypeUi();
        syncSummaryUi();
        syncPilesUi();
        syncWallsPerimeterFromFoundation();
        syncRoofFootprintFromFoundation();
        syncFloorFromFoundation();
        syncPlasterFromWalls();
        render();
      }

      // ==========================================
