// PATCH 026A.7 — Visual Critic.
//
// Evaluates a resolved (themed) Scene Model board — geometry, tokens, real
// content — against the DesignSystemManifest it's supposed to be using, and
// produces a CritiqueReport (contracts.mjs, IMMUTABLE — score/issues/approved
// only). Two independent evaluation paths:
//
//   - Vision path: the resolved model reports "vision" in its capabilities
//     (see ai-service.mjs's resolveModelForRole()/hasCapability()) AND at
//     least one usable screenshot was supplied -> the designer_visual_critic
//     prompt runs with the screenshot(s) attached, same retry/repair-message
//     pattern as art-director.mjs.
//   - Rule-based path (no vision, or no screenshot available): pure code,
//     no LLM call at all. Walks the Scene Model directly for clipping/
//     overflow, low contrast (reusing theme-parity.mjs's checkBoardContrast),
//     uneven sibling spacing, and sibling overlap. Reports `confidence:
//     "reduced"` — a sibling field alongside the contract-validated
//     `critique`, never inside it (same split-field pattern art-director.mjs
//     uses for `rationale` — CritiqueReport's shape is immutable).
//
// `approved` is NEVER trusted as-is from either path — applyApprovalPolicy()
// recomputes it deterministically from score/issues so the repair loop
// (pipeline.mjs's runCritiqueRepairLoop()) has one consistent gate
// regardless of which path produced the report.

import { getPromptDefinition } from "../prompt-registry.mjs";
import { validateContract } from "./contracts.mjs";
import { checkBoardContrast } from "./theme-parity.mjs";
import { NODE_TYPES, TYPE_ALIASES } from "../scene/scene-schema.mjs";

const MAX_RETRIES = 1;
export const APPROVAL_MIN_SCORE = 85;

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
    "Respond again with ONLY a corrected JSON object matching the required schema exactly — no prose, no markdown fences.",
  ].join("\n");
}

function buildUserText({ board, manifest, productBrief }) {
  return [
    `Scene Model (JSON):\n${JSON.stringify(board)}`,
    `DesignSystemManifest (JSON):\n${JSON.stringify(manifest)}`,
    `ProductBrief (JSON):\n${JSON.stringify(productBrief || null)}`,
  ].join("\n\n");
}

// ── Rule-based structural critic (pure code, no LLM, no network) ──────────

function isRecognizedNodeType(type) {
  return NODE_TYPES.has(type) || Object.prototype.hasOwnProperty.call(TYPE_ALIASES, type);
}

function nodeLabel(node) {
  return node?.semanticId || node?.name || node?.type || "?";
}

function collectGeometryIssues(board) {
  const issues = [];
  (function walk(node, parent) {
    if (!node || typeof node !== "object") return;
    if (parent && typeof node.x === "number" && typeof node.width === "number") {
      const overflowsRight = node.x + node.width > parent.x + parent.width + 0.5;
      const overflowsBottom = node.y + node.height > parent.y + parent.height + 0.5;
      const overflowsLeft = node.x < parent.x - 0.5;
      const overflowsTop = node.y < parent.y - 0.5;
      if (overflowsRight || overflowsBottom || overflowsLeft || overflowsTop) {
        issues.push({
          severity: "error",
          nodeId: nodeLabel(node),
          category: "clipping",
          message: `"${node.name || node.semanticId}" overflows the bounds of its parent "${parent.name || parent.semanticId}"`,
          recommendedOperation: "resize or reposition this node so it fits entirely inside its parent",
        });
      }
    }
    for (const child of node.children || []) walk(child, node);
  })(board, null);
  return issues;
}

function collectOverlapIssues(board) {
  const issues = [];
  (function walk(node) {
    const children = (node.children || []).filter((c) => typeof c?.x === "number" && typeof c?.width === "number");
    for (let i = 0; i < children.length; i++) {
      for (let j = i + 1; j < children.length; j++) {
        const a = children[i];
        const b = children[j];
        const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
        const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
        if (overlapX > 1 && overlapY > 1) {
          issues.push({
            severity: "warning",
            nodeId: nodeLabel(a),
            category: "overlap",
            message: `"${a.name || a.semanticId}" overlaps sibling "${b.name || b.semanticId}"`,
            recommendedOperation: "reposition one of the two overlapping siblings",
          });
        }
      }
    }
    for (const child of node.children || []) walk(child);
  })(board);
  return issues;
}

// Flags a container whose children's vertical gaps vary wildly — a mechanical
// stand-in for "spacing looks inconsistent". Needs >= 3 children (2 gaps) to
// have a meaningful notion of "uniform".
function collectGapUniformityIssues(board) {
  const issues = [];
  (function walk(node) {
    const children = (node.children || [])
      .filter((c) => typeof c?.y === "number" && typeof c?.height === "number")
      .slice()
      .sort((a, b) => a.y - b.y);
    if (children.length >= 3) {
      const gaps = [];
      for (let i = 1; i < children.length; i++) gaps.push(children[i].y - (children[i - 1].y + children[i - 1].height));
      const mean = gaps.reduce((sum, g) => sum + g, 0) / gaps.length;
      const maxDelta = Math.max(...gaps.map((g) => Math.abs(g - mean)));
      if (mean > 0 && maxDelta > Math.max(4, mean * 0.5)) {
        issues.push({
          severity: "warning",
          nodeId: nodeLabel(node),
          category: "spacing",
          message: `vertical spacing between children of "${node.name || node.semanticId}" is inconsistent (gaps: ${gaps.map((g) => g.toFixed(0)).join(", ")})`,
          recommendedOperation: "normalize the gaps between these siblings to a single spacing token",
        });
      }
    }
    for (const child of node.children || []) walk(child);
  })(board);
  return issues;
}

function collectContrastIssues(board) {
  const result = checkBoardContrast(board);
  return result.errors.map((e) => ({
    severity: "error",
    nodeId: e.semanticId || "?",
    category: "contrast",
    message: e.kind === "low-contrast"
      ? `text contrast ${e.ratio.toFixed(2)}:1 against its background is below the required ${e.required}:1`
      : "text fill or background color could not be parsed for a contrast check",
    recommendedOperation: "bind this text node to a higher-contrast text token",
  }));
}

function collectUnsupportedNodeIssues(board) {
  const issues = [];
  (function walk(node) {
    if (node.type && !isRecognizedNodeType(node.type)) {
      issues.push({
        severity: "error",
        nodeId: nodeLabel(node),
        category: "unsupported-node",
        message: `node type "${node.type}" is not a recognized Scene Model type`,
        recommendedOperation: "replace this node with a supported Scene Model type",
      });
    }
    for (const child of node.children || []) walk(child);
  })(board);
  return issues;
}

function scoreFromIssues(issues) {
  let score = 100;
  for (const issue of issues) {
    if (issue.severity === "error") score -= 20;
    else if (issue.severity === "warning") score -= 8;
    else score -= 2;
  }
  return Math.max(0, score);
}

/**
 * applyApprovalPolicy(critique) -> critique with a recomputed `approved`.
 * Deterministic, source-independent (see this module's header) — matches the
 * PATCH 026A.7 spec's approval threshold: score >= 85, no error-severity
 * issue, no clipping, no unsupported/missing nodes, no contrast failure.
 */
export function applyApprovalPolicy(critique) {
  const issues = Array.isArray(critique.issues) ? critique.issues : [];
  const hasError = issues.some((i) => i.severity === "error");
  const hasClipping = issues.some((i) => i.category === "clipping");
  const hasContrastFailure = issues.some((i) => i.category === "contrast");
  const hasUnsupported = issues.some((i) => i.category === "unsupported-node");
  const score = typeof critique.score === "number" ? critique.score : 0;
  const approved = score >= APPROVAL_MIN_SCORE && !hasError && !hasClipping && !hasContrastFailure && !hasUnsupported;
  return { score, issues, approved };
}

/**
 * ruleBasedCritique(board) -> CritiqueReport-shaped object (score/issues/approved).
 * Pure code, no LLM, no network — the fallback path when the active model
 * has no vision capability or no screenshot was supplied.
 */
export function ruleBasedCritique(board) {
  const issues = [
    ...collectGeometryIssues(board),
    ...collectContrastIssues(board),
    ...collectGapUniformityIssues(board),
    ...collectOverlapIssues(board),
    ...collectUnsupportedNodeIssues(board),
  ];
  return applyApprovalPolicy({ score: scoreFromIssues(issues), issues });
}

/**
 * critiqueScreen({ board, manifest, productBrief, screenshots }, { aiSettingsService, role }) ->
 *   { ok: true, critique, confidence: "full"|"reduced", raw }
 *   { ok: false, error: { code, message } }
 * `screenshots`, if given: [{ mimeType, dataBase64 }, ...] — already-uploaded,
 * already-validated captures (see capture-validator.mjs); this module never
 * fetches or validates an image itself.
 */
export async function critiqueScreen({ board, manifest, productBrief, screenshots }, { aiSettingsService, role = "default" } = {}) {
  const resolved = await aiSettingsService.resolveModelForRole(role);
  const supportsVision = Array.isArray(resolved.capabilities) && resolved.capabilities.includes("vision");
  const usableScreenshots = Array.isArray(screenshots)
    ? screenshots.filter((s) => s && typeof s.dataBase64 === "string" && s.dataBase64.length > 0)
    : [];

  if (!supportsVision || usableScreenshots.length === 0) {
    const critique = ruleBasedCritique(board);
    const contractResult = validateContract("CritiqueReport", critique);
    if (!contractResult.ok) {
      return {
        ok: false,
        error: { code: "contract_violation", message: `rule-based critique failed internal validation: ${contractResult.errors.join("; ")}` },
      };
    }
    return { ok: true, critique, confidence: "reduced", raw: null };
  }

  const definition = getPromptDefinition("designer_visual_critic");
  const systemPrompt = definition.buildSystemPrompt();
  const baseText = buildUserText({ board, manifest, productBrief });
  const images = usableScreenshots.map((s) => ({ mimeType: s.mimeType || "image/png", dataBase64: s.dataBase64 }));
  let messageText = baseText;
  let lastRaw = null;
  let lastErrors = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const callResult = await aiSettingsService.callWithResolvedModel({
      resolved,
      message: { text: messageText, images },
      systemPrompt,
    });
    const raw = callResult.answer;
    lastRaw = raw;

    const candidate = extractJsonCandidate(raw);
    if (!candidate) {
      lastErrors = ["no JSON object found in the model's response"];
      messageText = buildRepairMessage(baseText, raw, lastErrors);
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(candidate);
    } catch (err) {
      lastErrors = [`invalid JSON: ${err.message}`];
      messageText = buildRepairMessage(baseText, raw, lastErrors);
      continue;
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      lastErrors = ["response must be a single JSON object"];
      messageText = buildRepairMessage(baseText, raw, lastErrors);
      continue;
    }

    const critique = applyApprovalPolicy({ score: parsed.score, issues: Array.isArray(parsed.issues) ? parsed.issues : [] });
    const contractResult = validateContract("CritiqueReport", critique);
    if (contractResult.ok) {
      return { ok: true, critique, confidence: "full", raw };
    }
    lastErrors = contractResult.errors;
    messageText = buildRepairMessage(baseText, raw, lastErrors);
  }

  return {
    ok: false,
    error: {
      code: "contract_violation",
      message: `designer_visual_critic output failed validation after ${MAX_RETRIES + 1} attempt(s): ${(lastErrors || []).join("; ")}`,
    },
    raw: lastRaw,
  };
}
