#!/usr/bin/env bash
# =============================================================================
# Nofida — one-command frontend deploy
# =============================================================================
# Usage:
#   ./scripts/deploy.sh                  # uses ~/.ssh/id_rsa by default
#   NOFIDA_SSH_KEY=~/.ssh/other ./scripts/deploy.sh
#
# On Windows run via Git Bash, WSL, or:
#   npm run deploy          (requires Git Bash / WSL on PATH)
#   ssh root@engine.sys.bachopus.com ... (PowerShell native ssh)
# =============================================================================
set -euo pipefail

HOST="root@engine.sys.bachopus.com"
PROJECT_DIR="/opt/nofida-core"
SSH_KEY="${NOFIDA_SSH_KEY:-$HOME/.ssh/id_rsa}"
COMPOSE_PROJECT="nofida-core"
PUBLIC_URI="https://engine.sys.bachopus.com"
LIBRARY_STORE_ROOT="/opt/nofida-core/library-store"

echo "▶  Connecting to $HOST …"

ssh \
  -i "$SSH_KEY" \
  -o StrictHostKeyChecking=accept-new \
  -o ConnectTimeout=15 \
  "$HOST" \
  bash -s << REMOTE
set -euo pipefail
cd "${PROJECT_DIR}"

echo "── git pull ──────────────────────────────────────────"
git pull --ff-only origin main

echo "── ensure .env public uri ───────────────────────────"
touch .env
if grep -q '^PENPOT_PUBLIC_URI=' .env; then
  sed -i "s#^PENPOT_PUBLIC_URI=.*#PENPOT_PUBLIC_URI=${PUBLIC_URI}#" .env
else
  echo "PENPOT_PUBLIC_URI=${PUBLIC_URI}" >> .env
fi
if grep -q '^NOFIDA_LIBRARY_STORE_ROOT=' .env; then
  sed -i "s#^NOFIDA_LIBRARY_STORE_ROOT=.*#NOFIDA_LIBRARY_STORE_ROOT=${LIBRARY_STORE_ROOT}#" .env
else
  echo "NOFIDA_LIBRARY_STORE_ROOT=${LIBRARY_STORE_ROOT}" >> .env
fi

echo "── bootstrap library store ──────────────────────────"
mkdir -p "${LIBRARY_STORE_ROOT}"/files "${LIBRARY_STORE_ROOT}"/quarantine "${LIBRARY_STORE_ROOT}"/logs
bash ./scripts/sync-penpot-hub-libraries.sh --skip-downloads

echo "── install library sync timer ───────────────────────"
bash ./scripts/install-library-sync-systemd.sh

echo "── docker compose cleanup (stale default project) ─────"
docker compose -p nofida down --remove-orphans 2>/dev/null || true

echo "── docker compose up --build (${COMPOSE_PROJECT}) ─────"
docker compose -p "${COMPOSE_PROJECT}" up -d --build --remove-orphans \
  penpot-frontend \
  penpot-backend \
  penpot-exporter \
  penpot-mcp \
  nofida-hub-adapter

echo ""
echo "✓  Deploy complete — https://engine.sys.bachopus.com"
REMOTE
