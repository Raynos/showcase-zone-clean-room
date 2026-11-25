#!/bin/bash
# Effects strips: bursts of frames through an attack, laid out as a contact sheet.
#
#   tools/vfx/strip.sh <out dir> <scene>... [--q "hour=23&weather=rain"]
#   tools/vfx/strip.sh list
#
# Scenes are in tools/vfx/scenes.js. A strip scene writes <out dir>/<scene>.jpg; a measure
# scene (m-camp, m-elite, m-titan) prints the worst draw calls and triangles over ten seconds.
# The page runs on the golden harness (fixed 60 Hz clock, seeded RNG), phone tier, 402x874.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$(dirname "$HERE")")"
URL="http://localhost:5174"
if [ "${1:-}" = "list" ]; then grep -o "name: '[a-z0-9-]*'" "$HERE/scenes.js" | cut -d"'" -f2; exit 0; fi
OUT="$1"; shift
EXTRA=""
WANT=()
while [ $# -gt 0 ]; do
  case "$1" in
    --q) EXTRA="&$2"; shift 2 ;;
    *) WANT+=("$1"); shift ;;
  esac
done
export AGENT_BROWSER_SESSION="${VFX_SESSION:-vfx-strip}"
export AGENT_BROWSER_INIT_SCRIPTS="$ROOT/tools/golden/init.js"
mkdir -p "$OUT"
agent-browser close >/dev/null 2>&1
agent-browser open "about:blank" >/dev/null 2>&1
agent-browser set viewport 402 874 2 >/dev/null 2>&1
for name in "${WANT[@]}"; do
  agent-browser open "$URL/?golden&dev&q=medium$EXTRA" >/dev/null 2>&1
  sleep 1
  { echo '(() => {'; cat "$ROOT/tools/golden/lib.js"; echo '})();'; cat "$HERE/scenes.js"; } | agent-browser eval --stdin >/dev/null 2>&1
  agent-browser eval "VFX.start('$name')" >/dev/null 2>&1
  status=""
  for i in $(seq 1 400); do
    status="$(agent-browser eval "window.VFX ? VFX.status : 'noload'" 2>/dev/null | tr -d '"')"
    case "$status" in done|error) break ;; esac
    sleep 0.5
  done
  if [ "$status" != "done" ]; then echo "FAILED $name ($status): $(agent-browser eval "window.VFX ? VFX.error : ''" 2>/dev/null)"; continue; fi
  case "$name" in
    m-*) echo "$name $(agent-browser eval "JSON.stringify(VFX.result)" 2>/dev/null)" ;;
    *) agent-browser eval "VFX.strip" 2>/dev/null | python3 -c 'import sys,base64,json; s=json.loads(sys.stdin.read()); open(sys.argv[1],"wb").write(base64.b64decode(s.split(",",1)[1]))' "$OUT/$name.jpg" && echo "$OUT/$name.jpg" ;;
  esac
done
agent-browser close >/dev/null 2>&1
