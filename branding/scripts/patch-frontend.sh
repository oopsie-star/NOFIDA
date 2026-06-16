#!/bin/sh
set -eu

WEBROOT="${1:-/var/www/app}"
INDEX="${WEBROOT}/index.html"
BRAND_CSS="${WEBROOT}/nofida/brand/nofida-brand.css"
PAGES_CSS="${WEBROOT}/nofida/brand/nofida-pages.css"
AI_CORE="${WEBROOT}/nofida/ai-core/nofida-ai-core.js"
PAGES_JS="${WEBROOT}/nofida/ai-core/nofida-pages.js"
LIB_HUB="${WEBROOT}/nofida/ai-core/nofida-library-hub.js"
MANIFEST_FILE="${WEBROOT}/nofida/brand/site.webmanifest"

if [ ! -f "${INDEX}" ]; then
  echo "index.html not found in ${WEBROOT}" >&2
  exit 1
fi

ASSET_TAG="${NOFIDA_ASSET_TAG:-$(date -u +%Y%m%d%H%M%S)}"
BASE_VERSION_TAG="$(perl -ne 'if (/globalThis\.penpotVersionTag = "([^"]+)"/) { print $1; exit }' "${INDEX}")"
BASE_VERSION_TAG="${BASE_VERSION_TAG%%-nofida-*}"
PENPOT_VERSION_TAG="${BASE_VERSION_TAG:-2.16.0}-${ASSET_TAG}"
NOFIDA_LOGO_HREF="/nofida/brand/logo.png?v=${ASSET_TAG}"
NOFIDA_ICON_HREF="/nofida/brand/icon.png?v=${ASSET_TAG}"

# Remove the broken ui.css include if the pinned image does not ship that file.
[ -f "${WEBROOT}/css/ui.css" ] || sed -i '/css\/ui\.css/d' "${INDEX}"

for templated_file in "${BRAND_CSS}" "${PAGES_CSS}" "${AI_CORE}" "${PAGES_JS}" "${LIB_HUB}" "${MANIFEST_FILE}"; do
  [ -f "${templated_file}" ] && sed -i "s/__NOFIDA_ASSET_TAG__/${ASSET_TAG}/g" "${templated_file}"
done

if [ -n "${BASE_VERSION_TAG}" ]; then
  find "${WEBROOT}" \
    ! -path "${WEBROOT}/nofida/*" \
    -type f \
    \( -name '*.js' -o -name '*.html' -o -name '*.map' \) | while IFS= read -r file; do
    perl -0pi -e "s/\\Q${BASE_VERSION_TAG}\\E/${PENPOT_VERSION_TAG}/g" "${file}"
  done
fi

# Static head/body hooks that survive every React/ClojureScript render.
grep -q 'nofida-brand.css' "${INDEX}" || \
  sed -i "/<\/head>/i\\    <link rel=\"stylesheet\" href=\"/nofida/brand/nofida-brand.css?v=${ASSET_TAG}\">" "${INDEX}"
grep -q 'nofida-pages.css' "${INDEX}" || \
  sed -i "/<\/head>/i\\    <link rel=\"stylesheet\" href=\"/nofida/brand/nofida-pages.css?v=${ASSET_TAG}\">" "${INDEX}"
grep -q 'id="nofida-shell-root"' "${INDEX}" || \
  sed -i '/<\/body>/i\    <section id="nofida-shell-root"></section>' "${INDEX}"
grep -q 'nofida-ai-core.js' "${INDEX}" || \
  sed -i "/<\/body>/i\\    <script src=\"/nofida/ai-core/nofida-ai-core.js?v=${ASSET_TAG}\" defer></script>" "${INDEX}"
grep -q 'nofida-pages.js' "${INDEX}" || \
  sed -i "/<\/body>/i\\    <script src=\"/nofida/ai-core/nofida-pages.js?v=${ASSET_TAG}\" defer></script>" "${INDEX}"
grep -q 'nofida-library-hub.js' "${INDEX}" || \
  sed -i "/<\/body>/i\\    <script src=\"/nofida/ai-core/nofida-library-hub.js?v=${ASSET_TAG}\" defer></script>" "${INDEX}"

sed -i \
  -e 's#<title>[^<]*</title>#<title>Nofida</title>#' \
  -e 's#<meta name="description" content="[^"]*">#<meta name="description" content="Nofida is the white-label design workspace for teams building digital products.">#' \
  -e 's#<meta property="og:title" content="[^"]*">#<meta property="og:title" content="Nofida | White-label design workspace">#' \
  -e 's#<meta property="og:description" content="[^"]*">#<meta property="og:description" content="Nofida is the white-label design workspace for teams building digital products.">#' \
  -e 's#<meta name="twitter:title" content="[^"]*">#<meta name="twitter:title" content="Nofida | White-label design workspace">#' \
  -e 's#<meta name="twitter:description" content="[^"]*">#<meta name="twitter:description" content="Nofida is the white-label design workspace for teams building digital products.">#' \
  -e 's|<meta name="theme-color"[^>]*>|<meta name="theme-color" content="#0b1020">|' \
  "${INDEX}"

perl -0pi -e "s#/nofida/brand/nofida-brand\\.css(?:\\?v=[^\"]*)?#/nofida/brand/nofida-brand.css?v=${ASSET_TAG}#g; s#/nofida/brand/nofida-pages\\.css(?:\\?v=[^\"]*)?#/nofida/brand/nofida-pages.css?v=${ASSET_TAG}#g; s#/nofida/ai-core/nofida-ai-core\\.js(?:\\?v=[^\"]*)?#/nofida/ai-core/nofida-ai-core.js?v=${ASSET_TAG}#g; s#/nofida/ai-core/nofida-pages\\.js(?:\\?v=[^\"]*)?#/nofida/ai-core/nofida-pages.js?v=${ASSET_TAG}#g; s#/nofida/ai-core/nofida-library-hub\\.js(?:\\?v=[^\"]*)?#/nofida/ai-core/nofida-library-hub.js?v=${ASSET_TAG}#g" "${INDEX}"
perl -0pi -e 's#<link rel="icon"[^>]*>\s*##g; s#<link rel="shortcut icon"[^>]*>\s*##g; s#<link rel="apple-touch-icon"[^>]*>\s*##g; s#<link rel="manifest"[^>]*>\s*##g' "${INDEX}"
grep -q 'nofida/brand/icon.png' "${INDEX}" || \
  sed -i "/<\/head>/i\\    <link rel=\"icon\" type=\"image/png\" href=\"/nofida/brand/icon.png?v=${ASSET_TAG}\" />\\n    <link rel=\"shortcut icon\" type=\"image/png\" href=\"/nofida/brand/favicon-32.png?v=${ASSET_TAG}\" />\\n    <link rel=\"apple-touch-icon\" href=\"/nofida/brand/apple-touch-icon.png?v=${ASSET_TAG}\" />\\n    <link rel=\"manifest\" href=\"/nofida/brand/site.webmanifest?v=${ASSET_TAG}\" />" "${INDEX}"
perl -0pi -e "s/\\?version=[^\"' <>]+/?version=${PENPOT_VERSION_TAG}/g; s/globalThis\\.penpotVersionTag = \"[^\"]+\";/globalThis.penpotVersionTag = \"${PENPOT_VERSION_TAG}\";/g" "${INDEX}"

replace_symbol() {
  symbol_id="$1"
  view_box="$2"
  asset_href="$3"
  width="$4"
  height="$5"

  perl -0pi -e "s{<symbol\\b[^>]*id=\"${symbol_id}\"[^>]*>.*?</symbol>}{<symbol id=\"${symbol_id}\" viewBox=\"${view_box}\"><image href=\"${asset_href}\" width=\"${width}\" height=\"${height}\" preserveAspectRatio=\"xMidYMid meet\"/></symbol>}gs" "${INDEX}"
}

replace_symbol "asset-penpot-logo" "0 0 2508 627" "${NOFIDA_LOGO_HREF}" "2508" "627"
replace_symbol "icon-penpot-logo" "0 0 2508 627" "${NOFIDA_LOGO_HREF}" "2508" "627"
replace_symbol "asset-penpot-logo-icon" "0 0 1254 1254" "${NOFIDA_ICON_HREF}" "1254" "1254"
replace_symbol "icon-penpot-logo-icon" "0 0 1254 1254" "${NOFIDA_ICON_HREF}" "1254" "1254"
replace_symbol "icon-penpot-logo-icon-loader" "0 0 1254 1254" "${NOFIDA_ICON_HREF}" "1254" "1254"

# ── Email and domain replacement — cover ALL compiled JS bundles ─────────────
# support@penpot.app appears in translation files AND in main-workspace.js.
# We must sweep the full /js/ tree, not only translation*.js files.
find "${WEBROOT}" \
  ! -path "${WEBROOT}/nofida/*" \
  -type f \
  \( -name '*.js' -o -name '*.html' -o -name '*.json' \) | while IFS= read -r file; do
  grep -q 'penpot\.app' "${file}" || continue
  sed -i \
    -e 's/support@penpot\.app/support@nofida.internal/g' \
    -e 's/@penpot\.app/@nofida.internal/g' \
    "${file}"
done

# ── Deep white-label pass across compiled bundles/templates ──────────────────
# Replace only the standalone capitalized word "Penpot" so ClojureScript
# identifiers like PenpotContext remain intact.
find "${WEBROOT}" \
  ! -path "${WEBROOT}/nofida/*" \
  -type f \
  \( -name 'translation*.js' -o -name '*.html' -o -name '*.json' \) | while IFS= read -r file; do
  sed -E -i \
    -e 's/Ваш Penpot/Ваше пространство/g' \
    -e 's/Ваш Nofida/Ваше пространство/g' \
    -e 's/Your Penpot/Your space/g' \
    -e 's/Your Nofida/Your space/g' \
    -e 's/(^|[^[:alnum:]_])Penpot([^[:alnum:]_]|$)/\1Nofida\2/g' \
    "${file}"
done
