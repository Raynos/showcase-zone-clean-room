#!/usr/bin/env bash
# Like run.sh, but takes a screenshot every couple of seconds while each job plays, into
# shots/outposts/q/<job>_<n>.png (the record still prints). For picking each quest's key moments.
#   AGENT_BROWSER_SESSION=<name> tools/field/shots.sh b2_freight b3_north ...
set -u
here="$(cd "$(dirname "$0")" && pwd)"
out="$here/../../shots/outposts/q"
mkdir -p "$out"
for j in "$@"; do
  agent-browser eval "window.__job='$j'" >/dev/null
  agent-browser eval --stdin < "$here/drive.js" >/dev/null
  n=0
  for _ in $(seq 1 400); do
    n=$((n + 1))
    agent-browser screenshot "$out/${j}_$(printf %03d $n).png" >/dev/null 2>&1
    r="$(agent-browser eval "window.__res" 2>/dev/null)"
    if [ -n "$r" ] && [ "$r" != "null" ]; then echo "$r"; break; fi
    sleep 1
  done
done
