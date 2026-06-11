#!/bin/bash
# =============================================================================
# Nofida Design OS Cloud Core — Production Setup Engine
# =============================================================================
# Bootstraps a clean Ubuntu 22.04/24.04 server with:
#   - Docker CE + Compose plugin
#   - Self-hosted Penpot engine (graphic canvas core)
#   - Caddy reverse-proxy with automatic Let's Encrypt TLS
#
# The Caddy layer terminates HTTPS, strips Penpot's X-Frame-Options / CSP
# headers, and re-injects a scoped frame-ancestors so the GitHub Pages shell
# can embed the canvas without hitting Mixed Content blocks in the browser.
#
# ⚠️  REQUIRED BEFORE RUNNING:
#   1. You need a real DNS hostname (A record) pointing at this server's IP.
#      Let's Encrypt does NOT issue certificates for bare IP addresses.
#   2. Export the two variables below (or pass them inline):
#
#        export NOFIDA_DOMAIN="penpot.yourdomain.com"
#        export NOFIDA_SHELL_ORIGIN="https://oopsie-star.github.io"
#        bash scripts/setup-cloud-core.sh
#
#   3. After the script succeeds, update PROD_ENGINE_URL in
#      src/components/editor/Canvas.tsx from
#        http://178.105.237.128:9001
#      to
#        https://${NOFIDA_DOMAIN}
#      then rebuild and redeploy the GitHub Pages frontend.
#
# Run as a user with sudo privileges.
# NOTE: not executed by CI.
# =============================================================================
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

# ── 0. Validate required inputs ──────────────────────────────────────────────
if [[ -z "${NOFIDA_DOMAIN:-}" ]]; then
  echo ""
  echo "❌  NOFIDA_DOMAIN is not set."
  echo ""
  echo "    Let's Encrypt requires a real DNS hostname — it cannot issue"
  echo "    certificates for bare IP addresses like 178.105.237.128."
  echo ""
  echo "    1. Register a domain (or create a subdomain on one you own)."
  echo "    2. Add an A record:  penpot.yourdomain.com → 178.105.237.128"
  echo "    3. Wait for DNS to propagate (check with: dig +short penpot.yourdomain.com)"
  echo "    4. Re-run:  NOFIDA_DOMAIN=penpot.yourdomain.com bash scripts/setup-cloud-core.sh"
  echo ""
  exit 1
fi

# Default shell origin = the GitHub Pages base for this project.
# Override with: export NOFIDA_SHELL_ORIGIN=https://yourdomain.com
NOFIDA_SHELL_ORIGIN="${NOFIDA_SHELL_ORIGIN:-https://oopsie-star.github.io}"

echo ""
echo "🚀 [Nofida DevOps] Starting remote machine core orchestration..."
echo "   Domain      : ${NOFIDA_DOMAIN}"
echo "   Shell origin: ${NOFIDA_SHELL_ORIGIN}"
echo ""

# ── 1. System baseline ───────────────────────────────────────────────────────
echo "📦 Updating apt-get distribution channels..."
sudo apt-get update -y && sudo apt-get upgrade -y

# ── 2. Docker CE ─────────────────────────────────────────────────────────────
echo "🐳 Installing Docker Engine runtimes..."
sudo apt-get install -y ca-certificates curl gnupg lsb-release

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
# apt reads the keyring unprivileged — must be world-readable.
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# ── 3. Caddy (TLS reverse-proxy) ─────────────────────────────────────────────
# Official Caddy apt repo — do not use snap, which runs in a confined namespace
# that breaks port-80 ACME challenges.
echo "🔒 Installing Caddy reverse-proxy..."
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https

curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list > /dev/null

sudo apt-get update -y
sudo apt-get install -y caddy

# ── 4. Firewall — open HTTP, HTTPS, and SSH (ACME challenges need port 80) ───
if command -v ufw &>/dev/null && sudo ufw status | grep -q "Status: active"; then
  echo "🔥 Opening firewall ports 22, 80, 443..."
  sudo ufw allow 22/tcp
  sudo ufw allow 80/tcp
  sudo ufw allow 443/tcp
  # Port 9001 stays closed to the public — Caddy proxies it internally.
  echo "   ↳ Port 9001 remains internal-only (proxied by Caddy)."
fi

# ── 5. Penpot engine ─────────────────────────────────────────────────────────
echo "📂 Provisioning workspace volumes..."
sudo mkdir -p /opt/nofida-core
cd /opt/nofida-core

echo "📥 Pulling stable Penpot infrastructure definitions..."
sudo curl -fsSL -o docker-compose.yaml \
  https://raw.githubusercontent.com/penpot/penpot/main/docker/images/docker-compose.yaml

# Patch PENPOT_FLAGS to relax CORS — append to whatever value is already there.
echo "🛠️  Patching PENPOT_FLAGS for cross-domain embedding..."
if grep -q 'PENPOT_FLAGS=' docker-compose.yaml; then
  sudo sed -i -E \
    's/(PENPOT_FLAGS=.*)/\1 disable-web-errors disable-cors-restrictions/' \
    docker-compose.yaml
  echo "   ↳ PENPOT_FLAGS extended."
else
  echo "⚠️  PENPOT_FLAGS line not found — verify flags against your Penpot version."
fi

echo "⚡ Starting Penpot containers..."
sudo docker compose up -d

# ── 6. Caddyfile — TLS termination + iframe-safe proxy ───────────────────────
# Caddy automatically obtains and renews a Let's Encrypt certificate for
# NOFIDA_DOMAIN. It strips Penpot's X-Frame-Options / Content-Security-Policy
# headers (which would block cross-origin framing) and re-injects a scoped
# frame-ancestors header that restricts embedding to the Nofida shell origin only.
echo "🔐 Writing Caddyfile..."
sudo tee /etc/caddy/Caddyfile > /dev/null <<CADDYFILE
# Nofida — Penpot engine reverse proxy with automatic TLS
${NOFIDA_DOMAIN} {
    reverse_proxy localhost:9001

    # Strip Penpot's native headers that block cross-origin iframe embedding.
    header -X-Frame-Options
    header -Content-Security-Policy

    # Re-inject a scoped frame-ancestors policy: only the Nofida shell origin
    # is allowed to embed this server. Replace with your real shell URL if it
    # differs from the default GitHub Pages origin.
    header Content-Security-Policy "frame-ancestors ${NOFIDA_SHELL_ORIGIN};"

    # Standard security headers (keep these regardless of embedding).
    header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
    header X-Content-Type-Options "nosniff"
    header Referrer-Policy "strict-origin-when-cross-origin"
}
CADDYFILE

# Validate the config, then reload (Caddy auto-triggers ACME on first load).
echo "🔄 Reloading Caddy..."
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl enable caddy
sudo systemctl restart caddy

# ── 7. Done ──────────────────────────────────────────────────────────────────
echo ""
echo "✅ [Nofida DevOps] Deployment complete."
echo ""
echo "   Penpot engine : running (Docker, internal port 9001)"
echo "   TLS proxy     : Caddy serving  https://${NOFIDA_DOMAIN}  (cert auto-managed)"
echo "   Frame policy  : frame-ancestors scoped to ${NOFIDA_SHELL_ORIGIN}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  NEXT STEP — update Canvas.tsx on your dev machine:"
echo ""
echo "  In src/components/editor/Canvas.tsx, change:"
echo "    const PROD_ENGINE_URL = 'http://178.105.237.128:9001';"
echo "  to:"
echo "    const PROD_ENGINE_URL = 'https://${NOFIDA_DOMAIN}';"
echo ""
echo "  Then rebuild and redeploy the GitHub Pages frontend:"
echo "    npm run build && git add . && git commit -m 'infra: switch to HTTPS engine endpoint' && git push"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
