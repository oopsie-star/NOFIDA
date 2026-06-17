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
  normalizeTaskType,
  normalizeScope,
} from "./prompt-registry.mjs";

// Lightweight free-text classifier.
// Returns a known task type when the prompt contains strong keyword signals,
// or null when the match is ambiguous (stays as free_chat).
function classifyFreeText(text) {
  const t = String(text || "").toLowerCase();
  if (/audit|review|fix|issue|problem|проверь|аудит|проблем|исправ/.test(t)) return "design_audit";
  if (/librar|catalog|kit|saas|component|recommend|подбери|библиотек|каталог/.test(t))
    return "library_recommendation";
  if (/summary|overview|what.*file|что.*файл|сводк|обзор/.test(t)) return "file_summary";
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
 *
 * Returns:
 *   { taskType, scope, role, userPrompt, context, isClassified, primaryOperationType }
 *
 * Throws a config error if the task × scope combination is invalid.
 */
export function routeTask({ taskType: rawTaskType, userPrompt, scope: rawScope, context }) {
  const isPresetTask = Boolean(normalizeTaskType(rawTaskType));
  let taskType = normalizeTaskType(rawTaskType);

  if (!taskType) {
    // Free-text path: try to classify, fall back to free_chat
    taskType = (userPrompt ? classifyFreeText(userPrompt) : null) || "free_chat";
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
