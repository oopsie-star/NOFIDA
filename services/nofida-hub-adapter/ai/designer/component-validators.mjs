// PATCH 026A.3 — Pure-code validators for ComponentDefinition arrays.
//
// Same split as design-system-validators.mjs (026A.2): contracts.mjs's
// validateContract("ComponentDefinition", ...) only checks shallow shape
// (tokenBindings is just "some plain object", layout is just "some plain
// object"). This module adds the deep, cross-referencing checks — does each
// tokenBinding actually resolve into the supplied DesignSystemManifest, is
// "layout" itself a valid SemanticLayout, are light/dark accidentally two
// components instead of one with variants — plus the deterministic
// deduplication pass. No DOM/network/environment access.

import { validateContract, validateSemanticLayout } from "./contracts.mjs";

/**
 * resolveTokenBinding(manifest, ref) -> boolean
 * A tokenBinding value resolves if it EITHER:
 *   - exactly matches a semantic token name present in semanticTokens.light
 *     or semanticTokens.dark (e.g. "background.surface", "action.primary"), or
 *   - is a dotted path that resolves inside "tokens" (e.g. "radius.card",
 *     "typography.body", "spacing.scale").
 */
export function resolveTokenBinding(manifest, ref) {
  if (typeof ref !== "string" || !ref.trim()) return false;
  const value = ref.trim();

  const light = manifest?.semanticTokens?.light;
  const dark = manifest?.semanticTokens?.dark;
  if (light && typeof light === "object" && Object.prototype.hasOwnProperty.call(light, value)) return true;
  if (dark && typeof dark === "object" && Object.prototype.hasOwnProperty.call(dark, value)) return true;

  const parts = value.split(".");
  let node = manifest?.tokens;
  for (const part of parts) {
    if (node && typeof node === "object" && Object.prototype.hasOwnProperty.call(node, part)) {
      node = node[part];
    } else {
      return false;
    }
  }
  return node !== undefined;
}

/** checkTokenBindings(component, manifest) -> { ok, errors } — recurses into children. */
export function checkTokenBindings(component, manifest) {
  const errors = [];
  const bindings = component?.tokenBindings;
  if (bindings && typeof bindings === "object" && !Array.isArray(bindings)) {
    for (const [prop, ref] of Object.entries(bindings)) {
      if (typeof ref !== "string") {
        errors.push(`${component?.id || component?.name || "component"}.tokenBindings.${prop} must be a string token reference`);
        continue;
      }
      if (!resolveTokenBinding(manifest, ref)) {
        errors.push(`${component?.id || component?.name || "component"}.tokenBindings.${prop} ("${ref}") does not resolve to any token in the DesignSystemManifest`);
      }
    }
  }
  for (const child of component?.children || []) {
    const result = checkTokenBindings(child, manifest);
    errors.push(...result.errors);
  }
  return { ok: errors.length === 0, errors };
}

/** checkLayoutIsSemanticLayout(component) -> { ok, errors } — layout is optional; absent is fine. */
export function checkLayoutIsSemanticLayout(component) {
  if (component?.layout === undefined || component?.layout === null) return { ok: true, errors: [] };
  return validateSemanticLayout(component.layout, `${component?.id || component?.name || "component"}.layout`);
}

const LIGHT_DARK_SUFFIX_RE = /(light|dark)$/i;

/**
 * checkNoLightDarkDuplicateNames(components) -> { ok, errors }
 * Rejects a component set where light/dark were split into two top-level
 * components (e.g. "PredictionCard" + "PredictionCardDark") instead of one
 * component carrying `variants: ["light", "dark"]`.
 */
export function checkNoLightDarkDuplicateNames(components) {
  const errors = [];
  const allNames = new Set((components || []).map((c) => String(c?.name || "").trim().toLowerCase()).filter(Boolean));

  for (const c of components || []) {
    const name = String(c?.name || "").trim();
    const stripped = name.replace(LIGHT_DARK_SUFFIX_RE, "").trim();
    if (stripped && stripped.toLowerCase() !== name.toLowerCase() && allNames.has(stripped.toLowerCase())) {
      errors.push(`"${name}" looks like a light/dark duplicate of "${stripped}" — use one component with variants: ["light","dark"] instead of two components`);
    }
  }
  return { ok: errors.length === 0, errors };
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key]);
    return out;
  }
  return value;
}

function canonicalSignature(component) {
  const { id, name, variants, ...rest } = component || {};
  return JSON.stringify(canonicalize(rest));
}

/**
 * dedupeComponents(components) -> deduped array
 * Merges structurally identical definitions (identical role/props/states/
 * layout/tokenBindings/children — everything except id/name/variants) into
 * one, unioning their "variants" arrays. Keeps the FIRST occurrence's id and
 * name. This is what "light/dark is a variant, not two components" falls
 * back on even if the model emits two near-duplicate definitions that only
 * differ by variants.
 */
export function dedupeComponents(components) {
  const bySignature = new Map();
  const order = [];
  for (const component of components || []) {
    const sig = canonicalSignature(component);
    if (bySignature.has(sig)) {
      const existing = bySignature.get(sig);
      existing.variants = [...new Set([...(existing.variants || []), ...(component.variants || [])])];
    } else {
      const clone = { ...component, variants: [...(component.variants || [])] };
      bySignature.set(sig, clone);
      order.push(sig);
    }
  }
  return order.map((sig) => bySignature.get(sig));
}

/** validateComponentDeep(component, manifest) -> { ok, errors } — contract + tokenBindings + layout. */
export function validateComponentDeep(component, manifest) {
  const contractResult = validateContract("ComponentDefinition", component);
  const tokenResult = checkTokenBindings(component, manifest);
  const layoutResult = checkLayoutIsSemanticLayout(component);
  const errors = [...contractResult.errors, ...tokenResult.errors, ...layoutResult.errors];
  return { ok: errors.length === 0, errors };
}
