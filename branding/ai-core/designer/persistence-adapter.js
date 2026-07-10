/* ==========================================================================
 * Nofida Designer — persistence adapter (PATCH 025A, addendum-revised)
 * --------------------------------------------------------------------------
 * Browser-only: owns everything the pure scene-compiler.mjs Change IR needs
 * to actually reach Penpot — file/page resolution from the workspace URL,
 * the update-file RPC, revision-conflict retry, dry-run, create-mode
 * snapshot/rollback, the bulk-update feature gate, and the idempotency
 * store (keyed by a value the ORCHESTRATOR — ai-bridge.js — computes BEFORE
 * any Penpot UUID exists, since uuids are freshly random per compile and
 * can't themselves be part of an idempotency key).
 *
 * This is the direct-write path proved out before PATCH 025A: the exact same
 * `/api/main/methods/update-file` RPC every manual editor edit persists
 * through, bypassing the plugin sandbox's bulk-write rendering bug entirely
 * (see ai-bridge.js's header comment for the full history).
 *
 * PATCH 025A addendum:
 *   - ALLOW_BULK_UPDATE is false by default. Update-mode changes (mod-obj
 *     against existing objects) are refused before any network call until a
 *     real update-mode rollback (restoring PRIOR field values, not just
 *     deleting newly-created ids) exists — reading current object state
 *     back from get-file would need Transit.decode(), which is explicitly
 *     documented as unsafe on large nested payloads. Create-mode
 *     (add-obj-only) is unaffected and its rollback is fully supported.
 *   - The idempotency store is keyed by a caller-supplied string (built from
 *     operationId+fileId+pageId+normalizedSceneHash+mode — see ai-bridge.js)
 *     and checked/populated BEFORE compileScene() ever runs, so a retried
 *     operation reuses the exact same Penpot-id mapping instead of compiling
 *     fresh (and thus different, duplicate-creating) uuids.
 * ========================================================================== */
(function () {
  "use strict";
  if (window.NofidaDesigner && window.NofidaDesigner.Persistence) return;
  window.NofidaDesigner = window.NofidaDesigner || {};

  var ALLOW_BULK_UPDATE = false;

  function Transit() { return window.NofidaDesigner.Transit; }

  function resolveTarget() {
    var hash = window.location.hash || "";
    var qIndex = hash.indexOf("?");
    if (qIndex < 0) return null;
    var params = new URLSearchParams(hash.slice(qIndex + 1));
    var fileId = params.get("file-id");
    var pageId = params.get("page-id");
    if (!fileId || !pageId) return null;
    return { fileId: fileId, pageId: pageId };
  }

  function fetchRevnVern(fileId) {
    return fetch("/api/main/methods/get-file?id=" + encodeURIComponent(fileId), { credentials: "include" })
      .then(function (res) {
        if (!res.ok) throw new Error("get-file failed: " + res.status);
        return res.json();
      })
      .then(function (raw) {
        var top = Transit().shallowTopLevel(raw, ["revn", "vern"]);
        return { revn: top.revn, vern: top.vern };
      });
  }

  function postUpdateFile(fileId, revn, vern, wireChanges) {
    var sessionId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Math.random()).slice(2);
    var payload = {
      id: Transit().uuid(fileId),
      "session-id": Transit().uuid(sessionId),
      revn: revn,
      vern: vern,
      changes: wireChanges,
    };
    return fetch("/api/main/methods/update-file", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/transit+json" },
      body: JSON.stringify(Transit().encode(payload)),
    });
  }

  function postChanges(fileId, changes, retriesLeft) {
    var wireChanges = changes.map(Transit().changeToWireEntry);
    return fetchRevnVern(fileId).then(function (rv) {
      return postUpdateFile(fileId, rv.revn, rv.vern, wireChanges).then(function (res) {
        if (res.ok) return { ok: true };
        return res.text().then(function (text) {
          var isConflict = res.status === 409 || /conflict/i.test(text);
          if (isConflict && retriesLeft > 0) return postChanges(fileId, changes, retriesLeft - 1);
          var detail = text;
          try { detail = JSON.stringify(Transit().decode(JSON.parse(text))).slice(0, 500); } catch (_) {}
          return { ok: false, message: "update-file failed (" + res.status + "): " + detail };
        });
      });
    });
  }

  // Idempotency store — session-scoped (resets on reload, fine since Penpot
  // editor sessions are per-tab). Keyed by a value the orchestrator computes
  // BEFORE compiling, so a retried operation never mints fresh Penpot uuids
  // for content it already successfully created.
  var idempotencyStore = {};

  function getIdempotentEntry(key) {
    return idempotencyStore[key];
  }

  function storeIdempotentEntry(key, entry) {
    idempotencyStore[key] = entry;
  }

  var lastApplied = null; // { fileId, ids: [...] } — create-mode rollback target

  /**
   * Applies a compiled Change IR (see scene-compiler.mjs's compileScene()).
   * opts: { fileId, pageId, mode, dryRun }
   * Returns Promise<{ok, message, changeCount}>.
   */
  function applyChanges(changes, opts) {
    opts = opts || {};
    var fileId = opts.fileId;
    if (!fileId) return Promise.resolve({ ok: false, message: "no target file" });
    if (!changes.length) return Promise.resolve({ ok: false, message: "no changes to apply" });

    if (opts.mode === "update" && !ALLOW_BULK_UPDATE) {
      return Promise.resolve({
        ok: false,
        message: "Bulk update is disabled (ALLOW_BULK_UPDATE=false) until update-mode rollback (restoring prior field values, not just deleting newly-created ids) is implemented. Create mode is unaffected.",
      });
    }

    if (opts.dryRun) {
      return Promise.resolve({ ok: true, message: "dry run — " + changes.length + " change(s) not sent", changeCount: changes.length, dryRun: true });
    }

    return postChanges(fileId, changes, 1).then(function (result) {
      if (result.ok) {
        var addedIds = changes.filter(function (c) { return c.op === "add-obj"; }).map(function (c) { return c.id; });
        if (addedIds.length) lastApplied = { fileId: fileId, ids: addedIds };
        return { ok: true, message: "applied " + changes.length + " change(s)", changeCount: changes.length };
      }
      return result;
    });
  }

  /** Deletes every id the last successful create-mode apply added. */
  function rollbackLastApply() {
    if (!lastApplied || !lastApplied.ids.length) {
      return Promise.resolve({ ok: false, message: "nothing to roll back" });
    }
    var target = lastApplied;
    lastApplied = null;
    var delChanges = target.ids.map(function (id) { return { op: "del-obj", id: id }; });
    return postChanges(target.fileId, delChanges, 1);
  }

  window.NofidaDesigner.Persistence = {
    ALLOW_BULK_UPDATE: ALLOW_BULK_UPDATE,
    resolveTarget: resolveTarget,
    fetchRevnVern: fetchRevnVern,
    getIdempotentEntry: getIdempotentEntry,
    storeIdempotentEntry: storeIdempotentEntry,
    applyChanges: applyChanges,
    rollbackLastApply: rollbackLastApply,
  };
})();
