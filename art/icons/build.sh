#!/bin/sh
# Painted icon atlases for the panels: public/icons/items.webp and public/icons/gear.webp.
#
# Each source sheet is one 1024x1024 painting of a 4x4 grid on a flat #181c23 ground, made with
#   codex exec --skip-git-repo-check -s workspace-write -C <dir> -i ref.png - < items.prompt.txt
# (ref.png is a crop of the tile grid in docs/golden/target/24-*.png). This script keys the ground
# out to alpha by flood fill from the corner, softens the cut edge, and writes a 768x768 atlas
# (192 px cells, enough for a 64 px tile at 3x). Cell order is in src/ui/panels/common.ts (ART).
#
#   art/icons/build.sh <items-sheet.png> <gear-sheet.png>
set -e
cd "$(dirname "$0")/../.."
key() {
  magick "$1" -alpha set -bordercolor '#181c23' -border 2 -fuzz 7% -fill none -draw 'alpha 0,0 floodfill' -shave 2x2 \
    -channel A -blur 0x0.8 -level 35%,100% +channel -resize 768x768 -define webp:alpha-quality=90 -quality 86 "$2"
}
key "$1" public/icons/items.webp
key "$2" public/icons/gear.webp
ls -la public/icons
