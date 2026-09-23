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
        return isLoopbackHost();
      }

      function isDocumentImportHostAllowed() {
        return isAllowedServerOrigin();
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

      function factStatusClass(status) {
        if (status === "confirmed") return "preview-status-confirmed";
        if (status === "needs_review") return "preview-status-review";
        if (status === "conflict") return "preview-status-conflict";
        return "preview-status-manual";
      }

      function renderDocumentPreview(preview) {
        const wrap = document.getElementById("project-document-preview-wrap");
        const message = document.getElementById("project-document-preview-message");
        const applyBtn = document.getElementById("project-document-apply");
        const body = document.getElementById("project-document-preview-body");
        if (!wrap || !message || !applyBtn || !body) return;
        clearDocumentPreviewTable();
        const rows = previewRows(preview || {});
        rows.forEach(function (item) {
          const row = document.createElement("tr");
          const checkCell = document.createElement("td");
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.className = "js-fact-apply";
          checkbox.value = item.fieldId;
          checkbox.checked = item.defaultSelected === true;
          checkbox.disabled = item.selectable !== true;
          checkCell.appendChild(checkbox);
          const nameCell = document.createElement("td");
          nameCell.textContent = item.label;
          const valueCell = document.createElement("td");
          valueCell.textContent = item.valueText;
          const pageCell = document.createElement("td");
          pageCell.textContent = item.pageText;
          const evidenceCell = document.createElement("td");
          evidenceCell.className = "js-fact-evidence";
          evidenceCell.textContent = item.evidence;
          const targetCell = document.createElement("td");
          targetCell.textContent = item.targetText;
          const statusCell = document.createElement("td");
          statusCell.className = factStatusClass(item.status);
          statusCell.textContent = item.warning ? item.statusLabel + ". " + item.warning : item.statusLabel;
          row.appendChild(checkCell);
          row.appendChild(nameCell);
          row.appendChild(valueCell);
          row.appendChild(pageCell);
          row.appendChild(evidenceCell);
          row.appendChild(targetCell);
          row.appendChild(statusCell);
          body.appendChild(row);
        });
        message.textContent = preview && preview.message ? preview.message : "";
        const selectable = rows.some(function (item) { return item.selectable; });
        applyBtn.disabled = !selectable;
        applyBtn.hidden = false;
        wrap.hidden = false;
      }

      function readSelectedFactIds() {
        const body = document.getElementById("project-document-preview-body");
        if (!body || typeof body.querySelectorAll !== "function") return null;
        const nodes = body.querySelectorAll("input.js-fact-apply");
        const ids = [];
        for (let i = 0; i < nodes.length; i++) {
          if (nodes[i].checked && !nodes[i].disabled) ids.push(nodes[i].value);
        }
        return ids;
      }

      function applySelectedDocumentFacts(facts, selectedIds) {
        const plan = planDocumentFactApply(facts, selectedIds);
        if (plan.errors.length) {
          const error = new Error(plan.errors[0]);
          error.errors = plan.errors;
          throw error;
        }
        const snapshot = collectProject();
        const candidate = JSON.parse(JSON.stringify(snapshot));
        candidate.fields = candidate.fields || {};
        candidate.flags = candidate.flags || {};
        Object.keys(plan.fields).forEach(function (id) {
          if (!PROJECT_FIELD_IDS.has(id) || DOCUMENT_PRICE_FIELD_IDS[id] || id === "currency") return;
          candidate.fields[id] = plan.fields[id];
        });
        if (plan.fields["walls-perimeter"] !== undefined) candidate.flags.wallsPerimeterManual = true;
        if (plan.fields["roof-width"] !== undefined) candidate.flags.roofWidthManual = true;
        if (plan.fields["roof-length"] !== undefined) candidate.flags.roofLengthManual = true;
        if (plan.fields["floor-length"] !== undefined) candidate.flags.floorLengthManual = true;
        if (plan.fields["floor-width"] !== undefined) candidate.flags.floorWidthManual = true;
        if (plan.fields["plaster-length"] !== undefined) candidate.flags.plasterLengthManual = true;
        if (plan.fields["plaster-height"] !== undefined) candidate.flags.plasterHeightManual = true;
        if (plan.pile) {
          const existing = Array.isArray(candidate.piles) && candidate.piles.length ? candidate.piles[0] : null;
          const row = {
            id: existing && existing.id ? existing.id : 1,
            locked: true,
            name: existing && typeof existing.name === "string" ? existing.name : "",
            diameterMm: existing && existing.diameterMm ? existing.diameterMm : 300,
            depthM: existing && existing.depthM != null ? existing.depthM : 2.5,
            count: existing && existing.count != null ? existing.count : 10,
          };
          if (plan.pile.diameterMm != null) row.diameterMm = plan.pile.diameterMm;
          if (plan.pile.depthM != null) row.depthM = plan.pile.depthM;
          if (plan.pile.count != null) row.count = plan.pile.count;
          const rest = Array.isArray(candidate.piles) ? candidate.piles.slice(1) : [];
          candidate.piles = [row].concat(rest);
        }
        const validated = validateProjectV1(candidate);
        return applyProject(validated);
      }

      function revokeDocumentViewerUrl() {
        const iframe = document.getElementById("project-document-viewer");
        if (!iframe) return;
        if (!iframe.dataset) iframe.dataset = {};
        if (iframe.dataset.blobUrl) {
          try { URL.revokeObjectURL(iframe.dataset.blobUrl); } catch (error) {}
          iframe.dataset.blobUrl = "";
        }
      }

      function setDocumentClearVisible(visible) {
        const clearBtn = document.getElementById("project-document-clear");
        if (clearBtn) clearBtn.hidden = !visible;
      }

      function createPdfObjectUrl(file) {
        try {
          return URL.createObjectURL(file);
        } catch (error) {
          return "";
        }
      }

      function showDocumentViewer(file, mediaType, preview, objectUrl) {
        const wrap = document.getElementById("project-document-viewer-wrap");
        const meta = document.getElementById("project-document-viewer-meta");
        const banner = document.getElementById("project-document-viewer-banner");
        const iframe = document.getElementById("project-document-viewer");
        const textEl = document.getElementById("project-document-text-preview");
        if (!wrap || !meta || !iframe || !textEl) return;
        if (!iframe.dataset) iframe.dataset = {};
        revokeDocumentViewerUrl();
        const pages = preview && preview.pageCount ? preview.pageCount : 1;
        const name = file && file.name ? file.name : "файл";
        const isDrawingPlot = preview && preview.sourceKind === "drawing-plot";
        if (banner) banner.hidden = !isDrawingPlot;
        if (mediaType === "application/pdf") {
          iframe.hidden = false;
          textEl.hidden = true;
          textEl.textContent = "";
          if (objectUrl) {
            iframe.src = objectUrl;
            iframe.dataset.blobUrl = objectUrl;
          }
          meta.textContent = "Просмотр PDF «" + name + "», листов: " + pages + ".";
        } else {
          iframe.hidden = true;
          iframe.removeAttribute("src");
          textEl.hidden = false;
          const extracted = preview && preview.extractedText
            ? String(preview.extractedText).replace(/^\s+|\s+$/g, "")
            : "";
          textEl.textContent = extracted || (preview && preview.message ? preview.message : "Текст DOCX не найден.");
          meta.textContent = "Просмотр текста DOCX «" + name + "».";
          if (objectUrl) {
            try { URL.revokeObjectURL(objectUrl); } catch (error) {}
          }
        }
        wrap.hidden = false;
      }

      function hideDocumentViewer() {
        const wrap = document.getElementById("project-document-viewer-wrap");
        const meta = document.getElementById("project-document-viewer-meta");
        const banner = document.getElementById("project-document-viewer-banner");
        const iframe = document.getElementById("project-document-viewer");
        const textEl = document.getElementById("project-document-text-preview");
        revokeDocumentViewerUrl();
        if (iframe) {
          iframe.hidden = true;
          iframe.removeAttribute("src");
          iframe.src = "";
          if (!iframe.dataset) iframe.dataset = {};
          iframe.dataset.blobUrl = "";
        }
        if (textEl) {
          textEl.hidden = true;
          textEl.textContent = "";
        }
        if (banner) banner.hidden = true;
        if (meta) meta.textContent = "";
        if (wrap) wrap.hidden = true;
      }

      function hideDocumentPreview() {
        const wrap = document.getElementById("project-document-preview-wrap");
        const message = document.getElementById("project-document-preview-message");
        const applyBtn = document.getElementById("project-document-apply");
        clearDocumentPreviewTable();
        if (message) message.textContent = "";
        if (applyBtn) {
          applyBtn.disabled = true;
          applyBtn.hidden = true;
        }
        if (wrap) wrap.hidden = true;
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

      function usableDocumentCapability(receipt) {
        return Boolean(receipt && receipt.projectId && receipt.capabilityToken);
      }

      function documentServerErrorCode(error) {
        if (!error) return "error";
        if (error.name === "AbortError") return "timeout";
        if (error.httpStatus) return String(error.httpStatus);
        const message = error.message ? String(error.message) : "";
        if (message === "Failed to fetch" || message === "NetworkError") return "network";
        if (message === "need_server_copy") return "need_server_copy";
        if (message) return message.replace(/^Error:\s*/i, "").slice(0, 40);
        return "error";
      }

      function attachHttpStatus(error, status) {
        if (error && status) error.httpStatus = status;
        return error;
      }

      function restoreLocalProjectIfChanged(localProjectBefore) {
        const afterStorage = window.localStorage.getItem(STORAGE_KEY);
        if (afterStorage !== localProjectBefore && localProjectBefore !== null) {
          try { window.localStorage.setItem(STORAGE_KEY, localProjectBefore); } catch (error) {}
        }
      }

      async function createDocumentServerProject() {
        if (typeof buildCanonicalProjectBody !== "function" || typeof sha256HexFromString !== "function") {
          throw new Error("need_server_copy");
        }
        let body;
        let expectedSha256;
        try {
          body = buildCanonicalProjectBody();
          expectedSha256 = await sha256HexFromString(body);
        } catch (error) {
          throw new Error("invalid_project");
        }
        const prior = documentReceiptFromMigration();
        let idempotencyKey;
        if (prior && prior.idempotencyKey && prior.sha256 === expectedSha256) {
          idempotencyKey = prior.idempotencyKey;
        } else if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
          idempotencyKey = crypto.randomUUID();
        } else {
          throw new Error("need_server_copy");
        }
        const localProjectBefore = window.localStorage.getItem(STORAGE_KEY);
        const timeout = new AbortController();
        const timer = setTimeout(function () { timeout.abort(); }, DOCUMENT_UPLOAD_TIMEOUT_MS);
        try {
          const response = await fetch("/api/projects/migrate", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": idempotencyKey,
            },
            body: body,
            signal: timeout.signal,
          });
          let result;
          try {
            result = await response.json();
          } catch (parseError) {
            throw attachHttpStatus(new Error("bad_response"), response.status);
          }
          if (!response.ok || !result || result.ok !== true || !result.projectId) {
            throw attachHttpStatus(
              new Error(result && result.error ? result.error : "bad_response"),
              response.status
            );
          }
          let capabilityToken = result.capabilityToken;
          if (!capabilityToken && prior && prior.capabilityToken && prior.projectId === result.projectId) {
            capabilityToken = prior.capabilityToken;
          }
          if (!capabilityToken) {
            throw attachHttpStatus(new Error("capability_token_missing"), response.status);
          }
          const receipt = {
            receiptVersion: 1,
            idempotencyKey: idempotencyKey,
            sha256: expectedSha256,
            projectId: result.projectId,
            revision: result.revision,
            capabilityToken: capabilityToken,
            state: "sending",
          };
          if (typeof writeMigrationReceipt === "function") {
            writeMigrationReceipt(receipt);
          }
          try {
            const readResponse = await fetch("/api/projects/" + result.projectId, {
              headers: { Authorization: "Bearer " + capabilityToken },
              signal: timeout.signal,
            });
            let readResult;
            try {
              readResult = await readResponse.json();
            } catch (readParseError) {
              readResult = null;
            }
            if (readResponse.ok && readResult && readResult.ok === true && readResult.project) {
              receipt.state = "server verified";
              receipt.verifiedAt = new Date().toISOString();
              if (typeof writeMigrationReceipt === "function") {
                writeMigrationReceipt(receipt);
              }
            }
          } catch (readbackError) {
            // Tokens from migrate are enough to upload the file.
          }
          restoreLocalProjectIfChanged(localProjectBefore);
          return receipt;
        } catch (error) {
          restoreLocalProjectIfChanged(localProjectBefore);
          throw error;
        } finally {
          clearTimeout(timer);
        }
      }

      async function ensureDocumentProjectCapability() {
        const existing = documentReceiptFromMigration();
        if (usableDocumentCapability(existing)) {
          return existing;
        }
        const created = await createDocumentServerProject();
        if (usableDocumentCapability(created)) {
          return created;
        }
        throw new Error("need_server_copy");
      }

      var documentImportState = null;

      async function readFileBytes(file) {
        if (file && typeof file.arrayBuffer === "function") {
          return new Uint8Array(await file.arrayBuffer());
        }
        throw new Error("invalid_file");
      }

      function parseSelectedDocument(bytes, declaredType) {
        const detected = detectMediaType(bytes, declaredType);
        if (!detected) throw new Error("unsupported_media_type");
        return { mediaType: detected, preview: parseDocument(bytes, detected) };
      }

      async function tryServerDocumentUpload(file, mediaType, localProjectBefore) {
        const capability = await ensureDocumentProjectCapability();
        const timeout = new AbortController();
        const timer = setTimeout(function () { timeout.abort(); }, DOCUMENT_UPLOAD_TIMEOUT_MS);
        try {
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
            throw attachHttpStatus(new Error("bad_response"), response.status);
          }
          if (!response.ok || !payload || payload.ok !== true || !payload.preview) {
            throw attachHttpStatus(
              new Error(payload && payload.error ? payload.error : "bad_response"),
              response.status
            );
          }
          restoreLocalProjectIfChanged(localProjectBefore);
          return {
            projectId: capability.projectId,
            capabilityToken: capability.capabilityToken,
            objectId: payload.objectId,
            preview: payload.preview,
          };
        } finally {
          clearTimeout(timer);
        }
      }

      function setDocumentImportOutcome(file, mediaType, preview, storedOnServer, serverError) {
        const objectUrl = mediaType === "application/pdf" ? createPdfObjectUrl(file) : "";
        showDocumentViewer(file, mediaType, preview, objectUrl);
        renderDocumentPreview(preview);
        setDocumentClearVisible(true);
        const found = Object.keys(preview.parameters || {}).length;
        const serverNote = storedOnServer
          ? " Файл сохранён у сметы."
          : (serverError
            ? " Файл открыт в браузере. Ошибка записи на сервер (" + documentServerErrorCode(serverError) + ")."
            : " Файл открыт в браузере.");
        if (found === 0) {
          setDocumentImportStatus(
            "Автоподстановка 0 — введите параметры вручную по чертежу." + serverNote + " Цены не менялись.",
            false
          );
        } else {
          setDocumentImportStatus(
            (storedOnServer ? "Файл сохранён. " : "") +
              "Предпросмотр: будет подставлено полей — " + found +
              ". Нажмите «Применить», чтобы перенести их в калькулятор. Цены не подставляются." +
              (storedOnServer ? "" : serverNote),
            false
          );
        }
      }

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
        if (!isDocumentImportHostAllowed()) {
          setDocumentImportStatus("Загрузка PDF/DOCX доступна на сервере сметы, не на статическом сайте.", true);
          input.value = "";
          return;
        }
        const localProjectBefore = window.localStorage.getItem(STORAGE_KEY);
        let storedOnServer = false;
        let preview = null;
        let parsedMediaType = mediaType;
        let serverError = null;
        try {
          if (isDocumentImportHostAllowed()) {
            setDocumentImportStatus("Загрузка файла на сервер…", false);
            try {
              const uploaded = await tryServerDocumentUpload(file, mediaType, localProjectBefore);
              storedOnServer = true;
              preview = uploaded.preview;
              documentImportState = {
                storedOnServer: true,
                projectId: uploaded.projectId,
                capabilityToken: uploaded.capabilityToken,
                objectId: uploaded.objectId,
                preview: uploaded.preview,
              };
            } catch (uploadError) {
              storedOnServer = false;
              serverError = uploadError;
            }
          }
          if (!preview) {
            setDocumentImportStatus("Чтение файла в браузере…", false);
            const bytes = await readFileBytes(file);
            const parsed = parseSelectedDocument(bytes, mediaType);
            parsedMediaType = parsed.mediaType;
            preview = parsed.preview;
            restoreLocalProjectIfChanged(localProjectBefore);
            documentImportState = {
              storedOnServer: false,
              preview: preview,
            };
          }
          setDocumentImportOutcome(file, parsedMediaType, preview, storedOnServer, serverError);
        } catch (error) {
          restoreLocalProjectIfChanged(localProjectBefore);
          setDocumentImportStatus("Файл не разобран. Локальный проект не изменён.", true);
        } finally {
          if (input) input.value = "";
        }
      }

      async function handleDocumentApply() {
        if (!documentImportState || !documentImportState.preview) return;
        const parameters = documentImportState.preview.parameters || {};
        const selectedIds = readSelectedFactIds();
        const foundCount = selectedIds ? selectedIds.length : Object.keys(parameters).length;
        const localProjectBefore = window.localStorage.getItem(STORAGE_KEY);
        if (selectedIds && selectedIds.length === 0) {
          setDocumentImportStatus("Ни одна строка не выбрана. Проект не изменён.", false);
          return;
        }
        try {
          if (selectedIds) {
            applySelectedDocumentFacts(documentImportState.preview.facts || [], selectedIds);
          } else {
            applyDocumentImportParameters(parameters);
          }
          if (documentImportState.storedOnServer && documentImportState.projectId && documentImportState.objectId) {
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
              // Params already applied locally; original file remains stored if the server kept it.
            } finally {
              clearTimeout(timer);
            }
          }
          setDocumentImportStatus(
            foundCount
              ? "Параметры из файла применены (" + foundCount +
                "). Цены прайс-листа не менялись." +
                (documentImportState.storedOnServer ? " Файл сохранён у сметы." : " Файл на сервер не отправлялся.")
              : "Применять было нечего: в файле нет явных подписей." +
                (documentImportState.storedOnServer ? " Файл сохранён." : " Файл открыт в браузере."),
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

      async function handleDocumentClear() {
        const input = document.getElementById("project-document-file");
        const nameEl = document.getElementById("project-document-file-name");
        const state = documentImportState;
        hideDocumentViewer();
        hideDocumentPreview();
        documentImportState = null;
        if (input) input.value = "";
        if (nameEl) nameEl.textContent = "Файл не выбран";
        setDocumentClearVisible(false);
        if (state && state.storedOnServer && state.projectId && state.objectId && state.capabilityToken) {
          const timeout = new AbortController();
          const timer = setTimeout(function () { timeout.abort(); }, DOCUMENT_UPLOAD_TIMEOUT_MS);
          try {
            await fetch(
              "/api/projects/" + state.projectId + "/files/" + state.objectId,
              {
                method: "DELETE",
                headers: { Authorization: "Bearer " + state.capabilityToken },
                signal: timeout.signal,
              }
            );
          } catch (deleteError) {
            // UI is already cleared; server copy is optional.
          } finally {
            clearTimeout(timer);
          }
        }
        setDocumentImportStatus("Файл убран. Можно выбрать другой PDF или DOCX.", false);
      }

      function bindDocumentImport() {
        const fieldset = document.getElementById("project-document-import-fieldset");
        const input = document.getElementById("project-document-file");
        const applyBtn = document.getElementById("project-document-apply");
        const clearBtn = document.getElementById("project-document-clear");
        if (!isDocumentImportHostAllowed()) {
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
        if (clearBtn) {
          clearBtn.hidden = true;
          clearBtn.addEventListener("click", function () {
            handleDocumentClear();
          });
        }
      }
