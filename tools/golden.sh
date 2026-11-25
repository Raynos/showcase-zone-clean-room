#!/bin/bash
# Golden frames: re-shoot the fixed set of screenshots every art phase is
# measured against (docs/AAA-PLAN.md section 3, docs/LOOK.md).
#
#   tools/golden.sh <name|NN|all|list> [--url <base>] [--out <dir>]
#
#   name   a scene from tools/golden/scenes.js, as "08-crate-fields-fight",
#          "crate-fields-fight" or just "8"; several may be given
#   all    every scene
#   list   print the scenes and exit
#   --url  base URL of a running build (default http://localhost:5174)
#   --out  output directory (default docs/golden/now)
#
# Each scene loads the game fresh on the phone tier (?q=medium, 402x874 at
# scale 2, touch HUD), stages a fixed camera, hour, weather and game state,
# freezes the frame and writes <out>/NN-name.jpg (804x1748, JPEG q88).
# The page runs on a seeded RNG and a fixed 60 Hz clock (tools/golden/init.js),
# so a re-shoot months later gives the same framing.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$HERE")"
URL="http://localhost:5174"
OUT="$ROOT/docs/golden/now"
WANT=()
while [ $# -gt 0 ]; do
  case "$1" in
    --url) URL="${2%/}"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    -h|--help) sed -n '2,19p' "$0"; exit 0 ;;
    *) WANT+=("$1"); shift ;;
  esac
done
if [ ${#WANT[@]} -eq 0 ]; then sed -n '2,19p' "$0"; exit 1; fi

# "file dev" per scene, from the scene file itself
ALL="$(node -e '
  const src = require("fs").readFileSync(process.argv[1], "utf8");
  const s = new Function(src + "; return GOLDEN_SCENES;")();
  for (const x of s) console.log((x.id || String(x.n).padStart(2, "0")) + "-" + x.name, x.dev === false ? 0 : 1, x.what || "");
' "$HERE/golden/scenes.js")" || { echo "cannot read scenes.js" >&2; exit 1; }

if [ "${WANT[0]}" = "list" ]; then echo "$ALL" | awk '{ f=$1; $1=""; $2=""; print f "  " $0 }'; exit 0; fi

PICK=""
for w in "${WANT[@]}"; do
  if [ "$w" = "all" ]; then PICK="$ALL"; break; fi
  line="$(echo "$ALL" | awk -v w="$w" '{ f=$1; i=index(f,"-"); id=substr(f,1,i-1); name=substr(f,i+1); if (f==w || name==w || id==w || (w ~ /^[0-9]+$/ && id ~ /^[0-9]+$/ && id+0==w+0)) print }')"
  if [ -z "$line" ]; then echo "no such scene: $w (try: tools/golden.sh list)" >&2; exit 1; fi
  PICK="$PICK$line"$'\n'
done

export AGENT_BROWSER_SESSION="${GOLDEN_SESSION:-golden-shoot}"
export AGENT_BROWSER_INIT_SCRIPTS="$HERE/golden/init.js"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/golden.XXXXXX")"
mkdir -p "$OUT"
# a fresh browser, so the init script is registered before the first page
agent-browser close >/dev/null 2>&1
agent-browser open "about:blank" >/dev/null 2>&1
agent-browser set viewport 402 874 2 >/dev/null 2>&1

fail=0
while read -r file dev what <&3; do
  [ -z "$file" ] && continue
  q="golden&q=medium&s=$file"
  [ "$dev" = "1" ] && q="golden&dev&q=medium&s=$file"
  ok=0
  for attempt in 1 2; do
    agent-browser open "$URL/?$q" >/dev/null 2>&1
    sleep 1
    size="$(agent-browser eval "innerWidth + 'x' + innerHeight + '@' + devicePixelRatio" 2>/dev/null | tr -d '"')"
    if [ "$size" != "402x874@2" ]; then
      # the viewport did not stick; set it again and reload
      agent-browser set viewport 402 874 2 >/dev/null 2>&1
      agent-browser open "$URL/?$q" >/dev/null 2>&1
      sleep 1
    fi
    { echo '(() => {'; cat "$HERE/golden/lib.js" "$HERE/golden/scenes.js"; echo '})()'; } | agent-browser eval --stdin >/dev/null 2>&1
    agent-browser eval "GOLDEN.start('$file')" >/dev/null 2>&1
    status=""
    for i in $(seq 1 240); do
      status="$(agent-browser eval "window.GOLDEN ? GOLDEN.status : 'noload'" 2>/dev/null | tr -d '"')"
      case "$status" in done|error) break ;; esac
      sleep 0.5
    done
    if [ "$status" = "done" ]; then ok=1; break; fi
    echo "  $file: attempt $attempt ended with '$status'" >&2
    agent-browser eval "window.GOLDEN ? GOLDEN.error : ''" >&2 2>/dev/null
    sleep 20   # the build may be mid-edit; give it a moment
  done
  if [ "$ok" != "1" ]; then echo "FAILED $file" >&2; fail=1; continue; fi
  notes="$(agent-browser eval "GOLDEN.notes.join('; ')" 2>/dev/null | tr -d '"')"
  sleep 0.3
  agent-browser screenshot "$TMP/$file.png" >/dev/null 2>&1
  if command -v magick >/dev/null 2>&1; then
    magick "$TMP/$file.png" -quality 88 "$OUT/$file.jpg"
  else
    sips -s format jpeg -s formatOptions 88 "$TMP/$file.png" --out "$OUT/$file.jpg" >/dev/null
  fi
  dims="$(sips -g pixelWidth -g pixelHeight "$OUT/$file.jpg" 2>/dev/null | awk '/pixel/ { printf "%s ", $2 }')"
  if [ "$dims" != "804 1748 " ]; then echo "  $file: wrong size ($dims), expected 804 1748" >&2; fail=1; fi
  echo "$OUT/$file.jpg${notes:+  [$notes]}"
done 3<<EOF
$PICK
EOF
agent-browser close >/dev/null 2>&1
rm -rf "$TMP"
exit $fail
