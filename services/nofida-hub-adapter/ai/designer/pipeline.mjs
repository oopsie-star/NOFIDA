// PATCH 026A.0 — Autonomous Designer pipeline orchestrator.
//
// Runs the designer_* prompt-registry tasks (see prompt-registry.mjs) in a
// fixed sequence, validating each stage's output against its inter-stage
// contract (contracts.mjs) before it is allowed to feed the next stage.
// Deterministic glue only — no creative/product decisions are made here (see
// PATCH 026A's global rule #3); every actual decision comes from the LLM
// call the caller supplies through `invokeStage`.
//
// Pure orchestration, no network/LLM calls of its own: `invokeStage(stageDef,
// promptDefinition, session)` is caller-injected (same pattern as
// scene-compiler.mjs's injectable `newId`), so this module is testable
// without a live provider and the actual ai-service.mjs wiring can evolve
// independently of the stage sequence/contract-gating logic below.
//
// PATCH 026A.7 adds the critic/repair loop: STAGE_ORDER's "critique" and
// "repair" entries are now `implemented: true` (single-shot building blocks,
// wired in stage-invoker.mjs to visual-critic.mjs/repair-planner.mjs — same
// contract-gated pattern as every other stage). The actual multi-pass loop
// (capture -> critique -> repair -> rollback+re-create -> capture -> ...,
// max 3 repair passes) is a SEPARATE function, runCritiqueRepairLoop() below
// — it can't be expressed as a single runPipelineStage() call because
// runPipelineStage()'s per-stage cache (see below) is a "run once" cache,
// while the loop deliberately re-evaluates the SAME logical stage multiple
// times. PATCH 026A.8 will add handoff generation (deliberately not a
// pipeline stage at all — it's a separate, user-triggered action once a
// screen is approved, not part of the sequential build).

import { validateContract } from "./contracts.mjs";
import { getPromptDefinition } from "../prompt-registry.mjs";

export const STAGE_ORDER = Object.freeze([
  { stage: "brief", taskType: "designer_brief_interpreter", contract: "ProductBrief", implemented: true },
  { stage: "product_architecture", taskType: "designer_product_architect", contract: "ProductArchitecture", implemented: true },
  { stage: "art_direction", taskType: "designer_art_director", contract: "ArtDirection", implemented: true },
  { stage: "design_system", taskType: "designer_system_generator", contract: "DesignSystemManifest", implemented: true },
  { stage: "components", taskType: "designer_component_architect", contract: "ComponentDefinition", implemented: true, isList: true },
  { stage: "assets", taskType: "designer_asset_resolver", contract: "AssetResolution", implemented: true },
  { stage: "layout", taskType: "designer_layout_planner", contract: "SemanticLayout", implemented: true },
  { stage: "scene", taskType: "designer_scene_builder", contract: null, implemented: true },
  { stage: "critique", taskType: "designer_visual_critic", contract: "CritiqueReport", implemented: true },
  { stage: "repair", taskType: "designer_repair_planner", contract: null, implemented: true },
]);

function pipelineError(stage, code, message, recoverable) {
  return Object.assign(new Error(message), { stage, code, message, recoverable: !!recoverable });
}

/**
 * Runs a single stage. Returns:
 *   { stage, status: "not_implemented", marker }
 *   { stage, status: "cached", output }         — reused from session.stageArtifacts
 *   { stage, status: "ok", output }              — freshly invoked and contract-validated
 * Throws a { stage, code, message, recoverable } error (see pipelineError())
 * on a missing prompt definition, invalid JSON, or a contract violation.
 */
export async function runPipelineStage(stageDef, { session, invokeStage }) {
  if (!stageDef.implemented) {
    return {
      stage: stageDef.stage,
      status: "not_implemented",
      marker: `stage "${stageDef.stage}" (${stageDef.taskType}) is not implemented yet — see PATCH 026A roadmap`,
    };
  }

  const cached = session?.stageArtifacts?.[stageDef.stage];
  if (cached && cached.status === "ok") {
    return { stage: stageDef.stage, status: "cached", output: cached.output };
  }

  const definition = getPromptDefinition(stageDef.taskType);
  if (!definition || definition.taskType !== stageDef.taskType) {
    throw pipelineError(
      stageDef.stage,
      "missing_prompt_definition",
      `no prompt definition registered for task "${stageDef.taskType}"`,
      false,
    );
  }

  const rawOutput = await invokeStage(stageDef, definition, session);

  let parsed;
  try {
    parsed = typeof rawOutput === "string" ? JSON.parse(rawOutput) : rawOutput;
  } catch (err) {
    throw pipelineError(
      stageDef.stage,
      "invalid_json",
      `stage "${stageDef.stage}" did not return valid JSON: ${err.message}`,
      true,
    );
  }

  if (stageDef.contract) {
    const items = stageDef.isList ? (Array.isArray(parsed) ? parsed : [parsed]) : [parsed];
    if (stageDef.isList && !Array.isArray(parsed)) {
      throw pipelineError(
        stageDef.stage,
        "contract_violation",
        `stage "${stageDef.stage}" must return an array of ${stageDef.contract}`,
        true,
      );
    }
    for (let i = 0; i < items.length; i++) {
      const result = validateContract(stageDef.contract, items[i]);
      if (!result.ok) {
        throw pipelineError(
          stageDef.stage,
          "contract_violation",
          `stage "${stageDef.stage}" output failed ${stageDef.contract} validation: ${result.errors.join("; ")}`,
          true,
        );
      }
    }
  }

  return { stage: stageDef.stage, status: "ok", output: parsed };
}

/**
 * Runs every stage in STAGE_ORDER sequentially against `session`.
 *   session            - { stageArtifacts: { [stage]: { status, output } } } (see session-store.mjs)
 *   invokeStage        - async (stageDef, promptDefinition, session) -> rawText|object
 *   persistStageResult - optional async (stage, output) -> void, called after each
 *                         freshly-validated (status "ok") stage; also updates
 *                         session.stageArtifacts in place so subsequent stages
 *                         in the SAME run see the cache too.
 * Returns { ok: true, results } or { ok: false, error, results } where
 * `error` is the uniform { stage, code, message, recoverable } shape and
 * `results` holds every stage that completed before the abort. Never throws.
 *
 * Callers exposing this to the client must sanitize `results`/`error` first
 * — this function returns raw stage artifacts, not a user-facing payload.
 */
export async function runPipeline({ session, invokeStage, persistStageResult }) {
  const results = [];
  for (const stageDef of STAGE_ORDER) {
    let result;
    try {
      result = await runPipelineStage(stageDef, { session, invokeStage });
    } catch (err) {
      const structured = err && err.stage
        ? { stage: err.stage, code: err.code, message: err.message, recoverable: err.recoverable }
        : { stage: stageDef.stage, code: "pipeline_error", message: String(err?.message || err), recoverable: false };
      return { ok: false, error: structured, results };
    }

    results.push(result);

    if (result.status === "ok") {
      if (persistStageResult) await persistStageResult(stageDef.stage, result.output);
      session.stageArtifacts = session.stageArtifacts || {};
      session.stageArtifacts[stageDef.stage] = { status: "ok", output: result.output };
    }
  }
  return { ok: true, results };
}

// ── PATCH 026A.7 — critique/repair loop ─────────────────────────────────────
// Deliberately NOT built on runPipelineStage()'s cache (see this file's
// header) — every dependency (capture/critique/repair/gate-check/apply) is
// caller-injected, same pattern as invokeStage() above, so this stays pure
// orchestration with zero concrete-implementation imports. A real caller
// wires `critique`/`repair` to visual-critic.mjs/repair-planner.mjs,
// `capture` to the browser canvas-capture bridge, and `rollbackAndRecreate`
// to persistence-adapter.js's rollbackLastApply()+applyChanges(); tests wire
// plain injected fakes (see verify-026a-autonomous-designer.mjs section 7).

export const MAX_REPAIR_PASSES = 3;

/**
 * runCritiqueRepairLoop({
 *   board, pairedBoard,
 *   capture,             // async (board, passIndex) -> { ok, screenshots? } | { ok:false, reason }
 *   critique,            // async ({ board, screenshots, passIndex }) -> { ok, critique, confidence } | { ok:false, error }
 *   repair,               // async ({ board, critique, passIndex }) -> { ok, operations } | { ok, localRepairImpossible, reason } | { ok:false, error }
 *   applyRepair,          // (board, operations, pairedBoard) -> { board, pairedBoard }
 *   rollbackAndRecreate,  // async ({ previousBoard, repairedBoard, pairedBoard, passIndex }) -> { ok, message? }
 *   checkGates,           // optional (({ board, pairedBoard }) -> { ok, ... }) — re-run 026A.4/026A.5 gates
 *   persistPass,          // optional async (passRecord) -> void — store {pass, board, critique, confidence, capture}
 *   maxPasses = MAX_REPAIR_PASSES,
 * }) ->
 *   { ok: true, approved: true, finalPass, bestPass, passes }
 *   { ok: true, approved: false, stoppedReason, bestPass, passes, unresolvedIssues? }
 *   { ok: false, error: { code, message, passIndex }, passes, bestPass? }
 *
 * "pass 0" is the initial evaluation of `board` as supplied — establishing a
 * baseline, not itself one of the "max 3 repair passes" (PATCH 026A.7 global
 * rule 3). Passes 1..maxPasses each perform exactly one repair() call,
 * apply it, re-check gates, roll back + re-create, and re-evaluate — so
 * `repair` is called AT MOST `maxPasses` times, never more. The loop never
 * claims success (`approved: true`) below the critic's own approval
 * threshold — see visual-critic.mjs's applyApprovalPolicy().
 */
export async function runCritiqueRepairLoop({
  board,
  pairedBoard,
  capture,
  critique,
  repair,
  applyRepair,
  rollbackAndRecreate,
  checkGates,
  persistPass,
  maxPasses = MAX_REPAIR_PASSES,
}) {
  const passes = [];

  async function evaluate(currentBoard, passIndex) {
    const captureResult = await capture(currentBoard, passIndex);
    if (!captureResult || captureResult.ok !== true) {
      return { ok: false, error: { code: "capture_failed", message: captureResult?.reason || "capture failed", passIndex } };
    }
    const critiqueResult = await critique({ board: currentBoard, screenshots: captureResult.screenshots, passIndex });
    if (!critiqueResult || critiqueResult.ok !== true) {
      return {
        ok: false,
        error: { code: critiqueResult?.error?.code || "critique_failed", message: critiqueResult?.error?.message || "critique failed", passIndex },
      };
    }
    const record = {
      pass: passIndex,
      board: currentBoard,
      critique: critiqueResult.critique,
      confidence: critiqueResult.confidence,
      capture: captureResult,
    };
    if (persistPass) await persistPass(record);
    return { ok: true, record };
  }

  const initial = await evaluate(board, 0);
  if (!initial.ok) return { ok: false, error: initial.error, passes };
  passes.push(initial.record);
  let latest = initial.record;
  let best = initial.record;
  let currentBoard = board;
  let currentPaired = pairedBoard;

  for (let pass = 1; pass <= maxPasses; pass++) {
    if (latest.critique.approved) break;

    const repairResult = await repair({ board: currentBoard, critique: latest.critique, passIndex: pass });
    if (!repairResult || repairResult.ok !== true) {
      return { ok: false, error: { ...(repairResult?.error || { code: "repair_failed", message: "repair planner failed" }), passIndex: pass }, passes, bestPass: best };
    }
    if (repairResult.localRepairImpossible) {
      return { ok: true, approved: false, stoppedReason: "local_repair_impossible", reason: repairResult.reason, bestPass: best, passes };
    }

    const { board: repairedBoard, pairedBoard: repairedPaired } = applyRepair(currentBoard, repairResult.operations, currentPaired);

    const gates = checkGates ? checkGates({ board: repairedBoard, pairedBoard: repairedPaired }) : { ok: true };
    if (!gates.ok) {
      return { ok: true, approved: false, stoppedReason: "post_repair_gate_failed", gateFailure: gates, bestPass: best, passes };
    }

    const applied = await rollbackAndRecreate({ previousBoard: currentBoard, repairedBoard, pairedBoard: repairedPaired, passIndex: pass });
    if (!applied || applied.ok !== true) {
      return { ok: false, error: { code: "repair_apply_failed", message: applied?.message || "rollback + re-create failed", passIndex: pass }, passes, bestPass: best };
    }

    currentBoard = repairedBoard;
    currentPaired = repairedPaired;

    const evalResult = await evaluate(currentBoard, pass);
    if (!evalResult.ok) return { ok: false, error: evalResult.error, passes, bestPass: best };
    passes.push(evalResult.record);
    latest = evalResult.record;
    if (latest.critique.score > best.critique.score) best = latest;
  }

  if (latest.critique.approved) {
    return { ok: true, approved: true, finalPass: latest, bestPass: latest, passes };
  }
  return {
    ok: true,
    approved: false,
    stoppedReason: "max_passes_exhausted",
    bestPass: best,
    passes,
    unresolvedIssues: best.critique.issues,
  };
}
