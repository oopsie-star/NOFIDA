// Fetches a lightweight visual reference from a URL the user pastes in chat
// (a Figma community link, an App Store listing, a live Lovable-built app,
// any page with normal SEO meta tags) by scraping its Open Graph / Twitter
// Card preview image — no headless browser, no third-party screenshot API,
// no new runtime dependency, consistent with this service's zero-dependency
// Node stdlib-only design.
//
// Deliberately NOT implemented here (needs infrastructure/account decisions
// this module shouldn't make unilaterally):
//   - Full-page screenshots of arbitrary live web apps (needs a headless
//     browser or a paid screenshot API).
//   - Figma's real file/layer data (needs a user-provided Figma personal
//     access token — the public REST API has no anonymous access).
//   - General open-ended web search (needs a search API key).
//
// This module fetches an arbitrary user-supplied URL FROM THE SERVER, which
// is an SSRF surface — resolveGuardedHost() below is the load-bearing safety
// check and must run before every fetch, including after following the one
// permitted redirect.

import dns from "node:dns/promises";
import net from "node:net";

const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 2 * 1024 * 1024; // 2MB is generous for a <head>
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_REDIRECTS = 2;
const ALLOWED_IMAGE_CONTENT_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

function isPrivateOrReservedIp(ip) {
  const version = net.isIP(ip);
  if (version === 4) {
    const parts = ip.split(".").map(Number);
    const [a, b] = parts;
    if (a === 127) return true; // loopback
    if (a === 10) return true; // private
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
    if (a === 0) return true;
    if (a >= 224) return true; // multicast/reserved
    return false;
  }
  if (version === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1") return true; // loopback
    if (lower.startsWith("fe80:")) return true; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
    if (lower.startsWith("::ffff:")) return isPrivateOrReservedIp(lower.slice(7)); // v4-mapped
    return false;
  }
  return true; // not a parseable IP — treat as unsafe
}

const BLOCKED_HOSTNAME_SUFFIXES = [".local", ".internal", ".localhost"];

/** Validates a URL is http(s), resolves its hostname, and rejects anything
 * pointing at a private/internal address (including our own sibling
 * containers). Returns the validated URL object or throws. */
async function resolveGuardedUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch (_error) {
    throw Object.assign(new Error("Invalid URL."), { code: "invalid_url" });
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw Object.assign(new Error("Only http/https URLs are allowed."), { code: "invalid_protocol" });
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || BLOCKED_HOSTNAME_SUFFIXES.some((suf) => hostname.endsWith(suf))) {
    throw Object.assign(new Error("This host is not allowed."), { code: "blocked_host" });
  }
  // Block obvious internal docker-compose service names outright, in case DNS
  // inside the container would otherwise happily resolve them.
  if (/^(penpot|nofida)-/.test(hostname)) {
    throw Object.assign(new Error("This host is not allowed."), { code: "blocked_host" });
  }

  const directIp = net.isIP(hostname) ? hostname : null;
  const ipsToCheck = directIp ? [directIp] : (await dns.lookup(hostname, { all: true }).catch(() => [])).map((r) => r.address);

  if (ipsToCheck.length === 0) {
    throw Object.assign(new Error("Could not resolve host."), { code: "dns_failed" });
  }
  if (ipsToCheck.some(isPrivateOrReservedIp)) {
    throw Object.assign(new Error("This host resolves to a private address and is not allowed."), { code: "blocked_host" });
  }

  return url;
}

async function guardedFetch(rawUrl, expectBinary) {
  let currentUrl = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const validated = await resolveGuardedUrl(currentUrl);
    const response = await fetch(validated, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; NofidaAI-ReferenceFetcher/1.0)",
        Accept: expectBinary ? "image/*" : "text/html,application/xhtml+xml",
      },
    });

    if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.get("location")) {
      currentUrl = new URL(response.headers.get("location"), validated).toString();
      continue;
    }
    return response;
  }
  throw Object.assign(new Error("Too many redirects."), { code: "too_many_redirects" });
}

function extractMeta(html, property) {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, "i"),
    new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${property}["']`, "i"),
  ];
  for (const re of patterns) {
    const match = html.match(re);
    if (match) return match[1];
  }
  return null;
}

async function readCapped(response, maxBytes) {
  const reader = response.body?.getReader ? response.body.getReader() : null;
  if (!reader) {
    // Environments without a streaming body reader — fall back, still capped after the fact.
    const buf = Buffer.from(await response.arrayBuffer());
    if (buf.length > maxBytes) throw Object.assign(new Error("Response too large."), { code: "too_large" });
    return buf;
  }
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch (_error) { /* ignore */ }
      throw Object.assign(new Error("Response too large."), { code: "too_large" });
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** Fetches a URL and returns a reference image (as base64) plus basic
 * metadata, or throws a descriptive error. Never throws for "no og:image
 * found" — returns { ok:false, reason } instead, since that's an expected
 * outcome for plenty of ordinary URLs, not a hard failure. */
export async function fetchUrlReference(rawUrl) {
  const pageResponse = await guardedFetch(rawUrl, false);
  if (!pageResponse.ok) {
    throw Object.assign(new Error(`Page request failed with status ${pageResponse.status}.`), { code: "page_fetch_failed" });
  }
  const contentType = pageResponse.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    return { ok: false, reason: "not_html", sourceUrl: rawUrl };
  }

  const htmlBuf = await readCapped(pageResponse, MAX_HTML_BYTES);
  const html = htmlBuf.toString("utf8");

  const imageUrl = extractMeta(html, "og:image") || extractMeta(html, "twitter:image");
  const title = extractMeta(html, "og:title") || (html.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1] || null;
  const description = extractMeta(html, "og:description") || extractMeta(html, "description");

  if (!imageUrl) {
    return { ok: false, reason: "no_preview_image", sourceUrl: rawUrl, title, description };
  }

  const absoluteImageUrl = new URL(imageUrl, rawUrl).toString();
  const imageResponse = await guardedFetch(absoluteImageUrl, true);
  if (!imageResponse.ok) {
    return { ok: false, reason: "image_fetch_failed", sourceUrl: rawUrl, title, description };
  }
  const imageContentType = (imageResponse.headers.get("content-type") || "").split(";")[0].trim();
  if (!ALLOWED_IMAGE_CONTENT_TYPES.has(imageContentType)) {
    return { ok: false, reason: "unsupported_image_type", sourceUrl: rawUrl, title, description };
  }

  const imageBuf = await readCapped(imageResponse, MAX_IMAGE_BYTES);

  return {
    ok: true,
    sourceUrl: rawUrl,
    title,
    description,
    mimeType: imageContentType,
    dataBase64: imageBuf.toString("base64"),
  };
}
