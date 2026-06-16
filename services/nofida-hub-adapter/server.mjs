import http from "node:http";
import fsp from "node:fs/promises";
import path from "node:path";
import { URL } from "node:url";
import { createAISettingsService } from "./ai-service.mjs";

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 3101);
const STORE_ROOT = path.resolve(process.env.NOFIDA_LIBRARY_STORE_ROOT || "/srv/library-store");
const PENPOT_BASE_URL = process.env.PENPOT_BASE_URL || "http://penpot-frontend:8080";
const HUB_PROJECT_NAME = process.env.NOFIDA_HUB_PROJECT_NAME || "NOFIDA Hub";
const CHUNK_SIZE = Number(process.env.NOFIDA_HUB_IMPORT_CHUNK_SIZE || 25 * 1024 * 1024);
const MAX_IMPORT_BYTES = Number(process.env.NOFIDA_HUB_MAX_IMPORT_BYTES || 367001600);
const REQUEST_TIMEOUT_MS = Number(process.env.NOFIDA_HUB_REQUEST_TIMEOUT_MS || 10 * 60 * 1000);
const JSON_LIMIT_BYTES = 1024 * 1024;

// Operation Plan Schema — valid operation types for PATCH 016A (preview-only).
// A plan is returned alongside AI answers so the frontend can render a preview.
// No mutations are applied in 016A; every plan has preview:true, safe:true.
//
// Schema per operation:
//   audit_design   → items: [{severity, issue, suggestion}]
//   rename_layers  → items: [{layer_name, suggested_name, reason}]
//   suggest_tokens → items: [{property, current_value, suggested_token}]
//   generate_copy  → items: [{layer_name, current_text, suggested_text}]
//   create_screen_plan → items: [{screen_name, purpose, components:[]}]
//   recommend_libraries → items: [{catalog_id, title, reason, category}]
//   organize_pages → items: [{action, page_name, suggestion}]
const VALID_OPERATIONS = new Set([
  "audit_design", "rename_layers", "suggest_tokens", "generate_copy",
  "create_screen_plan", "recommend_libraries", "organize_pages",
]);

// A page with fewer objects than this per page is considered empty/bad import.
// A page always has at least 1 root frame; real content adds many more.
const MIN_OBJECTS_PER_PAGE = 4;

const REVIEW_STATUSES = new Set(["trademark_review", "needs_license_review", "needs_review"]);
const HTML_MARKERS = ["<!doctype html", "<html", "<body", "no matching published entries found"];
const OLD_BINARY_MAGIC = Buffer.from("010b1a865063a15f", "hex");
const ZIP_MAGIC_PREFIXES = [
  Buffer.from("504b0304", "hex"),
  Buffer.from("504b0506", "hex"),
  Buffer.from("504b0708", "hex"),
];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function log(level, message, extra = undefined) {
  const stamp = new Date().toISOString();
  if (extra === undefined) {
    console.log(`[${stamp}] ${level} ${message}`);
    return;
  }
  console.log(`[${stamp}] ${level} ${message}`, extra);
}

const aiSettingsService = createAISettingsService(log);

function isUuidString(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

function stripPenpotExtension(value) {
  return String(value || "").replace(/\.penpot$/i, "").trim();
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\.penpot$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

function makeTransitDecoder() {
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
      // Transit tagged values: ["~#tag", payload] — e.g. sets, instants, etc.
      if (value.length === 2 && typeof value[0] === "string" && value[0].startsWith("~#")) {
        const tag = value[0].slice(2);
        if (tag === "set" || tag === "list") {
          return Array.isArray(value[1]) ? value[1].map(decode) : [decode(value[1])];
        }
        // For other tagged values just unwrap the payload
        return decode(value[1]);
      }
      return value.map(decode);
    }

    if (value && typeof value === "object") {
      const out = {};
      for (const [key, nested] of Object.entries(value)) {
        out[String(decode(key))] = decode(nested);
      }
      return out;
    }

    return value;
  }

  return decode;
}

function decodeTransit(value) {
  return makeTransitDecoder()(value);
}

function encodeTransitValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return isUuidString(value) ? `~u${value}` : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(encodeTransitValue);
  if (typeof value === "object") return encodeTransit(value);
  return value;
}

function encodeTransit(map) {
  const payload = ["^ "];
  for (const [key, value] of Object.entries(map)) {
    if (value === undefined) continue;
    payload.push(`~:${key}`);
    payload.push(encodeTransitValue(value));
  }
  return payload;
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function fail(res, status, code, message, extra = undefined) {
  const payload = { ok: false, code, message };
  if (extra && typeof extra === "object") Object.assign(payload, extra);
  json(res, status, payload);
}

function parseBody(req, limitBytes = JSON_LIMIT_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(Object.assign(new Error("request body too large"), { status: 413, code: "request_too_large" }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (_error) {
        reject(Object.assign(new Error("invalid json body"), { status: 400, code: "invalid_json" }));
      }
    });

    req.on("error", reject);
  });
}

async function readJsonIfExists(filePath) {
  try {
    const raw = await fsp.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function loadStoreRecord(itemId) {
  const inventoryPath = path.join(STORE_ROOT, "inventory.json");
  const catalogPath = path.join(STORE_ROOT, "catalog.json");
  const [inventory, catalog] = await Promise.all([
    readJsonIfExists(inventoryPath),
    readJsonIfExists(catalogPath),
  ]);

  const inventoryItem = inventory?.items?.find((entry) => entry.id === itemId) || null;
  const catalogItem = catalog?.libraries?.find((entry) => entry.id === itemId) || null;

  if (!inventoryItem && !catalogItem) return null;
  return { ...(catalogItem || {}), ...(inventoryItem || {}) };
}

function resolveStorePath(fileRel) {
  if (!fileRel) {
    const error = new Error("catalog item does not point to a stored file");
    error.status = 409;
    error.code = "file_missing_from_store";
    throw error;
  }

  const resolved = path.resolve(STORE_ROOT, fileRel);
  const normalizedRoot = STORE_ROOT.endsWith(path.sep) ? STORE_ROOT : `${STORE_ROOT}${path.sep}`;
  if (resolved !== STORE_ROOT && !resolved.startsWith(normalizedRoot)) {
    const error = new Error("refusing to access file outside library store");
    error.status = 400;
    error.code = "invalid_store_path";
    throw error;
  }

  return resolved;
}

async function detectFileDescriptor(filePath) {
  const stat = await fsp.stat(filePath);
  if (!stat.isFile()) {
    const error = new Error("library record does not reference a regular file");
    error.status = 409;
    error.code = "invalid_store_entry";
    throw error;
  }

  if (stat.size <= 0) {
    const error = new Error("vendored file is empty");
    error.status = 409;
    error.code = "empty_file";
    throw error;
  }

  if (stat.size > MAX_IMPORT_BYTES) {
    const error = new Error(`vendored file exceeds adapter hard limit (${stat.size} > ${MAX_IMPORT_BYTES})`);
    error.status = 413;
    error.code = "file_too_large";
    throw error;
  }

  const handle = await fsp.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(Math.min(4096, stat.size));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const head = buffer.subarray(0, bytesRead);
    const headText = head.toString("utf8").toLowerCase();

    if (HTML_MARKERS.some((marker) => headText.includes(marker))) {
      const error = new Error("vendored file resolved to HTML or another invalid payload");
      error.status = 409;
      error.code = "invalid_html_payload";
      throw error;
    }

    if (ZIP_MAGIC_PREFIXES.some((prefix) => head.subarray(0, prefix.length).equals(prefix))) {
      return { size: stat.size, version: 3, format: "v3_zip" };
    }

    if (head.subarray(0, OLD_BINARY_MAGIC.length).equals(OLD_BINARY_MAGIC)) {
      return { size: stat.size, version: 1, format: "v1_legacy_supported" };
    }

    const error = new Error("vendored file is not a supported Penpot binary");
    error.status = 409;
    error.code = "unsupported_file_format";
    throw error;
  } finally {
    await handle.close();
  }
}

function collectNameCandidates(record, filePath) {
  const candidates = new Set();
  const maybeAdd = (value) => {
    const base = stripPenpotExtension(value);
    const slug = slugify(base);
    if (slug) candidates.add(slug);
  };

  maybeAdd(record.title);
  maybeAdd(record.name);
  maybeAdd(record.id);
  maybeAdd(record.verified_file_name);
  maybeAdd(record.penpot_file_name);
  maybeAdd(record.file_name);
  maybeAdd(path.basename(filePath));

  return candidates;
}

function findExistingFile(files, record, filePath) {
  const candidates = collectNameCandidates(record, filePath);
  if (candidates.size === 0) return null;
  // Skip files that were marked as bad imports
  return files.find((file) =>
    candidates.has(slugify(file?.name)) &&
    !String(file?.name || "").startsWith("OLD BAD IMPORT -")
  ) || null;
}

function chooseImportName(record, filePath) {
  const preferred = [
    record.verified_file_name,
    record.penpot_file_name,
    record.file_name,
    record.title,
    record.name,
    path.basename(filePath),
    record.id,
  ];

  for (const value of preferred) {
    const normalized = stripPenpotExtension(value);
    if (normalized) return normalized;
  }

  return "NOFIDA Hub import";
}

function buildOpenUrl(teamId, fileId, record) {
  const params = new URLSearchParams();
  params.set("team-id", teamId);
  params.set("file-id", fileId);
  if (record.open_default_page_id) {
    params.set("nhb-page-id", record.open_default_page_id);
  } else if (record.open_default_page) {
    params.set("nhb-page", record.open_default_page);
  }
  return `/#/workspace?${params.toString()}`;
}

function buildPenpotHeaders(cookieHeader, extra = undefined) {
  const headers = new Headers(extra || {});
  headers.set("user-agent", "nofida-hub-adapter/015g");
  headers.set("cookie", cookieHeader);
  return headers;
}

async function readTransitResponse(response) {
  const raw = await response.text();
  if (!raw) return null;
  return decodeTransit(JSON.parse(raw));
}

async function readErrorResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/json") || contentType.includes("application/transit+json")) {
      const decoded = await readTransitResponse(response);
      if (decoded && typeof decoded === "object") {
        return decoded.hint || decoded.message || decoded.error || JSON.stringify(decoded);
      }
    }
    const text = await response.text();
    return text || `${response.status} ${response.statusText}`;
  } catch (_error) {
    return `${response.status} ${response.statusText}`;
  }
}

async function fetchPenpot(pathname, init, cookieHeader) {
  const url = new URL(pathname, PENPOT_BASE_URL);
  return fetch(url, {
    ...init,
    headers: buildPenpotHeaders(cookieHeader, init?.headers),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

async function getProjects(cookieHeader, teamId) {
  const response = await fetchPenpot(
    `/api/rpc/command/get-all-projects?team_id=${encodeURIComponent(teamId)}`,
    { method: "GET", headers: { Accept: "application/transit+json" } },
    cookieHeader,
  );

  if (!response.ok) {
    const message = await readErrorResponse(response);
    throw Object.assign(new Error(`get-all-projects failed: ${message}`), {
      status: response.status,
      code: "get_projects_failed",
    });
  }

  const decoded = await readTransitResponse(response);
  return Array.isArray(decoded) ? decoded : [];
}

async function getProjectFiles(cookieHeader, projectId) {
  const response = await fetchPenpot(
    `/api/rpc/command/get-project-files?project-id=${encodeURIComponent(projectId)}`,
    { method: "GET", headers: { Accept: "application/transit+json" } },
    cookieHeader,
  );

  if (!response.ok) {
    const message = await readErrorResponse(response);
    throw Object.assign(new Error(`get-project-files failed: ${message}`), {
      status: response.status,
      code: "get_project_files_failed",
    });
  }

  const decoded = await readTransitResponse(response);
  return Array.isArray(decoded) ? decoded : [];
}

async function createProject(cookieHeader, teamId) {
  const response = await fetchPenpot(
    "/api/rpc/command/create-project",
    {
      method: "POST",
      headers: {
        Accept: "application/transit+json",
        "Content-Type": "application/transit+json",
      },
      body: JSON.stringify(encodeTransit({ "team-id": teamId, name: HUB_PROJECT_NAME })),
    },
    cookieHeader,
  );

  if (!response.ok) {
    const message = await readErrorResponse(response);
    throw Object.assign(new Error(`create-project failed: ${message}`), {
      status: response.status,
      code: "create_project_failed",
    });
  }

  return readTransitResponse(response);
}

async function ensureHubProject(cookieHeader, teamId, requestedProjectId) {
  const projects = await getProjects(cookieHeader, teamId);

  if (requestedProjectId) {
    const explicit = projects.find((project) => project.id === requestedProjectId);
    if (explicit) return explicit;
  }

  const hubs = projects
    .filter((project) => project.name === HUB_PROJECT_NAME)
    .sort((left, right) => Number(left?.["created-at"] || 0) - Number(right?.["created-at"] || 0));

  if (hubs.length > 0) return hubs[0];
  return createProject(cookieHeader, teamId);
}

async function createUploadSession(cookieHeader, totalChunks) {
  const response = await fetchPenpot(
    "/api/main/methods/create-upload-session",
    {
      method: "POST",
      headers: {
        Accept: "application/transit+json",
        "Content-Type": "application/transit+json",
      },
      body: JSON.stringify(encodeTransit({ "total-chunks": totalChunks })),
    },
    cookieHeader,
  );

  if (!response.ok) {
    const message = await readErrorResponse(response);
    throw Object.assign(new Error(`create-upload-session failed: ${message}`), {
      status: response.status,
      code: "create_upload_session_failed",
    });
  }

  const decoded = await readTransitResponse(response);
  return decoded?.["session-id"] || decoded?.sessionId || decoded?.session_id || null;
}

async function uploadChunk(cookieHeader, sessionId, index, blob) {
  const form = new FormData();
  form.set("session-id", sessionId);
  form.set("index", String(index));
  form.set("content", blob, `chunk-${index}`);

  const response = await fetchPenpot(
    "/api/main/methods/upload-chunk",
    {
      method: "POST",
      headers: { Accept: "application/transit+json" },
      body: form,
    },
    cookieHeader,
  );

  if (!response.ok) {
    const message = await readErrorResponse(response);
    throw Object.assign(new Error(`upload-chunk failed at index ${index}: ${message}`), {
      status: response.status,
      code: "upload_chunk_failed",
    });
  }

  return readTransitResponse(response);
}

async function uploadFileInChunks(cookieHeader, filePath, sizeBytes) {
  const totalChunks = Math.max(1, Math.ceil(sizeBytes / CHUNK_SIZE));
  const sessionId = await createUploadSession(cookieHeader, totalChunks);

  if (!sessionId) {
    throw Object.assign(new Error("Penpot did not return an upload session id"), {
      status: 502,
      code: "missing_upload_session",
    });
  }

  const handle = await fsp.open(filePath, "r");
  try {
    for (let index = 0; index < totalChunks; index += 1) {
      const offset = index * CHUNK_SIZE;
      const length = Math.min(CHUNK_SIZE, sizeBytes - offset);
      const buffer = Buffer.allocUnsafe(length);
      const { bytesRead } = await handle.read(buffer, 0, length, offset);
      if (!bytesRead) {
        throw Object.assign(new Error(`read returned 0 bytes for chunk ${index}`), {
          status: 502,
          code: "chunk_read_failed",
        });
      }

      await uploadChunk(cookieHeader, sessionId, index, new Blob([buffer.subarray(0, bytesRead)]));
    }
  } finally {
    await handle.close();
  }

  return sessionId;
}

async function readImportStream(response) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    return { fileIds: [] };
  }

  const decoder = new TextDecoder();
  let buffer = "";
  const fileIds = [];
  const seen = new Set();
  let errorHint = null;

  const consumeBlock = (block) => {
    const lines = block
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean);

    let type = "message";
    const dataLines = [];
    for (const line of lines) {
      if (line.startsWith("event:")) {
        type = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trim());
      }
    }

    if (!dataLines.length) return;

    try {
      const payload = decodeTransit(JSON.parse(dataLines.join("\n")));
      const fileId = payload?.["file-id"];
      if (fileId && !seen.has(fileId)) {
        seen.add(fileId);
        fileIds.push(fileId);
      }
      if (type === "error") {
        errorHint = payload?.hint || payload?.message || errorHint || "Penpot import stream returned an error";
      }
    } catch (_error) {
      if (type === "error" && !errorHint) {
        errorHint = dataLines.join(" ").trim() || "Penpot import stream returned an error";
      }
    }
  };

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() || "";
    blocks.forEach(consumeBlock);
  }

  if (buffer.trim()) consumeBlock(buffer);

  if (errorHint) {
    throw Object.assign(new Error(errorHint), { status: 502, code: "import_stream_error" });
  }

  return { fileIds };
}

async function importBinFile(cookieHeader, projectId, sessionId, version, name) {
  const response = await fetchPenpot(
    "/api/main/methods/import-binfile",
    {
      method: "POST",
      headers: {
        Accept: "application/transit+json,text/event-stream,*/*",
        "Content-Type": "application/transit+json",
      },
      body: JSON.stringify(
        encodeTransit({
          name,
          version,
          "project-id": projectId,
          "upload-id": sessionId,
        }),
      ),
    },
    cookieHeader,
  );

  if (!response.ok) {
    const message = await readErrorResponse(response);
    throw Object.assign(new Error(`import-binfile failed: ${message}`), {
      status: response.status,
      code: "import_binfile_failed",
    });
  }

  return readImportStream(response);
}

async function assetExists(cookieHeader, assetId) {
  const response = await fetchPenpot(
    `/assets/by-id/${encodeURIComponent(assetId)}`,
    { method: "HEAD", headers: { Accept: "*/*" } },
    cookieHeader,
  );
  return response.ok;
}

async function resolveThumbnailStatus(cookieHeader, fileRecord) {
  const thumbnailId = fileRecord?.["thumbnail-id"] || null;
  if (!thumbnailId) {
    return { thumbnailStatus: "pending", thumbnailId: null };
  }

  const ready = await assetExists(cookieHeader, thumbnailId);
  return {
    thumbnailStatus: ready ? "ready" : "pending",
    thumbnailId,
  };
}

// Rename a file in Penpot via the rename-file RPC command.
async function renameFile(cookieHeader, fileId, newName) {
  const response = await fetchPenpot(
    "/api/rpc/command/rename-file",
    {
      method: "POST",
      headers: {
        Accept: "application/transit+json",
        "Content-Type": "application/transit+json",
      },
      body: JSON.stringify(encodeTransit({ id: fileId, name: newName })),
    },
    cookieHeader,
  );

  if (!response.ok) {
    const message = await readErrorResponse(response);
    throw Object.assign(new Error(`rename-file failed: ${message}`), {
      status: response.status,
      code: "rename_file_failed",
    });
  }

  return readTransitResponse(response);
}

// Check if an imported file has real visual content.
// Returns { healthy, pages, totalObjects, reason }.
// Fails open: if the check itself errors, we assume healthy to avoid false positives.
async function checkFileHealth(cookieHeader, fileId) {
  try {
    const response = await fetchPenpot(
      `/api/rpc/command/get-file?id=${encodeURIComponent(fileId)}`,
      { method: "GET", headers: { Accept: "application/transit+json" } },
      cookieHeader,
    );

    if (!response.ok) {
      log("WARN", "file health check: get-file failed", { fileId, status: response.status });
      return { healthy: true, reason: "api_error_assume_healthy", pages: 0, totalObjects: 0 };
    }

    const data = await readTransitResponse(response);
    const features = data?.features || data?.data?.features || [];
    const pages = data?.pages || data?.data?.pages || [];
    const pagesIndex = data?.["pages-index"] || data?.data?.["pages-index"] || {};

    if (!Array.isArray(pages) || pages.length === 0) {
      return { healthy: false, reason: "no_pages", pages: 0, totalObjects: 0 };
    }

    // Penpot 2.16 adds fdata/objects-map to all imported files. In this mode
    // objects are stored in a flat binary map and get-file only returns a
    // subset (typically the first page's objects). Object-count thresholds are
    // therefore meaningless here — trust the import if pages exist.
    const usesObjectsMap = Array.isArray(features) && features.includes("fdata/objects-map");
    if (usesObjectsMap) {
      return { healthy: true, pages: pages.length, totalObjects: -1, reason: "ok_objects_map" };
    }

    let totalObjects = 0;
    for (const pageId of pages) {
      const page = pagesIndex[pageId];
      const objects = page?.objects || {};
      totalObjects += Object.keys(objects).length;
    }

    // Each real page should have substantially more than 1 root frame object.
    // A bad import typically has pages but almost no objects (just the root frame per page).
    const threshold = pages.length * MIN_OBJECTS_PER_PAGE;
    if (totalObjects < threshold) {
      return {
        healthy: false,
        reason: "empty_pages",
        pages: pages.length,
        totalObjects,
        threshold,
      };
    }

    return { healthy: true, pages: pages.length, totalObjects };
  } catch (err) {
    log("WARN", "file health check threw, assuming healthy", { fileId, error: err.message });
    return { healthy: true, reason: "check_exception_assume_healthy", pages: 0, totalObjects: 0 };
  }
}

function guardImportableRecord(record) {
  if (!record) {
    const error = new Error("catalog item not found");
    error.status = 404;
    error.code = "catalog_item_not_found";
    throw error;
  }

  if (!record.file) {
    const error = new Error("catalog item does not have a vendored file");
    error.status = 409;
    error.code = "file_not_vendored";
    throw error;
  }

  if (REVIEW_STATUSES.has(record.license_status)) {
    const error = new Error("catalog item is still blocked by license or trademark review");
    error.status = 409;
    error.code = "license_review_required";
    throw error;
  }

  if (record.quality_status === "empty_or_broken" || record.status === "rejected") {
    const error = new Error("catalog item is marked as invalid or broken");
    error.status = 409;
    error.code = "invalid_catalog_item";
    throw error;
  }
}

async function handleImport(req, res) {
  const cookieHeader = req.headers.cookie || "";
  if (!cookieHeader) {
    fail(res, 401, "missing_session", "This endpoint requires an authenticated Penpot session.");
    return;
  }

  let body;
  try {
    body = await parseBody(req);
  } catch (error) {
    fail(res, error.status || 400, error.code || "invalid_body", error.message);
    return;
  }

  const catalogItemId = body.catalog_item_id || body.catalogItemId;
  const teamId = body.team_id || body.teamId;
  const requestedProjectId = body.project_id || body.projectId || null;
  const forceReimport = body.force_reimport === true || body.forceReimport === true;

  if (!catalogItemId || typeof catalogItemId !== "string") {
    fail(res, 400, "missing_catalog_item_id", "catalog_item_id is required.");
    return;
  }

  if (!teamId || !isUuidString(teamId)) {
    fail(res, 400, "invalid_team_id", "team_id is required and must be a UUID.");
    return;
  }

  try {
    const record = await loadStoreRecord(catalogItemId);
    guardImportableRecord(record);

    const filePath = resolveStorePath(record.file);
    const descriptor = await detectFileDescriptor(filePath);
    const project = await ensureHubProject(cookieHeader, teamId, requestedProjectId);
    const filesBefore = await getProjectFiles(cookieHeader, project.id);
    const existing = findExistingFile(filesBefore, record, filePath);

    if (existing && !forceReimport) {
      // Run a health check so the UI knows whether reimport is recommended.
      const health = await checkFileHealth(cookieHeader, existing.id);
      const qualityStatus = health.healthy ? "healthy" : "bad_import";
      const thumb = await resolveThumbnailStatus(cookieHeader, existing);

      json(res, 200, {
        ok: true,
        status: "already_installed",
        duplicate_prevented: true,
        import_adapter: "native",
        format: descriptor.format,
        file_id: existing.id,
        file_name: existing.name,
        project_id: project.id,
        project_name: project.name,
        shared_library_status: existing["is-shared"] ? "enabled" : "disabled",
        open_url: buildOpenUrl(teamId, existing.id, record),
        thumbnail_status: thumb.thumbnailStatus,
        thumbnail_id: thumb.thumbnailId,
        quality_status: qualityStatus,
        quality_pages: health.pages,
        quality_objects: health.totalObjects,
      });
      return;
    }

    if (existing && forceReimport) {
      // Rename the bad import before importing a fresh copy.
      const badName = `OLD BAD IMPORT - ${existing.name}`;
      log("INFO", "force reimport: renaming existing file", {
        itemId: catalogItemId,
        fileId: existing.id,
        oldName: existing.name,
        newName: badName,
      });
      try {
        await renameFile(cookieHeader, existing.id, badName);
        log("INFO", "old file renamed successfully", { fileId: existing.id });
      } catch (renameErr) {
        log("WARN", "rename of old file failed — proceeding with reimport anyway", {
          fileId: existing.id,
          error: renameErr.message,
        });
      }
    }

    log("INFO", "starting native hub import", {
      itemId: catalogItemId,
      teamId,
      projectId: project.id,
      format: descriptor.format,
      bytes: descriptor.size,
      forceReimport,
    });

    const sessionId = await uploadFileInChunks(cookieHeader, filePath, descriptor.size);
    const importName = chooseImportName(record, filePath);
    const streamResult = await importBinFile(cookieHeader, project.id, sessionId, descriptor.version, importName);
    const filesAfter = await getProjectFiles(cookieHeader, project.id);

    const imported =
      (streamResult.fileIds || [])
        .map((fileId) => filesAfter.find((file) => file.id === fileId))
        .find(Boolean) ||
      findExistingFile(filesAfter, record, filePath) ||
      null;

    if (!imported) {
      throw Object.assign(new Error("import finished but no imported file could be identified"), {
        status: 502,
        code: "imported_file_not_found",
      });
    }

    // Quality check on the fresh import to confirm it has real content.
    const health = await checkFileHealth(cookieHeader, imported.id);
    const qualityStatus = health.healthy ? "healthy" : "bad_import";
    if (!health.healthy) {
      log("WARN", "freshly imported file failed quality check", {
        itemId: catalogItemId,
        fileId: imported.id,
        reason: health.reason,
        pages: health.pages,
        objects: health.totalObjects,
      });
    }

    const thumb = await resolveThumbnailStatus(cookieHeader, imported);

    json(res, 200, {
      ok: true,
      status: forceReimport ? "reimported" : "imported",
      duplicate_prevented: false,
      import_adapter: "native",
      format: descriptor.format,
      file_id: imported.id,
      file_name: imported.name,
      project_id: project.id,
      project_name: project.name,
      shared_library_status: imported["is-shared"] ? "enabled" : "disabled",
      open_url: buildOpenUrl(teamId, imported.id, record),
      thumbnail_status: thumb.thumbnailStatus,
      thumbnail_id: thumb.thumbnailId,
      quality_status: qualityStatus,
      quality_pages: health.pages,
      quality_objects: health.totalObjects,
    });
  } catch (error) {
    log("ERROR", "hub import failed", {
      itemId: catalogItemId,
      teamId,
      code: error.code || "unknown_error",
      message: error.message,
    });
    fail(res, error.status || 500, error.code || "internal_error", error.message);
  }
}

// Lightweight quality check endpoint: POST /quality-check { file_id, team_id }
async function handleQualityCheck(req, res) {
  const cookieHeader = req.headers.cookie || "";
  if (!cookieHeader) {
    fail(res, 401, "missing_session", "This endpoint requires an authenticated Penpot session.");
    return;
  }

  let body;
  try {
    body = await parseBody(req);
  } catch (error) {
    fail(res, error.status || 400, error.code || "invalid_body", error.message);
    return;
  }

  const fileId = body.file_id || body.fileId;
  if (!fileId || !isUuidString(fileId)) {
    fail(res, 400, "invalid_file_id", "file_id is required and must be a UUID.");
    return;
  }

  try {
    const health = await checkFileHealth(cookieHeader, fileId);
    json(res, 200, {
      ok: true,
      file_id: fileId,
      quality_status: health.healthy ? "healthy" : "bad_import",
      pages: health.pages,
      total_objects: health.totalObjects,
      reason: health.reason || null,
    });
  } catch (error) {
    log("ERROR", "quality check failed", { fileId, error: error.message });
    fail(res, error.status || 500, error.code || "internal_error", error.message);
  }
}

// ── AI helpers ────────────────────────────────────────────────────────────

const AI_ROLES = new Set([
  "default",
  "file_summary",
  "design_audit",
  "library_recommendation",
  "screen_planner",
  "copywriter",
  "reviewer",
  "vision",
  "fast",
  "premium",
]);

function requireSession(req, res, message = "Authenticated session required.") {
  const cookieHeader = req.headers.cookie || "";
  if (!cookieHeader) {
    fail(res, 401, "missing_session", message);
    return null;
  }
  return cookieHeader;
}

function normalizeAiRole(role) {
  const normalized = String(role || "").trim().toLowerCase();
  return AI_ROLES.has(normalized) ? normalized : null;
}

function inferAiRole(message, fileCtx) {
  const text = String(message || "").toLowerCase();
  if (/audit|review|fix|issue|problem|проверь|аудит|проблем|исправ/.test(text)) return "design_audit";
  if (/librar|catalog|kit|saas|component|recommend|библиотек|каталог|компонент|подбери/.test(text))
    return "library_recommendation";
  if (/summary|overview|what|file|screen|сводк|обзор|что в этом файле|что на экране/.test(text))
    return "file_summary";
  if (/screen|flow|plan|wireframe|план экрана|структур/.test(text)) return "screen_planner";
  if (/copy|headline|cta|microcopy|текст|копирайт/.test(text)) return "copywriter";
  if (/vision|image|screenshot|изображен|картинк/.test(text) || Array.isArray(fileCtx?.images) && fileCtx.images.length > 0)
    return "vision";
  if (/fast|quick|быстро/.test(text)) return "fast";
  if (/premium|best|лучший/.test(text)) return "premium";
  if (/reviewer|ревью/.test(text)) return "reviewer";
  return "default";
}

function buildSystemPrompt(fileCtx, hubCtx, role) {
  const lines = [
    "You are NOFIDA AI, an expert design assistant embedded in the NOFIDA platform (built on Penpot).",
    `Current task role: ${role}.`,
    "Help designers understand their files, find issues, and pick NOFIDA Hub libraries.",
    "",
    "Rules:",
    "- ONLY recommend libraries from the NOFIDA Hub catalog supplied in the context.",
    "- NEVER suggest external tools, competitors, or libraries not in the catalog.",
    "- NEVER apply changes directly — describe plans only, previews only, no mutations.",
    "- Be concise, specific, and reply in the same language as the user's message.",
    "- When referencing libraries use their catalog_id.",
    "",
  ];

  if (fileCtx) {
    if (fileCtx.file) lines.push(`File: "${fileCtx.file.name}"`);
    if (fileCtx.page) lines.push(`Current page: "${fileCtx.page.name}"`);
    if (fileCtx.objects) {
      lines.push(`Objects on page: ${fileCtx.objects.total} total`);
      const types = Object.entries(fileCtx.objects.byType || {}).map(([type, count]) => `${type}:${count}`).join(", ");
      if (types) lines.push(`  Types: ${types}`);
    }
    if (Array.isArray(fileCtx.selection) && fileCtx.selection.length > 0)
      lines.push(`Selected: ${fileCtx.selection.map((item) => `${item.name}(${item.type})`).join(", ")}`);
    if (Array.isArray(fileCtx.colors) && fileCtx.colors.length > 0)
      lines.push(`Colors used: ${fileCtx.colors.slice(0, 10).join(", ")}`);
    if (Array.isArray(fileCtx.texts) && fileCtx.texts.length > 0)
      lines.push(`Text samples: ${fileCtx.texts.slice(0, 3).map((item) => `"${item}"`).join(", ")}`);
    lines.push("");
  }

  if (hubCtx && Array.isArray(hubCtx.catalog) && hubCtx.catalog.length > 0) {
    lines.push("NOFIDA Hub catalog (use these IDs when recommending):");
    for (const item of hubCtx.catalog.slice(0, 24)) {
      const installed = (hubCtx.installed || []).includes(item.id) ? " [installed]" : "";
      lines.push(`  ${item.id}: ${item.title || item.name}${installed} (${item.category || "library"})`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function buildAuditItems(fileCtx) {
  const issues = [];
  const objects = fileCtx?.objects || null;
  const byType = objects?.byType || {};
  const colors = Array.isArray(fileCtx?.colors) ? fileCtx.colors : [];

  if (objects) {
    const texts = byType.text || 0;
    const frames = byType.frame || 0;
    const components = byType.component || 0;
    if (texts > 0 && frames === 0) {
      issues.push({
        severity: "warning",
        issue: "Text layers are not grouped into frames",
        suggestion: "Wrap text blocks in frame containers before layout refinement.",
      });
    }
    if (objects.total > 80 && components === 0) {
      issues.push({
        severity: "info",
        issue: "Many objects are present without reusable components",
        suggestion: "Promote repeated patterns into shared components.",
      });
    }
    if ((byType.rect || 0) > 24 && components < 2) {
      issues.push({
        severity: "info",
        issue: "The screen appears to rely on many raw rectangles",
        suggestion: "Turn repeated card and button shapes into reusable UI components.",
      });
    }
  }

  if (colors.length > 12) {
    issues.push({
      severity: "warning",
      issue: `${colors.length} unique colors detected`,
      suggestion: "Consolidate the palette into reusable color tokens.",
    });
  }

  if (!issues.length) {
    issues.push({
      severity: "info",
      issue: "No deterministic structural issues were detected from the current context",
      suggestion: "Use the AI answer plus manual review before applying design changes.",
    });
  }

  return issues;
}

function buildSafeOperationPlan(role, fileCtx, hubCtx) {
  if (role === "library_recommendation") {
    const items = (hubCtx?.catalog || []).slice(0, 5).map((item) => ({
      catalog_id: item.id,
      title: item.title || item.name,
      reason: item.description || "Relevant NOFIDA Hub library candidate.",
      category: item.category || "library",
    }));
    return {
      plan_id: crypto.randomUUID(),
      operation: "recommend_libraries",
      preview: true,
      safe: true,
      items,
    };
  }

  if (role === "screen_planner") {
    const pageName = fileCtx?.page?.name || "New Screen";
    return {
      plan_id: crypto.randomUUID(),
      operation: "create_screen_plan",
      preview: true,
      safe: true,
      items: [{
        screen_name: pageName,
        purpose: "Draft a clearer structure for the current flow.",
        components: ["header", "content", "actions"],
      }],
    };
  }

  if (role === "copywriter") {
    const texts = Array.isArray(fileCtx?.texts) ? fileCtx.texts.slice(0, 3) : [];
    return {
      plan_id: crypto.randomUUID(),
      operation: "generate_copy",
      preview: true,
      safe: true,
      items: texts.map((text, index) => ({
        layer_name: `Text ${index + 1}`,
        current_text: text,
        suggested_text: text,
      })),
    };
  }

  if (role === "file_summary") {
    return {
      plan_id: crypto.randomUUID(),
      operation: "audit_design",
      preview: true,
      safe: true,
      items: [],
    };
  }

  if (role === "design_audit" || role === "reviewer" || role === "vision" || role === "default" || role === "fast" || role === "premium") {
    return {
      plan_id: crypto.randomUUID(),
      operation: "audit_design",
      preview: true,
      safe: true,
      items: buildAuditItems(fileCtx),
    };
  }

  return null;
}

async function handleAiSettingsGet(req, res) {
  if (!requireSession(req, res, "Authenticated session required for AI settings.")) return;
  try {
    const settings = await aiSettingsService.getSettingsView();
    json(res, 200, { ok: true, settings });
  } catch (error) {
    fail(res, error.status || 500, error.code || "ai_settings_error", aiSettingsService.sanitizeText(error.message));
  }
}

async function handleAiProviderModePut(req, res) {
  if (!requireSession(req, res, "Authenticated session required for AI settings.")) return;
  try {
    const body = await parseBody(req);
    const settings = await aiSettingsService.setProviderMode(body.providerMode || body.mode);
    json(res, 200, { ok: true, settings });
  } catch (error) {
    fail(res, error.status || 400, error.code || "ai_settings_error", aiSettingsService.sanitizeText(error.message));
  }
}

async function handleAiProviderKeyPut(req, res) {
  if (!requireSession(req, res, "Authenticated session required for AI settings.")) return;
  try {
    const body = await parseBody(req);
    const provider = await aiSettingsService.saveProviderKey(body);
    json(res, 200, { ok: true, provider });
  } catch (error) {
    fail(res, error.status || 400, error.code || "ai_settings_error", aiSettingsService.sanitizeText(error.message));
  }
}

async function handleAiProviderKeyDelete(req, res, providerId) {
  if (!requireSession(req, res, "Authenticated session required for AI settings.")) return;
  try {
    const provider = await aiSettingsService.deleteProviderKey(providerId);
    json(res, 200, { ok: true, provider });
  } catch (error) {
    fail(res, error.status || 400, error.code || "ai_settings_error", aiSettingsService.sanitizeText(error.message));
  }
}

async function handleAiModelAssignmentPut(req, res) {
  if (!requireSession(req, res, "Authenticated session required for AI settings.")) return;
  try {
    const body = await parseBody(req);
    const assignments = await aiSettingsService.setModelAssignment(body);
    json(res, 200, { ok: true, assignments });
  } catch (error) {
    fail(res, error.status || 400, error.code || "ai_settings_error", aiSettingsService.sanitizeText(error.message));
  }
}

async function handleAiEnginePut(req, res) {
  if (!requireSession(req, res, "Authenticated session required for AI settings.")) return;
  try {
    const body = await parseBody(req);
    const engine = await aiSettingsService.setEngine(body);
    json(res, 200, { ok: true, engine });
  } catch (error) {
    fail(res, error.status || 400, error.code || "ai_settings_error", aiSettingsService.sanitizeText(error.message));
  }
}

async function handleAiTestProvider(req, res) {
  if (!requireSession(req, res, "Authenticated session required for AI settings.")) return;
  try {
    const body = await parseBody(req);
    const result = await aiSettingsService.testProvider(body);
    json(res, 200, { ok: true, result });
  } catch (error) {
    fail(res, error.status || 400, error.code || "ai_test_error", aiSettingsService.sanitizeText(error.message));
  }
}

async function handleAiTestModel(req, res) {
  if (!requireSession(req, res, "Authenticated session required for AI settings.")) return;
  try {
    const body = await parseBody(req);
    const result = await aiSettingsService.testModel(body);
    json(res, 200, { ok: true, result });
  } catch (error) {
    fail(res, error.status || 400, error.code || "ai_test_error", aiSettingsService.sanitizeText(error.message));
  }
}

// POST /ai/ask — NOFIDA AI conversation endpoint (read-only, non-destructive)
async function handleAiAsk(req, res) {
  if (!requireSession(req, res, "Authenticated session required for AI endpoint.")) return;

  let body;
  try {
    body = await parseBody(req);
  } catch (error) {
    fail(res, error.status || 400, error.code || "bad_request", error.message);
    return;
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    fail(res, 400, "missing_message", "Field 'message' is required.");
    return;
  }

  const fileCtx = body.file_context && typeof body.file_context === "object" ? body.file_context : null;
  const hubCtx = body.hub_context && typeof body.hub_context === "object" ? body.hub_context : null;
  const requestedRole = normalizeAiRole(body.role) || inferAiRole(message, fileCtx);

  try {
    const resolved = await aiSettingsService.resolveModelForRole(requestedRole);
    const systemPrompt = buildSystemPrompt(fileCtx, hubCtx, requestedRole);
    const result = await aiSettingsService.callWithResolvedModel({
      resolved,
      message,
      systemPrompt,
    });
    const operationPlan = buildSafeOperationPlan(requestedRole, fileCtx, hubCtx);

    log("INFO", "ai/ask", {
      role: requestedRole,
      provider: result.providerId,
      model: result.modelId,
      source: resolved.source,
      messageLen: message.length,
    });

    json(res, 200, {
      ok: true,
      answer: result.answer,
      operation_plan: operationPlan,
      provider: result.providerId,
      model: result.modelId,
      role: requestedRole,
      resolution_source: resolved.source,
    });
  } catch (error) {
    const safeMessage = aiSettingsService.sanitizeText(error.message);
    log("ERROR", "ai/ask failed", { code: error.code || "ai_error", message: safeMessage });
    fail(res, error.status || 502, error.code || "ai_error", safeMessage || "AI provider error. Check server configuration.");
  }
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    fail(res, 400, "missing_url", "Request URL is missing.");
    return;
  }

  const url = new URL(req.url, "http://nofida-hub-adapter.local");

  if (req.method === "GET" && url.pathname === "/health") {
    const health = await aiSettingsService.getHealthSummary().catch(() => ({
      configuredProviders: [],
      settingsPath: null,
      registrySyncedAt: null,
      providerMode: "role_assignments",
    }));
    json(res, 200, {
      ok: true,
      service: "nofida-hub-adapter",
      version: "016b",
      ai_provider_mode: health.providerMode,
      ai_configured_providers: health.configuredProviders,
      ai_settings_path: health.settingsPath,
      ai_registry_synced_at: health.registrySyncedAt,
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/import") {
    await handleImport(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/quality-check") {
    await handleQualityCheck(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/ai/ask") {
    await handleAiAsk(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/ai/settings") {
    await handleAiSettingsGet(req, res);
    return;
  }

  if (req.method === "PUT" && url.pathname === "/ai/settings/provider-mode") {
    await handleAiProviderModePut(req, res);
    return;
  }

  if (req.method === "PUT" && url.pathname === "/ai/settings/provider-key") {
    await handleAiProviderKeyPut(req, res);
    return;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/ai/settings/provider-key/")) {
    const providerId = decodeURIComponent(url.pathname.slice("/ai/settings/provider-key/".length));
    await handleAiProviderKeyDelete(req, res, providerId);
    return;
  }

  if (req.method === "PUT" && url.pathname === "/ai/settings/model-assignment") {
    await handleAiModelAssignmentPut(req, res);
    return;
  }

  if (req.method === "PUT" && url.pathname === "/ai/settings/engine") {
    await handleAiEnginePut(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/ai/test-provider") {
    await handleAiTestProvider(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/ai/test-model") {
    await handleAiTestModel(req, res);
    return;
  }

  fail(res, 404, "not_found", "Route not found.");
});

server.listen(PORT, HOST, () => {
  log("INFO", `nofida-hub-adapter listening on ${HOST}:${PORT}`, {
    storeRoot: STORE_ROOT,
    penpotBaseUrl: PENPOT_BASE_URL,
    chunkSize: CHUNK_SIZE,
    maxImportBytes: MAX_IMPORT_BYTES,
  });
});
