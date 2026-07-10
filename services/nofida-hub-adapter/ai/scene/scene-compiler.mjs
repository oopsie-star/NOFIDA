// Scene Model -> Penpot Change IR compiler (PATCH 025A, addendum-revised).
//
// Pure module: emits a plain, transit-agnostic list of change descriptions
// (`{op, id, kind, ...}`) plus a NOFIDA-id -> Penpot-id `mapping`. No transit
// tags, no network, no ids from `crypto` imported directly — the caller
// injects `newId` so this module has zero environment dependency and is
// trivially testable with a fake sequential generator.
//
// PATCH 025A addendum:
//   - `allowPartial` defaults to FALSE. A node type the compiler has no
//     Penpot equivalent for (path/image, or a component-instance — this
//     module has no visibility into which libraries are actually connected
//     at runtime) STOPS compilation with a precise per-node error unless the
//     caller explicitly opts into partial application. button/input/line/
//     icon are not stopped — they're LOWERED to compilable primitives
//     (rectangle [+ text]) via penpot-shape-adapter.mjs's lowerNode(), since
//     that's a safe, deterministic, lossless-enough substitution.
//   - Update mode now diffs the actual previousScene tree against the new
//     canonical scene (matched by stable nid — see scene-canonicalizer.mjs),
//     not just a flat previousMapping dictionary — this is what lets it
//     detect a node that moved to a different parent/frame, not only field
//     edits. previousMapping is still required (nid -> Penpot id can't be
//     derived from the scene alone), but is no longer the only input.
//     Reparenting is compiled as delete + recreate rather than a fabricated
//     "move" change type Penpot's mod-obj protocol doesn't verifiably
//     support here.
//
// transit-adapter.js (browser-only) turns this Change IR into the actual
// wire payload for Penpot's update-file RPC.

import { ROOT_FRAME_ID, NON_FRAME_GROUPING_TYPES } from "./scene-schema.mjs";
import { buildFields, lowerNode } from "./penpot-shape-adapter.mjs";

function defaultNewId() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function penpotKindFor(type) {
  if (type === "frame") return "frame";
  if (NON_FRAME_GROUPING_TYPES.has(type)) return "group";
  if (type === "rectangle") return "rect";
  if (type === "ellipse") return "circle";
  if (type === "text") return "text";
  return null; // component-instance, and anything lowerNode() can't handle
}

// Flattens the tree into parent-first {nid, kind, parentNid, frameNid,
// fields} entries, lowering button/input/line/icon inline (each lowered
// node becomes 1-2 sibling leaf entries at the SAME parent/frame level as
// the original — lowering never introduces new nesting, so it can't
// reintroduce the depth problem the normalizer already solved). Anything
// that can neither be compiled directly nor lowered (path/image,
// component-instance) is collected in `unresolved` instead of silently
// dropped.
function flattenWithFields(scene) {
  const entries = [];
  const unresolved = [];

  function visitLeaf(node, kind, parentNid, frameNid) {
    entries.push({ nid: node.nid, kind, parentNid, frameNid, fields: buildFields(node, kind) });
  }

  function visit(node, parentNid, frameNid) {
    if (node.type === "component-instance") {
      unresolved.push({ nid: node.nid, type: node.type, reason: "component copy-linkage not implemented — the compiler has no visibility into which libraries are connected at runtime" });
      return;
    }

    const kind = penpotKindFor(node.type);
    if (kind === null) {
      const lowered = lowerNode(node);
      if (!lowered) {
        unresolved.push({ nid: node.nid, type: node.type, reason: "no Penpot equivalent and not lowerable to a supported primitive" });
        return;
      }
      for (const leaf of lowered) {
        visitLeaf(leaf, penpotKindFor(leaf.type), parentNid, frameNid);
      }
      return;
    }

    visitLeaf(node, kind, parentNid, frameNid);
    const childFrameNid = kind === "frame" ? node.nid : frameNid;
    for (const child of node.children || []) visit(child, node.nid, childFrameNid);
  }

  visit(scene, null, null);
  return { entries, unresolved };
}

function resolveId(mapping, previousMapping, nid) {
  if (!nid) return ROOT_FRAME_ID;
  const id = mapping[nid] !== undefined ? mapping[nid] : previousMapping[nid];
  return id === undefined ? ROOT_FRAME_ID : id;
}

function unresolvedError(unresolved) {
  return `cannot compile ${unresolved.length} node(s) without allowPartial: ` +
    unresolved.map((u) => `${u.nid} (${u.type}): ${u.reason}`).join("; ");
}

function compileCreate(scene, opts) {
  const newId = opts.newId || defaultNewId;
  const pageId = opts.pageId;
  const allowPartial = opts.allowPartial === true;

  const { entries, unresolved } = flattenWithFields(scene);
  if (unresolved.length && !allowPartial) {
    return { ok: false, error: unresolvedError(unresolved), unresolvedNodes: unresolved, changes: [], mapping: {}, snapshot: {} };
  }

  const mapping = {};
  const snapshot = {};
  const changes = [];

  for (const entry of entries) {
    const id = newId();
    mapping[entry.nid] = id;
    snapshot[entry.nid] = entry.fields;
    changes.push({
      op: "add-obj",
      id,
      kind: entry.kind,
      pageId,
      parentId: resolveId(mapping, {}, entry.parentNid),
      frameId: resolveId(mapping, {}, entry.frameNid),
      fields: entry.fields,
    });
  }

  return { ok: true, changes, mapping, snapshot, diagnostics: { skipped: allowPartial ? unresolved : [], warnings: [] } };
}

function fieldsEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

function diffFieldObjects(before, after) {
  const changed = {};
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  for (const key of keys) {
    if (!fieldsEqual(before ? before[key] : undefined, after ? after[key] : undefined)) {
      changed[key] = after ? after[key] : undefined;
    }
  }
  return changed;
}

function compileUpdate(scene, opts) {
  const newId = opts.newId || defaultNewId;
  const pageId = opts.pageId;
  const allowPartial = opts.allowPartial === true;
  const previousMapping = opts.previousMapping || {};

  const { entries: newEntries, unresolved } = flattenWithFields(scene);
  if (unresolved.length && !allowPartial) {
    return { ok: false, error: unresolvedError(unresolved), unresolvedNodes: unresolved, changes: [], mapping: {}, snapshot: {} };
  }

  // Diff against the ACTUAL previous scene tree, not just the flat id
  // mapping — this is what lets a reparent (moved to a different parent
  // frame/group) be detected, not just field-level edits.
  const oldEntries = opts.previousScene ? flattenWithFields(opts.previousScene).entries : [];
  const oldByNid = new Map(oldEntries.map((e) => [e.nid, e]));
  const newByNid = new Map(newEntries.map((e) => [e.nid, e]));

  const mapping = {};
  const snapshot = {};
  const changes = [];

  for (const entry of newEntries) {
    snapshot[entry.nid] = entry.fields;
    const old = oldByNid.get(entry.nid);
    const existingId = previousMapping[entry.nid];

    if (old && existingId !== undefined) {
      const reparented = old.parentNid !== entry.parentNid || old.frameNid !== entry.frameNid;
      if (reparented) {
        // Penpot's mod-obj attr-set protocol isn't a verified way to
        // reparent a shape in this codebase — delete + recreate instead of
        // fabricating an unverified "move" change type. del-obj requires
        // pageId — Penpot's process-change :del-obj no-ops silently without
        // it (confirmed against common/src/app/common/files/changes.cljc).
        changes.push({ op: "del-obj", id: existingId, pageId });
        const id = newId();
        mapping[entry.nid] = id;
        changes.push({
          op: "add-obj", id, kind: entry.kind, pageId,
          parentId: resolveId(mapping, previousMapping, entry.parentNid),
          frameId: resolveId(mapping, previousMapping, entry.frameNid),
          fields: entry.fields,
        });
        continue;
      }
      mapping[entry.nid] = existingId;
      const changedFields = diffFieldObjects(old.fields, entry.fields);
      if (Object.keys(changedFields).length > 0) {
        changes.push({ op: "mod-obj", id: existingId, kind: entry.kind, fields: changedFields });
      }
    } else {
      const id = newId();
      mapping[entry.nid] = id;
      changes.push({
        op: "add-obj", id, kind: entry.kind, pageId,
        parentId: resolveId(mapping, previousMapping, entry.parentNid),
        frameId: resolveId(mapping, previousMapping, entry.frameNid),
        fields: entry.fields,
      });
    }
  }

  for (const [nid, id] of Object.entries(previousMapping)) {
    if (!newByNid.has(nid)) changes.push({ op: "del-obj", id, pageId });
  }

  return { ok: true, changes, mapping, snapshot, diagnostics: { skipped: allowPartial ? unresolved : [], warnings: [] } };
}

/**
 * Compiles a normalized, canonical Scene Model into a Penpot Change IR.
 *   compileScene(scene, { pageId, newId, mode: "create", allowPartial })
 *   compileScene(scene, { pageId, newId, mode: "update", previousScene, previousMapping, allowPartial })
 * Returns { ok, changes, mapping, snapshot, diagnostics } on success, or
 * { ok: false, error, unresolvedNodes } if compilation was refused because
 * some node couldn't be compiled and allowPartial was not set.
 */
export function compileScene(scene, opts) {
  if (!scene || typeof scene !== "object") throw new Error("empty scene");
  const options = opts || {};
  return options.mode === "update" ? compileUpdate(scene, options) : compileCreate(scene, options);
}
