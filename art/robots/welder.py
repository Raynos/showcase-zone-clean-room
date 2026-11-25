"""
Welder Unit: a hunched shop-floor biped with a welding mask for a face, twin gas tanks on its
back, a torch for a right arm and a pincer for a left. 2.0 m. The gate elite Shift Boss Slag
wears hazard pauldrons and a waist band; the night elite Hot Mess is cracked and dripping.

Bones (driven by src/entities/robots/welder.ts):
  all                    root (falls over on death)
    hips                 pelvis block, y 0.95
      legL, legR         hip pivots; thigh
        shinL, shinR     knee pivots; shin, foot
      torso              waist pivot; leans forward at rest pose in game
        head             neck pivot
        armR             shoulder; upper arm and the torch
          flame          torch tip (scaled by the animation)
        armL             shoulder; upper arm
          foreL          elbow; forearm and wrist
            clawA, clawB the two pincer fingers
        opt_*            variant dressing
Palette extras set by welder.ts: top / bottom = the two tank colours, top2 = mask plate,
cloth2 = flame core.
"""
import math

from lib.kit import Model, PI

TEX = 512
BUILD = dict(ao_dist=0.5, edge_dist=0.045, edge_w=0.008, scale=2.4)

BRASS = 0xd9a441


def leg(m, name, shin, s):
    m.bone(name, 'hips', (s * 0.27, 0, 0))
    # hip drum and thigh: a dark box beam with an armour plate and a ram behind it
    m.paint('body2', texel=0.9)
    m.cyl(0.155, 0.155, 0.2, 10, at=(0, 0, 0), rot=(0, 0, PI / 2), bevel=0.02)
    m.steel(texel=0.4)
    m.cyl(0.06, 0.06, 0.03, 6, at=(s * 0.11, 0, 0), rot=(0, 0, PI / 2))
    m.darkmetal(texel=0.8)
    m.box(0.17, 0.44, 0.17, at=(0, -0.225, 0.06), rot=(-0.26, 0, 0), bevel=0.03)
    m.mat(slot='steel', surf='panel', metal=0.6, rough=0.5, emit=0, texel=1.0)
    m.box(0.21, 0.27, 0.06, at=(0, -0.2, 0.155), rot=(-0.26, 0, 0), bevel=0.02)
    m.steel(texel=0.4)
    m.strut((0, -0.04, -0.11), (0, -0.4, -0.02), 0.022, 0.022, 5)
    m.darkmetal(texel=0.4)
    m.strut((0, -0.04, -0.11), (0, -0.2, -0.065), 0.036, 0.036, 6)

    m.bone(shin, name, (0, -0.45, 0.12))
    # knee drum with a pin, chunky shin armour, ankle and a steel-capped boot
    m.paint('body', texel=0.9)
    m.cyl(0.125, 0.125, 0.27, 10, at=(0, 0, 0), rot=(0, 0, PI / 2), bevel=0.02)
    m.steel(texel=0.4)
    m.cyl(0.05, 0.05, 0.3, 6, at=(0, 0, 0), rot=(0, 0, PI / 2))
    m.darkmetal(texel=0.6)
    m.strut((0, 0, 0), (0, -0.38, -0.13), 0.1, 0.085, 6)
    m.panel('body', texel=1.2)
    m.box(0.27, 0.34, 0.2, at=(0, -0.2, -0.02), rot=(0.33, 0, 0), bevel=0.04)
    m.paint('body2', texel=0.7)
    m.box(0.2, 0.12, 0.1, at=(0, -0.08, 0.075), rot=(0.33, 0, 0), bevel=0.025)
    m.steel(texel=0.4)
    m.strut((s * 0.1, -0.1, -0.13), (s * 0.1, -0.36, -0.2), 0.02, 0.02, 5)
    m.darkmetal(texel=0.5)
    m.cyl(0.085, 0.085, 0.3, 8, at=(0, -0.385, -0.14), rot=(0, 0, PI / 2))
    m.rubber(texel=0.9)
    m.box(0.33, 0.1, 0.52, at=(s * 0.01, -0.445, -0.04), bevel=0.03)
    m.panel('body', texel=1.0)
    m.box(0.3, 0.13, 0.22, at=(0, -0.375, 0.11), bevel=0.04)
    m.darkmetal(texel=0.6)
    m.box(0.26, 0.11, 0.16, at=(0, -0.38, -0.2), bevel=0.03)
    m.steel(texel=0.5)
    m.box(0.31, 0.04, 0.06, at=(0, -0.43, 0.215), bevel=0.012)


def make():
    m = Model('welder')
    m.bone('all', None, (0, 0, 0))
    m.bone('hips', 'all', (0, 0.95, 0))
    # ---- pelvis: a dark block with a round intake grille and a skid plate ------------------
    m.mat(slot='steel', surf='panel', metal=0.6, rough=0.5, emit=0, texel=1.0)
    m.box(0.38, 0.32, 0.4, at=(0, 0.0, 0.0), bevel=0.05)
    m.paint('body', texel=0.8)
    m.cyl(0.165, 0.165, 0.05, 12, at=(0, 0.0, 0.2), rot=(PI / 2, 0, 0), bevel=0.012)
    m.fixed(0x0c0f13, surf='dark', rough=0.9, texel=0.6)
    m.cyl(0.135, 0.135, 0.06, 12, at=(0, 0.0, 0.203), rot=(PI / 2, 0, 0))
    m.steel(texel=0.4)
    for i in (-2, -1, 0, 1, 2):
        m.box(0.012, 0.26 - abs(i) * 0.04, 0.014, at=(i * 0.05, 0.0, 0.233), bevel=0)
    for i in (-1, 0, 1):
        m.box(0.25 - abs(i) * 0.05, 0.012, 0.012, at=(0, i * 0.07, 0.236), bevel=0)
    m.darkmetal(texel=0.5)
    m.box(0.3, 0.07, 0.3, at=(0, -0.15, 0), bevel=0.02)

    leg(m, 'legL', 'shinL', 1)
    leg(m, 'legR', 'shinR', -1)

    # ---- torso ------------------------------------------------------------------------------
    m.bone('torso', 'hips', (0, 0.02, 0))
    # waist: a rubber bellows between two steel collars
    m.rubber(texel=0.6)
    for i in range(3):
        m.cyl(0.2, 0.225, 0.07, 10, at=(0, 0.15 + i * 0.065, 0.02))
    m.steel(texel=0.5)
    m.cyl(0.24, 0.24, 0.035, 10, at=(0, 0.115, 0.02))
    # barrel chest: steel shell, orange yoke across the shoulders
    m.mat(slot='steel', surf='panel', metal=0.55, rough=0.5, emit=0, texel=1.5)
    m.box(0.78, 0.54, 0.58, at=(0, 0.6, 0.06), bevel=0.1)
    m.paint('body', texel=1.1)
    m.box(0.86, 0.13, 0.52, at=(0, 0.85, 0.02), bevel=0.05)
    m.paint('body2', texel=0.7)
    m.box(0.3, 0.09, 0.4, at=(0, 0.93, 0.0), bevel=0.03)
    # chest grille: a lit furnace window behind bars
    m.darkmetal(texel=0.8)
    m.box(0.56, 0.24, 0.05, at=(0, 0.53, 0.345), bevel=0.02)
    m.glow(emit=0.7, texel=1.2)
    m.box(0.48, 0.16, 0.03, at=(0, 0.53, 0.365), bevel=0)
    m.darkmetal(texel=0.4)
    for i in range(-3, 4):
        m.box(0.016, 0.17, 0.02, at=(i * 0.065, 0.53, 0.378), bevel=0)
    m.box(0.49, 0.016, 0.022, at=(0, 0.53, 0.38), bevel=0)
    # data plate and collar lamps
    m.fixed(0xffc23a, surf='flat', rough=0.6, texel=0.6)
    m.box(0.16, 0.07, 0.012, at=(0.2, 0.74, 0.351), bevel=0)
    m.glow(slot='glow2', emit=1.2, texel=0.4)
    m.box(0.05, 0.03, 0.014, at=(-0.24, 0.75, 0.352), bevel=0)
    # side louvres
    for s in (-1, 1):
        m.vent(texel=0.9)
        m.box(0.03, 0.26, 0.3, at=(s * 0.392, 0.55, 0.05), bevel=0)
    # shoulder balls
    m.steel(texel=0.9)
    for s in (-1, 1):
        m.sphere(0.2, 10, 6, at=(s * 0.47, 0.72, 0.03))
    # twin gas tanks in a bracket, with brass valves
    for s, slot in ((1, 'top'), (-1, 'bottom')):
        m.paint(slot, texel=1.0)
        m.cyl(0.13, 0.13, 0.6, 10, at=(s * 0.15, 0.62, -0.34), bevel=0.03)
        m.steel(texel=0.5)
        m.sphere(0.115, 8, 4, at=(s * 0.15, 0.92, -0.34), scale=(1, 0.55, 1))
        m.fixed(BRASS, surf='metal', metal=0.9, rough=0.35, texel=0.4)
        m.cyl(0.03, 0.03, 0.1, 6, at=(s * 0.15, 1.02, -0.34))
        m.cyl(0.055, 0.055, 0.02, 6, at=(s * 0.15, 1.07, -0.34))
    m.darkmetal(texel=0.6)
    m.box(0.56, 0.07, 0.07, at=(0, 0.48, -0.455), bevel=0.015)
    m.box(0.56, 0.07, 0.07, at=(0, 0.78, -0.455), bevel=0.015)
    m.box(0.3, 0.4, 0.1, at=(0, 0.6, -0.26), bevel=0.02)
    # gas hose to the torch shoulder
    m.rubber(texel=0.5)
    m.tube([(-0.15, 1.07, -0.34), (-0.36, 1.15, -0.22), (-0.56, 1.02, -0.06), (-0.6, 0.78, -0.02)], 0.03, 6)

    # ---- variant dressing on the torso -------------------------------------------------------
    m.bone('opt_rare', 'torso', (0, 0, 0))
    m.darkmetal(texel=0.4)
    m.strut((0.3, 0.9, -0.2), (0.3, 1.42, -0.2), 0.018, 0.008, 5)
    m.mat(slot='glow', surf='cloth', metal=0, rough=0.9, emit=0.5, texel=0.6)
    m.box(0.02, 0.15, 0.21, at=(0.3, 1.31, -0.315), bevel=0)
    m.glow(slot='glow2', emit=1.5, texel=0.4)
    m.sphere(0.035, 6, 4, at=(0.3, 1.43, -0.2))

    m.bone('opt_night', 'torso', (0, 0, 0))
    # running lights down the chest, and a work lamp bolted to the left shoulder
    for s, slot in ((1, 'glow'), (-1, 'glow2')):
        m.glow(slot=slot, emit=1.6, texel=0.5)
        m.box(0.03, 0.3, 0.02, at=(s * 0.335, 0.6, 0.356), bevel=0)
        m.box(0.02, 0.2, 0.03, at=(s * 0.2, 0.6, -0.47), bevel=0)
    m.darkmetal(texel=0.6)
    m.box(0.16, 0.13, 0.14, at=(0.44, 1.0, 0.1), bevel=0.03)
    m.strut((0.44, 0.9, 0.06), (0.44, 0.95, 0.08), 0.03, 0.03, 5)
    m.glow(slot='glow2', emit=2.0, texel=0.6)
    m.box(0.12, 0.09, 0.02, at=(0.44, 1.0, 0.175), bevel=0)

    m.bone('opt_elite', 'torso', (0, 0, 0))
    # Shift Boss Slag: hazard waist band and pauldrons, a boss's exhaust stack
    m.stripe(texel=1.3)
    m.box(0.82, 0.15, 0.62, at=(0, 0.355, 0.06), bevel=0.03)
    for s in (-1, 1):
        m.stripe(texel=1.3)
        m.box(0.34, 0.2, 0.42, at=(s * 0.5, 0.86, 0.03), rot=(0, 0, -s * 0.3), bevel=0.07, seg=2)
        m.paint('body', texel=0.6)
        m.box(0.3, 0.05, 0.38, at=(s * 0.53, 0.745, 0.03), rot=(0, 0, -s * 0.3), bevel=0.015)

    m.bone('opt_nightElite', 'torso', (0, 0, 0))
    # Hot Mess: glowing cracks across the chest, slag pooled on the shoulders and dripping
    for (x, y, l, r) in ((-0.2, 0.7, 0.3, 0.5), (0.16, 0.62, 0.26, -0.7), (0.05, 0.4, 0.2, 0.2), (-0.3, 0.44, 0.14, -0.4), (0.3, 0.76, 0.12, 0.9)):
        m.glow(emit=2.2, texel=0.5)
        m.box(l, 0.024, 0.02, at=(x, y, 0.352), rot=(0, 0, r), bevel=0)
    for (x, y, z) in ((0.4, 0.92, 0.2), (-0.36, 0.93, 0.1), (0.2, 0.94, -0.16), (-0.1, 0.93, 0.26), (0.5, 0.9, -0.05)):
        m.glow(emit=1.8, texel=0.4)
        m.sphere(0.075, 6, 4, at=(x, y, z), scale=(1, 0.55, 1))
        m.glow(slot='glow2', emit=1.8, texel=0.3)
        m.cone(0.035, 0.22, 5, at=(x, y - 0.13, z + 0.03), rot=(PI, 0, 0))

    # ---- head: a welding mask on a ball neck ---------------------------------------------------
    m.bone('head', 'torso', (0, 0.92, 0.2))
    m.darkmetal(texel=0.5)
    m.cyl(0.1, 0.12, 0.12, 8, at=(0, -0.01, -0.04))
    m.mat(slot='steel', surf='panel', metal=0.6, rough=0.45, emit=0, texel=1.3)
    m.box(0.36, 0.34, 0.34, at=(0, 0.2, -0.04), bevel=0.07)
    # the mask plate, visor slot and brow
    m.mat(slot='top2', surf='panel', metal=0.5, rough=0.5, emit=0, texel=1.4)
    m.box(0.42, 0.46, 0.12, at=(0, 0.16, 0.15), rot=(-0.12, 0, 0), bevel=0.045)
    m.steel(texel=0.8)
    m.box(0.37, 0.16, 0.03, at=(0, 0.21, 0.212), rot=(-0.12, 0, 0), bevel=0.012)
    m.glow(emit=1.2, texel=1.4)
    m.box(0.32, 0.11, 0.03, at=(0, 0.21, 0.222), rot=(-0.12, 0, 0), bevel=0)
    m.paint('body', texel=1.0)
    m.box(0.46, 0.1, 0.24, at=(0, 0.39, 0.07), bevel=0.03)
    # breather slats, hinge bolts, a lifting eye on top
    m.steel(texel=0.4)
    for i in range(3):
        m.box(0.2, 0.018, 0.02, at=(0, 0.05 - i * 0.04, 0.203 - i * 0.004), bevel=0)
    for s in (-1, 1):
        m.cyl(0.05, 0.05, 0.05, 8, at=(s * 0.215, 0.3, 0.08), rot=(0, 0, PI / 2))
    m.darkmetal(texel=0.4)
    m.box(0.05, 0.07, 0.16, at=(0, 0.46, -0.03), bevel=0.012)
    # breather hose: out of the mask's side, over the shoulder and down into the yoke
    m.steel(texel=0.4)
    m.cyl(0.05, 0.05, 0.05, 8, at=(-0.2, 0.2, -0.02), rot=(0, 0, PI / 2))
    m.rubber(texel=0.7)
    m.tube([(-0.2, 0.2, -0.02), (-0.36, 0.3, -0.04), (-0.42, 0.14, -0.2), (-0.26, -0.04, -0.3), (-0.1, -0.12, -0.28)], 0.034, 6)

    m.bone('opt_elite_head', 'head', (0, 0, 0))
    # the boss's ear lamps: amber, one each side of the mask
    for s in (-1, 1):
        m.darkmetal(texel=0.4)
        m.cyl(0.06, 0.06, 0.05, 8, at=(s * 0.245, 0.3, 0.08), rot=(0, 0, PI / 2))
        m.glow(slot='glow2', emit=1.5, texel=0.4)
        m.cyl(0.04, 0.04, 0.03, 8, at=(s * 0.275, 0.3, 0.08), rot=(0, 0, PI / 2))

    m.bone('opt_nightElite_head', 'head', (0, 0, 0))
    for i in range(6):
        a = (i / 6) * PI * 2
        m.glow(slot='glow2' if i % 2 else 'glow', emit=2.4, texel=0.35)
        m.cone(0.055, 0.2 + (i % 2) * 0.1, 5, at=(math.cos(a) * 0.15, 0.5 + (i % 2) * 0.05, -0.02 + math.sin(a) * 0.15))

    # ---- right arm: the torch ------------------------------------------------------------------
    m.bone('armR', 'torso', (-0.55, 0.72, 0.03))
    m.darkmetal(texel=0.7)
    m.strut((0, 0, 0), (0, -0.4, 0.02), 0.11, 0.095, 8)
    m.mat(slot='steel', surf='panel', metal=0.6, rough=0.5, emit=0, texel=0.8)
    m.box(0.07, 0.24, 0.2, at=(-0.1, -0.2, 0.01), bevel=0.02)
    m.paint('body', texel=0.9)
    m.cyl(0.13, 0.13, 0.25, 10, at=(0, -0.42, 0.02), rot=(0, 0, PI / 2), bevel=0.02)
    m.steel(texel=0.7)
    m.strut((0, -0.42, 0.02), (0, -0.5, 0.52), 0.095, 0.08, 8)
    m.panel('body', texel=1.2)
    m.box(0.27, 0.27, 0.27, at=(0, -0.47, 0.3), rot=(0.15, 0, 0), bevel=0.05)
    m.vent(texel=0.7)
    m.box(0.02, 0.15, 0.17, at=(-0.137, -0.47, 0.3), rot=(0.15, 0, 0), bevel=0)
    m.fixed(0xd84a2e, surf='paint', rough=0.6, texel=0.4)
    m.cyl(0.035, 0.035, 0.07, 6, at=(0, -0.31, 0.33))
    m.box(0.11, 0.02, 0.025, at=(0, -0.275, 0.33), bevel=0)
    # heat shield, brass lance, nozzle
    m.steel(texel=0.6)
    m.cyl(0.13, 0.13, 0.03, 10, at=(0, -0.5, 0.5), rot=(PI / 2 + 0.11, 0, 0))
    m.fixed(BRASS, surf='metal', metal=0.9, rough=0.35, texel=0.6)
    m.strut((0, -0.5, 0.52), (0, -0.53, 0.78), 0.055, 0.04, 8)
    m.darkmetal(texel=0.5)
    m.cyl(0.075, 0.048, 0.1, 8, at=(0, -0.535, 0.8), rot=(PI / 2 + 0.11, 0, 0))
    m.rubber(texel=0.4)
    m.tube([(-0.05, -0.02, -0.08), (-0.1, -0.3, -0.1), (-0.06, -0.5, 0.08), (-0.02, -0.56, 0.3)], 0.026, 5)

    m.bone('flame', 'armR', (0, -0.54, 0.85))
    m.glow(slot='cloth2', emit=1.8, texel=0.5)
    m.cone(0.045, 0.2, 7, at=(0, 0, 0.09), rot=(PI / 2, 0, 0))
    m.glow(emit=1.1, texel=0.5)
    m.cone(0.07, 0.12, 7, at=(0, 0, 0.05), rot=(PI / 2, 0, 0))

    # ---- left arm: the pincer -------------------------------------------------------------------
    m.bone('armL', 'torso', (0.55, 0.72, 0.03))
    m.darkmetal(texel=0.7)
    m.strut((0, 0, 0), (0, -0.4, 0.02), 0.11, 0.095, 8)
    m.mat(slot='steel', surf='panel', metal=0.6, rough=0.5, emit=0, texel=0.8)
    m.box(0.07, 0.24, 0.2, at=(0.1, -0.2, 0.01), bevel=0.02)
    m.bone('foreL', 'armL', (0, -0.42, 0.02))
    m.paint('body', texel=0.9)
    m.cyl(0.13, 0.13, 0.25, 10, at=(0, 0, 0), rot=(0, 0, PI / 2), bevel=0.02)
    m.steel(texel=0.6)
    m.strut((0, 0, 0), (0, -0.32, 0.2), 0.095, 0.085, 8)
    m.panel('body', texel=1.0)
    m.box(0.22, 0.22, 0.2, at=(0, -0.17, 0.11), rot=(0.56, 0, 0), bevel=0.04)
    m.paint('body2', texel=0.9)
    m.box(0.27, 0.19, 0.23, at=(0, -0.36, 0.23), rot=(0.5, 0, 0), bevel=0.05)
    m.steel(texel=0.4)
    m.strut((0.06, -0.03, -0.09), (0.06, -0.3, 0.1), 0.02, 0.02, 5)
    for nm, s in (('clawA', 1), ('clawB', -1)):
        m.bone(nm, 'foreL', (s * 0.09, -0.4, 0.27))
        m.darkmetal(texel=0.7)
        m.box(0.075, 0.085, 0.3, at=(0, -0.05, 0.11), rot=(0.5, s * 0.25, 0), bevel=0.018)
        m.steel(texel=0.4)
        m.box(0.05, 0.06, 0.1, at=(-s * 0.035, -0.115, 0.235), rot=(0.5, -s * 0.5, 0), bevel=0.012)
    return m
