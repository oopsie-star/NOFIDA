// PATCH 026A.4/026A.5 — Scene Builder + paired light/dark theme resolution.
//
// Combines product structure (ProductArchitecture screen) + design system
// (DesignSystemManifest) + components + assets + layout-engine geometry +
// content into ONE LOGICAL scene, compatible with the EXISTING 025A
// pipeline (parseScene() -> canonicalizeScene() -> normalizeScene() ->
// compileScene()) — nothing lower; this module never emits Penpot Transit/
// UUIDs.
//
// PATCH 026A.5 split this into two passes:
//   1. buildLogicalScene() — theme-AGNOSTIC. Geometry (from layout-engine,
//      identical regardless of theme), structure, content, and token
//      REFERENCES (tokens.fillToken etc.) are all decided here. Colors are
//      deliberately left unresolved — `fill` is never set in the logical
//      scene, only the token reference that WOULD resolve to one.
//   2. resolveThemeBoard() — pure code, no LLM (026A.5 global rule 3):
//      walks the logical scene and resolves every token reference against
//      ONE theme from the manifest, producing a themed board. Calling this
//      twice (light, dark) on the SAME logical scene is what guarantees
//      identical information architecture/geometry between the pair —
//      there is structurally no way for them to diverge except where this
//      function deliberately introduces a themeDelta (see
//      DARK_BACKGROUND_OPACITY_FACTOR below).
// buildScreenSpec() (026A.4's original single-theme entry point) is now a
// thin wrapper over the two passes, so stage-invoker.mjs's existing "scene"
// stage needed no changes.
//
// Every generated node carries a stable `semanticId`
// (`<screen-id>/<component-role>/<index>[/part]`), a meaningful layer
// `name`, `componentRole`, `tokens`, and `themeVariant` — see
// scene-schema.mjs's PATCH 026A.0 metadata fields. Corresponding light/dark
// nodes share the SAME semanticId (themeVariant is what distinguishes
// them) — this is also what scene-canonicalizer.mjs's nid-from-semanticId
// rule (026A.0) relies on to keep the pair's identities correlated.

import {
  resolveLayout, enforceNodeBudget, measureText,
  resolveRadiusToken, resolveColorToken, resolveTypographyToken,
} from "./layout-engine.mjs";
import { MAX_NODES } from "../scene/scene-schema.mjs";
import { parseScene } from "../scene/scene-validator.mjs";
import { canonicalizeScene } from "../scene/scene-canonicalizer.mjs";
import { normalizeScene } from "../scene/scene-normalizer.mjs";
import { compileScene } from "../scene/scene-compiler.mjs";

// ── Section <-> component matching ──────────────────────────────────────
// Greedy-unique keyword scoring: each component can only be assigned to one
// top-level section. Longer/more specific words score higher so e.g.
// "prediction" (specific) outweighs "summary" (generic, shared by more than
// one component) when both appear. A section with zero positive-score
// matches falls back to the first still-available component rather than
// going unrepresented — every section gets SOME visual representation.
function scoreMatch(sectionText, component) {
  const text = String(sectionText || "").toLowerCase();
  const roleWords = String(component.role || "").toLowerCase().split(/[-_\s]+/).filter(Boolean);
  const nameWords = String(component.name || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const words = [...new Set([...roleWords, ...nameWords])];
  let score = 0;
  for (const word of words) {
    if (word.length < 3) continue;
    if (text.includes(word)) score += word.length;
  }
  return score;
}

export function matchComponentsToSections(sections, components) {
  const available = [...(components || [])];
  return (sections || []).map((sectionText) => {
    let bestIndex = -1;
    let bestScore = 0;
    available.forEach((component, i) => {
      const score = scoreMatch(sectionText, component);
      if (score > bestScore) { bestScore = score; bestIndex = i; }
    });
    if (bestIndex === -1 && available.length > 0) bestIndex = 0;
    if (bestIndex === -1) return null;
    const [matched] = available.splice(bestIndex, 1);
    return matched;
  });
}

// ── Calendar section expansion ──────────────────────────────────────────
// The ProductArchitecture's `sections` list has ONE string per section
// ("week-at-a-glance calendar strip") but a week/month calendar needs MANY
// leaf cells. The layout-planner's SemanticLayout tree gives one (empty)
// child per section; this expands a calendar-role section's child into a
// real grid with the right cell count, deterministically — a domain fact
// (a week has 7 days), not a creative decision.
const CALENDAR_SECTION_RULES = Object.freeze([
  { pattern: /week/i, cellCount: 7, columns: 7 },
  { pattern: /month/i, cellCount: 30, columns: 7 },
]);

function matchCalendarRule(sectionText) {
  return CALENDAR_SECTION_RULES.find((r) => r.pattern.test(String(sectionText || ""))) || null;
}

function expandCalendarSections(layout, sections) {
  const cloned = JSON.parse(JSON.stringify(layout));
  cloned.children = (cloned.children || []).map((child, i) => {
    const rule = matchCalendarRule(sections[i]);
    if (!rule) return child;
    return {
      ...child,
      type: "grid",
      gapToken: child.gapToken || "spacing.4",
      children: Array.from({ length: rule.cellCount }, () => ({})),
      __gridColumns: rule.columns,
    };
  });
  return cloned;
}

// ── Content (real copy, not lorem ipsum — pulled from already-authored
// upstream artifacts, never invented here) ──────────────────────────────
const CONTENT_BY_ROLE = {
  header: (screen) => ({ title: (screen.purpose || "Overview").split(".")[0], subtitle: screen.purpose || "" }),
  summary: (screen) => ({ title: (screen.contentRequirements || [])[1] || (screen.contentRequirements || [])[0] || "Summary", subtitle: "" }),
  "primary-action": (screen) => ({ title: screen.primaryAction || "Continue", subtitle: "" }),
  "status-indicator": (screen) => ({
    title: (screen.contentRequirements || []).find((c) => /status|indicator|probab|fertil/i.test(c)) || "Status",
    subtitle: "",
  }),
  navigation: () => ({ title: "Day · Week · Month", subtitle: "" }),
  metric: (screen) => ({ title: (screen.contentRequirements || [])[0] || "Metric", subtitle: "" }),
};

function contentFor(component, screen) {
  const picker = component ? CONTENT_BY_ROLE[component.role] : null;
  const result = picker ? picker(screen) : { title: component?.name || "Content", subtitle: "" };
  if (!result.title) result.title = component?.name || "Content";
  return result;
}

// ── Token references (theme-agnostic — no color resolution here) ───────
function compactTokens(tokens) {
  const out = {};
  for (const [key, value] of Object.entries(tokens || {})) {
    if (value !== undefined && value !== null) out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

function resolveNodeStyleTokens(tokenBindings, manifest) {
  const fillRef = tokenBindings?.fill || "background.surface";
  const radiusRef = tokenBindings?.cornerRadius;
  // Radius is theme-INDEPENDENT in the 026A.2 manifest schema (one
  // tokens.radius map, not split by theme) so it's safe to resolve eagerly
  // here rather than deferring to resolveThemeBoard(). Deliberately no
  // fallback pixel radius when there's no resolvable token: an unstyled
  // property beats a hidden magic number (token-coverage.mjs would have to
  // flag a hardcoded fallback as unbound anyway).
  const borderRadius = radiusRef ? (resolveRadiusToken(manifest, radiusRef) ?? undefined) : undefined;
  return { borderRadius, fillRef, radiusRef };
}

// ── Leaf measurement (layout-engine's injectable measurer) ──────────────
function topChildIndexFromPath(path) {
  const m = /^root\.children\[(\d+)\]/.exec(String(path || ""));
  return m ? Number(m[1]) : -1;
}

function isNestedCellPath(path) {
  return /^root\.children\[\d+\]\.children\[\d+\]/.test(String(path || ""));
}

function makeLeafMeasurer(matchedComponents, screen, manifest) {
  return ({ path }) => {
    if (isNestedCellPath(path)) {
      // Representative calendar-cell size — forceUniformSize (see
      // layout-engine.mjs) overrides this to the grid's actual cell box
      // regardless, only the returned HEIGHT (used once, for the whole
      // grid's row height) matters here.
      return { width: 40, height: 32 };
    }
    const index = topChildIndexFromPath(path);
    const component = matchedComponents[index];
    const content = contentFor(component, screen);
    const typography = resolveTypographyToken(manifest, "typography.cardTitle") || { size: 16 };
    const measured = measureText(content.title, "cardTitle", typography.size || 16, 320);
    return { width: 340, height: Math.max(44, measured.height + 28) };
  };
}

// ── Realize resolved-geometry leaves into real (theme-agnostic) Scene
// Model nodes — every node below carries `tokens.fillToken` but never
// `fill` itself; resolveThemeBoard() is the only place `fill` gets set. ──
function realizeCalendarCell(cellNode, screenId, sectionIndex, cellIndex) {
  const overridden = cellNode.devMeta?.localOverride;
  return {
    type: "text",
    name: overridden ? cellNode.name : `Day ${cellIndex + 1}`,
    x: cellNode.x, y: cellNode.y, width: cellNode.width, height: cellNode.height,
    content: overridden ? cellNode.name : String(cellIndex + 1),
    fontSize: 13, fontWeight: "500", align: "center",
    tokens: compactTokens({ textStyleToken: "typography.caption", fillToken: "text.primary" }),
    semanticId: `${screenId}/calendar-cell/${sectionIndex}/${cellIndex}`,
    componentRole: "calendar-cell",
    devMeta: cellNode.devMeta,
  };
}

function realizeSectionNode(childNode, component, sectionText, screen, manifest, index) {
  const calendarRule = matchCalendarRule(sectionText);
  const isCalendarGrid = calendarRule && Array.isArray(childNode.children) && childNode.children.length > 0;

  if (isCalendarGrid) {
    const cells = childNode.children.map((cellNode, cellIndex) =>
      realizeCalendarCell(cellNode, screen.id, index, cellIndex));
    return {
      type: "section",
      name: component ? component.name : `Calendar ${index}`,
      x: childNode.x, y: childNode.y, width: childNode.width, height: childNode.height,
      tokens: compactTokens(childNode.tokens),
      semanticId: `${screen.id}/${component ? component.role : "calendar"}/${index}`,
      componentRole: component ? component.role : "calendar",
      children: cells,
    };
  }

  const content = contentFor(component, screen);
  const style = resolveNodeStyleTokens(component?.tokenBindings, manifest);
  const typography = resolveTypographyToken(manifest, "typography.cardTitle") || { size: 16, weight: "600" };

  // A label sitting on a strongly-colored fill (a primary action button, a
  // status pill) needs the token PAIRED for exactly that contrast, not the
  // generic neutral-surface text color — text.primary is near-black/near-
  // white and was never designed to sit on a saturated accent fill.
  // action.primaryText is the one token the 026A.2 manifest schema
  // guarantees is contrast-checked against a strong fill, so it's reused
  // here for any strong-fill card, not just literal action.primary ones.
  const STRONG_FILL_TOKENS = new Set(["action.primary", "status.success", "status.warning", "status.danger"]);
  const textFillRef = STRONG_FILL_TOKENS.has(style.fillRef) ? "action.primaryText" : "text.primary";

  const textChild = {
    type: "text",
    name: `${component ? component.name : "Content"} label`,
    x: childNode.x + 16, y: childNode.y + 12,
    width: Math.max(1, childNode.width - 32), height: Math.max(1, childNode.height - 24),
    content: content.title,
    fontSize: typography.size || 16,
    fontWeight: typography.weight || "600",
    tokens: compactTokens({ textStyleToken: "typography.cardTitle", fillToken: textFillRef }),
    semanticId: `${screen.id}/${component ? component.role : "content"}/${index}/label`,
    componentRole: component ? `${component.role}-label` : "label",
  };

  return {
    type: "card",
    name: component ? component.name : `Section ${index}`,
    x: childNode.x, y: childNode.y, width: childNode.width, height: childNode.height,
    borderRadius: style.borderRadius,
    tokens: compactTokens({ fillToken: style.fillRef, radiusToken: style.radiusRef, ...(childNode.tokens || {}) }),
    semanticId: `${screen.id}/${component ? component.role : "section"}/${index}`,
    componentRole: component ? component.role : "section",
    children: [textChild],
  };
}

function buildBackgroundNodes(assets, screenId) {
  const backgroundAsset = (assets?.assets || []).find((a) => a.role.startsWith("background."));
  if (!backgroundAsset) return [];
  return (backgroundAsset.sceneNodes || [])
    .map((raw, i) => {
      let fragment;
      try {
        fragment = JSON.parse(raw);
      } catch (_err) {
        return null;
      }
      const fillToken = fragment?.tokens?.fillToken;
      return {
        type: fragment.type === "ellipse" ? "ellipse" : "rectangle",
        name: fragment.name || `bg-shape-${i + 1}`,
        x: fragment.x || 0, y: fragment.y || 0, width: fragment.width || 100, height: fragment.height || 100,
        opacity: fragment.opacity, rotation: fragment.rotation,
        tokens: compactTokens({ fillToken }),
        semanticId: `${screenId}/background/${i}`,
        componentRole: "background",
      };
    })
    .filter(Boolean);
}

/**
 * buildLogicalScene({ screen, layout, manifest, components, assets, frame }) -> { scene, report }
 * Theme-AGNOSTIC: geometry, structure, content, and token REFERENCES only —
 * no node in the returned tree carries a resolved `fill`. See this
 * module's header for why the split exists.
 */
export function buildLogicalScene({ screen, layout, manifest, components, assets, frame }) {
  const sections = screen.sections || [];
  const matchedComponents = matchComponentsToSections(sections, components);
  const expandedLayout = expandCalendarSections(layout, sections);

  const gridColumnsResolver = (layoutNode) => layoutNode.__gridColumns || 7;
  const leafMeasurer = makeLeafMeasurer(matchedComponents, screen, manifest);

  const { node: rootLayoutNode } = resolveLayout(expandedLayout, { manifest, frame, leafMeasurer, gridColumnsResolver });
  const budgetReport = enforceNodeBudget(rootLayoutNode, MAX_NODES, {});

  const contentNodes = rootLayoutNode.children.map((childNode, i) =>
    realizeSectionNode(childNode, matchedComponents[i], sections[i], screen, manifest, i));

  const backgroundNodes = buildBackgroundNodes(assets, screen.id);

  const contentBottom = rootLayoutNode.y + rootLayoutNode.height;
  const height = Math.max(frame.height, contentBottom + (frame.safeAreaBottom || 0));

  const scene = {
    name: screen.id,
    width: frame.width,
    height,
    semanticId: screen.id,
    tokens: compactTokens({ fillToken: "background.canvas", ...(rootLayoutNode.tokens || {}) }),
    children: [...backgroundNodes, ...contentNodes],
  };

  return {
    scene,
    report: { ...budgetReport, matchedComponents: matchedComponents.map((c) => (c ? c.id : null)) },
  };
}

// ── PATCH 026A.5 — theme resolution ─────────────────────────────────────
// Dark decorative backgrounds get a subtler treatment than a straight
// color-swap would give them — real design systems don't just re-tint a
// background shape's fill for dark mode, they usually also pull back its
// opacity so it doesn't compete with dark mode's naturally reduced
// contrast headroom (per ArtDirection.themeStrategy). This is the ONE
// place this module deliberately introduces a light/dark geometry-adjacent
// difference, which is exactly why it's declared via devMeta.themeDelta —
// theme-parity.mjs's undeclared-difference check would otherwise (rightly)
// reject it.
const DARK_BACKGROUND_OPACITY_FACTOR = 0.7;

function resolveThemeNode(node, manifest, themeVariant) {
  const clone = { ...node, themeVariant };

  if (node.tokens?.fillToken) {
    const fill = resolveColorToken(manifest, themeVariant, node.tokens.fillToken);
    if (fill) clone.fill = fill;
  }

  if (node.componentRole === "background" && themeVariant === "dark" && typeof node.opacity === "number") {
    clone.opacity = Number((node.opacity * DARK_BACKGROUND_OPACITY_FACTOR).toFixed(3));
    clone.devMeta = { ...(node.devMeta || {}), themeDelta: "background vector opacity reduced for dark-theme legibility" };
  }

  if (Array.isArray(node.children)) {
    clone.children = node.children.map((child) => resolveThemeNode(child, manifest, themeVariant));
  }
  return clone;
}

/**
 * resolveThemeBoard(logicalScene, manifest, themeVariant, opts) -> board
 * Pure code, no LLM (026A.5 global rule 3). Resolves every `tokens.fillToken`
 * reference in the logical scene against ONE theme, sets `themeVariant` on
 * every node, and positions the board via `opts.xOffset` (for the
 * side-by-side pairing — see buildPairedThemeBoards()). Does NOT mutate
 * `logicalScene` — returns an independent deep structure.
 */
export function resolveThemeBoard(logicalScene, manifest, themeVariant, opts = {}) {
  const board = resolveThemeNode(logicalScene, manifest, themeVariant);
  board.name = opts.name || `${logicalScene.name} (${themeVariant})`;
  board.x = opts.xOffset || 0;
  board.y = 0;
  return board;
}

function baseScreenName(screen) {
  const id = String(screen?.id || "screen").replace(/-day$|-night$/i, "");
  return id.split(/[-_]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/**
 * buildScreenSpec({ screen, layout, manifest, components, assets, themeVariant, frame }) ->
 *   { screenSpec, report }
 * Single-theme entry point (026A.4) — a thin wrapper over
 * buildLogicalScene() + resolveThemeBoard(), kept so stage-invoker.mjs's
 * existing "scene" stage needs no changes.
 */
export function buildScreenSpec({ screen, layout, manifest, components, assets, themeVariant = "light", frame }) {
  const { scene, report } = buildLogicalScene({ screen, layout, manifest, components, assets, frame });
  const screenSpec = resolveThemeBoard(scene, manifest, themeVariant, { name: `${screen.id} (${themeVariant})` });
  return { screenSpec, report };
}

/**
 * buildPairedThemeBoards({ screen, layout, manifest, components, assets, frame, gap }) ->
 *   { lightBoard, darkBoard, logicalScene, report }
 * Each screen is its own top-level board (root frame); the pair is placed
 * side by side with a deterministic offset (`gap` px, default 80) so
 * they never overlap on the same Penpot page.
 */
export function buildPairedThemeBoards({ screen, layout, manifest, components, assets, frame, gap = 80 }) {
  const { scene: logicalScene, report } = buildLogicalScene({ screen, layout, manifest, components, assets, frame });
  const base = baseScreenName(screen);
  const lightBoard = resolveThemeBoard(logicalScene, manifest, "light", { name: `${base} / Day`, xOffset: 0 });
  const darkBoard = resolveThemeBoard(logicalScene, manifest, "dark", { name: `${base} / Night`, xOffset: lightBoard.width + gap });
  return { lightBoard, darkBoard, logicalScene, report };
}

/**
 * compilePairedBoards(lightBoard, darkBoard, { pageId, newId }) ->
 *   { ok: true, changes, light: {mapping,snapshot,scene}, dark: {...} }
 *   { ok: false, error }
 * Runs EACH board through the full existing 025A pipeline independently
 * (compileScene() only ever handles one root at a time) and merges both
 * Change IR lists into one array — Task 3's "both boards compile through
 * compileScene() create-mode in ONE apply" means one COMBINED changes
 * array handed to persistence-adapter.js's existing, unmodified
 * `Persistence.applyChanges()`, not two separate apply calls.
 */
export function compilePairedBoards(lightBoard, darkBoard, opts = {}) {
  const pageId = opts.pageId;

  const lightParsed = parseScene(JSON.stringify(lightBoard));
  if (!lightParsed.ok) return { ok: false, error: `light board failed parseScene(): ${lightParsed.error}` };
  const darkParsed = parseScene(JSON.stringify(darkBoard));
  if (!darkParsed.ok) return { ok: false, error: `dark board failed parseScene(): ${darkParsed.error}` };

  const lightNormalized = normalizeScene(canonicalizeScene(lightParsed.scene, {}));
  const darkNormalized = normalizeScene(canonicalizeScene(darkParsed.scene, {}));

  const lightCompiled = compileScene(lightNormalized.scene, { pageId, newId: opts.newId });
  if (!lightCompiled.ok) return { ok: false, error: `light board compile failed: ${lightCompiled.error}` };
  const darkCompiled = compileScene(darkNormalized.scene, { pageId, newId: opts.newId });
  if (!darkCompiled.ok) return { ok: false, error: `dark board compile failed: ${darkCompiled.error}` };

  return {
    ok: true,
    changes: [...lightCompiled.changes, ...darkCompiled.changes],
    light: { mapping: lightCompiled.mapping, snapshot: lightCompiled.snapshot, scene: lightNormalized.scene },
    dark: { mapping: darkCompiled.mapping, snapshot: darkCompiled.snapshot, scene: darkNormalized.scene },
  };
}

/**
 * buildPairedIdempotencyKey({ operationId, fileId, pageId, rootSemanticId, sceneHash, mode }) -> string
 * Extends persistence-adapter.js's EXISTING idempotency key convention
 * (`operationId::fileId::pageId::normalizedSceneHash::mode` — see
 * verify-025a-scene-pipeline.mjs's section E/F) with the pair's shared
 * logical root semanticId, inserted before the hash — the pair is applied
 * as ONE operation (one combined changes array, one key), so this key
 * covers both boards together; `sceneHash` should already be computed over
 * BOTH boards' combined normalized content so an edit to either board
 * invalidates the cached entry.
 */
export function buildPairedIdempotencyKey({ operationId, fileId, pageId, rootSemanticId, sceneHash, mode = "create" }) {
  return `${operationId}::${fileId}::${pageId}::${rootSemanticId}::${sceneHash}::${mode}`;
}
