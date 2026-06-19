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

function toRouteUrl(hash) {
  const value = String(hash || "").trim();
  if (!value) return `${BASE}/`;
  return `${BASE}/${value.replace(/^\/+/, "")}`;
}

async function gotoHash(page, hash) {
  await page.goto(toRouteUrl(hash), { waitUntil: "commit", timeout: 60000 });
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

async function clickWithFallback(locator) {
  try {
    await locator.click({ timeout: 10000 });
    return;
  } catch (_error) {
    /* fall through */
  }

  try {
    await locator.click({ force: true, timeout: 10000 });
    return;
  } catch (_error) {
    /* fall through */
  }

  await locator.evaluate((node) => {
    node.click();
  });
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
  await clickWithFallback(libraryLink);
  await page.waitForSelector("#nhb-overlay:not([hidden]) #nhb-grid", { timeout: 60000 });
  results.dashboardKeepsSurface = await getSurface(page) === "dashboard";
  results.librariesActive = /Библиотеки/i.test(await page.locator("#nhb-nav .nhb-nav-link.active").first().textContent().catch(() => ""));
  results.singleSidebar = results.singleSidebar && await overlayNavCount(page) <= 1;
  results.dashboardNoEditorJump = !/\/#\/workspace/.test(page.url());

  await clickWithFallback(page.locator("#nhb-back"));
  await page.waitForURL(new RegExp(`/#/dashboard(?:/team/${teamId}/projects)?`), { timeout: 30000 }).catch(() => null);
  results.backToDashboard = /\/#\/dashboard/.test(page.url());

  await openHash(page, `#/dashboard/fonts?team-id=${teamId}`);
  await page.waitForSelector("#nfr-native-fonts", { timeout: 30000 });
  results.fontsActive = /Шрифты/i.test(await page.locator("#nofida-nav-dashboard-group .nofida-nav-link.active").first().textContent().catch(() => ""));
  results.fontsRecommendedVisible = /Рекомендованные/i.test(await page.locator("#nfr-native-fonts").textContent());

  await openHash(page, "#/nofida/media");
  await page.waitForSelector("#nfr-overlay:not([hidden]) #nfr-media-explorer .nfr-card", { timeout: 60000 });
  results.mediaActive = /Медиа/i.test(await page.locator("#nfr-nav .nfr-nav-link.active").first().textContent().catch(() => ""));
  results.mediaNavStable = await getSurface(page) === "dashboard";
  results.singleSidebar = results.singleSidebar && await overlayNavCount(page) <= 1;

  await openHash(page, "#/nofida/import/figma");
  await page.waitForSelector("#nfr-content .nfr-flow-card", { timeout: 60000 });
  results.figmaActive = /Импорт/i.test(await page.locator("#nfr-nav .nfr-nav-link.active").first().textContent().catch(() => ""));
  results.figmaNavStable = await getSurface(page) === "dashboard";
  results.singleSidebar = results.singleSidebar && await overlayNavCount(page) <= 1;

  await openHash(page, "#/nofida/help");
  await page.waitForSelector("#nfp-overlay:not([hidden]) #nfp-nav", { timeout: 60000 });
  const helpBreadcrumb = await page.locator("#nfp-breadcrumb").textContent();
  const helpActive = await page.locator("#nfp-nav .nfp-nav-link.active").first().textContent().catch(() => "");
  await openHash(page, "#/nofida/learn");
  await page.waitForSelector("#nfp-overlay:not([hidden]) #nfp-nav", { timeout: 60000 });
  const learnActive = await page.locator("#nfp-nav .nfp-nav-link.active").first().textContent().catch(() => "");
  results.helpLearnStayInternal = await getSurface(page) === "dashboard" &&
    /Панель/i.test(helpBreadcrumb || "") &&
    /Справка/i.test(helpActive || "") &&
    /Обучение/i.test(learnActive || "");
  results.singleSidebar = results.singleSidebar && await overlayNavCount(page) <= 1;
}

async function verifyAccount(page, results) {
  await gotoHash(page, "#/settings/options");
  const sidebarReady = await waitForSelectorEventually(page, "ul.main_ui_settings_sidebar__sidebar-nav-settings");
  if (!sidebarReady) throw new Error("account settings sidebar did not render");
  const baseSidebarCount = await page.locator("ul.main_ui_settings_sidebar__sidebar-nav-settings li").count();
  if (await page.locator("#nofida-ai-sidebar-item").count() === 0) {
    throw new Error("NOFIDA AI account sidebar item did not render");
  }

  await gotoHash(page, AI_SETTINGS_ROUTE);
  await page.waitForURL(/#\/settings\/options\?nofida=ai&tab=api/, { timeout: 30000 }).catch(() => null);
  const aiHostReady = await waitForSelectorEventually(page, "#nofida-ai-account-page-host .settings-tab");
  if (!aiHostReady) throw new Error("NOFIDA AI account tabs did not render");

  results.accountSidebarStable = await page.locator("ul.main_ui_settings_sidebar__sidebar-nav-settings li").count() >= baseSidebarCount;
  results.aiStaysInAccount = /#\/settings\/options\?nofida=ai&tab=api/.test(page.url());
  results.accountTabsRender = await page.locator("#nofida-ai-account-page-host .settings-tab").count() >= 3;
  results.resourcesMenuHiddenInAccount = await page.locator("#nofida-nav-dashboard-group").count() === 0 &&
    await page.locator("#nhb-overlay:not([hidden]) #nhb-nav, #nfr-overlay:not([hidden]) #nfr-nav, #nfp-overlay:not([hidden]) #nfp-nav").count() === 0;

  await clickWithFallback(page.locator("[data-action='close-account-ai-settings']"));
  await page.waitForURL(/#\/settings\/options$/, { timeout: 30000 }).catch(() => null);
  results.backToAccountSettings = /#\/settings\/options$/.test(page.url());
}

async function openEditorFromHub(page) {
  await gotoHash(page, "#/nofida/libraries");
  const hubReady = await waitForSelectorEventually(page, "#nhb-overlay:not([hidden]) #nhb-grid");
  if (!hubReady) return false;
  const openReady = await waitForSelectorEventually(page, "#nhb-grid .nhb-btn[data-act='open']", 30000);
  if (!openReady) return false;
  const openButton = page.locator("#nhb-grid .nhb-btn[data-act='open']").first();
  if (await openButton.count() === 0) return false;
  await clickWithFallback(openButton);
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
  const routeButton = page.locator(
    "#library-drawer [data-action='open-external'][data-href^='#/'], #library-drawer [data-action='open-external'][data-href^='/#/']"
  ).first();
  if (await routeButton.count() === 0) throw new Error("editor drawer did not expose a route-based resource action");
  const explicitText = await routeButton.textContent().catch(() => "");
  results.editorResourceLinkExplicit = /Открыть (ресурсный центр|каталог)/i.test(explicitText || "");

  await clickWithFallback(routeButton);
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
    await clickWithFallback(page.locator(backSelector));
    await page.waitForURL(/\/#\/workspace/, { timeout: 30000 }).catch(() => null);
  }
  results.backToEditor = /\/#\/workspace/.test(page.url());
}

function printLine(label, ok, detail = "") {
  console.log(`${label}: ${ok ? "PASS" : "FAIL"}${detail ? ` (${detail})` : ""}`);
}

function attachPageLogging(page, fatalConsole, ignored) {
  page.on("pageerror", (error) => fatalConsole.push(`pageerror:${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const entry = { text: message.text(), location: message.location() };
    if (ignoredConsole(entry)) ignored.push(entry);
    else fatalConsole.push(`console:${entry.text}`);
  });
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ ignoreHTTPSErrors: true });
const fatalConsole = [];
const ignored = [];
const results = { singleSidebar: true };
const trackedPages = [];
const verificationNotes = [];

async function createTrackedPage() {
  const page = await context.newPage();
  attachPageLogging(page, fatalConsole, ignored);
  trackedPages.push(page);
  return page;
}

try {
  console.log("PATCH 019A verify starting...");
  const dashboardPage = await createTrackedPage();
  await login(dashboardPage);

  results.sharedNavigationContract = await dashboardPage.evaluate(() => {
    return !!window.NofidaNavigation &&
      typeof window.NofidaNavigation.getCurrentSurface === "function" &&
      typeof window.NofidaNavigation.isDashboardSurface === "function" &&
      typeof window.NofidaNavigation.isAccountSurface === "function" &&
      typeof window.NofidaNavigation.isEditorSurface === "function" &&
      typeof window.NofidaNavigation.isResourceRoute === "function" &&
      typeof window.NofidaNavigation.getSafeBackTarget === "function" &&
      typeof window.NofidaNavigation.goToNofidaRoute === "function";
  });
  results.surfacesDefined = await dashboardPage.evaluate(() => {
    if (!window.NofidaNavigation) return false;
    return window.NofidaNavigation.isDashboardSurface("#/nofida/libraries") &&
      window.NofidaNavigation.isAccountSurface("#/settings/options?nofida=ai&tab=api") &&
      window.NofidaNavigation.isEditorSurface("#/workspace?file-id=test");
  });

  try {
    const teamId = await resolveTeamId(dashboardPage);
    await verifyDashboardAndResources(dashboardPage, teamId, results);
  } catch (error) {
    verificationNotes.push(`dashboard/resource: ${error && error.message ? error.message : String(error)}`);
  }

  try {
    const accountPage = await createTrackedPage();
    await verifyAccount(accountPage, results);
  } catch (error) {
    verificationNotes.push(`account: ${error && error.message ? error.message : String(error)}`);
  }

  try {
    const editorPage = await createTrackedPage();
    await verifyEditor(editorPage, results);
  } catch (error) {
    verificationNotes.push(`editor: ${error && error.message ? error.message : String(error)}`);
  }

  const blocked = [];
  for (const page of trackedPages) {
    try {
      blocked.push(...await visibleBlockedAnchors(page));
    } catch (_error) {
      /* ignore closed/transitioning pages */
    }
  }
  results.noVisiblePenpotLinks = blocked.length === 0;
  results.noFatalConsoleErrors = fatalConsole.length === 0;

  console.log("");
  console.log("PATCH 019A completed.");
  if (verificationNotes.length) {
    console.log(`verification note: FAIL (${verificationNotes.join(" | ")})`);
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
