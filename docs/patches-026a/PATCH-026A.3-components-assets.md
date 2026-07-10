# PATCH 026A.3 — Component Architect + Asset Resolver

Role: Senior design-systems engineer.

## Baseline

* tag `nofida-stable-025A-bulk-create-v2` + approved 026A.0–026A.2 (contracts, orchestrator,
  product reasoning, art direction, design system manifest).

## Global rules (non-negotiable)

1. LLM never emits Penpot Transit / UUIDs / `update-file` payloads. No canvas mutation here.
2. Contracts from 026A.0 (`ComponentDefinition`, `AssetResolution`) are immutable.
3. Safety: no real user files, no DB writes, no infra changes, no unlicensed external hotlinks.
4. Finish with: verify PASS, `verify-025a` regression PASS, report, one commit.

## Key files

`services/nofida-hub-adapter/ai/designer/{contracts.mjs,pipeline.mjs}`,
`ai/prompt-registry.mjs` (fill `designer_component_architect`, `designer_asset_resolver`),
`ai/media-context-packer.mjs` + `branding/ai-core/nofida-resources.js` (NOFIDA media bank
access), `ai/resource-context-packer.mjs` (catalog context), `ai/hub-context-packer.mjs`.

## Task 1: Component Architect

Create `services/nofida-hub-adapter/ai/designer/component-architect.mjs`.

Input: `ProductArchitecture` + `ArtDirection` + `DesignSystemManifest`.
Output: array of `ComponentDefinition`:

```json
{
  "id": "component.prediction-card",
  "name": "PredictionCard",
  "role": "summary",
  "props": [],
  "variants": ["light", "dark"],
  "states": ["default", "loading", "error"],
  "layout": {},
  "tokenBindings": {},
  "children": []
}
```

Rules:

* recurring screen patterns become components — never a pile of unrelated rectangles
  (typical set for a calendar product: AppHeader, WeekCalendar, DateCell, PredictionCard,
  SegmentedTabs, PrimaryButton, StatusPill, CyclePhaseTimeline, MetricCard, MonthCalendar,
  CalendarDay, BottomNavigation — but the set must be **derived**, not hardcoded);
* light/dark are variants of the same component, not two components;
* `layout` uses the `SemanticLayout` contract (tokens, not pixel values);
* all style props bind to semantic tokens from the manifest (`tokenBindings`);
* layer/component names are developer-readable PascalCase;
* no unnecessary duplication: a deduplication pass merges structurally identical definitions.

## Task 2: Asset Resolver

Create `services/nofida-hub-adapter/ai/designer/asset-resolver.mjs`.

Input: `ProductArchitecture` + `ArtDirection` + component list.
Output: `AssetResolution` contract.

Resolution priority (stop at the first satisfiable source):

1. existing project assets;
2. NOFIDA media bank (via existing media/resource packers);
3. approved icon library;
4. programmatically generated vector decoration;
5. connected image-generation provider — only if configured AND required;
6. safe placeholder as last resort.

Abstract backgrounds (`imageStrategy: abstract-vector-background`):

* 3–8 large editable vector shapes expressed as `sceneNodes` (Scene Model fragments —
  ellipse/path/rectangle with `tokens.fillToken` bindings);
* never a flattened raster screenshot;
* fills bound to semantic tokens so both themes restyle the same geometry.

Icons: resolved by semantic name (`icon.calendar`, `icon.settings`); consistent stroke/fill
style across the set; colors bound to semantic tokens; **no emoji as production icons**.

Avatars: approved project/media asset if present, otherwise neutral editable placeholder;
never invent a real person.

Every asset carries `license`; anything external without a verifiable license is rejected.

## Verification

Append section "026A.3" to `scripts/verify-026a-autonomous-designer.mjs`:

* fixture artifacts (from 026A.1–2) yield contract-valid component definitions; repeated
  patterns (week-day cells, month-day cells, metric cards) are componentized — assert that
  screen sections referencing repeated content map to component `id`s;
* every `ComponentDefinition.tokenBindings` value exists in the `DesignSystemManifest`
  (pure-code cross-check);
* light/dark are variants of one definition (no `*Dark` duplicate components);
* asset resolution on the fixture returns an editable vector background (3–8 nodes, all fills
  token-bound, `editable: true`, `source: generated-vector` or better);
* zero external URLs in resolved assets; zero emoji glyphs in icon results;
* deduplication covered with a fixture containing two identical patterns.

## Final report

```text
PATCH 026A.3 completed.
component architect: PASS/FAIL
repeated patterns componentized: PASS/FAIL
token bindings resolve into manifest: PASS/FAIL
light/dark as variants: PASS/FAIL
asset resolver priority chain: PASS/FAIL
editable vector background: PASS/FAIL
no hotlinks / no emoji icons: PASS/FAIL
verify-025a regression: PASS/FAIL
committed: hash
```
