/* ==========================================================================
 * Nofida AI — plugin UI relay (runs in the plugin's sandboxed iframe)
 * --------------------------------------------------------------------------
 * The penpot API is NOT available here (only in code.js). This file is a
 * message relay between two sides:
 *   • Nofida overlay in the top window   (nofida-ai:*          messages)
 *   • Plugin code file via parent frame  (nofida-plugin:*      messages)
 *
 * 016A additions:
 *   nofida-ai:extract-context  →  nofida-plugin:extract-context  (down)
 *   nofida-plugin:context      →  nofida-ai:context              (up)
 * ========================================================================== */
(function () {
  "use strict";

  // Announce to the overlay so its AI bridge connects this iframe as the
  // live "plugin" transport (NofidaAIBridge.connectPlugin via ready message).
  try { window.top.postMessage({ type: "nofida-ai:ready" }, "*"); } catch (_) {}

  window.addEventListener("message", function (e) {
    var d = e.data || {};

    // ── overlay → plugin code: layer generation ───────────────────────────
    if (d.type === "nofida-ai:generate") {
      window.parent.postMessage(
        { type: "nofida-plugin:generate", id: d.id, spec: d.spec }, "*"
      );
      return;
    }

    // ── plugin code → overlay: generation result ──────────────────────────
    if (d.type === "nofida-plugin:result") {
      window.top.postMessage(
        { type: "nofida-ai:result", id: d.id, result: d.result }, "*"
      );
      return;
    }

    // ── overlay → plugin code: context extraction request (016A) ──────────
    if (d.type === "nofida-ai:extract-context") {
      window.parent.postMessage(
        { type: "nofida-plugin:extract-context", id: d.id }, "*"
      );
      return;
    }

    // ── plugin code → overlay: context snapshot (016A) ────────────────────
    if (d.type === "nofida-plugin:context") {
      window.top.postMessage(
        { type: "nofida-ai:context", id: d.id, context: d.context }, "*"
      );
      return;
    }
  });
})();
