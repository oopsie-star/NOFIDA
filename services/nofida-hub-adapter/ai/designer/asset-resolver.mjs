// PATCH 026A.3 — Asset Resolver.
//
// Deterministic, LLM-free: deciding WHICH visual assets a product needs
// (backgrounds/icons/avatars) and HOW to source each one is mechanical rule-
// following, not a creative judgment call — see PATCH 026A.0's global rule
// "deterministic logic is plain code; only creative/product decisions go
// through LLM tasks". The designer_asset_resolver prompt-registry entry
// still carries a real prompt (documentation of this same policy for future
// LLM-assisted extensions), but this module never calls a provider itself,
// which is also why its own verification needs no mocked provider.
//
// Resolution priority (stops at the first satisfiable source):
//   1. existing project assets
//   2. NOFIDA media bank
//   3. approved icon library
//   4. programmatically generated vector decoration
//   5. connected image-generation provider (only if configured AND needed)
//   6. safe placeholder
//
// Every asset MUST carry a non-empty "license" — a candidate without one is
// skipped, never accepted, at every tier (not just external sources).

import { validateContract } from "./contracts.mjs";
import { REQUIRED_SEMANTIC_TOKENS } from "./design-system-validators.mjs";

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

// NOFIDA's built-in, always-available icon set — resolved by semantic name,
// never a raw glyph/emoji. Real icon geometry lives in the icon-library
// asset (out of scope here); this is the resolution-time registry of what
// NAMES are approved and what license covers them.
const ICON_LIBRARY = Object.freeze({
  "icon.calendar": "NOFIDA Icon Set v1 (internal)",
  "icon.settings": "NOFIDA Icon Set v1 (internal)",
  "icon.profile": "NOFIDA Icon Set v1 (internal)",
  "icon.bell": "NOFIDA Icon Set v1 (internal)",
  "icon.check": "NOFIDA Icon Set v1 (internal)",
  "icon.close": "NOFIDA Icon Set v1 (internal)",
  "icon.plus": "NOFIDA Icon Set v1 (internal)",
  "icon.warning": "NOFIDA Icon Set v1 (internal)",
  "icon.info": "NOFIDA Icon Set v1 (internal)",
  "icon.chevron-right": "NOFIDA Icon Set v1 (internal)",
  "icon.chevron-left": "NOFIDA Icon Set v1 (internal)",
});

// [keyword pattern, canonical icon role] — deterministic derivation of which
// icons a product's screens call for, from the same section/action text the
// 026A.1 acceptance test already scans.
const ICON_KEYWORD_MAP = Object.freeze([
  [/calendar|month|week|date/i, "icon.calendar"],
  [/setting|preference|config/i, "icon.settings"],
  [/profile|account|avatar/i, "icon.profile"],
  [/notif|bell|alert|remind/i, "icon.bell"],
  [/confirm|check|done|complete/i, "icon.check"],
  [/close|dismiss|cancel/i, "icon.close"],
  [/\badd\b|plus|\bnew\b|create/i, "icon.plus"],
  [/warn|caution/i, "icon.warning"],
  [/\binfo\b|details|about/i, "icon.info"],
  [/navigat|switch between|forward/i, "icon.chevron-right"],
]);

// Candidate fill tokens for generated backgrounds — restricted to the
// canonical semantic names every valid DesignSystemManifest declares
// (design-system-validators.mjs's REQUIRED_SEMANTIC_TOKENS), so a generated
// background never references a token name that might not exist.
const BACKGROUND_FILL_TOKENS = REQUIRED_SEMANTIC_TOKENS.filter((name) =>
  ["action.primary", "state.selected", "background.surfaceElevated", "status.success"].includes(name),
);

function architectureText(productArchitecture) {
  const parts = [];
  for (const screen of productArchitecture?.screens || []) {
    parts.push(screen.purpose || "", screen.primaryAction || "");
    parts.push(...(screen.sections || []), ...(screen.contentRequirements || []), ...(screen.secondaryActions || []));
  }
  return parts.join(" | ").toLowerCase();
}

function deriveIconRoles(text) {
  const found = new Set();
  for (const [pattern, iconRole] of ICON_KEYWORD_MAP) {
    if (pattern.test(text)) found.add(iconRole);
  }
  return [...found];
}

function deriveNeededRoles(productArchitecture, artDirection) {
  const text = architectureText(productArchitecture);
  const roles = new Set();

  if (/abstract/i.test(artDirection?.imageStrategy || "") || /background/i.test(artDirection?.imageStrategy || "")) {
    roles.add("background.hero");
  }
  for (const iconRole of deriveIconRoles(text)) roles.add(iconRole);
  if (/profile|avatar|account/i.test(text)) roles.add("avatar.user");

  return [...roles];
}

function resolveFromExisting(role, existingProjectAssets) {
  const match = (existingProjectAssets || []).find((a) => a && (a.role === role || a.semanticName === role));
  if (!match || !isNonEmptyString(match.license)) return null;
  return {
    role,
    source: `project-asset:${match.id || role}`,
    editable: match.editable !== false,
    license: match.license,
    sceneNodes: Array.isArray(match.sceneNodes) ? match.sceneNodes.filter((n) => typeof n === "string") : [],
  };
}

function resolveFromMediaBank(role, mediaCatalogItems) {
  const term = role.replace(/^(icon|background|avatar)\./, "").toLowerCase();
  const match = (mediaCatalogItems || []).find((item) => {
    if (!item || !isNonEmptyString(item.license)) return false;
    const haystack = `${item.title || ""} ${item.category || ""} ${(item.tags || []).join(" ")}`.toLowerCase();
    return haystack.includes(term);
  });
  if (!match) return null;
  return {
    role,
    source: `media-bank:${match.id}`,
    editable: false,
    license: match.license,
    sceneNodes: [],
  };
}

function resolveFromIconLibrary(role) {
  const license = ICON_LIBRARY[role];
  if (!license) return null;
  const node = JSON.stringify({ type: "icon-glyph", name: role, width: 24, height: 24, tokens: { fillToken: "text.primary" } });
  return { role, source: `icon-library:${role}`, editable: true, license, sceneNodes: [node] };
}

// The only non-trivial "generation" in this module — deterministic geometric
// placement, not an LLM call. 3-8 large primitive shapes (within range: 5),
// each bound to a semantic fill token so both themes restyle the same
// geometry, never a flattened raster screenshot.
function generateVectorBackground(role, width = 393, height = 852) {
  const shapeCount = 5;
  const nodes = [];
  for (let i = 0; i < shapeCount; i++) {
    const fillToken = BACKGROUND_FILL_TOKENS[i % BACKGROUND_FILL_TOKENS.length] || "action.primary";
    const size = Math.round(width * (0.4 + (i % 3) * 0.15));
    nodes.push(JSON.stringify({
      type: i % 2 === 0 ? "ellipse" : "rectangle",
      name: `bg-shape-${i + 1}`,
      x: Math.round((i * 37) % width),
      y: Math.round((i * 53) % height),
      width: size,
      height: size,
      opacity: Number((0.16 + (i % 3) * 0.06).toFixed(2)),
      rotation: (i * 21) % 360,
      tokens: { fillToken },
    }));
  }
  return { role, source: "generated-vector", editable: true, license: "NOFIDA generated (internal)", sceneNodes: nodes };
}

function resolveFromImageProvider(role, imageProvider) {
  if (typeof imageProvider !== "function") return null;
  const generated = imageProvider(role);
  if (!generated || !isNonEmptyString(generated.license)) return null;
  return {
    role,
    source: generated.source || `image-provider:${role}`,
    editable: generated.editable !== false,
    license: generated.license,
    sceneNodes: Array.isArray(generated.sceneNodes) ? generated.sceneNodes.filter((n) => typeof n === "string") : [],
  };
}

function resolvePlaceholder(role) {
  return { role, source: "placeholder", editable: false, license: "internal-placeholder (NOFIDA)", sceneNodes: [] };
}

function resolveRole(role, ctx) {
  return (
    resolveFromExisting(role, ctx.existingProjectAssets) ||
    resolveFromMediaBank(role, ctx.mediaCatalogItems) ||
    (role.startsWith("icon.") ? resolveFromIconLibrary(role) : null) ||
    (role.startsWith("background.") && ctx.isAbstractBackground ? generateVectorBackground(role) : null) ||
    resolveFromImageProvider(role, ctx.imageProvider) ||
    resolvePlaceholder(role)
  );
}

/**
 * resolveAssets({ productArchitecture, artDirection, components, existingProjectAssets, mediaCatalogItems, imageProvider }) -> AssetResolution
 * Synchronous and pure other than the optional `imageProvider` callback.
 * `components` is accepted for interface symmetry with the pipeline stage
 * (asset roles are currently derived from productArchitecture/artDirection
 * text, not the component list — a later sub-patch may extend derivation to
 * scan component roles too) but is not required for resolution to work.
 */
export function resolveAssets({
  productArchitecture,
  artDirection,
  components = [],
  existingProjectAssets = [],
  mediaCatalogItems = [],
  imageProvider = null,
}) {
  const isAbstractBackground = /abstract/i.test(artDirection?.imageStrategy || "");
  const roles = deriveNeededRoles(productArchitecture, artDirection);

  const assets = roles.map((role) =>
    resolveRole(role, { existingProjectAssets, mediaCatalogItems, imageProvider, isAbstractBackground }),
  );

  const resolution = { assets };
  const check = validateContract("AssetResolution", resolution);
  if (!check.ok) {
    // A contract violation here would be a bug in this module's own
    // construction, not a retryable external failure — fail loudly rather
    // than silently emitting a resolution the rest of the pipeline can't use.
    throw new Error(`asset-resolver produced an invalid AssetResolution: ${check.errors.join("; ")}`);
  }
  return resolution;
}
