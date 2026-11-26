#!/usr/bin/env python3
"""Contact sheets for tools/hud-matrix.sh.

    python3 tools/hud-matrix/sheets.py <out dir>

Reads <out>/report.txt and <out>/<NN-state>/<size>.png and writes:
  sheet-<size>.jpg    every state at one size, the unsafe bands tinted red, each overlap boxed in
                      magenta, the issue count under each frame
  issues.txt          every issue, grouped by size and state
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

INK, PAPER, DIM, RED, MAG, OK = (236, 238, 242), (16, 18, 22), (150, 158, 170), (255, 90, 60), (255, 60, 230), (125, 255, 176)
ORDER = ['p402', 'l874', 'p375', 'l667', 'd1920']


def font(size, bold=False):
    for path, index in (('/System/Library/Fonts/HelveticaNeue.ttc', 1 if bold else 0), ('/System/Library/Fonts/Helvetica.ttc', 0)):
        try:
            return ImageFont.truetype(path, size, index=index)
        except Exception:
            continue
    return ImageFont.load_default()


def main():
    out = sys.argv[1]
    rep = {}
    for line in open(os.path.join(out, 'report.txt')):
        parts = line.strip().split(' ', 2)
        if len(parts) < 3:
            continue
        try:
            r = json.loads(json.loads(parts[2]))
        except Exception:
            r = None
        rep[(parts[0], parts[1])] = r
    states = sorted({s for s, _ in rep})
    sizes = [k for k in ORDER if any(k == z for _, z in rep)]
    lines = []
    for size in sizes:
        tiles = []
        for st in states:
            p = os.path.join(out, st, size + '.png')
            r = rep.get((st, size))
            if not os.path.exists(p) or not r:
                continue
            im = Image.open(p).convert('RGB')
            k = im.width / r['w']
            ov = Image.new('RGBA', im.size, (0, 0, 0, 0))
            d = ImageDraw.Draw(ov)
            s = r['safe']
            for box in ((0, 0, im.width, s['t'] * k), (0, im.height - s['b'] * k, im.width, im.height), (0, 0, s['l'] * k, im.height), (im.width - s['r'] * k, 0, im.width, im.height)):
                if box[2] > box[0] and box[3] > box[1]:
                    d.rectangle(box, fill=(255, 40, 20, 46))
            if r['layout'] != 'portrait':
                d.rectangle((im.width / 3, im.height / 3, im.width * 2 / 3, im.height * 2 / 3), outline=(94, 240, 255, 90), width=max(1, int(k)))
            for i in r['issues']:
                if i['kind'] == 'overlap' and 'at' in i:
                    x, y, w, h = i['at']
                    d.rectangle((x * k - 2, y * k - 2, (x + w) * k + 2, (y + h) * k + 2), outline=MAG + (255,), width=max(2, int(2 * k)))
            im = Image.alpha_composite(im.convert('RGBA'), ov).convert('RGB')
            tiles.append((st, r, im))
            lines.append(f'{size} {st} [{r["layout"]}, {r["ms"]} ms]')
            for i in r['issues']:
                lines.append('    ' + i['kind'] + ': ' + i['what'] + (f' ({i["px"]} px)' if 'px' in i else '') + (f' at {i["at"]}' if 'at' in i and i['kind'] != 'overlap' else ''))
        if not tiles:
            continue
        # tile width: phone frames at their CSS size, the desktop at half
        r0 = tiles[0][1]
        tw = r0['w'] if r0['w'] < 1000 else r0['w'] // 2
        th = round(tw * tiles[0][2].height / tiles[0][2].width)
        cols = 5 if tw < 500 else 3 if tw < 1000 else 2
        rows = (len(tiles) + cols - 1) // cols
        head, gap = 30, 8
        sheet = Image.new('RGB', (cols * (tw + gap) + gap, rows * (th + head + gap) + gap), PAPER)
        d = ImageDraw.Draw(sheet)
        f1, f2 = font(15, True), font(12)
        for n, (st, r, im) in enumerate(tiles):
            c, rr = n % cols, n // cols
            x, y = gap + c * (tw + gap), gap + rr * (th + head + gap)
            bad = [i for i in r['issues'] if i['kind'] in ('overlap', 'clipped', 'unsafe', 'middle')]
            d.text((x, y + 1), st, fill=INK, font=f1)
            d.text((x, y + 17), f'{r["layout"]} · {len(bad)} issue{"s" if len(bad) != 1 else ""}' + (f' · {len(r["issues"]) - len(bad)} small' if len(r['issues']) > len(bad) else ''), fill=RED if bad else OK, font=f2)
            sheet.paste(im.resize((tw, th), Image.LANCZOS), (x, y + head))
        p = os.path.join(out, f'sheet-{size}.jpg')
        sheet.save(p, quality=88)
        print(p)
    open(os.path.join(out, 'issues.txt'), 'w').write('\n'.join(lines) + '\n')
    print(os.path.join(out, 'issues.txt'))


if __name__ == '__main__':
    main()
