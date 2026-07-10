# PATCH 026A.0 — Autonomous Designer Foundation: contracts, flags, task registry, orchestrator

Role: Senior AI design-tool architect and compiler engineer.

## Baseline

* tag: `nofida-stable-025A-bulk-create-v2`
* Scene Model → validator → canonicalizer → normalizer → compiler → Penpot persistence works
* create-mode idempotency and rollback work; bulk update disabled

This is sub-patch 0 of PATCH 026A (Autonomous NOFIDA AI Product Designer). It builds the
skeleton every later sub-patch depends on. **No LLM prompt content is written in this
sub-patch** — only contracts, registry entries, flags and orchestration.

## Global rules (non-negotiable, apply to all 026A sub-patches)

1. The LLM must never emit raw Penpot Transit, UUID maps or `update-file` payloads. The only
   low-level bulk-create implementation is the PATCH 025A compiler in
   `services/nofida-hub-adapter/ai/scene/`.
2. `ALLOW_BULK_UPDATE = false` in `branding/ai-core/designer/persistence-adapter.js` stays false.
3. Deterministic logic is plain code; only creative/product decisions go through LLM tasks.
4. Any change under `services/nofida-hub-adapter/ai/scene/` must be mirrored: run
   `scripts/sync-shared-scene.sh` and pass `scripts/check-shared-scene-sync.sh`
   (browser mirror lives in `branding/ai-core/designer/scene/*.js`).
5. Safety: do not modify real user files; no direct DB writes; do not touch Caddy, Postgres,
   Valkey or Penpot renderer source; no partial compile by default; never silently drop nodes.
   Disposable test files only.
6. Finish the session with: your own verify script PASS, regression
   `node scripts/verify-025a-scene-pipeline.mjs` PASS, `scripts/check-shared-scene-sync.sh` PASS,
   a PASS/FAIL report, one commit.

## Key files

| File | Why it matters here |
|---|---|
| `services/nofida-hub-adapter/ai/scene/scene-schema.mjs` | node types, limits, `SCREEN_SPEC_PROMPT_BLOCK` — extend with token metadata |
| `services/nofida-hub-adapter/ai/scene/scene-validator.mjs` / `scene-normalizer.mjs` / `scene-compiler.mjs` | metadata must survive validate → normalize → compile |
| `services/nofida-hub-adapter/ai/prompt-registry.mjs` | `define({...})` pattern, `TASK_TYPES`, `TASK_ROLE_MAP` |
| `services/nofida-hub-adapter/ai/intent-router.mjs` | task routing |
| `services/nofida-hub-adapter/ai/thread-store.mjs` | persistence pattern to copy for the designer session store |
| `services/nofida-hub-adapter/ai-service.mjs` | provider/model resolution, `MODEL_CAPABILITIES` incl. `vision` |
| `branding/ai-core/designer/persistence-adapter.js` | flag-gate pattern (`ALLOW_BULK_UPDATE`) |
| `scripts/verify-025a-scene-pipeline.mjs` | `ok(cond,label)` verify harness style to follow |

## Tasks

### 0.1 Token-binding metadata in the Scene Model

Extend the Scene Model so every node may carry pass-through designer metadata:

```json
{
  "tokens": {
    "fillToken": "background.surface",
    "textStyleToken": "typography.body",
    "radiusToken": "radius.card",
    "gapToken": "spacing.12",
    "strokeToken": null,
    "shadowToken": null
  },
  "semanticId": "home-day/prediction-card/title",
  "componentRole": "PredictionCard",
  "themeVariant": "light",
  "devMeta": {}
}
```

Requirements:

* validator accepts and type-checks these fields; unknown token categories are rejected;
* canonicalizer/normalizer preserve them untouched (including through frame demotion and
  paint flattening);
* compiler resolves nothing here — it copies the metadata into the NOFIDA metadata section of
  the produced shape (`buildFields()` in `penpot-shape-adapter.mjs`) so token references survive
  into Penpot persistence; actual token→value resolution happens upstream (026A.4);
* `semanticId` must be stable input to the canonicalizer's nid assignment so idempotent retries
  and light/dark pairing (026A.5) can rely on it;
* mirror sync run and gate green.

### 0.2 Feature flags

Add three flags, default **off**, following existing conventions
(`NOFIDA_AI_*` env on the server, hard gate constant on the frontend like `ALLOW_BULK_UPDATE`):

```text
nofida_ai_autonomous_designer_v1
nofida_ai_visual_critic_v1
nofida_ai_handoff_v1
```

Server exposes flag state to the frontend in the existing status/config payload. Keep
`ALLOW_BULK_UPDATE=false`.

### 0.3 Prompt Registry entries

Register 11 task types in `prompt-registry.mjs` (stub `buildSystemPrompt` returning a clearly
marked placeholder; later sub-patches fill them):

```text
designer_brief_interpreter
designer_product_architect
designer_art_director
designer_system_generator
designer_component_architect
designer_asset_resolver
designer_layout_planner
designer_scene_builder
designer_visual_critic
designer_repair_planner
designer_handoff_generator
```

Each entry: `id`, `version`, `taskType`, `role`, `contextRequirements`, `outputSchema`
(referencing the contracts from 0.5), `safety: { previewOnly: true, allowCanvasMutation: false }`
— canvas mutation continues to flow only through the existing `build_screen` apply path.
Update `TASK_TYPES`, `TASK_ROLE_MAP`, and `intent-router.mjs` so these tasks are reachable only
when `nofida_ai_autonomous_designer_v1` is on. All tasks use the currently active connected LLM
provider/model — do not require per-task model setup.

### 0.4 Pipeline orchestrator

Create `services/nofida-hub-adapter/ai/designer/pipeline.mjs`:

* runs stages sequentially: brief → product architect → art director → design system →
  component architect → asset resolver → layout → scene builder (→ critic/repair when 026A.7
  lands); stages not yet implemented are skipped with an explicit "not implemented" marker;
* persists every intermediate artifact per designer session (JSON store modeled on
  `thread-store.mjs`) so a rerun/approve resumes from cache instead of re-invoking the LLM;
* validates each stage output against its contract (0.5) before passing it on; a contract
  violation aborts the pipeline with a structured error naming the stage;
* uniform error format `{ stage, code, message, recoverable }`;
* never exposes internal structures to the user-facing payload.

### 0.5 Inter-stage contracts

Create `services/nofida-hub-adapter/ai/designer/contracts.mjs` with schema + validator for every
inter-stage JSON contract of PATCH 026A. These are copied verbatim from the master spec and are
**immutable** for later sub-patches:

* `ProductBrief` (§1 output: productType, domain, targetUsers, primaryJob, requiredScreens,
  requiredFeatures, contentPriorities, constraints, platform{type,width,height,safeArea},
  assumptions, confidence);
* `ProductArchitecture` (§2: flows, screens[{id, purpose, primaryAction, secondaryActions,
  sections, states, contentRequirements}]);
* `ArtDirection` (§3: direction, keywords, density, contrast, cornerStyle, surfaceStyle,
  imageStrategy, themeStrategy, avoid);
* `DesignSystemManifest` (§4: name, themes{light,dark}, tokens{color, typography, spacing,
  radius, shadow, border, opacity, motion}, semanticTokens, componentDefaults, accessibility);
* `ComponentDefinition` (§5: id, name, role, props, variants, states, layout, tokenBindings,
  children);
* `AssetResolution` (§6: assets[{role, source, editable, license, sceneNodes}]);
* `SemanticLayout` (§7: type=stack|grid, direction, gapToken, padding{...token refs}, width,
  alignment, distribution, min/max sizes, safe-area, children — recursive);
* `CritiqueReport` (§11: score, issues[{severity, nodeId, category, message,
  recommendedOperation}], approved).

Validators must reject unknown top-level fields and produce path-qualified error messages.

## Verification

Create `scripts/verify-026a-autonomous-designer.mjs` (section-based like verify-025a; later
sub-patches append sections). Section "026A.0":

* registry returns all 11 designer task definitions with correct roles/safety;
* contracts validate good fixtures and reject broken ones (one negative case per contract);
* a scene fixture with `tokens/semanticId/componentRole/themeVariant` survives
  parse → canonicalize → normalize → compile with metadata intact in compiler output;
* frame demotion (depth > 3) does not strip metadata;
* all three feature flags read as disabled by default; designer tasks unreachable when flag off;
* mirror sync gate passes.

Then run the 025A regression and report.

## Final report

```text
PATCH 026A.0 completed.
scene metadata pass-through: PASS/FAIL
mirror sync: PASS/FAIL
feature flags (default off): PASS/FAIL
prompt registry (11 tasks): PASS/FAIL
orchestrator + session cache: PASS/FAIL
contracts + validators: PASS/FAIL
verify-025a regression: PASS/FAIL
committed: hash
```
