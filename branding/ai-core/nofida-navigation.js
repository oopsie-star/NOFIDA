(function () {
  "use strict";

  if (window.NofidaNavigation) return;

  var ASSET_TAG = "__NOFIDA_ASSET_TAG__";
  var ASSET_QUERY = ASSET_TAG ? "?v=" + ASSET_TAG : "";
  var STORAGE_KEY = "nofida-navigation-v021a";
  var SHELL_ID = "nofida-shell";
  var SIDEBAR_ID = "nofida-shell-sidebar";
  var NAV_ID = "nofida-shell-nav";
  var MAIN_ID = "nofida-shell-main";
  var FRAME_ID = "nofida-page-frame";
  var PLACEHOLDER_OWNER = "navigation-placeholder";
  var BODY_CLASS_NATIVE = "nofida-dashboard-shell-active";
  var BODY_CLASS_PAGE = "nofida-shell-page-active";
  var SEARCH_PLACEHOLDER = "Поиск";
  var SAFE_LOCAL_TEAM_KEYS = [
    "default-team-id",
    "defaultTeamId",
    "team-id",
    "current-team-id",
    "currentTeamId",
    "selected-team-id",
    "selectedTeamId"
  ];
  var refreshTimers = [];
  var clickBound = false;

  var ROUTES = {
    dashboard: "#/dashboard",
    settings: "#/settings/options",
    libraries: "#/nofida/libraries",
    fontCatalog: "#/nofida/fonts",
    media: "#/nofida/media",
    figma: "#/nofida/import/figma",
    help: "#/nofida/help",
    learn: "#/nofida/learn",
    releases: "#/nofida/releases",
    changelog: "#/nofida/changelog",
    terms: "#/nofida/terms",
    privacy: "#/nofida/privacy",
    openSource: "#/nofida/open-source-notices",
    repository: "#/nofida/repository",
    community: "#/nofida/community"
  };

  var NAV_TREE = [
    {
      section: "Основное",
      items: [
        {
          id: "projects",
          label: "Проекты",
          childIds: ["all-projects", "drafts"],
          children: [
            { id: "all-projects", label: "Все проекты" },
            {
              id: "drafts",
              label: "Черновики",
              disabled: true,
              disabledTitle: "Раздел черновиков откроется в панели проектов"
            }
          ]
        }
      ]
    },
    {
      section: "Ресурсы",
      items: [
        { id: "libraries", label: "Библиотеки" },
        {
          id: "fonts",
          label: "Шрифты",
          childIds: ["team-fonts", "font-catalog"],
          children: [
            { id: "team-fonts", label: "Шрифты команды" },
            { id: "font-catalog", label: "Каталог шрифтов" }
          ]
        },
        { id: "media", label: "Медиа" },
        { id: "figma", label: "Импорт из Figma" }
      ]
    },
    {
      section: "Помощь",
      items: [
        { id: "help", label: "Справка" },
        { id: "learn", label: "Обучение" },
        { id: "releases", label: "Релизы" },
        { id: "changelog", label: "Журнал изменений" }
      ]
    },
    {
      section: "Документы",
      items: [
        { id: "terms", label: "Условия" },
        { id: "privacy", label: "Privacy / Data" },
        { id: "open-source", label: "Open Source" }
      ]
    }
  ];

  function loadState() {
    try {
      var raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      return JSON.parse(raw) || {};
    } catch (_error) {
      return {};
    }
  }

  var state = loadState();

  function saveState() {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_error) {
      /* noop */
    }
  }

  function normalizeHash(hash) {
    var value = String(hash || "").trim();
    if (!value) return ROUTES.dashboard;

    if (value.indexOf("/#/") === 0) {
      value = value.slice(2);
    }

    var rootIndex = value.indexOf("#/");
    if (rootIndex >= 0) value = value.slice(rootIndex);

    if (value.charAt(0) !== "#") {
      value = value.charAt(0) === "/" ? "#" + value : "#/" + value.replace(/^#?\/?/, "");
    }

    return value.replace(/^##+/, "#");
  }

  function getCurrentHash() {
    return window.location.hash || "#/dashboard";
  }

  function getHashPath(hash) {
    var current = normalizeHash(hash || getCurrentHash());
    var queryIndex = current.indexOf("?");
    return queryIndex >= 0 ? current.slice(0, queryIndex) : current;
  }

  function getHashParams(hash) {
    var current = normalizeHash(hash || getCurrentHash());
    var queryIndex = current.indexOf("?");
    return new URLSearchParams(queryIndex >= 0 ? current.slice(queryIndex + 1) : "");
  }

  function isDashboardRoute(hash) {
    return /^#\/dashboard(?:$|[/?])/.test(normalizeHash(hash || getCurrentHash()));
  }

  function isAccountSurface(hash) {
    return /^#\/settings\/options(?:$|\?)/.test(normalizeHash(hash || getCurrentHash()));
  }

  function isEditorSurface(hash) {
    return /^#\/(workspace|viewer|inspect)(?:$|[/?])/.test(normalizeHash(hash || getCurrentHash()));
  }

  function isNofidaResourceRoute(hash) {
    return /^#\/nofida(?:$|[/?])/.test(getHashPath(hash || getCurrentHash()));
  }

  function isDashboardSurface(hash) {
    return isDashboardRoute(hash) || isNofidaResourceRoute(hash);
  }

  function getSurface(hash) {
    var current = normalizeHash(hash || getCurrentHash());
    if (isAccountSurface(current)) return "account";
    if (isEditorSurface(current)) return "editor";
    if (isDashboardSurface(current)) return "dashboard-resource";
    return "other";
  }

  function getCurrentSurface(hash) {
    var surface = getSurface(hash);
    if (surface === "dashboard-resource") return "dashboard";
    return surface;
  }

  function looksLikeUuid(value) {
    return /^[0-9a-f-]{36}$/i.test(String(value || "").trim());
  }

  function extractUuidFromText(value) {
    var match = String(value || "").match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    return match ? match[0] : "";
  }

  function readTeamIdFromLocalStorageValue(rawValue) {
    if (!rawValue) return "";
    if (looksLikeUuid(rawValue)) return rawValue;

    try {
      var parsed = JSON.parse(rawValue);
      if (looksLikeUuid(parsed)) return parsed;
      if (parsed && typeof parsed === "object") {
        var direct = SAFE_LOCAL_TEAM_KEYS
          .map(function (key) { return parsed[key]; })
          .find(looksLikeUuid);
        if (direct) return direct;

        var nestedKeys = Object.keys(parsed);
        for (var index = 0; index < nestedKeys.length; index += 1) {
          var nested = parsed[nestedKeys[index]];
          if (nested && typeof nested === "object") {
            var nestedDirect = SAFE_LOCAL_TEAM_KEYS
              .map(function (key) { return nested[key]; })
              .find(looksLikeUuid);
            if (nestedDirect) return nestedDirect;
          }
        }
      }
    } catch (_error) {
      /* noop */
    }

    return extractUuidFromText(rawValue);
  }

  function readSafeTeamIdFromLocalStorage() {
    try {
      for (var keyIndex = 0; keyIndex < SAFE_LOCAL_TEAM_KEYS.length; keyIndex += 1) {
        var safeKey = SAFE_LOCAL_TEAM_KEYS[keyIndex];
        var direct = readTeamIdFromLocalStorageValue(window.localStorage.getItem(safeKey));
        if (direct) return direct;
      }

      for (var index = 0; index < window.localStorage.length; index += 1) {
        var key = window.localStorage.key(index) || "";
        if (!/(team|profile|dashboard|workspace)/i.test(key)) continue;
        var candidate = readTeamIdFromLocalStorageValue(window.localStorage.getItem(key));
        if (candidate) return candidate;
      }
    } catch (_error) {
      /* noop */
    }
    return "";
  }

  function readTeamIdFromHash(hash) {
    var current = normalizeHash(hash || getCurrentHash());
    var params = getHashParams(current);
    var fromQuery = params.get("team-id");
    if (looksLikeUuid(fromQuery)) return fromQuery;

    var match = current.match(/#\/dashboard\/team\/([0-9a-f-]{36})/i);
    if (match) return match[1];

    return "";
  }

  function readTeamIdFromLinks() {
    var links = document.querySelectorAll("a[href]");
    for (var index = 0; index < links.length; index += 1) {
      var href = links[index].getAttribute("href") || "";
      var match = href.match(/dashboard\/team\/([0-9a-f-]{36})/i) ||
        href.match(/[?&]team-id=([0-9a-f-]{36})/i);
      if (match) return match[1];
    }
    return "";
  }

  function getCurrentTeamId(hash) {
    var current = normalizeHash(hash || getCurrentHash());
    var direct = readTeamIdFromHash(current);
    if (direct) return direct;

    var fromLastDashboard = readTeamIdFromHash(state.lastDashboardHash || "") ||
      readTeamIdFromHash(state.lastProjectsHash || "");
    if (fromLastDashboard) return fromLastDashboard;

    if (looksLikeUuid(state.lastTeamId)) return state.lastTeamId;

    var fromStorage = readSafeTeamIdFromLocalStorage();
    if (fromStorage) return fromStorage;

    return readTeamIdFromLinks();
  }

  function isProjectsHash(hash) {
    var path = getHashPath(hash || getCurrentHash());
    return /^#\/dashboard(?:\/team\/[0-9a-f-]{36})?(?:\/projects(?:\/[^/?]+)?|\/recent)?$/i.test(path) ||
      path === "#/dashboard";
  }

  function isDraftsHash(hash) {
    var current = normalizeHash(hash || getCurrentHash());
    return /(?:^|[/?&=])drafts(?:$|[/?&=])/i.test(current);
  }

  function isNativeFontsHash(hash) {
    var path = getHashPath(hash || getCurrentHash());
    return /^#\/dashboard(?:\/team\/[0-9a-f-]{36})?\/fonts$/i.test(path);
  }

  function looksLikeNativeFontsSurface() {
    return !!document.querySelector(
      "#dashboard-fonts-title, .main_ui_dashboard_fonts__dashboard-container.main_ui_dashboard_fonts__dashboard-fonts"
    );
  }

  function getProjectsRoute(hash) {
    var current = normalizeHash(hash || getCurrentHash());
    var currentTeamId = getCurrentTeamId(current);

    if (isProjectsHash(current) && (!currentTeamId || readTeamIdFromHash(current) || current === ROUTES.dashboard)) {
      return current;
    }

    if (state.lastProjectsHash && (!currentTeamId || readTeamIdFromHash(state.lastProjectsHash) === currentTeamId)) {
      return state.lastProjectsHash;
    }

    if (currentTeamId) {
      return "#/dashboard/team/" + currentTeamId + "/projects";
    }

    return ROUTES.dashboard;
  }

  function getNativeFontsRoute(hash) {
    var teamId = getCurrentTeamId(hash);
    return teamId ? "#/dashboard/fonts?team-id=" + teamId : ROUTES.dashboard;
  }

  function getDraftsRoute(hash) {
    var teamId = getCurrentTeamId(hash);
    if (!teamId) return "";
    return "";
  }

  function getRouteForItem(itemId, hash) {
    switch (itemId) {
      case "projects":
      case "all-projects":
        return getProjectsRoute(hash);
      case "drafts":
        return getDraftsRoute(hash);
      case "libraries":
        return ROUTES.libraries;
      case "fonts":
      case "team-fonts":
        return getNativeFontsRoute(hash);
      case "font-catalog":
        return ROUTES.fontCatalog;
      case "media":
        return ROUTES.media;
      case "figma":
        return ROUTES.figma;
      case "help":
        return ROUTES.help;
      case "learn":
        return ROUTES.learn;
      case "releases":
        return ROUTES.releases;
      case "changelog":
        return ROUTES.changelog;
      case "terms":
        return ROUTES.terms;
      case "privacy":
        return ROUTES.privacy;
      case "open-source":
        return ROUTES.openSource;
      default:
        return "";
    }
  }

  function getActiveNavState(hash) {
    var current = normalizeHash(hash || getCurrentHash());
    var path = getHashPath(current);

    if (isNativeFontsHash(current) || (isDashboardRoute(current) && looksLikeNativeFontsSurface())) {
      return { activeId: "fonts", childActiveId: "team-fonts" };
    }

    if (isDraftsHash(current)) {
      return { activeId: "projects", childActiveId: "drafts" };
    }

    if (isProjectsHash(current)) {
      return { activeId: "projects", childActiveId: "all-projects" };
    }

    switch (path) {
      case ROUTES.libraries:
        return { activeId: "libraries", childActiveId: "" };
      case ROUTES.fontCatalog:
        return { activeId: "fonts", childActiveId: "font-catalog" };
      case ROUTES.media:
        return { activeId: "media", childActiveId: "" };
      case ROUTES.figma:
        return { activeId: "figma", childActiveId: "" };
      case ROUTES.help:
      case ROUTES.repository:
      case ROUTES.community:
        return { activeId: "help", childActiveId: "" };
      case ROUTES.learn:
        return { activeId: "learn", childActiveId: "" };
      case ROUTES.releases:
        return { activeId: "releases", childActiveId: "" };
      case ROUTES.changelog:
        return { activeId: "changelog", childActiveId: "" };
      case ROUTES.terms:
        return { activeId: "terms", childActiveId: "" };
      case ROUTES.privacy:
        return { activeId: "privacy", childActiveId: "" };
      case ROUTES.openSource:
        return { activeId: "open-source", childActiveId: "" };
      default:
        return { activeId: "", childActiveId: "" };
    }
  }

  function getRouteMeta(hash) {
    var current = normalizeHash(hash || getCurrentHash());
    var path = getHashPath(current);
    var active = getActiveNavState(current);

    if (active.activeId === "projects" && active.childActiveId === "drafts") {
      return {
        menuId: "projects",
        childMenuId: "drafts",
        label: "Черновики",
        breadcrumb: ["Панель", "Основное", "Проекты", "Черновики"]
      };
    }

    if (active.activeId === "projects") {
      return {
        menuId: "projects",
        childMenuId: "all-projects",
        label: "Проекты",
        breadcrumb: ["Панель", "Основное", "Проекты", "Все проекты"]
      };
    }

    if (active.activeId === "fonts" && active.childActiveId === "team-fonts") {
      return {
        menuId: "fonts",
        childMenuId: "team-fonts",
        label: "Шрифты команды",
        breadcrumb: ["Панель", "Ресурсы", "Шрифты", "Шрифты команды"]
      };
    }

    if (active.activeId === "fonts" && active.childActiveId === "font-catalog") {
      return {
        menuId: "fonts",
        childMenuId: "font-catalog",
        label: "Каталог шрифтов",
        breadcrumb: ["Панель", "Ресурсы", "Шрифты", "Каталог шрифтов"]
      };
    }

    if (path === ROUTES.libraries) {
      return { menuId: "libraries", childMenuId: "", label: "Библиотеки", breadcrumb: ["Панель", "Ресурсы", "Библиотеки"] };
    }
    if (path === ROUTES.media) {
      return { menuId: "media", childMenuId: "", label: "Медиа", breadcrumb: ["Панель", "Ресурсы", "Медиа"] };
    }
    if (path === ROUTES.figma) {
      return { menuId: "figma", childMenuId: "", label: "Импорт из Figma", breadcrumb: ["Панель", "Ресурсы", "Импорт из Figma"] };
    }
    if (path === ROUTES.help) {
      return { menuId: "help", childMenuId: "", label: "Справка", breadcrumb: ["Панель", "Помощь", "Справка"] };
    }
    if (path === ROUTES.learn) {
      return { menuId: "learn", childMenuId: "", label: "Обучение", breadcrumb: ["Панель", "Помощь", "Обучение"] };
    }
    if (path === ROUTES.releases) {
      return { menuId: "releases", childMenuId: "", label: "Релизы", breadcrumb: ["Панель", "Помощь", "Релизы"] };
    }
    if (path === ROUTES.changelog) {
      return { menuId: "changelog", childMenuId: "", label: "Журнал изменений", breadcrumb: ["Панель", "Помощь", "Журнал изменений"] };
    }
    if (path === ROUTES.terms) {
      return { menuId: "terms", childMenuId: "", label: "Условия", breadcrumb: ["Панель", "Документы", "Условия"] };
    }
    if (path === ROUTES.privacy) {
      return { menuId: "privacy", childMenuId: "", label: "Privacy / Data", breadcrumb: ["Панель", "Документы", "Privacy / Data"] };
    }
    if (path === ROUTES.openSource) {
      return { menuId: "open-source", childMenuId: "", label: "Open Source", breadcrumb: ["Панель", "Документы", "Open Source"] };
    }
    if (path === ROUTES.repository) {
      return { menuId: "help", childMenuId: "", label: "Репозиторий", breadcrumb: ["Панель", "Помощь", "Репозиторий"] };
    }
    if (path === ROUTES.community) {
      return { menuId: "help", childMenuId: "", label: "Сообщество", breadcrumb: ["Панель", "Помощь", "Сообщество"] };
    }

    if (isAccountSurface(current)) {
      var params = getHashParams(current);
      var tab = params.get("tab") || "api";
      return {
        menuId: "account",
        childMenuId: "",
        label: params.get("nofida") === "ai" ? "NOFIDA AI" : "Настройки",
        breadcrumb: ["Аккаунт", params.get("nofida") === "ai" ? "NOFIDA AI" : "Настройки", tab]
      };
    }

    if (isEditorSurface(current)) {
      return {
        menuId: "editor",
        childMenuId: "",
        label: "Редактор",
        breadcrumb: ["Редактор"]
      };
    }

    return {
      menuId: "",
      childMenuId: "",
      label: "",
      breadcrumb: []
    };
  }

  function getResourceMenuItems(hash) {
    return [
      { id: "projects", label: "Проекты", href: getProjectsRoute(hash) },
      { id: "libraries", label: "Библиотеки", href: ROUTES.libraries },
      { id: "fonts", label: "Шрифты", href: getNativeFontsRoute(hash) },
      { id: "media", label: "Медиа", href: ROUTES.media },
      { id: "figma", label: "Импорт из Figma", href: ROUTES.figma },
      { id: "help", label: "Справка", href: ROUTES.help },
      { id: "learn", label: "Обучение", href: ROUTES.learn },
      { id: "releases", label: "Релизы", href: ROUTES.releases },
      { id: "changelog", label: "Журнал изменений", href: ROUTES.changelog },
      { id: "terms", label: "Условия", href: ROUTES.terms },
      { id: "privacy", label: "Privacy / Data", href: ROUTES.privacy },
      { id: "open-source", label: "Open Source", href: ROUTES.openSource }
    ];
  }

  function getActiveResourceMenuId(hash) {
    return getActiveNavState(hash).activeId || "";
  }

  function rememberHash(hash) {
    var current = normalizeHash(hash || getCurrentHash());

    if (state.currentHash && state.currentHash !== current) {
      state.previousHash = state.currentHash;
    }
    state.currentHash = current;

    var teamId = getCurrentTeamId(current);
    if (teamId) state.lastTeamId = teamId;

    if (isDashboardRoute(current)) {
      state.lastDashboardHash = current;
      if (isProjectsHash(current) || isDraftsHash(current)) {
        state.lastProjectsHash = current;
      }
    }

    if (isAccountSurface(current)) state.lastAccountHash = current;
    if (isEditorSurface(current)) state.lastEditorHash = current;

    saveState();
  }

  function getRouteOrigin(hash) {
    if (!state.routeOrigins) return null;
    return state.routeOrigins[getHashPath(hash)] || null;
  }

  function setRouteOrigin(hash, origin) {
    if (!state.routeOrigins) state.routeOrigins = {};
    state.routeOrigins[getHashPath(hash)] = origin;
    saveState();
  }

  function getNavigationOrigin(currentHash) {
    var current = normalizeHash(currentHash || getCurrentHash() || state.currentHash || ROUTES.dashboard);
    var routeOrigin = getRouteOrigin(current);
    if (isNofidaResourceRoute(current) && routeOrigin) return routeOrigin;
    return {
      fromHash: current,
      fromSurface: getCurrentSurface(current),
      source: ""
    };
  }

  function navigate(hash) {
    if (!hash || typeof hash !== "string") return;
    if (hash.indexOf("#/") === 0) {
      window.location.hash = hash;
      return;
    }
    if (hash.indexOf("/#/") === 0) {
      window.location.href = hash;
    }
  }

  function goToNofidaRoute(route, options) {
    if (!route || typeof route !== "string") return;

    var target = route.indexOf("/#/") === 0 ? route : normalizeHash(route);
    var targetHash = target.indexOf("/#/") === 0 ? normalizeHash(target) : target;
    var opts = options || {};

    if (opts.rememberOrigin !== false && (isNofidaResourceRoute(targetHash) || isEditorSurface(targetHash) || isAccountSurface(targetHash))) {
      var origin = opts.origin || getNavigationOrigin(opts.fromHash);
      setRouteOrigin(targetHash, {
        fromHash: normalizeHash(origin.fromHash || getCurrentHash() || state.currentHash || ROUTES.dashboard),
        fromSurface: origin.fromSurface || getCurrentSurface(origin.fromHash),
        source: opts.source || origin.source || "",
        explicit: opts.explicit !== false,
        ts: Date.now()
      });
    }

    if (opts.replace) {
      history.replaceState(null, "", window.location.pathname + targetHash);
      rememberHash(targetHash);
      renderCurrentSurface(targetHash);
      return targetHash;
    }

    navigate(target);
    return target;
  }

  function getBackTarget(currentHash, previousHash) {
    var current = normalizeHash(currentHash || getCurrentHash() || state.currentHash || ROUTES.dashboard);
    var previous = normalizeHash(previousHash || state.previousHash || "");
    var currentSurface = getCurrentSurface(current);
    var origin = getRouteOrigin(current);

    if (currentSurface === "account") {
      return {
        hash: ROUTES.settings,
        label: "Назад к настройкам",
        surface: "account"
      };
    }

    if (currentSurface === "editor") {
      if (origin && origin.fromSurface === "editor" && origin.fromHash) {
        return {
          hash: normalizeHash(origin.fromHash),
          label: "Назад в редактор",
          surface: "editor"
        };
      }
      if (previous && getCurrentSurface(previous) === "editor") {
        return {
          hash: previous,
          label: "Назад в редактор",
          surface: "editor"
        };
      }
      return {
        hash: normalizeHash(state.lastEditorHash || "#/workspace"),
        label: "Назад в редактор",
        surface: "editor"
      };
    }

    if (isNofidaResourceRoute(current)) {
      if (origin && origin.fromSurface === "editor" && origin.fromHash) {
        return {
          hash: normalizeHash(origin.fromHash),
          label: "Назад в редактор",
          surface: "editor"
        };
      }
      if (origin && origin.fromSurface === "account") {
        return {
          hash: ROUTES.settings,
          label: "Назад к настройкам",
          surface: "account"
        };
      }
      if (origin && origin.fromSurface === "dashboard" && origin.fromHash && !isNofidaResourceRoute(origin.fromHash)) {
        return {
          hash: normalizeHash(origin.fromHash),
          label: "Назад к проектам",
          surface: "dashboard"
        };
      }
      if (previous && getCurrentSurface(previous) === "dashboard" && !isNofidaResourceRoute(previous)) {
        return {
          hash: previous,
          label: "Назад к проектам",
          surface: "dashboard"
        };
      }
      return {
        hash: normalizeHash(state.lastDashboardHash || getProjectsRoute(current)),
        label: "Назад к проектам",
        surface: "dashboard"
      };
    }

    return {
      hash: normalizeHash(state.lastDashboardHash || getProjectsRoute(current)),
      label: "Назад к проектам",
      surface: "dashboard"
    };
  }

  function getSafeBackTarget(currentHash, previousHash) {
    return getBackTarget(currentHash, previousHash).hash;
  }

  function getBackLabel(currentHash, previousHash) {
    return getBackTarget(currentHash, previousHash).label;
  }

  function getBackTargetInfo(currentHash, previousHash) {
    return getBackTarget(currentHash, previousHash);
  }

  function goBack(currentHash, options) {
    var backTarget = getBackTarget(currentHash);
    return goToNofidaRoute(backTarget.hash, Object.assign({}, options || {}, {
      rememberOrigin: false
    }));
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function isVisibleNode(node) {
    if (!node) return false;
    var style = window.getComputedStyle(node);
    var rect = node.getBoundingClientRect();
    return style.display !== "none" &&
      style.visibility !== "hidden" &&
      rect.width > 0 &&
      rect.height > 0;
  }

  function pickVisibleNode(selectors) {
    for (var index = 0; index < selectors.length; index += 1) {
      var node = document.querySelector(selectors[index]);
      if (isVisibleNode(node)) return node;
    }
    return null;
  }

  function getWorkspaceInfo() {
    var node = pickVisibleNode([
      ".main_ui_dashboard_sidebar__team-name",
      "[class*='dashboard_sidebar__team-name']",
      "[class*='team-name']",
      "[data-testid='team-name']"
    ]);

    var name = node ? String(node.textContent || "").replace(/\s+/g, " ").trim() : "";
    if (!name) name = "NOFIDA Workspace";

    return {
      name: name,
      hasDropdown: !!(node && (node.closest("button") || node.querySelector("svg, [aria-haspopup='listbox'], [aria-haspopup='menu']")))
    };
  }

  function getUserInfo() {
    var node = pickVisibleNode([
      ".main_ui_dashboard_sidebar__profile",
      ".main_ui_dashboard_sidebar__sidebar-team",
      "[class*='dashboard_sidebar__profile']",
      "[class*='profile']",
      "[class*='account']",
      "[class*='user-menu']"
    ]);

    var text = node ? String(node.textContent || "").replace(/\s+/g, " ").trim() : "";
    var name = text ? text.split("  ").join(" ").trim() : "";
    if (!name) name = "Аккаунт";

    var initial = name.charAt(0).toUpperCase() || "N";
    return {
      name: name,
      initial: initial
    };
  }

  function ensureShell() {
    var shell = document.getElementById(SHELL_ID);
    if (!shell) {
      shell = document.createElement("div");
      shell.id = SHELL_ID;
      shell.className = "nofida-shell";
      shell.setAttribute("data-surface", "dashboard-resource");
      shell.innerHTML = [
        '<aside id="' + SIDEBAR_ID + '" class="nofida-shell-sidebar">',
        '  <div class="nofida-shell-workspace"></div>',
        '  <div class="nofida-shell-search">',
        '    <input type="search" placeholder="' + escapeHtml(SEARCH_PLACEHOLDER) + '" aria-label="' + escapeHtml(SEARCH_PLACEHOLDER) + '" autocomplete="off" spellcheck="false">',
        "  </div>",
        '  <nav id="' + NAV_ID + '" class="nofida-shell-nav"></nav>',
        '  <div class="nofida-shell-footer"></div>',
        "</aside>",
        '<main id="' + MAIN_ID + '" class="nofida-shell-main">',
        '  <div id="' + FRAME_ID + '" class="nofida-page-frame"></div>',
        "</main>"
      ].join("");
      document.body.appendChild(shell);
    }

    return {
      shell: shell,
      sidebar: document.getElementById(SIDEBAR_ID),
      workspace: shell.querySelector(".nofida-shell-workspace"),
      search: shell.querySelector(".nofida-shell-search input"),
      nav: document.getElementById(NAV_ID),
      footer: shell.querySelector(".nofida-shell-footer"),
      main: document.getElementById(MAIN_ID),
      frame: document.getElementById(FRAME_ID)
    };
  }

  function clearShellBodyClasses() {
    document.body.classList.remove(BODY_CLASS_NATIVE);
    document.body.classList.remove(BODY_CLASS_PAGE);
  }

  function renderWorkspace(els) {
    var workspace = getWorkspaceInfo();
    els.workspace.innerHTML = [
      '<div class="nofida-workspace-row">',
      '  <img class="nofida-workspace-logo" src="/nofida/brand/icon.png' + escapeHtml(ASSET_QUERY) + '" alt="NOFIDA">',
      '  <span class="nofida-workspace-name">' + escapeHtml(workspace.name) + "</span>",
      workspace.hasDropdown ? '  <span class="nofida-workspace-caret" aria-hidden="true">▾</span>' : "",
      "</div>"
    ].join("");
  }

  function renderFooter(els) {
    var user = getUserInfo();
    els.footer.innerHTML = [
      '<div class="nofida-footer-user">',
      '  <span class="nofida-footer-avatar" aria-hidden="true">' + escapeHtml(user.initial) + "</span>",
      '  <span class="nofida-footer-name">' + escapeHtml(user.name) + "</span>",
      '  <button type="button" class="nofida-footer-settings" data-nofida-route="' + escapeHtml(ROUTES.settings) + '">Настройки</button>',
      "</div>"
    ].join("");
  }

  function renderNav(els, route, forcedActiveId, forcedChildActiveId) {
    var active = forcedActiveId || forcedChildActiveId
      ? { activeId: forcedActiveId || "", childActiveId: forcedChildActiveId || "" }
      : getActiveNavState(route);

    els.nav.innerHTML = NAV_TREE.map(function (section) {
      return [
        '<section class="nofida-nav-section">',
        '  <div class="nofida-nav-section-title">' + escapeHtml(section.section) + "</div>",
        section.items.map(function (item) {
          var routeForItem = getRouteForItem(item.id, route);
          var parentActive = active.activeId === item.id;
          var childActive = item.childIds && item.childIds.indexOf(active.childActiveId) >= 0;
          var parentClasses = ["nofida-nav-item"];
          if (parentActive && !childActive) parentClasses.push("is-active");
          if (parentActive || childActive) parentClasses.push("is-parent-active");
          if (!routeForItem && item.children && item.children.length) parentClasses.push("is-disabled");

          var parentButton = [
            '<button type="button" class="' + parentClasses.join(" ") + '"',
            routeForItem ? ' data-nofida-route="' + escapeHtml(routeForItem) + '"' : ' disabled="disabled"',
            ' data-nofida-nav-id="' + escapeHtml(item.id) + '">',
            '  <span class="nofida-nav-dot" aria-hidden="true"></span>',
            '  <span>' + escapeHtml(item.label) + "</span>",
            "</button>"
          ].join("");

          var children = (item.children || []).map(function (child) {
            var childRoute = getRouteForItem(child.id, route);
            var childClasses = ["nofida-nav-subitem"];
            var isChildActive = active.childActiveId === child.id;
            if (isChildActive) childClasses.push("is-active");
            if (child.disabled || !childRoute) childClasses.push("is-disabled");
            return [
              '<button type="button" class="' + childClasses.join(" ") + '"',
              childRoute && !child.disabled ? ' data-nofida-route="' + escapeHtml(childRoute) + '"' : ' disabled="disabled"',
              child.disabledTitle ? ' title="' + escapeHtml(child.disabledTitle) + '"' : "",
              ' data-nofida-nav-child-id="' + escapeHtml(child.id) + '">',
              '  <span class="nofida-nav-dot" aria-hidden="true"></span>',
              '  <span>' + escapeHtml(child.label) + "</span>",
              "</button>"
            ].join("");
          }).join("");

          return parentButton + children;
        }).join(""),
        "</section>"
      ].join("");
    }).join("");
  }

  function renderFrameChrome(options) {
    var route = normalizeHash(options.route || getCurrentHash());
    var meta = getRouteMeta(route);
    var backTarget = options.backTarget || getBackTarget(route);
    var breadcrumb = Array.isArray(options.breadcrumb) ? options.breadcrumb : meta.breadcrumb;
    var title = options.title || meta.label || "NOFIDA";
    var subtitle = options.subtitle || "";
    var showHeader = options.hideFrameHeader !== true;
    var showBack = options.showBackButton !== false;

    return [
      showBack ? [
        '<div class="nofida-page-backrow">',
        '  <button type="button" class="nofida-page-back" data-nofida-back="safe" data-nofida-current="' + escapeHtml(route) + '">' + escapeHtml(backTarget.label) + "</button>",
        "</div>"
      ].join("") : "",
      breadcrumb && breadcrumb.length ? '<div class="nofida-page-breadcrumb">' + breadcrumb.map(function (segment) {
        return '<span>' + escapeHtml(segment) + "</span>";
      }).join('<span>/</span>') + "</div>" : "",
      showHeader ? [
        '<header class="nofida-page-header">',
        '  <h1 class="nofida-page-title">' + escapeHtml(title) + "</h1>",
        subtitle ? '  <p class="nofida-page-subtitle">' + escapeHtml(subtitle) + "</p>" : "",
        "</header>"
      ].join("") : "",
      options.contentHtml || ""
    ].join("");
  }

  function renderShellChrome(route, mode, forcedActiveId, forcedChildActiveId) {
    var els = ensureShell();
    els.shell.setAttribute("data-surface", "dashboard-resource");
    els.shell.setAttribute("data-route-kind", mode);
    renderWorkspace(els);
    renderFooter(els);
    renderNav(els, route, forcedActiveId, forcedChildActiveId);
    return els;
  }

  function renderDashboardShell(options) {
    var opts = options || {};
    var route = normalizeHash(opts.route || getCurrentHash());
    var active = opts.activeId || opts.childActiveId
      ? { activeId: opts.activeId || "", childActiveId: opts.childActiveId || "" }
      : getActiveNavState(route);
    var els = renderShellChrome(route, "shell-page", active.activeId, active.childActiveId);

    clearShellBodyClasses();
    document.body.classList.add(BODY_CLASS_PAGE);

    els.frame.innerHTML = renderFrameChrome({
      route: route,
      breadcrumb: opts.breadcrumb,
      title: opts.title,
      subtitle: opts.subtitle,
      contentHtml: opts.contentHtml,
      hideFrameHeader: opts.hideFrameHeader,
      showBackButton: opts.showBackButton,
      backTarget: opts.backTarget
    });

    state.shellOwner = opts.owner || "";
    state.shellRoute = route;
    saveState();
    return els.shell;
  }

  function renderNativeDashboardShell(hash) {
    var route = normalizeHash(hash || getCurrentHash());
    var active = getActiveNavState(route);
    var els = renderShellChrome(route, "native-dashboard", active.activeId, active.childActiveId);

    clearShellBodyClasses();
    document.body.classList.add(BODY_CLASS_NATIVE);
    els.frame.innerHTML = "";

    state.shellOwner = "";
    state.shellRoute = route;
    saveState();
    return els.shell;
  }

  function updateDashboardShellActiveState(options) {
    var opts = options && typeof options === "object" ? options : {};
    var route = normalizeHash(opts.route || getCurrentHash());
    var shell = document.getElementById(SHELL_ID);
    if (!shell) return;

    var mode = shell.getAttribute("data-route-kind") || "shell-page";
    var active = opts.activeId || opts.childActiveId
      ? { activeId: opts.activeId || "", childActiveId: opts.childActiveId || "" }
      : getActiveNavState(route);
    renderShellChrome(route, mode, active.activeId, active.childActiveId);
  }

  function destroyDashboardShell() {
    clearShellBodyClasses();
    var shell = document.getElementById(SHELL_ID);
    if (shell && shell.parentNode) shell.parentNode.removeChild(shell);
    state.shellOwner = "";
    state.shellRoute = "";
    saveState();
  }

  function renderPlaceholderPage(hash) {
    var route = normalizeHash(hash || getCurrentHash());
    var meta = getRouteMeta(route);
    renderDashboardShell({
      owner: PLACEHOLDER_OWNER,
      route: route,
      activeId: meta.menuId,
      childActiveId: meta.childMenuId,
      breadcrumb: meta.breadcrumb,
      title: meta.label || "NOFIDA",
      subtitle: "",
      contentHtml: '<div class="nofida-page-card">Загрузка страницы NOFIDA...</div>'
    });
  }

  function scheduleDashboardRefresh() {
    while (refreshTimers.length) {
      window.clearTimeout(refreshTimers.pop());
    }

    [0, 160, 640, 1400].forEach(function (delay) {
      refreshTimers.push(window.setTimeout(function () {
        if (!isDashboardRoute(getCurrentHash()) || isNofidaResourceRoute(getCurrentHash())) return;
        renderNativeDashboardShell(getCurrentHash());
      }, delay));
    });
  }

  function renderCurrentSurface(hash) {
    var current = normalizeHash(hash || getCurrentHash());
    var surface = getSurface(current);

    if (surface === "account" || surface === "editor" || surface === "other") {
      destroyDashboardShell();
      return;
    }

    if (isDashboardRoute(current) && !isNofidaResourceRoute(current)) {
      renderNativeDashboardShell(current);
      scheduleDashboardRefresh();
      return;
    }

    if (isNofidaResourceRoute(current)) {
      if (state.shellOwner && state.shellOwner !== PLACEHOLDER_OWNER && state.shellRoute === current) {
        updateDashboardShellActiveState({ route: current });
        return;
      }
      renderPlaceholderPage(current);
    }
  }

  function refreshDashboardGroup() {
    renderCurrentSurface(getCurrentHash());
  }

  function findDashboardSidebarNav() {
    return document.querySelector(".main_ui_dashboard_sidebar__sidebar-nav");
  }

  function ensureClickHandling() {
    if (clickBound) return;
    clickBound = true;

    document.addEventListener("click", function (event) {
      var target = event.target;
      if (!(target instanceof HTMLElement)) return;

      var routeLink = target.closest("[data-nofida-route]");
      if (routeLink) {
        var route = routeLink.getAttribute("data-nofida-route");
        if (route) {
          event.preventDefault();
          goToNofidaRoute(route, {
            source: routeLink.getAttribute("data-nofida-source") || "",
            replace: routeLink.getAttribute("data-nofida-replace") === "true"
          });
          return;
        }
      }

      var backButton = target.closest("[data-nofida-back='safe']");
      if (backButton) {
        event.preventDefault();
        goBack(backButton.getAttribute("data-nofida-current") || getCurrentHash(), {
          replace: backButton.getAttribute("data-nofida-replace") === "true"
        });
      }
    });
  }

  function init() {
    rememberHash(getCurrentHash());
    ensureClickHandling();
    renderCurrentSurface(getCurrentHash());
    window.addEventListener("hashchange", function () {
      rememberHash(getCurrentHash());
      renderCurrentSurface(getCurrentHash());
    });
  }

  window.NofidaNavigation = {
    ROUTES: ROUTES,
    normalizeHash: normalizeHash,
    getCurrentHash: getCurrentHash,
    getHashPath: getHashPath,
    getHashParams: getHashParams,
    getCurrentTeamId: getCurrentTeamId,
    getProjectsHash: getProjectsRoute,
    getNativeFontsHash: getNativeFontsRoute,
    getSurface: getSurface,
    getCurrentSurface: getCurrentSurface,
    isDashboardSurface: isDashboardSurface,
    isAccountSurface: isAccountSurface,
    isEditorSurface: isEditorSurface,
    isNofidaResourceRoute: isNofidaResourceRoute,
    isResourceRoute: isNofidaResourceRoute,
    getRouteForItem: getRouteForItem,
    getActiveNavState: getActiveNavState,
    getRouteMeta: getRouteMeta,
    getResourceMenuItems: getResourceMenuItems,
    getActiveResourceMenuId: getActiveResourceMenuId,
    navigate: navigate,
    goToNofidaRoute: goToNofidaRoute,
    renderDashboardShell: renderDashboardShell,
    updateDashboardShellActiveState: updateDashboardShellActiveState,
    destroyDashboardShell: destroyDashboardShell,
    getBackTarget: getBackTarget,
    getSafeBackTarget: getSafeBackTarget,
    getBackLabel: getBackLabel,
    getBackTargetInfo: getBackTargetInfo,
    goBack: goBack,
    rememberHash: rememberHash,
    refreshDashboardGroup: refreshDashboardGroup,
    findDashboardSidebarNav: findDashboardSidebarNav,
    getState: function () {
      return {
        currentHash: state.currentHash || "",
        previousHash: state.previousHash || "",
        lastDashboardHash: state.lastDashboardHash || "",
        lastProjectsHash: state.lastProjectsHash || "",
        lastAccountHash: state.lastAccountHash || "",
        lastEditorHash: state.lastEditorHash || "",
        lastTeamId: state.lastTeamId || "",
        shellOwner: state.shellOwner || ""
      };
    }
  };

  if (document.readyState === "complete") {
    window.requestAnimationFrame(init);
  } else {
    window.addEventListener("load", function () {
      window.requestAnimationFrame(init);
    }, { once: true });
  }
})();
