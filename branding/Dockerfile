# =============================================================================
# Nofida — branded Penpot frontend (override layer)
# =============================================================================
# A thin layer on top of the official Penpot frontend image. We DO NOT fork or
# recompile Penpot's ClojureScript: we drop our own static assets next to the
# served SPA and inject two tags into index.html — a brand stylesheet and the
# AI Core overlay script. Upgrading Penpot = bump PENPOT_VERSION and re-verify
# the asset paths / CSS variable names / JS class names against the new build.
#
# Web root: official image serves from /var/www/app.
# Only js/config.js is templated at container start; index.html is static, so
# build-time edits survive. VERIFY layout for a new tag with:
#   docker run --rm penpotapp/frontend:<tag> sh -c 'ls /var/www/app && head -40 /var/www/app/index.html'
# =============================================================================
ARG PENPOT_VERSION=2.16.0
FROM penpotapp/frontend:${PENPOT_VERSION}

ARG WEBROOT=/var/www/app

# ── Brand + AI Core + internal library catalog, served under /nofida/* ──────
COPY brand/     ${WEBROOT}/nofida/brand/
COPY ai-core/   ${WEBROOT}/nofida/ai-core/
COPY libraries/ ${WEBROOT}/nofida/libraries/
COPY scripts/patch-frontend.sh /usr/local/bin/patch-frontend.sh

# ── nginx override: serve /nofida/* as plain static files ───────────────────
# Without this, Penpot's catch-all `location ~ ^/[^/]+/(.*){return 301 /404}`
# redirects .json and .html paths (needed by the companion plugin) to /404.
COPY nginx/nofida.conf /etc/nginx/overrides/location.d/nofida.conf

# ── Build-time white-label patching ─────────────────────────────────────────
# We patch index.html + compiled assets ONCE at image build time instead of
# fighting the SPA after hydration with timers or DOM observers.
RUN chmod +x /usr/local/bin/patch-frontend.sh && \
    /usr/local/bin/patch-frontend.sh "${WEBROOT}"

# ── nginx + original entrypoint (config.js templating) inherited unchanged ──
