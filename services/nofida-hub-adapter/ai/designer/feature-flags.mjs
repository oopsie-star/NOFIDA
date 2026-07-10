// PATCH 026A.0 — Autonomous Designer feature flags.
// Server-side gate, read from env (NOFIDA_AI_* convention, same as the rest
// of this service — see ai-service.mjs). Default OFF for all three. The
// frontend keeps its own hard gate constant mirroring this file (see
// branding/ai-core/designer/feature-flags.js) — this module is what lets the
// server refuse to route designer_* tasks (see intent-router.mjs) even if a
// client somehow requested one directly.

function envFlag(name) {
  const raw = String(process.env[name] || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on" || raw === "yes";
}

// Canonical flag names, exactly as specified in PATCH 026A — used both as
// the env var suffix (upper-cased) and as the key exposed to the frontend in
// the /ai/settings payload.
export const DESIGNER_FLAG_ENV = Object.freeze({
  autonomousDesignerV1: "NOFIDA_AI_AUTONOMOUS_DESIGNER_V1",
  visualCriticV1: "NOFIDA_AI_VISUAL_CRITIC_V1",
  handoffV1: "NOFIDA_AI_HANDOFF_V1",
});

export function getDesignerFeatureFlags() {
  return {
    autonomousDesignerV1: envFlag(DESIGNER_FLAG_ENV.autonomousDesignerV1),
    visualCriticV1: envFlag(DESIGNER_FLAG_ENV.visualCriticV1),
    handoffV1: envFlag(DESIGNER_FLAG_ENV.handoffV1),
  };
}
