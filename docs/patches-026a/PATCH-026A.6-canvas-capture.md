# PATCH 026A.6 — Canvas Capture Infrastructure (independent; prerequisite for the Visual Critic)

Role: Senior frontend/infra engineer.

## Baseline

* tag `nofida-stable-025A-bulk-create-v2` + approved 026A.0 (feature flags, orchestrator).
  Independent of 026A.1–026A.5 — can run in parallel with them.

## Problem

The repository has **no** capture of the rendered canvas. The Visual Critic (026A.7) requires a
screenshot of a generated board. Existing related pieces:

* `services/nofida-hub-adapter/server.mjs:39` already accepts base64 reference screenshots in
  request bodies (input to the LLM) — reuse this transport/format;
* `branding/ai-core/ai-bridge.js` orchestrates apply on the frontend and is the natural capture
  point (the user's browser has the rendered board);
* Playwright specs under `.codex-temp/penpot-2.16.0/` are vendored upstream Penpot,
  **not** NOFIDA code — do not build on `.codex-temp`.

## Global rules (non-negotiable)

1. Do not modify Penpot renderer source. Do not touch Caddy/Postgres/Valkey.
2. Capture must be gated behind `nofida_ai_visual_critic_v1` (default off).
3. Disposable test files only.
4. Finish with: verify PASS, `verify-025a` regression PASS, report, one commit.

## Task 1: research spike (timeboxed, documented)

Evaluate the two candidate mechanisms and pick one; record the decision and rejected
alternative in `docs/nofida-canvas-capture-026a.md`:

* **A. Frontend canvas capture** — read pixels from the WASM/SVG render surface in the browser
  (`toDataURL`/`toBlob` on the render canvas, or serialize+rasterize the board's SVG), scoped
  to the target board's bounding box.
* **B. Penpot export path** — trigger the built-in frame export (exporter service / RPC) for
  the board and fetch the PNG.

Selection criteria: fidelity to what the user actually sees; works right after apply and after
reload; no renderer patching; latency; works in production deployment (no local-only tooling).

## Task 2: implementation

Create `branding/ai-core/designer/canvas-capture.js` (+ server receiving endpoint in
`server.mjs` reusing the existing base64 screenshot format):

* `captureBoard(boardId) → { pngBase64, width, height, scale, capturedAt }`;
* capture is cropped to the board, at 1x or 2x deterministic scale;
* explicit failure signal `{ error: "capture_unavailable", reason }` — never a silent skip and
  never a blank image passed on as success (reject images that are a single flat color);
* server stores the capture as a designer-session artifact (026A.0 store) keyed by board
  `semanticId` root + revision;
* wire a bridge hook: after a designer apply completes (and after reload on an existing
  session), capture can be requested by the pipeline.

## Verification

Append section "026A.6" to `scripts/verify-026a-autonomous-designer.mjs` plus a live check:

* unit: capture result validator rejects empty/flat images, accepts a real PNG fixture;
* live (behind `NOFIDA_AI_VERIFY_LIVE=1`, disposable file): create a small test board via the
  existing 025A path, capture it, assert non-empty PNG with expected aspect ratio; reload the
  file and capture again successfully;
* flag off → capture endpoints refuse;
* failure path: capture on a non-existent board returns the structured error.

## Final report

```text
PATCH 026A.6 completed.
mechanism chosen: A/B + doc link
capture returns valid PNG (live): PASS/FAIL
works after reload: PASS/FAIL
flat/blank image rejected: PASS/FAIL
structured failure signal: PASS/FAIL
gated behind nofida_ai_visual_critic_v1: PASS/FAIL
renderer source untouched: PASS/FAIL
verify-025a regression: PASS/FAIL
committed: hash
```
