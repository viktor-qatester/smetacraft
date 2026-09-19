      function bindBackendCheck() {
        const button = document.getElementById("project-server-check");
        const status = document.getElementById("project-server-status");
        button.addEventListener("click", async function () {
          let body;
          try {
            body = JSON.stringify(parseProjectText(JSON.stringify(exportProjectV1Snapshot())));
          } catch (error) {
            status.textContent = "Отправка не выполнена: текущий проект содержит некорректные данные.";
            return;
          }
          button.disabled = true;
          status.textContent = "Отправка проекта на сервер…";
          const timeout = new AbortController();
          const timer = setTimeout(function () { timeout.abort(); }, 8000);
          try {
            const response = await fetch("/api/project-check", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: body,
              signal: timeout.signal,
            });
            const result = await response.json();
            const expectedBytes = new TextEncoder().encode(body);
            const digest = await window.crypto.subtle.digest("SHA-256", expectedBytes);
            const expectedSha256 = Array.from(new Uint8Array(digest), function (byte) {
              return byte.toString(16).padStart(2, "0");
            }).join("");
            if (!response.ok || !result || result.ok !== true ||
                result.bytes !== expectedBytes.length || result.sha256 !== expectedSha256) {
              throw new Error("bad_response");
            }
            status.textContent = "Сервер принял проект v1 (" + result.bytes + " байт). Проект на сервере не сохранён.";
          } catch (error) {
            status.textContent = "Сервер не подтвердил приём проекта. Локальный проект не изменён.";
          } finally {
            clearTimeout(timer);
            button.disabled = false;
          }
        });
      }
