// PATCH 026A.4 — Layout Planner (LLM).
//
// Maps a screen's sections + the available component list + the art
// direction's density into a SemanticLayout tree (026A.0 contract) — one
// top-level child per screen.sections[i], positionally paired (this is what
// lets designer-scene-builder.mjs later associate layout geometry with the
// component/content that belongs in each slot, without the immutable
// SemanticLayout contract needing a field it doesn't have for component
// references). Geometry MATH is the layout-engine's job (pure code, no
// LLM) — this stage only decides structure: stack vs. grid, direction,
// gap/padding TOKEN references, alignment. No pixel literals allowed.

import { getPromptDefinition } from "../prompt-registry.mjs";
import { validateContract } from "./contracts.mjs";

const MAX_RETRIES = 1;

function extractJsonCandidate(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{")) return trimmed;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) return fenced[1].trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return null;
}

/**
 * checkNoPixelLiteralsWhereTokensExpected(layout) -> errors[]
 * The SemanticLayout contract legitimately allows numbers for minWidth/
 * maxWidth/minHeight/maxHeight (real min/max pixel CONSTRAINTS, not token
 * references — see contracts.mjs) — those are untouched here. Only fields
 * that are meant to hold a TOKEN reference are checked: padding's per-side
 * values, and "width" (which the layout-engine only understands as "fill",
 * "hug", or a token-ish string — see layout-engine.mjs's header note on why
 * there is no "height" sizing field at all).
 */
export function checkNoPixelLiteralsWhereTokensExpected(layout, path = "layout") {
  const errors = [];
  if (!layout || typeof layout !== "object") return errors;

  if (layout.padding && typeof layout.padding === "object") {
    for (const [side, value] of Object.entries(layout.padding)) {
      if (typeof value === "number") {
        errors.push(`${path}.padding.${side} is a raw pixel number (${value}) — padding must reference a spacing token string like "spacing.16"`);
      }
    }
  }
  if (typeof layout.width === "number") {
    errors.push(`${path}.width is a raw pixel number (${layout.width}) — width must be "fill", "hug", or a token reference string`);
  }
  (layout.children || []).forEach((child, i) => {
    errors.push(...checkNoPixelLiteralsWhereTokensExpected(child, `${path}.children[${i}]`));
  });
  return errors;
}

/** validateLayoutPlannerOutput(layout) -> { ok, errors } — shallow contract + the pixel-literal check above. */
export function validateLayoutPlannerOutput(layout) {
  const contractResult = validateContract("SemanticLayout", layout);
  const pixelErrors = checkNoPixelLiteralsWhereTokensExpected(layout);
  const errors = [...contractResult.errors, ...pixelErrors];
  return { ok: errors.length === 0, errors };
}

function buildUserMessage(screen, components, density) {
  return [
    `Screen (JSON): ${JSON.stringify(screen)}`,
    `Available components (JSON): ${JSON.stringify(components || [])}`,
    `Art direction density: ${density || "comfortable"}`,
  ].join("\n\n");
}

function buildRepairMessage(originalMessage, rawOutput, errors) {
  return [
    originalMessage,
    "",
    "Your previous response failed validation:",
    ...(errors || []).map((e) => `- ${e}`),
    "",
    "Previous response (for reference — do not repeat these mistakes):",
    String(rawOutput || "").slice(0, 2000),
    "",
    "Respond again with ONLY a corrected JSON object matching the required schema exactly — no prose, no markdown fences.",
  ].join("\n");
}

/**
 * planLayout({ screen, components, density }, { aiSettingsService, role }) ->
 *   { ok: true, layout: SemanticLayout, raw }
 *   { ok: false, error: { code, message }, raw }
 */
export async function planLayout({ screen, components, density }, { aiSettingsService, role = "default" } = {}) {
  const definition = getPromptDefinition("designer_layout_planner");
  const systemPrompt = definition.buildSystemPrompt();
  const baseMessage = buildUserMessage(screen, components, density);
  const resolved = await aiSettingsService.resolveModelForRole(role);

  let message = baseMessage;
  let lastRaw = null;
  let lastErrors = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const callResult = await aiSettingsService.callWithResolvedModel({ resolved, message, systemPrompt });
    const raw = callResult.answer;
    lastRaw = raw;

    const candidate = extractJsonCandidate(raw);
    if (!candidate) {
      lastErrors = ["no JSON object found in the model's response"];
      message = buildRepairMessage(baseMessage, raw, lastErrors);
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(candidate);
    } catch (err) {
      lastErrors = [`invalid JSON: ${err.message}`];
      message = buildRepairMessage(baseMessage, raw, lastErrors);
      continue;
    }

    const result = validateLayoutPlannerOutput(parsed);
    if (result.ok) {
      return { ok: true, layout: parsed, raw };
    }
    lastErrors = result.errors;
    message = buildRepairMessage(baseMessage, raw, lastErrors);
  }

  return {
    ok: false,
    error: {
      code: "contract_violation",
      message: `designer_layout_planner output failed validation after ${MAX_RETRIES + 1} attempt(s): ${(lastErrors || []).join("; ")}`,
    },
    raw: lastRaw,
  };
}
