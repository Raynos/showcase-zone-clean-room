#!/usr/bin/env python3
"""Side-by-side sheets for the golden frames.

    python3 tools/golden/sheets.py [--now DIR] [--target DIR] [--out DIR]

Writes, into docs/golden/sheets by default:
  NN-name.jpg      one frame, "now" on the left and "target" on the right
  overview-N.jpg   contact sheets of every pair, small enough to read at a glance

Use --now to compare a fresh re-shoot against the targets, for example
    tools/golden.sh all --out shots/now && \
    python3 tools/golden/sheets.py --now shots/now --out shots/sheets
"""
import argparse
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
INK, PAPER, DIM, ORANGE, CYAN = (236, 238, 242), (16, 18, 22), (150, 158, 170), (242, 138, 46), (63, 227, 255)


def font(size, bold=False):
    for path, index in (('/System/Library/Fonts/HelveticaNeue.ttc', 1 if bold else 0), ('/System/Library/Fonts/Helvetica.ttc', 1 if bold else 0),
                        ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 0)):
        try:
            return ImageFont.truetype(path, size, index=index)
        except Exception:
            continue
    return ImageFont.load_default()


def fit(im, w):
    return im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)


def pair(now, target, w, title, head, gap=6):
    """One labelled pair: title bar, then now | target at width w each."""
    a = fit(now, w)
    b = fit(target, w) if target else None
    h = a.height
    out = Image.new('RGB', (w * 2 + gap, h + head), PAPER)
    d = ImageDraw.Draw(out)
    big = head >= 40
    f1, f2 = font(22 if big else 13, True), font(15 if big else 10, True)
    d.text((8 if big else 4, 6 if big else 2), title, fill=INK, font=f1)
    ly = head - (20 if big else 12)
    d.text((8 if big else 4, ly), 'NOW', fill=ORANGE, font=f2)
    d.text((w + gap + (8 if big else 4), ly), 'TARGET', fill=CYAN, font=f2)
    out.paste(a, (0, head))
    if b:
        out.paste(b.crop((0, 0, w, h)) if b.height >= h else b, (w + gap, head))
    else:
        d.text((w + gap + 12, head + 20), 'no target yet', fill=DIM, font=f2)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--now', default=os.path.join(ROOT, 'docs/golden/now'))
    ap.add_argument('--target', default=os.path.join(ROOT, 'docs/golden/target'))
    ap.add_argument('--out', default=os.path.join(ROOT, 'docs/golden/sheets'))
    ap.add_argument('--per-sheet', type=int, default=12)
    ap.add_argument('--cols', type=int, default=4)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    names = sorted(f[:-4] for f in os.listdir(a.now) if f.endswith('.jpg'))
    if not names:
        sys.exit('no frames in ' + a.now)
    small = []
    for n in names:
        now = Image.open(os.path.join(a.now, n + '.jpg')).convert('RGB')
        tp = os.path.join(a.target, n + '.jpg')
        target = Image.open(tp).convert('RGB') if os.path.exists(tp) else None
        title = n.replace('-', ' ', 1).replace('-', ' ')
        pair(now, target, 804, title, 64, 12).save(os.path.join(a.out, n + '.jpg'), quality=86)
        small.append(pair(now, target, 216, title, 34, 4))
    for old in os.listdir(a.out):
        if old.startswith('overview-'):
            os.remove(os.path.join(a.out, old))
    pad = 14
    sheets = [small[i:i + a.per_sheet] for i in range(0, len(small), a.per_sheet)]
    # keep a lone straggler (the 24b extra) on the last sheet rather than alone
    if len(sheets) > 1 and len(sheets[-1]) <= 2:
        sheets[-2].extend(sheets.pop())
    for i, tiles in enumerate(sheets):
        tw, th = tiles[0].size
        rows = (len(tiles) + a.cols - 1) // a.cols
        sheet = Image.new('RGB', (a.cols * (tw + pad) + pad, rows * (th + pad) + pad), (6, 7, 9))
        for k, t in enumerate(tiles):
            sheet.paste(t, (pad + (k % a.cols) * (tw + pad), pad + (k // a.cols) * (th + pad)))
        p = os.path.join(a.out, 'overview-%d.jpg' % (i + 1))
        sheet.save(p, quality=84)
        print(p, sheet.size)
    print('%d pair sheets in %s' % (len(names), a.out))


if __name__ == '__main__':
    main()
