// PATCH 026A.1/026A.2/026A.3/026A.4 — Wires real stage implementations into
// pipeline.mjs's injectable `invokeStage` signature.
//
// pipeline.mjs stays a pure, network-agnostic orchestrator (see its header)
// — it never imports a concrete stage implementation itself. This module is
// the adapter that plugs the real brief-interpreter/product-architect/
// art-director/design-system-generator/component-architect/asset-resolver/
// layout-planner/designer-scene-builder modules into that injection point.
// Stages without a real implementation yet (critique, repair) deliberately
// have NO fallback here — a caller trying to run one gets a loud,
// structured "stage_not_wired" error instead of a silent no-op, so it's
// obvious which 026A sub-patch still needs to land.

import { interpretBrief } from "./brief-interpreter.mjs";
import { planArchitecture } from "./product-architect.mjs";
import { directArt } from "./art-director.mjs";
import { generateDesignSystem } from "./design-system-generator.mjs";
import { architectComponents } from "./component-architect.mjs";
import { resolveAssets } from "./asset-resolver.mjs";
import { planLayout } from "./layout-planner.mjs";
import { buildScreenSpec } from "./designer-scene-builder.mjs";
import { computeTokenCoverage } from "./token-coverage.mjs";
import { parseScene } from "../scene/scene-validator.mjs";
import { critiqueScreen } from "./visual-critic.mjs";
import { planRepairs } from "./repair-planner.mjs";

function stageError(stage, code, message, recoverable) {
  return Object.assign(new Error(message), { stage, code, message, recoverable: !!recoverable });
}

const STAGE_IMPLEMENTATIONS = {
  async brief(stageDef, session, { aiSettingsService, role, briefInput }) {
    const result = await interpretBrief(briefInput, { aiSettingsService, role });
    if (result.ok) return JSON.stringify(result.brief);
    if (result.needsClarification) {
      throw stageError(
        "brief",
        "needs_clarification",
        result.needsClarification.question,
        true,
      );
    }
    throw stageError("brief", result.error.code, result.error.message, false);
  },

  async product_architecture(stageDef, session, { aiSettingsService, role }) {
    const brief = session?.stageArtifacts?.brief?.output;
    if (!brief) {
      throw stageError(
        "product_architecture",
        "missing_input",
        "product_architecture stage requires a completed 'brief' stage artifact in the session",
        false,
      );
    }
    const result = await planArchitecture(brief, { aiSettingsService, role });
    if (result.ok) return JSON.stringify(result.architecture);
    throw stageError("product_architecture", result.error.code, result.error.message, false);
  },

  async art_direction(stageDef, session, { aiSettingsService, role }) {
    const brief = session?.stageArtifacts?.brief?.output;
    const architecture = session?.stageArtifacts?.product_architecture?.output;
    if (!brief || !architecture) {
      throw stageError(
        "art_direction",
        "missing_input",
        "art_direction stage requires completed 'brief' and 'product_architecture' stage artifacts in the session",
        false,
      );
    }
    const result = await directArt({ productBrief: brief, productArchitecture: architecture }, { aiSettingsService, role });
    // `rationale` is deliberately dropped here — the ArtDirection contract
    // is immutable (026A.0 global rule) and pipeline.mjs's own contract
    // check for this stage would reject an unrecognized field. directArt()'s
    // full result (including rationale) is still available to any caller
    // that invokes art-director.mjs directly instead of through the pipeline.
    if (result.ok) return JSON.stringify(result.artDirection);
    throw stageError("art_direction", result.error.code, result.error.message, false);
  },

  async design_system(stageDef, session, { aiSettingsService, role }) {
    const brief = session?.stageArtifacts?.brief?.output;
    const artDirection = session?.stageArtifacts?.art_direction?.output;
    if (!brief || !artDirection) {
      throw stageError(
        "design_system",
        "missing_input",
        "design_system stage requires completed 'brief' and 'art_direction' stage artifacts in the session",
        false,
      );
    }
    const result = await generateDesignSystem({ productBrief: brief, artDirection }, { aiSettingsService, role });
    if (result.ok) return JSON.stringify(result.manifest);
    throw stageError("design_system", result.error.code, result.error.message, false);
  },

  async components(stageDef, session, { aiSettingsService, role }) {
    const architecture = session?.stageArtifacts?.product_architecture?.output;
    const artDirection = session?.stageArtifacts?.art_direction?.output;
    const manifest = session?.stageArtifacts?.design_system?.output;
    if (!architecture || !artDirection || !manifest) {
      throw stageError(
        "components",
        "missing_input",
        "components stage requires completed 'product_architecture', 'art_direction', and 'design_system' stage artifacts in the session",
        false,
      );
    }
    const result = await architectComponents({ productArchitecture: architecture, artDirection, manifest }, { aiSettingsService, role });
    if (result.ok) return JSON.stringify(result.components);
    throw stageError("components", result.error.code, result.error.message, false);
  },

  // Deterministic — see asset-resolver.mjs's header for why this stage
  // ignores aiSettingsService/role entirely.
  async assets(stageDef, session) {
    const architecture = session?.stageArtifacts?.product_architecture?.output;
    const artDirection = session?.stageArtifacts?.art_direction?.output;
    const components = session?.stageArtifacts?.components?.output;
    if (!architecture || !artDirection || !components) {
      throw stageError(
        "assets",
        "missing_input",
        "assets stage requires completed 'product_architecture', 'art_direction', and 'components' stage artifacts in the session",
        false,
      );
    }
    const resolution = resolveAssets({ productArchitecture: architecture, artDirection, components });
    return JSON.stringify(resolution);
  },

  // PATCH 026A.4 scope: the pipeline plans/builds ONE screen — the first
  // entry in ProductArchitecture.screens — not a fan-out over every
  // screen/theme pairing (that is future work, e.g. the light/dark pairing
  // 026A.5 anticipates). Both stages below operate on that single screen.
  async layout(stageDef, session, { aiSettingsService, role }) {
    const architecture = session?.stageArtifacts?.product_architecture?.output;
    const artDirection = session?.stageArtifacts?.art_direction?.output;
    const components = session?.stageArtifacts?.components?.output;
    if (!architecture || !artDirection || !components) {
      throw stageError(
        "layout",
        "missing_input",
        "layout stage requires completed 'product_architecture', 'art_direction', and 'components' stage artifacts in the session",
        false,
      );
    }
    const screen = (architecture.screens || [])[0];
    if (!screen) {
      throw stageError("layout", "missing_input", "product_architecture has no screens to plan a layout for", false);
    }
    const result = await planLayout({ screen, components, density: artDirection.density }, { aiSettingsService, role });
    if (result.ok) return JSON.stringify(result.layout);
    throw stageError("layout", result.error.code, result.error.message, false);
  },

  // Deterministic — see designer-scene-builder.mjs's header. Also runs
  // token-coverage.mjs's gate (026A.4 Task 4) before accepting the stage's
  // output: below-threshold coverage is a recoverable, structured abort,
  // not a silently-shipped screen.
  async scene(stageDef, session) {
    const brief = session?.stageArtifacts?.brief?.output;
    const architecture = session?.stageArtifacts?.product_architecture?.output;
    const manifest = session?.stageArtifacts?.design_system?.output;
    const components = session?.stageArtifacts?.components?.output;
    const assets = session?.stageArtifacts?.assets?.output;
    const layout = session?.stageArtifacts?.layout?.output;
    if (!architecture || !manifest || !components || !assets || !layout) {
      throw stageError(
        "scene",
        "missing_input",
        "scene stage requires completed 'product_architecture', 'design_system', 'components', 'assets', and 'layout' stage artifacts in the session",
        false,
      );
    }
    const screen = (architecture.screens || [])[0];
    if (!screen) {
      throw stageError("scene", "missing_input", "product_architecture has no screens to build a scene for", false);
    }

    const platform = brief?.platform || { width: 393, height: 852 };
    const frame = {
      width: platform.width, height: platform.height,
      safeAreaTop: platform.safeArea?.top || 0, safeAreaBottom: platform.safeArea?.bottom || 0,
      safeAreaLeft: platform.safeArea?.left || 0, safeAreaRight: platform.safeArea?.right || 0,
    };

    const { screenSpec, report } = buildScreenSpec({ screen, layout, manifest, components, assets, themeVariant: "light", frame });

    if (report.overBudget) {
      throw stageError(
        "scene",
        "node_budget_exceeded",
        `scene stage produced ${report.totalNodeCount} nodes, over the node budget even after layout-engine's degradation pass`,
        false,
      );
    }

    const coverage = computeTokenCoverage(screenSpec);
    if (!coverage.ok) {
      throw stageError(
        "scene",
        "token_coverage_below_threshold",
        `scene stage token coverage below threshold — color ${(coverage.colorCoverage * 100).toFixed(1)}%, text ${(coverage.textCoverage * 100).toFixed(1)}%, spacing/radius ${(coverage.spacingRadiusCoverage * 100).toFixed(1)}%, overall ${(coverage.overallCoverage * 100).toFixed(1)}%: ${coverage.violations.slice(0, 5).map((v) => `${v.path} (${v.kind})`).join("; ")}`,
        true,
      );
    }

    const parsed = parseScene(JSON.stringify(screenSpec));
    if (!parsed.ok) {
      throw stageError("scene", "invalid_scene_spec", `scene stage output failed parseScene(): ${parsed.error}`, false);
    }

    return JSON.stringify(screenSpec);
  },

  // PATCH 026A.7 — single-shot critique of the current "scene" stage board.
  // Screenshots, if any were captured for this board's semanticId, come
  // from session.captures (see session-store.mjs's saveCaptureArtifact()) —
  // this stage never triggers a capture itself, it only consumes whatever
  // is already there. The multi-pass loop (pipeline.mjs's
  // runCritiqueRepairLoop()) calls visual-critic.mjs directly instead of
  // going through this stage, since it needs to re-evaluate the SAME
  // logical stage multiple times, which runPipelineStage()'s cache doesn't
  // support (see pipeline.mjs's header).
  async critique(stageDef, session, { aiSettingsService, role }) {
    const board = session?.stageArtifacts?.scene?.output;
    const manifest = session?.stageArtifacts?.design_system?.output;
    const brief = session?.stageArtifacts?.brief?.output;
    if (!board || !manifest) {
      throw stageError(
        "critique",
        "missing_input",
        "critique stage requires completed 'scene' and 'design_system' stage artifacts in the session",
        false,
      );
    }
    const captureRevisions = session?.captures?.[board.semanticId];
    const latestRevisionKey = captureRevisions ? Object.keys(captureRevisions).sort().slice(-1)[0] : null;
    const latestCapture = latestRevisionKey ? captureRevisions[latestRevisionKey] : null;
    const screenshots = latestCapture ? [{ mimeType: "image/png", dataBase64: latestCapture.pngBase64 }] : [];

    const result = await critiqueScreen({ board, manifest, productBrief: brief, screenshots }, { aiSettingsService, role });
    if (result.ok) return JSON.stringify(result.critique);
    throw stageError("critique", result.error.code, result.error.message, false);
  },

  // PATCH 026A.7 — single-shot repair plan from the last critique. Same
  // "not the loop" caveat as critique() above.
  async repair(stageDef, session, { aiSettingsService, role }) {
    const board = session?.stageArtifacts?.scene?.output;
    const critique = session?.stageArtifacts?.critique?.output;
    const manifest = session?.stageArtifacts?.design_system?.output;
    if (!board || !critique || !manifest) {
      throw stageError(
        "repair",
        "missing_input",
        "repair stage requires completed 'scene', 'critique', and 'design_system' stage artifacts in the session",
        false,
      );
    }
    const result = await planRepairs({ critique, board, manifest }, { aiSettingsService, role });
    if (result.ok) {
      return JSON.stringify(result.localRepairImpossible ? { localRepairImpossible: true, reason: result.reason } : result.operations);
    }
    throw stageError("repair", result.error.code, result.error.message, false);
  },
};

/**
 * createDesignerInvokeStage({ aiSettingsService, role, briefInput }) returns
 * an `invokeStage(stageDef, definition, session)` compatible with
 * pipeline.mjs's runPipeline()/runPipelineStage(). `briefInput` is the raw
 * { request, projectContext, referenceImages, existingDesignContext,
 * targetPlatform } object the brief stage needs — every later stage reads
 * its input from `session.stageArtifacts` instead, so it isn't threaded
 * through here.
 */
export function createDesignerInvokeStage({ aiSettingsService, role = "default", briefInput }) {
  return async function invokeStage(stageDef, definition, session) {
    const impl = STAGE_IMPLEMENTATIONS[stageDef.stage];
    if (!impl) {
      throw stageError(
        stageDef.stage,
        "stage_not_wired",
        `no real implementation wired for stage "${stageDef.stage}" yet`,
        false,
      );
    }
    return impl(stageDef, session, { aiSettingsService, role, briefInput });
  };
}
