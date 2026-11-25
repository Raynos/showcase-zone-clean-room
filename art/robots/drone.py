"""
Plumb Drone: a surveying quad-rotor that takes "dead level" personally. Hovers at 2.2 m.

Bones (driven by src/entities/robots/drone.ts):
  body               the hull; hover bob, pitch, roll and the death tumble
    rotor0..rotor3   (-x,-z) (-x,+z) (+x,-z) (+x,+z), spin about y
    gimbal           the camera ball under the nose: the eye
    bob              the plumb line and its brass bob, a pendulum from the belly winch
    bubble           the bubble in the spirit-level vial, slides along x
    ant              whip aerial with the blinker, lags the hull
    opt_<variant>... variant dressing (also under bob)
"""
import math

from lib.kit import Model, PI

TEX = 512
BUILD = dict(ao_dist=0.25, edge_dist=0.02, edge_w=0.008, scale=1.0)

YELLOW = 0xf2b632
BRASS = 'wood'      # the bob, the level's saddle and the compass ring: slot wood carries brass


def make():
    m = Model('drone')
    m.bone('body', None, (0, 2.2, 0))

    # ---- hull: belly pan, painted shell with a hazard band, steel instrument dome ----------
    m.darkmetal(texel=0.7)
    m.lathe([(0.0, -0.17), (0.15, -0.17), (0.25, -0.09), (0.31, -0.045)], 12)
    m.paint('body', texel=1.25)
    m.lathe([(0.3, -0.06), (0.368, -0.028), (0.368, 0.03), (0.3, 0.085), (0.2, 0.1)], 12, cap=False)
    m.stripe(YELLOW, texel=1.0)
    m.cyl(0.374, 0.374, 0.05, 12, at=(0, 0.001, 0), cap=False)
    m.steel(texel=0.9)
    m.lathe([(0.25, 0.088), (0.22, 0.15), (0.13, 0.19), (0.0, 0.2)], 12, cap=False)
    m.steel(slot=BRASS, texel=0.6)
    m.cyl(0.262, 0.272, 0.028, 12, at=(0, 0.098, 0), cap=False)
    # battery packs saddled over the shell, vents on the back
    for s in (-1, 1):
        m.paint('body2', texel=0.8)
        m.box(0.1, 0.07, 0.2, at=(s * 0.29, 0.085, -0.02), rot=(0, 0, -s * 0.3), bevel=0.016)
        m.vent(texel=0.5)
        m.box(0.07, 0.012, 0.14, at=(s * 0.3, 0.123, -0.02), rot=(0, 0, -s * 0.3), bevel=0)
    m.vent(texel=0.6)
    m.box(0.18, 0.045, 0.02, at=(0, 0.03, -0.362), bevel=0)
    # sensor bar across the nose
    m.darkmetal(texel=0.6)
    m.box(0.24, 0.07, 0.07, at=(0, 0.03, 0.345), bevel=0.014)
    m.fixed(0x0a0e12, surf='glass', rough=0.25, metal=0.3, texel=0.6)
    m.box(0.19, 0.036, 0.012, at=(0, 0.032, 0.382), bevel=0)
    for s in (-1, 1):
        m.glow(slot='glow2', emit=1.0, texel=0.3)
        m.box(0.03, 0.02, 0.012, at=(s * 0.06, 0.032, 0.39), bevel=0)

    # ---- spirit level: its eyebrow --------------------------------------------------------
    m.fixed(0xb8ff7a, surf='glow', emit=0.35, rough=0.3, texel=0.7)
    m.cyl(0.034, 0.034, 0.26, 7, at=(0, 0.225, 0.07), rot=(0, 0, PI / 2), cap=False)
    for s in (-1, 1):
        m.darkmetal(texel=0.4)
        m.cyl(0.043, 0.043, 0.045, 7, at=(s * 0.145, 0.225, 0.07), rot=(0, 0, PI / 2))
        m.steel(slot=BRASS, texel=0.4)
        m.box(0.03, 0.07, 0.05, at=(s * 0.145, 0.185, 0.07), bevel=0)

    # ---- arms: boom, brace and feed cable out to a motor pod inside a guard ring -------------
    for sx in (-1, 1):
        for sz in (-1, 1):
            px, pz = sx * 0.52, sz * 0.52
            m.darkmetal(texel=0.8)
            m.strut((sx * 0.24, 0.0, sz * 0.24), (px, 0.03, pz), 0.046, 0.036, 6)
            m.steel(texel=0.3)
            m.strut((sx * 0.2, -0.1, sz * 0.2), (sx * 0.45, -0.005, sz * 0.45), 0.013, 0.013, 4)
            m.rubber(texel=0.25)
            m.tube([(sx * 0.2, 0.09, sz * 0.2), (sx * 0.3, 0.085, sz * 0.32), (sx * 0.42, 0.075, sz * 0.44), (px, 0.09, pz - sz * 0.04)], 0.011, seg=4)
            m.paint('body2', texel=0.8)
            m.cyl(0.062, 0.078, 0.13, 8, at=(px, 0.05, pz), bevel=0.01)
            m.steel(texel=0.3)
            m.cyl(0.052, 0.04, 0.03, 8, at=(px, -0.03, pz))
            m.paint('body' if sz > 0 else 'steel', texel=0.7)
            m.torus(0.25, 0.016, 12, 3, at=(px, 0.1, pz))
            m.darkmetal(texel=0.2)
            d = 0.7071 * 0.25
            m.strut((px, 0.08, pz), (px + sx * d, 0.1, pz + sz * d), 0.009, 0.009, 3)
            m.strut((px, 0.08, pz), (px - sx * d, 0.1, pz - sz * d), 0.009, 0.009, 3)

    # ---- tail boom with a level stabiliser, skids under the belly ---------------------------
    m.darkmetal(texel=0.5)
    m.strut((0, 0.02, -0.32), (0, 0.06, -0.64), 0.03, 0.02, 5)
    m.paint('body', texel=0.6)
    m.box(0.3, 0.014, 0.09, at=(0, 0.065, -0.61), bevel=0)
    for s in (-1, 1):
        m.stripe(YELLOW, texel=0.5)
        m.box(0.014, 0.1, 0.1, at=(s * 0.15, 0.085, -0.615), bevel=0)
    for s in (-1, 1):
        m.steel(texel=0.4)
        m.strut((s * 0.2, -0.265, -0.2), (s * 0.2, -0.265, 0.2), 0.015, 0.015, 5)
        m.darkmetal(texel=0.25)
        for z in (-0.12, 0.12):
            m.strut((s * 0.14, -0.12, z), (s * 0.2, -0.26, z * 1.1), 0.012, 0.012, 4)
    # gimbal yoke and the plumb line's winch
    m.darkmetal(texel=0.4)
    for s in (-1, 1):
        m.box(0.03, 0.14, 0.07, at=(s * 0.135, -0.085, 0.22), bevel=0)
    m.cyl(0.05, 0.05, 0.09, 7, at=(0, -0.175, -0.03), rot=(0, 0, PI / 2))

    # ---- variant dressing on the hull -----------------------------------------------------
    m.bone('opt_night', 'body', (0, 0, 0))
    i = 0
    for sx in (-1, 1):
        for sz in (-1, 1):
            m.glow(slot='glow' if sx * sz > 0 else 'glow2', emit=1.3, texel=0.3)
            m.cyl(0.05, 0.03, 0.03, 6, at=(sx * 0.52, -0.055, sz * 0.52))
            i += 1
    # floodlamp under the nose and a lit ring over the band
    m.darkmetal(texel=0.4)
    m.cyl(0.07, 0.05, 0.08, 8, at=(0, -0.05, 0.4), rot=(PI / 2 + 0.5, 0, 0))
    m.glow(emit=1.2, texel=0.5)
    m.sphere(0.056, 8, 3, at=(0, -0.07, 0.434), rot=(0.5, 0, 0), scale=(1, 1, 0.4))
    m.glow(slot='glow2', emit=1.1, texel=0.5)
    m.cyl(0.378, 0.378, 0.012, 12, at=(0, 0.036, 0), cap=False)

    m.bone('opt_rare', 'body', (0, 0, 0))
    # survey-grade: a polished band, a pennant on the tail and a prism target on the dome
    m.steel(slot='trim', texel=0.8)
    m.cyl(0.38, 0.38, 0.058, 12, at=(0, 0.001, 0), cap=False)
    m.darkmetal(texel=0.3)
    m.strut((0, 0.06, -0.62), (0, 0.4, -0.66), 0.011, 0.006, 4)
    m.mat(slot='glow', surf='cloth', metal=0, rough=0.9, emit=0.5, texel=0.6)
    m.prism([(0, 0), (0.22, 0.06), (0, 0.13)], 0.012, at=(0, 0.25, -0.652), rot=(0, PI / 2, 0))
    m.glow(slot='glow2', emit=1.3, texel=0.5)
    m.cone(0.05, 0.07, 4, at=(0.13, 0.25, -0.1))
    m.cone(0.05, 0.07, 4, at=(0.13, 0.18, -0.1), rot=(PI, 0, 0))

    m.bone('opt_elite', 'body', (0, 0, 0))
    # Plumb Prime: crown, armoured booms and a dart slung under each front arm
    r = 0.13
    m.push(at=(0, 0.17, -0.08))
    m.steel(slot='trim', texel=0.7)
    m.cyl(r * 1.02, r * 1.08, r * 0.3, 10, at=(0, r * 0.15, 0), bevel=0.006)
    for i in range(5):
        a = (i / 5) * PI * 2 + PI / 2
        cx, cz = math.cos(a) * r * 0.92, math.sin(a) * r * 0.92
        m.steel(slot='trim', texel=0.5)
        m.cone(r * 0.2, r * 0.7, 4, at=(cx, r * 0.62, cz))
        m.glow(emit=1.6, texel=0.3)
        m.sphere(r * 0.1, 5, 4, at=(cx, r * 1.0, cz))
    m.pop()
    for sx in (-1, 1):
        for sz in (-1, 1):
            m.stripe(0xffc23a, texel=0.8)
            m.box(0.11, 0.022, 0.26, at=(sx * 0.38, 0.068, sz * 0.38), rot=(0, sx * sz * PI / 4, 0), bevel=0.008)
        m.steel(slot=BRASS, texel=0.5)
        m.cone(0.04, 0.2, 6, at=(sx * 0.4, -0.07, 0.5), rot=(PI / 2, 0, 0))
        m.cyl(0.04, 0.03, 0.08, 6, at=(sx * 0.4, -0.07, 0.36), rot=(PI / 2, 0, 0))
        m.darkmetal(texel=0.2)
        m.box(0.02, 0.07, 0.03, at=(sx * 0.4, -0.03, 0.4), bevel=0)

    # ---- rotors: two pitched blades, lit tips so the spin reads as a disc ---------------------
    i = 0
    for sx in (-1, 1):
        for sz in (-1, 1):
            m.bone('rotor%d' % i, 'body', (sx * 0.52, 0.13, sz * 0.52))
            i += 1
            m.steel(texel=0.3)
            m.cyl(0.03, 0.036, 0.04, 6, at=(0, 0, 0))
            m.cone(0.03, 0.04, 6, at=(0, 0.04, 0))
            for k in (-1, 1):
                m.darkmetal(texel=0.5)
                m.box(0.2, 0.01, 0.052, at=(k * 0.12, 0.008, 0), rot=(k * 0.22, 0, 0), bevel=0)
                m.box(0.052, 0.01, 0.2, at=(0, 0.008, k * 0.12), rot=(0, 0, k * 0.22), bevel=0)
                m.fixed(0xffffff, surf='flat', rough=0.5, texel=0.3)
                m.box(0.035, 0.012, 0.056, at=(k * 0.212, 0.008, 0), rot=(k * 0.22, 0, 0), bevel=0)

    # ---- gimbal: the eye ------------------------------------------------------------------
    m.bone('gimbal', 'body', (0, -0.1, 0.22))
    m.darkmetal(texel=1.0)
    m.sphere(0.115, 9, 6)
    m.steel(texel=0.6)
    m.cyl(0.082, 0.092, 0.045, 10, at=(0, 0, 0.088), rot=(PI / 2, 0, 0))
    m.glow(emit=1.3, texel=1.2)
    m.sphere(0.068, 9, 4, at=(0, 0, 0.108), scale=(1, 1, 0.5))
    m.fixed(0x071015, surf='flat', rough=0.3, texel=0.4)
    m.sphere(0.032, 6, 3, at=(0.006, 0.008, 0.138), scale=(1, 1, 0.5))
    m.paint('body', texel=0.7)
    m.box(0.21, 0.028, 0.12, at=(0, 0.1, 0.075), rot=(0.25, 0, 0), bevel=0.008)
    m.steel(texel=0.5)
    m.box(0.05, 0.036, 0.13, at=(0.118, -0.03, 0.04), bevel=0.008)
    m.glow(slot='glow2', emit=1.2, texel=0.3)
    m.sphere(0.015, 5, 3, at=(0.118, -0.03, 0.108))

    # ---- plumb line and bob ----------------------------------------------------------------
    m.bone('bob', 'body', (0, -0.14, -0.03))
    m.fixed(0x20242a, surf='flat', rough=0.8, texel=0.3)
    m.strut((0, -0.03, 0), (0, -0.76, 0), 0.008, 0.008, 4)
    m.steel(texel=0.3)
    m.cyl(0.02, 0.02, 0.04, 5, at=(0, -0.755, 0))
    m.steel(slot=BRASS, texel=1.0)
    m.lathe([(0.03, -0.78), (0.052, -0.8), (0.092, -0.835), (0.092, -0.885)], 10)
    m.glow(emit=1.1, texel=0.6)
    m.cyl(0.095, 0.095, 0.022, 10, at=(0, -0.896, 0), cap=False)
    m.steel(slot=BRASS, texel=1.0)
    m.lathe([(0.03, -1.09), (0.074, -0.96), (0.092, -0.907)], 10, cap=False)
    m.steel(texel=0.5)
    m.cone(0.03, 0.085, 8, at=(0, -1.13, 0), rot=(PI, 0, 0))

    m.bone('opt_elite_bob', 'bob', (0, 0, 0))
    m.steel(texel=0.4)
    for i in range(4):
        a = i * PI / 2 + PI / 4
        m.cone(0.026, 0.11, 4, at=(math.cos(a) * 0.115, -0.86, math.sin(a) * 0.115), rot=(math.sin(a) * 1.2, 0, -math.cos(a) * 1.2))
    m.steel(slot='trim', texel=0.4)
    m.cyl(0.1, 0.1, 0.02, 10, at=(0, -0.835, 0), cap=False)

    # ---- bubble and aerial ------------------------------------------------------------------
    m.bone('bubble', 'body', (0, 0.225, 0.07))
    m.fixed(0xf4ffe0, surf='glow', emit=0.7, rough=0.3, texel=0.3)
    m.sphere(0.036, 6, 4, scale=(1.5, 1, 1))

    m.bone('ant', 'body', (0, 0.15, -0.2))
    m.darkmetal(texel=0.3)
    m.cyl(0.02, 0.026, 0.03, 5, at=(0, 0.01, 0))
    m.strut((0, 0.02, 0), (0, 0.34, -0.1), 0.011, 0.006, 4)
    m.fixed(0xff5a3a, surf='glow', emit=1.3, rough=0.4, texel=0.4)
    m.sphere(0.028, 6, 4, at=(0, 0.35, -0.1))
    return m
