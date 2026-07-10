/* ==========================================================================
 * Nofida Designer — feature flags (PATCH 026A.0)
 * --------------------------------------------------------------------------
 * Hard client-side gates for the Autonomous Designer, default OFF, following
 * persistence-adapter.js's ALLOW_BULK_UPDATE convention. The server reports
 * its own env-driven flag state in the /ai/settings payload (see
 * services/nofida-hub-adapter/ai/designer/feature-flags.mjs) but that report
 * is informative only — code here must never trust it alone. A designer_*
 * capability is live only when BOTH the local hard gate below is flipped to
 * true AND the server reports the matching flag on; isEnabled() below is
 * the single place that AND happens so no caller can accidentally check
 * only one side.
 * ========================================================================== */
(function () {
  "use strict";
  if (window.NofidaDesigner && window.NofidaDesigner.FeatureFlags) return;
  window.NofidaDesigner = window.NofidaDesigner || {};

  var AUTONOMOUS_DESIGNER_V1 = false;
  var VISUAL_CRITIC_V1 = false;
  var HANDOFF_V1 = false;

  var HARD_GATES = {
    autonomousDesignerV1: AUTONOMOUS_DESIGNER_V1,
    visualCriticV1: VISUAL_CRITIC_V1,
    handoffV1: HANDOFF_V1,
  };

  function isEnabled(serverFlags, name) {
    if (!Object.prototype.hasOwnProperty.call(HARD_GATES, name)) return false;
    return Boolean(HARD_GATES[name]) && Boolean(serverFlags && serverFlags[name]);
  }

  window.NofidaDesigner.FeatureFlags = {
    AUTONOMOUS_DESIGNER_V1: AUTONOMOUS_DESIGNER_V1,
    VISUAL_CRITIC_V1: VISUAL_CRITIC_V1,
    HANDOFF_V1: HANDOFF_V1,
    isEnabled: isEnabled,
  };
})();
