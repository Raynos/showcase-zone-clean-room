#!/bin/bash
# usage: tools/shot.sh <name> [js-to-eval-before] [wait-seconds]
export AGENT_BROWSER_SESSION="cratefall"
if [ -n "$2" ]; then echo "$2" | agent-browser eval --stdin >/dev/null 2>&1; fi
sleep "${3:-0.6}"
agent-browser screenshot "shots/$1.png" >/dev/null 2>&1 && echo "shots/$1.png"
