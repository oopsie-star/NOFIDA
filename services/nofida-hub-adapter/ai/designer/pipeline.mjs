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
// PATCH 026A.7 will add the critic/repair loop (currently present in
// STAGE_ORDER but marked `implemented: false` and skipped with an explicit
// marker) and PATCH 026A.8 will add handoff generation (deliberately not a
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
  { stage: "critique", taskType: "designer_visual_critic", contract: "CritiqueReport", implemented: false },
  { stage: "repair", taskType: "designer_repair_planner", contract: null, implemented: false },
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
