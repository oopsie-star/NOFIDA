// PATCH 016C: Hub Context Packer
// Deterministic metadata filtering and scoring for NOFIDA Hub libraries.
// Does NOT require a vector DB — uses title, category, tags, description,
// use-case, and file-type keyword scoring.
// Keeps a vector-ready boundary: each matched library entry has a stable shape
// that can be enriched with embeddings in a future patch without changing the
// caller interface.

import fsp from "node:fs/promises";

const MAX_LIBRARIES = 12;
const MAX_CHARS = 5500; // approximate character budget for hub context block

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9а-яёa-z\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Task-specific boosting terms for scoring
const TASK_BOOST_TERMS = {
  library_recommendation: ["library", "component", "ui", "kit", "design", "system"],
  find_libraries_for_project: ["library", "project", "component", "kit", "design"],
  design_audit: ["audit", "review", "design", "component", "system"],
  file_summary: ["design", "file", "overview", "ui"],
  screen_plan: ["screen", "layout", "wireframe", "component", "frame", "flow"],
  copy_review: ["text", "copy", "typography", "font", "content"],
  accessibility_review: ["accessibility", "contrast", "color", "a11y", "wcag"],
  organize_layers: ["layer", "structure", "organization", "component"],
  rename_layers: ["layer", "naming", "component", "structure"],
  free_chat: [],
};

function extractQueryTerms(taskType, userPrompt) {
  const terms = new Set();
  const text = normalizeText(userPrompt || "");

  // Words from user prompt (length > 2)
  for (const word of text.split(" ")) {
    if (word.length > 2) terms.add(word);
  }

  // Task-specific boosting terms
  for (const term of TASK_BOOST_TERMS[taskType] || []) {
    terms.add(term);
  }

  return Array.from(terms).filter(Boolean);
}

function scoreLibrary(item, queryTerms) {
  if (!queryTerms.length) return 1; // no query → include everything equally

  const title = normalizeText(item.title || item.name || "");
  const category = normalizeText(item.category || item.type || "");
  const description = normalizeText(item.description || "");
  const tags = (Array.isArray(item.tags) ? item.tags : []).map(normalizeText).join(" ");
  const useCase = normalizeText(item.use_case || item.useCase || "");
  const fileType = normalizeText(item.file_type || item.fileType || "");

  let score = 0;
  for (const term of queryTerms) {
    if (!term) continue;
    if (title.includes(term)) score += 5;
    if (tags.includes(term)) score += 4;
    if (category.includes(term)) score += 3;
    if (useCase.includes(term)) score += 2;
    if (fileType.includes(term)) score += 2;
    if (description.includes(term)) score += 1;
  }
  return score;
}

function resolveStatus(item) {
  const ls = String(item.license_status || "").toLowerCase();
  const qs = String(item.quality_status || "").toLowerCase();
  const st = String(item.status || "").toLowerCase();

  if (ls === "trademark_review" || ls === "needs_license_review" || ls === "needs_review") {
    return "review_required";
  }
  if (qs === "empty_or_broken" || st === "rejected") {
    return "missing";
  }
  return "available";
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function loadCatalog(catalogPath) {
  try {
    const raw = await fsp.readFile(catalogPath, "utf8");
    const data = JSON.parse(raw);
    if (Array.isArray(data.libraries)) return data.libraries;
    if (Array.isArray(data)) return data;
    return [];
  } catch (_err) {
    return [];
  }
}

export function packHubContext({ taskType, userPrompt, catalogItems, installedIds = [] }) {
  const total = catalogItems.length;

  if (total === 0) {
    return { totalLibraries: 0, matchedLibraries: [], installedIds, truncated: false };
  }

  const queryTerms = extractQueryTerms(taskType, userPrompt);

  // Score and sort
  const scored = catalogItems
    .map((item) => ({ item, score: scoreLibrary(item, queryTerms) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Prefer available items on tie
      const aAvail = resolveStatus(a.item) === "available" ? 1 : 0;
      const bAvail = resolveStatus(b.item) === "available" ? 1 : 0;
      return bAvail - aAvail;
    });

  const results = [];
  let charCount = 0;
  let truncated = false;

  for (const { item } of scored) {
    const status = resolveStatus(item);
    const entry = {
      id: String(item.id || ""),
      title: String(item.title || item.name || item.id || "Unknown"),
      category: item.category || item.type || undefined,
      tags: Array.isArray(item.tags) ? item.tags.slice(0, 8) : undefined,
      description: item.description ? String(item.description).slice(0, 200) : undefined,
      status,
      internalUrl: item.internal_url || undefined,
      // reasonForMatch is left undefined for now; future embedding patch can populate it
    };

    const entryChars = JSON.stringify(entry).length;
    if (results.length >= MAX_LIBRARIES || (charCount + entryChars > MAX_CHARS && results.length > 0)) {
      truncated = true;
      break;
    }
    results.push(entry);
    charCount += entryChars;
  }

  return {
    totalLibraries: total,
    matchedLibraries: results,
    installedIds,
    truncated,
  };
}
