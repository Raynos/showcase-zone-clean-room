#!/bin/bash
# reload the no-HMR test server page and wait for boot. usage: tools/vt.sh [js-after-boot]
export AGENT_BROWSER_SESSION="cratefall"
sleep 1.2  # let the file watcher invalidate changed modules first
agent-browser open "http://localhost:5174/?dev&r=$RANDOM" >/dev/null 2>&1
for i in $(seq 1 40); do sleep 0.5; r=$(agent-browser eval "!!(window.game && window.game.started !== undefined && window.game.player && window.game.mobs)" 2>/dev/null); [ "$r" = "true" ] && break; done
sleep 1.5
if [ -n "$1" ]; then echo "$1" | agent-browser eval --stdin 2>&1 | tail -1; fi
