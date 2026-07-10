(function () {
  "use strict";

  if (window.NofidaResources) return;

  var OVERLAY_ID = "nfr-overlay";
  var DETAIL_ID = "nfr-detail-overlay";
  var TOAST_ID = "nfr-toast";
  var NATIVE_PANEL_ID = "nfr-native-fonts";
  var NATIVE_PANEL_MARKER = "data-nofida-fonts-enhanced";
  var NATIVE_PANEL_REVISION = "data-nofida-render-rev";
  var NATIVE_CONTAINER_SELECTOR = ".main_ui_dashboard_fonts__dashboard-container.main_ui_dashboard_fonts__dashboard-fonts";
  var NATIVE_UPLOAD_SELECTOR = ".main_ui_dashboard_fonts__dashboard-fonts-upload";
  var NATIVE_INSTALLED_SELECTOR = ".main_ui_dashboard_fonts__dashboard-installed-fonts";
  var NATIVE_CONTENT_SELECTOR = ".main_ui_dashboard__dashboard-content";
  var FIGMA_STORAGE_KEY = "nofida-figma-draft-018c";
  var FIGMA_FILE_ACCEPT = ".fig,.zip,.svg,.png,.pdf";
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
      title: "Шрифты NOFIDA",
      badge: "Типографика",
      intro: "Выберите проверенный шрифт NOFIDA или загрузите свой. Каталог помогает быстро подобрать семейство, а нативная загрузка остается рабочим способом добавить файл в пространство команды.",
      notice: "Шрифты можно скачать и добавить через нативную загрузку. Автоматическая установка будет включена после безопасного подключения к системному хранилищу шрифтов.",
      actions: [
        { label: "Открыть экран шрифтов", href: "#/dashboard", action: "native-fonts" },
        { label: "Открыть медиабанк", href: PAGE_ROUTES.media },
        { label: "Открыть импорт из Figma", href: PAGE_ROUTES.figma }
      ]
    },
    media: {
      title: "Медиабанк NOFIDA",
      badge: "Проверенные ассеты",
      intro: "Медиабанк NOFIDA — проверенные ассеты для интерфейсов, презентаций и прототипов. Все материалы хранятся внутри NOFIDA и имеют сведения об источнике и лицензии.",
      notice: "Вы можете скачать ассет, скопировать ссылку или взять его за основу для проекта. Автоматическое добавление в файл появится отдельно.",
      actions: [
        { label: "Открыть экран шрифтов", href: "#/dashboard", action: "native-fonts" },
        { label: "Открыть импорт из Figma", href: PAGE_ROUTES.figma },
        { label: "Открыть лицензии", href: "#/nofida/open-source-notices" }
      ]
    },
    figma: {
      title: "Импорт из Figma",
      badge: "План переноса",
      intro: "NOFIDA сначала анализирует файл и готовит план переноса. Полная точность зависит от структуры исходного проекта, а сложные компоненты, автолэйауты и прототипы могут потребовать ручной проверки.",
      notice: "Запрос можно сохранить локально, собрать список ассетов и получить предварительный отчет без прямого изменения файлов проекта.",
      actions: [
        { label: "Создать отчет миграции", href: PAGE_ROUTES.figma, action: "focus-figma-report" },
        { label: "Открыть медиабанк", href: PAGE_ROUTES.media },
        { label: "Подобрать шрифты", href: PAGE_ROUTES.fonts }
      ]
    }
  };

  var state = {
    overlayEl: null,
    detailEl: null,
    toastEl: null,
    toastTimer: null,
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
      media: { query: "", category: "all", style: "all", mood: "all", license: "all" }
    },
    renderToken: 0,
    loadedPreviewFonts: {},
    nativeSyncTimer: null,
    nativeObserver: null,
    nativeObserverRoot: null,
    nativeRenderLock: false,
    nativeSectionKey: "",
    nativePanelKey: "",
    detail: { kind: "", id: "", source: "" },
    svgCache: {},
    figmaDraft: loadFigmaDraft(),
    figmaReport: null,
    figmaStage: { status: "", message: "", count: 0, updatedAt: "" }
  };

  var RESOURCE_CSS = [
    "#nfr-overlay,#nfr-detail-overlay{color:#e5edf7;font-family:Inter,\"Segoe UI\",system-ui,sans-serif}",
    "#nfr-overlay{position:fixed;inset:0;z-index:2147483440;overflow-y:auto;background:linear-gradient(180deg,rgba(5,9,18,.96),rgba(8,15,28,.98))}",
    "#nfr-overlay[hidden],#nfr-detail-overlay[hidden],#nfr-toast[hidden]{display:none!important}",
    "#nfr-dynamic-fonts{display:none}",
    "#nfr-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483605;padding:10px 14px;border-radius:999px;border:1px solid rgba(123,155,192,.24);background:rgba(9,15,26,.96);color:#eff6ff;font-size:12px;font-weight:700;box-shadow:0 18px 40px rgba(0,0,0,.34)}",
    ".nfr-shell{max-width:1240px;margin:0 auto;padding:18px 18px 56px}",
    ".nfr-topbar{display:flex;align-items:flex-end;justify-content:space-between;gap:10px;margin-bottom:14px}",
    ".nfr-topcopy{display:flex;flex-direction:column;gap:6px}",
    ".nfr-breadcrumb{margin:0;color:#8fa4c2;font-size:12px;font-weight:700;line-height:1.4}",
    ".nfr-surface-pill{display:inline-flex;align-items:center;width:fit-content;min-height:24px;padding:0 9px;border-radius:999px;border:1px solid rgba(123,155,192,.18);background:rgba(15,23,42,.72);color:#cbd5e1;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}",
    ".nfr-back,.nfr-btn,.nfr-copy-btn,.nfr-filter-select,.nfr-filter-search,.nfr-tab,.nfr-link-btn,.nfr-icon-btn,.nfr-disabled-btn{font:inherit}",
    ".nfr-back,.nfr-tab,.nfr-copy-btn,.nfr-icon-btn{border:1px solid rgba(120,142,170,.24);background:#0d1524;color:#d8e4f0;border-radius:999px;padding:9px 12px;font-size:12px;font-weight:600;cursor:pointer}",
    ".nfr-back:hover,.nfr-tab:hover,.nfr-copy-btn:hover,.nfr-icon-btn:hover{border-color:rgba(123,155,192,.42);background:#12203a;color:#fff}",
    ".nfr-disabled-btn{display:inline-flex;align-items:center;justify-content:center;min-height:32px;padding:0 10px;border-radius:999px;border:1px dashed rgba(120,142,170,.24);background:#0d1524;color:#7f93b1;font-size:11px;font-weight:700;cursor:not-allowed;text-decoration:none}",
    ".nfr-layout{display:grid;grid-template-columns:250px minmax(0,1fr);gap:16px;align-items:start}",
    ".nfr-nav-panel,.nfr-hero,.nfr-panel,.nfr-card,.nfr-native-panel,.nfr-detail-card{border:1px solid rgba(90,112,140,.22);background:rgba(11,18,32,.88);box-shadow:0 16px 36px rgba(0,0,0,.26)}",
    ".nfr-nav-panel{position:sticky;top:14px;border-radius:18px;padding:14px}",
    ".nfr-nav-kicker,.nfr-label{margin:0 0 8px;color:#93a8c7;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}",
    ".nfr-nav-list{display:flex;flex-direction:column;gap:8px}",
    ".nfr-nav-link{display:block;padding:9px 10px;border-radius:12px;border:1px solid transparent;color:#a9b9cf;text-decoration:none;font-size:13px;line-height:1.35}",
    ".nfr-nav-link:hover,.nfr-nav-link.active{background:#12203a;border-color:rgba(123,155,192,.28);color:#fff}",
    ".nfr-main{display:flex;flex-direction:column;gap:14px}",
    ".nfr-hero{border-radius:20px;padding:15px 18px 14px}",
    ".nfr-hero-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}",
    ".nfr-badge{display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;background:rgba(94,126,166,.14);color:#C7D6E5;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}",
    ".nfr-hero h1{margin:0;font-size:24px;line-height:1.08;letter-spacing:-.03em}",
    ".nfr-intro{margin:10px 0 0;color:#c9d5e3;font-size:13px;line-height:1.55;max-width:920px}",
    ".nfr-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}",
    ".nfr-btn{display:inline-flex;align-items:center;justify-content:center;min-height:34px;padding:0 12px;border-radius:999px;text-decoration:none;font-size:12px;font-weight:700}",
    ".nfr-btn-primary{background:#5E7EA6;border:1px solid #5E7EA6;color:#fff}",
    ".nfr-btn-secondary{background:#101b2f;border:1px solid rgba(123,155,192,.24);color:#dce7f5}",
    ".nfr-btn:hover{filter:brightness(1.06)}",
    ".nfr-notice,.nfr-alert{margin-top:12px;padding:10px 12px;border-radius:14px;border:1px solid rgba(201,164,104,.24);background:rgba(96,55,16,.18);color:#f8d28c;font-size:12px;line-height:1.5}",
    ".nfr-stack{display:flex;flex-direction:column;gap:14px}",
    ".nfr-stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}",
    ".nfr-stat{border-radius:14px;padding:12px;background:#0d1524;border:1px solid rgba(90,112,140,.18)}",
    ".nfr-stat-value{display:block;font-size:21px;font-weight:700;line-height:1.05;color:#fff}",
    ".nfr-stat-label{display:block;margin-top:6px;color:#a9b9cf;font-size:12px;line-height:1.45}",
    ".nfr-panel,.nfr-native-panel,.nfr-detail-card{border-radius:18px;padding:14px}",
    ".nfr-panel h2,.nfr-native-panel h2,.nfr-card h3,.nfr-pattern-card h3,.nfr-detail-card h2{margin:0;font-size:18px;line-height:1.25;color:#fff}",
    ".nfr-panel-copy,.nfr-detail-copy{margin:8px 0 0;color:#c9d5e3;font-size:13px;line-height:1.58}",
    ".nfr-list{display:grid;gap:8px;margin:12px 0 0;padding:0;list-style:none}",
    ".nfr-list li{padding:10px 12px;border-radius:12px;background:#0d1524;border:1px solid rgba(90,112,140,.16);font-size:12px;line-height:1.55;color:#d7e2f0}",
    ".nfr-toolbar{display:grid;grid-template-columns:minmax(0,1.4fr) repeat(4,minmax(0,170px));gap:8px;align-items:center}",
    ".nfr-filter-search,.nfr-filter-select,.nfr-textarea,.nfr-input{width:100%;min-height:36px;border-radius:12px;border:1px solid rgba(90,112,140,.24);background:#0d1524;color:#e5edf7;padding:0 12px;font-size:12px;box-sizing:border-box}",
    ".nfr-textarea{min-height:110px;padding:10px 12px;resize:vertical}",
    ".nfr-grid,.nfr-pattern-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:10px}",
    ".nfr-card,.nfr-pattern-card{display:flex;flex-direction:column;gap:10px;border-radius:18px;padding:14px}",
    ".nfr-card-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}",
    ".nfr-card-copy{margin:0;color:#c9d5e3;font-size:12px;line-height:1.55}",
    ".nfr-pill-row,.nfr-tag-row,.nfr-card-actions,.nfr-native-tabs,.nfr-action-row,.nfr-file-list{display:flex;flex-wrap:wrap;gap:6px}",
    ".nfr-pill,.nfr-tag{display:inline-flex;align-items:center;min-height:24px;padding:0 8px;border-radius:999px;border:1px solid rgba(123,155,192,.18);background:#0d1524;color:#bfd3eb;font-size:11px;font-weight:700}",
    ".nfr-pill.good{border-color:rgba(124,183,158,.24);color:#c9f3d1;background:rgba(22,82,44,.26)}",
    ".nfr-pill.warn{border-color:rgba(201,164,104,.26);color:#f8d28c;background:rgba(96,55,16,.18)}",
    ".nfr-preview{padding:14px 16px;border-radius:14px;border:1px solid rgba(90,112,140,.18);background:linear-gradient(135deg,rgba(255,255,255,.03),rgba(148,163,184,.04));color:#fff;font-size:21px;line-height:1.28}",
    ".nfr-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}",
    ".nfr-meta-block{padding:10px 12px;border-radius:12px;background:#0d1524;border:1px solid rgba(90,112,140,.16)}",
    ".nfr-meta-block strong{display:block;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:#9fb7d9}",
    ".nfr-meta-block span{display:block;margin-top:6px;color:#dce7f5;font-size:12px;line-height:1.45}",
    ".nfr-media-thumb,.nfr-pattern-thumb,.nfr-detail-thumb{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:14px;border:1px solid rgba(90,112,140,.16);background:#08111f}",
    ".nfr-link-btn{display:inline-flex;align-items:center;justify-content:center;min-height:32px;padding:0 10px;border-radius:999px;border:1px solid rgba(123,155,192,.24);background:#0d1524;color:#e5edf7;font-size:11px;font-weight:700;text-decoration:none}",
    ".nfr-link-btn:hover{border-color:rgba(123,155,192,.42);color:#fff}",
    ".nfr-section-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}",
    ".nfr-section-title{margin:0;font-size:16px;line-height:1.25;color:#fff}",
    ".nfr-empty,.nfr-error,.nfr-note{padding:16px;border-radius:14px;background:#0d1524;border:1px solid rgba(90,112,140,.18);font-size:13px;line-height:1.6;color:#c9d5e3}",
    ".nfr-note{padding:12px 14px}",
    ".nfr-native-panel{margin:0 0 16px}",
    ".nfr-native-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}",
    ".nfr-native-copy{max-width:760px;color:#c9d5e3;font-size:12px;line-height:1.5;margin:6px 0 0}",
    ".nfr-native-panel-compact{padding:12px 14px;border-radius:16px}",
    ".nfr-native-panel-compact .nfr-native-head{align-items:center}",
    ".nfr-native-panel-compact h2{font-size:16px;line-height:1.25}",
    ".nfr-native-section{display:flex;flex-direction:column;gap:12px}",
    ".nfr-native-toolbar{display:grid;grid-template-columns:minmax(0,1fr) 180px auto;gap:8px;align-items:center}",
    ".nfr-native-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}",
    ".nfr-native-card{display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:14px;border:1px solid rgba(90,112,140,.16);background:#0d1524}",
    ".nfr-native-card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}",
    ".nfr-native-card h3{margin:0;font-size:15px;line-height:1.25;color:#fff}",
    ".nfr-native-card p{margin:0;color:#c9d5e3;font-size:12px;line-height:1.5}",
    ".nfr-native-preview{padding:10px 12px;border-radius:12px;border:1px solid rgba(90,112,140,.16);background:rgba(255,255,255,.03);color:#fff;font-size:17px;line-height:1.25}",
    ".nfr-native-meta{display:flex;flex-wrap:wrap;gap:6px}",
    ".nfr-native-meta span{display:inline-flex;align-items:center;min-height:22px;padding:0 8px;border-radius:999px;border:1px solid rgba(123,155,192,.18);background:#0b1220;color:#bfd3eb;font-size:10px;font-weight:700}",
    ".nfr-native-actions{display:flex;flex-wrap:wrap;gap:6px}",
    ".nfr-native-actions .nfr-link-btn,.nfr-native-actions .nfr-copy-btn,.nfr-native-actions .nfr-icon-btn{min-height:30px;padding:0 10px;font-size:11px}",
    ".nfr-native-empty{padding:12px;border-radius:12px;border:1px dashed rgba(90,112,140,.18);background:#0d1524;color:#c9d5e3;font-size:12px;line-height:1.5}",
    ".nfr-footer-note{margin:2px 0 0;color:#8fa4c2;font-size:11px}",
    ".nfr-detail-shell{position:fixed;inset:0;z-index:2147483600;background:rgba(6,10,18,.7);display:flex;align-items:stretch;justify-content:flex-end;padding:20px;box-sizing:border-box}",
    ".nfr-detail-card{width:min(520px,100%);margin-left:auto;overflow-y:auto;display:flex;flex-direction:column;gap:12px}",
    ".nfr-detail-topbar{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}",
    ".nfr-detail-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}",
    ".nfr-detail-actions{display:flex;flex-wrap:wrap;gap:8px}",
    ".nfr-detail-close{min-width:40px}",
    ".nfr-usage-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}",
    ".nfr-form-grid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);gap:12px}",
    ".nfr-form-panel{display:flex;flex-direction:column;gap:12px}",
    ".nfr-field{display:flex;flex-direction:column;gap:6px}",
    ".nfr-field label{color:#dce7f5;font-size:12px;font-weight:700}",
    ".nfr-helper{margin:0;color:#8fa4c2;font-size:11px;line-height:1.45}",
    ".nfr-toggle{display:flex;align-items:center;gap:8px}",
    ".nfr-toggle input{width:16px;height:16px}",
    ".nfr-dropzone{display:flex;flex-direction:column;gap:8px;align-items:flex-start;padding:14px;border-radius:14px;border:1px dashed rgba(123,155,192,.28);background:rgba(13,21,36,.7);cursor:pointer}",
    ".nfr-dropzone strong{font-size:13px;color:#fff}",
    ".nfr-dropzone span{font-size:12px;color:#c9d5e3;line-height:1.5}",
    ".nfr-dropzone:hover{border-color:rgba(123,155,192,.48);background:rgba(18,32,58,.76)}",
    ".nfr-hidden-input{position:absolute;left:-9999px;opacity:0;pointer-events:none}",
    ".nfr-file-chip{display:inline-flex;align-items:center;gap:6px;min-height:26px;padding:0 9px;border-radius:999px;border:1px solid rgba(123,155,192,.18);background:#0d1524;color:#dce7f5;font-size:11px;font-weight:700}",
    ".nfr-report{display:flex;flex-direction:column;gap:12px}",
    ".nfr-report-block{padding:12px;border-radius:14px;background:#0d1524;border:1px solid rgba(90,112,140,.16)}",
    ".nfr-report-block h3{margin:0 0 8px;font-size:14px;line-height:1.3;color:#fff}",
    ".nfr-report-block p,.nfr-report-block li{margin:0;color:#c9d5e3;font-size:12px;line-height:1.58}",
    ".nfr-report-block ul{display:grid;gap:6px;margin:10px 0 0;padding-left:18px}",
    ".nfr-divider{height:1px;background:rgba(90,112,140,.18)}",
    ".nfr-status-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}",
    "@media (max-width:1180px){.nfr-toolbar{grid-template-columns:minmax(0,1fr) 1fr 1fr}.nfr-toolbar .nfr-filter-select:nth-child(4),.nfr-toolbar .nfr-filter-select:nth-child(5){grid-column:auto}.nfr-form-grid{grid-template-columns:1fr}.nfr-detail-card{width:min(620px,100%)}}",
    "@media (max-width:1080px){.nfr-layout{grid-template-columns:1fr}.nfr-nav-panel{position:static}.nfr-toolbar{grid-template-columns:1fr 1fr}.nfr-toolbar .nfr-filter-select:last-child{grid-column:1/-1}.nfr-native-toolbar{grid-template-columns:1fr}.nfr-detail-shell{padding:12px}}",
    "@media (max-width:720px){.nfr-shell{padding:14px 12px 44px}.nfr-topbar{flex-direction:column;align-items:stretch}.nfr-toolbar,.nfr-meta,.nfr-detail-meta{grid-template-columns:1fr}.nfr-back,.nfr-btn,.nfr-link-btn,.nfr-copy-btn,.nfr-tab,.nfr-icon-btn,.nfr-disabled-btn{width:100%}.nfr-hero h1{font-size:22px}.nfr-detail-shell{align-items:flex-end}.nfr-detail-card{width:100%;max-height:100%}}"
  ].join("");

  function loadFigmaDraft() {
    try {
      var raw = window.localStorage.getItem(FIGMA_STORAGE_KEY);
      if (!raw) {
        return {
          url: "",
          token: "",
          connectLater: true,
          notes: "",
          files: [],
          savedAt: ""
        };
      }
      var parsed = JSON.parse(raw) || {};
      return {
        url: parsed.url || "",
        token: parsed.token || "",
        connectLater: parsed.connectLater !== false,
        notes: parsed.notes || "",
        files: Array.isArray(parsed.files) ? parsed.files : [],
        savedAt: parsed.savedAt || ""
      };
    } catch (_error) {
      return {
        url: "",
        token: "",
        connectLater: true,
        notes: "",
        files: [],
        savedAt: ""
      };
    }
  }

  function saveFigmaDraft() {
    try {
      state.figmaDraft.savedAt = new Date().toISOString();
      window.localStorage.setItem(FIGMA_STORAGE_KEY, JSON.stringify(state.figmaDraft));
    } catch (_error) {
      /* noop */
    }
  }

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

  function getNav() {
    return window.NofidaNavigation || null;
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

  function getHashParams(hash) {
    var current = normalizeHash(hash || window.location.hash || "");
    var queryIndex = current.indexOf("?");
    return new URLSearchParams(queryIndex >= 0 ? current.slice(queryIndex + 1) : "");
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

  function getPageHash(pageId) {
    return PAGE_ROUTES[pageId] || PAGE_ROUTES.fonts;
  }

  function getBackInfo(pageId) {
    var nav = getNav();
    var currentHash = getPageHash(pageId);
    if (!nav) {
      return {
        hash: normalizeHash(state.lastAppHash || "#/dashboard"),
        label: "Назад к проектам"
      };
    }
    return nav.getBackTargetInfo(currentHash, window.location.hash || currentHash);
  }

  function getBreadcrumb(pageId) {
    var nav = getNav();
    if (!nav) return "Панель / Ресурсы";
    var routeMeta = nav.getRouteMeta(getPageHash(pageId));
    return routeMeta && Array.isArray(routeMeta.breadcrumb) && routeMeta.breadcrumb.length
      ? routeMeta.breadcrumb.join(" / ")
      : "Панель / Ресурсы";
  }

  function getTeamId() {
    var fromHash = (window.location.hash || "").match(/#\/dashboard\/team\/([0-9a-f-]{36})/i);
    if (fromHash) return fromHash[1];
    var fromQuery = (window.location.hash || "").match(/[?&]team-id=([0-9a-f-]{36})/i);
    if (fromQuery) return fromQuery[1];
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
    return teamId ? "#/dashboard/fonts?team-id=" + teamId : "#/dashboard";
  }

  function openNativeFonts(event) {
    if (event) event.preventDefault();
    window.location.hash = nativeFontsHash().slice(1);
  }

  function isNativeFontsHash(hash) {
    return /#\/dashboard(?:\/team\/[0-9a-f-]{36})?\/fonts(?:[/?#].*)?$/i.test(normalizeHash(hash || window.location.hash || ""));
  }

  function looksLikeNativeFontsSurface() {
    return !!document.querySelector("#dashboard-fonts-title, " + NATIVE_CONTAINER_SELECTOR);
  }

  function showToast(message) {
    if (!message) return;
    var toast = ensureToast();
    toast.textContent = message;
    toast.removeAttribute("hidden");
    if (state.toastTimer) window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(function () {
      toast.setAttribute("hidden", "");
      toast.textContent = "";
      state.toastTimer = null;
    }, 1800);
  }

  function ensureToast() {
    if (state.toastEl) return state.toastEl;
    var toast = document.createElement("div");
    toast.id = TOAST_ID;
    toast.setAttribute("hidden", "");
    document.body.appendChild(toast);
    state.toastEl = toast;
    return toast;
  }

  function copyText(value, successText, fallbackLabel) {
    var text = String(value || "");
    if (!text) return Promise.resolve(false);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () {
        showToast(successText || "Скопировано");
        return true;
      }).catch(function () {
        window.prompt(fallbackLabel || "Скопируйте значение", text);
        return false;
      });
    }
    window.prompt(fallbackLabel || "Скопируйте значение", text);
    return Promise.resolve(false);
  }

  function absoluteUrl(value) {
    var current = String(value || "");
    if (!current) return "";
    return current.indexOf("http") === 0 ? current : window.location.origin + current;
  }

  function arrayify(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (!value && value !== 0) return [];
    return [value];
  }

  function unique(values) {
    return values.filter(function (value, index, source) {
      return value && source.indexOf(value) === index;
    });
  }

  function titleCaseStatus(value, fallback) {
    var normalized = String(value || fallback || "").toLowerCase();
    if (!normalized) return "";
    if (normalized === "approved") return "Проверено";
    if (normalized === "available") return "Доступно";
    if (normalized === "planned") return "Планируется";
    if (normalized === "installed") return "Добавлено";
    if (normalized === "review") return "Проверяется";
    if (normalized === "reviewed") return "Проверено";
    return normalized.charAt(0).toUpperCase() + normalized.slice(1).replace(/_/g, " ");
  }

  function humanInstallState(value) {
    var normalized = String(value || "").toLowerCase();
    if (normalized === "available") return "Доступен";
    if (normalized === "installed") return "Добавлен";
    if (normalized === "planned") return "Подготовка";
    if (normalized === "upload_required") return "Загрузите вручную";
    if (normalized === "needs_review") return "Проверка";
    if (normalized === "not_supported_yet") return "Через нативную загрузку";
    return titleCaseStatus(value, "Проверка");
  }

  function humanBooleanLabel(value, good, warn) {
    return value ? good : warn;
  }

  function buildFontDetailNote(font) {
    var parts = ["Проверенное семейство с открытой лицензией."];
    parts.push(font.commercialUseAllowed ? "Разрешено для коммерческого использования." : "Перед коммерческим использованием проверьте условия лицензии.");
    parts.push("Скачайте файл и добавьте его через нативную загрузку, если шрифт нужен в рабочем пространстве.");
    return parts.join(" ");
  }

  function buildAssetDetailNote(asset) {
    var parts = ["Локальный ассет NOFIDA со сведениями об источнике и лицензии."];
    parts.push(asset.attributionRequired ? "Для публикации сохраните атрибуцию." : "Атрибуция не требуется.");
    parts.push(asset.commercialUseAllowed ? "Разрешено для коммерческого использования." : "Перед коммерческим использованием проверьте условия лицензии.");
    return parts.join(" ");
  }

  function buildPatternDetailNote(pattern) {
    var sourceModel = pattern.sourceModel ? " Основа: " + pattern.sourceModel + "." : "";
    return "Компактный ориентир для экранов NOFIDA." + sourceModel + " Используйте структуру и токены как отправную точку, затем адаптируйте под свой сценарий.";
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

  function normalizeFontCatalog(catalog) {
    var audit = catalog.fontInstallFeasibility || {};
    var fonts = (Array.isArray(catalog.fonts) ? catalog.fonts : []).map(function (font) {
      var previewFilePath = font.previewFilePath || font.preview_file_path || "";
      var localFilePaths = arrayify(font.localFilePaths || font.local_file_paths);
      return {
        id: font.id || font.family || "",
        family: font.family || font.id || "Без названия",
        category: font.category || "sans",
        mood: arrayify(font.mood),
        useCases: arrayify(font.useCases || font.recommendedUseCase),
        languageCoverage: arrayify(font.languageCoverage),
        license: font.license || "Проверка",
        licenseUrl: font.licenseUrl || "",
        attributionRequired: Boolean(font.attributionRequired),
        pairingSuggestions: arrayify(font.pairingSuggestions),
        fileStatus: font.fileStatus || (localFilePaths.length ? "available" : "planned"),
        approvalStatus: font.approvalStatus || "approved",
        sourceName: font.sourceName || "NOFIDA",
        sourceAuthor: font.sourceAuthor || "",
        sourceUrl: font.sourceUrl || "",
        previewText: font.previewText || font.family || "",
        previewFilePath: previewFilePath || localFilePaths[0] || "",
        localFilePaths: localFilePaths,
        recommendedUseCase: font.recommendedUseCase || arrayify(font.useCases)[0] || "",
        commercialUseAllowed: font.commercialUseAllowed !== false,
        modificationAllowed: font.modificationAllowed !== false,
        redistributionAllowed: font.redistributionAllowed !== false,
        reviewNotes: font.reviewNotes || "",
        approvedAt: font.approvedAt || ""
      };
    });

    return {
      fonts: fonts,
      storeRoot: catalog.storeRoot || "/opt/nofida-core/font-store",
      uploadFormats: arrayify(audit.supportedUploadFormats || ["ttf", "otf", "woff", "woff2"]),
      automatedInstall: audit.automatedInstall || "not_supported_yet",
      recommendedNextStep: audit.recommendedNextStep || "Скачайте проверенный файл и добавьте его через нативную загрузку.",
      nativeUploadRoutePattern: audit.nativeUploadRoutePattern || "#/dashboard/team/:team-id/fonts",
      selectionBoundary: catalog.selectionBoundary || null
    };
  }

  function normalizeMediaCatalog(catalog) {
    var assets = (Array.isArray(catalog.assets) ? catalog.assets : []).map(function (asset) {
      return {
        id: asset.id || asset.title || "",
        title: asset.title || asset.id || "Без названия",
        category: asset.category || "media",
        style: asset.style || "",
        mood: asset.mood || "",
        audience: asset.audience || "",
        useCases: arrayify(asset.useCases),
        format: asset.format || "asset",
        license: asset.license || "review",
        licenseUrl: asset.licenseUrl || "",
        sourceName: asset.sourceName || asset.source || "NOFIDA",
        sourceAuthor: asset.sourceAuthor || "",
        sourceUrl: asset.sourceUrl || "",
        internalUrl: asset.localFilePath || asset.internalUrl || asset.internal_url || "",
        thumbnailUrl: asset.thumbnailPath || asset.thumbnailUrl || asset.thumbnail_url || asset.localFilePath || "",
        approvalStatus: asset.approvalStatus || "approved",
        tags: arrayify(asset.tags),
        dominantColors: arrayify(asset.dominantColors),
        attributionRequired: Boolean(asset.attributionRequired),
        commercialUseAllowed: asset.commercialUseAllowed !== false,
        modificationAllowed: asset.modificationAllowed !== false,
        redistributionAllowed: asset.redistributionAllowed !== false,
        reviewNotes: asset.reviewNotes || "",
        approvedAt: asset.approvedAt || "",
        supportsProjectInsert: asset.supportsProjectInsert === true
      };
    });

    var uiPatterns = (Array.isArray(catalog.uiPatterns) ? catalog.uiPatterns : []).map(function (pattern) {
      return {
        id: pattern.id || pattern.title || "",
        title: pattern.title || pattern.id || "Без названия",
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
        if (!action.action && action.href && action.href.charAt(0) === "#") {
          attrs += ' data-nofida-route="' + escapeHtml(action.href) + '"';
        }
        return '<a class="' + klass + '" href="' + escapeHtml(action.href || "#") + '"' + attrs + ">" + escapeHtml(action.label) + "</a>";
      }).join(""),
      "</div>"
    ].join("");
  }

  function renderNav(currentPageId) {
    var nav = getNav();
    if (!nav) {
      var items = [
        { id: "libraries", label: "Библиотеки", href: "#/nofida/libraries" },
        { id: "plugins", label: "Плагины", href: "#/nofida/plugins" },
        { id: "fonts", label: "Шрифты", href: PAGE_ROUTES.fonts },
        { id: "media", label: "Медиабанк", href: PAGE_ROUTES.media },
        { id: "figma", label: "Импорт из Figma", href: PAGE_ROUTES.figma }
      ];
      return items.map(function (item) {
        var classes = ["nfr-nav-link"];
        if (item.id === currentPageId) classes.push("active");
        return '<a class="' + classes.join(" ") + '" href="' + escapeHtml(item.href) + '">' + escapeHtml(item.label) + "</a>";
      }).join("");
    }

    var currentHash = getPageHash(currentPageId);
    var activeId = nav.getActiveResourceMenuId(currentHash);
    return nav.getResourceMenuItems(currentHash).map(function (item) {
      var classes = ["nfr-nav-link"];
      if (item.id === activeId) classes.push("active");
      return '<a class="' + classes.join(" ") + '" href="' + escapeHtml(item.href) + '" data-nofida-route="' +
        escapeHtml(item.href) + '">' + escapeHtml(item.label) + "</a>";
    }).join("");
  }

  function renderMetaBlock(label, value) {
    return [
      '<div class="nfr-meta-block">',
      '  <strong>' + escapeHtml(label) + "</strong>",
      '  <span>' + escapeHtml(value || "—") + "</span>",
      "</div>"
    ].join("");
  }

  function renderNotePanel(label, title, copy, list) {
    return [
      '<section class="nfr-panel">',
      '  <p class="nfr-label">' + escapeHtml(label) + "</p>",
      '  <h2>' + escapeHtml(title) + "</h2>",
      copy ? '<p class="nfr-panel-copy">' + escapeHtml(copy) + "</p>" : "",
      Array.isArray(list) && list.length ? [
        '  <ul class="nfr-list">',
        list.map(function (item) { return "<li>" + escapeHtml(item) + "</li>"; }).join(""),
        "  </ul>"
      ].join("") : "",
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

  function assetMatches(asset, filterState) {
    var query = String(filterState.query || "").toLowerCase().trim();
    if (filterState.category !== "all" && asset.category !== filterState.category) return false;
    if (filterState.style !== "all" && asset.style !== filterState.style) return false;
    if (filterState.mood !== "all" && asset.mood !== filterState.mood) return false;
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

  function renderFontCard(font, isNativeSurface) {
    var fontFamily = font.runtimeFontFamily || font.family || "Inter";
    var previewStyle = "font-family:'" + String(fontFamily).replace(/'/g, "\\'") + "',Inter,\"Segoe UI\",system-ui,sans-serif";
    var downloadUrl = font.previewFilePath || (font.localFilePaths || [])[0] || "";
    var canDownload = font.approvalStatus === "approved" && !!downloadUrl;
    return [
      '<article class="nfr-card">',
      '  <div class="nfr-card-top">',
      "    <div>",
      '      <p class="nfr-label">Семейство</p>',
      '      <h3>' + escapeHtml(font.family) + "</h3>",
      "    </div>",
      '    <div class="nfr-pill-row">',
      '      <span class="nfr-pill">' + escapeHtml(font.category) + "</span>",
      '      <span class="nfr-pill good">' + escapeHtml(font.license) + "</span>",
      '      <span class="nfr-pill ' + (font.approvalStatus === "approved" ? "good" : "warn") + '">' + escapeHtml(titleCaseStatus(font.approvalStatus, "Проверка")) + "</span>",
      "    </div>",
      "  </div>",
      '  <div class="nfr-preview" style="' + escapeHtml(previewStyle) + '">' + escapeHtml(font.previewText || font.family) + "</div>",
      '  <p class="nfr-card-copy">' + escapeHtml(font.recommendedUseCase || "Проверенное семейство для продуктовых интерфейсов и макетов.") + "</p>",
      '  <div class="nfr-meta">',
      renderMetaBlock("Языки", arrayify(font.languageCoverage).join(", ")),
      renderMetaBlock("Статус файла", humanInstallState(font.fileStatus)),
      renderMetaBlock("Сочетания", arrayify(font.pairingSuggestions).slice(0, 3).join(", ")),
      renderMetaBlock("Характер", arrayify(font.mood).slice(0, 3).join(", ")),
      "  </div>",
      '  <div class="nfr-tag-row">',
      arrayify(font.useCases).map(function (tag) {
        return '<span class="nfr-tag">' + escapeHtml(tag) + "</span>";
      }).join(""),
      "  </div>",
      '  <div class="nfr-card-actions">',
      canDownload
        ? '<a class="nfr-link-btn" href="' + escapeHtml(downloadUrl) + '" target="_blank" rel="noreferrer">Скачать</a>'
        : '<span class="nfr-pill warn">Скачивание недоступно</span>',
      isNativeSurface
        ? '<button class="nfr-copy-btn" type="button" data-nfr-native-nav="upload">Открыть загрузку</button>'
        : '<a class="nfr-link-btn" href="' + escapeHtml(nativeFontsHash()) + '" data-nfr-action="native-fonts">Открыть загрузку</a>',
      '<button class="nfr-copy-btn" type="button" data-copy-name="' + escapeHtml(font.family) + '">Копировать название</button>',
      '<button class="nfr-icon-btn" type="button" data-nfr-detail-kind="font" data-nfr-detail-id="' + escapeHtml(font.id) + '" data-nfr-detail-source="' + escapeHtml(isNativeSurface ? "native" : "overlay") + '">Подробнее</button>',
      "  </div>",
      "</article>"
    ].join("");
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
      '      <span class="nfr-pill ' + (usable ? "good" : "warn") + '">' + escapeHtml(titleCaseStatus(asset.approvalStatus, "Проверка")) + "</span>",
      "    </div>",
      "  </div>",
      '  <p class="nfr-card-copy">' + escapeHtml([asset.style, asset.mood, asset.audience].filter(Boolean).join(" · ")) + "</p>",
      '  <div class="nfr-meta">',
      renderMetaBlock("Сценарии", arrayify(asset.useCases).slice(0, 3).join(", ")),
      renderMetaBlock("Источник", asset.sourceName),
      renderMetaBlock("Цвета", arrayify(asset.dominantColors).slice(0, 3).join(", ")),
      renderMetaBlock("Теги", arrayify(asset.tags).slice(0, 4).join(", ")),
      "  </div>",
      '  <div class="nfr-card-actions">',
      usable && asset.internalUrl
        ? '<a class="nfr-link-btn" href="' + escapeHtml(asset.internalUrl) + '" target="_blank" rel="noreferrer">Скачать</a>'
        : '<span class="nfr-pill warn">Пока без выдачи</span>',
      usable && asset.internalUrl
        ? '<button class="nfr-copy-btn" type="button" data-copy-url="' + escapeHtml(asset.internalUrl) + '">Копировать ссылку</button>'
        : "",
      usable && asset.internalUrl && /\.svg(?:$|\?)/i.test(asset.internalUrl)
        ? '<button class="nfr-copy-btn" type="button" data-copy-svg="' + escapeHtml(asset.internalUrl) + '">Скопировать SVG</button>'
        : "",
      '<button class="nfr-icon-btn" type="button" data-nfr-detail-kind="media" data-nfr-detail-id="' + escapeHtml(asset.id) + '">Открыть детали</button>',
      asset.supportsProjectInsert
        ? '<a class="nfr-link-btn" href="' + escapeHtml(asset.internalUrl) + '" target="_blank" rel="noreferrer">Использовать в проекте</a>'
        : '<button class="nfr-disabled-btn" type="button" data-nfr-disabled-msg="Автоматическое добавление в файл будет подключено позже." title="Автоматическое добавление в файл будет подключено позже.">Использовать в проекте</button>',
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
      '      <p class="nfr-label">UI-паттерн</p>',
      '      <h3>' + escapeHtml(pattern.title) + "</h3>",
      "    </div>",
      '    <div class="nfr-pill-row">',
      '      <span class="nfr-pill">' + escapeHtml(pattern.sourceModel || "NOFIDA") + "</span>",
      '      <span class="nfr-pill good">' + escapeHtml(pattern.license || "MIT") + "</span>",
      "    </div>",
      "  </div>",
      '  <p class="nfr-card-copy">' + escapeHtml(pattern.recommendedUse || "") + "</p>",
      '  <div class="nfr-meta">',
      renderMetaBlock("Источник", pattern.sourceName || pattern.sourceModel || "NOFIDA"),
      renderMetaBlock("Статус", titleCaseStatus(pattern.approvalStatus, "Проверено")),
      "  </div>",
      '  <div class="nfr-tag-row">',
      arrayify(pattern.tokens).map(function (token) {
        return '<span class="nfr-tag">' + escapeHtml(token) + "</span>";
      }).join(""),
      "  </div>",
      '  <div class="nfr-card-actions">',
      '<button class="nfr-icon-btn" type="button" data-nfr-detail-kind="pattern" data-nfr-detail-id="' + escapeHtml(pattern.id) + '">Открыть детали</button>',
      "  </div>",
      "</article>"
    ].join("");
  }

  function renderFontExplorer(target, normalized, filterKey, isNativeSurface) {
    var filterState = state.filters[filterKey];
    var categories = ["all"].concat(unique(normalized.fonts.map(function (font) { return font.category; })));
    var matches = normalized.fonts.filter(function (font) {
      return fontMatches(font, filterState);
    });

    ensurePreviewFonts(matches.slice(0, 14));
    matches.forEach(function (font) {
      if (!font.runtimeFontFamily) font.runtimeFontFamily = "NOFIDA-" + font.id;
    });

    target.innerHTML = [
      '<section class="nfr-panel">',
      '  <div class="nfr-section-head">',
      '    <div>',
      '      <p class="nfr-label">Каталог</p>',
      '      <h2 class="nfr-section-title">' + escapeHtml(isNativeSurface ? "Рекомендованные шрифты" : "Проверенный каталог шрифтов") + "</h2>",
      "    </div>",
      '    <div class="nfr-pill-row">',
      '      <span class="nfr-pill">' + escapeHtml(String(matches.length)) + " семейст.</span>",
      '      <span class="nfr-pill warn">' + escapeHtml(humanInstallState(normalized.automatedInstall)) + "</span>",
      "    </div>",
      "  </div>",
      '  <p class="nfr-panel-copy">Выберите проверенный шрифт NOFIDA или загрузите свой. Шрифты можно скачать и добавить через нативную загрузку.</p>',
      '  <div class="nfr-toolbar">',
      '    <input class="nfr-filter-search" data-nfr-filter="' + escapeHtml(filterKey) + ':query" type="search" placeholder="Найти семейство, сценарий, язык или настроение..." value="' + escapeHtml(filterState.query || "") + '"/>',
      '    <select class="nfr-filter-select" data-nfr-filter="' + escapeHtml(filterKey) + ':category">',
      categories.map(function (category) {
        return '<option value="' + escapeHtml(category) + '"' + (filterState.category === category ? " selected" : "") + ">" + escapeHtml(category === "all" ? "Все категории" : category) + "</option>";
      }).join(""),
      "    </select>",
      '    <select class="nfr-filter-select" disabled><option>' + escapeHtml("Загрузка: " + normalized.uploadFormats.join(" / ").toUpperCase()) + "</option></select>",
      '    <select class="nfr-filter-select" disabled><option>' + escapeHtml("Источник и лицензия: доступны в деталях") + "</option></select>",
      '    <select class="nfr-filter-select" disabled><option>' + escapeHtml("Автоматическая установка позже") + "</option></select>",
      "  </div>",
      '  <div class="nfr-grid">',
      matches.length ? matches.map(function (font) { return renderFontCard(font, isNativeSurface); }).join("") : '<div class="nfr-empty">По этому запросу пока нет подходящих шрифтов.</div>',
      "  </div>",
      "</section>"
    ].join("");

    bindActionHandlers(target);
    bindFilterHandlers(target, normalized, filterKey, isNativeSurface ? "font-native" : "font-overlay");
    bindNativeTabHandlers(target);
  }

  function renderMediaExplorer(target, normalized) {
    var filterState = state.filters.media;
    var categories = ["all"].concat(unique(normalized.assets.map(function (asset) { return asset.category; })));
    var styles = ["all"].concat(unique(normalized.assets.map(function (asset) { return asset.style; })));
    var moods = ["all"].concat(unique(normalized.assets.map(function (asset) { return asset.mood; })));
    var licenses = ["all"].concat(unique(normalized.assets.map(function (asset) { return asset.license; })));
    var assets = normalized.assets.filter(function (asset) {
      return assetMatches(asset, filterState);
    });

    target.innerHTML = [
      '<section class="nfr-panel">',
      '  <div class="nfr-section-head">',
      '    <div>',
      '      <p class="nfr-label">Медиабанк</p>',
      '      <h2 class="nfr-section-title">Поиск ассетов и паттернов</h2>',
      "    </div>",
      '    <div class="nfr-pill-row">',
      '      <span class="nfr-pill">' + escapeHtml(String(assets.length)) + " ассет.</span>",
      '      <span class="nfr-pill">' + escapeHtml(String(normalized.uiPatterns.length)) + " UI-паттерн.</span>",
      "    </div>",
      "  </div>",
      '  <p class="nfr-panel-copy">Все материалы хранятся внутри NOFIDA и имеют сведения об источнике и лицензии. Вы можете скачать ассет или использовать его как основу для проекта.</p>',
      '  <div class="nfr-toolbar">',
      '    <input class="nfr-filter-search" data-nfr-filter="media:query" type="search" placeholder="Найти категорию, тег, источник или сценарий..." value="' + escapeHtml(filterState.query || "") + '"/>',
      '    <select class="nfr-filter-select" data-nfr-filter="media:category">',
      categories.map(function (category) {
        return '<option value="' + escapeHtml(category) + '"' + (filterState.category === category ? " selected" : "") + ">" + escapeHtml(category === "all" ? "Все категории" : category) + "</option>";
      }).join(""),
      "    </select>",
      '    <select class="nfr-filter-select" data-nfr-filter="media:style">',
      styles.map(function (style) {
        return '<option value="' + escapeHtml(style) + '"' + (filterState.style === style ? " selected" : "") + ">" + escapeHtml(style === "all" ? "Все стили" : style) + "</option>";
      }).join(""),
      "    </select>",
      '    <select class="nfr-filter-select" data-nfr-filter="media:mood">',
      moods.map(function (mood) {
        return '<option value="' + escapeHtml(mood) + '"' + (filterState.mood === mood ? " selected" : "") + ">" + escapeHtml(mood === "all" ? "Все настроения" : mood) + "</option>";
      }).join(""),
      "    </select>",
      '    <select class="nfr-filter-select" data-nfr-filter="media:license">',
      licenses.map(function (license) {
        return '<option value="' + escapeHtml(license) + '"' + (filterState.license === license ? " selected" : "") + ">" + escapeHtml(license === "all" ? "Все лицензии" : license) + "</option>";
      }).join(""),
      "    </select>",
      "  </div>",
      '  <div class="nfr-grid">',
      assets.length ? assets.map(renderMediaCard).join("") : '<div class="nfr-empty">По этим фильтрам пока ничего не найдено.</div>',
      "  </div>",
      "</section>",
      normalized.uiPatterns.length ? [
        '<section class="nfr-panel">',
        '  <p class="nfr-label">UI-паттерны</p>',
        "  <h2>Компактный реестр интерфейсных решений</h2>",
        '  <p class="nfr-panel-copy">Паттерны помогают быстро выбрать направление для onboarding, empty state, настроек и плотных рабочих экранов.</p>',
        '  <div class="nfr-pattern-grid">',
        normalized.uiPatterns.map(renderPatternCard).join(""),
        "  </div>",
        "</section>"
      ].join("") : ""
    ].join("");

    bindFilterHandlers(target, normalized, "media", "media");
    bindActionHandlers(target);
  }

  function renderFontBody(catalog) {
    var normalized = normalizeFontCatalog(catalog);
    var approvedCount = normalized.fonts.filter(function (font) { return font.approvalStatus === "approved"; }).length;
    return [
      '<div class="nfr-stack">',
      renderStats([
        { value: String(normalized.fonts.length), label: "Проверенные семейства" },
        { value: String(approvedCount), label: "Готовы к использованию" },
        { value: normalized.uploadFormats.join(" / ").toUpperCase(), label: "Форматы нативной загрузки" }
      ]),
      renderNotePanel(
        "Как использовать",
        "Стабильный сценарий со шрифтами",
        "Основной рабочий путь остается нативным: выберите семейство, скачайте файл и загрузите его в пространство команды.",
        [
          "Выберите проверенный шрифт NOFIDA или загрузите свой.",
          "Шрифты можно скачать и добавить через нативную загрузку.",
          "Автоматическая установка будет включена после безопасного подключения к системному хранилищу шрифтов."
        ]
      ),
      '<div id="nfr-font-explorer"></div>',
      "</div>"
    ].join("");
  }

  function renderMediaBody(catalog) {
    var normalized = normalizeMediaCatalog(catalog);
    return [
      '<div class="nfr-stack">',
      renderStats([
        { value: String(normalized.assets.length), label: "Локальные ассеты" },
        { value: String(normalized.assets.filter(function (asset) { return !!asset.thumbnailUrl; }).length), label: "Миниатюры" },
        { value: String(normalized.uiPatterns.length), label: "UI-паттерны" }
      ]),
      renderNotePanel(
        "Что внутри",
        "Проверенный набор для интерфейсов и презентаций",
        "Медиабанк собран для быстрых продуктовых сценариев: иконки, иллюстрации, фоны, empty states и интерфейсные заготовки.",
        [
          "Все материалы хранятся внутри NOFIDA и имеют сведения об источнике и лицензии.",
          "Кнопки на карточках ведут только к локальным действиям: скачать, скопировать ссылку, скопировать SVG и открыть детали.",
          "Автоматическое добавление в файл будет подключено позже."
        ]
      ),
      '<div id="nfr-media-explorer"></div>',
      "</div>"
    ].join("");
  }

  function renderFigmaBody() {
    var draft = state.figmaDraft;
    var report = state.figmaReport;
    var stage = state.figmaStage;
    return [
      '<div class="nfr-stack">',
      renderStats([
        { value: "URL + файлы", label: "Ссылка, экспорт и пакет ассетов собираются в одном запросе" },
        { value: "План переноса", label: "Сначала анализируются страницы, шрифты, ассеты и риски" },
        { value: "Без ложной 1:1 гарантии", label: "Сложные компоненты и прототипы отмечаются в отчете отдельно" }
      ]),
      '<section class="nfr-panel">',
      '  <div class="nfr-section-head">',
      '    <div>',
      '      <p class="nfr-label">Помощник миграции</p>',
      '      <h2 class="nfr-section-title">Подготовьте перенос из Figma</h2>',
      "    </div>",
      '    <div class="nfr-pill-row">',
      draft.savedAt ? '<span class="nfr-pill">Сохранено: ' + escapeHtml(formatSavedAt(draft.savedAt)) + "</span>" : "",
      stage.updatedAt ? '<span class="nfr-pill good">Черновик обновлен</span>' : "",
      "    </div>",
      "  </div>",
      '  <p class="nfr-panel-copy">NOFIDA сначала анализирует файл и готовит план переноса. Полная точность зависит от структуры исходного проекта.</p>',
      '  <div class="nfr-form-grid">',
      '    <div class="nfr-form-panel">',
      '      <div class="nfr-field">',
      '        <label for="nfr-figma-url">Ссылка на файл Figma</label>',
      '        <input id="nfr-figma-url" class="nfr-input" type="url" placeholder="https://www.figma.com/file/..." value="' + escapeHtml(draft.url || "") + '"/>',
      '        <p class="nfr-helper">Можно оставить поле пустым, если у вас есть только экспорт.</p>',
      "      </div>",
      '      <div class="nfr-field">',
      '        <label for="nfr-figma-token">Токен доступа Figma</label>',
      '        <input id="nfr-figma-token" class="nfr-input" type="password" placeholder="Введите токен или продолжите позже" value="' + escapeHtml(draft.token || "") + '"' + (draft.connectLater ? " disabled" : "") + '/>',
      '        <label class="nfr-toggle"><input id="nfr-figma-later" type="checkbox"' + (draft.connectLater ? " checked" : "") + '/><span>Подключить позже</span></label>',
      '        <p class="nfr-helper">Если токена пока нет, помощник все равно соберет предварительный план по URL, файлам и заметкам.</p>',
      "      </div>",
      '      <div class="nfr-field">',
      '        <label>Файлы и экспорт</label>',
      '        <label class="nfr-dropzone" for="nfr-figma-files">',
      '          <strong>Добавить .fig, .zip, .svg, .png, .pdf или пакет ассетов</strong>',
      '          <span>Файлы не отправляются в проект. Здесь формируется локальный запрос на анализ и список материалов для переноса.</span>',
      "        </label>",
      '        <input id="nfr-figma-files" class="nfr-hidden-input" type="file" accept="' + escapeHtml(FIGMA_FILE_ACCEPT) + '" multiple/>',
      draft.files.length ? '<div class="nfr-file-list">' + draft.files.map(renderFigmaFileChip).join("") + "</div>" : '<div class="nfr-note">Файлы еще не выбраны.</div>',
      "      </div>",
      '      <div class="nfr-field">',
      '        <label for="nfr-figma-notes">Заметки</label>',
      '        <textarea id="nfr-figma-notes" class="nfr-textarea" placeholder="Что важно сохранить: страницы, бренд, сложные компоненты, ключевые ассеты, сроки...">' + escapeHtml(draft.notes || "") + '</textarea>',
      '        <p class="nfr-helper">Сложные компоненты, автолэйауты и прототипы могут потребовать ручной проверки.</p>',
      "      </div>",
      '      <div class="nfr-action-row">',
      '        <button id="nfr-figma-submit" class="nfr-btn nfr-btn-primary" type="button">Создать отчёт миграции</button>',
      '        <button id="nfr-figma-stage" class="nfr-btn nfr-btn-secondary" type="button">Импортировать ассеты</button>',
      '        <button id="nfr-figma-guide" class="nfr-btn nfr-btn-secondary" type="button">Скачать инструкцию</button>',
      '        <a class="nfr-btn nfr-btn-secondary" href="' + escapeHtml(PAGE_ROUTES.media) + '" data-nofida-route="' + escapeHtml(PAGE_ROUTES.media) + '">Открыть медиабанк</a>',
      '        <a class="nfr-btn nfr-btn-secondary" href="' + escapeHtml(PAGE_ROUTES.fonts) + '" data-nofida-route="' + escapeHtml(PAGE_ROUTES.fonts) + '">Подобрать шрифты</a>',
      "      </div>",
      stage.message ? '<div class="nfr-note">' + escapeHtml(stage.message) + "</div>" : "",
      "    </div>",
      '    <div class="nfr-form-panel" id="nfr-figma-report-anchor">',
      renderFigmaReport(report),
      "    </div>",
      "  </div>",
      "</section>",
      "</div>"
    ].join("");
  }

  function renderFigmaFileChip(file) {
    return '<span class="nfr-file-chip">' + escapeHtml(file.name) + " · " + escapeHtml(file.extension.toUpperCase()) + "</span>";
  }

  function formatSavedAt(value) {
    try {
      return new Date(value).toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch (_error) {
      return value;
    }
  }

  function renderFigmaReport(report) {
    if (!report) {
      return [
        '<div class="nfr-report">',
        '  <div class="nfr-report-block">',
        "    <h3>Что появится в отчете</h3>",
        "    <p>После анализа здесь появится краткий план переноса: источник, ожидаемый состав страниц и ассетов, шрифты, медиарекомендации и ручные шаги.</p>",
        "  </div>",
        '  <div class="nfr-report-block">',
        "    <h3>Сейчас можно подготовить</h3>",
        '    <ul><li>Ссылку на файл или экспорт</li><li>Пакет SVG, PNG, PDF или ZIP</li><li>Заметки о бренде, шрифтах и сложных экранах</li></ul>',
        "  </div>",
        "</div>"
      ].join("");
    }

    return [
      '<div class="nfr-report">',
      '  <div class="nfr-report-block">',
      "    <h3>Сводка</h3>",
      "    <p>" + escapeHtml(report.summary) + "</p>",
      "  </div>",
      '  <div class="nfr-report-block">',
      "    <h3>Источник и состав</h3>",
      '    <ul>' + report.sourceFacts.map(function (item) { return "<li>" + escapeHtml(item) + "</li>"; }).join("") + "</ul>",
      "  </div>",
      '  <div class="nfr-report-block">',
      "    <h3>Шрифты NOFIDA</h3>",
      '    <ul>' + report.fontSuggestions.map(function (item) { return "<li>" + escapeHtml(item) + "</li>"; }).join("") + "</ul>",
      "  </div>",
      '  <div class="nfr-report-block">',
      "    <h3>Библиотеки и медиакатегории</h3>",
      '    <ul>' + report.resourceSuggestions.map(function (item) { return "<li>" + escapeHtml(item) + "</li>"; }).join("") + "</ul>",
      "  </div>",
      '  <div class="nfr-report-block">',
      "    <h3>Следующие шаги</h3>",
      '    <ul>' + report.nextSteps.map(function (item) { return "<li>" + escapeHtml(item) + "</li>"; }).join("") + "</ul>",
      "  </div>",
      "</div>"
    ].join("");
  }

  function renderLoading(copy) {
    return '<div class="nfr-empty">' + escapeHtml(copy) + "</div>";
  }

  function renderError(message) {
    return '<div class="nfr-error">' + escapeHtml(message) + "</div>";
  }

  function bindActionHandlers(root) {
    if (!root || root.getAttribute("data-nfr-bound") === "true") return;
    root.setAttribute("data-nfr-bound", "true");
    root.addEventListener("click", function (event) {
      var target = event.target;
      if (!(target instanceof HTMLElement)) return;

      var nativeLink = target.closest("[data-nfr-action='native-fonts']");
      if (nativeLink) {
        event.preventDefault();
        openNativeFonts(event);
        return;
      }

      var focusFigma = target.closest("[data-nfr-action='focus-figma-report']");
      if (focusFigma) {
        event.preventDefault();
        if (state.currentPageId !== "figma") {
          window.location.hash = PAGE_ROUTES.figma.slice(1);
          return;
        }
        var anchor = state.overlayEl && state.overlayEl.querySelector("#nfr-figma-report-anchor");
        if (anchor) anchor.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }

      var copyName = target.closest("[data-copy-name]");
      if (copyName) {
        event.preventDefault();
        copyText(copyName.getAttribute("data-copy-name"), "Название скопировано", "Скопируйте название");
        return;
      }

      var copyUrl = target.closest("[data-copy-url]");
      if (copyUrl) {
        event.preventDefault();
        copyText(absoluteUrl(copyUrl.getAttribute("data-copy-url")), "Ссылка скопирована", "Скопируйте ссылку");
        return;
      }

      var copySvg = target.closest("[data-copy-svg]");
      if (copySvg) {
        event.preventDefault();
        copySvgContent(copySvg.getAttribute("data-copy-svg"));
        return;
      }

      var detail = target.closest("[data-nfr-detail-kind]");
      if (detail) {
        event.preventDefault();
        openDetails(
          detail.getAttribute("data-nfr-detail-kind") || "",
          detail.getAttribute("data-nfr-detail-id") || "",
          detail.getAttribute("data-nfr-detail-source") || ""
        );
        return;
      }

      var disabled = target.closest("[data-nfr-disabled-msg]");
      if (disabled) {
        event.preventDefault();
        showToast(disabled.getAttribute("data-nfr-disabled-msg") || "Действие появится позже");
        return;
      }

      if (state.currentPageId === "figma") {
        if (target.id === "nfr-figma-submit") {
          event.preventDefault();
          handleFigmaSubmit();
          return;
        }
        if (target.id === "nfr-figma-stage") {
          event.preventDefault();
          handleFigmaStage();
          return;
        }
        if (target.id === "nfr-figma-guide") {
          event.preventDefault();
          downloadFigmaGuide();
        }
      }
    }, true);

    root.addEventListener("change", function (event) {
      if (state.currentPageId !== "figma") return;
      var target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.id === "nfr-figma-later") {
        state.figmaDraft.connectLater = !!target.checked;
        if (state.figmaDraft.connectLater) state.figmaDraft.token = "";
        saveFigmaDraft();
        rerenderFigma();
        return;
      }
      if (target.id === "nfr-figma-files") {
        handleFigmaFiles(target.files || []);
      }
    });

    root.addEventListener("input", function (event) {
      if (state.currentPageId !== "figma") return;
      var target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.id === "nfr-figma-url") {
        state.figmaDraft.url = target.value;
        saveFigmaDraft();
      }
      if (target.id === "nfr-figma-token") {
        state.figmaDraft.token = target.value;
        saveFigmaDraft();
      }
      if (target.id === "nfr-figma-notes") {
        state.figmaDraft.notes = target.value;
        saveFigmaDraft();
      }
    });
  }

  function bindFilterHandlers(root, normalized, filterKey, mode) {
    Array.prototype.forEach.call(root.querySelectorAll("[data-nfr-filter]"), function (node) {
      node.addEventListener("input", function () {
        var parts = String(node.getAttribute("data-nfr-filter") || "").split(":");
        if (parts.length !== 2) return;
        state.filters[parts[0]][parts[1]] = node.value;
        if (mode === "media") renderMediaExplorer(root, normalized);
        else if (mode === "font-native-compact") renderNativeFontExplorer(root, normalized);
        else renderFontExplorer(root, normalized, filterKey, mode === "font-native");
      });
      node.addEventListener("change", function () {
        var parts = String(node.getAttribute("data-nfr-filter") || "").split(":");
        if (parts.length !== 2) return;
        state.filters[parts[0]][parts[1]] = node.value;
        if (mode === "media") renderMediaExplorer(root, normalized);
        else if (mode === "font-native-compact") renderNativeFontExplorer(root, normalized);
        else renderFontExplorer(root, normalized, filterKey, mode === "font-native");
      });
    });
  }

  function ensureDetailOverlay() {
    if (state.detailEl) return state.detailEl;
    var detail = document.createElement("div");
    detail.id = DETAIL_ID;
    detail.setAttribute("hidden", "");
    detail.innerHTML = '<div class="nfr-detail-shell"><section class="nfr-detail-card" id="nfr-detail-card"></section></div>';
    detail.addEventListener("click", function (event) {
      if (event.target === detail || event.target === detail.querySelector(".nfr-detail-shell")) {
        closeDetails();
      }
      var closeButton = event.target instanceof HTMLElement ? event.target.closest("[data-nfr-detail-close]") : null;
      if (closeButton) closeDetails();
    });
    document.body.appendChild(detail);
    bindActionHandlers(detail);
    bindNativeTabHandlers(detail);
    state.detailEl = detail;
    return detail;
  }

  function getNormalizedFontState() {
    return state.fontCatalog ? normalizeFontCatalog(state.fontCatalog) : null;
  }

  function getNormalizedMediaState() {
    return state.mediaCatalog ? normalizeMediaCatalog(state.mediaCatalog) : null;
  }

  function findFontById(fontId) {
    var normalized = getNormalizedFontState();
    if (!normalized) return null;
    return normalized.fonts.find(function (font) { return font.id === fontId; }) || null;
  }

  function findAssetById(assetId) {
    var normalized = getNormalizedMediaState();
    if (!normalized) return null;
    return normalized.assets.find(function (asset) { return asset.id === assetId; }) || null;
  }

  function findPatternById(patternId) {
    var normalized = getNormalizedMediaState();
    if (!normalized) return null;
    return normalized.uiPatterns.find(function (pattern) { return pattern.id === patternId; }) || null;
  }

  function openDetails(kind, id, source) {
    if (!kind || !id) return;
    state.detail = { kind: kind, id: id, source: source || "" };
    var overlay = ensureDetailOverlay();
    var card = overlay.querySelector("#nfr-detail-card");
    card.innerHTML = renderDetailBody(kind, id);
    overlay.removeAttribute("hidden");
  }

  function closeDetails() {
    if (!state.detailEl) return;
    state.detailEl.setAttribute("hidden", "");
    state.detail = { kind: "", id: "", source: "" };
  }

  function renderDetailBody(kind, id) {
    if (kind === "font") {
      var font = findFontById(id);
      if (!font) return renderError("Не удалось открыть детали шрифта.");
      ensurePreviewFonts([font]);
      if (!font.runtimeFontFamily) font.runtimeFontFamily = "NOFIDA-" + font.id;
      var previewStyle = "font-family:'" + String(font.runtimeFontFamily).replace(/'/g, "\\'") + "',Inter,\"Segoe UI\",system-ui,sans-serif";
      var downloadUrl = font.previewFilePath || (font.localFilePaths || [])[0] || "";
      return [
        '<div class="nfr-detail-topbar">',
        '  <div><p class="nfr-label">Шрифт</p><h2>' + escapeHtml(font.family) + '</h2><p class="nfr-detail-copy">' + escapeHtml(font.recommendedUseCase || "Проверенное семейство для интерфейсов, отчетов и презентаций.") + "</p></div>",
        '  <button class="nfr-back nfr-detail-close" type="button" data-nfr-detail-close="true">Закрыть</button>',
        "</div>",
        '<div class="nfr-preview" style="' + escapeHtml(previewStyle) + '">' + escapeHtml(font.previewText || font.family) + "</div>",
        '<div class="nfr-detail-actions">',
        downloadUrl ? '<a class="nfr-link-btn" href="' + escapeHtml(downloadUrl) + '" target="_blank" rel="noreferrer">Скачать</a>' : '<span class="nfr-pill warn">Без файла</span>',
        state.detail.source === "native"
          ? '<button class="nfr-copy-btn" type="button" data-nfr-native-nav="upload">Открыть загрузку</button>'
          : '<a class="nfr-link-btn" href="' + escapeHtml(nativeFontsHash()) + '" data-nfr-action="native-fonts">Открыть загрузку</a>',
        '<button class="nfr-copy-btn" type="button" data-copy-name="' + escapeHtml(font.family) + '">Копировать название</button>',
        "</div>",
        '<div class="nfr-detail-meta">',
        renderMetaBlock("Категория", font.category),
        renderMetaBlock("Лицензия", font.license),
        renderMetaBlock("Языки", arrayify(font.languageCoverage).join(", ")),
        renderMetaBlock("Сочетания", arrayify(font.pairingSuggestions).join(", ")),
        renderMetaBlock("Источник", font.sourceName + (font.sourceAuthor ? " · " + font.sourceAuthor : "")),
        renderMetaBlock("Коммерческое использование", humanBooleanLabel(font.commercialUseAllowed, "Разрешено", "Проверить")),
        "</div>",
        '<div class="nfr-note">' + escapeHtml(buildFontDetailNote(font)) + "</div>",
        '<div class="nfr-tag-row">' + arrayify(font.useCases).map(function (item) { return '<span class="nfr-tag">' + escapeHtml(item) + "</span>"; }).join("") + "</div>"
      ].join("");
    }

    if (kind === "media") {
      var asset = findAssetById(id);
      if (!asset) return renderError("Не удалось открыть детали ассета.");
      return [
        '<div class="nfr-detail-topbar">',
        '  <div><p class="nfr-label">' + escapeHtml(asset.category) + '</p><h2>' + escapeHtml(asset.title) + '</h2><p class="nfr-detail-copy">' + escapeHtml([asset.style, asset.mood, asset.audience].filter(Boolean).join(" · ")) + "</p></div>",
        '  <button class="nfr-back nfr-detail-close" type="button" data-nfr-detail-close="true">Закрыть</button>',
        "</div>",
        asset.thumbnailUrl ? '<img class="nfr-detail-thumb" src="' + escapeHtml(asset.thumbnailUrl) + '" alt="' + escapeHtml(asset.title) + '"/>' : "",
        '<div class="nfr-detail-actions">',
        asset.internalUrl ? '<a class="nfr-link-btn" href="' + escapeHtml(asset.internalUrl) + '" target="_blank" rel="noreferrer">Скачать</a>' : "",
        asset.internalUrl ? '<button class="nfr-copy-btn" type="button" data-copy-url="' + escapeHtml(asset.internalUrl) + '">Копировать ссылку</button>' : "",
        asset.internalUrl && /\.svg(?:$|\?)/i.test(asset.internalUrl) ? '<button class="nfr-copy-btn" type="button" data-copy-svg="' + escapeHtml(asset.internalUrl) + '">Скопировать SVG</button>' : "",
        asset.supportsProjectInsert
          ? '<a class="nfr-link-btn" href="' + escapeHtml(asset.internalUrl) + '" target="_blank" rel="noreferrer">Использовать в проекте</a>'
          : '<button class="nfr-disabled-btn" type="button" data-nfr-disabled-msg="Автоматическое добавление в файл будет подключено позже.">Использовать в проекте</button>',
        "</div>",
        '<div class="nfr-detail-meta">',
        renderMetaBlock("Лицензия", asset.license),
        renderMetaBlock("Источник", asset.sourceName + (asset.sourceAuthor ? " · " + asset.sourceAuthor : "")),
        renderMetaBlock("Сценарии", arrayify(asset.useCases).join(", ")),
        renderMetaBlock("Теги", arrayify(asset.tags).join(", ")),
        renderMetaBlock("Атрибуция", humanBooleanLabel(!asset.attributionRequired, "Не требуется", "Требуется атрибуция")),
        renderMetaBlock("Коммерческое использование", humanBooleanLabel(asset.commercialUseAllowed, "Разрешено", "Проверить")),
        "</div>",
        '<div class="nfr-note">' + escapeHtml(buildAssetDetailNote(asset)) + "</div>",
        '<div class="nfr-tag-row">' + arrayify(asset.dominantColors).map(function (item) { return '<span class="nfr-tag">' + escapeHtml(item) + "</span>"; }).join("") + "</div>"
      ].join("");
    }

    var pattern = findPatternById(id);
    if (!pattern) return renderError("Не удалось открыть детали паттерна.");
    return [
      '<div class="nfr-detail-topbar">',
      '  <div><p class="nfr-label">UI-паттерн</p><h2>' + escapeHtml(pattern.title) + '</h2><p class="nfr-detail-copy">' + escapeHtml(pattern.recommendedUse || "") + "</p></div>",
      '  <button class="nfr-back nfr-detail-close" type="button" data-nfr-detail-close="true">Закрыть</button>',
      "</div>",
      pattern.previewPath ? '<img class="nfr-detail-thumb" src="' + escapeHtml(pattern.previewPath) + '" alt="' + escapeHtml(pattern.title) + '"/>' : "",
      '<div class="nfr-detail-meta">',
      renderMetaBlock("Источник", pattern.sourceName || pattern.sourceModel || "NOFIDA"),
      renderMetaBlock("Основа", pattern.sourceModel || "NOFIDA"),
      renderMetaBlock("Лицензия", pattern.license || "MIT"),
      renderMetaBlock("Статус", titleCaseStatus(pattern.approvalStatus, "Проверено")),
      "</div>",
      '<div class="nfr-note">' + escapeHtml(buildPatternDetailNote(pattern)) + "</div>",
      '<div class="nfr-tag-row">' + arrayify(pattern.tokens).map(function (token) { return '<span class="nfr-tag">' + escapeHtml(token) + "</span>"; }).join("") + "</div>"
    ].join("");
  }

  function copySvgContent(path) {
    var target = String(path || "");
    if (!target) return;
    if (state.svgCache[target]) {
      copyText(state.svgCache[target], "SVG скопирован", "Скопируйте SVG");
      return;
    }
    fetch(target, { credentials: "same-origin", cache: "no-store" }).then(function (response) {
      if (!response.ok) throw new Error("svg-unavailable");
      return response.text();
    }).then(function (text) {
      state.svgCache[target] = text;
      return copyText(text, "SVG скопирован", "Скопируйте SVG");
    }).catch(function () {
      showToast("Не удалось получить SVG");
    });
  }

  function handleFigmaFiles(fileList) {
    var files = Array.prototype.map.call(fileList || [], function (file) {
      var extension = String(file.name || "").split(".").pop().toLowerCase();
      return {
        name: file.name || "file",
        size: Number(file.size || 0),
        type: file.type || "",
        extension: extension || "file"
      };
    }).filter(function (file) {
      return ["fig", "zip", "svg", "png", "pdf"].indexOf(file.extension) >= 0;
    });

    state.figmaDraft.files = files;
    saveFigmaDraft();
    if (files.length === 0) {
      showToast("Поддерживаются .fig, .zip, .svg, .png и .pdf");
    }
    rerenderFigma();
  }

  function validateFigmaDraft() {
    var draft = state.figmaDraft;
    if (!draft.url && (!Array.isArray(draft.files) || draft.files.length === 0) && !draft.notes) {
      return "Добавьте ссылку, файл экспорта или заметки для отчета.";
    }
    if (draft.url && !/^https?:\/\/.+/i.test(draft.url)) {
      return "Проверьте ссылку на файл Figma.";
    }
    if (!draft.connectLater && !draft.token) {
      return "Введите personal access token или включите режим \"Подключить позже\".";
    }
    return "";
  }

  function deriveSourceType(draft) {
    if (draft.url) return "Figma URL";
    var extensions = unique((draft.files || []).map(function (file) { return file.extension; }));
    if (extensions.indexOf("fig") >= 0) return ".fig export";
    if (extensions.indexOf("zip") >= 0) return "ZIP package";
    if (extensions.indexOf("pdf") >= 0) return "PDF export";
    if (extensions.indexOf("svg") >= 0 || extensions.indexOf("png") >= 0) return "Asset export";
    return "Manual brief";
  }

  function scoreFonts(text, fonts) {
    var query = String(text || "").toLowerCase();
    var scored = fonts.map(function (font) {
      var haystack = [
        font.family,
        font.category,
        font.recommendedUseCase
      ].concat(font.useCases || [], font.mood || [], font.languageCoverage || []).join(" ").toLowerCase();
      var score = 0;
      query.split(/[^a-zA-Z0-9а-яА-Я]+/).filter(Boolean).forEach(function (token) {
        if (haystack.indexOf(token) >= 0) score += 2;
      });
      if (/dashboard|analytics|admin|panel|enterprise|таблиц|дашборд/.test(query) && /inter|ibm plex sans|public sans|work sans/i.test(font.family)) score += 3;
      if (/brand|hero|campaign|marketing|презент|лендинг/.test(query) && /fraunces|manrope|space grotesk|outfit|plus jakarta sans/i.test(font.family)) score += 3;
      if (/docs|article|report|long|research|отчет|статья/.test(query) && /source serif|literata|merriweather|noto serif/i.test(font.family)) score += 3;
      if (/code|dev|token|audit|spec|код|спец/.test(query) && /mono/i.test(font.family)) score += 3;
      return { font: font, score: score };
    }).sort(function (left, right) {
      return right.score - left.score || left.font.family.localeCompare(right.font.family);
    });

    var chosen = scored.filter(function (item) { return item.score > 0; }).slice(0, 4).map(function (item) { return item.font; });
    if (chosen.length >= 3) return chosen;
    return fonts.slice(0, 5);
  }

  function buildMigrationReport() {
    var draft = state.figmaDraft;
    var fontCatalog = getNormalizedFontState();
    var text = [draft.url, draft.notes].concat((draft.files || []).map(function (file) { return file.name; })).join(" ");
    var extensions = unique((draft.files || []).map(function (file) { return file.extension; }));
    var assetsCount = (draft.files || []).filter(function (file) { return ["svg", "png", "pdf"].indexOf(file.extension) >= 0; }).length;
    var zipCount = (draft.files || []).filter(function (file) { return file.extension === "zip"; }).length;
    var figCount = (draft.files || []).filter(function (file) { return file.extension === "fig"; }).length;
    var chosenFonts = fontCatalog ? scoreFonts(text, fontCatalog.fonts) : [];
    var sourceType = deriveSourceType(draft);
    var pageHint = figCount ? "Вероятны многостраничные экраны и компоненты из одного экспорта." : (draft.url ? "Есть шанс восстановить структуру страниц по ссылке и заметкам." : "Структуру страниц лучше уточнить после просмотра экспорта.");
    var mediaHints = [];
    if (/empty|onboarding|пуст|онборд/i.test(text)) mediaHints.push("Empty states и onboarding-паттерны");
    if (/dashboard|analytics|admin|table|дашборд|аналит/i.test(text)) mediaHints.push("Иконки, плотные UI-паттерны и системные таблицы");
    if (/brand|campaign|launch|маркет|презент|лендинг/i.test(text)) mediaHints.push("Иллюстрации, фоны и стикеры для брендовых экранов");
    if (assetsCount > 0) mediaHints.push("Локальные SVG и PNG как основа для медиабанка");
    if (mediaHints.length === 0) mediaHints = ["Иконки для базовой навигации", "Иллюстрации и empty states", "Фоны и UI-паттерны"];

    var sourceFacts = [
      "Источник: " + sourceType + ".",
      draft.url ? "Ссылка указана и будет использоваться для сверки структуры файла." : "Без ссылки: отчет строится по экспорту и заметкам.",
      draft.connectLater ? "Подключение к API можно добавить позже." : "Токен подготовлен для следующего шага анализа.",
      draft.files.length ? "Файлы в запросе: " + draft.files.length + " (" + extensions.join(", ").toUpperCase() + ")." : "Файлы пока не приложены.",
      assetsCount ? "Экспорт ассетов: " + assetsCount + " файл(ов)." : "Ассеты лучше собрать отдельным пакетом SVG, PNG или ZIP.",
      pageHint
    ];

    var fontSuggestions = chosenFonts.slice(0, 4).map(function (font) {
      return font.family + " — " + (font.recommendedUseCase || "проверенное семейство для переноса интерфейсов.");
    });
    if (!fontSuggestions.length) {
      fontSuggestions = [
        "Inter — базовый выбор для продуктовых экранов и панелей.",
        "Manrope — мягкий вариант для брендовых и клиентских интерфейсов.",
        "Source Serif 4 — для длинных текстов и содержательных блоков."
      ];
    }

    var resourceSuggestions = [
      "Библиотеки NOFIDA: начать с готовых UI-компонентов и системных иконок.",
      "Медиакатегории: " + mediaHints.join(", ") + ".",
      zipCount ? "Пакет ассетов уже приложен: удобно разобрать и распределить в медиабанк по категориям." : "Если есть пакет ассетов, добавьте ZIP для быстрой сверки имен и форматов."
    ];

    var nextSteps = [
      "Проверить страницы, компоненты и текстовые стили после открытия экспорта.",
      "Сверить нестандартные шрифты и заменить их на близкие семейства NOFIDA перед ручной доводкой.",
      "Разложить SVG, PNG и PDF по категориям медиабанка, чтобы команда быстрее переиспользовала материалы.",
      "Отдельно проверить сложные компоненты, автолэйауты и интерактивные переходы."
    ];

    return {
      createdAt: new Date().toISOString(),
      summary: "Подготовлен предварительный план переноса для " + sourceType + ". Отчет фиксирует источник, состав материалов, подходящие шрифты NOFIDA и список ручных шагов без обещания точного 1:1 импорта.",
      sourceFacts: sourceFacts,
      fontSuggestions: fontSuggestions,
      resourceSuggestions: resourceSuggestions,
      nextSteps: nextSteps
    };
  }

  function handleFigmaSubmit() {
    var validationError = validateFigmaDraft();
    if (validationError) {
      showToast(validationError);
      return;
    }
    state.figmaReport = buildMigrationReport();
    saveFigmaDraft();
    state.figmaStage = {
      status: "report",
      message: "Отчет подготовлен и сохранен в локальном черновике.",
      count: state.figmaDraft.files.length,
      updatedAt: new Date().toISOString()
    };
    rerenderFigma();
    showToast("Отчет миграции готов");
  }

  function handleFigmaStage() {
    if (!state.figmaDraft.files.length) {
      showToast("Сначала добавьте экспорт или пакет ассетов");
      return;
    }
    saveFigmaDraft();
    state.figmaStage = {
      status: "staged",
      message: "Ассеты добавлены в локальный запрос миграции: " + state.figmaDraft.files.length + " файл(ов).",
      count: state.figmaDraft.files.length,
      updatedAt: new Date().toISOString()
    };
    rerenderFigma();
    showToast("Ассеты добавлены в запрос");
  }

  function buildFigmaGuideText() {
    var draft = state.figmaDraft;
    var report = state.figmaReport || buildMigrationReport();
    return [
      "План переноса NOFIDA",
      "",
      "Тип источника: " + deriveSourceType(draft),
      "Ссылка: " + (draft.url || "не указана"),
      "Подключить позже: " + (draft.connectLater ? "да" : "нет"),
      "Файлы: " + (draft.files.length ? draft.files.map(function (file) { return file.name; }).join(", ") : "не добавлены"),
      "",
      "Кратко:",
      report.summary,
      "",
      "Источник и состав материалов:",
      report.sourceFacts.map(function (item) { return "- " + item; }).join("\n"),
      "",
      "Подходящие шрифты:",
      report.fontSuggestions.map(function (item) { return "- " + item; }).join("\n"),
      "",
      "Рекомендации по ресурсам:",
      report.resourceSuggestions.map(function (item) { return "- " + item; }).join("\n"),
      "",
      "Следующие шаги:",
      report.nextSteps.map(function (item) { return "- " + item; }).join("\n"),
      "",
      "Заметки:",
      draft.notes || "—"
    ].join("\n");
  }

  function downloadFigmaGuide() {
    var validationError = validateFigmaDraft();
    if (validationError && !state.figmaReport) {
      showToast(validationError);
      return;
    }
    var text = buildFigmaGuideText();
    var blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    var href = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = href;
    link.download = "nofida-migration-guide.txt";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(function () { URL.revokeObjectURL(href); }, 1000);
    showToast("Инструкция скачана");
  }

  function rerenderFigma() {
    if (!state.overlayEl || state.currentPageId !== "figma") return;
    var content = state.overlayEl.querySelector("#nfr-content");
    if (!content) return;
    content.innerHTML = renderFigmaBody();
    bindActionHandlers(content);
  }

  function bindNativeTabHandlers(root) {
    Array.prototype.forEach.call(root.querySelectorAll("[data-nfr-native-nav]"), function (node) {
      node.addEventListener("click", function () {
        scrollToNativeFontSection(String(node.getAttribute("data-nfr-native-nav") || ""));
      });
    });
  }

  function findNativeFontSection(kind) {
    var mount = getNativeFontsMount();
    if (!mount) return null;
    if (kind === "upload") return mount.upload || mount.section;
    if (kind === "my-fonts") return mount.installed || mount.section;
    return document.getElementById(NATIVE_PANEL_ID);
  }

  function scrollToNativeFontSection(kind) {
    var target = kind === "recommended" ? document.getElementById("nfr-native-fonts") : findNativeFontSection(kind);
    if (!target) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderNativeFontCard(font) {
    var fontFamily = font.runtimeFontFamily || font.family || "Inter";
    var previewStyle = "font-family:'" + String(fontFamily).replace(/'/g, "\\'") + "',Inter,\"Segoe UI\",system-ui,sans-serif";
    var downloadUrl = font.previewFilePath || (font.localFilePaths || [])[0] || "";
    var canDownload = font.approvalStatus === "approved" && !!downloadUrl;
    return [
      '<article class="nfr-native-card">',
      '  <div class="nfr-native-card-top">',
      "    <div>",
      '      <h3>' + escapeHtml(font.family) + "</h3>",
      '      <p>' + escapeHtml(font.recommendedUseCase || "Проверенное семейство для рабочих интерфейсов NOFIDA.") + "</p>",
      "    </div>",
      '    <span class="nfr-pill ' + (font.approvalStatus === "approved" ? "good" : "warn") + '">' + escapeHtml(titleCaseStatus(font.approvalStatus, "Проверка")) + "</span>",
      "  </div>",
      '  <div class="nfr-native-preview" style="' + escapeHtml(previewStyle) + '">' + escapeHtml(font.previewText || "Aa Бб 123") + "</div>",
      '  <div class="nfr-native-meta">',
      '    <span>' + escapeHtml(font.category) + "</span>",
      '    <span>' + escapeHtml(font.license) + "</span>",
      arrayify(font.languageCoverage).length ? '<span>' + escapeHtml(arrayify(font.languageCoverage).slice(0, 2).join(", ")) + "</span>" : "",
      "  </div>",
      '  <div class="nfr-native-actions">',
      canDownload
        ? '<a class="nfr-link-btn" href="' + escapeHtml(downloadUrl) + '" target="_blank" rel="noreferrer">Скачать</a>'
        : '<span class="nfr-pill warn">Скачивание недоступно</span>',
      '<button class="nfr-copy-btn" type="button" data-nfr-native-nav="upload">Открыть загрузку</button>',
      '<button class="nfr-copy-btn" type="button" data-copy-name="' + escapeHtml(font.family) + '">Копировать название</button>',
      '<button class="nfr-icon-btn" type="button" data-nfr-detail-kind="font" data-nfr-detail-id="' + escapeHtml(font.id) + '" data-nfr-detail-source="native">Подробнее</button>',
      "  </div>",
      "</article>"
    ].join("");
  }

  function renderNativeFontExplorer(target, normalized) {
    var filterState = state.filters.nativeFonts;
    var categories = ["all"].concat(unique(normalized.fonts.map(function (font) { return font.category; })));
    var matches = normalized.fonts.filter(function (font) {
      return fontMatches(font, filterState);
    });

    ensurePreviewFonts(matches.slice(0, 8));
    matches.forEach(function (font) {
      if (!font.runtimeFontFamily) font.runtimeFontFamily = "NOFIDA-" + font.id;
    });

    target.innerHTML = [
      '<section class="nfr-native-section">',
      '  <div class="nfr-native-toolbar">',
      '    <input class="nfr-filter-search" data-nfr-filter="nativeFonts:query" type="search" placeholder="Найти семейство, сценарий или язык..." value="' + escapeHtml(filterState.query || "") + '"/>',
      '    <select class="nfr-filter-select" data-nfr-filter="nativeFonts:category">',
      categories.map(function (category) {
        return '<option value="' + escapeHtml(category) + '"' + (filterState.category === category ? " selected" : "") + ">" + escapeHtml(category === "all" ? "Все категории" : category) + "</option>";
      }).join(""),
      "    </select>",
      '    <span class="nfr-pill">' + escapeHtml(String(matches.length)) + " шт.</span>",
      "  </div>",
      matches.length ? '<div class="nfr-native-grid">' + matches.slice(0, 8).map(renderNativeFontCard).join("") + "</div>" : '<div class="nfr-native-empty">Подходящих шрифтов пока нет. Откройте полный каталог, если нужен расширенный поиск.</div>',
      "</section>"
    ].join("");

    bindActionHandlers(target);
    bindFilterHandlers(target, normalized, "nativeFonts", "font-native-compact");
    bindNativeTabHandlers(target);
  }

  function renderNativeFontsPanel(mount, catalog) {
    var normalized = normalizeFontCatalog(catalog);
    var sectionKey = "native-fonts:" + (mount.section.className || "") + ":" + (mount.upload ? "upload" : "") + ":" + (mount.installed ? "installed" : "");
    var renderKey = [
      normalized.fonts.length,
      normalized.uploadFormats.join(","),
      normalized.fonts.slice(0, 8).map(function (font) {
        return [font.id, font.approvalStatus, font.family].join(":");
      }).join("|")
    ].join("::");

    var panel = document.getElementById(NATIVE_PANEL_ID);
    var desiredParent = mount.section;
    var beforeNode = mount.upload || mount.section.firstChild || null;

    if (!panel) {
      panel = document.createElement("section");
      panel.id = NATIVE_PANEL_ID;
      panel.className = "nfr-native-panel nfr-native-panel-compact";
      panel.setAttribute(NATIVE_PANEL_MARKER, "true");
    }

    if (panel.parentNode !== desiredParent) {
      desiredParent.insertBefore(panel, beforeNode);
    } else if (beforeNode && panel.nextSibling !== beforeNode) {
      desiredParent.insertBefore(panel, beforeNode);
    }

    desiredParent.setAttribute(NATIVE_PANEL_MARKER, "true");

    if (state.nativeSectionKey === sectionKey &&
        state.nativePanelKey === renderKey &&
        panel.getAttribute(NATIVE_PANEL_MARKER) === "true" &&
        panel.innerHTML) {
      return;
    }

    panel.innerHTML = [
      '<div class="nfr-native-head">',
      '  <div>',
      '    <p class="nfr-label">Типографика</p>',
      "    <h2>Рекомендованные шрифты</h2>",
      '    <p class="nfr-native-copy">Выберите проверенный шрифт NOFIDA или загрузите свой. Шрифты можно скачать и добавить через нативную загрузку. Автоматическая установка будет включена после безопасного подключения к системному хранилищу шрифтов.</p>',
      "  </div>",
      '  <div class="nfr-native-tabs">',
      '    <button class="nfr-tab" type="button" data-nfr-native-nav="recommended">Рекомендованные шрифты</button>',
      '    <button class="nfr-tab" type="button" data-nfr-native-nav="upload">Загрузить свой шрифт</button>',
      '    <button class="nfr-tab" type="button" data-nfr-native-nav="my-fonts">Мои шрифты</button>',
      "  </div>",
      "</div>",
      '<div id="nfr-native-font-explorer"></div>'
    ].join("");
    panel.setAttribute(NATIVE_PANEL_REVISION, panelRevision(panel));

    state.nativeSectionKey = sectionKey;
    state.nativePanelKey = renderKey;

    bindActionHandlers(panel);
    bindNativeTabHandlers(panel);
    renderNativeFontExplorer(panel.querySelector("#nfr-native-font-explorer"), normalized);
  }

  function renderBody(pageId, token) {
    if (!state.overlayEl) return;
    var content = state.overlayEl.querySelector("#nfr-content");
    if (!content) return;

    if (pageId === "figma") {
      content.innerHTML = renderFigmaBody();
      bindActionHandlers(content);
      prefetchResourceCatalogs();
      return;
    }

    if (pageId === "fonts") {
      content.innerHTML = renderLoading("Загружаем каталог шрифтов NOFIDA...");
      loadJson("fontCatalog", FONT_CATALOG_URLS).then(function (catalog) {
        if (state.renderToken !== token || state.currentPageId !== pageId) return;
        content.innerHTML = renderFontBody(catalog);
        renderFontExplorer(content.querySelector("#nfr-font-explorer"), normalizeFontCatalog(catalog), "fonts", false);
        bindActionHandlers(content);
      }).catch(function (error) {
        if (state.renderToken !== token || state.currentPageId !== pageId) return;
        content.innerHTML = renderError("Не удалось загрузить каталог шрифтов. " + error.message);
      });
      return;
    }

    if (pageId === "media") {
      content.innerHTML = renderLoading("Загружаем медиабанк NOFIDA...");
      loadJson("mediaCatalog", MEDIA_CATALOG_URL).then(function (catalog) {
        if (state.renderToken !== token || state.currentPageId !== pageId) return;
        content.innerHTML = renderMediaBody(catalog);
        renderMediaExplorer(content.querySelector("#nfr-media-explorer"), normalizeMediaCatalog(catalog));
        bindActionHandlers(content);
      }).catch(function (error) {
        if (state.renderToken !== token || state.currentPageId !== pageId) return;
        content.innerHTML = renderError("Не удалось загрузить медиабанк. " + error.message);
      });
    }
  }

  function prefetchResourceCatalogs() {
    loadJson("fontCatalog", FONT_CATALOG_URLS).catch(function () { return null; });
    loadJson("mediaCatalog", MEDIA_CATALOG_URL).catch(function () { return null; });
  }

  function ensureResourceStyles() {
    if (!document.getElementById("nfr-styles")) {
      var style = document.createElement("style");
      style.id = "nfr-styles";
      style.textContent = RESOURCE_CSS;
      document.head.appendChild(style);
    }

    ensureToast();
    ensureDetailOverlay();
  }

  function buildShellContent() {
    return [
      '<div id="nfr-shell-root">',
      '  <div id="nfr-actions"></div>',
      '  <div class="nfr-notice" id="nfr-notice"></div>',
      '  <section id="nfr-content"></section>',
      '  <p class="nfr-footer-note" id="nfr-footer-note"></p>',
      "</div>"
    ].join("");
  }

  function renderPage(pageId) {
    var nav = getNav();
    var page = PAGES[pageId];
    var currentHash = getPageHash(pageId);
    var routeMeta = nav ? nav.getRouteMeta(currentHash) : null;
    if (!page || !nav || !routeMeta) return;

    ensureResourceStyles();
    nav.renderDashboardShell({
      owner: "resources",
      route: currentHash,
      activeId: routeMeta.menuId,
      childActiveId: routeMeta.childMenuId,
      breadcrumb: routeMeta.breadcrumb,
      title: page.title,
      subtitle: page.intro,
      contentHtml: buildShellContent()
    });

    state.overlayEl = document.getElementById("nfr-shell-root");
    if (!state.overlayEl) return;

    var token = Date.now();
    state.renderToken = token;
    state.currentPageId = pageId;

    state.overlayEl.querySelector("#nfr-actions").innerHTML = renderActions(page.actions || []);
    var noticeEl = state.overlayEl.querySelector("#nfr-notice");
    noticeEl.textContent = page.notice || "";
    noticeEl.hidden = !page.notice;
    state.overlayEl.querySelector("#nfr-footer-note").textContent =
      pageId === "figma"
        ? "План переноса формируется локально и не меняет файлы проекта автоматически."
        : "Ресурсы NOFIDA доступны внутри рабочего пространства.";

    bindActionHandlers(state.overlayEl.querySelector("#nfr-actions"));
    renderBody(pageId, token);
  }

  function hidePages() {
    state.overlayEl = null;
    state.currentPageId = "";
    closeDetails();
  }

  function closeToPrevious() {
    var nav = getNav();
    var currentHash = getPageHash(state.currentPageId || "fonts");
    if (nav) {
      nav.goBack(currentHash);
      return;
    }
    var back = normalizeHash(state.lastAppHash || "#/dashboard");
    if (isResourceHash(back)) back = "#/dashboard";
    window.location.hash = back.slice(1);
  }

  function getNativeFontsMount() {
    var content = document.querySelector(NATIVE_CONTENT_SELECTOR);
    var section = content ? content.querySelector(NATIVE_CONTAINER_SELECTOR) : document.querySelector(NATIVE_CONTAINER_SELECTOR);
    if (!content || !section || !content.contains(section)) return null;

    var upload = section.querySelector(NATIVE_UPLOAD_SELECTOR);
    var installed = section.querySelector(NATIVE_INSTALLED_SELECTOR);
    if (!upload && !installed) return null;

    return {
      content: content,
      section: section,
      upload: upload,
      installed: installed
    };
  }

  function removeNativeFontsPanel() {
    state.nativeSectionKey = "";
    state.nativePanelKey = "";
    var panel = document.getElementById(NATIVE_PANEL_ID);
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    var mount = getNativeFontsMount();
    if (mount && mount.section) mount.section.removeAttribute(NATIVE_PANEL_MARKER);
  }

  function panelRevision(panel) {
    return String(Number(panel.getAttribute(NATIVE_PANEL_REVISION) || "0") + 1);
  }

  function syncNativeFontsSurface() {
    rememberTeamId();
    if (!isNativeFontsHash(window.location.hash || "") && !looksLikeNativeFontsSurface()) {
      removeNativeFontsPanel();
      return;
    }
    var mount = getNativeFontsMount();
    if (!mount) return;

    state.nativeRenderLock = true;
    loadJson("fontCatalog", FONT_CATALOG_URLS).then(function (catalog) {
      renderNativeFontsPanel(mount, catalog);
    }).catch(function () {
      /* native screen should not break if the catalog is unavailable */
    }).finally(function () {
      window.setTimeout(function () {
        state.nativeRenderLock = false;
      }, 120);
    });
  }

  function scheduleNativeFontsSync() {
    if (!isNativeFontsHash(window.location.hash || "") && !looksLikeNativeFontsSurface()) {
      if (state.nativeSyncTimer) {
        window.clearTimeout(state.nativeSyncTimer);
        state.nativeSyncTimer = null;
      }
      return;
    }
    if (state.nativeSyncTimer) window.clearTimeout(state.nativeSyncTimer);
    state.nativeSyncTimer = window.setTimeout(function () {
      state.nativeSyncTimer = null;
      syncNativeFontsSurface();
    }, 220);
  }

  function disconnectNativeFontsObserver() {
    if (state.nativeSyncTimer) {
      window.clearTimeout(state.nativeSyncTimer);
      state.nativeSyncTimer = null;
    }
    if (state.nativeObserver) state.nativeObserver.disconnect();
    state.nativeObserver = null;
    state.nativeObserverRoot = null;
  }

  function ensureNativeFontsObserver() {
    if (!isNativeFontsHash(window.location.hash || "") && !looksLikeNativeFontsSurface()) {
      disconnectNativeFontsObserver();
      return;
    }
    var nextRoot = document.querySelector(NATIVE_CONTENT_SELECTOR) || document.getElementById("app");
    if (!nextRoot || !window.MutationObserver) {
      disconnectNativeFontsObserver();
      return;
    }
    if (state.nativeObserverRoot === nextRoot && state.nativeObserver) return;
    disconnectNativeFontsObserver();

    state.nativeObserverRoot = nextRoot;
    state.nativeObserver = new MutationObserver(function (mutations) {
      if (state.nativeRenderLock) return;
      var relevant = mutations.some(function (mutation) {
        if (!mutation.target || !mutation.target.closest) return false;
        if (mutation.target.closest("#" + NATIVE_PANEL_ID)) return false;
        return mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0;
      });
      if (relevant) scheduleNativeFontsSync();
    });
    state.nativeObserver.observe(nextRoot, { childList: true, subtree: true });
  }

  function onHashChange() {
    var hash = normalizeHash(window.location.hash || "#/dashboard");
    var pageId = getPageIdFromHash(hash);
    var nativeSurfaceActive = isNativeFontsHash(hash) || looksLikeNativeFontsSurface();

    if (pageId) {
      renderPage(pageId);
    } else {
      rememberAppHash(hash);
      hidePages();
    }

    if (nativeSurfaceActive) {
      ensureNativeFontsObserver();
      scheduleNativeFontsSync();
      return;
    }

    disconnectNativeFontsObserver();
    removeNativeFontsPanel();
  }

  function onKeyDown(event) {
    if (event.key !== "Escape") return;
    if (state.detailEl && !state.detailEl.hasAttribute("hidden")) {
      closeDetails();
      return;
    }
    if (!state.currentPageId) return;
    closeToPrevious();
  }

  function init() {
    rememberAppHash(window.location.hash || "#/dashboard");
    rememberTeamId();
    ensureResourceStyles();
    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("keydown", onKeyDown);
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
