// PATCH 026A.2 — AI Art Director.
//
// Turns a validated ProductBrief + ProductArchitecture into a validated
// ArtDirection (contracts.mjs), plus a short `rationale` the response
// carries alongside the contract fields (never inside them — the contract
// is immutable, so this module splits `rationale` out before validating the
// rest, the same pattern brief-interpreter.mjs uses for needsClarification).

import { getPromptDefinition } from "../prompt-registry.mjs";
import { validateContract } from "./contracts.mjs";

const MAX_RETRIES = 1;
const MAX_RATIONALE_SENTENCES = 3;

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

function buildUserMessage(productBrief, productArchitecture) {
  return [
    `ProductBrief (JSON):\n${JSON.stringify(productBrief)}`,
    `ProductArchitecture (JSON):\n${JSON.stringify(productArchitecture)}`,
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

function validateRationale(rationale) {
  if (typeof rationale !== "string" || !rationale.trim()) {
    return ["rationale is required and must be a non-empty string (at most 3 sentences)"];
  }
  const sentenceCount = (rationale.trim().match(/[.!?]+(\s|$)/g) || []).length || 1;
  if (sentenceCount > MAX_RATIONALE_SENTENCES) {
    return [`rationale must be at most ${MAX_RATIONALE_SENTENCES} sentences (found ~${sentenceCount})`];
  }
  return [];
}

/**
 * directArt({ productBrief, productArchitecture }, { aiSettingsService, role }) ->
 *   { ok: true, artDirection, rationale, raw }
 *   { ok: false, error: { code, message }, raw }
 *
 * See brief-interpreter.mjs's header for the expected `aiSettingsService`
 * shape.
 */
export async function directArt({ productBrief, productArchitecture }, { aiSettingsService, role = "default" } = {}) {
  const definition = getPromptDefinition("designer_art_director");
  const systemPrompt = definition.buildSystemPrompt();
  const baseMessage = buildUserMessage(productBrief, productArchitecture);
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

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      lastErrors = ["response must be a single JSON object"];
      message = buildRepairMessage(baseMessage, raw, lastErrors);
      continue;
    }

    const { rationale, ...artDirection } = parsed;
    const contractResult = validateContract("ArtDirection", artDirection);
    const rationaleErrors = validateRationale(rationale);
    const errors = [...contractResult.errors, ...rationaleErrors];

    if (errors.length === 0) {
      return { ok: true, artDirection, rationale: rationale.trim(), raw };
    }
    lastErrors = errors;
    message = buildRepairMessage(baseMessage, raw, lastErrors);
  }

  return {
    ok: false,
    error: {
      code: "contract_violation",
      message: `designer_art_director output failed validation after ${MAX_RETRIES + 1} attempt(s): ${(lastErrors || []).join("; ")}`,
    },
    raw: lastRaw,
  };
}
