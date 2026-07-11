// PATCH 026A.4 — Scene Builder.
//
// Combines product structure (ProductArchitecture screen) + design system
// (DesignSystemManifest) + components + assets + layout-engine geometry +
// content into ONE screenSpec per screen, compatible with the EXISTING
// 025A pipeline (parseScene() -> canonicalizeScene() -> normalizeScene() ->
// compileScene()) — nothing lower; this module never emits Penpot Transit/
// UUIDs.
//
// Deterministic, like asset-resolver.mjs — every creative/product decision
// (what components exist, what content matters, what visual direction) was
// already made in earlier 026A stages. This module's job is mechanical
// assembly: pair each screen SECTION with the best-matching COMPONENT
// (keyword-scored, greedy-unique), expand calendar-role sections into a
// grid of day cells, resolve the layout-planner's SemanticLayout tree into
// absolute geometry via layout-engine.mjs, and resolve every token
// reference (color/typography/radius) into BOTH a real value (so the
// EXISTING compiler renders it correctly today — it resolves nothing
// itself, see penpot-shape-adapter.mjs) AND the symbolic `tokens.*`
// metadata (so the binding survives for future re-theming/handoff).
//
// Every generated node carries a stable `semanticId`
// (`<screen-id>/<component-role>/<index>[/part]`), a meaningful layer
// `name`, `componentRole`, `tokens`, and `themeVariant` — see
// scene-schema.mjs's PATCH 026A.0 metadata fields.

import {
  resolveLayout, enforceNodeBudget, measureText,
  resolveRadiusToken, resolveColorToken, resolveTypographyToken,
} from "./layout-engine.mjs";
import { MAX_NODES } from "../scene/scene-schema.mjs";

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

// ── Style resolution (token -> real value, keeping the token reference) ──
function compactTokens(tokens) {
  const out = {};
  for (const [key, value] of Object.entries(tokens || {})) {
    if (value !== undefined && value !== null) out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

function resolveNodeStyle(tokenBindings, manifest, themeVariant) {
  const fillRef = tokenBindings?.fill || "background.surface";
  const radiusRef = tokenBindings?.cornerRadius;
  const fill = resolveColorToken(manifest, themeVariant, fillRef) || resolveColorToken(manifest, themeVariant, "background.surface") || "#FFFFFF";
  // Deliberately no fallback pixel radius: if there's no resolvable
  // radiusToken, borderRadius stays unset rather than hardcoding a value
  // token-coverage.mjs would then have to flag as unbound — the point of a
  // token-driven system is that an unstyled property beats a hidden magic
  // number.
  const borderRadius = radiusRef ? (resolveRadiusToken(manifest, radiusRef) ?? undefined) : undefined;
  return { fill, borderRadius, fillRef, radiusRef };
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

// ── Realize resolved-geometry leaves into real Scene Model nodes ────────
function realizeCalendarCell(cellNode, manifest, themeVariant, screenId, sectionIndex, cellIndex) {
  const overridden = cellNode.devMeta?.localOverride;
  return {
    type: "text",
    name: overridden ? cellNode.name : `Day ${cellIndex + 1}`,
    x: cellNode.x, y: cellNode.y, width: cellNode.width, height: cellNode.height,
    content: overridden ? cellNode.name : String(cellIndex + 1),
    fontSize: 13, fontWeight: "500", align: "center",
    fill: resolveColorToken(manifest, themeVariant, "text.primary") || "#000000",
    tokens: compactTokens({ textStyleToken: "typography.caption", fillToken: "text.primary" }),
    semanticId: `${screenId}/calendar-cell/${sectionIndex}/${cellIndex}`,
    componentRole: "calendar-cell",
    themeVariant,
    devMeta: cellNode.devMeta,
  };
}

function realizeSectionNode(childNode, component, sectionText, screen, manifest, themeVariant, index) {
  const calendarRule = matchCalendarRule(sectionText);
  const isCalendarGrid = calendarRule && Array.isArray(childNode.children) && childNode.children.length > 0;

  if (isCalendarGrid) {
    const cells = childNode.children.map((cellNode, cellIndex) =>
      realizeCalendarCell(cellNode, manifest, themeVariant, screen.id, index, cellIndex));
    return {
      type: "section",
      name: component ? component.name : `Calendar ${index}`,
      x: childNode.x, y: childNode.y, width: childNode.width, height: childNode.height,
      tokens: compactTokens(childNode.tokens),
      semanticId: `${screen.id}/${component ? component.role : "calendar"}/${index}`,
      componentRole: component ? component.role : "calendar",
      themeVariant,
      children: cells,
    };
  }

  const content = contentFor(component, screen);
  const style = resolveNodeStyle(component?.tokenBindings, manifest, themeVariant);
  const typography = resolveTypographyToken(manifest, "typography.cardTitle") || { size: 16, weight: "600" };

  const textChild = {
    type: "text",
    name: `${component ? component.name : "Content"} label`,
    x: childNode.x + 16, y: childNode.y + 12,
    width: Math.max(1, childNode.width - 32), height: Math.max(1, childNode.height - 24),
    content: content.title,
    fontSize: typography.size || 16,
    fontWeight: typography.weight || "600",
    fill: resolveColorToken(manifest, themeVariant, "text.primary") || "#000000",
    tokens: compactTokens({ textStyleToken: "typography.cardTitle", fillToken: "text.primary" }),
    semanticId: `${screen.id}/${component ? component.role : "content"}/${index}/label`,
    componentRole: component ? `${component.role}-label` : "label",
    themeVariant,
  };

  return {
    type: "card",
    name: component ? component.name : `Section ${index}`,
    x: childNode.x, y: childNode.y, width: childNode.width, height: childNode.height,
    fill: style.fill,
    borderRadius: style.borderRadius,
    tokens: compactTokens({ fillToken: style.fillRef, radiusToken: style.radiusRef, ...(childNode.tokens || {}) }),
    semanticId: `${screen.id}/${component ? component.role : "section"}/${index}`,
    componentRole: component ? component.role : "section",
    themeVariant,
    children: [textChild],
  };
}

function buildBackgroundNodes(assets, manifest, themeVariant, screenId) {
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
      const fill = fillToken ? (resolveColorToken(manifest, themeVariant, fillToken) || "#CCCCCC") : "#CCCCCC";
      return {
        type: fragment.type === "ellipse" ? "ellipse" : "rectangle",
        name: fragment.name || `bg-shape-${i + 1}`,
        x: fragment.x || 0, y: fragment.y || 0, width: fragment.width || 100, height: fragment.height || 100,
        opacity: fragment.opacity, rotation: fragment.rotation,
        fill,
        tokens: compactTokens({ fillToken }),
        semanticId: `${screenId}/background/${i}`,
        componentRole: "background",
        themeVariant,
      };
    })
    .filter(Boolean);
}

/**
 * buildScreenSpec({ screen, layout, manifest, components, assets, themeVariant, frame }) ->
 *   { screenSpec, report }
 *   screen        - one ProductArchitecture.screens[] entry
 *   layout        - the layout-planner's SemanticLayout tree for this
 *                   screen (one child per screen.sections[i], positionally)
 *   manifest      - DesignSystemManifest
 *   components    - ComponentDefinition[]
 *   assets        - AssetResolution (for the background)
 *   themeVariant  - "light" | "dark"
 *   frame         - { width, height, safeAreaTop, safeAreaBottom, safeAreaLeft, safeAreaRight }
 * `screenSpec` is a plain object ready for the EXISTING 025A
 * parseScene()/compileScene() pipeline — nothing here talks to Penpot.
 * `report` includes layout-engine's node-budget report plus the section ->
 * component matching, for diagnostics.
 */
export function buildScreenSpec({ screen, layout, manifest, components, assets, themeVariant = "light", frame }) {
  const sections = screen.sections || [];
  const matchedComponents = matchComponentsToSections(sections, components);
  const expandedLayout = expandCalendarSections(layout, sections);

  const gridColumnsResolver = (layoutNode) => layoutNode.__gridColumns || 7;
  const leafMeasurer = makeLeafMeasurer(matchedComponents, screen, manifest);

  const { node: rootLayoutNode } = resolveLayout(expandedLayout, { manifest, frame, leafMeasurer, gridColumnsResolver });
  const budgetReport = enforceNodeBudget(rootLayoutNode, MAX_NODES, {});

  const contentNodes = rootLayoutNode.children.map((childNode, i) =>
    realizeSectionNode(childNode, matchedComponents[i], sections[i], screen, manifest, themeVariant, i));

  const backgroundNodes = buildBackgroundNodes(assets, manifest, themeVariant, screen.id);

  const canvasColor = resolveColorToken(manifest, themeVariant, "background.canvas") || "#FFFFFF";
  const contentBottom = rootLayoutNode.y + rootLayoutNode.height;
  const height = Math.max(frame.height, contentBottom + (frame.safeAreaBottom || 0));

  const screenSpec = {
    name: `${screen.id} (${themeVariant})`,
    width: frame.width,
    height,
    fill: canvasColor,
    semanticId: screen.id,
    themeVariant,
    tokens: compactTokens({ fillToken: "background.canvas", ...(rootLayoutNode.tokens || {}) }),
    children: [...backgroundNodes, ...contentNodes],
  };

  return {
    screenSpec,
    report: { ...budgetReport, matchedComponents: matchedComponents.map((c) => (c ? c.id : null)) },
  };
}
