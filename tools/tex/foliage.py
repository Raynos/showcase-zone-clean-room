# /// script
# requires-python = ">=3.10"
# dependencies = ["numpy", "pillow"]
# ///
"""Turns the painted foliage sheet into the cut-out atlas the trees are built from.

    uv run tools/tex/foliage.py [--src shots/texsrc/foliage.png]

The sheet (tools/tex/gen.sh foliage; prompt in public/tex/prompts/foliage.txt)
is four clumps on flat magenta in a 2x2 grid: leaf clump, looser leaf clump,
conifer bough, shrub tuft. This keys out the magenta, replaces the colour of
every edge and background pixel with the colour of the foliage beside it (so
no pink fringe survives filtering), crops each clump to its own square and
writes public/tex/foliage.webp, 1024x1024 RGBA with one clump per 512 cell in
the same order. shots/texcheck/foliage.jpg shows the result over dark and
light grounds: look for fringes and holes before accepting it.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
CELL = 512
MARGIN = 0.035


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def blur(a: np.ndarray, r: float) -> np.ndarray:
    im = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))
    return np.asarray(im.filter(ImageFilter.GaussianBlur(r))).astype(np.float64) / 255


def main() -> None:
    args = sys.argv[1:]
    src = os.path.join(ROOT, "shots", "texsrc", "foliage.png")
    if "--src" in args:
        src = args[args.index("--src") + 1]
    im = Image.open(src).convert("RGB")
    a = np.asarray(im).astype(np.float64) / 255
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    # magenta is high red and blue with no green; no leaf colour comes near it
    key = np.minimum(r, b) - g
    alpha = 1 - smooth(0.12, 0.42, key)
    # colour for everything that is not solidly foliage: the foliage nearby, spread outward
    solid = (alpha > 0.97).astype(np.float64)
    fill = a * solid[..., None]
    wsum = solid.copy()
    rgb = a.copy()
    known = solid.copy()
    for rad in (1.5, 3, 6, 12, 24, 48, 96):
        num = np.stack([blur(fill[..., c], rad) for c in range(3)], axis=-1)
        den = blur(wsum, rad)
        est = num / np.maximum(den, 1e-4)[..., None]
        take = (known < 0.5) & (den > 0.02)
        rgb[take] = est[take]
        known[take] = 1
    rgba = np.dstack([rgb, alpha])
    h, w = alpha.shape
    out = np.zeros((CELL * 2, CELL * 2, 4))
    for cell in range(4):
        cx, cy = cell % 2, cell // 2
        q = rgba[cy * h // 2:(cy + 1) * h // 2, cx * w // 2:(cx + 1) * w // 2]
        ys, xs = np.where(q[..., 3] > 0.5)
        x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        side = int(max(x1 - x0, y1 - y0) * (1 + 2 * MARGIN))
        mx, my = (x0 + x1) // 2, (y0 + y1) // 2
        # the bough hangs from its twig: keep the twig at the top edge, centred
        if cell == 2:
            top = np.where(q[y0:y0 + 6, :, 3] > 0.5)[1]
            mx = int(top.mean())
            side = int(max(2 * max(mx - x0, x1 - mx), y1 - y0) * (1 + 2 * MARGIN))
            my = y0 + side // 2 - int(side * MARGIN * 0.5)
        sq = np.zeros((side, side, 4))
        sq[..., :3] = q[ys, xs, :3].mean(axis=0)
        sx0, sy0 = mx - side // 2, my - side // 2
        ax0, ay0 = max(0, sx0), max(0, sy0)
        ax1, ay1 = min(q.shape[1], sx0 + side), min(q.shape[0], sy0 + side)
        sq[ay0 - sy0:ay1 - sy0, ax0 - sx0:ax1 - sx0] = q[ay0:ay1, ax0:ax1]
        tile = Image.fromarray((np.clip(sq, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA").resize((CELL, CELL), Image.LANCZOS)
        out[cy * CELL:(cy + 1) * CELL, cx * CELL:(cx + 1) * CELL] = np.asarray(tile).astype(np.float64) / 255
    res = Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA")
    dst = os.path.join(ROOT, "public", "tex", "foliage.webp")
    res.save(dst, "WEBP", quality=90, alpha_quality=100, method=6, exact=True)
    back = Image.open(dst).convert("RGBA")
    check = Image.new("RGB", (CELL * 4, CELL * 2))
    for i, colour in enumerate(((24, 30, 44), (236, 232, 220))):
        bg = Image.new("RGBA", back.size, colour + (255,))
        # as the game cuts it: hard at half alpha
        cut = back.copy()
        cut.putalpha(back.getchannel("A").point(lambda v: 255 if v >= 128 else 0))
        check.paste(Image.alpha_composite(bg, cut).convert("RGB"), (i * CELL * 2, 0))
    os.makedirs(os.path.join(ROOT, "shots", "texcheck"), exist_ok=True)
    check.resize((CELL * 2, CELL)).save(os.path.join(ROOT, "shots", "texcheck", "foliage.jpg"), quality=90)
    print(f"foliage: {os.path.getsize(dst) // 1024} KB -> {dst}")


if __name__ == "__main__":
    main()
