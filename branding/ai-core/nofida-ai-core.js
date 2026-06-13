/* ==========================================================================
 * Nofida AI Core — injected overlay
 * --------------------------------------------------------------------------
 * Injected into Penpot's index.html (see branding/Dockerfile). Mounts a
 * floating action button + collapsible panel OVER the Penpot canvas, fully
 * isolated in a Shadow DOM so neither Penpot's styles nor nofida-brand.css
 * leak in or out.
 *
 * Scope of v1: the UI shell + the `window.NofidaAICore` namespace, wired to
 * the swappable AI bridge (ai-bridge.js). The live chat / model calls and the
 * real layer-generation transport are added later — see ai-bridge.js.
 * ========================================================================== */
(function () {
  "use strict";

  if (window.NofidaAICore) return; // idempotent — never double-mount

  var BRIDGE_URL = "/nofida/ai-core/ai-bridge.js";

  // ── Brand color lock ────────────────────────────────────────────────────────
  // element.style.setProperty() writes INLINE STYLES which have the highest
  // author-stylesheet priority. No CSS selector can override inline styles.
  // This is the only way to beat Penpot's `body.default { --color-*: ... }`
  // runtime injection (which has higher specificity than our :root rule).
  var BRAND_VARS = {
    "--color-background-primary":    "#0b1020",
    "--color-background-secondary":  "#060c18",
    "--color-background-tertiary":   "#0f172a",
    "--color-background-quaternary": "#1f2937",
    "--color-foreground-primary":    "#f8fafc",
    "--color-foreground-secondary":  "#94a3b8",
    "--color-accent-primary":        "#2563eb",
    "--color-accent-secondary":      "#1d4ed8",
    "--color-accent-tertiary":       "#bfff00",
    "--color-accent-primary-muted":  "rgba(37, 99, 235, 0.18)"
  };

  function applyBrandColors() {
    // Set on BOTH html (:root) and body so inheritance works at every level.
    [document.documentElement, document.body].forEach(function (el) {
      if (!el) return;
      Object.keys(BRAND_VARS).forEach(function (k) {
        el.style.setProperty(k, BRAND_VARS[k]);
      });
    });
  }

  // Apply immediately (before Penpot's theme class lands on body).
  applyBrandColors();

  // Re-apply whenever Penpot adds its theme class to body or html.
  // This fires ONCE when ClojureScript does document.body.className = "default".
  var themeWatcher = new MutationObserver(function () { applyBrandColors(); });
  themeWatcher.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  // body may not exist yet if script runs before DOMContentLoaded; guard it.
  if (document.body) {
    themeWatcher.observe(document.body, { attributes: true, attributeFilter: ["class"] });
  }

  // Belt-and-suspenders: refresh every 500 ms for the first 8 s.
  // Handles any dynamically injected <style> sheets that load late.
  var brandTick = 0;
  var brandTimer = setInterval(function () {
    applyBrandColors();
    if (++brandTick >= 16) clearInterval(brandTimer); // 16 × 500ms = 8s
  }, 500);

  var BRAND = {
    bg: "#0b1020", surface: "#0f172a", border: "#1f2937",
    primary: "#2563eb", accent: "#bfff00", accentInk: "#0b1020",
    text: "#f8fafc", muted: "#94a3b8",
    font: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'
  };

  // Load the bridge (self-registers window.NofidaAIBridge), then build the UI.
  function loadBridge() {
    return new Promise(function (resolve) {
      if (window.NofidaAIBridge) return resolve(window.NofidaAIBridge);
      var s = document.createElement("script");
      s.src = BRIDGE_URL;
      s.onload = function () { resolve(window.NofidaAIBridge); };
      s.onerror = function () { resolve(null); }; // UI still works without it
      document.head.appendChild(s);
    });
  }

  function buildUI(bridge) {
    var host = document.createElement("div");
    host.id = "nofida-ai-core-root";
    host.style.cssText = "position:fixed;inset:auto;z-index:2147483000;"; // top-most
    document.body.appendChild(host);
    var root = host.attachShadow({ mode: "open" });

    root.innerHTML = [
      "<style>",
      ":host{all:initial}",
      "*{box-sizing:border-box;font-family:" + BRAND.font + "}",
      ".fab{position:fixed;right:20px;bottom:20px;width:52px;height:52px;border:0;",
      "  border-radius:16px;cursor:pointer;display:grid;place-items:center;",
      "  background:" + BRAND.accent + ";color:" + BRAND.accentInk + ";",
      "  box-shadow:0 10px 30px rgba(191,255,0,.25);transition:transform .15s ease}",
      ".fab:hover{transform:translateY(-2px)}",
      ".fab svg{width:24px;height:24px}",
      ".panel{position:fixed;right:0;top:0;height:100vh;width:360px;max-width:92vw;",
      "  transform:translateX(105%);transition:transform .22s cubic-bezier(.16,1,.3,1);",
      "  background:" + BRAND.surface + ";color:" + BRAND.text + ";",
      "  border-left:1px solid " + BRAND.border + ";display:flex;flex-direction:column;",
      "  box-shadow:-18px 0 60px rgba(0,0,0,.45)}",
      ".panel.open{transform:translateX(0)}",
      ".hdr{display:flex;align-items:center;gap:10px;padding:14px 16px;",
      "  border-bottom:1px solid " + BRAND.border + "}",
      ".hdr .dot{width:8px;height:8px;border-radius:99px;background:" + BRAND.accent + "}",
      ".hdr h2{margin:0;font-size:14px;font-weight:800;letter-spacing:.02em}",
      ".hdr small{color:" + BRAND.muted + ";font-size:11px;margin-left:auto}",
      ".x{margin-left:8px;background:transparent;border:0;color:" + BRAND.muted + ";",
      "  cursor:pointer;font-size:18px;line-height:1}",
      ".log{flex:1;overflow:auto;padding:14px 16px;font-size:13px;color:" + BRAND.muted + "}",
      ".log .msg{margin:0 0 8px;padding:8px 10px;border-radius:10px;background:" + BRAND.bg + ";",
      "  border:1px solid " + BRAND.border + ";color:" + BRAND.text + "}",
      ".compose{display:flex;gap:8px;padding:12px 14px;border-top:1px solid " + BRAND.border + "}",
      ".compose input{flex:1;min-width:0;background:" + BRAND.bg + ";color:" + BRAND.text + ";",
      "  border:1px solid " + BRAND.border + ";border-radius:10px;padding:9px 11px;font-size:13px;outline:none}",
      ".compose input:focus{border-color:" + BRAND.primary + "}",
      ".compose button{border:0;border-radius:10px;padding:0 14px;font-weight:800;cursor:pointer;",
      "  background:" + BRAND.accent + ";color:" + BRAND.accentInk + "}",
      "</style>",
      '<button class="fab" title="Nofida AI" aria-label="Nofida AI">',
      '  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
      '    <path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z"/><path d="M19 14l.8 2 .2.8 2 .8-2 .2-.2.8-.8 2-.8-2-.2-.8-2-.8 2-.2.2-.8z"/>',
      "  </svg>",
      "</button>",
      '<aside class="panel" role="dialog" aria-label="Nofida AI assistant">',
      '  <div class="hdr"><span class="dot"></span><h2>Nofida AI</h2><small id="t">bridge: …</small><button class="x" title="Close">×</button></div>',
      '  <div class="log" id="log"><p class="msg">Опишите экран или компонент — я подготовлю слои на холсте. (v1: каркас, генерация подключается через AI bridge.)</p></div>',
      '  <form class="compose" id="form"><input id="in" placeholder="Например: экран входа с формой" autocomplete="off"/><button type="submit">Send</button></form>',
      "</aside>"
    ].join("");

    var panel = root.querySelector(".panel");
    var logEl = root.querySelector("#log");
    var transportLabel = root.querySelector("#t");
    if (bridge) transportLabel.textContent = "bridge: " + bridge.transport;

    function append(text) {
      var p = document.createElement("p");
      p.className = "msg";
      p.textContent = text;
      logEl.appendChild(p);
      logEl.scrollTop = logEl.scrollHeight;
    }

    var api = {
      version: "0.1.0",
      bridge: bridge,
      open: function () { panel.classList.add("open"); },
      close: function () { panel.classList.remove("open"); },
      toggle: function () { panel.classList.toggle("open"); },
      log: append
    };

    root.querySelector(".fab").addEventListener("click", api.toggle);
    root.querySelector(".x").addEventListener("click", api.close);
    root.querySelector("#form").addEventListener("submit", function (e) {
      e.preventDefault();
      var input = root.querySelector("#in");
      var prompt = input.value.trim();
      if (!prompt) return;
      append("→ " + prompt);
      input.value = "";
      // Hand the prompt to the bridge. v1 transport is a stub that logs;
      // a later transport materializes real layers via the Penpot plugin API.
      if (bridge) {
        bridge.generateLayers({ prompt: prompt }).then(function (res) {
          append("✓ " + (res && res.message ? res.message : "bridge stub acknowledged"));
        });
      } else {
        append("⚠ AI bridge not loaded");
      }
    });

    return api;
  }

  // ── Release-notes modal killer ─────────────────────────────────────────────
  // nofida-brand.css already hides these via [class*="main_ui_releases_v2_"]
  // but the overlay div still intercepts pointer events if only display:none'd.
  // We surgically remove the DOM nodes too. The MutationObserver handles the
  // case where React renders the modal after our script has already run.
  function killReleaseModals(root) {
    root = root || document.body;
    root.querySelectorAll('[class*="main_ui_releases_v2_"],[class*="release-notes"]')
        .forEach(function (el) { el.parentNode && el.parentNode.removeChild(el); });
  }

  function watchForModals() {
    var mo = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        m.addedNodes.forEach(function (node) {
          if (node.nodeType !== 1) return;
          var cls = (node.className || "").toString();
          if (cls.indexOf("releases_v2") !== -1 || cls.indexOf("release-notes") !== -1) {
            node.parentNode && node.parentNode.removeChild(node);
          }
          // Also sweep children (React sometimes mounts several levels at once)
          killReleaseModals(node);
        });
      });
      // Re-check action cards after every DOM batch (SPA route changes etc.)
      scheduleRestoreCards();
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  // ── Dashboard action-card restorer ─────────────────────────────────────────
  // Penpot only renders the 3-card placeholder (Create / Import / Add library)
  // when has-other? = false (completely fresh workspace). The moment a user
  // creates any non-default project the ClojureScript SPA switches to a single
  // "+" create button. The real cards are absent from the DOM — not just hidden.
  //
  // This function detects those single-button containers, hides the "+" button
  // (keeping it in the DOM so React still holds a valid ref), and injects a
  // 3-card container using Penpot's own compiled CSS class names so the styling
  // is always consistent with the active theme. Clicks are wired to the real
  // native mechanisms:
  //   Card 1 — programmatic click on the hidden native "+" button
  //   Card 2 — hidden <input type="file"> → DragEvent on the grid div
  //             (Penpot's React on-drop handler processes the FileList)
  //   Card 3 — open PenpotHub (same URL Penpot uses natively)
  function restoreActionCards() {
    var CSS = {
      ph:        "main_ui_dashboard_placeholder__grid-empty-placeholder",
      createBtn: "main_ui_dashboard_placeholder__create-new",
      grid:      "main_ui_dashboard_grid__dashboard-grid",
      container: "main_ui_dashboard_placeholder__empty-project-container",
      card:      "main_ui_dashboard_placeholder__empty-project-card",
      cardTitle: "main_ui_dashboard_placeholder__empty-project-card-title",
      cardSub:   "main_ui_dashboard_placeholder__empty-project-card-subtitle"
    };

    document.querySelectorAll("." + CSS.ph).forEach(function (ph) {
      var btn = ph.querySelector("." + CSS.createBtn);
      if (!btn) return; // native + button not present — nothing to restore

      // If our container is already injected, nothing to do
      if (ph.querySelector("." + CSS.container)) return;

      // Find the parent grid div so we can dispatch a drop event for import
      var gridEl = ph.closest("." + CSS.grid);

      // Keep native button in DOM (React holds a ref), but remove it from view
      btn.setAttribute("aria-hidden", "true");
      btn.style.cssText = "position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;";

      // Hidden file input — on change, forward files to Penpot's drop handler
      var fi = document.createElement("input");
      fi.type = "file";
      fi.accept = ".penpot";
      fi.multiple = true;
      fi.style.cssText = "display:none";
      fi.addEventListener("change", function () {
        if (!fi.files || !fi.files.length || !gridEl) return;
        try {
          var dt = new DataTransfer();
          Array.from(fi.files).forEach(function (f) { dt.items.add(f); });
          gridEl.dispatchEvent(
            new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt })
          );
        } catch (err) { /* DataTransfer not supported — graceful no-op */ }
        fi.value = "";
      });

      function makeCard(title, subtitle, onClick) {
        var card = document.createElement("div");
        card.className = CSS.card;
        card.setAttribute("role", "button");
        card.setAttribute("tabindex", "0");
        card.innerHTML =
          '<div class="' + CSS.cardTitle + '">' + title + "</div>" +
          '<div class="' + CSS.cardSub   + '">' + subtitle + "</div>";
        card.addEventListener("click", onClick);
        card.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); }
        });
        return card;
      }

      var container = document.createElement("div");
      container.className = CSS.container;

      container.appendChild(makeCard(
        "Создать новый файл",
        "Начать создавать удивительные вещи",
        function () { btn.click(); }
      ));
      container.appendChild(fi); // display:none — excluded from grid flow
      container.appendChild(makeCard(
        "Импортировать файл",
        "Импорт .penpot файл",
        function () { fi.click(); }
      ));
      container.appendChild(makeCard(
        "Добавить библиотеку или шаблон",
        "Рассмотрите варианты для добавления",
        function () {
          window.open(
            "https://penpot.app/penpothub/libraries-templates",
            "_blank",
            "noopener,noreferrer"
          );
        }
      ));

      ph.appendChild(container);
    });
  }

  // setTimeout(300) instead of RAF: RAF fires in the same rendering tick as
  // the mutation, before React finishes reconciling. 300ms gives React time
  // to complete its reconciliation pass so our injection sticks.
  var restoreCardsTimer = null;
  function scheduleRestoreCards() {
    if (restoreCardsTimer) clearTimeout(restoreCardsTimer);
    restoreCardsTimer = setTimeout(restoreActionCards, 300);
  }

  function start() {
    applyBrandColors(); // second call — body now guaranteed to exist
    if (document.body) {
      // body might not have been available for themeWatcher setup above
      try { themeWatcher.observe(document.body, { attributes: true, attributeFilter: ["class"] }); } catch (_) {}
    }
    killReleaseModals();
    watchForModals();
    // Initial card pass + a 1.5 s delayed pass to catch slow SPA hydration.
    restoreActionCards();
    setTimeout(restoreActionCards, 1500);
    loadBridge().then(function (bridge) {
      window.NofidaAICore = buildUI(bridge);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
