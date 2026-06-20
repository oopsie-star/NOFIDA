/* ==========================================================================
 * Nofida AI Bridge — transport abstraction (PATCH 016A)
 * --------------------------------------------------------------------------
 * The overlay (nofida-ai-core.js) calls bridge methods and never cares how
 * they are fulfilled. Pluggable transports keep the UI stable as the backend
 * matures.
 *
 * Hard Penpot constraint: the `penpot` canvas API is ONLY available inside
 * a plugin's sandboxed `code` file. Our injected DOM script cannot call it
 * directly. The real transport is a companion plugin (./plugin/) reached via
 * postMessage.
 *
 * 016A additions:
 *   - extractContext()  — requests a summarised file/page/selection snapshot
 *                        from the plugin; used by the AI panel context strip.
 *
 * Transports:
 *   "stub"   — logs requests, materialises nothing (default when plugin absent).
 *   "plugin" — relays over postMessage to the companion plugin iframe.
 *   "rpc"    — same-origin backend fallback (not implemented in 016A).
 * ========================================================================== */
(function () {
  "use strict";
  if (window.NofidaAIBridge) return;

  var PLUGIN_MANIFEST_URL = "/nofida/ai-core/plugin/manifest.json";
  var MSG = {
    REQ:     "nofida-ai:generate",
    RES:     "nofida-ai:result",
    READY:   "nofida-ai:ready",
    CTX_REQ: "nofida-ai:extract-context",
    CTX_RES: "nofida-ai:context",
  };
  var CONTEXT_TIMEOUT_MS = 5000;

  var pluginWindow = null;
  var pluginOrigin = window.location.origin;

  // ── transports ─────────────────────────────────────────────────────────────

  var transports = {
    stub: function (spec) {
      console.info("[Nofida AI] stub.generateLayers", spec);
      return Promise.resolve({
        ok: true,
        message: 'Локальный режим: подготовим рекомендации по запросу "' + (spec.prompt || "") + '"',
      });
    },

    plugin: function (spec) {
      if (!pluginWindow) {
        console.warn("[Nofida AI] plugin transport: plugin not connected");
        return Promise.resolve({ ok: false, message: "plugin not connected" });
      }
      return new Promise(function (resolve) {
        var id = Math.random().toString(36).slice(2);
        function onMessage(e) {
          if (e.source !== pluginWindow) return;
          if (!e.data || e.data.type !== MSG.RES || e.data.id !== id) return;
          window.removeEventListener("message", onMessage);
          resolve(e.data.result);
        }
        window.addEventListener("message", onMessage);
        pluginWindow.postMessage({ type: MSG.REQ, id: id, spec: spec }, pluginOrigin);
      });
    },

    rpc: function (spec) {
      console.warn("[Nofida AI] rpc transport not implemented in 016A", spec);
      return Promise.resolve({ ok: false, message: "rpc transport not implemented" });
    },
  };

  // ── bridge object ──────────────────────────────────────────────────────────

  var bridge = {
    transport: "stub",
    pluginManifestUrl: PLUGIN_MANIFEST_URL,
    messages: MSG,

    setTransport: function (name) {
      if (!transports[name]) throw new Error("unknown transport: " + name);
      this.transport = name;
    },

    connectPlugin: function (win, origin) {
      pluginWindow = win;
      if (origin) pluginOrigin = origin;
      this.setTransport("plugin");
      console.info("[Nofida AI] companion plugin connected");
    },

    generateLayers: function (spec) {
      return transports[this.transport](spec || {});
    },

    /* Request a summarised file/page/selection context snapshot from the plugin.
       Returns a Promise<context|null>. Resolves null if plugin unavailable or
       if the response does not arrive within CONTEXT_TIMEOUT_MS. */
    extractContext: function () {
      if (!pluginWindow) return Promise.resolve(null);

      return new Promise(function (resolve) {
        var id = Math.random().toString(36).slice(2);
        var timer = setTimeout(function () {
          window.removeEventListener("message", onMessage);
          resolve(null);
        }, CONTEXT_TIMEOUT_MS);

        function onMessage(e) {
          if (e.source !== pluginWindow) return;
          if (!e.data || e.data.type !== MSG.CTX_RES || e.data.id !== id) return;
          window.removeEventListener("message", onMessage);
          clearTimeout(timer);
          resolve(e.data.context || null);
        }

        window.addEventListener("message", onMessage);
        pluginWindow.postMessage({ type: MSG.CTX_REQ, id: id }, pluginOrigin);
      });
    },
  };

  // Auto-connect when the companion plugin announces itself.
  window.addEventListener("message", function (e) {
    if (e.data && e.data.type === MSG.READY) bridge.connectPlugin(e.source, e.origin);
  });

  window.NofidaAIBridge = bridge;
})();
