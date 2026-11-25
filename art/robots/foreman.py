"""
Foreman Unit 7: the site overseer. A three-metre barrel of a robot in a hi-vis vest and a hard
hat with a beacon on top, a moustache grille, a whistle clamped in its jaw, a wrench-hammer in
one fist and the day's schedule on a clipboard in the other.

Bones (driven by src/entities/robots/foreman.ts):
  all                      root (falls over on death)
    hips                   pelvis pivot, y 1.2
      legL, legR           hip pivots; thigh
        shinL, shinR       knee pivots; shin and work boot
      torso                waist pivot; belt, gut, chest, shoulders, back pack
        head               neck pivot; skull, hard hat
          jaw              hinged at the back; jowls and the whistle
          beacon           spins
          blast            the whistle's shock rings (scaled up from nothing when blown)
        armR               shoulder; upper arm
          foreR            elbow; forearm, fist and the wrench-hammer (shaft along +Z)
        armL               shoulder; upper arm
          foreL            elbow; forearm, fist and the clipboard
        opt_*              variant dressing
Palette extras set by foreman.ts: top = vest, top2 = hard hat, bottom = trouser plates.
"""
import math

from lib.kit import Model, PI

TEX = 1024
BUILD = dict(ao_dist=0.7, edge_dist=0.06, edge_w=0.009, scale=3.0, chip=0.8)

LEATHER = 0x4a3524
POUCH = 0x5a4028
BRASS = 0xd9a441
TAPE = 0xe8fbff
CHROME = 0xd8dde2
HAZ = 0xffc23a


def tape(m):
    m.fixed(TAPE, surf='flat', rough=0.35, metal=0.3, emit=0.12, texel=0.7)


def leg(m, s, thigh, shin):
    m.bone(thigh, 'hips', (s * 0.44, 0, 0))
    # hip ball, box-beam thigh with a trouser plate, a ram down the back
    m.darkmetal(texel=0.9)
    m.sphere(0.3, 12, 7)
    m.strut((0, 0, 0), (0, -0.55, 0.06), 0.26, 0.22, 8)
    m.panel('bottom', texel=1.1)
    m.box(0.46, 0.36, 0.12, at=(0, -0.3, 0.24), rot=(-0.1, 0, 0), bevel=0.035)
    m.box(0.12, 0.34, 0.4, at=(s * 0.25, -0.3, 0.02), bevel=0.035)
    m.fixed(CHROME, surf='metal', metal=0.9, rough=0.3, texel=0.4)
    m.strut((0, -0.08, -0.24), (0, -0.5, -0.2), 0.04, 0.04, 6, lod=1)
    m.darkmetal(texel=0.4)
    m.strut((0, -0.08, -0.24), (0, -0.3, -0.22), 0.065, 0.065, 6, lod=1)
    m.steel(texel=0.4)
    m.cyl(0.09, 0.09, 0.05, 8, at=(s * 0.27, 0, 0), rot=(0, 0, PI / 2), lod=1)

    m.bone(shin, thigh, (0, -0.56, 0.06))
    # knee drum and cap, shin tube with a guard, and a steel-toe work boot
    m.darkmetal(texel=1.0)
    m.cyl(0.25, 0.25, 0.5, 12, rot=(0, 0, PI / 2), bevel=0.035)
    m.panel('body', texel=1.0)
    m.box(0.36, 0.3, 0.12, at=(0, 0.0, 0.24), bevel=0.04)
    m.steel(texel=0.4)
    m.cyl(0.08, 0.08, 0.54, 6, rot=(0, 0, PI / 2), lod=1)
    m.steel(texel=0.9)
    m.strut((0, 0, 0), (0, -0.4, -0.05), 0.22, 0.2, 8)
    m.panel('bottom', texel=1.0)
    m.box(0.42, 0.3, 0.1, at=(0, -0.24, 0.19), rot=(0.1, 0, 0), bevel=0.03)
    # boot: leather upper with a cuff and laces, steel toe cap, a treaded rubber sole
    m.fixed(LEATHER, surf='leather', rough=0.75, texel=1.1)
    m.box(0.52, 0.28, 0.8, at=(0, -0.5, 0.07), bevel=0.08)
    m.cyl(0.29, 0.27, 0.13, 10, at=(0, -0.37, -0.04))
    m.fixed(0xe9dcc0, surf='flat', rough=0.8, texel=0.3)
    for i in range(3):
        m.box(0.2, 0.025, 0.03, at=(0, -0.385 - i * 0.045, 0.25 + i * 0.045), rot=(0.75, 0, 0), bevel=0, lod=1)
    m.steel(texel=0.9)
    m.box(0.54, 0.22, 0.3, at=(0, -0.52, 0.39), bevel=0.085)
    m.rubber(texel=0.9)
    m.box(0.56, 0.07, 0.88, at=(0, -0.61, 0.07), bevel=0.02)
    for i in range(4):
        m.box(0.58, 0.035, 0.09, at=(0, -0.625, -0.29 + i * 0.24), bevel=0, lod=1)


def arm(m, s, name):
    m.bone(name, 'torso', (s * 0.98, 1.2, 0))
    # upper arm: a dark beam in a vest sleeve with a band of tape, a ram down the back
    m.darkmetal(texel=0.8)
    m.strut((0, 0, 0), (0, -0.72, 0), 0.2, 0.17, 8)
    m.panel('top', texel=1.1)
    m.box(0.42, 0.36, 0.44, at=(0, -0.2, 0), bevel=0.1)
    tape(m)
    m.box(0.43, 0.06, 0.45, at=(0, -0.3, 0), bevel=0)
    m.fixed(CHROME, surf='metal', metal=0.9, rough=0.3, texel=0.3)
    m.strut((0, -0.36, -0.17), (0, -0.7, -0.16), 0.032, 0.032, 5, lod=1)


def make():
    m = Model('foreman')
    m.bone('all', None, (0, 0, 0))
    m.bone('hips', 'all', (0, 1.2, 0))

    leg(m, 1, 'legL', 'shinL')
    leg(m, -1, 'legR', 'shinR')

    # ---- torso ------------------------------------------------------------------------------
    m.bone('torso', 'hips', (0, 0, 0))
    m.mat(slot='dark', surf='panel', metal=0.6, rough=0.55, emit=0, texel=1.2)
    m.box(1.0, 0.36, 0.62, at=(0, 0.06, 0), bevel=0.1)
    # tool belt: buckle, two pouches, a tape measure, a radio, a spanner hanging in a loop
    m.fixed(LEATHER, surf='leather', rough=0.7, texel=1.0)
    m.box(1.08, 0.14, 0.7, at=(0, 0.22, 0), bevel=0.03)
    m.fixed(BRASS, surf='metal', metal=0.9, rough=0.35, texel=0.6)
    m.box(0.2, 0.18, 0.06, at=(0, 0.22, 0.355), bevel=0.02)
    m.fixed(0x2a1c12, surf='flat', rough=0.8, texel=0.3)
    m.box(0.1, 0.09, 0.02, at=(0, 0.22, 0.38), bevel=0, lod=1)
    for s in (-1, 1):
        m.fixed(POUCH, surf='leather', rough=0.75, texel=0.9)
        m.box(0.24, 0.3, 0.14, at=(s * 0.4, 0.1, 0.37), bevel=0.03)
        m.fixed(LEATHER, surf='leather', rough=0.7, texel=0.6)
        m.box(0.25, 0.12, 0.15, at=(s * 0.4, 0.2, 0.375), bevel=0.03)
        m.fixed(BRASS, surf='metal', metal=0.9, rough=0.35, texel=0.25)
        m.sphere(0.025, 6, 3, at=(s * 0.4, 0.16, 0.455), lod=1)
    m.fixed(HAZ, surf='paint', rough=0.6, metal=0.2, texel=0.6)
    m.cyl(0.11, 0.11, 0.08, 10, at=(-0.56, 0.12, 0.12), rot=(0, 0, PI / 2), bevel=0.015)
    m.steel(texel=0.3)
    m.cyl(0.04, 0.04, 0.1, 6, at=(-0.56, 0.12, 0.12), rot=(0, 0, PI / 2), lod=1)
    m.darkmetal(texel=0.6)
    m.box(0.1, 0.26, 0.18, at=(0.57, 0.14, -0.1), bevel=0.025)
    m.strut((0.57, 0.27, -0.16), (0.57, 0.52, -0.18), 0.012, 0.008, 5, lod=1)
    m.glow(slot='glow2', emit=1.3, texel=0.3)
    m.box(0.012, 0.04, 0.05, at=(0.622, 0.2, -0.08), bevel=0, lod=1)
    m.fixed(LEATHER, surf='leather', rough=0.7, texel=0.3)
    m.box(0.04, 0.14, 0.1, at=(0.56, 0.1, 0.16), bevel=0, lod=1)
    m.steel(texel=0.5)
    m.box(0.03, 0.4, 0.06, at=(0.585, -0.06, 0.16), rot=(0.12, 0, 0), bevel=0.01, lod=1)
    m.box(0.03, 0.1, 0.12, at=(0.585, -0.27, 0.185), rot=(0.12, 0, 0), bevel=0.01, lod=1)
    # gut and chest in the hi-vis vest, reflective tape round the belly and over the shoulders
    m.panel('top', texel=1.7)
    m.box(1.28, 0.62, 0.86, at=(0, 0.58, 0.06), bevel=0.16, seg=2)
    m.box(1.5, 0.56, 0.84, at=(0, 1.06, 0.0), bevel=0.14, seg=2)
    tape(m)
    m.box(1.3, 0.09, 0.88, at=(0, 0.5, 0.06), bevel=0)
    for s in (-1, 1):
        m.box(0.1, 0.6, 0.86, at=(s * 0.4, 1.05, 0.0), bevel=0)
    # shirt front, tie, zip toggles
    m.steel(texel=0.9)
    m.box(0.42, 0.7, 0.06, at=(0, 0.98, 0.41), bevel=0.02)
    m.glow(emit=0.55, texel=0.9)
    m.box(0.14, 0.5, 0.04, at=(0, 0.92, 0.45), rot=(0.04, 0, 0), bevel=0.015)
    m.box(0.1, 0.1, 0.04, at=(0, 0.64, 0.46), rot=(0.04, 0, PI / 4), bevel=0.01, lod=1)
    m.box(0.18, 0.12, 0.06, at=(0, 1.24, 0.44), bevel=0.03)
    for s in (-1, 1):
        m.panel('top', texel=0.7)
        m.box(0.2, 0.26, 0.08, at=(s * 0.25, 1.26, 0.42), rot=(0, 0, s * 0.5), bevel=0.02)
    # name badge, breast pocket with pens
    m.fixed(0xffffff, surf='flat', rough=0.6, texel=0.6)
    m.box(0.26, 0.17, 0.03, at=(-0.52, 1.12, 0.425), bevel=0.008)
    m.fixed(0x2a2f37, surf='flat', rough=0.7, texel=0.3)
    m.box(0.18, 0.03, 0.01, at=(-0.52, 1.15, 0.442), bevel=0, lod=1)
    m.box(0.12, 0.022, 0.01, at=(-0.55, 1.095, 0.442), bevel=0, lod=1)
    m.fixed(0xd84a2e, surf='flat', rough=0.6, texel=0.3)
    m.box(0.26, 0.035, 0.032, at=(-0.52, 1.215, 0.425), bevel=0, lod=1)
    m.paint('body2', texel=0.6)
    m.box(0.3, 0.2, 0.03, at=(0.52, 1.08, 0.425), bevel=0.008, lod=1)
    for i, c in enumerate((0xd84a2e, 0x2b9aa8, 0x1c1f24)):
        m.fixed(c, surf='paint', rough=0.5, texel=0.25)
        m.cyl(0.022, 0.022, 0.17, 6, at=(0.44 + i * 0.075, 1.2, 0.435), lod=1)
    # shoulders, neck, a back pack with louvres, hot slots, stacks and hoses
    m.paint('body', texel=1.1)
    for s in (-1, 1):
        m.sphere(0.34, 12, 7, at=(s * 0.86, 1.2, 0))
    m.darkmetal(texel=0.8)
    m.cyl(0.22, 0.28, 0.18, 10, at=(0, 1.38, 0.02))
    m.mat(slot='dark', surf='panel', metal=0.6, rough=0.55, emit=0, texel=1.2)
    m.box(1.0, 0.66, 0.22, at=(0, 0.98, -0.48), bevel=0.05)
    m.vent(texel=1.0)
    m.box(0.6, 0.22, 0.02, at=(0, 1.12, -0.595), bevel=0)
    m.glow(emit=0.8, texel=0.6)
    for s in (-1, 1):
        m.box(0.2, 0.06, 0.02, at=(s * 0.24, 0.84, -0.595), bevel=0)
    for s in (-1, 1):
        m.darkmetal(texel=0.7)
        m.cyl(0.075, 0.085, 0.56, 8, at=(s * 0.4, 1.52, -0.44), bevel=0.01)
        m.steel(texel=0.4)
        m.cyl(0.1, 0.085, 0.07, 8, at=(s * 0.4, 1.82, -0.44))
        m.rubber(texel=0.6)
        m.tube([(s * 0.46, 1.2, -0.56), (s * 0.66, 1.34, -0.5), (s * 0.82, 1.42, -0.3), (s * 0.86, 1.36, -0.12)], 0.045, 6, lod=1)
    # waist rams either side of the gut
    m.fixed(CHROME, surf='metal', metal=0.9, rough=0.3, texel=0.3)
    for s in (-1, 1):
        m.strut((s * 0.5, 0.0, -0.22), (s * 0.6, 0.42, -0.3), 0.035, 0.035, 5, lod=1)

    # ---- variant dressing on the torso -------------------------------------------------------
    m.bone('opt_rare', 'torso', (0, 0, 0))
    m.darkmetal(texel=0.4)
    m.strut((-0.62, 1.3, -0.5), (-0.62, 2.3, -0.5), 0.025, 0.012, 5)
    m.mat(slot='glow', surf='cloth', metal=0, rough=0.9, emit=0.5, texel=0.7)
    m.box(0.025, 0.24, 0.36, at=(-0.62, 2.12, -0.7), bevel=0)
    m.glow(slot='glow2', emit=1.5, texel=0.4)
    m.sphere(0.05, 6, 4, at=(-0.62, 2.32, -0.5))

    m.bone('opt_night', 'torso', (0, 0, 0))
    for s, slot in ((1, 'glow'), (-1, 'glow2')):
        m.glow(slot=slot, emit=1.6, texel=0.5)
        m.box(0.03, 0.5, 0.03, at=(s * 0.655, 0.6, 0.38), bevel=0)
        m.box(0.3, 0.04, 0.02, at=(s * 0.25, 1.28, -0.596), bevel=0)

    m.bone('opt_elite', 'torso', (0, 0, 0))
    # the boss's hazard pauldrons
    for s in (-1, 1):
        m.stripe(texel=1.5)
        m.box(0.6, 0.26, 0.74, at=(s * 0.9, 1.43, 0), rot=(0, 0, -s * 0.28), bevel=0.09, seg=2)
        m.paint('body', texel=0.7)
        m.box(0.54, 0.06, 0.68, at=(s * 0.94, 1.29, 0), rot=(0, 0, -s * 0.28), bevel=0.02)

    # ---- head: a jowly box under a hard hat ----------------------------------------------------
    m.bone('head', 'torso', (0, 1.46, 0.06))
    m.mat(slot='steel', surf='panel', metal=0.6, rough=0.45, emit=0, texel=1.4)
    m.box(0.66, 0.56, 0.6, at=(0, 0.3, 0), bevel=0.13)
    # brow, a dark socket, two slanted eyes
    m.darkmetal(texel=0.8)
    m.box(0.66, 0.11, 0.18, at=(0, 0.5, 0.27), rot=(0.25, 0, 0), bevel=0.03)
    m.fixed(0x0a0d11, surf='dark', rough=0.9, texel=0.5)
    m.box(0.54, 0.13, 0.02, at=(0, 0.405, 0.297), bevel=0)
    m.glow(emit=1.6, texel=1.0)
    for s in (-1, 1):
        m.box(0.18, 0.07, 0.03, at=(s * 0.16, 0.405, 0.305), rot=(0, 0, -s * 0.2), bevel=0)
    # moustache grille
    for s in (-1, 1):
        m.mat(slot='fixed', surf='vent', color=CHROME, metal=0.85, rough=0.35, emit=0, texel=0.9)
        m.box(0.32, 0.11, 0.1, at=(s * 0.155, 0.245, 0.35), rot=(0, 0, s * 0.3), bevel=0.03)
    m.steel(texel=0.4)
    m.box(0.09, 0.1, 0.1, at=(0, 0.29, 0.345), bevel=0.02, lod=1)
    # ear defenders clipped to the hat
    for s in (-1, 1):
        m.paint('top', texel=0.7)
        m.cyl(0.16, 0.16, 0.1, 10, at=(s * 0.37, 0.3, -0.02), rot=(0, 0, PI / 2), bevel=0.025)
        m.rubber(texel=0.4)
        m.cyl(0.13, 0.13, 0.04, 10, at=(s * 0.31, 0.3, -0.02), rot=(0, 0, PI / 2), lod=1)
        m.darkmetal(texel=0.3)
        m.box(0.03, 0.26, 0.05, at=(s * 0.42, 0.46, -0.02), rot=(0, 0, s * 0.18), bevel=0, lod=1)
    # hard hat: dome, brim, peak, a ridge in vest orange, a brass badge, the beacon's socket
    m.paint('top2', texel=1.5)
    m.lathe([(0.47, 0.0), (0.455, 0.1), (0.4, 0.21), (0.29, 0.295), (0.14, 0.335), (0.0, 0.345)], 16, at=(0, 0.6, -0.02), scale=(1, 1, 1.06))
    m.cyl(0.47, 0.5, 0.05, 16, at=(0, 0.61, 0.0), scale=(1, 1, 1.08))
    m.box(0.52, 0.05, 0.32, at=(0, 0.62, 0.5), rot=(-0.05, 0, 0), bevel=0.02)
    m.paint('top', texel=0.9)
    m.box(0.1, 0.1, 0.92, at=(0, 0.87, -0.02), bevel=0.04)
    for s in (-1, 1):
        m.box(0.05, 0.05, 0.7, at=(s * 0.2, 0.84, -0.02), bevel=0.018, lod=1)
    m.fixed(BRASS, surf='metal', metal=0.9, rough=0.35, texel=0.6)
    m.box(0.22, 0.13, 0.03, at=(0, 0.715, 0.455), rot=(-0.38, 0, 0), bevel=0.01, lod=1)
    m.fixed(0x2a1c12, surf='flat', rough=0.8, texel=0.3)
    m.box(0.07, 0.07, 0.012, at=(0, 0.72, 0.474), rot=(-0.38, 0, 0), bevel=0, lod=1)
    m.darkmetal(texel=0.5)
    m.cyl(0.11, 0.13, 0.06, 10, at=(0, 0.93, -0.02))

    m.bone('opt_elite_head', 'head', (0, 0, 0))
    # the boss's gold hat band with three chevrons up front
    m.steel(slot='trim', texel=1.0)
    m.cyl(0.445, 0.475, 0.08, 16, at=(0, 0.69, -0.02), scale=(1, 1, 1.06), cap=False)
    for i in range(3):
        for s in (-1, 1):
            m.box(0.11, 0.03, 0.02, at=(s * 0.045, 0.79 + i * 0.045, 0.43 - i * 0.03), rot=(-0.6, 0, -s * 0.5), bevel=0, lod=1)

    m.bone('opt_night_head', 'head', (0, 0, 0))
    # a cap lamp for the night shift
    m.darkmetal(texel=0.6)
    m.cyl(0.1, 0.1, 0.09, 10, at=(0, 0.8, 0.44), rot=(PI / 2 - 0.3, 0, 0), bevel=0.015)
    m.glow(slot='glow2', emit=2.0, texel=0.6)
    m.cyl(0.075, 0.075, 0.02, 10, at=(0, 0.815, 0.487), rot=(PI / 2 - 0.3, 0, 0))

    # ---- jaw: jowls, chin and the whistle it never puts down --------------------------------------
    m.bone('jaw', 'head', (0, 0.2, -0.15))
    m.push(at=(0, -0.2, 0.15))
    m.mat(slot='dark', surf='panel', metal=0.6, rough=0.55, emit=0, texel=1.2)
    m.box(0.76, 0.3, 0.58, at=(0, 0.14, 0.08), bevel=0.1)
    m.steel(texel=0.5)
    for s in (-1, 1):
        m.cyl(0.07, 0.07, 0.04, 8, at=(s * 0.385, 0.2, -0.1), rot=(0, 0, PI / 2), lod=1)
    m.fixed(BRASS, surf='metal', metal=0.9, rough=0.3, texel=0.7)
    m.cyl(0.07, 0.07, 0.22, 8, at=(0, 0.12, 0.43), rot=(PI / 2, 0, 0))
    m.cyl(0.1, 0.1, 0.11, 10, at=(0, 0.14, 0.52), rot=(0, 0, PI / 2), bevel=0.015)
    m.fixed(0x15181d, surf='flat', rough=0.7, texel=0.2)
    m.box(0.06, 0.02, 0.05, at=(0, 0.235, 0.52), bevel=0, lod=1)
    m.pop()

    # ---- beacon: an amber lamp with a spinning reflector -------------------------------------------
    m.bone('beacon', 'head', (0, 0.96, -0.02))
    m.fixed(0xffa53a, surf='glow', rough=0.3, emit=1.0, texel=0.6)
    m.cyl(0.09, 0.1, 0.16, 10, at=(0, 0.08, 0))
    m.fixed(0xffffff, surf='glow', rough=0.3, emit=1.5, texel=0.3)
    m.box(0.03, 0.13, 0.22, at=(0, 0.08, 0), bevel=0)
    m.darkmetal(texel=0.4)
    m.cyl(0.105, 0.105, 0.025, 10, at=(0, 0.17, 0), lod=1)

    # ---- whistle blast: three shock rings, scaled up out of nothing ---------------------------------
    m.bone('blast', 'head', (0, 0.13, 0.62))
    m.fixed(0xfff1c8, surf='glow', rough=0.4, emit=0.8, texel=0.4)
    for i in range(3):
        m.torus(0.2 + i * 0.2, 0.022 + i * 0.006, 16, 4, at=(0, 0, i * 0.3), rot=(PI / 2, 0, 0))

    # ---- right arm: the persuader ---------------------------------------------------------------------
    arm(m, -1, 'armR')
    m.bone('foreR', 'armR', (0, -0.74, 0))
    m.darkmetal(texel=1.0)
    m.cyl(0.21, 0.21, 0.4, 12, rot=(0, 0, PI / 2), bevel=0.03)
    m.steel(texel=0.3)
    m.cyl(0.07, 0.07, 0.44, 6, rot=(0, 0, PI / 2), lod=1)
    m.steel(texel=0.9)
    m.strut((0, 0, 0), (0, -0.6, 0), 0.17, 0.2, 8)
    m.panel('body', texel=0.9)
    m.box(0.1, 0.36, 0.3, at=(-0.19, -0.32, 0), bevel=0.03)
    m.stripe(texel=0.6)
    m.box(0.105, 0.07, 0.3, at=(-0.19, -0.46, 0), bevel=0, lod=1)
    # fist: a dark block with knuckle plates and a thumb, wrapped round the shaft
    m.mat(slot='dark', surf='panel', metal=0.6, rough=0.55, emit=0, texel=1.0)
    m.box(0.42, 0.36, 0.4, at=(0, -0.72, 0), bevel=0.1)
    m.steel(texel=0.4)
    for i in range(4):
        m.box(0.085, 0.1, 0.06, at=(-0.15 + i * 0.1, -0.86, 0.19), bevel=0.02, lod=1)
    m.box(0.1, 0.12, 0.26, at=(0.2, -0.6, 0.08), rot=(0, 0.2, 0), bevel=0.03, lod=1)
    # wrench-hammer: shaft along +Z, rubber grip, a striped head with striking faces, wrench jaws beyond
    m.steel(texel=1.0)
    m.cyl(0.065, 0.075, 2.0, 8, at=(0, -0.72, 0.7), rot=(PI / 2, 0, 0))
    m.rubber(texel=0.6)
    m.cyl(0.09, 0.09, 0.32, 8, at=(0, -0.72, -0.26), rot=(PI / 2, 0, 0), bevel=0.02)
    m.steel(texel=0.3)
    m.cyl(0.1, 0.1, 0.04, 8, at=(0, -0.72, -0.44), rot=(PI / 2, 0, 0), lod=1)
    m.mat(slot='dark', surf='panel', metal=0.7, rough=0.5, emit=0, texel=1.2)
    m.box(0.36, 0.72, 0.4, at=(0, -0.72, 1.6), bevel=0.07)
    m.stripe(texel=1.2)
    m.box(0.42, 0.15, 0.46, at=(0, -0.42, 1.6), bevel=0.03)
    m.box(0.42, 0.15, 0.46, at=(0, -1.02, 1.6), bevel=0.03)
    m.steel(texel=0.7)
    m.box(0.34, 0.05, 0.38, at=(0, -0.33, 1.6), bevel=0.015, lod=1)
    m.box(0.34, 0.05, 0.38, at=(0, -1.11, 1.6), bevel=0.015, lod=1)
    m.box(0.2, 0.2, 0.12, at=(0, -0.72, 1.38), bevel=0.03, lod=1)
    for s in (-1, 1):
        m.steel(texel=0.8)
        m.box(0.14, 0.2, 0.42, at=(0, -0.72 + s * 0.2, 1.98), rot=(-s * 0.25, 0, 0), bevel=0.04)
        m.glow(slot='glow2', emit=0.9, texel=0.6)
        m.box(0.02, 0.3, 0.14, at=(s * 0.185, -0.72, 1.6), bevel=0)
        m.steel(texel=0.25)
        for k in (-1, 1):
            m.bolt((s * 0.185, -0.72 + k * 0.24, 1.6), 0.03, axis=(s, 0, 0), lod=1)

    # ---- left arm: the paperwork -----------------------------------------------------------------------
    arm(m, 1, 'armL')
    m.bone('foreL', 'armL', (0, -0.74, 0))
    m.darkmetal(texel=1.0)
    m.cyl(0.21, 0.21, 0.4, 12, rot=(0, 0, PI / 2), bevel=0.03)
    m.steel(texel=0.3)
    m.cyl(0.07, 0.07, 0.44, 6, rot=(0, 0, PI / 2), lod=1)
    m.steel(texel=0.9)
    m.strut((0, 0, 0), (-0.22, -0.16, 0.52), 0.17, 0.16, 8)
    m.mat(slot='dark', surf='panel', metal=0.6, rough=0.55, emit=0, texel=0.9)
    m.box(0.34, 0.3, 0.34, at=(-0.26, -0.18, 0.6), bevel=0.08)
    m.steel(texel=0.4)
    m.box(0.1, 0.1, 0.24, at=(-0.34, -0.03, 0.66), rot=(0.4, 0.3, 0), bevel=0.03, lod=1)
    # clipboard: gripped by its bottom edge, leaning away, the schedule facing its reader
    m.push(at=(-0.3, 0.14, 0.86), rot=(0.62, 0.3, 0))
    m.wood(texel=1.3)
    m.box(0.6, 0.8, 0.05, bevel=0.015)
    m.fixed(0xfffdf2, surf='flat', rough=0.8, texel=1.2)
    m.box(0.52, 0.7, 0.02, at=(0, -0.025, -0.034), bevel=0)
    for i in range(6):
        m.fixed(0xd84a2e if i == 2 else 0x4a5560, surf='flat', rough=0.8, texel=0.3)
        m.box(0.34 - (i % 2) * 0.1, 0.03, 0.008, at=(0.03 + (i % 2) * 0.05, 0.2 - i * 0.088, -0.046), bevel=0, lod=1)
        m.fixed(0x4a5560, surf='flat', rough=0.8, texel=0.2)
        m.box(0.035, 0.035, 0.008, at=(-0.2, 0.2 - i * 0.088, -0.046), bevel=0, lod=1)
    m.steel(texel=0.6)
    m.box(0.26, 0.09, 0.08, at=(0, 0.36, -0.03), bevel=0.02, lod=1)
    m.fixed(HAZ, surf='paint', rough=0.6, texel=0.25)
    m.cyl(0.018, 0.018, 0.26, 6, at=(0.28, 0.1, -0.05), lod=1)
    # the back of the board: a hazard sticker and a unit plate
    m.stripe(texel=0.6)
    m.box(0.3, 0.1, 0.008, at=(0.1, -0.24, 0.028), bevel=0, lod=1)
    m.fixed(0xf3e3c8, surf='flat', rough=0.7, texel=0.4)
    m.box(0.2, 0.12, 0.008, at=(-0.15, 0.22, 0.028), bevel=0, lod=1)
    # fingers curled over the bottom edge
    m.steel(texel=0.3)
    for i in range(3):
        m.box(0.07, 0.12, 0.09, at=(-0.1 + i * 0.09, -0.36, 0.04), bevel=0.02, lod=1)
    m.pop()
    return m
