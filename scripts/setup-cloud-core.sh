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
# headers, and re-injects a scoped frame-ancestors so the Vercel-hosted shell
# can embed the canvas without hitting Mixed Content blocks in the browser.
#
# PLAN B — sslip.io + Vercel (no registered domain required yet):
#   - NOFIDA_DOMAIN defaults to 178-105-237-128.sslip.io, which resolves to the
#     server's IP automatically via sslip.io wildcard DNS. That gives Let's
#     Encrypt a real hostname to certify (it cannot issue certs for bare IPs).
#   - The frontend is hosted on Vercel over HTTPS, so the embedded engine must
#     also be HTTPS to avoid Mixed Content blocks. Caddy provides that TLS below.
#
#   Just run it — plan B defaults are baked in:
#        bash scripts/setup-cloud-core.sh
#
#   Or override either value:
#        NOFIDA_DOMAIN=penpot.yourdomain.com \
#        NOFIDA_SHELL_ORIGIN=https://your-app.vercel.app \
#        bash scripts/setup-cloud-core.sh
#
#   Canvas.tsx (PROD_ENGINE_URL) is already wired to https://178-105-237-128.sslip.io.
#
# Run as a user with sudo privileges.
# NOTE: not executed by CI.
# =============================================================================
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

# ── 0. Resolve target domain + embedding origin ──────────────────────────────
# Plan B: sslip.io wildcard DNS gives us a real hostname without registering a
# domain. "178-105-237-128.sslip.io" resolves to 178.105.237.128 automatically,
# so Let's Encrypt can issue a certificate for it.
NOFIDA_DOMAIN="${NOFIDA_DOMAIN:-178-105-237-128.sslip.io}"

# Frontend is on Vercel. Allow the Vercel domain pool (preview + production,
# all *.vercel.app) to embed the engine via CSP frame-ancestors. This is a
# deliberately scoped wildcard for the testing phase — it is NOT "no filtering":
# only Vercel-hosted origins can frame the engine. Tighten it to your exact
# production domain (e.g. https://nofida.vercel.app) once that is stable.
NOFIDA_SHELL_ORIGIN="${NOFIDA_SHELL_ORIGIN:-https://*.vercel.app}"

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

# Generate a docker-compose.override.yaml instead of sed-patching the upstream
# file. Compose v2 normalises `environment` to a map before merging overrides,
# so this applies cleanly whether the base file uses list- or map-style env —
# no brittle string matching against an upstream format that changes over time.
#
# ── THE BLACK-SCREEN FIX ──────────────────────────────────────────────────
# PENPOT_PUBLIC_URI must equal the public HTTPS origin Caddy serves. Left at the
# default http://localhost:9001, the SPA boots (white flash) then tries to reach
# localhost:9001/api and /ws from the browser — which fails, leaving a black
# screen. Pinned to https://<domain>, Penpot derives wss:// for websockets
# automatically (the ws scheme follows the http scheme), so there is NO separate
# "secure websockets" variable to set — Penpot has none; it infers it from here.
echo "🛠️  Writing docker-compose.override.yaml (public URI + auth flags)..."
sudo tee docker-compose.override.yaml > /dev/null <<OVERRIDE
# Nofida reverse-proxy hardening — auto-merged with docker-compose.yaml by
# 'docker compose'. Overriding per service + key is format-agnostic.
services:
  penpot-backend:
    environment:
      PENPOT_PUBLIC_URI: https://${NOFIDA_DOMAIN}
      # Verified flags only: self-registration + password login without SMTP.
      # (iframe embedding is handled at the Caddy header layer, not via flags.)
      PENPOT_FLAGS: enable-registration enable-login-with-password disable-email-verification

  penpot-frontend:
    environment:
      # Keep the UI's flags in sync with the backend so the login/register
      # surface matches what the backend actually permits.
      PENPOT_PUBLIC_URI: https://${NOFIDA_DOMAIN}
      PENPOT_FLAGS: enable-registration enable-login-with-password disable-email-verification
OVERRIDE
echo "   ↳ PENPOT_PUBLIC_URI pinned to https://${NOFIDA_DOMAIN}"

echo "⚡ Starting Penpot containers (base + override)..."
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
    # is allowed to embed this server. Defaults to the Vercel domain pool;
    # override NOFIDA_SHELL_ORIGIN to pin your exact production domain.
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
echo "  VERIFY:"
echo "    1. Open  https://${NOFIDA_DOMAIN}  in a browser — it should load"
echo "       Penpot over a valid (green-lock) TLS certificate."
echo "    2. Canvas.tsx PROD_ENGINE_URL is already set to https://${NOFIDA_DOMAIN}."
echo "    3. Deploy the frontend on Vercel; it will be served from *.vercel.app,"
echo "       which the frame-ancestors policy above already permits."
echo ""
echo "  If the cert does not issue, confirm ports 80/443 are reachable and that"
echo "  ${NOFIDA_DOMAIN} resolves:  dig +short ${NOFIDA_DOMAIN}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
