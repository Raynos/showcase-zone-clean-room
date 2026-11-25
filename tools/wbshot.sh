#!/bin/bash
# usage: tools/wbshot.sh <name> [js-to-eval-before] [wait-seconds]   (west-B fork's browser session)
export AGENT_BROWSER_SESSION="cratefall-wb"
if [ "$1" = "--eval" ]; then echo "$2" | agent-browser eval --stdin; exit $?; fi
if [ "$1" = "--ab" ]; then shift; exec agent-browser "$@"; fi
if [ -n "$2" ]; then echo "$2" | agent-browser eval --stdin >/dev/null 2>&1; fi
sleep "${3:-0.6}"
agent-browser screenshot "shots/westB/$1.png" >/dev/null 2>&1 && echo "shots/westB/$1.png"
