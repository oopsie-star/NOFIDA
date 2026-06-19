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

async function waitForSelectorEventually(page, selector, totalMs = 90000) {
  const started = Date.now();
  while (Date.now() - started < totalMs) {
    try {
      await page.waitForSelector(selector, { timeout: 10000 });
      return true;
    } catch (_error) {
      await page.waitForTimeout(2000);
    }
  }
  return false;
}

async function login(page) {
  await page.goto(`${BASE}/#/auth/login`, { waitUntil: "commit", timeout: 45000 });
  const ready = await waitForSelectorEventually(page, "input[type='email'], input[name='email']");
  if (!ready) throw new Error("Login form did not render in time");
  await page.fill("input[type='email'], input[name='email']", USER.email);
  await page.fill("input[type='password'], input[name='password']", USER.password);
  await page.click("button[type='submit']");
  await page.waitForURL(/\/#\/dashboard/, { timeout: 60000 });
  await page.waitForTimeout(15000);
}

async function resolveTeamId(page) {
  const fromUrl = page.url().match(/\/#\/dashboard\/team\/([0-9a-f-]{36})/i)?.[1];
  if (fromUrl) return fromUrl;
  const fromDom = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll("a[href]"));
    const match = links
      .map((node) => (node.getAttribute("href") || "").match(/dashboard\/team\/([0-9a-f-]{36})/i))
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
  const fromNav = await page.evaluate(() => {
    return window.NofidaNavigation && window.NofidaNavigation.getState
      ? window.NofidaNavigation.getState().lastTeamId || ""
      : "";
  });
  if (fromNav) return fromNav;
  throw new Error("Could not resolve team id");
}

async function getSurface(page) {
  return page.evaluate(() => {
    return window.NofidaNavigation && window.NofidaNavigation.getCurrentSurface
      ? window.NofidaNavigation.getCurrentSurface(window.location.hash || "")
      : "";
  });
}

async function overlayNavCount(page) {
  return page.evaluate(() => {
    const overlays = [
      { root: "#nhb-overlay", nav: ".nhb-nav-panel" },
      { root: "#nfr-overlay", nav: ".nfr-nav-panel" },
      { root: "#nfp-overlay", nav: ".nfp-nav-panel" }
    ];
    return overlays.reduce((count, item) => {
      const root = document.querySelector(item.root);
      if (!root || root.hasAttribute("hidden")) return count;
      return count + (root.querySelector(item.nav) ? 1 : 0);
    }, 0);
  });
}

async function visibleBlockedAnchors(page) {
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

async function verifyDashboardAndResources(page, teamId, results) {
  const dashboardRoute = `#/dashboard/team/${teamId}/projects`;
  await openHash(page, dashboardRoute);
  await page.waitForSelector("#nofida-nav-dashboard-group", { timeout: 30000 });
  results.resourceNavStable = await page.locator("#nofida-nav-dashboard-group a").count() >= 7;

  const libraryLink = page.locator("#nofida-nav-dashboard-group a").filter({ hasText: "Библиотеки" }).first();
  await libraryLink.click();
  await page.waitForSelector("#nhb-overlay:not([hidden]) #nhb-grid", { timeout: 60000 });
  results.dashboardKeepsSurface = await getSurface(page) === "dashboard";
  results.librariesActive = /Библиотеки/i.test(await page.locator("#nhb-nav .nhb-nav-link.active").first().textContent().catch(() => ""));
  results.singleSidebar = results.singleSidebar && await overlayNavCount(page) <= 1;
  results.dashboardNoEditorJump = !/\/#\/workspace/.test(page.url());

  await page.locator("#nhb-back").click();
  await page.waitForURL(new RegExp(`/#/dashboard(?:/team/${teamId}/projects)?`), { timeout: 30000 }).catch(() => null);
  results.backToDashboard = /\/#\/dashboard/.test(page.url());

  const fontsLink = page.locator("#nofida-nav-dashboard-group a").filter({ hasText: "Шрифты" }).first();
  await fontsLink.click();
  await page.waitForSelector("#nfr-native-fonts", { timeout: 30000 });
  results.fontsActive = /Шрифты/i.test(await page.locator("#nofida-nav-dashboard-group .nofida-nav-link.active").first().textContent().catch(() => ""));
  results.fontsRecommendedVisible = /Рекомендованные/i.test(await page.locator("#nfr-native-fonts").textContent());

  const mediaLink = page.locator("#nofida-nav-dashboard-group a").filter({ hasText: "Медиа" }).first();
  await mediaLink.click();
  await page.waitForSelector("#nfr-overlay:not([hidden]) #nfr-media-explorer .nfr-card", { timeout: 60000 });
  results.mediaActive = /Медиа/i.test(await page.locator("#nfr-nav .nfr-nav-link.active").first().textContent().catch(() => ""));
  results.mediaNavStable = await getSurface(page) === "dashboard";
  results.singleSidebar = results.singleSidebar && await overlayNavCount(page) <= 1;

  const figmaLink = page.locator("#nfr-nav .nfr-nav-link").filter({ hasText: "Импорт из Figma" }).first();
  await figmaLink.click();
  await page.waitForSelector("#nfr-content .nfr-flow-card", { timeout: 60000 });
  results.figmaActive = /Импорт/i.test(await page.locator("#nfr-nav .nfr-nav-link.active").first().textContent().catch(() => ""));
  results.figmaNavStable = await getSurface(page) === "dashboard";
  results.singleSidebar = results.singleSidebar && await overlayNavCount(page) <= 1;

  await openHash(page, "#/nofida/help");
  await page.waitForSelector("#nfp-overlay:not([hidden]) #nfp-nav", { timeout: 60000 });
  const helpBreadcrumb = await page.locator("#nfp-breadcrumb").textContent();
  const helpActive = await page.locator("#nfp-nav .nfp-nav-link.active").first().textContent().catch(() => "");
  await page.locator("#nfp-nav .nfp-nav-link").filter({ hasText: "Обучение" }).first().click();
  await page.waitForTimeout(1200);
  const learnActive = await page.locator("#nfp-nav .nfp-nav-link.active").first().textContent().catch(() => "");
  results.helpLearnStayInternal = await getSurface(page) === "dashboard" &&
    /Панель/i.test(helpBreadcrumb || "") &&
    /Справка/i.test(helpActive || "") &&
    /Обучение/i.test(learnActive || "");
  results.singleSidebar = results.singleSidebar && await overlayNavCount(page) <= 1;
}

async function verifyAccount(page, results) {
  await openHash(page, "#/settings/options");
  await page.waitForSelector("ul.main_ui_settings_sidebar__sidebar-nav-settings", { timeout: 30000 });
  const baseSidebarCount = await page.locator("ul.main_ui_settings_sidebar__sidebar-nav-settings li").count();

  await page.locator("#nofida-ai-sidebar-item").click();
  await page.waitForURL(/#\/settings\/options\?nofida=ai&tab=api/, { timeout: 30000 });
  await page.waitForSelector("#nofida-ai-account-page-host .settings-tab", { timeout: 30000 });

  results.accountSidebarStable = await page.locator("ul.main_ui_settings_sidebar__sidebar-nav-settings li").count() >= baseSidebarCount;
  results.aiStaysInAccount = /#\/settings\/options\?nofida=ai&tab=api/.test(page.url());
  results.accountTabsRender = await page.locator("#nofida-ai-account-page-host .settings-tab").count() >= 3;
  results.resourcesMenuHiddenInAccount = await page.locator("#nofida-nav-dashboard-group").count() === 0 &&
    await page.locator("#nhb-nav, #nfr-nav, #nfp-nav").count() === 0;

  await page.locator("[data-action='close-account-ai-settings']").click();
  await page.waitForURL(/#\/settings\/options$/, { timeout: 30000 }).catch(() => null);
  results.backToAccountSettings = /#\/settings\/options$/.test(page.url());
}

async function openEditorFromHub(page) {
  await openHash(page, "#/nofida/libraries");
  await page.waitForSelector("#nhb-overlay:not([hidden]) #nhb-grid", { timeout: 60000 });
  const openButton = page.locator("#nhb-grid .nhb-btn[data-act='open']").first();
  if (await openButton.count() === 0) return false;
  await openButton.click();
  await page.waitForURL(/\/#\/workspace/, { timeout: 30000 });
  await page.waitForTimeout(4000);
  return true;
}

async function verifyEditor(page, results) {
  const opened = await openEditorFromHub(page);
  results.editorOpened = opened;
  if (!opened) {
    results.editorAiStaysInEditor = false;
    results.editorResourceLinkExplicit = false;
    results.backToEditor = false;
    results.noAccidentalDashboardJump = false;
    return;
  }

  await page.evaluate(() => {
    window.NofidaAICore && window.NofidaAICore.open();
  });
  await page.waitForSelector("#assistant-panel.open", { timeout: 30000 });
  results.editorAiStaysInEditor = /\/#\/workspace/.test(page.url()) && await getSurface(page) === "editor";

  await page.evaluate(() => {
    window.NofidaAICore && window.NofidaAICore.openLibraries();
  });
  await page.waitForSelector("#library-drawer.open", { timeout: 30000 });
  const explicitText = await page.locator("#library-drawer [data-action='open-external']").first().textContent().catch(() => "");
  results.editorResourceLinkExplicit = /Открыть ресурсный центр/i.test(explicitText || "");

  await page.locator("#library-drawer [data-action='open-external']").first().click();
  await page.waitForURL(/#\/nofida\//, { timeout: 30000 });
  await page.waitForTimeout(1500);

  const backSelectors = ["#nhb-back", "#nfr-back", "#nfp-back"];
  let backSelector = "";
  for (const selector of backSelectors) {
    if (await page.locator(selector).count()) {
      backSelector = selector;
      break;
    }
  }
  const backText = backSelector ? await page.locator(backSelector).textContent() : "";
  results.editorBackLabel = /Назад в редактор/i.test(backText || "");
  results.noAccidentalDashboardJump = await getSurface(page) === "dashboard" && !/\/#\/dashboard/.test(page.url());
  results.singleSidebar = results.singleSidebar && await overlayNavCount(page) <= 1;

  if (backSelector) {
    await page.locator(backSelector).click();
    await page.waitForURL(/\/#\/workspace/, { timeout: 30000 }).catch(() => null);
  }
  results.backToEditor = /\/#\/workspace/.test(page.url());
}

function printLine(label, ok, detail = "") {
  console.log(`${label}: ${ok ? "PASS" : "FAIL"}${detail ? ` (${detail})` : ""}`);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await context.newPage();
const fatalConsole = [];
const ignored = [];
const results = { singleSidebar: true };
let verificationError = "";

page.on("pageerror", (error) => fatalConsole.push(`pageerror:${error.message}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const entry = { text: message.text(), location: message.location() };
  if (ignoredConsole(entry)) ignored.push(entry);
  else fatalConsole.push(`console:${entry.text}`);
});

try {
  console.log("PATCH 019A verify starting...");
  await login(page);
  try {
    const teamId = await resolveTeamId(page);

    results.sharedNavigationContract = await page.evaluate(() => {
      return !!window.NofidaNavigation &&
        typeof window.NofidaNavigation.getCurrentSurface === "function" &&
        typeof window.NofidaNavigation.isDashboardSurface === "function" &&
        typeof window.NofidaNavigation.isAccountSurface === "function" &&
        typeof window.NofidaNavigation.isEditorSurface === "function" &&
        typeof window.NofidaNavigation.isResourceRoute === "function" &&
        typeof window.NofidaNavigation.getSafeBackTarget === "function" &&
        typeof window.NofidaNavigation.goToNofidaRoute === "function";
    });
    results.surfacesDefined = await page.evaluate(() => {
      if (!window.NofidaNavigation) return false;
      return window.NofidaNavigation.isDashboardSurface("#/nofida/libraries") &&
        window.NofidaNavigation.isAccountSurface("#/settings/options?nofida=ai&tab=api") &&
        window.NofidaNavigation.isEditorSurface("#/workspace?file-id=test");
    });

    await verifyDashboardAndResources(page, teamId, results);
    await verifyAccount(page, results);
    await verifyEditor(page, results);
  } catch (error) {
    verificationError = error && error.message ? error.message : String(error);
  }

  const blocked = await visibleBlockedAnchors(page);
  results.noVisiblePenpotLinks = blocked.length === 0;
  results.noFatalConsoleErrors = fatalConsole.length === 0;

  console.log("");
  console.log("PATCH 019A completed.");
  if (verificationError) {
    console.log(`verification note: FAIL (${verificationError})`);
  }
  console.log("");
  console.log("Navigation architecture:");
  printLine("shared navigation contract created", results.sharedNavigationContract);
  printLine("surfaces defined", results.surfacesDefined);

  console.log("");
  console.log("Dashboard/resource surface:");
  printLine("resource nav stable", results.resourceNavStable && results.mediaNavStable && results.figmaNavStable);
  printLine("Libraries active state works", results.librariesActive);
  printLine("Fonts active state works", results.fontsActive);
  printLine("Media active state works", results.mediaActive);
  printLine("Figma Import active state works", results.figmaActive);
  printLine("Help/Learn stay internal", results.helpLearnStayInternal);
  printLine("back to dashboard works", results.backToDashboard);

  console.log("");
  console.log("Account surface:");
  printLine("account sidebar stable", results.accountSidebarStable);
  printLine("NOFIDA AI stays in account settings", results.aiStaysInAccount && results.accountTabsRender);
  printLine("back to account settings works", results.backToAccountSettings);
  printLine("resources menu not shown in account settings", results.resourcesMenuHiddenInAccount);

  console.log("");
  console.log("Editor surface:");
  printLine("editor AI stays in editor", results.editorAiStaysInEditor);
  printLine("resource opening from editor is explicit", results.editorResourceLinkExplicit && results.editorBackLabel);
  printLine("back to editor works", results.backToEditor);
  printLine("no accidental dashboard jump", results.noAccidentalDashboardJump);

  console.log("");
  console.log("Overlay cleanup:");
  printLine("confusing full-screen overlays reduced or standardized", results.singleSidebar);
  printLine("breadcrumbs/back labels added", results.backToDashboard && results.editorBackLabel && results.backToAccountSettings);

  console.log("");
  console.log("Branding:");
  printLine("no visible Penpot links", results.noVisiblePenpotLinks);
  printLine("no fatal console errors", results.noFatalConsoleErrors, fatalConsole.join(" | "));
  console.log(`ignored non-fatal console noise: ${ignored.length}`);
} finally {
  await context.close();
  await browser.close();
}
