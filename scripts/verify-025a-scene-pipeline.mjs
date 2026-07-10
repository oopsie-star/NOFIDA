#!/usr/bin/env node
// =============================================================================
// PATCH 025A — local pipeline verification (no deployment, no Playwright)
// =============================================================================
// Exercises the pure Scene Model pipeline (validator -> canonicalizer ->
// normalizer -> compiler) directly under plain `node`, plus the browser-only
// persistence-adapter.js/transit-adapter.js loaded into a minimal vm sandbox
// with `fetch` stubbed — no live Penpot server needed.
//
// Status this script can prove: CODE READY. It CANNOT prove the original
// blank-canvas bug is fixed — that requires a live Penpot canvas (see PART7/
// PART8's render-verification requirements, which need a real deploy).
//
// Usage: node scripts/verify-025a-scene-pipeline.mjs
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

function importFrom(relPath) {
  return import(pathToFileURL(path.join(REPO_ROOT, relPath)).href);
}

const { parseScene, validateScene } = await importFrom("services/nofida-hub-adapter/ai/scene/scene-validator.mjs");
const { canonicalizeScene } = await importFrom("services/nofida-hub-adapter/ai/scene/scene-canonicalizer.mjs");
const { normalizeScene, maxFrameDepthOf, isFlattenSafe } = await importFrom("services/nofida-hub-adapter/ai/scene/scene-normalizer.mjs");
const { compileScene } = await importFrom("services/nofida-hub-adapter/ai/scene/scene-compiler.mjs");
const { GROUPING_TYPES } = await importFrom("services/nofida-hub-adapter/ai/scene/scene-schema.mjs");

let failures = 0;
let passed = 0;

function ok(condition, label, detail) {
  if (condition) {
    passed += 1;
    console.log("  PASS  " + label);
  } else {
    failures += 1;
    console.log("  FAIL  " + label + (detail ? " — " + detail : ""));
  }
}

function section(title) {
  console.log("\n" + title);
}

function countLeaves(node) {
  if (!GROUPING_TYPES.has(node.type)) return 1;
  let n = 0;
  for (const child of node.children || []) n += countLeaves(child);
  return n;
}

function sequentialIdFactory(prefix) {
  let n = 0;
  return () => `${prefix}-${n++}`;
}

function pipeline(raw, previousScene) {
  const parsed = parseScene(JSON.stringify(raw));
  if (!parsed.ok) return { parsed };
  const canonical = canonicalizeScene(parsed.scene, { previousScene });
  const normalized = normalizeScene(canonical);
  return { parsed, canonical, normalized };
}

// ── Mirror sync gate ─────────────────────────────────────────────────────────
section("0. Frontend Scene Model mirror is byte-equivalent to canonical source");
{
  try {
    execFileSync("sh", [path.join(REPO_ROOT, "scripts/check-shared-scene-sync.sh")], { stdio: "pipe" });
    ok(true, "scripts/check-shared-scene-sync.sh passes");
  } catch (err) {
    ok(false, "scripts/check-shared-scene-sync.sh passes", (err.stdout || err.message || "").toString().trim());
  }
}

// ── Test A — simple 16-node/2-level scene ───────────────────────────────────
section("A. Simple scene (16 nodes, 2 levels)");
{
  const children = [];
  for (let i = 0; i < 15; i++) {
    children.push(
      i % 2 === 0
        ? { type: "rect", name: `row-${i}`, x: 0, y: i * 40, width: 320, height: 32, fill: "#222222" }
        : { type: "text", name: `label-${i}`, x: 8, y: i * 40 + 6, width: 200, height: 20, content: `Row ${i}` }
    );
  }
  const raw = { name: "Simple", width: 360, height: 640, fill: "#0B1020", children };
  const { parsed, normalized } = pipeline(raw);
  ok(parsed.ok, "validates clean", parsed.error);
  ok(normalized.report.changed === false, "normalizer reports zero changes", JSON.stringify(normalized.report));
  let idc = 0;
  const compiled = compileScene(normalized.scene, { pageId: "page-1", newId: () => `a-${idc++}` });
  ok(compiled.ok === true, "compiles ok");
  ok(compiled.changes.length === 16, "compiler produces 16 add-obj changes", `got ${compiled.changes.length}`);
}

// ── Test B — deep-nested scene (reproduces the Day+Night blank-canvas bug) ──
section("B. Deep-nested scene flagged by the normalizer");
const deepFixture = {
  name: "Day+Night", width: 360, height: 800, fill: "#0B1020",
  children: [
    { type: "board", name: "Background", x: 0, y: 0, width: 360, height: 800, fill: "#1a1a2e",
      children: [
        { type: "board", name: "Day", x: 0, y: 0, width: 360, height: 400, fill: "#f4f4f5",
          children: [
            { type: "board", name: "Phase ring card", x: 20, y: 40, width: 320, height: 300, fill: "#181622", borderRadius: 20,
              children: [
                { type: "board", name: "Ring outer", x: 40, y: 60, width: 280, height: 280, fill: "#f5efe6", borderRadius: 140,
                  children: [{ type: "text", name: "label", x: 60, y: 80, width: 200, height: 20, content: "Phase" }],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};
let normalizedDeep;
{
  const { parsed, canonical, normalized } = pipeline(deepFixture);
  ok(parsed.ok, "validates clean", parsed.error);
  const before = maxFrameDepthOf(canonical);
  ok(before > 3, "maxFrameDepthBefore exceeds MAX_FRAME_DEPTH(3)", `got ${before}`);
  ok(normalized.report.demotedCount > 0 || normalized.report.flattenedCount > 0, "normalizer demotes/flattens something", JSON.stringify(normalized.report));
  ok(countLeaves(normalized.scene) === countLeaves(canonical) + normalized.report.paintExtractedCount,
    "leaf count preserved (+ synthetic backgrounds for extracted paint)",
    `leaves after=${countLeaves(normalized.scene)} before=${countLeaves(canonical)} extracted=${normalized.report.paintExtractedCount}`);
  normalizedDeep = normalized.scene;
}

// ── Test C — re-normalizing the normalized output is a fixed point ─────────
section("C. Normalized scene is a fixed point");
{
  const norm2 = normalizeScene(normalizedDeep);
  ok(norm2.report.changed === false, "second pass reports zero changes", JSON.stringify(norm2.report));
  ok(norm2.report.maxFrameDepthAfter <= 3, "maxFrameDepthAfter <= MAX_FRAME_DEPTH(3)", `got ${norm2.report.maxFrameDepthAfter}`);
  let idc = 0;
  const compiled = compileScene(normalizedDeep, { pageId: "page-1", newId: () => `c-${idc++}` });
  ok(compiled.ok === true, "compiles ok with no unresolved nodes", compiled.error);
  ok(compiled.changes.every((c) => c.op === "add-obj"), "all changes are add-obj in create mode");
}

// ── Test D — update mode: single-field edit touches only that node ─────────
section("D. Update mode diffs previousScene vs new canonical scene");
{
  const v1 = {
    name: "Card", width: 360, height: 400, fill: "#111111",
    children: [
      { id: "hdr", type: "text", name: "Header", x: 20, y: 20, width: 200, height: 24, content: "Hello" },
      { id: "sub", type: "text", name: "Sub", x: 20, y: 50, width: 200, height: 20, content: "World" },
      { id: "cta", type: "rect", name: "CTA", x: 20, y: 100, width: 320, height: 48, fill: "#2563EB" },
    ],
  };
  const p1 = pipeline(v1);
  ok(p1.parsed.ok, "v1 validates clean", (p1.parsed.errors || []).join("; "));
  const newId = sequentialIdFactory("d");
  const compiled1 = compileScene(p1.normalized.scene, { pageId: "page-1", newId, mode: "create" });
  ok(compiled1.ok === true, "v1 compiles ok");
  ok(compiled1.changes.length === 4, "v1 create produces 4 add-obj changes", `got ${compiled1.changes.length}`);

  // v2: only "sub"'s content changes; canonicalized AGAINST v1's canonical
  // scene so the unchanged nodes keep their nid (path+id-match), exactly
  // like a real follow-up turn.
  const v2 = JSON.parse(JSON.stringify(v1));
  v2.children[1].content = "Changed!";
  const p2 = pipeline(v2, p1.canonical);
  ok(p2.canonical.children[0].nid === p1.canonical.children[0].nid, "unrelated node (Header) kept its canonical id across turns");

  const compiled2 = compileScene(p2.normalized.scene, {
    pageId: "page-1", newId, mode: "update",
    previousScene: p1.normalized.scene, previousMapping: compiled1.mapping,
  });
  ok(compiled2.ok === true, "v2 update compiles ok");
  ok(compiled2.changes.length === 1, "update mode produces exactly 1 change", `got ${compiled2.changes.length}: ${JSON.stringify(compiled2.changes)}`);
  ok(compiled2.changes[0]?.op === "mod-obj", "the change is mod-obj");
  ok(compiled2.changes[0]?.id === compiled1.mapping[p1.normalized.scene.children[1].nid], "the change targets the edited node's existing Penpot id");

  // Reparenting (moved to a different parent) must show up as del+add, not
  // be silently missed by field-only diffing.
  const v3 = JSON.parse(JSON.stringify(v2));
  const cta = v3.children.pop();
  v3.children[0].type = "board"; // Header becomes a frame that now contains CTA
  v3.children[0].children = [cta];
  const p3 = pipeline(v3, p1.canonical);
  const compiled3 = compileScene(p3.normalized.scene, {
    pageId: "page-1", newId, mode: "update",
    previousScene: p2.normalized.scene, previousMapping: compiled2.ok ? Object.assign({}, compiled1.mapping) : {},
  });
  ok(compiled3.ok === true, "v3 (reparent) update compiles ok");
  const ctaDel = compiled3.changes.some((c) => c.op === "del-obj" && c.id === compiled1.mapping[p1.normalized.scene.children[2].nid]);
  const ctaAdd = compiled3.changes.some((c) => c.op === "add-obj" && c.kind === "rect");
  ok(ctaDel && ctaAdd, "reparented node compiled as delete + recreate, not silently skipped", JSON.stringify(compiled3.changes));
}

// ── Test — isFlattenSafe protects rotation/layout/clip/mask from flatten ───
section("Protected content is never flattened or demoted");
{
  const protectedFixture = {
    name: "Screen", width: 360, height: 800,
    children: [
      { type: "board", name: "L1", x: 0, y: 0, width: 360, height: 800, fill: "#111",
        children: [
          { type: "board", name: "L2", x: 0, y: 0, width: 360, height: 800,
            children: [
              { type: "board", name: "L3", x: 0, y: 0, width: 360, height: 800,
                children: [
                  { type: "board", name: "Rotated deep frame", x: 0, y: 0, width: 100, height: 100, rotation: 15, fill: "#222",
                    children: [{ type: "text", name: "t", x: 0, y: 0, width: 50, height: 20, content: "x" }] },
                ] },
            ] },
        ] },
    ],
  };
  ok(isFlattenSafe({ type: "group", rotation: 15 }) === false, "isFlattenSafe rejects rotation");
  ok(isFlattenSafe({ type: "group", layout: { type: "flex" } }) === false, "isFlattenSafe rejects layout");
  ok(isFlattenSafe({ type: "group", clip: true }) === false, "isFlattenSafe rejects clip");
  ok(isFlattenSafe({ type: "group", mask: true }) === false, "isFlattenSafe rejects mask");
  ok(isFlattenSafe({ type: "group", blendMode: "multiply" }) === false, "isFlattenSafe rejects non-normal blend mode");
  ok(isFlattenSafe({ type: "group", opacity: 0.5 }) === false, "isFlattenSafe rejects opacity != 1");
  ok(isFlattenSafe({ type: "group" }) === true, "isFlattenSafe accepts a plain group");

  const { parsed, canonical, normalized } = pipeline(protectedFixture);
  ok(parsed.ok, "validates clean", parsed.error);
  ok(normalized.report.protectedCount > 0, "normalizer reports at least one protected node", JSON.stringify(normalized.report));
  // find the rotated node in the normalized tree — it must still be type "frame" (board),
  // never demoted to "group", despite being past the depth budget.
  function findByName(node, name) {
    if (node.name === name) return node;
    for (const child of node.children || []) {
      const found = findByName(child, name);
      if (found) return found;
    }
    return null;
  }
  const rotatedNode = findByName(normalized.scene, "Rotated deep frame");
  ok(rotatedNode && rotatedNode.type === "frame", "rotated frame past depth budget stayed a real frame, not demoted", rotatedNode && rotatedNode.type);
}

// ── Test — allowPartial: unsupported types hard-fail by default, lower otherwise ─
section("allowPartial=false hard-fails on unsupported types; button/input/line/icon lower instead");
{
  const lowerableFixture = {
    name: "T", width: 360, height: 640,
    children: [
      { type: "button", name: "cta", x: 20, y: 20, width: 320, height: 48, fill: "#2563EB", borderRadius: 12, content: "Continue" },
      { type: "icon", name: "star", x: 20, y: 100, width: 24, height: 24, fill: "#F59E0B" },
      { type: "line", name: "divider", x: 20, y: 140, width: 320, height: 1, strokeColor: "#333333" },
    ],
  };
  const { parsed, normalized } = pipeline(lowerableFixture);
  ok(parsed.ok, "validates clean (lowerable types accepted by schema)", parsed.error);
  let idc = 0;
  const compiled = compileScene(normalized.scene, { pageId: "page-1", newId: () => `l-${idc++}` });
  ok(compiled.ok === true, "compiles ok without allowPartial (lowered, not skipped)", compiled.error);
  ok(compiled.changes.length === 5, "button lowers to rect+text, icon and line each lower to 1 rect (5 total)", `got ${compiled.changes.length}`);

  const unsupportedFixture = {
    name: "T2", width: 360, height: 640,
    children: [{ type: "image", name: "photo", x: 0, y: 0, width: 100, height: 100 }],
  };
  const p2 = pipeline(unsupportedFixture);
  const compiledStrict = compileScene(p2.normalized.scene, { pageId: "page-1", newId: () => `u-${idc++}` });
  ok(compiledStrict.ok === false, "image (unsupported, unlowerable) hard-fails without allowPartial");
  ok(Array.isArray(compiledStrict.unresolvedNodes) && compiledStrict.unresolvedNodes.length === 1, "hard-fail reports the exact unresolved node");

  const compiledPartial = compileScene(p2.normalized.scene, { pageId: "page-1", newId: () => `u2-${idc++}`, allowPartial: true });
  ok(compiledPartial.ok === true, "same scene compiles with allowPartial=true");
  ok(compiledPartial.diagnostics.skipped.length === 1, "allowPartial mode reports the skip explicitly, doesn't silently drop it");
}

// ── E/F — persistence adapter: bulk-update gate, pre-UUID idempotency, rollback, 409 retry ──
section("E/F. Persistence adapter: bulk-update gate + pre-UUID idempotency + rollback + 409 retry (stubbed fetch)");
{
  const sandbox = {};
  sandbox.window = sandbox;
  sandbox.URLSearchParams = URLSearchParams;
  sandbox.crypto = { randomUUID: () => "sess-" + Math.random().toString(36).slice(2) };
  sandbox.console = console;
  sandbox.setTimeout = setTimeout;

  const calls = [];
  let updateFileResponses = [];
  sandbox.fetch = async (url, opts) => {
    if (String(url).indexOf("get-file") >= 0) {
      calls.push({ kind: "get-file" });
      return { ok: true, json: async () => ["^ ", "~:revn", 1, "~:vern", 1] };
    }
    if (String(url).indexOf("update-file") >= 0) {
      const body = JSON.parse(opts.body);
      calls.push({ kind: "update-file", body });
      const next = updateFileResponses.shift() || { ok: true };
      return {
        ok: next.ok,
        status: next.ok ? 200 : (next.status || 409),
        text: async () => (next.ok ? "" : JSON.stringify(next.body || "conflict")),
      };
    }
    throw new Error("unexpected fetch: " + url);
  };

  function runVm(file) {
    const code = fs.readFileSync(path.join(REPO_ROOT, "branding/ai-core/designer", file), "utf8");
    vm.runInNewContext(code, sandbox, { filename: file });
  }
  runVm("transit-adapter.js");
  runVm("persistence-adapter.js");

  const Persistence = sandbox.window.NofidaDesigner.Persistence;

  // Bulk update is gated off by default — refused before any network call.
  const updateAttempt = await Persistence.applyChanges(
    [{ op: "mod-obj", id: "shape-1", kind: "rect", fields: { name: "x" } }],
    { fileId: "file-1", mode: "update" }
  );
  ok(updateAttempt.ok === false, "update-mode apply is refused while ALLOW_BULK_UPDATE=false");
  ok(calls.length === 0, "refused update-mode apply makes no network calls", `${calls.length} calls made`);

  const changes = [
    { op: "add-obj", id: "shape-1", kind: "rect", pageId: "page-1", parentId: "00000000-0000-0000-0000-000000000000", frameId: "00000000-0000-0000-0000-000000000000", fields: { name: "r1", x: 0, y: 0, width: 10, height: 10 } },
  ];

  // Pre-UUID idempotency: the orchestrator (ai-bridge.js) is supposed to
  // check getIdempotentEntry() BEFORE compiling/minting any uuid at all —
  // exercise that contract directly against the store.
  const idemKey = "op-1::file-1::page-1::hash-abc::create";
  ok(Persistence.getIdempotentEntry(idemKey) === undefined, "no idempotent entry exists yet for a fresh key");

  updateFileResponses = [{ ok: true }];
  const r1 = await Persistence.applyChanges(changes, { fileId: "file-1", mode: "create" });
  ok(r1.ok === true, "first apply succeeds", JSON.stringify(r1));
  Persistence.storeIdempotentEntry(idemKey, { mapping: { n1: "shape-1" }, snapshot: {}, result: r1 });

  const callsBefore = calls.length;
  const cached = Persistence.getIdempotentEntry(idemKey);
  ok(cached && cached.result.ok === true && cached.mapping.n1 === "shape-1", "repeat of the same operationId+scene finds the stored mapping without recompiling");
  ok(calls.length === callsBefore, "consulting the idempotency store makes no network calls");

  // Rollback — deletes the id the last create-mode apply added.
  updateFileResponses = [{ ok: true }];
  const rb = await Persistence.rollbackLastApply();
  ok(rb.ok === true, "rollback succeeds", JSON.stringify(rb));
  const lastCall = calls[calls.length - 1];
  ok(lastCall.kind === "update-file", "rollback issued an update-file call");

  // Revision conflict — first update-file 409s, retry succeeds.
  const changes2 = changes.map((c) => ({ ...c, id: "shape-2" }));
  updateFileResponses = [{ ok: false, status: 409, body: "conflict" }, { ok: true }];
  const getFileCallsBefore = calls.filter((c) => c.kind === "get-file").length;
  const r3 = await Persistence.applyChanges(changes2, { fileId: "file-1", mode: "create" });
  ok(r3.ok === true, "409 conflict is retried and eventually succeeds", JSON.stringify(r3));
  const getFileCallsAfter = calls.filter((c) => c.kind === "get-file").length;
  ok(getFileCallsAfter === getFileCallsBefore + 2, "conflict retry re-fetched revn/vern", `${getFileCallsBefore} -> ${getFileCallsAfter}`);
}

console.log(`\n${passed} passed, ${failures} failed`);
console.log(failures === 0
  ? "\nCODE READY / LIVE RENDER VERIFICATION REQUIRED."
  : "\nNOT CODE READY — fix failures above.");
process.exit(failures > 0 ? 1 : 0);
