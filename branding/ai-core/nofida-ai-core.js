/* ==========================================================================
 * Nofida shell overlay — PATCH 016B: AI Provider Settings, Model Library,
 * and Engine Role Assignments
 * ========================================================================== */
(function () {
  "use strict";

  if (window.NofidaAICore) return;

  var ASSET_TAG = "__NOFIDA_ASSET_TAG__";
  var ASSET_QUERY = ASSET_TAG ? "?v=" + ASSET_TAG : "";
  var BRIDGE_URL = "/nofida/ai-core/ai-bridge.js" + ASSET_QUERY;
  var LIBRARIES_URL = "/nofida/libraries/catalog.json" + ASSET_QUERY;
  var AI_ASK_URL = "/api/nofida/ai/ask";
  var AI_SETTINGS_URL = "/api/nofida/ai/settings";
  var AI_PROVIDER_MODE_URL = "/api/nofida/ai/settings/provider-mode";
  var AI_PROVIDER_KEY_URL = "/api/nofida/ai/settings/provider-key";
  var AI_ASSIGNMENT_URL = "/api/nofida/ai/settings/model-assignment";
  var AI_ENGINE_URL = "/api/nofida/ai/settings/engine";
  var AI_TEST_PROVIDER_URL = "/api/nofida/ai/test-provider";
  var AI_TEST_MODEL_URL = "/api/nofida/ai/test-model";
  var AI_THREADS_URL = "/api/nofida/ai/threads";
  var HOST_ID = "nofida-shell-root";
  var DASHBOARD_SELECTOR = ".main_ui_dashboard__dashboard-content";
  var GRID_SELECTOR = ".main_ui_dashboard_grid__dashboard-grid";

  // Muted "matte glass" palette — deliberately desaturated from the earlier
  // vivid blue/green/amber/red set. Same roles, softer values: less strain
  // over long sessions, frosted-glass panels instead of flat saturated fills.
  var BRAND = {
    bg: "#0c1018",
    surface: "#161c28",
    surfaceStrong: "#12161f",
    surfaceSoft: "rgba(22,28,40,.66)",
    border: "rgba(94, 126, 166, 0.20)",
    borderAccent: "rgba(107, 169, 143, .26)",
    borderDanger: "rgba(201, 112, 112, .28)",
    primary: "#5E7EA6",
    primaryHover: "#6E8CB2",
    accent: "#6BA98F",
    accentSoft: "rgba(107, 169, 143, .14)",
    accentInk: "#eef5f2",
    warn: "#C9A468",
    danger: "#C97070",
    text: "#e9edf3",
    muted: "#8a93a3",
    glass: "blur(18px) saturate(120%)",
    font: 'Montserrat, Inter, "Segoe UI", system-ui, sans-serif'
  };

  var SETTINGS_TABS = [
    { id: "api", label: "API Configuration" },
    { id: "models", label: "Model Library" },
    { id: "engine", label: "Engine" }
  ];

  var ROLE_LABELS = {
    "default": "Default",
    "file_summary": "File Summary",
    "design_audit": "Design Audit",
    "library_recommendation": "Library Recommendation",
    "screen_planner": "Screen Planner",
    "copywriter": "Copywriter",
    "reviewer": "Reviewer",
    "vision": "Vision",
    "fast": "Fast",
    "premium": "Premium"
  };

  var ROLE_ACCENTS = {
    "default": { emoji: "🤖", color: "#7B9BC0" },
    "file_summary": { emoji: "📄", color: "#94a3b8" },
    "design_audit": { emoji: "🔍", color: "#9B8FBF" },
    "library_recommendation": { emoji: "📚", color: "#6FA89C" },
    "screen_planner": { emoji: "🗺️", color: "#C99368" },
    "copywriter": { emoji: "✏️", color: "#C4AD6E" },
    "reviewer": { emoji: "🧐", color: "#D68C8C" },
    "vision": { emoji: "👁️", color: "#7BA8C4" },
    "fast": { emoji: "⚡", color: "#6FAE8F" },
    "premium": { emoji: "💎", color: "#BFA655" }
  };

  var PROVIDER_ACCENTS = {
    "openrouter": "#9B8FBF",
    "deepseek": "#D68C8C",
    "openai": "#7B9BC0",
    "openai_compatible": "#94a3b8",
    "anthropic": "#C9A468",
    "gemini": "#6FAE8F",
    "groq": "#6FA89C",
    "mistral": "#C99368",
    "xiaomi": "#C4818A",
    "qwen": "#7BA8C4",
    "z_ai": "#BFA655",
    "custom": "#9ca3af"
  };

  function hexToRgb(hex) {
    var clean = String(hex || "").replace("#", "");
    var num = parseInt(clean, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255].join(",");
  }

  // Preset task buttons available in dashboard scope (no canvas required)
  var PRESET_TASKS_DASHBOARD = [
    { taskType: "library_recommendation", label: "Библиотеки для проекта", desc: "Подобрать из NOFIDA Hub" },
    { taskType: "find_libraries_for_project", label: "Найти по контексту", desc: "Подбор под текущий файл" },
    { taskType: "design_audit", label: "Аудит дизайна", desc: "Проверить на проблемы" },
    { taskType: "file_summary", label: "Сводка файла", desc: "Что в этом файле?" }
  ];

  // Additional presets available only in editor scope
  var PRESET_TASKS_EDITOR_EXTRA = [
    { taskType: "build_screen", label: "Собрать экран", desc: "AI строит реальный экран на холсте" },
    { taskType: "screen_plan", label: "План экрана", desc: "Структура текущей страницы" },
    { taskType: "copy_review", label: "Копирайтинг", desc: "Улучшить тексты" },
    { taskType: "accessibility_review", label: "Доступность", desc: "Проверить a11y" },
    { taskType: "organize_layers", label: "Организовать слои", desc: "Порядок в слоях" }
  ];

  var state = {
    bridge: null,
    catalog: null,
    host: null,
    root: null,
    els: {},
    _fileContext: null,
    _aiLoading: false,
    _installedItems: [],
    _screenSpecs: {},
    _screenSpecSeq: 0,
    _lastScreenSpec: null,
    _pendingAttachments: [],
    threads: [],
    activeThreadId: null,
    threadsLoaded: false,
    settings: null,
    settingsOpen: false,
    settingsLoading: false,
    settingsError: "",
    accountSettings: {
      host: null,
      container: null,
      sidebarItem: null,
      refreshFrame: 0,
      refreshPasses: 0,
      loopActive: false,
      lastTickAt: 0
    },
    settingsUi: {
      activeTab: "api",
      flash: null,
      search: "",
      providerFilter: "all",
      sort: "name",
      sortDir: "asc",
      focusRole: "default",
      capabilityFilters: {
        free: false,
        vision: false,
        coding: false,
        reasoning: false,
        fast: false,
        cheap: false
      },
      providerDrafts: {},
      providerMessages: {},
      modelRoleDrafts: {},
      modelProviderDrafts: {},
      modelMessages: {},
      expandedDesc: {},
      modelAssignOpenId: null,
      modelPing: {},
      testAllRunning: false,
      savedProviderId: null,
      engineDraft: null,
      fallbackDraft: {
        providerId: "openrouter",
        modelId: ""
      }
    }
  };

  function onReady(fn) {
    function runAfterPaint() {
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(fn);
      });
    }
    if (document.readyState === "complete") { runAfterPaint(); return; }
    window.addEventListener("load", runAfterPaint, { once: true });
  }

  function getNavigation() {
    return window.NofidaNavigation || null;
  }

  function isDashboardRoute() {
    return /^#\/dashboard/.test(window.location.hash || "");
  }

  function isAssistantRoute() {
    var hash = window.location.hash || "";
    return hash === "" || /^#\/(dashboard|workspace|auth|login|register|recovery)/.test(hash);
  }

  function getHashPath() {
    var hash = window.location.hash || "";
    var queryIndex = hash.indexOf("?");
    return queryIndex >= 0 ? hash.slice(0, queryIndex) : hash;
  }

  function getHashParams() {
    var hash = window.location.hash || "";
    var queryIndex = hash.indexOf("?");
    return new URLSearchParams(queryIndex >= 0 ? hash.slice(queryIndex + 1) : "");
  }

  function isAccountSettingsRoute() {
    return /^#\/settings\/options(?:$|\?)/.test(window.location.hash || "");
  }

  // Returns the current AI surface scope based on route + extracted canvas context.
  function getAIScope() {
    if (isDashboardRoute()) return "dashboard";
    var ctx = state._fileContext;
    if (!ctx) return "editor_file";
    var sel = Array.isArray(ctx.selection) ? ctx.selection : [];
    if (sel.length > 0) return "editor_selection";
    if (ctx.page) return "editor_page";
    if (ctx.file) return "editor_file";
    return "editor_file";
  }

  // Returns the list of preset tasks appropriate for the current scope.
  function getActivePresets() {
    var scope = getAIScope();
    if (scope === "dashboard") return PRESET_TASKS_DASHBOARD;
    return PRESET_TASKS_DASHBOARD.concat(PRESET_TASKS_EDITOR_EXTRA);
  }

  function isAccountAIPageActive() {
    var params = getHashParams();
    return isAccountSettingsRoute() && params.get("nofida") === "ai";
  }

  function isKnownSettingsTab(tabId) {
    return SETTINGS_TABS.some(function (tab) { return tab.id === tabId; });
  }

  function buildAccountSettingsHash(extra) {
    var params = new URLSearchParams();
    var source = extra || {};
    Object.keys(source).forEach(function (key) {
      if (source[key] === undefined || source[key] === null || source[key] === "") return;
      params.set(key, source[key]);
    });
    var query = params.toString();
    return "#/settings/options" + (query ? "?" + query : "");
  }

  function openAccountSettingsPage(tabId) {
    var targetTab = isKnownSettingsTab(tabId) ? tabId : (state.settingsUi.activeTab || "api");
    state.settingsUi.activeTab = targetTab;
    state.settingsOpen = false;
    window.location.hash = buildAccountSettingsHash({ nofida: "ai", tab: targetTab });
  }

  function closeAccountSettingsPage() {
    state.settingsOpen = false;
    var nav = getNavigation();
    if (nav) {
      nav.goToNofidaRoute("#/settings/options", { source: "account-ai-back", rememberOrigin: false });
      return;
    }
    window.location.hash = "#/settings/options";
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatAiText(text) {
    return escapeHtml(String(text || ""))
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
      .replace(/\n/g, "<br>");
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function getElementDepth(element) {
    var depth = 0;
    var current = element;
    while (current && current.parentElement) {
      depth += 1;
      current = current.parentElement;
    }
    return depth;
  }

  function findAccountSettingsContainer() {
    var candidates = Array.prototype.map.call(
      document.querySelectorAll("main,section,article,div"),
      function (element) {
        var rect = element.getBoundingClientRect();
        var text = normalizeText(element.textContent || "");
        if (rect.width < 540 || rect.height < 260) return null;
        var score = 0;
        if (text.indexOf("webgl rendering") >= 0) score += 8;
        if (text.indexOf("язык") >= 0 || text.indexOf("language") >= 0) score += 5;
        if (text.indexOf("тема интерфейса пользователя") >= 0 || text.indexOf("theme") >= 0) score += 5;
        if (text.indexOf("настройки") >= 0 || text.indexOf("settings") >= 0) score += 4;
        if (text.indexOf("ваш аккаунт") >= 0 || text.indexOf("your account") >= 0) score += 2;
        if (!score) return null;
        if (text.length > 4000) score -= 2;
        return {
          element: element,
          score: score,
          area: rect.width * rect.height,
          depth: getElementDepth(element)
        };
      }
    ).filter(Boolean);

    candidates.sort(function (left, right) {
      if (right.score !== left.score) return right.score - left.score;
      if (left.area !== right.area) return left.area - right.area;
      return right.depth - left.depth;
    });

    return candidates.length ? candidates[0].element : null;
  }

  function findAccountSidebarNav() {
    return document.querySelector("ul.main_ui_settings_sidebar__sidebar-nav-settings");
  }

  function ensureAccountSidebarStyles() {
    var styleId = "nofida-ai-account-sidebar-style";
    if (document.getElementById(styleId)) return;
    var style = document.createElement("style");
    style.id = styleId;
    style.textContent = [
      "#nofida-ai-sidebar-item{cursor:pointer;user-select:none}",
      "#nofida-ai-sidebar-item .nofida-ai-sidebar-label{display:inline-flex;align-items:center;gap:10px}",
      "#nofida-ai-sidebar-item .nofida-ai-sidebar-icon{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:999px;background:rgba(94,126,166,.16);color:#A8BFD4;flex:0 0 18px}",
      "#nofida-ai-sidebar-item.main_ui_settings_sidebar__current .nofida-ai-sidebar-icon{background:rgba(191,255,0,.18);color:#d9ff5b}",
      "#nofida-ai-sidebar-item .nofida-ai-sidebar-icon svg{width:12px;height:12px;display:block}",
      "#nofida-ai-sidebar-item .nofida-ai-sidebar-badge{display:inline-flex;align-items:center;padding:2px 7px;border-radius:999px;background:rgba(107,169,143,.14);color:#8ef0cd;font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;margin-left:8px}"
    ].join("");
    document.head.appendChild(style);
  }

  function apiJson(url, init) {
    var request = init || {};
    var headers = Object.assign({}, request.headers || {});
    if (request.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";

    return fetch(url, {
      method: request.method || "GET",
      credentials: "same-origin",
      headers: headers,
      body: request.body,
    }).then(function (response) {
      return response.text().then(function (raw) {
        var data = {};
        if (raw) {
          try { data = JSON.parse(raw); } catch (_error) { data = { message: raw }; }
        }
        if (!response.ok) {
          var error = new Error(data && data.message ? data.message : ("Request failed: " + response.status));
          error.status = response.status;
          error.code = data && data.code ? data.code : "request_failed";
          error.payload = data;
          throw error;
        }
        return data;
      });
    });
  }

  function isSavedProvider(providerId) {
    return Boolean(getProvider(providerId) && getProvider(providerId).hasKey);
  }

  function setFlash(text, tone) {
    state.settingsUi.flash = text ? { text: text, tone: tone || "info" } : null;
    renderSettings();
  }

  function setProviderMessage(providerId, text, tone) {
    state.settingsUi.providerMessages[providerId] = text ? { text: text, tone: tone || "info" } : null;
    renderSettings();
  }

  function setModelMessage(key, text, tone) {
    state.settingsUi.modelMessages[key] = text ? { text: text, tone: tone || "info" } : null;
    renderSettings();
  }

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

  function prefetchCatalog() {
    if (state.catalog !== null) return;
    fetch(LIBRARIES_URL, { credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        state.catalog = (data && Array.isArray(data.libraries)) ? data.libraries : [];
      })
      .catch(function () { state.catalog = []; });
  }


  function renderCatalog(items) {
    return items.map(function (item) {
      var href = item.internal_url || "#/nofida/libraries";
      var source = "Открыть ресурсы";
      var title = item.title || item.name || item.id || "Library";
      var meta = [item.type || "library", item.tier || "catalog", item.author || "Nofida"].join(" · ");
      return [
        '<article class="library-item">',
        '  <div class="library-copy">',
        '    <span class="library-status">' + escapeHtml(item.status || "catalog") + "</span>",
        '    <h3>' + escapeHtml(title) + "</h3>",
        '    <p>' + escapeHtml(meta) + "</p>",
        "  </div>",
        '  <button class="library-link" type="button" data-action="open-external" data-href="' + escapeHtml(href) + '">' + source + "</button>",
        "</article>"
      ].join("");
    }).join("");
  }

  function openExternal(href) {
    if (!href || href === "#") return;
    var nav = getNavigation();
    if (/^(#|\/#\/)/.test(href)) {
      if (nav) {
        nav.goToNofidaRoute(href, { source: "ai-resource-center" });
        return;
      }
      window.location.hash = String(href).replace(/^#/, "");
      return;
    }
    if (isPenpotExternalHref(href)) {
      var route = resolveNofidaInternalRoute(href, "", "", "") || "#/nofida/help";
      if (nav) {
        nav.goToNofidaRoute(route, { source: "ai-resource-center" });
        return;
      }
      window.location.hash = String(route).replace(/^#/, "");
      return;
    }
    window.open(href, "_blank", "noopener,noreferrer");
  }

  function getProvider(providerId) {
    var providers = state.settings && state.settings.providers ? state.settings.providers : [];
    return providers.find(function (provider) { return provider.providerId === providerId; }) || null;
  }

  function getProviderDraft(providerId) {
    var provider = getProvider(providerId);
    if (!state.settingsUi.providerDrafts[providerId]) {
      state.settingsUi.providerDrafts[providerId] = {
        apiKey: "",
        reveal: false,
        baseUrl: provider && provider.baseUrl ? provider.baseUrl : ""
      };
    }
    return state.settingsUi.providerDrafts[providerId];
  }

  function getEngineDraft() {
    if (!state.settingsUi.engineDraft) {
      state.settingsUi.engineDraft = {
        providerMode: "role_assignments",
        temperature: 0.25,
        maxTokens: 1200,
        timeoutMs: 45000,
        retries: 1,
        fallbackModelOrder: []
      };
    }
    return state.settingsUi.engineDraft;
  }

  function syncUiStateFromSettings() {
    if (!state.settings) return;

    (state.settings.providers || []).forEach(function (provider) {
      state.settingsUi.providerDrafts[provider.providerId] = {
        apiKey: "",
        reveal: false,
        baseUrl: provider.baseUrl || ""
      };
    });

    state.settingsUi.engineDraft = {
      providerMode: state.settings.providerMode || "role_assignments",
      temperature: state.settings.engine.temperature,
      maxTokens: state.settings.engine.maxTokens,
      timeoutMs: state.settings.engine.timeoutMs,
      retries: state.settings.engine.retries,
      fallbackModelOrder: (state.settings.engine.fallbackModelOrder || []).slice()
    };

    state.settingsUi.fallbackDraft = {
      providerId: state.settingsUi.providerFilter || "openrouter",
      modelId: ""
    };
  }

  function ensureSettingsLoaded(force) {
    if (state.settingsLoading) return Promise.resolve(state.settings);
    if (state.settings && !force) return Promise.resolve(state.settings);

    state.settingsLoading = true;
    state.settingsError = "";
    renderSettings();

    return apiJson(force ? (AI_SETTINGS_URL + "?refresh=1") : AI_SETTINGS_URL)
      .then(function (data) {
        state.settings = data.settings || null;
        syncUiStateFromSettings();
        state.settingsLoading = false;
        renderSettings();
        return state.settings;
      })
      .catch(function (error) {
        state.settingsLoading = false;
        state.settingsError = error.message || "Failed to load AI settings.";
        renderSettings();
        throw error;
      });
  }

  function toggleAssistant(forceOpen) {
    var shouldOpen = typeof forceOpen === "boolean" ? forceOpen
      : !state.els.panel.classList.contains("open");
    state.els.panel.classList.toggle("open", shouldOpen);
    if (shouldOpen) {
      prefetchCatalog();
      updateCtxStrip(state._fileContext);  // render scope + presets immediately
      requestContext();
      state.els.input.focus();
      if (!state.threadsLoaded) refreshThreadsList();
    }
  }

  function toggleLibraries(forceOpen) {
    var shouldOpen = typeof forceOpen === "boolean" ? forceOpen
      : !state.els.drawer.classList.contains("open");
    state.els.drawer.classList.toggle("open", shouldOpen);
    if (shouldOpen) loadLibraries();
  }

  function openSettings(tabId, focusRole, providerId) {
    state.settingsOpen = true;
    if (tabId) state.settingsUi.activeTab = tabId;
    if (focusRole) state.settingsUi.focusRole = focusRole;
    if (providerId) state.settingsUi.providerFilter = providerId;
    renderSettings();
    ensureSettingsLoaded(false).catch(function () {});
  }

  function closeSettings() {
    state.settingsOpen = false;
    renderSettings();
  }

  function providerStatusLabel(status) {
    if (status === "saved") return "saved";
    if (status === "test_passed") return "test passed";
    if (status === "test_failed") return "test failed";
    if (status === "not_tested") return "not tested";
    return "not configured";
  }

  function providerStatusTone(status) {
    if (status === "test_passed") return "success";
    if (status === "test_failed") return "error";
    if (status === "saved" || status === "not_tested") return "info";
    return "muted";
  }

  function messageToneClass(tone) {
    if (tone === "success") return "ok";
    if (tone === "error") return "err";
    if (tone === "warn") return "warn";
    return "info";
  }

  function formatLatency(ms) {
    return ms ? (ms + " ms") : "—";
  }

  function getCompatibleProviders(model) {
    var providerIds = model.compatibleProviders || [];
    return providerIds.map(function (providerId) { return getProvider(providerId); }).filter(Boolean);
  }

  function pickDefaultProviderForModel(model) {
    var draft = state.settingsUi.modelProviderDrafts[model.id];
    if (draft && (model.compatibleProviders || []).indexOf(draft) >= 0) return draft;
    if (state.settingsUi.providerFilter !== "all" && (model.compatibleProviders || []).indexOf(state.settingsUi.providerFilter) >= 0)
      return state.settingsUi.providerFilter;
    var compatible = getCompatibleProviders(model);
    var saved = compatible.find(function (provider) { return provider.hasKey; });
    if (saved) return saved.providerId;
    return compatible.length ? compatible[0].providerId : "openrouter";
  }

  function pickDefaultRoleForModel(modelId) {
    return state.settingsUi.modelRoleDrafts[modelId] || state.settingsUi.focusRole || "default";
  }

  // Mirrors AI Studio's fmtP(): 0 -> Free, null -> ?, <0.1 -> 4 decimals, else 2 decimals, per-1M-token.
  function fmtPricePer1M(value) {
    if (value === null || value === undefined) return "?";
    if (value === 0) return "Free";
    var per1M = value * 1000000;
    return "$" + (per1M < 0.1 ? per1M.toFixed(4) : per1M.toFixed(2));
  }

  function getModelUsageRoles(modelId) {
    var assignments = (state.settings && state.settings.modelAssignments) || {};
    return Object.keys(assignments).filter(function (role) {
      return assignments[role] && assignments[role].modelId === modelId;
    });
  }

  function getFilteredModels() {
    var settings = state.settings;
    if (!settings || !Array.isArray(settings.modelLibrary)) return [];

    var search = String(state.settingsUi.search || "").trim().toLowerCase();
    var providerFilter = state.settingsUi.providerFilter || "all";
    var activeCaps = Object.keys(state.settingsUi.capabilityFilters).filter(function (cap) {
      return state.settingsUi.capabilityFilters[cap];
    });
    var sort = state.settingsUi.sort || "name";
    var sortDir = state.settingsUi.sortDir === "desc" ? "desc" : "asc";

    var models = settings.modelLibrary.filter(function (model) {
      var haystack = (
        (model.displayName || "") + " " +
        (model.description || "") + " " +
        (model.id || "") + " " +
        (model.providerLabel || "")
      ).toLowerCase();

      if (search && haystack.indexOf(search) === -1) return false;
      if (providerFilter !== "all" && (model.compatibleProviders || []).indexOf(providerFilter) === -1) return false;
      if (activeCaps.length && !activeCaps.every(function (cap) {
        return (model.capabilities || []).indexOf(cap) >= 0;
      })) return false;
      return true;
    });

    models.sort(function (left, right) {
      var result;
      if (sort === "context") {
        result = (left.contextWindow || 0) - (right.contextWindow || 0);
      } else if (sort === "price") {
        var lp = left.price && typeof left.price.prompt === "number" ? left.price.prompt : Number.POSITIVE_INFINITY;
        var rp = right.price && typeof right.price.prompt === "number" ? right.price.prompt : Number.POSITIVE_INFINITY;
        result = lp - rp;
      } else {
        result = String(left.displayName || "").localeCompare(String(right.displayName || ""));
      }
      return sortDir === "desc" ? -result : result;
    });

    return models;
  }

  function renderSettingsTabs() {
    state.root.querySelectorAll("[data-settings-tab]").forEach(function (button) {
      var tab = button.getAttribute("data-settings-tab");
      button.classList.toggle("active", tab === state.settingsUi.activeTab);
    });
  }

  function renderFlash() {
    if (!state.settingsUi.flash) return "";
    return '<div class="flash ' + messageToneClass(state.settingsUi.flash.tone) + '">' + escapeHtml(state.settingsUi.flash.text) + "</div>";
  }

  function renderProviderCard(provider) {
    var draft = getProviderDraft(provider.providerId);
    var revealLabel = draft.reveal ? "Hide" : "Reveal";
    var baseLabel = provider.requiresBaseUrl || provider.providerId === "custom" || provider.providerId === "openai_compatible"
      ? "Base URL"
      : "Base URL (optional override)";
    var inline = state.settingsUi.providerMessages[provider.providerId];
    var accent = PROVIDER_ACCENTS[provider.providerId] || "#94a3b8";
    var accentRgb = hexToRgb(accent);
    var isSaved = state.settingsUi.savedProviderId === provider.providerId;
    var cardStyle = "background:rgba(" + accentRgb + ",0.05);border-color:rgba(" + accentRgb + ",0.15)";
    var saveStyle = isSaved
      ? "background:#7CB79E;color:#000"
      : "background:" + accent + ";color:#000";

    return [
      '<article class="provider-card" style="' + escapeHtml(cardStyle) + '">',
      '  <div class="provider-top">',
      '    <div>',
      '      <h3 style="color:' + escapeHtml(accent) + '">' + escapeHtml(provider.label) + "</h3>",
      '      <p>' + escapeHtml(provider.adapter) + '</p>',
      "    </div>",
      '    <span class="status-pill ' + providerStatusTone(provider.status) + '">' + escapeHtml(providerStatusLabel(provider.status)) + "</span>",
      "  </div>",
      '  <div class="field">',
      "    <label>Saved key</label>",
      '    <div class="saved-key">' + escapeHtml(provider.maskedKey || "Not configured") + "</div>",
      "  </div>",
      '  <div class="field">',
      "    <label>API key</label>",
      '    <input class="text-input" data-provider-key="' + escapeHtml(provider.providerId) + '" type="' + (draft.reveal ? "text" : "password") + '" value="' + escapeHtml(draft.apiKey || "") + '" placeholder="Paste a new key to replace the saved one" autocomplete="off" />',
      "  </div>",
      '  <div class="inline-controls">',
      '    <label class="toggle"><input type="checkbox" data-provider-reveal="' + escapeHtml(provider.providerId) + '"' + (draft.reveal ? " checked" : "") + ' /> ' + revealLabel + "</label>",
      "  </div>",
      '  <div class="field">',
      "    <label>" + baseLabel + "</label>",
      '    <input class="text-input" data-provider-base="' + escapeHtml(provider.providerId) + '" type="text" value="' + escapeHtml(draft.baseUrl || "") + '" placeholder="' + escapeHtml(provider.baseUrlPlaceholder || "https://api.example.com/v1") + '" />',
      "  </div>",
      inline ? ('  <div class="inline-message ' + messageToneClass(inline.tone) + '">' + escapeHtml(inline.text) + "</div>") : "",
      '  <div class="provider-actions">',
      '    <button class="btn provider-save-btn" style="' + escapeHtml(saveStyle) + '" type="button" data-action="save-provider" data-provider-id="' + escapeHtml(provider.providerId) + '">' + (isSaved ? "✓ Saved" : "Save") + "</button>",
      '    <button class="btn ghost" type="button" data-action="test-provider" data-provider-id="' + escapeHtml(provider.providerId) + '">Test</button>',
      '    <button class="btn danger" type="button" data-action="delete-provider" data-provider-id="' + escapeHtml(provider.providerId) + '">Delete key</button>',
      "  </div>",
      '  <div class="provider-meta">Latency: ' + escapeHtml(formatLatency(provider.lastTestLatencyMs)) + ' · Last tested: ' + escapeHtml(provider.lastTestedAt || "—") + "</div>",
      provider.lastError ? ('  <div class="provider-meta error-text">' + escapeHtml(provider.lastError) + "</div>") : "",
      "</article>"
    ].join("");
  }

  function renderApiConfigurationTab() {
    var settings = state.settings;
    var providers = settings && Array.isArray(settings.providers) ? settings.providers : [];
    return [
      renderFlash(),
      '<div class="settings-section-head">',
      "  <div>",
      "    <h3>Global Provider Keys</h3>",
      "    <p>Keys are stored server-side only. Saved values are always masked in the UI and never echoed back raw.</p>",
      "  </div>",
      "</div>",
      '<div class="provider-grid">',
      providers.map(renderProviderCard).join(""),
      "</div>"
    ].join("");
  }

  function renderCapabilityFilter(capability) {
    var checked = Boolean(state.settingsUi.capabilityFilters[capability]);
    var toneClass = capability === "free" ? " free" : capability === "vision" ? " vision" : "";
    return '<label class="filter-toggle' + toneClass + (checked ? " active" : "") + '"><input type="checkbox" data-capability="' + capability + '"' + (checked ? " checked" : "") + " /> " + escapeHtml(capability === "free" ? "Free only" : capability.charAt(0).toUpperCase() + capability.slice(1)) + "</label>";
  }

  function renderSortButton(key, label) {
    var active = state.settingsUi.sort === key;
    var arrow = active ? (state.settingsUi.sortDir === "desc" ? " ↓" : " ↑") : "";
    return '<button class="sort-btn' + (active ? " active" : "") + '" type="button" data-action="set-sort" data-sort-key="' + key + '">' + escapeHtml(label) + arrow + "</button>";
  }

  function renderPingBadge(modelId) {
    var ping = state.settingsUi.modelPing[modelId] || { status: "idle" };
    if (ping.status === "ok") return '<span class="ping-ok">✅ ' + escapeHtml(String(ping.ms || "")) + "ms</span>";
    if (ping.status === "error") return '<span class="ping-error">❌ ' + escapeHtml(ping.code ? String(ping.code) : "Err") + "</span>";
    if (ping.status === "loading") return '<span class="ping-spinner" aria-hidden="true"></span>';
    return "";
  }

  function renderModelCard(model) {
    var providerId = pickDefaultProviderForModel(model);
    var role = pickDefaultRoleForModel(model.id);
    var providerOptions = getCompatibleProviders(model).map(function (provider) {
      var selected = provider.providerId === providerId ? " selected" : "";
      return '<option value="' + escapeHtml(provider.providerId) + '"' + selected + ">" + escapeHtml(provider.label) + (provider.hasKey ? "" : " (no key)") + "</option>";
    }).join("");
    var roleOptions = Object.keys(ROLE_LABELS).map(function (roleId) {
      var selected = roleId === role ? " selected" : "";
      return '<option value="' + escapeHtml(roleId) + '"' + selected + ">" + escapeHtml(ROLE_LABELS[roleId]) + "</option>";
    }).join("");
    var inlineKey = model.id + "::" + providerId;
    var inline = state.settingsUi.modelMessages[inlineKey];

    var capabilities = model.capabilities || [];
    var isFree = capabilities.indexOf("free") >= 0;
    var isVision = capabilities.indexOf("vision") >= 0;
    var usedByRoles = getModelUsageRoles(model.id);
    var ping = state.settingsUi.modelPing[model.id] || { status: "idle" };
    var testDisabled = ping.status === "loading";

    var contextK = Math.round((model.contextWindow || 0) / 1000);
    var ctxStr = contextK >= 1000 ? (contextK / 1000).toFixed(0) + "M" : contextK + "k";
    var inPrice = fmtPricePer1M(model.price ? model.price.prompt : null);
    var outPrice = fmtPricePer1M(model.price ? model.price.completion : null);

    var description = model.description || "";
    var isExpanded = Boolean(state.settingsUi.expandedDesc[model.id]);
    var isLong = description.length > 120;
    var descText = isExpanded || !isLong ? description : description.slice(0, 120) + "…";

    var showAssign = state.settingsUi.modelAssignOpenId === model.id;

    return [
      '<article class="model-card">',
      '  <div class="model-card-head">',
      '    <div class="model-card-main">',
      '      <div class="model-card-title">',
      '        <span class="model-card-name">' + escapeHtml(model.displayName) + "</span>",
      '        <span class="model-card-provider">' + escapeHtml(model.providerLabel || "") + "</span>",
      isFree ? '        <span class="badge badge-free">FREE</span>' : "",
      isVision ? '        <span class="badge badge-vision">VISION</span>' : "",
      usedByRoles.map(function (roleId) {
        return '        <span class="badge badge-used">Used: ' + escapeHtml(ROLE_LABELS[roleId] || roleId) + "</span>";
      }).join(""),
      "      </div>",
      '      <div class="model-card-stats">',
      "        <span>" + escapeHtml(ctxStr) + " ctx</span>",
      "        <span>In: " + escapeHtml(inPrice) + "</span>",
      "        <span>Out: " + escapeHtml(outPrice) + "</span>",
      model.maxOutputTokens ? ("        <span>Max: " + escapeHtml(model.maxOutputTokens.toLocaleString()) + "</span>") : "",
      '        <span class="vision-note' + (isVision ? " yes" : " no") + '">' + (isVision ? "🖼 Изображения: да" : "🖼 Изображения: нет") + "</span>",
      "      </div>",
      "    </div>",
      '    <div class="model-card-actions">',
      "      " + renderPingBadge(model.id),
      '      <button class="btn ghost tiny" type="button" data-action="test-model" data-model-id="' + escapeHtml(model.id) + '"' + (testDisabled ? " disabled" : "") + ">Test</button>",
      '      <button class="btn assign-toggle-btn' + (showAssign ? " active" : "") + '" type="button" data-action="toggle-assign-popup" data-model-id="' + escapeHtml(model.id) + '">Assign ▾</button>',
      "    </div>",
      "  </div>",
      description ? [
        '  <div class="model-desc-row">',
        escapeHtml(descText),
        isLong ? ('<button class="model-desc-toggle" type="button" data-action="toggle-model-desc" data-model-id="' + escapeHtml(model.id) + '">' + (isExpanded ? "less" : "more") + "</button>") : "",
        "  </div>"
      ].join("") : "",
      showAssign ? [
        '  <div class="assign-popover">',
        '    <span class="assign-popover-label">Assign to role:</span>',
        '    <select class="select-input small" data-model-role="' + escapeHtml(model.id) + '">' + roleOptions + "</select>",
        '    <select class="select-input small" data-model-provider="' + escapeHtml(model.id) + '">' + providerOptions + "</select>",
        '    <button class="btn ok-btn" type="button" data-action="assign-model" data-model-id="' + escapeHtml(model.id) + '">OK</button>',
        '    <button class="btn cancel-btn" type="button" data-action="close-assign-popup" data-model-id="' + escapeHtml(model.id) + '">✕</button>',
        inline ? ('    <div class="inline-message ' + messageToneClass(inline.tone) + '">' + escapeHtml(inline.text) + "</div>") : "",
        "  </div>"
      ].join("") : "",
      "</article>"
    ].join("");
  }

  function renderModelLibraryTab() {
    var settings = state.settings;
    var providers = settings && Array.isArray(settings.providers) ? settings.providers : [];
    var models = getFilteredModels();
    var totalModels = settings && settings.metadata ? Number(settings.metadata.totalModels || 0) : 0;
    var syncedAt = settings && settings.metadata ? settings.metadata.registrySyncedAt : null;
    var providerOptions = ['<option value="all"' + (state.settingsUi.providerFilter === "all" ? " selected" : "") + '>All Providers</option>']
      .concat(providers.map(function (provider) {
        var selected = provider.providerId === state.settingsUi.providerFilter ? " selected" : "";
        return '<option value="' + escapeHtml(provider.providerId) + '"' + selected + ">" + escapeHtml(provider.label) + "</option>";
      }))
      .join("");
    var testAllCount = Math.min(models.length, 20);
    var testAllDisabled = state.settingsUi.testAllRunning || models.length === 0;

    return [
      renderFlash(),
      '<div class="settings-toolbar">',
      '  <div class="field grow"><label>Найти модель…</label><input id="settings-search" class="text-input" type="search" value="' + escapeHtml(state.settingsUi.search || "") + '" placeholder="Найти модель…" /></div>',
      '  <div class="field"><label>Provider</label><select id="settings-provider-filter" class="select-input">' + providerOptions + "</select></div>",
      "</div>",
      '<div class="filter-sort-row">',
      '  <label class="filter-toggle free' + (state.settingsUi.capabilityFilters.free ? " active" : "") + '"><input type="checkbox" data-capability="free"' + (state.settingsUi.capabilityFilters.free ? " checked" : "") + " /> Free only</label>",
      '  <label class="filter-toggle vision' + (state.settingsUi.capabilityFilters.vision ? " active" : "") + '"><input type="checkbox" data-capability="vision"' + (state.settingsUi.capabilityFilters.vision ? " checked" : "") + " /> Vision</label>",
      '  <div class="filter-sort-spacer"></div>',
      '  <span class="sort-label">Sort:</span>',
      renderSortButton("name", "Name"),
      renderSortButton("price", "Price"),
      renderSortButton("context", "Context"),
      '  <button class="btn test-all-btn" type="button" data-action="test-all-models"' + (testAllDisabled ? " disabled" : "") + ">"
        + (state.settingsUi.testAllRunning ? "Testing…" : "Test All (" + testAllCount + ")") + "</button>",
      "</div>",
      '<div class="chip-row">'
        + ["coding", "reasoning", "fast", "cheap"].map(renderCapabilityFilter).join("")
        + "</div>",
      '<div class="provider-note">' + escapeHtml(totalModels + " models loaded from OpenRouter"
        + (syncedAt ? " · synced " + syncedAt : "") + " · showing " + models.length + ". Press \"Обновить\" to pull the latest catalog.") + "</div>",
      models.length
        ? ('<div class="model-list">' + models.map(renderModelCard).join("") + "</div>")
        : '<div class="empty-state">No models matched the current search and filters.</div>'
    ].join("");
  }

  function renderAssignmentCard(roleId, assignment) {
    var title = ROLE_LABELS[roleId] || roleId;
    var accent = (ROLE_ACCENTS[roleId] || { emoji: "🤖", color: "#94a3b8" });
    var providers = (state.settings && state.settings.providers) || [];
    var assignedProvider = assignment ? providers.find(function (p) { return p.providerId === assignment.providerId; }) : null;
    var keyDotClass = assignedProvider && assignedProvider.hasKey ? "key-dot ok" : "key-dot";

    return [
      '<article class="assignment-card" style="border-left:3px solid ' + escapeHtml(accent.color) + '">',
      '  <div class="assignment-top">',
      '    <h4>' + escapeHtml(accent.emoji) + " " + escapeHtml(title) + "</h4>",
      '    <span class="status-pill ' + (assignment ? "info" : "muted") + '">' + escapeHtml(assignment ? "assigned" : "unassigned") + "</span>",
      "  </div>",
      '  <p>' + (assignment ? ('<span class="' + keyDotClass + '"></span>' + escapeHtml(assignment.providerLabel + " · " + assignment.modelLabel)) : escapeHtml("No model assigned yet.")) + "</p>",
      '  <div class="provider-actions">',
      '    <button class="btn ghost" type="button" data-action="edit-role-assignment" data-role="' + escapeHtml(roleId) + '" data-provider-id="' + escapeHtml(assignment && assignment.providerId ? assignment.providerId : state.settingsUi.providerFilter) + '">Edit in Library</button>',
      '    <button class="btn danger" type="button" data-action="clear-role-assignment" data-role="' + escapeHtml(roleId) + '"' + (assignment ? "" : " disabled") + ">Clear</button>",
      "  </div>",
      "</article>"
    ].join("");
  }

  function renderFallbackList() {
    var draft = getEngineDraft();
    if (!draft.fallbackModelOrder.length) return '<div class="empty-state slim">No fallback models configured.</div>';

    return '<div class="fallback-list">' + draft.fallbackModelOrder.map(function (item, index) {
      return [
        '<div class="fallback-item">',
        '  <div>',
        '    <strong>' + escapeHtml(item.providerLabel || item.providerId) + "</strong>",
        '    <span>' + escapeHtml(item.modelLabel || item.modelId) + "</span>",
        "  </div>",
        '  <button class="btn danger tiny" type="button" data-action="remove-fallback" data-fallback-index="' + index + '">Remove</button>',
        "</div>"
      ].join("");
    }).join("") + "</div>";
  }

  function renderFallbackAdder() {
    var draft = state.settingsUi.fallbackDraft || { providerId: "openrouter", modelId: "" };
    var models = (state.settings && state.settings.modelLibrary ? state.settings.modelLibrary : []).filter(function (model) {
      return (model.compatibleProviders || []).indexOf(draft.providerId) >= 0;
    });

    var providerOptions = (state.settings && state.settings.providers ? state.settings.providers : []).map(function (provider) {
      var selected = provider.providerId === draft.providerId ? " selected" : "";
      return '<option value="' + escapeHtml(provider.providerId) + '"' + selected + ">" + escapeHtml(provider.label) + "</option>";
    }).join("");

    var modelOptions = ['<option value="">Select model</option>'].concat(models.map(function (model) {
      var selected = model.id === draft.modelId ? " selected" : "";
      return '<option value="' + escapeHtml(model.id) + '"' + selected + ">" + escapeHtml(model.displayName) + "</option>";
    })).join("");

    return [
      '<div class="field-row compact">',
      '  <div class="field"><label>Fallback provider</label><select id="engine-fallback-provider" class="select-input">' + providerOptions + "</select></div>",
      '  <div class="field grow"><label>Fallback model</label><select id="engine-fallback-model" class="select-input">' + modelOptions + "</select></div>",
      '  <div class="field action-field"><label>&nbsp;</label><button class="btn primary" type="button" data-action="add-fallback">Add fallback</button></div>',
      "</div>"
    ].join("");
  }

  function renderEngineTab() {
    var settings = state.settings || { modelAssignments: {} };
    var draft = getEngineDraft();
    var assignments = settings.modelAssignments || {};

    return [
      renderFlash(),
      '<div class="settings-section-head">',
      "  <div>",
      "    <h3>Routing and runtime</h3>",
      "    <p>Role assignments are edited in the Model Library and persisted on the server.</p>",
      "  </div>",
      '  <button class="btn ghost" type="button" data-action="refresh-settings">Обновить</button>',
      "</div>",
      '<div class="radio-group">',
      '  <label><input type="radio" name="provider-mode" value="role_assignments"' + (draft.providerMode === "role_assignments" ? " checked" : "") + ' /> Role-based routing</label>',
      '  <label><input type="radio" name="provider-mode" value="single_default"' + (draft.providerMode === "single_default" ? " checked" : "") + ' /> Single default model</label>',
      "</div>",
      '<div class="field-row">',
      '  <div class="field"><label>Temperature</label><input id="engine-temperature" class="text-input" type="number" min="0" max="2" step="0.05" value="' + escapeHtml(String(draft.temperature)) + '" /></div>',
      '  <div class="field"><label>Max tokens</label><input id="engine-max-tokens" class="text-input" type="number" min="64" max="65536" step="1" value="' + escapeHtml(String(draft.maxTokens)) + '" /></div>',
      '  <div class="field"><label>Timeout ms</label><input id="engine-timeout-ms" class="text-input" type="number" min="5000" max="120000" step="1000" value="' + escapeHtml(String(draft.timeoutMs)) + '" /></div>',
      '  <div class="field"><label>Retries</label><input id="engine-retries" class="text-input" type="number" min="0" max="5" step="1" value="' + escapeHtml(String(draft.retries)) + '" /></div>',
      "</div>",
      '<div class="settings-section-head slim"><div><h3>Fallback model order</h3><p>User-configured fallback order only. No hardcoded paid defaults.</p></div></div>',
      renderFallbackList(),
      renderFallbackAdder(),
      '<div class="settings-section-head slim"><div><h3>Role assignments</h3><p>Pick the role you want to edit and jump into the model grid with the provider pre-filtered.</p></div></div>',
      '<div class="assignment-grid">' + Object.keys(ROLE_LABELS).map(function (roleId) {
        return renderAssignmentCard(roleId, assignments[roleId] || null);
      }).join("") + "</div>",
      '<div class="provider-actions"><button class="btn primary" type="button" data-action="save-engine">Save engine</button></div>'
    ].join("");
  }

  function getSharedSettingsPanelHtml() {
    if (!state.settings) return '<div class="empty-state">Settings are not available yet.</div>';

    if (state.settingsUi.activeTab === "api") return renderApiConfigurationTab();
    if (state.settingsUi.activeTab === "models") return renderModelLibraryTab();
    if (state.settingsUi.activeTab === "engine") return renderEngineTab();

    return renderApiConfigurationTab();
  }

  function renderSettingsBody() {
    if (!state.els.settingsBody) return;
    renderSettingsTabs();

    state.els.settingsShell.hidden = !state.settingsOpen;
    state.els.settingsShell.classList.toggle("open", state.settingsOpen);

    if (!state.settingsOpen) return;

    if (state.settingsLoading && !state.settings) {
      state.els.settingsBody.innerHTML = '<div class="loading-panel">Loading AI settings…</div>';
      return;
    }

    if (state.settingsError && !state.settings) {
      state.els.settingsBody.innerHTML = '<div class="empty-state">' + escapeHtml(state.settingsError) + "</div>";
      return;
    }

    if (!state.settings) {
      state.els.settingsBody.innerHTML = '<div class="empty-state">Settings are not available yet.</div>';
      return;
    }

    state.els.settingsBody.innerHTML = getSharedSettingsPanelHtml();
  }

  function getAccountSettingsScopedStyles() {
    return [
      '#nofida-ai-account-page-host{display:block;width:100%;margin:0}',
      '#nofida-ai-account-page-host *{box-sizing:border-box;font-family:' + BRAND.font + '}',
      '#nofida-ai-account-page-host .account-shell{display:flex;flex-direction:column;gap:10px;border:1px solid ' + BRAND.border + ';border-radius:16px;background:linear-gradient(180deg,rgba(20,25,35,.76),rgba(12,16,23,.8));backdrop-filter:' + BRAND.glass + ';-webkit-backdrop-filter:' + BRAND.glass + ';box-shadow:0 8px 32px rgba(2,6,23,.22);padding:14px 16px;color:' + BRAND.text + '}',
      '#nofida-ai-account-page-host .account-shell.page{padding:14px 16px 16px;overflow-y:auto;max-height:calc(100vh - 90px);min-height:0}',
      '#nofida-ai-account-page-host .account-shell.launcher{flex-direction:row;align-items:center;padding:8px 14px;border-radius:10px;gap:10px;flex-wrap:wrap;background:rgba(13,19,36,.96);box-shadow:none;border-color:rgba(94,126,166,.16)}',
      '#nofida-ai-account-page-host .account-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}',
      '#nofida-ai-account-page-host .account-head h2{margin:2px 0 0;font-size:16px;line-height:1.2;font-weight:800}',
      '#nofida-ai-account-page-host .account-head p{margin:3px 0 0;color:' + BRAND.muted + ';font-size:12px;line-height:1.5;max-width:860px}',
      '#nofida-ai-account-page-host .eyebrow{display:inline-flex;align-items:center;gap:6px;padding:3px 8px;border-radius:999px;background:' + BRAND.accentSoft + ';color:#d1fae5;font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}',
      '#nofida-ai-account-page-host .eyebrow::before{content:"";width:6px;height:6px;border-radius:999px;background:' + BRAND.accent + '}',
      '#nofida-ai-account-page-host .metrics{display:flex;gap:8px;flex-wrap:wrap}',
      '#nofida-ai-account-page-host .metric{min-width:120px;padding:8px 10px;border-radius:10px;background:rgba(7,12,24,.78);border:1px solid ' + BRAND.border + '}',
      '#nofida-ai-account-page-host .metric strong{display:block;font-size:16px;line-height:1;font-weight:800;margin-bottom:3px}',
      '#nofida-ai-account-page-host .metric span{font-size:11px;color:' + BRAND.muted + '}',
      '#nofida-ai-account-page-host .launcher-actions{display:flex;gap:8px;flex-wrap:wrap}',
      '#nofida-ai-account-page-host .btn{border:0;border-radius:8px;padding:6px 10px;font-size:11px;font-weight:700;cursor:pointer}',
      '#nofida-ai-account-page-host .btn.primary{background:' + BRAND.primary + ';color:#fff}',
      '#nofida-ai-account-page-host .btn.primary:hover{background:' + BRAND.primaryHover + '}',
      '#nofida-ai-account-page-host .btn.ghost{background:rgba(15,23,42,.82);color:' + BRAND.text + ';border:1px solid ' + BRAND.border + '}',
      '#nofida-ai-account-page-host .btn.danger{background:rgba(127,29,29,.26);color:#fecaca;border:1px solid ' + BRAND.borderDanger + '}',
      '#nofida-ai-account-page-host .btn.tiny{padding:3px 7px;font-size:10px}',
      '#nofida-ai-account-page-host .btn:disabled{opacity:.45;cursor:default}',
      '#nofida-ai-account-page-host .settings-tabs{display:flex;gap:6px;flex-wrap:wrap;padding:0}',
      '#nofida-ai-account-page-host .settings-tab{border:1px solid ' + BRAND.border + ';border-radius:999px;background:rgba(15,23,42,.72);color:' + BRAND.muted + ';padding:5px 10px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap}',
      '#nofida-ai-account-page-host .settings-tab.active{background:' + BRAND.primary + ';border-color:' + BRAND.primary + ';color:#fff}',
      '#nofida-ai-account-page-host .settings-body{display:flex;flex-direction:column;gap:12px}',
      '#nofida-ai-account-page-host .settings-section-head{display:flex;align-items:flex-end;justify-content:space-between;gap:10px}',
      '#nofida-ai-account-page-host .settings-section-head.slim{margin-top:4px}',
      '#nofida-ai-account-page-host .settings-section-head h3{margin:0 0 3px;font-size:13px}',
      '#nofida-ai-account-page-host .settings-section-head p{margin:0;color:' + BRAND.muted + ';font-size:12px;line-height:1.5}',
      '#nofida-ai-account-page-host .settings-toolbar{display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px}',
      '#nofida-ai-account-page-host .field-row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}',
      '#nofida-ai-account-page-host .field-row.compact{grid-template-columns:repeat(2,minmax(0,1fr))}',
      '#nofida-ai-account-page-host .field{display:flex;flex-direction:column;gap:7px}',
      '#nofida-ai-account-page-host .field label{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:' + BRAND.muted + ';font-weight:800}',
      '#nofida-ai-account-page-host .text-input,#nofida-ai-account-page-host .select-input{width:100%;border:1px solid ' + BRAND.border + ';border-radius:10px;background:rgba(7,12,24,.92);color:' + BRAND.text + ';padding:7px 10px;font-size:12px;outline:none}',
      '#nofida-ai-account-page-host .saved-key{padding:7px 10px;border-radius:10px;background:rgba(7,12,24,.92);border:1px solid ' + BRAND.border + ';color:' + BRAND.text + ';font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px}',
      '#nofida-ai-account-page-host .provider-grid,#nofida-ai-account-page-host .model-grid,#nofida-ai-account-page-host .assignment-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px}',
      '#nofida-ai-account-page-host .provider-card,#nofida-ai-account-page-host .model-card,#nofida-ai-account-page-host .assignment-card,#nofida-ai-account-page-host .placeholder-block{border:1px solid ' + BRAND.border + ';border-radius:12px;background:' + BRAND.surfaceSoft + ';backdrop-filter:' + BRAND.glass + ';-webkit-backdrop-filter:' + BRAND.glass + ';padding:10px 12px;display:flex;flex-direction:column;gap:8px}',
      '#nofida-ai-account-page-host .provider-top,#nofida-ai-account-page-host .model-head,#nofida-ai-account-page-host .assignment-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}',
      '#nofida-ai-account-page-host .provider-top h3,#nofida-ai-account-page-host .model-copy h3,#nofida-ai-account-page-host .assignment-top h4,#nofida-ai-account-page-host .placeholder-block h3{margin:0;font-size:13px}',
      '#nofida-ai-account-page-host .provider-top p,#nofida-ai-account-page-host .model-copy p,#nofida-ai-account-page-host .assignment-card p,#nofida-ai-account-page-host .placeholder-block p,#nofida-ai-account-page-host .model-desc,#nofida-ai-account-page-host .provider-note,#nofida-ai-account-page-host .provider-meta{margin:0;color:' + BRAND.muted + ';font-size:11px;line-height:1.4}',
      '#nofida-ai-account-page-host .model-desc{min-height:30px}',
      '#nofida-ai-account-page-host .provider-actions{display:flex;gap:6px;flex-wrap:wrap}',
      '#nofida-ai-account-page-host .inline-controls{display:flex;align-items:center;gap:12px}',
      '#nofida-ai-account-page-host .toggle{font-size:12px;color:' + BRAND.muted + '}',
      '#nofida-ai-account-page-host .status-pill{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;border:1px solid transparent}',
      '#nofida-ai-account-page-host .status-pill.success{background:rgba(107,169,143,.15);color:#a7f3d0;border-color:rgba(107,169,143,.32)}',
      '#nofida-ai-account-page-host .status-pill.error{background:rgba(201,112,112,.14);color:#fecaca;border-color:rgba(201,112,112,.32)}',
      '#nofida-ai-account-page-host .status-pill.info{background:rgba(94,126,166,.18);color:#C7D6E5;border-color:rgba(94,126,166,.32)}',
      '#nofida-ai-account-page-host .status-pill.muted{background:rgba(148,163,184,.12);color:' + BRAND.muted + ';border-color:rgba(148,163,184,.18)}',
      '#nofida-ai-account-page-host .flash,#nofida-ai-account-page-host .inline-message{border-radius:14px;padding:12px 14px;font-size:13px;line-height:1.5;border:1px solid transparent}',
      '#nofida-ai-account-page-host .flash.ok,#nofida-ai-account-page-host .inline-message.ok{background:rgba(107,169,143,.12);color:#d1fae5;border-color:rgba(107,169,143,.28)}',
      '#nofida-ai-account-page-host .flash.err,#nofida-ai-account-page-host .inline-message.err{background:rgba(127,29,29,.28);color:#fecaca;border-color:rgba(201,112,112,.28)}',
      '#nofida-ai-account-page-host .flash.warn,#nofida-ai-account-page-host .inline-message.warn{background:rgba(120,53,15,.28);color:#fde68a;border-color:rgba(201,164,104,.28)}',
      '#nofida-ai-account-page-host .flash.info,#nofida-ai-account-page-host .inline-message.info{background:rgba(94,126,166,.14);color:#dbeafe;border-color:rgba(94,126,166,.3)}',
      '#nofida-ai-account-page-host .tag-row,#nofida-ai-account-page-host .chip-row{display:flex;gap:8px;flex-wrap:wrap}',
      '#nofida-ai-account-page-host .tag,#nofida-ai-account-page-host .chip-filter{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;background:rgba(15,23,42,.82);border:1px solid ' + BRAND.border + ';font-size:11px;color:' + BRAND.text + '}',
      '#nofida-ai-account-page-host .chip-filter input{margin:0}',
      '#nofida-ai-account-page-host .price-pill{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;background:' + BRAND.accentSoft + ';color:#d1fae5;padding:7px 10px;font-size:11px;font-weight:800}',
      '#nofida-ai-account-page-host .provider-note{padding:12px 14px;border-radius:14px;background:rgba(15,23,42,.78);border:1px solid ' + BRAND.border + '}',
      '#nofida-ai-account-page-host .radio-group{display:flex;gap:18px;flex-wrap:wrap;padding:12px 14px;border:1px solid ' + BRAND.border + ';border-radius:16px;background:rgba(7,12,24,.82);font-size:13px}',
      '#nofida-ai-account-page-host .radio-group label{display:flex;align-items:center;gap:8px;color:' + BRAND.text + '}',
      '#nofida-ai-account-page-host .fallback-list{display:flex;flex-direction:column;gap:10px}',
      '#nofida-ai-account-page-host .fallback-item{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-radius:14px;border:1px solid ' + BRAND.border + ';background:rgba(7,12,24,.84)}',
      '#nofida-ai-account-page-host .fallback-item strong,#nofida-ai-account-page-host .fallback-item span{display:block}',
      '#nofida-ai-account-page-host .fallback-item span{font-size:12px;color:' + BRAND.muted + ';margin-top:4px}',
      '#nofida-ai-account-page-host .empty-state,#nofida-ai-account-page-host .loading-panel{padding:12px;border:1px dashed ' + BRAND.border + ';border-radius:10px;color:' + BRAND.muted + ';font-size:12px;line-height:1.5;background:rgba(11,16,32,.82)}',
      '#nofida-ai-account-page-host .empty-state.slim{padding:8px}',
      '#nofida-ai-account-page-host .error-text{color:#fecaca}',
      '#nofida-ai-account-page-host .launcher-label{font-size:12px;color:' + BRAND.muted + ';flex:1}',
      '@media (max-width:1180px){#nofida-ai-account-page-host .settings-toolbar,#nofida-ai-account-page-host .field-row{grid-template-columns:repeat(2,minmax(0,1fr))}}',
      '@media (max-width:820px){#nofida-ai-account-page-host .account-head h2{font-size:14px}#nofida-ai-account-page-host .settings-toolbar,#nofida-ai-account-page-host .field-row,#nofida-ai-account-page-host .field-row.compact{grid-template-columns:1fr}}',
      '#nofida-ai-account-page-host .model-list{display:flex;flex-direction:column;gap:8px}',
      '#nofida-ai-account-page-host .model-card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}',
      '#nofida-ai-account-page-host .model-card-main{flex:1;min-width:0}',
      '#nofida-ai-account-page-host .model-card-title{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-bottom:4px}',
      '#nofida-ai-account-page-host .model-card-name{font-weight:700;color:#fff;font-size:14px}',
      '#nofida-ai-account-page-host .model-card-provider{font-size:10px;color:#8b93a6}',
      '#nofida-ai-account-page-host .model-card-stats{display:flex;gap:12px;font-size:11px;color:#8b93a6;flex-wrap:wrap}',
      '#nofida-ai-account-page-host .vision-note.yes{color:#9B8FBF}',
      '#nofida-ai-account-page-host .vision-note.no{color:#5f6673}',
      '#nofida-ai-account-page-host .model-card-actions{display:flex;gap:6px;flex-shrink:0;align-items:center}',
      '#nofida-ai-account-page-host .badge{font-size:9px;padding:2px 6px;border-radius:5px;font-weight:800;text-transform:uppercase}',
      '#nofida-ai-account-page-host .badge-free{background:rgba(196,173,110,.14);color:#C4AD6E}',
      '#nofida-ai-account-page-host .badge-vision{background:rgba(155,143,191,.14);color:#9B8FBF}',
      '#nofida-ai-account-page-host .badge-used{background:rgba(111,174,143,.12);color:#6FAE8F;text-transform:none;font-weight:700}',
      '#nofida-ai-account-page-host .model-desc-row{margin-top:6px;font-size:11px;color:#8b93a6;line-height:1.5}',
      '#nofida-ai-account-page-host .model-desc-toggle{margin-left:6px;background:none;border:none;color:#7B9BC0;font-size:11px;cursor:pointer;padding:0}',
      '#nofida-ai-account-page-host .assign-popover{margin-top:10px;padding:10px 12px;border-radius:10px;background:rgba(111,174,143,.05);border:1px solid rgba(111,174,143,.2);display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '#nofida-ai-account-page-host .assign-popover-label{font-size:11px;color:#6FAE8F;font-weight:600}',
      '#nofida-ai-account-page-host .select-input.small{padding:5px 8px;font-size:11px;width:auto}',
      '#nofida-ai-account-page-host .ok-btn{padding:5px 14px;border-radius:8px;border:none;background:#6FAE8F;color:#000;font-size:11px;font-weight:700;cursor:pointer}',
      '#nofida-ai-account-page-host .cancel-btn{padding:5px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.08);background:transparent;color:#555;font-size:11px;cursor:pointer}',
      '#nofida-ai-account-page-host .filter-sort-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}',
      '#nofida-ai-account-page-host .filter-sort-spacer{flex:1}',
      '#nofida-ai-account-page-host .filter-toggle{display:flex;align-items:center;gap:5px;cursor:pointer;font-size:12px;color:#555;user-select:none}',
      '#nofida-ai-account-page-host .filter-toggle input{margin:0}',
      '#nofida-ai-account-page-host .filter-toggle.free.active{color:#C4AD6E}',
      '#nofida-ai-account-page-host .filter-toggle.vision.active{color:#9B8FBF}',
      '#nofida-ai-account-page-host .sort-label{font-size:11px;color:#444}',
      '#nofida-ai-account-page-host .sort-btn{padding:4px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.06);background:transparent;color:#555;font-size:11px;font-weight:600;cursor:pointer}',
      '#nofida-ai-account-page-host .sort-btn.active{border-color:rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fff}',
      '#nofida-ai-account-page-host .test-all-btn{display:flex;align-items:center;gap:5px;padding:5px 12px;border-radius:9px;border:1px solid rgba(123,155,192,.3);background:rgba(123,155,192,.08);color:#7B9BC0;font-size:11px;font-weight:600;cursor:pointer}',
      '#nofida-ai-account-page-host .test-all-btn:disabled{opacity:.6;cursor:not-allowed}',
      '#nofida-ai-account-page-host .assign-toggle-btn{padding:4px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:#777;font-size:11px;font-weight:600;cursor:pointer}',
      '#nofida-ai-account-page-host .assign-toggle-btn.active{border-color:rgba(111,174,143,.4);background:rgba(111,174,143,.1);color:#6FAE8F}',
      '#nofida-ai-account-page-host .ping-ok{font-size:11px;color:#7CB79E;font-weight:600;white-space:nowrap}',
      '#nofida-ai-account-page-host .ping-error{font-size:11px;color:#D68C8C;font-weight:600;white-space:nowrap}',
      '#nofida-ai-account-page-host .ping-spinner{display:inline-block;width:12px;height:12px;border-radius:50%;border:2px solid rgba(123,155,192,.25);border-top-color:#7B9BC0;animation:nfspin 1s linear infinite;flex-shrink:0}',
      '@keyframes nfspin{to{transform:rotate(360deg)}}',
      '#nofida-ai-account-page-host .provider-save-btn{min-width:60px;transition:background .2s}',
      '#nofida-ai-account-page-host .key-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:rgba(148,163,184,.4);margin-right:6px}',
      '#nofida-ai-account-page-host .key-dot.ok{background:#7CB79E}'
    ].join("");
  }

  function restoreAccountSettingsSiblings() {
    var account = state.accountSettings;
    if (!account.container) return;
    Array.prototype.forEach.call(account.container.children, function (child) {
      if (child === account.host) return;
      if (!child.hasAttribute("data-nofida-prev-display")) return;
      child.style.display = child.getAttribute("data-nofida-prev-display");
      child.removeAttribute("data-nofida-prev-display");
    });
  }

  function restoreNativeSettingsCurrentState() {
    Array.prototype.forEach.call(
      document.querySelectorAll("li.main_ui_settings_sidebar__settings-item[data-nofida-was-current='true']"),
      function (item) {
        item.classList.add("main_ui_settings_sidebar__current");
        item.removeAttribute("data-nofida-was-current");
      }
    );
  }

  function updateAccountSidebarItem() {
    var nav = findAccountSidebarNav();
    var active = isAccountAIPageActive();

    if (!isAccountSettingsRoute() || !nav) {
      restoreNativeSettingsCurrentState();
      var staleEntry = document.getElementById("nofida-ai-sidebar-item");
      if (staleEntry && staleEntry.parentNode) staleEntry.parentNode.removeChild(staleEntry);
      state.accountSettings.sidebarItem = null;
      return;
    }

    ensureAccountSidebarStyles();

    var item = document.getElementById("nofida-ai-sidebar-item") || state.accountSettings.sidebarItem;
    if (!item || item.parentNode !== nav) {
      if (item && item.parentNode) item.parentNode.removeChild(item);
      item = document.createElement("li");
      item.id = "nofida-ai-sidebar-item";
      item.setAttribute("data-nofida-ai-account-entry", "true");
      item.className = "main_ui_settings_sidebar__settings-item";
      item.setAttribute("role", "button");
      item.tabIndex = 0;
      item.setAttribute("aria-label", "NOFIDA AI");
      item.innerHTML = [
        '<span class="main_ui_settings_sidebar__element-title nofida-ai-sidebar-label">',
        '  <span class="nofida-ai-sidebar-icon" aria-hidden="true">',
        '    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
        '      <path d="M12 3l1.5 3.8L17 8.3l-3.5 1.5L12 14l-1.5-4.2L7 8.3l3.5-1.5z"></path>',
        '      <path d="M18.5 14.5l.6 1.5.9.4-.9.1-.6 1.5-.6-1.5-.9-.1.9-.4z"></path>',
        "    </svg>",
        "  </span>",
        "  <span>NOFIDA AI</span>",
        '  <span class="nofida-ai-sidebar-badge">AI</span>',
        "</span>"
      ].join("");
      item.addEventListener("click", function () {
        openAccountSettingsPage("api");
      });
      item.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openAccountSettingsPage("api");
        }
      });

      var items = Array.prototype.slice.call(nav.children);
      var releaseNotes = items.find(function (node) {
        return normalizeText(node.textContent || "") === "примечания к выпуску";
      });
      var integrations = items.find(function (node) {
        return normalizeText(node.textContent || "") === "integrations";
      });

      if (releaseNotes) nav.insertBefore(item, releaseNotes);
      else if (integrations && integrations.nextSibling) nav.insertBefore(item, integrations.nextSibling);
      else nav.appendChild(item);

      state.accountSettings.sidebarItem = item;
    }

    item.className = "main_ui_settings_sidebar__settings-item" + (active ? " main_ui_settings_sidebar__current" : "");
    item.setAttribute("aria-current", active ? "page" : "false");

    var nativeSettingsItem = Array.prototype.find.call(nav.children, function (node) {
      return node !== item && normalizeText(node.textContent || "") === "настройки";
    });

    if (nativeSettingsItem) {
      if (active && nativeSettingsItem.classList.contains("main_ui_settings_sidebar__current")) {
        nativeSettingsItem.classList.remove("main_ui_settings_sidebar__current");
        nativeSettingsItem.setAttribute("data-nofida-was-current", "true");
      } else if (!active && nativeSettingsItem.getAttribute("data-nofida-was-current") === "true") {
        nativeSettingsItem.classList.add("main_ui_settings_sidebar__current");
        nativeSettingsItem.removeAttribute("data-nofida-was-current");
      }
    }
  }

  function setAccountSettingsPageMode(active) {
    var account = state.accountSettings;
    if (!account.container || !account.host) return;
    Array.prototype.forEach.call(account.container.children, function (child) {
      if (child === account.host) return;
      if (active) {
        if (!child.hasAttribute("data-nofida-prev-display")) {
          child.setAttribute("data-nofida-prev-display", child.style.display || "");
        }
        child.style.display = "none";
      } else if (child.hasAttribute("data-nofida-prev-display")) {
        child.style.display = child.getAttribute("data-nofida-prev-display");
        child.removeAttribute("data-nofida-prev-display");
      }
    });
  }

  function buildAccountSettingsSummary() {
    var settings = state.settings;
    var providers = settings && Array.isArray(settings.providers) ? settings.providers : [];
    var assigned = settings && settings.modelAssignments ? Object.keys(settings.modelAssignments).length : 0;
    return {
      configuredProviders: providers.filter(function (provider) { return provider.hasKey; }).length,
      totalProviders: providers.length,
      assignedRoles: assigned,
      totalModels: settings && settings.metadata ? settings.metadata.totalModels : 0
    };
  }

  function renderAccountSettingsHost() {
    if (!isAccountSettingsRoute()) {
      restoreAccountSettingsSiblings();
      if (state.accountSettings.host && state.accountSettings.host.parentNode) {
        state.accountSettings.host.parentNode.removeChild(state.accountSettings.host);
      }
      state.accountSettings.host = null;
      state.accountSettings.container = null;
      return;
    }

    if (!isAccountAIPageActive()) {
      // Plain #/settings/options: never inject host/banner — sidebar item is the only NOFIDA
      // presence allowed. Remove any stale host from a prior ?nofida=ai visit.
      restoreAccountSettingsSiblings();
      if (state.accountSettings.host && state.accountSettings.host.parentNode) {
        state.accountSettings.host.parentNode.removeChild(state.accountSettings.host);
      }
      state.accountSettings.host = null;
      state.accountSettings.container = null;
      return;
    }

    // Only reached when ?nofida=ai is present — full AI settings page.
    var requestedTab = getHashParams().get("tab");
    if (isKnownSettingsTab(requestedTab)) state.settingsUi.activeTab = requestedTab;

    var container = findAccountSettingsContainer();
    if (!container) return;

    var host = state.accountSettings.host;
    if (!host || host.getAttribute("data-nofida-ai-account-host") !== "true" || host.parentNode !== container) {
      if (host && host.parentNode) host.parentNode.removeChild(host);
      host = document.createElement("section");
      host.id = "nofida-ai-account-page-host";
      host.setAttribute("data-nofida-ai-account-host", "true");
      container.insertBefore(host, container.firstChild || null);
      state.accountSettings.host = host;
      state.accountSettings.container = container;
    }

    if (!state.settings && !state.settingsLoading) {
      ensureSettingsLoaded(false).catch(function () {});
    }

    setAccountSettingsPageMode(true);

    var activeTabLabel = (SETTINGS_TABS.find(function (tab) {
      return tab.id === state.settingsUi.activeTab;
    }) || SETTINGS_TABS[0] || { label: "API Configuration" }).label;

    var bodyHtml = "";
    if (state.settingsLoading && !state.settings) {
      bodyHtml = '<div class="loading-panel">Loading AI settings…</div>';
    } else if (state.settingsError && !state.settings) {
      bodyHtml = '<div class="empty-state">' + escapeHtml(state.settingsError) + "</div>";
    } else {
      bodyHtml = getSharedSettingsPanelHtml();
    }

    var markup = [
      "<style>", getAccountSettingsScopedStyles(), "</style>",
      '<section class="account-shell page">',
      '  <div class="account-head">',
      '    <div>',
      '      <span class="eyebrow">Account / NOFIDA AI / ' + escapeHtml(activeTabLabel) + "</span>",
      '      <h2>NOFIDA AI Provider Settings</h2>',
      '      <p>Server-side provider keys, OpenRouter-backed model library, engine routing, tests, and role assignments are managed here inside your account settings.</p>',
      "    </div>",
      '    <div class="provider-actions">',
      '      <button class="btn ghost" type="button" data-action="close-account-ai-settings">Назад к настройкам</button>',
      '      <button class="btn primary" type="button" data-action="refresh-settings">Обновить</button>',
      "    </div>",
      "  </div>",
      '  <div class="settings-tabs">' + SETTINGS_TABS.map(function (tab) {
        return '<button class="settings-tab' + (tab.id === state.settingsUi.activeTab ? " active" : "") + '" type="button" data-settings-tab="' + escapeHtml(tab.id) + '">' + escapeHtml(tab.label) + "</button>";
      }).join("") + "</div>",
      '  <div class="settings-body">' + bodyHtml + "</div>",
      "</section>"
    ].join("");

    if (host.getAttribute("data-nofida-markup") !== markup) {
      host.innerHTML = markup;
      host.setAttribute("data-nofida-markup", markup);
    }
  }

  function scheduleAccountSettingsRefresh() {
    if (state.accountSettings.loopActive) return;
    state.accountSettings.loopActive = true;
    state.accountSettings.refreshPasses = 0;
    state.accountSettings.lastTickAt = 0;

    function tick(timestamp) {
      if (!state.accountSettings.loopActive) {
        state.accountSettings.refreshFrame = 0;
        return;
      }

      if (!isAccountSettingsRoute()) {
        renderAccountSettingsHost();
        updateAccountSidebarItem();
        state.accountSettings.loopActive = false;
        state.accountSettings.refreshFrame = 0;
        return;
      }

      if (!state.accountSettings.lastTickAt || (timestamp - state.accountSettings.lastTickAt) >= 180) {
        state.accountSettings.lastTickAt = timestamp;
        state.accountSettings.refreshPasses += 1;
        renderAccountSettingsHost();
        updateAccountSidebarItem();

        // On plain settings (no AI page), stop once sidebar item is stable in nav.
        // This prevents repeated DOM checks that could subtly shift layout on slow renders.
        if (!isAccountAIPageActive()) {
          var sItem = state.accountSettings.sidebarItem;
          if ((sItem && sItem.parentNode) || state.accountSettings.refreshPasses >= 60) {
            state.accountSettings.loopActive = false;
            state.accountSettings.refreshFrame = 0;
            return;
          }
        }
      }

      state.accountSettings.refreshFrame = requestAnimationFrame(tick);
    }

    state.accountSettings.refreshFrame = requestAnimationFrame(tick);
  }

  function renderSettings() {
    if (state.els.settingsShell) renderSettingsBody();
    renderAccountSettingsHost();
    updateAccountSidebarItem();
  }

  function buildUI() {
    state.host = ensureHost();
    state.root = state.host.shadowRoot || state.host.attachShadow({ mode: "open" });
    state.root.innerHTML = '\
<style>\
:host{all:initial}\
*{box-sizing:border-box;font-family:' + BRAND.font + '}\
.layer{pointer-events:none}\
.dashboard-shell{position:absolute;left:var(--cards-left,320px);top:var(--cards-top,160px);width:min(var(--cards-width,calc(100vw - 352px)),1120px);pointer-events:auto}\
.dashboard-shell[hidden]{display:none}\
.action-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}\
.action-card{display:flex;flex-direction:column;align-items:flex-start;gap:8px;width:100%;border:1px solid ' + BRAND.border + ';border-radius:18px;padding:18px 20px;text-align:left;background:linear-gradient(180deg,rgba(22,28,40,.7),rgba(14,18,26,.7));backdrop-filter:' + BRAND.glass + ';-webkit-backdrop-filter:' + BRAND.glass + ';color:' + BRAND.text + ';box-shadow:0 18px 48px rgba(2,6,23,.28);cursor:pointer;transition:transform .18s ease,border-color .18s ease}\
.action-card:hover{transform:translateY(-2px);border-color:rgba(107,169,143,.45)}\
.action-kicker{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:' + BRAND.accent + ';font-weight:700}\
.action-title{font-size:18px;font-weight:800;line-height:1.15;margin:0}\
.action-copy{font-size:13px;line-height:1.45;color:' + BRAND.muted + ';margin:0}\
.action-foot{font-size:12px;color:' + BRAND.text + ';opacity:.88}\
.fab{position:fixed;right:20px;bottom:20px;width:56px;height:56px;border:0;border-radius:18px;cursor:pointer;display:grid;place-items:center;background:' + BRAND.accent + ';color:' + BRAND.bg + ';box-shadow:0 16px 44px rgba(107,169,143,.28);pointer-events:auto;transition:transform .15s ease}\
.fab:hover{transform:translateY(-2px)}\
.fab[hidden]{display:none}\
.fab svg{width:24px;height:24px}\
.panel,.library-drawer{position:fixed;right:0;top:0;height:100vh;width:408px;max-width:94vw;transform:translateX(105%);transition:transform .22s cubic-bezier(.16,1,.3,1);background:rgba(18,22,31,.72);backdrop-filter:' + BRAND.glass + ';-webkit-backdrop-filter:' + BRAND.glass + ';color:' + BRAND.text + ';border-left:1px solid ' + BRAND.border + ';box-shadow:-18px 0 60px rgba(0,0,0,.35);display:flex;flex-direction:column;pointer-events:auto}\
.panel.open,.library-drawer.open{transform:translateX(0)}\
.panel-head{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid ' + BRAND.border + ';flex-shrink:0}\
.panel-head h2{margin:0;font-size:14px;font-weight:800;letter-spacing:.03em}\
.panel-head small{margin-left:auto;color:' + BRAND.muted + ';font-size:11px}\
.thread-bar{display:flex;align-items:center;gap:6px;padding:8px 16px;border-bottom:1px solid ' + BRAND.border + ';flex-shrink:0}\
.thread-select{flex:1;min-width:0;background:' + BRAND.surfaceStrong + ';color:' + BRAND.text + ';border:1px solid ' + BRAND.border + ';border-radius:8px;padding:6px 8px;font-size:12px;font-family:inherit}\
.thread-icon-btn{border:1px solid ' + BRAND.border + ';background:0;color:' + BRAND.muted + ';border-radius:8px;width:26px;height:26px;flex-shrink:0;cursor:pointer;font-size:12px;line-height:1;display:grid;place-items:center}\
.thread-icon-btn:hover{color:' + BRAND.text + ';border-color:' + BRAND.primary + '}\
.dot{width:8px;height:8px;border-radius:999px;background:' + BRAND.accent + ';flex-shrink:0}\
.close{margin-left:6px;background:transparent;border:0;color:' + BRAND.muted + ';cursor:pointer;font-size:20px;line-height:1;padding:2px 4px}\
.ghost-btn{border:1px solid ' + BRAND.border + ';background:rgba(15,23,42,.7);color:' + BRAND.text + ';border-radius:10px;padding:8px 10px;font-size:11px;font-weight:700;cursor:pointer}\
.ghost-btn:hover{border-color:rgba(94,126,166,.5)}\
.ctx-strip{display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:8px 14px;border-bottom:1px solid ' + BRAND.border + ';background:' + BRAND.bg + ';font-size:11px;color:' + BRAND.muted + ';flex-shrink:0}\
.ctx-dot{opacity:.35}\
.log{flex:1;overflow-y:auto;padding:14px 12px;display:flex;flex-direction:column;gap:10px}\
.ai-msg{display:flex;gap:8px;align-items:flex-start}\
.ai-avatar{width:26px;height:26px;border-radius:9px;background:' + BRAND.accent + ';color:' + BRAND.bg + ';display:grid;place-items:center;font-size:13px;font-weight:900;flex-shrink:0}\
.ai-content{flex:1;min-width:0}\
.ai-bubble{padding:10px 12px;border-radius:4px 12px 12px 12px;background:' + BRAND.bg + ';border:1px solid ' + BRAND.border + ';color:' + BRAND.text + ';font-size:13px;line-height:1.55;word-break:break-word}\
.user-msg{display:flex;justify-content:flex-end}\
.user-bubble{max-width:88%;padding:10px 12px;border-radius:12px 4px 12px 12px;background:' + BRAND.primary + ';color:#fff;font-size:13px;line-height:1.55;word-break:break-word}\
.loading{display:flex;gap:5px;align-items:center;padding:10px 12px}\
.loading span{width:6px;height:6px;border-radius:50%;background:' + BRAND.accent + ';opacity:.4;animation:ndot 1.2s ease-in-out infinite}\
.loading span:nth-child(2){animation-delay:.2s}.loading span:nth-child(3){animation-delay:.4s}\
@keyframes ndot{0%,100%{opacity:.4;transform:scale(1)}50%{opacity:1;transform:scale(1.3)}}\
.plan{margin-top:8px;border:1px solid ' + BRAND.borderAccent + ';border-radius:10px;overflow:hidden}\
.plan-head{display:flex;align-items:center;gap:6px;padding:8px 10px;background:rgba(107,169,143,.08);font-size:11px;font-weight:800;cursor:pointer;user-select:none;color:' + BRAND.accent + ';letter-spacing:.04em}\
.plan-head .ph-arrow{margin-left:auto;transition:transform .18s ease}\
.plan-head.open .ph-arrow{transform:rotate(180deg)}\
.plan-body{padding:10px;font-size:12px;color:' + BRAND.muted + ';max-height:180px;overflow-y:auto;display:none}\
.plan-body.open{display:block}\
.plan-item{padding:6px 8px;border-radius:6px;background:' + BRAND.bg + ';margin-bottom:6px;line-height:1.4}\
.plan-item:last-child{margin-bottom:0}\
.plan-item b{display:block;margin-bottom:2px;color:' + BRAND.text + '}\
.screen-spec-card{margin-top:8px;border:1px solid rgba(111,174,143,.28);border-radius:10px;background:rgba(107,169,143,.06);padding:10px 12px;display:flex;flex-direction:column;gap:8px}\
.screen-spec-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;flex-wrap:wrap}\
.screen-spec-name{font-size:12px;font-weight:800;color:' + BRAND.text + '}\
.screen-spec-meta{font-size:11px;color:' + BRAND.muted + '}\
.screen-spec-actions{display:flex}\
.screen-spec-status{font-size:11px;min-height:14px}\
.screen-spec-status.info{color:' + BRAND.muted + '}\
.screen-spec-status.ok{color:#7CB79E}\
.screen-spec-status.err{color:#D68C8C}\
.screen-spec-hint{font-size:10px;color:' + BRAND.muted + ';line-height:1.4;opacity:.8}\
.scope-badge{display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:999px;background:rgba(94,126,166,.14);color:#A8BFD4;font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase}\
.preset-row{display:flex;flex-direction:column;gap:0;border-bottom:1px solid ' + BRAND.border + ';flex-shrink:0}\
.preset-section{display:flex;gap:6px;flex-wrap:wrap;padding:8px 10px 6px}\
.preset-label{padding:4px 10px;font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:' + BRAND.muted + ';background:rgba(11,16,32,.8)}\
.preset-btn{display:inline-flex;flex-direction:column;align-items:flex-start;gap:1px;border:1px solid ' + BRAND.border + ';border-radius:10px;background:rgba(15,23,42,.82);color:' + BRAND.text + ';padding:7px 10px;font-size:11px;font-weight:700;cursor:pointer;text-align:left;line-height:1.2;transition:border-color .15s,background .15s}\
.preset-btn:hover{border-color:rgba(94,126,166,.5);background:rgba(94,126,166,.1)}\
.preset-btn small{font-size:10px;font-weight:400;color:' + BRAND.muted + ';display:block}\
.ai-meta{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;padding-top:6px;border-top:1px solid rgba(94,126,166,.14)}\
.ai-meta-pill{display:inline-flex;align-items:center;padding:2px 6px;border-radius:999px;font-size:10px;font-weight:700;letter-spacing:.04em;background:rgba(15,23,42,.9);border:1px solid rgba(94,126,166,.18);color:' + BRAND.muted + '}\
.reference-note{margin-top:6px;font-size:11px;color:' + BRAND.muted + ';line-height:1.5}\
.compose{display:flex;gap:8px;padding:12px;border-top:1px solid ' + BRAND.border + ';flex-shrink:0}\
.compose input{flex:1;min-width:0;background:' + BRAND.bg + ';color:' + BRAND.text + ';border:1px solid ' + BRAND.border + ';border-radius:12px;padding:10px 12px;font-size:13px;outline:none}\
.compose input:focus{border-color:' + BRAND.primary + '}\
.compose button{border:0;border-radius:12px;padding:0 16px;min-height:40px;font-weight:800;font-size:15px;cursor:pointer;background:' + BRAND.primary + ';color:#fff;transition:background .15s}\
.compose button:hover{background:' + BRAND.primaryHover + '}\
.compose button:disabled{opacity:.45;cursor:default}\
.attach-btn{border:1px solid ' + BRAND.border + ';background:rgba(15,23,42,.7);color:' + BRAND.text + ';border-radius:12px;width:40px;min-height:40px;font-size:16px;cursor:pointer;flex-shrink:0}\
.attach-btn:hover{border-color:rgba(94,126,166,.5)}\
.attach-row{display:flex;gap:8px;flex-wrap:wrap;padding:0 12px;flex-shrink:0}\
.attach-row[hidden]{display:none}\
.attach-chip{position:relative;display:inline-flex;width:44px;height:44px;border-radius:10px;overflow:visible;border:1px solid ' + BRAND.border + '}\
.attach-chip-thumb{width:44px;height:44px;object-fit:cover;border-radius:9px}\
.attach-chip-remove{position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;background:' + BRAND.danger + ';color:#fff;border:2px solid ' + BRAND.bg + ';font-size:11px;line-height:1;cursor:pointer;padding:0}\
.attach-thumbs{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;justify-content:flex-end}\
.attach-thumb{width:64px;height:64px;object-fit:cover;border-radius:10px;border:1px solid rgba(255,255,255,.12)}\
.library-drawer{padding-bottom:12px}\
.library-body{padding:14px 16px 18px;overflow:auto;flex:1}\
.library-note{margin:0 0 14px;color:' + BRAND.muted + ';font-size:13px;line-height:1.45}\
.library-list{display:flex;flex-direction:column;gap:12px}\
.library-item{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:start;padding:14px;border:1px solid ' + BRAND.border + ';border-radius:16px;background:rgba(11,16,32,.92)}\
.library-item h3{margin:0 0 6px;font-size:15px;line-height:1.25}\
.library-item p{margin:0;color:' + BRAND.muted + ';font-size:12px;line-height:1.4}\
.library-status{display:inline-flex;align-items:center;padding:5px 8px;margin-bottom:8px;border-radius:999px;background:rgba(94,126,166,.18);color:#C7D6E5;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}\
.library-link,.library-copy{align-self:center}\
.library-link{border:0;border-radius:12px;padding:0 14px;min-height:38px;font-weight:800;cursor:pointer;background:' + BRAND.primary + ';color:#fff}\
.library-link:hover{background:' + BRAND.primaryHover + '}\
.library-empty,.empty-state,.loading-panel{padding:18px;border:1px dashed ' + BRAND.border + ';border-radius:16px;color:' + BRAND.muted + ';font-size:13px;line-height:1.5;background:rgba(11,16,32,.82)}\
.empty-state.slim{padding:12px}\
.settings-shell{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:0;transition:opacity .18s ease}\
.settings-shell[hidden]{display:none}\
.settings-shell.open{pointer-events:auto;opacity:1}\
.settings-backdrop{position:absolute;inset:0;background:rgba(2,6,23,.72);backdrop-filter:blur(8px)}\
.settings-modal{position:relative;width:min(1320px,calc(100vw - 40px));max-height:calc(100vh - 40px);display:flex;flex-direction:column;border:1px solid ' + BRAND.border + ';border-radius:26px;background:linear-gradient(180deg,rgba(20,25,35,.78),rgba(12,16,23,.82));backdrop-filter:' + BRAND.glass + ';-webkit-backdrop-filter:' + BRAND.glass + ';box-shadow:0 40px 120px rgba(2,6,23,.45);overflow:hidden}\
.settings-head{display:flex;align-items:center;gap:12px;padding:18px 22px;border-bottom:1px solid ' + BRAND.border + ';background:linear-gradient(180deg,rgba(19,30,53,.98),rgba(12,17,30,.92));flex-shrink:0}\
.settings-head h2{margin:0;font-size:20px;line-height:1.1;font-weight:900}\
.settings-head p{margin:4px 0 0;color:' + BRAND.muted + ';font-size:12px}\
.settings-tabs{display:flex;gap:8px;padding:14px 18px;border-bottom:1px solid ' + BRAND.border + ';overflow:auto;background:rgba(9,14,27,.85);flex-shrink:0}\
.settings-tab{border:1px solid ' + BRAND.border + ';border-radius:999px;background:rgba(15,23,42,.72);color:' + BRAND.muted + ';padding:9px 14px;font-size:12px;font-weight:800;cursor:pointer;white-space:nowrap}\
.settings-tab.active{background:' + BRAND.primary + ';border-color:' + BRAND.primary + ';color:#fff}\
.settings-body{padding:18px;overflow:auto;flex:1;display:flex;flex-direction:column;gap:18px}\
.settings-section-head{display:flex;align-items:flex-end;justify-content:space-between;gap:14px}\
.settings-section-head.slim{margin-top:8px}\
.settings-section-head h3{margin:0 0 6px;font-size:18px}\
.settings-section-head p{margin:0;color:' + BRAND.muted + ';font-size:12px;line-height:1.5}\
.settings-toolbar{display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px}\
.field-row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}\
.field-row.compact{grid-template-columns:repeat(2,minmax(0,1fr))}\
.field-row .grow,.settings-toolbar .grow{grid-column:auto / span 1}\
.field{display:flex;flex-direction:column;gap:7px}\
.field label{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:' + BRAND.muted + ';font-weight:800}\
.text-input,.select-input{width:100%;border:1px solid ' + BRAND.border + ';border-radius:14px;background:rgba(7,12,24,.92);color:' + BRAND.text + ';padding:11px 12px;font-size:13px;outline:none}\
.text-input:focus,.select-input:focus{border-color:' + BRAND.primary + '}\
.saved-key{padding:11px 12px;border-radius:14px;background:rgba(7,12,24,.92);border:1px solid ' + BRAND.border + ';color:' + BRAND.text + ';font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:13px}\
.provider-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px}\
.provider-card,.model-card,.assignment-card,.placeholder-block{border:1px solid ' + BRAND.border + ';border-radius:20px;background:' + BRAND.surfaceSoft + ';backdrop-filter:' + BRAND.glass + ';-webkit-backdrop-filter:' + BRAND.glass + ';padding:16px;display:flex;flex-direction:column;gap:12px}\
.provider-top,.model-head,.assignment-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}\
.provider-top h3,.model-copy h3,.assignment-top h4,.placeholder-block h3{margin:0;font-size:17px}\
.provider-top p,.model-copy p,.assignment-card p,.placeholder-block p,.model-desc,.provider-note,.provider-meta{margin:0;color:' + BRAND.muted + ';font-size:12px;line-height:1.5}\
.model-desc{min-height:54px}\
.provider-actions{display:flex;gap:10px;flex-wrap:wrap}\
.btn{border:0;border-radius:12px;padding:10px 14px;font-size:12px;font-weight:800;cursor:pointer}\
.btn.primary{background:' + BRAND.primary + ';color:#fff}\
.btn.primary:hover{background:' + BRAND.primaryHover + '}\
.btn.ghost{background:rgba(15,23,42,.82);color:' + BRAND.text + ';border:1px solid ' + BRAND.border + '}\
.btn.danger{background:rgba(127,29,29,.26);color:#fecaca;border:1px solid ' + BRAND.borderDanger + '}\
.btn.tiny{padding:8px 10px;font-size:11px}\
.btn:disabled{opacity:.45;cursor:default}\
.inline-controls{display:flex;align-items:center;justify-content:flex-start;gap:12px}\
.toggle{font-size:12px;color:' + BRAND.muted + '}\
.status-pill{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;border:1px solid transparent}\
.status-pill.success{background:rgba(107,169,143,.15);color:#a7f3d0;border-color:rgba(107,169,143,.32)}\
.status-pill.error{background:rgba(201,112,112,.14);color:#fecaca;border-color:rgba(201,112,112,.32)}\
.status-pill.info{background:rgba(94,126,166,.18);color:#C7D6E5;border-color:rgba(94,126,166,.32)}\
.status-pill.muted{background:rgba(148,163,184,.12);color:' + BRAND.muted + ';border-color:rgba(148,163,184,.18)}\
.flash,.inline-message{border-radius:14px;padding:12px 14px;font-size:13px;line-height:1.5;border:1px solid transparent}\
.flash.ok,.inline-message.ok{background:rgba(107,169,143,.12);color:#d1fae5;border-color:rgba(107,169,143,.28)}\
.flash.err,.inline-message.err{background:rgba(127,29,29,.28);color:#fecaca;border-color:rgba(201,112,112,.28)}\
.flash.warn,.inline-message.warn{background:rgba(120,53,15,.28);color:#fde68a;border-color:rgba(201,164,104,.28)}\
.flash.info,.inline-message.info{background:rgba(94,126,166,.14);color:#dbeafe;border-color:rgba(94,126,166,.3)}\
.tag-row,.chip-row{display:flex;gap:8px;flex-wrap:wrap}\
.tag,.chip-filter{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;background:rgba(15,23,42,.82);border:1px solid ' + BRAND.border + ';font-size:11px;color:' + BRAND.text + '}\
.chip-filter input{margin:0}\
.price-pill{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;background:' + BRAND.accentSoft + ';color:#d1fae5;padding:7px 10px;font-size:11px;font-weight:800}\
.provider-note{padding:12px 14px;border-radius:14px;background:rgba(15,23,42,.78);border:1px solid ' + BRAND.border + '}\
.model-grid,.assignment-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:14px}\
.radio-group{display:flex;gap:18px;flex-wrap:wrap;padding:12px 14px;border:1px solid ' + BRAND.border + ';border-radius:16px;background:rgba(7,12,24,.82);font-size:13px}\
.radio-group label{display:flex;align-items:center;gap:8px;color:' + BRAND.text + '}\
.fallback-list{display:flex;flex-direction:column;gap:10px}\
.fallback-item{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-radius:14px;border:1px solid ' + BRAND.border + ';background:rgba(7,12,24,.84)}\
.fallback-item strong,.fallback-item span{display:block}\
.fallback-item span{font-size:12px;color:' + BRAND.muted + ';margin-top:4px}\
.action-field{justify-content:flex-end}\
.error-text{color:#fecaca}\
.model-list{display:flex;flex-direction:column;gap:8px}\
.model-card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}\
.model-card-main{flex:1;min-width:0}\
.model-card-title{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-bottom:4px}\
.model-card-name{font-weight:700;color:#fff;font-size:14px}\
.model-card-provider{font-size:10px;color:#8b93a6}\
.model-card-stats{display:flex;gap:12px;font-size:11px;color:#8b93a6;flex-wrap:wrap}\
.vision-note.yes{color:#9B8FBF}\
.vision-note.no{color:#5f6673}\
.model-card-actions{display:flex;gap:6px;flex-shrink:0;align-items:center}\
.badge{font-size:9px;padding:2px 6px;border-radius:5px;font-weight:800;text-transform:uppercase}\
.badge-free{background:rgba(196,173,110,.14);color:#C4AD6E}\
.badge-vision{background:rgba(155,143,191,.14);color:#9B8FBF}\
.badge-used{background:rgba(111,174,143,.12);color:#6FAE8F;text-transform:none;font-weight:700}\
.model-desc-row{margin-top:6px;font-size:11px;color:#8b93a6;line-height:1.5}\
.model-desc-toggle{margin-left:6px;background:none;border:none;color:#7B9BC0;font-size:11px;cursor:pointer;padding:0}\
.assign-popover{margin-top:10px;padding:10px 12px;border-radius:10px;background:rgba(111,174,143,.05);border:1px solid rgba(111,174,143,.2);display:flex;align-items:center;gap:8px;flex-wrap:wrap}\
.assign-popover-label{font-size:11px;color:#6FAE8F;font-weight:600}\
.select-input.small{padding:5px 8px;font-size:11px;width:auto}\
.ok-btn{padding:5px 14px;border-radius:8px;border:none;background:#6FAE8F;color:#000;font-size:11px;font-weight:700;cursor:pointer}\
.cancel-btn{padding:5px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.08);background:transparent;color:#555;font-size:11px;cursor:pointer}\
.filter-sort-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}\
.filter-sort-spacer{flex:1}\
.filter-toggle{display:flex;align-items:center;gap:5px;cursor:pointer;font-size:12px;color:#555;user-select:none}\
.filter-toggle input{margin:0}\
.filter-toggle.free.active{color:#C4AD6E}\
.filter-toggle.vision.active{color:#9B8FBF}\
.sort-label{font-size:11px;color:#444}\
.sort-btn{padding:4px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.06);background:transparent;color:#555;font-size:11px;font-weight:600;cursor:pointer}\
.sort-btn.active{border-color:rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fff}\
.test-all-btn{display:flex;align-items:center;gap:5px;padding:5px 12px;border-radius:9px;border:1px solid rgba(123,155,192,.3);background:rgba(123,155,192,.08);color:#7B9BC0;font-size:11px;font-weight:600;cursor:pointer}\
.test-all-btn:disabled{opacity:.6;cursor:not-allowed}\
.assign-toggle-btn{padding:4px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:#777;font-size:11px;font-weight:600;cursor:pointer}\
.assign-toggle-btn.active{border-color:rgba(111,174,143,.4);background:rgba(111,174,143,.1);color:#6FAE8F}\
.ping-ok{font-size:11px;color:#7CB79E;font-weight:600;white-space:nowrap}\
.ping-error{font-size:11px;color:#D68C8C;font-weight:600;white-space:nowrap}\
.ping-spinner{display:inline-block;width:12px;height:12px;border-radius:50%;border:2px solid rgba(123,155,192,.25);border-top-color:#7B9BC0;animation:nfspin 1s linear infinite;flex-shrink:0}\
@keyframes nfspin{to{transform:rotate(360deg)}}\
.provider-save-btn{min-width:60px;transition:background .2s}\
.key-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:rgba(148,163,184,.4);margin-right:6px}\
.key-dot.ok{background:#7CB79E}\
@media (max-width:1180px){.settings-toolbar,.field-row{grid-template-columns:repeat(2,minmax(0,1fr))}}\
@media (max-width:980px){.dashboard-shell{left:16px!important;width:min(calc(100vw - 32px),1120px)}.action-row{grid-template-columns:1fr}.settings-modal{width:calc(100vw - 24px);max-height:calc(100vh - 24px)}.settings-toolbar,.field-row,.field-row.compact{grid-template-columns:1fr}.panel,.library-drawer{width:100%;max-width:100vw}}\
</style>\
<div class="layer">\
  <section class="dashboard-shell" id="dashboard-shell" hidden>\
    <div class="action-row">\
      <button class="action-card" type="button" data-action="create">\
        <span class="action-kicker">Nofida</span>\
        <p class="action-title">Создать файл</p>\
        <p class="action-copy">Быстрый вход в новый проект без зависимости от React-плейсхолдера.</p>\
        <span class="action-foot">Нативный flow создания файла</span>\
      </button>\
      <button class="action-card" type="button" data-action="import">\
        <span class="action-kicker">Import</span>\
        <p class="action-title">Импортировать .penpot</p>\
        <p class="action-copy">Загрузка идет напрямую через нативный drop flow рабочего дашборда.</p>\
        <span class="action-foot">Готово для локальных файлов</span>\
      </button>\
      <button class="action-card" type="button" data-action="libraries">\
        <span class="action-kicker">Libraries</span>\
        <p class="action-title">Ресурсный центр</p>\
        <p class="action-copy">Контекстный каталог ресурсов NOFIDA с явным переходом в ресурсный центр при необходимости.</p>\
        <span class="action-foot">Рекомендации в панели, открытие центра только по явной команде</span>\
      </button>\
    </div>\
  </section>\
  <button class="fab" id="fab" type="button" title="NOFIDA AI" aria-label="NOFIDA AI">\
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">\
      <path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z"/>\
      <path d="M19 14l.8 2 .2.8 2 .8-2 .2-.2.8-.8 2-.8-2-.2-.8-2-.8 2-.2.2-.8z"/>\
    </svg>\
  </button>\
  <aside class="panel" id="assistant-panel" role="dialog" aria-label="NOFIDA AI">\
    <div class="panel-head">\
      <span class="dot"></span>\
      <h2>NOFIDA AI</h2>\
      <small id="transport">bridge: …</small>\
      <button class="ghost-btn" type="button" data-action="open-settings">Settings</button>\
      <button class="close" type="button" data-close="assistant" aria-label="Закрыть">×</button>\
    </div>\
    <div class="thread-bar" id="thread-bar">\
      <select class="thread-select" id="thread-select" aria-label="Задача/чат"><option value="">Новый чат</option></select>\
      <button class="thread-icon-btn" type="button" data-action="new-thread" title="Новый чат">+</button>\
      <button class="thread-icon-btn" type="button" data-action="rename-thread" title="Переименовать чат">✎</button>\
      <button class="thread-icon-btn" type="button" data-action="delete-thread" title="Удалить чат">🗑</button>\
    </div>\
    <div class="ctx-strip" id="ctx-strip">\
      <span class="scope-badge" id="ctx-scope">Dashboard</span>\
      <span id="ctx-file">—</span>\
      <span class="ctx-dot">·</span>\
      <span id="ctx-page">—</span>\
      <span class="ctx-dot">·</span>\
      <span id="ctx-sel">0 объектов</span>\
    </div>\
    <div class="preset-row" id="preset-row"></div>\
    <div class="log" id="log">\
      <div class="ai-msg">\
        <div class="ai-avatar">N</div>\
        <div class="ai-content">\
          <div class="ai-bubble">Привет! Я <b>NOFIDA AI</b> — оператор дизайна.<br><br>Выберите задачу из кнопок выше или напишите запрос:<br>• «какую библиотеку взять для SaaS?»<br>• «проверь экран на проблемы»<br>• «что в этом файле?»<br><br>Для настройки провайдера откройте <b>Settings</b>.</div>\
        </div>\
      </div>\
    </div>\
    <div class="attach-row" id="attach-row" hidden></div>\
    <form class="compose" id="compose">\
      <button type="button" class="attach-btn" id="attach-btn" title="Прикрепить референс (изображение)">📎</button>\
      <input id="prompt" placeholder="Спросите NOFIDA AI…" autocomplete="off" />\
      <button type="submit" id="send-btn">→</button>\
    </form>\
    <input type="file" id="attach-file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden />\
  </aside>\
  <aside class="library-drawer" id="library-drawer" role="dialog" aria-label="NOFIDA Libraries">\
    <div class="panel-head">\
      <span class="dot"></span>\
      <h2>Ресурсный центр NOFIDA</h2>\
      <small>preview before opening</small>\
      <button class="close" type="button" data-close="libraries" aria-label="Закрыть">×</button>\
    </div>\
    <div class="library-body">\
      <p class="library-note">Каталог читается из server-side store. Переход в полноэкранный ресурсный центр или открытие файла в редакторе происходит только по явной команде.</p>\
      <div class="library-list" id="library-list"><div class="library-empty">Загрузка каталога…</div></div>\
    </div>\
  </aside>\
  <div class="settings-shell" id="settings-shell" hidden>\
    <div class="settings-backdrop" data-action="close-settings"></div>\
    <section class="settings-modal" role="dialog" aria-label="NOFIDA AI Settings">\
      <div class="settings-head">\
        <span class="dot"></span>\
        <div style="flex:1">\
          <h2>NOFIDA AI Settings</h2>\
          <p>Provider keys, model library, engine routing, and safe role assignments.</p>\
        </div>\
        <button class="ghost-btn" type="button" data-action="refresh-settings">Refresh</button>\
        <button class="close" type="button" data-action="close-settings" aria-label="Close settings">×</button>\
      </div>\
      <div class="settings-tabs" id="settings-tabs">' +
        SETTINGS_TABS.map(function (tab) {
          return '<button class="settings-tab" type="button" data-settings-tab="' + escapeHtml(tab.id) + '">' + escapeHtml(tab.label) + "</button>";
        }).join("") +
      '</div>\
      <div class="settings-body" id="settings-body"></div>\
    </section>\
  </div>\
  <input id="import-file" type="file" accept=".penpot" multiple hidden />\
</div>';

    state.els.dashboard = state.root.getElementById("dashboard-shell");
    state.els.fab = state.root.getElementById("fab");
    state.els.panel = state.root.getElementById("assistant-panel");
    state.els.transport = state.root.getElementById("transport");
    state.els.ctxScope = state.root.getElementById("ctx-scope");
    state.els.ctxFile = state.root.getElementById("ctx-file");
    state.els.ctxPage = state.root.getElementById("ctx-page");
    state.els.ctxSel = state.root.getElementById("ctx-sel");
    state.els.presetRow = state.root.getElementById("preset-row");
    state.els.log = state.root.getElementById("log");
    state.els.form = state.root.getElementById("compose");
    state.els.input = state.root.getElementById("prompt");
    state.els.sendBtn = state.root.getElementById("send-btn");
    state.els.attachRow = state.root.getElementById("attach-row");
    state.els.attachBtn = state.root.getElementById("attach-btn");
    state.els.attachFile = state.root.getElementById("attach-file");
    state.els.threadSelect = state.root.getElementById("thread-select");
    state.els.drawer = state.root.getElementById("library-drawer");
    state.els.libraryList = state.root.getElementById("library-list");
    state.els.importFile = state.root.getElementById("import-file");
    state.els.settingsShell = state.root.getElementById("settings-shell");
    state.els.settingsBody = state.root.getElementById("settings-body");
  }

  function appendUserMsg(text, attachments) {
    var div = document.createElement("div");
    div.className = "user-msg";
    var bubble = document.createElement("div");
    bubble.className = "user-bubble";
    bubble.textContent = text;
    div.appendChild(bubble);
    if (attachments && attachments.length) {
      var thumbs = document.createElement("div");
      thumbs.className = "attach-thumbs";
      attachments.forEach(function (att) {
        var img = document.createElement("img");
        img.className = "attach-thumb";
        img.src = att.previewUrl;
        img.alt = att.name || "reference";
        thumbs.appendChild(img);
      });
      div.appendChild(thumbs);
    }
    state.els.log.appendChild(div);
    state.els.log.scrollTop = state.els.log.scrollHeight;
  }

  function renderAttachRow() {
    if (!state.els.attachRow) return;
    var items = state._pendingAttachments;
    if (!items.length) {
      state.els.attachRow.hidden = true;
      state.els.attachRow.innerHTML = "";
      return;
    }
    state.els.attachRow.hidden = false;
    state.els.attachRow.innerHTML = items.map(function (att, index) {
      return [
        '<span class="attach-chip">',
        '  <img class="attach-chip-thumb" src="' + escapeHtml(att.previewUrl) + '" alt="" />',
        '  <button type="button" class="attach-chip-remove" data-action="remove-attachment" data-attach-index="' + index + '" title="Убрать">×</button>',
        "</span>"
      ].join("");
    }).join("");
  }

  function handleAttachFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    var room = 4 - state._pendingAttachments.length;
    files = files.slice(0, Math.max(0, room));
    files.forEach(function (file) {
      if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return;
      if (file.size > 6 * 1024 * 1024) {
        appendAiMsg("⚠ Файл " + file.name + " слишком большой (макс. 6 МБ).", null);
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        var dataUrl = String(reader.result || "");
        var match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
        if (!match) return;
        state._pendingAttachments.push({
          mimeType: match[1],
          dataBase64: match[2],
          previewUrl: dataUrl,
          name: file.name
        });
        renderAttachRow();
      };
      reader.readAsDataURL(file);
    });
  }

  function removeAttachment(index) {
    state._pendingAttachments.splice(index, 1);
    renderAttachRow();
  }

  function renderPlan(plan) {
    if (!plan) return null;

    var wrap = document.createElement("div");
    wrap.className = "plan";

    // Support both new format (operations[]) and legacy format (items[])
    var ops = [];
    if (Array.isArray(plan.operations) && plan.operations.length > 0) {
      ops = plan.operations.map(function (op) {
        return {
          label: op.targetName || op.type || "Operation",
          detail: op.description || op.rationale || "",
          confidence: op.confidence
        };
      });
    } else if (Array.isArray(plan.items) && plan.items.length > 0) {
      ops = plan.items.map(function (item) {
        return {
          label: item.issue || item.title || item.screen_name || item.catalog_id || "Item",
          detail: item.suggestion || item.reason || item.purpose || ""
        };
      });
    }

    var opType = (Array.isArray(plan.operations) && plan.operations[0])
      ? plan.operations[0].type
      : (plan.operation || "plan");

    var head = document.createElement("div");
    head.className = "plan-head";
    head.innerHTML = [
      "<span>Preview plan</span>",
      "<span style='opacity:.72'>" + escapeHtml(opType) + "</span>",
      "<span style='margin-left:auto;font-size:9px;opacity:.6'>preview-only · apply=false</span>",
      "<span class='ph-arrow'>▾</span>"
    ].join("");

    var body = document.createElement("div");
    body.className = "plan-body";

    if (ops.length === 0) {
      var empty = document.createElement("div");
      empty.className = "plan-item";
      empty.innerHTML = "<b>No operations in this plan</b>";
      body.appendChild(empty);
    } else {
      ops.forEach(function (op) {
        var el = document.createElement("div");
        el.className = "plan-item";
        var conf = op.confidence !== undefined ? " <span style='opacity:.55'>(" + Math.round(op.confidence * 100) + "%)</span>" : "";
        el.innerHTML = "<b>" + escapeHtml(op.label) + conf + "</b>" + (op.detail ? "<span>" + escapeHtml(op.detail) + "</span>" : "");
        body.appendChild(el);
      });
    }

    head.addEventListener("click", function () {
      var open = body.classList.toggle("open");
      head.classList.toggle("open", open);
    });

    wrap.appendChild(head);
    wrap.appendChild(body);
    return wrap;
  }

  function countScreenSpecNodes(node) {
    var n = 1;
    var children = (node && node.children) || [];
    for (var i = 0; i < children.length; i++) n += countScreenSpecNodes(children[i]);
    return n;
  }

  function renderScreenSpecCard(spec, specId) {
    var wrap = document.createElement("div");
    wrap.className = "screen-spec-card";
    var name = (spec && spec.name) || "Screen";
    var dims = spec ? (spec.width + "×" + spec.height) : "";
    var nodeCount = countScreenSpecNodes(spec);
    wrap.innerHTML = [
      '<div class="screen-spec-head">',
      '  <span class="screen-spec-name">' + escapeHtml(name) + "</span>",
      '  <span class="screen-spec-meta">' + escapeHtml(dims) + " · " + nodeCount + " объект(ов)</span>",
      "</div>",
      '<div class="screen-spec-actions">',
      '  <button class="btn primary" type="button" data-action="apply-screen-spec" data-screen-spec-id="' + escapeHtml(specId) + '">Применить на холст</button>',
      "</div>",
      '<div class="screen-spec-status" data-screen-spec-status="' + escapeHtml(specId) + '"></div>',
      '<div class="screen-spec-hint">Не то? Опишите, что изменить, в чате — я пересоберу с учётом правок, не трогая уже применённые варианты.</div>'
    ].join("");
    return wrap;
  }

  function applyScreenSpecToCanvas(specId, spec, buttonEl) {
    if (!spec) return;
    var statusEl = state.els.log ? state.els.log.querySelector('[data-screen-spec-status="' + specId + '"]') : null;
    if (buttonEl) buttonEl.disabled = true;
    if (statusEl) { statusEl.textContent = "Применяю…"; statusEl.className = "screen-spec-status info"; }

    if (!state.bridge || typeof state.bridge.applyScreenSpec !== "function") {
      if (statusEl) { statusEl.textContent = "⚠ Мост с плагином не подключён."; statusEl.className = "screen-spec-status err"; }
      if (buttonEl) buttonEl.disabled = false;
      return;
    }

    state.bridge.applyScreenSpec(spec).then(function (result) {
      if (buttonEl) buttonEl.disabled = false;
      if (result && result.ok) {
        if (statusEl) { statusEl.textContent = "✓ " + (result.message || "Готово"); statusEl.className = "screen-spec-status ok"; }
        if (buttonEl) buttonEl.textContent = "Применить ещё раз";
      } else {
        if (statusEl) { statusEl.textContent = "⚠ " + ((result && result.message) || "Не удалось применить."); statusEl.className = "screen-spec-status err"; }
      }
    }).catch(function (err) {
      if (buttonEl) buttonEl.disabled = false;
      if (statusEl) { statusEl.textContent = "⚠ " + (err && err.message || "Ошибка применения."); statusEl.className = "screen-spec-status err"; }
    });
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

    if (plan) { var planEl = renderPlan(plan); if (planEl) content.appendChild(planEl); }

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

  function updateCtxStrip(ctx) {
    state._fileContext = ctx;
    var scope = getAIScope();

    // Scope badge
    if (state.els.ctxScope) {
      var scopeLabels = {
        "dashboard": "Dashboard",
        "editor_file": "Editor",
        "editor_page": "Editor · Page",
        "editor_selection": "Editor · Selection"
      };
      state.els.ctxScope.textContent = scopeLabels[scope] || scope;
    }

    if (ctx) {
      if (ctx.file && state.els.ctxFile) state.els.ctxFile.textContent = ctx.file.name;
      if (ctx.page && state.els.ctxPage) state.els.ctxPage.textContent = ctx.page.name;
      if (state.els.ctxSel) {
        state.els.ctxSel.textContent = ((ctx.selection || []).length || 0) + " выбрано";
      }
    }

    updatePresetRow();
  }

  function updatePresetRow() {
    if (!state.els.presetRow) return;
    var presets = getActivePresets();
    var scope = getAIScope();
    var isDash = scope === "dashboard";

    var html = [
      '<div class="preset-label">' + (isDash ? "Dashboard AI" : "Editor AI") + "</div>",
      '<div class="preset-section">'
    ];
    for (var i = 0; i < presets.length; i++) {
      var p = presets[i];
      html.push(
        '<button class="preset-btn" type="button" data-action="preset-task" data-task-type="' +
        escapeHtml(p.taskType) + '">' +
        escapeHtml(p.label) +
        '<small>' + escapeHtml(p.desc) + "</small>" +
        "</button>"
      );
    }
    html.push("</div>");
    state.els.presetRow.innerHTML = html.join("");
  }

  function requestContext() {
    if (!state.bridge || !state.bridge.extractContext) return;
    state.bridge.extractContext().then(function (ctx) {
      if (ctx) updateCtxStrip(ctx);
    }).catch(function () {});
  }

  // Handle the structured NofidaAITaskResult envelope returned by /api/nofida/ai/ask
  function handleTaskResult(data) {
    if (!data) {
      appendAiMsg("⚠ NOFIDA AI returned an empty response.", null);
      return;
    }

    var status = data.status;

    // Error states: show actionable messages, not raw API errors
    if (status === "provider_missing") {
      appendAiMsg(
        "⚙ No AI provider configured.\n\nOpen Account → NOFIDA AI → API Configuration.",
        null
      );
      return;
    }
    if (status === "model_missing") {
      appendAiMsg(
        "⚙ No model assigned for this task.\n\nOpen Account → NOFIDA AI → Model Library.",
        null
      );
      return;
    }
    if (status === "context_missing") {
      appendAiMsg(
        "⚙ Open a file or select a canvas object to use this AI action.",
        null
      );
      return;
    }
    if (!data.ok && status === "failed") {
      appendAiMsg("⚠ " + (data.message || "AI request failed. Check server configuration."), null);
      return;
    }
    if (!data.ok) {
      appendAiMsg("⚠ " + (data.message || "AI request failed."), null);
      return;
    }

    if (data.status === "screen_spec_ready" && data.screenSpec) {
      var specId = "spec-" + (++state._screenSpecSeq);
      state._screenSpecs[specId] = data.screenSpec;
      state._lastScreenSpec = data.screenSpec;
      var specRow = appendAiMsg(data.message || "Экран готов.", null);
      if (specRow) {
        var specContent = specRow.querySelector(".ai-content");
        var cardEl = renderScreenSpecCard(data.screenSpec, specId);
        if (specContent) specContent.appendChild(cardEl);
        appendReferenceNote(specRow, data.referenceResults);
        // Autonomous execution: apply to the canvas immediately, no manual
        // confirm step. The button stays visible to re-apply after further
        // chat-driven edits; Ctrl+Z covers "undo this" the same way it does
        // for any other canvas change.
        var applyBtn = cardEl.querySelector('[data-action="apply-screen-spec"]');
        applyScreenSpecToCanvas(specId, data.screenSpec, applyBtn);
      }
      return;
    }
    if (data.status === "invalid_screen_spec") {
      appendAiMsg("⚠ " + (data.message || "AI вернул некорректную структуру экрана. Попробуйте переформулировать запрос."), null);
      return;
    }

    var text = data.resultText || data.answer || "NOFIDA AI returned an empty response.";
    var plan = data.operationPlan || data.operation_plan || null;

    // Build metadata footer pills
    var metaParts = [];
    if (status === "preview_only") metaParts.push("preview-only");
    if (data.taskType) metaParts.push(data.taskType.replace(/_/g, " "));
    if (data.model && data.model.providerId) {
      metaParts.push(data.model.providerId + (data.model.modelId ? " · " + data.model.modelId.split("/").pop() : ""));
    }
    if (data.prompt && data.prompt.version) metaParts.push("prompt " + data.prompt.version);

    var row = appendAiMsg(text, plan);
    if (row && metaParts.length > 0) {
      var content = row.querySelector(".ai-content");
      if (content) {
        var meta = document.createElement("div");
        meta.className = "ai-meta";
        metaParts.forEach(function (part) {
          var pill = document.createElement("span");
          pill.className = "ai-meta-pill";
          pill.textContent = part;
          meta.appendChild(pill);
        });
        content.appendChild(meta);
      }
    }
    appendReferenceNote(row, data.referenceResults);
  }

  // ============================================================
  // CHAT THREADS — one thread per task, each with its own persisted
  // history (see services/nofida-hub-adapter/ai/thread-store.mjs).
  // ============================================================
  function makeClientId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function renderThreadSelectOptions() {
    if (!state.els.threadSelect) return;
    var options = ['<option value="">Новый чат</option>'].concat(
      state.threads.map(function (t) {
        var selected = t.id === state.activeThreadId ? " selected" : "";
        return '<option value="' + escapeHtml(t.id) + '"' + selected + ">" + escapeHtml(t.title) + "</option>";
      })
    );
    state.els.threadSelect.innerHTML = options.join("");
    if (!state.activeThreadId) state.els.threadSelect.value = "";
  }

  function refreshThreadsList() {
    return fetch(AI_THREADS_URL, { credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        state.threadsLoaded = true;
        if (data && Array.isArray(data.threads)) state.threads = data.threads;
        renderThreadSelectOptions();
      })
      .catch(function () { state.threadsLoaded = true; });
  }

  function clearLog() {
    state.els.log.innerHTML = "";
  }

  function startNewThread() {
    state.activeThreadId = null;
    state._lastScreenSpec = null;
    clearLog();
    appendAiMsg("Новый чат. Опишите задачу, и я буду держать в памяти весь этот разговор.", null);
    renderThreadSelectOptions();
  }

  function switchThread(threadId) {
    if (!threadId) { startNewThread(); return; }
    if (threadId === state.activeThreadId) return;
    fetch(AI_THREADS_URL + "/" + encodeURIComponent(threadId), { credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.thread) {
          appendAiMsg("⚠ Не удалось загрузить этот чат.", null);
          return;
        }
        state.activeThreadId = threadId;
        clearLog();
        var lastSpec = null;
        (data.thread.messages || []).forEach(function (m) {
          if (m.role === "user") appendUserMsg(m.text, null);
          else {
            appendAiMsg(m.text, null);
            if (m.screenSpec) lastSpec = m.screenSpec;
          }
        });
        state._lastScreenSpec = lastSpec;
        renderThreadSelectOptions();
      })
      .catch(function () {
        appendAiMsg("⚠ Не удалось загрузить этот чат.", null);
      });
  }

  function renameActiveThread() {
    if (!state.activeThreadId) {
      appendAiMsg("⚠ Сначала отправьте хотя бы одно сообщение, чтобы создать чат.", null);
      return;
    }
    var current = state.threads.filter(function (t) { return t.id === state.activeThreadId; })[0];
    var title = window.prompt("Название чата:", current ? current.title : "");
    if (title === null) return;
    fetch(AI_THREADS_URL + "/" + encodeURIComponent(state.activeThreadId), {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title })
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function () { refreshThreadsList(); });
  }

  function deleteActiveThread() {
    if (!state.activeThreadId) return;
    if (!window.confirm("Удалить этот чат вместе с историей?")) return;
    var idToDelete = state.activeThreadId;
    fetch(AI_THREADS_URL + "/" + encodeURIComponent(idToDelete), {
      method: "DELETE",
      credentials: "same-origin"
    })
      .then(function () {
        startNewThread();
        refreshThreadsList();
      });
  }

  function appendReferenceNote(row, referenceResults) {
    if (!row || !Array.isArray(referenceResults) || referenceResults.length === 0) return;
    var content = row.querySelector(".ai-content");
    if (!content) return;
    var note = document.createElement("div");
    note.className = "reference-note";
    note.innerHTML = referenceResults.map(function (r) {
      return r.ok
        ? "✓ референс по ссылке добавлен" + (r.title ? ": " + escapeHtml(r.title) : "")
        : "⚠ не удалось загрузить превью по ссылке (" + escapeHtml(r.reason || "ошибка") + ")";
    }).join("<br>");
    content.appendChild(note);
  }

  // Core AI task sender. All AI actions route through here.
  // taskType: explicit task type from a preset button, or null for free-text
  // userPrompt: the raw user message
  function sendAiTask(taskType, userPrompt) {
    if (state._aiLoading) return;

    var pendingAttachments = state._pendingAttachments.slice();
    var displayLabel = userPrompt || (taskType ? taskType.replace(/_/g, " ") : "");
    if (displayLabel || pendingAttachments.length) appendUserMsg(displayLabel, pendingAttachments);
    state.els.input.value = "";
    state.els.sendBtn.disabled = true;
    state._aiLoading = true;
    state._pendingAttachments = [];
    renderAttachRow();

    var loadingEl = appendLoading();
    var scope = getAIScope();
    var context = state._fileContext ? Object.assign({}, state._fileContext) : {};
    if (state._lastScreenSpec) context.previousScreenSpec = state._lastScreenSpec;
    var referenceUrls = (String(userPrompt || "").match(/https?:\/\/[^\s]+/g) || []).slice(0, 2);

    ensureLibrariesConnected(context).then(function (resolvedContext) {
      return fetch(AI_ASK_URL, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskType: taskType || null,
          scope: scope,
          context: resolvedContext,
          userPrompt: userPrompt || "",
          attachments: pendingAttachments.map(function (a) {
            return { mimeType: a.mimeType, dataBase64: a.dataBase64 };
          }),
          referenceUrls: referenceUrls,
          threadId: state.activeThreadId || (state.activeThreadId = makeClientId())
        })
      });
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        loadingEl.remove();
        state._aiLoading = false;
        state.els.sendBtn.disabled = false;
        handleTaskResult(data);
        refreshThreadsList();
      })
      .catch(function (err) {
        loadingEl.remove();
        state._aiLoading = false;
        state.els.sendBtn.disabled = false;
        var msg = (err && err.message) ? err.message : "Ошибка связи с NOFIDA AI. Проверьте сервер.";
        appendAiMsg("⚠ " + msg, null);
      });
  }

  // Auto-connects NOFIDA Hub libraries the team already has into the working
  // file before the model runs, so it can reference real components — no
  // user confirmation, see plugin/code.js connectLibraries() for why that's
  // the right default for first-party Hub content. Best-effort: any failure
  // here just falls through with the original context, never blocks sending.
  function ensureLibrariesConnected(context) {
    var available = context && context.libraries && Array.isArray(context.libraries.available)
      ? context.libraries.available
      : [];
    if (!available.length || !state.bridge || typeof state.bridge.connectLibraries !== "function") {
      return Promise.resolve(context);
    }
    var ids = available.slice(0, 8).map(function (lib) { return lib.id; });
    return state.bridge.connectLibraries(ids).then(function (result) {
      if (result && Array.isArray(result.libraries) && result.libraries.length) {
        context.libraries = context.libraries || {};
        context.libraries.connected = result.libraries;
      }
      return context;
    }).catch(function () {
      return context;
    });
  }

  // Free-text chat entry point (submit button / Enter key)
  function sendAiMessage(message) {
    sendAiTask(null, message);
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

  function findCreateButton() {
    return document.querySelector(".main_ui_dashboard_projects__btn-primary")
      || document.querySelector(".main_ui_dashboard_placeholder__create-new")
      || Array.prototype.find.call(document.querySelectorAll("button"), function (button) {
        return /новый проект|new project|new file|новый файл/i.test(button.textContent || "");
      })
      || null;
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
    } catch (_error) {
      appendAiMsg("⚠ Браузер не дал переслать import через DataTransfer.", null);
    }
  }

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

  // ─────────────────────────────────────────────────────────────────────
  // PATCH 016C — Dashboard NOFIDA AI shortcut
  // ─────────────────────────────────────────────────────────────────────

  var _dashAIEntry = null;
  var _dashAIStylesDone = false;
  var _dashAIObserver = null;

  function findDashboardSidebarNav() {
    var selectors = [
      ".main_ui_dashboard_sidebar__sidebar-nav",
      "[class*='dashboard_sidebar'][class*='nav']",
      "[class*='dashboard_sidebar'][class*='menu']",
      "[class*='dashboard-sidebar'] nav",
      "[class*='dashboard-sidebar'] ul"
    ];
    for (var i = 0; i < selectors.length; i++) {
      var found = document.querySelector(selectors[i]);
      if (found) return found;
    }
    var navEls = document.querySelectorAll("nav, [role='navigation'], aside ul");
    for (var j = 0; j < navEls.length; j++) {
      if (/черновики|drafts|проекты|projects/i.test(navEls[j].textContent || "")) return navEls[j];
    }
    return document.querySelector("[class*='dashboard_sidebar']");
  }

  function ensureDashboardAIStyles() {
    if (_dashAIStylesDone || document.getElementById("nofida-ai-dash-style")) return;
    var style = document.createElement("style");
    style.id = "nofida-ai-dash-style";
    style.textContent = [
      "#nofida-ai-dash-entry{display:flex;align-items:center;gap:8px;padding:8px 12px;margin:4px 6px;",
      "border-radius:10px;font-size:13px;font-weight:700;color:#A8BFD4;",
      "text-decoration:none;cursor:pointer;",
      "background:rgba(94,126,166,.07);border:1px solid rgba(94,126,166,.2);",
      "transition:background .15s,border-color .15s;",
      "font-family:" + BRAND.font + ";box-sizing:border-box}",
      "#nofida-ai-dash-entry:hover{background:rgba(94,126,166,.14);border-color:rgba(94,126,166,.38)}",
      "#nofida-ai-dash-entry .nai-icon{display:flex;align-items:center;flex-shrink:0}",
      "#nofida-ai-dash-entry .nai-badge{font-size:9px;font-weight:900;padding:1px 5px;",
      "border-radius:999px;background:rgba(107,169,143,.18);color:#6ee7b7;",
      "letter-spacing:.06em;text-transform:uppercase;margin-left:auto}"
    ].join("");
    document.head.appendChild(style);
    _dashAIStylesDone = true;
  }

  function updateDashboardAIEntry() {
    if (!isDashboardRoute()) {
      if (_dashAIEntry && _dashAIEntry.parentNode) _dashAIEntry.parentNode.removeChild(_dashAIEntry);
      _dashAIEntry = null;
      if (_dashAIObserver) { _dashAIObserver.disconnect(); _dashAIObserver = null; }
      return;
    }

    var existing = document.getElementById("nofida-ai-dash-entry");
    if (existing) { _dashAIEntry = existing; return; }

    var nav = findDashboardSidebarNav();
    if (!nav) {
      if (!_dashAIObserver) {
        _dashAIObserver = new MutationObserver(function () { updateDashboardAIEntry(); });
        _dashAIObserver.observe(document.getElementById("app") || document.body, { childList: true, subtree: true });
      }
      return;
    }
    if (_dashAIObserver) { _dashAIObserver.disconnect(); _dashAIObserver = null; }

    ensureDashboardAIStyles();

    var entry = document.createElement("a");
    entry.id = "nofida-ai-dash-entry";
    entry.href = "javascript:void(0)"; // eslint-disable-line no-script-url
    entry.setAttribute("role", "menuitem");
    entry.setAttribute("aria-label", "NOFIDA AI — Настройки ИИ");
    entry.innerHTML = [
      '<span class="nai-icon">',
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">',
      '<path d="M12 3l1.5 3.8L17 8.3l-3.5 1.5L12 14l-1.5-4.2L7 8.3l3.5-1.5z"/>',
      '<path d="M18.5 14.5l.6 1.5.9.4-.9.1-.6 1.5-.6-1.5-.9-.1.9-.4z"/>',
      "</svg></span>",
      "NOFIDA AI",
      '<span class="nai-badge">AI</span>'
    ].join("");
    entry.addEventListener("click", function (ev) {
      ev.preventDefault();
      openAccountSettingsPage("api");
    });

    var nofidaGroup = document.getElementById("nofida-nav-dashboard-group");
    if (nofidaGroup && nofidaGroup.parentNode === nav) {
      nav.insertBefore(entry, nofidaGroup.nextSibling || null);
    } else {
      nav.appendChild(entry);
    }
    _dashAIEntry = entry;
  }

  // ─────────────────────────────────────────────────────────────────────
  // PATCH 017A — External Penpot link interception + white-label cleanup
  // ─────────────────────────────────────────────────────────────────────

  var _extLinkObserver = null;
  var _extLinkObserverRoot = null;
  var _extLinkObserverTimer = null;

  var PENPOT_EXT_DOMAINS = [
    "help.penpot.app",
    "community.penpot.app",
    "github.com/penpot",
    "penpot.app/",
    "penpot.app/learn",
    "penpot.app/blog",
    "penpot.app/penpothub",
    "penpot.app/hub",
    "penpot.app/libraries-templates",
    "penpot.app/pricing",
    "penpot.app/terms",
    "penpot.app/privacy",
    "penpot.app/changelog",
    "penpot.app/releases",
    "penpot.app/penpotfest",
    "penpot.app/why-beta",
    "blog.penpot.app"
  ];

  function isPenpotExternalHref(href) {
    var value = String(href || "").toLowerCase();
    return value.indexOf("penpot.app") >= 0 ||
      value.indexOf("help.penpot.app") >= 0 ||
      value.indexOf("community.penpot.app") >= 0 ||
      value.indexOf("blog.penpot.app") >= 0 ||
      value.indexOf("github.com/penpot") >= 0;
  }

  function resolveNofidaInternalRoute(href, text, ariaLabel, title) {
    var hay = normalizeText([href, text, ariaLabel, title].join(" "));
    if (!hay) return "#/nofida/help";

    if (hay.indexOf("penpothub") >= 0 ||
        hay.indexOf("libraries-templates") >= 0 ||
        hay.indexOf("/hub") >= 0 ||
        hay.indexOf(" hub") >= 0 ||
        hay.indexOf("библиотек") >= 0 ||
        hay.indexOf("шаблон") >= 0) {
      return "#/nofida/libraries";
    }
    if (hay.indexOf("privacy") >= 0 || hay.indexOf("конфиденц") >= 0) {
      return "#/nofida/privacy";
    }
    if (hay.indexOf("terms") >= 0 || hay.indexOf("услов") >= 0) {
      return "#/nofida/terms";
    }
    if (hay.indexOf("pricing") >= 0 || hay.indexOf("тариф") >= 0) {
      return "#/nofida/help";
    }
    if (hay.indexOf("penpotfest") >= 0 || hay.indexOf("festival") >= 0 || hay.indexOf("event") >= 0) {
      return "#/nofida/community";
    }
    if (hay.indexOf("why-beta") >= 0 || hay.indexOf("beta") >= 0) {
      return "#/nofida/learn";
    }
    if (hay.indexOf("changelog") >= 0 || hay.indexOf("what's new") >= 0 || hay.indexOf("измен") >= 0) {
      return "#/nofida/changelog";
    }
    if (hay.indexOf("release") >= 0 || hay.indexOf("релиз") >= 0 || hay.indexOf("blog") >= 0) {
      return "#/nofida/releases";
    }
    if (hay.indexOf("repository") >= 0 || hay.indexOf("repo") >= 0 ||
        hay.indexOf("github") >= 0 || hay.indexOf("репозит") >= 0) {
      return "#/nofida/repository";
    }
    if (hay.indexOf("community") >= 0 || hay.indexOf("feedback") >= 0 ||
        hay.indexOf("сообщест") >= 0) {
      return "#/nofida/community";
    }
    if (hay.indexOf("learn") >= 0 || hay.indexOf("guide") >= 0 ||
        hay.indexOf("обуч") >= 0) {
      return "#/nofida/learn";
    }
    if (hay.indexOf("help") >= 0 || hay.indexOf("support") >= 0 ||
        hay.indexOf("docs") >= 0 || hay.indexOf("справ") >= 0) {
      return "#/nofida/help";
    }
    return "#/nofida/help";
  }

  function replacePenpotCopy(value) {
    return String(value || "")
      .replace(/\bPenpot Hub\b/g, "NOFIDA Hub")
      .replace(/\bPenpot\b/g, "NOFIDA");
  }

  function normalizeBrandingRoots(scope) {
    if (!scope) {
      var defaultRoot = document.getElementById("app") || document.body;
      return defaultRoot ? [defaultRoot] : [];
    }
    if (scope.nodeType === 1 || scope.nodeType === 9) return [scope];
    return Array.prototype.filter.call(scope, function (node) {
      return !!node && (node.nodeType === 1 || node.nodeType === 9);
    });
  }

  function collectScopedNodes(scope, selector) {
    var roots = normalizeBrandingRoots(scope);
    var out = [];
    roots.forEach(function (root) {
      if (root.nodeType === 1 && root.matches && root.matches(selector)) out.push(root);
      if (root.querySelectorAll) {
        Array.prototype.push.apply(out, root.querySelectorAll(selector));
      }
    });
    return out;
  }

  function sanitizePenpotBrandingUi(scope) {
    collectScopedNodes(scope, "[title],[aria-label]").forEach(function (node) {
      var title = node.getAttribute("title");
      var ariaLabel = node.getAttribute("aria-label");
      if (title && /Penpot/i.test(title)) {
        node.setAttribute("title", replacePenpotCopy(title));
      }
      if (ariaLabel && /Penpot/i.test(ariaLabel)) {
        node.setAttribute("aria-label", replacePenpotCopy(ariaLabel));
      }
    });

    collectScopedNodes(scope, "svg title").forEach(function (node) {
      if (/Penpot/i.test(node.textContent || "")) {
        node.textContent = replacePenpotCopy(node.textContent || "");
      }
    });

    collectScopedNodes(scope, "a,button,span,small").forEach(function (node) {
      if (node.children && node.children.length) return;
      var text = node.textContent || "";
      if (!/Penpot/i.test(text) || text.length > 48) return;
      node.textContent = replacePenpotCopy(text);
    });
  }

  function interceptPenpotExternalLinks(scope) {
    collectScopedNodes(scope, "a[href]").forEach(function (link) {
      var href = link.getAttribute("href") || "";
      if (/^(?:\/)?#\/(?:nofida|dashboard|settings)(?:$|[/?#])/i.test(href) ||
          /^\/#\/(?:nofida|dashboard|settings)(?:$|[/?#])/i.test(href)) {
        link.removeAttribute("target");
        link.removeAttribute("rel");
        return;
      }
      if (link.getAttribute("data-nofida-ext")) return;
      var isExt = PENPOT_EXT_DOMAINS.some(function (d) { return href.indexOf(d) >= 0; }) || isPenpotExternalHref(href);
      if (!isExt) return;
      link.setAttribute("data-nofida-ext", "1");

      var dest = resolveNofidaInternalRoute(
        href,
        link.textContent || "",
        link.getAttribute("aria-label") || "",
        link.getAttribute("title") || ""
      );
      if (!dest) return;
      link.setAttribute("href", dest);
      link.removeAttribute("target");
      link.removeAttribute("rel");
    });

    sanitizePenpotBrandingUi(scope);
  }

  function stopExtLinkObserver() {
    if (_extLinkObserverTimer) {
      window.clearTimeout(_extLinkObserverTimer);
      _extLinkObserverTimer = null;
    }
    if (_extLinkObserver) _extLinkObserver.disconnect();
    _extLinkObserver = null;
    _extLinkObserverRoot = null;
  }

  function startExtLinkObserver() {
    var nextRoot = document.getElementById("app");
    if (!nextRoot || !window.MutationObserver) {
      stopExtLinkObserver();
      return;
    }
    if (_extLinkObserver && _extLinkObserverRoot === nextRoot) return;
    stopExtLinkObserver();

    _extLinkObserverRoot = nextRoot;
    _extLinkObserver = new MutationObserver(function (mutations) {
      var roots = [];
      mutations.forEach(function (mutation) {
        if (mutation.type === "attributes") {
          var attrTarget = mutation.target;
          if (!attrTarget || attrTarget.nodeType !== 1) return;
          if (attrTarget.closest && attrTarget.closest("#nofida-shell-root")) return;
          // Immediately strip target=_blank from internal links — no debounce needed.
          if (mutation.attributeName === "target" && attrTarget.tagName === "A") {
            var href = attrTarget.getAttribute("href") || "";
            if (/^(?:\/)?#\/(?:nofida|dashboard|settings|workspace)(?:$|[/?#])/i.test(href) ||
                /^\/#\/(?:nofida|dashboard|settings|workspace)(?:$|[/?#])/i.test(href)) {
              attrTarget.removeAttribute("target");
              attrTarget.removeAttribute("rel");
              return;
            }
          }
          roots.push(attrTarget);
          return;
        }
        Array.prototype.forEach.call(mutation.addedNodes || [], function (node) {
          if (!node || node.nodeType !== 1) return;
          if (node.closest && node.closest("#nofida-shell-root")) return;
          // Immediately fix internal _blank links on any newly added node tree.
          var linksToFix = node.tagName === "A"
            ? (node.getAttribute("target") === "_blank" ? [node] : [])
            : (node.querySelectorAll ? Array.prototype.slice.call(node.querySelectorAll('a[target="_blank"]')) : []);
          linksToFix.forEach(function (link) {
            var href = link.getAttribute("href") || "";
            if (/^(?:\/)?#\/(?:nofida|dashboard|settings|workspace)(?:$|[/?#])/i.test(href) ||
                /^\/#\/(?:nofida|dashboard|settings|workspace)(?:$|[/?#])/i.test(href)) {
              link.removeAttribute("target");
              link.removeAttribute("rel");
            }
          });
          roots.push(node);
        });
      });
      if (!roots.length) return;
      if (_extLinkObserverTimer) window.clearTimeout(_extLinkObserverTimer);
      _extLinkObserverTimer = window.setTimeout(function () {
        _extLinkObserverTimer = null;
        interceptPenpotExternalLinks(roots);
      }, 160);
    });
    _extLinkObserver.observe(nextRoot, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["href", "target", "rel"]
    });
  }

  // ─────────────────────────────────────────────────────────────────────

  function updateRouteState() {
    var visible = isAssistantRoute();
    state.els.fab.hidden = !visible;
    if (!visible) toggleAssistant(false);
    updateDashboardPosition();
    ensureLibrariesExpanded();
    scheduleAccountSettingsRefresh();
    updateDashboardAIEntry();
    var appRoot = document.getElementById("app");
    if (appRoot) interceptPenpotExternalLinks(appRoot);
    startExtLinkObserver();
  }

  function readTargetProviderDraft(providerId) {
    var provider = getProvider(providerId);
    var draft = getProviderDraft(providerId);
    return {
      providerId: providerId,
      apiKey: draft.apiKey || "",
      baseUrl: draft.baseUrl || (provider && provider.baseUrl) || "",
      keepExistingKey: !draft.apiKey
    };
  }

  function saveProvider(providerId) {
    var payload = readTargetProviderDraft(providerId);
    setProviderMessage(providerId, "Saving provider settings…", "info");
    return apiJson(AI_PROVIDER_KEY_URL, {
      method: "PUT",
      body: JSON.stringify(payload)
    }).then(function () {
      setProviderMessage(providerId, "Saved. The key remains masked in the UI.", "success");
      return ensureSettingsLoaded(true);
    }).then(function () {
      setFlash("Provider configuration saved.", "success");
      state.settingsUi.savedProviderId = providerId;
      renderSettings();
      setTimeout(function () {
        state.settingsUi.savedProviderId = null;
        renderSettings();
      }, 1500);
    }).catch(function (error) {
      setProviderMessage(providerId, error.message || "Failed to save provider settings.", "error");
    });
  }

  function deleteProvider(providerId) {
    if (!window.confirm("Delete the saved API key for this provider?")) return Promise.resolve();
    return apiJson(AI_PROVIDER_KEY_URL + "/" + encodeURIComponent(providerId), {
      method: "DELETE"
    }).then(function () {
      setProviderMessage(providerId, "Saved key deleted.", "success");
      return ensureSettingsLoaded(true);
    }).then(function () {
      setFlash("Provider key deleted.", "success");
    }).catch(function (error) {
      setProviderMessage(providerId, error.message || "Failed to delete the provider key.", "error");
    });
  }

  function testProvider(providerId) {
    var payload = readTargetProviderDraft(providerId);
    var shouldPersist = !payload.apiKey && payload.baseUrl === ((getProvider(providerId) || {}).baseUrl || "");
    setProviderMessage(providerId, "Testing provider…", "info");
    return apiJson(AI_TEST_PROVIDER_URL, {
      method: "POST",
      body: JSON.stringify({
        providerId: providerId,
        apiKey: payload.apiKey,
        baseUrl: payload.baseUrl,
        persistStatus: shouldPersist
      })
    }).then(function (data) {
      var result = data.result || {};
      var tone = result.status === "test_passed" ? "success" : "error";
      setProviderMessage(providerId, (result.message || "Test finished.") + " · " + formatLatency(result.latencyMs), tone);
      if (shouldPersist) return ensureSettingsLoaded(true);
      return null;
    }).catch(function (error) {
      setProviderMessage(providerId, error.message || "Provider test failed.", "error");
    });
  }

  function assignModel(modelId) {
    var providerId = state.settingsUi.modelProviderDrafts[modelId] || "openrouter";
    var role = state.settingsUi.modelRoleDrafts[modelId] || state.settingsUi.focusRole || "default";
    var messageKey = modelId + "::" + providerId;
    setModelMessage(messageKey, "Saving assignment…", "info");
    return apiJson(AI_ASSIGNMENT_URL, {
      method: "PUT",
      body: JSON.stringify({
        role: role,
        providerId: providerId,
        modelId: modelId
      })
    }).then(function () {
      setModelMessage(messageKey, "Assignment saved.", "success");
      state.settingsUi.focusRole = role;
      state.settingsUi.modelAssignOpenId = null;
      return ensureSettingsLoaded(true);
    }).then(function () {
      setFlash("Role assignment updated for " + (ROLE_LABELS[role] || role) + ".", "success");
    }).catch(function (error) {
      setModelMessage(messageKey, error.message || "Failed to save model assignment.", "error");
    });
  }

  function testModel(modelId) {
    var providerId = state.settingsUi.modelProviderDrafts[modelId] || "openrouter";
    state.settingsUi.modelPing[modelId] = { status: "loading" };
    renderSettings();
    return apiJson(AI_TEST_MODEL_URL, {
      method: "POST",
      body: JSON.stringify({
        providerId: providerId,
        modelId: modelId
      })
    }).then(function (data) {
      var result = data.result || {};
      if (result.status === "test_passed") {
        state.settingsUi.modelPing[modelId] = { status: "ok", ms: result.latencyMs || 0 };
      } else {
        state.settingsUi.modelPing[modelId] = { status: "error" };
      }
      renderSettings();
    }).catch(function (error) {
      state.settingsUi.modelPing[modelId] = { status: "error", code: error.status };
      renderSettings();
    });
  }

  function testAllModels() {
    if (state.settingsUi.testAllRunning) return;
    var models = getFilteredModels().slice(0, 20);
    if (!models.length) return;
    state.settingsUi.testAllRunning = true;
    renderSettings();

    var index = 0;
    function next() {
      if (index >= models.length) {
        state.settingsUi.testAllRunning = false;
        renderSettings();
        return;
      }
      var model = models[index++];
      testModel(model.id).then(function () {
        setTimeout(next, 400);
      });
    }
    next();
  }

  function clearRoleAssignment(roleId) {
    return apiJson(AI_ASSIGNMENT_URL, {
      method: "PUT",
      body: JSON.stringify({
        role: roleId,
        clear: true
      })
    }).then(function () {
      return ensureSettingsLoaded(true);
    }).then(function () {
      setFlash("Assignment cleared for " + (ROLE_LABELS[roleId] || roleId) + ".", "success");
    }).catch(function (error) {
      setFlash(error.message || "Failed to clear the assignment.", "error");
    });
  }

  function saveEngine() {
    var draft = getEngineDraft();
    setFlash("Saving engine configuration…", "info");

    return apiJson(AI_PROVIDER_MODE_URL, {
      method: "PUT",
      body: JSON.stringify({ providerMode: draft.providerMode })
    }).then(function () {
      return apiJson(AI_ENGINE_URL, {
        method: "PUT",
        body: JSON.stringify({
          temperature: Number(draft.temperature),
          maxTokens: Number(draft.maxTokens),
          timeoutMs: Number(draft.timeoutMs),
          retries: Number(draft.retries),
          fallbackModelOrder: draft.fallbackModelOrder || []
        })
      });
    }).then(function () {
      return ensureSettingsLoaded(true);
    }).then(function () {
      setFlash("Engine settings saved.", "success");
    }).catch(function (error) {
      setFlash(error.message || "Failed to save engine settings.", "error");
    });
  }

  function addFallback() {
    var draft = getEngineDraft();
    var fallbackDraft = state.settingsUi.fallbackDraft || {};
    if (!fallbackDraft.providerId || !fallbackDraft.modelId) {
      setFlash("Choose both a fallback provider and a fallback model.", "warn");
      return;
    }
    var exists = (draft.fallbackModelOrder || []).some(function (entry) {
      return entry.providerId === fallbackDraft.providerId && entry.modelId === fallbackDraft.modelId;
    });
    if (exists) {
      setFlash("That fallback model is already in the list.", "warn");
      return;
    }

    var model = (state.settings.modelLibrary || []).find(function (entry) { return entry.id === fallbackDraft.modelId; });
    draft.fallbackModelOrder.push({
      providerId: fallbackDraft.providerId,
      providerLabel: ((getProvider(fallbackDraft.providerId) || {}).label || fallbackDraft.providerId),
      modelId: fallbackDraft.modelId,
      modelLabel: model ? model.displayName : fallbackDraft.modelId
    });
    state.settingsUi.fallbackDraft.modelId = "";
    renderSettings();
  }

  function removeFallback(index) {
    var draft = getEngineDraft();
    draft.fallbackModelOrder.splice(index, 1);
    renderSettings();
  }

  function isInsideAccountSettingsHost(element) {
    return !!(element && element.closest && element.closest("#nofida-ai-account-page-host"));
  }

  function handleSharedAction(actionTarget) {
    var action = actionTarget.getAttribute("data-action");
    var inAccount = isInsideAccountSettingsHost(actionTarget);
    if (action === "create") handleCreate();
    if (action === "import") state.els.importFile.click();
    if (action === "libraries") toggleLibraries(true);
    if (action === "open-settings") openSettings("api");
    if (action === "close-settings") closeSettings();
    if (action === "refresh-settings") ensureSettingsLoaded(true).catch(function () {});
    if (action === "open-external") openExternal(actionTarget.getAttribute("data-href"));
    if (action === "save-provider") saveProvider(actionTarget.getAttribute("data-provider-id"));
    if (action === "delete-provider") deleteProvider(actionTarget.getAttribute("data-provider-id"));
    if (action === "test-provider") testProvider(actionTarget.getAttribute("data-provider-id"));
    if (action === "assign-model") assignModel(actionTarget.getAttribute("data-model-id"));
    if (action === "test-model") testModel(actionTarget.getAttribute("data-model-id"));
    if (action === "test-all-models") testAllModels();
    if (action === "set-sort") {
      var sortKey = actionTarget.getAttribute("data-sort-key");
      if (state.settingsUi.sort === sortKey) {
        state.settingsUi.sortDir = state.settingsUi.sortDir === "desc" ? "asc" : "desc";
      } else {
        state.settingsUi.sort = sortKey;
        state.settingsUi.sortDir = "asc";
      }
      renderSettings();
    }
    if (action === "toggle-model-desc") {
      var descId = actionTarget.getAttribute("data-model-id");
      state.settingsUi.expandedDesc[descId] = !state.settingsUi.expandedDesc[descId];
      renderSettings();
    }
    if (action === "toggle-assign-popup") {
      var popupId = actionTarget.getAttribute("data-model-id");
      state.settingsUi.modelAssignOpenId = state.settingsUi.modelAssignOpenId === popupId ? null : popupId;
      renderSettings();
    }
    if (action === "close-assign-popup") {
      state.settingsUi.modelAssignOpenId = null;
      renderSettings();
    }
    if (action === "edit-role-assignment") {
      state.settingsUi.focusRole = actionTarget.getAttribute("data-role") || "default";
      state.settingsUi.providerFilter = actionTarget.getAttribute("data-provider-id") || state.settingsUi.providerFilter;
      if (inAccount) openAccountSettingsPage("models");
      else openSettings("models", actionTarget.getAttribute("data-role"), actionTarget.getAttribute("data-provider-id"));
    }
    if (action === "clear-role-assignment") clearRoleAssignment(actionTarget.getAttribute("data-role"));
    if (action === "save-engine") saveEngine();
    if (action === "add-fallback") addFallback();
    if (action === "remove-fallback") removeFallback(Number(actionTarget.getAttribute("data-fallback-index")));
    if (action === "open-account-ai-settings") openAccountSettingsPage(actionTarget.getAttribute("data-settings-tab") || "api");
    if (action === "close-account-ai-settings") closeAccountSettingsPage();
    if (action === "new-thread") startNewThread();
    if (action === "rename-thread") renameActiveThread();
    if (action === "delete-thread") deleteActiveThread();
    if (action === "preset-task") {
      var taskType = actionTarget.getAttribute("data-task-type");
      if (taskType) sendAiTask(taskType, "");
    }
    if (action === "apply-screen-spec") {
      var specId = actionTarget.getAttribute("data-screen-spec-id");
      applyScreenSpecToCanvas(specId, state._screenSpecs[specId], actionTarget);
    }
    if (action === "remove-attachment") {
      removeAttachment(Number(actionTarget.getAttribute("data-attach-index")));
    }
  }

  function handleSharedTab(tabTarget) {
    var tabId = tabTarget.getAttribute("data-settings-tab");
    if (!isKnownSettingsTab(tabId)) return;
    state.settingsUi.activeTab = tabId;
    if (isInsideAccountSettingsHost(tabTarget) && isAccountAIPageActive()) {
      window.location.hash = buildAccountSettingsHash({ nofida: "ai", tab: tabId });
      return;
    }
    renderSettings();
  }

  function handleSharedInput(target) {
    if (target.id === "settings-search") {
      state.settingsUi.search = target.value;
      renderSettings();
    }
    if (target.id === "engine-temperature") getEngineDraft().temperature = target.value;
    if (target.id === "engine-max-tokens") getEngineDraft().maxTokens = target.value;
    if (target.id === "engine-timeout-ms") getEngineDraft().timeoutMs = target.value;
    if (target.id === "engine-retries") getEngineDraft().retries = target.value;

    var providerKey = target.getAttribute("data-provider-key");
    if (providerKey) getProviderDraft(providerKey).apiKey = target.value;

    var providerBase = target.getAttribute("data-provider-base");
    if (providerBase) getProviderDraft(providerBase).baseUrl = target.value;
  }

  function handleSharedChange(target) {
    if (target.id === "thread-select") {
      switchThread(target.value);
    }
    if (target.id === "settings-provider-filter") {
      state.settingsUi.providerFilter = target.value;
      renderSettings();
    }
    if (target.id === "settings-sort") {
      state.settingsUi.sort = target.value;
      renderSettings();
    }

    var capability = target.getAttribute("data-capability");
    if (capability) {
      state.settingsUi.capabilityFilters[capability] = !!target.checked;
      renderSettings();
    }

    var providerReveal = target.getAttribute("data-provider-reveal");
    if (providerReveal) {
      getProviderDraft(providerReveal).reveal = !!target.checked;
      renderSettings();
    }

    var modelProvider = target.getAttribute("data-model-provider");
    if (modelProvider) state.settingsUi.modelProviderDrafts[modelProvider] = target.value;

    var modelRole = target.getAttribute("data-model-role");
    if (modelRole) state.settingsUi.modelRoleDrafts[modelRole] = target.value;

    if (target.name === "provider-mode") getEngineDraft().providerMode = target.value;

    if (target.id === "engine-fallback-provider") {
      state.settingsUi.fallbackDraft.providerId = target.value;
      state.settingsUi.fallbackDraft.modelId = "";
      renderSettings();
    }
    if (target.id === "engine-fallback-model") state.settingsUi.fallbackDraft.modelId = target.value;
  }

  function wireEvents() {
    state.els.fab.addEventListener("click", function () { toggleAssistant(); });

    state.root.querySelectorAll("[data-close]").forEach(function (button) {
      button.addEventListener("click", function () {
        var target = button.getAttribute("data-close");
        if (target === "assistant") toggleAssistant(false);
        if (target === "libraries") toggleLibraries(false);
      });
    });

    state.els.importFile.addEventListener("change", function () {
      handleImportFiles(state.els.importFile.files);
      state.els.importFile.value = "";
    });

    state.els.form.addEventListener("submit", function (event) {
      event.preventDefault();
      var prompt = state.els.input.value.trim();
      if (!prompt && state._pendingAttachments.length === 0) return;
      sendAiMessage(prompt);
    });

    state.els.attachBtn.addEventListener("click", function () {
      state.els.attachFile.click();
    });

    state.els.attachFile.addEventListener("change", function () {
      handleAttachFiles(state.els.attachFile.files);
      state.els.attachFile.value = "";
    });

    state.root.addEventListener("click", function (event) {
      var target = event.target;
      if (!(target instanceof HTMLElement)) return;

      var actionTarget = target.closest("[data-action]");
      if (actionTarget) {
        handleSharedAction(actionTarget);
        return;
      }

      var tabTarget = target.closest("[data-settings-tab]");
      if (tabTarget) {
        handleSharedTab(tabTarget);
      }
    });

    state.root.addEventListener("input", function (event) {
      var target = event.target;
      if (!(target instanceof HTMLElement)) return;
      handleSharedInput(target);
    });

    state.root.addEventListener("change", function (event) {
      var target = event.target;
      if (!(target instanceof HTMLElement)) return;
      handleSharedChange(target);
    });

    document.addEventListener("click", function (event) {
      var target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!isInsideAccountSettingsHost(target)) return;
      var actionTarget = target.closest("[data-action]");
      if (actionTarget) {
        handleSharedAction(actionTarget);
        return;
      }
      var tabTarget = target.closest("[data-settings-tab]");
      if (tabTarget) handleSharedTab(tabTarget);
    });

    document.addEventListener("input", function (event) {
      var target = event.target;
      if (!(target instanceof HTMLElement) || !isInsideAccountSettingsHost(target)) return;
      handleSharedInput(target);
    });

    document.addEventListener("change", function (event) {
      var target = event.target;
      if (!(target instanceof HTMLElement) || !isInsideAccountSettingsHost(target)) return;
      handleSharedChange(target);
    });

    window.addEventListener("hashchange", updateRouteState);
    window.addEventListener("resize", updateRouteState);

    var appRoot = document.getElementById("app");
    if (appRoot && "ResizeObserver" in window) {
      new ResizeObserver(updateRouteState).observe(appRoot);
    }
  }

  function start() {
    buildUI();
    wireEvents();
    updateRouteState();
    prefetchCatalog();

    loadBridge().then(function (bridge) {
      state.bridge = bridge;
      state.els.transport.textContent = bridge && bridge.transport
        ? "bridge: " + bridge.transport
        : "bridge: offline";
    });

    // The bridge can connect to the companion plugin well after this panel's
    // first render (user installs/opens the plugin later in the session) —
    // keep the status label live instead of freezing it at startup value.
    window.addEventListener("nofida-ai:transport-changed", function (ev) {
      if (state.els.transport) {
        var name = ev && ev.detail && ev.detail.transport;
        state.els.transport.textContent = name ? "bridge: " + name : "bridge: offline";
      }
      // requestContext() at panel-open time silently returns nothing when
      // the plugin hasn't connected yet (extractContext() short-circuits on
      // a missing pluginWindow) and was never retried — leaving
      // state._fileContext empty even though a file really is open. That
      // empty context makes the intent router treat every message as
      // "no file", which pushes ordinary build requests into free_chat
      // instead of build_screen. Re-request now that a real transport exists.
      if (ev && ev.detail && ev.detail.transport === "plugin") {
        requestContext();
      }
    });

    window.NofidaAICore = {
      open: function () { toggleAssistant(true); },
      close: function () { toggleAssistant(false); },
      toggle: function () { toggleAssistant(); },
      openLibraries: function () { toggleLibraries(true); },
      openSettings: function () { openSettings("api"); },
      refreshCards: updateDashboardPosition
    };
  }

  onReady(start);
})();
