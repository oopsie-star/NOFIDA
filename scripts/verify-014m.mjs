/**
 * PATCH 014M verification
 * -----------------------
 * Verifies manually ingested modern files through the live NOFIDA Hub add flow.
 *
 * Examples:
 *   node scripts/verify-014m.mjs
 *   node scripts/verify-014m.mjs --id ajeen-icons --store-root /opt/nofida-core/library-store
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const BASE = "https://engine.sys.bachopus.com";
const API = BASE + "/api/rpc/command";
const HUB_HASH = "#/nofida/libraries";
const STORE_NS = "nofida-hub-v1:";
const USER = {
  email: "testuser1@nofida.internal",
  password: "Test1Nofida2026",
  label: "testuser1",
};

function parseArgs(argv) {
  const args = {
    storeRoot: process.env.NOFIDA_LIBRARY_STORE_ROOT || "/opt/nofida-core/library-store",
    ids: [],
    limit: null,
    write: true,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--store-root" && argv[i + 1]) {
      args.storeRoot = argv[++i];
    } else if (arg === "--id" && argv[i + 1]) {
      args.ids.push(argv[++i]);
    } else if (arg === "--limit" && argv[i + 1]) {
      args.limit = Number(argv[++i]);
    } else if (arg === "--no-write") {
      args.write = false;
    }
  }
  return args;
}

function utcNow() {
  return new Date().toISOString().replace(".000Z", "Z");
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
        const idx = cacheIdx(v.slice(1));
        return idx >= 0 && idx < cache.length ? cache[idx] : v;
      }
      if (v.startsWith("~u") && v.length > 2 && /[0-9a-f-]/i.test(v[2])) return v.slice(2);
      if (v.startsWith("~u ")) return v.slice(3);
      if (v.startsWith("~:")) {
        const kw = v.slice(2);
        cache.push(kw);
        return kw;
      }
      return v;
    }
    if (Array.isArray(v)) {
      if (v.length > 0 && v[0] === "^ ") {
        const obj = {};
        for (let i = 1; i < v.length - 1; i += 2) obj[String(decode(v[i]))] = decode(v[i + 1]);
        return obj;
      }
      return v.map(decode);
    }
    if (v && typeof v === "object") {
      const out = {};
      Object.keys(v).forEach((key) => {
        out[String(decode(key))] = decode(v[key]);
      });
      return out;
    }
    return v;
  }
  return decode;
}

function td(v) {
  return makeTD()(v);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonAtomic(filePath, payload) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.tmp-${path.basename(filePath)}-${process.pid}-${Date.now()}`);
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2) + "\n", "utf8");
  JSON.parse(fs.readFileSync(tmp, "utf8"));
  fs.renameSync(tmp, filePath);
}

function buildCatalogStatus(record) {
  switch (record.user_import_status) {
    case "available":
      return "available";
    case "conversion_required":
      return "conversion_required";
    case "large_import_required":
      return "large_import_required";
    case "review_required":
      return "review_required";
    case "rejected":
      return "rejected";
    case "import_failed":
      return "import_failed";
    default:
      break;
  }
  if (["download_failed", "no_download_url", "too_large"].includes(record.user_import_status)) {
    return record.user_import_status;
  }
  if (record.status === "downloaded" && record.file) {
    if (["trademark_review", "needs_license_review", "needs_review"].includes(record.license_status)) {
      return "review_required";
    }
    if (record.file_format === "old_binary_format_v1") return "conversion_required";
    return "available";
  }
  return record.status || "download_failed";
}

function projectInventoryToCatalog(record) {
  return {
    id: record.id,
    title: record.title,
    name: record.name,
    author: record.author,
    type: record.type,
    tier: record.tier,
    hub_url: record.hub_url,
    source_url: record.source_url,
    download_url: record.download_url,
    license: record.license,
    license_status: record.license_status,
    file: record.file,
    internal_url: record.internal_url,
    sha256: record.sha256,
    size_bytes: record.size_bytes,
    status: buildCatalogStatus(record),
    import_skip_reason: record.user_import_reason ?? null,
    file_format: record.file_format ?? null,
    recovery_status: record.recovery_status ?? null,
    recovered_at: record.recovered_at ?? null,
    manual_upload: Boolean(record.manual_upload),
    operator_supplied: Boolean(record.operator_supplied),
    quality_status: record.quality_status ?? null,
    quality_notes: record.quality_notes ?? null,
    open_default_page: record.open_default_page ?? null,
    open_default_page_id: record.open_default_page_id ?? null,
    pages_count: record.pages_count ?? null,
    components_count: record.components_count ?? null,
    useful_pages_count: record.useful_pages_count ?? null,
    broken_media_placeholders: record.broken_media_placeholders ?? null,
    verified_importable: record.verified_importable ?? null,
    import_verification_status: record.import_verification_status ?? null,
    import_verification_checked_at: record.import_verification_checked_at ?? null,
    last_checked_at: record.last_checked_at ?? null,
    vendored_at: record.vendored_at ?? null,
  };
}

function syncCatalogFromInventory(catalog, inventory) {
  const invById = new Map(inventory.items.map((item) => [item.id, item]));
  const seen = new Set();
  const libraries = [];
  for (const item of catalog.libraries || []) {
    const inv = invById.get(item.id);
    if (inv) {
      libraries.push({ ...item, ...projectInventoryToCatalog(inv) });
      seen.add(item.id);
    } else {
      libraries.push(item);
    }
  }
  for (const item of inventory.items) {
    if (!seen.has(item.id)) libraries.push(projectInventoryToCatalog(item));
  }
  return {
    ...catalog,
    generated_at: utcNow(),
    libraries,
  };
}

async function apiGet(page, endpoint) {
  const res = await page.request.get(`${API}/${endpoint}`, {
    headers: { Accept: "application/transit+json" },
  });
  if (!res.ok()) return null;
  return td(await res.json());
}

async function resolveTeamId(page) {
  const urlMatch = (page.url() || "").match(/[#/]dashboard\/team\/([0-9a-f-]{36})/);
  if (urlMatch) return urlMatch[1];
  const profile = await apiGet(page, "get-profile");
  return profile ? profile["default-team-id"] || null : null;
}

async function loginAs(page, user) {
  await page.goto(`${BASE}/#/auth/login`, { waitUntil: "commit", timeout: 30000 });
  await page.waitForSelector("input[type='email'], input[name='email']", { timeout: 60000 });
  await page.fill("input[type='email'], input[name='email']", user.email);
  await page.fill("input[type='password'], input[name='password']", user.password);
  await page.click("button[type='submit']");
  await page.waitForURL(/\/#\/dashboard/, { timeout: 25000 });
  await sleep(2500);
}

async function getProjects(page, teamId) {
  const data = await apiGet(page, `get-all-projects?team_id=${teamId}`);
  return Array.isArray(data) ? data : [];
}

async function getFiles(page, projectId) {
  const data = await apiGet(page, `get-project-files?project-id=${projectId}`);
  return Array.isArray(data) ? data : [];
}

async function ensureHubProject(page, teamId) {
  const projects = await getProjects(page, teamId);
  const hubs = projects.filter((project) => project.name === "NOFIDA Hub");
  hubs.sort((a, b) => (a["created-at"] || 0) - (b["created-at"] || 0));
  if (hubs.length > 0) return hubs[0].id;

  const response = await page.request.post(`${API}/create-project`, {
    headers: {
      "Content-Type": "application/transit+json",
      Accept: "application/transit+json",
    },
    data: JSON.stringify(["^ ", "~:team-id", `~u${teamId}`, "~:name", "NOFIDA Hub"]),
  });
  if (!response.ok()) throw new Error(`create-project ${response.status()}`);
  const project = td(await response.json());
  return project.id;
}

async function openHub(page, teamId) {
  await page.goto(`${BASE}/${HUB_HASH}`, { waitUntil: "domcontentloaded" });
  await sleep(3500);
  const visible = await page.locator("#nhb-overlay:not([hidden])").isVisible().catch(() => false);
  if (!visible) throw new Error("Hub overlay did not open");
  return teamId;
}

async function searchCard(page, item) {
  await page.fill("#nhb-search", item.title || item.id).catch(() => {});
  await sleep(500);
  return page.locator(`.nhb-card[data-id="${item.id}"]`).first();
}

async function getStoredEntry(page, itemId) {
  return page.evaluate(({ ns, id }) => {
    const keys = Object.keys(localStorage).filter((key) => key.startsWith(ns) && key.endsWith(`:${id}`));
    if (!keys.length) return null;
    try {
      return JSON.parse(localStorage.getItem(keys[0]) || "null");
    } catch {
      return null;
    }
  }, { ns: STORE_NS, id: itemId });
}

async function verifyItem(page, item, teamId, hubProjectId) {
  const card = await searchCard(page, item);
  const visible = await card.isVisible({ timeout: 5000 }).catch(() => false);
  if (!visible) {
    return { ok: false, issue: "card missing in hub", duplicatePrevention: false };
  }

  const button = card.locator(".nhb-btn");
  const initialLabel = ((await button.textContent().catch(() => "")) || "").trim();
  let importedNow = false;
  let finalLabel = initialLabel;

  if (/Добавить/i.test(initialLabel)) {
    await button.click();
    for (let i = 0; i < 80; i += 1) {
      await sleep(1000);
      finalLabel = ((await button.textContent().catch(() => "")) || "").trim();
      if (/Открыть/i.test(finalLabel) || /добавлен/i.test(finalLabel)) {
        importedNow = true;
        break;
      }
      if (/Ошибка/i.test(finalLabel)) break;
    }
  }

  const duplicateLabel = importedNow ? finalLabel : initialLabel;
  const duplicatePrevention = /Открыть/i.test(duplicateLabel) || /добавлен/i.test(duplicateLabel);
  let stored = await getStoredEntry(page, item.id);
  if (!stored?.fileId && hubProjectId) {
    const files = await getFiles(page, hubProjectId);
    const wanted = slugify(item.title || item.id);
    const fallback = files.find((file) => {
      const name = slugify(file.name || "");
      return name === wanted || name.includes(slugify(item.id)) || slugify(item.id).includes(name);
    });
    if (fallback) stored = { fileId: fallback.id, projectId: hubProjectId };
  }
  if (!stored?.fileId) {
    return {
      ok: false,
      issue: `no localStorage entry after add flow (${duplicateLabel || "empty label"})`,
      duplicatePrevention,
      importedNow,
    };
  }

  await button.click().catch(() => {});
  await sleep(1000);
  await page.waitForURL(/\/#\/workspace/, { timeout: 20000 });
  await sleep(8000);

  const workspaceLoaded = page.url().includes("workspace");
  const pageHintApplied = item.open_default_page_id
    ? await page.evaluate((pageId) => {
        const target = document.querySelector(`[data-testid="page-${pageId}"]`);
        return Boolean(
          target &&
          (target.classList.contains("main_ui_workspace_sidebar_sitemap__selected") ||
            target.closest(".main_ui_workspace_sidebar_sitemap__selected"))
        );
      }, item.open_default_page_id).catch(() => false)
    : true;

  const summary = stored.fileId ? await apiGet(page, `get-file-summary?id=${stored.fileId}`) : null;
  const fileData = stored.fileId ? await apiGet(page, `get-file?id=${stored.fileId}&project_id=${stored.projectId}`) : null;
  const pagesCount = Array.isArray(fileData?.data?.pages) ? fileData.data.pages.length : null;
  const componentsCount = summary?.components?.count ?? null;

  await openHub(page, teamId);
  const secondCard = await searchCard(page, item);
  const secondLabel = ((await secondCard.locator(".nhb-btn").textContent().catch(() => "")) || "").trim();

  return {
    ok: workspaceLoaded && duplicatePrevention,
    issue: workspaceLoaded ? null : "workspace did not open",
    importedNow,
    duplicatePrevention: duplicatePrevention && /Открыть/i.test(secondLabel),
    pagesCount,
    componentsCount,
    pageHintApplied,
    stored,
    secondLabel,
  };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const storeRoot = path.resolve(args.storeRoot);
  const inventoryPath = path.join(storeRoot, "inventory.json");
  const catalogPath = path.join(storeRoot, "catalog.json");
  const inventory = readJson(inventoryPath);
  const catalog = readJson(catalogPath);
  const inventoryById = new Map(inventory.items.map((item) => [item.id, item]));

  let targets = inventory.items.filter((item) =>
    Boolean(item.manual_upload) &&
    item.internal_url &&
    item.file_format === "modern_penpot_archive"
  );
  if (args.ids.length > 0) {
    const idSet = new Set(args.ids);
    targets = targets.filter((item) => idSet.has(item.id));
  }
  if (Number.isFinite(args.limit) && args.limit !== null) {
    targets = targets.slice(0, Math.max(args.limit, 0));
  }

  console.log(`Targets: ${targets.length}`);
  if (!targets.length) return;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  const results = [];
  try {
    await loginAs(page, USER);
    const teamId = await resolveTeamId(page);
    if (!teamId) throw new Error("Could not resolve team ID");
    const hubProjectId = await ensureHubProject(page, teamId);
    await openHub(page, teamId);

    for (const item of targets) {
      console.log(`\nVerifying ${item.id} ...`);
      const result = await verifyItem(page, item, teamId, hubProjectId).catch((error) => ({
        ok: false,
        issue: error.message,
        duplicatePrevention: false,
      }));
      results.push({ id: item.id, ...result });

      const record = inventoryById.get(item.id);
      if (!record) continue;
      record.verified_importable = Boolean(result.ok);
      record.import_verification_status = result.ok ? "verified" : "import_failed";
      record.import_verification_checked_at = utcNow();
      if (result.pagesCount !== null && result.pagesCount !== undefined) record.pages_count = result.pagesCount;
      if (result.componentsCount !== null && result.componentsCount !== undefined) {
        record.components_count = result.componentsCount;
      }
      if (!result.ok) {
        record.quality_status = "import_failed";
        record.user_import_status = "import_failed";
        record.user_import_reason = "manual_import_failed";
      }
      if (item.open_default_page_id && !result.pageHintApplied) {
        record.quality_notes = [record.quality_notes, "workspace page hint did not apply during verification"]
          .filter(Boolean)
          .join(" | ");
      }
    }
  } finally {
    await browser.close();
  }

  if (args.write) {
    const nextCatalog = syncCatalogFromInventory(catalog, inventory);
    writeJsonAtomic(inventoryPath, inventory);
    writeJsonAtomic(catalogPath, nextCatalog);
  }

  console.log("\nResults");
  for (const result of results) {
    const status = result.ok ? "PASS" : "FAIL";
    console.log(
      `${status} ${result.id}` +
      ` | duplicate=${result.duplicatePrevention ? "yes" : "no"}` +
      ` | page-hint=${result.pageHintApplied === false ? "miss" : "ok"}` +
      ` | pages=${result.pagesCount ?? "?"}` +
      ` | components=${result.componentsCount ?? "?"}` +
      `${result.issue ? ` | issue=${result.issue}` : ""}`
    );
  }
}

run().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
