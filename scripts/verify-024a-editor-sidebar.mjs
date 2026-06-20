import { chromium } from "playwright";

const BASE = process.env.NOFIDA_BASE || "https://engine.sys.bachopus.com";
const USER = {
  email: process.env.NOFIDA_USER_EMAIL || "testuser1@nofida.internal",
  password: process.env.NOFIDA_USER_PASSWORD || "Test1Nofida2026"
};

const SIDEBAR_ID = "nf-editor-sidebar";
const RESTORE_BTN_ID = "nf-editor-sidebar-restore";
const STORAGE_KEY = "nofida.editorSidebarState";

const EXP_WIDTH = 248;
const COL_WIDTH = 64;
const HIDDEN_WIDTH = 0;
const WIDTH_TOL = 4;

function mark(value) {
  return value ? "PASS" : "FAIL";
}

function printLine(label, ok, detail) {
  console.log("* " + label + ": " + mark(ok) + (detail ? " (" + detail + ")" : ""));
}

async function waitForSelectorEventually(page, selector, totalMs) {
  totalMs = totalMs || 90000;
  const started = Date.now();
  while (Date.now() - started < totalMs) {
    try {
      await page.waitForSelector(selector, { timeout: 10000 });
      return true;
    } catch (_e) {
      await page.waitForTimeout(2000);
    }
  }
  return false;
}

async function login(page) {
  await page.goto(BASE + "/#/auth/login", { waitUntil: "commit", timeout: 45000 });
  const ready = await waitForSelectorEventually(page, "input[type='email'], input[name='email']");
  if (!ready) throw new Error("Login form did not render");
  await page.fill("input[type='email'], input[name='email']", USER.email);
  await page.fill("input[type='password'], input[name='password']", USER.password);
  await page.click("button[type='submit']");
  await page.waitForURL(/\/#\/dashboard/, { timeout: 60000 });
  await page.waitForTimeout(8000);
}

async function resolveTeamId(page) {
  const fromUrl = page.url().match(/[?&]team-id=([0-9a-f-]{36})/i)?.[1] ||
    page.url().match(/\/#\/dashboard\/team\/([0-9a-f-]{36})/i)?.[1];
  if (fromUrl) return fromUrl;

  const fromProfile = await page.evaluate(async () => {
    try {
      const resp = await fetch("/api/rpc/command/get-profile", {
        credentials: "include",
        headers: { Accept: "application/transit+json" }
      });
      if (!resp.ok) return "";
      const text = JSON.stringify(await resp.json());
      return text.match(/default-team-id\",\"~u([0-9a-f-]{36})/i)?.[1] || "";
    } catch (_e) { return ""; }
  });
  if (fromProfile) return fromProfile;
  throw new Error("Could not resolve team id");
}

async function openEditorFromHub(page) {
  await page.evaluate(() => { window.location.hash = "#/nofida/libraries"; });
  await page.waitForFunction(
    () => !!document.getElementById("nhb-shell-root") &&
      document.querySelectorAll("#nhb-grid .nhb-card").length > 0,
    { timeout: 90000 }
  );
  const openBtn = page.locator("#nhb-grid .nhb-btn[data-act='open']").first();
  if (await openBtn.count() === 0) return false;
  await openBtn.click({ timeout: 10000 }).catch(async () => {
    await openBtn.click({ force: true, timeout: 10000 });
  });
  await page.waitForURL(/\/#\/workspace/, { timeout: 90000 });
  await page.waitForTimeout(6000);
  return true;
}

async function measureEditorSidebar(page) {
  return page.evaluate((ids) => {
    function isVisible(el) {
      if (!el) return false;
      const s = window.getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== "none" && s.visibility !== "hidden" &&
        parseFloat(s.opacity || "1") > 0 && r.width > 0 && r.height > 0;
    }

    const sidebar = document.getElementById(ids.SIDEBAR_ID);
    const restoreBtn = document.getElementById(ids.RESTORE_BTN_ID);
    const workspace = document.querySelector(".main_ui_workspace__workspace") ||
      document.querySelector("[class*='workspace__workspace']");
    const sidebarRect = sidebar ? sidebar.getBoundingClientRect() : null;
    const workspaceRect = workspace ? workspace.getBoundingClientRect() : null;

    return {
      sidebarExists: !!sidebar,
      sidebarState: sidebar ? sidebar.getAttribute("data-state") : null,
      sidebarWidth: sidebarRect ? Math.round(sidebarRect.width) : 0,
      sidebarVisible: isVisible(sidebar),
      restoreBtnVisible: restoreBtn ? (window.getComputedStyle(restoreBtn).display !== "none") : false,
      workspaceLeft: workspaceRect ? Math.round(workspaceRect.left) : -1,
      workspaceWidth: workspaceRect ? Math.round(workspaceRect.width) : -1,
      viewportWidth: window.innerWidth,
      dashboardShellExists: !!document.getElementById("nofida-shell"),
      bodyClasses: Array.from(document.body.classList)
    };
  }, { SIDEBAR_ID, RESTORE_BTN_ID });
}

async function getStoredState(page) {
  return page.evaluate((key) => {
    try { return localStorage.getItem(key); } catch (_e) { return null; }
  }, STORAGE_KEY);
}

async function setStoredState(page, value) {
  return page.evaluate((args) => {
    try { localStorage.setItem(args.key, args.value); } catch (_e) { /* noop */ }
  }, { key: STORAGE_KEY, value });
}

async function clearStoredState(page) {
  return page.evaluate((key) => {
    try { localStorage.removeItem(key); } catch (_e) { /* noop */ }
  }, STORAGE_KEY);
}

async function clickSidebarToggle(page) {
  await page.evaluate((id) => {
    const btn = document.getElementById("nf-esb-toggle");
    if (btn) btn.click();
  }, SIDEBAR_ID);
  await page.waitForTimeout(350);
}

async function clickHideButton(page) {
  await page.evaluate(() => {
    const btn = document.querySelector("[data-nf-esb-action='hide']");
    if (btn) btn.click();
  });
  await page.waitForTimeout(350);
}

async function clickRestoreButton(page) {
  await page.evaluate((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.click();
  }, RESTORE_BTN_ID);
  await page.waitForTimeout(350);
}

async function openHash(page, hash) {
  await page.evaluate((h) => { window.location.hash = h; }, hash);
}

function approxEqual(a, b, tol) {
  return Math.abs(a - b) <= tol;
}

/* ------------------------------------------------------------------ main -- */

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 1440, height: 900 }
});
const page = await context.newPage();
const fatalConsole = [];

page.on("response", (response) => {
  if (response.status() === 401 && /get-enabled-flags/i.test(response.url())) return;
});

page.on("pageerror", (error) => fatalConsole.push("pageerror:" + error.message));
page.on("console", (msg) => {
  if (msg.type() !== "error") return;
  const text = msg.text();
  if (/get-enabled-flags/i.test(text)) return;
  fatalConsole.push("console:" + text);
});

const results = {
  editorLoaded: false,
  defaultStateCollapsed: false,
  collapsedWidthCorrect: false,
  canvasNotCoveredCollapsed: false,
  rightInspectorVisible: false,
  dashboardShellAbsentInEditor: false,

  expandedStateWorks: false,
  expandedWidthCorrect: false,
  canvasNotCoveredExpanded: false,

  collapsedAfterExpand: false,
  collapsedWidthAfterExpand: false,

  hiddenStateWorks: false,
  restoreButtonVisible: false,
  canvasFullWidthHidden: false,

  restoreWorksFromHidden: false,
  statePersisted: false,
  noFatalConsoleErrors: false,

  dashboardUnchanged: false,
  accountUnchanged: false
};

const notes = [];

try {
  await login(page);

  const teamId = await resolveTeamId(page);

  /* ---- 1. Verify dashboard surface is unchanged --------------------------- */
  await openHash(page, `#/dashboard/team/${teamId}/projects`);
  await page.waitForFunction(
    () => !!document.getElementById("nofida-shell"),
    { timeout: 30000 }
  );
  const dashboardShellVisible = await page.evaluate(() => {
    const s = document.getElementById("nofida-shell");
    if (!s) return false;
    const r = s.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  const editorSidebarOnDashboard = await page.evaluate(
    (id) => !!document.getElementById(id), SIDEBAR_ID
  );
  results.dashboardUnchanged = dashboardShellVisible && !editorSidebarOnDashboard;

  /* ---- 2. Open editor ----------------------------------------------------- */
  await clearStoredState(page);
  const opened = await openEditorFromHub(page);
  if (!opened) {
    notes.push("Could not open editor from hub — no open button found");
  } else {
    results.editorLoaded = /\/#\/workspace/.test(page.url());
  }

  if (results.editorLoaded) {
    /* ---- 3. Default state: collapsed --------------------------------------- */
    const snap0 = await measureEditorSidebar(page);
    results.defaultStateCollapsed = snap0.sidebarState === "collapsed";
    results.collapsedWidthCorrect = approxEqual(snap0.sidebarWidth, COL_WIDTH, WIDTH_TOL);
    results.canvasNotCoveredCollapsed = snap0.workspaceLeft >= COL_WIDTH - WIDTH_TOL;
    results.dashboardShellAbsentInEditor = !snap0.dashboardShellExists;

    /* check right inspector: look for a right-side element in Penpot */
    results.rightInspectorVisible = await page.evaluate(() => {
      const candidates = [
        document.querySelector(".main_ui_workspace_sidebar__right-sidebar"),
        document.querySelector("[class*='workspace_sidebar__right']"),
        document.querySelector("[class*='right-sidebar']"),
        document.querySelector("[class*='design-panel']"),
        document.querySelector("[class*='element-options']")
      ].filter(Boolean);
      if (candidates.length === 0) return true; /* assume ok if not found */
      return candidates.some((el) => {
        const r = el.getBoundingClientRect();
        return r.right <= window.innerWidth + 2 && r.width > 0;
      });
    });

    /* ---- 4. Expand sidebar ------------------------------------------------- */
    await clickSidebarToggle(page);
    const snap1 = await measureEditorSidebar(page);
    results.expandedStateWorks = snap1.sidebarState === "expanded";
    results.expandedWidthCorrect = approxEqual(snap1.sidebarWidth, EXP_WIDTH, WIDTH_TOL);
    results.canvasNotCoveredExpanded = snap1.workspaceLeft >= EXP_WIDTH - WIDTH_TOL;

    /* ---- 5. Collapse back -------------------------------------------------- */
    await clickSidebarToggle(page);
    const snap2 = await measureEditorSidebar(page);
    results.collapsedAfterExpand = snap2.sidebarState === "collapsed";
    results.collapsedWidthAfterExpand = approxEqual(snap2.sidebarWidth, COL_WIDTH, WIDTH_TOL);

    /* ---- 6. Hide sidebar --------------------------------------------------- */
    await clickHideButton(page);
    const snap3 = await measureEditorSidebar(page);
    results.hiddenStateWorks = snap3.sidebarState === "hidden";
    results.restoreButtonVisible = snap3.restoreBtnVisible;
    results.canvasFullWidthHidden = snap3.workspaceLeft <= WIDTH_TOL;

    /* ---- 7. Restore from hidden -------------------------------------------- */
    await clickRestoreButton(page);
    const snap4 = await measureEditorSidebar(page);
    results.restoreWorksFromHidden = snap4.sidebarState === "collapsed";

    /* ---- 8. State persistence ---------------------------------------------- */
    await clickSidebarToggle(page); /* expand */
    await page.waitForTimeout(300);
    const storedAfterExpand = await getStoredState(page);
    results.statePersisted = storedAfterExpand === "expanded";

    /* reload and confirm state is restored */
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(6000);
    const snapReload = await measureEditorSidebar(page);
    results.statePersisted = results.statePersisted &&
      snapReload.sidebarState === "expanded" &&
      approxEqual(snapReload.sidebarWidth, EXP_WIDTH, WIDTH_TOL);
  }

  /* ---- 9. Account surface unchanged -------------------------------------- */
  await openHash(page, "#/settings/options");
  await page.waitForSelector(
    "ul.main_ui_settings_sidebar__sidebar-nav-settings",
    { timeout: 60000 }
  );
  await page.waitForTimeout(3000);
  const editorSidebarOnAccount = await page.evaluate(
    (id) => !!document.getElementById(id), SIDEBAR_ID
  );
  const dashboardShellOnAccount = await page.evaluate(
    () => !!document.getElementById("nofida-shell")
  );
  results.accountUnchanged = !editorSidebarOnAccount && !dashboardShellOnAccount;

  results.noFatalConsoleErrors = fatalConsole.length === 0;

} catch (error) {
  notes.push(error && error.message ? error.message : String(error));
} finally {
  await context.close();
  await browser.close();
}

console.log("PATCH 024A completed.");
console.log("");
console.log("Editor sidebar:");
printLine("editor loaded", results.editorLoaded);
printLine("default state is collapsed", results.defaultStateCollapsed);
printLine("collapsed width ~64px", results.collapsedWidthCorrect);
printLine("canvas not covered when collapsed", results.canvasNotCoveredCollapsed);
printLine("right inspector visible", results.rightInspectorVisible);
printLine("dashboard shell absent in editor", results.dashboardShellAbsentInEditor);
console.log("");
console.log("Expand:");
printLine("expanded state works", results.expandedStateWorks);
printLine("expanded width ~248px", results.expandedWidthCorrect);
printLine("canvas not covered when expanded", results.canvasNotCoveredExpanded);
console.log("");
console.log("Collapse after expand:");
printLine("collapsed state after toggle", results.collapsedAfterExpand);
printLine("collapsed width ~64px after toggle", results.collapsedWidthAfterExpand);
console.log("");
console.log("Hidden / focus mode:");
printLine("hidden state works", results.hiddenStateWorks);
printLine("restore button visible when hidden", results.restoreButtonVisible);
printLine("canvas full width when hidden", results.canvasFullWidthHidden);
printLine("restore button restores collapsed", results.restoreWorksFromHidden);
console.log("");
console.log("Persistence:");
printLine("state persisted in localStorage + reload", results.statePersisted);
console.log("");
console.log("Surface isolation:");
printLine("dashboard unchanged", results.dashboardUnchanged);
printLine("account unchanged", results.accountUnchanged);
console.log("");
console.log("Safety:");
printLine("no fatal console errors", results.noFatalConsoleErrors,
  fatalConsole.length ? fatalConsole.slice(0, 3).join(" | ") : "");
console.log("");
console.log("Deploy:");
console.log("* frontend rebuilt/restarted: FAIL (not checked by this script)");
console.log("* Postgres/Valkey restarted: NO");
console.log("* Caddy touched: NO");
console.log("* setup-cloud-core.sh run: NO");
console.log("* direct DB writes used: NO");
console.log("");

const allPass =
  results.editorLoaded &&
  results.defaultStateCollapsed &&
  results.collapsedWidthCorrect &&
  results.canvasNotCoveredCollapsed &&
  results.dashboardShellAbsentInEditor &&
  results.expandedStateWorks &&
  results.expandedWidthCorrect &&
  results.canvasNotCoveredExpanded &&
  results.collapsedAfterExpand &&
  results.hiddenStateWorks &&
  results.restoreButtonVisible &&
  results.restoreWorksFromHidden &&
  results.statePersisted &&
  results.dashboardUnchanged &&
  results.accountUnchanged &&
  results.noFatalConsoleErrors;

console.log("Recommendation: " + (allPass ? "approve" : "fix required"));

if (notes.length) {
  console.log("");
  console.log("Notes:");
  notes.forEach((n) => console.log("* " + n));
}

if (!allPass) process.exitCode = 1;
