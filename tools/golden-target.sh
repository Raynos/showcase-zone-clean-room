#!/bin/bash
# Golden targets: paint the "polished PS5 remaster" of a golden frame with the
# codex CLI's image tool (docs/AAA-PLAN.md section 3).
#
#   tools/golden-target.sh <NN-name> [more frames...] [--now <dir>] [--out <dir>]
#   tools/golden-target.sh all [--jobs 4]
#
# For each frame: copies <now>/NN-name.jpg to a scratch directory as golden.png,
# sends the prompt from tools/golden/prompt.py on stdin (-i swallows every
# following argument, so the prompt cannot be an argument), and saves the result
# as <out>/NN-name.jpg at 804x1748. Defaults: docs/golden/now, docs/golden/target.
# One image takes about four minutes. Scratch goes under $GOLDEN_SCRATCH
# (default: a temp directory); each run keeps its codex log there.
#
# Always look at the result. Reject and re-run any target that moved the camera,
# dropped or garbled the HUD, changed the palette or went photorealistic.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$HERE")"
NOW="$ROOT/docs/golden/now"
OUT="$ROOT/docs/golden/target"
JOBS=4
WANT=()
while [ $# -gt 0 ]; do
  case "$1" in
    --now) NOW="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    --jobs) JOBS="$2"; shift 2 ;;
    -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
    *) WANT+=("$1"); shift ;;
  esac
done
if [ ${#WANT[@]} -eq 0 ]; then sed -n '2,17p' "$0"; exit 1; fi
SCRATCH="${GOLDEN_SCRATCH:-${TMPDIR:-/tmp}/golden-target}"
mkdir -p "$OUT" "$SCRATCH"

if [ "${WANT[0]}" = "all" ]; then
  ls "$NOW" | sed -n 's/\.jpg$//p' | xargs -P "$JOBS" -n 1 "$0" --now "$NOW" --out "$OUT"
  exit $?
fi

fail=0
for frame in "${WANT[@]}"; do
  frame="${frame%.jpg}"
  src="$NOW/$frame.jpg"
  if [ ! -f "$src" ]; then echo "no such frame: $src" >&2; fail=1; continue; fi
  if [ ! -f "$HERE/golden/prompts/$frame.txt" ]; then echo "no prompt for $frame" >&2; fail=1; continue; fi
  dir="$SCRATCH/$frame.$$"
  mkdir -p "$dir"
  sips -s format png "$src" --out "$dir/golden.png" >/dev/null
  python3 "$HERE/golden/prompt.py" "$frame" > "$dir/prompt.txt"
  codex exec --skip-git-repo-check -s workspace-write -C "$dir" -i "$dir/golden.png" - < "$dir/prompt.txt" > "$dir/codex.log" 2>&1
  if [ ! -f "$dir/mockup.png" ]; then echo "FAILED $frame (no mockup.png; see $dir/codex.log)" >&2; fail=1; continue; fi
  dims="$(sips -g pixelWidth -g pixelHeight "$dir/mockup.png" | awk '/pixel/ { printf "%s ", $2 }')"
  # the model paints at its own size; fit to the golden size without distortion
  # (scale to cover 804x1748, then crop the overflow evenly)
  if command -v magick >/dev/null 2>&1; then
    magick "$dir/mockup.png" -resize '804x1748^' -gravity center -extent 804x1748 -quality 88 "$OUT/$frame.jpg"
  else
    sips -z 1748 804 -s format jpeg -s formatOptions 88 "$dir/mockup.png" --out "$OUT/$frame.jpg" >/dev/null
  fi
  echo "$OUT/$frame.jpg  (painted at $dims)"
done
exit $fail
