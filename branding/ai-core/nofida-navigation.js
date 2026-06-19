(function () {
  "use strict";

  if (window.NofidaNavigation) return;

  var STORAGE_KEY = "nofida-navigation-v019a";
  var DASHBOARD_GROUP_ID = "nofida-nav-dashboard-group";
  var STYLE_ID = "nofida-navigation-style";
  var observer = null;
  var observerRoot = null;
  var observerTimer = null;
  var clickBound = false;

  var ROUTES = {
    dashboard: "#/dashboard",
    settings: "#/settings/options",
    libraries: "#/nofida/libraries",
    fonts: "#/nofida/fonts",
    media: "#/nofida/media",
    figma: "#/nofida/import/figma",
    help: "#/nofida/help",
    learn: "#/nofida/learn"
  };

  var SETTINGS_TAB_LABELS = {
    api: "API Configuration",
    models: "Model Library",
    accounts: "External Accounts",
    engine: "Engine",
    prompts: "Prompts"
  };

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
    var rootIndex = value.indexOf("#/");
    if (rootIndex >= 0) value = value.slice(rootIndex);
    if (value.charAt(0) !== "#") {
      value = value.charAt(0) === "/" ? "#" + value : "#/" + value.replace(/^#?\/?/, "");
    }
    return value.replace(/^##+/, "#");
  }

  function getHashPath(hash) {
    var value = normalizeHash(hash || window.location.hash || ROUTES.dashboard);
    var queryIndex = value.indexOf("?");
    return queryIndex >= 0 ? value.slice(0, queryIndex) : value;
  }

  function getHashParams(hash) {
    var value = normalizeHash(hash || window.location.hash || ROUTES.dashboard);
    var queryIndex = value.indexOf("?");
    return new URLSearchParams(queryIndex >= 0 ? value.slice(queryIndex + 1) : "");
  }

  function isDashboardRoute(hash) {
    return /^#\/dashboard(?:$|[/?])/.test(normalizeHash(hash));
  }

  function isNativeFontsHash(hash) {
    return /^#\/dashboard(?:\/team\/[0-9a-f-]{36})?\/fonts(?:$|[/?])/.test(getHashPath(hash)) ||
      /^#\/dashboard\/fonts(?:$|\?)/.test(normalizeHash(hash));
  }

  function looksLikeNativeFontsSurface() {
    return !!document.querySelector("#dashboard-fonts-title, .main_ui_dashboard_fonts__dashboard-container.main_ui_dashboard_fonts__dashboard-fonts");
  }

  function isAccountSurface(hash) {
    return /^#\/settings\/options(?:$|\?)/.test(normalizeHash(hash));
  }

  function isEditorSurface(hash) {
    return /^#\/(workspace|viewer|inspect)(?:$|[/?])/.test(normalizeHash(hash));
  }

  function isResourceRoute(hash) {
    return /^#\/nofida(?:$|[/?])/.test(getHashPath(hash));
  }

  function isDashboardSurface(hash) {
    return isDashboardRoute(hash) || isResourceRoute(hash);
  }

  function getCurrentSurface(hash) {
    if (isAccountSurface(hash)) return "account";
    if (isEditorSurface(hash)) return "editor";
    if (isDashboardSurface(hash)) return "dashboard";
    return "other";
  }

  function rememberHash(hash) {
    var current = normalizeHash(hash || window.location.hash || ROUTES.dashboard);
    if (state.currentHash && state.currentHash !== current) {
      state.previousHash = state.currentHash;
    }
    state.currentHash = current;

    var teamId = getTeamId(current);
    if (teamId) state.lastTeamId = teamId;

    if (isDashboardRoute(current) && !isResourceRoute(current)) {
      state.lastDashboardHash = current;
    }
    if (isAccountSurface(current)) state.lastAccountHash = current;
    if (isEditorSurface(current)) state.lastEditorHash = current;

    saveState();
  }

  function getTeamId(hash) {
    var current = normalizeHash(hash || window.location.hash || ROUTES.dashboard);
    var match = current.match(/#\/dashboard\/team\/([0-9a-f-]{36})/i);
    if (match) return match[1];

    var params = getHashParams(current);
    var fromQuery = params.get("team-id");
    if (fromQuery && /^[0-9a-f-]{36}$/i.test(fromQuery)) return fromQuery;

    var links = document.querySelectorAll("a[href]");
    for (var index = 0; index < links.length; index += 1) {
      var href = links[index].getAttribute("href") || "";
      var linkMatch = href.match(/dashboard\/team\/([0-9a-f-]{36})/i);
      if (linkMatch) return linkMatch[1];
    }

    return state.lastTeamId || "";
  }

  function getProjectsHash(hash) {
    var teamId = getTeamId(hash);
    return teamId ? "#/dashboard/team/" + teamId + "/projects" : ROUTES.dashboard;
  }

  function getNativeFontsHash(hash) {
    var teamId = getTeamId(hash);
    return teamId ? "#/dashboard/fonts?team-id=" + teamId : getProjectsHash(hash);
  }

  function getRouteMeta(hash) {
    var current = normalizeHash(hash || window.location.hash || ROUTES.dashboard);
    var path = getHashPath(current);

    if (isNativeFontsHash(current) || (isDashboardRoute(current) && looksLikeNativeFontsSurface())) {
      return {
        menuId: "fonts",
        label: "Шрифты",
        breadcrumb: ["Панель", "Ресурсы", "Шрифты"]
      };
    }

    if (isDashboardRoute(path)) {
      return {
        menuId: "projects",
        label: "Проекты",
        breadcrumb: ["Панель", "Проекты"]
      };
    }

    if (path === ROUTES.libraries) {
      return {
        menuId: "libraries",
        label: "Библиотеки",
        breadcrumb: ["Панель", "Ресурсы", "Библиотеки"]
      };
    }
    if (path === ROUTES.fonts) {
      return {
        menuId: "fonts",
        label: "Шрифты",
        breadcrumb: ["Панель", "Ресурсы", "Шрифты"]
      };
    }
    if (path === ROUTES.media) {
      return {
        menuId: "media",
        label: "Медиа",
        breadcrumb: ["Панель", "Ресурсы", "Медиа"]
      };
    }
    if (path === ROUTES.figma) {
      return {
        menuId: "figma",
        label: "Импорт из Figma",
        breadcrumb: ["Панель", "Импорт", "Figma"]
      };
    }
    if (path === ROUTES.help) {
      return {
        menuId: "help",
        label: "Справка",
        breadcrumb: ["Панель", "Справка", "Центр справки"]
      };
    }
    if (path === ROUTES.learn) {
      return {
        menuId: "learn",
        label: "Обучение",
        breadcrumb: ["Панель", "Обучение", "Учебный центр"]
      };
    }
    if (path === "#/nofida/repository") {
      return {
        menuId: "help",
        label: "Репозиторий",
        breadcrumb: ["Панель", "Справка", "Репозиторий"]
      };
    }
    if (path === "#/nofida/community") {
      return {
        menuId: "help",
        label: "Сообщество",
        breadcrumb: ["Панель", "Справка", "Сообщество"]
      };
    }
    if (path === "#/nofida/releases") {
      return {
        menuId: "help",
        label: "Обновления",
        breadcrumb: ["Панель", "Справка", "Обновления"]
      };
    }
    if (path === "#/nofida/changelog") {
      return {
        menuId: "help",
        label: "История изменений",
        breadcrumb: ["Панель", "Справка", "История изменений"]
      };
    }
    if (path === "#/nofida/terms") {
      return {
        menuId: "help",
        label: "Условия",
        breadcrumb: ["Панель", "Справка", "Условия"]
      };
    }
    if (path === "#/nofida/privacy") {
      return {
        menuId: "help",
        label: "Конфиденциальность",
        breadcrumb: ["Панель", "Справка", "Конфиденциальность"]
      };
    }
    if (path === "#/nofida/open-source-notices") {
      return {
        menuId: "help",
        label: "Лицензии",
        breadcrumb: ["Панель", "Справка", "Лицензии"]
      };
    }

    if (isAccountSurface(current)) {
      var params = getHashParams(current);
      if (params.get("nofida") === "ai") {
        var tab = params.get("tab") || "api";
        return {
          menuId: "account-ai",
          label: "NOFIDA AI",
          breadcrumb: ["Аккаунт", "NOFIDA AI", SETTINGS_TAB_LABELS[tab] || "API Configuration"]
        };
      }
      return {
        menuId: "account",
        label: "Аккаунт",
        breadcrumb: ["Аккаунт", "Настройки"]
      };
    }

    if (isEditorSurface(current)) {
      return {
        menuId: "editor",
        label: "Редактор",
        breadcrumb: ["Редактор", "Файл"]
      };
    }

    return {
      menuId: "",
      label: "",
      breadcrumb: []
    };
  }

  function getResourceMenuItems(hash) {
    return [
      { id: "projects", label: "Проекты", href: getProjectsHash(hash) },
      { id: "libraries", label: "Библиотеки", href: ROUTES.libraries },
      { id: "fonts", label: "Шрифты", href: getNativeFontsHash(hash) },
      { id: "media", label: "Медиа", href: ROUTES.media },
      { id: "figma", label: "Импорт из Figma", href: ROUTES.figma },
      { id: "help", label: "Справка", href: ROUTES.help },
      { id: "learn", label: "Обучение", href: ROUTES.learn }
    ];
  }

  function getActiveResourceMenuId(hash) {
    return getRouteMeta(hash).menuId;
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
    var current = normalizeHash(currentHash || window.location.hash || state.currentHash || ROUTES.dashboard);
    var routeOrigin = getRouteOrigin(current);
    if (isResourceRoute(current) && routeOrigin) return routeOrigin;
    return {
      fromHash: current,
      fromSurface: getCurrentSurface(current),
      source: ""
    };
  }

  function goToNofidaRoute(route, options) {
    var target = normalizeHash(route);
    var opts = options || {};

    if (opts.rememberOrigin !== false && (isResourceRoute(target) || isEditorSurface(target) || isAccountSurface(target))) {
      var origin = opts.origin || getNavigationOrigin(opts.fromHash);
      setRouteOrigin(target, {
        fromHash: normalizeHash(origin.fromHash || window.location.hash || state.currentHash || ROUTES.dashboard),
        fromSurface: origin.fromSurface || getCurrentSurface(origin.fromHash),
        source: opts.source || origin.source || "",
        explicit: opts.explicit !== false,
        ts: Date.now()
      });
    }

    if (opts.replace) {
      history.replaceState(null, "", window.location.pathname + target);
      rememberHash(target);
      window.setTimeout(refreshDashboardGroup, 0);
      return target;
    }

    window.location.hash = target.slice(1);
    return target;
  }

  function getSafeBackTarget(currentHash, previousHash) {
    var current = normalizeHash(currentHash || window.location.hash || state.currentHash || ROUTES.dashboard);
    var previous = normalizeHash(previousHash || state.previousHash || "");
    var currentSurface = getCurrentSurface(current);
    var origin = getRouteOrigin(current);

    if (currentSurface === "account") {
      return ROUTES.settings;
    }

    if (currentSurface === "editor") {
      if (origin && origin.fromSurface === "editor" && origin.fromHash) return normalizeHash(origin.fromHash);
      if (previous && getCurrentSurface(previous) === "editor") return previous;
      return normalizeHash(state.lastEditorHash || "#/workspace");
    }

    if (isResourceRoute(current)) {
      if (origin && origin.fromSurface === "editor" && origin.fromHash) return normalizeHash(origin.fromHash);
      if (origin && origin.fromSurface === "account") return ROUTES.settings;
      if (origin && origin.fromSurface === "dashboard" && origin.fromHash && !isResourceRoute(origin.fromHash)) {
        return normalizeHash(origin.fromHash);
      }
      if (previous && getCurrentSurface(previous) === "dashboard" && !isResourceRoute(previous)) {
        return previous;
      }
      return normalizeHash(state.lastDashboardHash || getProjectsHash(current));
    }

    if (currentSurface === "dashboard") {
      if (previous && getCurrentSurface(previous) === "dashboard") return previous;
      return normalizeHash(state.lastDashboardHash || getProjectsHash(current));
    }

    return ROUTES.dashboard;
  }

  function getBackLabel(currentHash, previousHash) {
    var target = getSafeBackTarget(currentHash, previousHash);
    var surface = getCurrentSurface(target);
    if (surface === "editor") return "Назад в редактор";
    if (surface === "account") return "Назад к настройкам";
    return "Назад к проектам";
  }

  function getBackTargetInfo(currentHash, previousHash) {
    var hash = getSafeBackTarget(currentHash, previousHash);
    return {
      hash: hash,
      label: getBackLabel(currentHash, previousHash),
      surface: getCurrentSurface(hash)
    };
  }

  function goBack(currentHash, options) {
    var target = getSafeBackTarget(currentHash);
    return goToNofidaRoute(target, Object.assign({}, options || {}, {
      rememberOrigin: false
    }));
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      "#nofida-nav-dashboard-group{display:flex;flex-direction:column;gap:6px;padding:8px 6px 0;box-sizing:border-box;list-style:none}",
      "#nofida-nav-dashboard-group .nofida-nav-group-label{padding:0 6px;color:#93a8c7;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}",
      "#nofida-nav-dashboard-group .nofida-nav-link{display:flex;align-items:center;min-height:32px;padding:7px 10px;border-radius:10px;border:1px solid transparent;color:#bfd3eb;text-decoration:none;font-size:12px;font-weight:700;transition:background .15s ease,border-color .15s ease,color .15s ease;box-sizing:border-box}",
      "#nofida-nav-dashboard-group .nofida-nav-link:hover{background:rgba(37,99,235,.12);border-color:rgba(37,99,235,.24);color:#fff}",
      "#nofida-nav-dashboard-group .nofida-nav-link.active{background:rgba(37,99,235,.16);border-color:rgba(37,99,235,.32);color:#fff}"
    ].join("");
    document.head.appendChild(style);
  }

  function findDashboardSidebarNav() {
    var selectors = [
      ".main_ui_dashboard_sidebar__sidebar-nav",
      "[class*='dashboard_sidebar'][class*='nav']",
      "[class*='dashboard_sidebar'][class*='menu']",
      "[class*='dashboard-sidebar'] nav",
      "[class*='dashboard-sidebar'] ul"
    ];
    for (var index = 0; index < selectors.length; index += 1) {
      var node = document.querySelector(selectors[index]);
      if (node) return node;
    }
    var navEls = document.querySelectorAll("nav, [role='navigation'], aside ul");
    for (var navIndex = 0; navIndex < navEls.length; navIndex += 1) {
      if (/черновики|drafts|проекты|projects/i.test(navEls[navIndex].textContent || "")) return navEls[navIndex];
    }
    return document.querySelector("[class*='dashboard_sidebar']");
  }

  function buildDashboardGroup(nav) {
    var existing = document.getElementById(DASHBOARD_GROUP_ID);
    if (existing && existing.parentNode !== nav) existing.parentNode.removeChild(existing);
    if (existing && existing.parentNode === nav) return existing;

    var group = document.createElement(nav && nav.tagName === "UL" ? "li" : "div");
    group.id = DASHBOARD_GROUP_ID;
    nav.appendChild(group);
    return group;
  }

  function renderDashboardGroup() {
    if (!isDashboardSurface(window.location.hash || state.currentHash || ROUTES.dashboard)) {
      var oldGroup = document.getElementById(DASHBOARD_GROUP_ID);
      if (oldGroup && oldGroup.parentNode) oldGroup.parentNode.removeChild(oldGroup);
      return;
    }

    var nav = findDashboardSidebarNav();
    if (!nav) return;

    ensureStyles();
    var group = buildDashboardGroup(nav);
    var current = normalizeHash(window.location.hash || state.currentHash || ROUTES.dashboard);
    var activeId = getActiveResourceMenuId(current);
    var items = getResourceMenuItems(current);
    var markup = [
      '<div class="nofida-nav-group-label">Ресурсы</div>',
      items.map(function (item) {
        var active = item.id === activeId ? " active" : "";
        return '<a class="nofida-nav-link' + active + '" href="' + item.href + '" data-nofida-route="' + item.href + '" data-nofida-source="dashboard-menu">' +
          item.label + "</a>";
      }).join("")
    ].join("");

    if (group.innerHTML === markup) return;
    group.innerHTML = markup;
  }

  function refreshDashboardGroup() {
    renderDashboardGroup();
  }

  function scheduleDashboardGroupRefresh() {
    if (observerTimer) window.clearTimeout(observerTimer);
    observerTimer = window.setTimeout(function () {
      observerTimer = null;
      refreshDashboardGroup();
    }, 160);
  }

  function stopObserver() {
    if (observerTimer) {
      window.clearTimeout(observerTimer);
      observerTimer = null;
    }
    if (observer) observer.disconnect();
    observer = null;
    observerRoot = null;
  }

  function ensureObserver() {
    if (!isDashboardSurface(window.location.hash || state.currentHash || ROUTES.dashboard) || !window.MutationObserver) {
      stopObserver();
      return;
    }

    var nextRoot = document.getElementById("app") || document.body;
    if (!nextRoot) {
      stopObserver();
      return;
    }
    if (observer && observerRoot === nextRoot) return;

    stopObserver();
    observerRoot = nextRoot;
    observer = new MutationObserver(function (mutations) {
      var relevant = mutations.some(function (mutation) {
        if (!mutation.target || !mutation.target.closest) return false;
        if (mutation.target.closest("#" + DASHBOARD_GROUP_ID)) return false;
        return mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0;
      });
      if (relevant) scheduleDashboardGroupRefresh();
    });
    observer.observe(nextRoot, { childList: true, subtree: true });
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
        goBack(backButton.getAttribute("data-nofida-current") || window.location.hash || ROUTES.dashboard, {
          replace: backButton.getAttribute("data-nofida-replace") === "true"
        });
      }
    });
  }

  function onRouteChange() {
    rememberHash(window.location.hash || ROUTES.dashboard);
    ensureObserver();
    refreshDashboardGroup();
  }

  function init() {
    rememberHash(window.location.hash || ROUTES.dashboard);
    ensureClickHandling();
    ensureObserver();
    refreshDashboardGroup();
    window.addEventListener("hashchange", onRouteChange);
  }

  window.NofidaNavigation = {
    ROUTES: ROUTES,
    normalizeHash: normalizeHash,
    getHashPath: getHashPath,
    getHashParams: getHashParams,
    getProjectsHash: getProjectsHash,
    getNativeFontsHash: getNativeFontsHash,
    isDashboardSurface: isDashboardSurface,
    isAccountSurface: isAccountSurface,
    isEditorSurface: isEditorSurface,
    isResourceRoute: isResourceRoute,
    getCurrentSurface: getCurrentSurface,
    getRouteMeta: getRouteMeta,
    getResourceMenuItems: getResourceMenuItems,
    getActiveResourceMenuId: getActiveResourceMenuId,
    getSafeBackTarget: getSafeBackTarget,
    getBackLabel: getBackLabel,
    getBackTargetInfo: getBackTargetInfo,
    goToNofidaRoute: goToNofidaRoute,
    goBack: goBack,
    rememberHash: rememberHash,
    findDashboardSidebarNav: findDashboardSidebarNav,
    refreshDashboardGroup: refreshDashboardGroup,
    getState: function () {
      return {
        currentHash: state.currentHash || "",
        previousHash: state.previousHash || "",
        lastDashboardHash: state.lastDashboardHash || "",
        lastAccountHash: state.lastAccountHash || "",
        lastEditorHash: state.lastEditorHash || "",
        lastTeamId: state.lastTeamId || ""
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
