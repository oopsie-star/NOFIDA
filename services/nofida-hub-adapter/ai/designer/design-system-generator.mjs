// PATCH 026A.2 — Design System Generator.
//
// Turns a validated ProductBrief + ArtDirection into a validated
// DesignSystemManifest (contracts.mjs's shallow structural check, PLUS the
// deep WCAG/integrity/not-inverted-dark checks in
// design-system-validators.mjs — see that module's header for why the two
// are separate). The repair retry sends the SPECIFIC validator errors back
// to the model, not a generic "try again".

import { getPromptDefinition } from "../prompt-registry.mjs";
import { validateManifest } from "./design-system-validators.mjs";

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

function buildUserMessage(productBrief, artDirection) {
  return [
    `ProductBrief (JSON):\n${JSON.stringify(productBrief)}`,
    `ArtDirection (JSON):\n${JSON.stringify(artDirection)}`,
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
    String(rawOutput || "").slice(0, 3000),
    "",
    "Respond again with ONLY a corrected JSON object matching the required schema exactly — no prose, no markdown fences. Pay specific attention to every error listed above.",
  ].join("\n");
}

/**
 * generateDesignSystem({ productBrief, artDirection }, { aiSettingsService, role }) ->
 *   { ok: true, manifest, raw }
 *   { ok: false, error: { code, message }, raw }
 *
 * See brief-interpreter.mjs's header for the expected `aiSettingsService`
 * shape.
 */
export async function generateDesignSystem({ productBrief, artDirection }, { aiSettingsService, role = "default" } = {}) {
  const definition = getPromptDefinition("designer_system_generator");
  const systemPrompt = definition.buildSystemPrompt();
  const baseMessage = buildUserMessage(productBrief, artDirection);
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

    const result = validateManifest(parsed);
    if (result.ok) {
      return { ok: true, manifest: parsed, raw };
    }
    lastErrors = result.errors;
    message = buildRepairMessage(baseMessage, raw, lastErrors);
  }

  return {
    ok: false,
    error: {
      code: "contract_violation",
      message: `designer_system_generator output failed validation after ${MAX_RETRIES + 1} attempt(s): ${(lastErrors || []).join("; ")}`,
    },
    raw: lastRaw,
  };
}
