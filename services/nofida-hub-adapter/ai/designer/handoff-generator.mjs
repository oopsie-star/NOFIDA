// PATCH 026A.8 — Developer Handoff generator.
//
// PURE CODE over already-produced session artifacts (DesignSystemManifest,
// ComponentDefinition[], ProductArchitecture, SemanticLayout, and a
// resolved/themed board) — see this patch's global rule 2: the
// designer_handoff_generator LLM task is used ONLY for short interaction/
// accessibility PROSE notes per component, never for a single value (color,
// spacing, dimension, token name). Every value in the returned bundle is
// read straight from the manifest/board — if the LLM call fails or is
// skipped, generateHandoff() still returns a complete, correct bundle with
// template-based notes (see DEFAULT_INTERACTION_NOTE/DEFAULT_ACCESSIBILITY_NOTE).
//
// Output (bundle): { designSystemJson, cssVariables, components, screens } —
// exactly the four deliverables in the PATCH 026A.8 spec. Nothing here
// emits Transit, a Penpot id, or a raw Scene Model node with internal
// fields (nid/devMeta) — see this patch's global rule 3.

import { getPromptDefinition } from "../prompt-registry.mjs";

// ── naming helpers ──────────────────────────────────────────────────────

function toKebab(pathOrName) {
  return String(pathOrName || "")
    .replace(/\./g, "-")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase();
}

function hexToRgbTriplet(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return null;
  const int = parseInt(m[1], 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function shadowToCss(shadow) {
  if (!shadow || typeof shadow !== "object") return null;
  const rgb = hexToRgbTriplet(shadow.color) || [0, 0, 0];
  const opacity = typeof shadow.opacity === "number" ? shadow.opacity : 1;
  const offsetY = typeof shadow.offsetY === "number" ? shadow.offsetY : 0;
  const blur = typeof shadow.blur === "number" ? shadow.blur : 0;
  return `0px ${offsetY}px ${blur}px rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${opacity})`;
}

// ── nofida-design-system.json ───────────────────────────────────────────

/**
 * buildDesignSystemJson(manifest, components) -> plain object, JSON-serializable
 * as-is. A curated projection of the manifest — every field a developer
 * needs to reproduce the design system without opening Penpot.
 */
export function buildDesignSystemJson(manifest, components = []) {
  return {
    name: manifest?.name || "Design System",
    themes: manifest?.themes || {},
    primitives: manifest?.tokens?.color?.primitives || {},
    semanticTokens: manifest?.semanticTokens || {},
    typography: manifest?.tokens?.typography || {},
    spacingScale: manifest?.tokens?.spacing?.scale || [],
    radius: manifest?.tokens?.radius || {},
    shadow: manifest?.tokens?.shadow || {},
    border: manifest?.tokens?.border || {},
    componentDefaults: manifest?.componentDefaults || {},
    accessibility: manifest?.accessibility || {},
    components: (components || []).map((c) => ({ id: c.id, name: c.name, role: c.role, variants: c.variants || [], states: c.states || [] })),
  };
}

// ── CSS custom properties ───────────────────────────────────────────────

function flattenPrimitives(primitives, prefix, lines) {
  for (const [key, value] of Object.entries(primitives || {})) {
    const path = prefix ? `${prefix}-${key}` : key;
    if (typeof value === "string") {
      lines.push(`  --color-${toKebab(path)}: ${value};`);
    } else if (value && typeof value === "object") {
      flattenPrimitives(value, path, lines);
    }
  }
}

function semanticColorLines(semanticTokens) {
  return Object.entries(semanticTokens || {}).map(([ref, hex]) => `  --color-${toKebab(ref)}: ${hex};`);
}

function typographyLines(typography) {
  const lines = [];
  for (const [name, style] of Object.entries(typography || {})) {
    if (!style || typeof style !== "object") continue;
    const kebab = toKebab(name);
    if (style.family) lines.push(`  --font-${kebab}-family: "${style.family}";`);
    if (typeof style.size === "number") lines.push(`  --font-${kebab}-size: ${style.size}px;`);
    if (style.weight !== undefined) lines.push(`  --font-${kebab}-weight: ${style.weight};`);
    if (typeof style.lineHeight === "number") lines.push(`  --font-${kebab}-line-height: ${style.lineHeight}px;`);
    if (typeof style.letterSpacing === "number") lines.push(`  --font-${kebab}-letter-spacing: ${style.letterSpacing}px;`);
  }
  return lines;
}

function spacingLines(scale) {
  return (Array.isArray(scale) ? scale : []).map((n) => `  --space-${n}: ${n}px;`);
}

function radiusLines(radius) {
  return Object.entries(radius || {}).map(([name, value]) => `  --radius-${toKebab(name)}: ${value}px;`);
}

function borderLines(border) {
  return Object.entries(border || {}).map(([name, hex]) => `  --border-${toKebab(name)}: ${hex};`);
}

function shadowLines(shadow) {
  const lines = [];
  for (const [name, spec] of Object.entries(shadow || {})) {
    const css = shadowToCss(spec);
    if (css) lines.push(`  --shadow-${toKebab(name)}: ${css};`);
  }
  return lines;
}

/**
 * buildCssVariables(manifest) -> a self-contained CSS string: `:root { ... }`
 * (light values + every theme-independent token) plus
 * `[data-theme="dark"] { ... }` overriding the semantic/shadow/border values
 * that differ in the dark theme.
 */
export function buildCssVariables(manifest) {
  const rootLines = [];
  flattenPrimitives(manifest?.tokens?.color?.primitives, "", rootLines);
  rootLines.push(...semanticColorLines(manifest?.semanticTokens?.light));
  rootLines.push(...typographyLines(manifest?.tokens?.typography));
  rootLines.push(...spacingLines(manifest?.tokens?.spacing?.scale));
  rootLines.push(...radiusLines(manifest?.tokens?.radius));
  rootLines.push(...borderLines(manifest?.tokens?.border?.light));
  rootLines.push(...shadowLines(manifest?.tokens?.shadow?.light));

  const darkLines = [
    ...semanticColorLines(manifest?.semanticTokens?.dark),
    ...borderLines(manifest?.tokens?.border?.dark),
    ...shadowLines(manifest?.tokens?.shadow?.dark),
  ];

  return [
    ":root {",
    ...rootLines,
    "}",
    "",
    '[data-theme="dark"] {',
    ...darkLines,
    "}",
    "",
  ].join("\n");
}

// ── component tree (screen handoff) ─────────────────────────────────────
// Deliberately drops internal-only fields (nid, devMeta, raw x/y position,
// literal `fill`) — a developer gets structure/size/token-bindings, never
// the raw Scene Model or a Penpot-internal detail (this patch's global rule 3).

function walkComponentTree(node) {
  if (!node || typeof node !== "object") return null;
  return {
    semanticId: node.semanticId || null,
    name: node.name || null,
    type: node.type || null,
    componentRole: node.componentRole || null,
    width: typeof node.width === "number" ? node.width : null,
    height: typeof node.height === "number" ? node.height : null,
    tokens: node.tokens || undefined,
    content: node.type === "text" ? node.content : undefined,
    children: Array.isArray(node.children) && node.children.length
      ? node.children.map(walkComponentTree).filter(Boolean)
      : undefined,
  };
}

function findNodesByComponentRole(root, role) {
  const found = [];
  (function walk(node) {
    if (!node || typeof node !== "object") return;
    if (node.componentRole === role) found.push(node);
    for (const child of node.children || []) walk(child);
  })(root);
  return found;
}

// ── per-component handoff ───────────────────────────────────────────────

const DEFAULT_INTERACTION_NOTE = (component) =>
  `Standard ${component.role.replace(/-/g, " ")} interaction: tap/click activates its primary action; ${
    (component.states || []).includes("disabled") ? "the disabled state suppresses all interaction." : "no special gesture handling is required."
  }`;

const DEFAULT_ACCESSIBILITY_NOTE = (component) =>
  `Ensure a minimum 44x44px touch target, a screen-reader label matching its visible text, and that its bound color tokens meet WCAG AA contrast in both themes.`;

/**
 * buildComponentHandoff(component, board) -> {
 *   id, name, role, purpose, props, variants, states,
 *   dimensions: { width, height } | null,
 *   tokenBindings, interactionNote, accessibilityNote,
 * }
 * `interactionNote`/`accessibilityNote` default to a deterministic template
 * — callers that also ran the LLM notes pass (see attachHandoffNotes())
 * overwrite these afterward, never the other fields.
 */
export function buildComponentHandoff(component, board) {
  const instances = board ? findNodesByComponentRole(board, component.role) : [];
  const representative = instances[0] || null;
  return {
    id: component.id,
    name: component.name,
    role: component.role,
    purpose: component.role.replace(/-/g, " "),
    props: component.props || {},
    variants: component.variants || [],
    states: component.states || [],
    dimensions: representative ? { width: representative.width, height: representative.height } : null,
    tokenBindings: component.tokenBindings || representative?.tokens || {},
    interactionNote: DEFAULT_INTERACTION_NOTE(component),
    accessibilityNote: DEFAULT_ACCESSIBILITY_NOTE(component),
  };
}

// ── per-screen handoff ───────────────────────────────────────────────────

function humanizeResponsive(layoutNode) {
  if (!layoutNode || typeof layoutNode !== "object") return "sizes to its content";
  const width = layoutNode.width === "fill" ? "stretches to the full available width" : "sizes to its own content";
  const stacking = layoutNode.type === "grid" ? "arranges its children in a grid" : (layoutNode.direction === "horizontal" ? "lays its children out in a row" : "stacks its children vertically");
  const constraints = [];
  if (typeof layoutNode.minWidth === "number") constraints.push(`min width ${layoutNode.minWidth}px`);
  if (typeof layoutNode.maxWidth === "number") constraints.push(`max width ${layoutNode.maxWidth}px`);
  if (typeof layoutNode.minHeight === "number") constraints.push(`min height ${layoutNode.minHeight}px`);
  return [width, stacking, constraints.length ? `(${constraints.join(", ")})` : null].filter(Boolean).join(", ");
}

/**
 * buildScreenHandoff({ screen, layout, board, pairedBoard }) -> {
 *   id, frameSize, sections: [{ name, contentRules, responsiveBehavior }],
 *   componentTree, navigationActions, themeVariants,
 * }
 * `board`/`pairedBoard` are the resolved light/dark boards for the SAME
 * logical screen (see designer-scene-builder.mjs's buildPairedThemeBoards())
 * — frameSize/componentTree are read from `board` (light); `pairedBoard`
 * only contributes its themeVariant tag.
 */
export function buildScreenHandoff({ screen, layout, board, pairedBoard }) {
  const sections = (screen?.sections || []).map((sectionText, i) => ({
    name: sectionText,
    contentRules: (screen?.contentRequirements || [])[i] || null,
    responsiveBehavior: humanizeResponsive((layout?.children || [])[i]),
  }));

  return {
    id: screen?.id || null,
    frameSize: board ? { width: board.width, height: board.height } : null,
    sections,
    componentTree: board ? walkComponentTree(board) : null,
    navigationActions: {
      primary: screen?.primaryAction || null,
      secondary: screen?.secondaryActions || [],
    },
    contentRules: screen?.contentRequirements || [],
    themeVariants: [board?.themeVariant, pairedBoard?.themeVariant].filter(Boolean),
  };
}

// ── LLM prose enrichment (interaction/accessibility notes ONLY) ─────────

function extractJsonCandidate(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return trimmed;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) return fenced[1].trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return null;
}

/**
 * attachHandoffNotes(componentHandoffs, { aiSettingsService, role }) ->
 *   componentHandoffs with interactionNote/accessibilityNote possibly
 *   replaced by LLM prose. On ANY failure (no service supplied, invalid
 *   JSON, a missing componentId) this is a no-op — the deterministic
 *   template notes already on each entry stand. Never touches any other
 *   field (values always come from buildComponentHandoff(), never the LLM
 *   — this patch's global rule 2).
 */
export async function attachHandoffNotes(componentHandoffs, { aiSettingsService, role = "default" } = {}) {
  if (!aiSettingsService || !componentHandoffs.length) return componentHandoffs;

  try {
    const definition = getPromptDefinition("designer_handoff_generator");
    const systemPrompt = definition.buildSystemPrompt();
    const message = `Components (JSON):\n${JSON.stringify(componentHandoffs.map((c) => ({ id: c.id, name: c.name, role: c.role, variants: c.variants, states: c.states })))}`;
    const resolved = await aiSettingsService.resolveModelForRole(role);
    const callResult = await aiSettingsService.callWithResolvedModel({ resolved, message, systemPrompt });
    const candidate = extractJsonCandidate(callResult.answer);
    if (!candidate) return componentHandoffs;
    const parsed = JSON.parse(candidate);
    const notesById = new Map((Array.isArray(parsed?.notes) ? parsed.notes : []).map((n) => [n.componentId, n]));
    return componentHandoffs.map((c) => {
      const note = notesById.get(c.id);
      if (!note) return c;
      return {
        ...c,
        interactionNote: typeof note.interaction === "string" && note.interaction.trim() ? note.interaction.trim() : c.interactionNote,
        accessibilityNote: typeof note.accessibility === "string" && note.accessibility.trim() ? note.accessibility.trim() : c.accessibilityNote,
      };
    });
  } catch (_err) {
    return componentHandoffs;
  }
}

// ── top-level entry point ─────────────────────────────────────────────────

/**
 * generateHandoff({ architecture, manifest, components, layout, board, pairedBoard }, { aiSettingsService, role }) ->
 *   { ok: true, bundle: { designSystemJson, cssVariables, components, screens } }
 * Pure/deterministic except for the OPTIONAL prose-notes enrichment pass
 * (attachHandoffNotes()) — every value is read from already-validated
 * session artifacts, never invented here.
 */
export async function generateHandoff({ architecture, manifest, components, layout, board, pairedBoard }, { aiSettingsService, role = "default" } = {}) {
  const componentList = components || [];
  const designSystemJson = buildDesignSystemJson(manifest, componentList);
  const cssVariables = buildCssVariables(manifest);

  let componentHandoffs = componentList.map((c) => buildComponentHandoff(c, board));
  componentHandoffs = await attachHandoffNotes(componentHandoffs, { aiSettingsService, role });

  const screens = (architecture?.screens || []).slice(0, 1).map((screen) =>
    buildScreenHandoff({ screen, layout, board, pairedBoard }));

  return {
    ok: true,
    bundle: { designSystemJson, cssVariables, components: componentHandoffs, screens },
  };
}
