// GENERATED — mirrored from services/nofida-hub-adapter/ai/scene/scene-validator.mjs
// by scripts/sync-shared-scene.sh. Do not hand-edit; edit the source and re-run.
//
// Scene Model validator — schema/type validation, parent/child + cycle
// checks, geometry/font/asset field validation.
//
// Pure module: takes an already-parsed object, returns a normalized tree with
// no network/DOM access. Extends the original screen-spec.mjs validateNode
// logic.
//
// PATCH 025A addendum: the validator does NOT mint stable ids anymore — that
// is scene-canonicalizer.mjs's job (validation and identity are separate
// concerns; canonicalization needs to see the ALREADY-validated tree AND the
// previous turn's canonical scene to decide what's "the same node" across
// edits, which the validator has no business deciding). If the raw node
// carried its own `id` (e.g. echoed back by the model for an edit turn), it
// is preserved as `presetId` for the canonicalizer to pick up — the
// validator itself never rejects, dedupes, or falls back on it.
import {
  NODE_TYPES, UNCOMPILED_TYPES, ALIGN_VALUES, SHADOW_STYLES, GRADIENT_TYPES,
  GRADIENT_ANGLES, LAYOUT_TYPES, BLEND_MODES, MAX_NODES, MAX_DEPTH, MIN_DIM, MAX_DIM,
  MAX_SHADOW_BLUR, MAX_STROKE_WIDTH, MAX_LAYER_BLUR, resolveType,
} from "./scene-schema.js";

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function clampDim(value, fallback) {
  const n = isFiniteNumber(value) ? value : fallback;
  return Math.min(MAX_DIM, Math.max(MIN_DIM, n));
}

function validateShadow(shadow) {
  if (shadow === undefined || shadow === null) return undefined;
  if (typeof shadow !== "object" || Array.isArray(shadow)) return undefined;
  return {
    style: SHADOW_STYLES.has(shadow.style) ? shadow.style : "drop-shadow",
    offsetX: isFiniteNumber(shadow.offsetX) ? shadow.offsetX : 0,
    offsetY: isFiniteNumber(shadow.offsetY) ? shadow.offsetY : 4,
    blur: isFiniteNumber(shadow.blur) ? Math.min(MAX_SHADOW_BLUR, Math.max(0, shadow.blur)) : 12,
    spread: isFiniteNumber(shadow.spread) ? Math.min(MAX_SHADOW_BLUR, Math.max(-MAX_SHADOW_BLUR, shadow.spread)) : 0,
    color: typeof shadow.color === "string" && shadow.color.trim() ? shadow.color.trim().slice(0, 32) : "#000000",
    colorOpacity: isFiniteNumber(shadow.colorOpacity) ? Math.min(1, Math.max(0, shadow.colorOpacity)) : 0.24,
  };
}

function validateGradient(gradient) {
  if (gradient === undefined || gradient === null) return undefined;
  if (typeof gradient !== "object" || Array.isArray(gradient)) return undefined;
  if (!GRADIENT_TYPES.has(gradient.type)) return undefined;
  const rawStops = Array.isArray(gradient.stops) ? gradient.stops : [];
  const stops = rawStops
    .filter((s) => s && typeof s.color === "string" && s.color.trim())
    .slice(0, 6)
    .map((s, i) => ({
      color: s.color.trim().slice(0, 32),
      offset: isFiniteNumber(s.offset) ? Math.min(1, Math.max(0, s.offset)) : (i / Math.max(1, rawStops.length - 1)),
      opacity: isFiniteNumber(s.opacity) ? Math.min(1, Math.max(0, s.opacity)) : undefined,
    }));
  if (stops.length < 2) return undefined;
  return { type: gradient.type, angle: GRADIENT_ANGLES.has(gradient.angle) ? gradient.angle : "vertical", stops };
}

function validateLayout(layout, path, errors) {
  if (layout === undefined || layout === null) return undefined;
  if (typeof layout !== "object" || Array.isArray(layout)) {
    errors.push(`${path}.layout must be an object`);
    return undefined;
  }
  if (!LAYOUT_TYPES.has(layout.type)) {
    errors.push(`${path}.layout.type must be "flex" or "grid"`);
    return undefined;
  }
  return {
    type: layout.type,
    dir: typeof layout.dir === "string" ? layout.dir : undefined,
    wrap: typeof layout.wrap === "string" ? layout.wrap : undefined,
    alignItems: typeof layout.alignItems === "string" ? layout.alignItems : undefined,
    justifyContent: typeof layout.justifyContent === "string" ? layout.justifyContent : undefined,
    justifyItems: typeof layout.justifyItems === "string" ? layout.justifyItems : undefined,
    gap: isFiniteNumber(layout.gap) ? layout.gap : undefined,
    rowGap: isFiniteNumber(layout.rowGap) ? layout.rowGap : undefined,
    columnGap: isFiniteNumber(layout.columnGap) ? layout.columnGap : undefined,
    padding: isFiniteNumber(layout.padding) ? layout.padding : undefined,
  };
}

function validateMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return undefined;
  const out = {};
  const keys = Object.keys(metadata).slice(0, 20);
  for (const key of keys) {
    const v = metadata[key];
    if (typeof v === "string") out[key.slice(0, 40)] = v.slice(0, 200);
    else if (typeof v === "number" && Number.isFinite(v)) out[key.slice(0, 40)] = v;
    else if (typeof v === "boolean") out[key.slice(0, 40)] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

// `visited` guards against structural cycles (the same node object reachable
// twice in the tree — can't happen from freshly-parsed JSON, but is cheap
// insurance against a caller handing in a hand-built object graph).
function validateNode(raw, path, depth, ctx, isRoot) {
  const { counter, errors, warnings, visited } = ctx;

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    errors.push(`${path} must be an object`);
    return null;
  }
  if (visited.has(raw)) {
    errors.push(`${path} introduces a cycle (same node object reachable twice)`);
    return null;
  }
  visited.add(raw);

  counter.n += 1;
  if (counter.n > MAX_NODES) {
    errors.push(`too many nodes (max ${MAX_NODES})`);
    return null;
  }
  if (depth > MAX_DEPTH) {
    errors.push(`${path} exceeds max nesting depth (${MAX_DEPTH})`);
    return null;
  }

  const type = resolveType(raw.type, isRoot);
  if (!NODE_TYPES.has(type)) {
    errors.push(`${path}.type must be one of ${[...NODE_TYPES].join("|")}`);
    return null;
  }
  if (UNCOMPILED_TYPES.has(type)) {
    warnings.push(`${path}: type "${type}" is schema-recognized but has no direct Penpot equivalent — the compiler will lower it to a primitive or, with allowPartial=false (default), refuse to compile the scene`);
  }

  const node = {
    type,
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 80) : (isRoot ? "Screen" : type),
    x: isFiniteNumber(raw.x) ? raw.x : 0,
    y: isFiniteNumber(raw.y) ? raw.y : 0,
    width: clampDim(raw.width, type === "text" ? 120 : 100),
    height: clampDim(raw.height, type === "text" ? 32 : 100),
  };

  // Preserved verbatim for scene-canonicalizer.mjs — the validator never
  // mints, dedupes, or rejects based on this.
  if (typeof raw.id === "string" && raw.id.trim()) node.presetId = raw.id.trim().slice(0, 64);

  if (typeof raw.fill === "string" && raw.fill.trim()) node.fill = raw.fill.trim().slice(0, 32);
  if (isFiniteNumber(raw.fillOpacity)) node.fillOpacity = Math.min(1, Math.max(0, raw.fillOpacity));

  // Whole-node properties (PART1: rotation/opacity/visible + clip/mask/
  // blend-mode) — recognized on every node type so isFlattenSafe() in
  // scene-normalizer.mjs can protect nodes that carry them, even though the
  // compiler's own support for some of these is still partial (see
  // penpot-shape-adapter.mjs).
  if (isFiniteNumber(raw.rotation)) node.rotation = ((raw.rotation % 360) + 360) % 360;
  if (isFiniteNumber(raw.opacity)) node.opacity = Math.min(1, Math.max(0, raw.opacity));
  if (raw.visible === false) node.visible = false;
  if (raw.clip === true) node.clip = true;
  if (raw.mask === true) node.mask = true;
  if (typeof raw.blendMode === "string" && BLEND_MODES.has(raw.blendMode) && raw.blendMode !== "normal") {
    node.blendMode = raw.blendMode;
  }
  const metadata = validateMetadata(raw.metadata);
  if (metadata) node.metadata = metadata;
  if (typeof raw.semanticRole === "string" && raw.semanticRole.trim()) {
    node.semanticRole = raw.semanticRole.trim().slice(0, 40);
  }

  if (type !== "text" && type !== "component-instance") {
    if (isFiniteNumber(raw.borderRadius)) node.borderRadius = Math.min(999, Math.max(0, raw.borderRadius));
    for (const corner of ["borderRadiusTopLeft", "borderRadiusTopRight", "borderRadiusBottomLeft", "borderRadiusBottomRight"]) {
      if (isFiniteNumber(raw[corner])) node[corner] = Math.min(999, Math.max(0, raw[corner]));
    }
    const gradient = validateGradient(raw.gradient);
    if (gradient) node.gradient = gradient;
  }

  const shadow = validateShadow(raw.shadow);
  if (shadow) node.shadow = shadow;
  if (isFiniteNumber(raw.blur)) node.blur = Math.min(MAX_LAYER_BLUR, Math.max(0, raw.blur));

  if (typeof raw.strokeColor === "string" && raw.strokeColor.trim()) {
    node.strokeColor = raw.strokeColor.trim().slice(0, 32);
    node.strokeWidth = isFiniteNumber(raw.strokeWidth) ? Math.min(MAX_STROKE_WIDTH, Math.max(0.5, raw.strokeWidth)) : 1;
    node.strokeOpacity = isFiniteNumber(raw.strokeOpacity) ? Math.min(1, Math.max(0, raw.strokeOpacity)) : 1;
  }

  if (type === "text") {
    const content = typeof raw.content === "string" ? raw.content : (typeof raw.text === "string" ? raw.text : "");
    if (!content.trim()) {
      errors.push(`${path} (text) is missing "content"`);
      return null;
    }
    node.content = content.slice(0, 400);
    if (isFiniteNumber(raw.fontSize)) node.fontSize = Math.min(200, Math.max(6, raw.fontSize));
    if (typeof raw.fontWeight === "string") node.fontWeight = raw.fontWeight.slice(0, 16);
    if (ALIGN_VALUES.has(raw.align)) node.align = raw.align;
    return node;
  }

  if (type === "component-instance") {
    const libraryId = typeof raw.libraryId === "string" ? raw.libraryId.trim() : "";
    const componentId = typeof raw.componentId === "string" ? raw.componentId.trim() : "";
    if (!libraryId || !componentId) {
      errors.push(`${path} (component-instance) needs both "libraryId" and "componentId" — only reference components listed in the connected-libraries context`);
      return null;
    }
    node.libraryId = libraryId.slice(0, 80);
    node.componentId = componentId.slice(0, 80);
    return node;
  }

  // button/input carry an OPTIONAL label, unlike text (where content is
  // required) — captured here so scene-compiler.mjs's lowerNode() has
  // something to build a label from when it lowers these to rect+text.
  if (type === "button" || type === "input") {
    if (typeof raw.content === "string" && raw.content.trim()) node.content = raw.content.slice(0, 400);
    if (isFiniteNumber(raw.fontSize)) node.fontSize = Math.min(200, Math.max(6, raw.fontSize));
    if (typeof raw.fontWeight === "string") node.fontWeight = raw.fontWeight.slice(0, 16);
    if (ALIGN_VALUES.has(raw.align)) node.align = raw.align;
    if (typeof raw.textColor === "string" && raw.textColor.trim()) node.textColor = raw.textColor.trim().slice(0, 32);
  }

  // Leaf visual types with no children (rectangle/ellipse/line/path/image/
  // icon/button/input) — validated generically, no recursion.
  if (!["frame", "section", "stack", "group", "card"].includes(type)) {
    return node;
  }

  // Grouping types (frame + section/stack/group/card) recurse into children.
  const layout = validateLayout(raw.layout, path, errors);
  if (layout) node.layout = layout;

  const rawChildren = Array.isArray(raw.children) ? raw.children : [];
  node.children = [];
  for (let i = 0; i < rawChildren.length; i++) {
    const child = validateNode(rawChildren[i], `${path}.children[${i}]`, depth + 1, ctx, false);
    if (child) node.children.push(child);
    if (counter.n > MAX_NODES) break;
  }
  return node;
}

/** Validates an already-parsed object. Returns { ok, scene, errors, warnings }. */
export function validateScene(raw) {
  const ctx = { counter: { n: 0 }, errors: [], warnings: [], visited: new WeakSet() };
  const scene = validateNode(raw, "root", 0, ctx, true);
  if (!scene || ctx.errors.length > 0) return { ok: false, scene: null, errors: ctx.errors, warnings: ctx.warnings };
  return { ok: true, scene, errors: [], warnings: ctx.warnings };
}

function extractJsonCandidate(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{")) return trimmed;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) return fenced[1].trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return null;
}

/** Parses + validates raw model output text. Returns { ok, scene, error, warnings }. */
export function parseScene(rawText) {
  const candidate = extractJsonCandidate(rawText);
  if (!candidate) return { ok: false, scene: null, error: "no JSON object found in the model's response", warnings: [] };

  let parsed;
  try {
    parsed = JSON.parse(candidate);
  } catch (err) {
    return { ok: false, scene: null, error: `invalid JSON: ${err.message}`, warnings: [] };
  }

  const result = validateScene(parsed);
  if (!result.ok) return { ok: false, scene: null, error: result.errors.join("; ") || "spec failed validation", warnings: result.warnings };
  return { ok: true, scene: result.scene, error: null, warnings: result.warnings };
}
