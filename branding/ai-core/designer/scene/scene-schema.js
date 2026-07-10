// GENERATED — mirrored from services/nofida-hub-adapter/ai/scene/scene-schema.mjs
// by scripts/sync-shared-scene.sh. Do not hand-edit; edit the source and re-run.
//
// NOFIDA Design Scene Model — canonical schema/constants (PATCH 025A).
//
// This is the formalized successor to the original "Screen Spec" IR (the shape
// this module describes is unchanged on the wire — callers still see a
// `screenSpec` field — this module just gives the tree's node types and limits
// names and separates them from validation/normalization/compilation, which
// each now live in their own sibling module).
//
// Pure module: no DOM, no window, no fetch, no network, no environment access.
// Safe to `import` from Node (services/nofida-hub-adapter) or load as a real
// ES module in the browser (branding/ai-core/designer/scene/ is a generated,
// byte-identical mirror of this directory — see scripts/sync-shared-scene.sh).

// Canonical node types the schema recognizes. "frame" is a REAL Penpot frame
// (board) — the only type that can nest further real frames. section/stack/
// group/card are grouping types that never become Penpot frames themselves;
// the normalizer/compiler turn them into Penpot groups (or flatten them away)
// specifically to avoid the deep-frame-nesting WASM rendering bug that
// motivated this patch (see scene-normalizer.mjs).
export const NODE_TYPES = new Set([
  "frame", "section", "stack", "group", "card",
  "rectangle", "ellipse", "line", "path",
  "text", "image", "icon", "button", "input",
  "component-instance",
]);

// Grouping types: containers that hold children. "frame" is a grouping type
// too but is handled separately everywhere (it's the only one that can carry
// its own paint natively in Penpot's schema — see scene-compiler.mjs).
export const GROUPING_TYPES = new Set(["frame", "section", "stack", "group", "card"]);
export const NON_FRAME_GROUPING_TYPES = new Set(["section", "stack", "group", "card"]);

// v1 compiler scope — these types are schema-recognized (validator/normalizer
// accept them) but scene-compiler.mjs does not yet know how to build real
// Penpot shapes for them; it skips them with an explicit diagnostic rather
// than silently dropping or mis-rendering them. Matches the graceful
// degradation already used for unresolved "component-instance" references.
export const UNCOMPILED_TYPES = new Set(["line", "path", "image", "icon", "button", "input"]);

// Legacy aliases from the original Screen Spec schema — accepted so existing
// thread-store history and in-flight prompts keep working unchanged.
export const TYPE_ALIASES = {
  board: "frame",
  rect: "rectangle",
  component: "component-instance",
};

export const ALIGN_VALUES = new Set(["left", "center", "right", "justify"]);
export const SHADOW_STYLES = new Set(["drop-shadow", "inner-shadow"]);
export const GRADIENT_TYPES = new Set(["linear", "radial"]);
export const GRADIENT_ANGLES = new Set(["vertical", "horizontal", "diagonal"]);
export const LAYOUT_TYPES = new Set(["flex", "grid"]);
export const BLEND_MODES = new Set([
  "normal", "darken", "multiply", "color-burn", "lighten", "screen",
  "color-dodge", "overlay", "soft-light", "hard-light", "difference",
  "exclusion", "hue", "saturation", "color", "luminosity",
]);

export const MAX_NODES = 140;
export const MAX_DEPTH = 8;
export const MIN_DIM = 1;
export const MAX_DIM = 4000;
export const MAX_SHADOW_BLUR = 120;
export const MAX_STROKE_WIDTH = 40;
export const MAX_LAYER_BLUR = 60;

// Render-safe normalization limits (PATCH 025A) — the actual fix for the
// blank-canvas bug: real Penpot frames nested past this depth silently fail
// to paint on the WASM canvas (confirmed live on a 95-object screen; matches
// open upstream Penpot issues #8520/#9162/#8085 about nested frame content).
export const MAX_FRAME_DEPTH = 3;
export const MAX_GROUP_DEPTH = 4;

export const ROOT_FRAME_ID = "00000000-0000-0000-0000-000000000000";
export const DEFAULT_FONT = "sourcesanspro";

// PATCH 026A.0 — designer token-binding metadata. Every node may carry a
// `tokens` object referencing design-system tokens by name (resolved to
// actual values upstream, in the design-system-generator stage — 026A.4 —
// not here); the validator only type-checks category names and string
// values, it never resolves or looks up a token. See scene-validator.mjs's
// validateTokens() and penpot-shape-adapter.mjs's buildFields() for the two
// places this schema addition is actually consumed.
export const TOKEN_CATEGORIES = new Set([
  "fillToken", "textStyleToken", "radiusToken", "gapToken", "strokeToken", "shadowToken",
]);
export const THEME_VARIANTS = new Set(["light", "dark"]);

export function resolveType(rawType, isRoot) {
  if (isRoot) return "frame";
  const t = typeof rawType === "string" ? rawType : "";
  return TYPE_ALIASES[t] || t;
}

export const SCENE_SPEC_PROMPT_BLOCK = `
Output format — respond with ONLY a single JSON object (no prose, no markdown fences), matching this schema exactly:

{
  "name": "Screen name",
  "width": 360, "height": 800,
  "fill": "#0B1020",
  "children": [
    { "type": "rectangle", "name": "...", "x": 0, "y": 0, "width": 360, "height": 220,
      "gradient": { "type": "linear", "angle": "diagonal", "stops": [{ "color": "#2563EB", "offset": 0 }, { "color": "#1D4ED8", "offset": 1 }] } },
    { "type": "text", "name": "...", "x": 24, "y": 64, "width": 312, "height": 40, "content": "Actual copy, not placeholder", "fontSize": 24, "fontWeight": "700", "fill": "#FFFFFF", "align": "left" },
    { "type": "card", "name": "Card", "x": 24, "y": 250, "width": 312, "height": 160, "fill": "#131E35", "borderRadius": 16,
      "shadow": { "style": "drop-shadow", "offsetX": 0, "offsetY": 8, "blur": 24, "spread": 0, "color": "#000000", "colorOpacity": 0.24 },
      "layout": { "type": "flex", "dir": "column", "gap": 8, "padding": 16 },
      "children": [ { "type": "text", "name": "...", "x": 40, "y": 266, "width": 280, "height": 24, "content": "...", "fontSize": 14, "fill": "#E2E8F0" } ]
    }
  ]
}

Rules for this format:
- "type" is one of "frame" (a real Penpot board — use ONLY for the screen root or a genuinely independent sub-screen area, never nest more than 3 deep), "section"/"stack"/"card" (grouping containers for layout/visual grouping — prefer these over "frame" for anything inside the screen), "group" (a plain grouping container with no special semantics), "rectangle" (solid shape, no children), "ellipse" (solid oval/circle, no children), "text" (leaf, needs "content"), "component-instance" (an instance of a real, existing library component — needs "libraryId" and "componentId", no other visual properties).
- Real Penpot frames ("frame") are expensive to nest — keep real-frame nesting to at most 2-3 levels (screen root counts as one). For everything else — cards, sections inside a screen, grouped rows — use "section"/"stack"/"card"/"group", not "frame". Over-nesting "frame" is a rendering bug, not just a style choice.
- If the context below lists connected libraries with components (buttons, inputs, avatars, etc.), PREFER a "component-instance" node over hand-drawing an equivalent rectangle/text combo — real components are always the better choice when one fits. Only use its "libraryId"/"componentId" exactly as listed; never invent one.
- x/y are ABSOLUTE page coordinates for every node, not relative to the parent — compute them so children visually sit inside their parent's bounds.
- Use real, specific copy in every "content" field — never "Lorem ipsum" or "Text here".
- Keep the whole tree under ${MAX_NODES} nodes and ${MAX_DEPTH} levels deep.
- Mobile screen widths are typically 360-430px; pick a real height for the content, not an arbitrary guess.
- Colors are hex strings like "#2563EB".

Design quality — you are a senior product designer executing this yourself, not describing what someone else should do. Every rule below is a concrete decision, not a vibe:

Spacing & grid:
- Everything sits on an 8pt grid: x/y/width/height/gap/padding are multiples of 4 (8 preferred). No 13px or 27px paddings — that reads as unplanned.
- Screen margins: 20-24px from the screen edge to content, consistently on both sides. Never let content touch the edge.
- Group related fields with 8-12px gap; separate unrelated groups/sections with 24-32px. The gap size itself communicates relationship — don't use the same gap for "these two things belong together" and "these are different sections."
- Touch targets (buttons, inputs, tappable rows) are at least 44-48px tall — this is a real usability floor, not a style preference.

Typography (pick ONE scale for the whole screen and stick to it):
- Display/hero: 28-32px, weight 700-800 — at most once per screen.
- Title/section header: 20-22px, weight 700.
- Body: 15-16px, weight 400-500 — this is what most text on screen should be.
- Secondary/meta: 13px, weight 400-500, muted color.
- Caption/label: 11-12px, weight 600, often uppercase with letter-spacing implied by content casing.
- Line-height is implicit in each text node's "height" — leave ~1.4x fontSize for multi-line body text, ~1.2x for single-line headings.

Color & hierarchy:
- One accent color used deliberately (primary buttons, active states, the one gradient hero) — everything else is neutral (background/surface/border/text grays). A screen using 5 saturated colors looks like a toy, not a product.
- Text contrast: primary text near-white/near-black against its surface, secondary text at ~60-70% opacity/muted tone, disabled/placeholder at ~40%. Never place mid-gray text on a busy gradient.
- Dark UI base grays: background darkest, surface one step lighter, elevated surface (cards, sheets) one step lighter still — 3 tiers is enough.

Depth & materials:
- Give elevated surfaces (cards, sheets, nav bars, floating buttons) a "shadow" — offsetY 4-8, blur 16-24, color black at 15-25% opacity. Flat rectangles stacked with no shadow read as a wireframe, not a product.
- Use "gradient" for at most one or two hero/accent areas per screen (a top banner, a primary CTA, an avatar background) — never on every rectangle; restraint reads as premium, gradient-everywhere reads as generated.
- Vary "borderRadius" by role, not randomly: 20-28 for large cards/sheets, 10-14 for buttons/inputs/chips, 999 for pills/avatars/tags. Using one radius for everything is a tell that no thought went into it.
- Use "strokeColor"/"strokeWidth" (1px, 10-20% opacity) for hairline dividers or secondary/outlined buttons instead of another filled rectangle — not every boundary needs a fill.

Composition patterns for common screen archetypes (use as a starting structure, adapt to the actual request):
- Auth/login/signup: logo or icon mark top area → title + one-line subtitle → stacked labeled inputs (label above field, not placeholder-only) → primary button full-width → secondary text link below (e.g. "Forgot password?", "Create account"). Inputs are cards with a subtle fill+stroke, not bare rectangles.
- List/feed: a header (title + optional action icon), then repeating row items with consistent internal padding and a divider or gap between them, not both.
- Profile/detail card: avatar (circular, via "ellipse" or borderRadius 999) top or leading, name as title-weight text, secondary meta line below it, actions (buttons/icons) trailing or below.
- Dashboard/stats: a grid or row of compact metric cards (label + big number + optional trend), each with its own subtle surface and shadow, not one giant undifferentiated block.
- Empty/settings/form states still need real hierarchy — a heading, grouped fields or rows, and one clear primary action; never a flat list of identical unstyled rows.

What reads as AI-generated and must be avoided:
- Every element the exact same fontSize/color/radius.
- No shadows anywhere, or shadows on everything.
- Text that's obviously placeholder ("Item 1", "Description goes here").
- Elements touching the screen edge or each other with zero gap.
- A single gradient background is fine; five different gradients on one screen is not.
- Real Penpot frames nested more than 2-3 levels deep — use "card"/"section"/"group" instead.
`.trim();
