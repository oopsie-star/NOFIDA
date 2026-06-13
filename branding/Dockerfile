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

# ── nginx override: serve /nofida/* as plain static files ───────────────────
# Without this, Penpot's catch-all `location ~ ^/[^/]+/(.*){return 301 /404}`
# redirects .json and .html paths (needed by the companion plugin) to /404.
COPY nginx/nofida.conf /etc/nginx/overrides/location.d/nofida.conf

# ── index.html: inject brand CSS + AI overlay JS, retitle, swap favicon ─────
RUN set -e; \
    F="${WEBROOT}/index.html"; \
    test -f "$F"; \
    grep -q 'nofida-brand.css' "$F" || \
      sed -i 's#</body>#  <link rel="stylesheet" href="/nofida/brand/nofida-brand.css">\n</body>#' "$F"; \
    grep -q 'nofida-ai-core.js' "$F" || \
      sed -i 's#</body>#  <script src="/nofida/ai-core/nofida-ai-core.js" defer></script>\n</body>#' "$F"; \
    sed -i 's#<title>[^<]*</title>#<title>Nofida</title>#' "$F"; \
    cp "${WEBROOT}/nofida/brand/favicon.svg" "${WEBROOT}/favicon.svg" || true

# ── White-label JS string replacement ───────────────────────────────────────
# translation.en.js is ONLY i18n strings — a global replace is safe.
# main.js / main-dashboard.js / main-workspace.js contain ClojureScript
# identifiers like PenpotContext, PenpotLibrarySubcontext that must be
# preserved. We replace only the quoted/spaced patterns that correspond to
# user-visible text:
#   "Penpot"     exact quoted word  →  "Nofida"
#   "Penpot "    quoted prefix      →  "Nofida "   (e.g. "Penpot Dark")
#   " Penpot"    quoted suffix      →  " Nofida"   (e.g. "Your Penpot" etc.)
#   "'Penpot"    single-quote       →  "'Nofida"
# This preserves PenpotContext, PenpotLibrarySubcontext, penpot.app etc.
# because those are never wrapped in quotes with a capital P at word start.
RUN set -e; \
    JS="${WEBROOT}/js"; \
    \
    # translation files — full global replace, no risk of identifier collision
    for f in "${JS}"/translation.*.js; do \
      test -f "$f" || continue; \
      sed -i 's/Penpot/Nofida/g' "$f"; \
    done; \
    \
    # main bundles — surgical quoted-string only
    for f in "${JS}/main.js" "${JS}/main-dashboard.js" "${JS}/main-workspace.js"; do \
      test -f "$f" || continue; \
      sed -i \
        -e 's/"Penpot"/"Nofida"/g' \
        -e 's/"Penpot /"Nofida /g' \
        -e 's/ Penpot"/ Nofida"/g' \
        -e "s/'Penpot'/'Nofida'/g" \
        "$f"; \
    done

# ── nginx + original entrypoint (config.js templating) inherited unchanged ──
