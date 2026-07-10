#!/bin/sh
# =============================================================================
# Nofida — mirror the canonical Scene Model modules into the frontend build
# =============================================================================
# services/nofida-hub-adapter/ai/scene/*.mjs is the canonical source (real ES
# modules, pure — no DOM/network/environment access, per PATCH 025A). It is
# `import`ed directly there. The frontend (branding/ai-core/designer/scene/)
# needs the identical files so the browser can load them via dynamic
# import() — but nofida-hub-adapter and penpot-frontend build from SEPARATE
# Docker contexts (docker-compose.yml: ./services/nofida-hub-adapter vs
# ./branding), so neither image can COPY from the other's tree at build time.
#
# This script keeps ONE canonical copy and mechanically mirrors it — do not
# hand-edit branding/ai-core/designer/scene/*.js.
#
# The mirror is written with a `.js` extension, not `.mjs` — Penpot's base
# nginx config (app/nginx.conf, inside the upstream image, not something we
# control) only recognizes a fixed set of static-asset extensions and 301s
# anything else to /404 (the same class of issue branding/nginx/nofida.conf's
# own comments already document for .json/.html). Browsers don't care about
# extension for ES modules — only `<script type="module">`/dynamic import()
# matters — so `.js` is the safe choice for the browser-served copy. The
# canonical Node-side source stays `.mjs` (services/nofida-hub-adapter has no
# package.json to declare "type":"module", so Node needs the explicit
# extension there).
#
# Run locally (and commit the result) whenever the canonical files change,
# before building/deploying the frontend image.
# =============================================================================
set -eu

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${REPO_ROOT}/services/nofida-hub-adapter/ai/scene"
DEST="${REPO_ROOT}/branding/ai-core/designer/scene"

mkdir -p "${DEST}"
rm -f "${DEST}"/*.js "${DEST}"/*.mjs

for file in "${SRC}"/*.mjs; do
  name="$(basename "${file}" .mjs).js"
  {
    echo "// GENERATED — mirrored from services/nofida-hub-adapter/ai/scene/$(basename "${file}")"
    echo "// by scripts/sync-shared-scene.sh. Do not hand-edit; edit the source and re-run."
    echo "//"
    # Rewrite internal relative imports (e.g. `from "./scene-schema.mjs"`)
    # to the mirror's .js extension too — otherwise the browser fetches a
    # sibling module that only exists as .mjs in this directory and 404s.
    sed -e 's/\.mjs"/.js"/g' "${file}"
  } > "${DEST}/${name}"
  echo "synced ${name}"
done
