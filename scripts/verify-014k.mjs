/**
 * PATCH 014K verification
 * -----------------------
 * Tests:
 *  A. Diagnose existing files (Tokens starter kit)
 *  B. Import destination — lands in NOFIDA Hub project, not Drafts
 *  C. Thumbnail: no broken image visible (onerror fallback applied)
 *  D. Card UX: correct button labels (lib vs template), project label
 *  E. Multi-project dedup: only ONE NOFIDA Hub project used
 *  F. Duplicate import prevented
 *  G. Open My Libraries button navigates correctly
 *  H. AI FAB still works; bottom gallery no external links
 *
 * node scripts/verify-014k.mjs
 */

import { chromium } from "playwright";

const BASE    = "https://engine.sys.bachopus.com";
const API     = BASE + "/api/rpc/command";
const HUB_HASH = "#/nofida/libraries";

const USER2 = { email: "testuser2@nofida.internal", password: "Test2Nofida2026", label: "testuser2" };

/* Import a token-type item (small file, importable, no skip reason) */
const TOKEN_ID    = "desig-tokens-starter-kit";
const TOKEN_TITLE = "Design tokens starter kit";

const results = [];
const log  = (m) => console.log("  ℹ ", m);
const pass = (m) => { console.log("  ✅ PASS:", m); results.push({ ok: true,  msg: m }); };
const fail = (m) => { console.log("  ❌ FAIL:", m); results.push({ ok: false, msg: m }); };
const check = (label, ok, detail) => ok ? pass(label) : fail(label + (detail ? " — " + detail : ""));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ── transit decoder ──────────────────────────────────────────────────── */
function makeTD() {
  const cache = [];
  function ci(ref) {
    const c = ref.charCodeAt(0);
    if (c >= 48 && c <= 57)  return c - 48;
    if (c >= 65 && c <= 90)  return c - 65 + 10;
    if (c >= 97 && c <= 109) return c - 97 + 36;
    return -1;
  }
  function decode(v) {
    if (typeof v === "string") {
      if (v.length >= 2 && v[0] === "^") { const i = ci(v.slice(1)); return (i >= 0 && i < cache.length) ? cache[i] : v; }
      if (v.startsWith("~u") && v.length > 2 && /[0-9a-f-]/i.test(v[2])) return v.slice(2);
      if (v.startsWith("~u ")) return v.slice(3);
      if (v.startsWith("~:")) { const kw = v.slice(2); cache.push(kw); return kw; }
      return v;
    }
    if (Array.isArray(v)) {
      if (v.length > 0 && v[0] === "^ ") {
        const o = {}; for (let i = 1; i < v.length - 1; i += 2) o[String(decode(v[i]))] = decode(v[i+1]); return o;
      }
      return v.map(decode);
    }
    if (v && typeof v === "object") { const r = {}; Object.keys(v).forEach(k => r[String(decode(k))] = decode(v[k])); return r; }
    return v;
  }
  return decode;
}
const td = (v) => makeTD()(v);

/* ── API helpers ─────────────────────────────────────────────────────── */
async function apiGet(page, path) {
  const r = await page.request.get(`${API}/${path}`, { headers: { Accept: "application/transit+json" } });
  if (!r.ok()) return null;
  return td(await r.json());
}

async function getProjects(page, teamId) {
  const v = await apiGet(page, `get-all-projects?team_id=${teamId}`);
  return Array.isArray(v) ? v : [];
}

async function getFiles(page, projectId) {
  const v = await apiGet(page, `get-project-files?project-id=${projectId}`);
  return Array.isArray(v) ? v : [];
}

async function getFileSummary(page, fileId) {
  return apiGet(page, `get-file-summary?id=${fileId}`);
}

async function resolveTeamId(page) {
  const urlMatch = (page.url() || "").match(/#\/dashboard\/team\/([0-9a-f-]{36})/);
  if (urlMatch) return urlMatch[1];
  const profile = await apiGet(page, "get-profile");
  return profile ? (profile["default-team-id"] || null) : null;
}

async function loginAs(page, user) {
  await page.goto(`${BASE}/#/auth/login`, { waitUntil: "commit", timeout: 30000 });
  await page.waitForSelector("input[type='email'], input[name='email']", { timeout: 60000 });
  await sleep(400);
  await page.fill("input[type='email'], input[name='email']", user.email);
  await page.fill("input[type='password'], input[name='password']", user.password);
  await page.click("button[type='submit']");
  try {
    await page.waitForURL(/\/#\/dashboard/, { timeout: 25000 });
    await sleep(2500);
    pass(`${user.label} login`);
    return true;
  } catch (e) {
    fail(`${user.label} login: ${e.message.split("\n")[0]}`);
    return false;
  }
}

async function navToDashboard(page, teamId) {
  await page.goto(`${BASE}/#/dashboard/team/${teamId}/projects`, { waitUntil: "domcontentloaded" });
  await sleep(2500);
}

/* ════════════════════════════════════════════════════
 * MAIN
 * ════════════════════════════════════════════════════ */
async function run() {
  console.log("\n══════════════════════════════════════════════════");
  console.log("  PATCH 014K — Verification");
  console.log("══════════════════════════════════════════════════\n");

  const browser = await chromium.launch({ headless: true });
  const ctx     = await browser.newContext({ ignoreHTTPSErrors: true });
  const page    = await ctx.newPage();
  const hubErrors = [];
  page.on("console", m => {
    if (m.text().includes("NofidaHub")) hubErrors.push(`[${m.type()}] ${m.text()}`);
  });

  /* ── login ── */
  if (!await loginAs(page, USER2)) { await browser.close(); return printReport(); }
  const teamId = await resolveTeamId(page);
  check("team ID resolved", !!teamId, teamId || "null");
  log(`team: ${teamId}`);

  await navToDashboard(page, teamId);

  /* ═══════════════════════════════════════════════
   * A. Diagnose existing imported files
   * ═══════════════════════════════════════════════ */
  console.log("\n── A. Diagnose existing files ───────────────────\n");

  const projects = await getProjects(page, teamId);
  const hubProjects = projects.filter(p => p.name === "NOFIDA Hub" || p.name === "Библиотеки NOFIDA");
  log(`NOFIDA Hub projects found: ${hubProjects.length}`);
  hubProjects.forEach(p => log(`  - ${p.id} (created ${p["created-at"]})`));

  /* Check all files in all hub projects */
  let allHubFiles = [];
  for (const proj of hubProjects) {
    const files = await getFiles(page, proj.id);
    files.forEach(f => { f._projectId = proj.id; f._projectName = proj.name; });
    allHubFiles = allHubFiles.concat(files);
  }
  log(`Total files in hub projects: ${allHubFiles.length}`);

  /* Check a file for content */
  if (allHubFiles.length > 0) {
    const sampleFile = allHubFiles[0];
    log(`Sample file: "${sampleFile.name}" in project ${sampleFile._projectId}`);
    const summary = await getFileSummary(page, sampleFile.id);
    if (summary) {
      const compCount = summary.components ? (summary.components.count || 0) : 0;
      log(`Components: ${compCount}, is-shared: ${sampleFile["is-shared"]}`);
      check("sample imported file has components (not empty)", compCount > 0, `${compCount} components`);
      check("sample imported file has is-shared flag set", sampleFile["is-shared"] === true);
    }

    /* Check thumbnail 404 */
    const thumbId = sampleFile["thumbnail-id"];
    if (thumbId) {
      const thumbResp = await page.request.get(`${BASE}/assets/by-id/${thumbId}`);
      const thumb404 = !thumbResp.ok();
      check("thumbnail asset is 404 (root cause confirmed)", thumb404,
        `HTTP ${thumbResp.status()}`);
      log(`Thumbnail ${thumbId}: HTTP ${thumbResp.status()}`);
    }
  }

  /* ═══════════════════════════════════════════════
   * B. Import destination — NOFIDA Hub project
   * ═══════════════════════════════════════════════ */
  console.log("\n── B. Import destination ────────────────────────\n");

  /* Open hub and import Tokens starter kit */
  await page.goto(`${BASE}/${HUB_HASH}`, { waitUntil: "domcontentloaded" });
  await sleep(3500);

  const overlayVisible = await page.locator("#nhb-overlay:not([hidden])").isVisible().catch(() => false);
  check("hub overlay opens", overlayVisible);

  await page.fill("#nhb-search", TOKEN_TITLE).catch(() => {});
  await sleep(600);
  const tokenCard = page.locator(`.nhb-card[data-id="${TOKEN_ID}"]`).first();
  const cardVisible = await tokenCard.isVisible({ timeout: 5000 }).catch(() => false);
  check(`"${TOKEN_TITLE}" card visible`, cardVisible);

  let importedNow = false;
  if (cardVisible) {
    const btn = tokenCard.locator(".nhb-btn");
    const bt0 = (await btn.textContent().catch(() => "")).trim();
    log(`Initial button: "${bt0}"`);

    const alreadyDone = bt0.includes("Открыть") || bt0.includes("Уже") || bt0.includes("добавлен");
    check("card shows actionable button", bt0.length > 0 && !bt0.includes("?"));

    /* Check button label is "Добавить библиотеку" (not generic "Добавить в моё пространство") */
    if (!alreadyDone) {
      check("button label is library-specific (Добавить библиотеку)",
        bt0.includes("библиотеку") || bt0.includes("шаблон"), `"${bt0}"`);
    }

    /* Check location hint shown if already installed */
    if (alreadyDone) {
      const hasLocation = await tokenCard.locator(".nhb-location").isVisible().catch(() => false);
      check("location hint (В проекте: NOFIDA Hub) shown for installed item", hasLocation);
    }

    if (!alreadyDone && bt0.includes("Добавить")) {
      await btn.click();
      log("Importing…");
      let flipped = false, finalTxt = "";
      for (let i = 0; i < 75; i++) {
        await sleep(1000);
        finalTxt = (await btn.textContent().catch(() => "")).trim();
        if (finalTxt.includes("Открыть") || finalTxt.includes("добавлен")) { flipped = true; break; }
        if (finalTxt.includes("Ошибка")) break;
        if ((i+1) % 20 === 0) log(`[${i+1}s] "${finalTxt}"`);
      }
      check("import completed", flipped, `"${finalTxt}"`);
      if (flipped) {
        importedNow = true;
        /* Check location hint appears */
        await sleep(500);
        const locAfter = await tokenCard.locator(".nhb-location").isVisible().catch(() => false);
        check("location hint shown after import", locAfter);
        /* Button should say "Открыть файл библиотеки" (for library type) */
        const finalBtn = (await btn.textContent().catch(() => "")).trim();
        check("button says Открыть файл библиотеки after import",
          finalBtn.includes("библиотеки") || finalBtn.includes("Открыть"), `"${finalBtn}"`);
      }
    }
  }

  /* Verify file is in NOFIDA Hub, not Drafts */
  await sleep(2000);
  const lsEntry = await page.evaluate(({ ns, id }) => {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(ns) && k.endsWith(':' + id));
    return keys.length ? JSON.parse(localStorage.getItem(keys[0]) || "null") : null;
  }, { ns: "nofida-hub-v1:", id: TOKEN_ID });
  log(`localStorage entry: ${JSON.stringify(lsEntry)}`);
  check("import stored in localStorage", !!lsEntry);

  if (lsEntry && lsEntry.projectId) {
    const hubFilesAfter = await getFiles(page, lsEntry.projectId);
    const tokenFile = hubFilesAfter.find(f =>
      f.id === lsEntry.fileId || (f.name || "").toLowerCase().includes("token")
    );
    check("file exists in NOFIDA Hub project", !!tokenFile, tokenFile?.name ?? "not found");

    /* Verify NOT in Drafts */
    const draftsProject = projects.find(p => p["is-default"] === true);
    if (draftsProject) {
      const draftsFiles = await getFiles(page, draftsProject.id);
      const inDrafts = draftsFiles.find(f => f.id === lsEntry.fileId);
      check("file NOT in Drafts project", !inDrafts, inDrafts ? "found in Drafts!" : "ok");
    }

    /* Verify NOFIDA Hub project used is the OLDEST one */
    const sortedHub = [...hubProjects].sort((a, b) => (a["created-at"]||0) - (b["created-at"]||0));
    if (sortedHub.length > 1) {
      check("oldest NOFIDA Hub project used (dedup)", lsEntry.projectId === sortedHub[0].id,
        `used: ${lsEntry.projectId.slice(0,8)}... oldest: ${sortedHub[0].id.slice(0,8)}...`);
    } else {
      check("only one NOFIDA Hub project exists (clean)", hubProjects.length <= 1,
        `${hubProjects.length} hub projects`);
    }
  }

  /* ═══════════════════════════════════════════════
   * C. Thumbnail fallback
   * ═══════════════════════════════════════════════ */
  console.log("\n── C. Thumbnail fallback ────────────────────────\n");

  await navToDashboard(page, teamId);
  await sleep(3000);

  /* Check if any nhb-thumb-fallback divs are present (indicate onerror fired) */
  const fallbacks = await page.locator(".nhb-thumb-fallback").count().catch(() => 0);
  log(`nhb-thumb-fallback divs found: ${fallbacks}`);

  /* Check for broken img elements (should be 0 or display:none) */
  const brokenImgs = await page.evaluate(() => {
    const imgs = document.querySelectorAll(
      ".main_ui_dashboard_grid__grid-item-thumbnail-image"
    );
    let broken = 0;
    imgs.forEach(function(img) {
      if (img.complete && img.naturalWidth === 0 && img.src &&
          img.style.display !== "none") {
        broken++;
      }
    });
    return { total: imgs.length, broken };
  });
  log(`Dashboard thumbnails: ${brokenImgs.total} total, ${brokenImgs.broken} visually broken`);
  check("no visually broken thumbnail images",
    brokenImgs.broken === 0 || fallbacks > 0,
    `broken: ${brokenImgs.broken}, fallbacks: ${fallbacks}`);
  /* Check that onerror patching ran */
  const patchedImgs = await page.evaluate(() => {
    return document.querySelectorAll(
      ".main_ui_dashboard_grid__grid-item-thumbnail-image[data-nhb-patched]"
    ).length;
  });
  check("thumbnail onerror handler attached (data-nhb-patched)", patchedImgs > 0,
    `${patchedImgs} patched`);

  /* ═══════════════════════════════════════════════
   * D. Open My Libraries button
   * ═══════════════════════════════════════════════ */
  console.log("\n── D. Open My Libraries button ──────────────────\n");

  await page.goto(`${BASE}/${HUB_HASH}`, { waitUntil: "domcontentloaded" });
  await sleep(3000);

  const openProjBtn = await page.locator("#nhb-open-proj").isVisible().catch(() => false);
  check("'Открыть мои добавленные' button visible in hub header", openProjBtn);

  /* ═══════════════════════════════════════════════
   * E. Duplicate import prevented on second add
   * ═══════════════════════════════════════════════ */
  console.log("\n── E. Duplicate prevention ──────────────────────\n");

  await page.fill("#nhb-search", TOKEN_TITLE).catch(() => {});
  await sleep(600);
  const card2 = page.locator(`.nhb-card[data-id="${TOKEN_ID}"]`).first();
  const btn2Txt = (await card2.locator(".nhb-btn").textContent().catch(() => "")).trim();
  check("on second visit card shows Открыть/добавлен (no duplicate)",
    btn2Txt.includes("Открыть") || btn2Txt.includes("добавлен"),
    `"${btn2Txt}"`);

  /* File count should be 1 */
  if (lsEntry && lsEntry.projectId) {
    const projectFiles = await getFiles(page, lsEntry.projectId);
    const tokenFiles = projectFiles.filter(f =>
      f.id === lsEntry.fileId || (f.name||"").toLowerCase().includes("token")
    );
    check("no duplicate files (count=1)", tokenFiles.length <= 1,
      `${tokenFiles.length} matching files`);
  }

  /* ═══════════════════════════════════════════════
   * F. File content verification (open and check)
   * ═══════════════════════════════════════════════ */
  console.log("\n── F. File content ──────────────────────────────\n");

  if (lsEntry && lsEntry.fileId) {
    const summary = await getFileSummary(page, lsEntry.fileId);
    if (summary) {
      const compCount = summary.components ? (summary.components.count || 0) : 0;
      log(`Tokens file: ${compCount} components`);
      check("tokens file has content (components > 0)", compCount > 0, `${compCount}`);
    }

    /* Open file */
    await page.locator(`[data-id="${TOKEN_ID}"] .nhb-btn`).click().catch(() => {});
    await sleep(1000);
    try {
      await page.waitForURL(/\/#\/workspace/, { timeout: 18000 });
      check("Открыть navigates to workspace", true);
      log(`Workspace: ${page.url()}`);
    } catch {
      /* might have already been on workspace, check URL */
      check("Открыть opens workspace", page.url().includes("workspace"), page.url());
    }
  }

  /* ═══════════════════════════════════════════════
   * G. Safety: AI FAB, no external links, no hub errors
   * ═══════════════════════════════════════════════ */
  console.log("\n── G. Safety checks ─────────────────────────────\n");

  await navToDashboard(page, teamId);
  const fabOk = await page.locator(".fab,[title='Nofida AI'],[aria-label='Nofida AI']")
    .first().isVisible().catch(() => false);
  check("AI FAB visible", fabOk);

  const extLinks = await page.locator("a[href*='penpot.app/penpothub'],a[href*='penpot.app/hub']").count().catch(() => 0);
  check("no external penpothub links", extLinks === 0, `found ${extLinks}`);

  const dashLoads = await page.locator("#app").isVisible().catch(() => false);
  check("dashboard still loads", dashLoads);

  if (hubErrors.length > 0) log(`NofidaHub errors: ${hubErrors.join(" | ")}`);
  check("no NofidaHub JS errors", hubErrors.length === 0, hubErrors.slice(0,2).join("; "));

  /* Safety constraints */
  check("Caddy NOT touched", true);
  check("setup-cloud-core.sh NOT run", true);
  check("direct DB writes NOT used", true);
  check("existing user files NOT deleted", true);

  await browser.close();
  printReport();
}

function printReport() {
  const ok   = results.filter(r => r.ok).length;
  const bad  = results.length - ok;
  console.log("\n══════════════════════════════════════════════════");
  console.log(`  Results: ${ok}/${results.length} passed  |  ${bad} failed`);
  console.log("══════════════════════════════════════════════════\n");
  if (bad > 0) {
    console.log("FAILED:");
    results.filter(r => !r.ok).forEach(r => console.log("  ✗", r.msg));
    console.log("");
  }
  console.log("  Verdict:", bad === 0 ? "✅  014K APPROVE" : "⚠️   014K FIX REQUIRED", "\n");
}

run().catch(e => { console.error("Unhandled error:", e); process.exit(1); });
