// PATCH 026A.1 — Product / UX Architect.
//
// Turns a validated ProductBrief into a validated ProductArchitecture
// (contracts.mjs). Same retry-on-contract-violation shape as
// brief-interpreter.mjs, minus the needsClarification branch — the brief is
// this stage's only input, and an underspecified brief is resolved with a
// UX-sound default decision, not a question back to the caller (see the
// registered prompt's own rules).

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

function buildUserMessage(productBrief) {
  return `ProductBrief (JSON):\n${JSON.stringify(productBrief)}`;
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
 * planArchitecture(productBrief, { aiSettingsService, role }) ->
 *   { ok: true, architecture, raw }
 *   { ok: false, error: { code, message }, raw }
 *
 * See brief-interpreter.mjs's header for the expected `aiSettingsService`
 * shape.
 */
export async function planArchitecture(productBrief, { aiSettingsService, role = "default" } = {}) {
  const definition = getPromptDefinition("designer_product_architect");
  const systemPrompt = definition.buildSystemPrompt();
  const baseMessage = buildUserMessage(productBrief);
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

    const result = validateContract("ProductArchitecture", parsed);
    if (result.ok) {
      return { ok: true, architecture: parsed, raw };
    }
    lastErrors = result.errors;
    message = buildRepairMessage(baseMessage, raw, lastErrors);
  }

  return {
    ok: false,
    error: {
      code: "contract_violation",
      message: `designer_product_architect output failed ProductArchitecture validation after ${MAX_RETRIES + 1} attempt(s): ${(lastErrors || []).join("; ")}`,
    },
    raw: lastRaw,
  };
}
