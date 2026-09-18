      // MODULE: ENGINE — SLAB
      // ==========================================
      // Phase 4F: use the extracted slab calculator.
      var calculateSlab = SmetaCraftSlabCore.createCalculator({
        BOARD_LENGTH, BOARD_THICK, BOARD_WIDTH, COMPACTION, CONCRETE_RESERVE,
        HYDRO_OVERLAP, OVERLAP_DIAMETERS, ROD_LENGTH, ROLL_AREA, STAKE_EXTRA,
        STAKE_SPACING, TIMBER_SIZE, TIMBER_STOCK, WIRE_RATE, formatQty,
        isZeroSize, kgPerMeter, barCount, lengthWithSplices
      });

      // Phase 4A: the strip/pile engine is loaded before this inline script.
      var calculateStrip = SmetaCraftStripCore.createCalculator({
        BOARD_LENGTH, BOARD_THICK, BOARD_WIDTH, COMPACTION, CONCRETE_RESERVE,
        COVER, HOOK_DIAMETERS, HOOK_MIN, HYDRO_OVERLAP, OVERLAP_DIAMETERS,
        PILE_CONCRETE_LOSS, PILE_LONG_BARS, PILE_LONG_KG_M, PILE_REBAR_RESERVE,
        PILE_ROSTRVERK, PILE_RUBEROID_RESERVE, PILE_STIRRUP_INNER,
        PILE_STIRRUP_KG_M, PILE_STIRRUP_STEP, PILE_WIRE_KG_NODE, PILE_WIRE_NODES,
        ROD_LENGTH, ROLL_AREA, STAKE_EXTRA, STAKE_SPACING, TIMBER_SIZE,
        TIMBER_STOCK, WIRE_RATE, formatQty, isZeroSize, kgPerMeter, barCount,
        lengthWithSplices, stirrupBarLength
      });

      const slabUi = SmetaCraftSlabUi.createController({
        document, parseNumber, formatQty, slabIsEmpty, calculateSlab,
        showZeroBill: (...args) => showZeroBill(...args),
        showBillError: (...args) => showBillError(...args),
        showBill: (...args) => showBill(...args), errorEl
      });
      var readForm = slabUi.readForm;
      var validate = slabUi.validate;

      const stripUi = SmetaCraftStripUi.createController({
        document, parseNumber, formatQty, COVER, stirrupBarLength,
        pilesEnabledEl, getPilesData: () => getPilesData(), stripIsEmpty, calculateStrip,
        showZeroBill: (...args) => showZeroBill(...args),
        showBillError: (...args) => showBillError(...args),
        showBill: (...args) => showBill(...args), stripErrorEl
      });
      var readStripForm = stripUi.readStripForm;
      var validateStrip = stripUi.validateStrip;

      // ==========================================
