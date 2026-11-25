"""
The hoverboard: a yard-built deck on two lift pods. Deck top at y = 0 (the rider stands on it),
nose toward +Z. One bone, one texture; the pods' light is slot `glow` (the runtime drives its
strength with thrust), the tail light is slot `glow2`.
"""
import math

from lib.kit import Model, PI

ORANGE = 0xf28a2e; YELLOW = 0xffcf3a; INK = 0x23272e; SLATE = 0x4b535e; GREY = 0x8b939d; GUN = 0x343b46; CREAM = 0xf3e3c8

TEX = 512
BUILD = dict(ao_dist=0.12, edge_dist=0.01, edge_w=0.004, scale=0.42, chip=1.0, grime=0.9, ao_min=0.36, edge_gain=0.36, edge_other=0.8, quality=84)


def make():
    m = Model('board')
    m.bone('deck', None, (0, 0, 0))
    m.on('deck')

    # ---- the deck: a pressed plate with a kicked nose and tail, rolled edges ------------------
    st = [(-0.62, 0.085, 0.085), (-0.56, 0.055, 0.132), (-0.44, 0.014, 0.158), (-0.3, 0.0, 0.162), (0.0, 0.0, 0.166),
          (0.3, 0.0, 0.162), (0.45, 0.016, 0.156), (0.57, 0.056, 0.13), (0.65, 0.095, 0.078)]
    t, c = 0.05, 0.018
    rings = [[(-w + c, y, z), (w - c, y, z), (w, y - c, z), (w, y - t + c, z), (w - c, y - t, z), (-w + c, y - t, z), (-w, y - t + c, z), (-w, y - c, z)] for z, y, w in st]
    m.fixed(ORANGE, surf='paint', metal=0.25, rough=0.55, texel=1.2)
    m.loft(rings, smooth=False)
    # grip tape, with a worn stance patch under each foot
    m.fixed(INK, surf='rubber', metal=0.0, rough=0.95, texel=1.3)
    m.box(0.27, 0.008, 0.58, at=(0, 0.002, 0), bevel=0)
    m.fixed(0x3a4048, surf='rubber', metal=0.0, rough=0.9, texel=1.3)
    for z in (-0.19, 0.2):
        m.box(0.2, 0.004, 0.13, at=(0, 0.007, z), rot=(0, 0.25, 0), bevel=0)
    # hazard nose, a painted number plate on the tail
    m.stripe(YELLOW, texel=1.2)
    m.box(0.24, 0.008, 0.11, at=(0, 0.047, 0.535), rot=(-0.33, 0, 0), bevel=0)
    m.fixed(CREAM, surf='paint', metal=0.1, rough=0.6, texel=1.2)
    m.box(0.2, 0.008, 0.09, at=(0, 0.04, -0.52), rot=(0.33, 0, 0), bevel=0)
    # toe stops and their bolts
    m.steel(texel=1.2)
    for z in (-0.33, 0.34):
        m.box(0.29, 0.014, 0.022, at=(0, 0.008, z), bevel=0.004)
        for s in (-1, 1):
            m.bolt((s * 0.12, 0.016, z), 0.008, (0, 1, 0))
    # rubber bumpers on the nose and tail lips
    m.rubber(texel=1.0)
    m.box(0.15, 0.028, 0.03, at=(0, 0.07, 0.655), rot=(-0.5, 0, 0), bevel=0.01)
    m.box(0.16, 0.028, 0.03, at=(0, 0.062, -0.625), rot=(0.45, 0, 0), bevel=0.01)
    # tail light
    m.glow(slot='glow2', emit=1.5, texel=1.0)
    m.box(0.12, 0.02, 0.016, at=(0, 0.03, -0.612), rot=(0.45, 0, 0), bevel=0.004)

    # ---- under the deck: a spine, truck plates, side rails ------------------------------------
    m.panel('dark', texel=0.9)
    m.box(0.085, 0.05, 0.4, at=(0, -0.075, 0), bevel=0.012)
    m.steel(texel=1.0)
    for z in (-0.3, 0.3):
        m.box(0.3, 0.02, 0.2, at=(0, -0.058, z), bevel=0.006)
        for sx in (-1, 1):
            for sz in (-1, 1):
                m.bolt((sx * 0.125, -0.07, z + sz * 0.08), 0.009, (0, -1, 0))
    m.darkmetal(texel=0.9)
    for s in (-1, 1):
        m.tube([(s * 0.15, -0.035, -0.46), (s * 0.182, -0.045, -0.3), (s * 0.19, -0.05, 0.0), (s * 0.182, -0.045, 0.3), (s * 0.15, -0.035, 0.47)], 0.013, 6)
        for z in (-0.3, 0.0, 0.3):
            m.box(0.03, 0.03, 0.03, at=(s * 0.172, -0.04, z), bevel=0.006)
    # power cell clipped to the spine, with its charge window
    m.fixed(YELLOW, surf='paint', metal=0.2, rough=0.6, texel=1.0)
    m.capsule(0.032, 0.11, 8, at=(0, -0.112, 0), rot=(PI / 2, 0, 0))
    m.steel(texel=0.9)
    m.cyl(0.035, 0.035, 0.02, 8, at=(0, -0.112, 0), rot=(PI / 2, 0, 0))
    m.glow(emit=1.2, texel=0.8)
    m.box(0.012, 0.012, 0.05, at=(0, -0.145, 0.04), bevel=0)

    # ---- lift pods ----------------------------------------------------------------------------
    for z in (-0.3, 0.3):
        m.fixed(SLATE, surf='panel', metal=0.4, rough=0.55, texel=1.0)
        m.lathe([(0.1, -0.066), (0.15, -0.07), (0.168, -0.098), (0.156, -0.132), (0.128, -0.146)], 14, at=(0, 0, z), cap=False)
        m.steel(texel=1.0)
        m.torus(0.166, 0.011, 14, 5, at=(0, -0.098, z))
        m.darkmetal(texel=0.8)
        m.cyl(0.128, 0.128, 0.012, 14, at=(0, -0.142, z))
        m.glow(emit=1.6, texel=1.0)
        m.cyl(0.108, 0.108, 0.012, 12, at=(0, -0.148, z))
        m.torus(0.136, 0.009, 14, 4, at=(0, -0.15, z))
        # cooling fins round the housing and a stripe band on the outer face
        m.vent(texel=0.9)
        for i in range(6):
            a = i / 6 * PI * 2 + 0.52
            m.box(0.018, 0.04, 0.05, at=(math.cos(a) * 0.168, -0.1, z + math.sin(a) * 0.168), rot=(0, -a + PI / 2, 0), bevel=0.003)
        m.stripe(YELLOW, texel=0.8)
        m.cyl(0.158, 0.154, 0.016, 14, at=(0, -0.076, z), cap=False)
        # feed hose from the spine
        m.rubber(texel=0.8)
        s = 1 if z > 0 else -1
        m.tube([(0.03, -0.1, s * 0.16), (0.07, -0.12, s * 0.2), (0.09, -0.11, s * 0.25), (0.08, -0.08, s * 0.28)], 0.009, 5)
    m.thin_far(0.05)
    return m
