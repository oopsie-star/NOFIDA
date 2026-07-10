// PATCH 026A.0 — Inter-stage contracts for the Autonomous Designer pipeline.
//
// Every JSON artifact that flows between pipeline.mjs stages is validated
// against exactly one of these schemas before it is allowed to reach the
// next stage. These are copied verbatim from the master 026A spec and are
// IMMUTABLE for later sub-patches — a later sub-patch that needs a field
// this shape doesn't have gets a new contract, not an edit to this one.
//
// Pure module: no DOM/network/environment access. Deliberately NOT as deep
// as scene-validator.mjs (no clamping/coercion) — a contract violation here
// is a hard pipeline-abort condition (see pipeline.mjs), not something to
// silently repair, so validators only need to catch shape errors, not fix
// them.

function isPlainObject(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
function isString(v) {
  return typeof v === "string";
}
function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}
function isNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}
function isBoolean(v) {
  return typeof v === "boolean";
}
function isArray(v) {
  return Array.isArray(v);
}
function isStringArray(v) {
  return Array.isArray(v) && v.every((item) => typeof item === "string");
}
function enumOf(values) {
  const set = new Set(values);
  return (v) => typeof v === "string" && set.has(v);
}

// field(): declares one field's requiredness + type check, used by
// validateObject() below to drive both "missing required field" and
// "unrecognized field" (unknown top-level keys are always rejected) errors
// with path-qualified messages.
function field(check, required = true) {
  return { check, required };
}

function validateObject(value, path, spec, errors) {
  if (!isPlainObject(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  const allowed = new Set(Object.keys(spec));
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`${path}.${key} is not a recognized field`);
  }
  for (const [key, fieldSpec] of Object.entries(spec)) {
    const fieldPath = `${path}.${key}`;
    const fieldValue = value[key];
    if (fieldValue === undefined || fieldValue === null) {
      if (fieldSpec.required) errors.push(`${fieldPath} is required`);
      continue;
    }
    if (typeof fieldSpec.check === "function") {
      if (!fieldSpec.check(fieldValue, fieldPath, errors)) {
        errors.push(`${fieldPath} is invalid`);
      }
    }
  }
}

function validateArrayOf(itemCheckOrValidator) {
  return (value, path, errors) => {
    if (!isArray(value)) {
      errors.push(`${path} must be an array`);
      return false;
    }
    value.forEach((item, i) => itemCheckOrValidator(item, `${path}[${i}]`, errors));
    return true;
  };
}

// ── ProductBrief ─────────────────────────────────────────────────────────

function checkPlatform(value, path, errors) {
  validateObject(value, path, {
    type: field(isNonEmptyString),
    width: field(isNumber),
    height: field(isNumber),
    safeArea: field((v, p, e) => {
      validateObject(v, p, {
        top: field(isNumber, false),
        right: field(isNumber, false),
        bottom: field(isNumber, false),
        left: field(isNumber, false),
      }, e);
      return true;
    }, false),
  }, errors);
  return true;
}

export function validateProductBrief(payload, path = "ProductBrief") {
  const errors = [];
  validateObject(payload, path, {
    productType: field(isNonEmptyString),
    domain: field(isNonEmptyString),
    targetUsers: field(isStringArray),
    primaryJob: field(isNonEmptyString),
    requiredScreens: field(isStringArray),
    requiredFeatures: field(isStringArray),
    contentPriorities: field(isStringArray),
    constraints: field(isStringArray, false),
    platform: field(checkPlatform),
    assumptions: field(isStringArray, false),
    confidence: field((v) => isNumber(v) && v >= 0 && v <= 1),
  }, errors);
  return { ok: errors.length === 0, errors };
}

// ── ProductArchitecture ──────────────────────────────────────────────────

function checkScreen(value, path, errors) {
  validateObject(value, path, {
    id: field(isNonEmptyString),
    purpose: field(isNonEmptyString),
    primaryAction: field(isNonEmptyString),
    secondaryActions: field(isStringArray, false),
    sections: field(isStringArray),
    states: field(isStringArray, false),
    contentRequirements: field(isStringArray, false),
  }, errors);
  return true;
}

export function validateProductArchitecture(payload, path = "ProductArchitecture") {
  const errors = [];
  validateObject(payload, path, {
    flows: field(isStringArray),
    screens: field(validateArrayOf(checkScreen)),
  }, errors);
  return { ok: errors.length === 0, errors };
}

// ── ArtDirection ──────────────────────────────────────────────────────────

export function validateArtDirection(payload, path = "ArtDirection") {
  const errors = [];
  validateObject(payload, path, {
    direction: field(isNonEmptyString),
    keywords: field(isStringArray),
    density: field(enumOf(["compact", "comfortable", "spacious"])),
    contrast: field(enumOf(["low", "medium", "high"])),
    cornerStyle: field(enumOf(["sharp", "rounded", "pill"])),
    surfaceStyle: field(isNonEmptyString),
    imageStrategy: field(isNonEmptyString),
    themeStrategy: field(isNonEmptyString),
    avoid: field(isStringArray, false),
  }, errors);
  return { ok: errors.length === 0, errors };
}

// ── DesignSystemManifest ────────────────────────────────────────────────

export function validateDesignSystemManifest(payload, path = "DesignSystemManifest") {
  const errors = [];
  validateObject(payload, path, {
    name: field(isNonEmptyString),
    themes: field((v, p, e) => {
      validateObject(v, p, { light: field(isPlainObject), dark: field(isPlainObject) }, e);
      return true;
    }),
    tokens: field((v, p, e) => {
      validateObject(v, p, {
        color: field(isPlainObject, false),
        typography: field(isPlainObject, false),
        spacing: field(isPlainObject, false),
        radius: field(isPlainObject, false),
        shadow: field(isPlainObject, false),
        border: field(isPlainObject, false),
        opacity: field(isPlainObject, false),
        motion: field(isPlainObject, false),
      }, e);
      return true;
    }),
    semanticTokens: field(isPlainObject),
    componentDefaults: field(isPlainObject),
    accessibility: field(isPlainObject),
  }, errors);
  return { ok: errors.length === 0, errors };
}

// ── ComponentDefinition ──────────────────────────────────────────────────

export function validateComponentDefinition(payload, path = "ComponentDefinition") {
  const errors = [];
  validateObject(payload, path, {
    id: field(isNonEmptyString),
    name: field(isNonEmptyString),
    role: field(isNonEmptyString),
    props: field(isPlainObject, false),
    variants: field(isArray, false),
    states: field(isStringArray, false),
    layout: field(isPlainObject, false),
    tokenBindings: field(isPlainObject, false),
    children: field((v, p, e) => {
      if (!isArray(v)) { e.push(`${p} must be an array`); return false; }
      v.forEach((child, i) => {
        const result = validateComponentDefinition(child, `${p}[${i}]`);
        e.push(...result.errors);
      });
      return true;
    }, false),
  }, errors);
  return { ok: errors.length === 0, errors };
}

// ── AssetResolution ──────────────────────────────────────────────────────

function checkAsset(value, path, errors) {
  validateObject(value, path, {
    role: field(isNonEmptyString),
    source: field(isNonEmptyString),
    editable: field(isBoolean),
    license: field(isNonEmptyString),
    sceneNodes: field(isStringArray),
  }, errors);
  return true;
}

export function validateAssetResolution(payload, path = "AssetResolution") {
  const errors = [];
  validateObject(payload, path, {
    assets: field(validateArrayOf(checkAsset)),
  }, errors);
  return { ok: errors.length === 0, errors };
}

// ── SemanticLayout (recursive) ───────────────────────────────────────────

export function validateSemanticLayout(payload, path = "SemanticLayout") {
  const errors = [];
  validateObject(payload, path, {
    type: field(enumOf(["stack", "grid"])),
    direction: field(isNonEmptyString, false),
    gapToken: field(isNonEmptyString, false),
    padding: field(isPlainObject, false),
    width: field((v) => isNumber(v) || isNonEmptyString(v), false),
    alignment: field(isNonEmptyString, false),
    distribution: field(isNonEmptyString, false),
    minWidth: field(isNumber, false),
    maxWidth: field(isNumber, false),
    minHeight: field(isNumber, false),
    maxHeight: field(isNumber, false),
    safeArea: field(isBoolean, false),
    children: field((v, p, e) => {
      if (!isArray(v)) { e.push(`${p} must be an array`); return false; }
      v.forEach((child, i) => {
        const result = validateSemanticLayout(child, `${p}[${i}]`);
        e.push(...result.errors);
      });
      return true;
    }, false),
  }, errors);
  return { ok: errors.length === 0, errors };
}

// ── CritiqueReport ────────────────────────────────────────────────────────

function checkIssue(value, path, errors) {
  validateObject(value, path, {
    severity: field(enumOf(["error", "warning", "info"])),
    nodeId: field(isNonEmptyString),
    category: field(isNonEmptyString),
    message: field(isNonEmptyString),
    recommendedOperation: field(isNonEmptyString, false),
  }, errors);
  return true;
}

export function validateCritiqueReport(payload, path = "CritiqueReport") {
  const errors = [];
  validateObject(payload, path, {
    score: field(isNumber),
    issues: field(validateArrayOf(checkIssue)),
    approved: field(isBoolean),
  }, errors);
  return { ok: errors.length === 0, errors };
}

// ── Public dispatch ───────────────────────────────────────────────────────

const VALIDATORS = {
  ProductBrief: validateProductBrief,
  ProductArchitecture: validateProductArchitecture,
  ArtDirection: validateArtDirection,
  DesignSystemManifest: validateDesignSystemManifest,
  ComponentDefinition: validateComponentDefinition,
  AssetResolution: validateAssetResolution,
  SemanticLayout: validateSemanticLayout,
  CritiqueReport: validateCritiqueReport,
};

export const CONTRACT_NAMES = Object.freeze(Object.keys(VALIDATORS));

/** validateContract("ProductBrief", payload) -> { ok, errors } */
export function validateContract(name, payload) {
  const validator = VALIDATORS[name];
  if (!validator) return { ok: false, errors: [`unknown contract "${name}"`] };
  return validator(payload);
}
