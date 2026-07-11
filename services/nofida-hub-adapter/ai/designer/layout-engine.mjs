// PATCH 026A.4 — Layout Engine (pure code, no LLM).
//
// Turns a SemanticLayout tree (026A.0 contract) into a Scene Model subtree
// with explicit absolute geometry — the ONLY output this codebase is
// allowed to feed into the existing 025A pipeline (parseScene() ->
// canonicalizeScene() -> normalizeScene() -> compileScene()). Deciding
// WHERE things go (arithmetic) is deterministic; deciding WHAT goes where
// (product/content/component decisions) already happened in earlier 026A
// stages — this module never makes a creative decision.
//
// Token references (spacing.*, radius.*) are RESOLVED here — the pixel
// value goes into geometry (x/y/width/height), and the original token
// string is preserved in the produced node's `tokens.*` metadata (026A.0
// fields) so the binding survives into Penpot persistence untouched (see
// penpot-shape-adapter.mjs's buildFields()).
//
// Supported SemanticLayout semantics (master spec §7): vertical/horizontal
// stack, grid, alignment, padding, gap, min/max sizes, fixed/hug/fill
// width, safe-area offsets. There is deliberately no "height: fill" —
// SemanticLayout's contract (immutable, contracts.mjs) has no height field;
// only "width" controls sizing along a node's own axis, height is always
// "hug" (content-driven) in this engine. That is a real contract
// constraint, not an oversight — see the header note in resolveNode().

// ── Deterministic text measurement (documented approximation table) ────────
// No real font-shaping engine is available server-side. These are simple,
// deliberately generous (slightly over-estimating) per-typography-style
// constants — good enough to make "hug" sizing reproducible across runs,
// not a substitute for real text layout. avgCharWidth is a fraction of
// fontSize approximating one glyph's average advance width for a
// proportional UI typeface; lineHeightFactor is applied to fontSize.
export const TEXT_METRICS = Object.freeze({
  display: { avgCharWidth: 0.62, lineHeightFactor: 1.2 },
  pageTitle: { avgCharWidth: 0.58, lineHeightFactor: 1.25 },
  sectionTitle: { avgCharWidth: 0.56, lineHeightFactor: 1.3 },
  cardTitle: { avgCharWidth: 0.55, lineHeightFactor: 1.35 },
  body: { avgCharWidth: 0.52, lineHeightFactor: 1.45 },
  bodyCompact: { avgCharWidth: 0.52, lineHeightFactor: 1.4 },
  label: { avgCharWidth: 0.55, lineHeightFactor: 1.2 },
  caption: { avgCharWidth: 0.53, lineHeightFactor: 1.3 },
  button: { avgCharWidth: 0.55, lineHeightFactor: 1.2 },
  numericHighlight: { avgCharWidth: 0.6, lineHeightFactor: 1.15 },
});

/** measureText(text, styleName, fontSize, maxWidth) -> { width, height, lines } */
export function measureText(text, styleName, fontSize, maxWidth) {
  const metrics = TEXT_METRICS[styleName] || TEXT_METRICS.body;
  const content = String(text || "");
  const size = typeof fontSize === "number" && fontSize > 0 ? fontSize : 15;
  const charWidth = size * metrics.avgCharWidth;
  const lineHeight = Math.round(size * metrics.lineHeightFactor);
  const naturalWidth = Math.ceil(content.length * charWidth);
  if (!maxWidth || naturalWidth <= maxWidth) {
    return { width: Math.max(1, naturalWidth), height: lineHeight, lines: 1 };
  }
  const charsPerLine = Math.max(1, Math.floor(maxWidth / charWidth));
  const lines = Math.max(1, Math.ceil(content.length / charsPerLine));
  return { width: Math.max(1, Math.round(maxWidth)), height: lineHeight * lines, lines };
}

// ── Token resolution ─────────────────────────────────────────────────────
// Spacing has no named tokens in the 026A.2 DesignSystemManifest schema —
// just one strictly-increasing numeric scale (tokens.spacing.scale). The
// convention here is that a "spacing.<N>" reference's number IS the
// resolved pixel value; "resolved through the manifest" means validating N
// is actually a declared scale member, not inventing an unapproved number.

export function resolveSpacingToken(manifest, ref) {
  const m = /^spacing\.(\d+(?:\.\d+)?)$/.exec(String(ref || "").trim());
  if (!m) return null;
  const value = Number(m[1]);
  const scale = manifest?.tokens?.spacing?.scale;
  if (!Array.isArray(scale) || !scale.includes(value)) return null;
  return value;
}

export function resolveRadiusToken(manifest, ref) {
  const m = /^radius\.([a-zA-Z0-9_-]+)$/.exec(String(ref || "").trim());
  if (!m) return null;
  const value = manifest?.tokens?.radius?.[m[1]];
  return typeof value === "number" ? value : null;
}

export function resolveColorToken(manifest, themeVariant, ref) {
  const theme = manifest?.semanticTokens?.[themeVariant];
  if (theme && typeof ref === "string" && Object.prototype.hasOwnProperty.call(theme, ref)) {
    return theme[ref];
  }
  return null;
}

export function resolveTypographyToken(manifest, ref) {
  const m = /^typography\.([a-zA-Z0-9_-]+)$/.exec(String(ref || "").trim());
  if (!m) return null;
  const style = manifest?.tokens?.typography?.[m[1]];
  return style && typeof style === "object" ? style : null;
}

function resolvePadding(padding, manifest) {
  const sides = { top: 0, right: 0, bottom: 0, left: 0 };
  if (!padding || typeof padding !== "object") return sides;
  for (const side of Object.keys(sides)) {
    const ref = padding[side];
    if (typeof ref === "string") {
      const px = resolveSpacingToken(manifest, ref);
      if (px !== null) sides[side] = px;
    } else if (typeof ref === "number") {
      // Defensive only — the layout PLANNER's own output is rejected if it
      // emits a raw number here (see layout-planner.mjs's deep check); the
      // engine tolerates one anyway so a hand-built layout tree (like this
      // module's own tests) isn't forced through token names for every case.
      sides[side] = ref;
    }
  }
  return sides;
}

function defaultLeafMeasurer({ availableWidth }) {
  return { width: Math.max(1, Math.round(availableWidth || 44)), height: 44 };
}

function defaultGridColumns(node, childCount) {
  return Math.max(1, Math.ceil(Math.sqrt(Math.max(1, childCount))));
}

function applyCrossAlignment(children, alignment, direction, containerX, containerY, crossSpan) {
  for (const child of children) {
    if (direction === "vertical") {
      const childCross = child.width;
      let offset = 0;
      if (alignment === "center") offset = (crossSpan - childCross) / 2;
      else if (alignment === "end") offset = crossSpan - childCross;
      if (offset > 0) child.x = containerX + offset;
    } else {
      const childCross = child.height;
      let offset = 0;
      if (alignment === "center") offset = (crossSpan - childCross) / 2;
      else if (alignment === "end") offset = crossSpan - childCross;
      if (offset > 0) child.y = containerY + offset;
    }
  }
}

function buildLayoutTokenMeta(layoutNode) {
  const tokens = {};
  if (typeof layoutNode.gapToken === "string" && layoutNode.gapToken.trim()) tokens.gapToken = layoutNode.gapToken;
  return Object.keys(tokens).length ? tokens : undefined;
}

function clampMinMax(value, layoutNode, minKey, maxKey) {
  let v = value;
  if (typeof layoutNode[minKey] === "number") v = Math.max(v, layoutNode[minKey]);
  if (typeof layoutNode[maxKey] === "number") v = Math.min(v, layoutNode[maxKey]);
  return v;
}

function buildStackChildren(layoutNode, childrenInput, ctx) {
  const { x, y, availableWidth, availableHeight, gapPx, path } = ctx;
  const direction = layoutNode.direction === "horizontal" ? "horizontal" : "vertical";
  let cursor = 0;
  const resolved = [];

  childrenInput.forEach((childLayout, i) => {
    const childPath = `${path}.children[${i}]`;
    const childX = direction === "vertical" ? x : x + cursor;
    const childY = direction === "vertical" ? y + cursor : y;
    const childAvailableWidth = direction === "vertical" ? availableWidth : Math.max(0, availableWidth - cursor);
    const childAvailableHeight = direction === "horizontal" ? availableHeight : Math.max(0, availableHeight - cursor);
    // eslint-disable-next-line no-use-before-define
    const node = resolveNode(childLayout, { ...ctx, path: childPath, x: childX, y: childY, availableWidth: childAvailableWidth, availableHeight: childAvailableHeight });
    resolved.push(node);
    cursor += (direction === "vertical" ? node.height : node.width) + gapPx;
  });
  if (resolved.length) cursor -= gapPx; // no trailing gap after the last child

  const crossSpan = resolved.length ? Math.max(...resolved.map((n) => (direction === "vertical" ? n.width : n.height))) : 0;
  applyCrossAlignment(resolved, layoutNode.alignment, direction, x, y, crossSpan);

  const contentWidth = direction === "vertical" ? crossSpan : Math.max(0, cursor);
  const contentHeight = direction === "horizontal" ? crossSpan : Math.max(0, cursor);
  return { children: resolved, contentWidth, contentHeight };
}

function buildGridChildren(layoutNode, childrenInput, ctx) {
  const { x, y, availableWidth, gapPx, path, gridColumnsResolver, leafMeasurer, manifest } = ctx;
  const columns = Math.max(1, gridColumnsResolver ? gridColumnsResolver(layoutNode, childrenInput.length) : defaultGridColumns(layoutNode, childrenInput.length));
  const cellWidth = childrenInput.length ? Math.max(1, Math.floor((availableWidth - gapPx * (columns - 1)) / columns)) : 0;
  const measurer = leafMeasurer || defaultLeafMeasurer;
  const sample = measurer({ path: `${path}.children[0]`, availableWidth: cellWidth }, manifest);
  const cellHeight = sample.height;

  const resolved = childrenInput.map((childLayout, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const childX = x + col * (cellWidth + gapPx);
    const childY = y + row * (cellHeight + gapPx);
    const childPath = `${path}.children[${i}]`;
    // eslint-disable-next-line no-use-before-define
    return resolveNode(childLayout, { ...ctx, path: childPath, x: childX, y: childY, availableWidth: cellWidth, availableHeight: cellHeight, forceUniformSize: true });
  });

  const rows = childrenInput.length ? Math.ceil(childrenInput.length / columns) : 0;
  const contentWidth = availableWidth;
  const contentHeight = rows * cellHeight + Math.max(0, rows - 1) * gapPx;
  return { children: resolved, contentWidth, contentHeight };
}

function resolveNode(layoutNode, ctx) {
  const { manifest, path, x, y, availableWidth, availableHeight, frame } = ctx;

  let paddingPx = resolvePadding(layoutNode.padding, manifest);
  if (layoutNode.safeArea && frame) {
    paddingPx = { ...paddingPx, bottom: paddingPx.bottom + (frame.safeAreaBottom || 0) };
  }
  const gapPx = layoutNode.gapToken ? (resolveSpacingToken(manifest, layoutNode.gapToken) ?? 0) : 0;

  const contentX = x + paddingPx.left;
  const contentY = y + paddingPx.top;
  const contentAvailableWidth = Math.max(0, availableWidth - paddingPx.left - paddingPx.right);
  const contentAvailableHeight = Math.max(0, availableHeight - paddingPx.top - paddingPx.bottom);

  const hasChildren = layoutNode.children !== undefined;

  // Grid cells are uniform by construction (buildGridChildren already
  // divided availableWidth/availableHeight into equal cell boxes before
  // calling resolveNode on each cell) — a cell's own "hug"-measured content
  // must never override that shared box, or the grid stops being a grid.
  const forceUniform = ctx.forceUniformSize === true;

  if (!hasChildren) {
    // LEAF placement slot — layout-engine has no concept of leaf CONTENT
    // (SemanticLayout carries none); designer-scene-builder.mjs fills the
    // real type/content in afterward, keeping this computed geometry.
    const measurer = ctx.leafMeasurer || defaultLeafMeasurer;
    const measured = measurer({ path, availableWidth: contentAvailableWidth }, manifest);
    let width = (layoutNode.width === "fill" || forceUniform) ? contentAvailableWidth : measured.width;
    let height = forceUniform ? contentAvailableHeight : measured.height;
    width = clampMinMax(width, layoutNode, "minWidth", "maxWidth");
    height = clampMinMax(height, layoutNode, "minHeight", "maxHeight");
    return {
      type: "section", name: `layout-leaf:${path}`,
      x, y, width: width + paddingPx.left + paddingPx.right, height: height + paddingPx.top + paddingPx.bottom,
      tokens: buildLayoutTokenMeta(layoutNode), children: [],
    };
  }

  const childCtx = { ...ctx, path, x: contentX, y: contentY, availableWidth: contentAvailableWidth, availableHeight: contentAvailableHeight, gapPx, paddingPx, forceUniformSize: false };
  const built = layoutNode.type === "grid"
    ? buildGridChildren(layoutNode, layoutNode.children, childCtx)
    : buildStackChildren(layoutNode, layoutNode.children, childCtx);

  let ownWidth = (layoutNode.width === "fill" || forceUniform) ? contentAvailableWidth : built.contentWidth;
  let ownHeight = forceUniform ? contentAvailableHeight : built.contentHeight; // otherwise always "hug" — see module header note
  ownWidth = clampMinMax(ownWidth, layoutNode, "minWidth", "maxWidth");
  ownHeight = clampMinMax(ownHeight, layoutNode, "minHeight", "maxHeight");

  return {
    type: "section", name: `layout:${path}`,
    x, y, width: ownWidth + paddingPx.left + paddingPx.right, height: ownHeight + paddingPx.top + paddingPx.bottom,
    tokens: buildLayoutTokenMeta(layoutNode),
    children: built.children,
  };
}

function nodeCount(node) {
  let n = 1;
  for (const child of node.children || []) n += nodeCount(child);
  return n;
}

function findLargestContainer(node) {
  let best = null;
  (function walk(n) {
    if (Array.isArray(n.children) && n.children.length > 0) {
      if (!best || n.children.length > best.children.length) best = n;
      for (const child of n.children) walk(child);
    }
  })(node);
  return best;
}

/**
 * enforceNodeBudget(root, maxNodes, report) -> report
 * Node budgeting: never silently drops content. When over budget, degrades
 * the LARGEST repeating container (e.g. a 42-cell month grid) by merging
 * its excess trailing children into ONE summary node carrying
 * `devMeta.localOverride` (documenting the degradation, and — usefully —
 * exempting that node from token-coverage.mjs's strict-binding requirement,
 * since a merged summary cell no longer represents one real token usage).
 * If degradation still can't fit the budget, `report.overBudget` stays
 * true and the caller must decide whether to raise MAX_NODES
 * (scene-schema.mjs) rather than ship a broken/truncated scene.
 */
export function enforceNodeBudget(root, maxNodes, report = {}) {
  let count = nodeCount(root);
  const degraded = [];
  while (count > maxNodes) {
    const target = findLargestContainer(root);
    if (!target || target.children.length <= 2) break;
    const overBy = count - maxNodes;
    const keep = Math.max(2, target.children.length - overBy - 1);
    if (keep >= target.children.length) break;
    const removed = target.children.splice(keep);
    const summary = removed[0];
    summary.devMeta = { ...(summary.devMeta || {}), localOverride: "degraded: summarized repeated cells to stay within the node budget", summarizedCount: removed.length };
    summary.name = `${summary.name || "cell"} (+${removed.length - 1} more)`;
    target.children.push(summary);
    count = nodeCount(root);
    degraded.push({ container: target.name, removedCount: removed.length - 1 });
  }
  report.totalNodeCount = count;
  report.degraded = degraded;
  report.overBudget = count > maxNodes;
  return report;
}

/**
 * resolveLayout(layout, opts) -> { node, report }
 *   layout             - a SemanticLayout tree (026A.0 contract)
 *   opts.manifest       - DesignSystemManifest (token -> px resolution)
 *   opts.frame           - { width, height, safeAreaTop, safeAreaBottom, safeAreaLeft, safeAreaRight }
 *   opts.leafMeasurer    - ({ path, availableWidth }, manifest) -> { width, height } (optional)
 *   opts.gridColumnsResolver - (layoutNode, childCount) -> number (optional)
 * `node` is a Scene Model subtree (root type "section") with absolute x/y/
 * width/height on every node and `tokens.gapToken` metadata preserved.
 * `report.totalNodeCount` is populated but node-budget ENFORCEMENT is a
 * separate call (enforceNodeBudget()) — resolveLayout() never mutates the
 * tree it just built.
 */
export function resolveLayout(layout, opts = {}) {
  const { manifest, frame, leafMeasurer, gridColumnsResolver, path = "root" } = opts;
  if (!frame || typeof frame.width !== "number" || typeof frame.height !== "number") {
    throw new Error("resolveLayout requires a frame with numeric width/height");
  }
  const safeAreaTop = frame.safeAreaTop || 0;
  const safeAreaBottom = frame.safeAreaBottom || 0;
  const safeAreaLeft = frame.safeAreaLeft || 0;
  const safeAreaRight = frame.safeAreaRight || 0;

  const rootCtx = {
    manifest, leafMeasurer, gridColumnsResolver, frame, path,
    x: safeAreaLeft, y: safeAreaTop,
    availableWidth: frame.width - safeAreaLeft - safeAreaRight,
    availableHeight: frame.height - safeAreaTop - safeAreaBottom,
  };

  const node = resolveNode(layout, rootCtx);
  return { node, report: { totalNodeCount: nodeCount(node) } };
}
