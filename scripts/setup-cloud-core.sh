#!/bin/bash
# =============================================================================
# Nofida Design OS — Cloud Core setup (single-origin, no iframe)
# =============================================================================
# Bootstraps a clean Ubuntu 22.04/24.04 server to run Nofida — a branded,
# self-hosted Penpot served DIRECTLY on one domain. No iframe, no Vercel, no
# cross-origin cookie hacks: the branded Penpot frontend IS the app.
#
#   - Docker CE + Compose plugin
#   - The Nofida stack from THIS repo (docker-compose.yml builds the branded
#     frontend in ./branding — Penpot + Nofida CSS/logo + AI Core injection)
#   - Caddy reverse-proxy with automatic Let's Encrypt TLS
#
# WHAT CHANGED vs the old iframe setup:
#   The frontend now lives on the SAME origin as /api and /ws, so session
#   cookies are first-party. Caddy no longer strips X-Frame-Options/CSP or
#   injects frame-ancestors — that machinery existed only to embed Penpot in
#   the Vercel shell, which is now retired.
#
# DOMAIN:
#   - App (this box): https://engine.sys.bachopus.com   ← NOFIDA_DOMAIN
#
#   PREREQUISITE: an A record  engine.sys.bachopus.com → <this server IP>  must
#   already resolve (Caddy needs it for the Let's Encrypt cert).
#   Verify:  dig +short engine.sys.bachopus.com
#
# RUN IT (from the repo checkout on the server):
#        bash scripts/setup-cloud-core.sh
#   Override domain / redirect host if needed:
#        NOFIDA_DOMAIN=my.domain.com \
#        NOFIDA_REDIRECT_FROM=old.domain.com \
#        bash scripts/setup-cloud-core.sh
#
# Run as a user with sudo privileges.
# =============================================================================
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "${SCRIPT_DIR}")"

# ── 0. Configuration ─────────────────────────────────────────────────────────
# Public origin Nofida is served on. Frontend, /api and /ws all share it.
NOFIDA_DOMAIN="${NOFIDA_DOMAIN:-engine.sys.bachopus.com}"

# Optional: secondary host to 301-redirect to the main domain. Leave empty
# to skip. (DNS for it must point at this box for the redirect to be served.)
NOFIDA_REDIRECT_FROM="${NOFIDA_REDIRECT_FROM:-}"

PENPOT_PUBLIC_URI="https://${NOFIDA_DOMAIN}"

echo ""
echo "🚀 [Nofida DevOps] Cloud Core setup"
echo "   Repo root     : ${REPO_ROOT}"
echo "   App domain    : ${NOFIDA_DOMAIN}"
echo "   Public URI    : ${PENPOT_PUBLIC_URI}"
echo "   Redirect from : ${NOFIDA_REDIRECT_FROM:-<none>}"
echo ""

# ── 1. System baseline ───────────────────────────────────────────────────────
echo "📦 Updating apt channels..."
sudo apt-get update -y && sudo apt-get upgrade -y

# ── 2. Docker CE ─────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo "🐳 Installing Docker Engine..."
  sudo apt-get install -y ca-certificates curl gnupg lsb-release
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
  sudo apt-get update -y
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
else
  echo "🐳 Docker already installed — skipping."
fi

# ── 3. Caddy (TLS reverse-proxy) ─────────────────────────────────────────────
if ! command -v caddy &>/dev/null; then
  echo "🔒 Installing Caddy..."
  sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | sudo tee /etc/apt/sources.list.d/caddy-stable.list > /dev/null
  sudo apt-get update -y
  sudo apt-get install -y caddy
else
  echo "🔒 Caddy already installed — skipping."
fi

# ── 4. Firewall — only 22/80/443 public. 9001 stays loopback-only (compose
#       binds 127.0.0.1), so it is never exposed even though Docker bypasses ufw.
if command -v ufw &>/dev/null && sudo ufw status | grep -q "Status: active"; then
  echo "🔥 Opening firewall ports 22, 80, 443..."
  sudo ufw allow 22/tcp
  sudo ufw allow 80/tcp
  sudo ufw allow 443/tcp
fi

# ── 5. Secrets — generate a persistent PENPOT_SECRET_KEY once into .env ──────
ENV_FILE="${REPO_ROOT}/.env"
if ! grep -qs '^PENPOT_SECRET_KEY=' "${ENV_FILE}" 2>/dev/null; then
  echo "🔑 Generating PENPOT_SECRET_KEY → ${ENV_FILE}"
  SECRET="$(openssl rand -hex 32)"
  {
    echo "PENPOT_SECRET_KEY=${SECRET}"
    echo "PENPOT_PUBLIC_URI=${PENPOT_PUBLIC_URI}"
  } >> "${ENV_FILE}"
else
  echo "🔑 PENPOT_SECRET_KEY already present in ${ENV_FILE} — keeping it."
  # Keep the public URI in sync with this run.
  if grep -qs '^PENPOT_PUBLIC_URI=' "${ENV_FILE}"; then
    sudo sed -i "s#^PENPOT_PUBLIC_URI=.*#PENPOT_PUBLIC_URI=${PENPOT_PUBLIC_URI}#" "${ENV_FILE}"
  else
    echo "PENPOT_PUBLIC_URI=${PENPOT_PUBLIC_URI}" >> "${ENV_FILE}"
  fi
fi

# ── 6. Build + start the Nofida stack (branded frontend from ./branding) ─────
echo "⚡ Building and starting the Nofida stack..."
cd "${REPO_ROOT}"
sudo docker compose up -d --build

# ── 7. Caddyfile — TLS termination + clean reverse proxy (NO iframe headers) ─
echo "🔐 Writing Caddyfile..."
sudo tee /etc/caddy/Caddyfile > /dev/null <<CADDYFILE
# Nofida — single-origin branded Penpot with automatic TLS.
${NOFIDA_DOMAIN} {
    reverse_proxy 127.0.0.1:9001

    # Standard hardening. NOTE: no X-Frame-Options/CSP stripping and no
    # frame-ancestors — Nofida is no longer embedded in an iframe.
    header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
    header X-Content-Type-Options "nosniff"
    header Referrer-Policy "strict-origin-when-cross-origin"
}
CADDYFILE

# Optional 301 from the retired engine host to the new app domain.
if [ -n "${NOFIDA_REDIRECT_FROM}" ]; then
  sudo tee -a /etc/caddy/Caddyfile > /dev/null <<REDIR

${NOFIDA_REDIRECT_FROM} {
    redir https://${NOFIDA_DOMAIN}{uri} permanent
}
REDIR
fi

echo "🔄 Validating + reloading Caddy..."
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl enable caddy
sudo systemctl restart caddy

# ── 8. Done ──────────────────────────────────────────────────────────────────
echo ""
echo "✅ [Nofida DevOps] Deployment complete."
echo ""
echo "   App           : ${PENPOT_PUBLIC_URI}  (branded Penpot, single origin)"
echo "   Frontend      : Docker, 127.0.0.1:9001 (Caddy proxies 443 → it)"
echo "   Redirect      : ${NOFIDA_REDIRECT_FROM:-<none>} → ${NOFIDA_DOMAIN}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  VERIFY:"
echo "    1. Open ${PENPOT_PUBLIC_URI} — branded Nofida loads over valid TLS."
echo "    2. Register/login → straight to the dashboard (no black screen)."
echo "    3. DevTools → Application → Cookies: all on ${NOFIDA_DOMAIN}"
echo "       (first-party). Refresh keeps the session. No nested iframe in DOM."
echo "    4. Floating Nofida AI button appears over the canvas."
echo ""
echo "  If the cert does not issue: confirm 80/443 reachable and that"
echo "  ${NOFIDA_DOMAIN} resolves here:  dig +short ${NOFIDA_DOMAIN}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
