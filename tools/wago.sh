#!/bin/bash
# reload the game in the west-A session and wait for boot
export AGENT_BROWSER_SESSION="cratefall-wa"
agent-browser open "http://localhost:5183/?dev" >/dev/null 2>&1
for i in $(seq 1 30); do
  r=$(echo 'window.game && game.started ? "ok" : "wait"' | agent-browser eval --stdin 2>/dev/null)
  if [[ "$r" == *ok* ]]; then break; fi; sleep 0.7
done
echo 'game.state.god=true; game.mobs.playerHostile=false; game.env.forcedHour=10; game.audio&&game.audio.setMuted&&game.audio.setMuted(true); "ready"' | agent-browser eval --stdin
agent-browser errors 2>&1 | tail -5
