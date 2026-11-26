#!/bin/bash
# HUD screenshot matrix: every HUD state at every target size, with an automated check of the
# slot rectangles (overlaps, clipping, boxes under a notch or the home indicator, anything in the
# clear centre of a landscape screen, touch targets under 44 pt, an action budget over its cap)
# and contact sheets. The rules are docs/HUD.md's.
#
#   tools/hud-matrix.sh [state ...] [--url <base>] [--out <dir>] [--sizes <key,key>]
#
#   state    a state from tools/hud-matrix/states.js by name or number (default: all)
#   --url    base URL of a running build (default http://localhost:5174)
#   --out    output directory (default shots/hud/matrix, git-ignored)
#   --sizes  comma list of size keys (default: all of p402 l874 p375 l667 d1920)
#
# Sizes (CSS px; the insets are faked through ?safe-style CSS variables, as the target phones give them):
#   p402   402x874  portrait, iPhone 17 Pro (top 62, bottom 34)
#   l874   874x402  landscape (left 62, right 62, bottom 21; lefty state: notch on the right only)
#   p375   375x667  portrait, iPhone SE (top 20)
#   l667   667x375  landscape (no insets)
#   d1920  1920x1080 desktop, mouse and keyboard
#
# Each state is staged once (fresh save, seeded, fixed 60 Hz clock: tools/golden/init.js), then the
# viewport is changed live for every size, so the run also exercises the live re-layout.
# Writes <out>/<NN-state>/<size>.png, <out>/report.txt (one line per shot: layout, switch time,
# issues) and contact sheets <out>/sheet-<size>.jpg (tools/hud-matrix/sheets.py), with the unsafe
# bands tinted red and every overlap boxed in magenta.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$HERE")"
URL="http://localhost:5174"
OUT="$ROOT/shots/hud/matrix"
SIZES="p402,l874,p375,l667,d1920"
WANT=()
while [ $# -gt 0 ]; do
  case "$1" in
    --url) URL="${2%/}"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    --sizes) SIZES="$2"; shift 2 ;;
    -h|--help) sed -n '2,27p' "$0"; exit 0 ;;
    *) WANT+=("$1"); shift ;;
  esac
done

size_of() {   # key -> "w h scale safe opts"
  case "$1" in
    p402) echo "402 874 2 62,0,34,0 {}" ;;
    l874) echo "874 402 2 0,62,21,62 {}" ;;
    p375) echo "375 667 2 20,0,0,0 {}" ;;
    l667) echo "667 375 2 0,0,0,0 {}" ;;
    d1920) echo "1920 1080 1 0,0,0,0 {mouse:true}" ;;
    *) return 1 ;;
  esac
}

ALL="$(node -e '
  const src = require("fs").readFileSync(process.argv[1], "utf8");
  const s = new Function("window", src + "; return HM_STATES;")({});
  for (const x of s) console.log(String(x.n).padStart(2, "0") + "-" + x.name);
' "$HERE/hud-matrix/states.js")" || { echo "cannot read states.js" >&2; exit 1; }
PICK=""
if [ ${#WANT[@]} -eq 0 ]; then PICK="$ALL"
else
  for w in "${WANT[@]}"; do
    line="$(echo "$ALL" | awk -v w="$w" '{ i=index($0,"-"); id=substr($0,1,i-1); name=substr($0,i+1); if ($0==w || name==w || id+0==w+0) print }')"
    [ -z "$line" ] && { echo "no such state: $w" >&2; echo "$ALL" >&2; exit 1; }
    PICK="$PICK$line"$'\n'
  done
fi

export AGENT_BROWSER_SESSION="${HM_SESSION:-hud-matrix}"
export AGENT_BROWSER_INIT_SCRIPTS="$ROOT/tools/golden/init.js"
mkdir -p "$OUT"
REPORT="$OUT/report.txt"
: > "$REPORT.part"
agent-browser close >/dev/null 2>&1
agent-browser open "about:blank" >/dev/null 2>&1

poll() {   # poll <js expr> <want> [tries]
  local v
  for i in $(seq 1 "${3:-240}"); do
    v="$(agent-browser eval "$1" 2>/dev/null | tr -d '"')"
    case "$v" in "$2"|error) echo "$v"; return ;; esac
    sleep 0.5
  done
  echo "timeout"
}

IFS=',' read -r -a SIZE_KEYS <<< "$SIZES"
fail=0
while read -r file <&3; do
  [ -z "$file" ] && continue
  first="${SIZE_KEYS[0]}"; read -r w h sc safe opts <<< "$(size_of "$first")"
  ok=0
  for attempt in 1 2; do
    agent-browser set viewport "$w" "$h" "$sc" >/dev/null 2>&1
    agent-browser open "$URL/?golden&dev&q=medium" >/dev/null 2>&1
    sleep 1
    { echo '(() => {'; cat "$ROOT/tools/golden/lib.js" "$HERE/hud-matrix/states.js" "$HERE/hud-matrix/check.js"; echo '})()'; } | agent-browser eval --stdin >/dev/null 2>&1
    agent-browser eval "GOLDEN.start('$file')" >/dev/null 2>&1
    st="$(poll "window.GOLDEN ? GOLDEN.status : 'noload'" done)"
    if [ "$st" = "done" ]; then ok=1; break; fi
    echo "  $file: attempt $attempt ended with '$st'" >&2
    agent-browser eval "window.GOLDEN ? GOLDEN.error : ''" >&2 2>/dev/null
    sleep 20
  done
  if [ "$ok" != "1" ]; then echo "FAILED $file" >&2; fail=1; continue; fi
  mkdir -p "$OUT/$file"
  for key in "${SIZE_KEYS[@]}"; do
    read -r w h sc safe opts <<< "$(size_of "$key")" || { echo "no such size: $key" >&2; continue; }
    case "$file" in *lefty*)
      opts="${opts%\}}"; [ "$opts" = "{" ] && opts="{lefty:true}" || opts="$opts,lefty:true}"
      [ "$safe" = "0,62,21,62" ] && safe="0,62,21,0" ;;
    esac
    agent-browser set viewport "$w" "$h" "$sc" >/dev/null 2>&1
    agent-browser eval "HM.size($w, $h, '$safe', $opts)" >/dev/null 2>&1
    st="$(poll "window.HM ? HM.status : 'none'" ready 60)"
    [ "$st" != "ready" ] && echo "  $file $key: sizing ended with '$st'" >&2
    res="$(agent-browser eval "HM.check()" 2>/dev/null)"
    agent-browser screenshot "$OUT/$file/$key.png" >/dev/null 2>&1
    echo "$file $key $res" >> "$REPORT.part"
    n="$(echo "$res" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const r=JSON.parse(JSON.parse(s));console.log(r.layout+" "+r.ctx+": cluster "+r.cluster+"+"+r.chips+", "+r.touch+" touchable, "+r.issues.length+" issues"+(r.issues.length?" ("+r.issues.map(i=>i.kind+" "+i.what).join("; ")+")":"")+", re-laid in "+r.ms+" ms")}catch(e){console.log("?")}})')"
    echo "$file $key: $n"
  done
done 3<<EOF
$PICK
EOF
agent-browser close >/dev/null 2>&1
# keep the other states' lines from an earlier run
touch "$REPORT"
python3 - "$REPORT" "$REPORT.part" <<'PY'
import sys
rep, part = sys.argv[1], sys.argv[2]
new = [l for l in open(part) if l.strip()]
done = {l.split(' ', 1)[0] for l in new}
old = [l for l in open(rep) if l.strip() and l.split(' ', 1)[0] not in done]
open(rep, 'w').writelines(sorted(old + new))
PY
rm -f "$REPORT.part"
python3 "$HERE/hud-matrix/sheets.py" "$OUT" || fail=1
exit $fail
