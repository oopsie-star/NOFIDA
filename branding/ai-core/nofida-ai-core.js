/* ==========================================================================
 * Nofida shell overlay — PATCH 016A: AI Foundation
 * --------------------------------------------------------------------------
 * Mounted into a static sibling host (`#nofida-shell-root`) outside Penpot's
 * React containers. No timers, no MutationObserver as core architecture.
 * Route/layout updates are driven by hashchange, resize, ResizeObserver.
 *
 * 016A additions:
 *   - Context strip: file name, page, selection count from plugin
 *   - Chat UI: user/AI bubbles, loading indicator
 *   - Operation plan preview: collapsible plan block (preview-only, no mutations)
 *   - AI call: POST /api/nofida/ai/ask with summarised file + hub context
 * ========================================================================== */
(function () {
  "use strict";

  if (window.NofidaAICore) return;

  var ASSET_TAG = "__NOFIDA_ASSET_TAG__";
  var ASSET_QUERY = ASSET_TAG ? "?v=" + ASSET_TAG : "";
  var BRIDGE_URL = "/nofida/ai-core/ai-bridge.js" + ASSET_QUERY;
  var LIBRARIES_URL = "/nofida/libraries/catalog.json" + ASSET_QUERY;
  var AI_ASK_URL = "/api/nofida/ai/ask";
  var HOST_ID = "nofida-shell-root";
  var DASHBOARD_SELECTOR = ".main_ui_dashboard__dashboard-content";
  var GRID_SELECTOR = ".main_ui_dashboard_grid__dashboard-grid";
  var BRAND = {
    bg: "#0b1020",
    surface: "#131e35",
    surfaceStrong: "#10192f",
    border: "rgba(37, 99, 235, 0.24)",
    borderAccent: "rgba(191, 255, 0, 0.3)",
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
    els: {},
    _fileContext: null,
    _aiLoading: false,
    _installedItems: []
  };

  // ── utilities ──────────────────────────────────────────────────────────────

  function onReady(fn) {
    function runAfterPaint() {
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(fn);
      });
    }
    if (document.readyState === "complete") { runAfterPaint(); return; }
    window.addEventListener("load", runAfterPaint, { once: true });
  }

  function isDashboardRoute() {
    return /^#\/dashboard/.test(window.location.hash || "");
  }

  function isAssistantRoute() {
    var hash = window.location.hash || "";
    return hash === "" ||
      /^#\/(dashboard|workspace|auth|login|register|recovery)/.test(hash);
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function formatAiText(text) {
    // Minimal markdown: **bold**, line breaks
    return escapeHtml(String(text || ""))
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
      .replace(/\n/g, "<br>");
  }

  // ── DOM host ──────────────────────────────────────────────────────────────

  function ensureHost() {
    var host = document.getElementById(HOST_ID);
    if (!host) {
      host = document.createElement("section");
      host.id = HOST_ID;
      document.body.appendChild(host);
    }
    host.style.cssText = "position:absolute;left:0;top:0;width:100%;height:0;pointer-events:none;z-index:2147483000";
    return host;
  }

  // ── bridge ─────────────────────────────────────────────────────────────────

  function loadBridge() {
    return new Promise(function (resolve) {
      if (window.NofidaAIBridge) { resolve(window.NofidaAIBridge); return; }
      var script = document.createElement("script");
      script.src = BRIDGE_URL;
      script.onload = function () { resolve(window.NofidaAIBridge || null); };
      script.onerror = function () { resolve(null); };
      document.head.appendChild(script);
    });
  }

  // ── catalog ────────────────────────────────────────────────────────────────

  function prefetchCatalog() {
    if (state.catalog !== null) return;
    fetch(LIBRARIES_URL, { credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        state.catalog = (data && Array.isArray(data.libraries)) ? data.libraries : [];
      })
      .catch(function () { state.catalog = []; });
  }

  function buildHubContext() {
    var catalogItems = (state.catalog || []).map(function (item) {
      return {
        id: item.id,
        title: item.title || item.name,
        category: item.category || item.type || "library",
        description: item.description || ""
      };
    });
    return { catalog: catalogItems, installed: state._installedItems || [] };
  }

  // ── library drawer catalog render ─────────────────────────────────────────

  function renderCatalog(items) {
    return items.map(function (item) {
      var href = item.internal_url || item.hub_url || "#";
      var source = item.internal_url ? "Внутренний ресурс" : "Источник";
      var title = item.title || item.name || item.id || "Library";
      var meta = [item.type || "library", item.tier || "catalog", item.author || "Nofida"].join(" · ");
      return [
        '<article class="library-item">',
        '  <div class="library-copy">',
        '    <span class="library-status">' + escapeHtml(item.status || "catalog") + "</span>",
        '    <h3>' + escapeHtml(title) + "</h3>",
        '    <p>' + escapeHtml(meta) + "</p>",
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

  // ── UI build ───────────────────────────────────────────────────────────────

  function buildUI() {
    state.host = ensureHost();
    state.root = state.host.shadowRoot || state.host.attachShadow({ mode: "open" });
    state.root.innerHTML = [
      "<style>",
      ":host{all:initial}",
      "*{box-sizing:border-box;font-family:" + BRAND.font + "}",
      ".layer{pointer-events:none}",

      /* ── dashboard shell (legacy quick-action cards, hidden for now) ── */
      ".dashboard-shell{position:absolute;left:var(--cards-left,320px);top:var(--cards-top,160px);",
      "  width:min(var(--cards-width,calc(100vw - 352px)),1120px);pointer-events:auto}",
      ".dashboard-shell[hidden]{display:none}",
      ".action-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}",
      ".action-card{display:flex;flex-direction:column;align-items:flex-start;gap:8px;width:100%;",
      "  border:1px solid " + BRAND.border + ";border-radius:18px;padding:18px 20px;text-align:left;",
      "  background:linear-gradient(180deg,rgba(19,30,53,.98),rgba(11,16,32,.98));color:" + BRAND.text + ";",
      "  box-shadow:0 18px 48px rgba(2,6,23,.34);cursor:pointer;transition:transform .18s ease,border-color .18s ease}",
      ".action-card:hover{transform:translateY(-2px);border-color:rgba(191,255,0,.45)}",
      ".action-kicker{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:" + BRAND.accent + ";font-weight:700}",
      ".action-title{font-size:18px;font-weight:800;line-height:1.15;margin:0}",
      ".action-copy{font-size:13px;line-height:1.45;color:" + BRAND.muted + ";margin:0}",
      ".action-foot{font-size:12px;color:" + BRAND.text + ";opacity:.88}",

      /* ── FAB ── */
      ".fab{position:fixed;right:20px;bottom:20px;width:56px;height:56px;border:0;border-radius:18px;",
      "  cursor:pointer;display:grid;place-items:center;background:" + BRAND.accent + ";color:" + BRAND.accentInk + ";",
      "  box-shadow:0 16px 44px rgba(191,255,0,.28);pointer-events:auto;transition:transform .15s ease}",
      ".fab:hover{transform:translateY(-2px)}",
      ".fab[hidden]{display:none}",
      ".fab svg{width:24px;height:24px}",

      /* ── side panel (shared base) ── */
      ".panel,.library-drawer{position:fixed;right:0;top:0;height:100vh;width:390px;max-width:94vw;",
      "  transform:translateX(105%);transition:transform .22s cubic-bezier(.16,1,.3,1);",
      "  background:" + BRAND.surfaceStrong + ";color:" + BRAND.text + ";border-left:1px solid " + BRAND.border + ";",
      "  box-shadow:-18px 0 60px rgba(0,0,0,.45);display:flex;flex-direction:column;pointer-events:auto}",
      ".panel.open,.library-drawer.open{transform:translateX(0)}",

      /* ── panel header ── */
      ".panel-head{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid " + BRAND.border + ";flex-shrink:0}",
      ".panel-head h2{margin:0;font-size:14px;font-weight:800;letter-spacing:.03em}",
      ".panel-head small{margin-left:auto;color:" + BRAND.muted + ";font-size:11px}",
      ".dot{width:8px;height:8px;border-radius:999px;background:" + BRAND.accent + ";flex-shrink:0}",
      ".close{margin-left:6px;background:transparent;border:0;color:" + BRAND.muted + ";cursor:pointer;font-size:20px;line-height:1;padding:2px 4px}",

      /* ── context strip ── */
      ".ctx-strip{display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:8px 14px;",
      "  border-bottom:1px solid " + BRAND.border + ";background:" + BRAND.bg + ";font-size:11px;color:" + BRAND.muted + ";flex-shrink:0}",
      ".ctx-dot{opacity:.35}",
      ".ctx-tag{background:rgba(37,99,235,.14);color:#93c5fd;border-radius:6px;padding:2px 6px;font-size:10px;font-weight:700}",

      /* ── messages log ── */
      ".log{flex:1;overflow-y:auto;padding:14px 12px;display:flex;flex-direction:column;gap:10px}",

      /* ── AI message (left-aligned) ── */
      ".ai-msg{display:flex;gap:8px;align-items:flex-start}",
      ".ai-avatar{width:26px;height:26px;border-radius:9px;background:" + BRAND.accent + ";color:" + BRAND.accentInk + ";",
      "  display:grid;place-items:center;font-size:13px;font-weight:900;flex-shrink:0}",
      ".ai-content{flex:1;min-width:0}",
      ".ai-bubble{padding:10px 12px;border-radius:4px 12px 12px 12px;background:" + BRAND.bg + ";",
      "  border:1px solid " + BRAND.border + ";color:" + BRAND.text + ";font-size:13px;line-height:1.55;word-break:break-word}",

      /* ── user message (right-aligned) ── */
      ".user-msg{display:flex;justify-content:flex-end}",
      ".user-bubble{max-width:88%;padding:10px 12px;border-radius:12px 4px 12px 12px;",
      "  background:" + BRAND.primary + ";color:#fff;font-size:13px;line-height:1.55;word-break:break-word}",

      /* ── loading dots ── */
      ".loading{display:flex;gap:5px;align-items:center;padding:10px 12px}",
      ".loading span{width:6px;height:6px;border-radius:50%;background:" + BRAND.accent + ";opacity:.4;",
      "  animation:ndot 1.2s ease-in-out infinite}",
      ".loading span:nth-child(2){animation-delay:.2s}.loading span:nth-child(3){animation-delay:.4s}",
      "@keyframes ndot{0%,100%{opacity:.4;transform:scale(1)}50%{opacity:1;transform:scale(1.3)}}",

      /* ── operation plan preview ── */
      ".plan{margin-top:8px;border:1px solid " + BRAND.borderAccent + ";border-radius:10px;overflow:hidden}",
      ".plan-head{display:flex;align-items:center;gap:6px;padding:8px 10px;",
      "  background:rgba(191,255,0,.07);font-size:11px;font-weight:800;cursor:pointer;user-select:none;",
      "  color:" + BRAND.accent + ";letter-spacing:.04em}",
      ".plan-head .ph-arrow{margin-left:auto;transition:transform .18s ease}",
      ".plan-head.open .ph-arrow{transform:rotate(180deg)}",
      ".plan-body{padding:10px;font-size:12px;color:" + BRAND.muted + ";max-height:180px;overflow-y:auto;display:none}",
      ".plan-body.open{display:block}",
      ".plan-item{padding:6px 8px;border-radius:6px;background:" + BRAND.bg + ";margin-bottom:6px;line-height:1.4}",
      ".plan-item:last-child{margin-bottom:0}",
      ".plan-item b{display:block;margin-bottom:2px;color:" + BRAND.text + "}",
      ".sev-w{color:#facc15}.sev-i{color:#60a5fa}",

      /* ── compose ── */
      ".compose{display:flex;gap:8px;padding:12px;border-top:1px solid " + BRAND.border + ";flex-shrink:0}",
      ".compose input{flex:1;min-width:0;background:" + BRAND.bg + ";color:" + BRAND.text + ";",
      "  border:1px solid " + BRAND.border + ";border-radius:12px;padding:10px 12px;font-size:13px;outline:none}",
      ".compose input:focus{border-color:" + BRAND.primary + "}",
      ".compose button{border:0;border-radius:12px;padding:0 16px;min-height:40px;font-weight:800;font-size:15px;",
      "  cursor:pointer;background:" + BRAND.primary + ";color:#fff;transition:background .15s}",
      ".compose button:hover{background:" + BRAND.primaryHover + "}",
      ".compose button:disabled{opacity:.45;cursor:default}",

      /* ── library drawer ── */
      ".library-drawer{padding-bottom:12px}",
      ".library-body{padding:14px 16px 18px;overflow:auto;flex:1}",
      ".library-note{margin:0 0 14px;color:" + BRAND.muted + ";font-size:13px;line-height:1.45}",
      ".library-list{display:flex;flex-direction:column;gap:12px}",
      ".library-item{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:start;",
      "  padding:14px;border:1px solid " + BRAND.border + ";border-radius:16px;background:rgba(11,16,32,.92)}",
      ".library-item h3{margin:0 0 6px;font-size:15px;line-height:1.25}",
      ".library-item p{margin:0;color:" + BRAND.muted + ";font-size:12px;line-height:1.4}",
      ".library-status{display:inline-flex;align-items:center;padding:5px 8px;margin-bottom:8px;",
      "  border-radius:999px;background:rgba(37,99,235,.18);color:#bfdbfe;font-size:10px;font-weight:800;",
      "  letter-spacing:.08em;text-transform:uppercase}",
      ".library-link,.library-copy{align-self:center}",
      ".library-link{border:0;border-radius:12px;padding:0 14px;min-height:38px;font-weight:800;",
      "  cursor:pointer;background:" + BRAND.primary + ";color:#fff}",
      ".library-link:hover{background:" + BRAND.primaryHover + "}",
      ".library-empty{padding:16px;border:1px dashed " + BRAND.border + ";border-radius:14px;",
      "  color:" + BRAND.muted + ";font-size:13px}",

      "@media (max-width:980px){.dashboard-shell{left:16px!important;width:min(calc(100vw - 32px),1120px)}.action-row{grid-template-columns:1fr}}",
      "</style>",

      '<div class="layer">',

      /* dashboard shell (hidden) */
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
      '        <span class="action-foot">Host-backed store и same-origin файлы</span>',
      "      </button>",
      "    </div>",
      "  </section>",

      /* FAB */
      '  <button class="fab" id="fab" type="button" title="NOFIDA AI" aria-label="NOFIDA AI">',
      '    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
      '      <path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z"/>',
      '      <path d="M19 14l.8 2 .2.8 2 .8-2 .2-.2.8-.8 2-.8-2-.2-.8-2-.8 2-.2.2-.8z"/>',
      "    </svg>",
      "  </button>",

      /* AI assistant panel */
      '  <aside class="panel" id="assistant-panel" role="dialog" aria-label="NOFIDA AI">',
      '    <div class="panel-head">',
      '      <span class="dot"></span>',
      '      <h2>NOFIDA AI</h2>',
      '      <small id="transport">bridge: …</small>',
      '      <button class="close" type="button" data-close="assistant" aria-label="Закрыть">×</button>',
      '    </div>',
      '    <div class="ctx-strip" id="ctx-strip">',
      '      <span id="ctx-file">Файл: —</span>',
      '      <span class="ctx-dot">·</span>',
      '      <span id="ctx-page">Страница: —</span>',
      '      <span class="ctx-dot">·</span>',
      '      <span id="ctx-sel">Выбрано: 0</span>',
      '    </div>',
      '    <div class="log" id="log">',
      '      <div class="ai-msg">',
      '        <div class="ai-avatar">N</div>',
      '        <div class="ai-content">',
      '          <div class="ai-bubble">Привет! Я <b>NOFIDA AI</b> — ваш ассистент по дизайну.<br><br>Спросите меня:<br>• «что в этом файле?»<br>• «какую библиотеку взять для SaaS?»<br>• «проверь экран на проблемы»</div>',
      '        </div>',
      '      </div>',
      '    </div>',
      '    <form class="compose" id="compose">',
      '      <input id="prompt" placeholder="Спросите NOFIDA AI…" autocomplete="off" />',
      '      <button type="submit" id="send-btn">→</button>',
      '    </form>',
      '  </aside>',

      /* Library drawer */
      '  <aside class="library-drawer" id="library-drawer" role="dialog" aria-label="NOFIDA Libraries">',
      '    <div class="panel-head">',
      '      <span class="dot"></span>',
      '      <h2>NOFIDA Libraries</h2>',
      '      <small>local catalog</small>',
      '      <button class="close" type="button" data-close="libraries" aria-label="Закрыть">×</button>',
      '    </div>',
      '    <div class="library-body">',
      '      <p class="library-note">Каталог читается из server-side store. После monthly sync approved файлы доступны по same-origin URL в <code>/nofida/libraries/files/</code>.</p>',
      '      <div class="library-list" id="library-list"><div class="library-empty">Загрузка каталога…</div></div>',
      "    </div>",
      "  </aside>",

      '  <input id="import-file" type="file" accept=".penpot" multiple hidden />',
      "</div>"
    ].join("");

    state.els.dashboard   = state.root.getElementById("dashboard-shell");
    state.els.fab         = state.root.getElementById("fab");
    state.els.panel       = state.root.getElementById("assistant-panel");
    state.els.transport   = state.root.getElementById("transport");
    state.els.ctxStrip    = state.root.getElementById("ctx-strip");
    state.els.ctxFile     = state.root.getElementById("ctx-file");
    state.els.ctxPage     = state.root.getElementById("ctx-page");
    state.els.ctxSel      = state.root.getElementById("ctx-sel");
    state.els.log         = state.root.getElementById("log");
    state.els.form        = state.root.getElementById("compose");
    state.els.input       = state.root.getElementById("prompt");
    state.els.sendBtn     = state.root.getElementById("send-btn");
    state.els.drawer      = state.root.getElementById("library-drawer");
    state.els.libraryList = state.root.getElementById("library-list");
    state.els.importFile  = state.root.getElementById("import-file");
  }

  // ── message renderers ──────────────────────────────────────────────────────

  function appendLog(text) {
    // backward-compat shim used by NofidaAICore.log()
    appendAiMsg(String(text), null);
  }

  function appendUserMsg(text) {
    var div = document.createElement("div");
    div.className = "user-msg";
    var bubble = document.createElement("div");
    bubble.className = "user-bubble";
    bubble.textContent = text;
    div.appendChild(bubble);
    state.els.log.appendChild(div);
    state.els.log.scrollTop = state.els.log.scrollHeight;
  }

  function appendAiMsg(text, plan) {
    var row = document.createElement("div");
    row.className = "ai-msg";

    var avatar = document.createElement("div");
    avatar.className = "ai-avatar";
    avatar.textContent = "N";

    var content = document.createElement("div");
    content.className = "ai-content";

    var bubble = document.createElement("div");
    bubble.className = "ai-bubble";
    bubble.innerHTML = formatAiText(text);
    content.appendChild(bubble);

    if (plan && Array.isArray(plan.items) && plan.items.length > 0) {
      content.appendChild(renderPlan(plan));
    }

    row.appendChild(avatar);
    row.appendChild(content);
    state.els.log.appendChild(row);
    state.els.log.scrollTop = state.els.log.scrollHeight;
    return row;
  }

  function appendLoading() {
    var row = document.createElement("div");
    row.className = "ai-msg";
    var avatar = document.createElement("div");
    avatar.className = "ai-avatar";
    avatar.textContent = "N";
    var dots = document.createElement("div");
    dots.className = "loading";
    dots.innerHTML = "<span></span><span></span><span></span>";
    row.appendChild(avatar);
    row.appendChild(dots);
    state.els.log.appendChild(row);
    state.els.log.scrollTop = state.els.log.scrollHeight;
    return row;
  }

  function renderPlan(plan) {
    var wrap = document.createElement("div");
    wrap.className = "plan";

    var head = document.createElement("div");
    head.className = "plan-head";
    head.innerHTML = "<span>⚡ Операционный план:</span><span style='margin-left:4px;opacity:.7'>"
      + escapeHtml(plan.operation || "plan") + " (preview)</span>"
      + "<span class='ph-arrow'>▾</span>";

    var body = document.createElement("div");
    body.className = "plan-body";

    plan.items.forEach(function (item) {
      var el = document.createElement("div");
      el.className = "plan-item";
      var icon = item.severity === "warning"
        ? "<span class='sev-w'>⚠</span> "
        : "<span class='sev-i'>ℹ</span> ";
      var label = escapeHtml(item.issue || item.title || item.screen_name || item.catalog_id || "");
      var detail = escapeHtml(item.suggestion || item.reason || item.purpose || "");
      el.innerHTML = icon + "<b>" + label + "</b>" + (detail ? "<br>" + detail : "");
      body.appendChild(el);
    });

    head.addEventListener("click", function () {
      var isOpen = body.classList.toggle("open");
      head.classList.toggle("open", isOpen);
    });

    wrap.appendChild(head);
    wrap.appendChild(body);
    return wrap;
  }

  // ── context strip ──────────────────────────────────────────────────────────

  function updateCtxStrip(ctx) {
    state._fileContext = ctx;
    if (!ctx) return;
    try {
      if (ctx.file) state.els.ctxFile.textContent = "📄 " + ctx.file.name;
    } catch (_) {}
    try {
      if (ctx.page) state.els.ctxPage.textContent = "Стр: " + ctx.page.name;
    } catch (_) {}
    try {
      var selCount = (ctx.selection && ctx.selection.length) || 0;
      state.els.ctxSel.textContent = "Выбрано: " + selCount;
    } catch (_) {}
  }

  function requestContext() {
    if (!state.bridge || !state.bridge.extractContext) return;
    state.bridge.extractContext().then(function (ctx) {
      if (ctx) updateCtxStrip(ctx);
    }).catch(function () {});
  }

  // ── panel toggle ───────────────────────────────────────────────────────────

  function toggleAssistant(forceOpen) {
    var shouldOpen = typeof forceOpen === "boolean" ? forceOpen
      : !state.els.panel.classList.contains("open");
    state.els.panel.classList.toggle("open", shouldOpen);
    if (shouldOpen) {
      prefetchCatalog();
      requestContext();
      state.els.input.focus();
    }
  }

  function toggleLibraries(forceOpen) {
    var shouldOpen = typeof forceOpen === "boolean" ? forceOpen
      : !state.els.drawer.classList.contains("open");
    state.els.drawer.classList.toggle("open", shouldOpen);
    if (shouldOpen) loadLibraries();
  }

  function loadLibraries() {
    if (state.catalog && state.catalog.length > 0) {
      state.els.libraryList.innerHTML = renderCatalog(state.catalog);
      return;
    }
    state.els.libraryList.innerHTML = '<div class="library-empty">Загрузка каталога…</div>';
    fetch(LIBRARIES_URL, { credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        var items = (data && Array.isArray(data.libraries)) ? data.libraries.slice(0, 12) : [];
        state.catalog = items;
        state.els.libraryList.innerHTML = items.length
          ? renderCatalog(items)
          : '<div class="library-empty">Каталог пуст. Запустите sync и проверьте /nofida/libraries/files/.</div>';
      })
      .catch(function () {
        state.els.libraryList.innerHTML = '<div class="library-empty">Не удалось загрузить local catalog.</div>';
      });
  }

  // ── AI ask ─────────────────────────────────────────────────────────────────

  function sendAiMessage(message) {
    if (state._aiLoading) return;

    appendUserMsg(message);
    state.els.input.value = "";
    state.els.sendBtn.disabled = true;
    state._aiLoading = true;

    var loadingEl = appendLoading();
    var hubCtx = buildHubContext();

    fetch(AI_ASK_URL, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: message,
        file_context: state._fileContext || null,
        hub_context: hubCtx
      })
    })
      .then(function (r) { return r.ok ? r.json() : r.json().then(function (e) { throw e; }); })
      .then(function (data) {
        loadingEl.remove();
        state._aiLoading = false;
        state.els.sendBtn.disabled = false;
        if (data.answer) {
          appendAiMsg(data.answer, data.operation_plan);
        } else {
          appendAiMsg("⚠ Нет ответа от NOFIDA AI.", null);
        }
      })
      .catch(function (err) {
        loadingEl.remove();
        state._aiLoading = false;
        state.els.sendBtn.disabled = false;
        var msg = (err && err.message) ? err.message : "Ошибка связи с NOFIDA AI. Проверьте сервер.";
        appendAiMsg("⚠ " + msg, null);
      });
  }

  // ── legacy dashboard actions ───────────────────────────────────────────────

  function findCreateButton() {
    return document.querySelector(".main_ui_dashboard_projects__btn-primary") ||
      document.querySelector(".main_ui_dashboard_placeholder__create-new") ||
      Array.prototype.find.call(document.querySelectorAll("button"), function (b) {
        return /новый проект|new project|new file|новый файл/i.test(b.textContent || "");
      }) || null;
  }

  function handleCreate() {
    var button = findCreateButton();
    if (button) button.click();
  }

  function getImportTarget() {
    return document.querySelector(GRID_SELECTOR) || document.querySelector(DASHBOARD_SELECTOR);
  }

  function handleImportFiles(fileList) {
    var target = getImportTarget();
    if (!target || !fileList || !fileList.length) return;
    try {
      var transfer = new DataTransfer();
      Array.prototype.forEach.call(fileList, function (file) { transfer.items.add(file); });
      target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
    } catch (_) {
      appendAiMsg("⚠ Браузер не дал переслать import через DataTransfer.", null);
    }
  }

  // ── route state ────────────────────────────────────────────────────────────

  function updateDashboardPosition() {
    if (state.els.dashboard) state.els.dashboard.hidden = true;
  }

  function ensureLibrariesExpanded() {
    if (!isDashboardRoute()) return;
    var button = Array.prototype.find.call(document.querySelectorAll("button"), function (node) {
      var text = (node.textContent || "").trim();
      if (!/^(show|показать)$/i.test(text)) return false;
      var region = node.closest("section, article, div");
      return region && /libraries|templates|библиотеки|шаблоны/i.test(region.textContent || "");
    });
    if (button && !button.dataset.nofidaExpandedOnce) {
      button.dataset.nofidaExpandedOnce = "true";
      button.click();
    }
  }

  function updateRouteState() {
    var visible = isAssistantRoute();
    state.els.fab.hidden = !visible;
    if (!visible) toggleAssistant(false);
    updateDashboardPosition();
    ensureLibrariesExpanded();
  }

  // ── event wiring ───────────────────────────────────────────────────────────

  function wireEvents() {
    state.els.fab.addEventListener("click", function () { toggleAssistant(); });

    state.root.querySelectorAll("[data-close]").forEach(function (button) {
      button.addEventListener("click", function () {
        var target = button.getAttribute("data-close");
        if (target === "assistant") toggleAssistant(false);
        if (target === "libraries") toggleLibraries(false);
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
      sendAiMessage(prompt);
    });

    state.root.addEventListener("click", function (event) {
      var target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.classList.contains("library-link")) openExternal(target.getAttribute("data-href"));
    });

    window.addEventListener("hashchange", updateRouteState);
    window.addEventListener("resize", updateRouteState);

    var appRoot = document.getElementById("app");
    if (appRoot && "ResizeObserver" in window) {
      new ResizeObserver(updateRouteState).observe(appRoot);
    }
  }

  // ── init ───────────────────────────────────────────────────────────────────

  function start() {
    buildUI();
    wireEvents();
    updateRouteState();
    prefetchCatalog();

    loadBridge().then(function (bridge) {
      state.bridge = bridge;
      if (bridge && bridge.transport) {
        state.els.transport.textContent = "bridge: " + bridge.transport;
      } else {
        state.els.transport.textContent = "bridge: offline";
      }
    });

    window.NofidaAICore = {
      open:          function () { toggleAssistant(true); },
      close:         function () { toggleAssistant(false); },
      toggle:        function () { toggleAssistant(); },
      openLibraries: function () { toggleLibraries(true); },
      refreshCards:  updateDashboardPosition,
      log:           appendLog
    };
  }

  onReady(start);
})();
