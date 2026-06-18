(function () {
  "use strict";

  if (window.NofidaResources) return;

  var OVERLAY_ID = "nfr-overlay";
  var FONT_CATALOG_URLS = [
    "/nofida/font-store/catalog.json?v=__NOFIDA_ASSET_TAG__",
    "/nofida/fonts/catalog.json?v=__NOFIDA_ASSET_TAG__"
  ];
  var MEDIA_CATALOG_URL = "/nofida/media-store/catalog.json?v=__NOFIDA_ASSET_TAG__";

  var PAGE_ROUTES = {
    fonts: "#/nofida/fonts",
    media: "#/nofida/media",
    figma: "#/nofida/import/figma"
  };

  var PAGES = {
    fonts: {
      title: "NOFIDA Font Catalog",
      badge: "Native workflow ready",
      intro: "Use reviewed NOFIDA fonts inside the native Fonts workflow first. The catalog remains available as a secondary resource surface for search, pairing, licensing, and download.",
      notice: "Automatic installation is not enabled in this patch. Download a reviewed font and continue through the native font upload flow when you need it in the workspace.",
      actions: [
        { label: "Open native Fonts", href: "#/dashboard", action: "native-fonts" },
        { label: "Open Media Bank", href: PAGE_ROUTES.media },
        { label: "Open Figma migration", href: PAGE_ROUTES.figma }
      ]
    },
    media: {
      title: "NOFIDA Media Bank",
      badge: "License-aware store",
      intro: "Browse same-origin assets and UI patterns with approval state, source metadata, and compact search filters. Only approved resources should be treated as usable product inventory.",
      notice: "Assets stay local to the NOFIDA store. No random hotlinks, no hidden provenance, and no copyright laundering through AI styling.",
      actions: [
        { label: "Open native Fonts", href: "#/dashboard", action: "native-fonts" },
        { label: "Open Figma migration", href: PAGE_ROUTES.figma },
        { label: "Open notices", href: "#/nofida/open-source-notices" }
      ]
    },
    figma: {
      title: "Figma Migration Assistant",
      badge: "Migration and adaptation",
      intro: "A practical migration planning surface for exports, font replacement, asset recovery, and risk reporting. It does not promise perfect 1:1 component or prototype fidelity.",
      notice: "This route is still report-first. It helps teams prepare migrations honestly before any converter work is introduced.",
      actions: [
        { label: "Open native Fonts", href: "#/dashboard", action: "native-fonts" },
        { label: "Open Media Bank", href: PAGE_ROUTES.media },
        { label: "Open notices", href: "#/nofida/open-source-notices" }
      ]
    }
  };

  var state = {
    overlayEl: null,
    lastAppHash: "#/dashboard",
    currentPageId: "",
    teamId: "",
    fontCatalog: null,
    mediaCatalog: null,
    pending: {
      fontCatalog: null,
      mediaCatalog: null
    },
    filters: {
      fonts: { query: "", category: "all" },
      nativeFonts: { query: "", category: "all" },
      media: { query: "", category: "all", license: "all" }
    },
    renderToken: 0,
    loadedPreviewFonts: {},
    nativeSyncTimer: null,
    nativeObserver: null,
    nativeInterval: null
  };

  var RESOURCE_CSS = [
    "#nfr-overlay{position:fixed;inset:0;z-index:2147483440;overflow-y:auto;color:#e5edf7;",
      "font-family:Inter,\"Segoe UI\",system-ui,sans-serif;",
      "background:linear-gradient(180deg,rgba(5,9,18,.96),rgba(8,15,28,.98))}",
    "#nfr-overlay[hidden]{display:none!important}",
    "#nfr-dynamic-fonts{display:none}",
    ".nfr-shell{max-width:1240px;margin:0 auto;padding:18px 18px 56px}",
    ".nfr-topbar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px}",
    ".nfr-back,.nfr-close,.nfr-btn,.nfr-copy-btn,.nfr-filter-select,.nfr-filter-search,.nfr-tab,.nfr-link-btn{font:inherit}",
    ".nfr-back,.nfr-close,.nfr-tab,.nfr-copy-btn{border:1px solid rgba(120,142,170,.24);background:#0d1524;color:#d8e4f0;border-radius:999px;padding:9px 12px;font-size:12px;font-weight:600;cursor:pointer}",
    ".nfr-back:hover,.nfr-close:hover,.nfr-tab:hover,.nfr-copy-btn:hover{border-color:rgba(96,165,250,.42);background:#12203a;color:#fff}",
    ".nfr-layout{display:grid;grid-template-columns:250px minmax(0,1fr);gap:16px;align-items:start}",
    ".nfr-nav-panel,.nfr-hero,.nfr-panel,.nfr-card,.nfr-native-panel{border:1px solid rgba(90,112,140,.22);background:rgba(11,18,32,.88);box-shadow:0 16px 36px rgba(0,0,0,.26)}",
    ".nfr-nav-panel{position:sticky;top:14px;border-radius:18px;padding:14px}",
    ".nfr-nav-kicker,.nfr-label{margin:0 0 8px;color:#93a8c7;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}",
    ".nfr-nav-list{display:flex;flex-direction:column;gap:8px}",
    ".nfr-nav-link{display:block;padding:9px 10px;border-radius:12px;border:1px solid transparent;color:#a9b9cf;text-decoration:none;font-size:13px;line-height:1.35}",
    ".nfr-nav-link:hover,.nfr-nav-link.active{background:#12203a;border-color:rgba(96,165,250,.28);color:#fff}",
    ".nfr-main{display:flex;flex-direction:column;gap:14px}",
    ".nfr-hero{border-radius:20px;padding:18px 18px 16px}",
    ".nfr-hero-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}",
    ".nfr-badge{display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;background:rgba(59,130,246,.14);color:#bfdbfe;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}",
    ".nfr-hero h1{margin:0;font-size:27px;line-height:1.08;letter-spacing:-.03em}",
    ".nfr-intro{margin:10px 0 0;color:#c9d5e3;font-size:13px;line-height:1.6;max-width:900px}",
    ".nfr-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}",
    ".nfr-btn{display:inline-flex;align-items:center;justify-content:center;min-height:34px;padding:0 12px;border-radius:999px;text-decoration:none;font-size:12px;font-weight:700}",
    ".nfr-btn-primary{background:#2563eb;border:1px solid #2563eb;color:#fff}",
    ".nfr-btn-secondary{background:#101b2f;border:1px solid rgba(96,165,250,.24);color:#dce7f5}",
    ".nfr-btn:hover{filter:brightness(1.06)}",
    ".nfr-notice,.nfr-alert{margin-top:12px;padding:10px 12px;border-radius:14px;border:1px solid rgba(245,158,11,.24);background:rgba(96,55,16,.18);color:#f8d28c;font-size:12px;line-height:1.5}",
    ".nfr-stack{display:flex;flex-direction:column;gap:14px}",
    ".nfr-stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}",
    ".nfr-stat{border-radius:14px;padding:12px;background:#0d1524;border:1px solid rgba(90,112,140,.18)}",
    ".nfr-stat-value{display:block;font-size:22px;font-weight:700;line-height:1.05;color:#fff}",
    ".nfr-stat-label{display:block;margin-top:6px;color:#a9b9cf;font-size:12px;line-height:1.45}",
    ".nfr-panel,.nfr-native-panel{border-radius:18px;padding:14px}",
    ".nfr-panel h2,.nfr-native-panel h2,.nfr-card h3,.nfr-pattern-card h3{margin:0;font-size:18px;line-height:1.25;color:#fff}",
    ".nfr-panel-copy{margin:8px 0 0;color:#c9d5e3;font-size:13px;line-height:1.58}",
    ".nfr-list{display:grid;gap:8px;margin:12px 0 0;padding:0;list-style:none}",
    ".nfr-list li{padding:10px 12px;border-radius:12px;background:#0d1524;border:1px solid rgba(90,112,140,.16);font-size:12px;line-height:1.55;color:#d7e2f0}",
    ".nfr-toolbar{display:grid;grid-template-columns:minmax(0,1fr) 180px 160px;gap:8px;align-items:center}",
    ".nfr-filter-search,.nfr-filter-select{width:100%;min-height:36px;border-radius:12px;border:1px solid rgba(90,112,140,.24);background:#0d1524;color:#e5edf7;padding:0 12px;font-size:12px}",
    ".nfr-grid,.nfr-pattern-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:10px}",
    ".nfr-card,.nfr-pattern-card{display:flex;flex-direction:column;gap:10px;border-radius:18px;padding:14px}",
    ".nfr-card-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}",
    ".nfr-card-copy{margin:0;color:#c9d5e3;font-size:12px;line-height:1.55}",
    ".nfr-pill-row,.nfr-tag-row,.nfr-card-actions,.nfr-native-tabs{display:flex;flex-wrap:wrap;gap:6px}",
    ".nfr-pill,.nfr-tag{display:inline-flex;align-items:center;min-height:24px;padding:0 8px;border-radius:999px;border:1px solid rgba(96,165,250,.18);background:#0d1524;color:#bfd3eb;font-size:11px;font-weight:700}",
    ".nfr-pill.good{border-color:rgba(34,197,94,.24);color:#c9f3d1;background:rgba(22,82,44,.26)}",
    ".nfr-pill.warn{border-color:rgba(245,158,11,.26);color:#f8d28c;background:rgba(96,55,16,.18)}",
    ".nfr-preview{padding:14px 16px;border-radius:14px;border:1px solid rgba(90,112,140,.18);background:linear-gradient(135deg,rgba(255,255,255,.03),rgba(148,163,184,.04));color:#fff;font-size:22px;line-height:1.28}",
    ".nfr-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}",
    ".nfr-meta-block{padding:10px 12px;border-radius:12px;background:#0d1524;border:1px solid rgba(90,112,140,.16)}",
    ".nfr-meta-block strong{display:block;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:#9fb7d9}",
    ".nfr-meta-block span{display:block;margin-top:6px;color:#dce7f5;font-size:12px;line-height:1.45}",
    ".nfr-media-thumb,.nfr-pattern-thumb{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:14px;border:1px solid rgba(90,112,140,.16);background:#08111f}",
    ".nfr-link-btn{display:inline-flex;align-items:center;justify-content:center;min-height:32px;padding:0 10px;border-radius:999px;border:1px solid rgba(96,165,250,.24);background:#0d1524;color:#e5edf7;font-size:11px;font-weight:700;text-decoration:none}",
    ".nfr-link-btn:hover{border-color:rgba(96,165,250,.42);color:#fff}",
    ".nfr-section-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}",
    ".nfr-section-title{margin:0;font-size:16px;line-height:1.25;color:#fff}",
    ".nfr-empty,.nfr-error{padding:16px;border-radius:14px;background:#0d1524;border:1px solid rgba(90,112,140,.18);font-size:13px;line-height:1.6;color:#c9d5e3}",
    ".nfr-native-panel{margin:12px 0 18px}",
    ".nfr-native-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}",
    ".nfr-native-copy{max-width:760px;color:#c9d5e3;font-size:13px;line-height:1.58;margin:8px 0 0}",
    ".nfr-footer-note{margin:2px 0 0;color:#8fa4c2;font-size:11px}",
    ".nfr-flow-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px}",
    ".nfr-flow-card{padding:12px;border-radius:14px;background:#0d1524;border:1px solid rgba(90,112,140,.16)}",
    ".nfr-flow-card h3{margin:0 0 6px;font-size:14px;color:#fff}",
    ".nfr-flow-card p{margin:0;color:#c9d5e3;font-size:12px;line-height:1.55}",
    "@media (max-width:1080px){.nfr-layout{grid-template-columns:1fr}.nfr-nav-panel{position:static}.nfr-toolbar{grid-template-columns:1fr 1fr}.nfr-toolbar .nfr-filter-select:last-child{grid-column:1/-1}}",
    "@media (max-width:720px){.nfr-shell{padding:14px 12px 44px}.nfr-topbar{flex-direction:column;align-items:stretch}.nfr-toolbar,.nfr-meta{grid-template-columns:1fr}.nfr-back,.nfr-close,.nfr-btn,.nfr-link-btn,.nfr-copy-btn,.nfr-tab{width:100%}.nfr-hero h1{font-size:24px}}"
  ].join("");

  function onReady(fn) {
    function afterPaint() {
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(fn);
      });
    }
    if (document.readyState === "complete") {
      afterPaint();
      return;
    }
    window.addEventListener("load", afterPaint, { once: true });
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeHash(hash) {
    if (!hash) return "#/dashboard";
    return hash.charAt(0) === "#" ? hash : "#" + hash;
  }

  function getHashPath() {
    var hash = window.location.hash || "";
    var queryIndex = hash.indexOf("?");
    return queryIndex >= 0 ? hash.slice(0, queryIndex) : hash;
  }

  function getPageIdFromHash(hash) {
    var path = hash || getHashPath();
    if (path === PAGE_ROUTES.fonts) return "fonts";
    if (path === PAGE_ROUTES.media) return "media";
    if (path === PAGE_ROUTES.figma) return "figma";
    return "";
  }

  function isResourceHash(hash) {
    return !!getPageIdFromHash(hash);
  }

  function rememberAppHash(hash) {
    var next = normalizeHash(hash || window.location.hash || "#/dashboard");
    if (isResourceHash(next)) return;
    state.lastAppHash = next;
  }

  function getTeamId() {
    var fromHash = (window.location.hash || "").match(/#\/dashboard\/team\/([0-9a-f-]{36})/i);
    if (fromHash) return fromHash[1];
    var links = document.querySelectorAll("a[href]");
    for (var index = 0; index < links.length; index += 1) {
      var match = (links[index].getAttribute("href") || "").match(/dashboard\/team\/([0-9a-f-]{36})/i);
      if (match) return match[1];
    }
    return state.teamId || "";
  }

  function rememberTeamId() {
    var teamId = getTeamId();
    if (teamId) state.teamId = teamId;
    return state.teamId || "";
  }

  function nativeFontsHash() {
    var teamId = rememberTeamId();
    return teamId ? "#/dashboard/team/" + teamId + "/fonts" : "#/dashboard";
  }

  function openNativeFonts(event) {
    if (event) event.preventDefault();
    window.location.hash = nativeFontsHash().slice(1);
  }

  function isNativeFontsHash(hash) {
    return /#\/dashboard\/team\/[0-9a-f-]{36}\/fonts(?:[/?#].*)?$/i.test(normalizeHash(hash || window.location.hash || ""));
  }

  function looksLikeNativeFontsSurface() {
    var text = "";
    if (document.body && typeof document.body.innerText === "string") {
      text = document.body.innerText.slice(0, 2400);
    }
    return /upload custom fonts|add custom font|custom fonts you upload|загрузить произвольные шрифты|добавить произвольный шрифт|пользовательские шрифты/i.test(text);
  }

  function loadJson(cacheKey, urls) {
    if (state[cacheKey]) return Promise.resolve(state[cacheKey]);
    if (state.pending[cacheKey]) return state.pending[cacheKey];

    var candidates = Array.isArray(urls) ? urls.slice() : [urls];
    state.pending[cacheKey] = candidates.reduce(function (chain, url) {
      return chain.catch(function () {
        return fetch(url, { credentials: "same-origin", cache: "no-store" }).then(function (response) {
          if (!response.ok) throw new Error("Request failed with status " + response.status);
          return response.json();
        });
      });
    }, Promise.reject(new Error("catalog not loaded"))).then(function (payload) {
      state[cacheKey] = payload;
      state.pending[cacheKey] = null;
      return payload;
    }).catch(function (error) {
      state.pending[cacheKey] = null;
      throw error;
    });

    return state.pending[cacheKey];
  }

  function arrayify(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (!value && value !== 0) return [];
    return [value];
  }

  function humanInstallState(value) {
    if (!value) return "Needs review";
    var normalized = String(value).toLowerCase();
    if (normalized === "available") return "Available";
    if (normalized === "installed") return "Installed";
    if (normalized === "planned") return "Planned";
    if (normalized === "upload_required") return "Upload required";
    if (normalized === "needs_review") return "Needs review";
    if (normalized === "not_supported_yet") return "Native upload required";
    return String(value).replace(/_/g, " ");
  }

  function normalizeFontCatalog(catalog) {
    var audit = catalog.fontInstallFeasibility || catalog.penpotAudit || {};
    var fonts = (Array.isArray(catalog.fonts) ? catalog.fonts : []).map(function (font) {
      var previewFilePath = font.previewFilePath || font.preview_file_path || "";
      var localFilePaths = arrayify(font.localFilePaths || font.local_file_paths);
      return {
        id: font.id || font.family || "",
        family: font.family || font.id || "Untitled family",
        category: font.category || "sans",
        mood: arrayify(font.mood),
        useCases: arrayify(font.useCases || font.recommendedUseCase),
        languageCoverage: arrayify(font.languageCoverage),
        license: font.license || "Review",
        licenseUrl: font.licenseUrl || "",
        attributionRequired: Boolean(font.attributionRequired),
        pairingSuggestions: arrayify(font.pairingSuggestions),
        fileStatus: font.fileStatus || (localFilePaths.length ? "available" : "planned"),
        approvalStatus: font.approvalStatus || "approved",
        sourceName: font.sourceName || "NOFIDA",
        sourceUrl: font.sourceUrl || "",
        previewText: font.previewText || font.family || "",
        previewFilePath: previewFilePath || localFilePaths[0] || "",
        localFilePaths: localFilePaths,
        recommendedUseCase: font.recommendedUseCase || arrayify(font.useCases)[0] || "",
        commercialUseAllowed: font.commercialUseAllowed !== false,
        modificationAllowed: font.modificationAllowed !== false,
        redistributionAllowed: font.redistributionAllowed !== false
      };
    });

    return {
      fonts: fonts,
      storeRoot: catalog.storeRoot || "/opt/nofida-core/font-store",
      uploadFormats: arrayify(audit.supportedUploadFormats || audit.customUploadFormats || ["ttf", "otf", "woff", "woff2"]),
      automatedInstall: audit.automatedInstall || audit.globalInstallFeasibility || "not_supported_yet",
      recommendedNextStep: audit.recommendedNextStep || "Download a reviewed font and use the native font upload flow when the font is not already in the workspace.",
      nativeUploadRoutePattern: audit.nativeUploadRoutePattern || "#/dashboard/team/:team-id/fonts",
      selectionBoundary: catalog.selectionBoundary || null
    };
  }

  function normalizeMediaCatalog(catalog) {
    var assets = (Array.isArray(catalog.assets) ? catalog.assets : []).map(function (asset) {
      return {
        id: asset.id || asset.title || "",
        title: asset.title || asset.id || "Untitled asset",
        category: asset.category || "media",
        style: asset.style || "",
        mood: asset.mood || "",
        audience: asset.audience || "",
        useCases: arrayify(asset.useCases),
        format: asset.format || "asset",
        license: asset.license || "review",
        licenseUrl: asset.licenseUrl || "",
        sourceName: asset.sourceName || asset.source || "NOFIDA",
        sourceUrl: asset.sourceUrl || "",
        internalUrl: asset.localFilePath || asset.internalUrl || asset.internal_url || "",
        thumbnailUrl: asset.thumbnailPath || asset.thumbnailUrl || asset.thumbnail_url || asset.localFilePath || "",
        approvalStatus: asset.approvalStatus || "approved",
        tags: arrayify(asset.tags),
        dominantColors: arrayify(asset.dominantColors),
        attributionRequired: Boolean(asset.attributionRequired),
        commercialUseAllowed: asset.commercialUseAllowed !== false,
        modificationAllowed: asset.modificationAllowed !== false,
        redistributionAllowed: asset.redistributionAllowed !== false
      };
    });

    var uiPatterns = (Array.isArray(catalog.uiPatterns) ? catalog.uiPatterns : []).map(function (pattern) {
      return {
        id: pattern.id || pattern.title || "",
        title: pattern.title || pattern.id || "Untitled pattern",
        category: "ui-patterns",
        sourceModel: pattern.sourceModel || "",
        sourceName: pattern.sourceName || pattern.sourceModel || "NOFIDA",
        sourceUrl: pattern.sourceUrl || "",
        originalDescription: pattern.originalDescription || "",
        recommendedUse: pattern.recommendedUse || "",
        tokens: arrayify(pattern.tokens),
        license: pattern.license || "MIT",
        licenseUrl: pattern.licenseUrl || "",
        approvalStatus: pattern.approvalStatus || "approved",
        adaptedByNofida: pattern.adaptedByNofida !== false,
        previewPath: pattern.previewPath || ""
      };
    });

    return {
      assets: assets,
      uiPatterns: uiPatterns,
      storeRoot: catalog.storeRoot || "/opt/nofida-core/media-store",
      selectionBoundary: catalog.selectionBoundary || null
    };
  }

  function ensurePreviewFonts(fonts) {
    var styleEl = document.getElementById("nfr-dynamic-fonts");
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "nfr-dynamic-fonts";
      document.head.appendChild(styleEl);
    }

    var css = [];
    fonts.forEach(function (font) {
      if (!font.previewFilePath) return;
      if (state.loadedPreviewFonts[font.id]) return;
      state.loadedPreviewFonts[font.id] = true;
      font.runtimeFontFamily = "NOFIDA-" + font.id;
      css.push('@font-face{font-family:"' + String(font.runtimeFontFamily).replace(/"/g, "") + '";src:url("' + escapeHtml(font.previewFilePath) + '") format("woff2");font-display:swap;}');
    });

    if (css.length > 0) styleEl.textContent += css.join("");
  }

  function renderStats(stats) {
    return [
      '<section class="nfr-stat-grid">',
      stats.map(function (stat) {
        return [
          '<article class="nfr-stat">',
          '  <span class="nfr-stat-value">' + escapeHtml(stat.value) + "</span>",
          '  <span class="nfr-stat-label">' + escapeHtml(stat.label) + "</span>",
          "</article>"
        ].join("");
      }).join(""),
      "</section>"
    ].join("");
  }

  function renderActions(actions) {
    return [
      '<div class="nfr-actions">',
      (actions || []).map(function (action, index) {
        var klass = index === 0 ? "nfr-btn nfr-btn-primary" : "nfr-btn nfr-btn-secondary";
        var attrs = action.action ? ' data-nfr-action="' + escapeHtml(action.action) + '"' : "";
        return '<a class="' + klass + '" href="' + escapeHtml(action.href || "#") + '"' + attrs + ">" + escapeHtml(action.label) + "</a>";
      }).join(""),
      "</div>"
    ].join("");
  }

  function renderNav(currentPageId) {
    var items = [
      { id: "libraries", label: "Libraries", href: "#/nofida/libraries" },
      { id: "fonts", label: "Font Catalog", href: PAGE_ROUTES.fonts },
      { id: "media", label: "Media Bank", href: PAGE_ROUTES.media },
      { id: "figma", label: "Figma Migration", href: PAGE_ROUTES.figma }
    ];
    return items.map(function (item) {
      var classes = ["nfr-nav-link"];
      if (item.id === currentPageId) classes.push("active");
      return '<a class="' + classes.join(" ") + '" href="' + escapeHtml(item.href) + '">' + escapeHtml(item.label) + "</a>";
    }).join("");
  }

  function renderMetaBlock(label, value) {
    return [
      '<div class="nfr-meta-block">',
      '  <strong>' + escapeHtml(label) + "</strong>",
      '  <span>' + escapeHtml(value) + "</span>",
      "</div>"
    ].join("");
  }

  function renderAuditList(title, items) {
    return [
      '<section class="nfr-panel">',
      '  <p class="nfr-label">Operational notes</p>',
      '  <h2>' + escapeHtml(title) + "</h2>",
      '  <ul class="nfr-list">',
      (items || []).map(function (item) {
        return "<li>" + escapeHtml(item) + "</li>";
      }).join(""),
      "  </ul>",
      "</section>"
    ].join("");
  }

  function fontMatches(font, filterState) {
    var query = String(filterState.query || "").toLowerCase().trim();
    var category = filterState.category || "all";
    if (category !== "all" && String(font.category || "") !== category) return false;
    if (!query) return true;
    var haystack = [
      font.family,
      font.category,
      font.license,
      font.previewText,
      font.recommendedUseCase
    ].concat(font.mood || [], font.useCases || [], font.languageCoverage || [], font.pairingSuggestions || []).join(" ").toLowerCase();
    return haystack.indexOf(query) >= 0;
  }

  function renderFontCard(font, isNativeSurface) {
    var fontFamily = font.runtimeFontFamily || font.family || "Inter";
    var previewStyle = "font-family:'" + String(fontFamily).replace(/'/g, "\\'") + "',Inter,\"Segoe UI\",system-ui,sans-serif";
    var downloadUrl = font.previewFilePath || (font.localFilePaths || [])[0] || "";
    var canDownload = font.approvalStatus === "approved" && !!downloadUrl;
    return [
      '<article class="nfr-card">',
      '  <div class="nfr-card-top">',
      "    <div>",
      '      <p class="nfr-label">Font family</p>',
      '      <h3>' + escapeHtml(font.family) + "</h3>",
      "    </div>",
      '    <div class="nfr-pill-row">',
      '      <span class="nfr-pill">' + escapeHtml(font.category) + "</span>",
      '      <span class="nfr-pill good">' + escapeHtml(font.license) + "</span>",
      '      <span class="nfr-pill ' + (font.approvalStatus === "approved" ? "good" : "warn") + '">' + escapeHtml(font.approvalStatus) + "</span>",
      "    </div>",
      "  </div>",
      '  <div class="nfr-preview" style="' + escapeHtml(previewStyle) + '">' + escapeHtml(font.previewText || font.family) + "</div>",
      '  <p class="nfr-card-copy">' + escapeHtml(font.recommendedUseCase || "Reviewed open-license family for NOFIDA.") + "</p>",
      '  <div class="nfr-meta">',
      renderMetaBlock("Language coverage", arrayify(font.languageCoverage).join(", ")),
      renderMetaBlock("File status", humanInstallState(font.fileStatus)),
      renderMetaBlock("Pairing", arrayify(font.pairingSuggestions).join(", ")),
      renderMetaBlock("Mood", arrayify(font.mood).join(", ")),
      "  </div>",
      '  <div class="nfr-tag-row">',
      arrayify(font.useCases).map(function (tag) {
        return '<span class="nfr-tag">' + escapeHtml(tag) + "</span>";
      }).join(""),
      "  </div>",
      '  <div class="nfr-card-actions">',
      canDownload
        ? '<a class="nfr-link-btn" href="' + escapeHtml(downloadUrl) + '" target="_blank" rel="noreferrer">Download font</a>'
        : '<span class="nfr-pill warn">Download pending</span>',
      isNativeSurface
        ? '<button class="nfr-copy-btn" type="button" data-nfr-native-nav="upload">Open upload</button>'
        : '<a class="nfr-link-btn" href="' + escapeHtml(nativeFontsHash()) + '" data-nfr-action="native-fonts">Open native Fonts</a>',
      "  </div>",
      "</article>"
    ].join("");
  }

  function renderFontExplorer(target, normalized, filterKey, isNativeSurface) {
    var filterState = state.filters[filterKey];
    var categories = ["all"].concat(normalized.fonts.map(function (font) { return font.category; }).filter(function (value, index, arr) {
      return value && arr.indexOf(value) === index;
    }));
    var matches = normalized.fonts.filter(function (font) {
      return fontMatches(font, filterState);
    });

    ensurePreviewFonts(matches.slice(0, 12));
    matches.forEach(function (font) {
      if (!font.runtimeFontFamily) font.runtimeFontFamily = "NOFIDA-" + font.id;
    });

    target.innerHTML = [
      '<section class="nfr-panel">',
      '  <div class="nfr-section-head">',
      '    <div>',
      '      <p class="nfr-label">Reviewed inventory</p>',
      '      <h2 class="nfr-section-title">' + escapeHtml(isNativeSurface ? "Recommended NOFIDA fonts" : "Reviewed font inventory") + "</h2>",
      "    </div>",
      '    <div class="nfr-pill-row">',
      '      <span class="nfr-pill">' + escapeHtml(String(matches.length)) + " shown</span>",
      '      <span class="nfr-pill ' + (normalized.automatedInstall === "supported" ? "good" : "warn") + '">' + escapeHtml(humanInstallState(normalized.automatedInstall)) + "</span>",
      "    </div>",
      "  </div>",
      '  <p class="nfr-panel-copy">Installation uses the native font upload flow until automated installation is verified. NOFIDA does not fake installed state.</p>',
      '  <div class="nfr-toolbar">',
      '    <input class="nfr-filter-search" data-nfr-filter="' + escapeHtml(filterKey) + ':query" type="search" placeholder="Search family, use case, mood, coverage..." value="' + escapeHtml(filterState.query || "") + '"/>',
      '    <select class="nfr-filter-select" data-nfr-filter="' + escapeHtml(filterKey) + ':category">',
      categories.map(function (category) {
        return '<option value="' + escapeHtml(category) + '"' + (filterState.category === category ? " selected" : "") + ">" + escapeHtml(category === "all" ? "All categories" : category) + "</option>";
      }).join(""),
      "    </select>",
      '    <select class="nfr-filter-select" disabled><option>' + escapeHtml("Native upload: " + normalized.uploadFormats.join(" / ").toUpperCase()) + "</option></select>",
      "  </div>",
      "  <div class=\"nfr-grid\">",
      matches.length ? matches.map(function (font) { return renderFontCard(font, isNativeSurface); }).join("") : '<div class="nfr-empty">No font matches this search yet.</div>',
      "  </div>",
      "</section>"
    ].join("");

    bindActionHandlers(target);
    bindFilterHandlers(target, normalized, filterKey, isNativeSurface ? "font-native" : "font-overlay");
    bindNativeTabHandlers(target);
  }

  function assetMatches(asset, filterState) {
    var query = String(filterState.query || "").toLowerCase().trim();
    if (filterState.category !== "all" && asset.category !== filterState.category) return false;
    if (filterState.license !== "all" && asset.license !== filterState.license) return false;
    if (!query) return true;
    var haystack = [
      asset.title,
      asset.category,
      asset.style,
      asset.mood,
      asset.audience,
      asset.sourceName
    ].concat(asset.useCases || [], asset.tags || []).join(" ").toLowerCase();
    return haystack.indexOf(query) >= 0;
  }

  function renderMediaCard(asset) {
    var usable = asset.approvalStatus === "approved";
    return [
      '<article class="nfr-card">',
      '  <img class="nfr-media-thumb" src="' + escapeHtml(asset.thumbnailUrl || "") + '" alt="' + escapeHtml(asset.title) + '"/>',
      '  <div class="nfr-card-top">',
      "    <div>",
      '      <p class="nfr-label">' + escapeHtml(asset.category) + "</p>",
      '      <h3>' + escapeHtml(asset.title) + "</h3>",
      "    </div>",
      '    <div class="nfr-pill-row">',
      '      <span class="nfr-pill">' + escapeHtml(asset.format) + "</span>",
      '      <span class="nfr-pill good">' + escapeHtml(asset.license) + "</span>",
      '      <span class="nfr-pill ' + (usable ? "good" : "warn") + '">' + escapeHtml(asset.approvalStatus) + "</span>",
      "    </div>",
      "  </div>",
      '  <p class="nfr-card-copy">' + escapeHtml([asset.style, asset.mood, asset.audience].filter(Boolean).join(" · ")) + "</p>",
      '  <div class="nfr-meta">',
      renderMetaBlock("Use cases", arrayify(asset.useCases).join(", ")),
      renderMetaBlock("Source", asset.sourceName),
      renderMetaBlock("Colors", arrayify(asset.dominantColors).join(", ")),
      renderMetaBlock("Tags", arrayify(asset.tags).join(", ")),
      "  </div>",
      '  <div class="nfr-card-actions">',
      usable && asset.internalUrl
        ? '<a class="nfr-link-btn" href="' + escapeHtml(asset.internalUrl) + '" target="_blank" rel="noreferrer">Download</a>'
        : '<span class="nfr-pill warn">License review needed</span>',
      usable && asset.internalUrl
        ? '<button class="nfr-copy-btn" type="button" data-copy-url="' + escapeHtml(asset.internalUrl) + '">Copy internal link</button>'
        : "",
      "  </div>",
      "</article>"
    ].join("");
  }

  function renderPatternCard(pattern) {
    return [
      '<article class="nfr-pattern-card nfr-card">',
      pattern.previewPath ? '<img class="nfr-pattern-thumb" src="' + escapeHtml(pattern.previewPath) + '" alt="' + escapeHtml(pattern.title) + '"/>' : "",
      '  <div class="nfr-card-top">',
      "    <div>",
      '      <p class="nfr-label">UI pattern</p>',
      '      <h3>' + escapeHtml(pattern.title) + "</h3>",
      "    </div>",
      '    <div class="nfr-pill-row">',
      '      <span class="nfr-pill">' + escapeHtml(pattern.sourceModel || "NOFIDA") + "</span>",
      '      <span class="nfr-pill good">' + escapeHtml(pattern.license || "MIT") + "</span>",
      "    </div>",
      "  </div>",
      '  <p class="nfr-card-copy">' + escapeHtml(pattern.originalDescription || pattern.recommendedUse || "") + "</p>",
      '  <div class="nfr-meta">',
      renderMetaBlock("Recommended use", pattern.recommendedUse || ""),
      renderMetaBlock("Approval", pattern.approvalStatus || "approved"),
      "  </div>",
      '  <div class="nfr-tag-row">',
      arrayify(pattern.tokens).map(function (token) {
        return '<span class="nfr-tag">' + escapeHtml(token) + "</span>";
      }).join(""),
      "  </div>",
      "</article>"
    ].join("");
  }

  function renderMediaExplorer(target, normalized) {
    var filterState = state.filters.media;
    var categories = ["all"].concat(normalized.assets.map(function (asset) { return asset.category; }).filter(function (value, index, arr) {
      return value && arr.indexOf(value) === index;
    }));
    var licenses = ["all"].concat(normalized.assets.map(function (asset) { return asset.license; }).filter(function (value, index, arr) {
      return value && arr.indexOf(value) === index;
    }));
    var assets = normalized.assets.filter(function (asset) {
      return assetMatches(asset, filterState);
    });

    target.innerHTML = [
      '<section class="nfr-panel">',
      '  <div class="nfr-section-head">',
      '    <div>',
      '      <p class="nfr-label">Approved media inventory</p>',
      '      <h2 class="nfr-section-title">Search the NOFIDA media store</h2>',
      "    </div>",
      '    <div class="nfr-pill-row">',
      '      <span class="nfr-pill">' + escapeHtml(String(assets.length)) + " shown</span>",
      '      <span class="nfr-pill">' + escapeHtml(String(normalized.uiPatterns.length)) + " UI patterns</span>",
      "    </div>",
      "  </div>",
      '  <div class="nfr-toolbar">',
      '    <input class="nfr-filter-search" data-nfr-filter="media:query" type="search" placeholder="Search category, tag, mood, source..." value="' + escapeHtml(filterState.query || "") + '"/>',
      '    <select class="nfr-filter-select" data-nfr-filter="media:category">',
      categories.map(function (category) {
        return '<option value="' + escapeHtml(category) + '"' + (filterState.category === category ? " selected" : "") + ">" + escapeHtml(category === "all" ? "All categories" : category) + "</option>";
      }).join(""),
      "    </select>",
      '    <select class="nfr-filter-select" data-nfr-filter="media:license">',
      licenses.map(function (license) {
        return '<option value="' + escapeHtml(license) + '"' + (filterState.license === license ? " selected" : "") + ">" + escapeHtml(license === "all" ? "All licenses" : license) + "</option>";
      }).join(""),
      "    </select>",
      "  </div>",
      "  <div class=\"nfr-grid\">",
      assets.length ? assets.map(renderMediaCard).join("") : '<div class="nfr-empty">No media matches this filter set yet.</div>',
      "  </div>",
      "</section>",
      normalized.uiPatterns.length ? [
        '<section class="nfr-panel">',
        '  <p class="nfr-label">UI Patterns</p>',
        '  <h2>Pattern registry</h2>',
        '  <p class="nfr-panel-copy">shadcn/ui and Radix UI are treated as source models for interaction patterns, not as copied docs or media packs.</p>',
        '  <div class="nfr-pattern-grid">',
        normalized.uiPatterns.map(renderPatternCard).join(""),
        "  </div>",
        "</section>"
      ].join("") : ""
    ].join("");

    bindFilterHandlers(target, normalized, "media", "media");
    bindCopyButtons(target);
  }

  function renderFontBody(catalog) {
    var normalized = normalizeFontCatalog(catalog);
    var approvedCount = normalized.fonts.filter(function (font) { return font.approvalStatus === "approved"; }).length;
    return [
      '<div class="nfr-stack">',
      renderStats([
        { value: String(normalized.fonts.length), label: "Reviewed open-license families" },
        { value: String(approvedCount), label: "Approved for product use" },
        { value: normalized.uploadFormats.join(" / ").toUpperCase(), label: "Native upload formats" }
      ]),
      renderAuditList("Native font workflow", [
        "Recommended NOFIDA fonts should appear before custom uploads in the native Fonts screen.",
        "Download a reviewed font, then continue through the native upload flow until automation is verified.",
        "Do not fake installed state, server-wide rollout, or success messages that are not backed by the product."
      ]),
      '<div id="nfr-font-explorer"></div>',
      "</div>"
    ].join("");
  }

  function renderMediaBody(catalog) {
    var normalized = normalizeMediaCatalog(catalog);
    return [
      '<div class="nfr-stack">',
      renderStats([
        { value: String(normalized.assets.length), label: "Same-origin assets" },
        { value: String(normalized.uiPatterns.length), label: "UI pattern entries" },
        { value: String(normalized.storeRoot), label: "Canonical store root" }
      ]),
      renderAuditList("Resource factory rules", [
        "Each resource keeps source, license, attribution, and approval state.",
        "Only approved resources expose product-ready actions.",
        "Adapted resources remain attributable to their source model where required."
      ]),
      '<div id="nfr-media-explorer"></div>',
      "</div>"
    ].join("");
  }

  function renderFigmaBody() {
    return [
      '<div class="nfr-stack">',
      renderStats([
        { value: "Exports first", label: "Start with .penpot, .zip, SVG, PNG, PDF, and packaged assets" },
        { value: "Report before convert", label: "Pages, frames, assets, fonts, and risks are audited up front" },
        { value: "No 1:1 promise", label: "Prototype fidelity and component parity remain follow-up engineering work" }
      ]),
      '<section class="nfr-panel">',
      '  <p class="nfr-label">Migration flow</p>',
      "  <h2>Suggested path</h2>",
      '  <div class="nfr-flow-grid">',
      '    <article class="nfr-flow-card"><h3>1. Intake</h3><p>Collect export bundles, image assets, archive files, and future connector placeholders in one package.</p></article>',
      '    <article class="nfr-flow-card"><h3>2. Inventory</h3><p>Count pages, frames, components, assets, and fonts before any transformation is attempted.</p></article>',
      '    <article class="nfr-flow-card"><h3>3. Replace</h3><p>Match fonts, libraries, and media against reviewed NOFIDA resources and flag gaps honestly.</p></article>',
      '    <article class="nfr-flow-card"><h3>4. Report</h3><p>Produce a migration report with missing fonts, suggested NOFIDA replacements, risk level, and manual steps.</p></article>',
      "  </div>",
      "</section>",
      '<section class="nfr-panel">',
      '  <p class="nfr-label">Migration report preview</p>',
      "  <h2>What the report should show</h2>",
      '  <ul class="nfr-list">',
      "    <li>Pages, frames, and component counts</li>",
      "    <li>Assets discovered, plus reusable NOFIDA replacements</li>",
      "    <li>Fonts found, missing fonts, and suggested NOFIDA families</li>",
      "    <li>Suggested libraries, media substitutions, and risk level</li>",
      "    <li>Manual follow-up steps instead of false automation claims</li>",
      "  </ul>",
      "</section>"
    ].join("");
  }

  function renderLoading(copy) {
    return '<div class="nfr-empty">' + escapeHtml(copy) + "</div>";
  }

  function renderError(message) {
    return '<div class="nfr-error">' + escapeHtml(message) + "</div>";
  }

  function bindActionHandlers(root) {
    Array.prototype.forEach.call(root.querySelectorAll("[data-nfr-action='native-fonts']"), function (node) {
      node.addEventListener("click", openNativeFonts);
    });
  }

  function bindFilterHandlers(root, normalized, filterKey, mode) {
    Array.prototype.forEach.call(root.querySelectorAll("[data-nfr-filter]"), function (node) {
      node.addEventListener("input", function () {
        var parts = String(node.getAttribute("data-nfr-filter") || "").split(":");
        if (parts.length !== 2) return;
        state.filters[parts[0]][parts[1]] = node.value;
        if (mode === "media") renderMediaExplorer(root, normalized);
        else renderFontExplorer(root, normalized, filterKey, mode === "font-native");
      });
      node.addEventListener("change", function () {
        var parts = String(node.getAttribute("data-nfr-filter") || "").split(":");
        if (parts.length !== 2) return;
        state.filters[parts[0]][parts[1]] = node.value;
        if (mode === "media") renderMediaExplorer(root, normalized);
        else renderFontExplorer(root, normalized, filterKey, mode === "font-native");
      });
    });
  }

  function bindCopyButtons(root) {
    Array.prototype.forEach.call(root.querySelectorAll("[data-copy-url]"), function (node) {
      node.addEventListener("click", function () {
        var value = String(node.getAttribute("data-copy-url") || "");
        var absolute = value.indexOf("http") === 0 ? value : window.location.origin + value;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(absolute);
          node.textContent = "Copied";
          window.setTimeout(function () { node.textContent = "Copy internal link"; }, 1200);
          return;
        }
        window.prompt("Copy internal asset link", absolute);
      });
    });
  }

  function findNativeFontSection(kind) {
    var patterns = kind === "upload"
      ? /upload|custom font|team font|add font|upload all|загруз|добавить/i
      : /my fonts|custom fonts|uploaded|font family|мои шрифты|загруж/i;
    var candidates = document.querySelectorAll("section,article,div");
    for (var index = 0; index < candidates.length; index += 1) {
      var text = (candidates[index].textContent || "").trim();
      if (text.length < 8 || text.length > 1200) continue;
      if (patterns.test(text)) return candidates[index];
    }
    return null;
  }

  function scrollToNativeFontSection(kind) {
    var target = kind === "recommended" ? document.getElementById("nfr-native-fonts") : findNativeFontSection(kind);
    if (!target) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function bindNativeTabHandlers(root) {
    Array.prototype.forEach.call(root.querySelectorAll("[data-nfr-native-nav]"), function (node) {
      node.addEventListener("click", function () {
        scrollToNativeFontSection(String(node.getAttribute("data-nfr-native-nav") || ""));
      });
    });
  }

  function renderBody(pageId, token) {
    var content = state.overlayEl.querySelector("#nfr-content");

    if (pageId === "figma") {
      content.innerHTML = renderFigmaBody();
      return;
    }

    if (pageId === "fonts") {
      content.innerHTML = renderLoading("Loading the NOFIDA font catalog...");
      loadJson("fontCatalog", FONT_CATALOG_URLS).then(function (catalog) {
        if (state.renderToken !== token || state.currentPageId !== pageId) return;
        content.innerHTML = renderFontBody(catalog);
        renderFontExplorer(content.querySelector("#nfr-font-explorer"), normalizeFontCatalog(catalog), "fonts", false);
      }).catch(function (error) {
        if (state.renderToken !== token || state.currentPageId !== pageId) return;
        content.innerHTML = renderError("Could not load the font catalog. " + error.message);
      });
      return;
    }

    if (pageId === "media") {
      content.innerHTML = renderLoading("Loading the NOFIDA media store...");
      loadJson("mediaCatalog", MEDIA_CATALOG_URL).then(function (catalog) {
        if (state.renderToken !== token || state.currentPageId !== pageId) return;
        content.innerHTML = renderMediaBody(catalog);
        renderMediaExplorer(content.querySelector("#nfr-media-explorer"), normalizeMediaCatalog(catalog));
      }).catch(function (error) {
        if (state.renderToken !== token || state.currentPageId !== pageId) return;
        content.innerHTML = renderError("Could not load the media catalog. " + error.message);
      });
    }
  }

  function ensureOverlay() {
    if (state.overlayEl) return state.overlayEl;

    var style = document.createElement("style");
    style.id = "nfr-styles";
    style.textContent = RESOURCE_CSS;
    document.head.appendChild(style);

    var overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.setAttribute("hidden", "");
    overlay.innerHTML = [
      '<div class="nfr-shell">',
      '  <div class="nfr-topbar">',
      '    <button class="nfr-back" id="nfr-back" type="button">Back to previous screen</button>',
      '    <button class="nfr-close" id="nfr-close" type="button" aria-label="Close resource page">Close</button>',
      "  </div>",
      '  <div class="nfr-layout">',
      '    <aside class="nfr-nav-panel">',
      '      <p class="nfr-nav-kicker">Resources</p>',
      '      <div class="nfr-nav-list" id="nfr-nav"></div>',
      "    </aside>",
      '    <main class="nfr-main" aria-live="polite">',
      '      <section class="nfr-hero">',
      '        <div class="nfr-hero-head">',
      '          <span class="nfr-badge" id="nfr-badge">Resource page</span>',
      '          <h1 id="nfr-title">NOFIDA Resources</h1>',
      "        </div>",
      '        <p class="nfr-intro" id="nfr-intro"></p>',
      '        <div id="nfr-actions"></div>',
      '        <div class="nfr-notice" id="nfr-notice"></div>',
      "      </section>",
      '      <section id="nfr-content"></section>',
      '      <p class="nfr-footer-note" id="nfr-footer-note">Internal NOFIDA resource page.</p>',
      "    </main>",
      "  </div>",
      "</div>"
    ].join("");

    document.body.appendChild(overlay);
    overlay.querySelector("#nfr-back").addEventListener("click", closeToPrevious);
    overlay.querySelector("#nfr-close").addEventListener("click", closeToPrevious);
    state.overlayEl = overlay;
    return overlay;
  }

  function renderPage(pageId) {
    var page = PAGES[pageId];
    if (!page) return;

    var overlay = ensureOverlay();
    var token = Date.now();
    state.renderToken = token;
    state.currentPageId = pageId;

    overlay.querySelector("#nfr-nav").innerHTML = renderNav(pageId);
    overlay.querySelector("#nfr-badge").textContent = page.badge;
    overlay.querySelector("#nfr-title").textContent = page.title;
    overlay.querySelector("#nfr-intro").textContent = page.intro;
    overlay.querySelector("#nfr-actions").innerHTML = renderActions(page.actions || []);
    overlay.querySelector("#nfr-notice").textContent = page.notice || "";
    overlay.querySelector("#nfr-footer-note").textContent =
      pageId === "figma"
        ? "Migration guidance only. Report-first, no false 1:1 import promise."
        : "Internal NOFIDA resource page.";

    bindActionHandlers(overlay.querySelector("#nfr-actions"));
    renderBody(pageId, token);
    overlay.scrollTop = 0;
  }

  function showPage(pageId) {
    var overlay = ensureOverlay();
    renderPage(pageId);
    overlay.removeAttribute("hidden");
    document.body.style.overflow = "hidden";
  }

  function hidePages() {
    if (!state.overlayEl) return;
    state.overlayEl.setAttribute("hidden", "");
    document.body.style.overflow = "";
  }

  function closeToPrevious() {
    var back = normalizeHash(state.lastAppHash || "#/dashboard");
    if (isResourceHash(back)) back = "#/dashboard";
    window.location.hash = back.slice(1);
  }

  function findNativeFontsHost() {
    var selectors = [
      "main",
      "[role='main']",
      "[class*='dashboard-content']",
      "[class*='dashboard__content']",
      "[class*='team-font']"
    ];
    for (var index = 0; index < selectors.length; index += 1) {
      var node = document.querySelector(selectors[index]);
      if (node && !document.getElementById("nfr-native-fonts")) return node;
      if (node && document.getElementById("nfr-native-fonts") && node.contains(document.getElementById("nfr-native-fonts"))) return node;
    }
    return null;
  }

  function removeNativeFontsPanel() {
    var panel = document.getElementById("nfr-native-fonts");
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
  }

  function renderNativeFontsPanel(host, catalog) {
    var normalized = normalizeFontCatalog(catalog);
    var panel = document.getElementById("nfr-native-fonts");
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "nfr-native-fonts";
      panel.className = "nfr-native-panel";
      host.insertBefore(panel, host.firstChild || null);
    }

    panel.innerHTML = [
      '<div class="nfr-native-head">',
      '  <div>',
      '    <p class="nfr-label">Typography</p>',
      "    <h2>Recommended NOFIDA</h2>",
      '    <p class="nfr-native-copy">Pick a reviewed NOFIDA font first, or continue into the native upload flow for your own font files. The native font list remains the source of truth for what is actually available in the workspace.</p>',
      "  </div>",
      '  <div class="nfr-native-tabs">',
      '    <button class="nfr-tab" type="button" data-nfr-native-nav="recommended">Recommended NOFIDA</button>',
      '    <button class="nfr-tab" type="button" data-nfr-native-nav="upload">Upload your font</button>',
      '    <button class="nfr-tab" type="button" data-nfr-native-nav="my-fonts">My fonts</button>',
      "  </div>",
      "</div>",
      '<div class="nfr-alert">Installation uses the native font upload flow until automatic installation is enabled. NOFIDA does not claim a font is installed unless the native screen shows it.</div>',
      '<div id="nfr-native-font-explorer"></div>'
    ].join("");

    bindNativeTabHandlers(panel);
    renderFontExplorer(panel.querySelector("#nfr-native-font-explorer"), normalized, "nativeFonts", true);
  }

  function syncNativeFontsSurface() {
    rememberTeamId();
    if (!isNativeFontsHash(window.location.hash || "") && !looksLikeNativeFontsSurface()) {
      removeNativeFontsPanel();
      return;
    }
    loadJson("fontCatalog", FONT_CATALOG_URLS).then(function (catalog) {
      var host = findNativeFontsHost();
      if (!host) return;
      renderNativeFontsPanel(host, catalog);
    }).catch(function () {
      /* native screen should not break if the catalog is unavailable */
    });
  }

  function scheduleNativeFontsSync() {
    if (state.nativeSyncTimer) window.clearTimeout(state.nativeSyncTimer);
    state.nativeSyncTimer = window.setTimeout(function () {
      state.nativeSyncTimer = null;
      syncNativeFontsSurface();
    }, 120);
  }

  function onHashChange() {
    var hash = normalizeHash(window.location.hash || "#/dashboard");
    var pageId = getPageIdFromHash(hash);

    if (pageId) {
      showPage(pageId);
    } else {
      rememberAppHash(hash);
      hidePages();
    }

    scheduleNativeFontsSync();
  }

  function onKeyDown(event) {
    if (event.key !== "Escape") return;
    if (!state.overlayEl || state.overlayEl.hasAttribute("hidden")) return;
    closeToPrevious();
  }

  function init() {
    rememberAppHash(window.location.hash || "#/dashboard");
    rememberTeamId();
    ensureOverlay();
    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("keydown", onKeyDown);
    if (document.body && window.MutationObserver) {
      state.nativeObserver = new MutationObserver(scheduleNativeFontsSync);
      state.nativeObserver.observe(document.body, { childList: true, subtree: true });
    }
    state.nativeInterval = window.setInterval(syncNativeFontsSurface, 1500);
    onHashChange();

    window.NofidaResources = {
      open: function (pageId) {
        var target = PAGE_ROUTES[pageId] || PAGE_ROUTES.fonts;
        window.location.hash = target.slice(1);
      },
      openNativeFonts: openNativeFonts,
      close: closeToPrevious,
      current: function () {
        return state.currentPageId || "";
      }
    };
  }

  onReady(init);
})();
