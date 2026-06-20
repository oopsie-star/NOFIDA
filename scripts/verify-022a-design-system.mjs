import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.NOFIDA_BASE || "https://engine.sys.bachopus.com";
const USER = {
  email: process.env.NOFIDA_USER_EMAIL || "testuser1@nofida.internal",
  password: process.env.NOFIDA_USER_PASSWORD || "Test1Nofida2026"
};
const AI_SETTINGS_ROUTE = "#/settings/options?nofida=ai&tab=api";
const SCREENSHOT_DIR = path.resolve("artifacts", "verify-022a");

function mark(value) {
  return value ? "PASS" : "FAIL";
}

function printLine(label, ok, detail = "") {
  console.log(`* ${label}: ${mark(ok)}${detail ? ` (${detail})` : ""}`);
}

function makeTransitDecoder() {
  const cache = [];
  function cacheIdx(ref) {
    const c = ref.charCodeAt(0);
    if (c >= 48 && c <= 57) return c - 48;
    if (c >= 65 && c <= 90) return c - 65 + 10;
    if (c >= 97 && c <= 109) return c - 97 + 36;
    return -1;
  }
  function decode(v) {
    if (typeof v === "string") {
      if (v.length >= 2 && v[0] === "^") {
        const i = cacheIdx(v.slice(1));
        return i >= 0 && i < cache.length ? cache[i] : v;
      }
      if (v.startsWith("~u") && v.length > 2 && /[0-9a-f-]/i.test(v[2])) return v.slice(2);
      if (v.startsWith("~u ")) return v.slice(3);
      if (v.startsWith("~:")) {
        const kw = v.slice(2);
        cache.push(kw);
        return kw;
      }
      return v;
    }
    if (Array.isArray(v)) {
      if (v.length > 0 && v[0] === "^ ") {
        const out = {};
        for (let i = 1; i < v.length - 1; i += 2) out[String(decode(v[i]))] = decode(v[i + 1]);
        return out;
      }
      return v.map(decode);
    }
    if (v && typeof v === "object") {
      const out = {};
      Object.keys(v).forEach((k) => {
        out[String(decode(k))] = decode(v[k]);
      });
      return out;
    }
    return v;
  }
  return decode;
}

function decodeTransit(value) {
  return makeTransitDecoder()(value);
}

async function waitForSelectorEventually(page, selector, totalMs = 90000) {
  const started = Date.now();
  while (Date.now() - started < totalMs) {
    try {
      await page.waitForSelector(selector, { timeout: 10000 });
      return true;
    } catch (_error) {
      await page.waitForTimeout(1500);
    }
  }
  return false;
}

async function login(page) {
  await page.goto(`${BASE}/#/auth/login`, { waitUntil: "commit", timeout: 60000 });
  const ready = await waitForSelectorEventually(page, "input[type='email'], input[name='email']");
  if (!ready) throw new Error("Login form did not render");
  await page.fill("input[type='email'], input[name='email']", USER.email);
  await page.fill("input[type='password'], input[name='password']", USER.password);
  await page.click("button[type='submit']");
  await page.waitForURL(/\/#\/dashboard/, { timeout: 90000 });
  await page.waitForTimeout(12000);
}

async function openHash(page, hash) {
  await page.evaluate((value) => {
    window.location.hash = value;
  }, hash);
}

async function resolveTeamId(page) {
  const fromUrl = page.url().match(/[?&]team-id=([0-9a-f-]{36})/i)?.[1]
    || page.url().match(/\/#\/dashboard\/team\/([0-9a-f-]{36})/i)?.[1];
  if (fromUrl) return fromUrl;

  const fromNav = await page.evaluate(() => {
    return window.NofidaNavigation?.getCurrentTeamId
      ? window.NofidaNavigation.getCurrentTeamId(window.location.hash || "")
      : "";
  });
  if (fromNav) return fromNav;

  const response = await page.request.get(`${BASE}/api/rpc/command/get-profile`, {
    headers: { Accept: "application/transit+json" }
  });
  if (!response.ok()) throw new Error("Could not load profile for team id");
  const decoded = decodeTransit(await response.json());
  const teamId = decoded["default-team-id"] || decoded.defaultTeamId || "";
  if (!teamId) throw new Error("Could not resolve team id");
  return teamId;
}

async function getProjects(page, teamId) {
  const response = await page.request.get(`${BASE}/api/rpc/command/get-all-projects?team_id=${teamId}`, {
    headers: { Accept: "application/transit+json" }
  });
  if (!response.ok()) return [];
  const decoded = decodeTransit(await response.json());
  return Array.isArray(decoded) ? decoded : [];
}

async function getFiles(page, projectId) {
  const response = await page.request.get(`${BASE}/api/rpc/command/get-project-files?project-id=${projectId}`, {
    headers: { Accept: "application/transit+json" }
  });
  if (!response.ok()) return [];
  const decoded = decodeTransit(await response.json());
  return Array.isArray(decoded) ? decoded : [];
}

async function findEditorRoute(page, teamId) {
  const projects = await getProjects(page, teamId);
  for (const project of projects) {
    const files = await getFiles(page, project.id);
    if (files.length > 0) {
      return `#/workspace?team-id=${teamId}&file-id=${files[0].id}`;
    }
  }
  return "";
}

async function saveShot(page, name) {
  await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, `${name}.png`),
    fullPage: true
  });
}

async function collectVisibleBlockedAnchors(page) {
  return page.$$eval("a[href]", (nodes) => {
    return nodes
      .map((node) => {
        const href = node.getAttribute("href") || "";
        const style = window.getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        const visible =
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0" &&
          rect.width > 0 &&
          rect.height > 0;
        return { href, visible };
      })
      .filter((node) => node.visible && /penpot\.app|github\.com\/penpot/i.test(node.href));
  });
}

async function collectSnapshot(page) {
  return page.evaluate(() => {
    function text(node) {
      return String(node?.textContent || "").replace(/\s+/g, " ").trim();
    }
    function visible(node) {
      if (!node) return false;
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    }
    const forbidden = ["hotlink", "отмыть авторство", "provenance", "adapter", "resource factory", "stub", "placeholder"];
    const bodyText = String(document.body?.innerText || "").toLowerCase();
    const shell = document.getElementById("nofida-shell");
    const topbar = document.getElementById("nofida-shell-topbar");
    const sidebar = document.getElementById("nofida-shell-sidebar");
    const content = document.querySelector(".main_ui_dashboard__dashboard-content");
    const shellRouteKind = shell?.getAttribute("data-route-kind") || "";
    const blockedWords = forbidden.filter((word) => bodyText.includes(word));
    const legacyVisible = [
      "#nfr-overlay",
      "#nfp-overlay",
      "#nhb-overlay",
      ".nfr-nav-panel",
      ".nfp-nav-panel",
      ".nhb-nav-panel"
    ].reduce((count, selector) => {
      return count + Array.from(document.querySelectorAll(selector)).filter(visible).length;
    }, 0);

    const chipName = document.querySelector(".nf-account-chip-topbar .nf-account-copy strong")
      || document.querySelector(".nf-account-chip .nf-account-copy strong")
      || document.querySelector(".nofida-footer-name");
    return {
      routeKind: shellRouteKind,
      shellCount: document.querySelectorAll("#nofida-shell").length,
      sidebarCount: document.querySelectorAll("#nofida-shell-sidebar").length,
      topbarCount: document.querySelectorAll("#nofida-shell-topbar").length,
      sidebarWidth: sidebar ? Math.round(sidebar.getBoundingClientRect().width) : 0,
      shellVisible: visible(shell),
      topbarVisible: visible(topbar),
      contentBg: content ? window.getComputedStyle(content).backgroundColor : "",
      pageBg: shell ? window.getComputedStyle(shell).backgroundColor : "",
      hasDashboardLayout: !!document.getElementById("nf-dashboard-layout-wrapper"),
      hasProjectGrid: !!document.getElementById("nf-project-grid"),
      nfProjectCards: document.querySelectorAll("#nf-project-grid .nf-project-card").length,
      accountChipText: chipName ? text(chipName) : "",
      projectRows: document.querySelectorAll(".main_ui_dashboard_projects__dashboard-project-row").length,
      projectCards: document.querySelectorAll(".main_ui_dashboard_grid__grid-item > div[role='button']").length,
      contextPanels: document.querySelectorAll("#nf-dashboard-context-panel .nf-panel").length,
      resourceCards: document.querySelectorAll("#nf-dashboard-resource-strip .nf-resource-card").length,
      libraryCards: document.querySelectorAll("#nhb-grid .nhb-card").length,
      fontCards: document.querySelectorAll("#nfr-font-explorer .nfr-card").length,
      mediaCards: document.querySelectorAll("#nfr-media-explorer .nfr-card").length,
      helpCards: document.querySelectorAll("#nfp-grid .nfp-card").length,
      nativeFontsPanel: document.querySelectorAll("#nfr-native-fonts").length,
      hasForbiddenCopy: blockedWords.length > 0,
      blockedWords,
      legacyVisible,
      hasEdLabel: Array.from(document.querySelectorAll("#nofida-shell-nav .nofida-nav-item, #nofida-shell-nav .nofida-nav-subitem")).some((node) => text(node) === "Ед."),
      nativeSettingsSidebar: document.querySelectorAll("ul.main_ui_settings_sidebar__sidebar-nav-settings").length,
      nativeEditor: /\/#\/workspace/.test(window.location.href)
    };
  });
}

async function waitForDashboard(page) {
  await page.waitForFunction(() => {
    const shell = document.getElementById("nofida-shell");
    if (!shell) return false;
    const kind = shell.getAttribute("data-route-kind");
    // 022B: shell-page mode renders the NOFIDA project grid directly
    if (kind === "shell-page" && document.getElementById("nf-project-grid")) return true;
    // legacy / native-dashboard fallback
    if (kind === "native-dashboard" && document.querySelector(".main_ui_dashboard__dashboard-content")) return true;
    return false;
  }, { timeout: 90000 });
  await page.waitForTimeout(4000);
}

async function waitForLibraries(page) {
  await page.waitForFunction(() => {
    return !!document.getElementById("nhb-shell-root")
      && document.querySelectorAll("#nhb-grid .nhb-card").length > 0;
  }, { timeout: 90000 });
}

async function waitForNativeFonts(page) {
  await page.waitForFunction(() => {
    return !!document.getElementById("nfr-native-fonts");
  }, { timeout: 90000 });
}

async function waitForFontCatalog(page) {
  await page.waitForFunction(() => {
    return !!document.getElementById("nfr-shell-root")
      && document.querySelectorAll("#nfr-font-explorer .nfr-card").length > 0;
  }, { timeout: 90000 });
}

async function waitForMedia(page) {
  await page.waitForFunction(() => {
    return !!document.getElementById("nfr-shell-root")
      && document.querySelectorAll("#nfr-media-explorer .nfr-card").length > 0;
  }, { timeout: 90000 });
}

async function waitForFigma(page) {
  await page.waitForFunction(() => {
    return !!document.getElementById("nfr-shell-root")
      && !!document.getElementById("nfr-figma-url")
      && !!document.getElementById("nfr-figma-report-anchor");
  }, { timeout: 90000 });
}

async function waitForHelp(page) {
  await page.waitForFunction(() => {
    return !!document.getElementById("nfp-shell-root")
      && document.querySelectorAll("#nfp-grid .nfp-card").length > 0;
  }, { timeout: 90000 });
}

async function waitForAccount(page) {
  await page.waitForFunction(() => {
    return document.querySelectorAll("ul.main_ui_settings_sidebar__sidebar-nav-settings").length > 0;
  }, { timeout: 90000 });
}

async function waitForEditor(page) {
  await page.waitForURL(/\/#\/workspace/, { timeout: 90000 });
  await page.waitForTimeout(5000);
}

const browser = await chromium.launch({ headless: true, args: ["--disable-infobars", "--no-sandbox"] });
const context = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 1600, height: 1100 }
});
const page = await context.newPage();
page.setDefaultTimeout(90000);

const fatalConsole = [];
const benignUnauthorized = [];
page.on("pageerror", (error) => fatalConsole.push(`pageerror:${error.message}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const text = message.text();
  if (/Failed to load resource: the server responded with a status of 401/i.test(text)) return;
  if (/get-enabled-flags/i.test(text)) return;
  if (/ws\/notifications/i.test(text)) return;
  if (/ERR_NETWORK_IO_SUSPENDED/i.test(text)) return;
  fatalConsole.push(`console:${text}`);
});
page.on("response", (response) => {
  if (response.status() !== 401) return;
  const url = response.url();
  if (/get-enabled-flags/i.test(url)) {
    benignUnauthorized.push(url);
    return;
  }
  fatalConsole.push(`401:${url}`);
});

const results = {};

try {
  console.log("PATCH 022A verify starting...");
  await login(page);
  const teamId = await resolveTeamId(page);

  await openHash(page, `#/dashboard/team/${teamId}/projects`);
  await waitForDashboard(page);
  await saveShot(page, "dashboard-projects");
  results.dashboard = await collectSnapshot(page);

  await openHash(page, "#/nofida/libraries");
  await waitForLibraries(page);
  await saveShot(page, "libraries");
  results.libraries = await collectSnapshot(page);

  await openHash(page, `#/dashboard/fonts?team-id=${teamId}`);
  await waitForDashboard(page);
  await waitForNativeFonts(page);
  await saveShot(page, "native-fonts");
  results.nativeFonts = await collectSnapshot(page);

  await openHash(page, "#/nofida/fonts");
  await waitForFontCatalog(page);
  await saveShot(page, "font-catalog");
  results.fontCatalog = await collectSnapshot(page);

  await openHash(page, "#/nofida/media");
  await waitForMedia(page);
  await saveShot(page, "media");
  results.media = await collectSnapshot(page);

  await openHash(page, "#/nofida/import/figma");
  await waitForFigma(page);
  await saveShot(page, "figma-import");
  results.figma = await collectSnapshot(page);

  await openHash(page, "#/nofida/help");
  await waitForHelp(page);
  await saveShot(page, "help");
  results.help = await collectSnapshot(page);

  await openHash(page, "#/settings/options");
  await waitForAccount(page);
  await saveShot(page, "settings");
  results.settings = await collectSnapshot(page);

  const editorRoute = await findEditorRoute(page, teamId);
  if (editorRoute) {
    await openHash(page, editorRoute);
    await waitForEditor(page);
    await saveShot(page, "editor");
    results.editor = await collectSnapshot(page);
  } else {
    results.editor = { nativeEditor: false, shellCount: 0 };
  }

  results.blockedAnchors = await collectVisibleBlockedAnchors(page);

  console.log("");
  // ── 022B assertions ──────────────────────────────────────────────────────
  printLine("dashboard renders in shell-page mode (022B)", results.dashboard.routeKind === "shell-page", results.dashboard.routeKind);
  printLine("dashboard layout wrapper (#nf-dashboard-layout-wrapper) present", results.dashboard.hasDashboardLayout);
  printLine("project grid (#nf-project-grid) present", results.dashboard.hasProjectGrid);
  printLine("4+ project cards rendered (real + template placeholders)", results.dashboard.nfProjectCards >= 4, `${results.dashboard.nfProjectCards} cards`);
  printLine("account chip text is clean (no leading avatar letter)", !results.dashboard.accountChipText.match(/^[A-Z]\s/), `"${results.dashboard.accountChipText}"`);
  // ── 022A / stable assertions ─────────────────────────────────────────────
  printLine("dashboard main background is light", /rgb\(247,\s*248,\s*251\)|rgb\(245,\s*247,\s*251\)/.test(results.dashboard.contentBg || results.dashboard.pageBg), `${results.dashboard.contentBg || results.dashboard.pageBg}`);
  printLine("sidebar width is 248px or expected token value", Math.abs(results.dashboard.sidebarWidth - 248) <= 18, `${results.dashboard.sidebarWidth}px`);
  printLine("topbar exists on dashboard/resource/help routes", results.dashboard.topbarVisible && results.libraries.topbarVisible && results.help.topbarVisible);
  printLine("dashboard has right context panel (3 sections)", results.dashboard.contextPanels >= 3, `${results.dashboard.contextPanels} panels`);
  printLine("dashboard has resource strip (4 cards)", results.dashboard.resourceCards >= 4, `${results.dashboard.resourceCards} cards`);
  printLine("resource/help pages use same topbar/sidebar", results.libraries.sidebarCount === 1 && results.fontCatalog.sidebarCount === 1 && results.media.sidebarCount === 1 && results.figma.sidebarCount === 1 && results.help.sidebarCount === 1);
  printLine("no duplicate sidebar", [results.dashboard, results.libraries, results.fontCatalog, results.media, results.figma, results.help].every((sample) => sample.shellCount === 1 && sample.sidebarCount === 1));
  printLine("no old resource-specific sidebar", [results.dashboard, results.libraries, results.fontCatalog, results.media, results.figma, results.help].every((sample) => sample.legacyVisible === 0));
  printLine("no `Ед.` label", [results.dashboard, results.libraries, results.fontCatalog, results.media, results.figma, results.help].every((sample) => !sample.hasEdLabel));
  printLine("forbidden technical copy removed", [results.dashboard, results.libraries, results.fontCatalog, results.media, results.figma, results.help].every((sample) => !sample.hasForbiddenCopy), [results.dashboard, results.libraries, results.fontCatalog, results.media, results.figma, results.help].flatMap((sample) => sample.blockedWords || []).join(", "));
  printLine("libraries redesigned", results.libraries.libraryCards > 0, `${results.libraries.libraryCards} cards`);
  printLine("fonts redesigned/wrapped", results.nativeFonts.nativeFontsPanel > 0 && results.fontCatalog.fontCards > 0, `${results.nativeFonts.nativeFontsPanel} native / ${results.fontCatalog.fontCards} catalog`);
  printLine("media redesigned", results.media.mediaCards > 0, `${results.media.mediaCards} cards`);
  printLine("figma import redesigned", results.figma.routeKind === "shell-page", results.figma.routeKind);
  printLine("help/learn redesigned", results.help.helpCards > 0, `${results.help.helpCards} cards`);
  printLine("account settings still stable", results.settings.shellCount === 0 && results.settings.nativeSettingsSidebar > 0, `${results.settings.nativeSettingsSidebar} native sidebars`);
  printLine("editor unaffected", results.editor.shellCount === 0 && results.editor.nativeEditor, results.editor.nativeEditor ? "workspace route open" : "no workspace route");
  printLine("no visible Penpot links", results.blockedAnchors.length === 0, `${results.blockedAnchors.length} blocked anchors`);
  const consoleSummary = fatalConsole.length
    ? fatalConsole.slice(0, 2).join(" | ")
    : benignUnauthorized.length
      ? `ignored ${benignUnauthorized.length} get-enabled-flags 401`
      : "";
  printLine("no fatal console/network errors except known non-fatal 401 flags", fatalConsole.length === 0, consoleSummary);
  printLine("screenshots captured", true, SCREENSHOT_DIR);
} finally {
  await browser.close();
}
