/* ==========================================================================
 * Nofida AI — companion Penpot plugin (sandboxed code file) — PATCH 016G
 * --------------------------------------------------------------------------
 * This is the ONLY place the `penpot` API exists. It opens the plugin UI
 * iframe (ui.html) and handles requests relayed from the overlay:
 *
 *   nofida-plugin:generate           — create canvas layers (v1 scaffold)
 *   nofida-plugin:extract-context    — return a summarised file/page snapshot
 *                                       (read-only, non-destructive; async —
 *                                       also lists connectable libraries)
 *   nofida-plugin:connect-libraries  — link NOFIDA Hub libraries into this
 *                                       file so their components become real,
 *                                       instantiable Screen Spec targets
 *                                       (016G — see note below)
 *   nofida-plugin:capture-board      — export a board to PNG via Penpot's
 *                                       own Plugin API shape.export() (read-
 *                                       only; 026A.6 — see docs/nofida-
 *                                       canvas-capture-026a.md for why)
 *
 * Why connect-libraries needs no user confirmation: every library it can see
 * is a NOFIDA Hub library the team already deliberately imported for reuse
 * (server-marks them is-shared on import — see server.mjs setFileShared) —
 * this is first-party curated content, not an arbitrary third party library,
 * so linking it into the working file is exactly what Hub libraries are for.
 * The connection is the same operation Penpot's own Assets panel exposes as
 * "connect library" — reversible any time from that same panel.
 *
 * Signatures below are verified against the real plugin-types (
 * plugins/libs/plugin-types/index.d.ts) and the official create-palette-plugin
 * example in penpotapp 2.16.0 — see nofida-design-agent-spec notes.
 * ========================================================================== */

penpot.ui.open("Nofida AI", "ui.html", { width: 320, height: 420 });

penpot.ui.onMessage(function (msg) {
  if (!msg) return;

  if (msg.type === "nofida-plugin:generate") {
    var result;
    try {
      result = generateLayers(msg.spec || {});
    } catch (err) {
      result = { ok: false, message: String(err && err.message || err) };
    }
    penpot.ui.sendMessage({ type: "nofida-plugin:result", id: msg.id, result: result });
    return;
  }

  if (msg.type === "nofida-plugin:extract-context") {
    extractContext()
      .then(function (ctx) {
        penpot.ui.sendMessage({ type: "nofida-plugin:context", id: msg.id, context: ctx });
      })
      .catch(function (err) {
        penpot.ui.sendMessage({ type: "nofida-plugin:context", id: msg.id, context: { error: String(err && err.message || err) } });
      });
    return;
  }

  if (msg.type === "nofida-plugin:connect-libraries") {
    connectLibraries((msg.libraryIds || []))
      .then(function (result) {
        penpot.ui.sendMessage({ type: "nofida-plugin:connect-libraries-result", id: msg.id, result: result });
      })
      .catch(function (err) {
        penpot.ui.sendMessage({ type: "nofida-plugin:connect-libraries-result", id: msg.id, result: { ok: false, message: String(err && err.message || err) } });
      });
    return;
  }

  if (msg.type === "nofida-plugin:capture-board") {
    captureBoard(msg.boardId, msg.scale)
      .then(function (result) {
        penpot.ui.sendMessage({ type: "nofida-plugin:capture-board-result", id: msg.id, result: result });
      })
      .catch(function (err) {
        penpot.ui.sendMessage({
          type: "nofida-plugin:capture-board-result", id: msg.id,
          result: { ok: false, error: "capture_unavailable", reason: String(err && err.message || err) },
        });
      });
    return;
  }
});

// ── Layer generation (v1 scaffold, read-write) ─────────────────────────────

function generateLayers(spec) {
  var label = (spec && spec.prompt) ? spec.prompt : "Nofida AI";

  var board = penpot.createBoard();
  board.name = "Nofida AI: " + label;
  board.resize(360, 240);

  var center = penpot.viewport && penpot.viewport.center;
  if (center) {
    board.x = center.x - 180;
    board.y = center.y - 120;
  }

  var text = penpot.createText(label);
  if (text) {
    text.x = board.x + 16;
    text.y = board.y + 16;
    if (typeof board.appendChild === "function") board.appendChild(text);
  }

  return { ok: true, message: "created board “" + board.name + "”" };
}

// ── Context extraction (016A, read-only) ───────────────────────────────────
//
// Builds a bounded summary of the current Penpot file state for the AI panel.
// All penpot API calls are individually wrapped in try/catch so a missing or
// changed method never crashes the extraction.

async function extractContext() {
  var ctx = {
    file:      null,
    page:      null,
    objects:   { total: 0, byType: {} },
    selection: [],
    colors:    [],
    texts:     [],
    libraries: { connected: [], available: [] },
  };

  // Connected libraries + their real components (names/ids only become
  // visible to the plugin API once a library is connected — see
  // connectLibraries() below for how NOFIDA Hub libraries get linked in).
  try {
    var connectedLibs = (penpot.library && penpot.library.connected) || [];
    for (var li = 0; li < connectedLibs.length; li++) {
      try {
        var lib = connectedLibs[li];
        var comps = [];
        var libComps = lib.components || [];
        var compLimit = Math.min(libComps.length, 60);
        for (var ci = 0; ci < compLimit; ci++) {
          try { comps.push({ id: String(libComps[ci].id), name: String(libComps[ci].name || "Unnamed") }); } catch (_) {}
        }
        ctx.libraries.connected.push({ id: String(lib.id), name: String(lib.name || "Library"), components: comps });
      } catch (_) {}
    }
  } catch (_) {}

  // Libraries this team has (NOFIDA Hub imports are marked shared on import)
  // that aren't linked into THIS file yet — reported so the overlay can
  // auto-connect the relevant ones via connectLibraries() before generating.
  try {
    if (penpot.library && typeof penpot.library.availableLibraries === "function") {
      var available = await penpot.library.availableLibraries();
      for (var ai = 0; ai < available.length; ai++) {
        try {
          var summary = available[ai];
          ctx.libraries.available.push({
            id: String(summary.id),
            name: String(summary.name || "Library"),
            numComponents: Number(summary.numComponents || 0),
          });
        } catch (_) {}
      }
    }
  } catch (_) {}

  // File info
  try {
    if (penpot.currentFile) {
      ctx.file = {
        name: String(penpot.currentFile.name || "Unknown"),
        id:   String(penpot.currentFile.id   || ""),
      };
    }
  } catch (_) {}

  // Page info + object scan
  try {
    if (penpot.currentPage) {
      ctx.page = {
        name: String(penpot.currentPage.name || "Unknown"),
        id:   String(penpot.currentPage.id   || ""),
      };

      var objects = [];
      try { objects = penpot.currentPage.findShapes() || []; } catch (_) {}

      ctx.objects.total = objects.length;
      var colorsSeen = [];
      var textSamples = [];
      var limit = Math.min(objects.length, 600);

      for (var i = 0; i < limit; i++) {
        var obj = objects[i];
        try {
          var type = String(obj.type || "unknown");
          ctx.objects.byType[type] = (ctx.objects.byType[type] || 0) + 1;

          // Collect unique fill colors (cap at 20)
          if (colorsSeen.length < 20 && obj.fills) {
            for (var j = 0; j < obj.fills.length; j++) {
              var fill = obj.fills[j];
              if (fill && fill.fillColor && colorsSeen.indexOf(fill.fillColor) < 0) {
                colorsSeen.push(fill.fillColor);
              }
            }
          }

          // Collect text samples (cap at 5, 80 chars each)
          if (textSamples.length < 5 && type === "text") {
            var snippet = "";
            try { snippet = String(obj.characters || ""); } catch (_) {}
            if (!snippet) { try { snippet = String(obj.name || ""); } catch (_) {} }
            if (snippet) textSamples.push(snippet.slice(0, 80));
          }
        } catch (_) {}
      }

      ctx.colors = colorsSeen;
      ctx.texts  = textSamples;
    }
  } catch (_) {}

  // Selection
  try {
    var sel = penpot.selection;
    if (sel && sel.length > 0) {
      var selLimit = Math.min(sel.length, 10);
      for (var k = 0; k < selLimit; k++) {
        try {
          ctx.selection.push({
            name: String(sel[k].name || "Unnamed"),
            type: String(sel[k].type || "unknown"),
          });
        } catch (_) {}
      }
    }
  } catch (_) {}

  return ctx;
}

// ── Library auto-connect (016G) ─────────────────────────────────────────────
//
// Links the given NOFIDA Hub library file-ids into the current file so their
// components become real, instantiable Screen Spec targets. No confirmation
// step — see the file-header note for why that's the right default here.
// Each library is attempted independently; one failure (already connected,
// permissions, a stale id) never blocks the others.

async function connectLibraries(libraryIds) {
  var connected = [];
  var failed = [];

  for (var i = 0; i < libraryIds.length; i++) {
    var id = String(libraryIds[i] || "");
    if (!id) continue;
    try {
      var already = (penpot.library.connected || []).some(function (lib) { return String(lib.id) === id; });
      if (!already) await penpot.library.connectLibrary(id);
      connected.push(id);
    } catch (err) {
      failed.push({ id: id, message: String(err && err.message || err) });
    }
  }

  // Re-read the now-updated connected set so the overlay gets real component
  // ids/names in one round trip instead of asking for context a second time.
  var libraries = [];
  try {
    var connectedLibs = penpot.library.connected || [];
    for (var li = 0; li < connectedLibs.length; li++) {
      try {
        var lib = connectedLibs[li];
        var comps = [];
        var libComps = lib.components || [];
        var compLimit = Math.min(libComps.length, 60);
        for (var ci = 0; ci < compLimit; ci++) {
          try { comps.push({ id: String(libComps[ci].id), name: String(libComps[ci].name || "Unnamed") }); } catch (_) {}
        }
        libraries.push({ id: String(lib.id), name: String(lib.name || "Library"), components: comps });
      } catch (_) {}
    }
  } catch (_) {}

  return { ok: failed.length < libraryIds.length, connected: connected, failed: failed, libraries: libraries };
}

// ── Canvas capture (026A.6) ──────────────────────────────────────────────
//
// Uses Penpot's own documented Plugin API export() call — see
// docs/nofida-canvas-capture-026a.md for why this was chosen over reading
// pixels off the WASM viewport canvas directly or hand-rolling the
// exporter-service RPC. export() crops to the shape's own bounds
// internally, so "capture is cropped to the board" needs no extra code
// here. Never returns a bare success with no image — a lookup miss or a
// thrown export() call always resolves the SAME { ok:false,
// error:"capture_unavailable", reason } shape the caller (canvas-capture.js)
// and the server (capture-validator.mjs) both expect.

async function captureBoard(boardId, scale) {
  var id = String(boardId || "");
  if (!id) return { ok: false, error: "capture_unavailable", reason: "no boardId supplied" };

  var shape;
  try {
    shape = penpot.currentPage && penpot.currentPage.getShapeById(id);
  } catch (err) {
    return { ok: false, error: "capture_unavailable", reason: "getShapeById failed: " + String(err && err.message || err) };
  }
  if (!shape) {
    return { ok: false, error: "capture_unavailable", reason: "no shape found for boardId " + id };
  }

  var effectiveScale = (scale === 2) ? 2 : 1;
  var bytes;
  try {
    bytes = await shape.export({ type: "png", scale: effectiveScale });
  } catch (err) {
    return { ok: false, error: "capture_unavailable", reason: "export() failed: " + String(err && err.message || err) };
  }
  if (!bytes || !bytes.length) {
    return { ok: false, error: "capture_unavailable", reason: "export() returned no image data" };
  }

  return {
    ok: true,
    pngBase64: uint8ToBase64(bytes),
    width: Math.round((shape.width || 0) * effectiveScale),
    height: Math.round((shape.height || 0) * effectiveScale),
    scale: effectiveScale,
    capturedAt: new Date().toISOString(),
  };
}

// btoa() has no direct Uint8Array overload and a huge board can exceed the
// call-stack limit of String.fromCharCode(...bytes) spread — chunk it.
function uint8ToBase64(bytes) {
  var binary = "";
  var chunkSize = 0x8000;
  for (var i = 0; i < bytes.length; i += chunkSize) {
    var chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}
