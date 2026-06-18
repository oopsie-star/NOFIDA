import fsp from "node:fs/promises";

const MAX_FONTS = 12;
const MAX_CHARS = 5400;

const TASK_BOOST_TERMS = {
  font_recommendation: ["font", "typography", "pairing", "headline", "body"],
  library_recommendation: ["dashboard", "editorial", "product", "system"],
  design_audit: ["readability", "hierarchy", "contrast", "density"],
  screen_planner: ["hero", "settings", "table", "mobile"],
  figma_migration_report: ["missing", "replacement", "compatibility", "coverage"],
  design_audit_report: ["coverage", "license", "fallback", "consistency"],
  free_chat: []
};

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9а-яё\s/-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function collectTerms(taskType, userPrompt, preferredCategories = []) {
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
  return Array.from(terms).filter(Boolean);
}

function scoreFont(item, queryTerms) {
  if (!queryTerms.length) return 1;

  const family = normalizeText(item.family || item.id || "");
  const category = normalizeText(item.category || "");
  const mood = Array.isArray(item.mood)
    ? item.mood.map(normalizeText).join(" ")
    : normalizeText(item.mood || "");
  const useCases = Array.isArray(item.useCases)
    ? item.useCases.map(normalizeText).join(" ")
    : normalizeText(item.useCases || "");
  const coverage = Array.isArray(item.languageCoverage)
    ? item.languageCoverage.map(normalizeText).join(" ")
    : normalizeText(item.languageCoverage || "");
  const status = normalizeText(item.fileStatus || "");
  const pairing = Array.isArray(item.pairingSuggestions)
    ? item.pairingSuggestions.map(normalizeText).join(" ")
    : "";

  let score = 0;
  for (const term of queryTerms) {
    if (!term) continue;
    if (family.includes(term)) score += 7;
    if (category.includes(term)) score += 5;
    if (useCases.includes(term)) score += 4;
    if (mood.includes(term)) score += 3;
    if (coverage.includes(term)) score += 3;
    if (pairing.includes(term)) score += 2;
    if (status.includes(term)) score += 1;
  }
  return score;
}

export async function loadFontCatalog(catalogPath) {
  try {
    const raw = await fsp.readFile(catalogPath, "utf8");
    const data = JSON.parse(raw);
    if (Array.isArray(data.fonts)) return data.fonts;
    if (Array.isArray(data)) return data;
    return [];
  } catch (_error) {
    return [];
  }
}

export function packFontContext({
  taskType,
  userPrompt,
  catalogItems,
  preferredCategories = []
}) {
  const total = Array.isArray(catalogItems) ? catalogItems.length : 0;
  if (!total) {
    return {
      totalFonts: 0,
      matchedFonts: [],
      truncated: false
    };
  }

  const queryTerms = collectTerms(taskType, userPrompt, preferredCategories);
  const scored = catalogItems
    .map((item) => ({ item, score: scoreFont(item, queryTerms) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.item.family || a.item.id || "").localeCompare(String(b.item.family || b.item.id || ""));
    });

  const matchedFonts = [];
  let charCount = 0;
  let truncated = false;

  for (const { item } of scored) {
    const entry = {
      id: String(item.id || ""),
      family: String(item.family || item.id || "Unknown"),
      category: item.category || undefined,
      mood: Array.isArray(item.mood) ? item.mood.slice(0, 4) : undefined,
      useCases: Array.isArray(item.useCases) ? item.useCases.slice(0, 4) : undefined,
      languageCoverage: Array.isArray(item.languageCoverage) ? item.languageCoverage.slice(0, 6) : undefined,
      license: item.license || undefined,
      approvalStatus: item.approvalStatus || undefined,
      fileStatus: item.fileStatus || undefined,
      pairingSuggestions: Array.isArray(item.pairingSuggestions) ? item.pairingSuggestions.slice(0, 3) : undefined,
      previewText: item.previewText || undefined
    };

    const entryChars = JSON.stringify(entry).length;
    if (matchedFonts.length >= MAX_FONTS || (charCount + entryChars > MAX_CHARS && matchedFonts.length > 0)) {
      truncated = true;
      break;
    }

    matchedFonts.push(entry);
    charCount += entryChars;
  }

  return {
    totalFonts: total,
    matchedFonts,
    truncated
  };
}
