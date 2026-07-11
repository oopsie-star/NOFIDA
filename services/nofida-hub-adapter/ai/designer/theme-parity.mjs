// PATCH 026A.5 — Theme parity checker (pure code, no LLM, no network).
//
// Verifies that a light/dark board pair produced by
// designer-scene-builder.mjs's buildPairedThemeBoards() actually stayed a
// PAIR: identical tree shape, node types, geometry, and layer names,
// correlated by the shared `semanticId` every corresponding node carries
// (see designer-scene-builder.mjs's header). Only token-resolved paint
// (fills/shadows/strokes) and any explicitly declared
// `devMeta.themeDelta` may differ — anything else is a bug in the theme
// resolver, not a legitimate design difference, and this module's whole
// job is to catch it mechanically instead of trusting the resolver by
// construction.
//
// checkBoardContrast() is a SEPARATE, complementary check: not "do the two
// boards match each other" but "is THIS board's actual resolved text
// readable against its actual resolved background" — a real structural
// re-verification per board, independent of the 026A.2 manifest-level
// contrast checker (which only checks the ABSTRACT token declarations, not
// what a specific compiled tree actually pairs a given text node with).

import { contrastRatio } from "./design-system-validators.mjs";

function collectBySemanticId(node, map = new Map()) {
  if (node && typeof node === "object") {
    if (node.semanticId) map.set(node.semanticId, node);
    for (const child of node.children || []) collectBySemanticId(child, map);
  }
  return map;
}

function hasThemeDelta(node) {
  const delta = node?.devMeta?.themeDelta;
  return typeof delta === "string" && delta.trim().length > 0;
}

const GEOMETRY_KEYS = Object.freeze(["x", "y", "width", "height"]);
const VISUAL_DELTA_KEYS = Object.freeze(["opacity", "rotation"]);

function pick(node, keys) {
  const out = {};
  for (const key of keys) out[key] = node[key];
  return out;
}

/**
 * checkThemeParity(lightBoard, darkBoard) -> { ok, errors, offendingSemanticIds }
 * `errors` entries: { semanticId, kind, ...detail }. `kind` is one of
 * "missing-in-light" | "missing-in-dark" | "type-mismatch" |
 * "name-mismatch" | "child-count-mismatch" | "undeclared-geometry-delta" |
 * "undeclared-visual-delta".
 */
export function checkThemeParity(lightBoard, darkBoard) {
  const errors = [];
  const lightById = collectBySemanticId(lightBoard);
  const darkById = collectBySemanticId(darkBoard);
  const allIds = new Set([...lightById.keys(), ...darkById.keys()]);
  // The board ROOT is exempt from the name/x checks below — buildPairedThemeBoards()
  // deliberately gives the pair different names ("... / Day" vs "... / Night")
  // and a deterministic x-offset (side-by-side placement) BY DESIGN, per
  // 026A.5's own spec. Every other node, and every other geometry field
  // (including the root's own y/width/height), still has to match exactly.
  const rootSemanticId = lightBoard?.semanticId;

  for (const id of allIds) {
    const l = lightById.get(id);
    const d = darkById.get(id);
    const isRoot = id === rootSemanticId;

    if (!l) { errors.push({ semanticId: id, kind: "missing-in-light" }); continue; }
    if (!d) { errors.push({ semanticId: id, kind: "missing-in-dark" }); continue; }

    if (l.type !== d.type) {
      errors.push({ semanticId: id, kind: "type-mismatch", light: l.type, dark: d.type });
      continue;
    }
    if (!isRoot && l.name !== d.name) {
      errors.push({ semanticId: id, kind: "name-mismatch", light: l.name, dark: d.name });
    }

    const childCountL = (l.children || []).length;
    const childCountD = (d.children || []).length;
    if (childCountL !== childCountD) {
      errors.push({ semanticId: id, kind: "child-count-mismatch", light: childCountL, dark: childCountD });
    }

    const declared = hasThemeDelta(l) || hasThemeDelta(d);

    const geometryKeys = isRoot ? GEOMETRY_KEYS.filter((k) => k !== "x") : GEOMETRY_KEYS;
    const geometryDiffers = geometryKeys.some((k) => l[k] !== d[k]);
    if (geometryDiffers && !declared) {
      errors.push({ semanticId: id, kind: "undeclared-geometry-delta", light: pick(l, GEOMETRY_KEYS), dark: pick(d, GEOMETRY_KEYS) });
    }

    const visualDiffers = VISUAL_DELTA_KEYS.some((k) => l[k] !== d[k]);
    if (visualDiffers && !declared) {
      errors.push({ semanticId: id, kind: "undeclared-visual-delta", light: pick(l, VISUAL_DELTA_KEYS), dark: pick(d, VISUAL_DELTA_KEYS) });
    }
  }

  return { ok: errors.length === 0, errors, offendingSemanticIds: [...new Set(errors.map((e) => e.semanticId))] };
}

function findFillAncestor(stack) {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (typeof stack[i].fill === "string" && stack[i].fill.trim()) return stack[i].fill;
  }
  return null;
}

/**
 * checkBoardContrast(board, { bodyMinRatio }) -> { ok, errors }
 * Walks a RESOLVED board (fill already set, not the logical scene) and
 * verifies every text node's own fill against its nearest ancestor's fill
 * (the actual background it will render on) clears the WCAG body-text
 * threshold (4.5:1 by default — same threshold design-system-validators.mjs
 * uses for text.primary/text.secondary).
 */
export function checkBoardContrast(board, { bodyMinRatio = 4.5 } = {}) {
  const errors = [];
  (function walk(node, stack) {
    if (!node || typeof node !== "object") return;
    if (node.type === "text" && typeof node.fill === "string") {
      const background = findFillAncestor(stack);
      if (background) {
        const ratio = contrastRatio(node.fill, background);
        if (ratio === null) {
          errors.push({ semanticId: node.semanticId, kind: "unparseable-color", fill: node.fill, background });
        } else if (ratio < bodyMinRatio) {
          errors.push({ semanticId: node.semanticId, kind: "low-contrast", ratio, fill: node.fill, background, required: bodyMinRatio });
        }
      }
    }
    for (const child of node.children || []) walk(child, [...stack, node]);
  })(board, [board]);
  return { ok: errors.length === 0, errors };
}
