// DEPRECATED compatibility shim (PATCH 025A).
//
// The real implementation moved to ./scene/ (scene-schema.mjs,
// scene-validator.mjs, scene-canonicalizer.mjs, scene-normalizer.mjs,
// scene-compiler.mjs). Nothing in this repo imports this file anymore —
// server.mjs and prompt-registry.mjs were updated to import ./scene/
// directly. This shim exists only in case something outside this checkout
// (an already-deployed build, an external script) still references the old
// path; it is kept for at least one live release and removed in a separate
// cleanup patch AFTER a full reference search across the deployed
// environment, not just this repo.
//
// Do not add new code here — extend ./scene/ instead.

import { SCENE_SPEC_PROMPT_BLOCK } from "./scene/scene-schema.mjs";
import { validateScene, parseScene } from "./scene/scene-validator.mjs";
import { canonicalizeScene } from "./scene/scene-canonicalizer.mjs";
import { normalizeScene } from "./scene/scene-normalizer.mjs";

export const SCREEN_SPEC_PROMPT_BLOCK = SCENE_SPEC_PROMPT_BLOCK;

/** @deprecated use validateScene from ./scene/scene-validator.mjs */
export function validateScreenSpec(raw) {
  const result = validateScene(raw);
  if (!result.ok) return { ok: false, spec: null, errors: result.errors };
  const canonical = canonicalizeScene(result.scene);
  const normalized = normalizeScene(canonical);
  return { ok: true, spec: normalized.scene, errors: [] };
}

/** @deprecated use parseScene from ./scene/scene-validator.mjs */
export function parseScreenSpec(rawText) {
  const parsed = parseScene(rawText);
  if (!parsed.ok) return { ok: false, spec: null, error: parsed.error };
  const canonical = canonicalizeScene(parsed.scene);
  const normalized = normalizeScene(canonical);
  return { ok: true, spec: normalized.scene, error: null };
}
