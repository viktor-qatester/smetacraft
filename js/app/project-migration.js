      // MODULE: PROJECT MIGRATION (Phase 7.3)
      // ==========================================
      const MIGRATION_TIMEOUT_MS = 8000;

      function isMigrationLoopbackHost() {
        return isAllowedServerOrigin();
      }

      async function sha256HexFromString(text) {
        const bytes = new TextEncoder().encode(text);
        const digest = await window.crypto.subtle.digest("SHA-256", bytes);
        return Array.from(new Uint8Array(digest), function (byte) {
          return byte.toString(16).padStart(2, "0");
        }).join("");
      }

      function buildCanonicalProjectBody() {
        return JSON.stringify(parseProjectText(JSON.stringify(exportProjectV1Snapshot())));
      }

      function readMigrationReceipt() {
        try {
          const raw = window.localStorage.getItem(MIGRATION_RECEIPT_KEY);
          if (!raw) {
            return null;
          }
          const receipt = JSON.parse(raw);
          if (!receipt || receipt.receiptVersion !== 1) {
            return null;
          }
          return receipt;
        } catch (error) {
          return null;
        }
      }

      function writeMigrationReceipt(receipt) {
        try {
          window.localStorage.setItem(MIGRATION_RECEIPT_KEY, JSON.stringify(receipt));
          return true;
        } catch (error) {
          return false;
        }
      }

      async function currentProjectDigest() {
        try {
          const body = buildCanonicalProjectBody();
          return { body: body, sha256: await sha256HexFromString(body) };
        } catch (error) {
          return null;
        }
      }

      function migrationDisplayState(receipt, currentSha256) {
        if (!receipt) {
          return "local only";
        }
        if (receipt.sha256 && receipt.sha256 !== currentSha256) {
          return "local only";
        }
        if (receipt.state === "server verified") {
          return "server verified";
        }
        if (receipt.state === "failed") {
          return "failed";
        }
        return "local only";
      }

      function migrationStatusMessage(state, receipt) {
        if (state === "server verified" && receipt) {
          return "Копия на сервере проверена чтением. projectId: " + receipt.projectId +
            ", " + (receipt.verifiedAt || "");
        }
        if (state === "failed" && receipt) {
          return "Перенос не выполнен. Локальный проект не изменён." +
            (receipt.lastError ? " (" + receipt.lastError + ")" : "");
        }
        return "Проект хранится только в этом браузере.";
      }

      async function refreshMigrationUi() {
        const fieldset = document.getElementById("project-migration-fieldset");
        const button = document.getElementById("project-migrate");
        const status = document.getElementById("project-migration-status");
        if (!fieldset || !button || !status) {
          return;
        }
        if (!isMigrationLoopbackHost() || !hasStoredProjectValue()) {
          fieldset.hidden = true;
          return;
        }
        fieldset.hidden = false;
        const digestInfo = await currentProjectDigest();
        if (!digestInfo) {
          status.textContent = "Перенос недоступен: текущий проект содержит некорректные данные.";
          button.disabled = true;
          return;
        }
        button.disabled = false;
        const receipt = readMigrationReceipt();
        const state = migrationDisplayState(receipt, digestInfo.sha256);
        status.textContent = migrationStatusMessage(state, receipt);
      }

      async function runProjectMigration() {
        const button = document.getElementById("project-migrate");
        const status = document.getElementById("project-migration-status");
        let body;
        let expectedSha256;
        try {
          body = buildCanonicalProjectBody();
          expectedSha256 = await sha256HexFromString(body);
        } catch (error) {
          status.textContent = "Перенос не выполнен: текущий проект содержит некорректные данные.";
          return;
        }

        const priorReceipt = readMigrationReceipt();
        let idempotencyKey;
        if (priorReceipt && priorReceipt.idempotencyKey && priorReceipt.sha256 === expectedSha256) {
          idempotencyKey = priorReceipt.idempotencyKey;
        } else {
          idempotencyKey = crypto.randomUUID();
        }

        const sendingReceipt = {
          receiptVersion: 1,
          idempotencyKey: idempotencyKey,
          sha256: expectedSha256,
          state: "sending",
        };
        if (
          priorReceipt &&
          priorReceipt.idempotencyKey === idempotencyKey &&
          priorReceipt.capabilityToken
        ) {
          sendingReceipt.capabilityToken = priorReceipt.capabilityToken;
          sendingReceipt.projectId = priorReceipt.projectId;
          sendingReceipt.revision = priorReceipt.revision;
        }
        writeMigrationReceipt(sendingReceipt);

        const localProjectBefore = window.localStorage.getItem(STORAGE_KEY);
        button.disabled = true;
        status.textContent = "Отправка и проверка…";

        const timeout = new AbortController();
        const timer = setTimeout(function () { timeout.abort(); }, MIGRATION_TIMEOUT_MS);

        function restoreLocalProjectIfNeeded() {
          const current = window.localStorage.getItem(STORAGE_KEY);
          if (current !== localProjectBefore && localProjectBefore !== null) {
            try {
              window.localStorage.setItem(STORAGE_KEY, localProjectBefore);
            } catch (error) {
              return;
            }
          }
        }

        function failedReceiptFields(errorCode) {
          const fields = {
            receiptVersion: 1,
            idempotencyKey: idempotencyKey,
            sha256: expectedSha256,
            state: "failed",
            lastError: errorCode,
          };
          const current = readMigrationReceipt();
          if (current && current.capabilityToken) {
            fields.capabilityToken = current.capabilityToken;
            fields.projectId = current.projectId;
            fields.revision = current.revision;
          }
          return fields;
        }

        function markFailed(errorCode) {
          writeMigrationReceipt(failedReceiptFields(errorCode));
          status.textContent = "Перенос не выполнен. Локальный проект не изменён. (" + errorCode + ")";
        }

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
            throw new Error("bad_response");
          }
          if (!response.ok || !result || result.ok !== true || !result.projectId) {
            throw new Error(result && result.error ? result.error : "bad_response");
          }
          if (result.sha256 !== expectedSha256) {
            throw new Error("digest_mismatch");
          }

          if (result.capabilityToken) {
            writeMigrationReceipt({
              receiptVersion: 1,
              idempotencyKey: idempotencyKey,
              sha256: expectedSha256,
              projectId: result.projectId,
              revision: result.revision,
              capabilityToken: result.capabilityToken,
              state: "sending",
            });
          }

          let capabilityToken = result.capabilityToken;
          if (!capabilityToken) {
            const tokenSource = readMigrationReceipt() || priorReceipt;
            if (tokenSource && tokenSource.capabilityToken && tokenSource.projectId === result.projectId) {
              capabilityToken = tokenSource.capabilityToken;
            }
          }
          if (!capabilityToken) {
            throw new Error("capability_token_missing");
          }

          if (!result.capabilityToken) {
            writeMigrationReceipt({
              receiptVersion: 1,
              idempotencyKey: idempotencyKey,
              sha256: expectedSha256,
              projectId: result.projectId,
              revision: result.revision,
              capabilityToken: capabilityToken,
              state: "sending",
            });
          }

          const readResponse = await fetch("/api/projects/" + result.projectId, {
            headers: { Authorization: "Bearer " + capabilityToken },
            signal: timeout.signal,
          });
          let readResult;
          try {
            readResult = await readResponse.json();
          } catch (readParseError) {
            throw new Error("readback_failed");
          }
          if (!readResponse.ok || !readResult || readResult.ok !== true || !readResult.project) {
            throw new Error(readResult && readResult.error ? readResult.error : "readback_failed");
          }

          const readbackBody = JSON.stringify(parseProjectText(JSON.stringify(readResult.project)));
          const readbackSha256 = await sha256HexFromString(readbackBody);
          if (readbackSha256 !== result.sha256 || readbackSha256 !== expectedSha256) {
            throw new Error("readback_digest_mismatch");
          }

          const verifiedAt = new Date().toISOString();
          writeMigrationReceipt({
            receiptVersion: 1,
            projectId: result.projectId,
            revision: result.revision,
            sha256: expectedSha256,
            idempotencyKey: idempotencyKey,
            capabilityToken: capabilityToken,
            verifiedAt: verifiedAt,
            state: "server verified",
          });
          status.textContent = "Копия на сервере проверена чтением. projectId: " + result.projectId +
            ", " + verifiedAt;
        } catch (error) {
          restoreLocalProjectIfNeeded();
          if (error && error.name === "AbortError") {
            writeMigrationReceipt(failedReceiptFields("timeout"));
            status.textContent = "Сервер недоступен. Локальный проект не изменён.";
          } else if (!error || error.message === "Failed to fetch" || error.message === "NetworkError") {
            writeMigrationReceipt(failedReceiptFields("network"));
            status.textContent = "Сервер недоступен. Локальный проект не изменён.";
          } else {
            markFailed(error.message || "bad_response");
          }
        } finally {
          clearTimeout(timer);
          button.disabled = false;
          restoreLocalProjectIfNeeded();
        }
      }

      function bindProjectMigration() {
        const fieldset = document.getElementById("project-migration-fieldset");
        const button = document.getElementById("project-migrate");
        if (!isMigrationLoopbackHost()) {
          if (fieldset) {
            fieldset.hidden = true;
          }
          return;
        }
        const projectTab = document.querySelector('.tab[data-block="project"]');
        if (projectTab) {
          projectTab.addEventListener("click", function () {
            refreshMigrationUi();
          });
        }
        refreshMigrationUi();
        if (button) {
          button.addEventListener("click", function () {
            runProjectMigration();
          });
        }
      }
