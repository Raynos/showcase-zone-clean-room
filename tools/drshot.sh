#!/bin/bash
# Dressing screenshot helper (own browser session, no-HMR test server on :5174).
#   tools/drshot.sh reload                          reload page and wait for boot
#   tools/drshot.sh js '<js>'                       run a snippet in the page
#   tools/drshot.sh shot <name> ['<js>'] [wait]     screenshot to shots/dress/<name>.png
#   tools/drshot.sh view <name> x z yaw [pitch] [hour]   teleport + snap camera + shot
export AGENT_BROWSER_SESSION="cratefall-dr"
AB=agent-browser
case "$1" in
  reload)
    sleep 1.3
    $AB set viewport 402 874 2 >/dev/null 2>&1
    $AB open "http://localhost:5174/?dev&r=$RANDOM" >/dev/null 2>&1
    for i in $(seq 1 50); do
      sleep 0.5
      r=$(echo "!!(window.game && window.game.started && window.game.player && window.game.mobs)" | $AB eval --stdin 2>/dev/null)
      [ "$r" = "true" ] && break
    done
    sleep 1.5
    echo "game.state.god=true; game.env.forcedHour=10; innerWidth+'x'+innerHeight" | $AB eval --stdin 2>&1 | tail -1
    $AB errors 2>&1 | tail -4
    ;;
  js) echo "$2" | $AB eval --stdin 2>&1 | tail -3 ;;
  shot)
    if [ -n "$3" ]; then echo "$3" | $AB eval --stdin >/dev/null 2>&1; fi
    sleep "${4:-1.2}"
    $AB screenshot "shots/dress/$2.png" >/dev/null 2>&1 && echo "shots/dress/$2.png"
    ;;
  view)
    H="${7:-10}"; P="${6:-0.12}"
    echo "game.env.forcedHour=$H; game.hideHud=true; game.mobs.clear(); game.player.teleport($3, game.terrain.h($3,$4)+0.3, $4, $5); game.cameraRig.snap($5+Math.PI, $P); 1" | $AB eval --stdin >/dev/null 2>&1
    sleep 1.6
    $AB screenshot "shots/dress/$2.png" >/dev/null 2>&1 && echo "shots/dress/$2.png"
    ;;
  at)
    # at <name> px pz tx tz [pitch] [hour] [dy]: stand at (px,pz) looking toward (tx,tz)
    H="${8:-10}"; P="${7:-0.05}"; DY="${9:-0.3}"
    echo "game.env.forcedHour=$H; game.hideHud=true; document.querySelectorAll('.zone-banner,.banner,.zonebanner').forEach(e=>e.style.display='none'); game.mobs.clear(); var yw=Math.atan2($5-($3),$6-($4)); game.player.teleport($3, game.terrain.h($3,$4)+$DY, $4, yw); game.cameraRig.snap(yw+Math.PI, $P); 1" | $AB eval --stdin >/dev/null 2>&1
    sleep 2.2
    $AB screenshot "shots/dress/$2.png" >/dev/null 2>&1 && echo "shots/dress/$2.png"
    ;;
esac
