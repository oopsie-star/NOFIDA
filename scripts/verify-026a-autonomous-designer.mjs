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

  // PATCH 026A.1/026A.2/026A.3 implement six of the eleven prompts for
  // real; the rest stay 026A.0 stubs until their own sub-patch lands.
  const IMPLEMENTED_TASK_TYPES = new Set([
    "designer_brief_interpreter", "designer_product_architect",
    "designer_art_director", "designer_system_generator",
    "designer_component_architect", "designer_asset_resolver",
  ]);

  ok(DESIGNER_TASK_TYPES.size === 11, "DESIGNER_TASK_TYPES has exactly 11 entries", DESIGNER_TASK_TYPES.size);
  for (const taskType of DESIGNER_TASK_TYPES) {
    ok(TASK_TYPES.has(taskType), `TASK_TYPES includes "${taskType}"`);
    const def = getPromptDefinition(taskType);
    ok(def.taskType === taskType, `registry returns the exact definition for "${taskType}" (not a free_chat fallback)`, def.taskType);
    ok(def.role === "default", `"${taskType}" uses the "default" model role (no per-task setup required)`, def.role);
    ok(def.safety?.previewOnly === true && def.safety?.allowCanvasMutation === false, `"${taskType}" safety is previewOnly/no-canvas-mutation`, JSON.stringify(def.safety));
    const prompt = typeof def.buildSystemPrompt === "function" ? def.buildSystemPrompt() : "";
    if (IMPLEMENTED_TASK_TYPES.has(taskType)) {
      ok(typeof prompt === "string" && prompt.length > 200 && !prompt.includes("STUB"), `"${taskType}" has a real, implemented prompt (026A.1)`);
    } else {
      ok(prompt.includes("STUB"), `"${taskType}" has a clearly-marked stub prompt`);
    }
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

// =============================================================================
// SECTION 026A.1 — Product Reasoning: Brief Interpreter + Product/UX Architect
// =============================================================================
console.log("\nPATCH 026A.1 — Product Reasoning");

// Fixture acceptance request (Russian) — per PATCH 026A.1, none of the
// expected section-name literals below may appear verbatim in the system
// prompts that produce them; only generic design vocabulary is allowed
// there. These fixture artifacts are RECORDED (hand-authored to represent a
// plausible, contract-valid, well-decomposed LLM answer), not generated by
// a live call — they exercise the validation/section-inference machinery
// deterministically. A live run (gated behind NOFIDA_AI_VERIFY_LIVE=1) is
// the only path that actually exercises the prompts end-to-end.
const CYCLE_APP_REQUEST = "Создай главный экран мобильного приложения для отслеживания женского цикла. Нужны светлая и тёмная версии, прогноз следующей менструации, недельный календарь, сводка цикла и подробный календарь месяца.";

const RECORDED_CYCLE_BRIEF = {
  productType: "mobile_app",
  domain: "women_health",
  targetUsers: ["people tracking their menstrual cycle", "users who want proactive next-period predictions"],
  primaryJob: "check where they are in their cycle and see the predicted date of their next period",
  requiredScreens: ["cycle-home"],
  requiredFeatures: ["next-period prediction", "weekly calendar view", "cycle summary", "monthly calendar view", "light/dark theme presentation"],
  contentPriorities: ["predicted next period date", "current cycle day/status", "week-at-a-glance calendar", "month-at-a-glance calendar"],
  constraints: ["health data is personal and sensitive", "must work in both a light and a dark presentation"],
  platform: { type: "mobile", width: 393, height: 852, safeArea: { top: 47, right: 0, bottom: 34, left: 0 } },
  assumptions: ["visual treatment of the light/dark variants is left to the art-direction stage", "exact prediction algorithm/confidence display is left to later content decisions"],
  confidence: 0.82,
};

const CYCLE_SCREEN_TEMPLATE = {
  purpose: "Give the user an at-a-glance view of their current cycle status and next period prediction.",
  primaryAction: "log or confirm today's period status",
  secondaryActions: ["switch presentation", "open the detailed monthly calendar", "open the weekly calendar"],
  sections: [
    "date and greeting header",
    "week-at-a-glance calendar strip",
    "next period prediction summary",
    "primary period logging action",
    "pregnancy probability / fertile-window status",
    "navigation between day, week, and month views",
    "current cycle summary",
    "expandable monthly calendar",
  ],
  states: ["default", "loading", "empty (no cycle history yet)", "error (prediction unavailable)", "offline"],
  contentRequirements: ["current cycle day number", "predicted next period date range", "fertile-window/pregnancy-probability indicator", "week strip with logged/predicted days marked", "month grid with logged/predicted days marked"],
};

const RECORDED_CYCLE_ARCHITECTURE = {
  flows: ["view-cycle-overview", "switch-day-night-presentation"],
  screens: [
    { id: "cycle-home-day", ...CYCLE_SCREEN_TEMPLATE },
    { id: "cycle-home-night", ...CYCLE_SCREEN_TEMPLATE },
  ],
};

const SECTION_CONCEPTS = [
  { name: "date/header", patterns: [/date.{0,30}header/i, /header.{0,30}date/i] },
  { name: "week calendar", patterns: [/week.{0,20}(calendar|strip|glance)/i] },
  { name: "prediction summary", patterns: [/predict\w*.{0,20}summary/i, /summary.{0,20}predict/i] },
  { name: "primary period action", patterns: [/period.{0,20}(action|log)/i] },
  { name: "pregnancy probability/status", patterns: [/pregnan\w*.{0,20}(probab|status)/i, /fertil\w*.{0,20}(status|window)/i] },
  { name: "section navigation", patterns: [/navigat\w*.{0,30}(day|week|month|view|section)/i] },
  { name: "cycle summary", patterns: [/cycle.{0,20}summary/i] },
  { name: "monthly calendar", patterns: [/month\w*.{0,20}(calendar|grid)/i] },
];

function architectureText(architecture) {
  const parts = [];
  for (const screen of architecture.screens || []) {
    parts.push(screen.purpose || "", screen.primaryAction || "");
    parts.push(...(screen.sections || []), ...(screen.contentRequirements || []), ...(screen.secondaryActions || []));
  }
  return parts.join(" | ").toLowerCase();
}

function checkSectionsInferred(architecture) {
  const text = architectureText(architecture);
  return SECTION_CONCEPTS.map((c) => ({ name: c.name, matched: c.patterns.some((p) => p.test(text)) }));
}

// Literal phrases that must NEVER appear verbatim in the system prompts —
// if they did, the fixture's expected answer would be "prompted", not
// "inferred", defeating the point of this acceptance test.
const BANNED_LITERAL_PHRASES = [
  "week calendar", "prediction summary", "period action", "pregnancy probability",
  "section navigation", "cycle summary", "monthly calendar", "date header",
];

function makeFakeAiSettingsService({ answers }) {
  const queue = Array.isArray(answers) ? answers.slice() : null;
  let callCount = 0;
  return {
    callCount: () => callCount,
    async resolveModelForRole(role) {
      return { providerId: "fake", providerLabel: "Fake", modelId: "fake-model", role, source: "test" };
    },
    async callWithResolvedModel({ resolved, message, systemPrompt }) {
      callCount += 1;
      const answer = queue ? queue.shift() : answers({ message, systemPrompt, callIndex: callCount });
      return { answer, providerId: resolved.providerId, providerLabel: resolved.providerLabel, modelId: resolved.modelId };
    },
  };
}

const LIVE = process.env.NOFIDA_AI_VERIFY_LIVE === "1";

// ── 1.1 Contracts + section inference on the recorded fixture ──────────────
section("1.1 Fixture artifacts are contract-valid and cover the inferred sections");
{
  const { validateContract } = await importFrom("services/nofida-hub-adapter/ai/designer/contracts.mjs");

  const briefResult = validateContract("ProductBrief", RECORDED_CYCLE_BRIEF);
  ok(briefResult.ok === true, "recorded brief fixture validates against ProductBrief", briefResult.errors.join("; "));
  ok(RECORDED_CYCLE_BRIEF.productType === "mobile_app", "brief fixture infers productType=mobile_app");
  ok(/women|menstrual|cycle/i.test(RECORDED_CYCLE_BRIEF.domain), "brief fixture infers a women's-health-ish domain", RECORDED_CYCLE_BRIEF.domain);
  ok(RECORDED_CYCLE_BRIEF.platform.type === "mobile" && RECORDED_CYCLE_BRIEF.platform.width === 393 && RECORDED_CYCLE_BRIEF.platform.height === 852 && !!RECORDED_CYCLE_BRIEF.platform.safeArea, "brief fixture infers a mobile platform with a safe area", JSON.stringify(RECORDED_CYCLE_BRIEF.platform));
  ok(/light.*dark|dark.*light/i.test(JSON.stringify(RECORDED_CYCLE_BRIEF)), "brief fixture captures the light+dark requirement somewhere in its fields");

  const archResult = validateContract("ProductArchitecture", RECORDED_CYCLE_ARCHITECTURE);
  ok(archResult.ok === true, "recorded architecture fixture validates against ProductArchitecture", archResult.errors.join("; "));
  ok(RECORDED_CYCLE_ARCHITECTURE.screens.length >= 2, "architecture fixture gives the light/dark variants distinct screen entries", RECORDED_CYCLE_ARCHITECTURE.screens.length);

  const inferred = checkSectionsInferred(RECORDED_CYCLE_ARCHITECTURE);
  for (const concept of inferred) {
    ok(concept.matched, `architecture fixture covers the "${concept.name}" concept`);
  }
}

// ── 1.2 No prompt literal leakage ────────────────────────────────────────────
section("1.2 System prompts do not leak the fixture's expected section names verbatim");
{
  const { getPromptDefinition } = await importFrom("services/nofida-hub-adapter/ai/prompt-registry.mjs");
  const briefPrompt = getPromptDefinition("designer_brief_interpreter").buildSystemPrompt();
  const architectPrompt = getPromptDefinition("designer_product_architect").buildSystemPrompt();

  ok(!briefPrompt.includes("STUB"), "designer_brief_interpreter has a real prompt, not the 026A.0 stub");
  ok(!architectPrompt.includes("STUB"), "designer_product_architect has a real prompt, not the 026A.0 stub");

  for (const [label, text] of [["designer_brief_interpreter", briefPrompt], ["designer_product_architect", architectPrompt]]) {
    const lower = text.toLowerCase();
    const leaked = BANNED_LITERAL_PHRASES.filter((phrase) => lower.includes(phrase));
    ok(leaked.length === 0, `${label} prompt contains no fixture-specific section-name literals`, JSON.stringify(leaked));
  }
}

// ── 1.3 Brief interpreter: contract validation + retry + clarification ─────
section("1.3 Brief interpreter: contract validation, retry-on-invalid, needsClarification");
{
  const { interpretBrief } = await importFrom("services/nofida-hub-adapter/ai/designer/brief-interpreter.mjs");

  // Happy path — valid JSON on the first attempt.
  const happyService = makeFakeAiSettingsService({ answers: [JSON.stringify(RECORDED_CYCLE_BRIEF)] });
  const happyResult = await interpretBrief({ request: CYCLE_APP_REQUEST }, { aiSettingsService: happyService });
  ok(happyResult.ok === true && happyService.callCount() === 1, "valid first-attempt JSON is accepted without a retry", JSON.stringify(happyResult.error));

  // Retry-on-invalid path — broken JSON once, then a valid brief.
  const retryService = makeFakeAiSettingsService({ answers: ["this is not json at all", JSON.stringify(RECORDED_CYCLE_BRIEF)] });
  const retryResult = await interpretBrief({ request: CYCLE_APP_REQUEST }, { aiSettingsService: retryService });
  ok(retryResult.ok === true, "interpretBrief recovers after one invalid-JSON attempt", JSON.stringify(retryResult));
  ok(retryService.callCount() === 2, "exactly one retry was made (2 total calls)", retryService.callCount());

  // Exhausted retries — invalid JSON on both attempts fails structurally.
  const failService = makeFakeAiSettingsService({ answers: ["not json", "still not json"] });
  const failResult = await interpretBrief({ request: CYCLE_APP_REQUEST }, { aiSettingsService: failService });
  ok(failResult.ok === false && failResult.error?.code === "contract_violation", "exhausting the retry budget fails structurally, not silently", JSON.stringify(failResult));
  ok(failService.callCount() === 2, "exactly MAX_RETRIES+1 attempts were made before giving up", failService.callCount());

  // Structured clarification path — well-formed refusal, not a schema violation.
  const clarifyAnswer = JSON.stringify({ needsClarification: { question: "What kind of product is this for?", reason: "the request names no product, domain, or user" } });
  const clarifyService = makeFakeAiSettingsService({ answers: [clarifyAnswer] });
  const clarifyResult = await interpretBrief({ request: "make something" }, { aiSettingsService: clarifyService });
  ok(clarifyResult.ok === false && !!clarifyResult.needsClarification?.question, "a fundamentally ambiguous request returns a structured needsClarification, not a contract violation", JSON.stringify(clarifyResult));
  ok(clarifyService.callCount() === 1, "needsClarification is accepted on the first attempt (no retry needed for a well-formed refusal)", clarifyService.callCount());
}

// ── 1.4 Product architect: contract validation + retry ─────────────────────
section("1.4 Product/UX architect: contract validation + retry-on-invalid");
{
  const { planArchitecture } = await importFrom("services/nofida-hub-adapter/ai/designer/product-architect.mjs");

  const happyService = makeFakeAiSettingsService({ answers: [JSON.stringify(RECORDED_CYCLE_ARCHITECTURE)] });
  const happyResult = await planArchitecture(RECORDED_CYCLE_BRIEF, { aiSettingsService: happyService });
  ok(happyResult.ok === true && happyService.callCount() === 1, "valid first-attempt architecture is accepted without a retry", JSON.stringify(happyResult.error));

  const retryService = makeFakeAiSettingsService({ answers: ['{"flows": ["x"]}', JSON.stringify(RECORDED_CYCLE_ARCHITECTURE)] });
  const retryResult = await planArchitecture(RECORDED_CYCLE_BRIEF, { aiSettingsService: retryService });
  ok(retryResult.ok === true && retryService.callCount() === 2, "product architect recovers after one contract-violating attempt", JSON.stringify(retryResult));
}

// ── 1.5 Orchestrator wiring: real stages replace stubs, cache holds ─────────
// Exercises brief/product_architecture in isolation via runPipelineStage()
// rather than a full runPipeline() run, so this test doesn't have to know
// how many LATER stages stage-invoker.mjs has wired up by the time a future
// sub-patch lands (026A.2 already extends it to art_direction/design_system
// — see section 2.8 below for the full-pipeline depth test).
section("1.5 Pipeline runs the real brief/product_architecture stages and caches them");
{
  const { runPipelineStage, STAGE_ORDER } = await importFrom("services/nofida-hub-adapter/ai/designer/pipeline.mjs");
  const { createDesignerInvokeStage } = await importFrom("services/nofida-hub-adapter/ai/designer/stage-invoker.mjs");

  const providerFake = makeFakeAiSettingsService({ answers: [JSON.stringify(RECORDED_CYCLE_BRIEF), JSON.stringify(RECORDED_CYCLE_ARCHITECTURE)] });
  const invokeStage = createDesignerInvokeStage({ aiSettingsService: providerFake, briefInput: { request: CYCLE_APP_REQUEST } });
  const session = { stageArtifacts: {} };

  const briefStage = await runPipelineStage(STAGE_ORDER[0], { session, invokeStage });
  ok(briefStage.status === "ok", "brief stage runs via the real module and reports 'ok'", JSON.stringify(briefStage));
  session.stageArtifacts.brief = { status: "ok", output: briefStage.output };

  const architectureStage = await runPipelineStage(STAGE_ORDER[1], { session, invokeStage });
  ok(architectureStage.status === "ok", "product_architecture stage runs via the real module and reports 'ok'", JSON.stringify(architectureStage));
  session.stageArtifacts.product_architecture = { status: "ok", output: architectureStage.output };

  ok(providerFake.callCount() === 2, "provider invoked exactly once per real stage on a cold run", providerFake.callCount());

  const cachedBrief = await runPipelineStage(STAGE_ORDER[0], { session, invokeStage });
  ok(cachedBrief.status === "cached", "brief stage individually reports 'cached' on rerun");
  const cachedArchitecture = await runPipelineStage(STAGE_ORDER[1], { session, invokeStage });
  ok(cachedArchitecture.status === "cached", "product_architecture stage individually reports 'cached' on rerun");
  ok(providerFake.callCount() === 2, "rerunning both cached stages makes no new provider call");
}

// ── Live run (optional, gated) ──────────────────────────────────────────────
section(`1.6 Live end-to-end run (${LIVE ? "ENABLED via NOFIDA_AI_VERIFY_LIVE=1" : "skipped — set NOFIDA_AI_VERIFY_LIVE=1 to enable"})`);
if (LIVE) {
  const { createAISettingsService } = await importFrom("services/nofida-hub-adapter/ai-service.mjs");
  const { interpretBrief } = await importFrom("services/nofida-hub-adapter/ai/designer/brief-interpreter.mjs");
  const { planArchitecture } = await importFrom("services/nofida-hub-adapter/ai/designer/product-architect.mjs");

  const liveService = createAISettingsService(() => {});
  const liveBrief = await interpretBrief({ request: CYCLE_APP_REQUEST }, { aiSettingsService: liveService });
  ok(liveBrief.ok === true, "live brief interpreter call produces a contract-valid ProductBrief", JSON.stringify(liveBrief.error || liveBrief.needsClarification));
  if (liveBrief.ok) {
    const liveArch = await planArchitecture(liveBrief.brief, { aiSettingsService: liveService });
    ok(liveArch.ok === true, "live product architect call produces a contract-valid ProductArchitecture", JSON.stringify(liveArch.error));
    if (liveArch.ok) {
      const liveInferred = checkSectionsInferred(liveArch.architecture);
      for (const concept of liveInferred) {
        ok(concept.matched, `LIVE architecture covers the "${concept.name}" concept without being prompted for it`);
      }
    }
  }
} else {
  console.log("  SKIP  live provider call (set NOFIDA_AI_VERIFY_LIVE=1 and configure a provider to enable)");
}

// =============================================================================
// SECTION 026A.2 — Visual Language: Art Director + Design System Generator
// =============================================================================
console.log("\nPATCH 026A.2 — Visual Language");

// ── Recorded fixtures (built on 026A.1's cycle-tracker brief/architecture) ──
const RECORDED_CYCLE_ART_DIRECTION = {
  direction: "calm-focused-cycle-care",
  keywords: ["gentle", "reassuring", "precise", "private"],
  density: "comfortable",
  contrast: "medium",
  cornerStyle: "rounded",
  surfaceStyle: "soft layered surfaces with a single restrained accent",
  imageStrategy: "abstract, non-figurative gradient/shape accents only — no photography of people",
  themeStrategy: "paired-light-dark, dark independently tuned for low-light/night checking",
  avoid: ["clinical hospital aesthetic", "alarming red-heavy status colors", "generic admin dashboard look", "stock photography of unrelated people"],
};
const RECORDED_CYCLE_ART_DIRECTION_RATIONALE = "A women's-health tracking app needs a calm, private, reassuring register rather than a clinical or playful one, so users feel comfortable checking sensitive data daily. Medium contrast and comfortable density keep the four required data views legible without feeling like a hospital chart. The dark theme gets its own tuning since low-light/night checking is a primary use case implied by the brief.";

// A hand-authored, contrast-verified, non-inverted manifest — see the git
// history / design-system-validators.mjs for how these hex values were
// chosen; every semantic hex below is deliberately one of the declared
// primitives, and the dark theme's values were tuned independently rather
// than derived from light by formula.
const RECORDED_CYCLE_MANIFEST = {
  name: "Cycle Care",
  themes: {
    light: { mood: "soft, airy, reassuring daylight surface" },
    dark: { mood: "calm, low-glare surface tuned for night checking" },
  },
  tokens: {
    color: {
      primitives: {
        neutral: {
          "0": "#FFFFFF", "50": "#F7F5FB", "100": "#EDE9F5", "300": "#C9C2DA",
          "500": "#8B8598", "600": "#726B82", "700": "#5B5468", "800": "#241D33", "900": "#1C1626", "950": "#14101B",
        },
        brand: { "300": "#B9A6FF", "500": "#7C4DFF", "700": "#5A2FD1" },
        success: { "300": "#4ADE9A", "500": "#1B8A5A" },
        warning: { "300": "#FFB84D", "500": "#A85D00" },
        danger: { "300": "#FF6B81", "500": "#C4314B" },
        information: { "300": "#7EA6FF", "500": "#2F6FED" },
      },
    },
    typography: {
      display: { family: "Inter", size: 32, weight: "800", lineHeight: 38, letterSpacing: -0.2 },
      pageTitle: { family: "Inter", size: 24, weight: "700", lineHeight: 30, letterSpacing: 0 },
      sectionTitle: { family: "Inter", size: 18, weight: "700", lineHeight: 24, letterSpacing: 0 },
      cardTitle: { family: "Inter", size: 16, weight: "600", lineHeight: 22, letterSpacing: 0 },
      body: { family: "Inter", size: 15, weight: "400", lineHeight: 22, letterSpacing: 0 },
      bodyCompact: { family: "Inter", size: 13, weight: "400", lineHeight: 18, letterSpacing: 0 },
      label: { family: "Inter", size: 13, weight: "600", lineHeight: 16, letterSpacing: 0.2 },
      caption: { family: "Inter", size: 12, weight: "400", lineHeight: 16, letterSpacing: 0 },
      button: { family: "Inter", size: 15, weight: "600", lineHeight: 20, letterSpacing: 0.1 },
      numericHighlight: { family: "Inter", size: 28, weight: "700", lineHeight: 32, letterSpacing: 0 },
    },
    spacing: { scale: [2, 4, 8, 12, 16, 20, 24, 32, 40, 48] },
    radius: { control: 12, card: 20, panel: 24, modal: 28, pill: 999, circle: 999 },
    shadow: {
      light: { card: { offsetY: 2, blur: 8, color: "#000000", opacity: 0.08 }, modal: { offsetY: 12, blur: 32, color: "#000000", opacity: 0.18 } },
      dark: { card: { offsetY: 2, blur: 8, color: "#000000", opacity: 0.4 }, modal: { offsetY: 12, blur: 32, color: "#000000", opacity: 0.55 } },
    },
    border: {
      light: { hairline: "#EDE9F5", strong: "#C9C2DA" },
      dark: { hairline: "#241D33", strong: "#5B5468" },
    },
  },
  semanticTokens: {
    light: {
      "background.canvas": "#F7F5FB", "background.surface": "#FFFFFF", "background.surfaceElevated": "#FFFFFF",
      "text.primary": "#1C1626", "text.secondary": "#5B5468", "text.muted": "#8B8598",
      "border.default": "#C9C2DA", "border.strong": "#8B8598",
      "action.primary": "#7C4DFF", "action.primaryText": "#FFFFFF",
      "state.selected": "#EDE9F5", "state.disabled": "#C9C2DA",
      "status.success": "#1B8A5A", "status.warning": "#A85D00", "status.danger": "#C4314B",
    },
    dark: {
      "background.canvas": "#14101B", "background.surface": "#1C1626", "background.surfaceElevated": "#241D33",
      "text.primary": "#FFFFFF", "text.secondary": "#C9C2DA", "text.muted": "#726B82",
      "border.default": "#5B5468", "border.strong": "#C9C2DA",
      "action.primary": "#B9A6FF", "action.primaryText": "#1C1626",
      "state.selected": "#241D33", "state.disabled": "#5B5468",
      "status.success": "#4ADE9A", "status.warning": "#FFB84D", "status.danger": "#FF6B81",
    },
  },
  componentDefaults: {
    button: { radius: "control", minHeight: 44 },
    input: { radius: "control", minHeight: 44 },
    card: { radius: "card" },
  },
  accessibility: {
    minContrastBody: 4.5,
    minContrastLargeText: 3,
    minControlSize: 44,
    focusRule: "every interactive control gets a 2px visible focus ring using action.primary, never removed",
    disabledRule: "disabled controls use state.disabled fill and text.muted label, never full-opacity text",
    colorIndependentStatusRule: "status colors are always paired with an icon or text label, never color alone",
  },
};

// ── 2.1 Fixtures are contract-valid and pass the deep validators ───────────
section("2.1 Recorded ArtDirection + DesignSystemManifest fixtures validate");
{
  const { validateContract } = await importFrom("services/nofida-hub-adapter/ai/designer/contracts.mjs");
  const { validateManifest, checkContrast, checkIntegrity, checkNotInvertedDark } =
    await importFrom("services/nofida-hub-adapter/ai/designer/design-system-validators.mjs");

  const artResult = validateContract("ArtDirection", RECORDED_CYCLE_ART_DIRECTION);
  ok(artResult.ok === true, "recorded ArtDirection fixture validates against the contract", artResult.errors.join("; "));

  const manifestContract = validateContract("DesignSystemManifest", RECORDED_CYCLE_MANIFEST);
  ok(manifestContract.ok === true, "recorded manifest passes the shallow DesignSystemManifest contract", manifestContract.errors.join("; "));

  const integrity = checkIntegrity(RECORDED_CYCLE_MANIFEST);
  ok(integrity.ok === true, "recorded manifest passes the integrity checker", integrity.errors.join("; "));

  const contrast = checkContrast(RECORDED_CYCLE_MANIFEST);
  ok(contrast.ok === true, "recorded manifest passes the contrast checker in both themes", contrast.errors.join("; "));

  const notInverted = checkNotInvertedDark(RECORDED_CYCLE_MANIFEST);
  ok(notInverted.ok === true, "recorded manifest's dark theme is not flagged as an inverted light theme", notInverted.errors.join("; "));

  const full = validateManifest(RECORDED_CYCLE_MANIFEST);
  ok(full.ok === true, "validateManifest() (contract + all deep checks combined) accepts the recorded manifest", full.errors.join("; "));
}

// ── 2.2 Contrast checker unit tests against known pass/fail color pairs ────
section("2.2 Contrast checker: known pass/fail color pairs + WCAG thresholds");
{
  const { contrastRatio, relativeLuminance } = await importFrom("services/nofida-hub-adapter/ai/designer/design-system-validators.mjs");

  ok(Math.abs(contrastRatio("#000000", "#FFFFFF") - 21) < 0.01, "black on white is the maximum 21:1 ratio", contrastRatio("#000000", "#FFFFFF"));
  ok(Math.abs(contrastRatio("#808080", "#808080") - 1) < 0.01, "identical colors have a 1:1 ratio (no contrast)", contrastRatio("#808080", "#808080"));
  ok(contrastRatio("#CCCCCC", "#FFFFFF") < 4.5, "light gray on white fails the 4.5:1 body-text threshold", contrastRatio("#CCCCCC", "#FFFFFF"));
  ok(contrastRatio("#1C1626", "#F7F5FB") >= 4.5, "the fixture's text.primary/background.canvas pair clears 4.5:1", contrastRatio("#1C1626", "#F7F5FB"));
  ok(relativeLuminance("#FFFFFF") === 1, "white has relative luminance 1");
  ok(relativeLuminance("#000000") === 0, "black has relative luminance 0");
  ok(contrastRatio("not-a-color", "#FFFFFF") === null, "an unparseable color returns null instead of throwing");
}

// ── 2.3 Integrity checker unit tests against broken manifests ──────────────
section("2.3 Integrity checker rejects a manifest missing a dark resolution or a typography style");
{
  const { checkIntegrity } = await importFrom("services/nofida-hub-adapter/ai/designer/design-system-validators.mjs");

  const missingDarkToken = JSON.parse(JSON.stringify(RECORDED_CYCLE_MANIFEST));
  delete missingDarkToken.semanticTokens.dark["text.secondary"];
  const missingDarkResult = checkIntegrity(missingDarkToken);
  ok(missingDarkResult.ok === false, "integrity checker rejects a manifest missing a dark theme token resolution", JSON.stringify(missingDarkResult.errors));
  ok(missingDarkResult.errors.some((e) => e.includes("text.secondary")), "the specific missing token is named in the error", JSON.stringify(missingDarkResult.errors));

  const unresolvedSemanticToken = JSON.parse(JSON.stringify(RECORDED_CYCLE_MANIFEST));
  unresolvedSemanticToken.semanticTokens.light["text.primary"] = "#123456"; // not a declared primitive
  const unresolvedResult = checkIntegrity(unresolvedSemanticToken);
  ok(unresolvedResult.ok === false, "integrity checker rejects a semantic token hex that isn't a declared primitive", JSON.stringify(unresolvedResult.errors));

  const missingTypographyStyle = JSON.parse(JSON.stringify(RECORDED_CYCLE_MANIFEST));
  delete missingTypographyStyle.tokens.typography.caption;
  const missingTypographyResult = checkIntegrity(missingTypographyStyle);
  ok(missingTypographyResult.ok === false, "integrity checker rejects a manifest missing a required typography style", JSON.stringify(missingTypographyResult.errors));
  ok(missingTypographyResult.errors.some((e) => e.includes("caption")), "the specific missing typography style is named in the error", JSON.stringify(missingTypographyResult.errors));

  const nonIncreasingSpacing = JSON.parse(JSON.stringify(RECORDED_CYCLE_MANIFEST));
  nonIncreasingSpacing.tokens.spacing.scale = [4, 8, 8, 16];
  const spacingResult = checkIntegrity(nonIncreasingSpacing);
  ok(spacingResult.ok === false, "integrity checker rejects a spacing scale that is not strictly increasing", JSON.stringify(spacingResult.errors));

  const incompleteAccessibility = JSON.parse(JSON.stringify(RECORDED_CYCLE_MANIFEST));
  delete incompleteAccessibility.accessibility.focusRule;
  const a11yResult = checkIntegrity(incompleteAccessibility);
  ok(a11yResult.ok === false, "integrity checker rejects an accessibility block missing a required rule", JSON.stringify(a11yResult.errors));
}

// ── 2.4 Inverted-dark fixture is rejected ───────────────────────────────────
section("2.4 A mechanically-inverted dark theme is rejected");
{
  const { checkNotInvertedDark } = await importFrom("services/nofida-hub-adapter/ai/designer/design-system-validators.mjs");

  function invertHex(hex) {
    const int = parseInt(hex.replace("#", ""), 16);
    const r = 255 - ((int >> 16) & 255);
    const g = 255 - ((int >> 8) & 255);
    const b = 255 - (int & 255);
    return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
  }

  const invertedManifest = JSON.parse(JSON.stringify(RECORDED_CYCLE_MANIFEST));
  const invertedDark = {};
  for (const [name, hex] of Object.entries(RECORDED_CYCLE_MANIFEST.semanticTokens.light)) {
    invertedDark[name] = invertHex(hex);
  }
  invertedManifest.semanticTokens.dark = invertedDark;

  const invertedResult = checkNotInvertedDark(invertedManifest);
  ok(invertedResult.ok === false, "a dark theme that is a 100% channel inversion of light is rejected", JSON.stringify(invertedResult.errors));

  // Sanity: the recorded (real) fixture is NOT flagged even though a couple
  // of individual tokens may coincidentally invert.
  const realResult = checkNotInvertedDark(RECORDED_CYCLE_MANIFEST);
  ok(realResult.ok === true, "a legitimately-designed dark theme is not rejected by the same heuristic", JSON.stringify(realResult.errors));
}

// ── 2.5 Art director: contract + rationale validation, retry-on-invalid ────
section("2.5 Art director: contract + rationale validation, retry-on-invalid");
{
  const { directArt } = await importFrom("services/nofida-hub-adapter/ai/designer/art-director.mjs");

  const goodAnswer = JSON.stringify({ ...RECORDED_CYCLE_ART_DIRECTION, rationale: RECORDED_CYCLE_ART_DIRECTION_RATIONALE });
  const happyService = makeFakeAiSettingsService({ answers: [goodAnswer] });
  const happyResult = await directArt({ productBrief: RECORDED_CYCLE_BRIEF, productArchitecture: RECORDED_CYCLE_ARCHITECTURE }, { aiSettingsService: happyService });
  ok(happyResult.ok === true && happyService.callCount() === 1, "valid first-attempt ArtDirection+rationale is accepted without a retry", JSON.stringify(happyResult.error));
  ok(happyResult.ok && happyResult.rationale === RECORDED_CYCLE_ART_DIRECTION_RATIONALE, "rationale is returned separately from the contract fields");
  ok(happyResult.ok && !("rationale" in happyResult.artDirection), "rationale is stripped out of the ArtDirection object itself (contract stays immutable)");

  // Missing rationale is a retryable validation failure, not silently accepted.
  const missingRationaleThenGood = makeFakeAiSettingsService({ answers: [JSON.stringify(RECORDED_CYCLE_ART_DIRECTION), goodAnswer] });
  const retryResult = await directArt({ productBrief: RECORDED_CYCLE_BRIEF, productArchitecture: RECORDED_CYCLE_ARCHITECTURE }, { aiSettingsService: missingRationaleThenGood });
  ok(retryResult.ok === true && missingRationaleThenGood.callCount() === 2, "a response missing rationale is retried and recovers", missingRationaleThenGood.callCount());
}

// ── 2.6 Design system generator: deep-validator retry loop ─────────────────
section("2.6 Design system generator: validate → repair-retry with specific errors → fail structurally");
{
  const { generateDesignSystem } = await importFrom("services/nofida-hub-adapter/ai/designer/design-system-generator.mjs");

  const happyService = makeFakeAiSettingsService({ answers: [JSON.stringify(RECORDED_CYCLE_MANIFEST)] });
  const happyResult = await generateDesignSystem({ productBrief: RECORDED_CYCLE_BRIEF, artDirection: RECORDED_CYCLE_ART_DIRECTION }, { aiSettingsService: happyService });
  ok(happyResult.ok === true && happyService.callCount() === 1, "a valid first-attempt manifest is accepted without a retry", JSON.stringify(happyResult.error));

  // Broken manifest (bad contrast: near-identical text/background) once, then the good recorded fixture.
  const brokenManifest = JSON.parse(JSON.stringify(RECORDED_CYCLE_MANIFEST));
  brokenManifest.semanticTokens.light["text.primary"] = brokenManifest.semanticTokens.light["background.canvas"]; // 1:1 contrast — a hard fail
  let repairPromptSeenErrors = null;
  const retryService = {
    callCount: () => calls,
    async resolveModelForRole() { return { providerId: "fake", providerLabel: "Fake", modelId: "fake-model" }; },
    async callWithResolvedModel({ message }) {
      calls += 1;
      if (calls === 2) repairPromptSeenErrors = message; // the repair-retry message
      return { answer: calls === 1 ? JSON.stringify(brokenManifest) : JSON.stringify(RECORDED_CYCLE_MANIFEST), providerId: "fake", providerLabel: "Fake", modelId: "fake-model" };
    },
  };
  let calls = 0;
  const retryResult = await generateDesignSystem({ productBrief: RECORDED_CYCLE_BRIEF, artDirection: RECORDED_CYCLE_ART_DIRECTION }, { aiSettingsService: retryService });
  ok(retryResult.ok === true && retryService.callCount() === 2, "generator recovers after one contract/contrast-violating attempt", retryService.callCount());
  ok(typeof repairPromptSeenErrors === "string" && repairPromptSeenErrors.includes("contrast"), "the repair-retry message carries the SPECIFIC validator error, not a generic 'try again'", (repairPromptSeenErrors || "").slice(0, 400));

  // Exhausted retries — broken both times fails structurally.
  const failService = makeFakeAiSettingsService({ answers: [JSON.stringify(brokenManifest), JSON.stringify(brokenManifest)] });
  const failResult = await generateDesignSystem({ productBrief: RECORDED_CYCLE_BRIEF, artDirection: RECORDED_CYCLE_ART_DIRECTION }, { aiSettingsService: failService });
  ok(failResult.ok === false && failResult.error?.code === "contract_violation", "exhausting the retry budget fails structurally, not silently", JSON.stringify(failResult.error));
  ok(failService.callCount() === 2, "exactly MAX_RETRIES+1 attempts were made before giving up", failService.callCount());
}

// ── 2.7 Validators are pure code — no network access, no provider import ───
section("2.7 Validators run without any network access");
{
  const validatorsSrc = fs.readFileSync(path.join(REPO_ROOT, "services/nofida-hub-adapter/ai/designer/design-system-validators.mjs"), "utf8");
  ok(!/ai-service|fetch\(|http:|https:/i.test(validatorsSrc), "design-system-validators.mjs imports no provider/network module and calls no fetch");

  const { checkContrast, checkIntegrity, checkNotInvertedDark, validateManifest } =
    await importFrom("services/nofida-hub-adapter/ai/designer/design-system-validators.mjs");
  const start = Date.now();
  const r1 = checkContrast(RECORDED_CYCLE_MANIFEST);
  const r2 = checkIntegrity(RECORDED_CYCLE_MANIFEST);
  const r3 = checkNotInvertedDark(RECORDED_CYCLE_MANIFEST);
  const r4 = validateManifest(RECORDED_CYCLE_MANIFEST);
  const elapsed = Date.now() - start;
  ok([r1, r2, r3, r4].every((r) => typeof r.ok === "boolean"), "all four validators return synchronously (no Promise, no await needed)");
  ok(elapsed < 50, "all four validators complete in well under a network round-trip's worth of time", `${elapsed}ms`);
}

// ── 2.8 Pipeline wiring: art_direction + design_system stages run and cache ─
// Exercises these two stages in isolation via runPipelineStage() rather than
// a full runPipeline() run, for the same forward-compatibility reason as
// section 1.5 — 026A.3 wires components/assets right after this, which would
// otherwise make an "and then it stops here" assertion stale immediately.
section("2.8 Pipeline runs art_direction + design_system with the real modules and caches them");
{
  const { runPipelineStage, STAGE_ORDER } = await importFrom("services/nofida-hub-adapter/ai/designer/pipeline.mjs");
  const { createDesignerInvokeStage } = await importFrom("services/nofida-hub-adapter/ai/designer/stage-invoker.mjs");

  const answers = [
    JSON.stringify(RECORDED_CYCLE_BRIEF),
    JSON.stringify(RECORDED_CYCLE_ARCHITECTURE),
    JSON.stringify({ ...RECORDED_CYCLE_ART_DIRECTION, rationale: RECORDED_CYCLE_ART_DIRECTION_RATIONALE }),
    JSON.stringify(RECORDED_CYCLE_MANIFEST),
  ];
  const providerFake = makeFakeAiSettingsService({ answers });
  const invokeStage = createDesignerInvokeStage({ aiSettingsService: providerFake, briefInput: { request: CYCLE_APP_REQUEST } });
  const session = { stageArtifacts: {} };

  const stageNames = ["brief", "product_architecture", "art_direction", "design_system"];
  for (let i = 0; i < stageNames.length; i++) {
    const result = await runPipelineStage(STAGE_ORDER[i], { session, invokeStage });
    ok(result.status === "ok", `${stageNames[i]} stage runs via the real module and reports 'ok'`, JSON.stringify(result));
    session.stageArtifacts[stageNames[i]] = { status: "ok", output: result.output };
  }
  ok(providerFake.callCount() === 4, "provider invoked exactly once per real stage on a cold run", providerFake.callCount());

  const artDirectionArtifact = session.stageArtifacts.art_direction.output;
  ok(artDirectionArtifact && !("rationale" in artDirectionArtifact), "the cached art_direction artifact holds pure ArtDirection fields, not the rationale wrapper");

  for (let i = 0; i < stageNames.length; i++) {
    const cached = await runPipelineStage(STAGE_ORDER[i], { session, invokeStage });
    ok(cached.status === "cached", `${stageNames[i]} stage individually reports 'cached' on rerun`);
  }
  ok(providerFake.callCount() === 4, "rerunning all four cached stages makes no new provider call", providerFake.callCount());
}

// =============================================================================
// SECTION 026A.3 — Component Architect + Asset Resolver
// =============================================================================
console.log("\nPATCH 026A.3 — Component Architect + Asset Resolver");

// Recorded fixture components (built on 026A.1/026A.2's cycle-tracker brief/
// architecture/manifest) — every tokenBinding below references an actual
// token name present in RECORDED_CYCLE_MANIFEST; every layout is a valid
// SemanticLayout. Repeated patterns (DateCell for week-day cells,
// CalendarDay for month-day cells, MetricCard for cycle summary) are their
// own components, not inlined.
const RECORDED_CYCLE_COMPONENTS = [
  {
    id: "component.app-header", name: "AppHeader", role: "header",
    props: { title: "string", subtitle: "string" },
    variants: ["light", "dark"], states: ["default"],
    layout: { type: "stack", direction: "row", gapToken: "spacing.scale", alignment: "center" },
    tokenBindings: { fill: "background.canvas", titleColor: "text.primary", subtitleColor: "text.secondary" },
    children: [],
  },
  {
    id: "component.date-cell", name: "DateCell", role: "calendar-cell",
    props: { day: "number", isToday: "boolean", isSelected: "boolean" },
    variants: ["light", "dark"], states: ["default", "selected", "disabled"],
    layout: { type: "stack", direction: "column", gapToken: "spacing.scale", alignment: "center" },
    tokenBindings: { fill: "background.surface", selectedFill: "state.selected", textColor: "text.primary", cornerRadius: "radius.control" },
    children: [],
  },
  {
    id: "component.week-calendar", name: "WeekCalendar", role: "calendar",
    props: { weekStart: "date" },
    variants: ["light", "dark"], states: ["default", "loading"],
    layout: { type: "grid", direction: "row", gapToken: "spacing.scale" },
    tokenBindings: { fill: "background.surface", cornerRadius: "radius.card" },
    children: [],
  },
  {
    id: "component.prediction-card", name: "PredictionCard", role: "summary",
    props: { predictedDate: "string", daysRemaining: "number" },
    variants: ["light", "dark"], states: ["default", "loading", "error"],
    layout: { type: "stack", direction: "column", gapToken: "spacing.scale" },
    tokenBindings: { fill: "background.surfaceElevated", titleColor: "text.primary", cornerRadius: "radius.card" },
    children: [],
  },
  {
    id: "component.status-pill", name: "StatusPill", role: "status-indicator",
    props: { label: "string", tone: "string" },
    variants: ["light", "dark"], states: ["default"],
    layout: { type: "stack", direction: "row", gapToken: "spacing.scale" },
    tokenBindings: { fill: "status.success", textColor: "action.primaryText", cornerRadius: "radius.pill" },
    children: [],
  },
  {
    id: "component.segmented-tabs", name: "SegmentedTabs", role: "navigation",
    props: { tabs: "array", activeIndex: "number" },
    variants: ["light", "dark"], states: ["default"],
    layout: { type: "stack", direction: "row", gapToken: "spacing.scale" },
    tokenBindings: { fill: "background.surface", activeFill: "action.primary", cornerRadius: "radius.control" },
    children: [],
  },
  {
    id: "component.metric-card", name: "MetricCard", role: "metric",
    props: { label: "string", value: "string" },
    variants: ["light", "dark"], states: ["default"],
    layout: { type: "stack", direction: "column", gapToken: "spacing.scale" },
    tokenBindings: { fill: "background.surfaceElevated", valueColor: "text.primary", labelColor: "text.secondary", cornerRadius: "radius.card" },
    children: [],
  },
  {
    id: "component.calendar-day", name: "CalendarDay", role: "calendar-cell",
    props: { day: "number", hasEvent: "boolean" },
    variants: ["light", "dark"], states: ["default", "selected", "disabled"],
    layout: { type: "stack", direction: "column", gapToken: "spacing.scale", alignment: "center" },
    tokenBindings: { fill: "background.surface", selectedFill: "state.selected", textColor: "text.primary", cornerRadius: "radius.control" },
    children: [],
  },
  {
    id: "component.month-calendar", name: "MonthCalendar", role: "calendar",
    props: { month: "date" },
    variants: ["light", "dark"], states: ["default", "loading"],
    layout: { type: "grid", direction: "row", gapToken: "spacing.scale" },
    tokenBindings: { fill: "background.surface", cornerRadius: "radius.panel" },
    children: [],
  },
  {
    id: "component.primary-button", name: "PrimaryButton", role: "primary-action",
    props: { label: "string", disabled: "boolean" },
    variants: ["light", "dark"], states: ["default", "disabled"],
    layout: { type: "stack", direction: "row", gapToken: "spacing.scale", alignment: "center" },
    tokenBindings: { fill: "action.primary", textColor: "action.primaryText", cornerRadius: "radius.control" },
    children: [],
  },
];

// ── 3.1 Component architect fixture is contract-valid + patterns mapped ────
section("3.1 Recorded ComponentDefinition fixtures validate; repeated patterns are componentized");
{
  const { validateContract } = await importFrom("services/nofida-hub-adapter/ai/designer/contracts.mjs");
  const { validateComponentDeep } = await importFrom("services/nofida-hub-adapter/ai/designer/component-validators.mjs");

  for (const component of RECORDED_CYCLE_COMPONENTS) {
    const shallow = validateContract("ComponentDefinition", component);
    ok(shallow.ok === true, `"${component.name}" validates against the ComponentDefinition contract`, shallow.errors.join("; "));
    const deep = validateComponentDeep(component, RECORDED_CYCLE_MANIFEST);
    ok(deep.ok === true, `"${component.name}" passes the deep check (tokenBindings + layout) against the recorded manifest`, deep.errors.join("; "));
  }

  const archText = architectureText(RECORDED_CYCLE_ARCHITECTURE);
  ok(/week/i.test(archText), "architecture sections reference a week-day-cell pattern");
  const dateCell = RECORDED_CYCLE_COMPONENTS.find((c) => c.name === "DateCell");
  ok(!!dateCell && dateCell.role === "calendar-cell", "week-day cells map to the DateCell component (role calendar-cell)");

  ok(/month/i.test(archText), "architecture sections reference a month-day-cell pattern");
  const calendarDay = RECORDED_CYCLE_COMPONENTS.find((c) => c.name === "CalendarDay");
  ok(!!calendarDay && calendarDay.role === "calendar-cell", "month-day cells map to the CalendarDay component (role calendar-cell)");

  ok(/summary/i.test(archText), "architecture sections reference a cycle-summary pattern");
  const metricCard = RECORDED_CYCLE_COMPONENTS.find((c) => c.name === "MetricCard");
  ok(!!metricCard && metricCard.role === "metric", "cycle summary maps to the MetricCard component (role metric)");
}

// ── 3.2 tokenBindings cross-check against the manifest ──────────────────────
section("3.2 Every tokenBindings value resolves into the DesignSystemManifest");
{
  const { checkTokenBindings, resolveTokenBinding } = await importFrom("services/nofida-hub-adapter/ai/designer/component-validators.mjs");

  for (const component of RECORDED_CYCLE_COMPONENTS) {
    const result = checkTokenBindings(component, RECORDED_CYCLE_MANIFEST);
    ok(result.ok === true, `"${component.name}"'s tokenBindings all resolve into the manifest`, result.errors.join("; "));
  }

  ok(resolveTokenBinding(RECORDED_CYCLE_MANIFEST, "background.surface") === true, "a semantic token name resolves directly");
  ok(resolveTokenBinding(RECORDED_CYCLE_MANIFEST, "radius.card") === true, "a dotted path into tokens.* resolves");
  ok(resolveTokenBinding(RECORDED_CYCLE_MANIFEST, "color.brand.900") === false, "an invented token path does not resolve");

  const badComponent = { ...RECORDED_CYCLE_COMPONENTS[0], tokenBindings: { fill: "color.brand.invented-shade" } };
  const badResult = checkTokenBindings(badComponent, RECORDED_CYCLE_MANIFEST);
  ok(badResult.ok === false, "a component with an invented token name is rejected by the cross-check", JSON.stringify(badResult.errors));
}

// ── 3.3 layout is a valid SemanticLayout ────────────────────────────────────
section("3.3 Component layout must itself be a valid SemanticLayout");
{
  const { checkLayoutIsSemanticLayout } = await importFrom("services/nofida-hub-adapter/ai/designer/component-validators.mjs");

  for (const component of RECORDED_CYCLE_COMPONENTS) {
    const result = checkLayoutIsSemanticLayout(component);
    ok(result.ok === true, `"${component.name}"'s layout is a valid SemanticLayout`, result.errors.join("; "));
  }

  const noLayout = { id: "component.x", name: "X", role: "x" };
  ok(checkLayoutIsSemanticLayout(noLayout).ok === true, "a component with no layout at all is fine (layout is optional)");

  const badLayout = { ...RECORDED_CYCLE_COMPONENTS[0], layout: { type: "flow" } };
  ok(checkLayoutIsSemanticLayout(badLayout).ok === false, "an invalid layout.type is rejected");
}

// ── 3.4 Light/dark are variants, not duplicate components ──────────────────
section("3.4 Light/dark are variants of one component, never *Dark duplicates");
{
  const { checkNoLightDarkDuplicateNames } = await importFrom("services/nofida-hub-adapter/ai/designer/component-validators.mjs");

  const goodResult = checkNoLightDarkDuplicateNames(RECORDED_CYCLE_COMPONENTS);
  ok(goodResult.ok === true, "the recorded fixture (variants, no *Dark names) passes the check", JSON.stringify(goodResult.errors));
  ok(RECORDED_CYCLE_COMPONENTS.every((c) => (c.variants || []).includes("light") && c.variants.includes("dark")), "every recorded component declares both light and dark as variants of itself");

  const splitComponents = [
    { id: "component.prediction-card", name: "PredictionCard", role: "summary" },
    { id: "component.prediction-card-dark", name: "PredictionCardDark", role: "summary" },
  ];
  const badResult = checkNoLightDarkDuplicateNames(splitComponents);
  ok(badResult.ok === false, "a component set that splits light/dark into two named components is rejected", JSON.stringify(badResult.errors));
}

// ── 3.5 Deduplication merges structurally identical definitions ────────────
section("3.5 Deduplication merges structurally identical component definitions");
{
  const { dedupeComponents } = await importFrom("services/nofida-hub-adapter/ai/designer/component-validators.mjs");

  const duplicated = [
    { id: "component.date-cell", name: "DateCell", role: "calendar-cell", props: { day: "number" }, variants: ["light"], states: ["default"], layout: { type: "stack" }, tokenBindings: { fill: "background.surface" }, children: [] },
    { id: "component.date-cell-2", name: "DateCellDuplicate", role: "calendar-cell", props: { day: "number" }, variants: ["dark"], states: ["default"], layout: { type: "stack" }, tokenBindings: { fill: "background.surface" }, children: [] },
    { id: "component.metric-card", name: "MetricCard", role: "metric", props: { label: "string" }, variants: ["light", "dark"], states: ["default"], layout: { type: "stack" }, tokenBindings: { fill: "background.surfaceElevated" }, children: [] },
  ];
  const deduped = dedupeComponents(duplicated);
  ok(deduped.length === 2, "two structurally identical definitions merge into one; the distinct one survives separately", deduped.length);
  const mergedDateCell = deduped.find((c) => c.id === "component.date-cell");
  ok(!!mergedDateCell, "the first occurrence's id/name is kept for the merged component");
  ok(mergedDateCell && mergedDateCell.variants.includes("light") && mergedDateCell.variants.includes("dark"), "the merged component's variants are the union of the duplicates' variants", JSON.stringify(mergedDateCell && mergedDateCell.variants));
}

// ── 3.6 Component architect: contract validation + retry-on-invalid ────────
section("3.6 Component architect: contract validation + retry-on-invalid");
{
  const { architectComponents } = await importFrom("services/nofida-hub-adapter/ai/designer/component-architect.mjs");

  const happyService = makeFakeAiSettingsService({ answers: [JSON.stringify(RECORDED_CYCLE_COMPONENTS)] });
  const happyResult = await architectComponents(
    { productArchitecture: RECORDED_CYCLE_ARCHITECTURE, artDirection: RECORDED_CYCLE_ART_DIRECTION, manifest: RECORDED_CYCLE_MANIFEST },
    { aiSettingsService: happyService },
  );
  ok(happyResult.ok === true && happyService.callCount() === 1, "a valid first-attempt component array is accepted without a retry", JSON.stringify(happyResult.error));
  ok(happyResult.ok && happyResult.components.length === RECORDED_CYCLE_COMPONENTS.length, "no duplicates existed in the fixture, so dedup is a no-op here", happyResult.ok && happyResult.components.length);

  const brokenThenGood = [JSON.stringify([{ id: "component.x", name: "X" }]), JSON.stringify(RECORDED_CYCLE_COMPONENTS)]; // missing required "role" once
  const retryService = makeFakeAiSettingsService({ answers: brokenThenGood });
  const retryResult = await architectComponents(
    { productArchitecture: RECORDED_CYCLE_ARCHITECTURE, artDirection: RECORDED_CYCLE_ART_DIRECTION, manifest: RECORDED_CYCLE_MANIFEST },
    { aiSettingsService: retryService },
  );
  ok(retryResult.ok === true && retryService.callCount() === 2, "component architect recovers after one contract-violating attempt", retryService.callCount());
}

// ── 3.7 Asset resolver: priority chain, editable vector background, no hotlinks/emoji ─
section("3.7 Asset resolver: priority chain, editable vector background, no hotlinks or emoji");
{
  const { resolveAssets } = await importFrom("services/nofida-hub-adapter/ai/designer/asset-resolver.mjs");
  const { validateContract } = await importFrom("services/nofida-hub-adapter/ai/designer/contracts.mjs");
  const { REQUIRED_SEMANTIC_TOKENS } = await importFrom("services/nofida-hub-adapter/ai/designer/design-system-validators.mjs");
  const isNonEmptyStringLocal = (v) => typeof v === "string" && v.trim().length > 0;

  const resolution = resolveAssets({
    productArchitecture: RECORDED_CYCLE_ARCHITECTURE,
    artDirection: RECORDED_CYCLE_ART_DIRECTION,
    components: RECORDED_CYCLE_COMPONENTS,
  });
  const contractResult = validateContract("AssetResolution", resolution);
  ok(contractResult.ok === true, "resolved assets validate against the AssetResolution contract", contractResult.errors.join("; "));

  const background = resolution.assets.find((a) => a.role.startsWith("background."));
  ok(!!background, "an abstract-vector-background need is resolved for the cycle-tracker product");
  ok(background && background.source === "generated-vector", "the background resolves to source 'generated-vector' (programmatic, not a raster asset)", background && background.source);
  ok(background && background.editable === true, "the generated background is editable", background && background.editable);
  ok(background && Array.isArray(background.sceneNodes) && background.sceneNodes.length >= 3 && background.sceneNodes.length <= 8, "the background has between 3 and 8 vector shapes", background && background.sceneNodes.length);
  const parsedNodes = (background?.sceneNodes || []).map((n) => JSON.parse(n));
  ok(parsedNodes.every((n) => ["ellipse", "rectangle", "path"].includes(n.type)), "every background shape is an ellipse/rectangle/path primitive, never a raster image", JSON.stringify(parsedNodes.map((n) => n.type)));
  ok(parsedNodes.every((n) => isNonEmptyStringLocal(n?.tokens?.fillToken)), "every background shape's fill is bound to a semantic token (tokens.fillToken), not a literal color", JSON.stringify(parsedNodes.map((n) => n?.tokens?.fillToken)));
  ok(parsedNodes.every((n) => REQUIRED_SEMANTIC_TOKENS.includes(n.tokens.fillToken)), "every bound fillToken is one of the manifest's canonical semantic token names");

  const icons = resolution.assets.filter((a) => a.role.startsWith("icon."));
  ok(icons.length > 0, "at least one icon role is derived from the architecture's sections/actions", icons.length);
  ok(icons.every((i) => i.source.startsWith("icon-library:")), "icons resolve through the approved icon library tier", JSON.stringify(icons.map((i) => i.source)));
  ok(icons.every((i) => !/\p{Extended_Pictographic}/u.test(i.role) && !/\p{Extended_Pictographic}/u.test(i.source)), "zero emoji glyphs appear anywhere in icon results");

  const allText = JSON.stringify(resolution);
  ok(!/https?:\/\//i.test(allText), "zero external URLs appear anywhere in the resolved assets", allText.match(/https?:\/\/\S+/) || "none");

  // Priority chain: an existing project asset for a role wins over media
  // bank / generated / placeholder.
  const withProjectAsset = resolveAssets({
    productArchitecture: RECORDED_CYCLE_ARCHITECTURE,
    artDirection: RECORDED_CYCLE_ART_DIRECTION,
    components: RECORDED_CYCLE_COMPONENTS,
    existingProjectAssets: [{ id: "proj-bg-1", role: "background.hero", license: "project-owned", editable: true }],
  });
  const projectBackground = withProjectAsset.assets.find((a) => a.role === "background.hero");
  ok(projectBackground && projectBackground.source === "project-asset:proj-bg-1", "an existing project asset is preferred over generating a new one", projectBackground && projectBackground.source);

  // A candidate without a verifiable license is skipped, not accepted.
  const withUnlicensedMedia = resolveAssets({
    productArchitecture: RECORDED_CYCLE_ARCHITECTURE,
    artDirection: RECORDED_CYCLE_ART_DIRECTION,
    components: RECORDED_CYCLE_COMPONENTS,
    mediaCatalogItems: [{ id: "media-1", title: "hero background", category: "background", tags: ["hero"] }], // no license
  });
  const fallbackBackground = withUnlicensedMedia.assets.find((a) => a.role === "background.hero");
  ok(fallbackBackground && fallbackBackground.source !== "media-bank:media-1", "an unlicensed media-bank candidate is skipped, falling through to the next tier", fallbackBackground && fallbackBackground.source);
}

// ── 3.8 Pipeline wiring: components + assets stages run and cache ──────────
section("3.8 Pipeline runs components + assets with the real modules and caches them");
{
  const { runPipelineStage, STAGE_ORDER } = await importFrom("services/nofida-hub-adapter/ai/designer/pipeline.mjs");
  const { createDesignerInvokeStage } = await importFrom("services/nofida-hub-adapter/ai/designer/stage-invoker.mjs");

  const providerFake = makeFakeAiSettingsService({ answers: [JSON.stringify(RECORDED_CYCLE_COMPONENTS)] });
  const invokeStage = createDesignerInvokeStage({ aiSettingsService: providerFake, briefInput: { request: CYCLE_APP_REQUEST } });
  const session = {
    stageArtifacts: {
      brief: { status: "ok", output: RECORDED_CYCLE_BRIEF },
      product_architecture: { status: "ok", output: RECORDED_CYCLE_ARCHITECTURE },
      art_direction: { status: "ok", output: RECORDED_CYCLE_ART_DIRECTION },
      design_system: { status: "ok", output: RECORDED_CYCLE_MANIFEST },
    },
  };

  const componentsStageDef = STAGE_ORDER.find((s) => s.stage === "components");
  const componentsResult = await runPipelineStage(componentsStageDef, { session, invokeStage });
  ok(componentsResult.status === "ok", "components stage runs via the real module and reports 'ok'", JSON.stringify(componentsResult).slice(0, 300));
  session.stageArtifacts.components = { status: "ok", output: componentsResult.output };
  ok(providerFake.callCount() === 1, "components stage invokes the provider exactly once on a cold run");

  const assetsStageDef = STAGE_ORDER.find((s) => s.stage === "assets");
  const assetsResult = await runPipelineStage(assetsStageDef, { session, invokeStage });
  ok(assetsResult.status === "ok", "assets stage runs and reports 'ok' without ever calling the provider", JSON.stringify(assetsResult).slice(0, 300));
  ok(providerFake.callCount() === 1, "assets stage is fully deterministic — no additional provider invocation", providerFake.callCount());
  session.stageArtifacts.assets = { status: "ok", output: assetsResult.output };

  const cachedComponents = await runPipelineStage(componentsStageDef, { session, invokeStage });
  ok(cachedComponents.status === "cached", "components stage reports 'cached' on rerun");
  const cachedAssets = await runPipelineStage(assetsStageDef, { session, invokeStage });
  ok(cachedAssets.status === "cached", "assets stage reports 'cached' on rerun");
  ok(providerFake.callCount() === 1, "rerunning both cached stages makes no new provider call", providerFake.callCount());
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
