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

  // PATCH 026A.1 implements two of the eleven prompts for real; the rest
  // stay 026A.0 stubs until their own sub-patch lands.
  const IMPLEMENTED_TASK_TYPES = new Set(["designer_brief_interpreter", "designer_product_architect"]);

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
section("1.5 Pipeline runs the real brief/product_architecture stages and caches them");
{
  const { runPipeline, runPipelineStage, STAGE_ORDER } = await importFrom("services/nofida-hub-adapter/ai/designer/pipeline.mjs");
  const { createDesignerInvokeStage } = await importFrom("services/nofida-hub-adapter/ai/designer/stage-invoker.mjs");

  const providerFake = makeFakeAiSettingsService({ answers: [JSON.stringify(RECORDED_CYCLE_BRIEF), JSON.stringify(RECORDED_CYCLE_ARCHITECTURE)] });
  const invokeStage = createDesignerInvokeStage({ aiSettingsService: providerFake, briefInput: { request: CYCLE_APP_REQUEST } });
  const session = { stageArtifacts: {} };

  const firstRun = await runPipeline({ session, invokeStage });
  ok(firstRun.ok === false && firstRun.error.stage === "art_direction" && firstRun.error.code === "stage_not_wired", "pipeline runs both real stages then stops cleanly at the next un-wired stage", JSON.stringify(firstRun.error));
  ok(firstRun.results.length === 2 && firstRun.results.every((r) => r.status === "ok"), "brief and product_architecture both complete with status 'ok'", JSON.stringify(firstRun.results.map((r) => [r.stage, r.status])));
  ok(providerFake.callCount() === 2, "provider invoked exactly once per real stage on a cold run", providerFake.callCount());

  const secondRun = await runPipeline({ session, invokeStage });
  ok(secondRun.error.stage === "art_direction", "second run against the same session reaches the same un-wired stage");
  ok(providerFake.callCount() === 2, "second run resumes brief/product_architecture from the session cache — no additional provider invocations", providerFake.callCount());

  // Same guarantee at the single-stage level (matches the 026A.0 cache test shape).
  const cachedBrief = await runPipelineStage(STAGE_ORDER[0], { session, invokeStage });
  ok(cachedBrief.status === "cached", "brief stage individually reports 'cached' on rerun");
  ok(providerFake.callCount() === 2, "rerunning the cached brief stage alone still makes no new provider call");
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
