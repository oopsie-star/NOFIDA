// PATCH 026A.4 — Token-coverage validator (pure code, no LLM, no network).
//
// Run by the pipeline AFTER scene building (see stage-invoker.mjs's "scene"
// stage), on the assembled screenSpec tree, before it's handed to the
// existing 025A parseScene()/compileScene() pipeline. Measures how much of
// the tree's visual surface is bound to design-system tokens (026A.0's
// `tokens.*` node metadata) vs. hardcoded, and gates the stage on it.
//
// Thresholds (from the PATCH 026A.4 spec):
//   - 100% of color usage token-bound (image content exempt — a raster
//     image's pixels aren't a token-bindable "color")
//   - 100% of text nodes bound to a typography token
//   - >= 95% of spacing/radius usages token-bound
//   - an unbound value is allowed ONLY when the node carries an explicit
//     `devMeta.localOverride: "<reason>"` (see layout-engine.mjs's
//     enforceNodeBudget(), which sets exactly this when it degrades a
//     repeated-cell grid to stay within the node budget)
//   - overall tokenCoverage (mean of the three ratios) must be >= 95%

function hasLocalOverride(node) {
  const reason = node?.devMeta?.localOverride;
  return typeof reason === "string" && reason.trim().length > 0;
}

function walk(node, visitor) {
  if (!node || typeof node !== "object") return;
  visitor(node);
  for (const child of node.children || []) walk(child, visitor);
}

export const THRESHOLDS = Object.freeze({ color: 1, text: 1, spacingRadius: 0.95, overall: 0.95 });

/**
 * computeTokenCoverage(sceneRoot) -> {
 *   ok, colorCoverage, textCoverage, spacingRadiusCoverage, overallCoverage,
 *   counts, thresholds, violations,
 * }
 * `sceneRoot` is a Scene Model tree (pre- or post-canonicalization; only
 * type/fill/borderRadius/tokens/devMeta/children are read).
 */
export function computeTokenCoverage(sceneRoot) {
  let colorTotal = 0;
  let colorBound = 0;
  let textTotal = 0;
  let textBound = 0;
  let spacingRadiusTotal = 0;
  let spacingRadiusBound = 0;
  const violations = [];

  walk(sceneRoot, (node) => {
    const overridden = hasLocalOverride(node);
    const label = node.semanticId || node.name || node.type || "?";

    // Color: any node carrying its own solid fill. "image" nodes are
    // content-exempt — their pixels are not a token-bindable color.
    if (node.type !== "image" && typeof node.fill === "string" && node.fill.trim()) {
      colorTotal += 1;
      if (node.tokens?.fillToken || overridden) colorBound += 1;
      else violations.push({ path: label, kind: "color", detail: "fill set with no tokens.fillToken" });
    }

    // Text: every text node must bind a typography token.
    if (node.type === "text") {
      textTotal += 1;
      if (node.tokens?.textStyleToken || overridden) textBound += 1;
      else violations.push({ path: label, kind: "text", detail: "text node with no tokens.textStyleToken" });
    }

    // Radius usage.
    if (typeof node.borderRadius === "number" && node.borderRadius > 0) {
      spacingRadiusTotal += 1;
      if (node.tokens?.radiusToken || overridden) spacingRadiusBound += 1;
      else violations.push({ path: label, kind: "radius", detail: "borderRadius set with no tokens.radiusToken" });
    }
    // Gap usage — layout-engine only ever produces a gapToken from an
    // already-resolved token reference (see resolveSpacingToken()), so this
    // is near-certain to be bound; still counted honestly rather than
    // assumed, in case a node was hand-authored or edited afterward.
    if (node.tokens?.gapToken !== undefined) {
      spacingRadiusTotal += 1;
      spacingRadiusBound += 1;
    } else if (typeof node.layout?.gap === "number" && node.layout.gap > 0) {
      // The legacy 025A `layout.gap` (a raw px number, see scene-validator.mjs's
      // validateLayout()) present with no matching tokens.gapToken means
      // something set a gap without going through the token-resolving
      // layout engine.
      spacingRadiusTotal += 1;
      if (overridden) spacingRadiusBound += 1;
      else violations.push({ path: label, kind: "gap", detail: "layout.gap present with no tokens.gapToken" });
    }
  });

  const ratio = (bound, total) => (total === 0 ? 1 : bound / total);
  const colorCoverage = ratio(colorBound, colorTotal);
  const textCoverage = ratio(textBound, textTotal);
  const spacingRadiusCoverage = ratio(spacingRadiusBound, spacingRadiusTotal);
  const overallCoverage = (colorCoverage + textCoverage + spacingRadiusCoverage) / 3;

  const ok = colorCoverage >= THRESHOLDS.color
    && textCoverage >= THRESHOLDS.text
    && spacingRadiusCoverage >= THRESHOLDS.spacingRadius
    && overallCoverage >= THRESHOLDS.overall;

  return {
    ok,
    colorCoverage,
    textCoverage,
    spacingRadiusCoverage,
    overallCoverage,
    counts: { colorTotal, colorBound, textTotal, textBound, spacingRadiusTotal, spacingRadiusBound },
    thresholds: THRESHOLDS,
    violations,
  };
}
