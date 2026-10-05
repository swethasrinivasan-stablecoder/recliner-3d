#!/bin/bash
# Builds index.html (dev: native ES modules) and dist/sofa.html (artifact: one inline bundle).
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"
IMPORTMAP='<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/"}}</script>'
{
  echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
  cat src/ui.html
  echo "$IMPORTMAP"
  echo '<script type="module" src="./src/app.js"></script></html>'
} > index.html
if [ "$1" == "dist" ]; then
  mkdir -p dist
  npx -y esbuild@0.19.12 src/app.js --bundle --format=esm --external:three --external:'three/addons/*' --minify --target=es2020 --outfile=dist/app.bundle.js --log-level=warning
  {
    cat src/ui.html
    echo "$IMPORTMAP"
    printf '<script type="module">\n'
    cat dist/app.bundle.js
    printf '\n</script>\n'
  } > dist/sofa.html
  # local preview of the artifact file
  { echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'; cat dist/sofa.html; echo '</html>'; } > dist/preview.html
  ls -la dist
fi
echo built
