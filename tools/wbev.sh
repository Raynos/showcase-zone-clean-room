#!/bin/bash
# usage: tools/wbev.sh "<js>"   -- eval in the west-B session with the W test helpers loaded
#        tools/wbev.sh --wait   -- reload the page (private no-HMR server on :5184) and block until the game has booted
#        tools/wbev.sh --serve  -- (re)start that private dev server
SP=/private/tmp/claude-501/-Users-jakeverbaten-projects-game-demos-showcase-zone-clean-room/7aabdbae-b22f-4a68-8c0d-0243668ef813/scratchpad/wb
export AGENT_BROWSER_SESSION=cratefall-wb
cd "$(dirname "$0")/.."
if [ "$1" = "--serve" ]; then
  pid=$(lsof -ti tcp:5184 -sTCP:LISTEN); [ -n "$pid" ] && kill $pid && sleep 0.5
  (nohup npx vite --config $SP/vite.wb.config.mjs >> $SP/vite.log 2>&1 &)
  sleep 4; tail -4 $SP/vite.log; exit 0
fi
if [ "$1" = "--wait" ]; then
  agent-browser open "http://localhost:5184/?dev" >/dev/null 2>&1
  sleep 3
  for i in $(seq 1 40); do
    r=$(echo "!!(window.game && game.started && game.systems && game.systems.length > 5)" | agent-browser eval --stdin 2>/dev/null)
    [ "$r" = "true" ] && { sleep 1; exit 0; }
    sleep 1
  done
  echo "game did not boot"; exit 1
fi
(cat $SP/h.js; echo "$1") | agent-browser eval --stdin
