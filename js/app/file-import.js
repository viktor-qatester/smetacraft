      function handleProjectFileChange() {
        const file = projectFileEl.files && projectFileEl.files[0];
        if (!file) {
          return;
        }
        projectFileNameEl.textContent = file.name;
        try {
          validateProjectFileSize(file);
        } catch (error) {
          setProjectStatus("Импорт не выполнен: " + error.message, true);
          projectFileEl.value = "";
          return;
        }
        const reader = new FileReader();
        reader.onload = function () {
          try {
            const applied = applyProjectModel(parseProjectModelText(reader.result));
            setProjectStatus(
              "Проект загружен из «" + file.name + "»: восстановлено полей — " + applied + ". Смета пересчитана.",
              false
            );
          } catch (error) {
            setProjectStatus("Импорт не выполнен: " + error.message, true);
          }
          projectFileEl.value = "";
        };
        reader.onerror = function () {
          setProjectStatus("Импорт не выполнен: файл не читается.", true);
          projectFileEl.value = "";
        };
        reader.readAsText(file, "utf-8");
      }
