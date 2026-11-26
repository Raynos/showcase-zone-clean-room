#!/bin/bash
# Record the title card (tools/trailer/card.js) frame by frame as screenshots, since the logo is
# page markup, not canvas: <frames>/card-l or card-p, numbered PNGs at 30 fps.
#
#   TRAILER_URL=http://127.0.0.1:5231 tools/trailer/card.sh l|p <frames dir> [frames, default 150]
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$(dirname "$HERE")")"
URL="${TRAILER_URL:-http://127.0.0.1:5231}"
ASP="$1"; OUT="$2/card-$1"; N="${3:-150}"
if [ "$ASP" = p ]; then W=540; Hh=960; else W=960; Hh=540; fi
export AGENT_BROWSER_SESSION="${AGENT_BROWSER_SESSION:-trailer}"
export AGENT_BROWSER_INIT_SCRIPTS="$ROOT/tools/golden/init.js"
mkdir -p "$OUT"
agent-browser close >/dev/null 2>&1
sleep 1
agent-browser open "about:blank" >/dev/null 2>&1
agent-browser set viewport "$W" "$Hh" 2 >/dev/null 2>&1
agent-browser open "$URL/?golden&dev&trailer&nosw&q=${TRAILER_Q:-high}" >/dev/null 2>&1
for _ in $(seq 1 120); do
  [ "$(agent-browser eval "!!(window.game && window.game.started && window.game.trailer)" 2>/dev/null)" = "true" ] && break
  sleep 0.5
done
{ echo '(() => {'; cat "$ROOT/tools/golden/lib.js"; echo '})();'; cat "$HERE/capture.js" "$HERE/card.js"; } | agent-browser eval --stdin >/dev/null 2>&1
agent-browser eval "CARD.setup(); 1" >/dev/null 2>&1
for _ in $(seq 1 240); do
  s="$(agent-browser eval "CARD.status" 2>/dev/null | tr -d '"')"
  case "$s" in ready|error) break ;; esac
  sleep 0.5
done
[ "$s" = ready ] || { echo "card: $s $(agent-browser eval "CARD.error" 2>/dev/null)"; agent-browser close >/dev/null 2>&1; exit 1; }
for i in $(seq 0 $((N - 1))); do
  agent-browser eval "CARD.step($i); 1" >/dev/null 2>&1
  for _ in $(seq 1 100); do [ "$(agent-browser eval "CARD.status" 2>/dev/null | tr -d '"')" = ready ] && break; sleep 0.05; done
  agent-browser screenshot "$OUT/$(printf %05d "$i").png" >/dev/null 2>&1
done
echo "card-$ASP: $N frames"
agent-browser close >/dev/null 2>&1
