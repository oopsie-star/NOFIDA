# PATCH 026A.6 — Canvas Capture: research spike

**Status:** decided. **Chosen mechanism:** Penpot Plugin API `shape.export()`, called from
NOFIDA's existing companion plugin sandbox and relayed to the frontend/server over the same
postMessage transport `ai-bridge.js` already uses for `extractContext`/`connectLibraries`.

## The two candidates as originally framed

- **A. Frontend canvas capture** — read pixels from the render surface in the browser
  (`toDataURL`/`toBlob` on the render canvas, or serialize+rasterize the board's SVG), scoped to
  the target board's bounding box.
- **B. Penpot export path** — trigger the built-in frame export (exporter service / RPC) for the
  board and fetch the PNG.

## What the spike found

Penpot 2.16's renderer is the Rust/WASM engine (`render-wasm`), not SVG. It draws into a real
WebGL `<canvas>` DOM element, and Penpot's OWN frontend already has a proven capture path for
this exact surface — `frontend/src/app/render_wasm/api/webgl.cljs`:

```clojure
(defn capture-canvas-snapshot-url
  "Captures the current viewport canvas as a PNG `blob:` URL ..."
  []
  ...
  (.toBlob canvas
           (fn [^js blob] ...)
           "image/png")
  ...)
```

This is used internally for file/page thumbnails — confirmation that raw `canvas.toBlob()`
against the WebGL surface is a real, working technique against this exact renderer, not a risky
guess. That's genuine prior art for "Option A" in its naive form.

However, that canvas captures the **current viewport** — whatever is currently panned/zoomed
into view — not an arbitrary board by id. Scoping a raw viewport capture to one specific board's
bounding box would require this project's own code to:

1. reverse-engineer Penpot's internal viewport pan/zoom → screen-pixel coordinate transform
   (undocumented, internal, version-coupled),
2. programmatically zoom-to-fit the target board before every capture (a timing dependency —
   capture must wait for the resulting re-render frame),
3. crop the resulting full-viewport PNG to the board's on-screen pixel rect client-side.

None of that is exposed as a stable public contract; all of it would live entirely on this
project's side of the fence and break silently on a Penpot renderer update.

**A better-informed variant of Option A exists and sidesteps all three problems.** Penpot's
public Plugin API — the same sandboxed `penpot.*` surface the companion plugin
(`branding/ai-core/plugin/`) already uses for `extractContext`/`connectLibraries` — exposes a
documented, first-class export call directly on any shape, including a board
(`plugins/libs/plugin-types/index.d.ts`):

```ts
export interface Export {
  type: 'png' | 'jpeg' | 'webp' | 'svg' | 'pdf';
  scale?: number;
  suffix?: string;
  skipChildren?: boolean;
}
// on Shape (which Board extends):
export(config: Export): Promise<Uint8Array>;
```

with the library's own usage example being, verbatim, `shape.export({ type: 'png', scale: 2 })`.

This call:

- takes a board **by reference** (`penpot.currentPage.getShapeById(boardId)`), so it works
  whether or not that board is currently in view — no viewport zoom/pan gymnastics needed;
- **crops to the shape's own bounds internally** — "capture is cropped to the board" is free,
  not something this project's code has to compute;
- accepts an explicit `scale`, satisfying "1x or 2x deterministic scale" directly;
- is a stable, versioned, documented public contract, not an internal we'd be reverse-engineering
  and could break out from under us on a Penpot point release;
- runs inside the plugin sandbox the project already has a live, working postMessage transport
  for (`ai-bridge.js`'s `transports.plugin`), so no new transport had to be invented.

## Why Option B (backend exporter-service RPC) was rejected

`docker-compose.yml` does deploy a `penpot-exporter` service (`penpotapp/exporter:2.16.0`), so
Option B is not hypothetical — it's a real, running service in this stack. It was rejected
anyway, for one concrete reason: nothing in this codebase (`branding/`, `services/`) has ever
called it. Doing so would mean reverse-engineering Penpot's internal transit-encoded export RPC
(method name, payload shape, auth) from scratch, with **no way to test it against a live
instance from this development environment**. `shape.export()` almost certainly delegates to
this same exporter service (or the WASM renderer) internally — so choosing it captures whatever
reliability/fidelity benefit the exporter service offers, via a contract that's actually
documented and already proven reachable by the existing plugin transport, for zero extra RPC
reverse-engineering risk. Given both paths likely end up at the same rendering backend, there is
no fidelity argument for hand-rolling the raw RPC instead.

## Why the naive `canvas.toBlob()` viewport-crop path was rejected

Real prior art (Penpot's own thumbnail code) proves the underlying browser API works against
this renderer — the rejection isn't about `toBlob()` being unreliable, it's that everything
**around** it (viewport-to-board coordinate mapping, zoom-to-fit timing, client-side cropping)
would be new, undocumented-contract code this project would own and maintain, for a worse result
than the one call `shape.export()` already provides for free.

## Selection criteria, scored

| Criterion | `shape.export()` | raw `canvas.toBlob()` + crop | exporter-service RPC |
|---|---|---|---|
| Fidelity to what the user sees | High (Penpot's own renderer) | High, but only for content in the current viewport | High (assumed same backend) |
| Works right after apply | Yes — board looked up by id | Only if the board is in view | Yes |
| Works after reload | Yes | Yes, once re-rendered | Yes |
| Renderer patching required | None | None | None |
| Latency | One export call | One capture + client-side crop | Network round trip + headless render |
| Production-viable (no local tooling) | Yes | Yes | Yes |
| Contract stability | Documented public API | Undocumented internal | Undocumented internal (from this project's POV) |
| Implementation risk in this environment | Low | Medium (coordinate math untestable here) | High (RPC contract unverifiable here) |

## Consequence for the implementation

- `branding/ai-core/plugin/code.js` gains a `nofida-plugin:capture-board` message handler that
  looks the board up via `penpot.currentPage.getShapeById(boardId)` and calls
  `shape.export({ type: 'png', scale })`.
- `branding/ai-core/ai-bridge.js` gains a `captureBoard(boardId, opts)` bridge method, mirroring
  the existing `extractContext()` postMessage-with-timeout pattern exactly.
- `branding/ai-core/designer/canvas-capture.js` is the policy layer above that: the
  `nofida_ai_visual_critic_v1` hard gate (mirroring `feature-flags.js`'s existing convention),
  basic client-side sanity checks, and the call into the bridge.
- The server never trusts the client's word that a capture is real — see
  `services/nofida-hub-adapter/ai/designer/capture-validator.mjs`, a pure, dependency-free PNG
  decoder used to reject an empty or single-flat-color image server-side before it's ever stored
  as a session artifact.
