#!/usr/bin/env node
// =============================================================================
// PATCH 026A — Autonomous NOFIDA AI Product Designer — verification
// =============================================================================
// Section-based like verify-025a-scene-pipeline.mjs; each 026A sub-patch
// appends its own section. No live LLM provider or Penpot server needed —
// every stage/model call in these tests is either pure code or an injected
// fake (mirrors scene-compiler.mjs's injectable `newId` pattern).
//
// Usage: node scripts/verify-026a-autonomous-designer.mjs
// =============================================================================

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

function importFrom(relPath) {
  return import(pathToFileURL(path.join(REPO_ROOT, relPath)).href);
}

let failures = 0;
let passed = 0;

function ok(condition, label, detail) {
  if (condition) {
    passed += 1;
    console.log("  PASS  " + label);
  } else {
    failures += 1;
    console.log("  FAIL  " + label + (detail ? " — " + detail : ""));
  }
}

function section(title) {
  console.log("\n" + title);
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// =============================================================================
// SECTION 026A.0
// =============================================================================
console.log("PATCH 026A.0 — Autonomous Designer Foundation");

// ── Mirror sync gate ─────────────────────────────────────────────────────────
section("0.0 Frontend Scene Model mirror is byte-equivalent to canonical source");
{
  try {
    execFileSync("sh", [path.join(REPO_ROOT, "scripts/check-shared-scene-sync.sh")], { stdio: "pipe" });
    ok(true, "scripts/check-shared-scene-sync.sh passes");
  } catch (err) {
    ok(false, "scripts/check-shared-scene-sync.sh passes", (err.stdout || err.message || "").toString().trim());
  }
}

// ── 0.1 — Token-binding metadata survives the Scene Model pipeline ─────────
section("0.1 Token-binding metadata (tokens/semanticId/componentRole/themeVariant)");
{
  const { parseScene } = await importFrom("services/nofida-hub-adapter/ai/scene/scene-validator.mjs");
  const { canonicalizeScene } = await importFrom("services/nofida-hub-adapter/ai/scene/scene-canonicalizer.mjs");
  const { normalizeScene } = await importFrom("services/nofida-hub-adapter/ai/scene/scene-normalizer.mjs");
  const { compileScene } = await importFrom("services/nofida-hub-adapter/ai/scene/scene-compiler.mjs");

  function pipeline(raw, previousScene) {
    const parsed = parseScene(JSON.stringify(raw));
    if (!parsed.ok) return { parsed };
    const canonical = canonicalizeScene(parsed.scene, { previousScene });
    const normalized = normalizeScene(canonical);
    return { parsed, canonical, normalized };
  }

  function findByName(node, name) {
    if (node.name === name) return node;
    for (const child of node.children || []) {
      const found = findByName(child, name);
      if (found) return found;
    }
    return null;
  }

  // Simple case: metadata on a leaf-ish node with no demotion involved.
  const simpleFixture = {
    name: "Screen", width: 360, height: 800,
    children: [
      { type: "card", name: "Prediction card", x: 20, y: 40, width: 320, height: 160, fill: "#131E35", borderRadius: 16,
        tokens: { fillToken: "background.surface", radiusToken: "radius.card" },
        semanticId: "home-day/prediction-card",
        componentRole: "PredictionCard",
        themeVariant: "light",
        devMeta: { generator: "test" },
        children: [{ type: "text", name: "Title", x: 40, y: 60, width: 280, height: 24, content: "Tonight" }],
      },
    ],
  };
  const { parsed: simpleParsed, normalized: simpleNormalized } = pipeline(simpleFixture);
  ok(simpleParsed.ok, "simple fixture validates clean", simpleParsed.error);
  const card = findByName(simpleNormalized.scene, "Prediction card");
  ok(!!card, "card node survives normalization");
  ok(card && deepEqual(card.tokens, { fillToken: "background.surface", radiusToken: "radius.card" }), "tokens preserved through canonicalize+normalize", card && JSON.stringify(card.tokens));
  ok(card && card.semanticId === "home-day/prediction-card", "semanticId preserved");
  ok(card && card.componentRole === "PredictionCard", "componentRole preserved");
  ok(card && card.themeVariant === "light", "themeVariant preserved");
  ok(card && deepEqual(card.devMeta, { generator: "test" }), "devMeta preserved");

  let idc = 0;
  const compiled = compileScene(simpleNormalized.scene, { pageId: "page-1", newId: () => `m-${idc++}` });
  ok(compiled.ok === true, "compiles ok", compiled.error);
  const cardNid = card.nid;
  const cardFields = compiled.snapshot[cardNid];
  ok(!!cardFields, "compiled snapshot has an entry for the card node");
  ok(cardFields && deepEqual(cardFields["nofida-meta"], {
    tokens: { fillToken: "background.surface", radiusToken: "radius.card" },
    "semantic-id": "home-day/prediction-card",
    "component-role": "PredictionCard",
    "theme-variant": "light",
    "dev-meta": { generator: "test" },
  }), "compiler copies metadata into fields['nofida-meta'] untouched (no resolution)", cardFields && JSON.stringify(cardFields["nofida-meta"]));

  // Frame-demotion case: metadata on a node past MAX_FRAME_DEPTH(3) survives
  // demotion (frame -> group), same fixture shape as the 025A blank-canvas
  // repro (root -> Background -> Day -> Phase ring card -> Ring outer).
  const deepFixture = {
    name: "Day+Night", width: 360, height: 800, fill: "#0B1020",
    children: [
      { type: "board", name: "Background", x: 0, y: 0, width: 360, height: 800, fill: "#1a1a2e",
        children: [
          { type: "board", name: "Day", x: 0, y: 0, width: 360, height: 400, fill: "#f4f4f5",
            children: [
              { type: "board", name: "Phase ring card", x: 20, y: 40, width: 320, height: 300, fill: "#181622", borderRadius: 20,
                tokens: { fillToken: "surface.card", radiusToken: "radius.card" },
                semanticId: "home-day/phase-ring-card",
                componentRole: "PredictionCard",
                themeVariant: "light",
                children: [
                  { type: "board", name: "Ring outer", x: 40, y: 60, width: 280, height: 280, fill: "#f5efe6", borderRadius: 140,
                    children: [{ type: "text", name: "label", x: 60, y: 80, width: 200, height: 20, content: "Phase" }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  const { parsed: deepParsed, canonical: deepCanonical, normalized: deepNormalized } = pipeline(deepFixture);
  ok(deepParsed.ok, "deep fixture validates clean", deepParsed.error);
  ok(deepNormalized.report.demotedCount > 0 || deepNormalized.report.flattenedCount > 0, "normalizer demotes/flattens something (depth budget exceeded)", JSON.stringify(deepNormalized.report));

  const phaseRingCardCanonical = findByName(deepCanonical, "Phase ring card");
  const phaseRingCardNormalized = findByName(deepNormalized.scene, "Phase ring card");
  ok(!!phaseRingCardNormalized, "node past the depth budget survives normalization (demoted or not)");
  ok(phaseRingCardNormalized && deepEqual(phaseRingCardNormalized.tokens, { fillToken: "surface.card", radiusToken: "radius.card" }), "tokens survive frame demotion", phaseRingCardNormalized && JSON.stringify(phaseRingCardNormalized.tokens));
  ok(phaseRingCardNormalized && phaseRingCardNormalized.semanticId === "home-day/phase-ring-card", "semanticId survives frame demotion");
  ok(phaseRingCardNormalized && phaseRingCardNormalized.nid === phaseRingCardCanonical.nid, "demotion does not change the node's stable nid");

  let idc2 = 0;
  const deepCompiled = compileScene(deepNormalized.scene, { pageId: "page-1", newId: () => `d-${idc2++}` });
  ok(deepCompiled.ok === true, "deep fixture compiles ok despite demotion", deepCompiled.error);
  const deepFields = deepCompiled.snapshot[phaseRingCardNormalized.nid];
  ok(deepFields && !!deepFields["nofida-meta"], "compiled output for the demoted node still carries nofida-meta");
  ok(deepFields && deepFields["nofida-meta"]["semantic-id"] === "home-day/phase-ring-card", "compiled nofida-meta.semantic-id intact after demotion");

  // Negative case: unrecognized token category is rejected, not silently dropped.
  const badTokenFixture = {
    name: "Screen", width: 360, height: 800,
    children: [{ type: "rectangle", name: "r", x: 0, y: 0, width: 100, height: 100, tokens: { bogusToken: "x" } }],
  };
  const badTokenResult = parseScene(JSON.stringify(badTokenFixture));
  ok(badTokenResult.ok === false, "unrecognized token category is rejected by the validator", badTokenResult.error);

  // semanticId feeds nid assignment: same semanticId -> same nid even with
  // no previousScene and a different tree path (026A.5 light/dark pairing
  // needs this to hold).
  const semA = { name: "S", width: 100, height: 100, children: [{ type: "rectangle", name: "a", x: 0, y: 0, width: 10, height: 10, semanticId: "shared-id" }] };
  const semB = { name: "S", width: 100, height: 100, children: [{ type: "text", name: "wrapper", x: 0, y: 0, width: 50, height: 50, content: "x" }, { type: "rectangle", name: "b", x: 0, y: 0, width: 10, height: 10, semanticId: "shared-id" }] };
  const canonA = canonicalizeScene(parseScene(JSON.stringify(semA)).scene, {});
  const canonB = canonicalizeScene(parseScene(JSON.stringify(semB)).scene, {});
  ok(canonA.children[0].nid === canonB.children[1].nid, "same semanticId yields the same nid regardless of tree path", `${canonA.children[0].nid} vs ${canonB.children[1].nid}`);
}

// ── 0.2 — Feature flags default off ─────────────────────────────────────────
section("0.2 Feature flags default off");
{
  delete process.env.NOFIDA_AI_AUTONOMOUS_DESIGNER_V1;
  delete process.env.NOFIDA_AI_VISUAL_CRITIC_V1;
  delete process.env.NOFIDA_AI_HANDOFF_V1;
  const { getDesignerFeatureFlags } = await importFrom("services/nofida-hub-adapter/ai/designer/feature-flags.mjs");
  const flags = getDesignerFeatureFlags();
  ok(flags.autonomousDesignerV1 === false, "nofida_ai_autonomous_designer_v1 defaults off");
  ok(flags.visualCriticV1 === false, "nofida_ai_visual_critic_v1 defaults off");
  ok(flags.handoffV1 === false, "nofida_ai_handoff_v1 defaults off");

  process.env.NOFIDA_AI_AUTONOMOUS_DESIGNER_V1 = "1";
  ok(getDesignerFeatureFlags().autonomousDesignerV1 === true, "flag reads true when env var is set");
  delete process.env.NOFIDA_AI_AUTONOMOUS_DESIGNER_V1;
}

// ── 0.3 — Prompt registry: 11 designer tasks + intent-router gating ────────
section("0.3 Prompt registry (11 designer tasks) + intent-router flag gate");
{
  const { getPromptDefinition, DESIGNER_TASK_TYPES, TASK_TYPES } = await importFrom("services/nofida-hub-adapter/ai/prompt-registry.mjs");
  const { routeTask } = await importFrom("services/nofida-hub-adapter/ai/intent-router.mjs");

  ok(DESIGNER_TASK_TYPES.size === 11, "DESIGNER_TASK_TYPES has exactly 11 entries", DESIGNER_TASK_TYPES.size);
  for (const taskType of DESIGNER_TASK_TYPES) {
    ok(TASK_TYPES.has(taskType), `TASK_TYPES includes "${taskType}"`);
    const def = getPromptDefinition(taskType);
    ok(def.taskType === taskType, `registry returns the exact definition for "${taskType}" (not a free_chat fallback)`, def.taskType);
    ok(def.role === "default", `"${taskType}" uses the "default" model role (no per-task setup required)`, def.role);
    ok(def.safety?.previewOnly === true && def.safety?.allowCanvasMutation === false, `"${taskType}" safety is previewOnly/no-canvas-mutation`, JSON.stringify(def.safety));
    ok(typeof def.buildSystemPrompt === "function" && def.buildSystemPrompt().includes("STUB"), `"${taskType}" has a clearly-marked stub prompt`);
  }

  // Unreachable while the flag is off.
  let threwWhenOff = false;
  try {
    routeTask({ taskType: "designer_brief_interpreter", userPrompt: "", context: null, flags: { autonomousDesignerV1: false } });
  } catch (err) {
    threwWhenOff = err.code === "designer_disabled";
  }
  ok(threwWhenOff, "designer_* task is refused when nofida_ai_autonomous_designer_v1 is off");

  let threwWhenMissing = false;
  try {
    routeTask({ taskType: "designer_scene_builder", userPrompt: "", context: null });
  } catch (err) {
    threwWhenMissing = err.code === "designer_disabled";
  }
  ok(threwWhenMissing, "designer_* task is refused when flags are omitted entirely (fail closed)");

  // Reachable once the flag is on.
  const routed = routeTask({ taskType: "designer_brief_interpreter", userPrompt: "build a fitness app", context: null, flags: { autonomousDesignerV1: true } });
  ok(routed.taskType === "designer_brief_interpreter", "designer_* task routes normally once the flag is on");

  // Never reachable through free-text classification, flag or no flag.
  const freeTextRouted = routeTask({ userPrompt: "build a fitness app", context: null, flags: { autonomousDesignerV1: true } });
  ok(!DESIGNER_TASK_TYPES.has(freeTextRouted.taskType), "free-text classification never lands on a designer_* task", freeTextRouted.taskType);
}

// ── 0.5 — Inter-stage contracts ──────────────────────────────────────────────
section("0.5 Inter-stage contracts (good fixtures pass, one bad fixture per contract fails)");
{
  const { validateContract, CONTRACT_NAMES } = await importFrom("services/nofida-hub-adapter/ai/designer/contracts.mjs");
  ok(CONTRACT_NAMES.length === 8, "8 contracts registered", CONTRACT_NAMES.length);

  const goodFixtures = {
    ProductBrief: {
      productType: "mobile app", domain: "fitness", targetUsers: ["beginners"],
      primaryJob: "track workouts", requiredScreens: ["home", "profile"],
      requiredFeatures: ["workout logging"], contentPriorities: ["today's workout"],
      platform: { type: "mobile", width: 360, height: 800, safeArea: { top: 44, bottom: 34 } },
      confidence: 0.8,
    },
    ProductArchitecture: {
      flows: ["onboarding"],
      screens: [{ id: "home", purpose: "daily overview", primaryAction: "start workout", sections: ["hero", "list"] }],
    },
    ArtDirection: {
      direction: "energetic", keywords: ["bold", "clean"], density: "comfortable",
      contrast: "high", cornerStyle: "rounded", surfaceStyle: "flat",
      imageStrategy: "photography", themeStrategy: "dark",
    },
    DesignSystemManifest: {
      name: "Nofida Fit", themes: { light: {}, dark: {} },
      tokens: { color: {}, typography: {} }, semanticTokens: {}, componentDefaults: {}, accessibility: {},
    },
    ComponentDefinition: { id: "btn-primary", name: "Primary Button", role: "button" },
    AssetResolution: {
      assets: [{ role: "hero-image", source: "media:123", editable: true, license: "CC0", sceneNodes: ["n_1"] }],
    },
    SemanticLayout: { type: "stack", direction: "column", gapToken: "spacing.12", children: [{ type: "grid" }] },
    CritiqueReport: {
      score: 82, issues: [{ severity: "warning", nodeId: "n_1", category: "contrast", message: "low contrast" }], approved: false,
    },
  };

  const badFixtures = {
    ProductBrief: { ...goodFixtures.ProductBrief, productType: undefined },
    ProductArchitecture: { flows: ["onboarding"], screens: [{ id: "home", purpose: "daily overview", sections: ["hero"] }] },
    ArtDirection: { ...goodFixtures.ArtDirection, density: "medium" },
    DesignSystemManifest: { ...goodFixtures.DesignSystemManifest, themes: undefined },
    ComponentDefinition: { id: "btn-primary", name: "Primary Button" },
    AssetResolution: { assets: [{ role: "hero-image", source: "media:123", editable: true, sceneNodes: ["n_1"] }] },
    SemanticLayout: { ...goodFixtures.SemanticLayout, type: "flow" },
    CritiqueReport: { score: 82, issues: [{ severity: "critical", nodeId: "n_1", category: "contrast", message: "low contrast" }], approved: false },
  };

  for (const name of CONTRACT_NAMES) {
    const good = validateContract(name, goodFixtures[name]);
    ok(good.ok === true, `${name}: good fixture validates`, good.errors.join("; "));
    const bad = validateContract(name, badFixtures[name]);
    ok(bad.ok === false, `${name}: broken fixture is rejected`, JSON.stringify(badFixtures[name]));
  }

  // Unknown top-level fields are always rejected, path-qualified.
  const withExtra = { ...goodFixtures.ProductBrief, unexpectedField: true };
  const extraResult = validateContract("ProductBrief", withExtra);
  ok(extraResult.ok === false && extraResult.errors.some((e) => e.includes("unexpectedField")), "unknown top-level field is rejected with a path-qualified message", JSON.stringify(extraResult.errors));
}

// ── 0.4 — Pipeline orchestrator + session cache ─────────────────────────────
section("0.4 Pipeline orchestrator: sequential stages, contract gating, session cache");
{
  const { STAGE_ORDER, runPipeline, runPipelineStage } = await importFrom("services/nofida-hub-adapter/ai/designer/pipeline.mjs");

  ok(STAGE_ORDER.length === 10, "STAGE_ORDER has 10 stages (11th designer task, handoff, is not a pipeline stage)", STAGE_ORDER.length);
  ok(STAGE_ORDER.filter((s) => !s.implemented).map((s) => s.stage).join(",") === "critique,repair", "only critique/repair are marked not-implemented in this sub-patch");

  const canned = {
    brief: { productType: "mobile app", domain: "fitness", targetUsers: ["beginners"], primaryJob: "track workouts", requiredScreens: ["home"], requiredFeatures: ["logging"], contentPriorities: ["today"], platform: { type: "mobile", width: 360, height: 800 }, confidence: 0.9 },
    product_architecture: { flows: ["onboarding"], screens: [{ id: "home", purpose: "overview", primaryAction: "start", sections: ["hero"] }] },
    art_direction: { direction: "energetic", keywords: ["bold"], density: "comfortable", contrast: "high", cornerStyle: "rounded", surfaceStyle: "flat", imageStrategy: "photography", themeStrategy: "dark" },
    design_system: { name: "Fit", themes: { light: {}, dark: {} }, tokens: {}, semanticTokens: {}, componentDefaults: {}, accessibility: {} },
    components: [{ id: "btn", name: "Button", role: "button" }],
    assets: { assets: [] },
    layout: { type: "stack", children: [] },
    scene: { name: "Home", width: 360, height: 800, children: [] },
  };

  let invokeCount = 0;
  const calledStages = [];
  async function invokeStage(stageDef) {
    invokeCount += 1;
    calledStages.push(stageDef.stage);
    return JSON.stringify(canned[stageDef.stage]);
  }

  const session = { stageArtifacts: {} };
  const persisted = [];
  const run1 = await runPipeline({ session, invokeStage, persistStageResult: async (stage, output) => persisted.push({ stage, output }) });
  ok(run1.ok === true, "full pipeline run succeeds with contract-valid canned stage outputs", JSON.stringify(run1.error));
  ok(run1.results.length === 10, "pipeline produces one result per stage, including not-implemented ones", run1.results.length);
  ok(run1.results.filter((r) => r.status === "ok").length === 8, "8 implemented stages report status 'ok'");
  ok(run1.results.filter((r) => r.status === "not_implemented").length === 2, "critique/repair report status 'not_implemented'");
  ok(run1.results.find((r) => r.stage === "critique").marker.includes("not implemented"), "not-implemented stages carry an explicit marker");
  ok(persisted.length === 8, "persistStageResult is called once per successfully-validated stage", persisted.length);
  ok(invokeCount === 8, "invokeStage is called exactly once per implemented stage on a cold run", invokeCount);

  // Re-running the same session must resume from cache, not re-invoke.
  invokeCount = 0;
  calledStages.length = 0;
  const cachedResult = await runPipelineStage(STAGE_ORDER[0], { session, invokeStage });
  ok(cachedResult.status === "cached", "rerunning a completed stage against the same session returns 'cached'");
  ok(invokeCount === 0, "cached stage does not call invokeStage again");

  // Contract violation aborts with the uniform structured error and stops
  // before the failing stage's result is appended.
  async function invokeBadArtDirection(stageDef) {
    if (stageDef.stage === "art_direction") return JSON.stringify({ direction: "energetic" }); // missing required fields
    return JSON.stringify(canned[stageDef.stage]);
  }
  const session2 = { stageArtifacts: {} };
  const run2 = await runPipeline({ session: session2, invokeStage: invokeBadArtDirection });
  ok(run2.ok === false, "pipeline aborts on a contract violation");
  ok(run2.error && run2.error.stage === "art_direction" && run2.error.code === "contract_violation" && run2.error.recoverable === true, "abort error has the uniform {stage, code, message, recoverable} shape", JSON.stringify(run2.error));
  ok(run2.results.length === 2, "results include only the stages that completed before the abort (brief, product_architecture)", run2.results.length);

  // Invalid JSON from a stage is also a structured, recoverable abort.
  async function invokeInvalidJson(stageDef) {
    if (stageDef.stage === "brief") return "not json";
    return JSON.stringify(canned[stageDef.stage]);
  }
  const session3 = { stageArtifacts: {} };
  const run3 = await runPipeline({ session: session3, invokeStage: invokeInvalidJson });
  ok(run3.ok === false && run3.error.code === "invalid_json" && run3.error.stage === "brief", "non-JSON stage output aborts with code 'invalid_json'", JSON.stringify(run3.error));
}

// ── 0.4b — Designer session store (file-backed persistence) ────────────────
section("0.4b Designer session store persists stage artifacts across calls");
{
  const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "nofida-026a-sessions-"));
  process.env.NOFIDA_AI_DESIGNER_SESSIONS_DIR = scratchDir;
  const { createSession, getSession, saveStageArtifact, listSessions } = await importFrom("services/nofida-hub-adapter/ai/designer/session-store.mjs");

  const profileId = crypto.randomUUID();
  const session = await createSession(profileId, { userPrompt: "build a fitness app" });
  ok(!!session.id, "createSession returns a session with an id");
  ok(session.status === "in_progress", "new session starts in_progress");

  await saveStageArtifact(profileId, session.id, "brief", { productType: "mobile app" });
  const reloaded = await getSession(profileId, session.id);
  ok(reloaded && reloaded.stageArtifacts.brief.status === "ok", "saved stage artifact is readable back");
  ok(reloaded && deepEqual(reloaded.stageArtifacts.brief.output, { productType: "mobile app" }), "saved stage artifact output round-trips exactly");

  const listed = await listSessions(profileId);
  ok(listed.length === 1 && listed[0].completedStages.includes("brief"), "listSessions surfaces the completed stage");

  fs.rmSync(scratchDir, { recursive: true, force: true });
  delete process.env.NOFIDA_AI_DESIGNER_SESSIONS_DIR;
}

console.log(`\n${passed} passed, ${failures} failed`);

// ── Regression: PATCH 025A pipeline must still be intact ───────────────────
section("Regression — PATCH 025A scene pipeline");
let regressionOk = true;
try {
  execFileSync(process.execPath, [path.join(REPO_ROOT, "scripts/verify-025a-scene-pipeline.mjs")], { stdio: "inherit" });
} catch (_err) {
  regressionOk = false;
}
console.log(regressionOk ? "  PASS  verify-025a-scene-pipeline.mjs" : "  FAIL  verify-025a-scene-pipeline.mjs");

const overallOk = failures === 0 && regressionOk;
console.log(overallOk ? "\nPATCH 026A.0 — ALL GREEN." : "\nPATCH 026A.0 — FAILURES ABOVE.");
process.exit(overallOk ? 0 : 1);
