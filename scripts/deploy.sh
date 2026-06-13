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
git pull origin main

echo "── docker compose build penpot-frontend ──────────────"
docker compose build penpot-frontend

echo "── docker compose up (frontend only) ─────────────────"
docker compose up -d --no-deps penpot-frontend

echo ""
echo "✓  Deploy complete — https://engine.sys.bachopus.com"
REMOTE
