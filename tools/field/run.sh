#!/usr/bin/env bash
# Drive field quests one after another in an open agent-browser session and print each record.
#   AGENT_BROWSER_SESSION=<name> tools/field/run.sh b1_holes b1_lid ...
#   tools/field/run.sh fresh all        (a true fresh save, then every field quest in order)
#   tools/field/run.sh oldsave all      (rewrite the save as a pre-field save, reload, then all)
set -u
here="$(cd "$(dirname "$0")" && pwd)"
all="b1_holes b1_lid b2_freight b2_union b3_north b3_glass b3_level b4_hot b4_cold b4_shift b5_calib b5_reel b6_charge b6_drop b6_slip"
jobs=()
for a in "$@"; do if [ "$a" = all ]; then jobs+=($all); else jobs+=("$a"); fi; done
for j in "${jobs[@]}"; do
  if [ "$j" = fresh ]; then
    agent-browser eval "game.state.reset(); location.reload(); 'reset'" >/dev/null; sleep 16; echo "fresh save"; continue
  fi
  if [ "$j" = reload ]; then
    agent-browser eval "location.reload(); 'reload'" >/dev/null; sleep 16; echo "reloaded"; continue
  fi
  agent-browser eval "window.__job='$j'" >/dev/null
  agent-browser eval --stdin < "$here/drive.js" >/dev/null
  for _ in $(seq 1 200); do
    sleep 3
    r="$(agent-browser eval "window.__res" 2>/dev/null)"
    if [ -n "$r" ] && [ "$r" != "null" ]; then echo "$r"; break; fi
  done
  if [ "$j" = oldsave ]; then agent-browser eval "location.reload(); 'reload'" >/dev/null; sleep 16; fi
done
