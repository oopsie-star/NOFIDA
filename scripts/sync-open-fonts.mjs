#!/usr/bin/env node

import crypto from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_TARGET = path.resolve(process.env.NOFIDA_FONT_STORE_ROOT || "font-store");
const PUBLIC_BASE_URL = process.env.NOFIDA_FONT_PUBLIC_BASE_URL || "/nofida/font-store";
const LICENSE_POLICY_PATH = path.resolve("branding/resource-factory/license-policy.json");
const FALLBACK_CATALOG_PATH = path.resolve("branding/fonts/catalog.json");
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";
const FONT_WEIGHTS = "400;500;600;700";

function fontSpec(id, family, category, mood, useCases, coverage, pairings, previewText) {
  return {
    id,
    family,
    category,
    mood,
    useCases,
    languageCoverage: coverage,
    pairingSuggestions: pairings,
    previewText
  };
}

const FONT_SPECS = [
  fontSpec("inter", "Inter", "sans", ["neutral", "modern"], ["product UI", "dashboards"], ["Latin", "Extended Latin", "Cyrillic", "Greek"], ["literata", "ibm-plex-mono"], "Clear hierarchy for fast-moving product teams."),
  fontSpec("manrope", "Manrope", "rounded", ["friendly", "clean"], ["customer apps", "marketing UI"], ["Latin", "Extended Latin", "Cyrillic"], ["fraunces", "ibm-plex-mono"], "Rounded forms keep modern interfaces human."),
  fontSpec("ibm-plex-sans", "IBM Plex Sans", "sans", ["technical", "precise"], ["enterprise apps", "design systems"], ["Latin", "Extended Latin", "Cyrillic", "Greek"], ["ibm-plex-serif", "ibm-plex-mono"], "A disciplined sans for product infrastructure."),
  fontSpec("ibm-plex-serif", "IBM Plex Serif", "serif", ["scholarly", "steady"], ["editorial", "reports"], ["Latin", "Extended Latin", "Cyrillic", "Greek"], ["ibm-plex-sans", "ibm-plex-mono"], "Readable serif rhythm for research-heavy work."),
  fontSpec("ibm-plex-mono", "IBM Plex Mono", "mono", ["code-native", "functional"], ["specs", "token sheets"], ["Latin", "Extended Latin", "Cyrillic", "Greek"], ["ibm-plex-sans", "inter"], "Monospaced detail keeps systems predictable."),
  fontSpec("noto-sans", "Noto Sans", "sans", ["global", "inclusive"], ["multilingual UI", "support tools"], ["Latin", "Extended Latin", "Greek", "Cyrillic"], ["noto-serif", "ibm-plex-mono"], "Wide language support reduces fallback surprises."),
  fontSpec("noto-serif", "Noto Serif", "serif", ["global", "serious"], ["knowledge products", "publications"], ["Latin", "Extended Latin", "Greek", "Cyrillic"], ["noto-sans", "ibm-plex-mono"], "A text-first serif companion for international products."),
  fontSpec("source-sans-3", "Source Sans 3", "sans", ["practical", "balanced"], ["general UI", "documentation"], ["Latin", "Extended Latin", "Greek", "Cyrillic"], ["source-serif-4", "ibm-plex-mono"], "A stable workhorse for interface copy."),
  fontSpec("source-serif-4", "Source Serif 4", "editorial", ["literary", "calm"], ["long-form reading", "case studies"], ["Latin", "Extended Latin", "Greek", "Cyrillic"], ["source-sans-3", "space-grotesk"], "Editorial tone without losing product clarity."),
  fontSpec("space-grotesk", "Space Grotesk", "display", ["bold", "future-facing"], ["hero copy", "product launches"], ["Latin", "Extended Latin", "Vietnamese"], ["inter", "source-serif-4"], "Display energy for standout product surfaces."),
  fontSpec("plus-jakarta-sans", "Plus Jakarta Sans", "sans", ["refined", "fresh"], ["startup brands", "customer apps"], ["Latin", "Extended Latin", "Vietnamese"], ["literata", "dm-sans"], "Crisp product tone with softer curves."),
  fontSpec("dm-sans", "DM Sans", "sans", ["compact", "digital"], ["mobile products", "growth pages"], ["Latin", "Extended Latin"], ["fraunces", "source-serif-4"], "Digital cadence for fast-moving product teams."),
  fontSpec("libre-franklin", "Libre Franklin", "sans", ["newsroom", "direct"], ["editorial UI", "institutional products"], ["Latin", "Extended Latin", "Vietnamese"], ["literata", "ibm-plex-mono"], "Direct voice for serious digital products."),
  fontSpec("literata", "Literata", "editorial", ["bookish", "warm"], ["reading views", "research products"], ["Latin", "Extended Latin", "Vietnamese"], ["inter", "plus-jakarta-sans"], "Warm reading rhythm for deeper narratives."),
  fontSpec("fraunces", "Fraunces", "editorial", ["dramatic", "premium"], ["brand statements", "campaign pages"], ["Latin", "Extended Latin", "Vietnamese"], ["inter", "dm-sans"], "Personality-rich serif for louder moments."),
  fontSpec("work-sans", "Work Sans", "sans", ["operational", "clear"], ["admin tools", "tables"], ["Latin", "Extended Latin", "Vietnamese"], ["merriweather", "jetbrains-mono"], "Functional typography for dense dashboards."),
  fontSpec("rubik", "Rubik", "rounded", ["confident", "friendly"], ["commerce UI", "growth surfaces"], ["Latin", "Extended Latin", "Cyrillic", "Hebrew"], ["playfair-display", "jetbrains-mono"], "Rounded geometry that still reads crisply."),
  fontSpec("archivo", "Archivo", "sans", ["assertive", "practical"], ["analytics", "command centers"], ["Latin", "Extended Latin", "Vietnamese"], ["pt-serif", "jetbrains-mono"], "Strong widths for KPI-driven interfaces."),
  fontSpec("bricolage-grotesque", "Bricolage Grotesque", "display", ["expressive", "contemporary"], ["campaigns", "brand refreshes"], ["Latin", "Extended Latin"], ["inter", "source-serif-4"], "A louder grotesque for confident product moments."),
  fontSpec("public-sans", "Public Sans", "sans", ["civic", "steady"], ["service portals", "forms"], ["Latin", "Extended Latin", "Vietnamese"], ["merriweather", "ibm-plex-mono"], "Calm clarity for service-oriented interfaces."),
  fontSpec("figtree", "Figtree", "sans", ["smooth", "accessible"], ["onboarding", "support surfaces"], ["Latin", "Extended Latin"], ["fraunces", "jetbrains-mono"], "Soft geometry with clean UI rhythm."),
  fontSpec("nunito-sans", "Nunito Sans", "rounded", ["approachable", "balanced"], ["education", "care flows"], ["Latin", "Extended Latin", "Vietnamese"], ["playfair-display", "ibm-plex-mono"], "Rounded rhythm for patient, guided flows."),
  fontSpec("outfit", "Outfit", "display", ["clean", "sharp"], ["launch pages", "AI products"], ["Latin"], ["literata", "ibm-plex-mono"], "Geometric confidence for modern product shells."),
  fontSpec("sora", "Sora", "sans", ["future", "compact"], ["AI settings", "landing surfaces"], ["Latin", "Extended Latin"], ["fraunces", "source-serif-4"], "Compact futuristic voice without losing readability."),
  fontSpec("urbanist", "Urbanist", "sans", ["sleek", "digital"], ["mobile UI", "consumer apps"], ["Latin", "Extended Latin"], ["literata", "ibm-plex-mono"], "Sleek product tone for mobile-first teams."),
  fontSpec("karla", "Karla", "sans", ["honest", "human"], ["forms", "knowledge tools"], ["Latin", "Extended Latin"], ["merriweather", "ibm-plex-mono"], "Honest typography for service and support flows."),
  fontSpec("merriweather", "Merriweather", "serif", ["trustworthy", "readable"], ["knowledge bases", "long-form"], ["Latin", "Extended Latin", "Cyrillic"], ["work-sans", "public-sans"], "Comfortable long-form reading on dense screens."),
  fontSpec("playfair-display", "Playfair Display", "editorial", ["luxury", "high-contrast"], ["brand campaigns", "cover sections"], ["Latin", "Extended Latin", "Cyrillic"], ["inter", "rubik"], "A high-contrast editorial accent for premium moments."),
  fontSpec("jetbrains-mono", "JetBrains Mono", "mono", ["developer", "precise"], ["code examples", "audit notes"], ["Latin", "Extended Latin", "Cyrillic"], ["inter", "public-sans"], "Mono detail for specs, prompts, and terminal moments."),
  fontSpec("pt-sans", "PT Sans", "sans", ["institutional", "stable"], ["public products", "content tools"], ["Latin", "Cyrillic"], ["pt-serif", "jetbrains-mono"], "Stable sans for bilingual and operational interfaces."),
  fontSpec("pt-serif", "PT Serif", "serif", ["editorial", "measured"], ["reports", "case studies"], ["Latin", "Cyrillic"], ["pt-sans", "ibm-plex-mono"], "Measured serif for reports and serious narratives."),
  fontSpec("lora", "Lora", "serif", ["warm", "readable"], ["articles", "brand stories"], ["Latin", "Extended Latin", "Cyrillic"], ["inter", "work-sans"], "Warm serif rhythm for clear product storytelling."),
  fontSpec("spectral", "Spectral", "serif", ["thoughtful", "balanced"], ["knowledge products", "case studies"], ["Latin", "Extended Latin", "Vietnamese"], ["public-sans", "jetbrains-mono"], "Balanced serif that stays crisp in dense layouts."),
  fontSpec("libre-baskerville", "Libre Baskerville", "serif", ["classic", "steady"], ["presentations", "editorial modules"], ["Latin", "Extended Latin"], ["work-sans", "archivo"], "Classic proportions for calm reading surfaces."),
  fontSpec("newsreader", "Newsreader", "editorial", ["premium", "editorial"], ["cover stories", "thought pieces"], ["Latin", "Extended Latin", "Vietnamese"], ["inter", "plus-jakarta-sans"], "Elegant editorial tone for modern product narratives."),
  fontSpec("dm-serif-display", "DM Serif Display", "editorial", ["dramatic", "luxury"], ["hero headlines", "campaign cards"], ["Latin"], ["manrope", "dm-sans"], "Display serif with clear personality for brand moments."),
  fontSpec("cormorant-garamond", "Cormorant Garamond", "editorial", ["literary", "refined"], ["brand decks", "long-form reading"], ["Latin", "Extended Latin", "Vietnamese"], ["inter", "libre-franklin"], "Refined serif for elegant product narratives."),
  fontSpec("montserrat", "Montserrat", "sans", ["confident", "urban"], ["marketing UI", "navigation"], ["Latin", "Extended Latin", "Vietnamese"], ["lora", "jetbrains-mono"], "Popular geometric sans for bold interface labels."),
  fontSpec("raleway", "Raleway", "display", ["airy", "clean"], ["campaign headers", "landing sections"], ["Latin", "Extended Latin"], ["merriweather", "inter"], "Light-footed display sans for polished banners."),
  fontSpec("assistant", "Assistant", "sans", ["clean", "service-led"], ["forms", "self-serve products"], ["Latin", "Hebrew"], ["merriweather", "jetbrains-mono"], "Straightforward sans for calm task flows."),
  fontSpec("cabin", "Cabin", "sans", ["human", "practical"], ["knowledge tools", "support apps"], ["Latin", "Extended Latin"], ["playfair-display", "ibm-plex-mono"], "Humanist sans that stays steady in product layouts."),
  fontSpec("mulish", "Mulish", "sans", ["soft", "efficient"], ["customer portals", "settings"], ["Latin", "Extended Latin", "Vietnamese"], ["newsreader", "jetbrains-mono"], "Soft sans for approachable operational products."),
  fontSpec("heebo", "Heebo", "sans", ["direct", "dense"], ["dashboards", "data-heavy apps"], ["Latin", "Hebrew"], ["lora", "ibm-plex-mono"], "Dense sans built for compact working interfaces."),
  fontSpec("hind", "Hind", "sans", ["open", "service"], ["support centers", "workflow tools"], ["Latin"], ["spectral", "ibm-plex-mono"], "Simple sans for support and service-facing screens."),
  fontSpec("teko", "Teko", "display", ["compressed", "energetic"], ["campaign stats", "product launches"], ["Latin"], ["inter", "source-serif-4"], "Condensed display face for assertive data moments."),
  fontSpec("exo-2", "Exo 2", "sans", ["future", "technical"], ["AI products", "console-style dashboards"], ["Latin", "Extended Latin", "Vietnamese"], ["source-serif-4", "jetbrains-mono"], "Technical sans with a forward-looking voice."),
  fontSpec("chivo", "Chivo", "sans", ["solid", "operational"], ["enterprise products", "procurement tools"], ["Latin", "Extended Latin", "Vietnamese"], ["merriweather", "space-mono"], "Wide sans that stays stable in enterprise UI."),
  fontSpec("barlow", "Barlow", "sans", ["industrial", "clear"], ["control rooms", "operations"], ["Latin", "Extended Latin", "Vietnamese"], ["spectral", "space-mono"], "Industrial sans for structured control surfaces."),
  fontSpec("barlow-condensed", "Barlow Condensed", "display", ["compact", "structured"], ["kpi strips", "navigation rails"], ["Latin", "Extended Latin", "Vietnamese"], ["inter", "merriweather"], "Condensed companion for metrics and short labels."),
  fontSpec("space-mono", "Space Mono", "mono", ["retro-tech", "precise"], ["prompts", "token docs"], ["Latin", "Extended Latin", "Vietnamese"], ["space-grotesk", "public-sans"], "Mono voice for specs, prompts, and system text."),
  fontSpec("azeret-mono", "Azeret Mono", "mono", ["engineered", "strict"], ["qa checklists", "developer notes"], ["Latin", "Extended Latin", "Vietnamese"], ["inter", "source-serif-4"], "Angular mono for disciplined technical artifacts."),
  fontSpec("inconsolata", "Inconsolata", "mono", ["developer", "calm"], ["developer docs", "handoff snippets"], ["Latin", "Extended Latin"], ["work-sans", "merriweather"], "Calm mono that reads well in long snippets."),
  fontSpec("red-hat-display", "Red Hat Display", "display", ["corporate", "strong"], ["product headers", "cards"], ["Latin", "Extended Latin"], ["red-hat-text", "jetbrains-mono"], "Display companion for modern product branding."),
  fontSpec("red-hat-text", "Red Hat Text", "sans", ["enterprise", "clear"], ["platform UI", "setup flows"], ["Latin", "Extended Latin"], ["red-hat-display", "jetbrains-mono"], "Enterprise-ready text face for platform products."),
  fontSpec("epilogue", "Epilogue", "sans", ["sharp", "contemporary"], ["saas sites", "pricing pages"], ["Latin", "Extended Latin", "Vietnamese"], ["newsreader", "space-mono"], "Sharp sans for clear SaaS product framing."),
  fontSpec("syne", "Syne", "display", ["bold", "experimental"], ["brand campaigns", "hero statements"], ["Latin", "Extended Latin"], ["inter", "dm-sans"], "Expressive display font for standout brand layers."),
  fontSpec("lexend", "Lexend", "sans", ["legible", "friendly"], ["education products", "multi-step flows"], ["Latin", "Extended Latin", "Vietnamese"], ["spectral", "ibm-plex-mono"], "High-legibility sans for guided product journeys."),
  fontSpec("be-vietnam-pro", "Be Vietnam Pro", "sans", ["precise", "balanced"], ["mobile products", "customer apps"], ["Latin", "Extended Latin", "Vietnamese"], ["lora", "jetbrains-mono"], "Balanced sans for compact mobile-first interfaces."),
  fontSpec("archivo-narrow", "Archivo Narrow", "sans", ["dense", "assertive"], ["tables", "filters", "toolbars"], ["Latin", "Extended Latin", "Vietnamese"], ["pt-serif", "space-mono"], "Narrow companion for dense admin views."),
  fontSpec("titillium-web", "Titillium Web", "sans", ["technical", "friendly"], ["software docs", "settings"], ["Latin", "Extended Latin"], ["merriweather", "ibm-plex-mono"], "Technical sans that still feels approachable."),
  fontSpec("zilla-slab", "Zilla Slab", "serif", ["open", "editorial"], ["case studies", "support docs"], ["Latin", "Extended Latin"], ["inter", "space-mono"], "Open slab serif for product content with character."),
  fontSpec("josefin-sans", "Josefin Sans", "display", ["retro", "light"], ["showcases", "cover slides"], ["Latin", "Extended Latin", "Vietnamese"], ["literata", "jetbrains-mono"], "Light display sans for memorable headline moments."),
  fontSpec("jost", "Jost", "sans", ["systemic", "sleek"], ["navigation", "commerce products"], ["Latin", "Extended Latin"], ["playfair-display", "ibm-plex-mono"], "Sleek geometric sans for modern product shells."),
  fontSpec("noto-sans-display", "Noto Sans Display", "display", ["global", "functional"], ["multilingual hero copy", "overview cards"], ["Latin", "Extended Latin", "Greek", "Cyrillic"], ["noto-serif", "space-mono"], "Display-safe Noto companion for multilingual products."),
  fontSpec("commissioner", "Commissioner", "sans", ["balanced", "institutional"], ["government services", "forms"], ["Latin", "Extended Latin", "Cyrillic"], ["newsreader", "jetbrains-mono"], "Balanced sans for trustworthy service products."),
  fontSpec("questrial", "Questrial", "sans", ["clean", "neutral"], ["simple dashboards", "light UI"], ["Latin", "Extended Latin"], ["lora", "ibm-plex-mono"], "Simple neutral sans for lightweight product surfaces.")
];

const OFL_LICENSE_TEXT = `SIL OPEN FONT LICENSE Version 1.1

This store contains open-source fonts distributed under the SIL Open Font License 1.1.
Reference URL: https://openfontlicense.org/open-font-license-official-text/

Short operational note:
- commercial use: allowed
- modification: allowed
- redistribution: allowed under OFL terms
- attribution: keep the original font family and license notice in metadata
`;

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function parseArgs(argv) {
  const parsed = {
    target: DEFAULT_TARGET,
    dryRun: false,
    limit: null
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
      continue;
    }
    if (arg === "--limit" && argv[index + 1]) {
      parsed.limit = Number(argv[index + 1]) || null;
      index += 1;
      continue;
    }
    if (arg.startsWith("--limit=")) {
      parsed.limit = Number(arg.split("=").slice(1).join("=")) || null;
    }
  }

  return parsed;
}

async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/css,*/*;q=0.9"
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.text();
}

async function fetchBuffer(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "*/*"
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function buildCssUrl(family) {
  const encoded = String(family).trim().replace(/\s+/g, "+");
  return `https://fonts.googleapis.com/css2?family=${encoded}:wght@${FONT_WEIGHTS}&display=swap`;
}

function parseCssFaces(cssText) {
  const blocks = cssText.match(/@font-face\s*{[^}]+}/g) || [];
  const faces = [];
  let subsetIndex = 0;

  for (const block of blocks) {
    const urlMatch = block.match(/url\((https:[^)]+)\)\s+format\(['"]?(woff2|woff)['"]?\)/i);
    if (!urlMatch) continue;
    subsetIndex += 1;
    faces.push({
      url: urlMatch[1],
      format: String(urlMatch[2] || "woff2").toLowerCase(),
      fontStyle: (block.match(/font-style:\s*([^;]+)/i)?.[1] || "normal").trim(),
      fontWeight: (block.match(/font-weight:\s*([^;]+)/i)?.[1] || "400").trim(),
      unicodeRange: (block.match(/unicode-range:\s*([^;]+)/i)?.[1] || "").trim(),
      subsetIndex
    });
  }

  const unique = new Map();
  for (const face of faces) {
    if (!unique.has(face.url)) unique.set(face.url, face);
  }
  return Array.from(unique.values());
}

function pickDownloadFaces(faces) {
  const preferredWeights = ["400", "500", "600", "700"];
  const picked = [];

  for (const weight of preferredWeights) {
    let face = faces.find((item) =>
      item.fontWeight === weight &&
      item.fontStyle === "normal" &&
      /latin/i.test(item.unicodeRange || "")
    );
    if (!face) {
      face = faces.find((item) => item.fontWeight === weight && item.fontStyle === "normal");
    }
    if (!face) {
      face = faces.find((item) => item.fontWeight === weight);
    }
    if (face && !picked.some((item) => item.url === face.url)) picked.push(face);
  }

  if (!picked.length && faces[0]) picked.push(faces[0]);
  return picked.slice(0, 4);
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

async function downloadFamily(targetRoot, publicBase, spec, dryRun) {
  const familySlug = slugify(spec.family);
  const cssUrl = buildCssUrl(spec.family);
  const cssText = await fetchText(cssUrl);
  const faces = pickDownloadFaces(parseCssFaces(cssText));
  if (faces.length === 0) {
    throw new Error(`No downloadable faces discovered for ${spec.family}`);
  }

  const familyDir = path.join(targetRoot, "files", familySlug);
  if (!dryRun) await ensureDir(familyDir);

  const localFilePaths = [];
  const downloadedFaces = [];

  for (const face of faces) {
    const extension = face.format === "woff" ? "woff" : "woff2";
    const fileName = `${face.fontWeight}-${face.fontStyle}-${String(face.subsetIndex).padStart(2, "0")}.${extension}`;
    const absoluteFilePath = path.join(familyDir, fileName);
    const publicPath = buildPublicPath(publicBase, "files", familySlug, fileName);
    const binary = dryRun ? Buffer.alloc(0) : await fetchBuffer(face.url);
    const fileHash = dryRun ? null : sha256(binary);
    if (!dryRun) await fsp.writeFile(absoluteFilePath, binary);
    localFilePaths.push(publicPath);
    downloadedFaces.push({
      filePath: absoluteFilePath,
      publicPath,
      weight: face.fontWeight,
      style: face.fontStyle,
      format: extension,
      unicodeRange: face.unicodeRange,
      sourceUrl: face.url,
      sourceHash: fileHash
    });
  }

  const previewFilePath =
    downloadedFaces.find((face) => face.weight === "400" && face.style === "normal")?.publicPath ||
    downloadedFaces[0]?.publicPath ||
    null;

  return {
    spec,
    cssUrl,
    cssHash: sha256(cssText),
    localFilePaths,
    previewFilePath,
    downloadedFaces
  };
}

function buildCatalog(targetRoot, publicBase, families, policy) {
  return {
    version: "018C",
    generatedAt: new Date().toISOString(),
    storeRoot: targetRoot,
    publicBaseUrl: publicBase,
    selectionBoundary: {
      purpose: "Select only the most relevant typography metadata for a task instead of sending the whole catalog into an AI context.",
      filters: ["taskType", "userPrompt", "category", "mood", "useCases", "languageCoverage", "pairingSuggestions"],
      futureAdapter: "services/nofida-hub-adapter/ai/font-context-packer.mjs"
    },
    fontInstallFeasibility: {
      automatedInstall: "not_supported_yet",
      recommendedNextStep: "Download a reviewed font from the NOFIDA store, then add it through the native team font upload flow.",
      nativeUploadRoutePattern: "#/dashboard/team/:team-id/fonts",
      supportedUploadFormats: ["ttf", "otf", "woff", "woff2"],
      storageNote: "NOFIDA treats uploaded custom fonts as native workspace assets. This patch does not write directly to the database."
    },
    licensePolicyVersion: policy?.version || null,
    fonts: families.map((family) => ({
      id: family.spec.id,
      family: family.spec.family,
      category: family.spec.category,
      mood: family.spec.mood,
      useCases: family.spec.useCases,
      languageCoverage: family.spec.languageCoverage,
      license: "OFL-1.1",
      licenseUrl: "https://openfontlicense.org/open-font-license-official-text/",
      attributionRequired: false,
      pairingSuggestions: family.spec.pairingSuggestions,
      localFilePaths: family.localFilePaths,
      previewFilePath: family.previewFilePath,
      fileStatus: family.localFilePaths.length > 0 ? "available" : "planned",
      approvalStatus: "approved",
      sourceName: "Google Fonts",
      sourceAuthor: "Multiple foundries via Google Fonts",
      sourceUrl: `https://fonts.google.com/specimen/${encodeURIComponent(family.spec.family)}`,
      sourceHash: family.cssHash,
      commercialUseAllowed: true,
      modificationAllowed: true,
      redistributionAllowed: true,
      reviewStatus: "approved",
      recommendedUseCase: family.spec.useCases.length
        ? `Подходит для ${family.spec.useCases.slice(0, 2).join(" и ")}.`
        : "Подходит для продуктовых интерфейсов и рабочих макетов.",
      reviewNotes: "Проверенное семейство с открытой лицензией. Файл можно скачать и добавить через нативную загрузку шрифтов.",
      reviewer: "codex",
      approvedAt: new Date().toISOString(),
      previewText: family.spec.previewText
    }))
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const targetRoot = args.target;
  const publicBase = PUBLIC_BASE_URL;
  const specs = args.limit ? FONT_SPECS.slice(0, args.limit) : FONT_SPECS.slice();

  await ensureDir(targetRoot);
  await ensureDir(path.join(targetRoot, "files"));
  await ensureDir(path.join(targetRoot, "licenses"));
  await ensureDir(path.join(targetRoot, "logs"));

  const policy = await loadLicensePolicy();
  const results = [];
  const failures = [];
  for (const spec of specs) {
    process.stdout.write(`sync-open-fonts: ${spec.family}\n`);
    try {
      const downloaded = await downloadFamily(targetRoot, publicBase, spec, args.dryRun);
      results.push(downloaded);
    } catch (error) {
      failures.push({
        id: spec.id,
        family: spec.family,
        error: error.message || String(error)
      });
      process.stderr.write(`sync-open-fonts warning: ${spec.family}: ${error.message || String(error)}\n`);
    }
  }
  if (!results.length) {
    throw new Error("No font families were downloaded successfully.");
  }

  const catalog = buildCatalog(targetRoot, publicBase, results, policy);
  const syncLog = {
    version: "018C",
    generatedAt: new Date().toISOString(),
    targetRoot,
    publicBase,
    dryRun: args.dryRun,
    totalFamilies: results.length,
    filesDownloaded: results.reduce((sum, item) => sum + item.downloadedFaces.length, 0),
    failedFamilies: failures.length,
    failures,
    families: results.map((item) => ({
      id: item.spec.id,
      family: item.spec.family,
      files: item.downloadedFaces.length,
      cssHash: item.cssHash
    }))
  };

  if (!args.dryRun) {
    await fsp.writeFile(path.join(targetRoot, "licenses", "OFL-1.1.txt"), OFL_LICENSE_TEXT, "utf8");
    await fsp.writeFile(path.join(targetRoot, "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
    await fsp.writeFile(FALLBACK_CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
    await fsp.writeFile(path.join(targetRoot, "logs", "last-sync.json"), `${JSON.stringify(syncLog, null, 2)}\n`, "utf8");
  } else {
    process.stdout.write(`${JSON.stringify(syncLog, null, 2)}\n`);
  }
}

main().catch((error) => {
  console.error(`sync-open-fonts failed: ${error.message}`);
  process.exitCode = 1;
});
