// GENERATED — mirrored from services/nofida-hub-adapter/ai/scene/scene-normalizer.mjs
// by scripts/sync-shared-scene.sh. Do not hand-edit; edit the source and re-run.
//
// Render-safe normalizer (PATCH 025A) — the actual fix for the blank-canvas
// bug: real Penpot frames nested past MAX_FRAME_DEPTH silently fail to paint
// on the WASM canvas. This walks an already-validated, already-canonical
// scene (see scene-canonicalizer.mjs — every node already has a stable
// `nid`) and:
//   - demotes "frame" nodes past MAX_FRAME_DEPTH to plain grouping nodes
//   - flattens decorative wrappers (grouping nodes with no paint of their
//     own) and groups past MAX_GROUP_DEPTH, reparenting children directly
//   - removes now-empty groups
//   - synthesizes a background rectangle for any non-frame grouping node
//     that has its own paint, since Penpot's real "group" shape type cannot
//     carry fills/strokes/shadows itself — this is what keeps the screen's
//     appearance identical after flattening/demotion
//
// PATCH 025A addendum — isFlattenSafe(): flattening or demoting a node is a
// LOSSY transform for anything that depends on being exactly that shape at
// exactly that place in the tree — rotation, clip/mask, blend mode, opacity,
// layout (flex/grid) constraints, or a direct component-instance child (a
// component's positioning is tied to its parent). Any node for which
// isFlattenSafe() returns false is never flattened or demoted, even past the
// depth budget — it stays deep, and the normalizer counts it in
// report.protectedCount so the caller can see the depth budget wasn't fully
// enforced. Correctness over guaranteed shallow nesting.
//
// Pure module: no DOM/network/environment access. Coordinates in this schema
// are already absolute page coordinates (see scene-schema.mjs's prompt
// block), so flattening is pure tree surgery — no coordinate math needed.

import { GROUPING_TYPES, MAX_FRAME_DEPTH, MAX_GROUP_DEPTH } from "./scene-schema.mjs";
import { hasOwnPaint, syntheticBackgroundRectFor } from "./penpot-shape-adapter.mjs";

function maxFrameDepth(node, depth) {
  if (!node) return depth;
  const d = node.type === "frame" ? depth + 1 : depth;
  let max = d;
  for (const child of node.children || []) {
    max = Math.max(max, maxFrameDepth(child, node.type === "frame" ? d : depth));
  }
  return max;
}

function stripPaintFields(node) {
  const { fill, fillOpacity, gradient, strokeColor, strokeWidth, strokeOpacity, shadow, blur,
    borderRadius, borderRadiusTopLeft, borderRadiusTopRight, borderRadiusBottomLeft, borderRadiusBottomRight,
    ...rest } = node;
  return rest;
}

/**
 * A node is flatten/demote-safe only if none of its own semantics would be
 * lost by removing it from the tree or changing its Penpot shape kind.
 * Exported so this gate is independently testable, not just an inline
 * conditional buried in the walk.
 */
export function isFlattenSafe(node) {
  if (typeof node.rotation === "number" && node.rotation !== 0) return false;
  if (node.layout) return false;
  if (node.clip) return false;
  if (node.mask) return false;
  if (node.blendMode && node.blendMode !== "normal") return false;
  if (typeof node.opacity === "number" && node.opacity !== 1) return false;
  if ((node.children || []).some((c) => c.type === "component-instance")) return false;
  return true;
}

function normalizeNode(node, ctx, report) {
  if (!GROUPING_TYPES.has(node.type)) {
    // Leaf visual node — nothing to normalize structurally.
    return { keep: true, node };
  }

  const safe = isFlattenSafe(node);
  let type = node.type;
  let effectiveFrameDepth = ctx.frameDepth;
  let protectedHere = false;

  if (type === "frame" && !ctx.isRoot) {
    if (ctx.frameDepth + 1 > MAX_FRAME_DEPTH) {
      if (safe) {
        type = "group";
        report.demotedCount += 1;
      } else {
        protectedHere = true;
        effectiveFrameDepth = ctx.frameDepth + 1;
      }
    } else {
      effectiveFrameDepth = ctx.frameDepth + 1;
    }
  } else if (type === "frame") {
    effectiveFrameDepth = ctx.frameDepth + 1;
  }

  const isRealFrame = type === "frame";
  const effectiveGroupDepth = isRealFrame ? ctx.groupDepth : ctx.groupDepth + 1;

  const paint = !isRealFrame && hasOwnPaint(node);
  // "Decorative wrapper" = a pass-through container with no own paint and no
  // organizational value (exactly one child). A paintless group with several
  // children is a meaningful visual cluster, not a wrapper, and must stay a
  // stable decision independent of prior normalization passes — using child
  // count (evaluated on the node's ORIGINAL children, before this node's own
  // paint gets extracted into a synthetic sibling below) keeps normalizeScene
  // idempotent: re-running it on its own output must not keep flattening.
  const originalChildCount = (node.children || []).length;
  const decorative = !isRealFrame && !paint && originalChildCount === 1 && !ctx.isRoot;
  const tooDeep = !isRealFrame && effectiveGroupDepth > MAX_GROUP_DEPTH && !ctx.isRoot;
  const wouldFlatten = !ctx.isRoot && !isRealFrame && (decorative || tooDeep);
  const shouldFlatten = wouldFlatten && safe;
  if (wouldFlatten && !safe) protectedHere = true;
  if (protectedHere) report.protectedCount += 1;

  const childCtx = {
    frameDepth: effectiveFrameDepth,
    groupDepth: shouldFlatten ? ctx.groupDepth : effectiveGroupDepth,
    isRoot: false,
  };

  let newChildren = [];
  for (const child of node.children || []) {
    const result = normalizeNode(child, childCtx, report);
    if (result.keep) newChildren.push(result.node);
    else newChildren.push(...result.spliced);
  }

  // Penpot's real "group" shape can't carry fill/stroke/shadow — move any
  // paint this node had into a synthetic background rectangle so appearance
  // survives demotion/flattening. This is lossless (the paint stays visible
  // as a sibling), so it applies regardless of isFlattenSafe().
  let bgNode = null;
  if (!isRealFrame && paint) {
    bgNode = syntheticBackgroundRectFor(node);
    report.paintExtractedCount += 1;
  }

  if (shouldFlatten) {
    report.flattenedCount += 1;
    return { keep: false, spliced: bgNode ? [bgNode, ...newChildren] : newChildren };
  }

  if (bgNode) newChildren = [bgNode, ...newChildren];

  if (!isRealFrame && newChildren.length === 0 && !ctx.isRoot) {
    report.removedEmptyGroups += 1;
    return { keep: false, spliced: [] };
  }

  const cleaned = isRealFrame ? node : stripPaintFields(node);
  return { keep: true, node: { ...cleaned, type, children: newChildren } };
}

/**
 * Normalizes an already-validated, already-canonical scene. Returns
 * { scene, report }. report is always populated (never silently a no-op) so
 * callers can tell whether normalization actually changed anything, and
 * report.protectedCount surfaces cases where the depth budget could not be
 * fully enforced because a node's own semantics (rotation/clip/mask/layout/
 * blend/opacity/component children) made flattening or demotion unsafe.
 */
export function normalizeScene(scene) {
  const report = {
    demotedCount: 0,
    flattenedCount: 0,
    removedEmptyGroups: 0,
    paintExtractedCount: 0,
    protectedCount: 0,
    maxFrameDepthBefore: maxFrameDepth(scene, 0),
  };

  const result = normalizeNode(scene, { frameDepth: 0, groupDepth: 0, isRoot: true }, report);
  const normalized = result.keep ? result.node : scene;
  report.maxFrameDepthAfter = maxFrameDepth(normalized, 0);
  report.changed = report.demotedCount + report.flattenedCount + report.removedEmptyGroups + report.paintExtractedCount > 0;

  return { scene: normalized, report };
}

// Exposed for tests/diagnostics — recomputes the metric independently of a
// normalization pass (e.g. to confirm a second pass is a fixed point).
export function maxFrameDepthOf(scene) {
  return maxFrameDepth(scene, 0);
}
