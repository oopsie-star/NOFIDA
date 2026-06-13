#!/bin/sh
set -eu

WEBROOT="${1:-/var/www/app}"
INDEX="${WEBROOT}/index.html"

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
