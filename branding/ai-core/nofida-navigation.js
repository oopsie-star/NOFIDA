(function () {
  "use strict";

  if (window.NofidaNavigation) return;

  var ASSET_TAG = "__NOFIDA_ASSET_TAG__";
  var ASSET_QUERY = ASSET_TAG ? "?v=" + ASSET_TAG : "";
  var STORAGE_KEY = "nofida-navigation-v021a";
  var SHELL_ID = "nofida-shell";
  var SIDEBAR_ID = "nofida-shell-sidebar";
  var NAV_ID = "nofida-shell-nav";
  var TOPBAR_ID = "nofida-shell-topbar";
  var MAIN_ID = "nofida-shell-main";
  var FRAME_ID = "nofida-page-frame";
  var PLACEHOLDER_OWNER = "navigation-placeholder";
  var BODY_CLASS_NATIVE = "nofida-dashboard-shell-active";
  var BODY_CLASS_PAGE = "nofida-shell-page-active";
  var SEARCH_PLACEHOLDER = "Поиск по рабочему пространству";
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
    aiSettings: "#/settings/options?nofida=ai&tab=api",
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
      section: "Главное",
      items: [
        {
          id: "dashboard-home",
          label: "Главная",
          icon: "home"
        },
        {
          id: "projects",
          label: "Проекты",
          icon: "folder",
          childIds: ["all-projects", "drafts", "shared-with-me", "archived"],
          children: [
            { id: "all-projects", label: "Все проекты" },
            {
              id: "drafts",
              label: "Черновики",
              disabled: true,
              disabledTitle: "Раздел черновиков откроется в панели проектов"
            },
            {
              id: "shared-with-me",
              label: "Доступные мне",
              disabled: true,
              disabledTitle: "Раздел общих проектов появится в следующем обновлении панели"
            },
            {
              id: "archived",
              label: "Архив",
              disabled: true,
              disabledTitle: "Архив проектов будет подключен в панели проектов"
            }
          ]
        }
      ]
    },
    {
      section: "Ресурсы",
      items: [
        { id: "libraries", label: "Библиотеки", icon: "library" },
        {
          id: "fonts",
          label: "Шрифты",
          icon: "type",
          childIds: ["team-fonts", "font-catalog"],
          children: [
            { id: "team-fonts", label: "Шрифты команды" },
            { id: "font-catalog", label: "Каталог шрифтов" }
          ]
        },
        { id: "media", label: "Медиа", icon: "media" },
        { id: "figma", label: "Импорт из Figma", icon: "figma" }
      ]
    },
    {
      section: "Помощь",
      items: [
        { id: "help", label: "Справка", icon: "help" },
        { id: "learn", label: "Обучение", icon: "learn" },
        { id: "releases", label: "Релизы", icon: "spark" },
        { id: "changelog", label: "Журнал изменений", icon: "history" }
      ]
    },
    {
      section: "AI",
      items: [
        { id: "ai-assistant", label: "AI Assistant", icon: "ai" }
      ]
    },
    {
      section: "Настройки",
      items: [
        { id: "settings", label: "Настройки", icon: "settings" },
        { id: "account", label: "Аккаунт", icon: "user" }
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

  function isDashboardHomeHash(hash) {
    var path = getHashPath(hash || getCurrentHash());
    return path === "#/dashboard" || /\/recent$/i.test(path);
  }

  function getRouteForItem(itemId, hash) {
    switch (itemId) {
      case "dashboard-home":
        return ROUTES.dashboard;
      case "projects":
      case "all-projects":
        return getProjectsRoute(hash);
      case "drafts":
      case "shared-with-me":
      case "archived":
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
      case "ai-assistant":
        return ROUTES.aiSettings;
      case "settings":
      case "account":
        return ROUTES.settings;
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
    var params = getHashParams(current);

    if (isNativeFontsHash(current) || (isDashboardRoute(current) && looksLikeNativeFontsSurface())) {
      return { activeId: "fonts", childActiveId: "team-fonts" };
    }

    if (isDraftsHash(current)) {
      return { activeId: "projects", childActiveId: "drafts" };
    }

    if (isProjectsHash(current)) {
      if (isDashboardHomeHash(current)) {
        return { activeId: "dashboard-home", childActiveId: "" };
      }
      return { activeId: "projects", childActiveId: "all-projects" };
    }

    if (isAccountSurface(current)) {
      if (params.get("nofida") === "ai") {
        return { activeId: "ai-assistant", childActiveId: "" };
      }
      return { activeId: "account", childActiveId: "" };
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
      case ROUTES.privacy:
      case ROUTES.openSource:
        return { activeId: "help", childActiveId: "" };
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
        breadcrumb: ["Рабочее пространство", "Проекты", "Черновики"]
      };
    }

    if (active.activeId === "dashboard-home") {
      return {
        menuId: "dashboard-home",
        childMenuId: "",
        label: "Главная",
        breadcrumb: ["Рабочее пространство", "Главная"]
      };
    }

    if (active.activeId === "projects") {
      return {
        menuId: "projects",
        childMenuId: "all-projects",
        label: "Проекты",
        breadcrumb: ["Рабочее пространство", "Проекты", "Все проекты"]
      };
    }

    if (active.activeId === "fonts" && active.childActiveId === "team-fonts") {
      return {
        menuId: "fonts",
        childMenuId: "team-fonts",
        label: "Шрифты команды",
        breadcrumb: ["Рабочее пространство", "Ресурсы", "Шрифты команды"]
      };
    }

    if (active.activeId === "fonts" && active.childActiveId === "font-catalog") {
      return {
        menuId: "fonts",
        childMenuId: "font-catalog",
        label: "Каталог шрифтов",
        breadcrumb: ["Рабочее пространство", "Ресурсы", "Каталог шрифтов"]
      };
    }

    if (path === ROUTES.libraries) {
      return { menuId: "libraries", childMenuId: "", label: "Библиотеки", breadcrumb: ["Рабочее пространство", "Ресурсы", "Библиотеки"] };
    }
    if (path === ROUTES.media) {
      return { menuId: "media", childMenuId: "", label: "Медиа", breadcrumb: ["Рабочее пространство", "Ресурсы", "Медиа"] };
    }
    if (path === ROUTES.figma) {
      return { menuId: "figma", childMenuId: "", label: "Импорт из Figma", breadcrumb: ["Рабочее пространство", "Ресурсы", "Импорт из Figma"] };
    }
    if (path === ROUTES.help) {
      return { menuId: "help", childMenuId: "", label: "Справка", breadcrumb: ["Рабочее пространство", "Помощь", "Справка"] };
    }
    if (path === ROUTES.learn) {
      return { menuId: "learn", childMenuId: "", label: "Обучение", breadcrumb: ["Рабочее пространство", "Помощь", "Обучение"] };
    }
    if (path === ROUTES.releases) {
      return { menuId: "releases", childMenuId: "", label: "Релизы", breadcrumb: ["Рабочее пространство", "Помощь", "Релизы"] };
    }
    if (path === ROUTES.changelog) {
      return { menuId: "changelog", childMenuId: "", label: "Журнал изменений", breadcrumb: ["Рабочее пространство", "Помощь", "Журнал изменений"] };
    }
    if (path === ROUTES.terms) {
      return { menuId: "help", childMenuId: "", label: "Условия использования", breadcrumb: ["Рабочее пространство", "Помощь", "Условия использования"] };
    }
    if (path === ROUTES.privacy) {
      return { menuId: "help", childMenuId: "", label: "Данные и приватность", breadcrumb: ["Рабочее пространство", "Помощь", "Данные и приватность"] };
    }
    if (path === ROUTES.openSource) {
      return { menuId: "help", childMenuId: "", label: "Открытые лицензии", breadcrumb: ["Рабочее пространство", "Помощь", "Открытые лицензии"] };
    }
    if (path === ROUTES.repository) {
      return { menuId: "help", childMenuId: "", label: "Репозиторий", breadcrumb: ["Рабочее пространство", "Помощь", "Репозиторий"] };
    }
    if (path === ROUTES.community) {
      return { menuId: "help", childMenuId: "", label: "Сообщество", breadcrumb: ["Рабочее пространство", "Помощь", "Сообщество"] };
    }

    if (isAccountSurface(current)) {
      var params = getHashParams(current);
      var tab = params.get("tab") || "api";
      return {
        menuId: params.get("nofida") === "ai" ? "ai-assistant" : "account",
        childMenuId: "",
        label: params.get("nofida") === "ai" ? "AI Assistant" : "Настройки",
        breadcrumb: ["Аккаунт", params.get("nofida") === "ai" ? "AI Assistant" : "Настройки", tab]
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
      { id: "dashboard-home", label: "Главная", href: ROUTES.dashboard },
      { id: "projects", label: "Проекты", href: getProjectsRoute(hash) },
      { id: "libraries", label: "Библиотеки", href: ROUTES.libraries },
      { id: "fonts", label: "Шрифты", href: getNativeFontsRoute(hash) },
      { id: "media", label: "Медиа", href: ROUTES.media },
      { id: "figma", label: "Импорт из Figma", href: ROUTES.figma },
      { id: "help", label: "Справка", href: ROUTES.help },
      { id: "learn", label: "Обучение", href: ROUTES.learn },
      { id: "releases", label: "Релизы", href: ROUTES.releases },
      { id: "changelog", label: "Журнал изменений", href: ROUTES.changelog }
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

  function normalizeTextContent(node) {
    return String(node && node.textContent || "").replace(/\s+/g, " ").trim();
  }

  function getWorkspaceInfo() {
    var node = pickVisibleNode([
      ".main_ui_dashboard_sidebar__team-name",
      "[class*='dashboard_sidebar__team-name']",
      "[class*='team-name']",
      "[data-testid='team-name']"
    ]);

    var name = normalizeTextContent(node);
    if (!name) name = "NOFIDA Workspace";

    return {
      name: name
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

    var raw = normalizeTextContent(node) || "";
    // Penpot profile element prepends avatar initial as first token and appends noise phrases
    var NOISE = /^(аккаунт|команды|nofida|penpot|профиль|меню|menu|team|account|команда)$/i;
    var tokens = raw.split(/\s+/).filter(function (t) {
      return t.length > 1 && !NOISE.test(t);
    });
    var name = tokens.join(" ").trim() || "Аккаунт";
    var initial = name.charAt(0).toUpperCase() || "N";
    return { name: name, initial: initial };
  }

  function getIconMarkup(name, extraClass) {
    var path = "";
    switch (name) {
      case "workspace":
        path = '<path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h3A1.5 1.5 0 0 1 9 4.5v3A1.5 1.5 0 0 1 7.5 9h-3A1.5 1.5 0 0 1 3 7.5zm0 8A1.5 1.5 0 0 1 4.5 11h3A1.5 1.5 0 0 1 9 12.5v3A1.5 1.5 0 0 1 7.5 17h-3A1.5 1.5 0 0 1 3 15.5zm8-8A1.5 1.5 0 0 1 12.5 3h3A1.5 1.5 0 0 1 17 4.5v3A1.5 1.5 0 0 1 15.5 9h-3A1.5 1.5 0 0 1 11 7.5zm1.5 7.5a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5v-3a.5.5 0 0 0-.5-.5z"/>';
        break;
      case "home":
        path = '<path d="M3.5 8.8 10 3l6.5 5.8v7.2a1 1 0 0 1-1 1H12v-4.5H8V17H4.5a1 1 0 0 1-1-1z"/>';
        break;
      case "folder":
        path = '<path d="M2.5 6.5A1.5 1.5 0 0 1 4 5h3.3a2 2 0 0 1 1.4.57l1.1 1.1a1 1 0 0 0 .7.29H16A1.5 1.5 0 0 1 17.5 8.5v6A2.5 2.5 0 0 1 15 17H5A2.5 2.5 0 0 1 2.5 14.5z"/>';
        break;
      case "library":
        path = '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H8v14H5.5A1.5 1.5 0 0 1 4 15.5zm5-1.5h3a1.5 1.5 0 0 1 1.5 1.5V17H9zm5 1.5A1.5 1.5 0 0 1 15.5 3h1A1.5 1.5 0 0 1 18 4.5v11a1.5 1.5 0 0 1-1.5 1.5h-1A1.5 1.5 0 0 1 14 15.5z"/>';
        break;
      case "type":
        path = '<path d="M3 5.5V3h14v2.5h-5V17H8V5.5z"/>';
        break;
      case "media":
        path = '<path d="M4.5 3h11A1.5 1.5 0 0 1 17 4.5v11a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 15.5v-11A1.5 1.5 0 0 1 4.5 3m.7 10.5h9.6l-2.6-3.3a1 1 0 0 0-1.56-.03L8.9 12.2l-1.1-1.34a1 1 0 0 0-1.57.04zm2.3-5.2a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6"/>';
        break;
      case "figma":
        path = '<path d="M9 3.5A2.5 2.5 0 0 1 11.5 1h2a2.5 2.5 0 0 1 0 5H11v2h2.5a2.5 2.5 0 1 1 0 5H11v2.5a2.5 2.5 0 1 1-5 0A2.5 2.5 0 0 1 8.5 13H11V8H8.5A2.5 2.5 0 1 1 8.5 3H11V1H8.5A2.5 2.5 0 0 1 6 3.5"/>';
        break;
      case "help":
        path = '<path d="M10 17a1.2 1.2 0 1 1 0-2.4A1.2 1.2 0 0 1 10 17m0-14a7 7 0 1 1 0 14 7 7 0 0 1 0-14m0 3.2c-1.3 0-2.3.8-2.6 2.1l1.8.4c.12-.48.44-.9.98-.9.62 0 1 .37 1 .92 0 .44-.25.75-.74 1.06-.95.6-1.64 1.25-1.64 2.72v.18h1.9v-.13c0-.7.26-1.04 1.05-1.56.86-.57 1.34-1.3 1.34-2.33 0-1.55-1.21-2.46-3.09-2.46"/>';
        break;
      case "learn":
        path = '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3h8A2.5 2.5 0 0 1 16 5.5v9a.5.5 0 0 1-.8.4A3.5 3.5 0 0 0 13 14H5.5A1.5 1.5 0 0 1 4 12.5zm2 1v6h7a5 5 0 0 1 1 .1V5.5a.5.5 0 0 0-.5-.5z"/>';
        break;
      case "history":
        path = '<path d="M10 3a7 7 0 1 1-6.58 4.62H1V6h4.5v4H4V8.32A5.5 5.5 0 1 0 10 4.5zm-.75 3h1.5v4.05l2.8 1.6-.75 1.3-3.55-2.02z"/>';
        break;
      case "spark":
      case "ai":
        path = '<path d="M10 2.5 11.8 7l4.7 1.2L12 10.2l-.4 5.3L10 12.7 8.4 15.5 8 10.2 3.5 8.2 8.2 7z"/>';
        break;
      case "settings":
        path = '<path d="m10 2 1.2 2.4 2.7.5-.8 2.6 1.8 2.1-1.8 2.1.8 2.6-2.7.5L10 18l-1.2-2.4-2.7-.5.8-2.6L5.1 9.5l1.8-2.1-.8-2.6 2.7-.5zm0 5.2a2.3 2.3 0 1 0 0 4.6 2.3 2.3 0 0 0 0-4.6"/>';
        break;
      case "user":
        path = '<path d="M10 10.2A3.1 3.1 0 1 0 10 4a3.1 3.1 0 0 0 0 6.2m-5 5.9a5.8 5.8 0 0 1 10 0V17H5z"/>';
        break;
      case "bell":
        path = '<path d="M10 17a1.75 1.75 0 0 0 1.73-1.5H8.27A1.75 1.75 0 0 0 10 17m4.5-3.5V9.3a4.5 4.5 0 1 0-9 0v4.2L4 15v.5h12V15z"/>';
        break;
      case "search":
        path = '<path d="M8.75 3a5.75 5.75 0 1 1 0 11.5A5.75 5.75 0 0 1 8.75 3m0 1.5a4.25 4.25 0 1 0 0 8.5 4.25 4.25 0 0 0 0-8.5m5.49 8.93 2.51 2.5-1.06 1.07-2.51-2.5z"/>';
        break;
      case "plus":
        path = '<path d="M9.25 3h1.5v6.25H17v1.5h-6.25V17h-1.5v-6.25H3v-1.5h6.25z"/>';
        break;
      default:
        path = '<circle cx="10" cy="10" r="6"/>';
    }
    return '<span class="' + escapeHtml(extraClass || "nf-nav-icon") + '" aria-hidden="true"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + path + "</svg></span>";
  }

  function ensureShell() {
    var shell = document.getElementById(SHELL_ID);
    if (!shell) {
      shell = document.createElement("div");
      shell.id = SHELL_ID;
      shell.className = "nofida-shell nf-shell";
      shell.setAttribute("data-surface", "dashboard-resource");
      shell.innerHTML = [
        '<aside id="' + SIDEBAR_ID + '" class="nofida-shell-sidebar nf-sidebar">',
        '  <div class="nofida-shell-workspace"></div>',
        '  <div class="nofida-shell-search">',
        '    <input type="search" placeholder="' + escapeHtml(SEARCH_PLACEHOLDER) + '" aria-label="' + escapeHtml(SEARCH_PLACEHOLDER) + '" autocomplete="off" spellcheck="false">',
        "  </div>",
        '  <nav id="' + NAV_ID + '" class="nofida-shell-nav nf-sidebar-nav"></nav>',
        '  <div class="nofida-shell-footer"></div>',
        "</aside>",
        '<section class="nofida-shell-workstage nf-workspace">',
        '  <header id="' + TOPBAR_ID + '" class="nofida-shell-topbar nf-topbar"></header>',
        '  <main id="' + MAIN_ID + '" class="nofida-shell-main nf-main">',
        '    <div id="' + FRAME_ID + '" class="nofida-page-frame nf-page"></div>',
        "  </main>",
        "</section>"
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
      topbar: document.getElementById(TOPBAR_ID),
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
      '<div class="nf-sidebar-brand">',
      '  <span class="nf-logo-mark">N</span>',
      '  <span class="nf-logo-word">NOFIDA</span>',
      "</div>",
      '<div class="nf-sidebar-meta">',
      '  <span class="nf-sidebar-meta-label">Рабочее пространство</span>',
      '  <strong class="nf-sidebar-meta-value">' + escapeHtml(workspace.name) + "</strong>",
      "</div>"
    ].join("");
  }

  function renderFooter(els) {
    var user = getUserInfo();
    els.footer.innerHTML = [
      '<button type="button" class="nofida-footer-user nf-account-chip" data-nofida-route="' + escapeHtml(ROUTES.settings) + '">',
      '  <span class="nofida-footer-avatar nf-account-avatar" aria-hidden="true">' + escapeHtml(user.initial) + "</span>",
      '  <span class="nf-account-copy"><strong class="nofida-footer-name">' + escapeHtml(user.name) + '</strong><span class="nf-account-meta">Аккаунт команды</span></span>',
      getIconMarkup("user", "nf-account-chip-icon"),
      "</button>"
    ].join("");
  }

  function renderTopbar(els, route) {
    var meta = getRouteMeta(route);
    var workspace = getWorkspaceInfo();
    var user = getUserInfo();
    var pageLabel = meta.label || "NOFIDA";

    els.topbar.innerHTML = [
      '<div class="nofida-topbar-breadcrumb nf-topbar-breadcrumb">',
      getIconMarkup("workspace", "nf-topbar-crumb-icon"),
      '  <span class="nf-topbar-crumb-root">' + escapeHtml(workspace.name) + "</span>",
      '  <span class="nf-topbar-crumb-sep">/</span>',
      '  <strong>' + escapeHtml(pageLabel) + "</strong>",
      "</div>",
      '<label class="nf-global-search">',
      getIconMarkup("search", "nf-global-search-icon"),
      '  <input type="search" aria-label="Глобальный поиск" placeholder="Поиск проектов, файлов и ресурсов…" autocomplete="off" spellcheck="false">',
      '  <span class="nf-shortcut">Ctrl K</span>',
      "</label>",
      '<div class="nofida-topbar-actions nf-topbar-actions">',
      '  <button type="button" class="nf-btn nf-btn-primary" data-nofida-action="new-project">' + getIconMarkup("plus", "nf-btn-inline-icon") + '<span>Новый проект</span></button>',
      '  <button type="button" class="nf-btn nf-btn-secondary nf-btn-icon" data-nofida-route="' + escapeHtml(ROUTES.releases) + '" aria-label="Уведомления">' + getIconMarkup("bell", "nf-btn-inline-icon") + "</button>",
      '  <button type="button" class="nf-btn nf-btn-secondary nf-btn-icon" data-nofida-route="' + escapeHtml(ROUTES.help) + '" aria-label="Справка">' + getIconMarkup("help", "nf-btn-inline-icon") + "</button>",
      '  <button type="button" class="nf-account-chip nf-account-chip-topbar" data-nofida-route="' + escapeHtml(ROUTES.settings) + '">',
      '    <span class="nf-account-avatar" aria-hidden="true">' + escapeHtml(user.initial) + "</span>",
      '    <span class="nf-account-copy"><strong>' + escapeHtml(user.name) + '</strong><span class="nf-account-meta">Параметры</span></span>',
      "  </button>",
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
          var parentClasses = ["nofida-nav-item", "nf-nav-item"];
          if (parentActive && !childActive) parentClasses.push("is-active");
          if (parentActive || childActive) parentClasses.push("is-parent-active");
          if (!routeForItem && item.children && item.children.length) parentClasses.push("is-disabled");

          var parentButton = [
            '<button type="button" class="' + parentClasses.join(" ") + '"',
            routeForItem ? ' data-nofida-route="' + escapeHtml(routeForItem) + '"' : ' disabled="disabled"',
            ' data-nofida-nav-id="' + escapeHtml(item.id) + '">',
            getIconMarkup(item.icon || "home", "nofida-nav-icon nf-nav-icon"),
            '  <span class="nofida-nav-dot" aria-hidden="true"></span>',
            '  <span class="nf-nav-label">' + escapeHtml(item.label) + "</span>",
            "</button>"
          ].join("");

          var children = (item.children || []).map(function (child) {
            var childRoute = getRouteForItem(child.id, route);
            var childClasses = ["nofida-nav-subitem", "nf-nav-subitem"];
            var isChildActive = active.childActiveId === child.id;
            if (isChildActive) childClasses.push("is-active");
            if (child.disabled || !childRoute) childClasses.push("is-disabled");
            return [
              '<button type="button" class="' + childClasses.join(" ") + '"',
              childRoute && !child.disabled ? ' data-nofida-route="' + escapeHtml(childRoute) + '"' : ' disabled="disabled"',
              child.disabledTitle ? ' title="' + escapeHtml(child.disabledTitle) + '"' : "",
              ' data-nofida-nav-child-id="' + escapeHtml(child.id) + '">',
              '  <span class="nofida-nav-dot" aria-hidden="true"></span>',
              '  <span class="nf-nav-label">' + escapeHtml(child.label) + "</span>",
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
    var title = options.title || meta.label || "NOFIDA";
    var subtitle = options.subtitle || "";
    var showHeader = options.hideFrameHeader !== true;
    var showBack = options.showBackButton === true;
    var eyebrow = options.eyebrow || "Рабочее пространство";
    var headerActionsHtml = options.headerActionsHtml || "";

    return [
      showBack ? [
        '<div class="nofida-page-backrow">',
          '  <button type="button" class="nofida-page-back" data-nofida-back="safe" data-nofida-current="' + escapeHtml(route) + '">' + escapeHtml(backTarget.label) + "</button>",
        "</div>"
      ].join("") : "",
      showHeader ? [
        '<header class="nofida-page-header nf-page-header">',
        "  <div>",
        '    <p class="nf-eyebrow">' + escapeHtml(eyebrow) + "</p>",
        '    <h1 class="nofida-page-title nf-page-title">' + escapeHtml(title) + "</h1>",
        subtitle ? '    <p class="nofida-page-subtitle nf-page-subtitle">' + escapeHtml(subtitle) + "</p>" : "",
        "  </div>",
        headerActionsHtml ? '  <div class="nf-page-actions">' + headerActionsHtml + "</div>" : "",
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
    renderTopbar(els, route);
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
      title: opts.title,
      subtitle: opts.subtitle,
      contentHtml: opts.contentHtml,
      hideFrameHeader: opts.hideFrameHeader,
      showBackButton: opts.showBackButton,
      backTarget: opts.backTarget,
      eyebrow: opts.eyebrow,
      headerActionsHtml: opts.headerActionsHtml
    });

    state.shellOwner = opts.owner || "";
    state.shellRoute = route;
    saveState();
    return els.shell;
  }

  function _doRenderDashboard(route, projects) {
    var active = getActiveNavState(route);
    renderDashboardShell({
      owner: "nofida-dashboard",
      route: route,
      activeId: active.activeId || "projects",
      childActiveId: active.childActiveId || "all-projects",
      title: "Проекты",
      subtitle: "Создавайте, собирайте и передавайте проектные материалы в одном рабочем пространстве.",
      hideFrameHeader: false,
      contentHtml: buildNofidaDashboardHtml(projects),
      headerActionsHtml: '<button type="button" class="nf-btn nf-btn-primary" data-nofida-action="new-project">' + getIconMarkup("plus", "nf-btn-inline-icon") + '<span>Новый проект</span></button>'
    });
  }

  function renderNativeDashboardShell(hash) {
    var route = normalizeHash(hash || getCurrentHash());
    if (isNativeFontsHash(route) || looksLikeNativeFontsSurface()) {
      cleanupNativeDashboardEnhancements();
      return;
    }

    var teamId = getCurrentTeamId() || "";
    if (_dashCache && _dashCache.teamId === teamId) {
      _doRenderDashboard(route, _dashCache.projects);
      return;
    }

    _doRenderDashboard(route, []);

    fetchDashboardData(teamId, function (err, data) {
      if (!isDashboardRoute(getCurrentHash()) || isNofidaResourceRoute(getCurrentHash())) return;
      var projects = (data && data.projects) || [];
      _dashCache = { teamId: teamId, projects: projects };
      _doRenderDashboard(getCurrentHash(), projects);
    });
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

  function findNativeDashboardContent() {
    return pickVisibleNode([
      ".main_ui_dashboard__dashboard-content",
      "[class*='dashboard-content']"
    ]);
  }

  function collectDashboardActivity(content) {
    var rows = Array.prototype.slice.call(
      content.querySelectorAll(".main_ui_dashboard_projects__dashboard-project-row"),
      0,
      5
    );

    var items = rows.map(function (row) {
      var title = normalizeTextContent(row.querySelector(".main_ui_dashboard_projects__project-name")) || "Проект";
      var fileInfo = normalizeTextContent(row.querySelector(".main_ui_dashboard_projects__info"));
      var recency = normalizeTextContent(row.querySelector(".main_ui_dashboard_projects__recent-files-row-title-info"));
      return {
        title: title + " обновлен",
        meta: [fileInfo, recency].filter(Boolean).join(" · ") || "Активность появится после обновлений команды."
      };
    }).filter(function (item) {
      return !!item.title;
    });

    if (items.length) return items;

    return [
      { title: "Обновите первый проект", meta: "Карточки активности появятся после сохранения файлов команды." },
      { title: "Подготовьте библиотеку", meta: "Добавьте стартовые ресурсы в рабочее пространство NOFIDA." }
    ];
  }

  function buildDashboardContextMarkup(content) {
    var activity = collectDashboardActivity(content);
    return [
      '<aside id="nf-dashboard-context-panel" class="nf-context-panel">',
      '  <section class="nf-panel">',
      '    <div class="nf-panel-header"><h2 class="nf-panel-title">Последняя активность</h2><button type="button" class="nf-panel-link" data-nofida-route="' + escapeHtml(getProjectsRoute(getCurrentHash())) + '">Открыть</button></div>',
      '    <div class="nf-list">',
      activity.map(function (item) {
        return [
          '<div class="nf-list-item">',
          '  <div class="nf-list-icon">' + getIconMarkup("workspace", "nf-list-icon-svg") + "</div>",
          '  <div><p class="nf-list-title">' + escapeHtml(item.title) + '</p><p class="nf-list-meta">' + escapeHtml(item.meta) + "</p></div>",
          "</div>"
        ].join("");
      }).join(""),
      "    </div>",
      "  </section>",
      '  <section class="nf-panel">',
      '    <div class="nf-panel-header"><h2 class="nf-panel-title">AI-подсказки</h2><button type="button" class="nf-panel-link" data-nofida-route="' + escapeHtml(ROUTES.aiSettings) + '">Настроить</button></div>',
      '    <div class="nf-list">',
      '      <button type="button" class="nf-suggestion-card" data-nofida-route="' + escapeHtml(ROUTES.aiSettings) + '"><span class="nf-list-icon">' + getIconMarkup("ai", "nf-list-icon-svg") + '</span><span><strong>Собрать рабочий бриф</strong><small>Запустите AI Assistant для структуры проекта и задач команды.</small></span></button>',
      '      <button type="button" class="nf-suggestion-card" data-nofida-route="' + escapeHtml(ROUTES.fontCatalog) + '"><span class="nf-list-icon">' + getIconMarkup("type", "nf-list-icon-svg") + '</span><span><strong>Подобрать типографику</strong><small>Откройте каталог шрифтов и соберите продуктовую пару.</small></span></button>',
      '      <button type="button" class="nf-suggestion-card" data-nofida-route="' + escapeHtml(ROUTES.media) + '"><span class="nf-list-icon">' + getIconMarkup("media", "nf-list-icon-svg") + '</span><span><strong>Проверить визуальные ресурсы</strong><small>Сверьте иконки, фоны и empty states перед релизом.</small></span></button>',
      "    </div>",
      "  </section>",
      '  <section class="nf-panel">',
      '    <div class="nf-panel-header"><h2 class="nf-panel-title">Закрепленные ресурсы</h2><button type="button" class="nf-panel-link" data-nofida-route="' + escapeHtml(ROUTES.libraries) + '">Все ресурсы</button></div>',
      '    <div class="nf-pinned-list">',
      '      <button type="button" class="nf-pinned-item" data-nofida-route="' + escapeHtml(ROUTES.libraries) + '">' + getIconMarkup("library", "nf-pinned-icon") + '<span><strong>Библиотеки</strong><small>Компоненты, UI kits и шаблоны.</small></span></button>',
      '      <button type="button" class="nf-pinned-item" data-nofida-route="' + escapeHtml(getNativeFontsRoute(getCurrentHash())) + '">' + getIconMarkup("type", "nf-pinned-icon") + '<span><strong>Шрифты команды</strong><small>Нативная загрузка и рекомендации NOFIDA.</small></span></button>',
      '      <button type="button" class="nf-pinned-item" data-nofida-route="' + escapeHtml(ROUTES.media) + '">' + getIconMarkup("media", "nf-pinned-icon") + '<span><strong>Медиабанк</strong><small>Локальные ассеты и паттерны.</small></span></button>',
      "    </div>",
      "  </section>",
      "</aside>"
    ].join("");
  }

  function buildDashboardResourceStripMarkup() {
    return [
      '<section id="nf-dashboard-resource-strip" class="nf-resource-strip">',
      '  <div class="nf-resource-strip-header"><div><p class="nf-eyebrow">Ресурсы</p><h2 class="nf-section-title">Быстрый доступ к ресурсам NOFIDA</h2></div><button type="button" class="nf-panel-link" data-nofida-route="' + escapeHtml(ROUTES.libraries) + '">Открыть каталог</button></div>',
      '  <div class="nf-resource-grid">',
      '    <button type="button" class="nf-resource-card" data-nofida-route="' + escapeHtml(ROUTES.libraries) + '"><span class="nf-resource-icon">' + getIconMarkup("library", "nf-resource-icon-svg") + '</span><h3 class="nf-resource-title">Библиотеки</h3><p class="nf-resource-desc">Добавляйте в пространство дизайн-системы, UI kits и шаблоны.</p><span class="nf-resource-meta">Каталог команды</span></button>',
      '    <button type="button" class="nf-resource-card" data-nofida-route="' + escapeHtml(getNativeFontsRoute(getCurrentHash())) + '"><span class="nf-resource-icon">' + getIconMarkup("type", "nf-resource-icon-svg") + '</span><h3 class="nf-resource-title">Шрифты</h3><p class="nf-resource-desc">Загрузите нативные шрифты команды и откройте рекомендации NOFIDA.</p><span class="nf-resource-meta">Командная типографика</span></button>',
      '    <button type="button" class="nf-resource-card" data-nofida-route="' + escapeHtml(ROUTES.media) + '"><span class="nf-resource-icon">' + getIconMarkup("media", "nf-resource-icon-svg") + '</span><h3 class="nf-resource-title">Медиа</h3><p class="nf-resource-desc">Иконки, иллюстрации и фоны уже готовы для продуктовых сценариев.</p><span class="nf-resource-meta">Локальные ассеты</span></button>',
      '    <button type="button" class="nf-resource-card" data-nofida-route="' + escapeHtml(ROUTES.figma) + '"><span class="nf-resource-icon">' + getIconMarkup("figma", "nf-resource-icon-svg") + '</span><h3 class="nf-resource-title">Импорт из Figma</h3><p class="nf-resource-desc">Соберите файл, ассеты и миграционный план перед переносом.</p><span class="nf-resource-meta">План переноса</span></button>',
      "  </div>",
      "</section>"
    ].join("");
  }

  // ─── 022B: API-driven project dashboard ─────────────────────────────────

  var _dashCache = null;

  function makeTransitDecode(v) {
    if (v === null || typeof v !== "object") {
      if (typeof v === "string") {
        if (v === "~:true") return true;
        if (v === "~:false") return false;
        if (v === "~:null") return null;
        if (v.charAt(0) === "~" && v.charAt(1) === ":") return v.slice(2);
        if (v.charAt(0) === "~" && v.charAt(1) === "u") return v.slice(2);
        if (v.charAt(0) === "~" && v.charAt(1) === "m") return new Date(parseInt(v.slice(2), 10));
      }
      return v;
    }
    if (Array.isArray(v)) {
      if (v.length >= 2 && v[0] === "^ ") {
        var obj = {};
        for (var i = 1; i < v.length; i += 2) {
          var rawKey = makeTransitDecode(v[i]);
          var key = typeof rawKey === "string" && rawKey.charAt(0) === "~" && rawKey.charAt(1) === ":"
            ? rawKey.slice(2) : rawKey;
          obj[key] = makeTransitDecode(v[i + 1]);
        }
        return obj;
      }
      return v.map(makeTransitDecode);
    }
    return v;
  }

  function decodeTransitResponse(text) {
    try { return makeTransitDecode(JSON.parse(text)); } catch (e) { return null; }
  }

  function nfXhr(url, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.setRequestHeader("Accept", "application/transit+json, application/json");
    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300) {
        callback(null, decodeTransitResponse(xhr.responseText) || {});
      } else {
        callback(new Error("HTTP " + xhr.status));
      }
    };
    xhr.onerror = function () { callback(new Error("Network error")); };
    xhr.send();
  }

  function fetchDashboardData(teamId, callback) {
    nfXhr("/api/rpc/command/get-profile", function (err, profile) {
      if (err || !profile) { callback(null, { projects: [] }); return; }
      var tid = teamId || profile["default-team-id"] || profile["defaultTeamId"] || "";
      if (!tid) { callback(null, { projects: [] }); return; }
      nfXhr("/api/rpc/command/get-all-projects?team_id=" + encodeURIComponent(tid), function (err2, data) {
        if (err2 || !data) { callback(null, { projects: [] }); return; }
        var projects = Array.isArray(data) ? data : (data.projects || []);
        callback(null, { projects: projects });
      });
    });
  }

  var TEMPLATE_CARDS = [
    { title: "Продуктовый дизайн", meta: "UI Kit · Стартовый шаблон", tag: "шаблон" },
    { title: "Маркетинговые материалы", meta: "Баннеры · Презентации", tag: "шаблон" },
    { title: "Веб-компоненты", meta: "Компонент-библиотека · Дизайн-система", tag: "шаблон" },
    { title: "Мобильное приложение", meta: "iOS · Android · Адаптив", tag: "шаблон" }
  ];

  function buildFileCardHtml(project) {
    var title = escapeHtml(project.name || "Проект");
    var fileCount = project["files-count"] || project.filesCount || 0;
    var meta = fileCount
      ? (fileCount + " " + (fileCount === 1 ? "файл" : fileCount < 5 ? "файла" : "файлов"))
      : "Нет файлов";
    var date = "";
    try {
      var raw = project["modified-at"] || project.modifiedAt;
      if (raw) date = new Date(raw).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
    } catch (e) {}
    var teamId = getCurrentTeamId() || "";
    var href = escapeHtml(teamId ? "#/dashboard/team/" + teamId + "/projects" : ROUTES.dashboard);
    return [
      '<button type="button" class="nf-project-card" data-nofida-route="' + href + '">',
      '  <div class="nf-project-thumb">',
      '    <div class="nf-project-thumb-placeholder">',
      '      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2.5 6.5A1.5 1.5 0 0 1 4 5h3.3a2 2 0 0 1 1.4.57l1.1 1.1a1 1 0 0 0 .7.29H16A1.5 1.5 0 0 1 17.5 8.5v6A2.5 2.5 0 0 1 15 17H5A2.5 2.5 0 0 1 2.5 14.5z"/></svg>',
      '    </div>',
      '  </div>',
      '  <div class="nf-project-body">',
      '    <h3 class="nf-project-title">' + title + '</h3>',
      '    <div class="nf-project-meta"><span>' + escapeHtml(meta) + '</span>' + (date ? '<span>' + escapeHtml(date) + '</span>' : '') + '</div>',
      '  </div>',
      '</button>'
    ].join("");
  }

  function buildTemplateCardHtml(tpl) {
    return [
      '<button type="button" class="nf-project-card nf-template-card" data-nofida-route="' + escapeHtml(ROUTES.libraries) + '">',
      '  <div class="nf-project-thumb">',
      '    <div class="nf-project-thumb-placeholder">',
      '      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9.25 3h1.5v6.25H17v1.5h-6.25V17h-1.5v-6.25H3v-1.5h6.25z"/></svg>',
      '    </div>',
      '  </div>',
      '  <div class="nf-project-body">',
      '    <h3 class="nf-project-title">' + escapeHtml(tpl.title) + '</h3>',
      '    <div class="nf-project-meta"><span>' + escapeHtml(tpl.meta) + '</span><span class="nf-chip nf-chip-green">' + escapeHtml(tpl.tag) + '</span></div>',
      '  </div>',
      '</button>'
    ].join("");
  }

  function buildDashboardContextPanelHtml() {
    return [
      '<aside id="nf-dashboard-context-panel" class="nf-context-panel">',
      '  <section class="nf-panel">',
      '    <div class="nf-panel-header"><h2 class="nf-panel-title">Последняя активность</h2><button type="button" class="nf-panel-link" data-nofida-route="' + escapeHtml(getProjectsRoute(getCurrentHash())) + '">Открыть</button></div>',
      '    <div class="nf-list">',
      '      <div class="nf-list-item"><div class="nf-list-icon">' + getIconMarkup("workspace", "nf-list-icon-svg") + '</div><div><p class="nf-list-title">Создайте первый проект</p><p class="nf-list-meta">Активность появится после сохранения файлов команды.</p></div></div>',
      '      <div class="nf-list-item"><div class="nf-list-icon">' + getIconMarkup("library", "nf-list-icon-svg") + '</div><div><p class="nf-list-title">Подготовьте библиотеку</p><p class="nf-list-meta">Добавьте стартовые ресурсы в рабочее пространство.</p></div></div>',
      '    </div>',
      '  </section>',
      '  <section class="nf-panel">',
      '    <div class="nf-panel-header"><h2 class="nf-panel-title">AI-подсказки</h2><button type="button" class="nf-panel-link" data-nofida-route="' + escapeHtml(ROUTES.aiSettings) + '">Настроить</button></div>',
      '    <div class="nf-list">',
      '      <button type="button" class="nf-suggestion-card" data-nofida-route="' + escapeHtml(ROUTES.aiSettings) + '"><span class="nf-list-icon">' + getIconMarkup("ai", "nf-list-icon-svg") + '</span><span><strong>Собрать рабочий бриф</strong><small>Запустите AI Assistant для структуры проекта и задач команды.</small></span></button>',
      '      <button type="button" class="nf-suggestion-card" data-nofida-route="' + escapeHtml(ROUTES.fontCatalog) + '"><span class="nf-list-icon">' + getIconMarkup("type", "nf-list-icon-svg") + '</span><span><strong>Подобрать типографику</strong><small>Откройте каталог шрифтов и соберите продуктовую пару.</small></span></button>',
      '      <button type="button" class="nf-suggestion-card" data-nofida-route="' + escapeHtml(ROUTES.media) + '"><span class="nf-list-icon">' + getIconMarkup("media", "nf-list-icon-svg") + '</span><span><strong>Проверить визуальные ресурсы</strong><small>Сверьте иконки, фоны и empty states перед релизом.</small></span></button>',
      '    </div>',
      '  </section>',
      '  <section class="nf-panel">',
      '    <div class="nf-panel-header"><h2 class="nf-panel-title">Закрепленные ресурсы</h2><button type="button" class="nf-panel-link" data-nofida-route="' + escapeHtml(ROUTES.libraries) + '">Все ресурсы</button></div>',
      '    <div class="nf-pinned-list">',
      '      <button type="button" class="nf-pinned-item" data-nofida-route="' + escapeHtml(ROUTES.libraries) + '">' + getIconMarkup("library", "nf-pinned-icon") + '<span><strong>Библиотеки</strong><small>Компоненты, UI kits и шаблоны.</small></span></button>',
      '      <button type="button" class="nf-pinned-item" data-nofida-route="' + escapeHtml(getNativeFontsRoute(getCurrentHash())) + '">' + getIconMarkup("type", "nf-pinned-icon") + '<span><strong>Шрифты команды</strong><small>Нативная загрузка и рекомендации NOFIDA.</small></span></button>',
      '      <button type="button" class="nf-pinned-item" data-nofida-route="' + escapeHtml(ROUTES.media) + '">' + getIconMarkup("media", "nf-pinned-icon") + '<span><strong>Медиабанк</strong><small>Локальные ассеты и паттерны.</small></span></button>',
      '    </div>',
      '  </section>',
      '</aside>'
    ].join("");
  }

  function buildNofidaDashboardHtml(projects) {
    var cards = projects.map(buildFileCardHtml);
    var needed = Math.max(0, 4 - cards.length);
    for (var t = 0; t < Math.min(needed, TEMPLATE_CARDS.length); t++) {
      cards.push(buildTemplateCardHtml(TEMPLATE_CARDS[t]));
    }
    return [
      '<div id="nf-dashboard-layout-wrapper" class="nf-dashboard-layout">',
      '  <div class="nf-dashboard-main">',
      '    <div class="nf-tabs">',
      '      <button type="button" class="nf-tab is-active">Все проекты</button>',
      '      <button type="button" class="nf-tab" disabled>В работе</button>',
      '      <button type="button" class="nf-tab" disabled>На проверке</button>',
      '      <button type="button" class="nf-tab" disabled>Завершённые</button>',
      '      <button type="button" class="nf-tab" disabled>Архив</button>',
      '    </div>',
      '    <div id="nf-project-grid" class="nf-project-grid">',
      cards.join(""),
      '    </div>',
      buildDashboardResourceStripMarkup(),
      '  </div>',
      buildDashboardContextPanelHtml(),
      '</div>'
    ].join("");
  }

  // ─── End 022B additions ───────────────────────────────────────────────────

  function cleanupNativeDashboardEnhancements() {
    Array.prototype.forEach.call(document.querySelectorAll("#nf-dashboard-context-panel, #nf-dashboard-resource-strip"), function (node) {
      if (node && node.parentNode) node.parentNode.removeChild(node);
    });
  }

  function enhanceNativeDashboard(route) {
    if (!isDashboardRoute(route) || isNofidaResourceRoute(route) || isNativeFontsHash(route) || looksLikeNativeFontsSurface()) return;

    var content = findNativeDashboardContent();
    if (!content) return;

    var header = content.querySelector(".main_ui_dashboard_projects__dashboard-header");
    var projects = content.querySelector(".main_ui_dashboard_projects__projects-container");
    if (!header || !projects) return;

    content.classList.add("nf-dashboard-native-root");

    var titleNode = header.querySelector("h1");
    if (titleNode && !header.querySelector(".nf-native-page-subtitle")) {
      var subtitle = document.createElement("p");
      subtitle.className = "nf-native-page-subtitle";
      subtitle.textContent = "Создавайте, собирайте и передавайте проектные материалы в одном рабочем пространстве.";
      titleNode.insertAdjacentElement("afterend", subtitle);
    }

    var headerActions = header.querySelector(".nf-dashboard-page-actions");
    var nativeNewProject = header.querySelector("[data-testid='new-project-button']");
    if (!headerActions) {
      headerActions = document.createElement("div");
      headerActions.className = "nf-dashboard-page-actions nf-page-actions";
      header.appendChild(headerActions);
    }

    if (!headerActions.querySelector("[data-nofida-action='focus-search']")) {
      var filterButton = document.createElement("button");
      filterButton.type = "button";
      filterButton.className = "nf-btn nf-btn-secondary";
      filterButton.setAttribute("data-nofida-action", "focus-search");
      filterButton.textContent = "Фильтры";
      headerActions.appendChild(filterButton);
    }

    if (nativeNewProject && nativeNewProject.parentNode !== headerActions) {
      headerActions.appendChild(nativeNewProject);
    }
    if (nativeNewProject) {
      nativeNewProject.classList.add("nf-btn", "nf-btn-primary");
      nativeNewProject.textContent = "+ Новый проект";
    }

    var context = content.querySelector("#nf-dashboard-context-panel");
    if (!context) {
      context = document.createElement("aside");
      context.id = "nf-dashboard-context-panel";
      content.appendChild(context);
    }
    context.outerHTML = buildDashboardContextMarkup(content);

    var resourceStrip = content.querySelector("#nf-dashboard-resource-strip");
    if (!resourceStrip) {
      resourceStrip = document.createElement("section");
      resourceStrip.id = "nf-dashboard-resource-strip";
      content.appendChild(resourceStrip);
    }
    resourceStrip.outerHTML = buildDashboardResourceStripMarkup();

    var legacySection = content.querySelector(".main_ui_dashboard_templates__dashboard-templates-section");
    if (legacySection) legacySection.setAttribute("hidden", "hidden");
  }

  function focusTopbarSearch() {
    var input = document.querySelector("#" + TOPBAR_ID + " input[type='search']");
    if (!input) return false;
    input.focus();
    if (typeof input.select === "function") input.select();
    return true;
  }

  function triggerNativeNewProject() {
    var button = pickVisibleNode([
      "[data-testid='new-project-button']",
      ".main_ui_dashboard_projects__btn-secondary"
    ]);
    if (!button) return false;
    button.click();
    return true;
  }

  function handleShellAction(action) {
    switch (action) {
      case "new-project":
        if (!triggerNativeNewProject()) goToNofidaRoute(getProjectsRoute(getCurrentHash()), { source: "shell-new-project" });
        return true;
      case "focus-search":
        focusTopbarSearch();
        return true;
      default:
        return false;
    }
  }

  function scheduleDashboardRefresh() {
    while (refreshTimers.length) {
      window.clearTimeout(refreshTimers.pop());
    }
    [0, 400, 1200].forEach(function (delay) {
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
      cleanupNativeDashboardEnhancements();
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

      var actionTrigger = target.closest("[data-nofida-action]");
      if (actionTrigger) {
        var action = actionTrigger.getAttribute("data-nofida-action");
        if (action && handleShellAction(action)) {
          event.preventDefault();
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
