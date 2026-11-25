#!/bin/bash
# usage: tools/rshot.sh <name> [js-to-eval-before] [wait-seconds]   (robots fork session)
# Other agents' edits can hot-reload the page at any moment, so wait for the page to be up,
# run the JS, and re-run it if a reload wiped the state before the shot.
export AGENT_BROWSER_SESSION="cf-robots"
for try in 1 2 3; do
  for i in 1 2 3 4 5 6 7 8 9 10; do
    [ "$(agent-browser eval 'typeof sheet' 2>/dev/null | tr -d '"')" = "function" ] && break
    sleep 1
  done
  if [ -n "$2" ]; then echo "window.__shot = '$1'; $2" | agent-browser eval --stdin >/dev/null 2>&1; fi
  sleep "${3:-0.7}"
  if [ -z "$2" ] || [ "$(agent-browser eval 'window.__shot' 2>/dev/null | tr -d '"')" = "$1" ]; then
    agent-browser screenshot "shots/robots/$1.png" >/dev/null 2>&1 && echo "shots/robots/$1.png"
    exit 0
  fi
done
echo "rshot: page kept reloading" >&2; exit 1
