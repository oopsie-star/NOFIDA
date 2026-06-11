#!/bin/bash
# =============================================================================
# Nofida Design OS Cloud Core — Production Setup Engine
# -----------------------------------------------------------------------------
# Bootstraps a clean Ubuntu host (22.04 / 24.04) with Docker + a self-hosted
# Penpot engine, configured so the first-party Nofida shell can embed it in an
# iframe.
#
# SCOPE / SECURITY: This provisions YOUR OWN server. The relaxed frame/CORS
# settings below only affect your self-hosted instance so your own app can
# embed it — they do not touch any third party. Keep the instance behind auth
# and scope the embedding origin (see the reverse-proxy note at the bottom)
# rather than leaving it wide open in production.
#
# Run as a user with sudo privileges:  bash scripts/setup-cloud-core.sh
# NOTE: not executed by CI — review the flags against your Penpot version first.
# =============================================================================
set -euo pipefail

echo "🚀 [Nofida DevOps] Starting remote machine core orchestration..."

# Keep apt fully non-interactive for unattended remote runs.
export DEBIAN_FRONTEND=noninteractive

# 1. Update system baseline packages
echo "📦 Updating apt-get distribution channels..."
sudo apt-get update -y && sudo apt-get upgrade -y

# 2. Setup formal Docker Community Edition engine repository hooks
echo "🐳 Installing Docker Engine runtimes..."
sudo apt-get install -y ca-certificates curl gnupg lsb-release

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
# apt runs unprivileged when reading the keyring — make it world-readable or
# `apt-get update` fails with a permission error on the signed-by keyring.
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# NOTE: directory is sources.list.d (not .p) — apt only scans *.list under .d/
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# 3. Provision isolated orchestration space for Penpot Engine
echo "📂 Provisioning workspace volumes..."
sudo mkdir -p /opt/nofida-core
cd /opt/nofida-core

# 4. Fetch the official Penpot container network compose structure blueprints
echo "📥 Pulling stable infrastructure definitions..."
sudo curl -fsSL -o docker-compose.yaml \
  https://raw.githubusercontent.com/penpot/penpot/main/docker/images/docker-compose.yaml

# 5. Patch environment flags to unblock first-party cross-domain embedding.
#    Penpot ships PENPOT_FLAGS with defaults; we append our embedding flags to
#    whatever value is already present rather than assuming an empty string.
#    Upstream formatting changes over time — verify against the pulled file and
#    confirm the flag names are valid for your Penpot release.
echo "🛠️ Patching operational parameters & CORS policies..."
if grep -q 'PENPOT_FLAGS=' docker-compose.yaml; then
  sudo sed -i -E 's/(PENPOT_FLAGS=.*)/\1 disable-web-errors disable-cors-restrictions/' docker-compose.yaml
  echo "   ↳ PENPOT_FLAGS extended with embedding overrides."
else
  echo "⚠️  PENPOT_FLAGS line not found — set the embedding flags manually before launch."
fi

# 6. Bootstrap container grid layout topologies
echo "⚡ Executing hardware daemon network lifecycles..."
sudo docker compose up -d

echo "✅ [Nofida DevOps] Success! Core engine running out-of-bounds frame pipelines cleanly."
echo "🔗 Access your core cluster via your target machine public IPv4 interface."

# -----------------------------------------------------------------------------
# OPTIONAL — Reverse-proxy header overrides for iframe embedding
# -----------------------------------------------------------------------------
# Penpot's frontend still sends X-Frame-Options / CSP that block cross-origin
# framing. If PENPOT_FLAGS alone does not unblock embedding, terminate TLS at an
# nginx/Caddy proxy in front of penpot-frontend and override the headers,
# scoping frame-ancestors to the Nofida origin (never a wildcard in production):
#
#   # nginx — inside the server { } block that proxies to penpot-frontend:
#   proxy_hide_header X-Frame-Options;
#   proxy_hide_header Content-Security-Policy;
#   add_header Content-Security-Policy "frame-ancestors https://<your-nofida-origin>;" always;
# -----------------------------------------------------------------------------
