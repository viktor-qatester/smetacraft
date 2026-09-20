      // MODULE: IMPORT / EXPORT
      // ==========================================
      function setProjectStatus(message, isError) {
        projectStatusEl.textContent = message;
        projectStatusEl.classList.toggle("is-error", Boolean(isError));
      }

      function readOpeningsState() {
        const list = [];
        const nodes = wallsOpeningsBody.querySelectorAll(".opening-row");
        for (let i = 0; i < nodes.length; i++) {
          list.push({
            id: Number(nodes[i].getAttribute("data-opening-id")),
            locked: nodes[i].getAttribute("data-opening-locked") === "true",
            type: nodes[i].querySelector(".js-opening-type").value,
            width: nodes[i].querySelector(".js-opening-width").value,
            height: nodes[i].querySelector(".js-opening-height").value,
            count: nodes[i].querySelector(".js-opening-count").value,
          });
        }
        return list;
      }

      function writeOpeningsState(list) {
        const rows = list.length
          ? list
          : [
              { type: "window", width: "1.5", height: "1.4", count: "4", locked: true, id: 1 },
              { type: "entry-door", width: "1.0", height: "2.1", count: "1", id: 2 },
            ];
        while (wallsOpeningsBody.firstElementChild) {
          wallsOpeningsBody.firstElementChild.remove();
        }
        rows.forEach(function (item, index) {
          const normalizedType =
            item && item.type === "interior-door" ? "entry-door" : item && item.type != null ? item.type : "window";
          const row = wallsOpeningRowTemplate({
            id: item && item.id != null ? item.id : index + 1,
            locked: item && item.locked != null ? item.locked : index === 0,
            type: normalizedType,
            width: item && item.width != null ? item.width : item && item.w != null ? item.w : "1.5",
            height: item && item.height != null ? item.height : item && item.h != null ? item.h : "1.5",
            count: item && item.count != null ? item.count : item && item.n != null ? item.n : "1",
          });
          wallsOpeningsBody.appendChild(row);
        });
        syncOpeningSeq();
      }

      function collectProject() {
        const fields = {};
        const checks = {};
        const radios = {};
        document.querySelectorAll("input[id], select[id]").forEach(function (el) {
          if (el.type === "radio" || el.type === "file") {
            return;
          }
          if (el.type === "checkbox") {
            checks[el.id] = el.checked;
          } else {
            fields[el.id] = el.value;
          }
        });
        document.querySelectorAll('input[type="radio"][name]').forEach(function (el) {
          if (el.checked) {
            radios[el.name] = el.value;
          }
        });
        return {
          format: PROJECT_FORMAT,
          version: PROJECT_VERSION,
          block: activeBlock,
          billBlock: billBlock,
          fields: fields,
          checks: checks,
          radios: radios,
          openings: readOpeningsState(),
          piles: readPilesRows(),
          flags: {
            rodLengthManual: rodLengthManual,
            stripRodLengthManual: stripRodLengthManual,
            roofWidthManual: roofWidthManual,
            roofLengthManual: roofLengthManual,
            floorLengthManual: floorLengthManual,
            floorWidthManual: floorWidthManual,
            wallsPerimeterManual: wallsPerimeterManual,
            plasterLengthManual: plasterLengthManual,
            plasterHeightManual: plasterHeightManual,
            lastFoundationBlock: lastFoundationBlock,
            roofNeedsCalc: roofNeedsCalc,
            floorNeedsCalc: floorNeedsCalc,
          },
        };
      }

      function projectModelFromDom(snapshot) {
        return projectV1ToModel(snapshot === undefined ? collectProject() : snapshot, true);
      }

      function parseProjectText(text) {
        return modelToProjectV1(parseProjectModelText(text));
      }

      function parseProjectModelText(text) {
        const raw = String(text).replace(/^\uFEFF/, "").trim();
        if (!raw) {
          throw new Error("файл пустой.");
        }
        try {
          return projectV1ToModel(JSON.parse(raw));
        } catch (jsonError) {
          if (jsonError && jsonError.projectValidation) {
            throw jsonError;
          }
          throw new Error("файл не содержит корректный JSON.");
        }
      }

      function projectError(message) {
        const error = new Error(message);
        error.projectValidation = true;
        return error;
      }

      function validateProjectFileSize(file) {
        if (file.size > PROJECT_MAX_FILE_BYTES) {
          throw projectError("файл больше 1 MiB.");
        }
      }

      function plainProjectObject(value, label) {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          throw projectError(label + ": ожидался объект.");
        }
        return value;
      }

      function projectNumber(value, label, integer) {
        const numericString = typeof value === "string" && /^\s*[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?\s*$/.test(value);
        const number = typeof value === "number" ? value : numericString ? Number(value.trim().replace(",", ".")) : NaN;
        if (!Number.isFinite(number) || (integer && (!Number.isSafeInteger(number) || number <= 0))) {
          throw projectError(label + ": ожидалось " + (integer ? "положительное целое число" : "число") + ".");
        }
        return value;
      }

      function validateProjectV1(raw) {
        const source = plainProjectObject(raw, "Проект");
        if (source.format !== PROJECT_FORMAT) {
          throw projectError("неверный format: нужен smetacraft-project.");
        }
        if (source.version !== PROJECT_VERSION) {
          throw projectError("неверная version: нужна числовая версия 1.");
        }
        const state = { format: PROJECT_FORMAT, version: PROJECT_VERSION };
        ["fields", "checks", "radios", "flags"].forEach(function (section) {
          const input = source[section] === undefined ? {} : plainProjectObject(source[section], section);
          const output = {};
          Object.keys(input).forEach(function (key) {
            if (section === "fields" && PROJECT_FIELD_IDS.has(key)) {
              const value = input[key];
              if (typeof value !== "string" && !(typeof value === "number" && Number.isFinite(value))) {
                throw projectError("fields." + key + ": ожидалась строка или конечное число.");
              }
              output[key] = value;
            } else if (section === "checks" && PROJECT_CHECK_IDS.has(key)) {
              if (typeof input[key] !== "boolean") {
                throw projectError("checks." + key + ": ожидался boolean.");
              }
              output[key] = input[key];
            } else if (section === "radios" && key === "summary-found-type") {
              if (input[key] !== "slab" && input[key] !== "strip") {
                throw projectError("radios.summary-found-type: нужны slab или strip.");
              }
              output[key] = input[key];
            } else if (section === "flags" && PROJECT_FLAG_IDS.has(key)) {
              if (key === "lastFoundationBlock") {
                if (input[key] !== "slab" && input[key] !== "strip") {
                  throw projectError("flags.lastFoundationBlock: нужны slab или strip.");
                }
              } else if (typeof input[key] !== "boolean") {
                throw projectError("flags." + key + ": ожидался boolean.");
              }
              output[key] = input[key];
            }
          });
          state[section] = output;
        });
        ["block", "billBlock"].forEach(function (key) {
          if (source[key] === undefined) return;
          if (key === "block" ? !Object.prototype.hasOwnProperty.call(BLOCK_LEADS, source[key]) : BILL_BLOCKS.indexOf(source[key]) === -1) {
            throw projectError(key + ": неизвестный раздел.");
          }
          state[key] = source[key];
        });
        ["openings", "piles"].forEach(function (key) {
          const list = source[key] === undefined ? [] : source[key];
          if (!Array.isArray(list)) {
            throw projectError(key + ": ожидался массив.");
          }
          if (list.length > PROJECT_MAX_ROWS) {
            throw projectError(key + ": максимум 500 строк.");
          }
          state[key] = list.map(function (rawRow, index) {
            const row = plainProjectObject(rawRow, key + "[" + index + "]");
            const label = key + "[" + index + "]";
            const id = row.id === undefined ? index + 1 : projectNumber(row.id, label + ".id", true);
            if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) {
              throw projectError(label + ".id: ожидалось положительное целое число.");
            }
            if (row.locked !== undefined && typeof row.locked !== "boolean") {
              throw projectError(label + ".locked: ожидался boolean.");
            }
            if (key === "openings") {
              const type = row.type === undefined ? "window" : row.type;
              if (type !== "window" && type !== "entry-door" && type !== "interior-door") {
                throw projectError(label + ".type: неизвестный тип проёма.");
              }
              const output = { id: id, locked: row.locked === undefined ? index === 0 : row.locked, type: type };
              [["width", "w", "1.5"], ["height", "h", "1.5"], ["count", "n", "1"]].forEach(function (item) {
                const value = row[item[0]] !== undefined ? row[item[0]] : row[item[1]] !== undefined ? row[item[1]] : item[2];
                output[item[0]] = projectNumber(value, label + "." + item[0], false);
              });
              return output;
            }
            if (typeof row.name !== "string" && row.name !== undefined) {
              throw projectError(label + ".name: ожидался текст.");
            }
            const name = row.name === undefined ? "" : row.name;
            if (name.length > 256) {
              throw projectError(label + ".name: максимум 256 символов.");
            }
            const diameterMm = row.diameterMm === undefined ? 300 : row.diameterMm;
            if (typeof diameterMm !== "number" || PILE_DIAMETERS.indexOf(diameterMm) === -1) {
              throw projectError(label + ".diameterMm: неверный диаметр.");
            }
            const depthM = projectNumber(row.depthM === undefined ? "2.5" : row.depthM, label + ".depthM", false);
            const count = projectNumber(row.count === undefined ? "10" : row.count, label + ".count", true);
            return { id: id, locked: index === 0, name: name, diameterMm: diameterMm, depthM: depthM, count: count };
          });
        });
        return state;
      }

      function downloadProjectFile(text) {
        const blob = new Blob([text], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = PROJECT_FILENAME;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(function () {
          URL.revokeObjectURL(url);
        }, 1000);
      }

      function applyProject(state) {
        return applyProjectModel(projectV1ToModel(state));
      }

      function applyProjectModel(model) {
        const state = modelToProjectV1(model);
        let applied = 0;

        if (Array.isArray(state.openings)) {
          writeOpeningsState(state.openings);
        }

        const fields = state.fields && typeof state.fields === "object" ? state.fields : {};
        Object.keys(fields).forEach(function (id) {
          if (!PROJECT_FIELD_IDS.has(id)) return;
          const el = document.getElementById(id);
          if (!el || el.type === "checkbox" || el.type === "radio" || el.type === "file") {
            return;
          }
          el.value = String(fields[id]);
          applied++;
        });

        const checks = state.checks && typeof state.checks === "object" ? state.checks : {};
        Object.keys(checks).forEach(function (id) {
          if (!PROJECT_CHECK_IDS.has(id)) return;
          const el = document.getElementById(id);
          if (!el || el.type !== "checkbox") {
            return;
          }
          el.checked = checks[id];
          applied++;
        });

        if (Array.isArray(state.piles)) {
          writePilesState(state.piles);
        }

        const flags = state.flags && typeof state.flags === "object" ? state.flags : {};
        if (typeof flags.rodLengthManual === "boolean") {
          rodLengthManual = flags.rodLengthManual;
        }
        if (typeof flags.stripRodLengthManual === "boolean") {
          stripRodLengthManual = flags.stripRodLengthManual;
        }
        if (typeof flags.roofWidthManual === "boolean") {
          roofWidthManual = flags.roofWidthManual;
        }
        if (typeof flags.roofLengthManual === "boolean") {
          roofLengthManual = flags.roofLengthManual;
        }
        if (typeof flags.floorLengthManual === "boolean") {
          floorLengthManual = flags.floorLengthManual;
        }
        if (typeof flags.floorWidthManual === "boolean") {
          floorWidthManual = flags.floorWidthManual;
        }
        if (typeof flags.wallsPerimeterManual === "boolean") {
          wallsPerimeterManual = flags.wallsPerimeterManual;
        }
        if (typeof flags.plasterLengthManual === "boolean") {
          plasterLengthManual = flags.plasterLengthManual;
        }
        if (typeof flags.plasterHeightManual === "boolean") {
          plasterHeightManual = flags.plasterHeightManual;
        }
        if (flags.lastFoundationBlock === "slab" || flags.lastFoundationBlock === "strip") {
          lastFoundationBlock = flags.lastFoundationBlock;
        }
        if (typeof flags.roofNeedsCalc === "boolean") {
          roofNeedsCalc = flags.roofNeedsCalc;
        }
        if (typeof flags.floorNeedsCalc === "boolean") {
          floorNeedsCalc = flags.floorNeedsCalc;
        }

        const radios = state.radios && typeof state.radios === "object" ? state.radios : {};
        const radioNodes = document.querySelectorAll('input[type="radio"][name]');
        Object.keys(radios).forEach(function (name) {
          const wanted = String(radios[name]);
          for (let i = 0; i < radioNodes.length; i++) {
            const el = radioNodes[i];
            if (el.name === name && el.value === wanted) {
              el.checked = true;
              applied++;
              return;
            }
          }
        });

        if (BILL_BLOCKS.indexOf(state.billBlock) !== -1) {
          billBlock = state.billBlock;
        } else if (BILL_BLOCKS.indexOf(state.block) !== -1) {
          billBlock = state.block;
        }

        syncWallsUi();
        syncPlasterMeshUi();
        syncRoofInsulationUi();
        syncFloorTypeUi();
        syncSummaryUi();
        syncPilesUi();

        if (state.block && BLOCK_LEADS[state.block]) {
          setActiveBlock(state.block);
        } else if (BILL_BLOCKS.indexOf(billBlock) !== -1) {
          setActiveBlock(billBlock);
        } else {
          render();
        }
        return applied;
      }

      function cloneProject(state) {
        return JSON.parse(JSON.stringify(state));
      }

      function exportProjectV1Snapshot() {
        const raw = collectProject();
        try {
          return modelToProjectV1(projectModelFromDom(raw), true);
        } catch (error) {
          if (!error || !error.projectValidation) throw error;
          // Keep the established export/autosave behavior while a form row is incomplete.
          return raw;
        }
      }

      function saveToLocalStorage() {
        if (persistSuspended) {
          return;
        }
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(exportProjectV1Snapshot()));
        } catch (error) {
          return;
        }
      }

      function readStoredProject() {
        try {
          const raw = window.localStorage.getItem(STORAGE_KEY);
          if (!raw) {
            return null;
          }
          return parseProjectModelText(raw);
        } catch (error) {
          return null;
        }
      }

      function hasStoredProjectValue() {
        try {
          return window.localStorage.getItem(STORAGE_KEY) !== null;
        } catch (error) {
          return false;
        }
      }

      function loadFromLocalStorage() {
        const state = readStoredProject();
        if (!state) {
          return false;
        }
        try {
          applyProjectModel(state);
          return true;
        } catch (error) {
          return false;
        }
      }

      function applyDemoTemplate() {
        if (!demoProjectSnapshot) {
          return;
        }
        const state = cloneProject(demoProjectSnapshot);
        state.flags = {
          rodLengthManual: false,
          stripRodLengthManual: false,
          roofWidthManual: false,
          roofLengthManual: false,
          floorLengthManual: false,
          floorWidthManual: false,
          wallsPerimeterManual: false,
          plasterLengthManual: false,
          plasterHeightManual: false,
          lastFoundationBlock: "slab",
          roofNeedsCalc: false,
          floorNeedsCalc: true,
        };
        roofNeedsCalc = false;
        floorNeedsCalc = true;
        applyProject(state);
      }

      // ==========================================

      function bindProjectEvents() {
      document.getElementById("project-reset").addEventListener("click", function () {
        if (!window.confirm("Вы уверены, что хотите очистить все данные и начать новый проект?")) {
          return;
        }
        resetProjectToZero();
        setProjectStatus(
          "Новый проект: геометрия узлов обнулена, таблицы проёмов и свай очищены, дополнительные опции сняты. Цены прайс-листа сохранены.",
          false
        );
      });

      document.getElementById("project-demo").addEventListener("click", function () {
        if (
          !window.confirm(
            "Загрузить демонстрационный проект? Текущие введённые данные будут заменены золотыми значениями (плита 8×10 м, стены 36 м, двухскатная кровля)."
          )
        ) {
          return;
        }
        applyDemoTemplate();
        saveToLocalStorage();
        setProjectStatus(
          "Загружен демо-проект: плита 8×10 м, стены 36 м, двухскатная кровля. Смета пересчитана.",
          false
        );
      });

      document.getElementById("project-export").addEventListener("click", function () {
        const text = JSON.stringify(exportProjectV1Snapshot(), null, 2);
        try {
          downloadProjectFile(text);
        } catch (error) {
          setProjectStatus("Экспорт не выполнен: " + error.message, true);
          return;
        }
        setProjectStatus("Проект сохранён в файл " + PROJECT_FILENAME + " (" + text.length + " символов).", false);
      });

      }
