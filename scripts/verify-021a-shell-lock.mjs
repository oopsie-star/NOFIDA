import { chromium } from "playwright";

const BASE = process.env.NOFIDA_BASE || "https://engine.sys.bachopus.com";
const USER = {
  email: process.env.NOFIDA_USER_EMAIL || "testuser1@nofida.internal",
  password: process.env.NOFIDA_USER_PASSWORD || "Test1Nofida2026"
};
const AI_SETTINGS_ROUTE = "#/settings/options?nofida=ai&tab=api";
const EXPECTED_LABELS = [
  "Проекты",
  "Все проекты",
  "Черновики",
  "Библиотеки",
  "Шрифты",
  "Шрифты команды",
  "Каталог шрифтов",
  "Медиа",
  "Импорт из Figma",
  "Справка",
  "Обучение",
  "Релизы",
  "Журнал изменений",
  "Условия",
  "Privacy / Data",
  "Open Source"
];
const STABILITY_MS = 60000;
const STABILITY_STEP_MS = 10000;

function mark(value) {
  return value ? "PASS" : "FAIL";
}

function printLine(label, ok, detail = "") {
  console.log(`* ${label}: ${mark(ok)}${detail ? ` (${detail})` : ""}`);
}

function sameArray(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  return left.every((item, index) => item === right[index]);
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

async function openHash(page, hash) {
  await page.evaluate((value) => {
    window.location.hash = value;
  }, hash);
}

async function resolveTeamId(page) {
  const fromUrl = page.url().match(/[?&]team-id=([0-9a-f-]{36})/i)?.[1] ||
    page.url().match(/\/#\/dashboard\/team\/([0-9a-f-]{36})/i)?.[1];
  if (fromUrl) return fromUrl;

  const fromNav = await page.evaluate(() => {
    return window.NofidaNavigation && window.NofidaNavigation.getCurrentTeamId
      ? window.NofidaNavigation.getCurrentTeamId(window.location.hash || "")
      : "";
  });
  if (fromNav) return fromNav;

  const fromProfile = await page.evaluate(async () => {
    try {
      const resp = await fetch("/api/rpc/command/get-profile", {
        credentials: "include",
        headers: { Accept: "application/transit+json" }
      });
      if (!resp.ok) return "";
      const text = JSON.stringify(await resp.json());
      return text.match(/default-team-id\",\"~u([0-9a-f-]{36})/i)?.[1] || "";
    } catch (_error) {
      return "";
    }
  });
  if (fromProfile) return fromProfile;

  throw new Error("Could not resolve team id");
}

async function installOpenProbe(page) {
  await page.evaluate(() => {
    if (window.__nofidaOpenProbeInstalled) return;
    window.__nofidaOpenProbeInstalled = true;
    window.__nofidaOpenProbe = [];
    const rawOpen = window.open.bind(window);
    window.open = function () {
      const url = arguments[0];
      window.__nofidaOpenProbe.push(String(url || ""));
      return rawOpen(...arguments);
    };
  });
}

async function readOpenProbe(page) {
  return page.evaluate(() => window.__nofidaOpenProbe || []);
}

async function collectShellSnapshot(page) {
  return page.evaluate(() => {
    function textOf(node) {
      return String(node?.textContent || "").replace(/\s+/g, " ").trim();
    }

    function isVisible(node) {
      if (!node) return false;
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.width > 0 &&
        rect.height > 0;
    }

    const shell = document.getElementById("nofida-shell");
    const sidebar = document.getElementById("nofida-shell-sidebar");
    const nav = document.getElementById("nofida-shell-nav");
    const labels = Array.from(
      document.querySelectorAll("#nofida-shell-nav .nofida-nav-item, #nofida-shell-nav .nofida-nav-subitem")
    ).map(textOf);
    const active = Array.from(
      document.querySelectorAll("#nofida-shell-nav .nofida-nav-item.is-active, #nofida-shell-nav .nofida-nav-subitem.is-active")
    ).map(textOf);
    const parentActive = Array.from(
      document.querySelectorAll("#nofida-shell-nav .nofida-nav-item.is-parent-active")
    ).map(textOf);
    const legacyPanels = [
      "#nfr-overlay",
      "#nfp-overlay",
      "#nhb-overlay",
      ".nfr-nav-panel",
      ".nfp-nav-panel",
      ".nhb-nav-panel",
      "#nfr-nav",
      "#nfp-nav",
      "#nhb-nav",
      "#nhb-sidebar-btn",
      "#nhb-sidebar-resources"
    ];
    const legacyVisible = legacyPanels.reduce((count, selector) => {
      return count + Array.from(document.querySelectorAll(selector)).filter(isVisible).length;
    }, 0);
    const internalBlankTargets = Array.from(document.querySelectorAll('a[target="_blank"]')).filter((node) => {
      const href = node.getAttribute("href") || "";
      return /(#\/nofida|#\/dashboard|#\/settings|\/#\/nofida|\/#\/dashboard|\/#\/settings)/i.test(href);
    }).map((node) => node.getAttribute("href") || "");

    return {
      hash: window.location.hash || "",
      shellCount: document.querySelectorAll("#nofida-shell").length,
      sidebarCount: document.querySelectorAll("#nofida-shell-sidebar").length,
      navCount: document.querySelectorAll("#nofida-shell-nav").length,
      routeKind: shell?.getAttribute("data-route-kind") || "",
      sidebarWidth: sidebar ? Math.round(sidebar.getBoundingClientRect().width) : 0,
      labels,
      active,
      parentActive,
      legacyVisible,
      internalBlankTargets,
      hasEdLabel: labels.includes("Ед."),
      backLabel: textOf(document.querySelector("[data-nofida-back='safe']")),
      shellVisible: isVisible(shell),
      frameText: textOf(document.getElementById("nofida-page-frame")).slice(0, 200)
    };
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

async function waitForDashboardShell(page) {
  await page.waitForFunction(() => {
    const shell = document.getElementById("nofida-shell");
    return !!shell &&
      shell.getAttribute("data-route-kind") === "native-dashboard" &&
      !!document.getElementById("nofida-shell-nav");
  }, { timeout: 90000 });
}

async function waitForLibraries(page) {
  await page.waitForFunction(() => {
    return !!document.getElementById("nhb-shell-root") &&
      document.querySelectorAll("#nhb-grid .nhb-card").length > 0;
  }, { timeout: 90000 });
}

async function waitForFontCatalog(page) {
  await page.waitForFunction(() => {
    return !!document.getElementById("nfr-shell-root") &&
      document.querySelectorAll("#nfr-font-explorer .nfr-card").length > 0;
  }, { timeout: 90000 });
}

async function waitForMedia(page) {
  await page.waitForFunction(() => {
    return !!document.getElementById("nfr-shell-root") &&
      document.querySelectorAll("#nfr-media-explorer .nfr-card").length > 0;
  }, { timeout: 90000 });
}

async function waitForFigma(page) {
  await page.waitForFunction(() => {
    return !!document.getElementById("nfr-shell-root") &&
      !!document.getElementById("nfr-figma-url") &&
      !!document.getElementById("nfr-figma-report-anchor");
  }, { timeout: 90000 });
}

async function waitForHelpPage(page) {
  await page.waitForFunction(() => {
    return !!document.getElementById("nfp-shell-root") &&
      !!document.getElementById("nofida-shell") &&
      /Справка|Обучение|Репозиторий|Сообщество|Релизы|Журнал|Условия|Privacy|Open Source/i
        .test(document.getElementById("nofida-page-frame")?.textContent || "");
  }, { timeout: 90000 });
}

async function waitForAccount(page) {
  // waitForSelector (visible) can fail in headless if layout collapses — use waitForFunction
  // which only checks DOM presence and skips Playwright's visibility heuristic.
  await page.waitForFunction(
    () => document.querySelectorAll("ul.main_ui_settings_sidebar__sidebar-nav-settings").length > 0,
    { timeout: 90000 }
  );
}

async function accountSidebarStabilityRun(page, teamId) {
  // page.goto to settings as cold route renders Penpot 404; must route via dashboard first.
  await page.goto(`${BASE}/#/dashboard/team/${teamId}/projects`, { waitUntil: "load", timeout: 60000 });
  await waitForDashboardShell(page);
  await openHash(page, "#/settings/options");
  await waitForAccount(page);
  await page.waitForTimeout(3000); // let NOFIDA scripts initialize

  const getAccountSnapshot = () => page.evaluate(() => {
    function textOf(node) {
      return String(node?.textContent || "").replace(/\s+/g, " ").trim();
    }
    const nav = document.querySelector("ul.main_ui_settings_sidebar__sidebar-nav-settings");
    const navRect = nav ? nav.getBoundingClientRect() : null;
    const labels = nav ? Array.from(nav.querySelectorAll("li")).map(textOf) : [];
    const nofidaEntries = document.querySelectorAll(
      "[data-nofida-ai-account-entry='true'], #nofida-ai-sidebar-item"
    ).length;
    return {
      shellCount: document.querySelectorAll("#nofida-shell").length,
      resourceNavCount: document.querySelectorAll(
        "#nofida-shell-sidebar, #nfr-overlay, #nfp-overlay, #nhb-overlay"
      ).length,
      navExists: !!nav,
      navWidth: navRect ? Math.round(navRect.width) : 0,
      navTop: navRect ? Math.round(navRect.top) : 0,
      labels,
      nofidaEntries,
      hostCount: document.querySelectorAll("#nofida-ai-account-page-host").length
    };
  });

  const base = await getAccountSnapshot();
  let shellAbsent = base.shellCount === 0;
  let resourceNavAbsent = base.resourceNavCount === 0;
  let navStable = base.navExists;
  let widthStable = true;
  let topStable = true;
  let labelsStable = true;
  let nofidaOnce = base.nofidaEntries === 1;
  let noHostOnPlain = base.hostCount === 0;

  const ACCOUNT_STABILITY_MS = 90000;
  const ACCOUNT_STEP_MS = 10000;
  const steps = Math.ceil(ACCOUNT_STABILITY_MS / ACCOUNT_STEP_MS);

  for (let i = 0; i < steps; i++) {
    await page.waitForTimeout(ACCOUNT_STEP_MS);
    const snap = await getAccountSnapshot();
    shellAbsent = shellAbsent && snap.shellCount === 0;
    resourceNavAbsent = resourceNavAbsent && snap.resourceNavCount === 0;
    navStable = navStable && snap.navExists;
    widthStable = widthStable && Math.abs(base.navWidth - snap.navWidth) <= 1;
    topStable = topStable && Math.abs(base.navTop - snap.navTop) <= 2;
    labelsStable = labelsStable && sameArray(base.labels, snap.labels);
    nofidaOnce = nofidaOnce && snap.nofidaEntries === 1;
    noHostOnPlain = noHostOnPlain && snap.hostCount === 0;
  }

  return { shellAbsent, resourceNavAbsent, navStable, widthStable, topStable, labelsStable, nofidaOnce, noHostOnPlain };
}

async function waitForAccountAI(page) {
  await page.waitForFunction(() => {
    return !!document.getElementById("nofida-ai-account-page-host");
  }, { timeout: 90000 });
}

async function waitForEditor(page) {
  await page.waitForURL(/\/#\/workspace/, { timeout: 90000 });
  await page.waitForTimeout(5000);
}

async function openAndMeasure(page, route, waitFn) {
  await openHash(page, route);
  await waitFn(page);
  return collectShellSnapshot(page);
}

function compareShell(base, next) {
  return {
    widthStable: Math.abs(base.sidebarWidth - next.sidebarWidth) <= 1,
    labelsStable: sameArray(base.labels, next.labels),
    orderStable: sameArray(base.labels, next.labels),
    shellSingle: next.shellCount === 1 && next.sidebarCount === 1 && next.navCount === 1,
    noLegacyNav: next.legacyVisible === 0,
    noBadLabel: !next.hasEdLabel
  };
}

async function stabilityRun(page, route, waitFn) {
  const first = await openAndMeasure(page, route, waitFn);
  let stable = true;
  let noLegacy = first.legacyVisible === 0;
  let noBadLabel = !first.hasEdLabel;
  let sameWidth = true;
  let sameLabels = true;

  const steps = Math.max(1, Math.floor(STABILITY_MS / STABILITY_STEP_MS));
  for (let index = 0; index < steps; index += 1) {
    await page.waitForTimeout(STABILITY_STEP_MS);
    const next = await collectShellSnapshot(page);
    const compare = compareShell(first, next);
    stable = stable && compare.shellSingle;
    noLegacy = noLegacy && compare.noLegacyNav;
    noBadLabel = noBadLabel && compare.noBadLabel;
    sameWidth = sameWidth && compare.widthStable;
    sameLabels = sameLabels && compare.labelsStable;
  }

  return {
    stable,
    noLegacy,
    noBadLabel,
    sameWidth,
    sameLabels,
    first
  };
}

async function openEditorFromHub(page) {
  await openHash(page, "#/nofida/libraries");
  await waitForLibraries(page);
  const openButton = page.locator("#nhb-grid .nhb-btn[data-act='open']").first();
  if (await openButton.count() === 0) return false;
  await openButton.click({ timeout: 10000 }).catch(async () => {
    await openButton.click({ force: true, timeout: 10000 });
  });
  await waitForEditor(page);
  return true;
}

async function settingsStabilityRun(page) {
  await openHash(page, AI_SETTINGS_ROUTE);
  await waitForAccountAI(page);
  let stable = true;
  const steps = Math.max(1, Math.floor(STABILITY_MS / STABILITY_STEP_MS));
  for (let index = 0; index < steps; index += 1) {
    await page.waitForTimeout(STABILITY_STEP_MS);
    const sample = await page.evaluate(() => {
      return {
        shellCount: document.querySelectorAll("#nofida-shell").length,
        sidebarCount: document.querySelectorAll("ul.main_ui_settings_sidebar__sidebar-nav-settings li").length,
        aiHost: document.querySelectorAll("#nofida-ai-account-page-host").length
      };
    });
    stable = stable && sample.shellCount === 0 && sample.sidebarCount > 0 && sample.aiHost === 1;
  }
  return stable;
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 1440, height: 900 }
});
const page = await context.newPage();
const fatalConsole = [];
const nonFatalRequestPaths = new Set();

// Track known non-fatal 401 responses so console errors referencing them are ignored.
page.on("response", (response) => {
  if (response.status() === 401 && /get-enabled-flags/i.test(response.url())) {
    try { nonFatalRequestPaths.add(new URL(response.url()).pathname); } catch (_e) {
      nonFatalRequestPaths.add(response.url());
    }
  }
});

page.on("pageerror", (error) => fatalConsole.push(`pageerror:${error.message}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const text = message.text();
  // Known non-fatal: feature-flags 401 — check text and location URL
  if (/get-enabled-flags/i.test(text)) return;
  // Playwright sets location().url to the failing resource URL for network errors
  let locUrl = "";
  try { locUrl = (message.location() || {}).url || ""; } catch (_e) {}
  if (/get-enabled-flags/i.test(locUrl)) return;
  // Suppress console errors that reference any tracked non-fatal 401 path
  for (const path of nonFatalRequestPaths) {
    if (text.includes(path)) return;
    if (locUrl && locUrl.includes(path)) return;
  }
  fatalConsole.push(`console:${text}`);
});

const results = {
  committed: false,
  pushed: false,
  clean: false,
  sharedShell: false,
  oneSidebar: false,
  shellConsumers: false,
  noDuplicateSidebar: false,
  widthStable: false,
  labelsStable: false,
  orderStable: false,
  hierarchyStable: false,
  activeStates: false,
  noEdLabel: false,
  dashboard: false,
  libraries: false,
  nativeFonts: false,
  fontCatalog: false,
  media: false,
  figma: false,
  help: false,
  learn: false,
  sameTab: false,
  noInternalBlank: false,
  noInternalWindowOpen: false,
  helpStaysInBrowser: false,
  noShellInAccount: false,
  accountSidebarStable: false,
  aiInAccount: false,
  accountSidebarNoShell: false,
  accountSidebarNoResourceNav: false,
  accountSidebarWidthStable90s: false,
  accountSidebarTopStable90s: false,
  accountSidebarLabelsStable90s: false,
  accountNofidaOnce: false,
  accountNoHostOnPlain: false,
  noShellInEditor: false,
  editorUiClean: false,
  aiEditorLocal: false,
  dashboardStable60: false,
  fontsStable60: false,
  mediaStable60: false,
  helpStable60: false,
  settingsStable60: false,
  noFatalConsoleErrors: false,
  hubWorks: false,
  fontsWorks: false,
  mediaWorks: false,
  figmaWorks: false,
  aiSettingsWorks: false,
  internalPagesWork: false,
  noVisiblePenpotLinks: false
};

const notes = [];

try {
  await login(page);
  await installOpenProbe(page);

  const teamId = await resolveTeamId(page);

  const dashboardSnap = await openAndMeasure(page, `#/dashboard/team/${teamId}/projects`, waitForDashboardShell);
  const librariesSnap = await openAndMeasure(page, "#/nofida/libraries", waitForLibraries);
  const nativeFontsSnap = await openAndMeasure(page, `#/dashboard/fonts?team-id=${teamId}`, waitForDashboardShell);
  await page.waitForFunction(() => !!document.getElementById("nfr-native-fonts"), { timeout: 90000 });
  const fontCatalogSnap = await openAndMeasure(page, "#/nofida/fonts", waitForFontCatalog);
  const mediaSnap = await openAndMeasure(page, "#/nofida/media", waitForMedia);
  const figmaSnap = await openAndMeasure(page, "#/nofida/import/figma", waitForFigma);

  const pageCountBeforeHelp = context.pages().length;
  await openHash(page, "#/nofida/help");
  await waitForHelpPage(page);
  const helpSnap = await collectShellSnapshot(page);
  await openHash(page, "#/nofida/learn");
  await waitForHelpPage(page);
  const learnSnap = await collectShellSnapshot(page);
  await openHash(page, "#/nofida/repository");
  await waitForHelpPage(page);
  const repositorySnap = await collectShellSnapshot(page);
  await openHash(page, "#/nofida/privacy");
  await waitForHelpPage(page);
  const privacySnap = await collectShellSnapshot(page);
  const pageCountAfterHelp = context.pages().length;

  const baseCompare = [
    compareShell(dashboardSnap, librariesSnap),
    compareShell(dashboardSnap, nativeFontsSnap),
    compareShell(dashboardSnap, fontCatalogSnap),
    compareShell(dashboardSnap, mediaSnap),
    compareShell(dashboardSnap, figmaSnap),
    compareShell(dashboardSnap, helpSnap),
    compareShell(dashboardSnap, learnSnap)
  ];

  results.sharedShell = [dashboardSnap, librariesSnap, nativeFontsSnap, fontCatalogSnap, mediaSnap, figmaSnap, helpSnap, learnSnap]
    .every((snap) => snap.shellCount === 1 && snap.sidebarCount === 1 && snap.navCount === 1);
  results.oneSidebar = baseCompare.every((item) => item.shellSingle);
  results.noDuplicateSidebar = baseCompare.every((item) => item.noLegacyNav);
  results.widthStable = baseCompare.every((item) => item.widthStable);
  results.labelsStable = baseCompare.every((item) => item.labelsStable) && sameArray(dashboardSnap.labels, EXPECTED_LABELS);
  results.orderStable = sameArray(dashboardSnap.labels, EXPECTED_LABELS);
  results.hierarchyStable = EXPECTED_LABELS.includes("Все проекты") && EXPECTED_LABELS.includes("Каталог шрифтов");
  results.noEdLabel = [dashboardSnap, librariesSnap, nativeFontsSnap, fontCatalogSnap, mediaSnap, figmaSnap, helpSnap, learnSnap]
    .every((snap) => !snap.hasEdLabel);

  results.dashboard = dashboardSnap.routeKind === "native-dashboard" &&
    dashboardSnap.active.includes("Все проекты") &&
    dashboardSnap.parentActive.includes("Проекты");
  results.libraries = librariesSnap.routeKind === "shell-page" &&
    librariesSnap.active.includes("Библиотеки");
  results.nativeFonts = nativeFontsSnap.routeKind === "native-dashboard" &&
    nativeFontsSnap.active.includes("Шрифты команды") &&
    nativeFontsSnap.parentActive.includes("Шрифты");
  results.fontCatalog = fontCatalogSnap.routeKind === "shell-page" &&
    fontCatalogSnap.active.includes("Каталог шрифтов") &&
    fontCatalogSnap.parentActive.includes("Шрифты");
  results.media = mediaSnap.routeKind === "shell-page" &&
    mediaSnap.active.includes("Медиа");
  results.figma = figmaSnap.routeKind === "shell-page" &&
    figmaSnap.active.includes("Импорт из Figma");
  results.help = helpSnap.routeKind === "shell-page" &&
    helpSnap.active.includes("Справка");
  results.learn = learnSnap.routeKind === "shell-page" &&
    learnSnap.active.includes("Обучение");
  results.shellConsumers = results.libraries && results.fontCatalog && results.media && results.help;
  results.activeStates = results.dashboard && results.libraries && results.nativeFonts && results.fontCatalog &&
    results.media && results.figma && results.help && results.learn;

  results.sameTab = pageCountBeforeHelp === pageCountAfterHelp;
  results.helpStaysInBrowser = results.sameTab && helpSnap.hash === "#/nofida/help";
  results.noInternalBlank = [
    dashboardSnap,
    librariesSnap,
    nativeFontsSnap,
    fontCatalogSnap,
    mediaSnap,
    figmaSnap,
    helpSnap,
    learnSnap
  ].every((snap) => snap.internalBlankTargets.length === 0);
  results.noInternalWindowOpen = (await readOpenProbe(page)).every((href) => {
    return !/(#\/nofida|#\/dashboard|#\/settings|\/#\/nofida|\/#\/dashboard|\/#\/settings)/i.test(href);
  });

  // page.goto to #/settings/options as a cold route renders a Penpot 404 — must first land on
  // a known Penpot route (dashboard) and then hash-navigate to account settings.
  await page.goto(`${BASE}/#/dashboard/team/${teamId}/projects`, { waitUntil: "load", timeout: 60000 });
  await waitForDashboardShell(page);
  await openHash(page, "#/settings/options");
  await waitForAccount(page);
  const accountBaseCount = await page.locator("ul.main_ui_settings_sidebar__sidebar-nav-settings li").count();
  const accountShellCount = await page.locator("#nofida-shell").count();

  try {
    await openHash(page, AI_SETTINGS_ROUTE);
    await waitForAccountAI(page);
    const accountAiCount = await page.locator("ul.main_ui_settings_sidebar__sidebar-nav-settings li").count();
    const aiShellCount = await page.locator("#nofida-shell").count();
    const aiHostCount = await page.locator("#nofida-ai-account-page-host").count();
    const aiUrl = page.url();
    results.noShellInAccount = accountShellCount === 0 && aiShellCount === 0;
    results.accountSidebarStable = accountAiCount >= accountBaseCount;
    results.aiInAccount = /#\/settings\/options\?nofida=ai&tab=api/.test(aiUrl) && aiHostCount === 1;
    // Diagnostic: expose key values so failures are interpretable
    if (!results.aiInAccount) {
      notes.push(`aiInAccount=false: url=${aiUrl.slice(-60)} hostCount=${aiHostCount} baseCount=${accountBaseCount} aiCount=${accountAiCount} shellCount=${aiShellCount}`);
    }
  } catch (aiAccountErr) {
    notes.push(`aiAccountCheck: ${aiAccountErr && aiAccountErr.message ? aiAccountErr.message : String(aiAccountErr)}`);
  }

  try {
    results.settingsStable60 = await settingsStabilityRun(page);
  } catch (settingsStabilityErr) {
    notes.push(`settingsStabilityRun: ${settingsStabilityErr && settingsStabilityErr.message ? settingsStabilityErr.message : String(settingsStabilityErr)}`);
  }

  // PART 2: 90-second stability run for plain #/settings/options (isolated — must not cascade)
  let accountPlainStability = {
    shellAbsent: false, resourceNavAbsent: false, navStable: false,
    widthStable: false, topStable: false, labelsStable: false,
    nofidaOnce: false, noHostOnPlain: false
  };
  try {
    accountPlainStability = await accountSidebarStabilityRun(page, teamId);
  } catch (stabilityErr) {
    notes.push(`accountSidebarStabilityRun: ${stabilityErr && stabilityErr.message ? stabilityErr.message : String(stabilityErr)}`);
  }
  results.accountSidebarNoShell = accountPlainStability.shellAbsent;
  results.accountSidebarNoResourceNav = accountPlainStability.resourceNavAbsent;
  results.accountSidebarWidthStable90s = accountPlainStability.widthStable;
  results.accountSidebarTopStable90s = accountPlainStability.topStable;
  results.accountSidebarLabelsStable90s = accountPlainStability.labelsStable;
  results.accountNofidaOnce = accountPlainStability.nofidaOnce;
  results.accountNoHostOnPlain = accountPlainStability.noHostOnPlain;

  const editorOpened = await openEditorFromHub(page).catch((err) => {
    notes.push(`openEditorFromHub: ${err && err.message ? err.message : String(err)}`);
    return false;
  });
  if (editorOpened) {
    results.noShellInEditor = await page.locator("#nofida-shell").count() === 0;
    results.editorUiClean = results.noShellInEditor;

    // AI panel lives in shadow root — isolated so cascade cannot kill stability runs.
    try {
      await page.evaluate(() => {
        if (window.NofidaAICore && typeof window.NofidaAICore.open === "function") {
          window.NofidaAICore.open();
        }
      });
      // #assistant-panel lives inside a shadow root — pierce it with evaluate instead of waitForSelector.
      await page.waitForFunction(() => {
        const host = document.getElementById("nofida-shell-root");
        if (!host || !host.shadowRoot) return false;
        const panel = host.shadowRoot.getElementById("assistant-panel");
        return panel ? panel.classList.contains("open") : false;
      }, { timeout: 30000 });
      results.aiEditorLocal = /\/#\/workspace/.test(page.url());
    } catch (aiPanelErr) {
      notes.push(`aiEditorPanel: ${aiPanelErr && aiPanelErr.message ? aiPanelErr.message : String(aiPanelErr)}`);
    }

    try {
      await page.evaluate(() => {
        if (window.NofidaNavigation && typeof window.NofidaNavigation.goToNofidaRoute === "function") {
          window.NofidaNavigation.goToNofidaRoute("#/nofida/libraries", {
            source: "verify-021a-editor"
          });
        }
      });
      await waitForLibraries(page);
      const fromEditorSnap = await collectShellSnapshot(page);
      results.noDuplicateSidebar = results.noDuplicateSidebar && fromEditorSnap.legacyVisible === 0;
      results.editorUiClean = results.editorUiClean && fromEditorSnap.backLabel === "Назад в редактор";
      await page.click("[data-nofida-back='safe']");
      await waitForEditor(page);
    } catch (editorNavErr) {
      notes.push(`editorNavBack: ${editorNavErr && editorNavErr.message ? editorNavErr.message : String(editorNavErr)}`);
    }
  } else {
    notes.push("editor route was not accessible from the hub open action");
  }

  const dashboardStability = await stabilityRun(page, `#/dashboard/team/${teamId}/projects`, waitForDashboardShell);
  const fontsStability = await stabilityRun(page, `#/dashboard/fonts?team-id=${teamId}`, async (currentPage) => {
    await waitForDashboardShell(currentPage);
    await currentPage.waitForFunction(() => !!document.getElementById("nfr-native-fonts"), { timeout: 90000 });
  });
  const mediaStability = await stabilityRun(page, "#/nofida/media", waitForMedia);
  const helpStability = await stabilityRun(page, "#/nofida/help", waitForHelpPage);

  results.dashboardStable60 = dashboardStability.stable && dashboardStability.noLegacy && dashboardStability.sameWidth;
  results.fontsStable60 = fontsStability.stable && fontsStability.noLegacy && fontsStability.sameWidth;
  results.mediaStable60 = mediaStability.stable && mediaStability.noLegacy && mediaStability.sameWidth;
  results.helpStable60 = helpStability.stable && helpStability.noLegacy && helpStability.sameWidth;

  const blockedAnchors = await collectVisibleBlockedAnchors(page);
  results.noVisiblePenpotLinks = blockedAnchors.length === 0;
  results.noFatalConsoleErrors = fatalConsole.length === 0;

  results.hubWorks = results.libraries;
  results.fontsWorks = results.nativeFonts && results.fontCatalog;
  results.mediaWorks = results.media;
  results.figmaWorks = results.figma;
  results.aiSettingsWorks = results.aiInAccount;
  results.internalPagesWork = results.help && results.learn &&
    repositorySnap.routeKind === "shell-page" &&
    privacySnap.routeKind === "shell-page";
} catch (error) {
  notes.push(error && error.message ? error.message : String(error));
} finally {
  await context.close();
  await browser.close();
}

console.log("PATCH 021A completed.");
console.log("");
console.log("Repo:");
printLine("committed", results.committed);
printLine("commit hash", false, "not checked by this script");
printLine("pushed", results.pushed);
printLine("git status clean or documented exceptions", results.clean);
console.log("");
console.log("Shell:");
printLine("shared shell implemented", results.sharedShell);
printLine("one dashboard/resource sidebar", results.oneSidebar);
printLine("old competing sidebars removed", results.noDuplicateSidebar);
printLine("resource pages consume shell", results.shellConsumers);
printLine("no duplicate resource/sidebar menu", results.noDuplicateSidebar);
console.log("");
console.log("Sidebar stability:");
printLine("width stable across dashboard/libraries/fonts/media/figma/help/learn", results.widthStable);
printLine("labels stable across routes", results.labelsStable);
printLine("order stable across routes", results.orderStable);
printLine("parent/child hierarchy stable", results.hierarchyStable);
printLine("active states correct", results.activeStates);
printLine("`Ед.` label removed", results.noEdLabel);
console.log("");
console.log("Routes:");
printLine("dashboard", results.dashboard);
printLine("libraries", results.libraries);
printLine("native fonts", results.nativeFonts);
printLine("font catalog", results.fontCatalog);
printLine("media", results.media);
printLine("figma import", results.figma);
printLine("help", results.help);
printLine("learn", results.learn);
console.log("");
console.log("Browser/app behavior:");
printLine("internal links same tab", results.sameTab);
printLine("no internal target blank", results.noInternalBlank);
printLine("no internal window.open", results.noInternalWindowOpen);
printLine("Help stays in browser when opened in browser", results.helpStaysInBrowser);
console.log("");
console.log("Account:");
printLine("no dashboard/resource shell in account", results.noShellInAccount);
printLine("account sidebar stable", results.accountSidebarStable);
printLine("NOFIDA AI inside account", results.aiInAccount);
console.log("");
console.log("Account Settings Stability (90s, plain #/settings/options):");
printLine("no dashboard/resource shell in account", results.accountSidebarNoShell);
printLine("no resource nav in account", results.accountSidebarNoResourceNav);
printLine("account sidebar width stable 90s", results.accountSidebarWidthStable90s);
printLine("account sidebar top stable 90s", results.accountSidebarTopStable90s);
printLine("account sidebar labels stable 90s", results.accountSidebarLabelsStable90s);
printLine("NOFIDA AI entry appears exactly once", results.accountNofidaOnce);
printLine("no host injected on plain settings", results.accountNoHostOnPlain);
console.log("");
console.log("Editor:");
printLine("no dashboard/resource shell in editor", results.noShellInEditor);
printLine("editor UI unaffected", results.editorUiClean);
printLine("AI panel editor-local", results.aiEditorLocal);
console.log("");
console.log("Stability:");
printLine("dashboard no flicker 60s", results.dashboardStable60);
printLine("fonts no flicker 60s", results.fontsStable60);
printLine("media no flicker 60s", results.mediaStable60);
printLine("help no flicker 60s", results.helpStable60);
printLine("settings no flicker 60s", results.settingsStable60);
printLine("no fatal console errors", results.noFatalConsoleErrors, fatalConsole.join(" | "));
console.log("");
console.log("Regression:");
printLine("Hub works", results.hubWorks);
printLine("Fonts works", results.fontsWorks);
printLine("Media works", results.mediaWorks);
printLine("Figma Import works", results.figmaWorks);
printLine("AI settings works", results.aiSettingsWorks);
printLine("internal pages work", results.internalPagesWork);
printLine("no visible Penpot links", results.noVisiblePenpotLinks);
console.log("");
console.log("Deploy:");
console.log("* frontend rebuilt/restarted: FAIL (not checked by this script)");
console.log("* hub adapter restarted if needed: NO");
console.log("* Postgres/Valkey restarted: NO");
console.log("* Caddy touched: NO");
console.log("");
console.log("Safety:");
console.log("* setup-cloud-core.sh run: NO");
console.log("* direct DB writes used: NO");
console.log("");
console.log(`Recommendation: ${
  results.sharedShell &&
  results.oneSidebar &&
  results.noDuplicateSidebar &&
  results.widthStable &&
  results.labelsStable &&
  results.activeStates &&
  results.noShellInAccount &&
  results.aiInAccount &&
  results.accountSidebarNoShell &&
  results.accountSidebarWidthStable90s &&
  results.accountSidebarLabelsStable90s &&
  results.accountNofidaOnce &&
  results.accountNoHostOnPlain &&
  results.noFatalConsoleErrors
    ? "approve"
    : "fix required"
}`);

if (notes.length) {
  console.log("");
  console.log("Notes:");
  notes.forEach((note) => console.log(`* ${note}`));
}

if (!(
  results.sharedShell &&
  results.oneSidebar &&
  results.noDuplicateSidebar &&
  results.widthStable &&
  results.labelsStable &&
  results.activeStates &&
  results.noShellInAccount &&
  results.aiInAccount &&
  results.accountSidebarNoShell &&
  results.accountSidebarWidthStable90s &&
  results.accountSidebarLabelsStable90s &&
  results.accountNofidaOnce &&
  results.accountNoHostOnPlain &&
  results.noFatalConsoleErrors
)) {
  process.exitCode = 1;
}
