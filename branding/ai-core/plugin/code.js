/* ==========================================================================
 * Nofida AI — companion Penpot plugin (sandboxed code file) — PATCH 016A
 * --------------------------------------------------------------------------
 * This is the ONLY place the `penpot` API exists. It opens the plugin UI
 * iframe (ui.html) and handles two request types relayed from the overlay:
 *
 *   nofida-plugin:generate        — create canvas layers (v1 scaffold)
 *   nofida-plugin:extract-context — return a summarised file/page snapshot
 *                                   (new in 016A, read-only, non-destructive)
 *
 * ⚠️  Verify API signatures against penpotapp/frontend:2.16.0 — method names
 * may shift between releases. All reads are wrapped in try/catch.
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
    var ctx;
    try {
      ctx = extractContext();
    } catch (err) {
      ctx = { error: String(err && err.message || err) };
    }
    penpot.ui.sendMessage({ type: "nofida-plugin:context", id: msg.id, context: ctx });
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

function extractContext() {
  var ctx = {
    file:      null,
    page:      null,
    objects:   { total: 0, byType: {} },
    selection: [],
    colors:    [],
    texts:     [],
  };

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
      try { objects = penpot.currentPage.getObjects() || []; } catch (_) {}

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
