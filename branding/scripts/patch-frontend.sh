#!/bin/sh
set -eu

WEBROOT="${1:-/var/www/app}"
INDEX="${WEBROOT}/index.html"
MAIN_JS="${WEBROOT}/js/main.js"

if [ ! -f "${INDEX}" ]; then
  echo "index.html not found in ${WEBROOT}" >&2
  exit 1
fi

# Remove the broken ui.css include if the pinned image does not ship that file.
[ -f "${WEBROOT}/css/ui.css" ] || sed -i '/css\/ui\.css/d' "${INDEX}"

# Static head/body hooks that survive every React/ClojureScript render.
grep -q 'nofida-brand.css' "${INDEX}" || \
  sed -i '/<\/head>/i\    <link rel="stylesheet" href="/nofida/brand/nofida-brand.css">' "${INDEX}"
grep -q 'id="nofida-shell-root"' "${INDEX}" || \
  sed -i '/<\/body>/i\    <section id="nofida-shell-root"></section>' "${INDEX}"
grep -q 'nofida-ai-core.js' "${INDEX}" || \
  sed -i '/<\/body>/i\    <script src="/nofida/ai-core/nofida-ai-core.js" defer></script>' "${INDEX}"

sed -i \
  -e 's#<title>[^<]*</title>#<title>Nofida</title>#' \
  -e 's#<meta name="description" content="[^"]*">#<meta name="description" content="Nofida is the white-label design workspace for teams building digital products.">#' \
  -e 's#<meta property="og:title" content="[^"]*">#<meta property="og:title" content="Nofida | White-label design workspace">#' \
  -e 's#<meta property="og:description" content="[^"]*">#<meta property="og:description" content="Nofida is the white-label design workspace for teams building digital products.">#' \
  -e 's#<meta name="twitter:title" content="[^"]*">#<meta name="twitter:title" content="Nofida | White-label design workspace">#' \
  -e 's#<meta name="twitter:description" content="[^"]*">#<meta name="twitter:description" content="Nofida is the white-label design workspace for teams building digital products.">#' \
  -e 's|<meta name="theme-color"[^>]*>|<meta name="theme-color" content="#0b1020">|' \
  -e 's#<link rel="icon" href="[^"]*" */>#<link rel="icon" type="image/svg+xml" href="/nofida/brand/favicon.svg" />#' \
  "${INDEX}"

# Deep white-label pass across compiled bundles/templates. Replace only the
# standalone capitalized word "Penpot" so ClojureScript identifiers like
# PenpotContext remain intact.
find "${WEBROOT}" -type f \( -name '*.js' -o -name '*.html' -o -name '*.css' -o -name '*.svg' -o -name '*.json' \) | while IFS= read -r file; do
  sed -E -i \
    -e 's/Ваш Penpot/Ваше пространство/g' \
    -e 's/Ваш Nofida/Ваше пространство/g' \
    -e 's/Your Penpot/Your space/g' \
    -e 's/Your Nofida/Your space/g' \
    -e 's/(^|[^[:alnum:]_])Penpot([^[:alnum:]_]|$)/\1Nofida\2/g' \
    "${file}"
done

# Hard-disable release notes at bundle level so the modal component can never
# mount, even if Penpot decides to toggle its internal state again later.
if [ -f "${MAIN_JS}" ]; then
  awk '
    BEGIN {
      start = "$app$main$ui$releases$release_notes_modal$$=function"
      finish = "$app$main$ui$workspace_legacy_redirect_STAR_$$="
      replacement = "$app$main$ui$releases$release_notes_modal$$=function(){return null},"
      skipping = 0
    }
    {
      if (!skipping && index($0, start)) {
        skipping = 1
      }

      if (skipping) {
        marker = index($0, finish)
        if (marker > 0) {
          print replacement substr($0, marker)
          skipping = 0
        }
        next
      }

      print
    }
  ' "${MAIN_JS}" > "${MAIN_JS}.tmp" && mv "${MAIN_JS}.tmp" "${MAIN_JS}"
fi
