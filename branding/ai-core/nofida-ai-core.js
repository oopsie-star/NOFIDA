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
  var HOST_ID = "nofida-shell-root";
  var DASHBOARD_SELECTOR = ".main_ui_dashboard__dashboard-content";
  var GRID_SELECTOR = ".main_ui_dashboard_grid__dashboard-grid";

  var BRAND = {
    bg: "#0b1020",
    surface: "#131e35",
    surfaceStrong: "#10192f",
    surfaceSoft: "rgba(19,30,53,.82)",
    border: "rgba(37, 99, 235, 0.24)",
    borderAccent: "rgba(16, 185, 129, .32)",
    borderDanger: "rgba(248, 113, 113, .34)",
    primary: "#2563eb",
    primaryHover: "#1d4ed8",
    accent: "#10b981",
    accentSoft: "rgba(16, 185, 129, .16)",
    accentInk: "#ecfeff",
    warn: "#f59e0b",
    danger: "#ef4444",
    text: "#f8fafc",
    muted: "#94a3b8",
    font: 'Montserrat, Inter, "Segoe UI", system-ui, sans-serif'
  };

  var SETTINGS_TABS = [
    { id: "api", label: "API Configuration" },
    { id: "models", label: "Model Library" },
    { id: "accounts", label: "External Accounts" },
    { id: "engine", label: "Engine" },
    { id: "prompts", label: "Prompts" }
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

  var state = {
    bridge: null,
    catalog: null,
    host: null,
    root: null,
    els: {},
    _fileContext: null,
    _aiLoading: false,
    _installedItems: [],
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
      providerFilter: "openrouter",
      sort: "name",
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
      "#nofida-ai-sidebar-item .nofida-ai-sidebar-icon{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:999px;background:rgba(37,99,235,.16);color:#93c5fd;flex:0 0 18px}",
      "#nofida-ai-sidebar-item.main_ui_settings_sidebar__current .nofida-ai-sidebar-icon{background:rgba(191,255,0,.18);color:#d9ff5b}",
      "#nofida-ai-sidebar-item .nofida-ai-sidebar-icon svg{width:12px;height:12px;display:block}",
      "#nofida-ai-sidebar-item .nofida-ai-sidebar-badge{display:inline-flex;align-items:center;padding:2px 7px;border-radius:999px;background:rgba(16,185,129,.14);color:#8ef0cd;font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;margin-left:8px}"
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
        '  <button class="library-link" type="button" data-action="open-external" data-href="' + escapeHtml(href) + '">' + source + "</button>",
        "</article>"
      ].join("");
    }).join("");
  }

  function openExternal(href) {
    if (!href || href === "#") return;
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

    return apiJson(AI_SETTINGS_URL)
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

  function formatModelMeta(model) {
    var bits = [];
    if (model.providerLabel) bits.push(model.providerLabel);
    if (model.contextWindow) bits.push("ctx " + model.contextWindow.toLocaleString());
    if (model.maxOutputTokens) bits.push("out " + model.maxOutputTokens.toLocaleString());
    return bits.join(" · ");
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

  function formatPrice(model) {
    return model.price && model.price.label ? model.price.label : "Unknown";
  }

  function getFilteredModels() {
    var settings = state.settings;
    if (!settings || !Array.isArray(settings.modelLibrary)) return [];

    var search = String(state.settingsUi.search || "").trim().toLowerCase();
    var providerFilter = state.settingsUi.providerFilter || "openrouter";
    var activeCaps = Object.keys(state.settingsUi.capabilityFilters).filter(function (cap) {
      return state.settingsUi.capabilityFilters[cap];
    });
    var sort = state.settingsUi.sort || "name";

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
      if (sort === "context") return (right.contextWindow || 0) - (left.contextWindow || 0);
      if (sort === "price") {
        var lp = left.price && typeof left.price.prompt === "number" ? left.price.prompt : Number.POSITIVE_INFINITY;
        var rp = right.price && typeof right.price.prompt === "number" ? right.price.prompt : Number.POSITIVE_INFINITY;
        if (lp !== rp) return lp - rp;
      }
      return String(left.displayName || "").localeCompare(String(right.displayName || ""));
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

    return [
      '<article class="provider-card">',
      '  <div class="provider-top">',
      '    <div>',
      '      <h3>' + escapeHtml(provider.label) + "</h3>",
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
      '    <button class="btn primary" type="button" data-action="save-provider" data-provider-id="' + escapeHtml(provider.providerId) + '">Save</button>',
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
    return '<label class="chip-filter"><input type="checkbox" data-capability="' + capability + '"' + (checked ? " checked" : "") + " /> " + capability.charAt(0).toUpperCase() + capability.slice(1) + "</label>";
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

    return [
      '<article class="model-card">',
      '  <div class="model-head">',
      '    <div class="model-copy">',
      '      <h3>' + escapeHtml(model.displayName) + "</h3>",
      '      <p>' + escapeHtml(formatModelMeta(model)) + "</p>",
      "    </div>",
      '    <span class="price-pill">' + escapeHtml(formatPrice(model)) + "</span>",
      "  </div>",
      '  <p class="model-desc">' + escapeHtml(model.description || "OpenRouter-sourced registry entry.") + "</p>",
      '  <div class="tag-row">' + (model.capabilities || []).map(function (tag) {
        return '<span class="tag">' + escapeHtml(tag) + "</span>";
      }).join("") + "</div>",
      '  <div class="field-row compact">',
      '    <div class="field"><label>Provider</label><select class="select-input" data-model-provider="' + escapeHtml(model.id) + '">' + providerOptions + "</select></div>",
      '    <div class="field"><label>Assign role</label><select class="select-input" data-model-role="' + escapeHtml(model.id) + '">' + roleOptions + "</select></div>",
      "  </div>",
      inline ? ('  <div class="inline-message ' + messageToneClass(inline.tone) + '">' + escapeHtml(inline.text) + "</div>") : "",
      '  <div class="provider-actions">',
      '    <button class="btn ghost" type="button" data-action="test-model" data-model-id="' + escapeHtml(model.id) + '">Test</button>',
      '    <button class="btn primary" type="button" data-action="assign-model" data-model-id="' + escapeHtml(model.id) + '">Assign</button>',
      "  </div>",
      "</article>"
    ].join("");
  }

  function renderModelLibraryTab() {
    var settings = state.settings;
    var providers = settings && Array.isArray(settings.providers) ? settings.providers : [];
    var models = getFilteredModels();
    var providerOptions = ['<option value="all"' + (state.settingsUi.providerFilter === "all" ? " selected" : "") + '>All Providers</option>']
      .concat(providers.map(function (provider) {
        var selected = provider.providerId === state.settingsUi.providerFilter ? " selected" : "";
        return '<option value="' + escapeHtml(provider.providerId) + '"' + selected + ">" + escapeHtml(provider.label) + "</option>";
      }))
      .join("");

    return [
      renderFlash(),
      '<div class="settings-toolbar">',
      '  <div class="field grow"><label>Найти модель…</label><input id="settings-search" class="text-input" type="search" value="' + escapeHtml(state.settingsUi.search || "") + '" placeholder="Найти модель…" /></div>',
      '  <div class="field"><label>Provider</label><select id="settings-provider-filter" class="select-input">' + providerOptions + "</select></div>",
      '  <div class="field"><label>Sort</label><select id="settings-sort" class="select-input">'
        + '<option value="name"' + (state.settingsUi.sort === "name" ? " selected" : "") + '>Name</option>'
        + '<option value="context"' + (state.settingsUi.sort === "context" ? " selected" : "") + '>Context</option>'
        + '<option value="price"' + (state.settingsUi.sort === "price" ? " selected" : "") + '>Price</option>'
        + "</select></div>",
      "</div>",
      '<div class="chip-row">'
        + ["free", "vision", "coding", "reasoning", "fast", "cheap"].map(renderCapabilityFilter).join("")
        + "</div>",
      '<div class="provider-note">Source: OpenRouter model registry. Prices are displayed from OpenRouter data and direct-provider compatibility may vary by account and endpoint.</div>',
      models.length
        ? ('<div class="model-grid">' + models.map(renderModelCard).join("") + "</div>")
        : '<div class="empty-state">No models matched the current search and filters.</div>'
    ].join("");
  }

  function renderAssignmentCard(roleId, assignment) {
    var title = ROLE_LABELS[roleId] || roleId;
    return [
      '<article class="assignment-card">',
      '  <div class="assignment-top">',
      '    <h4>' + escapeHtml(title) + "</h4>",
      '    <span class="status-pill ' + (assignment ? "info" : "muted") + '">' + escapeHtml(assignment ? "assigned" : "unassigned") + "</span>",
      "  </div>",
      '  <p>' + escapeHtml(assignment ? (assignment.providerLabel + " · " + assignment.modelLabel) : "No model assigned yet.") + "</p>",
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

  function renderPlaceholderTab(title, body) {
    return [
      renderFlash(),
      '<div class="placeholder-block">',
      '  <h3>' + escapeHtml(title) + "</h3>",
      '  <p>' + escapeHtml(body) + "</p>",
      "</div>"
    ].join("");
  }

  function getSharedSettingsPanelHtml() {
    if (!state.settings) return '<div class="empty-state">Settings are not available yet.</div>';

    if (state.settingsUi.activeTab === "api") return renderApiConfigurationTab();
    if (state.settingsUi.activeTab === "models") return renderModelLibraryTab();
    if (state.settingsUi.activeTab === "engine") return renderEngineTab();
    if (state.settingsUi.activeTab === "accounts")
      return renderPlaceholderTab("External Accounts", "This tab is reserved for future external account linking. The provider key system in API Configuration is already functional in this patch.");
    if (state.settingsUi.activeTab === "prompts")
      return renderPlaceholderTab("Prompts", "Prompt management is intentionally left as a placeholder in this patch. Engine assignments and provider configuration are already live.");

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
      '#nofida-ai-account-page-host .account-shell{display:flex;flex-direction:column;gap:10px;border:1px solid ' + BRAND.border + ';border-radius:16px;background:linear-gradient(180deg,rgba(13,19,36,.98),rgba(8,12,24,.98));box-shadow:0 8px 32px rgba(2,6,23,.28);padding:14px 16px;color:' + BRAND.text + '}',
      '#nofida-ai-account-page-host .account-shell.page{padding:14px 16px 16px;overflow-y:auto;max-height:calc(100vh - 90px);min-height:0}',
      '#nofida-ai-account-page-host .account-shell.launcher{flex-direction:row;align-items:center;padding:8px 14px;border-radius:10px;gap:10px;flex-wrap:wrap;background:rgba(13,19,36,.96);box-shadow:none;border-color:rgba(37,99,235,.16)}',
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
      '#nofida-ai-account-page-host .provider-card,#nofida-ai-account-page-host .model-card,#nofida-ai-account-page-host .assignment-card,#nofida-ai-account-page-host .placeholder-block{border:1px solid ' + BRAND.border + ';border-radius:12px;background:' + BRAND.surfaceSoft + ';padding:10px 12px;display:flex;flex-direction:column;gap:8px}',
      '#nofida-ai-account-page-host .provider-top,#nofida-ai-account-page-host .model-head,#nofida-ai-account-page-host .assignment-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}',
      '#nofida-ai-account-page-host .provider-top h3,#nofida-ai-account-page-host .model-copy h3,#nofida-ai-account-page-host .assignment-top h4,#nofida-ai-account-page-host .placeholder-block h3{margin:0;font-size:13px}',
      '#nofida-ai-account-page-host .provider-top p,#nofida-ai-account-page-host .model-copy p,#nofida-ai-account-page-host .assignment-card p,#nofida-ai-account-page-host .placeholder-block p,#nofida-ai-account-page-host .model-desc,#nofida-ai-account-page-host .provider-note,#nofida-ai-account-page-host .provider-meta{margin:0;color:' + BRAND.muted + ';font-size:11px;line-height:1.4}',
      '#nofida-ai-account-page-host .model-desc{min-height:30px}',
      '#nofida-ai-account-page-host .provider-actions{display:flex;gap:6px;flex-wrap:wrap}',
      '#nofida-ai-account-page-host .inline-controls{display:flex;align-items:center;gap:12px}',
      '#nofida-ai-account-page-host .toggle{font-size:12px;color:' + BRAND.muted + '}',
      '#nofida-ai-account-page-host .status-pill{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;border:1px solid transparent}',
      '#nofida-ai-account-page-host .status-pill.success{background:rgba(16,185,129,.15);color:#a7f3d0;border-color:rgba(16,185,129,.32)}',
      '#nofida-ai-account-page-host .status-pill.error{background:rgba(239,68,68,.14);color:#fecaca;border-color:rgba(239,68,68,.32)}',
      '#nofida-ai-account-page-host .status-pill.info{background:rgba(37,99,235,.18);color:#bfdbfe;border-color:rgba(37,99,235,.32)}',
      '#nofida-ai-account-page-host .status-pill.muted{background:rgba(148,163,184,.12);color:' + BRAND.muted + ';border-color:rgba(148,163,184,.18)}',
      '#nofida-ai-account-page-host .flash,#nofida-ai-account-page-host .inline-message{border-radius:14px;padding:12px 14px;font-size:13px;line-height:1.5;border:1px solid transparent}',
      '#nofida-ai-account-page-host .flash.ok,#nofida-ai-account-page-host .inline-message.ok{background:rgba(16,185,129,.12);color:#d1fae5;border-color:rgba(16,185,129,.28)}',
      '#nofida-ai-account-page-host .flash.err,#nofida-ai-account-page-host .inline-message.err{background:rgba(127,29,29,.28);color:#fecaca;border-color:rgba(239,68,68,.28)}',
      '#nofida-ai-account-page-host .flash.warn,#nofida-ai-account-page-host .inline-message.warn{background:rgba(120,53,15,.28);color:#fde68a;border-color:rgba(245,158,11,.28)}',
      '#nofida-ai-account-page-host .flash.info,#nofida-ai-account-page-host .inline-message.info{background:rgba(37,99,235,.14);color:#dbeafe;border-color:rgba(37,99,235,.3)}',
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
      '@media (max-width:820px){#nofida-ai-account-page-host .account-head h2{font-size:14px}#nofida-ai-account-page-host .settings-toolbar,#nofida-ai-account-page-host .field-row,#nofida-ai-account-page-host .field-row.compact{grid-template-columns:1fr}}'
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
      if (state.accountSettings.sidebarItem && state.accountSettings.sidebarItem.parentNode) {
        state.accountSettings.sidebarItem.parentNode.removeChild(state.accountSettings.sidebarItem);
      }
      state.accountSettings.sidebarItem = null;
      return;
    }

    ensureAccountSidebarStyles();

    var item = state.accountSettings.sidebarItem;
    if (!item || item.parentNode !== nav) {
      if (item && item.parentNode) item.parentNode.removeChild(item);
      item = document.createElement("li");
      item.id = "nofida-ai-sidebar-item";
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

    var requestedTab = getHashParams().get("tab");
    if (isKnownSettingsTab(requestedTab)) state.settingsUi.activeTab = requestedTab;

    var container = findAccountSettingsContainer();
    if (!container) return;

    var host = state.accountSettings.host;
    if (!host || host.parentNode !== container) {
      if (host && host.parentNode) host.parentNode.removeChild(host);
      host = document.createElement("section");
      host.id = "nofida-ai-account-page-host";
      container.insertBefore(host, container.firstChild || null);
      state.accountSettings.host = host;
      state.accountSettings.container = container;
    }

    var summary = buildAccountSettingsSummary();
    var activePage = isAccountAIPageActive();

    if (activePage && !state.settings && !state.settingsLoading) {
      ensureSettingsLoaded(false).catch(function () {});
    }

    if (!activePage && !state.settings && !state.settingsLoading) {
      ensureSettingsLoaded(false).catch(function () {});
    }

    setAccountSettingsPageMode(activePage);

    var bodyHtml = "";
    if (activePage) {
      if (state.settingsLoading && !state.settings) {
        bodyHtml = '<div class="loading-panel">Loading AI settings…</div>';
      } else if (state.settingsError && !state.settings) {
        bodyHtml = '<div class="empty-state">' + escapeHtml(state.settingsError) + "</div>";
      } else {
        bodyHtml = getSharedSettingsPanelHtml();
      }
    }

    var markup = [
      "<style>", getAccountSettingsScopedStyles(), "</style>",
      activePage ? [
        '<section class="account-shell page">',
        '  <div class="account-head">',
        '    <div>',
        '      <span class="eyebrow">Account / Settings / NOFIDA AI</span>',
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
      ].join("") : [
        '<section class="account-shell launcher">',
        '  <span class="eyebrow">NOFIDA AI</span>',
        '  <span class="launcher-label">Настройки поставщиков в аккаунте</span>',
        '  <button class="btn primary tiny" type="button" data-action="open-account-ai-settings" data-settings-tab="api">Открыть</button>',
        '</section>'
      ].join("")
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
.action-card{display:flex;flex-direction:column;align-items:flex-start;gap:8px;width:100%;border:1px solid ' + BRAND.border + ';border-radius:18px;padding:18px 20px;text-align:left;background:linear-gradient(180deg,rgba(19,30,53,.98),rgba(11,16,32,.98));color:' + BRAND.text + ';box-shadow:0 18px 48px rgba(2,6,23,.34);cursor:pointer;transition:transform .18s ease,border-color .18s ease}\
.action-card:hover{transform:translateY(-2px);border-color:rgba(16,185,129,.45)}\
.action-kicker{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:' + BRAND.accent + ';font-weight:700}\
.action-title{font-size:18px;font-weight:800;line-height:1.15;margin:0}\
.action-copy{font-size:13px;line-height:1.45;color:' + BRAND.muted + ';margin:0}\
.action-foot{font-size:12px;color:' + BRAND.text + ';opacity:.88}\
.fab{position:fixed;right:20px;bottom:20px;width:56px;height:56px;border:0;border-radius:18px;cursor:pointer;display:grid;place-items:center;background:' + BRAND.accent + ';color:' + BRAND.bg + ';box-shadow:0 16px 44px rgba(16,185,129,.28);pointer-events:auto;transition:transform .15s ease}\
.fab:hover{transform:translateY(-2px)}\
.fab[hidden]{display:none}\
.fab svg{width:24px;height:24px}\
.panel,.library-drawer{position:fixed;right:0;top:0;height:100vh;width:408px;max-width:94vw;transform:translateX(105%);transition:transform .22s cubic-bezier(.16,1,.3,1);background:' + BRAND.surfaceStrong + ';color:' + BRAND.text + ';border-left:1px solid ' + BRAND.border + ';box-shadow:-18px 0 60px rgba(0,0,0,.45);display:flex;flex-direction:column;pointer-events:auto}\
.panel.open,.library-drawer.open{transform:translateX(0)}\
.panel-head{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid ' + BRAND.border + ';flex-shrink:0}\
.panel-head h2{margin:0;font-size:14px;font-weight:800;letter-spacing:.03em}\
.panel-head small{margin-left:auto;color:' + BRAND.muted + ';font-size:11px}\
.dot{width:8px;height:8px;border-radius:999px;background:' + BRAND.accent + ';flex-shrink:0}\
.close{margin-left:6px;background:transparent;border:0;color:' + BRAND.muted + ';cursor:pointer;font-size:20px;line-height:1;padding:2px 4px}\
.ghost-btn{border:1px solid ' + BRAND.border + ';background:rgba(15,23,42,.7);color:' + BRAND.text + ';border-radius:10px;padding:8px 10px;font-size:11px;font-weight:700;cursor:pointer}\
.ghost-btn:hover{border-color:rgba(37,99,235,.5)}\
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
.plan-head{display:flex;align-items:center;gap:6px;padding:8px 10px;background:rgba(16,185,129,.08);font-size:11px;font-weight:800;cursor:pointer;user-select:none;color:' + BRAND.accent + ';letter-spacing:.04em}\
.plan-head .ph-arrow{margin-left:auto;transition:transform .18s ease}\
.plan-head.open .ph-arrow{transform:rotate(180deg)}\
.plan-body{padding:10px;font-size:12px;color:' + BRAND.muted + ';max-height:180px;overflow-y:auto;display:none}\
.plan-body.open{display:block}\
.plan-item{padding:6px 8px;border-radius:6px;background:' + BRAND.bg + ';margin-bottom:6px;line-height:1.4}\
.plan-item:last-child{margin-bottom:0}\
.plan-item b{display:block;margin-bottom:2px;color:' + BRAND.text + '}\
.compose{display:flex;gap:8px;padding:12px;border-top:1px solid ' + BRAND.border + ';flex-shrink:0}\
.compose input{flex:1;min-width:0;background:' + BRAND.bg + ';color:' + BRAND.text + ';border:1px solid ' + BRAND.border + ';border-radius:12px;padding:10px 12px;font-size:13px;outline:none}\
.compose input:focus{border-color:' + BRAND.primary + '}\
.compose button{border:0;border-radius:12px;padding:0 16px;min-height:40px;font-weight:800;font-size:15px;cursor:pointer;background:' + BRAND.primary + ';color:#fff;transition:background .15s}\
.compose button:hover{background:' + BRAND.primaryHover + '}\
.compose button:disabled{opacity:.45;cursor:default}\
.library-drawer{padding-bottom:12px}\
.library-body{padding:14px 16px 18px;overflow:auto;flex:1}\
.library-note{margin:0 0 14px;color:' + BRAND.muted + ';font-size:13px;line-height:1.45}\
.library-list{display:flex;flex-direction:column;gap:12px}\
.library-item{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:start;padding:14px;border:1px solid ' + BRAND.border + ';border-radius:16px;background:rgba(11,16,32,.92)}\
.library-item h3{margin:0 0 6px;font-size:15px;line-height:1.25}\
.library-item p{margin:0;color:' + BRAND.muted + ';font-size:12px;line-height:1.4}\
.library-status{display:inline-flex;align-items:center;padding:5px 8px;margin-bottom:8px;border-radius:999px;background:rgba(37,99,235,.18);color:#bfdbfe;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}\
.library-link,.library-copy{align-self:center}\
.library-link{border:0;border-radius:12px;padding:0 14px;min-height:38px;font-weight:800;cursor:pointer;background:' + BRAND.primary + ';color:#fff}\
.library-link:hover{background:' + BRAND.primaryHover + '}\
.library-empty,.empty-state,.loading-panel{padding:18px;border:1px dashed ' + BRAND.border + ';border-radius:16px;color:' + BRAND.muted + ';font-size:13px;line-height:1.5;background:rgba(11,16,32,.82)}\
.empty-state.slim{padding:12px}\
.settings-shell{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:0;transition:opacity .18s ease}\
.settings-shell[hidden]{display:none}\
.settings-shell.open{pointer-events:auto;opacity:1}\
.settings-backdrop{position:absolute;inset:0;background:rgba(2,6,23,.72);backdrop-filter:blur(8px)}\
.settings-modal{position:relative;width:min(1320px,calc(100vw - 40px));max-height:calc(100vh - 40px);display:flex;flex-direction:column;border:1px solid ' + BRAND.border + ';border-radius:26px;background:linear-gradient(180deg,rgba(13,19,36,.98),rgba(8,12,24,.98));box-shadow:0 40px 120px rgba(2,6,23,.55);overflow:hidden}\
.settings-head{display:flex;align-items:center;gap:12px;padding:18px 22px;border-bottom:1px solid ' + BRAND.border + ';background:linear-gradient(180deg,rgba(19,30,53,.98),rgba(12,17,30,.92))}\
.settings-head h2{margin:0;font-size:20px;line-height:1.1;font-weight:900}\
.settings-head p{margin:4px 0 0;color:' + BRAND.muted + ';font-size:12px}\
.settings-tabs{display:flex;gap:8px;padding:14px 18px;border-bottom:1px solid ' + BRAND.border + ';overflow:auto;background:rgba(9,14,27,.85)}\
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
.provider-card,.model-card,.assignment-card,.placeholder-block{border:1px solid ' + BRAND.border + ';border-radius:20px;background:' + BRAND.surfaceSoft + ';padding:16px;display:flex;flex-direction:column;gap:12px}\
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
.status-pill.success{background:rgba(16,185,129,.15);color:#a7f3d0;border-color:rgba(16,185,129,.32)}\
.status-pill.error{background:rgba(239,68,68,.14);color:#fecaca;border-color:rgba(239,68,68,.32)}\
.status-pill.info{background:rgba(37,99,235,.18);color:#bfdbfe;border-color:rgba(37,99,235,.32)}\
.status-pill.muted{background:rgba(148,163,184,.12);color:' + BRAND.muted + ';border-color:rgba(148,163,184,.18)}\
.flash,.inline-message{border-radius:14px;padding:12px 14px;font-size:13px;line-height:1.5;border:1px solid transparent}\
.flash.ok,.inline-message.ok{background:rgba(16,185,129,.12);color:#d1fae5;border-color:rgba(16,185,129,.28)}\
.flash.err,.inline-message.err{background:rgba(127,29,29,.28);color:#fecaca;border-color:rgba(239,68,68,.28)}\
.flash.warn,.inline-message.warn{background:rgba(120,53,15,.28);color:#fde68a;border-color:rgba(245,158,11,.28)}\
.flash.info,.inline-message.info{background:rgba(37,99,235,.14);color:#dbeafe;border-color:rgba(37,99,235,.3)}\
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
        <span class="action-foot">Нативный create flow Penpot</span>\
      </button>\
      <button class="action-card" type="button" data-action="import">\
        <span class="action-kicker">Import</span>\
        <p class="action-title">Импортировать .penpot</p>\
        <p class="action-copy">Загрузка идет напрямую через нативный drop flow рабочего дашборда.</p>\
        <span class="action-foot">Готово для локальных файлов</span>\
      </button>\
      <button class="action-card" type="button" data-action="libraries">\
        <span class="action-kicker">Libraries</span>\
        <p class="action-title">Каталог Nofida</p>\
        <p class="action-copy">Локальный curated catalog из <code>/nofida/libraries/catalog.json</code>.</p>\
        <span class="action-foot">Host-backed store и same-origin файлы</span>\
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
    <div class="ctx-strip" id="ctx-strip">\
      <span id="ctx-file">Файл: —</span>\
      <span class="ctx-dot">·</span>\
      <span id="ctx-page">Страница: —</span>\
      <span class="ctx-dot">·</span>\
      <span id="ctx-sel">Выбрано: 0</span>\
    </div>\
    <div class="log" id="log">\
      <div class="ai-msg">\
        <div class="ai-avatar">N</div>\
        <div class="ai-content">\
          <div class="ai-bubble">Привет! Я <b>NOFIDA AI</b> — ваш ассистент по дизайну.<br><br>Спросите меня:<br>• «что в этом файле?»<br>• «какую библиотеку взять для SaaS?»<br>• «проверь экран на проблемы»<br><br>Для реального провайдера откройте <b>Settings</b>.</div>\
        </div>\
      </div>\
    </div>\
    <form class="compose" id="compose">\
      <input id="prompt" placeholder="Спросите NOFIDA AI…" autocomplete="off" />\
      <button type="submit" id="send-btn">→</button>\
    </form>\
  </aside>\
  <aside class="library-drawer" id="library-drawer" role="dialog" aria-label="NOFIDA Libraries">\
    <div class="panel-head">\
      <span class="dot"></span>\
      <h2>NOFIDA Libraries</h2>\
      <small>local catalog</small>\
      <button class="close" type="button" data-close="libraries" aria-label="Закрыть">×</button>\
    </div>\
    <div class="library-body">\
      <p class="library-note">Каталог читается из server-side store. После monthly sync approved файлы доступны по same-origin URL в <code>/nofida/libraries/files/</code>.</p>\
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
    state.els.ctxFile = state.root.getElementById("ctx-file");
    state.els.ctxPage = state.root.getElementById("ctx-page");
    state.els.ctxSel = state.root.getElementById("ctx-sel");
    state.els.log = state.root.getElementById("log");
    state.els.form = state.root.getElementById("compose");
    state.els.input = state.root.getElementById("prompt");
    state.els.sendBtn = state.root.getElementById("send-btn");
    state.els.drawer = state.root.getElementById("library-drawer");
    state.els.libraryList = state.root.getElementById("library-list");
    state.els.importFile = state.root.getElementById("import-file");
    state.els.settingsShell = state.root.getElementById("settings-shell");
    state.els.settingsBody = state.root.getElementById("settings-body");
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

  function renderPlan(plan) {
    var wrap = document.createElement("div");
    wrap.className = "plan";

    var head = document.createElement("div");
    head.className = "plan-head";
    head.innerHTML = "<span>Preview plan</span><span style='opacity:.72'>" + escapeHtml(plan.operation || "plan") + "</span><span class='ph-arrow'>▾</span>";

    var body = document.createElement("div");
    body.className = "plan-body";

    (plan.items || []).forEach(function (item) {
      var el = document.createElement("div");
      el.className = "plan-item";
      var label = escapeHtml(item.issue || item.title || item.screen_name || item.catalog_id || "Item");
      var detail = escapeHtml(item.suggestion || item.reason || item.purpose || "");
      el.innerHTML = "<b>" + label + "</b>" + (detail ? "<span>" + detail + "</span>" : "");
      body.appendChild(el);
    });

    head.addEventListener("click", function () {
      var open = body.classList.toggle("open");
      head.classList.toggle("open", open);
    });

    wrap.appendChild(head);
    wrap.appendChild(body);
    return wrap;
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

    if (plan && Array.isArray(plan.items)) content.appendChild(renderPlan(plan));

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
    if (!ctx) return;
    if (ctx.file) state.els.ctxFile.textContent = "📄 " + ctx.file.name;
    if (ctx.page) state.els.ctxPage.textContent = "Стр: " + ctx.page.name;
    state.els.ctxSel.textContent = "Выбрано: " + (((ctx.selection || []).length) || 0);
  }

  function requestContext() {
    if (!state.bridge || !state.bridge.extractContext) return;
    state.bridge.extractContext().then(function (ctx) {
      if (ctx) updateCtxStrip(ctx);
    }).catch(function () {});
  }

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
        appendAiMsg(data.answer || "NOFIDA AI returned an empty response.", data.operation_plan || null);
      })
      .catch(function (err) {
        loadingEl.remove();
        state._aiLoading = false;
        state.els.sendBtn.disabled = false;
        var msg = (err && err.message) ? err.message : "Ошибка связи с NOFIDA AI. Проверьте сервер.";
        appendAiMsg("⚠ " + msg, null);
      });
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

  function updateRouteState() {
    var visible = isAssistantRoute();
    state.els.fab.hidden = !visible;
    if (!visible) toggleAssistant(false);
    updateDashboardPosition();
    ensureLibrariesExpanded();
    scheduleAccountSettingsRefresh();
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
      return ensureSettingsLoaded(true);
    }).then(function () {
      setFlash("Role assignment updated for " + (ROLE_LABELS[role] || role) + ".", "success");
    }).catch(function (error) {
      setModelMessage(messageKey, error.message || "Failed to save model assignment.", "error");
    });
  }

  function testModel(modelId) {
    var providerId = state.settingsUi.modelProviderDrafts[modelId] || "openrouter";
    var messageKey = modelId + "::" + providerId;
    setModelMessage(messageKey, "Testing model…", "info");
    return apiJson(AI_TEST_MODEL_URL, {
      method: "POST",
      body: JSON.stringify({
        providerId: providerId,
        modelId: modelId
      })
    }).then(function (data) {
      var result = data.result || {};
      var tone = result.status === "test_passed" ? "success" : "error";
      setModelMessage(messageKey, (result.message || "Test finished.") + " · " + formatLatency(result.latencyMs), tone);
    }).catch(function (error) {
      setModelMessage(messageKey, error.message || "Model test failed.", "error");
    });
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
      if (!prompt) return;
      sendAiMessage(prompt);
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
