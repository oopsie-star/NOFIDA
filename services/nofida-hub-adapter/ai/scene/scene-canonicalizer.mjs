// Scene Model canonicalizer (PATCH 025A addendum).
//
// Assigns the stable NOFIDA `nid` every node needs — this is deliberately
// NOT the validator's job: identity assignment needs to see both the
// already-validated tree AND (optionally) the previous turn's canonical
// scene, so it can tell "this is the same node, edited" from "this is a new
// node that happens to look similar." The validator has neither concern; it
// only checks shape.
//
// Rules, in priority order, per node:
//   1. If a node at the SAME tree path in `previousScene` has the SAME type,
//      reuse ITS nid — this is what makes update-mode diffing in
//      scene-compiler.mjs meaningful across independent AI turns, not just
//      within one compile call.
//   2. Else if the node carries a `semanticId` (PATCH 026A.0 — a designer-
//      assigned stable identity like "home-day/prediction-card/title"),
//      derive the nid from IT rather than from tree path — semanticId is
//      meant to survive a full re-plan where the node's position in the tree
//      may shift, so retries and light/dark pairing (026A.5) can rely on the
//      same semanticId always resolving to the same nid even with no
//      previousScene path match at all.
//   3. Else if the node carries a `presetId` (the model/caller echoed one
//      back explicitly), use it.
//   4. Else derive one deterministically from the node's tree path + type,
//      so canonicalizing the SAME input tree twice always produces the SAME
//      ids (required for the normalizer's idempotent-second-pass guarantee
//      and for stable diffing).
//
// Pure module: no DOM/network/environment access.

function djb2(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

function indexPreviousScene(previousScene) {
  const byPath = new Map();
  if (!previousScene) return byPath;
  function walk(node, path) {
    if (!node) return;
    byPath.set(path, { nid: node.nid, type: node.type });
    for (let i = 0; i < (node.children || []).length; i++) {
      walk(node.children[i], `${path}.${i}`);
    }
  }
  walk(previousScene, "root");
  return byPath;
}

function canonicalizeNode(node, path, previousByPath, usedIds) {
  let nid;
  const prev = previousByPath.get(path);
  if (prev && prev.type === node.type) {
    nid = prev.nid;
  } else if (node.semanticId) {
    nid = `n_${djb2(`semantic:${node.semanticId}`)}`;
  } else if (node.presetId) {
    nid = node.presetId;
  } else {
    nid = `n_${djb2(`${path}:${node.type}`)}`;
  }

  // Deterministic derivation can theoretically collide across sibling nodes
  // of the same type at different depths hashing to the same short code, or
  // a presetId can collide with another node's — both vanishingly unlikely
  // but checked, since a duplicate id would corrupt update-mode diffing.
  if (usedIds.has(nid)) {
    nid = `${nid}_${djb2(path)}`;
  }
  usedIds.add(nid);

  const { presetId, children, ...rest } = node;
  const out = { ...rest, nid };
  if (children) {
    out.children = children.map((child, i) => canonicalizeNode(child, `${path}.${i}`, previousByPath, usedIds));
  }
  return out;
}

/**
 * canonicalizeScene(validatedScene, { previousScene }) -> canonicalScene
 * `previousScene` is the previous turn's ALREADY-canonical scene (if any) —
 * pass the same object this function returned last time, not a raw/validated
 * one.
 */
export function canonicalizeScene(validatedScene, opts) {
  const previousByPath = indexPreviousScene(opts && opts.previousScene);
  const usedIds = new Set();
  return canonicalizeNode(validatedScene, "root", previousByPath, usedIds);
}
