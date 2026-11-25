#!/bin/bash
# (re)start the west-A private dev server on :5183
cd "$(dirname "$0")/.."
pid=$(lsof -ti tcp:5183 -sTCP:LISTEN); [ -n "$pid" ] && kill $pid && sleep 0.5
(nohup npx vite --config tools/vite.wa.config.ts > /private/tmp/claude-501/-Users-jakeverbaten-projects-game-demos-showcase-zone-clean-room/7aabdbae-b22f-4a68-8c0d-0243668ef813/scratchpad/vite-wa.log 2>&1 &)
sleep 3
