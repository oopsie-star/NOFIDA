/* ==========================================================================
 * Nofida Designer — live user workflow (PATCH 026A.8)
 * --------------------------------------------------------------------------
 * Drives the Autonomous Designer end to end from the chat panel: brief ->
 * interpretation card (Approve / Generate now) -> build -> apply to canvas
 * -> capture -> critique -> repair loop (max 3 passes) -> results + handoff
 * download. Every step is a plain REST call to the new designer_* routes
 * (services/nofida-hub-adapter/server.mjs, PATCH 026A.8) — this module
 * never talks to Penpot directly; canvas mutation goes through the
 * EXISTING, unmodified persistence-adapter.js (rollback + idempotent
 * re-create, never mod-obj — see that file's header), and capture goes
 * through the existing canvas-capture.js.
 *
 * Hard-gated behind nofida_ai_autonomous_designer_v1 (and, for the handoff
 * download button specifically, nofida_ai_handoff_v1) via
 * NofidaDesigner.FeatureFlags.isEnabled() — same two-sided AND as every
 * other designer/ module. The caller (nofida-ai-core.js) is expected to
 * check the flag itself before ever calling start() — this module checks
 * again anyway (defense in depth, matches canvas-capture.js's convention).
 *
 * The user is never shown Transit, a Penpot UUID, the raw Scene Model, or a
 * compiler diagnostic — only plain-language stage labels, the interpretation
 * summary, critique scores, and (on failure) a short human-readable reason.
 * ========================================================================== */
(function () {
  "use strict";
  if (window.NofidaDesigner && window.NofidaDesigner.Workflow) return;
  window.NofidaDesigner = window.NofidaDesigner || {};

  var API_BASE = "/api/nofida/ai/designer/sessions";
  var MAX_REPAIR_PASSES = 3;

  // No dedicated brand stylesheet exists for this card (screen-spec-card,
  // this module's closest precedent, relies on the same bare approach —
  // Penpot's own .btn/.btn.primary plus unstyled wrapper divs) — this small
  // one-time injection only adds the minimum polish (spacing, a spinner)
  // that a plain div can't express, and never touches an existing file.
  (function injectStyleOnce() {
    if (document.getElementById("nofida-designer-workflow-style")) return;
    var style = document.createElement("style");
    style.id = "nofida-designer-workflow-style";
    style.textContent = [
      ".designer-card{padding:10px 12px;border-radius:10px;background:rgba(127,127,127,.08);}",
      ".designer-stage{display:flex;align-items:center;gap:8px;}",
      ".designer-spinner{width:12px;height:12px;border-radius:50%;border:2px solid rgba(127,127,127,.35);border-top-color:currentColor;animation:nofida-designer-spin .8s linear infinite;display:inline-block;}",
      "@keyframes nofida-designer-spin{to{transform:rotate(360deg);}}",
      ".designer-stage-extra{margin-top:6px;font-size:.85em;opacity:.75;}",
      ".designer-error{color:#c4314b;}",
      ".designer-interp-row{margin:2px 0;}",
      ".designer-interp-actions{display:flex;gap:8px;margin-top:10px;}",
      ".designer-badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:.85em;}",
      ".designer-badge.ok{background:rgba(21,122,77,.15);color:#157a4d;}",
      ".designer-badge.warn{background:rgba(168,93,0,.15);color:#a85d00;}",
      ".designer-results-summary{margin:6px 0;font-size:.9em;opacity:.85;}",
    ].join("\n");
    document.head.appendChild(style);
  })();

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function api(method, path, body) {
    return fetch(API_BASE + path, {
      method: method,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }).then(function (res) {
      return res.json().then(function (data) {
        return { httpOk: res.ok, data: data };
      });
    });
  }

  // ── DOM scaffolding ───────────────────────────────────────────────────
  function el(tag, className, html) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function renderCard(root) {
    root.innerHTML = "";
    var card = el("div", "designer-card");
    root.appendChild(card);
    return card;
  }

  var STAGE_LABELS = {
    interpreting: "Изучаю запрос…",
    design_system: "Собираю дизайн-систему и экраны…",
    applying: "Наношу экраны на холст…",
    capturing: "Делаю снимок для визуальной проверки…",
    critiquing: "Провожу визуальную проверку…",
    repairing: "Улучшаю по результатам проверки…",
    done: "Готово",
  };

  function renderStage(card, stageKey, extra) {
    card.innerHTML = [
      '<div class="designer-stage">',
      '  <span class="designer-spinner"></span>',
      "  <span>" + escapeHtml(STAGE_LABELS[stageKey] || stageKey) + "</span>",
      "</div>",
      extra ? '<div class="designer-stage-extra">' + extra + "</div>" : "",
    ].join("");
  }

  function renderError(card, message, opts) {
    opts = opts || {};
    card.innerHTML = [
      '<div class="designer-error">⚠ ' + escapeHtml(message) + "</div>",
      opts.retry ? '<button type="button" class="btn" data-designer-retry>Попробовать снова</button>' : "",
    ].join("");
    if (opts.retry) {
      var btn = card.querySelector("[data-designer-retry]");
      if (btn) btn.addEventListener("click", opts.retry);
    }
  }

  function renderClarification(card, question, onRespond) {
    card.innerHTML = [
      '<div class="designer-clarify">',
      "  <div>" + escapeHtml(question) + "</div>",
      "</div>",
    ].join("");
  }

  // ── interpretation card ─────────────────────────────────────────────────
  function renderInterpretation(card, sessionId, interpretation, serverFlags, onGenerate) {
    var screensLabel = (interpretation.screens || []).join(", ") || "—";
    var platformLabel = interpretation.platform
      ? (interpretation.platform.type || "mobile") + " " + (interpretation.platform.width || "") + "×" + (interpretation.platform.height || "")
      : "—";
    var keywordsLabel = (interpretation.keywords || []).join(", ");

    card.innerHTML = [
      '<div class="designer-interpretation">',
      '  <div class="designer-interp-row"><b>Продукт:</b> ' + escapeHtml(interpretation.productType || "—") + (interpretation.domain ? " (" + escapeHtml(interpretation.domain) + ")" : "") + "</div>",
      '  <div class="designer-interp-row"><b>Платформа:</b> ' + escapeHtml(platformLabel) + "</div>",
      '  <div class="designer-interp-row"><b>Экраны:</b> ' + escapeHtml(screensLabel) + "</div>",
      '  <div class="designer-interp-row"><b>Визуальное направление:</b> ' + escapeHtml(interpretation.direction || "—") + (keywordsLabel ? " — " + escapeHtml(keywordsLabel) : "") + "</div>",
      "</div>",
      '<div class="designer-interp-actions">',
      '  <button type="button" class="btn primary" data-designer-approve>Одобрить и создать</button>',
      '  <button type="button" class="btn" data-designer-generate>Сгенерировать сейчас</button>',
      "</div>",
    ].join("");

    var approveBtn = card.querySelector("[data-designer-approve]");
    var generateBtn = card.querySelector("[data-designer-generate]");
    if (approveBtn) approveBtn.addEventListener("click", function () { onGenerate(sessionId); });
    if (generateBtn) generateBtn.addEventListener("click", function () { onGenerate(sessionId); });
  }

  // ── results + handoff ───────────────────────────────────────────────────
  function downloadBlob(filename, mimeType, content) {
    var blob = new Blob([content], { type: mimeType });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function renderResults(card, sessionId, summary, serverFlags) {
    var approvedLabel = summary.approved
      ? '<span class="designer-badge ok">одобрено визуальной проверкой (' + summary.score + "/100)</span>"
      : '<span class="designer-badge warn">лучшая версия за ' + summary.passes + " попыт." + (summary.score != null ? (", счёт " + summary.score + "/100") : "") + "</span>";

    var handoffEnabled = window.NofidaDesigner.FeatureFlags.isEnabled(serverFlags, "handoffV1");

    card.innerHTML = [
      '<div class="designer-results">',
      "  <div>" + approvedLabel + "</div>",
      "  <div class=\"designer-results-summary\">Экраны созданы на холсте (светлая и тёмная версии). Можно продолжать редактировать вручную.</div>",
      handoffEnabled ? '  <button type="button" class="btn" data-designer-handoff>Скачать хэндофф для разработчика</button>' : "",
      "</div>",
    ].join("");

    var handoffBtn = card.querySelector("[data-designer-handoff]");
    if (handoffBtn) {
      handoffBtn.addEventListener("click", function () {
        handoffBtn.disabled = true;
        handoffBtn.textContent = "Готовлю…";
        api("GET", "/" + encodeURIComponent(sessionId) + "/handoff").then(function (resp) {
          handoffBtn.disabled = false;
          handoffBtn.textContent = "Скачать хэндофф для разработчика";
          if (!resp.httpOk || !resp.data.ok) {
            renderError(card, describeError(resp.data && resp.data.error));
            return;
          }
          var bundle = resp.data.bundle;
          downloadBlob("nofida-design-system.json", "application/json", JSON.stringify(bundle.designSystemJson, null, 2));
          downloadBlob("nofida-design-system.css", "text/css", bundle.cssVariables);
          downloadBlob("nofida-handoff.json", "application/json", JSON.stringify({ components: bundle.components, screens: bundle.screens }, null, 2));
        }).catch(function (err) {
          handoffBtn.disabled = false;
          handoffBtn.textContent = "Скачать хэндофф для разработчика";
          renderError(card, err.message);
        });
      });
    }
  }

  function describeError(error) {
    if (!error) return "Не удалось выполнить операцию.";
    var friendly = {
      missing_input: "Не хватает данных для следующего шага — начните заново.",
      node_budget_exceeded: "Экран получился слишком сложным — попробуйте описать запрос проще.",
      token_coverage_below_threshold: "Не удалось выдержать единый стиль оформления — попробуйте ещё раз.",
      theme_parity_violation: "Светлая и тёмная версии разошлись — попробуйте ещё раз.",
      compile_failed: "Не удалось собрать экран — попробуйте ещё раз.",
      session_not_found: "Сессия не найдена — начните заново.",
      designer_disabled: "Автономный дизайнер отключён.",
      missing_provider_key: "Не настроен AI-провайдер — откройте Настройки → NOFIDA AI.",
    };
    return friendly[error.code] || error.message || "Не удалось выполнить операцию.";
  }

  // ── the loop ─────────────────────────────────────────────────────────────
  function runGeneration(card, sessionId, serverFlags) {
    var Persistence = window.NofidaDesigner.Persistence;
    var CanvasCapture = window.NofidaDesigner.CanvasCapture;
    var target = Persistence && Persistence.resolveTarget();
    if (!target) {
      renderError(card, "Откройте экран в редакторе Penpot, чтобы сгенерировать дизайн.", { retry: function () { runGeneration(card, sessionId, serverFlags); } });
      return;
    }

    renderStage(card, "design_system");
    api("POST", "/" + encodeURIComponent(sessionId) + "/build", { pageId: target.pageId }).then(function (resp) {
      if (!resp.httpOk || !resp.data.ok) {
        renderError(card, describeError(resp.data && resp.data.error), { retry: function () { runGeneration(card, sessionId, serverFlags); } });
        return;
      }
      var light = resp.data.light;
      var dark = resp.data.dark;

      renderStage(card, "applying");
      Persistence.applyChanges(resp.data.changes, { fileId: target.fileId, pageId: target.pageId, mode: "create" }).then(function (applied) {
        if (!applied.ok) {
          renderError(card, applied.message || "Не удалось применить экран на холст.", { retry: function () { runGeneration(card, sessionId, serverFlags); } });
          return;
        }
        runCritiqueRepairLoop(card, sessionId, serverFlags, target, light, dark, 0);
      }).catch(function (err) {
        renderError(card, err.message, { retry: function () { runGeneration(card, sessionId, serverFlags); } });
      });
    }).catch(function (err) {
      renderError(card, err.message, { retry: function () { runGeneration(card, sessionId, serverFlags); } });
    });
  }

  function captureAndUpload(sessionId, serverFlags, board, pass) {
    var CanvasCapture = window.NofidaDesigner.CanvasCapture;
    if (!CanvasCapture || !board.penpotId) return Promise.resolve(null);
    return CanvasCapture.captureBoard(board.penpotId, { serverFlags: serverFlags }).then(function (capture) {
      if (!capture || capture.ok !== true) return null; // visual-critic.mjs falls back to its rule-based path
      return CanvasCapture.submitCapture({
        sessionId: sessionId, semanticId: board.semanticId, revision: pass, capture: capture, serverFlags: serverFlags,
      }).then(function () { return capture; }).catch(function () { return null; });
    }).catch(function () { return null; });
  }

  function runCritiqueRepairLoop(card, sessionId, serverFlags, target, light, dark, pass) {
    renderStage(card, "capturing");
    captureAndUpload(sessionId, serverFlags, light, pass).then(function () {
      renderStage(card, "critiquing");
      return api("POST", "/" + encodeURIComponent(sessionId) + "/critique", { pass: pass });
    }).then(function (resp) {
      if (!resp.httpOk || !resp.data.ok) {
        // Critique failing is not fatal to the user's boards — they're
        // already on canvas. Show results with whatever we know.
        renderResults(card, sessionId, { approved: false, score: null, passes: pass + 1 }, serverFlags);
        return;
      }
      var critique = resp.data.critique;
      if (resp.data.approved || pass >= MAX_REPAIR_PASSES) {
        renderResults(card, sessionId, { approved: !!resp.data.approved, score: critique.score, passes: pass + 1 }, serverFlags);
        return;
      }

      renderStage(card, "repairing");
      var Persistence = window.NofidaDesigner.Persistence;
      api("POST", "/" + encodeURIComponent(sessionId) + "/repair", { pass: pass + 1, pageId: target.pageId }).then(function (repairResp) {
        if (!repairResp.httpOk || !repairResp.data.ok || repairResp.data.localRepairImpossible || repairResp.data.gateFailed) {
          renderResults(card, sessionId, { approved: false, score: critique.score, passes: pass + 1 }, serverFlags);
          return;
        }
        Persistence.rollbackLastApply().then(function () {
          return Persistence.applyChanges(repairResp.data.changes, { fileId: target.fileId, pageId: target.pageId, mode: "create" });
        }).then(function (applied) {
          if (!applied.ok) {
            renderResults(card, sessionId, { approved: false, score: critique.score, passes: pass + 1 }, serverFlags);
            return;
          }
          runCritiqueRepairLoop(card, sessionId, serverFlags, target, repairResp.data.light, repairResp.data.dark, pass + 1);
        }).catch(function () {
          renderResults(card, sessionId, { approved: false, score: critique.score, passes: pass + 1 }, serverFlags);
        });
      }).catch(function () {
        renderResults(card, sessionId, { approved: false, score: critique.score, passes: pass + 1 }, serverFlags);
      });
    }).catch(function () {
      renderResults(card, sessionId, { approved: false, score: null, passes: pass + 1 }, serverFlags);
    });
  }

  // ── entry point ──────────────────────────────────────────────────────────
  /**
   * start(userPrompt, { serverFlags }) -> HTMLElement
   * Returns a self-updating DOM element the caller appends to the chat log
   * (see nofida-ai-core.js). All network activity happens asynchronously
   * after this returns.
   */
  function start(userPrompt, opts) {
    opts = opts || {};
    var serverFlags = opts.serverFlags || {};
    var root = el("div", "designer-session");
    var card = renderCard(root);

    if (!window.NofidaDesigner.FeatureFlags.isEnabled(serverFlags, "autonomousDesignerV1")) {
      renderError(card, "Автономный дизайнер отключён.");
      return root;
    }

    renderStage(card, "interpreting");
    api("POST", "", { userPrompt: userPrompt }).then(function (resp) {
      if (!resp.httpOk || !resp.data.ok) {
        if (resp.data && resp.data.needsClarification) {
          renderClarification(card, resp.data.question);
          return;
        }
        renderError(card, describeError(resp.data && resp.data.error));
        return;
      }
      renderInterpretation(card, resp.data.sessionId, resp.data.interpretation, serverFlags, function (sessionId) {
        runGeneration(card, sessionId, serverFlags);
      });
    }).catch(function (err) {
      renderError(card, err.message);
    });

    return root;
  }

  window.NofidaDesigner.Workflow = { start: start };
})();
