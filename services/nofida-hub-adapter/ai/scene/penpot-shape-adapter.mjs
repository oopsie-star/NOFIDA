// Per-node-type plain-field builders — Scene Model node -> Penpot raw
// persisted-shape fields (kebab-case, matches Penpot 2.16.0's
// app/common/types/shape.cljc). PURE: returns plain JSON-serializable data,
// no transit tags, no ids, no network. scene-compiler.mjs calls these while
// walking the tree; transit-adapter.js (browser-only) does the final
// wire-encoding step.
//
// Field names and geometry shape (selrect/points/transform) match what the
// pre-025A ShapeBuilder in ai-bridge.js already proved renders correctly via
// direct update-file writes — this is a straight extraction, not a redesign
// of the wire schema itself.

import { DEFAULT_FONT } from "./scene-schema.mjs";

function point(x, y) {
  return { __tag: "point", x, y };
}

function matrixIdentity() {
  return { __tag: "matrix", a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

function rectGeom(x, y, w, h) {
  return { __tag: "rect", x, y, width: w, height: h, x1: x, y1: y, x2: x + w, y2: y + h };
}

export function geometryFor(x, y, w, h) {
  return {
    x, y, width: w, height: h,
    selrect: rectGeom(x, y, w, h),
    points: [point(x, y), point(x + w, y), point(x + w, y + h), point(x, y + h)],
    transform: matrixIdentity(),
    "transform-inverse": matrixIdentity(),
  };
}

function solidFill(hex, opacity) {
  if (!hex) return undefined;
  return [{ "fill-color": String(hex), "fill-opacity": typeof opacity === "number" ? opacity : 1 }];
}

// Gradients are out of scope for v1 — use the first stop as a flat solid
// fill rather than dropping the fill entirely (matches the pre-025A scope).
export function fillsFor(node) {
  if (node.gradient && Array.isArray(node.gradient.stops) && node.gradient.stops.length) {
    const first = node.gradient.stops[0];
    return solidFill(first.color, first.opacity);
  }
  if (node.fill) return solidFill(node.fill, node.fillOpacity);
  return undefined;
}

export function hasOwnPaint(node) {
  return !!(
    node.fill || node.gradient || node.strokeColor || node.shadow || node.blur ||
    (typeof node.borderRadius === "number" && node.borderRadius > 0)
  );
}

export function cornerRadiiFor(node) {
  const out = {};
  let has = false;
  if (typeof node.borderRadius === "number") { out.r1 = out.r2 = out.r3 = out.r4 = node.borderRadius; has = true; }
  if (typeof node.borderRadiusTopLeft === "number") { out.r1 = node.borderRadiusTopLeft; has = true; }
  if (typeof node.borderRadiusTopRight === "number") { out.r2 = node.borderRadiusTopRight; has = true; }
  if (typeof node.borderRadiusBottomRight === "number") { out.r3 = node.borderRadiusBottomRight; has = true; }
  if (typeof node.borderRadiusBottomLeft === "number") { out.r4 = node.borderRadiusBottomLeft; has = true; }
  return has ? out : undefined;
}

export function strokeFor(node) {
  if (!node.strokeColor) return undefined;
  return {
    strokes: [{
      "stroke-color": node.strokeColor,
      "stroke-width": typeof node.strokeWidth === "number" ? node.strokeWidth : 1,
      "stroke-opacity": typeof node.strokeOpacity === "number" ? node.strokeOpacity : 1,
      "stroke-style": "solid",
      "stroke-alignment": "inner",
    }],
  };
}

export function shadowFor(node) {
  if (!node.shadow) return undefined;
  const s = node.shadow;
  return {
    shadow: [{
      style: s.style || "drop-shadow",
      "offset-x": s.offsetX || 0,
      "offset-y": s.offsetY || 4,
      blur: typeof s.blur === "number" ? s.blur : 12,
      spread: typeof s.spread === "number" ? s.spread : 0,
      color: { color: s.color || "#000000", opacity: typeof s.colorOpacity === "number" ? s.colorOpacity : 0.24 },
    }],
  };
}

export function blurFor(node) {
  if (typeof node.blur !== "number" || node.blur <= 0) return undefined;
  return { blur: [{ type: "layer-blur", value: node.blur, hidden: false }] };
}

function clampFontWeight(w) {
  return Number(w) >= 600 ? "700" : "400";
}

function fontVariantFor(weightStr) {
  return weightStr === "700" ? "bold" : "regular";
}

export function textContentFor(node) {
  const weightStr = clampFontWeight(node.fontWeight);
  const fontSize = String(node.fontSize || 14);
  const fills = fillsFor(node) || [{ "fill-color": "#000000", "fill-opacity": 1 }];
  const leaf = {
    text: String(node.content || ""),
    "font-family": DEFAULT_FONT, "font-id": DEFAULT_FONT,
    "font-size": fontSize, "font-weight": weightStr, "font-variant-id": fontVariantFor(weightStr),
    "text-align": node.align || "left", fills,
  };
  const paragraph = {
    type: "paragraph",
    "font-family": DEFAULT_FONT, "font-id": DEFAULT_FONT,
    "font-size": fontSize, "font-weight": weightStr, "font-variant-id": fontVariantFor(weightStr),
    "text-align": node.align || "left", fills,
    children: [leaf],
  };
  return { type: "root", children: [{ type: "paragraph-set", children: [paragraph] }] };
}

// Builds the full plain-field set for one node given its resolved Penpot
// `kind` ("frame" | "group" | "rect" | "circle" | "text"). Used identically
// by scene-compiler's create-mode walk and its update-mode field snapshot, so
// diffing compares apples to apples.
export function buildFields(node, kind) {
  const x = Number(node.x) || 0;
  const y = Number(node.y) || 0;
  const w = Math.max(1, Number(node.width) || 100);
  const h = Math.max(1, Number(node.height) || (kind === "text" ? 20 : 100));

  const fields = {
    name: String(node.name || node.type || kind),
    ...geometryFor(x, y, w, h),
  };

  if (kind === "frame" || kind === "rect" || kind === "circle") {
    const fills = fillsFor(node);
    if (fills) fields.fills = fills;
    const radii = cornerRadiiFor(node);
    if (radii) Object.assign(fields, radii);
    const stroke = strokeFor(node);
    if (stroke) Object.assign(fields, stroke);
    const shadow = shadowFor(node);
    if (shadow) Object.assign(fields, shadow);
    const blur = blurFor(node);
    if (blur) Object.assign(fields, blur);
  }

  if (kind === "text") {
    fields.content = textContentFor(node);
    fields["grow-type"] = "fixed";
  }

  // Whole-node properties recognized on every kind (PART1: rotation/opacity/
  // visible, plus blend mode) — real Penpot shape fields, mapped whenever the
  // Scene Model node carries them.
  if (typeof node.rotation === "number" && node.rotation !== 0) fields.rotation = node.rotation;
  if (typeof node.opacity === "number") fields.opacity = node.opacity;
  if (node.visible === false) fields.hidden = true;
  if (node.blendMode && node.blendMode !== "normal") fields["blend-mode"] = node.blendMode;

  // PATCH 026A.0 — designer pass-through metadata (see scene-schema.mjs).
  // This module resolves NOTHING here — token values are resolved upstream
  // (the design-system-generator stage, 026A.4); this just copies whatever
  // the Scene Model node carried so it survives into Penpot persistence and
  // can be read back by later designer stages (visual critic, handoff).
  if (node.tokens || node.semanticId || node.componentRole || node.themeVariant || node.devMeta) {
    const nofidaMeta = {};
    if (node.tokens) nofidaMeta.tokens = node.tokens;
    if (node.semanticId) nofidaMeta["semantic-id"] = node.semanticId;
    if (node.componentRole) nofidaMeta["component-role"] = node.componentRole;
    if (node.themeVariant) nofidaMeta["theme-variant"] = node.themeVariant;
    if (node.devMeta) nofidaMeta["dev-meta"] = node.devMeta;
    fields["nofida-meta"] = nofidaMeta;
  }

  return fields;
}

// Lowers a schema-recognized-but-uncompiled node type (button/input/line/
// icon — see scene-schema.mjs's UNCOMPILED_TYPES) to one or more Scene-Model-
// shaped leaf nodes the compiler CAN build directly (rectangle/text). Never
// introduces new nesting — every lowered leaf sits at the same parent/frame
// level the original node would have occupied, so lowering can't reintroduce
// the depth problem the normalizer solves. Returns null for types with no
// safe substitution (path/image — no vector/asset data exists in this
// schema), which the compiler then treats as a hard failure unless the
// caller passed allowPartial.
export function lowerNode(node) {
  if (node.type === "button" || node.type === "input") {
    const bg = {
      nid: `${node.nid}-lower-bg`, type: "rectangle", name: node.name,
      x: node.x, y: node.y, width: node.width, height: node.height,
      fill: node.fill, fillOpacity: node.fillOpacity, gradient: node.gradient,
      strokeColor: node.strokeColor, strokeWidth: node.strokeWidth, strokeOpacity: node.strokeOpacity,
      shadow: node.shadow, blur: node.blur,
      borderRadius: node.borderRadius, borderRadiusTopLeft: node.borderRadiusTopLeft,
      borderRadiusTopRight: node.borderRadiusTopRight, borderRadiusBottomLeft: node.borderRadiusBottomLeft,
      borderRadiusBottomRight: node.borderRadiusBottomRight,
      rotation: node.rotation, opacity: node.opacity, visible: node.visible,
    };
    const out = [bg];
    if (typeof node.content === "string" && node.content.trim()) {
      const fontSize = node.fontSize || 16;
      out.push({
        nid: `${node.nid}-lower-label`, type: "text", name: `${node.name || node.type} label`,
        x: node.x + 12, y: node.y + Math.max(0, (node.height - fontSize * 1.2) / 2),
        width: Math.max(1, node.width - 24), height: Math.round(fontSize * 1.4),
        content: node.content, fontSize: node.fontSize, fontWeight: node.fontWeight,
        align: node.align || "center", fill: node.textColor || "#FFFFFF",
      });
    }
    return out;
  }

  if (node.type === "icon") {
    return [{
      nid: `${node.nid}-lower`, type: "rectangle", name: node.name,
      x: node.x, y: node.y, width: node.width, height: node.height,
      fill: node.fill || "#9CA3AF",
      borderRadius: typeof node.borderRadius === "number" ? node.borderRadius : Math.min(node.width, node.height) / 4,
    }];
  }

  if (node.type === "line") {
    return [{
      nid: `${node.nid}-lower`, type: "rectangle", name: node.name,
      x: node.x, y: node.y, width: node.width, height: node.height,
      fill: node.strokeColor || node.fill || "#000000",
    }];
  }

  return null; // path, image — no safe substitution
}

// PATCH 026A.4 — only the PAINT-relevant token categories travel with the
// paint itself; gapToken describes the ORIGINAL node's own layout (it stays
// on that node, which keeps its children), not this synthetic rectangle.
function paintTokensOf(tokens) {
  if (!tokens) return undefined;
  const out = {};
  for (const key of ["fillToken", "radiusToken", "strokeToken", "shadowToken"]) {
    if (tokens[key] !== undefined) out[key] = tokens[key];
  }
  return Object.keys(out).length ? out : undefined;
}

// Synthesizes a plain rectangle carrying a grouping node's own paint, used by
// scene-normalizer.mjs when a non-frame grouping node (group/section/stack/
// card) has to give up its paint because Penpot's real "group" shape type
// cannot carry fills/strokes/shadows itself.
//
// PATCH 026A.4 addendum: the paint MOVES here, so the paint's token binding
// metadata must move with it — without this, a token-bound card's actual
// fill/radius silently becomes untokenized after normalization, which is
// exactly the gap token-coverage.mjs (026A.4) exists to catch. `devMeta` is
// intentionally NOT copied — a caller-set localOverride reason on the
// original node describes THAT node, not this new synthetic sibling.
export function syntheticBackgroundRectFor(node) {
  return {
    type: "rectangle",
    nid: `${node.nid}-bg`,
    name: `${node.name || node.type} background`,
    x: node.x, y: node.y, width: node.width, height: node.height,
    fill: node.fill, fillOpacity: node.fillOpacity, gradient: node.gradient,
    strokeColor: node.strokeColor, strokeWidth: node.strokeWidth, strokeOpacity: node.strokeOpacity,
    shadow: node.shadow, blur: node.blur,
    borderRadius: node.borderRadius,
    borderRadiusTopLeft: node.borderRadiusTopLeft, borderRadiusTopRight: node.borderRadiusTopRight,
    borderRadiusBottomLeft: node.borderRadiusBottomLeft, borderRadiusBottomRight: node.borderRadiusBottomRight,
    tokens: paintTokensOf(node.tokens),
    semanticId: node.semanticId ? `${node.semanticId}/background` : undefined,
    componentRole: node.componentRole,
    themeVariant: node.themeVariant,
    children: [],
  };
}
