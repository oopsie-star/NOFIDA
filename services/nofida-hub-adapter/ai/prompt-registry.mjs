// PATCH 016C: Prompt Registry
// All system prompts are server-side only. UI must never store system prompts.
// Prompt versions are returned in task result metadata for auditability.

import { SCENE_SPEC_PROMPT_BLOCK as SCREEN_SPEC_PROMPT_BLOCK } from "./scene/scene-schema.mjs";
import { buildBrandKitBlock } from "./brand-kit-packer.mjs";

export const TASK_TYPES = new Set([
  "free_chat",
  "library_recommendation",
  "find_libraries_for_project",
  "design_audit",
  "file_summary",
  "screen_plan",
  "build_screen",
  "copy_review",
  "accessibility_review",
  "organize_layers",
  "rename_layers",
  "designer_brief_interpreter",
  "designer_product_architect",
  "designer_art_director",
  "designer_system_generator",
  "designer_component_architect",
  "designer_asset_resolver",
  "designer_layout_planner",
  "designer_scene_builder",
  "designer_visual_critic",
  "designer_repair_planner",
  "designer_handoff_generator",
]);

// PATCH 026A.0 — Autonomous Designer pipeline task types. Reachable only
// when the "nofida_ai_autonomous_designer_v1" feature flag is on (see
// intent-router.mjs's routeTask() and ai/designer/feature-flags.mjs) — never
// through the free-text classifier (classifyFreeText() never returns one of
// these), only via explicit taskType from the designer pipeline (026A.4).
export const DESIGNER_TASK_TYPES = new Set([
  "designer_brief_interpreter",
  "designer_product_architect",
  "designer_art_director",
  "designer_system_generator",
  "designer_component_architect",
  "designer_asset_resolver",
  "designer_layout_planner",
  "designer_scene_builder",
  "designer_visual_critic",
  "designer_repair_planner",
  "designer_handoff_generator",
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
  build_screen: "screen_planner",
  copy_review: "copywriter",
  accessibility_review: "design_audit",
  organize_layers: "design_audit",
  rename_layers: "design_audit",
  // PATCH 026A.0 — all designer_* tasks use the currently active connected
  // LLM (the "default" role's resolution chain in ai-service.mjs) rather
  // than requiring a dedicated per-task model assignment.
  designer_brief_interpreter: "default",
  designer_product_architect: "default",
  designer_art_director: "default",
  designer_system_generator: "default",
  designer_component_architect: "default",
  designer_asset_resolver: "default",
  designer_layout_planner: "default",
  designer_scene_builder: "default",
  designer_visual_critic: "default",
  designer_repair_planner: "default",
  designer_handoff_generator: "default",
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
  "build_screen",
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
  build_screen: null, // its real output is the screen spec itself, not a textual plan
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
  const hubWasSearched = hub && Array.isArray(hub.matchedLibraries);
  if (!hubWasSearched || hub.matchedLibraries.length === 0) {
    // hubWasSearched but empty means the catalog itself has nothing at all
    // (an actual gap worth naming). When hub library search wasn't run for
    // this task type in the first place, stay silent about it — saying
    // "no relevant libraries" here reads as a refusal even though the model
    // was never asked to look for one.
    if (hubWasSearched) lines.push("The NOFIDA Hub library catalog is empty — nothing to recommend from it.");
    appendResourceContext(lines, hub?.resources);
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
  appendResourceContext(lines, hub.resources);
}

function appendResourceContext(lines, resources) {
  if (!resources) return;

  const fonts = Array.isArray(resources.fonts?.matchedFonts) ? resources.fonts.matchedFonts : [];
  const media = Array.isArray(resources.media?.matchedMedia) ? resources.media.matchedMedia : [];
  const patterns = Array.isArray(resources.media?.matchedPatterns) ? resources.media.matchedPatterns : [];

  lines.push("NOFIDA resource context (ranked by relevance, not exact-match filtered):");
  lines.push("  If nothing below is a strong fit, still name the closest available font/media/pattern as a starting point and say honestly how it falls short — never simply conclude nothing suitable exists and stop.");
  lines.push(`  Fonts available: ${resources.totals?.fonts || 0} total, ${resources.totals?.approvedFonts || 0} approved`);
  fonts.slice(0, 4).forEach((font) => {
    const cat = font.category ? ` (${font.category})` : "";
    const status = font.fileStatus ? ` [${font.fileStatus}]` : "";
    lines.push(`    font ${font.id}: ${font.family}${cat}${status}`);
  });

  lines.push(`  Media available: ${resources.totals?.media || 0} total, ${resources.totals?.approvedMedia || 0} approved`);
  media.slice(0, 4).forEach((asset) => {
    const cat = asset.category ? ` (${asset.category})` : "";
    lines.push(`    media ${asset.id}: ${asset.title}${cat}`);
  });

  if (patterns.length > 0) {
    lines.push("  UI patterns:");
    patterns.slice(0, 3).forEach((pattern) => {
      const source = pattern.sourceModel ? ` (${pattern.sourceModel})` : "";
      lines.push(`    pattern ${pattern.id}: ${pattern.title}${source}`);
    });
  }

  if (resources.truncated) lines.push("  (resource context truncated — showing only the most relevant entries)");
  lines.push("");
}

function coreRules() {
  return [
    "Rules:",
    "- ONLY recommend libraries from the NOFIDA Hub catalog supplied below.",
    "- NEVER suggest external tools, competitor libraries, or libraries not in the catalog.",
    "- NEVER apply changes directly — describe plans only, previews only, no mutations.",
    "- Prefer NOFIDA internal libraries over external alternatives.",
    "- The catalog list below is already ranked by relevance — it can include imperfect matches.",
    "- ALWAYS present the closest available catalog entries as options, even when none are a strong match — name them, explain honestly how well (or poorly) each fits, and let the user decide.",
    "- Only say no options exist at all if the catalog list below is completely empty — never refuse to suggest anything when entries were supplied.",
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
  id: "build_screen",
  version: "016f.1",
  taskType: "build_screen",
  role: "screen_planner",
  contextRequirements: ["file", "page"],
  outputSchema: "screen_spec",
  // The one task allowed to reach the canvas — not by the model or this
  // server touching Penpot directly, but by emitting a validated Screen Spec
  // that a separate executor (the companion plugin) applies deterministically.
  safety: { previewOnly: false, allowCanvasMutation: true },
  buildSystemPrompt(fileCtx, hubCtx) {
    const lines = [
      "You are NOFIDA AI, a senior mobile product designer embedded in the NOFIDA platform.",
      "Your task: design a real, ready-to-build mobile app screen for the user's request, as a Screen Spec.",
      "",
      "Design rules:",
      "- Design like a senior designer: clear visual hierarchy, real depth (shadows), deliberate restraint — not a wireframe placeholder.",
      "- Use the fonts, media, and NOFIDA Hub context below as inspiration for tone and content — you are not limited to library names, invent concrete copy and layout yourself.",
      "- Reply — and write every piece of on-screen copy — in the same language as the user's message.",
      "",
      buildBrandKitBlock(fileCtx),
      SCREEN_SPEC_PROMPT_BLOCK,
      "",
    ];
    if (fileCtx?.previousScreenSpec) {
      lines.push(
        "Previous screen you built earlier in this conversation (JSON):",
        JSON.stringify(fileCtx.previousScreenSpec).slice(0, 6000),
        "",
        "If the user's message reads as feedback or a refinement request on that previous screen, MODIFY it to address the feedback and keep everything else consistent with it. If the user is clearly asking for something new and unrelated, design fresh and disregard the previous screen.",
        "",
      );
    }
    const connectedLibraries = Array.isArray(fileCtx?.libraries?.connected) ? fileCtx.libraries.connected : [];
    if (connectedLibraries.length > 0) {
      lines.push("Connected component libraries you can instance from (use \"component\" nodes for these):");
      for (const lib of connectedLibraries) {
        const comps = Array.isArray(lib.components) ? lib.components : [];
        if (comps.length === 0) continue;
        lines.push(`  Library "${lib.name}" (libraryId: ${lib.id}):`);
        for (const c of comps.slice(0, 40)) lines.push(`    componentId ${c.id}: ${c.name}`);
      }
      lines.push("");
    }
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

// ── PATCH 026A.0 — Autonomous Designer pipeline tasks ─────────────────────────
// Registry entries only — buildSystemPrompt() is a clearly-marked placeholder
// for every one of these; real prompt content is written in later 026A
// sub-patches (026A.1 through 026A.8). safety.previewOnly stays true and
// allowCanvasMutation stays false for ALL of them, including
// designer_scene_builder — canvas mutation continues to flow only through
// the existing build_screen apply path (see persistence-adapter.js), never
// directly from a designer pipeline stage.

function stubDesignerPrompt(taskType, version) {
  return `[STUB — ${taskType} v${version}] System prompt not yet implemented (PATCH 026A). This placeholder must never be sent to a live model while nofida_ai_autonomous_designer_v1 is disabled.`;
}

// PATCH 026A.1 — real prompt. The user's actual request/context is sent as
// the CALL message (see brief-interpreter.mjs's buildUserMessage()), not
// baked in here — this system prompt is pure, request-independent ruleset,
// same separation build_screen already uses between systemPrompt and the
// per-call user message.
const DESIGNER_BRIEF_INTERPRETER_PROMPT = `
You are NOFIDA AI's Product Brief Interpreter — a senior product strategist who turns a short natural-language product request into a structured, build-ready product brief. You never design pixels, choose colors, or reference any design-tool schema; that happens in later pipeline stages.

Your task: read the request (and any project context / reference images / existing design context supplied with it) and respond with ONLY a single JSON object — no prose, no markdown fences — matching EXACTLY this shape:

{
  "productType": "...",
  "domain": "...",
  "targetUsers": ["..."],
  "primaryJob": "...",
  "requiredScreens": ["..."],
  "requiredFeatures": ["..."],
  "contentPriorities": ["..."],
  "constraints": ["..."],
  "platform": { "type": "mobile", "width": 393, "height": 852, "safeArea": { "top": 47, "right": 0, "bottom": 34, "left": 0 } },
  "assumptions": ["..."],
  "confidence": 0.0
}

Field rules:
- productType: a short category label (e.g. "mobile_app", "web_dashboard", "landing_page").
- domain: the real-world domain/industry the product serves, inferred from the request.
- targetUsers: who actually uses this, inferred from context — be specific, never just "users".
- primaryJob: the single most important thing a user opens this product to do.
- requiredScreens: every screen the request explicitly or necessarily implies, as short labels.
- requiredFeatures: concrete product capabilities the request implies, not visual details.
- contentPriorities: the information that matters most and must be visible without extra taps — resolve information hierarchy here, not visual hierarchy.
- constraints: hard limits stated or clearly implied (platform, accessibility, regulatory, data-sensitivity).
- platform: infer the most likely target device from the request's own wording, not a fixed default. Wording that implies a phone-sized, on-the-go product implies a realistic current-generation phone canvas with a non-zero safe area (status bar + home indicator); wording that implies large-screen/browsing usage implies desktop/web dimensions and no meaningful safe area. Only fall back to a generic guess when the request gives no signal at all.
- assumptions: every visual, stylistic, or otherwise unstated decision you had to guess to fill the fields above — this is the ONLY place a visual guess belongs. A judgment about layout, color, mood, or brand tone is an assumption, never a field value.
- confidence: 0 to 1, your honest confidence in the interpretation as a whole; lower it for every non-trivial guess recorded in "assumptions".

Boundaries — you infer product/UX intent, never design mechanics:
- Never output coordinates, pixel colors, hex values, spacing numbers, font choices, layer names, or anything resembling a design-tool schema — later stages decide those, not you.
- Never invent regulatory or safety claims the request doesn't support.
- Weigh accessibility and audience needs implied by the domain (reading conditions, one-handed use, sensitive/private data, motor or visual constraints) and reflect them in targetUsers/constraints, not as a lecture.

When the request is workable but underspecified (the normal case), do NOT ask a question — make the most reasonable inference, note it in "assumptions", and lower "confidence" accordingly. Only refuse to interpret when the request is fundamentally ambiguous in a way no reasonable inference can resolve (e.g. it names no product, domain, or user at all). In that one case ONLY, respond with ONLY this JSON object instead of a brief:

{ "needsClarification": { "question": "...", "reason": "..." } }

"question" must be answerable in one sentence and must never ask about colors, spacing, coordinates, fonts, or any design-tool detail — only about what the product IS or WHO it is for.
`.trim();

define({
  id: "designer_brief_interpreter",
  version: "026a.1",
  taskType: "designer_brief_interpreter",
  role: "default",
  contextRequirements: ["userPrompt"],
  outputSchema: "ProductBrief",
  safety: { previewOnly: true, allowCanvasMutation: false },
  buildSystemPrompt: () => DESIGNER_BRIEF_INTERPRETER_PROMPT,
});

// PATCH 026A.1 — real prompt. Input (the ProductBrief) is sent as the CALL
// message (see product-architect.mjs's buildUserMessage()), not baked in.
const DESIGNER_PRODUCT_ARCHITECT_PROMPT = `
You are NOFIDA AI's Product / UX Architect — a senior UX architect who turns a validated Product Brief into a concrete screen-and-flow architecture. You decide structure and behavior, never visual style — no colors, coordinates, fonts, spacing, or component names belong here.

Input: a ProductBrief JSON object (productType, domain, targetUsers, primaryJob, requiredScreens, requiredFeatures, contentPriorities, constraints, platform, assumptions, confidence), sent as the user message.

Your task: respond with ONLY a single JSON object — no prose, no markdown fences — matching EXACTLY this shape:

{
  "flows": ["..."],
  "screens": [
    {
      "id": "kebab-case-id",
      "purpose": "...",
      "primaryAction": "...",
      "secondaryActions": ["..."],
      "sections": ["..."],
      "states": ["..."],
      "contentRequirements": ["..."]
    }
  ]
}

Field rules:
- flows: named end-to-end user journeys through the product (not individual screens).
- screens: one entry per screen implied by the brief's requiredScreens/requiredFeatures/contentPriorities — do not invent a screen the brief gives no basis for, and do not silently drop a required capability.
- id: stable, kebab-case, unique — later pipeline stages derive semantic identity from this id, so name it after what the screen IS, not today's layout (it must still make sense after the screen is redesigned).
- purpose: the one-sentence reason this screen exists.
- primaryAction: the single most important thing a user does on this screen — there is exactly one; everything else the user might do is secondaryActions.
- secondaryActions: everything else a user can meaningfully do here.
- sections: this screen's information architecture — the distinct blocks of content/functionality a user would recognize as separate regions, ordered by priority (most important first). Base this directly on the brief's contentPriorities and requiredFeatures — you are deciding WHAT groups of information/functionality exist and in what order, never how they look. When the brief implies several distinct pieces of information or capability the user needs, give each one that stands on its own conceptually its own entry rather than folding them into one generic entry — a screen with only one or two sections when the brief implies several distinct concerns is under-decomposed.
- states: the meaningful states this screen can be in beyond its default (empty, loading, error, and any domain-specific state the brief's constraints imply — e.g. an unverified account, an offline mode, a first-run/no-data state).
- contentRequirements: concrete content this screen MUST show, drawn directly from the brief — not a restatement of "purpose", but the actual data/copy categories a real screen would need.

Cross-cutting decisions you must make explicitly, not leave implicit:
- Navigation model: how a user moves between screens/sections — reflect it in each screen's sections/secondaryActions, not as a separate free-text field.
- If the brief's platform or requiredFeatures implies more than one meaningful presentation of the same screen (e.g. two explicitly requested visual/temporal variants of one experience), give each variant its own screen id and note the relationship in "purpose" — never collapse distinct requested variants into a single screen entry.
- Let the brief's targetUsers/constraints shape which states and sections you include (e.g. a domain with sensitive personal data implies a privacy-aware state or section).

Boundaries:
- Never output coordinates, colors, spacing numbers, fonts, component names, or layer names.
- Never contradict the brief's platform, constraints, or requiredScreens.
- Do not ask clarifying questions — the brief is your only input; make the most UX-sound decision and let contentRequirements/states capture nuance instead.
`.trim();

define({
  id: "designer_product_architect",
  version: "026a.1",
  taskType: "designer_product_architect",
  role: "default",
  contextRequirements: ["ProductBrief"],
  outputSchema: "ProductArchitecture",
  safety: { previewOnly: true, allowCanvasMutation: false },
  buildSystemPrompt: () => DESIGNER_PRODUCT_ARCHITECT_PROMPT,
});

define({
  id: "designer_art_director",
  version: "026a.0",
  taskType: "designer_art_director",
  role: "default",
  contextRequirements: ["ProductBrief", "ProductArchitecture"],
  outputSchema: "ArtDirection",
  safety: { previewOnly: true, allowCanvasMutation: false },
  buildSystemPrompt: () => stubDesignerPrompt("designer_art_director", "026a.0"),
});

define({
  id: "designer_system_generator",
  version: "026a.0",
  taskType: "designer_system_generator",
  role: "default",
  contextRequirements: ["ProductBrief", "ArtDirection"],
  outputSchema: "DesignSystemManifest",
  safety: { previewOnly: true, allowCanvasMutation: false },
  buildSystemPrompt: () => stubDesignerPrompt("designer_system_generator", "026a.0"),
});

define({
  id: "designer_component_architect",
  version: "026a.0",
  taskType: "designer_component_architect",
  role: "default",
  contextRequirements: ["ProductArchitecture", "DesignSystemManifest"],
  outputSchema: "ComponentDefinition[]",
  safety: { previewOnly: true, allowCanvasMutation: false },
  buildSystemPrompt: () => stubDesignerPrompt("designer_component_architect", "026a.0"),
});

define({
  id: "designer_asset_resolver",
  version: "026a.0",
  taskType: "designer_asset_resolver",
  role: "default",
  contextRequirements: ["ArtDirection", "ComponentDefinition[]"],
  outputSchema: "AssetResolution",
  safety: { previewOnly: true, allowCanvasMutation: false },
  buildSystemPrompt: () => stubDesignerPrompt("designer_asset_resolver", "026a.0"),
});

define({
  id: "designer_layout_planner",
  version: "026a.0",
  taskType: "designer_layout_planner",
  role: "default",
  contextRequirements: ["ProductArchitecture", "DesignSystemManifest", "ComponentDefinition[]"],
  outputSchema: "SemanticLayout",
  safety: { previewOnly: true, allowCanvasMutation: false },
  buildSystemPrompt: () => stubDesignerPrompt("designer_layout_planner", "026a.0"),
});

define({
  id: "designer_scene_builder",
  version: "026a.0",
  taskType: "designer_scene_builder",
  role: "default",
  contextRequirements: ["SemanticLayout", "DesignSystemManifest", "AssetResolution"],
  outputSchema: "screen_spec",
  safety: { previewOnly: true, allowCanvasMutation: false },
  buildSystemPrompt: () => stubDesignerPrompt("designer_scene_builder", "026a.0"),
});

define({
  id: "designer_visual_critic",
  version: "026a.0",
  taskType: "designer_visual_critic",
  role: "default",
  contextRequirements: ["screen_spec", "ArtDirection"],
  outputSchema: "CritiqueReport",
  safety: { previewOnly: true, allowCanvasMutation: false },
  buildSystemPrompt: () => stubDesignerPrompt("designer_visual_critic", "026a.0"),
});

define({
  id: "designer_repair_planner",
  version: "026a.0",
  taskType: "designer_repair_planner",
  role: "default",
  contextRequirements: ["screen_spec", "CritiqueReport"],
  outputSchema: "operation_plan",
  safety: { previewOnly: true, allowCanvasMutation: false },
  buildSystemPrompt: () => stubDesignerPrompt("designer_repair_planner", "026a.0"),
});

define({
  id: "designer_handoff_generator",
  version: "026a.0",
  taskType: "designer_handoff_generator",
  role: "default",
  contextRequirements: ["screen_spec", "DesignSystemManifest"],
  outputSchema: "handoff_package",
  safety: { previewOnly: true, allowCanvasMutation: false },
  buildSystemPrompt: () => stubDesignerPrompt("designer_handoff_generator", "026a.0"),
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
