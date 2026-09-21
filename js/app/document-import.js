      // MODULE: DOCUMENT IMPORT (Phase 8)
      // ==========================================
      const DOCUMENT_UPLOAD_TIMEOUT_MS = 20000;
      const DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;
      const DOCUMENT_PRICE_FIELD_IDS = (function () {
        const ids = {};
        String(MODEL_FIELD_SPEC.prices || "").split(" ").forEach(function (item) {
          const id = item.split(":")[0];
          if (id) ids[id] = true;
        });
        return ids;
      }());

      function isDocumentImportLoopback() {
        const host = window.location.hostname;
        return host === "localhost" || host === "127.0.0.1";
      }

      function guessDocumentMediaType(file) {
        if (file && file.type === "application/pdf") return "application/pdf";
        if (file && file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
          return file.type;
        }
        const name = file && file.name ? String(file.name).toLowerCase() : "";
        if (name.endsWith(".pdf")) return "application/pdf";
        if (name.endsWith(".docx")) {
          return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        }
        return "";
      }

      function applyDocumentImportParameters(parameters) {
        const overlay = parameters && typeof parameters === "object" ? parameters : {};
        const keys = Object.keys(overlay).filter(function (id) {
          return PROJECT_FIELD_IDS.has(id) && !DOCUMENT_PRICE_FIELD_IDS[id];
        });
        if (keys.length === 0) {
          return 0;
        }
        const snapshot = collectProject();
        const candidate = JSON.parse(JSON.stringify(snapshot));
        candidate.fields = candidate.fields || {};
        candidate.flags = candidate.flags || {};
        keys.forEach(function (id) {
          candidate.fields[id] = overlay[id];
        });
        if (overlay["walls-perimeter"] !== undefined) candidate.flags.wallsPerimeterManual = true;
        if (overlay["roof-width"] !== undefined) candidate.flags.roofWidthManual = true;
        if (overlay["roof-length"] !== undefined) candidate.flags.roofLengthManual = true;
        if (overlay["floor-length"] !== undefined) candidate.flags.floorLengthManual = true;
        if (overlay["floor-width"] !== undefined) candidate.flags.floorWidthManual = true;
        if (overlay["plaster-length"] !== undefined) candidate.flags.plasterLengthManual = true;
        if (overlay["plaster-height"] !== undefined) candidate.flags.plasterHeightManual = true;
        const validated = validateProjectV1(candidate);
        return applyProject(validated);
      }

      function setDocumentImportStatus(message, isError) {
        const status = document.getElementById("project-document-status");
        if (!status) return;
        status.textContent = message;
        if (isError) status.classList.add("is-error");
        else status.classList.remove("is-error");
      }

      function clearDocumentPreviewTable() {
        const body = document.getElementById("project-document-preview-body");
        if (!body) return;
        while (body.firstChild) body.removeChild(body.firstChild);
      }

      function renderDocumentPreview(preview) {
        const wrap = document.getElementById("project-document-preview-wrap");
        const message = document.getElementById("project-document-preview-message");
        const applyBtn = document.getElementById("project-document-apply");
        const body = document.getElementById("project-document-preview-body");
        if (!wrap || !message || !applyBtn || !body) return;
        clearDocumentPreviewTable();
        const fields = preview && Array.isArray(preview.fields) ? preview.fields : [];
        fields.forEach(function (field) {
          const row = document.createElement("tr");
          const nameCell = document.createElement("td");
          nameCell.textContent = field.label || field.fieldId;
          const statusCell = document.createElement("td");
          if (field.status === "found") {
            statusCell.textContent = "Найдено в файле — будет подставлено: " +
              String(field.value) + (field.unit ? " " + field.unit : "");
          } else {
            statusCell.textContent = "Не найдено — введите вручную по чертежу";
          }
          row.appendChild(nameCell);
          row.appendChild(statusCell);
          body.appendChild(row);
        });
        message.textContent = preview && preview.message ? preview.message : "";
        const foundCount = preview && preview.parameters ? Object.keys(preview.parameters).length : 0;
        applyBtn.disabled = foundCount === 0;
        applyBtn.hidden = false;
        wrap.hidden = false;
      }

      function revokeDocumentViewerUrl() {
        const iframe = document.getElementById("project-document-viewer");
        if (iframe && iframe.dataset && iframe.dataset.blobUrl) {
          try { URL.revokeObjectURL(iframe.dataset.blobUrl); } catch (error) {}
          iframe.dataset.blobUrl = "";
        }
      }

      function showDocumentViewer(file, mediaType, preview, objectUrl) {
        const wrap = document.getElementById("project-document-viewer-wrap");
        const meta = document.getElementById("project-document-viewer-meta");
        const iframe = document.getElementById("project-document-viewer");
        const textEl = document.getElementById("project-document-text-preview");
        if (!wrap || !meta || !iframe || !textEl) return;
        revokeDocumentViewerUrl();
        const pages = preview && preview.pageCount ? preview.pageCount : 1;
        const name = file && file.name ? file.name : "файл";
        if (mediaType === "application/pdf") {
          iframe.hidden = false;
          textEl.hidden = true;
          textEl.textContent = "";
          iframe.src = objectUrl;
          iframe.dataset.blobUrl = objectUrl;
          meta.textContent = "Просмотр PDF «" + name + "», листов: " + pages + ".";
        } else {
          iframe.hidden = true;
          iframe.removeAttribute("src");
          textEl.hidden = false;
          textEl.textContent = preview && preview.message
            ? preview.message + "\n\nDOCX хранится у сметы. Предпросмотр подстановки — в таблице ниже."
            : "DOCX хранится у сметы.";
          meta.textContent = "Просмотр DOCX «" + name + "». Листы PDF-вьюера недоступны; текст разобран для подписей.";
          if (objectUrl) {
            try { URL.revokeObjectURL(objectUrl); } catch (error) {}
          }
        }
        wrap.hidden = false;
      }

      function documentReceiptFromMigration() {
        try {
          if (typeof readMigrationReceipt === "function") {
            return readMigrationReceipt();
          }
        } catch (error) {
          return null;
        }
        return null;
      }

      async function ensureDocumentProjectCapability() {
        const existing = documentReceiptFromMigration();
        if (existing && existing.state === "server verified" && existing.projectId && existing.capabilityToken) {
          return existing;
        }
        if (typeof runProjectMigration === "function") {
          await runProjectMigration();
        }
        const after = documentReceiptFromMigration();
        if (after && after.state === "server verified" && after.projectId && after.capabilityToken) {
          return after;
        }
        throw new Error("need_server_copy");
      }

      let documentImportState = null;

      async function handleDocumentFileChange() {
        const input = document.getElementById("project-document-file");
        const nameEl = document.getElementById("project-document-file-name");
        const applyBtn = document.getElementById("project-document-apply");
        const file = input && input.files && input.files[0];
        if (!file) return;
        if (nameEl) nameEl.textContent = file.name;
        documentImportState = null;
        if (applyBtn) applyBtn.disabled = true;
        const mediaType = guessDocumentMediaType(file);
        if (!mediaType) {
          setDocumentImportStatus("Нужен файл PDF или DOCX.", true);
          input.value = "";
          return;
        }
        if (file.size > DOCUMENT_MAX_BYTES) {
          setDocumentImportStatus("Файл больше 5 МиБ. Загрузка не выполнена.", true);
          input.value = "";
          return;
        }
        const localProjectBefore = window.localStorage.getItem(STORAGE_KEY);
        setDocumentImportStatus("Загрузка файла на сервер…", false);
        const timeout = new AbortController();
        const timer = setTimeout(function () { timeout.abort(); }, DOCUMENT_UPLOAD_TIMEOUT_MS);
        try {
          const capability = await ensureDocumentProjectCapability();
          const response = await fetch("/api/projects/" + capability.projectId + "/files", {
            method: "POST",
            headers: {
              "Content-Type": mediaType,
              Authorization: "Bearer " + capability.capabilityToken,
              "X-Smetacraft-Filename": file.name,
            },
            body: file,
            signal: timeout.signal,
          });
          let payload;
          try {
            payload = await response.json();
          } catch (parseError) {
            throw new Error("bad_response");
          }
          if (!response.ok || !payload || payload.ok !== true || !payload.preview) {
            throw new Error(payload && payload.error ? payload.error : "bad_response");
          }
          const afterStorage = window.localStorage.getItem(STORAGE_KEY);
          if (afterStorage !== localProjectBefore && localProjectBefore !== null) {
            try { window.localStorage.setItem(STORAGE_KEY, localProjectBefore); } catch (error) {}
          }
          const objectUrl = mediaType === "application/pdf" ? URL.createObjectURL(file) : "";
          showDocumentViewer(file, mediaType, payload.preview, objectUrl);
          renderDocumentPreview(payload.preview);
          documentImportState = {
            projectId: capability.projectId,
            capabilityToken: capability.capabilityToken,
            objectId: payload.objectId,
            preview: payload.preview,
          };
          const found = Object.keys(payload.preview.parameters || {}).length;
          if (found === 0) {
            setDocumentImportStatus(
              "Файл сохранён у сметы. Автоподстановка 0 — введите параметры вручную по чертежу. Цены не менялись.",
              false
            );
          } else {
            setDocumentImportStatus(
              "Файл сохранён. Предпросмотр: будет подставлено полей — " + found +
                ". Нажмите «Применить», чтобы перенести их в калькулятор. Цены не подставляются.",
              false
            );
          }
        } catch (error) {
          const current = window.localStorage.getItem(STORAGE_KEY);
          if (current !== localProjectBefore && localProjectBefore !== null) {
            try { window.localStorage.setItem(STORAGE_KEY, localProjectBefore); } catch (restoreError) {}
          }
          if (error && error.name === "AbortError") {
            setDocumentImportStatus("Сервер не ответил. Локальный проект не изменён.", true);
          } else if (error && error.message === "need_server_copy") {
            setDocumentImportStatus(
              "Сначала перенесите копию сметы на сервер кнопкой «Перенести копию на сервер».",
              true
            );
          } else {
            setDocumentImportStatus("Загрузка не выполнена. Локальный проект не изменён.", true);
          }
        } finally {
          clearTimeout(timer);
          if (input) input.value = "";
        }
      }

      async function handleDocumentApply() {
        if (!documentImportState || !documentImportState.preview) return;
        const parameters = documentImportState.preview.parameters || {};
        const foundCount = Object.keys(parameters).length;
        const localProjectBefore = window.localStorage.getItem(STORAGE_KEY);
        try {
          applyDocumentImportParameters(parameters);
          const ackTimeout = new AbortController();
          const timer = setTimeout(function () { ackTimeout.abort(); }, DOCUMENT_UPLOAD_TIMEOUT_MS);
          try {
            await fetch(
              "/api/projects/" + documentImportState.projectId + "/files/" +
                documentImportState.objectId + "/apply",
              {
                method: "POST",
                headers: { Authorization: "Bearer " + documentImportState.capabilityToken },
                signal: ackTimeout.signal,
              }
            );
          } catch (ackError) {
            // Params already applied locally; original file remains stored.
          } finally {
            clearTimeout(timer);
          }
          setDocumentImportStatus(
            foundCount
              ? "Параметры из файла применены (" + foundCount +
                "). Цены прайс-листа не менялись. Файл сохранён у сметы."
              : "Применять было нечего: в файле нет явных подписей. Файл сохранён.",
            false
          );
        } catch (error) {
          const current = window.localStorage.getItem(STORAGE_KEY);
          if (current !== localProjectBefore && localProjectBefore !== null) {
            try { window.localStorage.setItem(STORAGE_KEY, localProjectBefore); } catch (restoreError) {}
          }
          setDocumentImportStatus("Применение не выполнено. Локальный проект не изменён.", true);
        }
      }

      function bindDocumentImport() {
        const fieldset = document.getElementById("project-document-import-fieldset");
        const input = document.getElementById("project-document-file");
        const applyBtn = document.getElementById("project-document-apply");
        if (!isDocumentImportLoopback()) {
          if (fieldset) fieldset.hidden = true;
          return;
        }
        if (fieldset) fieldset.hidden = false;
        if (input) input.addEventListener("change", handleDocumentFileChange);
        if (applyBtn) {
          applyBtn.disabled = true;
          applyBtn.addEventListener("click", function () {
            handleDocumentApply();
          });
        }
      }
