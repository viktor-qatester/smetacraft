      // MODULE: CONSTANTS
      // ==========================================
      const CONCRETE_RESERVE = 0.05;
      const ROD_LENGTH = 11.7;
      const OVERLAP_DIAMETERS = 40;
      const WIRE_RATE = 0.01;
      const BOARD_THICK = 0.025;
      const BOARD_WIDTH = 0.15;
      const BOARD_LENGTH = 6;
      const TIMBER_SIZE = 0.05;
      const TIMBER_STOCK = 3;
      const STAKE_SPACING = 0.6;
      const STAKE_EXTRA = 0.4;
      const COMPACTION = 1.1;
      const HYDRO_OVERLAP = 0.15;
      const ROLL_AREA = 10;
      const COVER = 0.04;
      const HOOK_MIN = 0.075;
      const HOOK_DIAMETERS = 10;
      // Порог «нулевого» габарита: ниже него узел не считается, чтобы в ведомость
      // не попали NaN/Infinity из делений и тригонометрии пустого проекта.
      const ZERO_SIZE = 1e-9;

      const SLAB_LEAD =
        "Плитный фундамент: бетон, арматура, опалубка, подушка, гидроизоляция. Цены в Br — ориентир, правьте под поставщика.";
      const STRIP_LEAD =
        "Ленточный фундамент: бетон, рабочие стержни, хомуты с гибами, опалубка с двух сторон, песчаная подушка, гидроизоляция. Цены в Br — ориентир, правьте под поставщика.";
      const WALLS_LEAD =
        "Стены и перегородки: несущие стены, проёмы, армопояс, перемычки, внутренние перегородки. Цены в Br — ориентир, правьте под прайс-лист.";
      const PLASTER_LEAD =
        "Штукатурка стен: гипсовая или ЦПС, грунтовка глубокого проникновения, маяки 6 мм, стеклосетка. Цены в Br — ориентир, правьте под поставщика.";
      const ROOF_LEAD =
        "Кровля: стропила, мауэрлат, обрешётка, утепление и покрытие. Покрытие в ведомости — м² скатов с запасом, без раскроя листов и доборов. Цены в Br — ориентир, правьте под поставщика.";
      const FLOOR_LEAD =
        "Перекрытия: деревянные балки или железобетонные плиты, утепление, пароизоляция, черновой накат. Цены в Br — ориентир, правьте под поставщика.";
      const SUMMARY_LEAD =
        "Сводная смета объекта: включите узлы, параметры читаются из их форм. Итоговая ведомость закупки по категориям, 0 токенов.";
      const PRICE_LEAD =
        "Прайс-лист: цены материалов всех узлов в одном месте. Правка цены сразу пересчитывает ведомость справа.";
      const PROJECT_LEAD =
        "Проект: сохранение и загрузка всех параметров и цен файлом JSON. Данные остаются в браузере, сервер не нужен.";
      const INTAKE_LEAD =
        "Анкета: плита и газобетон 300 мм; ленточный фундамент — вкладка «Лента». Ответьте на простые вопросы — калькулятор подставит размеры и покажет ведомость.";

      const BLOCK_LEADS = {
        intake: INTAKE_LEAD,
        slab: SLAB_LEAD,
        strip: STRIP_LEAD,
        walls: WALLS_LEAD,
        plaster: PLASTER_LEAD,
        floor: FLOOR_LEAD,
        roof: ROOF_LEAD,
        summary: SUMMARY_LEAD,
        price: PRICE_LEAD,
        project: PROJECT_LEAD,
      };

      const BILL_BLOCKS = ["slab", "strip", "walls", "floor", "plaster", "roof", "summary"];

      const PROJECT_FORMAT = "smetacraft-project";
      const PROJECT_VERSION = 1;
      const PROJECT_FILENAME = "smetacraft_project.json";
      const STORAGE_KEY = "smetacraft_project";
      const PROJECT_MAX_FILE_BYTES = 1024 * 1024;
      const PROJECT_MAX_ROWS = 500;
      const PROJECT_FIELD_IDS = new Set((
        "length width height grade concrete-price bar-diameter bar-step slab-mesh-count rebar-price wire-price board-price timber-price sand-height sand-price stone-height stone-price hydro-price " +
        "strip-length strip-width strip-height strip-grade strip-concrete-price strip-bar-diameter strip-bar-count strip-rebar-price strip-stirrup-diameter strip-stirrup-step strip-wire-price strip-board-price strip-timber-price strip-sand-height strip-sand-price strip-hydro-price pile-concrete-price pile-work-drilling-price pile-hydro-price " +
        "walls-perimeter walls-load-bearing-material walls-height walls-joint-mm wall-armopoyas-width wall-armopoyas-height walls-armopoyas-rebar walls-partition-material walls-partition-length walls-partition-height wall-block-price wall-adhesive-price wall-mesh-price partition-block-price wall-concrete-price wall-work-masonry-price wall-work-partition-price wall-work-armopoyas-price " +
        "plaster-length plaster-height plaster-sides plaster-mix plaster-thick plaster-mix-price plaster-primer-layers plaster-primer-price plaster-beacon-step plaster-beacon-price plaster-mesh-price plaster-work-price " +
        "floor-type floor-length floor-width floor-beam-section floor-beam-step floor-insulation-mm floor-slab-width floor-wood-beam-price floor-insulation-price floor-membrane-price floor-board-price floor-concrete-slab-price floor-work-wood-price floor-work-concrete-price " +
        "roof-type roof-width roof-length roof-ridge-height roof-eave roof-rafter-section roof-rafter-step roof-mauerlat-section roof-batten-step roof-batten-section roof-insulation-mm roof-covering roof-timber-price roof-board-price roof-metal-price roof-insulation-price roof-membrane-price roof-vapor-price roof-work-price"
      ).split(" "));
      const PROJECT_CHECK_IDS = new Set((
        "summary-include-found summary-include-walls summary-include-plaster summary-include-roof summary-include-floor strip-piles-enabled walls-reinforce-mesh walls-armopoyas walls-lintels walls-partitions-enabled plaster-exclude-openings plaster-mesh floor-board-clad floor-monolith roof-warm"
      ).split(" "));
      const PROJECT_FLAG_IDS = new Set((
        "roofWidthManual roofLengthManual floorLengthManual floorWidthManual wallsPerimeterManual plasterLengthManual plasterHeightManual lastFoundationBlock roofNeedsCalc floorNeedsCalc"
      ).split(" "));

      // Phase 3A: pure, inactive project model. JSON v1 and the live DOM path stay unchanged.
      const MODEL_FIELD_SPEC = {
        slab: "length:m width:m height:m grade:text bar-diameter:mm bar-step:mm slab-mesh-count:count sand-height:m stone-height:m",
        strip: "strip-length:m strip-width:m strip-height:m strip-grade:text strip-bar-diameter:mm strip-bar-count:count strip-stirrup-diameter:mm strip-stirrup-step:mm strip-sand-height:m",
        walls: "walls-perimeter:m walls-load-bearing-material:text walls-height:m walls-joint-mm:mm wall-armopoyas-width:mm wall-armopoyas-height:mm walls-armopoyas-rebar:mm walls-partition-material:text walls-partition-length:m walls-partition-height:m",
        plaster: "plaster-length:m plaster-height:m plaster-sides:count plaster-mix:text plaster-thick:mm plaster-primer-layers:count plaster-beacon-step:m",
        floor: "floor-type:text floor-length:m floor-width:m floor-beam-section:text floor-beam-step:m floor-insulation-mm:mm floor-slab-width:m",
        roof: "roof-type:text roof-width:m roof-length:m roof-ridge-height:m roof-eave:m roof-rafter-section:text roof-rafter-step:mm roof-mauerlat-section:text roof-batten-step:mm roof-batten-section:text roof-insulation-mm:mm roof-covering:text",
        prices: "concrete-price:m3 rebar-price:kg wire-price:kg board-price:piece timber-price:piece sand-price:m3 stone-price:m3 hydro-price:roll strip-concrete-price:m3 strip-rebar-price:kg strip-wire-price:kg strip-board-price:piece strip-timber-price:piece strip-sand-price:m3 strip-hydro-price:roll pile-concrete-price:m3 pile-work-drilling-price:m pile-hydro-price:m2 wall-block-price:m3 wall-adhesive-price:bag wall-mesh-price:m partition-block-price:m3 wall-concrete-price:m3 wall-work-masonry-price:m3 wall-work-partition-price:m2 wall-work-armopoyas-price:m plaster-mix-price:bag plaster-primer-price:can plaster-beacon-price:piece plaster-mesh-price:roll plaster-work-price:m2 floor-wood-beam-price:m3 floor-insulation-price:m3 floor-membrane-price:m2 floor-board-price:m3 floor-concrete-slab-price:piece floor-work-wood-price:m2 floor-work-concrete-price:piece roof-timber-price:m3 roof-board-price:m3 roof-metal-price:m2 roof-insulation-price:m3 roof-membrane-price:roll roof-vapor-price:roll roof-work-price:m2"
      };

      function modelFieldEntries() {
        const entries = [];
        Object.keys(MODEL_FIELD_SPEC).forEach(function (group) {
          MODEL_FIELD_SPEC[group].split(" ").forEach(function (item) {
            const parts = item.split(":");
            entries.push({ group: group, id: parts[0], unit: parts[1] });
          });
        });
        return entries;
      }

      function modelValue(raw, unit, applicable) {
        if (unit === "text") {
          return { state: "known", value: String(raw), raw: raw, unit: unit, applicable: applicable };
        }
        const source = typeof raw === "string" ? raw.trim().replace(",", ".") : raw;
        const numeric = source === "" ? NaN : Number(source);
        return { state: Number.isFinite(numeric) ? "known" : raw === "" ? "unknown" : "unparsed",
          value: Number.isFinite(numeric) ? numeric : null, raw: raw, unit: unit, applicable: applicable };
      }

      function modelApplicable(id, checks) {
        if (id === "roof-insulation-mm") return checks["roof-warm"] !== false;
        if (id.indexOf("walls-partition-") === 0) return checks["walls-partitions-enabled"] !== false;
        return true;
      }

      function projectV1ToModel(project, preserveDomExtras) {
        const state = validateProjectV1(project);
        const model = {
          schemaVersion: 1,
          compatibility: { format: PROJECT_FORMAT, version: PROJECT_VERSION },
          scope: { checks: {}, radios: {} },
          slab: {}, strip: {}, walls: {}, plaster: {}, floor: {}, roof: {}, prices: {},
          openings: state.openings.map(function (row) { return Object.assign({}, row); }),
          piles: state.piles.map(function (row) { return Object.assign({}, row); }),
          relationships: {},
          viewState: { flags: {} }
        };
        modelFieldEntries().forEach(function (entry) {
          if (Object.prototype.hasOwnProperty.call(state.fields, entry.id)) {
            model[entry.group][entry.id] = modelValue(state.fields[entry.id], entry.unit,
              modelApplicable(entry.id, state.checks));
          } else {
            model[entry.group][entry.id] = { state: "unknown", value: null, unit: entry.unit,
              applicable: modelApplicable(entry.id, state.checks) };
          }
        });
        Object.keys(state.checks).forEach(function (id) { model.scope.checks[id] = state.checks[id]; });
        Object.keys(state.radios).forEach(function (id) { model.scope.radios[id] = state.radios[id]; });
        Object.keys(state.flags).forEach(function (id) {
          if (id === "roofNeedsCalc" || id === "floorNeedsCalc") model.viewState.flags[id] = state.flags[id];
          else model.relationships[id] = state.flags[id];
        });
        if (state.block !== undefined) model.viewState.block = state.block;
        if (state.billBlock !== undefined) model.viewState.billBlock = state.billBlock;
        if (preserveDomExtras) {
          model.compatibility.domExtras = { fields: {}, checks: {} };
          Object.keys(project.fields || {}).forEach(function (id) {
            if (!PROJECT_FIELD_IDS.has(id)) model.compatibility.domExtras.fields[id] = project.fields[id];
          });
          Object.keys(project.checks || {}).forEach(function (id) {
            if (!PROJECT_CHECK_IDS.has(id)) model.compatibility.domExtras.checks[id] = project.checks[id];
          });
        }
        return model;
      }

      function modelExportValue(cell) {
        if (cell.state !== "known" || !Object.prototype.hasOwnProperty.call(cell, "raw")) return cell.raw;
        if (cell.unit === "text") return String(cell.raw) === cell.value ? cell.raw : cell.value;
        const source = typeof cell.raw === "string" ? cell.raw.trim().replace(",", ".") : cell.raw;
        return Number(source) === cell.value ? cell.raw : cell.value;
      }

      function modelToProjectV1(model, preserveDomExtras) {
        if (!model || model.schemaVersion !== 1 || !model.compatibility ||
            model.compatibility.format !== PROJECT_FORMAT || model.compatibility.version !== PROJECT_VERSION) {
          throw projectError("неверная версия внутренней модели.");
        }
        const output = { format: PROJECT_FORMAT, version: PROJECT_VERSION,
          fields: {}, checks: Object.assign({}, model.scope.checks),
          radios: Object.assign({}, model.scope.radios),
          openings: model.openings.map(function (row) { return Object.assign({}, row); }),
          piles: model.piles.map(function (row) { return Object.assign({}, row); }),
          flags: Object.assign({}, model.relationships, model.viewState.flags) };
        modelFieldEntries().forEach(function (entry) {
          const cell = model[entry.group][entry.id];
          if (cell && Object.prototype.hasOwnProperty.call(cell, "raw")) output.fields[entry.id] = modelExportValue(cell);
        });
        if (model.viewState.block !== undefined) output.block = model.viewState.block;
        if (model.viewState.billBlock !== undefined) output.billBlock = model.viewState.billBlock;
        const validated = validateProjectV1(output);
        if (preserveDomExtras && model.compatibility.domExtras) {
          Object.assign(validated.fields, model.compatibility.domExtras.fields);
          Object.assign(validated.checks, model.compatibility.domExtras.checks);
        }
        return validated;
      }

      const BILL_PRINT_SUB = "Предварительная ведомость выбранных материалов";
      const SUMMARY_PRINT_SUB = "Предварительная ведомость выбранных частей";

      const CAT_ORDER = [
        { id: "concrete", title: "Бетон и растворы" },
        { id: "metal", title: "Арматура и металл" },
        { id: "masonry", title: "Кладочные материалы" },
        { id: "dry", title: "Сухие смеси" },
        { id: "timber", title: "Пиломатериалы" },
        { id: "isol", title: "Изоляция и расходники" },
      ];

      const WALL_CUT_RESERVE = 0.05;
      const WALL_REBAR_MM = 8;
      const WALL_BARS_PER_BELT = 2;
      const WALL_ROWS_PER_BELT = 4;
      const LINTEL_BEARING = 0.25;
      const GLUE_KG_PER_M3 = 25;
      const GLUE_BAG_KG = 25;
      const FOAM_M2_PER_CAN = 10;
      const MORTAR_DRY_KG_PER_M3 = 1700;
      const MORTAR_BAG_KG = 25;
      const BRICK_V_JOINT = 0.01;
      const BRICK_H_JOINT = 0.012;
      const FRAME_SCREWS_PER_OPENING = 8;
      const SCREW_PACK = 100;
      const PALLET_M3 = 1.8;
      const PLASTER_LOSS = 0.05;
      const GYPSUM_RATE = 8.5;
      const CPS_RATE = 16;
      const GYPSUM_BAG_KG = 30;
      const CPS_BAG_KG = 25;
      const PRIMER_L_PER_M2 = 0.15;
      const PRIMER_RESERVE = 0.1;
      const PRIMER_CAN_L = 10;
      const BEACON_LENGTH = 3;
      const MESH_ROLL_M2 = 50;
      const MESH_OVERLAP = 0.1;
      const PILE_CONCRETE_LOSS = 0.1;
      const PILE_REBAR_RESERVE = 0.05;
      const PILE_ROSTRVERK = 0.4;
      const PILE_LONG_BARS = 4;
      const PILE_LONG_KG_M = 0.888;
      const PILE_STIRRUP_STEP = 0.25;
      const PILE_STIRRUP_KG_M = 0.222;
      const PILE_STIRRUP_INNER = 0.1;
      const PILE_WIRE_KG_NODE = 0.002;
      const PILE_WIRE_NODES = 4;
      const PILE_RUBEROID_RESERVE = 0.15;

      const ROOF_TIMBER_RESERVE = 1.05;
      const ROOF_MEMBRANE_OVERLAP = 1.15;
      const ROOF_MEMBRANE_ROLL = 75;
      const ROOF_INSULATION_FRAME = 0.9;
      const ROOF_COVER_METAL_RESERVE = 1.1;
      const ROOF_COVER_PROFILED_RESERVE = 1.08;
      const ROOF_COVER_SOFT_RESERVE = 1.05;
      const ROOF_COUNTER_BATTON = 0.05;

      const FLOOR_TIMBER_RESERVE = 1.05;
      const FLOOR_INSULATION_RESERVE = 1.05;
      const FLOOR_MEMBRANE_LAYERS = 2;
      const FLOOR_MEMBRANE_OVERLAP = 1.1;
      const FLOOR_BOARD_THICK = 0.025;
      const FLOOR_BOARD_RESERVE = 1.1;
      const FLOOR_JOINT_CONCRETE = 0.05;
      const FLOOR_JOINT_RESERVE = 1.05;
      const FLOOR_MONO_HEIGHT = 0.22;
      const FLOOR_MONO_RESERVE = 1.05;
      const FLOOR_MONO_MIN_LEFT = 0.05;
      const FLOOR_REBAR_KG_M3 = 80;

      // ==========================================
