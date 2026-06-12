/* ==========================================================================
 * Nofida AI — plugin UI relay (runs in the plugin's sandboxed iframe)
 * --------------------------------------------------------------------------
 * The penpot API is NOT available here (only in code.js). This file is purely
 * a message relay between two sides:
 *   • the Nofida overlay in the top window  (nofida-ai:* messages)
 *   • the plugin code file via the parent   (nofida-plugin:* messages)
 *
 * Messages are routed by `type` (not by source) because in the plugin sandbox
 * window.top and window.parent can resolve to the same Penpot app window.
 * ========================================================================== */
(function () {
  "use strict";

  // Announce to the overlay so its AI bridge connects this iframe as the live
  // "plugin" transport (NofidaAIBridge.connectPlugin via the ready message).
  try { window.top.postMessage({ type: "nofida-ai:ready" }, "*"); } catch (e) {}

  window.addEventListener("message", function (e) {
    var d = e.data || {};

    // Overlay → here: forward the generate request down to the plugin code.
    if (d.type === "nofida-ai:generate") {
      window.parent.postMessage({ type: "nofida-plugin:generate", id: d.id, spec: d.spec }, "*");
      return;
    }

    // Plugin code → here (penpot.ui.sendMessage): forward result up to overlay.
    if (d.type === "nofida-plugin:result") {
      window.top.postMessage({ type: "nofida-ai:result", id: d.id, result: d.result }, "*");
      return;
    }
  });
})();
