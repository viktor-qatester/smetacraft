      const PILE_DIAMETERS = [200, 250, 300, 350, 400];

      function nextPileId() {
        pileSeq += 1;
        return pileSeq;
      }

      function syncPileSeq() {
        let max = 0;
        const nodes = pilesBodyEl.querySelectorAll("[data-pile-id]");
        for (let i = 0; i < nodes.length; i++) {
          const n = Number(nodes[i].getAttribute("data-pile-id"));
          if (n > max) {
            max = n;
          }
        }
        pileSeq = max;
      }

      function pileRowTemplate(opts) {
        const options = opts || {};
        const id = options.id != null ? Number(options.id) : nextPileId();
        if (id > pileSeq) {
          pileSeq = id;
        }
        const locked = Boolean(options.locked);
        const name = options.name != null ? String(options.name) : "";
        const diameterMm = options.diameterMm != null ? Number(options.diameterMm) : 300;
        const depthM = options.depthM != null ? String(options.depthM) : "2.5";
        const count = options.count != null ? String(options.count) : "10";
        const tr = document.createElement("tr");
        tr.className = "pile-row";
        tr.id = "pile-row-" + id;
        tr.setAttribute("data-pile-id", String(id));
        if (locked) {
          tr.setAttribute("data-pile-locked", "true");
        }
        const nameCell = document.createElement("td");
        const nameInput = document.createElement("input");
        nameInput.id = "pile-name-" + id;
        nameInput.className = "js-pile-name";
        nameInput.type = "text";
        nameInput.setAttribute("placeholder", "Под террасу");
        nameInput.setAttribute("autocomplete", "off");
        nameInput.value = name;
        nameCell.appendChild(nameInput);
        tr.appendChild(nameCell);
        const diameterCell = document.createElement("td");
        const select = document.createElement("select");
        select.id = "pile-diameter-" + id;
        select.className = "js-pile-diameter";
        PILE_DIAMETERS.forEach(function (diameter) {
          const option = document.createElement("option");
          option.value = String(diameter);
          option.textContent = String(diameter);
          select.appendChild(option);
        });
        select.value = String(diameterMm);
        diameterCell.appendChild(select);
        tr.appendChild(diameterCell);
        [["depth", depthM, "decimal", "0.1", "0.1"], ["count", count, "numeric", "1", "1"]].forEach(function (item) {
          const td = document.createElement("td");
          const input = document.createElement("input");
          input.id = "pile-" + item[0] + "-" + id;
          input.className = "js-pile-" + item[0];
          input.type = "number";
          input.setAttribute("inputmode", item[2]);
          input.setAttribute("step", item[3]);
          input.setAttribute("min", item[4]);
          input.setAttribute("autocomplete", "off");
          input.value = item[1];
          td.appendChild(input);
          tr.appendChild(td);
        });
        const actionCell = document.createElement("td");
        actionCell.className = "pile-action";
        const action = document.createElement(locked ? "span" : "button");
        action.className = locked ? "pile-locked" : "btn-text js-pile-del";
        if (!locked) {
          action.type = "button";
          action.setAttribute("aria-label", "Удалить группу свай");
        }
        action.textContent = locked ? "—" : "Удалить 🗑️";
        actionCell.appendChild(action);
        tr.appendChild(actionCell);
        return tr;
      }

      function defaultPileRow() {
        return pileRowTemplate({
          id: 1,
          locked: true,
          name: "Основная группа",
          diameterMm: 300,
          depthM: "2.5",
          count: "20",
        });
      }

      function ensureDefaultPileRow() {
        if (!pilesBodyEl.querySelector(".pile-row")) {
          pileSeq = 0;
          pilesBodyEl.appendChild(defaultPileRow());
        }
      }

      function syncPilesUi() {
        const on = pilesEnabledEl.checked;
        pilesBoxEl.classList.toggle("is-open", on);
        pilesBoxEl.setAttribute("aria-hidden", on ? "false" : "true");
        if (on) {
          ensureDefaultPileRow();
        }
      }

      function readPilesRows() {
        const rows = [];
        const nodes = pilesBodyEl.querySelectorAll("tr.pile-row");
        for (let i = 0; i < nodes.length; i++) {
          const tr = nodes[i];
          rows.push({
            id: Number(tr.getAttribute("data-pile-id")),
            locked: tr.getAttribute("data-pile-locked") === "true",
            name: tr.querySelector(".js-pile-name").value,
            diameterMm: parseNumber(tr.querySelector(".js-pile-diameter").value),
            depthM: parseNumber(tr.querySelector(".js-pile-depth").value),
            count: parseNumber(tr.querySelector(".js-pile-count").value),
          });
        }
        return rows;
      }

      function getPilesData() {
        if (!pilesEnabledEl.checked) {
          return [];
        }
        const rows = readPilesRows();
        const data = [];
        for (let i = 0; i < rows.length; i++) {
          data.push({
            id: rows[i].id,
            name: rows[i].name,
            diameterMm: rows[i].diameterMm,
            depthM: rows[i].depthM,
            count: rows[i].count,
          });
        }
        return data;
      }

      function writePilesState(list) {
        const rows = Array.isArray(list) && list.length ? list : [];
        while (pilesBodyEl.firstElementChild) {
          pilesBodyEl.firstElementChild.remove();
        }
        if (!rows.length) {
          pileSeq = 0;
          pilesBodyEl.appendChild(defaultPileRow());
        } else {
          rows.forEach(function (item, index) {
            pilesBodyEl.appendChild(
              pileRowTemplate({
                id: item && item.id != null ? item.id : index + 1,
                locked: index === 0,
                name: item && item.name != null ? item.name : "",
                diameterMm: item && item.diameterMm != null ? item.diameterMm : 300,
                depthM: item && item.depthM != null ? item.depthM : "2.5",
                count: item && item.count != null ? item.count : "10",
              })
            );
          });
        }
        syncPileSeq();
      }
