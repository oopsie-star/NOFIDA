/* ==========================================================================
 * Nofida AI Bridge — transport abstraction for layer generation
 * --------------------------------------------------------------------------
 * The overlay (nofida-ai-core.js) calls `NofidaAIBridge.generateLayers(spec)`
 * and never cares HOW the layers get created. This file owns that "how" with
 * pluggable transports, so the UI never changes as the backend matures.
 *
 * Hard Penpot constraint that drives this design:
 *   The `penpot` layer-creation API (penpot.createBoard / createRectangle /
 *   createText …) is ONLY available inside a plugin's sandboxed `code` file.
 *   Our injected DOM script cannot call it directly. So the real transport is
 *   a companion Penpot plugin (see ./plugin/) that we talk to over postMessage.
 *
 * Transports:
 *   - "stub"   (v1 default) — logs the request, materializes nothing.
 *   - "plugin" (target)     — relays the spec to the Nofida companion plugin
 *                             iframe; the plugin calls the penpot API.
 *   - "rpc"    (fallback)   — same-origin POST /api/rpc/... with the session
 *                             cookie. Penpot's file-change RPC is complex and
 *                             undocumented for external use → last resort.
 * ========================================================================== */
(function () {
  "use strict";
  if (window.NofidaAIBridge) return;

  var PLUGIN_MANIFEST_URL = "/nofida/ai-core/plugin/manifest.json";
  var MSG = { REQ: "nofida-ai:generate", RES: "nofida-ai:result", READY: "nofida-ai:ready" };

  var pluginWindow = null;   // set once the companion plugin connects
  var pluginOrigin = window.location.origin;

  var transports = {
    /* v1 default: prove the wiring end-to-end without touching the document. */
    stub: function (spec) {
      console.info("[Nofida AI] stub.generateLayers", spec);
      return Promise.resolve({
        ok: true,
        message: 'stub: would generate layers for "' + (spec.prompt || "") + '"'
      });
    },

    /* Target transport: relay to the sandboxed companion plugin. */
    plugin: function (spec) {
      if (!pluginWindow) {
        console.warn("[Nofida AI] plugin transport selected but plugin not connected yet");
        return Promise.resolve({ ok: false, message: "plugin not connected" });
      }
      return new Promise(function (resolve) {
        var id = Math.random().toString(36).slice(2);
        function onMessage(e) {
          if (e.source !== pluginWindow) return;             // origin/source check
          if (!e.data || e.data.type !== MSG.RES || e.data.id !== id) return;
          window.removeEventListener("message", onMessage);
          resolve(e.data.result);
        }
        window.addEventListener("message", onMessage);
        pluginWindow.postMessage({ type: MSG.REQ, id: id, spec: spec }, pluginOrigin);
      });
    },

    /* Fallback: direct backend RPC (left unimplemented in v1). */
    rpc: function (spec) {
      console.warn("[Nofida AI] rpc transport not implemented in v1", spec);
      return Promise.resolve({ ok: false, message: "rpc transport not implemented" });
    }
  };

  var bridge = {
    transport: "stub",
    pluginManifestUrl: PLUGIN_MANIFEST_URL,
    messages: MSG,

    setTransport: function (name) {
      if (!transports[name]) throw new Error("unknown transport: " + name);
      this.transport = name;
    },

    /* Called by the companion plugin's UI once it has loaded, to register the
       postMessage channel and flip the bridge onto the live transport. */
    connectPlugin: function (win, origin) {
      pluginWindow = win;
      if (origin) pluginOrigin = origin;
      this.setTransport("plugin");
      console.info("[Nofida AI] companion plugin connected");
    },

    generateLayers: function (spec) {
      return transports[this.transport](spec || {});
    }
  };

  // Listen for the plugin announcing itself (future auto-connect path).
  window.addEventListener("message", function (e) {
    if (e.data && e.data.type === MSG.READY) bridge.connectPlugin(e.source, e.origin);
  });

  window.NofidaAIBridge = bridge;
})();
