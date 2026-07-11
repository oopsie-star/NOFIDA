// PATCH 026A.2 — Pure-code validators for a DesignSystemManifest.
//
// These run IN ADDITION to (never instead of) the shallow structural check
// in contracts.mjs's validateContract("DesignSystemManifest", ...) — that
// contract only confirms the top-level shape exists (themes.light/dark are
// objects, tokens.* are objects, etc.); it deliberately says nothing about
// WCAG contrast, semantic-token parity between themes, or whether a "dark
// theme" is actually just light with every channel flipped. That is this
// module's job.
//
// No DOM/network/environment access — every function here is a pure
// function of its manifest argument, safe to run in a unit test with no
// provider configured at all.

import { validateContract } from "./contracts.mjs";

export const REQUIRED_SEMANTIC_TOKENS = Object.freeze([
  "background.canvas", "background.surface", "background.surfaceElevated",
  "text.primary", "text.secondary", "text.muted",
  "border.default", "border.strong",
  "action.primary", "action.primaryText",
  "state.selected", "state.disabled",
  "status.success", "status.warning", "status.danger",
]);

export const REQUIRED_TYPOGRAPHY_STYLES = Object.freeze([
  "display", "pageTitle", "sectionTitle", "cardTitle", "body",
  "bodyCompact", "label", "caption", "button", "numericHighlight",
]);

const TYPOGRAPHY_FIELDS = Object.freeze(["family", "size", "weight", "lineHeight", "letterSpacing"]);
const REQUIRED_RADII = Object.freeze(["control", "card", "panel", "modal", "pill", "circle"]);

const BODY_MIN_CONTRAST = 4.5;
const LARGE_MIN_CONTRAST = 3;

// [foreground semantic name, background semantic name, minimum ratio, label]
const CONTRAST_PAIRS = Object.freeze([
  ["text.primary", "background.canvas", BODY_MIN_CONTRAST, "text.primary on background.canvas"],
  ["text.primary", "background.surface", BODY_MIN_CONTRAST, "text.primary on background.surface"],
  ["text.primary", "background.surfaceElevated", BODY_MIN_CONTRAST, "text.primary on background.surfaceElevated"],
  ["text.secondary", "background.canvas", BODY_MIN_CONTRAST, "text.secondary on background.canvas"],
  ["text.secondary", "background.surface", BODY_MIN_CONTRAST, "text.secondary on background.surface"],
  ["text.secondary", "background.surfaceElevated", BODY_MIN_CONTRAST, "text.secondary on background.surfaceElevated"],
  ["action.primaryText", "action.primary", LARGE_MIN_CONTRAST, "action.primaryText on action.primary"],
]);

// A handful of coincidental full-channel inversions is normal (pure black
// vs. pure white trivially invert); a dark theme produced by mechanically
// inverting every channel of every light token is not a designed theme.
const INVERSION_REJECT_RATIO = 0.6;

function isHexColor(value) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim());
}

function hexToRgb(hex) {
  if (!isHexColor(hex)) return null;
  const int = parseInt(hex.trim().slice(1), 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

function srgbChannelToLinear(c) {
  const cs = c / 255;
  return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

/** WCAG 2.1 relative luminance (0..1). Returns null for an unparseable hex. */
export function relativeLuminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return 0.2126 * srgbChannelToLinear(rgb.r) + 0.7152 * srgbChannelToLinear(rgb.g) + 0.0722 * srgbChannelToLinear(rgb.b);
}

/** WCAG 2.1 contrast ratio between two hex colors (1..21). Returns null if either is unparseable. */
export function contrastRatio(hexA, hexB) {
  const lumA = relativeLuminance(hexA);
  const lumB = relativeLuminance(hexB);
  if (lumA === null || lumB === null) return null;
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

function collectPrimitiveHexValues(primitives) {
  const set = new Set();
  (function walk(node) {
    if (!node || typeof node !== "object") return;
    for (const value of Object.values(node)) {
      if (isHexColor(value)) set.add(value.trim().toLowerCase());
      else if (value && typeof value === "object") walk(value);
    }
  })(primitives);
  return set;
}

/**
 * checkContrast(manifest) -> { ok, errors }
 * Verifies text.primary/text.secondary against all three background
 * surfaces, and action.primaryText against action.primary, in BOTH themes,
 * against WCAG 2.1 thresholds (4.5:1 body text, 3:1 for the primary-action
 * label, treated as a large/high-emphasis control label).
 */
export function checkContrast(manifest) {
  const errors = [];
  for (const themeName of ["light", "dark"]) {
    const theme = manifest?.semanticTokens?.[themeName];
    if (!theme || typeof theme !== "object") {
      errors.push(`semanticTokens.${themeName} is missing — cannot check contrast`);
      continue;
    }
    for (const [fg, bg, minRatio, label] of CONTRAST_PAIRS) {
      const ratio = contrastRatio(theme[fg], theme[bg]);
      if (ratio === null) {
        errors.push(`${themeName}: cannot compute contrast for ${label} (missing or invalid hex color)`);
        continue;
      }
      if (ratio < minRatio) {
        errors.push(`${themeName}: ${label} contrast is ${ratio.toFixed(2)}:1, below the required ${minRatio}:1`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * checkIntegrity(manifest) -> { ok, errors }
 * Structural completeness beyond contracts.mjs's shallow check: semantic
 * tokens resolve to a declared primitive and match 1:1 between themes,
 * spacing is strictly increasing, all 10 typography styles are complete,
 * all 6 semantic radii are present, and shadow/border declare both themes.
 */
export function checkIntegrity(manifest) {
  const errors = [];

  const light = manifest?.semanticTokens?.light;
  const dark = manifest?.semanticTokens?.dark;
  if (!light || typeof light !== "object") errors.push("semanticTokens.light is missing or not an object");
  if (!dark || typeof dark !== "object") errors.push("semanticTokens.dark is missing or not an object");

  if (light && typeof light === "object" && dark && typeof dark === "object") {
    const lightKeys = new Set(Object.keys(light));
    const darkKeys = new Set(Object.keys(dark));

    for (const name of REQUIRED_SEMANTIC_TOKENS) {
      if (!lightKeys.has(name)) errors.push(`semanticTokens.light is missing required token "${name}"`);
      if (!darkKeys.has(name)) errors.push(`semanticTokens.dark is missing required token "${name}"`);
    }
    const onlyInLight = [...lightKeys].filter((k) => !darkKeys.has(k));
    const onlyInDark = [...darkKeys].filter((k) => !lightKeys.has(k));
    if (onlyInLight.length) errors.push(`semanticTokens.dark is missing tokens present in light: ${onlyInLight.join(", ")}`);
    if (onlyInDark.length) errors.push(`semanticTokens.light is missing tokens present in dark: ${onlyInDark.join(", ")}`);

    const primitiveValues = collectPrimitiveHexValues(manifest?.tokens?.color?.primitives);
    for (const [themeName, theme] of [["light", light], ["dark", dark]]) {
      for (const [name, value] of Object.entries(theme)) {
        if (!isHexColor(value)) {
          errors.push(`semanticTokens.${themeName}.${name} must be a hex color string`);
          continue;
        }
        if (!primitiveValues.has(value.trim().toLowerCase())) {
          errors.push(`semanticTokens.${themeName}.${name} (${value}) does not resolve to any declared primitive in tokens.color.primitives`);
        }
      }
    }
  }

  const scale = manifest?.tokens?.spacing?.scale;
  if (!Array.isArray(scale) || scale.length < 2) {
    errors.push("tokens.spacing.scale must be an array of at least 2 numbers");
  } else {
    for (let i = 0; i < scale.length; i++) {
      if (typeof scale[i] !== "number" || !Number.isFinite(scale[i])) errors.push(`tokens.spacing.scale[${i}] must be a finite number`);
    }
    for (let i = 1; i < scale.length; i++) {
      if (typeof scale[i] === "number" && typeof scale[i - 1] === "number" && scale[i] <= scale[i - 1]) {
        errors.push(`tokens.spacing.scale is not strictly increasing at index ${i} (${scale[i - 1]} -> ${scale[i]})`);
      }
    }
  }

  const typography = manifest?.tokens?.typography;
  if (!typography || typeof typography !== "object") {
    errors.push("tokens.typography is missing or not an object");
  } else {
    for (const styleName of REQUIRED_TYPOGRAPHY_STYLES) {
      const style = typography[styleName];
      if (!style || typeof style !== "object") {
        errors.push(`tokens.typography.${styleName} is missing`);
        continue;
      }
      for (const field of TYPOGRAPHY_FIELDS) {
        if (style[field] === undefined || style[field] === null || style[field] === "") {
          errors.push(`tokens.typography.${styleName}.${field} is missing`);
        }
      }
    }
  }

  const radius = manifest?.tokens?.radius;
  if (!radius || typeof radius !== "object") {
    errors.push("tokens.radius is missing or not an object");
  } else {
    for (const name of REQUIRED_RADII) {
      if (typeof radius[name] !== "number" && typeof radius[name] !== "string") {
        errors.push(`tokens.radius.${name} is missing`);
      }
    }
  }

  for (const key of ["shadow", "border"]) {
    const value = manifest?.tokens?.[key];
    if (!value || typeof value !== "object" || !value.light || !value.dark) {
      errors.push(`tokens.${key} must declare separate "light" and "dark" values`);
    }
  }

  const accessibility = manifest?.accessibility;
  if (!accessibility || typeof accessibility !== "object") {
    errors.push("accessibility is missing or not an object");
  } else {
    if (typeof accessibility.minContrastBody !== "number" || accessibility.minContrastBody < BODY_MIN_CONTRAST) {
      errors.push(`accessibility.minContrastBody must be a number >= ${BODY_MIN_CONTRAST}`);
    }
    if (typeof accessibility.minContrastLargeText !== "number" || accessibility.minContrastLargeText < LARGE_MIN_CONTRAST) {
      errors.push(`accessibility.minContrastLargeText must be a number >= ${LARGE_MIN_CONTRAST}`);
    }
    if (typeof accessibility.minControlSize !== "number" || accessibility.minControlSize <= 0) {
      errors.push("accessibility.minControlSize must be a positive number");
    }
    for (const field of ["focusRule", "disabledRule", "colorIndependentStatusRule"]) {
      if (typeof accessibility[field] !== "string" || !accessibility[field].trim()) {
        errors.push(`accessibility.${field} must be a non-empty string`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

function isExactChannelInversion(hexA, hexB) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) return false;
  return (255 - a.r) === b.r && (255 - a.g) === b.g && (255 - a.b) === b.b;
}

/**
 * checkNotInvertedDark(manifest) -> { ok, errors }
 * Rejects a dark theme that is a mechanical channel inversion of light
 * (a classic non-design), and sanity-checks that the dark theme's canvas is
 * actually darker than the light theme's — a real luminance-profile check,
 * not just a color-value diff.
 */
export function checkNotInvertedDark(manifest) {
  const errors = [];
  const light = manifest?.semanticTokens?.light;
  const dark = manifest?.semanticTokens?.dark;
  if (!light || typeof light !== "object" || !dark || typeof dark !== "object") {
    return { ok: false, errors: ["semanticTokens.light and semanticTokens.dark are both required to run the inverted-dark heuristic"] };
  }

  const commonNames = Object.keys(light).filter((name) => Object.prototype.hasOwnProperty.call(dark, name));
  if (commonNames.length === 0) {
    return { ok: false, errors: ["no common semantic token names between light and dark to compare"] };
  }

  const invertedCount = commonNames.filter((name) => isExactChannelInversion(light[name], dark[name])).length;
  const ratio = invertedCount / commonNames.length;
  if (ratio >= INVERSION_REJECT_RATIO) {
    errors.push(`dark theme looks like a mechanical channel inversion of light (${invertedCount}/${commonNames.length} tokens, ${Math.round(ratio * 100)}%) — design it independently instead of inverting`);
  }

  const lightCanvasLum = relativeLuminance(light["background.canvas"]);
  const darkCanvasLum = relativeLuminance(dark["background.canvas"]);
  if (lightCanvasLum !== null && darkCanvasLum !== null && darkCanvasLum >= lightCanvasLum) {
    errors.push(`dark theme's background.canvas (luminance ${darkCanvasLum.toFixed(3)}) is not darker than light theme's (luminance ${lightCanvasLum.toFixed(3)}) — luminance profile doesn't look like a real dark theme`);
  }

  return { ok: errors.length === 0, errors };
}

/**
 * validateManifest(manifest) -> { ok, errors }
 * Runs the shallow structural contract (contracts.mjs) plus all three deep
 * checks above and combines their errors. This is the single entry point
 * design-system-generator.mjs's retry loop calls.
 */
export function validateManifest(manifest) {
  const contractResult = validateContract("DesignSystemManifest", manifest);
  const integrity = checkIntegrity(manifest);
  const contrast = checkContrast(manifest);
  const notInverted = checkNotInvertedDark(manifest);
  const errors = [...contractResult.errors, ...integrity.errors, ...contrast.errors, ...notInverted.errors];
  return { ok: errors.length === 0, errors };
}
