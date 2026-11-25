# /// script
# requires-python = ">=3.10"
# dependencies = ["numpy", "pillow"]
# ///
"""Turns a painted texture source into the tile the game ships.

    uv run tools/tex/bake.py <name> [more names...] [--src shots/texsrc]
    uv run tools/tex/bake.py all

For each name: reads <src>/<name>.png (painted by tools/tex/gen.sh), evens out
large light and dark patches so the repeat is harder to spot, closes whatever
mismatch is left across the wrap edges, scales to SIZE and writes
public/tex/<name>.webp. Also writes shots/texcheck/<name>.jpg, a 3x3 tiling of
the result: look at it before accepting a texture. A seam you can find there
will be found in the game.

Per-texture settings are in SPEC below: 'wrap' is how the edges are closed
('diff' spreads the edge mismatch into a band on each side when the painting
does not already wrap, right for one that nearly tiles; 'blend' cross-fades the image over itself,
right for stochastic surfaces that do not; 'none' for single faces such as a
crate side), 'even' is how strongly large-scale brightness is flattened.
"""
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, "public", "tex")
CHECK = os.path.join(ROOT, "shots", "texcheck")
SIZE = 512
WORK = 1024

SPEC = {
    "crate": dict(wrap="none", even=0.0),
    "crate2": dict(wrap="none", even=0.0),
    "metal": dict(wrap="diff", even=0.3),
    "panel": dict(wrap="diff", even=0.3),
    "dirt": dict(wrap="diff", even=0.8),
    "sand": dict(wrap="diff", even=0.8),
    "gravel": dict(wrap="diff", even=0.8),
    "grassground": dict(wrap="diff", even=0.8),
    "leaflitter": dict(wrap="diff", even=0.5),
}
DEFAULT = dict(wrap="diff", even=0.6, quality=90)


def blur_wrap(a: np.ndarray, sigma: float) -> np.ndarray:
    """Gaussian blur with wrap-around edges, done in the frequency domain."""
    h, w = a.shape[:2]
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.fftfreq(w)[None, :]
    g = np.exp(-2 * (np.pi * sigma) ** 2 * (fx * fx + fy * fy))
    if a.ndim == 2:
        return np.real(np.fft.ifft2(np.fft.fft2(a) * g))
    return np.stack([np.real(np.fft.ifft2(np.fft.fft2(a[..., c]) * g)) for c in range(a.shape[2])], axis=-1)


def even_out(img: np.ndarray, k: float) -> np.ndarray:
    """Divide out brightness and colour drift larger than about a third of the tile."""
    if k <= 0:
        return img
    low = blur_wrap(img, img.shape[0] / 5.0)
    mean = img.reshape(-1, 3).mean(axis=0)
    gain = (mean[None, None, :] / np.maximum(low, 1e-3)) ** k
    return np.clip(img * gain, 0, 1)


def close_diff(img: np.ndarray, band: int) -> np.ndarray:
    """Spread the step across each wrap edge into a band on both sides of it."""
    out = img.copy()
    for axis in (0, 1):
        a = np.moveaxis(out, axis, 0)
        # the step between the last row and the first, less the step a continuous image would have
        step = a[0] - a[-1]
        natural = 0.5 * ((a[1] - a[0]) + (a[-1] - a[-2]))
        d = step - natural
        # only the smooth part of the mismatch: sharp detail that differs is left alone
        d = blur_wrap(d[None, ...].repeat(2, axis=0), 3.0)[0] if d.ndim == 2 else d
        t = (1 - np.arange(band) / band) ** 2
        for i in range(band):
            a[i] -= 0.5 * d * t[i]
            a[-1 - i] += 0.5 * d * t[i]
    return np.clip(out, 0, 1)


def close_blend(img: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Cross-fade the image with itself shifted by half a tile, through a noisy mask."""
    h, w = img.shape[:2]
    shifted = np.roll(img, (h // 2, w // 2), axis=(0, 1))
    y = np.abs(np.arange(h) / h - 0.5)[:, None] * 2
    x = np.abs(np.arange(w) / w - 0.5)[None, :] * 2
    edge = np.maximum(x, y)  # 1 at the wrap edges of the original
    noise = blur_wrap(rng.random((h, w)), 6.0)
    noise = (noise - noise.min()) / (noise.max() - noise.min())
    m = np.clip((edge - 0.62 + (noise - 0.5) * 0.35) / 0.2, 0, 1)
    m = (m * m * (3 - 2 * m))[..., None]
    return img * (1 - m) + shifted * m


def seam_error(img: np.ndarray) -> float:
    """Mean colour step across the wrap edges relative to the mean step between neighbours."""
    ex = np.abs(img[:, 0] - img[:, -1]).mean() + np.abs(img[0] - img[-1]).mean()
    ix = np.abs(np.diff(img, axis=1)).mean() + np.abs(np.diff(img, axis=0)).mean()
    return float(ex / max(ix, 1e-6))


def bake(name: str, src_dir: str) -> None:
    spec = {**DEFAULT, **SPEC.get(name, {})}
    src = os.path.join(src_dir, name + ".png")
    im = Image.open(src).convert("RGB")
    if im.size != (WORK, WORK):
        s = min(im.size)
        l, t = (im.size[0] - s) // 2, (im.size[1] - s) // 2
        im = im.crop((l, t, l + s, t + s)).resize((WORK, WORK), Image.LANCZOS)
    a = np.asarray(im).astype(np.float64) / 255.0
    before = seam_error(a)
    if spec["wrap"] != "none":
        a = even_out(a, spec["even"])
        if spec["wrap"] == "blend":
            a = close_blend(a, np.random.default_rng(7))
        if spec["wrap"] == "blend" or before > 1.15:
            a = close_diff(a, 40)
    after = seam_error(a)
    out = Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8)).resize((SIZE, SIZE), Image.LANCZOS)
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(CHECK, exist_ok=True)
    dst = os.path.join(OUT, name + ".webp")
    out.save(dst, "WEBP", quality=spec["quality"], method=6)
    sheet = Image.new("RGB", (SIZE * 3 // 2, SIZE * 3 // 2))
    small = Image.open(dst).convert("RGB").resize((SIZE // 2, SIZE // 2), Image.LANCZOS)
    for j in range(3):
        for i in range(3):
            sheet.paste(small, (i * SIZE // 2, j * SIZE // 2))
    sheet.save(os.path.join(CHECK, name + ".jpg"), quality=90)
    print(f"{name}: seam {before:.2f} -> {after:.2f} (1.0 = no worse than inside the image), {os.path.getsize(dst) // 1024} KB")


if __name__ == "__main__":
    args = sys.argv[1:]
    src_dir = os.path.join(ROOT, "shots", "texsrc")
    if "--src" in args:
        i = args.index("--src")
        src_dir = args[i + 1]
        del args[i:i + 2]
    if not args:
        print(__doc__)
        sys.exit(1)
    if args == ["all"]:
        args = sorted(f[:-4] for f in os.listdir(src_dir) if f.endswith(".png"))
    for n in args:
        bake(n, src_dir)
