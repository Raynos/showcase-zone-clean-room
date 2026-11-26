#!/bin/bash
# Record trailer shots (tools/trailer/shots.js) from a production build served by
# tools/trailer/serve.mjs. Each shot gets a fresh page (fresh save, seeded clock) and lands in
# <frames>/<shot>-l (landscape 1920x1080) or <shot>-p (portrait 1080x1920) as numbered JPEGs.
#
#   TRAILER_URL=http://127.0.0.1:5231 tools/trailer/shoot.sh l|p <shot>... | all
#
# One browser session (AGENT_BROWSER_SESSION, default trailer), closed at the end.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$(dirname "$HERE")")"
URL="${TRAILER_URL:-http://127.0.0.1:5231}"
Q="${TRAILER_Q:-high}"
ASP="$1"; shift
if [ "$ASP" = p ]; then W=540; Hh=960; else W=960; Hh=540; fi
WANT=()
for a in "$@"; do
  if [ "$a" = all ]; then while read -r n; do WANT+=("$n"); done < <(grep -o "{ name: '[a-z0-9-]*'" "$HERE/shots.js" | cut -d"'" -f2); else WANT+=("$a"); fi
done
export AGENT_BROWSER_SESSION="${AGENT_BROWSER_SESSION:-trailer}"
export AGENT_BROWSER_INIT_SCRIPTS="$ROOT/tools/golden/init.js"
agent-browser close >/dev/null 2>&1
sleep 1
agent-browser open "about:blank" >/dev/null 2>&1
agent-browser set viewport "$W" "$Hh" 2 >/dev/null 2>&1
for name in "${WANT[@]}"; do
  agent-browser open "$URL/?golden&dev&trailer&nosw&q=$Q" >/dev/null 2>&1
  for _ in $(seq 1 120); do
    r="$(agent-browser eval "!!(window.game && window.game.started && window.game.trailer)" 2>/dev/null)"
    [ "$r" = "true" ] && break
    sleep 0.5
  done
  { echo '(() => {'; cat "$ROOT/tools/golden/lib.js"; echo '})();'; cat "$HERE/capture.js" "$HERE/shots.js"; } | agent-browser eval --stdin >/dev/null 2>&1
  agent-browser eval "TRAILER.start('$name')" >/dev/null 2>&1
  status=""
  for _ in $(seq 1 1200); do
    status="$(agent-browser eval "window.TRAILER ? TRAILER.status : 'noload'" 2>/dev/null | tr -d '"')"
    case "$status" in done|error) break ;; esac
    sleep 0.5
  done
  echo "$name-$ASP: $status $(agent-browser eval "TRAILER.error + ' ' + TRAILER.notes.join(' ; ')" 2>/dev/null)"
done
agent-browser close >/dev/null 2>&1
