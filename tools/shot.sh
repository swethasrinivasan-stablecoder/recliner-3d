#!/bin/bash
# Headless screenshot / DOM dump of a page in this folder (WebGL via SwiftShader).
#   tools/shot.sh "dev.html?m=recliner&p_recline=1&cam=side" shots/recliner-side.png [W] [H]
#   tools/shot.sh --dom "dev.html?m=recliner"      # prints the page's #info JSON (errors, bounds, labels)
# Starts a local static server on :8770 if one isn't running.
DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT=8770
if ! curl -s -o /dev/null "http://localhost:$PORT/dev.html"; then
  (cd "$DIR" && nohup python3 -m http.server $PORT >/dev/null 2>&1 &)
  for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -o /dev/null "http://localhost:$PORT/dev.html" && break; sleep 0.5; done
fi
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
mkdir -p "$DIR/.cache"
PROF="$(mktemp -d "$DIR/.cache/prof.XXXXXX")"
FLAGS=(--headless=new --user-data-dir="$PROF" --no-first-run --no-default-browser-check --use-angle=swiftshader --enable-unsafe-swiftshader --hide-scrollbars --virtual-time-budget=20000)
if [ "$1" == "--dom" ]; then
  URL="http://localhost:$PORT/$2"
  OUT="$PROF/dom.html"
  "$CHROME" "${FLAGS[@]}" --window-size=900,600 --dump-dom "$URL" > "$OUT" 2>/dev/null &
  PID=$!
  for i in $(seq 1 300); do kill -0 $PID 2>/dev/null || break; sleep 0.5; done
  kill $PID 2>/dev/null
  python3 - "$OUT" <<'PY'
import sys, re, html
s = open(sys.argv[1], encoding='utf-8', errors='replace').read()
m = re.search(r'<pre id="info"[^>]*>(.*?)</pre>', s, re.S)
t = re.search(r'<title>(.*?)</title>', s, re.S)
print('title:', t.group(1) if t else '?')
print(html.unescape(m.group(1)) if m else s[:3000])
PY
  (sleep 3; rm -rf "$PROF") >/dev/null 2>&1 &
  exit 0
fi
URL="http://localhost:$PORT/$1"
OUT="$2"
case "$OUT" in /*) ;; *) OUT="$PWD/$OUT";; esac
W="${3:-1200}"; H="${4:-800}"
rm -f "$OUT"
"$CHROME" "${FLAGS[@]}" --window-size="$W,$H" --screenshot="$OUT" "$URL" >/dev/null 2>&1 &
PID=$!
for i in $(seq 1 300); do [ -s "$OUT" ] && break; kill -0 $PID 2>/dev/null || break; sleep 0.5; done
sleep 0.3; kill $PID 2>/dev/null
(sleep 3; rm -rf "$PROF") >/dev/null 2>&1 &
if [ -s "$OUT" ]; then echo "saved $OUT"; else echo "FAILED to capture $URL"; exit 1; fi
