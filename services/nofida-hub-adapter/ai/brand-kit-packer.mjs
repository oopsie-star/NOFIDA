// Brand-kit / design-token context for the "build_screen" task.
//
// This does NOT hand the model a fixed color palette — a single default
// palette reused on every generation would make every NOFIDA-built screen
// look the same, regardless of what the user is actually designing. Instead
// it supplies the structural system a senior designer works within (type
// scale, spacing scale, elevation, radius scale) as fixed rules, and treats
// color as contextual: reuse the file's existing palette when one exists,
// otherwise the model chooses a considered palette for the specific request.

export const TYPE_SCALE = [
  { role: "display", size: 32, weight: "800", use: "hero numbers, one-word headlines" },
  { role: "h1", size: 24, weight: "700", use: "screen title" },
  { role: "h2", size: 18, weight: "700", use: "section heading" },
  { role: "body", size: 15, weight: "400", use: "primary reading text" },
  { role: "label", size: 13, weight: "600", use: "buttons, form labels, list titles" },
  { role: "caption", size: 12, weight: "400", use: "helper text, metadata" },
  { role: "micro", size: 10, weight: "600", use: "badges, tags, timestamps" },
];

export const SPACING_SCALE = [4, 8, 12, 16, 24, 32, 48, 64];

export const RADIUS_SCALE = [
  { role: "chip/pill", value: 999 },
  { role: "button/input", value: 12 },
  { role: "card", value: 20 },
  { role: "sheet/modal top corners", value: 28 },
];

export const ELEVATION_PRESETS = [
  { role: "resting card (barely lifted)", offsetY: 2, blur: 8, spread: 0, opacity: 0.14 },
  { role: "raised card / dropdown", offsetY: 8, blur: 24, spread: 0, opacity: 0.24 },
  { role: "modal / sheet over content", offsetY: 16, blur: 40, spread: 0, opacity: 0.32 },
];

function formatColorList(colors) {
  if (!Array.isArray(colors) || colors.length === 0) return null;
  return colors.slice(0, 10).join(", ");
}

/** Builds the brand-kit prompt block. `fileCtx` is the plugin-extracted context (may be null). */
export function buildBrandKitBlock(fileCtx) {
  const lines = ["Brand kit — the structural system to design within:"];

  const existingColors = formatColorList(fileCtx?.colors);
  if (existingColors) {
    lines.push(`- Existing palette already used in this file: ${existingColors}. Reuse these for visual consistency instead of inventing new ones, unless the request clearly calls for a different palette.`);
  } else {
    lines.push("- No established palette in this file yet. Choose a considered, cohesive palette yourself: one dark/light neutral base, one accent color, at most one secondary accent — not a rainbow of unrelated hues.");
  }

  lines.push(`- Type scale (pick from these, don't invent new sizes): ${TYPE_SCALE.map((t) => `${t.role} ${t.size}px/${t.weight} (${t.use})`).join("; ")}.`);
  lines.push(`- Spacing scale (use these values for gaps/padding, not arbitrary numbers): ${SPACING_SCALE.join(", ")}.`);
  lines.push(`- Corner radius by role: ${RADIUS_SCALE.map((r) => `${r.role} → ${r.value}`).join("; ")}.`);
  lines.push(`- Elevation presets for "shadow" (offsetX 0 unless stated): ${ELEVATION_PRESETS.map((e) => `${e.role} → offsetY ${e.offsetY}, blur ${e.blur}, opacity ${e.opacity}`).join("; ")}.`);
  lines.push("");

  return lines.join("\n");
}
