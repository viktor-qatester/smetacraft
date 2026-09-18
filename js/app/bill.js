      // MODULE: BILL UI
      // ==========================================
      function rowHtml(item) {
        return (
          "<tr>" +
          "<td>" +
          item.name +
          "</td>" +
          '<td class="num">' +
          item.netLabel +
          "</td>" +
          '<td class="num">' +
          formatQty(item.k, 2) +
          "</td>" +
          '<td class="num">' +
          item.orderLabel +
          "</td>" +
          '<td class="num">' +
          formatMoney(item.cost) +
          "</td>" +
          "</tr>"
        );
      }

      function stampPrintDate() {
        printDateEl.textContent = new Date().toLocaleDateString("ru-BY", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        });
      }

      function classifyMaterial(name) {
        if (name.indexOf("Бетон ") === 0 || name === "Песок" || name === "Щебень" || name.indexOf("Бурение") === 0) {
          return "concrete";
        }
        if (
          name.indexOf("Арматура") === 0 ||
          name.indexOf("Хомуты") === 0 ||
          name.indexOf("Вязальная") === 0 ||
          name.indexOf("Перемычки") === 0 ||
          name.indexOf("Маячковый") === 0
        ) {
          return "metal";
        }
        if (
          name.indexOf("Газоблок") === 0 ||
          name.indexOf("Кирпич") === 0 ||
          name.indexOf("Сетка кладочная") === 0
        ) {
          return "masonry";
        }
        if (name.indexOf("Кровля —") === 0) {
          return "timber";
        }
        if (
          name.indexOf("Клей для блоков") === 0 ||
          name.indexOf("Кладочный раствор") === 0 ||
          name.indexOf("Гипсовая штукатурка") === 0 ||
          name.indexOf("Цементно-песчаная штукатурка") === 0
        ) {
          return "dry";
        }
        if (name.indexOf("Доска") === 0 || name.indexOf("Брус") === 0) {
          return "timber";
        }
        return "isol";
      }

      function groupedBillHtml(rows) {
        const buckets = {};
        CAT_ORDER.forEach(function (cat) {
          buckets[cat.id] = [];
        });
        rows.forEach(function (item) {
          const id = classifyMaterial(item.name);
          if (!buckets[id]) {
            buckets[id] = [];
          }
          buckets[id].push(item);
        });
        let html = "";
        CAT_ORDER.forEach(function (cat) {
          const list = buckets[cat.id];
          if (!list.length) {
            return;
          }
          html += '<tr class="cat-row"><td colspan="5">' + cat.title + "</td></tr>";
          html += list.map(rowHtml).join("");
        });
        return html;
      }

      function setPrintHead(sub, nodes) {
        printSubEl.textContent = sub;
        printNodesEl.textContent = nodes || "";
      }

      const BILL_SECTIONS = [
        { id: "foundation", label: "фундамент" },
        { id: "walls", label: "стены и перегородки" },
        { id: "floor", label: "перекрытия" },
        { id: "plaster", label: "штукатурка" },
        { id: "roof", label: "кровля" },
      ];

      function updateBillScope(rows, options) {
        const single = {
          slab: { id: "foundation", label: "плитный фундамент" },
          strip: { id: "foundation", label: "ленточный фундамент" },
          walls: { id: "walls", label: "стены и перегородки" },
          floor: { id: "floor", label: "перекрытия" },
          plaster: { id: "plaster", label: "штукатурка" },
          roof: { id: "roof", label: "кровля" },
        };
        const sections = rows.length
          ? (options && options.sections) || [single[billBlock]].filter(Boolean)
          : [];
        const included = new Set(sections.map(function (section) { return section.id; }));
        const missing = BILL_SECTIONS.filter(function (section) { return !included.has(section.id); });
        billScopeEl.textContent = sections.length
          ? "Рассчитано: " + sections.map(function (section) { return section.label; }).join(", ") + "."
          : "Пока ничего не рассчитано.";
        billExcludedEl.textContent = missing.length
          ? "Не рассчитано: " + missing.map(function (section) { return section.label; }).join(", ") + "."
          : "Все доступные разделы включены. Другие работы и инженерные системы в ведомость не входят.";
        billScopeEl.hidden = false;
        billExcludedEl.hidden = false;
        billNextEl.hidden = billBlock === "summary" || !rows.length;
      }

      function showBill(rows, total, meta, options) {
        errorEl.classList.remove("visible");
        stripErrorEl.classList.remove("visible");
        wallsErrorEl.classList.remove("visible");
        plasterErrorEl.classList.remove("visible");
        floorErrorEl.classList.remove("visible");
        roofErrorEl.classList.remove("visible");
        summaryErrorEl.classList.remove("visible");
        billEmptyEl.hidden = true;
        billWrapEl.hidden = false;
        billPrintEl.hidden = false;
        billMetaEl.textContent = meta;
        updateBillScope(rows, options);
        billBodyEl.innerHTML =
          options && options.grouped ? groupedBillHtml(rows) : rows.map(rowHtml).join("");
        billTotalEl.textContent = formatMoney(total);
        setPrintHead(
          options && options.printTitle ? options.printTitle : BILL_PRINT_SUB,
          options && options.printNodes ? options.printNodes : ""
        );
        stampPrintDate();
      }

      function showBillError(message, errorNode) {
        errorNode.textContent = message;
        errorNode.classList.add("visible");
        billWrapEl.hidden = true;
        billPrintEl.hidden = true;
        billEmptyEl.hidden = false;
        billEmptyEl.textContent = "Заполните размеры и цены слева.";
        billMetaEl.textContent = "";
        billScopeEl.hidden = true;
        billExcludedEl.hidden = true;
        billNextEl.hidden = true;
        setPrintHead(BILL_PRINT_SUB, "");
      }

      // Пустой (только что созданный) проект — не ошибка ввода: ведомость показывает
      // честный ноль вместо требования заполнить размеры.
      function showZeroBill(meta, options) {
        showBill([], 0, meta, options);
      }

      function slabIsEmpty(input) {
        return isZeroSize(input.length) || isZeroSize(input.width) || isZeroSize(input.height);
      }

      function stripIsEmpty(input) {
        return isZeroSize(input.length) || isZeroSize(input.width) || isZeroSize(input.height);
      }

      function wallsIsEmpty(input) {
        return isZeroSize(input.perimeter) || isZeroSize(input.height);
      }

      function plasterIsEmpty(input) {
        return isZeroSize(input.length) || isZeroSize(input.wallHeight);
      }

      function roofIsEmpty(input) {
        return isZeroSize(input.width) || isZeroSize(input.length) || isZeroSize(input.ridgeHeight);
      }

      function floorIsEmpty(input) {
        return isZeroSize(input.length) || isZeroSize(input.width);
      }

      // ==========================================
