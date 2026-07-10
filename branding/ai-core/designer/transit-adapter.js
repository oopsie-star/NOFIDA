/* ==========================================================================
 * Nofida Designer — transit-json codec (PATCH 025A)
 * --------------------------------------------------------------------------
 * Browser-only: encodes the plain Penpot Change IR produced by the pure
 * scene-compiler.mjs into Penpot's transit-json wire format, and decodes the
 * small bits of a response we actually need (get-file's revn/vern).
 *
 * Lifted verbatim from ai-bridge.js's original inline `Transit` (PATCH 016A)
 * — same minimal, non-general-purpose codec (maps/keywords/uuids/tagged
 * point|matrix|rect records, no `^N` cache back-reference resolution, so
 * decode() stays unsafe for large nested payloads — see shallowTopLevel()).
 * Extended here to also encode mod-obj/del-obj changes, not just add-obj.
 * ========================================================================== */
(function () {
  "use strict";
  if (window.NofidaDesigner && window.NofidaDesigner.Transit) return;
  window.NofidaDesigner = window.NofidaDesigner || {};

  function kw(name) { return { __t: "kw", v: name }; }
  function uuid(v) { return { __t: "uuid", v: String(v) }; }
  function tag(name, value) { return { __t: "tag", tag: name, v: value }; }

  function encodeValue(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === "boolean" || typeof v === "number") return v;
    if (typeof v === "string") return v;
    if (Array.isArray(v)) return v.map(encodeValue);
    if (v.__t === "kw") return "~:" + v.v;
    if (v.__t === "uuid") return "~u" + v.v;
    if (v.__t === "tag") return ["~#" + v.tag, encodeValue(v.v)];
    if (typeof v === "object") {
      var out = ["^ "];
      var keys = Object.keys(v);
      for (var i = 0; i < keys.length; i++) {
        out.push("~:" + keys[i]);
        out.push(encodeValue(v[keys[i]]));
      }
      return out;
    }
    return v;
  }

  // Full recursive decode — used only for small payloads (error bodies). Does
  // not resolve transit's `^N` cache back-references, so it is not safe on
  // large nested responses (e.g. a whole file's shape tree).
  function decodeValue(v) {
    if (Array.isArray(v)) {
      if (v[0] === "^ ") {
        var obj = {};
        for (var i = 1; i < v.length; i += 2) {
          var k = decodeValue(v[i]);
          obj[typeof k === "string" ? k.replace(/^:/, "") : k] = decodeValue(v[i + 1]);
        }
        return obj;
      }
      if (v[0] === "~#set") return decodeValue(v[1]);
      return v.map(decodeValue);
    }
    if (typeof v === "string") {
      if (v.indexOf("~:") === 0) return v.slice(2);
      if (v.indexOf("~u") === 0) return v.slice(2);
      return v;
    }
    return v;
  }

  // Shallow top-level scalar extraction for get-file responses — we only
  // ever need revn/vern, and a full recursive decode() would needlessly walk
  // the entire (potentially large) shape tree.
  function shallowTopLevel(transitArr, wantedKeys) {
    var out = {};
    if (!Array.isArray(transitArr) || transitArr[0] !== "^ ") return out;
    for (var i = 1; i < transitArr.length; i += 2) {
      var rawKey = transitArr[i];
      if (typeof rawKey === "string" && rawKey.indexOf("~:") === 0) {
        var key = rawKey.slice(2);
        if (wantedKeys.indexOf(key) !== -1) out[key] = transitArr[i + 1];
      }
    }
    return out;
  }

  function point(x, y) { return tag("point", { x: x, y: y }); }
  function matrix() { return tag("matrix", { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }); }
  function rectGeom(x, y, w, h) {
    return tag("rect", { x: x, y: y, width: w, height: h, x1: x, y1: y, x2: x + w, y2: y + h });
  }

  // Converts one plain geometry field value (as produced by the pure
  // penpot-shape-adapter.mjs, which encodes points/matrix/selrect as plain
  // { __tag: "point"|"matrix"|"rect", ... } objects, since that module has no
  // transit dependency) into a real transit tag() the encoder understands.
  function reviveGeometryTags(value) {
    if (Array.isArray(value)) return value.map(reviveGeometryTags);
    if (value && typeof value === "object") {
      if (value.__tag === "point") return point(value.x, value.y);
      if (value.__tag === "matrix") return matrix();
      if (value.__tag === "rect") return rectGeom(value.x, value.y, value.width, value.height);
      var out = {};
      var keys = Object.keys(value);
      for (var i = 0; i < keys.length; i++) out[keys[i]] = reviveGeometryTags(value[keys[i]]);
      return out;
    }
    return value;
  }

  // Converts one Change IR entry (from scene-compiler.mjs's compileScene())
  // into a Penpot `changes[]` entry ready for encode().
  function changeToWireEntry(change) {
    if (change.op === "add-obj") {
      var obj = Object.assign({ id: uuid(change.id), type: kw(change.kind) }, reviveGeometryTags(change.fields));
      if (change.kind === "frame" || change.kind === "group") obj.shapes = [];
      obj["parent-id"] = uuid(change.parentId);
      obj["frame-id"] = uuid(change.frameId);
      return {
        type: kw("add-obj"),
        id: uuid(change.id),
        obj: obj,
        "page-id": uuid(change.pageId),
        "frame-id": uuid(change.frameId),
        "parent-id": uuid(change.parentId),
      };
    }
    if (change.op === "mod-obj") {
      var operations = [];
      var fields = reviveGeometryTags(change.fields);
      var fieldKeys = Object.keys(fields);
      for (var i = 0; i < fieldKeys.length; i++) {
        operations.push({ type: kw("set"), attr: kw(fieldKeys[i]), val: fields[fieldKeys[i]] });
      }
      return { type: kw("mod-obj"), id: uuid(change.id), operations: operations };
    }
    if (change.op === "del-obj") {
      return { type: kw("del-obj"), id: uuid(change.id) };
    }
    throw new Error("unknown change op: " + change.op);
  }

  window.NofidaDesigner.Transit = {
    kw: kw, uuid: uuid, tag: tag,
    encode: encodeValue, decode: decodeValue,
    shallowTopLevel: shallowTopLevel,
    point: point, matrix: matrix, rectGeom: rectGeom,
    changeToWireEntry: changeToWireEntry,
  };
})();
