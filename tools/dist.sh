#!/bin/bash
# Bundle src/ into dist/sofa.html (artifact body) + dist/preview.html. Uses src/recliner.js if present, else recliner_quick.js.
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"; cd "$DIR"
rm -rf .cache/b; mkdir -p .cache/b dist
cp src/app.js src/core.js src/materials.js src/chaise.js src/bedseat.js src/console.js src/room.js .cache/b/
if [ -f src/recliner.js ] && [ "$1" != "quick" ]; then cp src/recliner.js .cache/b/; else cp src/recliner_quick.js .cache/b/recliner.js; fi
(cd .cache/b && npx -y esbuild@0.19.12 app.js --bundle --format=esm --external:three --external:'three/addons/*' --minify --target=es2020 --outfile="$DIR/dist/app.bundle.js" --log-level=warning)
IM='<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/"}}</script>'
{ cat src/ui.html; echo "$IM"; printf '<script type="module">\n'; cat dist/app.bundle.js; printf '\n</script>\n'; } > dist/sofa.html
{ echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'; cat dist/sofa.html; echo '</html>'; } > dist/preview.html
rm -rf .cache/b
ls -la dist/sofa.html
