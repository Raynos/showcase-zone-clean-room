#!/bin/bash
# Paint texture sources with the codex CLI's image tool.
#
#   tools/tex/gen.sh <name> [more names...] [--jobs 4] [--out <dir>]
#
# For each name, sends public/tex/prompts/<name>.txt on stdin to codex in a
# scratch directory and copies the resulting <name>.png to <out> (default
# shots/texsrc, which is git-ignored: the paintings are large and can be
# regenerated). One image takes two to five minutes. Then run
# tools/tex/bake.py <name> to make the shipped tile, and look at the 2x2
# tiling check it writes before accepting it.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$(dirname "$HERE")")"
OUT="$ROOT/shots/texsrc"
JOBS=4
WANT=()
while [ $# -gt 0 ]; do
  case "$1" in
    --out) OUT="$2"; shift 2 ;;
    --jobs) JOBS="$2"; shift 2 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) WANT+=("$1"); shift ;;
  esac
done
if [ ${#WANT[@]} -eq 0 ]; then sed -n '2,12p' "$0"; exit 1; fi
SCRATCH="${TEX_SCRATCH:-${TMPDIR:-/tmp}/tex-gen}"
mkdir -p "$OUT" "$SCRATCH"

if [ ${#WANT[@]} -gt 1 ]; then
  printf '%s\n' "${WANT[@]}" | xargs -P "$JOBS" -n 1 "$0" --out "$OUT"
  exit $?
fi

name="${WANT[0]}"
prompt="$ROOT/public/tex/prompts/$name.txt"
if [ ! -f "$prompt" ]; then echo "no prompt: $prompt" >&2; exit 1; fi
dir="$SCRATCH/$name.$$"
mkdir -p "$dir"
codex exec --skip-git-repo-check -s workspace-write -C "$dir" - < "$prompt" > "$dir/codex.log" 2>&1
if [ ! -f "$dir/$name.png" ]; then echo "$name: no image (see $dir/codex.log)" >&2; exit 1; fi
cp "$dir/$name.png" "$OUT/$name.png"
echo "$name: $(sips -g pixelWidth -g pixelHeight "$OUT/$name.png" | awk '/pixel/ {printf "%s ", $2}')-> $OUT/$name.png"
