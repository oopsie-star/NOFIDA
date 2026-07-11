/* ==========================================================================
 * Nofida AI Bridge — transport abstraction (PATCH 016A, refactored 025A)
 * --------------------------------------------------------------------------
 * The overlay (nofida-ai-core.js) calls bridge methods and never cares how
 * they are fulfilled. Pluggable transports keep the UI stable as the backend
 * matures.
 *
 * Hard Penpot constraint: the `penpot` canvas API is ONLY available inside
 * a plugin's sandboxed `code` file. Our injected DOM script cannot call it
 * directly. The real transport for generateLayers/extractContext/
 * connectLibraries is a companion plugin (./plugin/) reached via postMessage.
 *
 * Transports:
 *   "stub"   — logs requests, materialises nothing (default when plugin absent).
 *   "plugin" — relays over postMessage to the companion plugin iframe.
 *   "rpc"    — same-origin backend fallback (not implemented in 016A).
 *
 * Screen Spec application (applyScreenSpec) does NOT go through any of the
 * above — see PATCH 025A. Bulk shape creation through Penpot's Plugin API
 * (penpot.createRectangle() etc., what the companion plugin does) silently
 * fails to paint on the WASM canvas past a certain shape count (confirmed
 * live: a 95-shape screen created every shape with correct data — verified
 * in the properties panel — but the canvas stayed blank, and a full reload
 * didn't fix it). This matches known, currently-open Penpot upstream issues
 * (penpot/penpot #8520, #9162, #8085) about Plugin-API property setters and
 * the new renderer silently losing writes on bulk/complex operations.
 * Penpot's own official MCP server has the same problem — its `execute_code`
 * tool runs inside this same plugin sandbox, not a different path.
 *
 * PATCH 025A — this file is now a thin orchestrator, not a shape compiler.
 * applyScreenSpec() dynamic-imports the pure Scene Model pipeline
 * (designer/scene/scene-validator.mjs -> scene-canonicalizer.mjs ->
 * scene-normalizer.mjs -> scene-compiler.mjs — no DOM/network access, shared
 * byte-for-byte with the server, see scripts/sync-shared-scene.sh and its
 * build-time equivalence gate, scripts/check-shared-scene-sync.sh) and hands
 * the compiled Change IR to designer/persistence-adapter.js, which owns the
 * direct `update-file` RPC write (the exact same mutation every manual
 * editor edit persists through — bypasses the plugin sandbox and the bug
 * above entirely) plus a pre-UUID idempotency store and the bulk-update
 * feature gate (off by default — see persistence-adapter.js).
 *
 * Status: CODE READY / LIVE RENDER VERIFICATION REQUIRED. The compiled
 * output has been verified against a stubbed transport (see
 * scripts/verify-025a-scene-pipeline.mjs) but NOT yet against a live Penpot
 * canvas — do not treat the original blank-canvas bug as fixed until a
 * normalized complex screen has been confirmed live: appears on canvas,
 * survives reload, loses no supported elements, and rollback correctly
 * removes it.
 * ========================================================================== */
(function () {
  "use strict";
  if (window.NofidaAIBridge) return;

  var DESIGNER_BASE = "/nofida/ai-core/designer/";
  var scenePipelinePromise = null;
  // Cache-busting query param for the designer/ scripts below — none of them
  // go through patch-frontend.sh's ?v=${ASSET_TAG} rewrite (that only
  // touches the fixed list of scripts injected into index.html at build
  // time; these are loaded dynamically at runtime instead). Without this,
  // a redeploy can leave a browser tab running stale cached JS indefinitely
  // (confirmed live: a bugfix redeployed to the server was invisible to an
  // already-open tab even after a full page reload, since the classic
  // <script src> and dynamic import() below are ordinary cacheable
  // sub-resource requests, not the top-level navigation). Tied to
  // penpotVersionTag so it changes exactly when patch-frontend.sh's own
  // ASSET_TAG does.
  var CACHE_BUST = "?v=" + (window.penpotVersionTag || "dev");

  function newId() {
    return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : (
      "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
        var r = (Math.random() * 16) | 0;
        var v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      })
    );
  }

  // designer/{transit,persistence}-adapter.js are classic scripts (they
  // touch window/fetch/cookies) and self-register on window.NofidaDesigner;
  // the pure Scene Model modules are real ES modules loaded via dynamic
  // import(), which works from a classic script without a bundler.
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var el = document.createElement("script");
      el.src = src;
      el.onload = resolve;
      el.onerror = function () { reject(new Error("failed to load " + src)); };
      document.head.appendChild(el);
    });
  }

  function loadScenePipeline() {
    if (scenePipelinePromise) return scenePipelinePromise;
    var needAdapters = !(window.NofidaDesigner && window.NofidaDesigner.Persistence);
    var adapters = needAdapters
      ? loadScript(DESIGNER_BASE + "transit-adapter.js" + CACHE_BUST).then(function () {
          return loadScript(DESIGNER_BASE + "persistence-adapter.js" + CACHE_BUST);
        })
      : Promise.resolve();

    scenePipelinePromise = adapters.then(function () {
      // .js, not .mjs — Penpot's base nginx config 301s unrecognized
      // extensions to /404; the frontend mirror is written as .js by
      // scripts/sync-shared-scene.sh for exactly this reason. Extension
      // doesn't affect ESM semantics in the browser, only Node's resolver.
      return Promise.all([
        import(DESIGNER_BASE + "scene/scene-validator.js" + CACHE_BUST),
        import(DESIGNER_BASE + "scene/scene-canonicalizer.js" + CACHE_BUST),
        import(DESIGNER_BASE + "scene/scene-normalizer.js" + CACHE_BUST),
        import(DESIGNER_BASE + "scene/scene-compiler.js" + CACHE_BUST),
      ]);
    }).then(function (mods) {
      return { validator: mods[0], canonicalizer: mods[1], normalizer: mods[2], compiler: mods[3] };
    });
    return scenePipelinePromise;
  }

  // PATCH 026A.8 — lazy-loads the full live Autonomous Designer runtime:
  // transit+persistence (reusing loadScenePipeline()'s own adapter step),
  // feature-flags.js, canvas-capture.js, and designer-workflow.js, in that
  // order (each later script assumes the earlier ones already registered
  // themselves on window.NofidaDesigner). Idempotent/cached the same way
  // loadScenePipeline() is — nofida-ai-core.js may call this once per panel
  // load, well before the user's first message.
  var featureFlagsPromise = null;
  // Loads ONLY feature-flags.js (tiny, no adapters) — nofida-ai-core.js
  // calls this eagerly (e.g. once settings are loaded) so
  // NofidaDesigner.FeatureFlags.isEnabled() can gate a chat message BEFORE
  // paying for the full designer runtime below.
  function loadFeatureFlags() {
    if (featureFlagsPromise) return featureFlagsPromise;
    featureFlagsPromise = (window.NofidaDesigner && window.NofidaDesigner.FeatureFlags)
      ? Promise.resolve(window.NofidaDesigner.FeatureFlags)
      : loadScript(DESIGNER_BASE + "feature-flags.js" + CACHE_BUST).then(function () {
          return window.NofidaDesigner.FeatureFlags;
        });
    return featureFlagsPromise;
  }

  var designerWorkflowPromise = null;
  function loadDesignerWorkflowRuntime() {
    if (designerWorkflowPromise) return designerWorkflowPromise;
    designerWorkflowPromise = loadScenePipeline()
      .then(loadFeatureFlags)
      .then(function () {
        return (window.NofidaDesigner && window.NofidaDesigner.CanvasCapture)
          ? Promise.resolve()
          : loadScript(DESIGNER_BASE + "canvas-capture.js" + CACHE_BUST);
      })
      .then(function () {
        return (window.NofidaDesigner && window.NofidaDesigner.Workflow)
          ? Promise.resolve()
          : loadScript(DESIGNER_BASE + "designer-workflow.js" + CACHE_BUST);
      })
      .then(function () {
        return window.NofidaDesigner.Workflow;
      });
    return designerWorkflowPromise;
  }

  // Stable (sorted-key) stringify + a small non-cryptographic hash — used
  // only to build the idempotency key's normalizedSceneHash component, not
  // for anything security-sensitive.
  function stableStringify(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
    var keys = Object.keys(value).sort();
    return "{" + keys.map(function (k) { return JSON.stringify(k) + ":" + stableStringify(value[k]); }).join(",") + "}";
  }
  function djb2(str) {
    var hash = 5381;
    for (var i = 0; i < str.length; i++) hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
    return (hash >>> 0).toString(36);
  }

  // ── direct file write (bypasses the plugin sandbox entirely) ──────────
  // opts: { operationId, allowPartial }. operationId should be supplied by
  // the caller for a given user-facing "Apply" action so retries of THAT
  // action reuse the same idempotency key; if omitted, one is generated,
  // which still protects this call's own internal conflict-retries but not
  // two independent Apply clicks — see designer/persistence-adapter.js.
  function applyScreenSpecViaFile(spec, opts) {
    opts = opts || {};
    var operationId = opts.operationId || newId();
    var allowPartial = opts.allowPartial === true;

    return loadScenePipeline().then(function (pipeline) {
      var persistence = window.NofidaDesigner.Persistence;
      var ids = persistence.resolveTarget();
      if (!ids) {
        return { ok: false, message: "Не удалось определить файл/страницу — откройте экран в редакторе Penpot." };
      }

      var validated = pipeline.validator.validateScene(spec);
      if (!validated.ok) {
        return { ok: false, message: "Invalid screen spec: " + validated.errors.join("; ") };
      }

      // Re-running canonicalize+normalize here (the server already did this
      // once before sending the spec down) is defense-in-depth, not a
      // no-op: it re-derives ids deterministically from tree shape since a
      // validated node only carries `presetId` (from a raw `.id`), not the
      // server's `nid` — so ids minted here may differ from the server's,
      // which is harmless because nothing outside THIS call compares
      // against the server's id strings; the compiled mapping is built
      // fresh in this same call either way. Structure/flattening decisions
      // (what normalizeScene actually changes) depend only on type/paint/
      // depth, not on id values, so this stays idempotent regardless.
      var canonical = pipeline.canonicalizer.canonicalizeScene(validated.scene, {});
      var normalized = pipeline.normalizer.normalizeScene(canonical);
      var sceneHash = djb2(stableStringify(normalized.scene));
      var mode = "create";
      var idempotencyKey = [operationId, ids.fileId, ids.pageId, sceneHash, mode].join("::");

      var existing = persistence.getIdempotentEntry(idempotencyKey);
      if (existing) {
        return Object.assign({}, existing.result, { idempotent: true });
      }

      var compiled = pipeline.compiler.compileScene(normalized.scene, {
        pageId: ids.pageId,
        newId: newId,
        mode: mode,
        allowPartial: allowPartial,
      });

      if (!compiled.ok) {
        return {
          ok: false,
          message: "Scene has unsupported content" + (allowPartial ? "" : " (retry with allowPartial to skip it instead)") + ": " + compiled.error,
          unresolvedNodes: compiled.unresolvedNodes,
        };
      }
      if (!compiled.changes.length) {
        return { ok: false, message: "Screen spec didn't produce any applicable shapes.", diagnostics: compiled.diagnostics };
      }

      return persistence.applyChanges(compiled.changes, { fileId: ids.fileId, pageId: ids.pageId, mode: mode }).then(function (result) {
        var finalResult = Object.assign({}, result, {
          message: result.ok ? "created board “" + (spec.name || "Screen") + "”" : result.message,
          boardId: compiled.mapping[normalized.scene.nid],
          nodeCount: compiled.changes.length,
          diagnostics: { normalize: normalized.report, compile: compiled.diagnostics, validateWarnings: validated.warnings },
        });
        if (finalResult.ok) {
          persistence.storeIdempotentEntry(idempotencyKey, { mapping: compiled.mapping, snapshot: compiled.snapshot, result: finalResult });
        }
        return finalResult;
      });
    }).catch(function (err) {
      return { ok: false, message: String((err && err.message) || err) };
    });
  }

  var PLUGIN_MANIFEST_URL = "/nofida/ai-core/plugin/manifest.json";
  var MSG = {
    REQ:         "nofida-ai:generate",
    RES:         "nofida-ai:result",
    READY:       "nofida-ai:ready",
    CTX_REQ:     "nofida-ai:extract-context",
    CTX_RES:     "nofida-ai:context",
    CONNECT_REQ: "nofida-ai:connect-libraries",
    CONNECT_RES: "nofida-ai:connect-libraries-result",
    CAPTURE_REQ: "nofida-ai:capture-board",
    CAPTURE_RES: "nofida-ai:capture-board-result",
  };
  var CONTEXT_TIMEOUT_MS = 5000;
  var CONNECT_LIBRARIES_TIMEOUT_MS = 15000;
  // Board export (026A.6) goes through Penpot's own render path (see
  // docs/nofida-canvas-capture-026a.md) — generous relative to the other
  // plugin round trips above, since export() has to actually rasterize.
  var CAPTURE_TIMEOUT_MS = 20000;
  // Penpot itself places no restriction on which origin hosts a plugin's
  // manifest/UI (verified against plugins-runtime's manifest schema — it's
  // just url()). Our own plugin is served from this same app origin, so we
  // enforce that ourselves: only ever trust a "ready" announcement that
  // comes from a same-origin iframe, never an arbitrary embedded frame.
  var TRUSTED_PLUGIN_ORIGIN = window.location.origin;

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

  // Transport table for connecting NOFIDA Hub libraries into the current
  // file before generation — see plugin/code.js's connectLibraries() for why
  // this runs without a user confirmation step.
  var connectTransports = {
    stub: function () {
      return Promise.resolve({ ok: false, connected: [], failed: [], libraries: [] });
    },

    plugin: function (libraryIds) {
      if (!pluginWindow) {
        return Promise.resolve({ ok: false, connected: [], failed: [], libraries: [] });
      }
      return new Promise(function (resolve) {
        var id = Math.random().toString(36).slice(2);
        var timer = setTimeout(function () {
          window.removeEventListener("message", onMessage);
          resolve({ ok: false, connected: [], failed: [], libraries: [] });
        }, CONNECT_LIBRARIES_TIMEOUT_MS);

        function onMessage(e) {
          if (e.source !== pluginWindow) return;
          if (!e.data || e.data.type !== MSG.CONNECT_RES || e.data.id !== id) return;
          window.removeEventListener("message", onMessage);
          clearTimeout(timer);
          resolve(e.data.result);
        }

        window.addEventListener("message", onMessage);
        pluginWindow.postMessage({ type: MSG.CONNECT_REQ, id: id, libraryIds: libraryIds }, pluginOrigin);
      });
    },

    rpc: function () {
      return Promise.resolve({ ok: false, connected: [], failed: [], libraries: [] });
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
      // The chat overlay's "bridge: …" status label is only rendered once at
      // startup — without this it stays stuck on whatever transport was
      // active when the panel first opened, even long after the companion
      // plugin actually connects (see nofida-ai-core.js's listener).
      try {
        window.dispatchEvent(new CustomEvent("nofida-ai:transport-changed", { detail: { transport: name } }));
      } catch (_) {}
    },

    connectPlugin: function (win, origin) {
      pluginWindow = win;
      if (origin) pluginOrigin = origin;
      this.setTransport("plugin");
      console.info("[Nofida AI] companion plugin connected");
    },

    // PATCH 026A.8 — Promise<NofidaDesigner.Workflow>. See loadDesignerWorkflowRuntime() above.
    loadDesignerWorkflow: function () {
      return loadDesignerWorkflowRuntime();
    },

    // PATCH 026A.8 — Promise<NofidaDesigner.FeatureFlags>, cheap/eager-safe. See loadFeatureFlags() above.
    loadFeatureFlags: function () {
      return loadFeatureFlags();
    },

    generateLayers: function (spec) {
      return transports[this.transport](spec || {});
    },

    /* Applies a validated Screen Spec (the NOFIDA Scene Model — see
       services/nofida-hub-adapter/ai/scene/) to the live canvas via the
       pure validate -> normalize -> compile pipeline and the browser
       persistence adapter's direct update-file write (PATCH 025A). No
       plugin connection required, and it doesn't inherit the plugin
       sandbox's bulk-write rendering bug.
       Returns Promise<{ok, message, boardId?, nodeCount?, diagnostics?}>. */
    applyScreenSpec: function (spec, opts) {
      return applyScreenSpecViaFile(spec || {}, opts);
    },

    /* Links the given NOFIDA Hub library file-ids into the current file (no
       user confirmation — see plugin/code.js). Returns
       Promise<{ok, connected, failed, libraries}> where `libraries` is the
       full updated connected-libraries-with-components list, ready to fold
       straight into the next /ai/ask context. */
    connectLibraries: function (libraryIds) {
      return connectTransports[this.transport](libraryIds || []);
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

    /* PATCH 026A.6 — captures a board to PNG via Penpot's own Plugin API
       shape.export() (see docs/nofida-canvas-capture-026a.md), relayed
       through the same plugin transport extractContext() uses.
       Returns Promise<{ok:true, pngBase64, width, height, scale, capturedAt}
              | {ok:false, error:"capture_unavailable", reason}> — NEVER a
       bare success with no image; a missing plugin connection or a timeout
       both resolve the same structured failure shape, not a silent null. */
    captureBoard: function (boardId, opts) {
      opts = opts || {};
      var scale = opts.scale === 2 ? 2 : 1;
      if (!pluginWindow) {
        return Promise.resolve({ ok: false, error: "capture_unavailable", reason: "companion plugin not connected" });
      }
      if (!boardId) {
        return Promise.resolve({ ok: false, error: "capture_unavailable", reason: "no boardId supplied" });
      }

      return new Promise(function (resolve) {
        var id = Math.random().toString(36).slice(2);
        var timer = setTimeout(function () {
          window.removeEventListener("message", onMessage);
          resolve({ ok: false, error: "capture_unavailable", reason: "capture timed out after " + CAPTURE_TIMEOUT_MS + "ms" });
        }, CAPTURE_TIMEOUT_MS);

        function onMessage(e) {
          if (e.source !== pluginWindow) return;
          if (!e.data || e.data.type !== MSG.CAPTURE_RES || e.data.id !== id) return;
          window.removeEventListener("message", onMessage);
          clearTimeout(timer);
          resolve(e.data.result || { ok: false, error: "capture_unavailable", reason: "empty response from plugin" });
        }

        window.addEventListener("message", onMessage);
        pluginWindow.postMessage({ type: MSG.CAPTURE_REQ, id: id, boardId: boardId, scale: scale }, pluginOrigin);
      });
    },
  };

  // Auto-connect when the companion plugin announces itself. Penpot's own
  // plugin loader doesn't restrict which origin a plugin may be served from,
  // so WE enforce it here: only ever trust a "ready" announcement from our
  // own origin, never an arbitrary frame that happens to post this message.
  window.addEventListener("message", function (e) {
    if (e.origin !== TRUSTED_PLUGIN_ORIGIN) return;
    if (e.data && e.data.type === MSG.READY) bridge.connectPlugin(e.source, e.origin);
  });

  window.NofidaAIBridge = bridge;
})();
