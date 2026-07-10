// PATCH 016C: Intent Router
// Maps taskType, userPrompt, scope, and context into a normalized AI task request.
// Enforces surface × task type compatibility constraints.
// Classifies free-text prompts into known task types when there is a strong match.

import {
  TASK_TYPES,
  DASHBOARD_ALLOWED_TASKS,
  EDITOR_REQUIRED_TASKS,
  TASK_ROLE_MAP,
  TASK_OPERATION_TYPE,
  DESIGNER_TASK_TYPES,
  normalizeTaskType,
  normalizeScope,
} from "./prompt-registry.mjs";

// Short imperative/continuation phrases — only meaningful as "build_screen"
// when there is an actual previous screen spec in context to act on. A bare
// "реализуй"/"implement it" with nothing built yet is too ambiguous to route
// anywhere but free_chat.
const IMPLEMENT_CONTINUATION_RE = /^(реализуй|сделай(\s+это)?|примени|воплоти|внедри|implement(\s+it)?|do\s+it|go\s+ahead|build\s+it|apply\s+it)[.!\s]*$/;

// Lightweight free-text classifier.
// Returns a known task type when the prompt contains strong keyword signals,
// or null when the match is ambiguous (stays as free_chat).
function classifyFreeText(text, context) {
  const t = String(text || "").toLowerCase().trim();
  if (context?.previousScreenSpec && IMPLEMENT_CONTINUATION_RE.test(t)) return "build_screen";
  if (/audit|review|fix|issue|problem|проверь|аудит|проблем|исправ/.test(t)) return "design_audit";
  if (/librar|catalog|kit|saas|component|recommend|подбери|библиотек|каталог/.test(t))
    return "library_recommendation";
  if (/summary|overview|what.*file|что.*файл|сводк|обзор/.test(t)) return "file_summary";
  if (/собери\s+экран|создай\s+экран|сделай\s+экран|нарисуй\s+экран|build\s+(a\s+)?screen|create\s+(a\s+)?screen|design\s+(a\s+|the\s+)?screen/.test(t)) return "build_screen";
  if (/screen\s+plan|flow.*plan|wireframe|план\s+экран|структур.*экран/.test(t)) return "screen_plan";
  if (/copy\s+review|headline|cta\s|microcopy|проверь\s+тексты|копирайт/.test(t)) return "copy_review";
  if (/access|\ba11y\b|contrast\s+check|wcag/.test(t)) return "accessibility_review";
  if (/rename.*layer|layer.*name|переименов.*слои/.test(t)) return "rename_layers";
  if (/organiz.*layer|layer.*organiz|порядок.*слоев/.test(t)) return "organize_layers";
  return null;
}

// Infer scope from the context object when the caller did not provide an explicit scope.
function inferScopeFromContext(context) {
  if (!context) return "dashboard";
  const sel = Array.isArray(context.selection) ? context.selection : [];
  if (sel.length > 0) return "editor_selection";
  if (context.page) return "editor_page";
  if (context.file) return "editor_file";
  return "dashboard";
}

function makeConfigError(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function isEditorScope(scope) {
  return scope === "editor_file" || scope === "editor_page" || scope === "editor_selection";
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Route a task request into a normalized form.
 *
 * Input:
 *   taskType   - explicit task type from a preset button (may be null/undefined for free text)
 *   userPrompt - raw text from the user (required when taskType is null)
 *   scope      - explicit surface scope from the frontend (optional; inferred if omitted)
 *   context    - file/page/selection/objects/colors/texts from the plugin (optional)
 *   flags      - designer feature flags from ai/designer/feature-flags.mjs (optional; PATCH 026A.0)
 *
 * Returns:
 *   { taskType, scope, role, userPrompt, context, isClassified, primaryOperationType }
 *
 * Throws a config error if the task × scope combination is invalid, or if a
 * designer_* task is requested while nofida_ai_autonomous_designer_v1 is off.
 */
export function routeTask({ taskType: rawTaskType, userPrompt, scope: rawScope, context, flags }) {
  const isPresetTask = Boolean(normalizeTaskType(rawTaskType));
  let taskType = normalizeTaskType(rawTaskType);

  // PATCH 026A.0 — designer_* tasks are never reached via free-text
  // classification (classifyFreeText() doesn't know about them), only via an
  // explicit taskType — so this is the single gate for all of them.
  if (taskType && DESIGNER_TASK_TYPES.has(taskType) && !flags?.autonomousDesignerV1) {
    throw makeConfigError(
      "designer_disabled",
      "The Autonomous Designer is not enabled (nofida_ai_autonomous_designer_v1 is off).",
      403,
    );
  }

  if (!taskType) {
    // Free-text path: try a specific classification first (audit, library,
    // summary, copy, a11y, layer ops...). If nothing specific matched and
    // there's an open file, default to build_screen — not free_chat.
    // free_chat is hardcoded to "never apply changes, describe plans only",
    // which is exactly the "here's what YOU should do manually" behaviour
    // this product must never produce for an ordinary "make me a screen/
    // background/..." request. free_chat stays the fallback only when there
    // truly is no file open to build into (dashboard scope, nothing to act on).
    const classified = userPrompt ? classifyFreeText(userPrompt, context) : null;
    const hasEditorContext = Boolean(context?.file);
    taskType = classified || (hasEditorContext ? "build_screen" : "free_chat");
  }

  // Resolve scope
  let scope = normalizeScope(rawScope);
  if (!scope) scope = inferScopeFromContext(context);

  // Dashboard scope cannot initiate editor-only tasks
  if (scope === "dashboard" && EDITOR_REQUIRED_TASKS.has(taskType)) {
    if (isPresetTask) {
      throw makeConfigError(
        "context_missing",
        "Open a file or select a canvas object to use this AI action.",
        400,
      );
    }
    // Free-text classified into an editor task: downgrade to closest dashboard task
    taskType = "design_audit";
  }

  // Editor-required tasks need at least a file in context
  if (EDITOR_REQUIRED_TASKS.has(taskType) && (!context || !context.file)) {
    throw makeConfigError(
      "context_missing",
      "Open a file or select a canvas object to use this AI action.",
      400,
    );
  }

  const role = TASK_ROLE_MAP[taskType] || "default";
  const primaryOperationType = TASK_OPERATION_TYPE[taskType] || null;

  return {
    taskType,
    scope,
    role,
    userPrompt: String(userPrompt || "").trim(),
    context: context || null,
    isClassified: !isPresetTask && taskType !== "free_chat",
    primaryOperationType,
  };
}
