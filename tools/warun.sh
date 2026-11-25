#!/bin/bash
# usage: tools/warun.sh <js-file-with-async-IIFE-returning-string> [max-seconds]
# Runs a long async script in the west-A page without holding one eval open: result is polled.
export AGENT_BROWSER_SESSION="cratefall-wa"
body=$(cat "$1")
echo "window.__res = null; window.__err = null; Promise.resolve(${body}).then(r => { window.__res = r; }).catch(e => { window.__err = String(e && e.stack || e); }); 'started'" | agent-browser eval --stdin >/dev/null 2>&1
max=${2:-100}
for i in $(seq 1 $max); do
  r=$(echo 'window.__err ? "ERR " + window.__err : window.__res' | agent-browser eval --stdin 2>/dev/null)
  if [ "$r" != "null" ] && [ -n "$r" ]; then echo "$r"; exit 0; fi
  sleep 1
done
echo "timeout"
