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
# hand-edit branding/ai-core/designer/scene/*.mjs.
#
# Run locally (and commit the result) whenever the canonical files change,
# before building/deploying the frontend image. `scripts/deploy.sh` does a
# `git pull` on the server, so a committed mirror is all it needs.
# =============================================================================
set -eu

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${REPO_ROOT}/services/nofida-hub-adapter/ai/scene"
DEST="${REPO_ROOT}/branding/ai-core/designer/scene"

mkdir -p "${DEST}"

for file in "${SRC}"/*.mjs; do
  name="$(basename "${file}")"
  {
    echo "// GENERATED — mirrored from services/nofida-hub-adapter/ai/scene/${name}"
    echo "// by scripts/sync-shared-scene.sh. Do not hand-edit; edit the source and re-run."
    echo "//"
    cat "${file}"
  } > "${DEST}/${name}"
  echo "synced ${name}"
done
