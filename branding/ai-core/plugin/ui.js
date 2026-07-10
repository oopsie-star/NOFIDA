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
 *
 * 016F added a Screen Spec apply relay pair here; PATCH 025A removed it —
 * screen specs now apply via a direct update-file write (ai-bridge.js +
 * branding/ai-core/designer/), not through the plugin sandbox.
 *
 * 016G additions (library auto-connect):
 *   nofida-ai:connect-libraries            →  nofida-plugin:connect-libraries            (down)
 *   nofida-plugin:connect-libraries-result → nofida-ai:connect-libraries-result          (up)
 *
 * This iframe, the top window, and the parent frame Penpot forwards into are
 * all served from the same app origin — so every relay below targets that
 * origin explicitly instead of "*".
 * ========================================================================== */
(function () {
  "use strict";

  var SELF_ORIGIN = window.location.origin;

  // Announce to the overlay so its AI bridge connects this iframe as the
  // live "plugin" transport (NofidaAIBridge.connectPlugin via ready message).
  try { window.top.postMessage({ type: "nofida-ai:ready" }, SELF_ORIGIN); } catch (_) {}

  window.addEventListener("message", function (e) {
    if (e.origin !== SELF_ORIGIN) return;
    var d = e.data || {};

    // ── overlay → plugin code: layer generation ───────────────────────────
    if (d.type === "nofida-ai:generate") {
      window.parent.postMessage(
        { type: "nofida-plugin:generate", id: d.id, spec: d.spec }, SELF_ORIGIN
      );
      return;
    }

    // ── plugin code → overlay: generation result ──────────────────────────
    if (d.type === "nofida-plugin:result") {
      window.top.postMessage(
        { type: "nofida-ai:result", id: d.id, result: d.result }, SELF_ORIGIN
      );
      return;
    }

    // ── overlay → plugin code: context extraction request (016A) ──────────
    if (d.type === "nofida-ai:extract-context") {
      window.parent.postMessage(
        { type: "nofida-plugin:extract-context", id: d.id }, SELF_ORIGIN
      );
      return;
    }

    // ── plugin code → overlay: context snapshot (016A) ────────────────────
    if (d.type === "nofida-plugin:context") {
      window.top.postMessage(
        { type: "nofida-ai:context", id: d.id, context: d.context }, SELF_ORIGIN
      );
      return;
    }

    // ── overlay → plugin code: connect libraries request (016G) ───────────
    if (d.type === "nofida-ai:connect-libraries") {
      window.parent.postMessage(
        { type: "nofida-plugin:connect-libraries", id: d.id, libraryIds: d.libraryIds }, SELF_ORIGIN
      );
      return;
    }

    // ── plugin code → overlay: connect-libraries result (016G) ────────────
    if (d.type === "nofida-plugin:connect-libraries-result") {
      window.top.postMessage(
        { type: "nofida-ai:connect-libraries-result", id: d.id, result: d.result }, SELF_ORIGIN
      );
      return;
    }
  });
})();
