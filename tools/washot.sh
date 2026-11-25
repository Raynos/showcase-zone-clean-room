#!/bin/bash
# usage: tools/washot.sh <name> [js-to-eval-before] [wait-seconds]   (west-A fork browser session)
export AGENT_BROWSER_SESSION="cratefall-wa"
if [ -n "$2" ]; then echo "$2" | agent-browser eval --stdin >/dev/null 2>&1; fi
sleep "${3:-0.6}"
agent-browser screenshot "shots/westA/$1.png" >/dev/null 2>&1 && echo "shots/westA/$1.png"
