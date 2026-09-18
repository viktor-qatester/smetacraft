
      function bindPriceEvents() {
      priceForm.addEventListener("input", render);
      priceForm.addEventListener("change", render);
      priceForm.addEventListener("submit", function (event) {
        event.preventDefault();
        render();
      });

      document.querySelectorAll(".js-goto-price").forEach(function (el) {
        el.addEventListener("click", function () {
          setActiveBlock("price");
        });
      });

      }
