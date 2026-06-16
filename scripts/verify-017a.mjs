import { chromium } from "playwright";

const BASE = "https://engine.sys.bachopus.com";
const USER = { email: "testuser1@nofida.internal", password: "Test1Nofida2026" };
const DRAFT_NOTICE = "Draft. Replace with legal-approved text before public/commercial launch.";

const ROUTES = [
  { id: "help", route: "#/nofida/help", title: "Help Center", minCards: 4, maxCards: 8 },
  { id: "learn", route: "#/nofida/learn", title: "Learning Center", minCards: 4, maxCards: 8 },
  { id: "repository", route: "#/nofida/repository", title: "Repository", minCards: 4, maxCards: 8 },
  { id: "community", route: "#/nofida/community", title: "Community", minCards: 4, maxCards: 8 },
  { id: "releases", route: "#/nofida/releases", title: "Release Notes", minCards: 4, maxCards: 8 },
  { id: "changelog", route: "#/nofida/changelog", title: "Changelog", minCards: 4, maxCards: 8 },
  { id: "terms", route: "#/nofida/terms", title: "Terms of Use", minCards: 4, maxCards: 8, draft: true },
  { id: "privacy", route: "#/nofida/privacy", title: "Privacy / Data", minCards: 4, maxCards: 8, draft: true },
];

function isBlockedHref(href) {
  return /penpot\.app|github\.com\/penpot/i.test(String(href || ""));
}

async function collectBlockedAnchors(page, selector = "a[href]") {
  return page.$$eval(selector, (nodes) =>
    nodes
      .map((node) => ({
        href: node.getAttribute("href") || "",
        text: (node.textContent || "").trim(),
      }))
      .filter((node) => /penpot\.app|github\.com\/penpot/i.test(node.href))
  );
}

async function openHash(page, route) {
  await page.evaluate((hash) => {
    window.location.hash = hash;
  }, route);
}

async function verifyProductPage(page, spec) {
  await openHash(page, spec.route);
  await page.waitForFunction(
    ({ expectedTitle, expectedRoute }) => {
      const overlay = document.getElementById("nfp-overlay");
      const title = document.getElementById("nfp-title");
      if (!overlay || overlay.hasAttribute("hidden") || !title) return false;
      return title.textContent.trim() === expectedTitle && window.location.hash === expectedRoute;
    },
    { expectedTitle: spec.title, expectedRoute: spec.route }
  );

  const intro = await page.locator("#nfp-intro").textContent();
  const cardCount = await page.locator("#nfp-grid .nfp-card").count();
  const blockedAnchors = await collectBlockedAnchors(page, "#nfp-overlay a[href]");
  const allAnchors = await page.$$eval("#nfp-overlay a[href]", (nodes) =>
    nodes.map((node) => node.getAttribute("href") || "")
  );
  const internalOnly = allAnchors.every((href) =>
    /^(#\/|\/#\/|\/nofida\/)/.test(href) && !/^(https?:)?\/\//i.test(href)
  );

  let draftOk = true;
  if (spec.draft) {
    const notice = await page.locator("#nfp-notice").textContent();
    draftOk = notice?.includes("Draft. Replace with legal-approved text before public/commercial launch.") || false;
  }

  return {
    titleOk: true,
    introOk: Boolean(intro && intro.trim().length > 0),
    cardsOk: cardCount >= spec.minCards && cardCount <= spec.maxCards,
    blockedAnchors,
    internalOnly,
    draftOk,
  };
}

async function run() {
  const results = {
    rootAssets: false,
    dashboardNoBlockedAnchors: false,
    libraryHubRoute: false,
    libraryHubNoBlockedAnchors: false,
    internalNavHelpToLearn: false,
    internalNavTermsToPrivacy: false,
  };

  const routeResults = {};

  console.log("PATCH 017A verification starting...\n");

  const rootResp = await fetch(BASE).catch(() => null);
  if (rootResp?.ok) {
    const html = await rootResp.text();
    results.rootAssets = html.includes("nofida-pages.js") && html.includes("nofida-pages.css");
  }
  console.log(`  root includes NOFIDA pages assets: ${results.rootAssets ? "PASS" : "FAIL"}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  try {
    await page.goto(`${BASE}/#/auth/login`, { waitUntil: "domcontentloaded" });
    await page.fill("input[type='email']", USER.email);
    await page.fill("input[type='password']", USER.password);
    await page.click("button[type='submit']");
    await page.waitForURL(/\/#\/dashboard/, { timeout: 30000 });
    await page.waitForTimeout(2500);

    const dashboardBlocked = await collectBlockedAnchors(page);
    results.dashboardNoBlockedAnchors = dashboardBlocked.length === 0;
    console.log(`  dashboard visible anchors stay internal: ${results.dashboardNoBlockedAnchors ? "PASS" : "FAIL"}`);

    for (const spec of ROUTES) {
      const result = await verifyProductPage(page, spec);
      routeResults[spec.id] = result;
      const routePass =
        result.titleOk &&
        result.introOk &&
        result.cardsOk &&
        result.blockedAnchors.length === 0 &&
        result.internalOnly &&
        result.draftOk;

      console.log(
        `  ${spec.id.padEnd(10)} route: ${routePass ? "PASS" : "FAIL"}`
      );
    }

    await openHash(page, "#/nofida/help");
    await page.locator('#nfp-overlay a[href="#/nofida/learn"]').first().click();
    await page.waitForFunction(() => document.getElementById("nfp-title")?.textContent.trim() === "Learning Center");
    results.internalNavHelpToLearn = page.url().includes("#/nofida/learn") && !/penpot\.app/i.test(page.url());
    console.log(`  help -> learn internal nav: ${results.internalNavHelpToLearn ? "PASS" : "FAIL"}`);

    await openHash(page, "#/nofida/terms");
    await page.locator('#nfp-overlay a[href="#/nofida/privacy"]').first().click();
    await page.waitForFunction(() => document.getElementById("nfp-title")?.textContent.trim() === "Privacy / Data");
    results.internalNavTermsToPrivacy = page.url().includes("#/nofida/privacy") && !/penpot\.app/i.test(page.url());
    console.log(`  terms -> privacy internal nav: ${results.internalNavTermsToPrivacy ? "PASS" : "FAIL"}`);

    await openHash(page, "#/nofida/libraries");
    await page.waitForFunction(() => {
      const overlay = document.getElementById("nhb-overlay");
      return !!overlay && !overlay.hasAttribute("hidden");
    });
    const hubTitle = await page.locator("#nhb-overlay .nhb-h1").textContent();
    const hubBlocked = await collectBlockedAnchors(page);
    results.libraryHubRoute = (hubTitle || "").includes("Библиотеки NOFIDA");
    results.libraryHubNoBlockedAnchors = hubBlocked.length === 0;
    console.log(`  libraries route opens NOFIDA Hub: ${results.libraryHubRoute ? "PASS" : "FAIL"}`);
    console.log(`  libraries visible anchors stay internal: ${results.libraryHubNoBlockedAnchors ? "PASS" : "FAIL"}`);
  } finally {
    await browser.close();
  }

  console.log("\nPATCH 017A route matrix:");
  for (const spec of ROUTES) {
    const result = routeResults[spec.id];
    const routePass =
      result &&
      result.titleOk &&
      result.introOk &&
      result.cardsOk &&
      result.blockedAnchors.length === 0 &&
      result.internalOnly &&
      result.draftOk;
    console.log(`  ${spec.id.padEnd(10)} ${routePass ? "PASS" : "FAIL"}`);
  }

  const finalPass = [
    results.rootAssets,
    results.dashboardNoBlockedAnchors,
    results.libraryHubRoute,
    results.libraryHubNoBlockedAnchors,
    results.internalNavHelpToLearn,
    results.internalNavTermsToPrivacy,
    ...Object.values(routeResults).map((result) =>
      result.titleOk &&
      result.introOk &&
      result.cardsOk &&
      result.blockedAnchors.length === 0 &&
      result.internalOnly &&
      result.draftOk
    ),
  ].every(Boolean);

  console.log("\nAdditional checks:");
  console.log(`  root assets:                 ${results.rootAssets ? "PASS" : "FAIL"}`);
  console.log(`  dashboard internal anchors:  ${results.dashboardNoBlockedAnchors ? "PASS" : "FAIL"}`);
  console.log(`  library hub route:           ${results.libraryHubRoute ? "PASS" : "FAIL"}`);
  console.log(`  library hub anchors:         ${results.libraryHubNoBlockedAnchors ? "PASS" : "FAIL"}`);
  console.log(`  help -> learn click:         ${results.internalNavHelpToLearn ? "PASS" : "FAIL"}`);
  console.log(`  terms -> privacy click:      ${results.internalNavTermsToPrivacy ? "PASS" : "FAIL"}`);

  if (!finalPass) {
    process.exitCode = 1;
    console.log("\nPATCH 017A verification: FAIL");
    return;
  }

  console.log("\nPATCH 017A verification: PASS");
}

run().catch((error) => {
  console.error("PATCH 017A verification error:", error.message);
  process.exit(1);
});
