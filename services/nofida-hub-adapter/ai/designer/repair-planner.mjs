// PATCH 026A.7 — Repair Planner + local Scene Model repair application.
//
// Turns a CritiqueReport into a small set of LOCAL Scene Model operations
// addressed by semanticId (planRepairs(), an LLM call — no contracts.mjs
// entry exists for "operation_plan" so this module validates its own output
// shape, the same way pipeline.mjs's "scene" stage validates itself instead
// of going through contracts.mjs), then applies them mechanically
// (applyRepairOperations(), pure code, no LLM) to produce a repaired board.
//
// Per PATCH 026A.7's global rules, NONE of this ever emits Penpot Transit,
// UUIDs, or an update-file payload — a repair reaches Penpot only via
// rollback-of-affected-board(s) + idempotent re-create through the existing,
// unmodified persistence-adapter.js (ALLOW_BULK_UPDATE stays false; repairs
// never take the update/mod-obj path).

import { getPromptDefinition } from "../prompt-registry.mjs";
import { resolveColorToken } from "./layout-engine.mjs";
import { computeTokenCoverage } from "./token-coverage.mjs";
import { checkThemeParity, checkBoardContrast } from "./theme-parity.mjs";

const MAX_RETRIES = 1;

// Operations that change GEOMETRY (position/size) — theme-independent, so
// applyRepairOperations() mirrors these onto a paired board too (light/dark
// must stay geometrically identical — see theme-parity.mjs). Token/color
// operations are inherently theme-specific and are never mirrored.
const GEOMETRY_OPS = new Set(["resize", "reposition", "reduce-font-size", "normalize-gaps", "fix-calendar-spacing"]);
const THEME_OPS = new Set(["adjust-color-token", "improve-dark-separation"]);
export const REPAIR_OP_TYPES = Object.freeze([...GEOMETRY_OPS, ...THEME_OPS]);
const OP_TYPE_SET = new Set(REPAIR_OP_TYPES);

// ── LLM call: planRepairs() ────────────────────────────────────────────────

function extractJsonCandidate(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return trimmed;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) return fenced[1].trim();
  const objStart = trimmed.indexOf("{");
  const objEnd = trimmed.lastIndexOf("}");
  const arrStart = trimmed.indexOf("[");
  const arrEnd = trimmed.lastIndexOf("]");
  const candidates = [];
  if (arrStart >= 0 && arrEnd > arrStart) candidates.push({ start: arrStart, text: trimmed.slice(arrStart, arrEnd + 1) });
  if (objStart >= 0 && objEnd > objStart) candidates.push({ start: objStart, text: trimmed.slice(objStart, objEnd + 1) });
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.start - b.start);
  return candidates[0].text;
}

function buildRepairMessage(originalText, rawOutput, errors) {
  return [
    originalText,
    "",
    "Your previous response failed validation:",
    ...(errors || []).map((e) => `- ${e}`),
    "",
    "Previous response (for reference — do not repeat these mistakes):",
    String(rawOutput || "").slice(0, 2000),
    "",
    "Respond again with ONLY a corrected JSON array (or the localRepairImpossible object) matching the required schema exactly — no prose, no markdown fences.",
  ].join("\n");
}

function buildUserMessage({ critique, board, manifest }) {
  return [
    `CritiqueReport (JSON):\n${JSON.stringify(critique)}`,
    `Scene Model board (JSON):\n${JSON.stringify(board)}`,
    `DesignSystemManifest (JSON):\n${JSON.stringify(manifest)}`,
  ].join("\n\n");
}

/**
 * validateRepairOperations(payload) ->
 *   { ok: true, operations } | { ok: true, localRepairImpossible: true, reason } | { ok: false, errors }
 * Structural validation only (no contracts.mjs entry for this shape —
 * "operation_plan" is a free-form array, unlike the fixed 8 registered
 * contracts).
 */
export function validateRepairOperations(payload) {
  if (payload && typeof payload === "object" && !Array.isArray(payload) && payload.localRepairImpossible === true) {
    if (typeof payload.reason !== "string" || !payload.reason.trim()) {
      return { ok: false, errors: ["localRepairImpossible requires a non-empty 'reason'"] };
    }
    return { ok: true, localRepairImpossible: true, reason: payload.reason.trim() };
  }

  if (!Array.isArray(payload)) {
    return { ok: false, errors: ["repair planner output must be a JSON array of operations, or { localRepairImpossible: true, reason }"] };
  }

  const errors = [];
  payload.forEach((op, i) => {
    if (!op || typeof op !== "object" || Array.isArray(op)) {
      errors.push(`operations[${i}] must be an object`);
      return;
    }
    if (typeof op.semanticId !== "string" || !op.semanticId.trim()) errors.push(`operations[${i}].semanticId is required`);
    if (!OP_TYPE_SET.has(op.op)) errors.push(`operations[${i}].op "${op.op}" is not a recognized repair operation (expected one of: ${REPAIR_OP_TYPES.join(", ")})`);
    if (typeof op.reason !== "string" || !op.reason.trim()) errors.push(`operations[${i}].reason is required`);
    if (op.params !== undefined && (typeof op.params !== "object" || op.params === null || Array.isArray(op.params))) {
      errors.push(`operations[${i}].params must be an object when present`);
    }
  });

  return errors.length === 0 ? { ok: true, operations: payload } : { ok: false, errors };
}

/**
 * planRepairs({ critique, board, manifest }, { aiSettingsService, role }) ->
 *   { ok: true, operations, raw }
 *   { ok: true, localRepairImpossible: true, reason, raw }
 *   { ok: false, error: { code, message }, raw }
 */
export async function planRepairs({ critique, board, manifest }, { aiSettingsService, role = "default" } = {}) {
  const definition = getPromptDefinition("designer_repair_planner");
  const systemPrompt = definition.buildSystemPrompt();
  const baseMessage = buildUserMessage({ critique, board, manifest });
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
      lastErrors = ["no JSON array or object found in the model's response"];
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

    const result = validateRepairOperations(parsed);
    if (result.ok) {
      if (result.localRepairImpossible) return { ok: true, localRepairImpossible: true, reason: result.reason, raw };
      return { ok: true, operations: result.operations, raw };
    }
    lastErrors = result.errors;
    message = buildRepairMessage(baseMessage, raw, lastErrors);
  }

  return {
    ok: false,
    error: {
      code: "contract_violation",
      message: `designer_repair_planner output failed validation after ${MAX_RETRIES + 1} attempt(s): ${(lastErrors || []).join("; ")}`,
    },
    raw: lastRaw,
  };
}

// ── Pure-code application: applyRepairOperations() ─────────────────────────

function cloneNode(node) {
  return JSON.parse(JSON.stringify(node));
}

function findNodeWithParent(root, semanticId, parent = null) {
  if (root.semanticId === semanticId) return { node: root, parent };
  for (const child of root.children || []) {
    const found = findNodeWithParent(child, semanticId, root);
    if (found) return found;
  }
  return null;
}

function applyOneOperation(root, operation, manifest) {
  const found = findNodeWithParent(root, operation.semanticId);
  if (!found) return { applied: false, reason: `no node with semanticId "${operation.semanticId}"` };
  const { node } = found;

  switch (operation.op) {
    case "resize": {
      const { width, height } = operation.params || {};
      if (typeof width !== "number" && typeof height !== "number") return { applied: false, reason: "resize requires params.width and/or params.height" };
      if (typeof width === "number") node.width = width;
      if (typeof height === "number") node.height = height;
      return { applied: true };
    }
    case "reposition": {
      const { x, y } = operation.params || {};
      if (typeof x !== "number" && typeof y !== "number") return { applied: false, reason: "reposition requires params.x and/or params.y" };
      if (typeof x === "number") node.x = x;
      if (typeof y === "number") node.y = y;
      return { applied: true };
    }
    case "reduce-font-size": {
      const { fontSize, height } = operation.params || {};
      if (typeof fontSize !== "number") return { applied: false, reason: "reduce-font-size requires params.fontSize" };
      node.fontSize = fontSize;
      if (typeof height === "number") node.height = height;
      return { applied: true };
    }
    case "normalize-gaps":
    case "fix-calendar-spacing": {
      const children = node.children;
      if (!Array.isArray(children) || children.length === 0) return { applied: false, reason: `${operation.op} target has no children to space` };
      const gap = typeof operation.params?.gap === "number" ? operation.params.gap : 8;
      const axis = operation.params?.axis === "y" ? "y" : "x";
      const sizeKey = axis === "x" ? "width" : "height";
      let cursor = typeof node[axis] === "number" ? node[axis] : 0;
      for (const child of children) {
        child[axis] = cursor;
        cursor += (typeof child[sizeKey] === "number" ? child[sizeKey] : 0) + gap;
      }
      return { applied: true };
    }
    case "adjust-color-token":
    case "improve-dark-separation": {
      const fillToken = operation.params?.fillToken;
      if (typeof fillToken !== "string" || !fillToken.trim()) return { applied: false, reason: `${operation.op} requires params.fillToken` };
      node.tokens = { ...(node.tokens || {}), fillToken };
      const resolved = manifest ? resolveColorToken(manifest, node.themeVariant, fillToken) : null;
      if (resolved) node.fill = resolved;
      return { applied: true };
    }
    default:
      return { applied: false, reason: `unrecognized repair operation "${operation.op}"` };
  }
}

/**
 * applyRepairOperations(board, operations, { manifest, mirrorTo }) ->
 *   { board, mirrorBoard, applied, skipped }
 * Pure code — clones `board` (and `mirrorTo`, if supplied) and applies each
 * operation by semanticId. Geometry operations are also applied to
 * `mirrorTo` (the paired light/dark board), so a repair never silently
 * breaks theme parity (see theme-parity.mjs's checkThemeParity()); token/
 * color operations only ever touch the primary board. Operations targeting
 * an unknown semanticId are recorded in `skipped`, never thrown.
 */
export function applyRepairOperations(board, operations, { manifest, mirrorTo } = {}) {
  const repaired = cloneNode(board);
  const mirror = mirrorTo ? cloneNode(mirrorTo) : null;
  const applied = [];
  const skipped = [];

  for (const operation of operations || []) {
    const result = applyOneOperation(repaired, operation, manifest);
    if (!result.applied) {
      skipped.push({ operation, reason: result.reason });
      continue;
    }
    applied.push(operation);
    if (mirror && GEOMETRY_OPS.has(operation.op)) {
      const mirrorResult = applyOneOperation(mirror, operation, manifest);
      if (!mirrorResult.applied) skipped.push({ operation, reason: `mirror board: ${mirrorResult.reason}` });
    }
  }

  return { board: repaired, mirrorBoard: mirror || undefined, applied, skipped };
}

/**
 * checkPostRepairGates({ board, pairedBoard }) -> { ok, tokenCoverage, pairedCoverage, contrast, parity }
 * Re-runs the 026A.4 token-coverage gate and (when a paired board is given)
 * the 026A.5 theme-parity + per-board contrast gates against a REPAIRED
 * board — a repair operation is only ever accepted if it doesn't regress
 * either gate (see pipeline.mjs's runCritiqueRepairLoop()).
 */
export function checkPostRepairGates({ board, pairedBoard } = {}) {
  const tokenCoverage = computeTokenCoverage(board);
  const contrast = checkBoardContrast(board);
  const pairedCoverage = pairedBoard ? computeTokenCoverage(pairedBoard) : null;
  const parity = pairedBoard ? checkThemeParity(board, pairedBoard) : { ok: true, errors: [] };
  const ok = tokenCoverage.ok && contrast.ok && parity.ok && (!pairedCoverage || pairedCoverage.ok);
  return { ok, tokenCoverage, pairedCoverage, contrast, parity };
}
