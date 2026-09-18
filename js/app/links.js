      function foundationFootprintSource() {
        if (lastFoundationBlock === "strip" || lastFoundationBlock === "slab") {
          return lastFoundationBlock;
        }
        return summaryFoundType();
      }

      function readFoundationFootprint() {
        const source = foundationFootprintSource();
        if (source === "strip") {
          return {
            width: document.getElementById("strip-width").value,
            length: document.getElementById("strip-length").value,
          };
        }
        return {
          width: document.getElementById("width").value,
          length: document.getElementById("length").value,
        };
      }

      function syncRoofFootprintFromFoundation() {
        const footprint = readFoundationFootprint();
        if (!roofWidthManual && footprint.width !== "") {
          roofWidthEl.value = footprint.width;
        }
        if (!roofLengthManual && footprint.length !== "") {
          roofLengthEl.value = footprint.length;
        }
      }

      function syncFloorFromFoundation() {
        const footprint = readFoundationFootprint();
        if (!floorWidthManual && footprint.width !== "") {
          floorWidthEl.value = footprint.width;
        }
        if (!floorLengthManual && footprint.length !== "") {
          floorLengthEl.value = footprint.length;
        }
      }
