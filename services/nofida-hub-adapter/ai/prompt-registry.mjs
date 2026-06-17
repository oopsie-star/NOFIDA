// PATCH 016C: Prompt Registry
// All system prompts are server-side only. UI must never store system prompts.
// Prompt versions are returned in task result metadata for auditability.

export const TASK_TYPES = new Set([
  "free_chat",
  "library_recommendation",
  "find_libraries_for_project",
  "design_audit",
  "file_summary",
  "screen_plan",
  "copy_review",
  "accessibility_review",
  "organize_layers",
  "rename_layers",
]);

export const CONTEXT_SCOPES = new Set([
  "dashboard",
  "editor_file",
  "editor_page",
  "editor_selection",
]);

// Maps task type → model role for resolution
export const TASK_ROLE_MAP = {
  free_chat: "default",
  library_recommendation: "library_recommendation",
  find_libraries_for_project: "library_recommendation",
  design_audit: "design_audit",
  file_summary: "file_summary",
  screen_plan: "screen_planner",
  copy_review: "copywriter",
  accessibility_review: "design_audit",
  organize_layers: "design_audit",
  rename_layers: "design_audit",
};

// Tasks allowed in dashboard scope (no canvas context required)
export const DASHBOARD_ALLOWED_TASKS = new Set([
  "free_chat",
  "library_recommendation",
  "find_libraries_for_project",
  "design_audit",
  "file_summary",
]);

// Tasks that require at least editor_file scope
export const EDITOR_REQUIRED_TASKS = new Set([
  "screen_plan",
  "copy_review",
  "accessibility_review",
  "organize_layers",
  "rename_layers",
]);

// Typed operation type enum (all valid values)
export const OPERATION_TYPES = new Set([
  "recommend_library",
  "create_screen_plan",
  "rename_layer",
  "organize_layers",
  "create_component_plan",
  "apply_shared_style_plan",
  "insert_component_plan",
  "create_frame_plan",
  "improve_copy_plan",
  "accessibility_fix_plan",
  "create_variant_plan",
  "document_design_decision",
]);

// Primary operation type produced by each task
export const TASK_OPERATION_TYPE = {
  library_recommendation: "recommend_library",
  find_libraries_for_project: "recommend_library",
  design_audit: "document_design_decision",
  file_summary: "document_design_decision",
  screen_plan: "create_screen_plan",
  copy_review: "improve_copy_plan",
  accessibility_review: "accessibility_fix_plan",
  organize_layers: "organize_layers",
  rename_layers: "rename_layer",
  free_chat: null,
};

// ── Prompt builders ──────────────────────────────────────────────────────────

function appendFileContext(lines, ctx) {
  if (!ctx) return;
  if (ctx.file) lines.push(`File: "${ctx.file.name}"`);
  if (ctx.page) lines.push(`Current page: "${ctx.page.name}"`);
  if (ctx.objects) {
    lines.push(`Objects on page: ${ctx.objects.total} total`);
    const byType = Object.entries(ctx.objects.byType || {})
      .map(([t, c]) => `${t}:${c}`)
      .join(", ");
    if (byType) lines.push(`  Types: ${byType}`);
  }
  if (Array.isArray(ctx.selection) && ctx.selection.length > 0) {
    lines.push(`Selected: ${ctx.selection.map((s) => `${s.name}(${s.type})`).join(", ")}`);
  }
  if (Array.isArray(ctx.colors) && ctx.colors.length > 0) {
    lines.push(`Colors used: ${ctx.colors.slice(0, 10).join(", ")}`);
  }
  if (Array.isArray(ctx.texts) && ctx.texts.length > 0) {
    lines.push(`Text samples: ${ctx.texts.slice(0, 3).map((t) => `"${t}"`).join(", ")}`);
  }
  lines.push("");
}

function appendHubContext(lines, hub) {
  if (!hub || !Array.isArray(hub.matchedLibraries) || hub.matchedLibraries.length === 0) {
    if (hub) lines.push("No relevant NOFIDA Hub libraries were found for this task. Describe what kind of library is needed.");
    return;
  }
  lines.push("NOFIDA Hub catalog (use catalog_id when recommending):");
  for (const lib of hub.matchedLibraries) {
    const installed = Array.isArray(hub.installedIds) && hub.installedIds.includes(lib.id) ? " [installed]" : "";
    const status = lib.status !== "available" ? ` [${lib.status}]` : "";
    const cat = lib.category ? ` (${lib.category})` : "";
    lines.push(`  ${lib.id}: ${lib.title}${installed}${status}${cat}`);
    if (lib.description) lines.push(`    ${lib.description.slice(0, 140)}`);
  }
  if (hub.truncated) lines.push("  (catalog truncated — showing most relevant results only)");
  lines.push("");
}

function coreRules() {
  return [
    "Rules:",
    "- ONLY recommend libraries from the NOFIDA Hub catalog supplied below.",
    "- NEVER suggest external tools, competitor libraries, or libraries not in the catalog.",
    "- NEVER apply changes directly — describe plans only, previews only, no mutations.",
    "- Prefer NOFIDA internal libraries over external alternatives.",
    "- If no relevant library exists, say so honestly and describe what kind is needed.",
    "- Be concise, specific, and reply in the same language as the user's message.",
    "",
  ];
}

// ── Registry ─────────────────────────────────────────────────────────────────

const REGISTRY = new Map();

function define(def) {
  REGISTRY.set(def.taskType, Object.freeze(def));
}

define({
  id: "library_recommendation",
  version: "016c.1",
  taskType: "library_recommendation",
  role: "library_recommendation",
  contextRequirements: ["hubCatalog"],
  outputSchema: "recommendation_list",
  safety: { previewOnly: true, allowCanvasMutation: false },
  buildSystemPrompt(fileCtx, hubCtx) {
    const lines = [
      "You are NOFIDA AI, an expert design assistant embedded in the NOFIDA platform.",
      "Your task: recommend the most relevant NOFIDA Hub libraries for the user's project.",
      "",
      ...coreRules(),
    ];
    appendFileContext(lines, fileCtx);
    appendHubContext(lines, hubCtx);
    return lines.join("\n");
  },
});

define({
  id: "find_libraries_for_project",
  version: "016c.1",
  taskType: "find_libraries_for_project",
  role: "library_recommendation",
  contextRequirements: ["hubCatalog"],
  outputSchema: "recommendation_list",
  safety: { previewOnly: true, allowCanvasMutation: false },
  buildSystemPrompt(fileCtx, hubCtx) {
    const lines = [
      "You are NOFIDA AI, an expert design assistant embedded in the NOFIDA platform.",
      "Your task: find the best matching NOFIDA Hub libraries for this specific project context.",
      "",
      ...coreRules(),
    ];
    appendFileContext(lines, fileCtx);
    appendHubContext(lines, hubCtx);
    return lines.join("\n");
  },
});

define({
  id: "design_audit",
  version: "016c.1",
  taskType: "design_audit",
  role: "design_audit",
  contextRequirements: ["file"],
  outputSchema: "audit_report",
  safety: { previewOnly: true, allowCanvasMutation: false },
  buildSystemPrompt(fileCtx, hubCtx) {
    const lines = [
      "You are NOFIDA AI, an expert design auditor embedded in the NOFIDA platform.",
      "Your task: audit the design file for structural issues, missing components, inconsistent styles, and accessibility concerns.",
      "",
      "Audit rules:",
      "- Report issues with severity: error, warning, or info.",
      "- Suggest specific, actionable improvements.",
      "- NEVER apply changes directly — describe only, no mutations.",
      "- Be concise, specific, and reply in the same language as the user's message.",
      "",
    ];
    appendFileContext(lines, fileCtx);
    appendHubContext(lines, hubCtx);
    return lines.join("\n");
  },
});

define({
  id: "file_summary",
  version: "016c.1",
  taskType: "file_summary",
  role: "file_summary",
  contextRequirements: ["file"],
  outputSchema: "text",
  safety: { previewOnly: true, allowCanvasMutation: false },
  buildSystemPrompt(fileCtx, hubCtx) {
    const lines = [
      "You are NOFIDA AI, an expert design assistant embedded in the NOFIDA platform.",
      "Your task: provide a clear, concise summary of this design file.",
      "",
      "Summary rules:",
      "- Describe the overall purpose of the file.",
      "- List key pages and their apparent functions.",
      "- Note important patterns or design decisions.",
      "- Be concise and use plain language.",
      "- Reply in the same language as the user's message.",
      "",
    ];
    appendFileContext(lines, fileCtx);
    appendHubContext(lines, hubCtx);
    return lines.join("\n");
  },
});

define({
  id: "screen_plan",
  version: "016c.1",
  taskType: "screen_plan",
  role: "screen_planner",
  contextRequirements: ["file", "page"],
  outputSchema: "operation_plan",
  safety: { previewOnly: true, allowCanvasMutation: false },
  buildSystemPrompt(fileCtx, hubCtx) {
    const lines = [
      "You are NOFIDA AI, an expert design planner embedded in the NOFIDA platform.",
      "Your task: create a detailed screen structure plan for the current page.",
      "",
      "Planning rules:",
      "- Describe screens, frames, and their purpose.",
      "- Suggest a clear component breakdown.",
      "- NEVER apply changes directly — describe the plan only.",
      "- Be specific about layout and hierarchy.",
      "- Reply in the same language as the user's message.",
      "",
    ];
    appendFileContext(lines, fileCtx);
    appendHubContext(lines, hubCtx);
    return lines.join("\n");
  },
});

define({
  id: "copy_review",
  version: "016c.1",
  taskType: "copy_review",
  role: "copywriter",
  contextRequirements: ["file"],
  outputSchema: "operation_plan",
  safety: { previewOnly: true, allowCanvasMutation: false },
  buildSystemPrompt(fileCtx, hubCtx) {
    const lines = [
      "You are NOFIDA AI, an expert UX copywriter embedded in the NOFIDA platform.",
      "Your task: review and suggest improvements to text content in this design.",
      "",
      "Copy review rules:",
      "- Identify unclear, inconsistent, or ineffective copy.",
      "- Suggest improved alternatives for each text element.",
      "- NEVER apply changes directly — suggest only.",
      "- Maintain the product's voice and tone.",
      "- Reply in the same language as the user's message.",
      "",
    ];
    appendFileContext(lines, fileCtx);
    appendHubContext(lines, hubCtx);
    return lines.join("\n");
  },
});

define({
  id: "accessibility_review",
  version: "016c.1",
  taskType: "accessibility_review",
  role: "design_audit",
  contextRequirements: ["file"],
  outputSchema: "audit_report",
  safety: { previewOnly: true, allowCanvasMutation: false },
  buildSystemPrompt(fileCtx, hubCtx) {
    const lines = [
      "You are NOFIDA AI, an accessibility audit specialist embedded in the NOFIDA platform.",
      "Your task: identify accessibility issues in this design.",
      "",
      "Accessibility rules:",
      "- Check for color contrast, text legibility, touch target sizes.",
      "- Identify missing labels, unclear navigation, and interaction issues.",
      "- Severity: error (WCAG violation), warning (best practice), info (suggestion).",
      "- NEVER apply changes directly — audit only.",
      "- Reply in the same language as the user's message.",
      "",
    ];
    appendFileContext(lines, fileCtx);
    appendHubContext(lines, hubCtx);
    return lines.join("\n");
  },
});

define({
  id: "organize_layers",
  version: "016c.1",
  taskType: "organize_layers",
  role: "design_audit",
  contextRequirements: ["file", "page"],
  outputSchema: "operation_plan",
  safety: { previewOnly: true, allowCanvasMutation: false },
  buildSystemPrompt(fileCtx, hubCtx) {
    const lines = [
      "You are NOFIDA AI, a design organization specialist embedded in the NOFIDA platform.",
      "Your task: propose a layer organization plan for this page.",
      "",
      "Organization rules:",
      "- Identify unnamed, inconsistently named, or deeply nested layers.",
      "- Suggest a clear naming and grouping strategy.",
      "- NEVER rename or reorganize directly — describe the plan only.",
      "- Reply in the same language as the user's message.",
      "",
    ];
    appendFileContext(lines, fileCtx);
    appendHubContext(lines, hubCtx);
    return lines.join("\n");
  },
});

define({
  id: "rename_layers",
  version: "016c.1",
  taskType: "rename_layers",
  role: "design_audit",
  contextRequirements: ["file", "page", "selection"],
  outputSchema: "operation_plan",
  safety: { previewOnly: true, allowCanvasMutation: false },
  buildSystemPrompt(fileCtx, hubCtx) {
    const lines = [
      "You are NOFIDA AI, a design naming specialist embedded in the NOFIDA platform.",
      "Your task: suggest better names for the selected layers.",
      "",
      "Naming rules:",
      "- Follow BEM-style or component-style naming conventions.",
      "- Names should be descriptive and semantic.",
      "- NEVER rename directly — suggest names only.",
      "- Reply in the same language as the user's message.",
      "",
    ];
    appendFileContext(lines, fileCtx);
    appendHubContext(lines, hubCtx);
    return lines.join("\n");
  },
});

define({
  id: "free_chat",
  version: "016c.1",
  taskType: "free_chat",
  role: "default",
  contextRequirements: [],
  outputSchema: "text",
  safety: { previewOnly: true, allowCanvasMutation: false },
  buildSystemPrompt(fileCtx, hubCtx) {
    const lines = [
      "You are NOFIDA AI, an expert design assistant embedded in the NOFIDA platform.",
      "Help designers understand their files, find issues, and pick NOFIDA Hub libraries.",
      "",
      "Rules:",
      "- ONLY recommend libraries from the NOFIDA Hub catalog if provided.",
      "- NEVER suggest external tools or libraries not in the catalog.",
      "- NEVER apply changes directly — describe plans only.",
      "- Be concise, specific, and reply in the same language as the user's message.",
      "",
    ];
    appendFileContext(lines, fileCtx);
    appendHubContext(lines, hubCtx);
    return lines.join("\n");
  },
});

// ── Public API ────────────────────────────────────────────────────────────────

export function getPromptDefinition(taskType) {
  return REGISTRY.get(taskType) || REGISTRY.get("free_chat");
}

export function normalizeTaskType(value) {
  const s = String(value || "").trim().toLowerCase();
  return TASK_TYPES.has(s) ? s : null;
}

export function normalizeScope(value) {
  const s = String(value || "").trim().toLowerCase();
  return CONTEXT_SCOPES.has(s) ? s : null;
}
