"""
The texture painter. Takes the UV-space G-buffer from bake.py and paints the model's albedo the
way a texture artist would on a stylised game asset: occlusion in every joint, a thin light
bevel on every hard edge, paint chipped to bare metal, grime under overhangs, plank grain,
brushed steel. Everything is evaluated per texel from 3D position, so nothing shows a UV seam.

Output (H, W, 4), sRGB:
  rgb  painted colour. On tinted slots it is a near-white value map the runtime multiplies by
       the palette colour; on 'fixed' faces it is the final colour.
  a    paint coverage: 1 = tinted paint, ~0 = chipped to bare metal (untinted, metallic).
Stored values are scaled by HEADROOM so highlights have room above neutral; the runtime
multiplies vertex tints by 1 / HEADROOM.
"""
import numpy as np

from .kit import SURF, SLOTS

HEADROOM = 0.8


# ---- noise ---------------------------------------------------------------------------------
def _hash(ix, iy, iz, seed):
    h = (ix.astype(np.int64) * 374761393) ^ (iy.astype(np.int64) * 668265263) ^ (iz.astype(np.int64) * 2147483647) ^ (seed * 1442695041)
    h = (h ^ (h >> 13)) * 1274126177
    h = h & 0xffffffff
    h = (h ^ (h >> 16)) & 0xffffffff
    return h.astype(np.float64) / 4294967296.0


def vnoise(P, freq, seed=0):
    """Value noise at points P (..., 3) scaled by freq (scalar or 3-vector). 0..1."""
    Q = P * np.asarray(freq, dtype=np.float64)
    I = np.floor(Q)
    F = Q - I
    U = F * F * (3 - 2 * F)
    ix, iy, iz = I[..., 0], I[..., 1], I[..., 2]
    out = 0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (U[..., 0] if dx else 1 - U[..., 0]) * (U[..., 1] if dy else 1 - U[..., 1]) * (U[..., 2] if dz else 1 - U[..., 2])
                out = out + w * _hash(ix + dx, iy + dy, iz + dz, seed)
    return out


def fbm(P, freq, octaves=4, seed=0, gain=0.5):
    amp, tot, out = 0.5, 0.0, 0
    f = np.asarray(freq, dtype=np.float64) * np.ones(3)
    for o in range(octaves):
        out = out + amp * vnoise(P, f, seed + o * 17)
        tot += amp; amp *= gain; f = f * 2.03
    return out / tot


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a + 1e-12), 0, 1)
    return t * t * (3 - 2 * t)


def lin(c):
    c = np.asarray(c, dtype=np.float64)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def hexlin(h):
    return lin(np.array([((h >> 16) & 255) / 255.0, ((h >> 8) & 255) / 255.0, (h & 255) / 255.0]))


DEFAULTS = dict(
    scale=1.0,          # model size factor: detail frequencies and edge widths divide by this
    ao_min=0.34,        # darkest occlusion multiplier
    ao_gamma=1.25,
    edge_w=0.010,       # light bevel width, metres
    edge_gain=0.30,
    chip=1.0,           # paint chipping amount
    grime=1.0,
    top_light=0.10,
    wear=1.0,
)


def paint(gb, **cfg):
    c = dict(DEFAULTS); c.update(cfg)
    S = c['scale']
    P = gb['pos'].astype(np.float64) / S
    Nn = gb['nor'].astype(np.float64)
    ao_s = np.clip(gb['ao'][..., 0], 0, 1).astype(np.float64)
    ao_l = np.clip(gb['ao'][..., 1], 0, 1).astype(np.float64)
    edge_in = np.clip(gb['ao'][..., 2], 0, 1).astype(np.float64)
    tco = gb['tco'].astype(np.float64) / S
    tsz = gb['tsz'].astype(np.float64) / S
    col = lin(np.clip(gb['col'].astype(np.float64), 0, 1))
    surf = np.rint(gb['ids'][..., 0]).astype(np.int32)
    slot = np.rint(gb['ids'][..., 1]).astype(np.int32)
    pid = np.rint(gb['pinfo'][..., 0]).astype(np.int64)
    ptype = np.rint(gb['pinfo'][..., 1]).astype(np.int32)
    H, W = surf.shape
    tinted = slot != SLOTS.index('fixed')

    # ---- distance to the nearest hard edge of the primitive, metres ----------------------
    m = tsz - np.abs(tco)                         # distance to each pair of box faces
    ms = np.sort(m, axis=-1)
    d_box = np.maximum(ms[..., 1], 0)
    rad = np.sqrt(tco[..., 0] ** 2 + tco[..., 2] ** 2)
    d_cyl = np.maximum(np.maximum(tsz[..., 1] - np.abs(tco[..., 1]), 0), np.maximum(tsz[..., 0] - rad, 0) * (np.abs(tco[..., 1]) > tsz[..., 1] * 0.98))
    d_other = smooth(0.25, 0.9, edge_in) * 0.05   # no analytic edges: fall back to the thickness probe
    d_edge = np.where(ptype == 0, d_box, np.where(ptype == 1, d_cyl, d_other))
    # which local axis the face looks along, and the primitive's long axis (for grain)
    face_ax = np.argmin(m, axis=-1)
    long_ax = np.argmax(tsz, axis=-1)

    n_macro = fbm(P, 2.3, 3, 11)
    n_mid = fbm(P, 9.0, 4, 23)
    n_fine = fbm(P, 46.0, 3, 37)
    n_chip = fbm(P, 30.0, 4, 51)
    prim_tone = _hash(pid, pid * 0 + 7, pid * 0 + 3, 5)

    # ---- shared shading ------------------------------------------------------------------
    ao = np.minimum(ao_s, ao_l * 0.5 + 0.5) ** c['ao_gamma']
    shade = c['ao_min'] + (1 - c['ao_min']) * ao
    # coloured shadow: occlusion leans blue-violet, never grey
    sh_tint = np.stack([0.80 + 0.20 * ao, 0.84 + 0.16 * ao, 1.0 + 0.0 * ao], axis=-1)
    top = 1.0 + c['top_light'] * Nn[..., 1] - 0.04 * (Nn[..., 1] < -0.5)
    ew = c['edge_w']
    edge_hi = (1 - smooth(ew * 0.25, ew, d_edge)) * (ao_s > 0.55)

    mul = np.ones((H, W, 3))
    base = np.where(tinted[..., None], 1.0, col)
    alpha = np.ones((H, W))
    out = np.zeros((H, W, 3))

    def is_(name):
        return surf == SURF[name]

    val = np.ones((H, W))        # scalar value variation
    hue = np.ones((H, W, 3))     # colour shifts
    hi = np.zeros((H, W))        # additive highlight

    # ---- painted metal -------------------------------------------------------------------
    pm = is_('paint') | is_('stripe')
    val = np.where(pm, 0.94 + 0.12 * (n_macro - 0.5) + 0.05 * (n_mid - 0.5), val)
    hi = np.where(pm, edge_hi * c['edge_gain'], hi)
    # hazard stripes: diagonal bands across the face
    st = is_('stripe')
    a2 = np.where(face_ax[..., None] == 0, tco[..., [2, 1]], np.where(face_ax[..., None] == 1, tco[..., [0, 2]], tco[..., [0, 1]]))
    band = np.sin((a2[..., 0] + a2[..., 1]) * 62.0)
    dark_band = st & (band > 0)
    base = np.where(dark_band[..., None], hexlin(0x1d1f24), base)
    # chips: along edges, eaten by noise; a few scratches in the open
    chip_w = 0.016 * c['chip']
    chip_e = smooth(0.0, 1.0, (chip_w * (0.25 + 1.5 * n_chip) - d_edge) / (chip_w * 0.5)) * (n_chip > 0.36)
    scratch = (fbm(P * np.array([1.0, 6.0, 1.0]), 28.0, 2, 71) > 0.80) & (n_mid > 0.52)
    chip = np.clip(chip_e + scratch * 0.85 * c['chip'], 0, 1) * pm * (ao_s > 0.35)
    # grime: collects where long-range occlusion is low, and runs down vertical faces
    streak = fbm(P * np.array([1.0, 0.16, 1.0]), 34.0, 3, 91)
    vert = 1 - np.abs(Nn[..., 1])
    grime = np.clip((1 - ao_l) * 1.5 + (streak - 0.52) * 1.5 * vert, 0, 1) * (0.5 + 0.9 * n_mid) * c['grime']
    grime = np.clip(grime, 0, 0.85)
    gcol = np.array([0.42, 0.34, 0.27])

    # ---- bare metal ----------------------------------------------------------------------
    bm_ = is_('metal')
    lv = np.take_along_axis(tco, long_ax[..., None], axis=-1)[..., 0]
    brushed = fbm(P * np.where(long_ax[..., None] == np.arange(3), 0.2, 1.0), 60.0, 2, 3)
    val = np.where(bm_, 0.86 + 0.16 * (brushed - 0.5) + 0.10 * (n_macro - 0.5), val)
    hi = np.where(bm_, edge_hi * (c['edge_gain'] + 0.12), hi)
    pit = (n_fine > 0.72) & (n_mid < 0.45)
    val = np.where(bm_ & pit, val * 0.78, val)

    # ---- wood ----------------------------------------------------------------------------
    wd = is_('wood') | is_('endgrain')
    gfreq = np.where(long_ax[..., None] == np.arange(3), 3.0, 90.0)
    grain = fbm(tco + pid[..., None] * 0.37, gfreq, 3, 13)
    ring = np.sin((np.sqrt(np.sum(np.where(face_ax[..., None] == np.arange(3), 0, tco) ** 2, axis=-1)) * 240.0) + n_mid * 5.0)
    endg = (wd & (face_ax == long_ax)) | is_('endgrain')
    wtone = 0.86 + 0.24 * (prim_tone - 0.5)
    wval = wtone * (0.90 + 0.22 * (grain - 0.5) + 0.06 * (n_macro - 0.5))
    wval = np.where(endg, wtone * (0.66 + 0.07 * ring), wval)
    val = np.where(wd, wval, val)
    # pale chipped edges and a nail at each plank end
    wchip = smooth(0.0, 1.0, (0.011 * (0.3 + 1.4 * n_chip) - d_edge) / 0.006) * wd
    hi = np.where(wd, wchip * 0.36 + edge_hi * 0.10, hi)
    hue = np.where(wd[..., None], np.stack([1.0 + 0.05 * (grain - 0.5), np.ones_like(grain), 1.0 - 0.10 * (grain - 0.5)], axis=-1), hue)
    half_l = np.take_along_axis(tsz, long_ax[..., None], axis=-1)[..., 0]
    mid_ax = np.argsort(tsz, axis=-1)[..., 1]
    mv = np.take_along_axis(tco, mid_ax[..., None], axis=-1)[..., 0]
    half_m = np.take_along_axis(tsz, mid_ax[..., None], axis=-1)[..., 0]
    nail_d = np.sqrt((np.abs(lv) - (half_l - 0.022)) ** 2 + (np.abs(mv) - half_m * 0.45) ** 2)
    nail = wd & ~endg & (face_ax != mid_ax) & (nail_d < 0.0065) & (half_l > 0.08)
    val = np.where(nail, 0.34, val)
    hi = np.where(wd & ~endg & (nail_d < 0.0095) & (nail_d >= 0.0065) & (face_ax != mid_ax) & (half_l > 0.08), hi - 0.12, hi)

    # ---- rubber, dark, glow, flat, glass -------------------------------------------------
    rb = is_('rubber')
    val = np.where(rb, 0.90 + 0.14 * (n_mid - 0.5), val)
    hi = np.where(rb, edge_hi * 0.16 + (grime > 0.4) * 0.04, hi)
    dk = is_('dark')
    val = np.where(dk, 0.92 + 0.08 * (n_mid - 0.5), val)
    hi = np.where(dk, edge_hi * 0.10, hi)
    fl = is_('flat')
    val = np.where(fl, 0.97 + 0.06 * (n_macro - 0.5), val)
    hi = np.where(fl, edge_hi * 0.14, hi)
    gl = is_('glow') | is_('glass')
    # a lit element is brightest at its centre and never dirty
    cen = 1 - np.clip(np.sqrt(np.sum((tco / np.maximum(tsz, 1e-4)) ** 2, axis=-1)) / 1.75, 0, 1)
    val = np.where(gl, 0.82 + 0.26 * cen, val)

    # ---- soft goods and skin (characters) ------------------------------------------------
    cl = is_('cloth') | is_('knit')
    weave = (np.sin(P[..., 0] * 900) * np.sin(P[..., 1] * 900) + np.sin(P[..., 2] * 900) * np.sin(P[..., 1] * 900)) * 0.5
    val = np.where(cl, 0.93 + 0.10 * (n_macro - 0.5) + 0.07 * (n_mid - 0.5) + 0.018 * weave, val)
    hi = np.where(cl, edge_hi * 0.10, hi)
    le = is_('leather')
    val = np.where(le, 0.90 + 0.14 * (n_mid - 0.5) + 0.07 * (n_fine - 0.5), val)
    hi = np.where(le, edge_hi * 0.22 + (n_fine > 0.74) * 0.05, hi)
    sk = is_('skin')
    val = np.where(sk, 0.98 + 0.04 * (n_macro - 0.5), val)
    hr = is_('hair')
    strand = fbm(tco * np.where(long_ax[..., None] == np.arange(3), 0.12, 1.0), 110.0, 2, 29)
    val = np.where(hr, 0.86 + 0.30 * (strand - 0.5) + 0.10 * (n_macro - 0.5), val)
    hi = np.where(hr, edge_hi * 0.10, hi)
    ey = is_('eye')
    val = np.where(ey, 1.0, val)

    soft = cl | le | sk | hr | ey | gl
    # ---- compose --------------------------------------------------------------------------
    shade_rgb = shade[..., None] * sh_tint
    # skin keeps its occlusion warm (blood under the surface), cloth takes the cool shadow
    skin_sh = np.stack([0.62 + 0.38 * ao, 0.40 + 0.60 * ao, 0.36 + 0.64 * ao], axis=-1) * (0.72 + 0.28 * ao[..., None])
    shade_rgb = np.where(sk[..., None], skin_sh, shade_rgb)
    shade_rgb = np.where((gl | ey)[..., None], 1.0, shade_rgb)
    g = (grime * (~soft))[..., None]
    lit = base * hue * (val * top)[..., None]
    lit = lit * (1 - g * 0.75) + gcol * g * 0.16 * base.mean(axis=-1, keepdims=True) ** 0.5
    lit = lit * shade_rgb + (hi * shade * np.where(tinted, 1.0, 0.9))[..., None] * np.where(tinted[..., None], 1.0, 0.5 + 0.5 * base)
    out = lit * HEADROOM

    # chips: bare steel, with a dark lip on the shadow side so the paint has thickness
    steel = np.array([0.50, 0.53, 0.58]) * (0.75 + 0.5 * brushed)[..., None] * shade[..., None]
    rust = np.array([0.38, 0.17, 0.07])
    rusty = smooth(0.45, 0.8, n_mid) * (1 - ao_l) * 2.0
    steel = steel * (1 - np.clip(rusty, 0, 0.8)[..., None]) + rust * np.clip(rusty, 0, 0.8)[..., None] * shade[..., None]
    k = chip[..., None]
    out = out * (1 - k) + steel * k
    alpha = np.where(pm, 1 - chip * 0.98, 1.0)

    rgba = np.concatenate([srgb(out), alpha[..., None]], axis=-1)
    cover = gb['cover'][..., 0] > 0.5
    return rgba, cover
