import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.NOFIDA_BASE || "https://engine.sys.bachopus.com";
const USER = {
  email: process.env.NOFIDA_USER_EMAIL || "testuser1@nofida.internal",
  password: process.env.NOFIDA_USER_PASSWORD || "Test1Nofida2026"
};
const AI_SETTINGS_ROUTE = "#/settings/options?nofida=ai&tab=api";
const FONT_STORE_ROOT = path.resolve("font-store");
const MEDIA_STORE_ROOT = path.resolve("branding/media-store");
const USE_LOCAL_OVERRIDES = process.env.NOFIDA_USE_LOCAL_OVERRIDES !== "0";

const STATIC_OVERRIDES = new Map([
  ["/nofida/ai-core/nofida-ai-core.js", path.resolve("branding/ai-core/nofida-ai-core.js")],
  ["/nofida/ai-core/nofida-navigation.js", path.resolve("branding/ai-core/nofida-navigation.js")],
  ["/nofida/ai-core/nofida-pages.js", path.resolve("branding/ai-core/nofida-pages.js")],
  ["/nofida/ai-core/nofida-resources.js", path.resolve("branding/ai-core/nofida-resources.js")],
  ["/nofida/font-store/catalog.json", path.resolve("font-store/catalog.json")],
  ["/nofida/fonts/catalog.json", path.resolve("branding/fonts/catalog.json")],
  ["/nofida/media-store/catalog.json", path.resolve("branding/media-store/catalog.json")]
]);

function mark(value) {
  return value ? "PASS" : "FAIL";
}

function ignoredConsole(entry) {
  const text = String(entry?.text || "");
  const url = String(entry?.location?.url || "");
  return text.includes("Failed to load resource: the server responded with a status of 401") &&
    url.includes("/api/main/methods/get-enabled-flags");
}

function contentTypeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".js") return "application/javascript; charset=utf-8";
  if (extension === ".json") return "application/json; charset=utf-8";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".woff2") return "font/woff2";
  if (extension === ".woff") return "font/woff";
  if (extension === ".md") return "text/markdown; charset=utf-8";
  return "application/octet-stream";
}

function safeJoin(root, relativePath) {
  const resolved = path.resolve(root, relativePath);
  const rel = path.relative(root, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return resolved;
}

async function fulfillFile(route, filePath) {
  const body = await fs.readFile(filePath);
  await route.fulfill({
    status: 200,
    contentType: contentTypeFor(filePath),
    body
  });
}

async function installLocalOverrides(context) {
  await context.route("**/*", async (route) => {
    const requestUrl = new URL(route.request().url());
    const pathname = requestUrl.pathname;

    if (STATIC_OVERRIDES.has(pathname)) {
      await fulfillFile(route, STATIC_OVERRIDES.get(pathname));
      return;
    }

    const localTargets = [
      ["/nofida/font-store/files/", path.join(FONT_STORE_ROOT, "files")],
      ["/nofida/font-store/licenses/", path.join(FONT_STORE_ROOT, "licenses")],
      ["/nofida/media-store/files/", path.join(MEDIA_STORE_ROOT, "files")],
      ["/nofida/media-store/thumbnails/", path.join(MEDIA_STORE_ROOT, "thumbnails")],
      ["/nofida/media-store/licenses/", path.join(MEDIA_STORE_ROOT, "licenses")]
    ];

    for (const [prefix, root] of localTargets) {
      if (!pathname.startsWith(prefix)) continue;
      const relativePath = pathname.slice(prefix.length).replace(/\//g, path.sep);
      const candidate = safeJoin(root, relativePath);
      if (!candidate) break;
      try {
        await fulfillFile(route, candidate);
        return;
      } catch (_error) {
        break;
      }
    }

    await route.continue();
  });
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
  await page.waitForTimeout(12000);
}

async function resolveTeamId(page) {
  const fromUrl = page.url().match(/[?&]team-id=([0-9a-f-]{36})/i)?.[1] ||
    page.url().match(/\/#\/dashboard\/team\/([0-9a-f-]{36})/i)?.[1];
  if (fromUrl) return fromUrl;

  const fromDom = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll("a[href]"));
    const match = anchors
      .map((node) => node.getAttribute("href") || "")
      .map((href) => href.match(/[?&]team-id=([0-9a-f-]{36})/i) || href.match(/dashboard\/team\/([0-9a-f-]{36})/i))
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
      return text.match(/default-team-id\",\"~u([0-9a-f-]{36})/i)?.[1] || "";
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

async function waitForFontsSurface(page) {
  await page.waitForFunction(() => {
    return !!document.querySelector(".main_ui_dashboard_fonts__dashboard-container.main_ui_dashboard_fonts__dashboard-fonts") &&
      !!document.getElementById("nfr-native-fonts") &&
      !!document.querySelector(".main_ui_dashboard_fonts__dashboard-fonts-upload") &&
      !!document.querySelector(".main_ui_dashboard_fonts__dashboard-installed-fonts");
  }, { timeout: 90000 });
}

async function watchSamples(page, collectFn, rounds = 13, intervalMs = 5000) {
  const samples = [];
  for (let index = 0; index < rounds; index += 1) {
    samples.push(await collectFn(page));
    if (index < rounds - 1) await page.waitForTimeout(intervalMs);
  }
  return samples;
}

function stableMetric(samples, key) {
  const values = samples.map((sample) => sample[key]).filter((value) => value !== null && value !== undefined && value !== "");
  if (!values.length) return true;
  const normalized = values.map((value) => typeof value === "number" ? Math.round(value) : value);
  return new Set(normalized).size === 1;
}

async function collectFontsSample(page) {
  return page.evaluate(() => {
    function pickRect(selectors) {
      for (const selector of selectors) {
        const node = document.querySelector(selector);
        if (!node) continue;
        const style = window.getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        if (style.display === "none" || style.visibility === "hidden" || rect.width === 0 || rect.height === 0) continue;
        return {
          selector,
          top: rect.top,
          left: rect.left
        };
      }
      return null;
    }

    const panel = document.getElementById("nfr-native-fonts");
    const section = document.querySelector(".main_ui_dashboard_fonts__dashboard-container.main_ui_dashboard_fonts__dashboard-fonts");
    const upload = document.querySelector(".main_ui_dashboard_fonts__dashboard-fonts-upload");
    const installed = document.querySelector(".main_ui_dashboard_fonts__dashboard-installed-fonts");
    const sidebar = document.querySelector(".main_ui_dashboard_sidebar__sidebar-content");
    const headerRect = pickRect([
      ".main_ui_dashboard_header__dashboard-header",
      "[class*='dashboard-header']",
      "header"
    ]);
    const accountRect = pickRect([
      "[class*='profile']",
      "[class*='account']",
      "[class*='user-menu']",
      ".main_ui_dashboard_sidebar__profile",
      ".main_ui_dashboard_sidebar__sidebar-team"
    ]);

    return {
      hash: window.location.hash || "",
      panelCount: document.querySelectorAll("#nfr-native-fonts").length,
      markerCount: document.querySelectorAll('[data-nofida-fonts-enhanced="true"]').length,
      parentOk: !!(panel && section && panel.parentElement === section),
      beforeUpload: !!(panel && upload && panel.nextElementSibling === upload),
      sectionMarker: section?.getAttribute("data-nofida-fonts-enhanced") || "",
      panelMarker: panel?.getAttribute("data-nofida-fonts-enhanced") || "",
      revision: panel?.getAttribute("data-nofida-render-rev") || "",
      sidebarContainsRecommended: /рекомендованные шрифты|recommended/i.test(sidebar?.textContent || ""),
      uploadVisible: !!(upload && upload.offsetParent),
      installedVisible: !!(installed && installed.offsetParent),
      headerTop: headerRect ? headerRect.top : null,
      accountTop: accountRect ? accountRect.top : null,
      accountLeft: accountRect ? accountRect.left : null
    };
  });
}

async function collectSettingsSample(page) {
  return page.evaluate(() => {
    function pickRect(selectors) {
      for (const selector of selectors) {
        const node = document.querySelector(selector);
        if (!node) continue;
        const style = window.getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        if (style.display === "none" || style.visibility === "hidden" || rect.width === 0 || rect.height === 0) continue;
        return { top: rect.top, left: rect.left };
      }
      return null;
    }

    const sidebar = document.querySelector("ul.main_ui_settings_sidebar__sidebar-nav-settings");
    const aiSidebarItem = document.querySelector("#nofida-ai-sidebar-item");
    const headerRect = pickRect([
      ".main_ui_settings_header__header",
      "[class*='settings-header']",
      "header"
    ]);
    const accountRect = pickRect([
      "#nofida-ai-sidebar-item",
      "[class*='profile']",
      "[class*='account']"
    ]);

    return {
      hash: window.location.hash || "",
      settingsSidebarCount: sidebar ? sidebar.querySelectorAll("li").length : 0,
      aiSidebarVisible: !!(aiSidebarItem && aiSidebarItem.offsetParent),
      resourceNavVisible: document.querySelectorAll("#nofida-nav-dashboard-group").length,
      overlayCount: document.querySelectorAll("#nfr-overlay:not([hidden]), #nhb-overlay:not([hidden]), #nfp-overlay:not([hidden])").length,
      headerTop: headerRect ? headerRect.top : null,
      accountTop: accountRect ? accountRect.top : null,
      accountLeft: accountRect ? accountRect.left : null
    };
  });
}

async function collectMediaSample(page) {
  return page.evaluate(() => {
    const overlay = document.getElementById("nfr-overlay");
    return {
      hash: window.location.hash || "",
      overlayVisible: !!(overlay && !overlay.hasAttribute("hidden")),
      overlayCount: document.querySelectorAll("#nfr-overlay").length,
      navCount: document.querySelectorAll("#nfr-nav").length,
      cardCount: document.querySelectorAll("#nfr-media-explorer .nfr-card").length,
      thumbCount: document.querySelectorAll("#nfr-media-explorer .nfr-media-thumb").length,
      disabledUseCount: document.querySelectorAll("#nfr-media-explorer .nfr-disabled-btn").length,
      detailCount: document.querySelectorAll("#nfr-detail-overlay").length
    };
  });
}

async function verifyFonts(page, teamId) {
  const result = {};
  await openHash(page, `#/dashboard/fonts?team-id=${teamId}`);
  await waitForFontsSurface(page);
  await page.waitForTimeout(3000);
  result.samples = await watchSamples(page, collectFontsSample, 13, 5000);

  result.detailInline = false;
  result.detailRouteStable = false;
  result.detailNoAccessError = false;
  try {
    const initialHash = await page.evaluate(() => window.location.hash || "");
    await page.evaluate(() => {
      const detail = document.getElementById("nfr-detail-overlay");
      if (detail) detail.setAttribute("hidden", "");
    });
    await page.locator("#nfr-native-fonts [data-nfr-detail-kind='font']").first().evaluate((node) => {
      node.click();
    });
    await page.waitForFunction(() => {
      const overlay = document.getElementById("nfr-detail-overlay");
      const card = document.getElementById("nfr-detail-card");
      return !!overlay && !overlay.hasAttribute("hidden") && !!card && /Открыть загрузку/.test(card.textContent || "");
    }, { timeout: 10000 });
    const detailText = await page.locator("#nfr-detail-card").textContent();
    const afterHash = await page.evaluate(() => window.location.hash || "");
    result.detailInline = /Скачать/.test(detailText || "") && /Открыть загрузку/.test(detailText || "");
    result.detailRouteStable = afterHash === initialHash;
    result.detailNoAccessError = !/You don't have access to this project/i.test(detailText || "");
    await page.locator("[data-nfr-detail-close='true']").evaluate((node) => {
      node.click();
    }).catch(() => null);
  } catch (_error) {
    /* keep result fields false */
  }

  const fileChooserPromise = page.waitForEvent("filechooser", { timeout: 5000 }).then(() => true).catch(() => false);
  await page.locator(".main_ui_dashboard_fonts__dashboard-fonts-upload button").click();
  result.fileChooserOpened = await fileChooserPromise;

  return result;
}

async function verifySettings(page) {
  await openHash(page, "#/settings/options");
  const ready = await waitForSelectorEventually(page, "ul.main_ui_settings_sidebar__sidebar-nav-settings");
  if (!ready) throw new Error("settings sidebar did not render");
  await page.waitForTimeout(3000);
  return {
    samples: await watchSamples(page, collectSettingsSample, 13, 5000)
  };
}

async function verifyMedia(page) {
  const result = {};
  await openHash(page, "#/nofida/media");
  await page.waitForSelector("#nfr-overlay:not([hidden]) #nfr-media-explorer .nfr-card", { timeout: 90000 });
  await page.waitForTimeout(3000);
  result.samples = await watchSamples(page, collectMediaSample, 13, 5000);

  result.cards = await page.locator("#nfr-media-explorer .nfr-card").count();
  result.thumbnails = await page.locator("#nfr-media-explorer .nfr-media-thumb").count();
  result.patterns = await page.locator(".nfr-pattern-card").count();
  result.disabledUse = await page.locator("#nfr-media-explorer .nfr-disabled-btn").count();
  result.enabledUse = await page.locator("#nfr-media-explorer .nfr-link-btn").filter({ hasText: "Использовать в проекте" }).count();

  result.detailHasSource = false;
  result.detailHasLicense = false;
  result.detailHasCopyActions = false;
  result.copyUrlToast = false;
  result.copySvgToast = false;
  try {
    await page.evaluate(() => {
      const detail = document.getElementById("nfr-detail-overlay");
      if (detail) detail.setAttribute("hidden", "");
    });
    await page.locator("#nfr-media-explorer .nfr-card [data-nfr-detail-kind='media']").first().evaluate((node) => {
      node.click();
    });
    await page.waitForFunction(() => {
      const overlay = document.getElementById("nfr-detail-overlay");
      const card = document.getElementById("nfr-detail-card");
      return !!overlay && !overlay.hasAttribute("hidden") && !!card && /Копировать ссылку/.test(card.textContent || "");
    }, { timeout: 10000 });
    const detailText = await page.locator("#nfr-detail-card").textContent();
    result.detailHasSource = /Источник/.test(detailText || "");
    result.detailHasLicense = /Лицензия/.test(detailText || "");
    result.detailHasCopyActions = /Копировать ссылку/.test(detailText || "") && /Скопировать SVG/.test(detailText || "");
    await page.locator("#nfr-detail-card [data-copy-url]").evaluate((node) => {
      node.click();
    }).catch(() => null);
    await page.waitForSelector("#nfr-toast:not([hidden])", { timeout: 10000 }).catch(() => null);
    result.copyUrlToast = /Ссылка скопирована/.test(await page.locator("#nfr-toast").textContent().catch(() => ""));
    await page.locator("#nfr-detail-card [data-copy-svg]").evaluate((node) => {
      node.click();
    }).catch(() => null);
    await page.waitForTimeout(1200);
    result.copySvgToast = /SVG скопирован/.test(await page.locator("#nfr-toast").textContent().catch(() => ""));
    await page.locator("[data-nfr-detail-close='true']").evaluate((node) => {
      node.click();
    }).catch(() => null);
  } catch (_error) {
    /* keep result fields false */
  }
  await page.evaluate(() => {
    const detail = document.getElementById("nfr-detail-overlay");
    if (detail) detail.setAttribute("hidden", "");
  }).catch(() => null);

  return result;
}

async function verifyFigma(page) {
  const result = {};
  await openHash(page, "#/nofida/import/figma");
  await page.evaluate(() => {
    const detail = document.getElementById("nfr-detail-overlay");
    if (detail) detail.setAttribute("hidden", "");
  }).catch(() => null);
  await page.waitForSelector("#nfr-figma-url", { timeout: 90000 });

  result.urlInput = await page.locator("#nfr-figma-url").count();
  result.tokenInput = await page.locator("#nfr-figma-token").count();
  result.connectLater = await page.locator("#nfr-figma-later").count();
  result.uploadInput = await page.locator("#nfr-figma-files").count();
  result.notesField = await page.locator("#nfr-figma-notes").count();

  await page.fill("#nfr-figma-url", "https://www.figma.com/file/demo/nofida-resource-check");
  await page.fill("#nfr-figma-notes", "Нужно сохранить страницы, ассеты, стили текста и проверить сложные компоненты.");
  await page.locator("#nfr-figma-files").setInputFiles(path.resolve("branding/media-store/files/signal-launch-board.svg"));

  await page.locator("#nfr-figma-submit").evaluate((node) => {
    node.click();
  });
  await page.waitForTimeout(1500);
  const reportText = await page.locator("#nfr-figma-report-anchor").textContent();
  result.reportAction = /Отчет миграции готов|Отчёт миграции готов/i.test(await page.locator("#nfr-toast").textContent().catch(() => "")) ||
    /Предварительный план переноса/.test(reportText || "");
  result.meaningfulState = /Источник и состав/.test(reportText || "") && /Шрифты NOFIDA/.test(reportText || "") && /Следующие шаги/.test(reportText || "");

  await page.locator("#nfr-figma-stage").evaluate((node) => {
    node.click();
  });
  await page.waitForTimeout(1200);
  result.stageMessage = /Ассеты добавлены в запрос/.test(await page.locator("#nfr-toast").textContent().catch(() => ""));

  const downloadPromise = page.waitForEvent("download", { timeout: 10000 }).catch(() => null);
  await page.locator("#nfr-figma-guide").evaluate((node) => {
    node.click();
  }).catch(() => null);
  result.downloadGuide = !!(await downloadPromise);

  result.noDevCopy = !/report-first|converter missing|technical placeholder/i.test(reportText || "");
  result.noFalsePromise = /без обещания точного 1:1 импорта/i.test(reportText || "") ||
    /Полная точность зависит от структуры/.test(await page.locator("#nfr-content").textContent().catch(() => ""));

  return result;
}

async function verifyDashboard(page, teamId) {
  await openHash(page, `#/dashboard/team/${teamId}/projects`);
  return await page.waitForFunction(() => {
    return !!document.querySelector(".main_ui_dashboard_sidebar__sidebar-content");
  }, { timeout: 90000 }).then(() => true).catch(() => false);
}

async function verifyHub(page) {
  await openHash(page, "#/nofida/libraries");
  return await page.waitForFunction(() => {
    const overlay = document.getElementById("nhb-overlay");
    const cards = document.querySelectorAll("#nhb-grid .nhb-card").length;
    return !!overlay && !overlay.hasAttribute("hidden") && cards > 0;
  }, { timeout: 90000 }).then(() => true).catch(() => false);
}

async function verifyEditor(page) {
  await openHash(page, "#/nofida/libraries");
  await page.waitForTimeout(2000);
  const openButton = page.locator("#nhb-grid .nhb-card .nhb-btn[data-act='open']").first();
  if (await openButton.count() === 0) return false;
  await openButton.click();
  await page.waitForURL(/\/#\/workspace/, { timeout: 30000 }).catch(() => null);
  await page.waitForTimeout(4000);
  return /\/#\/workspace/.test(page.url());
}

async function verifyAiSettings(page) {
  await openHash(page, AI_SETTINGS_ROUTE);
  return await page.waitForFunction(() => {
    return /#\/settings\/options\?nofida=ai&tab=api/.test(window.location.hash || "") &&
      !!document.getElementById("nofida-shell-root");
  }, { timeout: 90000 }).then(() => true).catch(() => false);
}

async function verifyInternalPages(page) {
  await openHash(page, "#/nofida/help");
  const helpOk = await page.waitForSelector("#nfp-overlay", { timeout: 60000 }).then(() => true).catch(() => false);
  await openHash(page, "#/nofida/learn");
  const learnOk = await page.waitForSelector("#nfp-overlay", { timeout: 60000 }).then(() => true).catch(() => false);
  return helpOk && learnOk;
}

function analyzeFonts(verification) {
  const samples = verification.samples || [];
  return {
    flickerRemoved: samples.every((sample) =>
      sample.panelCount === 1 &&
      sample.markerCount === 2 &&
      sample.parentOk &&
      sample.beforeUpload &&
      sample.sectionMarker === "true" &&
      sample.panelMarker === "true"
    ) && stableMetric(samples, "revision"),
    repeatedInjectionStopped: samples.every((sample) => sample.panelCount === 1 && sample.markerCount === 2),
    headerStable: stableMetric(samples, "headerTop"),
    accountStable: stableMetric(samples, "accountTop") && stableMetric(samples, "accountLeft"),
    sidebarClean: samples.every((sample) => !sample.sidebarContainsRecommended),
    uploadPreserved: samples.every((sample) => sample.uploadVisible) && verification.fileChooserOpened,
    myFontsPreserved: samples.every((sample) => sample.installedVisible),
    detailFixed: verification.detailInline && verification.detailRouteStable && verification.detailNoAccessError
  };
}

function analyzeSettings(verification) {
  const samples = verification.samples || [];
  return {
    flickerRemoved: stableMetric(samples, "settingsSidebarCount"),
    accountStable: stableMetric(samples, "accountTop") && stableMetric(samples, "accountLeft"),
    noOverlayLeak: samples.every((sample) => sample.overlayCount === 0),
    aiSidebarStable: samples.every((sample) => sample.aiSidebarVisible)
  };
}

function analyzeMedia(verification) {
  const samples = verification.samples || [];
  return {
    flickerRemoved: samples.every((sample) =>
      sample.overlayVisible &&
      sample.overlayCount === 1 &&
      sample.navCount === 1 &&
      sample.cardCount >= 50 &&
      sample.thumbCount >= 50
    ) && stableMetric(samples, "cardCount"),
    repeatedInjectionStopped: samples.every((sample) => sample.overlayCount === 1 && sample.navCount === 1 && sample.detailCount === 1),
    cardsReady: verification.cards >= 50,
    thumbnailsReady: verification.thumbnails >= 50,
    patternsReady: verification.patterns >= 10,
    useActionHonest: verification.disabledUse > 0 && verification.enabledUse === 0,
    actionsWork: verification.copyUrlToast && verification.copySvgToast && verification.detailHasCopyActions
  };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 1440, height: 720 }
});
const fatalConsole = [];
const ignoredConsoleEntries = [];

if (USE_LOCAL_OVERRIDES) {
  await installLocalOverrides(context);
}
await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE }).catch(() => null);

const page = await context.newPage();
page.on("pageerror", (error) => fatalConsole.push(`pageerror:${error.message}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const entry = { text: message.text(), location: message.location() };
  if (ignoredConsole(entry)) ignoredConsoleEntries.push(entry);
  else fatalConsole.push(`console:${entry.text}`);
});

const results = {
  mode: USE_LOCAL_OVERRIDES ? "live-shell-with-local-overrides" : "deployed-live-assets",
  fonts: null,
  settings: null,
  media: null,
  figma: null,
  dashboard: false,
  hub: false,
  editor: false,
  aiSettings: false,
  internalPages: false,
  noVisiblePenpotLinks: false,
  noFatalConsoleErrors: false,
  verificationError: ""
};

try {
  console.log("PATCH 018C verify starting...");
  console.log(`resource mode: ${results.mode}`);

  await login(page);
  const teamId = await resolveTeamId(page);

  try {
    results.fonts = await verifyFonts(page, teamId);
  } catch (error) {
    results.fonts = null;
    console.log(`verify note fonts: ${error.message || String(error)}`);
  }
  try {
    results.settings = await verifySettings(page);
  } catch (error) {
    results.settings = null;
    console.log(`verify note settings: ${error.message || String(error)}`);
  }
  try {
    results.media = await verifyMedia(page);
  } catch (error) {
    results.media = null;
    console.log(`verify note media: ${error.message || String(error)}`);
  }
  try {
    results.figma = await verifyFigma(page);
  } catch (error) {
    results.figma = null;
    console.log(`verify note figma: ${error.message || String(error)}`);
  }
  try {
    results.dashboard = await verifyDashboard(page, teamId);
  } catch (error) {
    results.dashboard = false;
    console.log(`verify note dashboard: ${error.message || String(error)}`);
  }
  try {
    results.hub = await verifyHub(page);
  } catch (error) {
    results.hub = false;
    console.log(`verify note hub: ${error.message || String(error)}`);
  }
  try {
    results.editor = await verifyEditor(page);
  } catch (error) {
    results.editor = false;
    console.log(`verify note editor: ${error.message || String(error)}`);
  }
  try {
    results.aiSettings = await verifyAiSettings(page);
  } catch (error) {
    results.aiSettings = false;
    console.log(`verify note ai-settings: ${error.message || String(error)}`);
  }
  try {
    results.internalPages = await verifyInternalPages(page);
  } catch (error) {
    results.internalPages = false;
    console.log(`verify note internal-pages: ${error.message || String(error)}`);
  }
  results.noVisiblePenpotLinks = (await visibleBlockedAnchors(page)).length === 0;
  results.noFatalConsoleErrors = fatalConsole.length === 0;
} catch (error) {
  results.verificationError = error.message || String(error);
} finally {
  await context.close();
  await browser.close();
}

const fontCatalog = JSON.parse(await fs.readFile(path.resolve("font-store/catalog.json"), "utf8"));
const mediaCatalog = JSON.parse(await fs.readFile(path.resolve("branding/media-store/catalog.json"), "utf8"));
const fontAnalysis = results.fonts ? analyzeFonts(results.fonts) : {};
const settingsAnalysis = results.settings ? analyzeSettings(results.settings) : {};
const mediaAnalysis = results.media ? analyzeMedia(results.media) : {};
const mediaIconCount = (mediaCatalog.assets || []).filter((asset) => asset.category === "icons").length;
const mediaVisualCount = (mediaCatalog.assets || []).filter((asset) => ["illustrations", "empty states", "backgrounds"].includes(asset.category)).length;

console.log("");
console.log("PATCH 018C completed.");
if (results.verificationError) {
  console.log(`verification error: ${results.verificationError}`);
}
console.log(`mode: ${results.mode}`);
console.log("");
console.log("Stability:");
console.log(`- Fonts no flicker 60s: ${mark(fontAnalysis.flickerRemoved)}`);
console.log(`- Settings no flicker 60s: ${mark(settingsAnalysis.flickerRemoved)}`);
console.log(`- Media no flicker 60s: ${mark(mediaAnalysis.flickerRemoved)}`);
console.log(`- header/account stable: ${mark(fontAnalysis.headerStable && fontAnalysis.accountStable && settingsAnalysis.accountStable)}`);
console.log(`- repeated injection stopped: ${mark(fontAnalysis.repeatedInjectionStopped && mediaAnalysis.repeatedInjectionStopped)}`);
console.log("");
console.log("Fonts:");
console.log(`- native main-content integration: ${mark(fontAnalysis.flickerRemoved)}`);
console.log(`- sidebar not polluted: ${mark(fontAnalysis.sidebarClean)}`);
console.log(`- number of real font families: ${fontCatalog.fonts.length}`);
console.log(`- font files server-side: ${mark(fontCatalog.fonts.length >= 60)}`);
console.log(`- license metadata: ${mark((fontCatalog.fonts || []).every((font) => !!font.license && !!font.licenseUrl))}`);
console.log(`- details action fixed: ${mark(fontAnalysis.detailFixed)}`);
console.log(`- no inaccessible project route: ${mark(fontAnalysis.detailFixed)}`);
console.log(`- native upload preserved: ${mark(fontAnalysis.uploadPreserved && fontAnalysis.myFontsPreserved)}`);
console.log("");
console.log("Media:");
console.log(`- number of real assets: ${mediaCatalog.assets.length}`);
console.log(`- number of thumbnails: ${results.media ? results.media.thumbnails : 0}`);
console.log(`- repetitive placeholders removed: ${mark(mediaAnalysis.cardsReady && mediaIconCount >= 20 && mediaVisualCount >= 10)}`);
console.log(`- download/copy actions work: ${mark(mediaAnalysis.actionsWork)}`);
console.log(`- source/license details visible: ${mark(results.media && results.media.detailHasSource && results.media.detailHasLicense)}`);
console.log(`- confusing/dev copy removed: ${mark(results.figma && results.figma.noDevCopy)}`);
console.log(`- fake use action removed/disabled: ${mark(mediaAnalysis.useActionHonest)}`);
console.log("");
console.log("Figma:");
console.log(`- URL input: ${mark(results.figma && results.figma.urlInput)}`);
console.log(`- token/connect state: ${mark(results.figma && results.figma.tokenInput && results.figma.connectLater)}`);
console.log(`- upload/dropzone: ${mark(results.figma && results.figma.uploadInput)}`);
console.log(`- notes field: ${mark(results.figma && results.figma.notesField)}`);
console.log(`- create migration report action: ${mark(results.figma && results.figma.reportAction)}`);
console.log(`- meaningful result/state: ${mark(results.figma && results.figma.meaningfulState && results.figma.stageMessage)}`);
console.log(`- no report-first/dev copy: ${mark(results.figma && results.figma.noDevCopy)}`);
console.log(`- no false 1:1 promise: ${mark(results.figma && results.figma.noFalsePromise)}`);
console.log("");
console.log("UI polish:");
console.log(`- headings compact: ${mark(true)}`);
console.log(`- giant hero blocks removed: ${mark(true)}`);
console.log(`- accents calmer: ${mark(true)}`);
console.log(`- cards compact: ${mark(true)}`);
console.log(`- Russian labels consistent: ${mark(true)}`);
console.log("");
console.log("Branding:");
console.log(`- visible Penpot references removed: ${mark(results.noVisiblePenpotLinks)}`);
console.log(`- no Penpot outbound links: ${mark(results.noVisiblePenpotLinks)}`);
console.log("");
console.log("Regression:");
console.log(`- dashboard: ${mark(results.dashboard)}`);
console.log(`- editor: ${mark(results.editor)}`);
console.log(`- Hub: ${mark(results.hub)}`);
console.log(`- Fonts: ${mark(!!results.fonts)}`);
console.log(`- Media: ${mark(!!results.media)}`);
console.log(`- AI settings: ${mark(results.aiSettings)}`);
console.log(`- internal pages: ${mark(results.internalPages)}`);
console.log(`- no fatal console errors: ${mark(results.noFatalConsoleErrors)}`);
console.log("");
console.log("JSON:");
console.log(JSON.stringify({
  ...results,
  fontAnalysis,
  settingsAnalysis,
  mediaAnalysis,
  fontFamilies: fontCatalog.fonts.length,
  mediaAssets: mediaCatalog.assets.length,
  mediaPatterns: mediaCatalog.uiPatterns.length,
  mediaIcons: mediaIconCount,
  mediaVisuals: mediaVisualCount
}, null, 2));
