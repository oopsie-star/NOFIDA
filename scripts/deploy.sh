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
PROJECT_DIR="/root/NOFIDA"
SSH_KEY="${NOFIDA_SSH_KEY:-$HOME/.ssh/id_rsa}"
COMPOSE_PROJECT="nofida-core"

echo "▶  Connecting to $HOST …"

ssh \
  -i "$SSH_KEY" \
  -o StrictHostKeyChecking=accept-new \
  -o ConnectTimeout=15 \
  "$HOST" \
  bash -s << REMOTE
set -euo pipefail
cd /root/NOFIDA

echo "── git pull ──────────────────────────────────────────"
git pull --ff-only origin main

echo "── docker compose cleanup (stale default project) ─────"
docker compose -p nofida down --remove-orphans 2>/dev/null || true

echo "── docker compose up --build (${COMPOSE_PROJECT}) ─────"
docker compose -p "${COMPOSE_PROJECT}" up -d --build --remove-orphans \
  penpot-frontend \
  penpot-backend \
  penpot-exporter \
  penpot-mcp

echo ""
echo "✓  Deploy complete — https://engine.sys.bachopus.com"
REMOTE
