// PATCH 026A.1 — Brief Interpreter.
//
// Turns a natural-language product request into a validated ProductBrief
// (contracts.mjs). This module owns its own retry loop (independent of
// pipeline.mjs's own — lighter — contract check, which stays a defense-in-
// depth backstop, not the primary validation path) because it has to
// distinguish THREE outcomes the pipeline's generic invokeStage contract
// doesn't know how to tell apart:
//   1. a valid ProductBrief                              -> { ok: true, brief }
//   2. a structured refusal because the request is        -> { ok: false, needsClarification }
//      fundamentally ambiguous (not a schema violation —
//      a deliberate, well-formed alternate response)
//   3. a schema violation that survived one repair retry  -> { ok: false, error }
//
// Pure with respect to this module's own logic — the only side effect is the
// injected `aiSettingsService` call. No DOM/network access of its own.

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

function buildUserMessage(input) {
  const lines = [];
  lines.push(`Product request: ${input.request || ""}`);
  if (input.targetPlatform && input.targetPlatform !== "auto") {
    lines.push(`Target platform hint (from the caller, not the user's own words): ${input.targetPlatform}`);
  }
  if (input.projectContext && typeof input.projectContext === "object" && Object.keys(input.projectContext).length) {
    lines.push(`Project context: ${JSON.stringify(input.projectContext).slice(0, 2000)}`);
  }
  if (input.existingDesignContext) {
    lines.push(`Existing design context (if refining prior work): ${JSON.stringify(input.existingDesignContext).slice(0, 2000)}`);
  }
  if (Array.isArray(input.referenceImages) && input.referenceImages.length) {
    lines.push(`${input.referenceImages.length} reference image(s) were attached — use them only as stylistic/visual reference (record any visual read as an assumption), never as a source of product requirements.`);
  }
  return lines.join("\n");
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
 * interpretBrief(input, { aiSettingsService, role }) ->
 *   { ok: true, brief, raw }
 *   { ok: false, needsClarification: { question, reason }, raw }
 *   { ok: false, error: { code, message }, raw }
 *
 * `aiSettingsService` must expose `resolveModelForRole(role)` and
 * `callWithResolvedModel({ resolved, message, systemPrompt, history })`,
 * matching ai-service.mjs's createAISettingsService() shape (see
 * server.mjs's existing /ai/ask handler for the same call pattern) — tests
 * inject a fake with the same two methods.
 */
export async function interpretBrief(input, { aiSettingsService, role = "default" } = {}) {
  const definition = getPromptDefinition("designer_brief_interpreter");
  const systemPrompt = definition.buildSystemPrompt();
  const baseMessage = buildUserMessage(input || {});
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

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && parsed.needsClarification) {
      const nc = parsed.needsClarification;
      if (nc && typeof nc === "object" && typeof nc.question === "string" && nc.question.trim()) {
        return {
          ok: false,
          needsClarification: {
            question: nc.question.trim().slice(0, 300),
            reason: typeof nc.reason === "string" ? nc.reason.trim().slice(0, 300) : "",
          },
          raw,
        };
      }
      lastErrors = ["needsClarification.question is required and must be a non-empty string"];
      message = buildRepairMessage(baseMessage, raw, lastErrors);
      continue;
    }

    const result = validateContract("ProductBrief", parsed);
    if (result.ok) {
      return { ok: true, brief: parsed, raw };
    }
    lastErrors = result.errors;
    message = buildRepairMessage(baseMessage, raw, lastErrors);
  }

  return {
    ok: false,
    error: {
      code: "contract_violation",
      message: `designer_brief_interpreter output failed ProductBrief validation after ${MAX_RETRIES + 1} attempt(s): ${(lastErrors || []).join("; ")}`,
    },
    raw: lastRaw,
  };
}
