#!/usr/bin/env node

import crypto from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_TARGET = path.resolve(process.env.NOFIDA_MEDIA_STORE_ROOT || "media-store");
const PUBLIC_BASE_URL = process.env.NOFIDA_MEDIA_PUBLIC_BASE_URL || "/nofida/media-store";
const LICENSE_POLICY_PATH = path.resolve("branding/resource-factory/license-policy.json");

function assetSpec(id, title, variant, category, style, mood, audience, useCases, colors, tags) {
  return { id, title, variant, category, style, mood, audience, useCases, colors, tags };
}

function patternSpec(id, title, sourceModel, recommendedUse, tokens, previewLabel) {
  return { id, title, sourceModel, recommendedUse, tokens, previewLabel };
}

const MEDIA_SPECS = [
  assetSpec("signal-launch-board", "Signal Launch Board", "illustration", "illustrations", "editorial gradient", "optimistic", "product teams", ["feature explainers", "launch decks"], ["#2563eb", "#0f172a", "#14b8a6"], ["launch", "board", "illustration"]),
  assetSpec("flow-ops-map", "Flow Ops Map", "illustration", "illustrations", "system diagram", "focused", "operations leads", ["workflow explainers", "empty states"], ["#0f172a", "#38bdf8", "#f8fafc"], ["flow", "map", "ops"]),
  assetSpec("studio-brief-scene", "Studio Brief Scene", "photo", "photos", "duotone collage", "collaborative", "creative directors", ["team pages", "support sections"], ["#1d4ed8", "#94a3b8", "#0f172a"], ["team", "brief", "studio"]),
  assetSpec("support-handoff-frame", "Support Handoff Frame", "photo", "photos", "warm board", "calm", "customer success", ["help pages", "handoff notes"], ["#f59e0b", "#0f172a", "#f8fafc"], ["support", "handoff", "frame"]),
  assetSpec("control-icons-grid", "Control Icons Grid", "icons", "icons", "outlined system", "practical", "design system owners", ["navigation", "dashboards"], ["#38bdf8", "#0f172a", "#e2e8f0"], ["icons", "system", "grid"]),
  assetSpec("status-glyph-kit", "Status Glyph Kit", "icons", "icons", "filled badges", "direct", "analytics teams", ["status chips", "monitoring"], ["#22c55e", "#0f172a", "#f8fafc"], ["status", "glyph", "kit"]),
  assetSpec("orbit-guide", "Orbit Guide", "mascot", "mascots", "geometric helper", "playful", "onboarding flows", ["assistant prompts", "setup states"], ["#f59e0b", "#0f172a", "#f8fafc"], ["mascot", "guide", "helper"]),
  assetSpec("pulse-captain", "Pulse Captain", "mascot", "mascots", "badge character", "energetic", "growth teams", ["celebration cards", "coach marks"], ["#ef4444", "#0f172a", "#fde68a"], ["mascot", "captain", "growth"]),
  assetSpec("grid-spectrum", "Grid Spectrum", "background", "backgrounds", "mesh grid", "focused", "product marketing", ["hero sections", "slide backdrops"], ["#08111f", "#2563eb", "#14b8a6"], ["grid", "spectrum", "background"]),
  assetSpec("night-arc-field", "Night Arc Field", "background", "backgrounds", "arc lines", "elevated", "brand teams", ["launch pages", "campaigns"], ["#0f172a", "#8b5cf6", "#38bdf8"], ["arc", "field", "background"]),
  assetSpec("priority-sticker-set", "Priority Sticker Set", "sticker", "stickers", "label pack", "energetic", "growth teams", ["announcements", "campaign cards"], ["#ef4444", "#facc15", "#0f172a"], ["priority", "sticker", "label"]),
  assetSpec("review-flag-pack", "Review Flag Pack", "sticker", "stickers", "ops labels", "direct", "ops teams", ["review queues", "approvals"], ["#22c55e", "#0f172a", "#f8fafc"], ["review", "flag", "pack"]),
  assetSpec("timeline-beats", "Timeline Beats", "motion", "motion placeholders", "storyboard strip", "dynamic", "motion designers", ["animatic planning", "handoff notes"], ["#8b5cf6", "#0f172a", "#e2e8f0"], ["timeline", "beats", "motion"]),
  assetSpec("reel-cue-sheet", "Reel Cue Sheet", "motion", "motion placeholders", "cue sheet", "structured", "video teams", ["animation specs", "prototype notes"], ["#06b6d4", "#082032", "#f8fafc"], ["reel", "cue", "sheet"]),
  assetSpec("demo-slate", "Demo Slate", "video", "video placeholders", "video slate", "presentational", "customer success", ["demo embeds", "release notes"], ["#06b6d4", "#082032", "#f8fafc"], ["demo", "video", "slate"]),
  assetSpec("training-loop-card", "Training Loop Card", "video", "video placeholders", "player frame", "calm", "enablement teams", ["training pages", "help centers"], ["#2563eb", "#0f172a", "#e2e8f0"], ["training", "loop", "card"])
];

const UI_PATTERNS = [
  patternSpec("settings-rail", "Settings Rail", "shadcn/ui", "Account settings, AI provider setup, and admin panels.", ["space-200", "space-300", "radius-lg", "border-muted"], "Settings"),
  patternSpec("signal-card-grid", "Signal Card Grid", "shadcn/ui", "Compact dashboards with KPI cards, secondary actions, and trend cues.", ["surface-2", "radius-xl", "shadow-soft"], "Cards"),
  patternSpec("review-queue", "Review Queue", "Radix UI", "Approval queues, moderation lists, and audit-heavy back-office flows.", ["surface-3", "border-strong", "text-muted"], "Queue"),
  patternSpec("empty-state-split", "Empty State Split", "Radix UI", "Onboarding placeholders with primary CTA and supporting notes.", ["space-400", "radius-xl", "accent-soft"], "Empty"),
  patternSpec("onboarding-stack", "Onboarding Stack", "shadcn/ui", "Step-by-step product tours and migration assistants.", ["surface-1", "space-250", "radius-lg"], "Steps"),
  patternSpec("dense-table-audit", "Dense Table Audit", "Radix UI", "Admin tables, audit logs, and license review grids.", ["mono-500", "surface-2", "border-muted"], "Table")
];

const NOFIDA_AUTHORED_LICENSE = `NOFIDA Open Asset Pack

These assets are small self-authored SVG resources created for the NOFIDA product layer.
License: CC0-1.0
Reference URL: https://creativecommons.org/publicdomain/zero/1.0/
`;

const PATTERN_SOURCES_LICENSE = `UI Pattern Source Models

The UI pattern registry uses shadcn/ui and Radix UI as source models for structure and interaction vocabulary only.
NOFIDA descriptions, previews, naming, and tokens are original to this catalog.
No third-party docs text, screenshot packs, or proprietary UI kits are redistributed here.
Licenses referenced:
- MIT (shadcn/ui)
- MIT (Radix UI)
`;

function parseArgs(argv) {
  const parsed = {
    target: DEFAULT_TARGET,
    dryRun: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }
    if (arg === "--target" && argv[index + 1]) {
      parsed.target = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg.startsWith("--target=")) {
      parsed.target = path.resolve(arg.split("=").slice(1).join("="));
    }
  }
  return parsed;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function svgShell(inner, background = "#0b1220", width = 1600, height = 1000) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="NOFIDA generated asset">`,
    `<rect width="${width}" height="${height}" rx="48" fill="${background}"/>`,
    inner,
    "</svg>"
  ].join("");
}

function renderVariant(spec, compact = false) {
  const [a, b, c] = spec.colors;
  const width = compact ? 640 : 1600;
  const height = compact ? 400 : 1000;
  const pad = compact ? 32 : 80;
  const labelSize = compact ? 26 : 64;
  const metaSize = compact ? 14 : 34;
  const titleY = compact ? 86 : 210;

  const baseLabel = [
    `<text x="${pad}" y="${titleY}" fill="#f8fafc" font-family="Inter,Segoe UI,sans-serif" font-size="${labelSize}" font-weight="700">${spec.title}</text>`,
    `<text x="${pad}" y="${titleY + (compact ? 32 : 56)}" fill="#94a3b8" font-family="Inter,Segoe UI,sans-serif" font-size="${metaSize}">${spec.category} · ${spec.style}</text>`
  ].join("");

  if (spec.variant === "illustration") {
    return svgShell(
      `<defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>` +
      `<circle cx="${width - pad * 2}" cy="${pad * 2}" r="${compact ? 90 : 220}" fill="url(#g)" opacity="0.7"/>` +
      `<rect x="${pad}" y="${compact ? 150 : 360}" width="${compact ? 220 : 560}" height="${compact ? 130 : 320}" rx="28" fill="${a}" opacity="0.18" stroke="${a}" />` +
      `<rect x="${compact ? 280 : 700}" y="${compact ? 150 : 300}" width="${compact ? 260 : 640}" height="${compact ? 200 : 420}" rx="32" fill="#111b2e" stroke="${c}" opacity="0.9"/>` +
      `<path d="M${compact ? 300 : 760} ${compact ? 250 : 620} C${compact ? 360 : 900} ${compact ? 190 : 420} ${compact ? 450 : 1040} ${compact ? 280 : 680} ${compact ? 520 : 1180} ${compact ? 200 : 470}" fill="none" stroke="${b}" stroke-width="${compact ? 10 : 20}" stroke-linecap="round"/>` +
      baseLabel,
      "#09111d",
      width,
      height
    );
  }

  if (spec.variant === "photo") {
    return svgShell(
      `<rect x="${pad}" y="${compact ? 130 : 260}" width="${width - pad * 2}" height="${compact ? 210 : 520}" rx="36" fill="${a}" opacity="0.12"/>` +
      `<circle cx="${compact ? 170 : 360}" cy="${compact ? 245 : 520}" r="${compact ? 72 : 150}" fill="${b}" opacity="0.9"/>` +
      `<circle cx="${compact ? 320 : 700}" cy="${compact ? 225 : 470}" r="${compact ? 60 : 126}" fill="#f8fafc" opacity="0.9"/>` +
      `<rect x="${compact ? 390 : 860}" y="${compact ? 160 : 360}" width="${compact ? 190 : 420}" height="${compact ? 170 : 360}" rx="28" fill="${c}" opacity="0.9"/>` +
      `<path d="M${compact ? 120 : 240} ${compact ? 330 : 690} L${compact ? 240 : 500} ${compact ? 190 : 410} L${compact ? 370 : 820} ${compact ? 320 : 720}" fill="none" stroke="#ffffff" stroke-opacity="0.45" stroke-width="${compact ? 12 : 26}" stroke-linecap="round"/>` +
      baseLabel,
      "#0a1120",
      width,
      height
    );
  }

  if (spec.variant === "icons") {
    const glyphs = [];
    for (let row = 0; row < 2; row += 1) {
      for (let col = 0; col < 4; col += 1) {
        const x = pad + col * (compact ? 110 : 240);
        const y = compact ? 160 + row * 110 : 340 + row * 220;
        glyphs.push(`<rect x="${x}" y="${y}" width="${compact ? 82 : 168}" height="${compact ? 82 : 168}" rx="20" fill="#111b2e" stroke="${a}"/>`);
        glyphs.push(`<circle cx="${x + (compact ? 41 : 84)}" cy="${y + (compact ? 41 : 84)}" r="${compact ? 20 : 42}" fill="none" stroke="${c}" stroke-width="${compact ? 8 : 16}"/>`);
      }
    }
    return svgShell(glyphs.join("") + baseLabel, "#0b1220", width, height);
  }

  if (spec.variant === "mascot") {
    return svgShell(
      `<circle cx="${compact ? 180 : 420}" cy="${compact ? 250 : 540}" r="${compact ? 90 : 210}" fill="${a}"/>` +
      `<circle cx="${compact ? 160 : 370}" cy="${compact ? 235 : 500}" r="${compact ? 10 : 24}" fill="#0f172a"/>` +
      `<circle cx="${compact ? 200 : 470}" cy="${compact ? 235 : 500}" r="${compact ? 10 : 24}" fill="#0f172a"/>` +
      `<path d="M${compact ? 150 : 340} ${compact ? 290 : 610} C${compact ? 170 : 390} ${compact ? 315 : 660} ${compact ? 190 : 450} ${compact ? 315 : 660} ${compact ? 210 : 500} ${compact ? 290 : 610}" fill="none" stroke="#0f172a" stroke-width="${compact ? 8 : 18}" stroke-linecap="round"/>` +
      `<rect x="${compact ? 320 : 760}" y="${compact ? 170 : 350}" width="${compact ? 220 : 520}" height="${compact ? 180 : 400}" rx="32" fill="#111b2e" stroke="${c}"/>` +
      baseLabel,
      "#08111f",
      width,
      height
    );
  }

  if (spec.variant === "background") {
    const lines = [];
    for (let index = 0; index < 8; index += 1) {
      const offset = compact ? index * 60 : index * 140;
      lines.push(`<path d="M0 ${offset + 60} Q${width / 2} ${offset} ${width} ${offset + 60}" fill="none" stroke="${index % 2 === 0 ? a : b}" stroke-opacity="0.28" stroke-width="${compact ? 6 : 14}"/>`);
    }
    return svgShell(lines.join("") + baseLabel, "#07111d", width, height);
  }

  if (spec.variant === "sticker") {
    const labels = [];
    for (let index = 0; index < 4; index += 1) {
      const x = pad + index * (compact ? 130 : 290);
      labels.push(`<rect x="${x}" y="${compact ? 180 : 420}" width="${compact ? 118 : 250}" height="${compact ? 62 : 120}" rx="30" fill="${index % 2 === 0 ? a : b}"/>`);
    }
    return svgShell(labels.join("") + baseLabel, "#0f172a", width, height);
  }

  if (spec.variant === "motion") {
    return svgShell(
      `<rect x="${pad}" y="${compact ? 150 : 320}" width="${width - pad * 2}" height="${compact ? 210 : 460}" rx="32" fill="#111b2e" stroke="${a}"/>` +
      `<path d="M${pad + 30} ${compact ? 300 : 650} L${pad + 220} ${compact ? 180 : 420} L${pad + 420} ${compact ? 270 : 620} L${pad + 610} ${compact ? 150 : 360}" fill="none" stroke="${b}" stroke-width="${compact ? 10 : 22}" stroke-linecap="round"/>` +
      `<circle cx="${pad + 220}" cy="${compact ? 180 : 420}" r="${compact ? 12 : 24}" fill="${c}"/>` +
      `<circle cx="${pad + 420}" cy="${compact ? 270 : 620}" r="${compact ? 12 : 24}" fill="${c}"/>` +
      baseLabel,
      "#08111f",
      width,
      height
    );
  }

  return svgShell(
    `<rect x="${pad}" y="${compact ? 150 : 320}" width="${width - pad * 2}" height="${compact ? 210 : 460}" rx="32" fill="#111b2e" stroke="${a}"/>` +
    `<polygon points="${compact ? "250,205 250,305 340,255" : "620,450 620,650 810,550"}" fill="${c}"/>` +
    baseLabel,
    "#08111f",
    width,
    height
  );
}

function renderPatternPreview(pattern) {
  return svgShell(
    `<rect x="64" y="88" width="512" height="256" rx="28" fill="#111b2e" stroke="#334155"/>` +
    `<rect x="92" y="118" width="140" height="28" rx="14" fill="#2563eb" opacity="0.8"/>` +
    `<rect x="92" y="172" width="460" height="20" rx="10" fill="#1f2937"/>` +
    `<rect x="92" y="208" width="420" height="20" rx="10" fill="#1f2937"/>` +
    `<rect x="92" y="252" width="180" height="48" rx="18" fill="#0f172a" stroke="#38bdf8"/>` +
    `<text x="92" y="68" fill="#f8fafc" font-family="Inter,Segoe UI,sans-serif" font-size="30" font-weight="700">${pattern.title}</text>` +
    `<text x="92" y="384" fill="#94a3b8" font-family="Inter,Segoe UI,sans-serif" font-size="20">${pattern.previewLabel} · ${pattern.sourceModel}</text>`,
    "#08111f",
    640,
    420
  );
}

async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

function buildPublicPath(base, ...parts) {
  return [base.replace(/\/$/, ""), ...parts.map((part) => String(part).replace(/^\/+|\/+$/g, ""))]
    .join("/")
    .replace(/\/{2,}/g, "/");
}

async function loadLicensePolicy() {
  try {
    const raw = await fsp.readFile(LICENSE_POLICY_PATH, "utf8");
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

async function writeAsset(targetRoot, publicBase, spec, dryRun) {
  const fileName = `${spec.id}.svg`;
  const fileSvg = renderVariant(spec, false);
  const thumbSvg = renderVariant(spec, true);
  const filePath = path.join(targetRoot, "files", fileName);
  const thumbPath = path.join(targetRoot, "thumbnails", fileName);

  if (!dryRun) {
    await fsp.writeFile(filePath, fileSvg, "utf8");
    await fsp.writeFile(thumbPath, thumbSvg, "utf8");
  }

  return {
    id: spec.id,
    title: spec.title,
    category: spec.category,
    style: spec.style,
    mood: spec.mood,
    audience: spec.audience,
    useCases: spec.useCases,
    format: "svg",
    license: "CC0-1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    attributionRequired: false,
    sourceName: "NOFIDA Open Asset Pack",
    sourceAuthor: "NOFIDA",
    sourceUrl: "internal://nofida/open-asset-pack",
    localFilePath: buildPublicPath(publicBase, "files", fileName),
    thumbnailPath: buildPublicPath(publicBase, "thumbnails", fileName),
    sourceHash: sha256(fileSvg),
    adaptedHash: null,
    approvalStatus: "approved",
    status: "approved",
    reviewNotes: "Self-authored SVG asset created for the NOFIDA resource store.",
    reviewer: "codex",
    approvedAt: new Date().toISOString(),
    commercialUseAllowed: true,
    modificationAllowed: true,
    redistributionAllowed: true,
    tags: spec.tags,
    dominantColors: spec.colors
  };
}

async function writePattern(targetRoot, publicBase, pattern, dryRun) {
  const fileName = `${pattern.id}.svg`;
  const previewSvg = renderPatternPreview(pattern);
  const previewPath = path.join(targetRoot, "thumbnails", fileName);

  if (!dryRun) {
    await fsp.writeFile(previewPath, previewSvg, "utf8");
  }

  return {
    id: pattern.id,
    title: pattern.title,
    category: "ui-patterns",
    sourceModel: pattern.sourceModel,
    sourceName: pattern.sourceModel,
    license: "MIT",
    licenseUrl: "https://opensource.org/license/mit",
    sourceUrl:
      pattern.sourceModel === "Radix UI"
        ? "https://www.radix-ui.com/"
        : "https://ui.shadcn.com/",
    originalDescription: `NOFIDA-authored ${pattern.previewLabel.toLowerCase()} pattern summary based on ${pattern.sourceModel} as a source model, not copied product copy.`,
    recommendedUse: pattern.recommendedUse,
    tokens: pattern.tokens,
    approvalStatus: "approved",
    status: "approved",
    adaptedByNofida: true,
    previewPath: buildPublicPath(publicBase, "thumbnails", fileName),
    reviewNotes: "Source-model inspiration recorded; NOFIDA copy and preview remain original.",
    reviewer: "codex",
    approvedAt: new Date().toISOString()
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const targetRoot = args.target;
  const policy = await loadLicensePolicy();

  await ensureDir(targetRoot);
  await ensureDir(path.join(targetRoot, "files"));
  await ensureDir(path.join(targetRoot, "thumbnails"));
  await ensureDir(path.join(targetRoot, "licenses"));
  await ensureDir(path.join(targetRoot, "logs"));

  const assets = [];
  for (const spec of MEDIA_SPECS) {
    process.stdout.write(`sync-open-media: ${spec.title}\n`);
    assets.push(await writeAsset(targetRoot, PUBLIC_BASE_URL, spec, args.dryRun));
  }

  const uiPatterns = [];
  for (const pattern of UI_PATTERNS) {
    uiPatterns.push(await writePattern(targetRoot, PUBLIC_BASE_URL, pattern, args.dryRun));
  }

  const catalog = {
    version: "018B",
    generatedAt: new Date().toISOString(),
    storeRoot: targetRoot,
    publicBaseUrl: PUBLIC_BASE_URL,
    selectionBoundary: {
      purpose: "Select only the most relevant approved media and pattern metadata for a task instead of passing the entire store into an AI context.",
      filters: ["taskType", "userPrompt", "category", "style", "mood", "audience", "license", "tags", "approvalStatus"],
      futureAdapter: "services/nofida-hub-adapter/ai/media-context-packer.mjs"
    },
    licensePolicyVersion: policy?.version || null,
    assets,
    uiPatterns
  };

  const syncLog = {
    version: "018B",
    generatedAt: new Date().toISOString(),
    targetRoot,
    totalAssets: assets.length,
    totalPatterns: uiPatterns.length
  };

  if (!args.dryRun) {
    await fsp.writeFile(path.join(targetRoot, "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
    await fsp.writeFile(path.join(targetRoot, "licenses", "nofida-open-asset-pack.md"), NOFIDA_AUTHORED_LICENSE, "utf8");
    await fsp.writeFile(path.join(targetRoot, "licenses", "ui-pattern-sources.md"), PATTERN_SOURCES_LICENSE, "utf8");
    await fsp.writeFile(path.join(targetRoot, "logs", "last-sync.json"), `${JSON.stringify(syncLog, null, 2)}\n`, "utf8");
  } else {
    process.stdout.write(`${JSON.stringify(syncLog, null, 2)}\n`);
  }
}

main().catch((error) => {
  console.error(`sync-open-media failed: ${error.message}`);
  process.exitCode = 1;
});
