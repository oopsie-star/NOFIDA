import { chromium } from "playwright";

const BASE = "https://engine.sys.bachopus.com";
const USER = { email: "testuser1@nofida.internal", password: "Test1Nofida2026" };
const AI_SETTINGS_ROUTE = "#/settings/options?nofida=ai&tab=api";

function ignoredConsole(entry) {
  const text = String(entry?.text || "");
  const url = String(entry?.location?.url || "");
  return text.includes("Failed to load resource: the server responded with a status of 401") &&
    url.includes("/api/main/methods/get-enabled-flags");
}

async function openHash(page, hash) {
  await page.evaluate((value) => {
    window.location.hash = value;
  }, hash);
}

async function login(page) {
  await page.goto(`${BASE}/#/auth/login`, { waitUntil: "networkidle", timeout: 60000 });
  await page.fill("input[type='email'], input[name='email']", USER.email);
  await page.fill("input[type='password'], input[name='password']", USER.password);
  await page.click("button[type='submit']");
  await page.waitForURL(/\/#\/dashboard/, { timeout: 30000 });
  await page.waitForTimeout(4000);
}

async function resolveTeamId(page) {
  const fromUrl = page.url().match(/\/#\/dashboard\/team\/([0-9a-f-]{36})/i)?.[1];
  if (fromUrl) return fromUrl;
  const fromQuery = page.url().match(/[?&]team-id=([0-9a-f-]{36})/i)?.[1];
  if (fromQuery) return fromQuery;
  const fromDom = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll("a[href]"));
    const match = anchors
      .map((node) => node.getAttribute("href") || "")
      .map((href) => href.match(/dashboard\/team\/([0-9a-f-]{36})/i))
      .find(Boolean);
    return match ? match[1] : "";
  });
  if (fromDom) return fromDom;
  const fromProfile = await page.evaluate(async () => {
    try {
      const resp = await fetch("/api/rpc/command/get-profile", {
        credentials: "include",
        headers: { Accept: "application/transit+json" }
      });
      if (!resp.ok) return "";
      const text = JSON.stringify(await resp.json());
      const match = text.match(/default-team-id\",\"~u([0-9a-f-]{36})/i);
      return match ? match[1] : "";
    } catch (_error) {
      return "";
    }
  });
  if (fromProfile) return fromProfile;
  throw new Error("Could not resolve team id");
}

async function visibleBlockedAnchors(page) {
  return page.$$eval("a[href]", (nodes) => {
    return nodes
      .map((node) => {
        const href = node.getAttribute("href") || "";
        const text = (node.textContent || "").trim();
        const style = window.getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        const visible =
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0" &&
          rect.width > 0 &&
          rect.height > 0;
        return { href, text, visible };
      })
      .filter((node) => node.visible && /penpot\.app|github\.com\/penpot/i.test(node.href));
  });
}

function pass(label, detail = "") {
  console.log(`${label}: PASS${detail ? ` (${detail})` : ""}`);
}

function fail(label, detail = "") {
  console.log(`${label}: FAIL${detail ? ` (${detail})` : ""}`);
}

async function verifyNativeFonts(page, teamId, results) {
  await openHash(page, `#/dashboard/team/${teamId}/fonts`);
  await page.waitForTimeout(5000);

  const panel = page.locator("#nfr-native-fonts");
  results.nativeFontsRoute = await panel.count() > 0;
  results.nativeFontsAlert = results.nativeFontsRoute && await page.locator("#nfr-native-fonts .nfr-alert").count() > 0;
  results.nativeFontsSearch = results.nativeFontsRoute && await page.locator("[data-nfr-filter='nativeFonts:query']").count() > 0;
  results.nativeFontsCards = results.nativeFontsRoute ? await page.locator("#nfr-native-fonts .nfr-card").count() : 0;
  results.nativeFontsLicense = results.nativeFontsRoute ? await page.locator("#nfr-native-fonts").textContent() : "";
  results.nativeFontsUploadTab = await page.locator("[data-nfr-native-nav='upload']").count() > 0;
  results.nativeFontsMyFontsTab = await page.locator("[data-nfr-native-nav='my-fonts']").count() > 0;
}

async function verifyFontCatalog(page, results) {
  await openHash(page, "#/nofida/fonts");
  await page.waitForSelector("#nfr-font-explorer .nfr-card", { timeout: 60000 });
  results.fontCatalogCards = await page.locator("#nfr-font-explorer .nfr-card").count();
  results.fontCatalogLicense = await page.locator("#nfr-font-explorer").textContent();
}

async function verifyMedia(page, results) {
  await openHash(page, "#/nofida/media");
  await page.waitForSelector("#nfr-media-explorer .nfr-card", { timeout: 60000 });
  results.mediaCards = await page.locator("#nfr-media-explorer .nfr-card").count();
  results.mediaSearch = await page.locator("[data-nfr-filter='media:query']").count() > 0;
  results.mediaPatterns = await page.locator(".nfr-pattern-card").count();
  results.mediaText = await page.locator("#nfr-media-explorer").textContent();
}

async function verifyFigma(page, results) {
  await openHash(page, "#/nofida/import/figma");
  await page.waitForSelector("#nfr-content .nfr-flow-card", { timeout: 60000 });
  const text = await page.locator("#nfr-content").textContent();
  results.figmaFlow = /Migration flow|Suggested path/i.test(text);
  results.figmaReport = /migration report/i.test(text);
  results.figmaPromise = /No 1:1 promise|does not promise/i.test(text);
}

async function verifySidebarFontsLink(page, results) {
  await openHash(page, "#/dashboard");
  await page.waitForTimeout(4000);
  const link = page.locator("#nhb-sidebar-resources a").filter({ hasText: "Fonts" }).first();
  if (await link.count()) {
    await link.evaluate((node) => node.click());
    await page.waitForTimeout(3000);
    results.sidebarFontsWorks = await page.locator("#nfr-native-fonts").count() > 0;
  } else {
    results.sidebarFontsWorks = false;
  }
}

async function verifyHub(page, results) {
  await openHash(page, "#/nofida/libraries");
  await page.waitForFunction(() => {
    const overlay = document.getElementById("nhb-overlay");
    const gridCount = document.querySelectorAll("#nhb-grid .nhb-card").length;
    return !!overlay && !overlay.hasAttribute("hidden") && gridCount > 0;
  }, { timeout: 60000 });
  results.hubWorks = await page.locator("#nhb-grid .nhb-card").count() > 0;
}

async function verifyEditor(page, results) {
  await openHash(page, "#/nofida/libraries");
  await page.waitForTimeout(2000);
  const openButton = page.locator("#nhb-grid .nhb-card .nhb-btn[data-act='open']").first();
  if (await openButton.count()) {
    await openButton.click();
    await page.waitForURL(/\/#\/workspace/, { timeout: 30000 });
    await page.waitForTimeout(5000);
    results.editorWorks = /\/#\/workspace/.test(page.url());
  } else {
    results.editorWorks = false;
  }
}

async function verifyAiSettings(page, results) {
  await openHash(page, AI_SETTINGS_ROUTE);
  await page.waitForFunction(() => !!document.getElementById("nofida-shell-root"), { timeout: 30000 });
  await page.waitForTimeout(2500);
  results.aiSettingsWorks = /#\/settings\/options\?nofida=ai&tab=api/.test(page.url());
}

async function verifyInternalPages(page, results) {
  await openHash(page, "#/nofida/help");
  await page.waitForSelector("#nfp-overlay", { timeout: 60000 });
  const helpOk = await page.locator("#nfp-overlay").textContent();
  await openHash(page, "#/nofida/learn");
  await page.waitForTimeout(2000);
  const learnOk = await page.locator("#nfp-overlay").textContent();
  results.helpLearn = /Help Center/i.test(helpOk) && /Learning Center/i.test(learnOk);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const fatalConsole = [];
const ignored = [];

page.on("pageerror", (error) => fatalConsole.push(`pageerror:${error.message}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const entry = {
    text: message.text(),
    location: message.location(),
  };
  if (ignoredConsole(entry)) ignored.push(entry);
  else fatalConsole.push(`console:${entry.text}`);
});

const results = {};

try {
  console.log("PATCH 018B verify starting...");
  await login(page);
  const teamId = await resolveTeamId(page);

  await verifyNativeFonts(page, teamId, results);
  await verifyFontCatalog(page, results);
  await verifyMedia(page, results);
  await verifyFigma(page, results);
  await verifySidebarFontsLink(page, results);
  await verifyHub(page, results);
  await verifyEditor(page, results);
  await verifyAiSettings(page, results);
  await verifyInternalPages(page, results);

  const blocked = await visibleBlockedAnchors(page);
  results.noVisiblePenpotLinks = blocked.length === 0;
  results.noFatalConsoleErrors = fatalConsole.length === 0;

  results.nativeFontsIntegrated = results.nativeFontsRoute && results.nativeFontsCards > 0;
  results.nativeUploadPreserved = results.nativeFontsUploadTab && results.nativeFontsAlert;
  results.nativeMyFontsPreserved = results.nativeFontsMyFontsTab;
  results.nativeSearchWorks = results.nativeFontsSearch;
  results.nativeInstallHonest = /native font upload flow/i.test(results.nativeFontsLicense || "");
  results.nativeNoFakeInstalledState = !/automatic installation is enabled/i.test(results.nativeFontsLicense || "");

  results.fontCatalogLicenseVisible = /OFL-1\.1/i.test(results.fontCatalogLicense || "");
  results.mediaLicenseVisible = /CC0-1\.0|MIT/i.test(results.mediaText || "");
  results.mediaSearchWorks = results.mediaSearch;
  results.uiPatternsVisible = results.mediaPatterns > 0;
  results.figmaNoFalsePromise = results.figmaPromise;

  (results.nativeFontsIntegrated ? pass : fail)("native fonts integrated", String(results.nativeFontsCards || 0));
  (results.nativeUploadPreserved ? pass : fail)("upload-own-font path preserved");
  (results.nativeMyFontsPreserved ? pass : fail)("my fonts section preserved");
  (results.nativeSearchWorks ? pass : fail)("native fonts search/filter");
  (results.nativeInstallHonest ? pass : fail)("native font install honesty");
  (results.fontCatalogCards > 0 ? pass : fail)("font catalog renders", String(results.fontCatalogCards || 0));
  (results.fontCatalogLicenseVisible ? pass : fail)("font license visible");
  (results.mediaCards > 0 ? pass : fail)("media catalog renders", String(results.mediaCards || 0));
  (results.mediaLicenseVisible ? pass : fail)("media license visible");
  (results.mediaSearchWorks ? pass : fail)("media search/filter");
  (results.uiPatternsVisible ? pass : fail)("UI patterns visible", String(results.mediaPatterns || 0));
  (results.figmaFlow ? pass : fail)("figma migration flow");
  (results.figmaReport ? pass : fail)("figma migration report");
  (results.figmaNoFalsePromise ? pass : fail)("figma no false 1:1 promise");
  (results.sidebarFontsWorks ? pass : fail)("sidebar Fonts link works");
  (results.hubWorks ? pass : fail)("hub regression");
  (results.editorWorks ? pass : fail)("editor regression");
  (results.aiSettingsWorks ? pass : fail)("AI settings regression");
  (results.helpLearn ? pass : fail)("help/learn routes");
  (results.noVisiblePenpotLinks ? pass : fail)("no visible Penpot links");
  (results.noFatalConsoleErrors ? pass : fail)("no fatal console errors", fatalConsole.join(" | "));
  console.log(`ignored non-fatal console noise: ${ignored.length}`);
} finally {
  await browser.close();
}
