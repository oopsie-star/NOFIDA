/* ==========================================================================
 * Nofida AI — companion Penpot plugin (sandboxed code file)
 * --------------------------------------------------------------------------
 * This is the ONLY place the `penpot` API exists. It opens the plugin UI iframe
 * (ui.html) and, on a generate request relayed from the Nofida overlay, creates
 * layers on the canvas.
 *
 * ⚠️  VERIFY API SIGNATURES against penpotapp/frontend:2.16.0 — method names
 * (createBoard/createRectangle/createText, appendChild, viewport.center) are
 * the documented 2.x plugin API but may shift between releases.
 * Docs: https://help.penpot.app/plugins/  ·  API: https://penpot.app/plugins
 * ========================================================================== */

// Open the plugin's own UI panel. The UI relays messages between the Nofida
// overlay (top window) and this code file.
penpot.ui.open("Nofida AI", "ui.html", { width: 320, height: 420 });

penpot.ui.onMessage(function (msg) {
  if (!msg || msg.type !== "nofida-plugin:generate") return;
  var spec = msg.spec || {};
  var result;
  try {
    result = generateLayers(spec);
  } catch (err) {
    result = { ok: false, message: String(err && err.message || err) };
  }
  penpot.ui.sendMessage({ type: "nofida-plugin:result", id: msg.id, result: result });
});

/* v1 scaffold: materialize a labelled board near the viewport centre as proof
   the API is reachable. Replace the body with real AI-driven layout building. */
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
