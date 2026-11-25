#!/bin/bash
# reload the no-HMR test page in the NPC fork's browser session and wait for boot. usage: tools/npload.sh [js-after-boot]
export AGENT_BROWSER_SESSION="cratefall-np"
sleep 1.2
agent-browser set viewport 402 874 2 >/dev/null 2>&1
agent-browser open "http://localhost:5174/?dev&r=$RANDOM" >/dev/null 2>&1
for i in $(seq 1 50); do sleep 0.5; r=$(agent-browser eval "!!(window.game && window.game.started && window.game.player && window.game.npcs)" 2>/dev/null); [ "$r" = "true" ] && break; done
sleep 1.5
if [ -n "$1" ]; then echo "$1" | agent-browser eval --stdin 2>&1 | tail -1; fi
