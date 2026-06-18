// PATCH 018A: Media Context Packer
// Deterministic metadata filtering for NOFIDA Media Bank assets.
// Keeps the same bounded-context design as the Hub packer:
// - no vector DB required
// - stable return shape for future embedding upgrades
// - do not pass the whole catalog blindly into LLM prompts

import fsp from "node:fs/promises";

const MAX_MEDIA = 10;
const MAX_CHARS = 5200;

const TASK_BOOST_TERMS = {
  library_recommendation: ["ui", "system", "asset", "library"],
  find_libraries_for_project: ["project", "asset", "screen", "brand"],
  design_audit: ["consistency", "icon", "illustration", "background"],
  file_summary: ["screen", "layout", "asset", "hero"],
  screen_plan: ["screen", "hero", "empty", "flow", "state"],
  copy_review: ["campaign", "announcement", "editorial", "story"],
  accessibility_review: ["contrast", "clarity", "icon", "background"],
  organize_layers: ["asset", "sticker", "icon", "group"],
  free_chat: []
};

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9а-яё\s/-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function collectTerms(taskType, userPrompt, preferredCategories = [], preferredStyles = []) {
  const terms = new Set();
  const promptText = normalizeText(userPrompt || "");

  for (const word of promptText.split(" ")) {
    if (word.length > 2) terms.add(word);
  }
  for (const term of TASK_BOOST_TERMS[taskType] || []) {
    terms.add(term);
  }
  for (const category of preferredCategories) {
    const value = normalizeText(category);
    if (value) terms.add(value);
  }
  for (const style of preferredStyles) {
    const value = normalizeText(style);
    if (value) terms.add(value);
  }

  return Array.from(terms).filter(Boolean);
}

function scoreMedia(item, queryTerms) {
  if (!queryTerms.length) return 1;

  const title = normalizeText(item.title || item.id || "");
  const category = normalizeText(item.category || "");
  const style = normalizeText(item.style || "");
  const mood = normalizeText(item.mood || "");
  const audience = normalizeText(item.audience || "");
  const format = normalizeText(item.format || "");
  const tags = Array.isArray(item.tags) ? item.tags.map(normalizeText).join(" ") : "";
  const useCases = Array.isArray(item.useCases)
    ? item.useCases.map(normalizeText).join(" ")
    : normalizeText(item.useCases || "");

  let score = 0;
  for (const term of queryTerms) {
    if (!term) continue;
    if (title.includes(term)) score += 6;
    if (tags.includes(term)) score += 5;
    if (category.includes(term)) score += 4;
    if (style.includes(term)) score += 4;
    if (useCases.includes(term)) score += 3;
    if (mood.includes(term)) score += 2;
    if (audience.includes(term)) score += 2;
    if (format.includes(term)) score += 1;
  }
  return score;
}

export async function loadMediaCatalog(catalogPath) {
  try {
    const raw = await fsp.readFile(catalogPath, "utf8");
    const data = JSON.parse(raw);
    if (Array.isArray(data.assets)) return data.assets;
    if (Array.isArray(data.media)) return data.media;
    if (Array.isArray(data)) return data;
    return [];
  } catch (_error) {
    return [];
  }
}

export function packMediaContext({
  taskType,
  userPrompt,
  catalogItems,
  preferredCategories = [],
  preferredStyles = []
}) {
  const total = Array.isArray(catalogItems) ? catalogItems.length : 0;
  if (!total) {
    return {
      totalMedia: 0,
      matchedMedia: [],
      truncated: false
    };
  }

  const queryTerms = collectTerms(taskType, userPrompt, preferredCategories, preferredStyles);
  const scored = catalogItems
    .map((item) => ({ item, score: scoreMedia(item, queryTerms) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.item.title || a.item.id || "").localeCompare(String(b.item.title || b.item.id || ""));
    });

  const matchedMedia = [];
  let charCount = 0;
  let truncated = false;

  for (const { item } of scored) {
    const entry = {
      id: String(item.id || ""),
      title: String(item.title || item.id || "Unknown"),
      category: item.category || undefined,
      style: item.style || undefined,
      mood: item.mood || undefined,
      audience: item.audience || undefined,
      tags: Array.isArray(item.tags) ? item.tags.slice(0, 8) : undefined,
      useCases: Array.isArray(item.useCases) ? item.useCases.slice(0, 4) : undefined,
      format: item.format || undefined,
      license: item.license || undefined,
      internalUrl: item.internalUrl || item.internal_url || undefined,
      thumbnailUrl: item.thumbnailUrl || item.thumbnail_url || undefined
    };

    const entryChars = JSON.stringify(entry).length;
    if (matchedMedia.length >= MAX_MEDIA || (charCount + entryChars > MAX_CHARS && matchedMedia.length > 0)) {
      truncated = true;
      break;
    }

    matchedMedia.push(entry);
    charCount += entryChars;
  }

  return {
    totalMedia: total,
    matchedMedia,
    truncated
  };
}
