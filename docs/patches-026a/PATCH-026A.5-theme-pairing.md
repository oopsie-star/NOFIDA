# PATCH 026A.5 — Paired Light/Dark Theme Generation

Role: Senior design-systems/compiler engineer.

## Baseline

* tag `nofida-stable-025A-bulk-create-v2` + approved 026A.0–026A.4 (full generation path up to
  a single-theme `screenSpec`).

## Global rules (non-negotiable)

1. LLM never emits Penpot Transit / UUIDs / `update-file` payloads.
2. `ALLOW_BULK_UPDATE=false` stays; boards are created via existing Bulk Create V2 only.
3. Theme pairing is **pure code** — no extra LLM pass: the dark board is derived from the same
   logical scene by re-resolving semantic tokens with the dark theme.
4. Disposable Penpot test files only.
5. Finish with: verify PASS, `verify-025a` regression PASS, report, one commit.

## Key files

`services/nofida-hub-adapter/ai/designer/{designer-scene-builder.mjs,layout-engine.mjs,pipeline.mjs}`,
`ai/scene/scene-canonicalizer.mjs` (nid stability from `semanticId`),
`branding/ai-core/designer/persistence-adapter.js` (idempotency store, rollback — read-only
reference, do not weaken its gates), `branding/ai-core/ai-bridge.js`.

## Tasks

### 1. Theme resolution split in the Scene Builder

The Scene Builder (026A.4) produces one **logical scene** with token bindings. Add a theme
resolver that emits two boards from it:

* identical information architecture and component hierarchy;
* identical geometry (spacing/dimensions) unless a rule-listed theme-specific reason exists
  (e.g. background vector opacity) — such deviations must be declared in `devMeta.themeDelta`;
* corresponding nodes share the logical `semanticId`; `themeVariant` field distinguishes
  `light`/`dark`; board names e.g. `Home / Day`, `Home / Night`;
* token resolution uses the respective theme from `DesignSystemManifest`;
* background treatment may adapt per `ArtDirection.themeStrategy`.

Each screen is a **top-level board** (root frame), the pair is placed side by side with a
deterministic offset.

### 2. Parity checker (pure code)

`services/nofida-hub-adapter/ai/designer/theme-parity.mjs`:

* structural diff of the two boards keyed by `semanticId`: tree shape, node types, geometry,
  layer names must match; only token-resolved values (fills, shadows, strokes) and declared
  `themeDelta` entries may differ;
* any undeclared difference → FAIL with the offending `semanticId` list;
* contrast revalidation (026A.2 checker) runs independently per board on the **resolved**
  colors.

### 3. Persistence behavior

* both boards compile through `compileScene()` create-mode in one apply;
* idempotent retry (same designer session) must not duplicate boards — reuse the existing
  pre-UUID idempotency store keyed additionally by `semanticId` root;
* rollback of the apply removes both boards (existing `del-obj` + `page-id` path).

## Verification

Append section "026A.5":

* fixture logical scene → two boards; parity checker PASS; injected undeclared geometry delta →
  parity FAIL with correct `semanticId`;
* contrast PASS independently on both resolved boards;
* compile output: two top-level boards, frame depth ≤ 3 each, zero dropped nodes;
* idempotency: repeat apply with same session key produces zero new `add-obj` (vm-sandbox test
  in the style of verify-025a section E/F);
* rollback removes both boards (assert `del-obj` set covers both roots);
* `ALLOW_BULK_UPDATE` still false and untouched.

## Final report

```text
PATCH 026A.5 completed.
paired theme resolution (pure code): PASS/FAIL
structural parity light/dark: PASS/FAIL
independent contrast revalidation: PASS/FAIL
two top-level boards, depth <= 3: PASS/FAIL
idempotent retry (no duplicates): PASS/FAIL
rollback covers both boards: PASS/FAIL
verify-025a regression: PASS/FAIL
committed: hash
```
