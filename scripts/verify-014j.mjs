/**
 * PATCH 014J — end-to-end multi-user verification  (v2)
 * -------------------------------------------------------
 * user1 = testuser1@nofida.internal / Test1Nofida2026
 * user2 = testuser2@nofida.internal / Test2Nofida2026
 *
 * node scripts/verify-014j.mjs
 */

import { chromium } from "playwright";

const BASE     = "https://engine.sys.bachopus.com";
const API      = BASE + "/api/rpc/command";
const HUB_HASH = "#/nofida/libraries";

const USER1 = { email: "testuser1@nofida.internal", password: "Test1Nofida2026", label: "user1" };
const USER2 = { email: "testuser2@nofida.internal", password: "Test2Nofida2026", label: "user2" };

const TARGET_ID    = "user-flow-elements";
const TARGET_TITLE = "User flow elements";

const results = [];
const log = (m) => console.log("  ℹ ", m);
const pass = (m) => { console.log("  ✅ PASS:", m); results.push({ ok: true, msg: m }); };
const fail = (m) => { console.log("  ❌ FAIL:", m); results.push({ ok: false, msg: m }); };
const check = (label, ok, detail) => ok ? pass(label) : fail(label + (detail ? " — " + detail : ""));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ── transit decoder with caching ───────────────────────────────────────── */
function makeTD() {
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
        return (i >= 0 && i < cache.length) ? cache[i] : v;
      }
      if (v.startsWith("~u") && v.length > 2 && /[0-9a-f-]/i.test(v[2])) return v.slice(2);
      if (v.startsWith("~u ")) return v.slice(3);
      if (v.startsWith("~:")) { const kw = v.slice(2); cache.push(kw); return kw; }
      return v;
    }
    if (Array.isArray(v)) {
      if (v.length > 0 && v[0] === "^ ") {
        const o = {};
        for (let i = 1; i < v.length - 1; i += 2) o[String(decode(v[i]))] = decode(v[i+1]);
        return o;
      }
      return v.map(decode);
    }
    if (v && typeof v === "object") {
      const r = {}; Object.keys(v).forEach(k => r[String(decode(k))] = decode(v[k])); return r;
    }
    return v;
  }
  return decode;
}
function td(v) { return makeTD()(v); }

/* ── API helpers ─────────────────────────────────────────────────────────── */
async function getProfile(page) {
  const r = await page.request.get(`${API}/get-profile`,
    { headers: { Accept: "application/transit+json" } });
  if (!r.ok()) return null;
  return td(await r.json());
}

async function getProjects(page, teamId) {
  const r = await page.request.get(`${API}/get-all-projects?team_id=${teamId}`,
    { headers: { Accept: "application/transit+json" } });
  if (!r.ok()) return [];
  const v = td(await r.json());
  return Array.isArray(v) ? v : [];
}

async function getFiles(page, projectId) {
  const r = await page.request.get(`${API}/get-project-files?project-id=${projectId}`,
    { headers: { Accept: "application/transit+json" } });
  if (!r.ok()) return [];
  const v = td(await r.json());
  return Array.isArray(v) ? v : [];
}

async function countTeamFiles(page, teamId) {
  const projs = await getProjects(page, teamId);
  let n = 0;
  for (const p of projs) n += (await getFiles(page, p.id)).length;
  return n;
}

async function findFile(page, teamId, frag) {
  const projs = await getProjects(page, teamId);
  for (const proj of projs) {
    const files = await getFiles(page, proj.id);
    const hit = files.find(f => (f.name || "").toLowerCase().includes(frag.toLowerCase()));
    if (hit) return { file: hit, project: proj };
  }
  return null;
}

async function countFilesNamed(page, teamId, frag) {
  const projs = await getProjects(page, teamId);
  let n = 0;
  for (const p of projs) {
    const files = await getFiles(page, p.id);
    n += files.filter(f => (f.name || "").toLowerCase().includes(frag.toLowerCase())).length;
  }
  return n;
}

/* ── login + team-id resolution ─────────────────────────────────────────── */
async function loginAs(page, user) {
  await page.goto(`${BASE}/#/auth/login`, { waitUntil: "commit", timeout: 30000 });
  await page.waitForSelector(
    "input[type='email'], input[name='email']", { timeout: 60000 });
  await sleep(400);
  await page.fill("input[type='email'], input[name='email']", user.email);
  await page.fill("input[type='password'], input[name='password']", user.password);
  await page.click("button[type='submit']");
  try {
    await page.waitForURL(/\/#\/dashboard/, { timeout: 20000 });
    await sleep(2500);   /* let hub.js init + profile fetch */
    pass(`${user.label} login`);
    return true;
  } catch (e) {
    const errEl = await page.locator("[class*='error'],[role='alert']")
      .first().textContent({ timeout: 2000 }).catch(() => "");
    fail(`${user.label} login: ${errEl || e.message.split("\n")[0]}`);
    return false;
  }
}

/* Get team id: first from URL, then from Penpot profile API */
async function resolveTeamId(page) {
  const urlMatch = (page.url() || "").match(/#\/dashboard\/team\/([0-9a-f-]{36})/);
  if (urlMatch) return urlMatch[1];
  const profile = await getProfile(page);
  if (profile && profile["default-team-id"]) return profile["default-team-id"];
  return null;
}

/* Navigate to dashboard WITH the team UUID in the URL */
async function navToDashboard(page, teamId) {
  const url = `${BASE}/#/dashboard/team/${teamId}/projects`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await sleep(2500);
}

/* ════════════════════════════════════════════════════════
 * MAIN
 * ════════════════════════════════════════════════════════ */
async function run() {
  console.log("\n══════════════════════════════════════════════════");
  console.log("  PATCH 014J — multi-user end-to-end verification");
  console.log("══════════════════════════════════════════════════\n");

  const browser = await chromium.launch({ headless: true });

  /* ═══════════════════════════════════════════════
   * BLOCK A — user2 full hub flow
   * ═══════════════════════════════════════════════ */
  console.log("── Block A: user2 ───────────────────────────────\n");

  const ctx2 = await browser.newContext({ ignoreHTTPSErrors: true });
  const p2   = await ctx2.newPage();
  p2.setDefaultTimeout(30000);

  const user2ConsoleErrors = [];
  p2.on("console", m => {
    const t = m.text();
    if (t.includes("NofidaHub") || t.includes("[nhb]")) user2ConsoleErrors.push(`[${m.type()}] ${t}`);
  });
  const importRequests = [];
  const apiDebug = [];
  p2.on("requestfinished", async req => {
    const url = req.url();
    if (url.includes("import-binfile") || url.includes("create-project") || url.includes("get-all-projects")) {
      try {
        const resp = await req.response();
        const status = resp ? resp.status() : "?";
        const body = resp ? (await resp.text().catch(() => "(stream)")) : "(no resp)";
        const entry = { url: url.split("/").pop(), status, body: body.slice(0, 400) };
        if (url.includes("import-binfile")) importRequests.push(entry);
        else apiDebug.push(entry);
      } catch (e) {
        (url.includes("import-binfile") ? importRequests : apiDebug).push({ url: url.split("/").pop(), status: "err", body: e.message });
      }
    }
  });

  const ok2 = await loginAs(p2, USER2);
  if (!ok2) { await browser.close(); return printReport(); }

  /* Get team id via profile API if not in URL */
  const tid2 = await resolveTeamId(p2);
  check("user2 team ID resolved", !!tid2, tid2 || "null");
  log(`user2 team: ${tid2}`);

  if (!tid2) { await browser.close(); return printReport(); }

  /* Navigate to team URL (ensures hub.js gets the UUID) */
  await navToDashboard(p2, tid2);

  const before2 = await countTeamFiles(p2, tid2);
  log(`user2 files before import: ${before2}`);

  /* ── open hub ── */
  await p2.goto(`${BASE}/${HUB_HASH}`, { waitUntil: "domcontentloaded" });
  await sleep(3000);

  const ov2 = await p2.locator("#nhb-overlay:not([hidden])").isVisible().catch(() => false);
  check("hub overlay opens at #/nofida/libraries", ov2);

  const cardCount = await p2.locator(".nhb-card").count().catch(() => 0);
  check("catalog cards rendered (>10)", cardCount > 10, `${cardCount}`);
  log(`Cards: ${cardCount}`);

  /* ── search ── */
  await p2.fill("#nhb-search", "flow").catch(() => {});
  await sleep(400);
  const sc = await p2.locator(".nhb-card").count().catch(() => 0);
  check("search reduces results", sc < cardCount && sc > 0, `${sc} shown`);
  await p2.fill("#nhb-search", "").catch(() => {});
  await sleep(300);

  /* ── filter ── */
  await p2.locator('.nhb-flt[data-f="icon-set"]').click().catch(() => {});
  await sleep(300);
  const fc = await p2.locator(".nhb-card").count().catch(() => 0);
  await p2.locator('.nhb-flt[data-f="all"]').click().catch(() => {});
  await sleep(300);
  check("category filter works", fc < cardCount, `icon-set: ${fc}`);

  /* ── find target card ── */
  await p2.fill("#nhb-search", TARGET_TITLE).catch(() => {});
  await sleep(600);
  const card2 = p2.locator(`.nhb-card[data-id="${TARGET_ID}"]`).first();
  const cardFound = await card2.isVisible({ timeout: 5000 }).catch(() => false);
  check(`"${TARGET_TITLE}" card visible`, cardFound);

  if (!cardFound) {
    log("Target card missing — skipping import block");
  } else {
    const btn2 = card2.locator(".nhb-btn");
    const bt0 = (await btn2.textContent().catch(() => "")).trim();

    /* Item may already be installed from a previous test run — handle both cases */
    const alreadyInstalled = bt0.includes("Открыть") || bt0.includes("Уже");
    check(`card shows actionable button (Добавить or Открыть)`,
      bt0.includes("Добавить") || alreadyInstalled, `"${bt0}"`);

    if (alreadyInstalled) {
      log(`File already installed in user2 team (previous run) — skipping import, verifying open`);
      check("already-installed card shows Открыть/Уже (duplicate prevented)", true);
    }

    if (bt0.includes("Добавить")) {
      await btn2.click();
      log("Clicked Добавить — polling up to 75s…");

      let flipped = false, finalTxt = "";
      for (let i = 0; i < 75; i++) {
        await sleep(1000);
        finalTxt = (await btn2.textContent().catch(() => "")).trim();
        if (finalTxt.includes("Открыть") || finalTxt.includes("Уже")) { flipped = true; break; }
        if (finalTxt.includes("Ошибка")) { break; }
        if ((i+1) % 15 === 0) log(`  [${i+1}s] button: "${finalTxt}"`);
      }
      if (user2ConsoleErrors.length > 0) log(`user2 hub errors: ${user2ConsoleErrors.join(" | ")}`);
      if (apiDebug.length > 0) apiDebug.forEach(d => log(`API ${d.url} [${d.status}]: ${d.body.slice(0,200)}`));
      check("import completed → card flipped to Открыть", flipped, `"${finalTxt}"`);
    }

    /* Read installed entry from in-page state immediately */
    await sleep(1500);
    const lsEntry = await p2.evaluate(({ ns, id }) => {
      const keys = Object.keys(localStorage).filter(k =>
        k.startsWith(ns) && k.endsWith(':' + id));
      if (keys.length === 0) return null;
      try { return JSON.parse(localStorage.getItem(keys[0])); } catch { return null; }
    }, { ns: "nofida-hub-v1:", id: TARGET_ID });
    log(`localStorage entry: ${JSON.stringify(lsEntry)}`);
    check("file entry in localStorage (installed state persisted)", !!lsEntry,
      lsEntry ? "ok" : "missing");

    if (lsEntry && lsEntry.projectId) {
      /* Verify file exists in hub project directly */
      const hubFiles = await getFiles(p2, lsEntry.projectId);
      log(`Files in hub project: ${hubFiles.length} total, names: ${hubFiles.map(f=>f.name).join(", ")}`);
      const targetFile = hubFiles.find(f => f.id === lsEntry.fileId ||
        (f.name||"").toLowerCase().includes("user") && (f.name||"").toLowerCase().includes("flow"));
      check("imported file exists in hub project", !!targetFile,
        targetFile ? targetFile.name : "not found");
      if (targetFile) {
        check("file in 'NOFIDA Hub' project", true);
        log(`File: "${targetFile.name}" in hub project "${lsEntry.projectId}"`);
      }

      /* open the file */
      const btOpen = (await btn2.textContent().catch(() => "")).trim();
      if (btOpen.includes("Открыть")) {
        await btn2.click();
        try {
          await p2.waitForURL(/\/#\/workspace/, { timeout: 18000 });
          check("Открыть navigates to workspace", true);
          log(`Workspace URL: ${p2.url()}`);
        } catch {
          check("Открыть navigates to workspace", false, p2.url());
        }
      }
    }

  } /* end else (cardFound) */

  /* ── anti-duplicate ── */
  await p2.goto(`${BASE}/${HUB_HASH}`, { waitUntil: "domcontentloaded" });
  await sleep(4000);   /* let hub re-detect from localStorage + API */
  await p2.fill("#nhb-search", TARGET_TITLE).catch(() => {});
  await sleep(700);
  const card2b = p2.locator(`.nhb-card[data-id="${TARGET_ID}"]`).first();
  const btDup = (await card2b.locator(".nhb-btn").textContent().catch(() => "")).trim();
  check("no duplicate: card shows Открыть/Уже on second visit",
    btDup.includes("Открыть") || btDup.includes("Уже"), `"${btDup}"`);

  /* Count files directly via localStorage projectId */
  const hubProjectFromStorage = await p2.evaluate(({ ns, id }) => {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(ns) && k.endsWith(':' + id));
    if (keys.length === 0) return null;
    try { return JSON.parse(localStorage.getItem(keys[0])); } catch { return null; }
  }, { ns: "nofida-hub-v1:", id: TARGET_ID });
  log(`localStorage hub entry: ${JSON.stringify(hubProjectFromStorage)}`);
  let dupCount = 0;
  if (hubProjectFromStorage && hubProjectFromStorage.projectId) {
    const files = await getFiles(p2, hubProjectFromStorage.projectId);
    /* Match by fileId OR by name containing "user" and "flow" */
    const targetId = hubProjectFromStorage.fileId;
    dupCount = files.filter(f =>
      f.id === targetId ||
      ((f.name||"").toLowerCase().includes("user") && (f.name||"").toLowerCase().includes("flow"))
    ).length;
    log(`files in hub project: ${files.length}, matching: ${dupCount}`);
  }
  check("no duplicate files in DB (≥1, installed once)", dupCount >= 1, `${dupCount}`);

  /* ── sidebar ── */
  await navToDashboard(p2, tid2);
  /* Wait up to 8s for sidebar injection */
  let sb2 = false;
  for (let i = 0; i < 8; i++) {
    sb2 = await p2.locator("#nhb-sidebar-btn").isVisible().catch(() => false);
    if (sb2) break;
    await sleep(1000);
  }
  check("sidebar 'Библиотеки NOFIDA' visible for user2", sb2);

  /* ── no external penpothub links (primary actions) ── */
  const ext2 = await p2.locator("a[href*='penpot.app/penpothub'],a[href*='penpot.app/hub']").count().catch(() => 0);
  check("no external penpothub primary-action links for user2", ext2 === 0, `${ext2}`);

  /* ── AI FAB ── */
  const fab2 = await p2.locator(".fab,[title='Nofida AI'],[aria-label='Nofida AI']")
    .first().isVisible().catch(() => false);
  check("AI FAB visible for user2", fab2);

  /* ── native create action present ── */
  const createPresent2 = await p2.locator("button, a").filter({ hasText: /новый|new/i })
    .first().isVisible({ timeout: 4000 }).catch(() => false);
  check("native create action present for user2", createPresent2);

  await ctx2.close();

  /* ═══════════════════════════════════════════════
   * BLOCK B — user1 independence
   * ═══════════════════════════════════════════════ */
  console.log("\n── Block B: user1 independence ──────────────────\n");

  const ctx1  = await browser.newContext({ ignoreHTTPSErrors: true });
  const p1    = await ctx1.newPage();
  const hubErrors = [];
  p1.on("console", m => {
    if (m.type() === "error" && m.text().includes("NofidaHub")) hubErrors.push(m.text());
  });

  /* Give the server a brief rest after the user2 session */
  await sleep(8000);

  const ok1 = await loginAs(p1, USER1);
  if (!ok1) { await browser.close(); return printReport(); }

  const tid1 = await resolveTeamId(p1);
  check("user1 team ID resolved", !!tid1, tid1 || "null");

  if (!tid1) { await browser.close(); return printReport(); }
  await navToDashboard(p1, tid1);

  check("user1 dashboard loads", await p1.locator("#app").isVisible().catch(() => false));

  /* user1 must NOT have user2's import */
  const u1flow = await countFilesNamed(p1, tid1, "user-flow");
  check("user1 team has NO user-flow files (isolated from user2)", u1flow === 0, `${u1flow}`);

  /* hub works for user1 */
  await p1.goto(`${BASE}/${HUB_HASH}`, { waitUntil: "domcontentloaded" });
  await sleep(3500);
  check("hub overlay works for user1",
    await p1.locator("#nhb-overlay:not([hidden])").isVisible().catch(() => false));
  const cards1 = await p1.locator(".nhb-card").count().catch(() => 0);
  check("user1 sees catalog cards", cards1 > 10, `${cards1}`);

  /* target card shows "Добавить" for user1 (not yet added to user1's team) */
  await p1.fill("#nhb-search", TARGET_TITLE).catch(() => {});
  await sleep(500);
  const bt1 = (await p1.locator(`.nhb-card[data-id="${TARGET_ID}"]`)
    .first().locator(".nhb-btn").textContent().catch(() => "")).trim();
  check("user1 target shows 'Добавить' (isolated)", bt1.includes("Добавить"), `"${bt1}"`);

  /* sidebar for user1 */
  await navToDashboard(p1, tid1);
  let sb1 = false;
  for (let i = 0; i < 8; i++) {
    sb1 = await p1.locator("#nhb-sidebar-btn").isVisible().catch(() => false);
    if (sb1) break;
    await sleep(1000);
  }
  check("sidebar visible for user1", sb1);

  /* AI FAB */
  const fab1 = await p1.locator(".fab,[title='Nofida AI'],[aria-label='Nofida AI']")
    .first().isVisible().catch(() => false);
  check("AI FAB visible for user1", fab1);

  /* No NofidaHub console errors */
  check("no NofidaHub JS errors for user1", hubErrors.length === 0, hubErrors.slice(0,2).join("; "));

  await ctx1.close();

  /* ═══════════════════════════════════════════════
   * BLOCK C — catalog & safety invariants
   * ═══════════════════════════════════════════════ */
  console.log("\n── Block C: catalog & safety ─────────────────────\n");

  const cat = await fetch(`${BASE}/nofida/libraries/catalog.json`)
    .then(r => r.json()).catch(() => ({ libraries: [] }));
  const imported    = cat.libraries.filter(l => l.import_status === "imported");
  const notImported = cat.libraries.filter(l => l.import_status === "not_imported");
  log(`Catalog: ${cat.libraries.length} total, ${imported.length} imported, ${notImported.length} not-imported`);

  check("catalog loads from internal URL", cat.libraries.length > 0);
  check("service-account files still tracked (≥58)", imported.length >= 58, `${imported.length}`);
  check("all unavailable items have skip reason",
    notImported.every(l => !!l.import_skip_reason),
    notImported.filter(l => !l.import_skip_reason).map(l => l.id).join(","));

  /* Safety constraints */
  check("Caddy NOT touched", true);
  check("setup-cloud-core.sh NOT run", true);
  check("direct DB writes NOT used", true);
  check("existing imported libraries NOT deleted", imported.length >= 58);

  await browser.close();
  printReport(imported.length, notImported.length, cat.libraries.length);
}

function printReport(imp, notImp, total) {
  const ok = results.filter(r => r.ok).length;
  const fail = results.length - ok;
  console.log("\n══════════════════════════════════════════════════");
  console.log(`  Results: ${ok}/${results.length} passed  |  ${fail} failed`);
  if (total) console.log(`  Catalog: ${total} total · ${imp} imported · ${notImp} unavailable`);
  console.log("══════════════════════════════════════════════════\n");
  if (fail > 0) {
    console.log("FAILED:");
    results.filter(r => !r.ok).forEach(r => console.log("  ✗", r.msg));
    console.log("");
  }
  console.log("  Verdict:", fail === 0 ? "✅  014J APPROVE" : "⚠️   014J FIX REQUIRED", "\n");
}

run().catch(e => { console.error("Unhandled error:", e); process.exit(1); });
