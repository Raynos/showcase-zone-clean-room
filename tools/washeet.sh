#!/bin/bash
# usage: tools/washeet.sh out a b c d  -> shots/westA/out.png contact sheet
cd "$(dirname "$0")/../shots/westA" && python3 - "$@" <<'PY'
import sys
from PIL import Image
out=sys.argv[1]; names=sys.argv[2:]
ims=[Image.open(n+'.png').resize((402,874)) for n in names]
w=Image.new('RGB',(402*len(ims),874))
for i,im in enumerate(ims): w.paste(im,(402*i,0))
w.save(out+'.png')
PY
