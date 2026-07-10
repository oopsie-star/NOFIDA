# PATCH 026A.4 — Layout Engine + Scene Builder + Token Coverage

Role: Senior layout/compiler engineer.

## Baseline

* tag `nofida-stable-025A-bulk-create-v2` + approved 026A.0–026A.3 (contracts, orchestrator,
  product reasoning, design system, components, assets).

## Global rules (non-negotiable)

1. LLM never emits Penpot Transit / UUIDs / `update-file` payloads. The output of this
   sub-patch is a `screenSpec` consumed by the **existing** 025A pipeline
   (`parseScene()` → … → `compileScene()`), nothing lower.
2. `ALLOW_BULK_UPDATE=false` stays.
3. The Layout Engine is **pure code, no LLM**. The `designer_layout_planner` LLM task only maps
   screen sections to `SemanticLayout` trees; geometry math is deterministic.
4. Any `ai/scene/` change → `scripts/sync-shared-scene.sh` + `check-shared-scene-sync.sh`.
5. Never silently drop nodes; no partial compile by default.
6. Finish with: verify PASS, `verify-025a` regression PASS, mirror gate PASS, report,
   one commit.

## Key files

`services/nofida-hub-adapter/ai/scene/scene-schema.mjs` (`MAX_NODES=140`, `MAX_FRAME_DEPTH=3`,
absolute-coordinate node format), `scene-validator.mjs`, `scene-compiler.mjs`,
`ai/designer/{contracts.mjs,pipeline.mjs}`, `ai/prompt-registry.mjs`
(fill `designer_layout_planner`, `designer_scene_builder`).

## Task 1: Layout Engine (pure code)

Create `services/nofida-hub-adapter/ai/designer/layout-engine.mjs`.

Input: `SemanticLayout` tree (026A.0 contract) + `DesignSystemManifest` (token → px resolution)
+ platform frame (e.g. 393×852, safeArea).
Output: Scene Model subtree with explicit absolute geometry, ready for `parseScene()`.

Supported semantics (from master spec §7): vertical/horizontal stack; grid; alignment;
distribution; padding; gap; min/max sizes; fixed/flexible dimensions; safe-area offsets;
responsive constraints (stored as metadata for handoff); content hugging; fill container.

Example input the engine must handle:

```json
{
  "type": "stack",
  "direction": "vertical",
  "gapToken": "spacing.16",
  "padding": { "left": "spacing.20", "right": "spacing.20", "top": "spacing.16", "bottom": "spacing.24" },
  "width": "fill",
  "children": []
}
```

Requirements:

* token refs (`spacing.*`, `radius.*`) resolved through the manifest; resolved px goes into
  geometry, the token ref goes into node `tokens.*` metadata (026A.0 fields);
* text measurement: use a deterministic approximation table per typography style (documented),
  so "hug" heights are reproducible;
* **node budgeting**: count nodes per board against `MAX_NODES`; on overflow apply documented
  degradation (merge decorative vectors, simplify repeated cells) — never silent dropping. If
  the fixture cannot fit even degraded, raise `MAX_NODES` in `scene-schema.mjs` with a comment
  stating the new bound's rationale, run mirror sync, and extend verify-025a for the new limit;
* keep real frame depth ≤ 3 by construction (boards → sections as groups/frames per 025A
  normalizer rules).

## Task 2: Layout Planner (LLM)

`designer_layout_planner` prompt: input = screen sections + component definitions + art
direction density; output = `SemanticLayout` tree per screen referencing component `id`s and
spacing/radius tokens only. No pixel values allowed in its output — validator rejects numbers
where tokens are expected.

## Task 3: Scene Builder

Create `services/nofida-hub-adapter/ai/designer/designer-scene-builder.mjs`.

Combines: product structure + design system + components + assets + layout-engine geometry +
content into one `screenSpec` per screen, compatible with existing `parseScene()`.

Every generated node carries: stable `semanticId` (`<screen-id>/<component>/<part>`),
meaningful layer name, `componentRole`, token bindings, layout metadata, `themeVariant`,
`devMeta` where relevant. No hardcoded Penpot IDs.

## Task 4 (pure code): token-coverage validator

`services/nofida-hub-adapter/ai/designer/token-coverage.mjs`, run by the pipeline after scene
building:

* 100% of color usage token-bound (image content exempt);
* 100% of text nodes bound to a typography token;
* ≥ 95% of spacing/radius values token-bound;
* unbound values allowed only with explicit `devMeta.localOverride: "<reason>"`;
* overall `tokenCoverage >= 95%` gate — pipeline fails the stage below thresholds.

## Verification

Append section "026A.4":

* layout-engine unit suite: vertical/horizontal stack, grid, padding, gap, fill vs hug,
  safe-area, min/max → exact expected coordinates (golden values);
* fixture screen (light variant artifacts from 026A.1–3) → `screenSpec` that passes
  `parseScene()` and `compileScene()` create-mode with zero dropped nodes;
* real frame depth ≤ 3 in compiler output; node count within budget (report the number);
* token-coverage report meets all three thresholds on the fixture;
* layout-planner output with pixel literals is rejected by the contract validator;
* mirror gate + verify-025a regression PASS (mandatory if `scene-schema.mjs` was touched).

## Final report

```text
PATCH 026A.4 completed.
layout engine (pure code, golden tests): PASS/FAIL
layout planner (token-only output): PASS/FAIL
scene builder → parseScene/compileScene: PASS/FAIL
frame depth <= 3: PASS/FAIL
node budget (count = N, limit = M): PASS/FAIL
token coverage color/text/spacing: %, %, % — PASS/FAIL
silently dropped nodes: 0 — PASS/FAIL
mirror sync + verify-025a regression: PASS/FAIL
committed: hash
```
