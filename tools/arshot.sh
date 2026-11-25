#!/bin/bash
# Arena playtest helper (browser session "cratefall-ar", iPhone 17 Pro portrait).
#   tools/arshot.sh load [js-after-boot]        reload the no-HMR test server and wait for boot
#   tools/arshot.sh js <js>                     evaluate JS in the page, print the result
#   tools/arshot.sh shot <name> [js] [wait]     optional JS, wait, screenshot to shots/arena/<name>.png
export AGENT_BROWSER_SESSION="cratefall-ar"
cd "$(dirname "$0")/.."
cmd="$1"; shift
case "$cmd" in
  load)
    sleep 1.2
    agent-browser open "http://localhost:${AR_PORT:-5174}/?dev&r=$RANDOM" >/dev/null 2>&1
    agent-browser set viewport 402 874 2 >/dev/null 2>&1
    for i in $(seq 1 40); do sleep 0.5; r=$(agent-browser eval "!!(window.game && window.game.player && window.game.mobs)" 2>/dev/null); [ "$r" = "true" ] && break; done
    sleep 1.5
    if [ -n "$1" ]; then echo "$1" | agent-browser eval --stdin 2>&1 | tail -1; fi ;;
  js)
    echo "$1" | agent-browser eval --stdin 2>&1 | tail -1 ;;
  shot)
    if [ -n "$2" ]; then echo "$2" | agent-browser eval --stdin >/dev/null 2>&1; fi
    sleep "${3:-0.6}"
    agent-browser screenshot "shots/arena/$1.png" >/dev/null 2>&1 && echo "shots/arena/$1.png" ;;
esac
