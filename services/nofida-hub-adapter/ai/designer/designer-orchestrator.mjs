// PATCH 026A.8 — Live orchestration for the Autonomous Designer pipeline.
//
// server.mjs's designer_* routes are thin HTTP wrappers around the five
// functions below — this module is where the actual sequencing lives, kept
// separate (and importable from the verify script with a fake
// aiSettingsService, no HTTP server needed) the same way every other
// designer/ module in this directory is tested.
//
// Why this exists at all: pipeline.mjs's runPipelineStage()/runPipeline()
// only know how to run ONE stage or the WHOLE fixed sequence in one call —
// neither fits a browser-driven flow that needs to (1) stop after
// brief/architecture/art_direction to show the user an interpretation card,
// (2) actually apply/capture/critique/repair against a LIVE Penpot canvas
// (browser-only — no server-side Penpot access exists or should exist), and
// (3) let the browser drive the critique/repair loop's pacing while the
// server does the actual compute for each step. This module is that
// "resume from where the session left off, one HTTP call at a time" layer.
//
// Global rule 1 (LLM never emits Transit/UUIDs/update-file payloads) still
// holds: every function below returns a Scene Model Change IR (compileScene
// output) for the BROWSER to apply through persistence-adapter.js's
// existing applyChanges()/rollbackLastApply() — nothing here calls Penpot.

import crypto from "node:crypto";
import {
  createSession, getSession, saveStageArtifact, saveBoards,
  saveRepairPass,
} from "./session-store.mjs";
import { STAGE_ORDER, runPipelineStage, MAX_REPAIR_PASSES } from "./pipeline.mjs";
import { createDesignerInvokeStage } from "./stage-invoker.mjs";
import {
  buildPairedThemeBoards, compilePairedBoards,
} from "./designer-scene-builder.mjs";
import { computeTokenCoverage } from "./token-coverage.mjs";
import { checkThemeParity } from "./theme-parity.mjs";
import { critiqueScreen } from "./visual-critic.mjs";
import { planRepairs, applyRepairOperations, checkPostRepairGates } from "./repair-planner.mjs";
import { generateHandoff } from "./handoff-generator.mjs";

function normalizeStageError(err) {
  if (err && err.stage) return { code: err.code, message: err.message, stage: err.stage, recoverable: !!err.recoverable };
  return { code: "pipeline_error", message: String(err?.message || err), recoverable: false };
}

function findStageDef(stageName) {
  return STAGE_ORDER.find((s) => s.stage === stageName);
}

async function runAndPersistStage(stageName, { profileId, sessionId, localSession, invoke }) {
  const stageDef = findStageDef(stageName);
  const result = await runPipelineStage(stageDef, { session: localSession, invokeStage: invoke });
  if (result.status === "ok") {
    await saveStageArtifact(profileId, sessionId, stageName, result.output);
    localSession.stageArtifacts[stageName] = { status: "ok", output: result.output };
  }
  return result;
}

/**
 * createInterpretationSession({ profileId, userPrompt }, { aiSettingsService }) ->
 *   { ok: true, sessionId, interpretation: { productType, domain, platform, screens, direction, keywords } }
 *   { ok: false, needsClarification: true, question, sessionId }
 *   { ok: false, error: { code, message }, sessionId }
 * Runs brief -> product_architecture -> art_direction (the three stages the
 * PATCH 026A.8 spec's interpretation card needs: product, platform, planned
 * screens, visual direction) and stops — the rest of the pipeline only runs
 * once the user approves (see buildScreen() below).
 */
export async function createInterpretationSession({ profileId, userPrompt }, { aiSettingsService }) {
  const session = await createSession(profileId, { userPrompt });
  const localSession = { stageArtifacts: {} };
  const invoke = createDesignerInvokeStage({ aiSettingsService, briefInput: { request: userPrompt } });

  for (const stageName of ["brief", "product_architecture", "art_direction"]) {
    try {
      await runAndPersistStage(stageName, { profileId, sessionId: session.id, localSession, invoke });
    } catch (err) {
      const normalized = normalizeStageError(err);
      if (normalized.code === "needs_clarification") {
        return { ok: false, needsClarification: true, question: normalized.message, sessionId: session.id };
      }
      return { ok: false, error: normalized, sessionId: session.id };
    }
  }

  const brief = localSession.stageArtifacts.brief.output;
  const architecture = localSession.stageArtifacts.product_architecture.output;
  const artDirection = localSession.stageArtifacts.art_direction.output;

  return {
    ok: true,
    sessionId: session.id,
    interpretation: {
      productType: brief.productType,
      domain: brief.domain,
      platform: brief.platform,
      screens: architecture.screens.map((s) => s.id),
      direction: artDirection.direction,
      keywords: artDirection.keywords,
    },
  };
}

/**
 * buildScreen({ profileId, sessionId, pageId }, { aiSettingsService }) ->
 *   { ok: true, changes, light: { semanticId, width, height }, dark: { ... }, pass: 0 }
 *   { ok: false, error: { code, message } }
 * Runs design_system -> components -> assets -> layout, then builds the
 * paired light/dark boards (designer-scene-builder.mjs) and re-verifies
 * token-coverage + theme-parity BEFORE ever compiling a Change IR for the
 * browser to apply — same gates stage-invoker.mjs's single-board "scene"
 * stage enforces, applied to the pair.
 */
export async function buildScreen({ profileId, sessionId, pageId }, { aiSettingsService }) {
  if (!pageId) return { ok: false, error: { code: "missing_page_id", message: "pageId is required to compile a board" } };

  const session = await getSession(profileId, sessionId);
  if (!session) return { ok: false, error: { code: "session_not_found", message: "designer session not found" } };

  const localSession = { stageArtifacts: session.stageArtifacts || {} };
  const invoke = createDesignerInvokeStage({ aiSettingsService, briefInput: {} });

  for (const stageName of ["design_system", "components", "assets", "layout"]) {
    try {
      await runAndPersistStage(stageName, { profileId, sessionId, localSession, invoke });
    } catch (err) {
      return { ok: false, error: normalizeStageError(err) };
    }
  }

  const brief = localSession.stageArtifacts.brief?.output;
  const architecture = localSession.stageArtifacts.product_architecture?.output;
  const manifest = localSession.stageArtifacts.design_system?.output;
  const components = localSession.stageArtifacts.components?.output;
  const assets = localSession.stageArtifacts.assets?.output;
  const layout = localSession.stageArtifacts.layout?.output;
  const screen = (architecture?.screens || [])[0];
  if (!brief || !screen || !manifest || !components || !assets || !layout) {
    return { ok: false, error: { code: "missing_input", message: "buildScreen requires a completed interpretation session before it can run" } };
  }

  const platform = brief.platform || { width: 393, height: 852 };
  const frame = {
    width: platform.width, height: platform.height,
    safeAreaTop: platform.safeArea?.top || 0, safeAreaBottom: platform.safeArea?.bottom || 0,
    safeAreaLeft: platform.safeArea?.left || 0, safeAreaRight: platform.safeArea?.right || 0,
  };

  const { lightBoard, darkBoard, report } = buildPairedThemeBoards({ screen, layout, manifest, components, assets, frame });
  if (report.overBudget) {
    return { ok: false, error: { code: "node_budget_exceeded", message: `screen produced ${report.totalNodeCount} nodes, over the node budget even after layout-engine's degradation pass` } };
  }

  const lightCoverage = computeTokenCoverage(lightBoard);
  const darkCoverage = computeTokenCoverage(darkBoard);
  if (!lightCoverage.ok || !darkCoverage.ok) {
    return {
      ok: false,
      error: {
        code: "token_coverage_below_threshold",
        message: `token coverage below threshold — light overall ${(lightCoverage.overallCoverage * 100).toFixed(1)}%, dark overall ${(darkCoverage.overallCoverage * 100).toFixed(1)}%`,
      },
    };
  }

  const parity = checkThemeParity(lightBoard, darkBoard);
  if (!parity.ok) {
    return {
      ok: false,
      error: { code: "theme_parity_violation", message: `light/dark boards diverged: ${parity.errors.slice(0, 3).map((e) => `${e.semanticId} (${e.kind})`).join("; ")}` },
    };
  }

  const compiled = compilePairedBoards(lightBoard, darkBoard, { pageId, newId: () => crypto.randomUUID() });
  if (!compiled.ok) {
    return { ok: false, error: { code: "compile_failed", message: compiled.error } };
  }

  await saveBoards(profileId, sessionId, { light: lightBoard, dark: darkBoard });

  // The browser's canvas-capture.js needs the REAL Penpot shape id (Plugin
  // API's getShapeById(), not our semanticId) — the compiled root's nid maps
  // to it directly via compilePairedBoards()'s own mapping.
  const lightPenpotId = compiled.light.mapping[compiled.light.scene.nid];
  const darkPenpotId = compiled.dark.mapping[compiled.dark.scene.nid];

  return {
    ok: true,
    changes: compiled.changes,
    light: { semanticId: lightBoard.semanticId, penpotId: lightPenpotId, width: lightBoard.width, height: lightBoard.height },
    dark: { semanticId: darkBoard.semanticId, penpotId: darkPenpotId, width: darkBoard.width, height: darkBoard.height },
    pass: 0,
  };
}

/**
 * runCritique({ profileId, sessionId, pass }, { aiSettingsService }) ->
 *   { ok: true, pass, critique, confidence, approved }
 *   { ok: false, error: { code, message } }
 * Reads the latest capture uploaded for the light board's semanticId (see
 * server.mjs's existing POST /ai/designer/captures) — if none was uploaded
 * yet (or the model has no vision capability), critiqueScreen() falls back
 * to its rule-based path on its own; this function never second-guesses
 * that routing decision.
 */
export async function runCritique({ profileId, sessionId, pass }, { aiSettingsService }) {
  const session = await getSession(profileId, sessionId);
  if (!session) return { ok: false, error: { code: "session_not_found", message: "designer session not found" } };

  const boards = session.boards;
  const manifest = session.stageArtifacts?.design_system?.output;
  const brief = session.stageArtifacts?.brief?.output;
  if (!boards?.light || !manifest) {
    return { ok: false, error: { code: "missing_input", message: "critique requires a built screen — call buildScreen first" } };
  }

  const captureRevisions = session.captures?.[boards.light.semanticId];
  const latestRevisionKey = captureRevisions ? Object.keys(captureRevisions).sort().slice(-1)[0] : null;
  const latestCapture = latestRevisionKey ? captureRevisions[latestRevisionKey] : null;
  const screenshots = latestCapture ? [{ mimeType: "image/png", dataBase64: latestCapture.pngBase64 }] : [];

  const result = await critiqueScreen({ board: boards.light, manifest, productBrief: brief, screenshots }, { aiSettingsService });
  if (!result.ok) return { ok: false, error: result.error };

  const passIndex = typeof pass === "number" ? pass : 0;
  await saveRepairPass(profileId, sessionId, { pass: passIndex, board: boards.light, critique: result.critique, confidence: result.confidence });

  return { ok: true, pass: passIndex, critique: result.critique, confidence: result.confidence, approved: result.critique.approved };
}

/**
 * runRepair({ profileId, sessionId, pass, pageId }, { aiSettingsService }) ->
 *   { ok: true, localRepairImpossible: true, reason }
 *   { ok: true, gateFailed: true, gateFailure }
 *   { ok: true, pass, changes, light, dark }
 *   { ok: false, error: { code, message } }
 * Never lets a session run more than MAX_REPAIR_PASSES (3) repair passes,
 * matching pipeline.mjs's runCritiqueRepairLoop() cap — a client retrying
 * or looping past that gets a structured refusal, not a silent 4th attempt.
 * The browser is responsible for the actual rollback + re-create against
 * Penpot (persistence-adapter.js) once it receives `changes` here — this
 * function only ever computes what SHOULD be on the canvas next.
 */
export async function runRepair({ profileId, sessionId, pass, pageId }, { aiSettingsService }) {
  if (!pageId) return { ok: false, error: { code: "missing_page_id", message: "pageId is required to compile a repaired board" } };

  const session = await getSession(profileId, sessionId);
  if (!session) return { ok: false, error: { code: "session_not_found", message: "designer session not found" } };

  const boards = session.boards;
  const manifest = session.stageArtifacts?.design_system?.output;
  const passes = session.repairPasses || [];
  const lastPass = passes[passes.length - 1];
  if (!boards?.light || !manifest || !lastPass) {
    return { ok: false, error: { code: "missing_input", message: "repair requires a built screen and at least one critique pass" } };
  }
  if (passes.length > MAX_REPAIR_PASSES) {
    return { ok: false, error: { code: "max_repair_passes_exceeded", message: `no more than ${MAX_REPAIR_PASSES} repair passes are allowed per session` } };
  }

  const planResult = await planRepairs({ critique: lastPass.critique, board: boards.light, manifest }, { aiSettingsService });
  if (!planResult.ok) return { ok: false, error: planResult.error };
  if (planResult.localRepairImpossible) {
    return { ok: true, localRepairImpossible: true, reason: planResult.reason };
  }

  const { board: repairedLight, mirrorBoard: repairedDark } = applyRepairOperations(boards.light, planResult.operations, { manifest, mirrorTo: boards.dark });

  const gates = checkPostRepairGates({ board: repairedLight, pairedBoard: repairedDark });
  if (!gates.ok) {
    return { ok: true, gateFailed: true, gateFailure: gates };
  }

  const compiled = compilePairedBoards(repairedLight, repairedDark, { pageId, newId: () => crypto.randomUUID() });
  if (!compiled.ok) {
    return { ok: false, error: { code: "compile_failed", message: compiled.error } };
  }

  await saveBoards(profileId, sessionId, { light: repairedLight, dark: repairedDark });

  const lightPenpotId = compiled.light.mapping[compiled.light.scene.nid];
  const darkPenpotId = compiled.dark.mapping[compiled.dark.scene.nid];

  const passIndex = typeof pass === "number" ? pass : passes.length;
  return {
    ok: true,
    pass: passIndex,
    changes: compiled.changes,
    light: { semanticId: repairedLight.semanticId, penpotId: lightPenpotId, width: repairedLight.width, height: repairedLight.height },
    dark: { semanticId: repairedDark.semanticId, penpotId: darkPenpotId, width: repairedDark.width, height: repairedDark.height },
  };
}

/**
 * buildHandoffBundle({ profileId, sessionId }, { aiSettingsService }) ->
 *   { ok: true, bundle: { designSystemJson, cssVariables, components, screens } }
 *   { ok: false, error: { code, message } }
 */
export async function buildHandoffBundle({ profileId, sessionId }, { aiSettingsService }) {
  const session = await getSession(profileId, sessionId);
  if (!session) return { ok: false, error: { code: "session_not_found", message: "designer session not found" } };

  const architecture = session.stageArtifacts?.product_architecture?.output;
  const manifest = session.stageArtifacts?.design_system?.output;
  const components = session.stageArtifacts?.components?.output;
  const layout = session.stageArtifacts?.layout?.output;
  const boards = session.boards;
  if (!architecture || !manifest || !components || !layout || !boards?.light) {
    return { ok: false, error: { code: "missing_input", message: "handoff requires a completed build — call buildScreen first" } };
  }

  return generateHandoff(
    { architecture, manifest, components, layout, board: boards.light, pairedBoard: boards.dark },
    { aiSettingsService },
  );
}
