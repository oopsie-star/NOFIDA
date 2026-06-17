import { chromium } from "playwright";

const BASE = "https://engine.sys.bachopus.com";
const USER = { email: "testuser1@nofida.internal", password: "Test1Nofida2026" };
const DRAFT_NOTICE = "Draft. Replace with legal-approved text before public/commercial launch.";
const AI_SETTINGS_ROUTE = "#/settings/options?nofida=ai&tab=api";

function isIgnoredConsoleError(entry) {
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

async function getShellState(page) {
  return page.evaluate(() => {
    const host = document.getElementById("nofida-shell-root");
    if (!host || !host.shadowRoot) return null;
    const root = host.shadowRoot;
    const fab = root.getElementById("fab");
    const panel = root.getElementById("assistant-panel");
    const settingsShell = root.getElementById("settings-shell");
    return {
      hasFab: Boolean(fab),
      fabHidden: fab ? fab.hidden : true,
      panelOpen: panel ? panel.classList.contains("open") : false,
      settingsVisible: settingsShell ? !settingsShell.hidden : false,
      promptExists: Boolean(root.getElementById("prompt")),
    };
  });
}

async function clickFab(page) {
  await page.evaluate(() => {
    const host = document.getElementById("nofida-shell-root");
    if (!host || !host.shadowRoot) throw new Error("NOFIDA shell root missing");
    const fab = host.shadowRoot.getElementById("fab");
    if (!fab) throw new Error("NOFIDA AI FAB missing");
    fab.click();
  });
}

async function clickAssistantSettings(page) {
  await page.evaluate(() => {
    const host = document.getElementById("nofida-shell-root");
    if (!host || !host.shadowRoot) throw new Error("NOFIDA shell root missing");
    const button = host.shadowRoot.querySelector('button[data-action="open-settings"]');
    if (!button) throw new Error("Assistant settings button missing");
    button.click();
  });
}

async function login(page) {
  await page.goto(`${BASE}/#/auth/login`, { waitUntil: "networkidle", timeout: 60000 });
  await page.fill("input[type='email'], input[name='email']", USER.email);
  await page.fill("input[type='password'], input[name='password']", USER.password);
  await page.click("button[type='submit']");
  await page.waitForURL(/\/#\/dashboard/, { timeout: 30000 });
  await page.waitForFunction(() => !!document.getElementById("nofida-shell-root"), { timeout: 30000 });
  await page.waitForTimeout(3000);
}

async function openHub(page) {
  await openHash(page, "#/nofida/libraries");
  await page.waitForFunction(() => {
    const overlay = document.getElementById("nhb-overlay");
    const gridCount = document.querySelectorAll("#nhb-grid .nhb-card").length;
    return !!overlay && !overlay.hasAttribute("hidden") && gridCount > 0;
  }, { timeout: 60000 });
}

async function resolveLibraryTarget(page) {
  await page.waitForFunction(
    () => document.querySelectorAll("#nhb-grid .nhb-card .nhb-btn[data-act='open']").length > 0,
    { timeout: 8000 }
  ).catch(() => null);

  const openButton = page.locator("#nhb-grid .nhb-card .nhb-btn[data-act='open']").first();
  if (await openButton.count()) {
    const id = await openButton.evaluate((button) => button.closest(".nhb-card")?.getAttribute("data-id") || "");
    if (id) return { id, mode: "open" };
  }

  const addButton = page.locator("#nhb-grid .nhb-card .nhb-btn[data-act='add']").first();
  if (await addButton.count()) {
    const id = await addButton.evaluate((button) => button.closest(".nhb-card")?.getAttribute("data-id") || "");
    if (id) return { id, mode: "add" };
  }

  return null;
}

async function ensureLibraryOpenReady(page, libraryId, mode) {
  const cardSelector = `.nhb-card[data-id="${libraryId}"]`;
  if (mode === "add") {
    await page.locator(`${cardSelector} .nhb-btn[data-act='add']`).click();
    await Promise.race([
      page.waitForURL(/\/#\/workspace/, { timeout: 120000 }).catch(() => null),
      page.waitForFunction((selector) => {
        const card = document.querySelector(selector);
        return !!card && !!card.querySelector(".nhb-btn[data-act='open']");
      }, cardSelector, { timeout: 120000 }).catch(() => null),
    ]);
  }

  if (/\/#\/workspace/.test(page.url())) return;
  await page.locator(`${cardSelector} .nhb-btn[data-act='open']`).click();
  await page.waitForURL(/\/#\/workspace/, { timeout: 30000 });
  await page.waitForTimeout(6000);
}

async function verifyPageRoute(page, route, title, requireDraft = false) {
  await openHash(page, route);
  await page.waitForFunction(
    ({ expectedTitle, expectedRoute }) => {
      const overlay = document.getElementById("nfp-overlay");
      const titleNode = document.getElementById("nfp-title");
      return !!overlay &&
        !overlay.hasAttribute("hidden") &&
        !!titleNode &&
        titleNode.textContent.trim() === expectedTitle &&
        window.location.hash === expectedRoute;
    },
    { expectedTitle: title, expectedRoute: route },
    { timeout: 30000 }
  );

  const cardCount = await page.locator("#nfp-grid .nfp-card").count();
  const blocked = await visibleBlockedAnchors(page);
  const notice = await page.locator("#nfp-notice").textContent().catch(() => "");
  return {
    ok: cardCount >= 4 && cardCount <= 8 && blocked.length === 0 && (!requireDraft || String(notice || "").includes(DRAFT_NOTICE)),
    cardCount,
    blocked,
    notice,
  };
}

async function run() {
  const results = {
    dashboard: false,
    editor: false,
    hub: false,
    libraries115: false,
    libraryAddOpen: false,
    aiFab: false,
    aiSettings: false,
    internalPages: false,
    noVisiblePenpotLinks: false,
    noSupportPenpotEmail: false,
    noFatalConsoleErrors: false,
  };

  const detail = {
    libraryMode: null,
    libraryId: null,
    blockedAnchors: [],
    consoleErrors: [],
    pageErrors: [],
    runtimeExceptions: [],
    libraryCount: null,
  };

  console.log("PATCH 017B smoke starting...\n");

  const [ruResp, enResp] = await Promise.all([
    fetch(`${BASE}/js/translation.ru.js`).catch(() => null),
    fetch(`${BASE}/js/translation.en.js`).catch(() => null),
  ]);
  const translations = [];
  if (ruResp?.ok) translations.push(await ruResp.text());
  if (enResp?.ok) translations.push(await enResp.text());
  results.noSupportPenpotEmail = translations.length > 0 && translations.every((text) => !text.includes("support@penpot.app"));
  console.log(`  no support@penpot.app: ${results.noSupportPenpotEmail ? "PASS" : "FAIL"}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  const cdp = await context.newCDPSession(page);
  await cdp.send("Runtime.enable");
  cdp.on("Runtime.exceptionThrown", (event) => {
    const details = event.exceptionDetails || {};
    detail.runtimeExceptions.push({
      text: details.text || "",
      url: details.url || "",
      lineNumber: details.lineNumber ?? null,
      columnNumber: details.columnNumber ?? null,
      description: details.exception?.description || "",
    });
  });

  page.on("pageerror", (error) => {
    detail.pageErrors.push(error.message);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      detail.consoleErrors.push({
        text: msg.text(),
        location: msg.location(),
      });
    }
  });

  try {
    await login(page);
    results.dashboard =
      /\/#\/dashboard/.test(page.url()) &&
      await page.locator("#nofida-shell-root").count() > 0 &&
      await page.locator("input[type='email'], input[name='email']").count() === 0;
    console.log(`  dashboard loads: ${results.dashboard ? "PASS" : "FAIL"}`);

    const dashboardBlocked = await visibleBlockedAnchors(page);
    detail.blockedAnchors.push(...dashboardBlocked.map((item) => ({ page: "dashboard", ...item })));

    await openHub(page);
    results.hub = await page.locator("#nhb-overlay:not([hidden]) .nhb-h1").textContent().then((text) => String(text || "").includes("Библиотеки NOFIDA")).catch(() => false);

    await page.waitForFunction(() => {
      return document.querySelectorAll("#nhb-grid .nhb-card").length === 115;
    }, { timeout: 60000 });
    detail.libraryCount = await page.locator("#nhb-grid .nhb-card").count();
    results.libraries115 = detail.libraryCount === 115;
    console.log(`  NOFIDA Hub opens: ${results.hub ? "PASS" : "FAIL"}`);
    console.log(`  115 libraries render: ${results.libraries115 ? "PASS" : "FAIL"} (${detail.libraryCount})`);

    const hubBlocked = await visibleBlockedAnchors(page);
    detail.blockedAnchors.push(...hubBlocked.map((item) => ({ page: "hub", ...item })));

    const target = await resolveLibraryTarget(page);
    if (target?.id) {
      detail.libraryId = target.id;
      detail.libraryMode = target.mode;
      await ensureLibraryOpenReady(page, target.id, target.mode);
      results.libraryAddOpen = /\/#\/workspace/.test(page.url());
      results.editor = results.libraryAddOpen;
    }
    console.log(`  library add/open works: ${results.libraryAddOpen ? "PASS" : "FAIL"}${detail.libraryMode ? ` (${detail.libraryMode}:${detail.libraryId})` : ""}`);
    console.log(`  editor opens: ${results.editor ? "PASS" : "FAIL"}`);

    const workspaceBlocked = await visibleBlockedAnchors(page);
    detail.blockedAnchors.push(...workspaceBlocked.map((item) => ({ page: "workspace", ...item })));

    await clickFab(page);
    await page.waitForFunction(() => {
      const host = document.getElementById("nofida-shell-root");
      if (!host || !host.shadowRoot) return false;
      const panel = host.shadowRoot.getElementById("assistant-panel");
      return !!panel && panel.classList.contains("open");
    }, { timeout: 30000 });
    const shellState = await getShellState(page);
    results.aiFab = Boolean(shellState && shellState.panelOpen && shellState.promptExists);
    console.log(`  AI FAB opens: ${results.aiFab ? "PASS" : "FAIL"}`);

    await openHash(page, AI_SETTINGS_ROUTE);
    await page.waitForFunction(() => {
      return (window.location.hash || "") === "#/settings/options?nofida=ai&tab=api" &&
        !!document.getElementById("nofida-ai-sidebar-item") &&
        !!document.getElementById("nofida-ai-account-page-host");
    }, { timeout: 30000 });
    await page.waitForTimeout(3000);
    results.aiSettings = await page.locator("#nofida-ai-sidebar-item, #nofida-ai-account-page-host").count() > 0;
    console.log(`  AI settings page opens: ${results.aiSettings ? "PASS" : "FAIL"}`);

    const help = await verifyPageRoute(page, "#/nofida/help", "Help Center", false);
    const terms = await verifyPageRoute(page, "#/nofida/terms", "Terms of Use", true);
    const privacy = await verifyPageRoute(page, "#/nofida/privacy", "Privacy / Data", true);
    detail.blockedAnchors.push(...help.blocked.map((item) => ({ page: "help", ...item })));
    detail.blockedAnchors.push(...terms.blocked.map((item) => ({ page: "terms", ...item })));
    detail.blockedAnchors.push(...privacy.blocked.map((item) => ({ page: "privacy", ...item })));
    results.internalPages = help.ok && terms.ok && privacy.ok;
    console.log(`  Help / Terms / Privacy internal: ${results.internalPages ? "PASS" : "FAIL"}`);

    results.noVisiblePenpotLinks = detail.blockedAnchors.length === 0;
    console.log(`  no visible penpot.app user links: ${results.noVisiblePenpotLinks ? "PASS" : "FAIL"}`);
  } finally {
    await browser.close();
  }

  results.noFatalConsoleErrors =
    detail.consoleErrors.filter((item) => !isIgnoredConsoleError(item)).length === 0 &&
    detail.pageErrors.length === 0 &&
    detail.runtimeExceptions.length === 0;
  console.log(`  no fatal console errors: ${results.noFatalConsoleErrors ? "PASS" : "FAIL"}`);

  const ignoredConsoleErrors = detail.consoleErrors.filter(isIgnoredConsoleError);
  const fatalConsoleErrors = detail.consoleErrors.filter((item) => !isIgnoredConsoleError(item));
  if (ignoredConsoleErrors.length) {
    console.log(`  ignored non-fatal console noise: ${ignoredConsoleErrors.length}`);
  }

  if (!results.noFatalConsoleErrors) {
    if (fatalConsoleErrors.length) {
      console.log("  console errors:");
      fatalConsoleErrors.forEach((item) => console.log(`    - ${item.text}`));
    }
    if (detail.pageErrors.length) {
      console.log("  page errors:");
      detail.pageErrors.forEach((item) => console.log(`    - ${item}`));
    }
    if (detail.runtimeExceptions.length) {
      console.log("  runtime exceptions:");
      detail.runtimeExceptions.forEach((item) => {
        console.log(`    - ${item.description || item.text} @ ${item.url}:${item.lineNumber}:${item.columnNumber}`);
      });
    }
  }

  const finalPass = Object.values(results).every(Boolean);

  console.log("\nPATCH 017B smoke summary:");
  console.log(`  dashboard: ${results.dashboard ? "PASS" : "FAIL"}`);
  console.log(`  editor: ${results.editor ? "PASS" : "FAIL"}`);
  console.log(`  hub: ${results.hub ? "PASS" : "FAIL"}`);
  console.log(`  libraries115: ${results.libraries115 ? "PASS" : "FAIL"}`);
  console.log(`  libraryAddOpen: ${results.libraryAddOpen ? "PASS" : "FAIL"}`);
  console.log(`  aiFab: ${results.aiFab ? "PASS" : "FAIL"}`);
  console.log(`  aiSettings: ${results.aiSettings ? "PASS" : "FAIL"}`);
  console.log(`  internalPages: ${results.internalPages ? "PASS" : "FAIL"}`);
  console.log(`  noVisiblePenpotLinks: ${results.noVisiblePenpotLinks ? "PASS" : "FAIL"}`);
  console.log(`  noSupportPenpotEmail: ${results.noSupportPenpotEmail ? "PASS" : "FAIL"}`);
  console.log(`  noFatalConsoleErrors: ${results.noFatalConsoleErrors ? "PASS" : "FAIL"}`);

  if (!finalPass) {
    process.exitCode = 1;
    console.log("\nPATCH 017B smoke: FAIL");
    return;
  }

  console.log("\nPATCH 017B smoke: PASS");
}

run().catch((error) => {
  console.error("PATCH 017B smoke error:", error.message);
  process.exit(1);
});
