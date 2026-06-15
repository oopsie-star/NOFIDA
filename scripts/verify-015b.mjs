import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE = "https://engine.sys.bachopus.com";
const API = `${BASE}/api/rpc/command`;
const HUB_HASH = "#/nofida/libraries";
const STORE_NS = "nofida-hub-v1:";
const DEFAULT_TARGETS = ["tailwind-kit", "material-design-3", "lucide-icons", "heroicons"];
const USER1 = { email: "testuser1@nofida.internal", password: "Test1Nofida2026", label: "user1" };
const USER2 = { email: "testuser2@nofida.internal", password: "Test2Nofida2026", label: "user2" };

function parseArgs(argv) {
  const args = {
    storeRoot: process.env.NOFIDA_LIBRARY_STORE_ROOT || "/opt/nofida-core/library-store",
    ids: DEFAULT_TARGETS.slice(),
    write: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--store-root" && argv[index + 1]) {
      args.storeRoot = argv[++index];
    } else if (arg === "--id" && argv[index + 1]) {
      if (args.ids.join(",") === DEFAULT_TARGETS.join(",")) args.ids = [];
      args.ids.push(argv[++index]);
    } else if (arg === "--no-write") {
      args.write = false;
    }
  }

  return args;
}

function utcNow() {
  return new Date().toISOString().replace(".000Z", "Z");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function gotoWithRetry(page, url, options = {}, attempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await page.goto(url, options);
      return;
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      await sleep(1500 * attempt);
    }
  }

  throw lastError;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\.penpot$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

function collectSlugCandidates(item) {
  const values = [
    item.title,
    item.name,
    item.id,
    item.verified_file_name,
    item.penpot_file_name,
    item.file_name,
  ];

  return new Set(values.map((value) => slugify(value)).filter(Boolean));
}

function makeTD() {
  const cache = [];

  function cacheIdx(ref) {
    const decodeChar = (char) => {
      const code = char.charCodeAt(0);
      if (code >= 48 && code <= 57) return code - 48;
      if (code >= 65 && code <= 90) return code - 65 + 10;
      if (code >= 97 && code <= 109) return code - 97 + 36;
      return -1;
    };

    if (!ref.length) return -1;
    if (ref.length === 1) return decodeChar(ref);
    const hi = decodeChar(ref[0]);
    const lo = decodeChar(ref[1]);
    if (hi < 0 || lo < 0) return -1;
    return hi * 44 + lo;
  }

  function decode(value) {
    if (typeof value === "string") {
      if (value.length >= 2 && value[0] === "^") {
        const idx = cacheIdx(value.slice(1));
        return idx >= 0 && idx < cache.length ? cache[idx] : value;
      }
      if (value.startsWith("~u") && value.length > 2 && /[0-9a-f-]/i.test(value[2])) return value.slice(2);
      if (value.startsWith("~u ")) return value.slice(3);
      if (value.startsWith("~:")) {
        const keyword = value.slice(2);
        cache.push(keyword);
        return keyword;
      }
      return value;
    }

    if (Array.isArray(value)) {
      if (value.length > 0 && value[0] === "^ ") {
        const out = {};
        for (let index = 1; index < value.length - 1; index += 2) {
          out[String(decode(value[index]))] = decode(value[index + 1]);
        }
        return out;
      }
      return value.map(decode);
    }

    if (value && typeof value === "object") {
      const out = {};
      Object.keys(value).forEach((key) => {
        out[String(decode(key))] = decode(value[key]);
      });
      return out;
    }

    return value;
  }

  return decode;
}

function td(value) {
  return makeTD()(value);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function resolveJsonPath(storeRoot, preferredNames) {
  for (const name of preferredNames) {
    const candidate = path.join(storeRoot, name);
    if (fs.existsSync(candidate)) return candidate;
  }

  return path.join(storeRoot, preferredNames[0]);
}

function writeJsonAtomic(filePath, payload) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.tmp-${path.basename(filePath)}-${process.pid}-${Date.now()}`);
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2) + "\n", "utf8");
  JSON.parse(fs.readFileSync(tmp, "utf8"));
  fs.renameSync(tmp, filePath);
}

function catalogStatus(record) {
  const state = record.user_import_status;
  if (state === "available") return "available";
  if (state === "conversion_required") return "conversion_required";
  if (state === "large_import_required") return "large_import_required";
  if (state === "review_required") return "review_required";
  if (state === "rejected") return "rejected";
  if (state === "import_failed") return "import_failed";
  if (["download_failed", "no_download_url", "too_large"].includes(state)) return state;
  return record.status || "download_failed";
}

function catalogFormat(record) {
  if (record.import_adapter === "native" && record.native_import_verified) {
    if (record.file_format === "old_binary_format_v1") return "v1_legacy_supported";
    if (record.file_format === "modern_penpot_archive") return "v3_zip";
  }
  return record.file_format || null;
}

function inventoryToCatalogRecord(record) {
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
    status: catalogStatus(record),
    import_skip_reason: record.user_import_reason ?? null,
    file_format: record.file_format ?? null,
    format: catalogFormat(record),
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
    verified_file_name: record.verified_file_name ?? null,
    import_adapter: record.import_adapter ?? null,
    native_import_verified: record.native_import_verified ?? null,
    verified_at: record.verified_at ?? null,
    thumbnail_status: record.thumbnail_status ?? null,
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
      libraries.push({ ...item, ...inventoryToCatalogRecord(inv) });
      seen.add(item.id);
    } else {
      libraries.push(item);
    }
  }

  for (const item of inventory.items) {
    if (!seen.has(item.id)) libraries.push(inventoryToCatalogRecord(item));
  }

  return {
    ...catalog,
    generated_at: utcNow(),
    libraries,
  };
}

function promoteNativeAvailability(record) {
  const now = utcNow();
  record.import_adapter = "native";
  record.native_import_verified = true;
  record.verified_at = now;
  record.thumbnail_status = record.thumbnail_status || "pending";
  record.verified_importable = true;
  record.import_verification_status = "verified";
  record.import_verification_checked_at = now;
  record.user_import_status = "available";
  record.user_import_reason = null;
}

async function apiGet(page, endpoint) {
  const response = await page.request.get(`${API}/${endpoint}`, {
    headers: { Accept: "application/transit+json" },
  });
  if (!response.ok()) return null;
  return td(await response.json());
}

async function resolveTeamId(page) {
  const urlMatch = (page.url() || "").match(/[#/]dashboard\/team\/([0-9a-f-]{36})/);
  if (urlMatch) return urlMatch[1];
  const profile = await apiGet(page, "get-profile");
  return profile ? profile["default-team-id"] || null : null;
}

async function loginAs(page, user) {
  await gotoWithRetry(page, `${BASE}/#/auth/login`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("input[type='email'], input[name='email']", { timeout: 60000 });
  await page.fill("input[type='email'], input[name='email']", user.email);
  await page.fill("input[type='password'], input[name='password']", user.password);
  await page.click("button[type='submit']");
  await page.waitForURL(/\/#\/dashboard/, { timeout: 30000 });
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
  hubs.sort((left, right) => (left["created-at"] || 0) - (right["created-at"] || 0));
  if (hubs.length > 0) return hubs[0].id;
  throw new Error("NOFIDA Hub project is missing");
}

async function openHub(page) {
  await gotoWithRetry(page, `${BASE}/${HUB_HASH}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await sleep(3000);
  const visible = await page.locator("#nhb-overlay:not([hidden])").isVisible().catch(() => false);
  if (!visible) throw new Error("Hub overlay did not open");
}

async function searchCard(page, item) {
  await page.fill("#nhb-search", item.title || item.id).catch(() => {});
  await sleep(500);
  return page.locator(`.nhb-card[data-id="${item.id}"]`).first();
}

async function getStoredEntry(page, itemId) {
  return page.evaluate(({ ns, id }) => {
    const key = Object.keys(localStorage).find((entry) => entry.startsWith(ns) && entry.endsWith(`:${id}`));
    if (!key) return null;
    try {
      return JSON.parse(localStorage.getItem(key) || "null");
    } catch {
      return null;
    }
  }, { ns: STORE_NS, id: itemId });
}

function classifyButtonLabel(label) {
  if (/Ошибка/i.test(label)) return "error";
  if (/Добавить/i.test(label)) return "add";
  if (/Открыть|Уже добавлено/i.test(label)) return "open";
  return "unknown";
}

async function waitForCardAction(button, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let lastLabel = "";

  while (Date.now() < deadline) {
    lastLabel = ((await button.textContent().catch(() => "")) || "").trim();
    const action = classifyButtonLabel(lastLabel);
    if (action !== "unknown") {
      return { action, label: lastLabel };
    }
    await sleep(500);
  }

  return { action: classifyButtonLabel(lastLabel), label: lastLabel };
}

async function resolveInstalledEntry(page, item, projectId) {
  const cached = await getStoredEntry(page, item.id);
  if (cached?.fileId && cached?.projectId) return cached;

  const files = await getFiles(page, projectId);
  const candidates = collectSlugCandidates(item);
  const match = files.find((file) => candidates.has(slugify(file.name)));
  if (!match) return null;

  return {
    fileId: match.id,
    projectId,
    fileName: match.name,
    sharedLibraryStatus: match["is-shared"] ? "enabled" : "disabled",
  };
}

async function verifyDuplicatePrevention(page, item, teamId, projectId) {
  const response = await page.request.post(`${BASE}/api/nofida/hub/import`, {
    headers: { "Content-Type": "application/json" },
    data: {
      catalog_item_id: item.id,
      team_id: teamId,
      project_id: projectId,
    },
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const ok = response.ok() &&
    payload?.ok === true &&
    payload?.status === "already_installed" &&
    payload?.duplicate_prevented === true;

  return {
    ok,
    statusCode: response.status(),
    status: payload?.status ?? null,
    duplicatePrevented: payload?.duplicate_prevented ?? null,
    payload,
  };
}

async function getFileSummary(page, fileId) {
  return apiGet(page, `get-file-summary?id=${fileId}`);
}

async function getFileData(page, fileId, projectId) {
  return apiGet(page, `get-file?id=${fileId}&project_id=${projectId}`);
}

async function getThumbnailStatus(page, fileId, projectId) {
  const files = await getFiles(page, projectId);
  const file = files.find((entry) => entry.id === fileId) || null;
  const thumbnailId = file?.["thumbnail-id"] || null;
  if (!thumbnailId) return { status: "pending", thumbnailId: null };
  const response = await page.request.fetch(`${BASE}/assets/by-id/${thumbnailId}`, { method: "HEAD" }).catch(() => null);
  return {
    status: response && response.ok() ? "ready" : "pending",
    thumbnailId,
  };
}

async function importFromHub(page, item, teamId, expectAdd = true) {
  await openHub(page);
  const card = await searchCard(page, item);
  const visible = await card.isVisible({ timeout: 5000 }).catch(() => false);
  if (!visible) {
    return { ok: false, issue: "card missing" };
  }

  const button = card.locator(".nhb-btn");
  const initial = await waitForCardAction(button);
  if (initial.action === "error") {
    return { ok: false, issue: `hub reported error: ${initial.label}` };
  }

  if (expectAdd && initial.action !== "add" && initial.action !== "open") {
    return { ok: false, issue: `unexpected card action "${initial.label || "unknown"}"` };
  }

  if (initial.action === "add") {
    await button.click();
    for (let attempt = 0; attempt < 90; attempt += 1) {
      await sleep(1000);
      const next = await waitForCardAction(button, 1000);
      if (next.action === "open") break;
      if (next.action === "error") return { ok: false, issue: `hub reported error: ${next.label}` };
    }
  }

  const after = await waitForCardAction(button, 5000);
  if (after.action !== "open") {
    return { ok: false, issue: `expected installed/open state, saw "${after.label}"` };
  }

  const stored = await resolveInstalledEntry(page, item, await ensureHubProject(page, teamId));
  if (!stored?.fileId || !stored?.projectId) {
    return { ok: false, issue: "could not resolve installed file after import/open" };
  }

  let workspaceLoaded = false;
  await button.click().catch(() => {});
  await page.waitForURL(/\/#\/workspace/, { timeout: 10000 }).catch(() => {});
  workspaceLoaded = page.url().includes("workspace");
  if (!workspaceLoaded) {
    await gotoWithRetry(page,
      `${BASE}/#/workspace?team-id=${teamId}&file-id=${stored.fileId}`,
      { waitUntil: "domcontentloaded", timeout: 30000 },
    );
    await page.waitForURL(/\/#\/workspace/, { timeout: 10000 }).catch(() => {});
    workspaceLoaded = page.url().includes("workspace");
  }
  await sleep(6000);

  const summary = workspaceLoaded ? await getFileSummary(page, stored.fileId) : null;
  const fileData = workspaceLoaded ? await getFileData(page, stored.fileId, stored.projectId) : null;
  const pageCount = Array.isArray(fileData?.data?.pages) ? fileData.data.pages.length : null;
  const componentsCount = summary?.components?.count ?? null;

  await gotoWithRetry(
    page,
    `${BASE}/#/dashboard/team/${teamId}/projects/${stored.projectId}`,
    { waitUntil: "domcontentloaded", timeout: 30000 },
  );
  await sleep(4000);
  const files = await getFiles(page, stored.projectId);
  const candidates = collectSlugCandidates(item);
  const duplicateVisible = files.some((file) => candidates.has(slugify(file.name)));
  const thumb = await getThumbnailStatus(page, stored.fileId, stored.projectId);
  const duplicate = await verifyDuplicatePrevention(page, item, teamId, stored.projectId);
  const issue = !workspaceLoaded
    ? "workspace did not open"
    : !duplicateVisible
      ? "imported file not visible in NOFIDA Hub project"
      : !duplicate.ok
        ? `duplicate check failed (${duplicate.statusCode}/${duplicate.status}/${duplicate.duplicatePrevented})`
        : null;

  return {
    ok: !issue,
    issue,
    mode: initial.action === "add" ? "first_time_import" : "already_installed",
    fileId: stored.fileId,
    projectId: stored.projectId,
    pageCount,
    componentsCount,
    duplicateVisible,
    thumbnailStatus: thumb.status,
    thumbnailId: thumb.thumbnailId,
    duplicateCheck: duplicate,
  };
}

async function runUserFlow(browser, user, items, options = {}) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  try {
    await loginAs(page, user);
    const teamId = await resolveTeamId(page);
    if (!teamId) throw new Error(`Could not resolve team id for ${user.label}`);
    const hubProjectId = await ensureHubProject(page, teamId);

    const results = [];
    for (const item of items) {
      results.push({
        itemId: item.id,
        ...(await importFromHub(page, item, teamId, options.expectAdd !== false)),
      });
    }

    return { teamId, hubProjectId, results };
  } finally {
    await context.close();
  }
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const storeRoot = path.resolve(args.storeRoot);
  const inventoryPath = resolveJsonPath(storeRoot, ["inventory.json", "penpot-hub.inventory.json"]);
  const catalogPath = resolveJsonPath(storeRoot, ["catalog.json", "catalog.example.json"]);
  const inventory = readJson(inventoryPath);
  const catalog = readJson(catalogPath);
  const inventoryById = new Map(inventory.items.map((item) => [item.id, item]));
  const originals = new Map();

  const targets = args.ids
    .map((id) => inventoryById.get(id))
    .filter(Boolean);

  if (!targets.length) {
    throw new Error("No verification targets were found in inventory.json");
  }

  for (const item of targets) {
    originals.set(item.id, structuredClone(item));
    promoteNativeAvailability(item);
  }

  if (args.write) {
    writeJsonAtomic(inventoryPath, inventory);
    writeJsonAtomic(catalogPath, syncCatalogFromInventory(catalog, inventory));
  }

  const browser = await chromium.launch({ headless: true });
  let user1Flow = null;
  let user2Flow = null;

  try {
    user1Flow = await runUserFlow(browser, USER1, targets, { expectAdd: true });
    const tailwind = targets.find((item) => item.id === "tailwind-kit") || targets[0];
    user2Flow = await runUserFlow(browser, USER2, [tailwind], { expectAdd: true });
  } finally {
    await browser.close();
  }

  const failures = [];
  for (const result of user1Flow.results) {
    const record = inventoryById.get(result.itemId);
    if (!record) continue;
    if (result.ok) {
      record.import_adapter = "native";
      record.native_import_verified = true;
      record.verified_at = utcNow();
      record.thumbnail_status = result.thumbnailStatus || "pending";
      record.verified_importable = true;
      record.import_verification_status = "verified";
      record.import_verification_checked_at = utcNow();
      record.user_import_status = "available";
      record.user_import_reason = null;
      if (result.pageCount !== null && result.pageCount !== undefined) record.pages_count = result.pageCount;
      if (result.componentsCount !== null && result.componentsCount !== undefined) {
        record.components_count = result.componentsCount;
      }
    } else {
      const original = originals.get(result.itemId);
      const index = inventory.items.findIndex((item) => item.id === result.itemId);
      if (original && index >= 0) {
        inventory.items[index] = original;
        inventoryById.set(result.itemId, original);
      }
      failures.push(`${result.itemId}: ${result.issue || "unknown failure"}`);
    }
  }

  if (args.write) {
    writeJsonAtomic(inventoryPath, inventory);
    writeJsonAtomic(catalogPath, syncCatalogFromInventory(catalog, inventory));
  }

  console.log("PATCH 015B verification");
  console.log(`user1 team: ${user1Flow.teamId}`);
  console.log(`user2 team: ${user2Flow.teamId}`);
  console.log("");

  user1Flow.results.forEach((result) => {
    console.log(
      `${result.ok ? "PASS" : "FAIL"} ${result.itemId}` +
      ` | mode=${result.mode || "?"}` +
      ` | pages=${result.pageCount ?? "?"}` +
      ` | components=${result.componentsCount ?? "?"}` +
      ` | thumbnail=${result.thumbnailStatus || "?"}` +
      ` | duplicate=${result.duplicateCheck?.ok ? "pass" : "fail"}` +
      `${result.issue ? ` | issue=${result.issue}` : ""}`,
    );
  });

  const user2Result = user2Flow.results[0];
  console.log(
    `${user2Result.ok ? "PASS" : "FAIL"} user2:${user2Result.itemId}` +
    ` | mode=${user2Result.mode || "?"}` +
    ` | thumbnail=${user2Result.thumbnailStatus || "?"}` +
    ` | duplicate=${user2Result.duplicateCheck?.ok ? "pass" : "fail"}` +
    `${user2Result.issue ? ` | issue=${user2Result.issue}` : ""}`,
  );

  if (!user2Result.ok) {
    failures.push(`user2:${user2Result.itemId}: ${user2Result.issue || "unknown failure"}`);
  }

  if (failures.length > 0) {
    console.error("");
    console.error("Failures");
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
