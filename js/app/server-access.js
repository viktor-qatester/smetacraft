      // MODULE: SERVER ACCESS (loopback + public origin)
      // ==========================================
      function isLoopbackHost() {
        try {
          const host = window.location && window.location.hostname;
          return host === "localhost" || host === "127.0.0.1";
        } catch (error) {
          return false;
        }
      }

      function parseClientOriginList(raw) {
        return String(raw || "").split(",").map(function (item) {
          return item.trim();
        }).filter(Boolean);
      }

      function readMetaPublicOrigins() {
        try {
          if (!document || typeof document.querySelector !== "function") return [];
          const meta = document.querySelector('meta[name="smetacraft-public-origin"]');
          if (!meta || typeof meta.getAttribute !== "function") return [];
          return parseClientOriginList(meta.getAttribute("content"));
        } catch (error) {
          return [];
        }
      }

      function getConfiguredPublicOrigins() {
        if (window.SMETACRAFT_PUBLIC_ORIGINS && window.SMETACRAFT_PUBLIC_ORIGINS.length) {
          return window.SMETACRAFT_PUBLIC_ORIGINS;
        }
        return readMetaPublicOrigins();
      }

      function isAllowedServerOrigin() {
        if (isLoopbackHost()) return true;
        try {
          const origin = window.location && window.location.origin;
          if (!origin) return false;
          return getConfiguredPublicOrigins().indexOf(origin) !== -1;
        } catch (error) {
          return false;
        }
      }
