#!/bin/bash
# Mechanic sheets: every elite and boss tell, staged and shot (tools/vfx/mech.js).
#
#   tools/vfx/mech.sh <out dir> [--land] [--q "calm=1&noflash=1"] <name>... | all
#   tools/vfx/mech.sh list
#
# Writes <out dir>/<name>-p.jpg (portrait 402x874) or -l.jpg (landscape 874x402, with --land):
# columns are the mechanic's states (tell, counter window, success, fail), rows are noon and night
# at fighting distance and from 15 m. fp-* are first-person strips; m-elite5 prints the worst draw
# calls, triangles and frame CPU time of a five-robot elite fight. Phone tier, golden harness clock.
# One browser session (VFX_SESSION, default vfx2), closed at the end.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$(dirname "$HERE")")"
URL="${MECH_URL:-http://localhost:5174}"
if [ "${1:-}" = "list" ]; then grep -o "name: '[a-z0-9-]*'" "$HERE/mech.js" | cut -d"'" -f2; echo m-elite5; exit 0; fi
OUT="$1"; shift
EXTRA=""; W=402; Hh=874; SUF="p"
WANT=()
while [ $# -gt 0 ]; do
  case "$1" in
    --q) EXTRA="&$2"; shift 2 ;;
    --land) W=874; Hh=402; SUF="l"; shift ;;
    all) while read -r n; do WANT+=("$n"); done < <(grep -o "name: '[a-z0-9-]*'" "$HERE/mech.js" | cut -d"'" -f2 | grep -v '^fp-'); shift ;;
    *) WANT+=("$1"); shift ;;
  esac
done
export AGENT_BROWSER_SESSION="${VFX_SESSION:-vfx2}"
export AGENT_BROWSER_INIT_SCRIPTS="$ROOT/tools/golden/init.js"
mkdir -p "$OUT"
agent-browser close >/dev/null 2>&1
agent-browser open "about:blank" >/dev/null 2>&1
agent-browser set viewport "$W" "$Hh" 2 >/dev/null 2>&1
loaded=""
load() {
  agent-browser open "$URL/?golden&dev&q=medium$EXTRA" >/dev/null 2>&1
  sleep 1
  { echo '(() => {'; cat "$ROOT/tools/golden/lib.js"; echo '})();'; cat "$HERE/mech.js"; } | agent-browser eval --stdin >/dev/null 2>&1
}
for name in "${WANT[@]}"; do
  case "$name" in
    warden-exam|titan-fist|fp-*|m-*) load; loaded="" ;;
    *) if [ -z "$loaded" ]; then load; loaded=1; fi ;;
  esac
  agent-browser eval "MECH.start('$name')" >/dev/null 2>&1
  status=""
  for _ in $(seq 1 900); do
    status="$(agent-browser eval "window.MECH ? MECH.status : 'noload'" 2>/dev/null | tr -d '"')"
    case "$status" in done|error) break ;; esac
    sleep 0.5
  done
  if [ "$status" != "done" ]; then echo "FAILED $name ($status): $(agent-browser eval "window.MECH ? MECH.error : ''" 2>/dev/null)"; loaded=""; continue; fi
  notes="$(agent-browser eval "MECH.notes.join(' ; ')" 2>/dev/null)"
  case "$name" in
    m-*) echo "$name-$SUF $(agent-browser eval "JSON.stringify(MECH.result)" 2>/dev/null)" ;;
    *) agent-browser eval "MECH.sheet" 2>/dev/null | python3 -c 'import sys,base64,json; s=json.loads(sys.stdin.read()); open(sys.argv[1],"wb").write(base64.b64decode(s.split(",",1)[1]))' "$OUT/$name-$SUF.jpg" && echo "$OUT/$name-$SUF.jpg $notes" ;;
  esac
done
agent-browser close >/dev/null 2>&1
