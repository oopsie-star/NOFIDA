/* ==========================================================================
 * Nofida Designer — canvas capture (PATCH 026A.6)
 * --------------------------------------------------------------------------
 * The policy layer above ai-bridge.js's low-level captureBoard() postMessage
 * relay (which talks to the companion plugin's shape.export() call — see
 * docs/nofida-canvas-capture-026a.md for why that mechanism was chosen over
 * reading pixels off the WASM viewport canvas directly or hand-rolling the
 * exporter-service RPC).
 *
 * Hard-gated behind nofida_ai_visual_critic_v1 (feature-flags.js's
 * isEnabled() — the caller supplies the server-reported flags, this module
 * never fetches them itself, same convention as everywhere else in
 * designer/). The gate is checked BEFORE ever touching the plugin bridge —
 * a disabled flag means zero postMessage traffic, not just a discarded
 * result.
 *
 * "Never a silent skip and never a blank image passed on as success" (this
 * patch's own rule): every path through captureBoard() below resolves the
 * same { ok:false, error:"capture_unavailable", reason } shape on failure —
 * there is no code path that resolves `undefined`/`null`. The RIGOROUS
 * flat-image/invalid-PNG check lives server-side (capture-validator.mjs,
 * pure Node, unit-testable without a browser) — this module does only a
 * cheap client-side sanity check before ever bothering to upload.
 * ========================================================================== */
(function () {
  "use strict";
  if (window.NofidaDesigner && window.NofidaDesigner.CanvasCapture) return;
  window.NofidaDesigner = window.NofidaDesigner || {};

  function unavailable(reason) {
    return { ok: false, error: "capture_unavailable", reason: reason };
  }

  // Checks the IMAGE PAYLOAD shape only (pngBase64/width/height) — never
  // `.ok`, because this is reused for two different things: validating a
  // captureBoard() RESULT (which has `.ok`) and validating a plain capture
  // DATA object passed into submitCapture() (which never has `.ok` — the
  // caller already knows it succeeded, that's why they're uploading it).
  // captureBoard() below checks `.ok === true` itself, separately.
  function looksLikeUsableCapture(capture) {
    return !!(
      capture &&
      typeof capture.pngBase64 === "string" && capture.pngBase64.length > 0 &&
      typeof capture.width === "number" && capture.width > 1 &&
      typeof capture.height === "number" && capture.height > 1
    );
  }

  /**
   * captureBoard(boardId, { scale, serverFlags }) -> Promise<CaptureResult>
   * CaptureResult is either
   *   { ok:true, pngBase64, width, height, scale, capturedAt }
   *   { ok:false, error:"capture_unavailable", reason }
   * `serverFlags` is the `flags` object from GET /ai/settings (see
   * ai-service.mjs's getSettingsView()) — required, not fetched here.
   */
  function captureBoard(boardId, opts) {
    opts = opts || {};
    var flags = window.NofidaDesigner.FeatureFlags;
    if (!flags || !flags.isEnabled(opts.serverFlags, "visualCriticV1")) {
      return Promise.resolve(unavailable("nofida_ai_visual_critic_v1 is disabled"));
    }
    if (!boardId) {
      return Promise.resolve(unavailable("no boardId supplied"));
    }
    if (!window.NofidaAIBridge || typeof window.NofidaAIBridge.captureBoard !== "function") {
      return Promise.resolve(unavailable("AI bridge not loaded"));
    }

    return window.NofidaAIBridge.captureBoard(boardId, { scale: opts.scale === 2 ? 2 : 1 })
      .then(function (result) {
        if (result && result.ok === true && looksLikeUsableCapture(result)) return result;
        if (result && result.ok === false && result.error) return result;
        return unavailable("plugin returned an unusable result");
      })
      .catch(function (err) {
        return unavailable(String((err && err.message) || err));
      });
  }

  /**
   * submitCapture({ sessionId, semanticId, revision, capture, serverFlags }) ->
   *   Promise<{ ok, error?, reason? }>
   * Uploads an already-captured image to the server (POST /ai/designer/captures),
   * reusing the existing base64-attachment request shape
   * (server.mjs's { mimeType, dataBase64 } convention) so the endpoint can
   * lean on the same size/format checks that path already established.
   * The server independently re-validates with capture-validator.mjs before
   * ever persisting it as a session artifact — this call being flag-gated
   * client-side is a UX nicety, not the enforcement boundary.
   */
  function submitCapture(params) {
    params = params || {};
    var flags = window.NofidaDesigner.FeatureFlags;
    if (!flags || !flags.isEnabled(params.serverFlags, "visualCriticV1")) {
      return Promise.resolve(unavailable("nofida_ai_visual_critic_v1 is disabled"));
    }
    if (!params.sessionId || !params.semanticId || !params.capture) {
      return Promise.resolve(unavailable("sessionId, semanticId, and capture are required"));
    }
    if (!looksLikeUsableCapture(params.capture)) {
      return Promise.resolve(unavailable("capture is not a usable image — refusing to upload"));
    }

    return fetch("/ai/designer/captures", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: params.sessionId,
        semanticId: params.semanticId,
        revision: params.revision,
        mimeType: "image/png",
        dataBase64: params.capture.pngBase64,
        width: params.capture.width,
        height: params.capture.height,
        scale: params.capture.scale || 1,
      }),
    }).then(function (res) {
      return res.json().catch(function () { return unavailable("server returned a non-JSON response"); });
    }).catch(function (err) {
      return unavailable(String((err && err.message) || err));
    });
  }

  window.NofidaDesigner.CanvasCapture = {
    captureBoard: captureBoard,
    submitCapture: submitCapture,
  };
})();
