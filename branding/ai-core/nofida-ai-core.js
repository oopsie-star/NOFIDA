/* ==========================================================================
 * Nofida shell overlay
 * --------------------------------------------------------------------------
 * Mounted into a static sibling host (`#nofida-shell-root`) that lives
 * outside Penpot's React containers (`#app`, `#modal`). No timers and no
 * MutationObserver are used: route/layout updates are driven by hashchange,
 * resize, and ResizeObserver on the application root.
 * ========================================================================== */
(function () {
  "use strict";

  if (window.NofidaAICore) return;

  var ASSET_TAG = "__NOFIDA_ASSET_TAG__";
  var ASSET_QUERY = ASSET_TAG ? "?v=" + ASSET_TAG : "";
  var BRIDGE_URL = "/nofida/ai-core/ai-bridge.js" + ASSET_QUERY;
  var LIBRARIES_URL = "/nofida/libraries/catalog.json" + ASSET_QUERY;
  var HOST_ID = "nofida-shell-root";
  var DASHBOARD_SELECTOR = ".main_ui_dashboard__dashboard-content";
  var GRID_SELECTOR = ".main_ui_dashboard_grid__dashboard-grid";
  var BRAND = {
    bg: "#0b1020",
    surface: "#131e35",
    surfaceStrong: "#10192f",
    border: "rgba(37, 99, 235, 0.24)",
    primary: "#2563eb",
    primaryHover: "#1d4ed8",
    accent: "#bfff00",
    accentInk: "#0b1020",
    text: "#f8fafc",
    muted: "#94a3b8",
    font: 'Montserrat, Inter, "Segoe UI", system-ui, sans-serif'
  };

  var state = {
    bridge: null,
    catalog: null,
    host: null,
    root: null,
    els: {}
  };

  function onReady(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  function isDashboardRoute() {
    return /^#\/dashboard/.test(window.location.hash || "");
  }

  function isAssistantRoute() {
    return /^#\/dashboard/.test(window.location.hash || "") ||
      /^#\/workspace/.test(window.location.hash || "");
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function ensureHost() {
    var host = document.getElementById(HOST_ID);
    if (!host) {
      host = document.createElement("section");
      host.id = HOST_ID;
      document.body.appendChild(host);
    }
    host.style.position = "absolute";
    host.style.left = "0";
    host.style.top = "0";
    host.style.width = "100%";
    host.style.height = "0";
    host.style.pointerEvents = "none";
    host.style.zIndex = "2147483000";
    return host;
  }

  function loadBridge() {
    return new Promise(function (resolve) {
      if (window.NofidaAIBridge) {
        resolve(window.NofidaAIBridge);
        return;
      }
      var script = document.createElement("script");
      script.src = BRIDGE_URL;
      script.onload = function () { resolve(window.NofidaAIBridge || null); };
      script.onerror = function () { resolve(null); };
      document.head.appendChild(script);
    });
  }

  function renderCatalog(items) {
    return items.map(function (item) {
      var href = item.internal_url || item.hub_url || "#";
      var source = item.internal_url ? "Внутренний ресурс" : "Источник";
      return [
        '<article class="library-item">',
        '  <div class="library-copy">',
        '    <span class="library-status">' + escapeHtml(item.status || "catalog") + "</span>",
        '    <h3>' + escapeHtml(item.name) + "</h3>",
        '    <p>' + escapeHtml((item.type || "library") + " · " + (item.author || "Nofida")) + "</p>",
        "  </div>",
        '  <button class="library-link" type="button" data-href="' + escapeHtml(href) + '">' + source + "</button>",
        "</article>"
      ].join("");
    }).join("");
  }

  function openExternal(href) {
    if (!href || href === "#") return;
    window.open(href, "_blank", "noopener,noreferrer");
  }

  function buildUI() {
    state.host = ensureHost();
    state.root = state.host.attachShadow({ mode: "open" });
    state.root.innerHTML = [
      "<style>",
      ":host{all:initial}",
      "*{box-sizing:border-box;font-family:" + BRAND.font + "}",
      ".layer{pointer-events:none}",
      ".dashboard-shell{position:absolute;left:var(--cards-left,320px);top:var(--cards-top,160px);",
      "  width:min(var(--cards-width,calc(100vw - 352px)),1120px);pointer-events:auto}",
      ".dashboard-shell[hidden]{display:none}",
      ".action-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}",
      ".action-card{display:flex;flex-direction:column;align-items:flex-start;gap:8px;width:100%;",
      "  border:1px solid " + BRAND.border + ";border-radius:18px;padding:18px 20px;text-align:left;",
      "  background:linear-gradient(180deg,rgba(19,30,53,.98),rgba(11,16,32,.98));color:" + BRAND.text + ";",
      "  box-shadow:0 18px 48px rgba(2,6,23,.34);cursor:pointer;transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease}",
      ".action-card:hover{transform:translateY(-2px);border-color:rgba(191,255,0,.45);box-shadow:0 24px 56px rgba(2,6,23,.42)}",
      ".action-kicker{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:" + BRAND.accent + ";font-weight:700}",
      ".action-title{font-size:18px;font-weight:800;line-height:1.15;margin:0}",
      ".action-copy{font-size:13px;line-height:1.45;color:" + BRAND.muted + ";margin:0}",
      ".action-foot{font-size:12px;color:" + BRAND.text + ";opacity:.88}",
      ".fab{position:fixed;right:20px;bottom:20px;width:56px;height:56px;border:0;border-radius:18px;",
      "  cursor:pointer;display:grid;place-items:center;background:" + BRAND.accent + ";color:" + BRAND.accentInk + ";",
      "  box-shadow:0 16px 44px rgba(191,255,0,.28);pointer-events:auto;transition:transform .15s ease}",
      ".fab:hover{transform:translateY(-2px)}",
      ".fab[hidden]{display:none}",
      ".fab svg{width:24px;height:24px}",
      ".panel,.library-drawer{position:fixed;right:0;top:0;height:100vh;width:380px;max-width:92vw;",
      "  transform:translateX(105%);transition:transform .22s cubic-bezier(.16,1,.3,1);",
      "  background:" + BRAND.surfaceStrong + ";color:" + BRAND.text + ";border-left:1px solid " + BRAND.border + ";",
      "  box-shadow:-18px 0 60px rgba(0,0,0,.45);display:flex;flex-direction:column;pointer-events:auto}",
      ".panel.open,.library-drawer.open{transform:translateX(0)}",
      ".panel-head{display:flex;align-items:center;gap:10px;padding:16px 18px;border-bottom:1px solid " + BRAND.border + "}",
      ".panel-head h2{margin:0;font-size:14px;font-weight:800;letter-spacing:.03em}",
      ".panel-head small{margin-left:auto;color:" + BRAND.muted + ";font-size:11px}",
      ".dot{width:8px;height:8px;border-radius:999px;background:" + BRAND.accent + "}",
      ".close{margin-left:8px;background:transparent;border:0;color:" + BRAND.muted + ";cursor:pointer;font-size:20px;line-height:1}",
      ".log{flex:1;overflow:auto;padding:14px 16px;font-size:13px;color:" + BRAND.muted + "}",
      ".msg{margin:0 0 8px;padding:8px 10px;border-radius:10px;background:" + BRAND.bg + ";border:1px solid " + BRAND.border + ";color:" + BRAND.text + "}",
      ".compose{display:flex;gap:8px;padding:12px 14px;border-top:1px solid " + BRAND.border + "}",
      ".compose input{flex:1;min-width:0;background:" + BRAND.bg + ";color:" + BRAND.text + ";border:1px solid " + BRAND.border + ";border-radius:12px;padding:10px 12px;font-size:13px;outline:none}",
      ".compose input:focus{border-color:" + BRAND.primary + "}",
      ".compose button,.library-link{border:0;border-radius:12px;padding:0 14px;font-weight:800;cursor:pointer;background:" + BRAND.primary + ";color:" + BRAND.text + "}",
      ".compose button:hover,.library-link:hover{background:" + BRAND.primaryHover + "}",
      ".library-drawer{padding-bottom:12px}",
      ".library-body{padding:14px 16px 18px;overflow:auto}",
      ".library-note{margin:0 0 14px;color:" + BRAND.muted + ";font-size:13px;line-height:1.45}",
      ".library-list{display:flex;flex-direction:column;gap:12px}",
      ".library-item{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:start;padding:14px;border:1px solid " + BRAND.border + ";border-radius:16px;background:rgba(11,16,32,.92)}",
      ".library-item h3{margin:0 0 6px;font-size:15px;line-height:1.25}",
      ".library-item p{margin:0;color:" + BRAND.muted + ";font-size:12px;line-height:1.4}",
      ".library-status{display:inline-flex;align-items:center;padding:5px 8px;margin-bottom:8px;border-radius:999px;background:rgba(37,99,235,.18);color:#bfdbfe;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}",
      ".library-link{align-self:center;min-height:38px}",
      ".library-empty{padding:16px;border:1px dashed " + BRAND.border + ";border-radius:14px;color:" + BRAND.muted + ";font-size:13px}",
      "@media (max-width: 980px){.dashboard-shell{left:16px !important;width:min(calc(100vw - 32px),1120px)}.action-row{grid-template-columns:1fr}}",
      "</style>",
      '<div class="layer">',
      '  <section class="dashboard-shell" id="dashboard-shell" hidden>',
      '    <div class="action-row">',
      '      <button class="action-card" type="button" data-action="create">',
      '        <span class="action-kicker">Nofida</span>',
      '        <p class="action-title">Создать файл</p>',
      '        <p class="action-copy">Быстрый вход в новый проект без зависимости от React-плейсхолдера.</p>',
      '        <span class="action-foot">Нативный create flow Penpot</span>',
      "      </button>",
      '      <button class="action-card" type="button" data-action="import">',
      '        <span class="action-kicker">Import</span>',
      '        <p class="action-title">Импортировать .penpot</p>',
      '        <p class="action-copy">Загрузка идет напрямую через нативный drop flow рабочего дашборда.</p>',
      '        <span class="action-foot">Готово для локальных файлов</span>',
      "      </button>",
      '      <button class="action-card" type="button" data-action="libraries">',
      '        <span class="action-kicker">Libraries</span>',
      '        <p class="action-title">Каталог Nofida</p>',
      '        <p class="action-copy">Локальный curated catalog из <code>/nofida/libraries/catalog.json</code>.</p>',
      '        <span class="action-foot">Готово для внутреннего хранилища</span>',
      "      </button>",
      "    </div>",
      "  </section>",
      '  <button class="fab" id="fab" type="button" title="Nofida AI" aria-label="Nofida AI">',
      '    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
      '      <path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z"/><path d="M19 14l.8 2 .2.8 2 .8-2 .2-.2.8-.8 2-.8-2-.2-.8-2-.8 2-.2.2-.8z"/>',
      "    </svg>",
      "  </button>",
      '  <aside class="panel" id="assistant-panel" role="dialog" aria-label="Nofida AI assistant">',
      '    <div class="panel-head"><span class="dot"></span><h2>Nofida AI</h2><small id="transport">bridge: ...</small><button class="close" type="button" data-close="assistant">×</button></div>',
      '    <div class="log" id="log"><p class="msg">Опишите экран, компонент или задачу. Shell уже изолирован в Shadow DOM и не зависит от гидратации Penpot.</p></div>',
      '    <form class="compose" id="compose"><input id="prompt" placeholder="Например: onboarding screen with clean tokenized layout" autocomplete="off" /><button type="submit">Send</button></form>',
      "  </aside>",
      '  <aside class="library-drawer" id="library-drawer" role="dialog" aria-label="Nofida libraries">',
      '    <div class="panel-head"><span class="dot"></span><h2>Nofida Libraries</h2><small>local catalog</small><button class="close" type="button" data-close="libraries">×</button></div>',
      '    <div class="library-body">',
      '      <p class="library-note">Каталог читается из локального JSON слоя. Когда vendored-файлы появятся в <code>branding/libraries/files</code>, эта панель уже сможет вести на внутренние URL.</p>',
      '      <div class="library-list" id="library-list"><div class="library-empty">Загрузка каталога…</div></div>',
      "    </div>",
      "  </aside>",
      '  <input id="import-file" type="file" accept=".penpot" multiple hidden />',
      "</div>"
    ].join("");

    state.els.dashboard = state.root.getElementById("dashboard-shell");
    state.els.fab = state.root.getElementById("fab");
    state.els.panel = state.root.getElementById("assistant-panel");
    state.els.transport = state.root.getElementById("transport");
    state.els.log = state.root.getElementById("log");
    state.els.form = state.root.getElementById("compose");
    state.els.input = state.root.getElementById("prompt");
    state.els.drawer = state.root.getElementById("library-drawer");
    state.els.libraryList = state.root.getElementById("library-list");
    state.els.importFile = state.root.getElementById("import-file");
  }

  function appendLog(text) {
    var p = document.createElement("p");
    p.className = "msg";
    p.textContent = text;
    state.els.log.appendChild(p);
    state.els.log.scrollTop = state.els.log.scrollHeight;
  }

  function toggleAssistant(forceOpen) {
    var shouldOpen = typeof forceOpen === "boolean" ? forceOpen :
      !state.els.panel.classList.contains("open");
    state.els.panel.classList.toggle("open", shouldOpen);
  }

  function toggleLibraries(forceOpen) {
    var shouldOpen = typeof forceOpen === "boolean" ? forceOpen :
      !state.els.drawer.classList.contains("open");
    state.els.drawer.classList.toggle("open", shouldOpen);
    if (shouldOpen) loadLibraries();
  }

  function loadLibraries() {
    if (state.catalog) {
      state.els.libraryList.innerHTML = renderCatalog(state.catalog);
      return;
    }
    state.els.libraryList.innerHTML = '<div class="library-empty">Загрузка каталога…</div>';
    fetch(LIBRARIES_URL, { credentials: "same-origin" })
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (data) {
        var items = data && Array.isArray(data.libraries) ? data.libraries.slice(0, 12) : [];
        state.catalog = items;
        state.els.libraryList.innerHTML = items.length ?
          renderCatalog(items) :
          '<div class="library-empty">Каталог пока пуст. Добавьте vendored-библиотеки в branding/libraries/files.</div>';
      })
      .catch(function () {
        state.els.libraryList.innerHTML = '<div class="library-empty">Не удалось загрузить local catalog.</div>';
      });
  }

  function findCreateButton() {
    return document.querySelector(".main_ui_dashboard_projects__btn-primary") ||
      document.querySelector(".main_ui_dashboard_placeholder__create-new") ||
      Array.prototype.find.call(document.querySelectorAll("button"), function (button) {
        return /новый проект|new project|new file|новый файл/i.test(button.textContent || "");
      }) ||
      null;
  }

  function handleCreate() {
    var button = findCreateButton();
    if (button) button.click();
  }

  function getImportTarget() {
    return document.querySelector(GRID_SELECTOR) ||
      document.querySelector(DASHBOARD_SELECTOR);
  }

  function handleImportFiles(fileList) {
    var target = getImportTarget();
    if (!target || !fileList || !fileList.length) return;
    try {
      var transfer = new DataTransfer();
      Array.prototype.forEach.call(fileList, function (file) {
        transfer.items.add(file);
      });
      target.dispatchEvent(new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer
      }));
    } catch (_) {
      appendLog("⚠ Браузер не дал переслать import через DataTransfer.");
    }
  }

  function updateDashboardPosition() {
    if (state.els.dashboard) {
      state.els.dashboard.hidden = true;
    }
  }

  function ensureLibrariesExpanded() {
    if (!isDashboardRoute()) return;

    var button = Array.prototype.find.call(document.querySelectorAll("button"), function (node) {
      var text = (node.textContent || "").trim();
      if (!/^(show|показать)$/i.test(text)) return false;
      var region = node.closest("section, article, div");
      var regionText = region ? region.textContent || "" : "";
      return /libraries|templates|библиотеки|шаблоны/i.test(regionText);
    });

    if (button && !button.dataset.nofidaExpandedOnce) {
      button.dataset.nofidaExpandedOnce = "true";
      button.click();
    }
  }

  function updateRouteState() {
    var assistantVisible = isAssistantRoute();
    state.els.fab.hidden = !assistantVisible;
    if (!assistantVisible) toggleAssistant(false);
    updateDashboardPosition();
    ensureLibrariesExpanded();
  }

  function wireEvents() {
    state.els.fab.addEventListener("click", function () { toggleAssistant(); });
    state.root.querySelectorAll("[data-close]").forEach(function (button) {
      button.addEventListener("click", function () {
        if (button.getAttribute("data-close") === "libraries") toggleLibraries(false);
        if (button.getAttribute("data-close") === "assistant") toggleAssistant(false);
      });
    });

    state.root.querySelectorAll("[data-action]").forEach(function (button) {
      button.addEventListener("click", function () {
        var action = button.getAttribute("data-action");
        if (action === "create") handleCreate();
        if (action === "import") state.els.importFile.click();
        if (action === "libraries") toggleLibraries(true);
      });
    });

    state.els.importFile.addEventListener("change", function () {
      handleImportFiles(state.els.importFile.files);
      state.els.importFile.value = "";
    });

    state.els.form.addEventListener("submit", function (event) {
      event.preventDefault();
      var prompt = state.els.input.value.trim();
      if (!prompt) return;
      appendLog("→ " + prompt);
      state.els.input.value = "";
      if (!state.bridge || !state.bridge.generateLayers) {
        appendLog("⚠ AI bridge not loaded");
        return;
      }
      state.bridge.generateLayers({ prompt: prompt }).then(function (result) {
        appendLog("✓ " + ((result && result.message) || "bridge acknowledged"));
      });
    });

    state.root.addEventListener("click", function (event) {
      var target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.classList.contains("library-link")) {
        openExternal(target.getAttribute("data-href"));
      }
    });

    window.addEventListener("hashchange", updateRouteState);
    window.addEventListener("resize", updateRouteState);

    var appRoot = document.getElementById("app");
    if (appRoot && "ResizeObserver" in window) {
      var observer = new ResizeObserver(updateRouteState);
      observer.observe(appRoot);
    }
  }

  function start() {
    buildUI();
    wireEvents();
    updateRouteState();
    loadBridge().then(function (bridge) {
      state.bridge = bridge;
      if (bridge && bridge.transport) {
        state.els.transport.textContent = "bridge: " + bridge.transport;
      } else {
        state.els.transport.textContent = "bridge: offline";
      }
    });

    window.NofidaAICore = {
      open: function () { toggleAssistant(true); },
      close: function () { toggleAssistant(false); },
      toggle: function () { toggleAssistant(); },
      openLibraries: function () { toggleLibraries(true); },
      refreshCards: updateDashboardPosition,
      log: appendLog
    };
  }

  onReady(start);
})();
