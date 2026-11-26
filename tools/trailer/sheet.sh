#!/bin/bash
# A contact sheet of one recorded shot: every n-th frame (default 6, a fifth of a second), small.
#   tools/trailer/sheet.sh <frames dir>/<shot>-l <out.jpg> [n]
set -u
DIR="$1"; OUT="$2"; N="${3:-6}"
case "$DIR" in *-p) S=180; C=8 ;; *) S=320; C=5 ;; esac
ffmpeg -loglevel error -y -framerate 30 -i "$DIR/%05d.jpg" \
  -vf "select='not(mod(n\,$N))',scale=$S:-1,tile=${C}x4" \
  -frames:v 1 -update 1 "$OUT"
