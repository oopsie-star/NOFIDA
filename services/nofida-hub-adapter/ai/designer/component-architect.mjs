// PATCH 026A.3 — Component Architect.
//
// Turns a validated ProductArchitecture + ArtDirection + DesignSystemManifest
// into a validated array of ComponentDefinition (contracts.mjs), plus the
// deep cross-checks component-validators.mjs adds (tokenBindings resolve
// into the manifest, layout is a real SemanticLayout, no light/dark split
// into two components) — same "shallow contract + deep pure-code checks"
// split as design-system-generator.mjs. A deterministic dedup pass runs
// AFTER validation succeeds, merging structurally identical definitions.

import { getPromptDefinition } from "../prompt-registry.mjs";
import { validateComponentDeep, checkNoLightDarkDuplicateNames, dedupeComponents } from "./component-validators.mjs";

const MAX_RETRIES = 1;

function extractJsonArrayCandidate(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("[")) return trimmed;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) return fenced[1].trim();
  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return null;
}

function buildUserMessage(productArchitecture, artDirection, manifest) {
  return [
    `ProductArchitecture (JSON):\n${JSON.stringify(productArchitecture)}`,
    `ArtDirection (JSON):\n${JSON.stringify(artDirection)}`,
    `DesignSystemManifest (JSON):\n${JSON.stringify(manifest)}`,
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
    "Respond again with ONLY a corrected JSON array matching the required schema exactly — no prose, no markdown fences. Pay specific attention to every error listed above.",
  ].join("\n");
}

/**
 * architectComponents({ productArchitecture, artDirection, manifest }, { aiSettingsService, role }) ->
 *   { ok: true, components, raw }
 *   { ok: false, error: { code, message }, raw }
 *
 * See brief-interpreter.mjs's header for the expected `aiSettingsService`
 * shape. `components` is already deduplicated (dedupeComponents()) by the
 * time this returns.
 */
export async function architectComponents({ productArchitecture, artDirection, manifest }, { aiSettingsService, role = "default" } = {}) {
  const definition = getPromptDefinition("designer_component_architect");
  const systemPrompt = definition.buildSystemPrompt();
  const baseMessage = buildUserMessage(productArchitecture, artDirection, manifest);
  const resolved = await aiSettingsService.resolveModelForRole(role);

  let message = baseMessage;
  let lastRaw = null;
  let lastErrors = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const callResult = await aiSettingsService.callWithResolvedModel({ resolved, message, systemPrompt });
    const raw = callResult.answer;
    lastRaw = raw;

    const candidate = extractJsonArrayCandidate(raw);
    if (!candidate) {
      lastErrors = ["no JSON array found in the model's response"];
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

    if (!Array.isArray(parsed)) {
      lastErrors = ["response must be a JSON array of ComponentDefinition objects"];
      message = buildRepairMessage(baseMessage, raw, lastErrors);
      continue;
    }

    const errors = [];
    for (let i = 0; i < parsed.length; i++) {
      const result = validateComponentDeep(parsed[i], manifest);
      if (!result.ok) errors.push(...result.errors.map((e) => `[${i}] ${e}`));
    }
    const dupCheck = checkNoLightDarkDuplicateNames(parsed);
    errors.push(...dupCheck.errors);

    if (errors.length === 0) {
      return { ok: true, components: dedupeComponents(parsed), raw };
    }
    lastErrors = errors;
    message = buildRepairMessage(baseMessage, raw, lastErrors);
  }

  return {
    ok: false,
    error: {
      code: "contract_violation",
      message: `designer_component_architect output failed validation after ${MAX_RETRIES + 1} attempt(s): ${(lastErrors || []).join("; ")}`,
    },
    raw: lastRaw,
  };
}
