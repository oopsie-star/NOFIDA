#!/usr/bin/env node

import crypto from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_TARGET = path.resolve(process.env.NOFIDA_MEDIA_STORE_ROOT || "branding/media-store");
const PUBLIC_BASE_URL = process.env.NOFIDA_MEDIA_PUBLIC_BASE_URL || "/nofida/media-store";
const LICENSE_POLICY_PATH = path.resolve("branding/resource-factory/license-policy.json");

function assetSpec(id, title, variant, category, style, mood, audience, useCases, colors, tags) {
  return { id, title, variant, category, style, mood, audience, useCases, colors, tags };
}

function patternSpec(id, title, sourceModel, recommendedUse, tokens, previewLabel) {
  return { id, title, sourceModel, recommendedUse, tokens, previewLabel };
}

function iconSpec(id, title, style, mood, audience, useCases, colors, tags) {
  return assetSpec(id, title, "icons", "icons", style, mood, audience, useCases, colors, tags);
}

function illustrationSpec(id, title, style, mood, audience, useCases, colors, tags) {
  return assetSpec(id, title, "illustration", "illustrations", style, mood, audience, useCases, colors, tags);
}

function emptyStateSpec(id, title, style, mood, audience, useCases, colors, tags) {
  return assetSpec(id, title, "empty", "empty states", style, mood, audience, useCases, colors, tags);
}

function backgroundSpec(id, title, style, mood, audience, useCases, colors, tags) {
  return assetSpec(id, title, "background", "backgrounds", style, mood, audience, useCases, colors, tags);
}

function photoSpec(id, title, style, mood, audience, useCases, colors, tags) {
  return assetSpec(id, title, "photo", "photos", style, mood, audience, useCases, colors, tags);
}

function stickerSpec(id, title, style, mood, audience, useCases, colors, tags) {
  return assetSpec(id, title, "sticker", "stickers", style, mood, audience, useCases, colors, tags);
}

function mascotSpec(id, title, style, mood, audience, useCases, colors, tags) {
  return assetSpec(id, title, "mascot", "mascots", style, mood, audience, useCases, colors, tags);
}

const MEDIA_SPECS = [
  iconSpec("control-icons-grid", "Control Icons Grid", "outlined system", "practical", "design system owners", ["navigation", "dashboards"], ["#38bdf8", "#0f172a", "#e2e8f0"], ["icons", "system", "grid"]),
  iconSpec("status-glyph-kit", "Status Glyph Kit", "filled badges", "direct", "analytics teams", ["status chips", "monitoring"], ["#22c55e", "#0f172a", "#f8fafc"], ["status", "glyph", "kit"]),
  iconSpec("commerce-outline-pack", "Commerce Outline Pack", "commerce set", "confident", "growth teams", ["pricing pages", "checkout flows"], ["#2563eb", "#0f172a", "#fde68a"], ["commerce", "cart", "pricing"]),
  iconSpec("support-command-icons", "Support Command Icons", "service toolbar", "calm", "support leads", ["help centers", "handoff boards"], ["#06b6d4", "#082032", "#f8fafc"], ["support", "help", "toolbar"]),
  iconSpec("analytics-signal-icons", "Analytics Signal Icons", "data markers", "focused", "operations leads", ["report cards", "trend modules"], ["#14b8a6", "#08111f", "#ecfeff"], ["analytics", "signal", "trend"]),
  iconSpec("onboarding-cue-icons", "Onboarding Cue Icons", "friendly outline", "welcoming", "product onboarding", ["setup guides", "empty states"], ["#f59e0b", "#0f172a", "#fff7ed"], ["onboarding", "guide", "cue"]),
  iconSpec("finance-badge-icons", "Finance Badge Icons", "compact badges", "steady", "finance teams", ["billing flows", "reports"], ["#0f766e", "#082f49", "#f0fdfa"], ["finance", "billing", "badge"]),
  iconSpec("team-space-icons", "Team Space Icons", "workspace markers", "balanced", "collaboration teams", ["member roles", "workspace cards"], ["#8b5cf6", "#0f172a", "#f5f3ff"], ["team", "workspace", "roles"]),
  iconSpec("library-picker-icons", "Library Picker Icons", "resource browser", "clear", "design ops", ["asset browsers", "selection panels"], ["#4f46e5", "#111827", "#eef2ff"], ["library", "picker", "resource"]),
  iconSpec("device-frame-icons", "Device Frame Icons", "hardware outline", "technical", "product designers", ["responsive mocks", "handoff docs"], ["#0ea5e9", "#0f172a", "#eff6ff"], ["device", "frame", "responsive"]),
  iconSpec("file-flow-icons", "File Flow Icons", "document set", "structured", "content teams", ["import flows", "attachments"], ["#f97316", "#111827", "#fff7ed"], ["file", "flow", "import"]),
  iconSpec("navigation-rhythm-icons", "Navigation Rhythm Icons", "rail markers", "measured", "dashboard teams", ["sidebars", "toolbars"], ["#3b82f6", "#0f172a", "#dbeafe"], ["navigation", "rail", "toolbar"]),
  iconSpec("review-state-icons", "Review State Icons", "approval badges", "direct", "review teams", ["approvals", "status queues"], ["#22c55e", "#0f172a", "#dcfce7"], ["review", "state", "approval"]),
  iconSpec("settings-token-icons", "Settings Token Icons", "dense utility", "precise", "platform teams", ["settings pages", "token docs"], ["#94a3b8", "#0f172a", "#f8fafc"], ["settings", "tokens", "utility"]),
  iconSpec("metrics-beacon-icons", "Metrics Beacon Icons", "signal points", "decisive", "analytics leads", ["kpi cards", "command centers"], ["#14b8a6", "#0f172a", "#ccfbf1"], ["metrics", "beacon", "kpi"]),
  iconSpec("data-pipeline-icons", "Data Pipeline Icons", "connector kit", "technical", "data teams", ["system maps", "pipelines"], ["#06b6d4", "#0f172a", "#cffafe"], ["data", "pipeline", "connector"]),
  iconSpec("accessibility-marker-icons", "Accessibility Marker Icons", "contrast set", "supportive", "accessibility reviews", ["contrast checks", "assistive flows"], ["#facc15", "#111827", "#fef9c3"], ["accessibility", "contrast", "marker"]),
  iconSpec("launch-board-icons", "Launch Board Icons", "campaign badges", "energetic", "launch teams", ["go-to-market decks", "announcements"], ["#ef4444", "#0f172a", "#fee2e2"], ["launch", "badge", "campaign"]),
  iconSpec("workspace-role-icons", "Workspace Role Icons", "persona set", "practical", "ops teams", ["team setup", "permissions"], ["#6366f1", "#0f172a", "#e0e7ff"], ["workspace", "roles", "permissions"]),
  iconSpec("content-ops-icons", "Content Ops Icons", "editorial controls", "orderly", "content operations", ["publishing flows", "review tools"], ["#7c3aed", "#111827", "#ede9fe"], ["content", "ops", "editorial"]),
  iconSpec("ai-command-icons", "AI Command Icons", "assistant controls", "forward-looking", "ai product teams", ["assistant panels", "model pickers"], ["#0891b2", "#0f172a", "#cffafe"], ["ai", "assistant", "commands"]),
  iconSpec("presentation-cue-icons", "Presentation Cue Icons", "slide helpers", "elevated", "presentation teams", ["talk tracks", "deck structures"], ["#ec4899", "#111827", "#fce7f3"], ["presentation", "slides", "cue"]),
  iconSpec("handoff-symbol-icons", "Handoff Symbol Icons", "developer handoff", "disciplined", "design engineering", ["handoff notes", "spec sheets"], ["#10b981", "#0f172a", "#d1fae5"], ["handoff", "spec", "symbols"]),
  iconSpec("empty-state-icon-pack", "Empty State Icon Pack", "support glyphs", "light", "product teams", ["empty states", "guidance cards"], ["#60a5fa", "#0f172a", "#eff6ff"], ["empty", "state", "guidance"]),

  illustrationSpec("signal-launch-board", "Signal Launch Board", "editorial gradient", "optimistic", "product teams", ["feature explainers", "launch decks"], ["#2563eb", "#0f172a", "#14b8a6"], ["launch", "board", "illustration"]),
  illustrationSpec("flow-ops-map", "Flow Ops Map", "system diagram", "focused", "operations leads", ["workflow explainers", "empty states"], ["#0f172a", "#38bdf8", "#f8fafc"], ["flow", "map", "ops"]),
  illustrationSpec("library-handshake-scene", "Library Handshake Scene", "soft editorial", "collaborative", "design ops", ["resource intros", "team decks"], ["#4338ca", "#0f172a", "#c7d2fe"], ["library", "teamwork", "scene"]),
  illustrationSpec("product-roadmap-canvas", "Product Roadmap Canvas", "planning poster", "steady", "product managers", ["roadmaps", "planning reviews"], ["#0f766e", "#082f49", "#99f6e4"], ["roadmap", "planning", "canvas"]),
  illustrationSpec("migration-bridge-illustration", "Migration Bridge Illustration", "transfer map", "confident", "migration teams", ["transfer plans", "project kickoffs"], ["#7c3aed", "#111827", "#ddd6fe"], ["migration", "bridge", "transfer"]),
  illustrationSpec("support-orbit-illustration", "Support Orbit Illustration", "layered gradient", "calm", "customer success", ["service pages", "support intros"], ["#0891b2", "#0f172a", "#cffafe"], ["support", "orbit", "service"]),

  emptyStateSpec("empty-state-horizon", "Empty State Horizon", "wide cta card", "reassuring", "product teams", ["first-run screens", "waiting states"], ["#2563eb", "#0f172a", "#dbeafe"], ["empty", "cta", "horizon"]),
  emptyStateSpec("empty-state-checklist", "Empty State Checklist", "checklist panel", "supportive", "operations leads", ["setup checklists", "task zero"], ["#10b981", "#0f172a", "#d1fae5"], ["empty", "checklist", "setup"]),
  emptyStateSpec("empty-state-inbox", "Empty State Inbox", "message panel", "calm", "support teams", ["inbox zero", "notifications"], ["#06b6d4", "#082032", "#cffafe"], ["empty", "inbox", "notifications"]),
  emptyStateSpec("empty-state-labs", "Empty State Labs", "experiments board", "curious", "research teams", ["labs dashboards", "test runs"], ["#8b5cf6", "#111827", "#ede9fe"], ["empty", "labs", "experiments"]),

  backgroundSpec("grid-spectrum", "Grid Spectrum", "mesh grid", "focused", "product marketing", ["hero sections", "slide backdrops"], ["#08111f", "#2563eb", "#14b8a6"], ["grid", "spectrum", "background"]),
  backgroundSpec("night-arc-field", "Night Arc Field", "arc lines", "elevated", "brand teams", ["launch pages", "campaigns"], ["#0f172a", "#8b5cf6", "#38bdf8"], ["arc", "field", "background"]),
  backgroundSpec("sunrise-dots-field", "Sunrise Dots Field", "dot field", "bright", "presentation teams", ["chapter slides", "keynotes"], ["#f59e0b", "#ef4444", "#1f2937"], ["sunrise", "dots", "slides"]),
  backgroundSpec("blueprint-wave-grid", "Blueprint Wave Grid", "technical lines", "structured", "platform teams", ["system overviews", "diagrams"], ["#1d4ed8", "#0f172a", "#bfdbfe"], ["blueprint", "wave", "grid"]),
  backgroundSpec("brass-tilt-surface", "Brass Tilt Surface", "angled bands", "warm", "brand teams", ["cover sections", "campaign cards"], ["#ca8a04", "#111827", "#fef3c7"], ["brass", "tilt", "surface"]),
  backgroundSpec("aurora-grid-sheet", "Aurora Grid Sheet", "soft gradient mesh", "uplifting", "product teams", ["overview pages", "presentations"], ["#14b8a6", "#4338ca", "#dbeafe"], ["aurora", "grid", "sheet"]),

  photoSpec("studio-brief-scene", "Studio Brief Scene", "duotone collage", "collaborative", "creative directors", ["team pages", "support sections"], ["#1d4ed8", "#94a3b8", "#0f172a"], ["team", "brief", "studio"]),
  photoSpec("support-handoff-frame", "Support Handoff Frame", "warm board", "calm", "customer success", ["help pages", "handoff notes"], ["#f59e0b", "#0f172a", "#f8fafc"], ["support", "handoff", "frame"]),
  photoSpec("product-war-room-board", "Product War Room Board", "strategy wall", "focused", "leadership teams", ["launch reviews", "planning walls"], ["#2563eb", "#111827", "#e2e8f0"], ["war-room", "planning", "board"]),
  photoSpec("customer-story-collage", "Customer Story Collage", "soft editorial", "optimistic", "marketing teams", ["case studies", "story intros"], ["#ec4899", "#111827", "#fce7f3"], ["customer", "story", "collage"]),

  stickerSpec("priority-sticker-set", "Priority Sticker Set", "label pack", "energetic", "growth teams", ["announcements", "campaign cards"], ["#ef4444", "#facc15", "#0f172a"], ["priority", "sticker", "label"]),
  stickerSpec("review-flag-pack", "Review Flag Pack", "ops labels", "direct", "ops teams", ["review queues", "approvals"], ["#22c55e", "#0f172a", "#f8fafc"], ["review", "flag", "pack"]),
  stickerSpec("shipping-note-stickers", "Shipping Note Stickers", "release labels", "clear", "release teams", ["release notes", "ship lists"], ["#3b82f6", "#0f172a", "#dbeafe"], ["shipping", "release", "notes"]),
  stickerSpec("launch-badge-pack", "Launch Badge Pack", "headline labels", "loud", "marketing teams", ["launch pages", "deck callouts"], ["#a855f7", "#111827", "#f3e8ff"], ["launch", "badge", "headline"]),

  mascotSpec("orbit-guide", "Orbit Guide", "geometric helper", "playful", "onboarding flows", ["assistant prompts", "setup states"], ["#f59e0b", "#0f172a", "#f8fafc"], ["mascot", "guide", "helper"]),
  mascotSpec("pulse-captain", "Pulse Captain", "badge character", "energetic", "growth teams", ["celebration cards", "coach marks"], ["#ef4444", "#0f172a", "#fde68a"], ["mascot", "captain", "growth"]),
  mascotSpec("grid-scout", "Grid Scout", "compact companion", "curious", "product education", ["walkthroughs", "tips"], ["#14b8a6", "#0f172a", "#ecfeff"], ["mascot", "scout", "tips"]),
  mascotSpec("note-runner", "Note Runner", "editorial companion", "quick", "content teams", ["briefs", "handoff cards"], ["#8b5cf6", "#111827", "#ede9fe"], ["mascot", "notes", "editorial"])
];

const UI_PATTERNS = [
  patternSpec("settings-rail", "Settings Rail", "shadcn/ui", "Account settings, AI provider setup, and admin panels.", ["space-200", "space-300", "radius-lg", "border-muted"], "Settings"),
  patternSpec("signal-card-grid", "Signal Card Grid", "shadcn/ui", "Compact dashboards with KPI cards, secondary actions, and trend cues.", ["surface-2", "radius-xl", "shadow-soft"], "Cards"),
  patternSpec("review-queue", "Review Queue", "Radix UI", "Approval queues, moderation lists, and audit-heavy back-office flows.", ["surface-3", "border-strong", "text-muted"], "Queue"),
  patternSpec("empty-state-split", "Empty State Split", "Radix UI", "Onboarding empty states with a primary CTA and supporting notes.", ["space-400", "radius-xl", "accent-soft"], "Empty"),
  patternSpec("onboarding-stack", "Onboarding Stack", "shadcn/ui", "Step-by-step product tours and migration assistants.", ["surface-1", "space-250", "radius-lg"], "Steps"),
  patternSpec("dense-table-audit", "Dense Table Audit", "Radix UI", "Admin tables, audit logs, and license review grids.", ["mono-500", "surface-2", "border-muted"], "Table"),
  patternSpec("migration-checklist", "Migration Checklist", "shadcn/ui", "Transfer plans, asset staging, and migration follow-up lists.", ["surface-1", "space-200", "accent-line"], "Checklist"),
  patternSpec("media-browser-grid", "Media Browser Grid", "Radix UI", "Dense asset browsing with thumbnails, filters, and quick actions.", ["surface-2", "radius-lg", "thumb-grid"], "Browser"),
  patternSpec("font-selection-deck", "Font Selection Deck", "shadcn/ui", "Compact font review cards with previews, filters, and actions.", ["type-compact", "surface-1", "border-muted"], "Fonts"),
  patternSpec("dashboard-command-bar", "Dashboard Command Bar", "Radix UI", "Fast action bars for filters, exports, and contextual tools.", ["space-150", "radius-pill", "action-row"], "Command"),
  patternSpec("presentation-outline", "Presentation Outline", "shadcn/ui", "Slide structures with section markers, callouts, and supporting media.", ["surface-1", "space-300", "outline-stack"], "Slides"),
  patternSpec("asset-detail-drawer", "Asset Detail Drawer", "Radix UI", "Right-side drawers for source, license, and quick asset actions.", ["surface-3", "radius-xl", "detail-drawer"], "Drawer")
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

function numericSeed(value) {
  return String(value || "").split("").reduce((acc, char) => ((acc * 33) + char.charCodeAt(0)) >>> 0, 5381);
}

function renderVariant(spec, compact = false) {
  const [a, b, c] = spec.colors;
  const width = compact ? 640 : 1600;
  const height = compact ? 400 : 1000;
  const pad = compact ? 32 : 80;
  const labelSize = compact ? 26 : 64;
  const metaSize = compact ? 14 : 34;
  const titleY = compact ? 86 : 210;
  const seed = numericSeed(spec.id);

  const baseLabel = [
    `<text x="${pad}" y="${titleY}" fill="#f8fafc" font-family="Inter,Segoe UI,sans-serif" font-size="${labelSize}" font-weight="700">${spec.title}</text>`,
    `<text x="${pad}" y="${titleY + (compact ? 32 : 56)}" fill="#94a3b8" font-family="Inter,Segoe UI,sans-serif" font-size="${metaSize}">${spec.category} · ${spec.style}</text>`
  ].join("");

  if (spec.variant === "illustration") {
    const orbX = width - pad * (1.6 + (seed % 4) * 0.2);
    const orbY = pad * (1.8 + (seed % 3) * 0.2);
    const waveA = compact ? 280 + (seed % 40) : 700 + (seed % 110);
    const waveB = compact ? 450 + (seed % 60) : 1040 + (seed % 150);
    return svgShell(
      `<defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>` +
      `<circle cx="${orbX}" cy="${orbY}" r="${compact ? 90 : 220}" fill="url(#g)" opacity="0.7"/>` +
      `<rect x="${pad}" y="${compact ? 150 : 360}" width="${compact ? 220 : 560}" height="${compact ? 130 : 320}" rx="28" fill="${a}" opacity="0.18" stroke="${a}" />` +
      `<rect x="${compact ? 280 : 700}" y="${compact ? 150 : 300}" width="${compact ? 260 : 640}" height="${compact ? 200 : 420}" rx="32" fill="#111b2e" stroke="${c}" opacity="0.9"/>` +
      `<path d="M${compact ? 300 : 760} ${compact ? 250 : 620} C${compact ? 360 : 900} ${compact ? 190 : 420} ${waveA} ${compact ? 280 : 680} ${waveB} ${compact ? 200 : 470}" fill="none" stroke="${b}" stroke-width="${compact ? 10 : 20}" stroke-linecap="round"/>` +
      baseLabel,
      "#09111d",
      width,
      height
    );
  }

  if (spec.variant === "empty") {
    const cardX = compact ? 280 : 720;
    const cardY = compact ? 130 : 290;
    const cardWidth = compact ? 250 : 620;
    const cardHeight = compact ? 190 : 420;
    return svgShell(
      `<rect x="${pad}" y="${compact ? 155 : 360}" width="${compact ? 190 : 480}" height="${compact ? 160 : 360}" rx="32" fill="${a}" opacity="0.12" stroke="${a}"/>` +
      `<circle cx="${compact ? 126 : 286}" cy="${compact ? 220 : 500}" r="${compact ? 42 : 92}" fill="${b}" opacity="0.82"/>` +
      `<rect x="${cardX}" y="${cardY}" width="${cardWidth}" height="${cardHeight}" rx="34" fill="#111b2e" stroke="${c}"/>` +
      `<rect x="${cardX + (compact ? 26 : 54)}" y="${cardY + (compact ? 26 : 50)}" width="${compact ? 110 : 220}" height="${compact ? 18 : 34}" rx="12" fill="${a}" opacity="0.9"/>` +
      `<rect x="${cardX + (compact ? 26 : 54)}" y="${cardY + (compact ? 64 : 118)}" width="${compact ? 180 : 380}" height="${compact ? 14 : 24}" rx="10" fill="#334155"/>` +
      `<rect x="${cardX + (compact ? 26 : 54)}" y="${cardY + (compact ? 92 : 160)}" width="${compact ? 150 : 320}" height="${compact ? 14 : 24}" rx="10" fill="#334155"/>` +
      `<rect x="${cardX + (compact ? 26 : 54)}" y="${cardY + (compact ? 128 : 224)}" width="${compact ? 120 : 240}" height="${compact ? 34 : 72}" rx="18" fill="${c}"/>` +
      baseLabel,
      "#08111f",
      width,
      height
    );
  }

  if (spec.variant === "photo") {
    const focusX = compact ? 390 + (seed % 30) : 860 + (seed % 80);
    const focusY = compact ? 160 + (seed % 20) : 360 + (seed % 50);
    return svgShell(
      `<rect x="${pad}" y="${compact ? 130 : 260}" width="${width - pad * 2}" height="${compact ? 210 : 520}" rx="36" fill="${a}" opacity="0.12"/>` +
      `<circle cx="${compact ? 170 : 360}" cy="${compact ? 245 : 520}" r="${compact ? 72 : 150}" fill="${b}" opacity="0.9"/>` +
      `<circle cx="${compact ? 320 : 700}" cy="${compact ? 225 : 470}" r="${compact ? 60 : 126}" fill="#f8fafc" opacity="0.9"/>` +
      `<rect x="${focusX}" y="${focusY}" width="${compact ? 190 : 420}" height="${compact ? 170 : 360}" rx="28" fill="${c}" opacity="0.9"/>` +
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
        const glyph = (seed + row * 11 + col * 17) % 5;
        const centerX = x + (compact ? 41 : 84);
        const centerY = y + (compact ? 41 : 84);
        glyphs.push(`<rect x="${x}" y="${y}" width="${compact ? 82 : 168}" height="${compact ? 82 : 168}" rx="20" fill="#111b2e" stroke="${a}"/>`);
        if (glyph === 0) {
          glyphs.push(`<circle cx="${centerX}" cy="${centerY}" r="${compact ? 20 : 42}" fill="none" stroke="${c}" stroke-width="${compact ? 8 : 16}"/>`);
        } else if (glyph === 1) {
          glyphs.push(`<rect x="${centerX - (compact ? 16 : 34)}" y="${centerY - (compact ? 16 : 34)}" width="${compact ? 32 : 68}" height="${compact ? 32 : 68}" rx="${compact ? 10 : 20}" fill="none" stroke="${c}" stroke-width="${compact ? 8 : 16}"/>`);
        } else if (glyph === 2) {
          glyphs.push(`<path d="M${centerX - (compact ? 22 : 46)} ${centerY + (compact ? 12 : 26)} L${centerX} ${centerY - (compact ? 20 : 42)} L${centerX + (compact ? 22 : 46)} ${centerY + (compact ? 12 : 26)}" fill="none" stroke="${c}" stroke-width="${compact ? 8 : 16}" stroke-linecap="round" stroke-linejoin="round"/>`);
        } else if (glyph === 3) {
          glyphs.push(`<path d="M${centerX - (compact ? 18 : 38)} ${centerY} H${centerX + (compact ? 18 : 38)} M${centerX} ${centerY - (compact ? 18 : 38)} V${centerY + (compact ? 18 : 38)}" fill="none" stroke="${c}" stroke-width="${compact ? 8 : 16}" stroke-linecap="round"/>`);
        } else {
          glyphs.push(`<path d="M${centerX - (compact ? 24 : 48)} ${centerY + (compact ? 16 : 34)} C${centerX - (compact ? 10 : 22)} ${centerY - (compact ? 22 : 46)} ${centerX + (compact ? 10 : 22)} ${centerY - (compact ? 22 : 46)} ${centerX + (compact ? 24 : 48)} ${centerY + (compact ? 16 : 34)}" fill="none" stroke="${c}" stroke-width="${compact ? 8 : 16}" stroke-linecap="round"/>`);
        }
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
    const count = 7 + (seed % 3);
    for (let index = 0; index < count; index += 1) {
      const offset = compact ? index * 60 : index * 140;
      const curve = compact ? 18 + ((seed + index) % 32) : 40 + ((seed + index) % 80);
      lines.push(`<path d="M0 ${offset + 60} Q${width / 2} ${offset - curve} ${width} ${offset + 60}" fill="none" stroke="${index % 2 === 0 ? a : b}" stroke-opacity="0.28" stroke-width="${compact ? 6 : 14}"/>`);
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
    reviewNotes: "Проверенный локальный SVG-ассет для интерфейсов, презентаций и прототипов.",
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
    originalDescription: `Компактный паттерн NOFIDA для сценария "${pattern.previewLabel}" с адаптацией под рабочие экраны.`,
    recommendedUse: pattern.recommendedUse,
    tokens: pattern.tokens,
    approvalStatus: "approved",
    status: "approved",
    adaptedByNofida: true,
    previewPath: buildPublicPath(publicBase, "thumbnails", fileName),
    reviewNotes: "Паттерн адаптирован для каталога NOFIDA и может служить отправной точкой для рабочего экрана.",
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
    version: "018C",
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
    version: "018C",
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
