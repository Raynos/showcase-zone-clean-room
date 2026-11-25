#!/usr/bin/env python3
"""usage: tools/wbsheet.py a b c ...  -> shots/westB/sheet.png (side-by-side at 402x874 each)"""
import sys
from PIL import Image
names = sys.argv[1:]
ims = [Image.open(f'shots/westB/{n}.png').resize((402, 874)) for n in names]
w = Image.new('RGB', (402 * len(ims), 874))
for i, im in enumerate(ims):
    w.paste(im, (402 * i, 0))
w.save('shots/westB/sheet.png')
