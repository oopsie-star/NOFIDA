#!/bin/sh
# =============================================================================
# Nofida — verify the frontend Scene Model mirror is byte-equivalent to the
# canonical source (PATCH 025A addendum)
# =============================================================================
# services/nofida-hub-adapter/ai/scene/*.mjs is canonical; branding/ai-core/
# designer/scene/*.js is a MECHANICAL mirror produced by
# scripts/sync-shared-scene.sh (.js, not .mjs — Penpot's base nginx config
# doesn't recognize .mjs as static and 301s it to /404; see that script's
# header for the full explanation). This script is the enforcement side:
# it fails loudly (non-zero exit) if the mirror has drifted from the source,
# e.g. because someone hand-edited the mirror or forgot to re-run the sync
# script after changing the source. Run before every frontend build/deploy —
# `scripts/deploy.sh` calls this first and aborts on failure.
# =============================================================================
set -eu

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${REPO_ROOT}/services/nofida-hub-adapter/ai/scene"
DEST="${REPO_ROOT}/branding/ai-core/designer/scene"

status=0

for file in "${SRC}"/*.mjs; do
  srcname="$(basename "${file}")"
  name="$(basename "${file}" .mjs).js"
  mirror="${DEST}/${name}"
  if [ ! -f "${mirror}" ]; then
    echo "MISSING: ${mirror} (run scripts/sync-shared-scene.sh)" >&2
    status=1
    continue
  fi
  # The mirror carries a 3-line generated-file header (see
  # sync-shared-scene.sh) before the source content, with internal relative
  # imports rewritten .mjs -> .js (the only transformation the sync script
  # applies) — so "equivalent" means applying that same deterministic
  # rewrite to the source reproduces the mirror exactly, not raw byte
  # identity.
  if ! diff -q <(tail -n +4 "${mirror}") <(sed -e 's/\.mjs"/.js"/g' "${file}") > /dev/null 2>&1; then
    echo "DRIFTED: ${mirror} does not match ${file} (run scripts/sync-shared-scene.sh)" >&2
    status=1
  fi
done

# Catch mirror files with no corresponding source (stale leftovers).
for file in "${DEST}"/*.js; do
  [ -f "${file}" ] || continue
  name="$(basename "${file}" .js).mjs"
  if [ ! -f "${SRC}/${name}" ]; then
    echo "ORPHANED: ${file} has no corresponding source file in ${SRC}" >&2
    status=1
  fi
done

if [ "${status}" -eq 0 ]; then
  echo "OK — frontend Scene Model mirror matches canonical source"
fi

exit "${status}"
