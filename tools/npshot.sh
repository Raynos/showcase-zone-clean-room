#!/bin/bash
# NPC fork screenshot helper. usage: tools/npshot.sh <name> [js-to-eval-before] [wait-seconds]
export AGENT_BROWSER_SESSION="cratefall-np"
if [ -n "$2" ]; then echo "$2" | agent-browser eval --stdin >/dev/null 2>&1; fi
sleep "${3:-0.6}"
mkdir -p shots/npc
agent-browser screenshot "shots/npc/$1.png" >/dev/null 2>&1 && echo "shots/npc/$1.png"
