(function () {
  "use strict";

  if (window.NofidaEditorSidebar) return;

  var ASSET_TAG = "__NOFIDA_ASSET_TAG__";
  var ASSET_QUERY = ASSET_TAG ? "?v=" + ASSET_TAG : "";
  var STORAGE_KEY = "nofida.editorSidebarState";
  var SIDEBAR_ID = "nf-editor-sidebar";
  var RESTORE_BTN_ID = "nf-editor-sidebar-restore";

  var VALID_STATES = ["expanded", "collapsed", "hidden"];
  var DEFAULT_STATE = "collapsed";
  var ALL_BODY_CLASSES = [
    "nf-editor-sidebar-expanded",
    "nf-editor-sidebar-collapsed",
    "nf-editor-sidebar-hidden"
  ];

  var currentState = null;
  var isEditorActive = false;
  var resizeTimers = [];

  /* ------------------------------------------------------------------ icons */

  var ICON_BACK =
    '<svg width="14" height="14" viewBox="0 0 14 14" fill="none">' +
    '<path d="M9 2L4 7l5 5" stroke="currentColor" stroke-width="1.5"' +
    ' stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var ICON_LIBRARIES =
    '<svg width="14" height="14" viewBox="0 0 14 14" fill="none">' +
    '<rect x="1" y="1" width="12" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>' +
    '<path d="M4 12h6M7 10v2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';

  var ICON_FONTS =
    '<svg width="14" height="14" viewBox="0 0 14 14" fill="none">' +
    '<path d="M2 12L7 2L12 12" stroke="currentColor" stroke-width="1.3"' +
    ' stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M4.5 9h5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';

  var ICON_MEDIA =
    '<svg width="14" height="14" viewBox="0 0 14 14" fill="none">' +
    '<rect x="1" y="2.5" width="12" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>' +
    '<circle cx="4.5" cy="5.5" r="1" fill="currentColor"/>' +
    '<path d="M1 9l3-2.5 3 2.5 2-2 5 5" stroke="currentColor" stroke-width="1.3"' +
    ' stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var ICON_FIGMA =
    '<svg width="14" height="14" viewBox="0 0 14 14" fill="none">' +
    '<circle cx="8.5" cy="7" r="2.5" stroke="currentColor" stroke-width="1.3"/>' +
    '<path d="M6 6H3.5A2 2 0 1 1 6 2V6Z" stroke="currentColor" stroke-width="1.3"' +
    ' stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M6 2H8.5A2 2 0 0 1 6 6" stroke="currentColor" stroke-width="1.3"' +
    ' stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M6 6v2M3.5 8A2 2 0 1 0 6 8" stroke="currentColor" stroke-width="1.3"' +
    ' stroke-linecap="round"/></svg>';

  var ICON_HELP =
    '<svg width="14" height="14" viewBox="0 0 14 14" fill="none">' +
    '<circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.3"/>' +
    '<path d="M7 8.5V8c1.5 0 2-1 2-2s-1-1.5-2-1.5S5 6 5 6.5"' +
    ' stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>' +
    '<circle cx="7" cy="10.5" r=".7" fill="currentColor"/></svg>';

  var ICON_COLLAPSE =
    '<svg width="14" height="14" viewBox="0 0 14 14" fill="none">' +
    '<path d="M8.5 3L4 7l4.5 4" stroke="currentColor" stroke-width="1.5"' +
    ' stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var ICON_EXPAND =
    '<svg width="14" height="14" viewBox="0 0 14 14" fill="none">' +
    '<path d="M5.5 3L10 7l-4.5 4" stroke="currentColor" stroke-width="1.5"' +
    ' stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var ICON_MENU =
    '<svg width="14" height="14" viewBox="0 0 14 14" fill="none">' +
    '<path d="M1.5 3.5h11M1.5 7h11M1.5 10.5h11" stroke="currentColor"' +
    ' stroke-width="1.4" stroke-linecap="round"/></svg>';

  /* ---------------------------------------------------------------- nav def */

  var NAV_ITEMS = [
    { id: "back",      label: "Проекты",        icon: ICON_BACK,      isBack: true },
    { id: "libraries", label: "Библиотеки",     icon: ICON_LIBRARIES, route: "#/nofida/libraries" },
    { id: "fonts",     label: "Шрифты",         icon: ICON_FONTS,     route: "#/nofida/fonts" },
    { id: "media",     label: "Медиа",          icon: ICON_MEDIA,     route: "#/nofida/media" },
    { id: "figma",     label: "Импорт из Figma", icon: ICON_FIGMA,    route: "#/nofida/import/figma" },
    { id: "help",      label: "Справка",        icon: ICON_HELP,      route: "#/nofida/help" }
  ];

  /* ----------------------------------------------------------------- utils */

  function readState() {
    try {
      var val = localStorage.getItem(STORAGE_KEY);
      if (val && VALID_STATES.indexOf(val) >= 0) return val;
    } catch (_e) { /* noop */ }
    return DEFAULT_STATE;
  }

  function writeState(s) {
    try { localStorage.setItem(STORAGE_KEY, s); } catch (_e) { /* noop */ }
  }

  function esc(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function isEditorRoute(hash) {
    return /^#\/(workspace|viewer|inspect)(?:$|[/?])/.test(hash || window.location.hash || "");
  }

  function getProjectsRoute() {
    var nav = window.NofidaNavigation;
    if (nav && typeof nav.getProjectsHash === "function") {
      return nav.getProjectsHash() || "#/dashboard";
    }
    return "#/dashboard";
  }

  /* --------------------------------------------------------- viewport flush */

  function scheduleEditorViewportRefresh() {
    var i = resizeTimers.length;
    while (i--) {
      var t = resizeTimers[i];
      if (typeof t === "number") clearTimeout(t);
    }
    resizeTimers = [];

    window.dispatchEvent(new Event("resize"));

    requestAnimationFrame(function () {
      window.dispatchEvent(new Event("resize"));
    });

    resizeTimers.push(setTimeout(function () {
      window.dispatchEvent(new Event("resize"));
    }, 220));
  }

  /* ------------------------------------------------------- body class sync */

  function applyBodyClass(state) {
    for (var i = 0; i < ALL_BODY_CLASSES.length; i++) {
      document.body.classList.remove(ALL_BODY_CLASSES[i]);
    }
    if (state) {
      document.body.classList.add("nf-editor-sidebar-" + state);
    }
  }

  function clearBodyClasses() {
    for (var i = 0; i < ALL_BODY_CLASSES.length; i++) {
      document.body.classList.remove(ALL_BODY_CLASSES[i]);
    }
  }

  /* ------------------------------------------------------- DOM construction */

  function buildSidebarInner(projectsRoute) {
    var nav = NAV_ITEMS.map(function (item) {
      var route = item.isBack ? esc(projectsRoute) : esc(item.route || "");
      return [
        '<button type="button" class="nf-esb-nav-item"',
        route ? ' data-nf-esb-route="' + route + '"' : ' disabled',
        ' title="' + esc(item.label) + '">',
        '<span class="nf-esb-icon" aria-hidden="true">' + item.icon + "</span>",
        '<span class="nf-esb-label">' + esc(item.label) + "</span>",
        "</button>"
      ].join("");
    }).join("");

    return [
      '<div class="nf-esb-header">',
      '  <img class="nf-esb-logo" src="/nofida/brand/icon.png' + esc(ASSET_QUERY) + '" alt="NOFIDA" aria-hidden="true">',
      '  <span class="nf-esb-wordmark">NOFIDA</span>',
      '  <button type="button" class="nf-esb-toggle" id="nf-esb-toggle"',
      '    title="Свернуть" data-nf-esb-action="toggle">',
      '    <span class="nf-esb-toggle-icon" aria-hidden="true">' + ICON_COLLAPSE + "</span>",
      "  </button>",
      "</div>",
      '<nav class="nf-esb-nav" aria-label="NOFIDA">',
      nav,
      "</nav>",
      '<div class="nf-esb-footer">',
      '  <button type="button" class="nf-esb-hide-btn" data-nf-esb-action="hide"',
      '    title="Скрыть меню">',
      '    <span class="nf-esb-icon" aria-hidden="true">' + ICON_COLLAPSE + "</span>",
      '    <span class="nf-esb-label">Скрыть меню</span>',
      "  </button>",
      "</div>"
    ].join("");
  }

  function createSidebar(state) {
    if (document.getElementById(SIDEBAR_ID)) return;

    var sidebar = document.createElement("div");
    sidebar.id = SIDEBAR_ID;
    sidebar.className = "nf-editor-sidebar";
    sidebar.setAttribute("data-state", state);
    sidebar.setAttribute("role", "navigation");
    sidebar.setAttribute("aria-label", "NOFIDA sidebar");
    sidebar.innerHTML = buildSidebarInner(getProjectsRoute());
    document.body.appendChild(sidebar);

    var restoreBtn = document.createElement("button");
    restoreBtn.id = RESTORE_BTN_ID;
    restoreBtn.type = "button";
    restoreBtn.className = "nf-editor-sidebar-restore";
    restoreBtn.title = "Показать меню";
    restoreBtn.setAttribute("aria-label", "Показать меню");
    restoreBtn.innerHTML = ICON_MENU;
    restoreBtn.style.display = state === "hidden" ? "flex" : "none";
    document.body.appendChild(restoreBtn);

    sidebar.addEventListener("click", handleSidebarClick);
    restoreBtn.addEventListener("click", function (e) {
      e.preventDefault();
      setSidebarState("collapsed");
    });
  }

  function handleSidebarClick(e) {
    var target = e.target;
    if (!(target instanceof Element)) return;

    var btn = target.closest("[data-nf-esb-action]");
    if (btn) {
      var action = btn.getAttribute("data-nf-esb-action");
      e.preventDefault();
      if (action === "toggle") {
        setSidebarState(currentState === "expanded" ? "collapsed" : "expanded");
      } else if (action === "hide") {
        setSidebarState("hidden");
      }
      return;
    }

    var navBtn = target.closest("[data-nf-esb-route]");
    if (navBtn) {
      var route = navBtn.getAttribute("data-nf-esb-route");
      if (route) {
        e.preventDefault();
        window.location.hash = route;
      }
    }
  }

  /* ----------------------------------------------------- state transitions */

  function setSidebarState(newState) {
    if (VALID_STATES.indexOf(newState) < 0) newState = DEFAULT_STATE;
    currentState = newState;
    writeState(newState);

    var sidebar = document.getElementById(SIDEBAR_ID);
    if (sidebar) {
      sidebar.setAttribute("data-state", newState);
      sidebar.setAttribute("aria-hidden", newState === "hidden" ? "true" : "false");

      var toggleBtn = document.getElementById("nf-esb-toggle");
      if (toggleBtn) {
        var toggleIcon = toggleBtn.querySelector(".nf-esb-toggle-icon");
        if (newState === "expanded") {
          toggleBtn.title = "Свернуть";
          if (toggleIcon) toggleIcon.innerHTML = ICON_COLLAPSE;
        } else {
          toggleBtn.title = "Развернуть меню";
          if (toggleIcon) toggleIcon.innerHTML = ICON_EXPAND;
        }
      }
    }

    var restoreBtn = document.getElementById(RESTORE_BTN_ID);
    if (restoreBtn) {
      restoreBtn.style.display = newState === "hidden" ? "flex" : "none";
    }

    applyBodyClass(newState);

    setTimeout(function () {
      scheduleEditorViewportRefresh();
    }, 190);
  }

  /* -------------------------------------------------- lifecycle management */

  function destroySidebar() {
    clearBodyClasses();
    var sidebar = document.getElementById(SIDEBAR_ID);
    if (sidebar && sidebar.parentNode) {
      sidebar.removeEventListener("click", handleSidebarClick);
      sidebar.parentNode.removeChild(sidebar);
    }
    var restoreBtn = document.getElementById(RESTORE_BTN_ID);
    if (restoreBtn && restoreBtn.parentNode) restoreBtn.parentNode.removeChild(restoreBtn);
    isEditorActive = false;
    currentState = null;
  }

  function onRouteChange(hash) {
    var onEditor = isEditorRoute(hash);

    if (onEditor && !isEditorActive) {
      isEditorActive = true;
      currentState = readState();
      createSidebar(currentState);
      setSidebarState(currentState);
    } else if (!onEditor && isEditorActive) {
      destroySidebar();
    }
  }

  /* ------------------------------------------------------------------ init */

  function init() {
    onRouteChange(window.location.hash || "");

    window.addEventListener("hashchange", function () {
      onRouteChange(window.location.hash || "");
    });
  }

  window.NofidaEditorSidebar = {
    getState: function () { return currentState; },
    setState: function (s) { if (isEditorActive) setSidebarState(s); }
  };

  if (document.readyState === "complete") {
    requestAnimationFrame(init);
  } else {
    window.addEventListener("load", function () {
      requestAnimationFrame(init);
    }, { once: true });
  }

})();
