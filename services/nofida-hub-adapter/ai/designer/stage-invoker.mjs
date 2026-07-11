// PATCH 026A.1/026A.2 — Wires real stage implementations into pipeline.mjs's
// injectable `invokeStage` signature.
//
// pipeline.mjs stays a pure, network-agnostic orchestrator (see its header)
// — it never imports a concrete stage implementation itself. This module is
// the adapter that plugs the real brief-interpreter/product-architect/
// art-director/design-system-generator modules into that injection point.
// Stages without a real implementation yet (components, assets, layout,
// scene, critique, repair) deliberately have NO fallback here — a caller
// trying to run one gets a loud, structured "stage_not_wired" error instead
// of a silent no-op, so it's obvious which 026A sub-patch still needs to
// land.

import { interpretBrief } from "./brief-interpreter.mjs";
import { planArchitecture } from "./product-architect.mjs";
import { directArt } from "./art-director.mjs";
import { generateDesignSystem } from "./design-system-generator.mjs";

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
