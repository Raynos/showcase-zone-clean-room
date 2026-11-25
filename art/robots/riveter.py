"""
Riveter: a strutting gun-walker. A wide armoured hull on reverse-knee legs, a rivet gun for a
nose, a hopper of loose rivets on its back and one roving eye on a cheek pod. 1.9 m.
Old Reliable (elite) carries gun shields, hazard plate and tall stacks; Riveting Rita (night
elite) ties a polka-dot bandana over the hopper and rolls her sleeves.

Bones (driven by src/entities/robots/riveter.ts):
  base                     pelvis, y 1.02
    turret                 the hull; yaws and pitches to aim
      barrel               slides back along Z on recoil
      drum                 the rivet pile in the hopper; spins about Y
      eye                  the sensor pod; scans about Y
      opt_*                variant dressing
    thighL, thighR         hip pivots
      shinL, shinR         knee pivots; shin, ankle, foot
"""
import math

from lib.kit import Model, PI

TEX = 512
BUILD = dict(ao_dist=0.5, edge_dist=0.045, edge_w=0.008, scale=2.4)

CHROME = 0xd8dde2
RED = 0xd9342b
CUFF = 0xdfe6ee


def leg(m, s, th, sh):
    m.bone(th, 'base', (s * 0.5, 0, 0))
    # hip drum, a box-beam thigh running down and back, its armour plate and a ram
    m.paint('body2', texel=0.9)
    m.cyl(0.19, 0.19, 0.2, 10, at=(-s * 0.03, 0, 0), rot=(0, 0, PI / 2), bevel=0.025)
    m.steel(texel=0.4)
    m.cyl(0.07, 0.07, 0.04, 6, at=(s * 0.09, 0, 0), rot=(0, 0, PI / 2))
    m.darkmetal(texel=0.8)
    m.strut((0, 0, 0), (0, -0.42, -0.32), 0.13, 0.105, 8)
    m.panel('body', texel=1.2)
    m.box(0.3, 0.42, 0.12, at=(0, -0.15, -0.235), rot=(0.65, 0, 0), bevel=0.035)
    m.fixed(CHROME, surf='metal', metal=0.9, rough=0.3, texel=0.4)
    m.strut((0, 0.02, 0.15), (0, -0.37, -0.2), 0.026, 0.026, 5)
    m.darkmetal(texel=0.4)
    m.strut((0, 0.02, 0.15), (0, -0.16, -0.01), 0.045, 0.045, 6)

    m.bone(sh, th, (0, -0.42, -0.32))
    # knee drum and pin, shin with a chrome ram, ankle, and a clawed foot
    m.paint('body2', texel=0.9)
    m.cyl(0.15, 0.15, 0.27, 10, at=(0, 0, 0), rot=(0, 0, PI / 2), bevel=0.02)
    m.steel(texel=0.4)
    m.cyl(0.055, 0.055, 0.3, 6, at=(0, 0, 0), rot=(0, 0, PI / 2))
    m.steel(texel=0.8)
    m.strut((0, 0, 0), (0, -0.5, 0.3), 0.1, 0.08, 8)
    m.panel('body', texel=1.0)
    m.box(0.22, 0.3, 0.07, at=(0, -0.21, 0.215), rot=(-0.54, 0, 0), bevel=0.02)
    m.fixed(CHROME, surf='metal', metal=0.9, rough=0.3, texel=0.4)
    m.strut((0, -0.126, -0.04), (0, -0.451, 0.154), 0.03, 0.03, 5)
    m.darkmetal(texel=0.5)
    m.cyl(0.1, 0.1, 0.3, 8, at=(0, -0.5, 0.3), rot=(0, 0, PI / 2))
    m.mat(slot='dark', surf='panel', metal=0.6, rough=0.55, emit=0, texel=1.0)
    m.box(0.36, 0.1, 0.5, at=(0, -0.55, 0.38), bevel=0.03)
    m.paint('body', texel=0.8)
    m.box(0.3, 0.08, 0.22, at=(0, -0.49, 0.48), bevel=0.025)
    m.fixed(CHROME, surf='metal', metal=0.9, rough=0.3, texel=0.3)
    m.strut((0, -0.3, 0.27), (0, -0.47, 0.5), 0.02, 0.02, 5)
    m.steel(texel=0.4)
    for k in (-1, 1):
        m.cone(0.05, 0.16, 5, at=(k * 0.11, -0.56, 0.68), rot=(PI / 2, 0, 0))
    m.cone(0.045, 0.16, 5, at=(0, -0.54, 0.1), rot=(-PI / 2 - 0.3, 0, 0))


def make():
    m = Model('riveter')
    m.bone('base', None, (0, 1.02, 0))
    # ---- pelvis: a dark block, the slew ring the hull turns on, a striped bumper ------------
    m.mat(slot='dark', surf='panel', metal=0.6, rough=0.55, emit=0, texel=1.1)
    m.box(0.72, 0.26, 0.5, bevel=0.06)
    m.steel(texel=0.8)
    m.cyl(0.3, 0.34, 0.14, 12, at=(0, 0.18, 0))
    m.darkmetal(texel=0.5)
    m.cyl(0.36, 0.36, 0.04, 12, at=(0, 0.13, 0))
    m.paint('body2', texel=0.8)
    m.box(0.3, 0.16, 0.22, at=(0, -0.16, 0.05), bevel=0.04)
    m.stripe(texel=0.9)
    m.box(0.6, 0.08, 0.03, at=(0, 0.02, 0.255), bevel=0)
    # battery pack on the tail with a status light
    m.darkmetal(texel=0.7)
    m.box(0.36, 0.2, 0.14, at=(0, 0.0, -0.3), bevel=0.03)
    m.glow(slot='glow2', emit=1.2, texel=0.4)
    m.box(0.08, 0.04, 0.012, at=(0.1, 0.04, -0.372), bevel=0)
    m.vent(texel=0.6)
    m.box(0.14, 0.1, 0.012, at=(-0.08, 0.0, -0.372), bevel=0)

    leg(m, 1, 'thighL', 'shinL')
    leg(m, -1, 'thighR', 'shinR')

    # ---- the hull: a low armoured tub, a casemate on top of it, a mantlet for a nose ----------
    m.bone('turret', 'base', (0, 0.24, 0))
    m.panel('body', texel=1.5)
    m.box(1.2, 0.36, 0.82, at=(0, 0.22, 0), bevel=0.07)
    m.box(0.98, 0.3, 0.72, at=(0, 0.5, -0.03), bevel=0.08)
    m.paint('body2', texel=0.9)
    m.box(0.96, 0.16, 0.3, at=(0, 0.1, 0.37), rot=(0.6, 0, 0), bevel=0.03)
    m.box(0.7, 0.05, 0.2, at=(0, 0.6, 0.36), rot=(0.5, 0, 0), bevel=0.015)
    # mantlet with a warning band over the gun port
    m.mat(slot='dark', surf='panel', metal=0.6, rough=0.55, emit=0, texel=1.0)
    m.box(0.56, 0.42, 0.24, at=(0, 0.3, 0.44), bevel=0.06)
    m.stripe(texel=0.9)
    m.box(0.5, 0.07, 0.03, at=(0, 0.455, 0.56), bevel=0)
    # armoured cheek pods on trunnions
    for s in (-1, 1):
        m.panel('body2', texel=1.3)
        m.box(0.2, 0.62, 0.7, at=(s * 0.68, 0.32, -0.02), bevel=0.05)
        m.steel(texel=0.4)
        m.cyl(0.075, 0.075, 0.06, 8, at=(s * 0.79, 0.32, 0.1), rot=(0, 0, PI / 2))
        m.vent(texel=0.7)
        m.box(0.016, 0.2, 0.26, at=(s * 0.785, 0.36, -0.2), bevel=0)
        # a raised strike plate up front, a warning strip along the sill, spare rivet tubes on top
        m.panel('body', texel=0.9)
        m.box(0.05, 0.4, 0.24, at=(s * 0.775, 0.36, 0.2), bevel=0.015)
        m.stripe(texel=0.8)
        m.box(0.215, 0.07, 0.6, at=(s * 0.68, 0.055, -0.02), bevel=0)
        for i in range(3):
            m.darkmetal(texel=0.4)
            m.cyl(0.045, 0.045, 0.2, 7, at=(s * 0.68, 0.66, -0.26 + i * 0.11), rot=(0.9, 0, 0))
            m.fixed(CHROME, surf='metal', metal=0.9, rough=0.3, texel=0.25)
            m.cyl(0.036, 0.036, 0.03, 7, at=(s * 0.68, 0.727, -0.176 + i * 0.11), rot=(0.9, 0, 0))
    # ammo hopper: a steel funnel with a rim, sunk into the casemate roof
    m.steel(texel=1.0)
    m.cyl(0.36, 0.2, 0.36, 14, at=(0.12, 0.72, -0.14))
    m.paint('body2', texel=0.8)
    m.cyl(0.39, 0.39, 0.06, 14, at=(0.12, 0.9, -0.14), bevel=0.012)
    m.fixed(0x0c0f13, surf='dark', rough=0.9, texel=0.4)
    m.cyl(0.34, 0.34, 0.02, 14, at=(0.12, 0.925, -0.14))
    # feed chute from the hopper, over the casemate and down into the breech
    m.rubber(texel=0.7)
    m.tube([(0.12, 0.7, 0.1), (0.1, 0.74, 0.34), (0.05, 0.62, 0.46), (0.04, 0.5, 0.48)], 0.065, 6)
    m.steel(texel=0.4)
    m.cyl(0.085, 0.085, 0.04, 8, at=(0.04, 0.52, 0.48))
    m.cyl(0.078, 0.078, 0.03, 8, at=(0.1, 0.74, 0.3), rot=(PI / 2, 0, 0))
    # headlamp and tow eyes on the bow
    m.darkmetal(texel=0.4)
    m.cyl(0.075, 0.075, 0.07, 8, at=(0.42, 0.26, 0.42), rot=(PI / 2, 0, 0))
    m.fixed(0xfff3d0, surf='glass', rough=0.2, emit=0.3, texel=0.4)
    m.cyl(0.058, 0.058, 0.02, 8, at=(0.42, 0.26, 0.46), rot=(PI / 2, 0, 0))
    m.steel(texel=0.3)
    for s in (-1, 1):
        m.torus(0.045, 0.014, 8, 4, at=(s * 0.4, 0.08, 0.46), rot=(0, 0, PI / 2))
    # roof: a hatch with a handle, a grab rail, a whip aerial
    m.paint('body2', texel=0.6)
    m.cyl(0.13, 0.13, 0.03, 10, at=(-0.3, 0.66, -0.22))
    m.steel(texel=0.3)
    m.box(0.12, 0.03, 0.025, at=(-0.3, 0.69, -0.22), bevel=0)
    m.tube([(0.26, 0.64, 0.3), (0.26, 0.73, 0.3), (0.45, 0.73, 0.3), (0.45, 0.64, 0.3)], 0.016, 5)
    m.darkmetal(texel=0.3)
    m.strut((0.44, 0.64, -0.32), (0.44, 1.1, -0.36), 0.012, 0.006, 5)
    m.glow(slot='glow2', emit=1.4, texel=0.3)
    m.sphere(0.022, 5, 3, at=(0.44, 1.11, -0.36))
    # tail: exhausts, louvres, a hot vent slot, a spare rivet canister strapped on
    for s in (-1, 1):
        m.darkmetal(texel=0.6)
        m.cyl(0.06, 0.07, 0.3, 7, at=(s * 0.38, 0.7, -0.4), rot=(-0.5, 0, 0))
        m.steel(texel=0.3)
        m.cyl(0.075, 0.065, 0.05, 7, at=(s * 0.38, 0.83, -0.47), rot=(-0.5, 0, 0))
    m.vent(texel=0.9)
    m.box(0.6, 0.18, 0.016, at=(0, 0.5, -0.392), bevel=0)
    m.glow(emit=0.9, texel=0.7)
    m.box(0.5, 0.06, 0.016, at=(0, 0.3, -0.413), bevel=0)
    m.fixed(CHROME, surf='metal', metal=0.9, rough=0.3, texel=0.6)
    m.cyl(0.07, 0.07, 0.34, 8, at=(0.0, 0.14, -0.455), rot=(0, 0, PI / 2), bevel=0.012)
    m.darkmetal(texel=0.3)
    for s in (-1, 1):
        m.cyl(0.078, 0.078, 0.03, 8, at=(s * 0.1, 0.14, -0.455), rot=(0, 0, PI / 2))

    # ---- variant dressing on the hull -----------------------------------------------------------
    m.bone('opt_rare', 'turret', (0, 0, 0))
    m.darkmetal(texel=0.4)
    m.strut((-0.42, 0.64, -0.3), (-0.42, 1.2, -0.3), 0.018, 0.008, 5)
    m.mat(slot='glow', surf='cloth', metal=0, rough=0.9, emit=0.5, texel=0.6)
    m.box(0.02, 0.16, 0.23, at=(-0.42, 1.08, -0.425), bevel=0)
    m.glow(slot='glow2', emit=1.5, texel=0.4)
    m.sphere(0.035, 6, 4, at=(-0.42, 1.21, -0.3))

    m.bone('opt_night', 'turret', (0, 0, 0))
    # running lights down the pods and a pair of searchlights on top of them
    for s, slot in ((1, 'glow'), (-1, 'glow2')):
        m.glow(slot=slot, emit=1.6, texel=0.5)
        m.box(0.02, 0.05, 0.52, at=(s * 0.788, 0.54, -0.02), bevel=0)
        m.darkmetal(texel=0.6)
        m.box(0.16, 0.14, 0.18, at=(s * 0.68, 0.7, 0.22), bevel=0.03)
        m.glow(slot='glow2' if s > 0 else 'glow', emit=2.0, texel=0.6)
        m.box(0.12, 0.1, 0.02, at=(s * 0.68, 0.7, 0.315), bevel=0)

    m.bone('opt_elite', 'turret', (0, 0, 0))
    # Old Reliable: hazard plate on the pods, splinter shields either side of the gun, tall stacks
    for s in (-1, 1):
        m.stripe(texel=1.4)
        m.box(0.05, 0.56, 0.64, at=(s * 0.8, 0.32, -0.02), bevel=0.012)
        m.mat(slot='steel', surf='panel', metal=0.6, rough=0.5, emit=0, texel=1.1)
        m.box(0.32, 0.44, 0.05, at=(s * 0.47, 0.28, 0.58), rot=(0, s * 0.4, 0), bevel=0.015)
        m.stripe(texel=0.9)
        m.box(0.325, 0.11, 0.06, at=(s * 0.47, 0.13, 0.58), rot=(0, s * 0.4, 0), bevel=0)
        m.darkmetal(texel=0.3)
        m.box(0.08, 0.06, 0.14, at=(s * 0.42, 0.3, 0.5), rot=(0, s * 0.4, 0), bevel=0)
        m.darkmetal(texel=0.7)
        m.cyl(0.07, 0.08, 0.62, 8, at=(s * 0.4, 0.84, -0.5), bevel=0.01)
        m.steel(texel=0.4)
        m.cyl(0.09, 0.075, 0.06, 8, at=(s * 0.4, 1.17, -0.5))

    m.bone('opt_nightElite', 'turret', (0, 0, 0))
    # Riveting Rita: red polka-dot bandana over the hopper, knot up front, sleeves rolled
    m.fixed(RED, surf='cloth', rough=0.9, texel=1.0)
    m.sphere(0.45, 12, 5, at=(0.12, 0.91, -0.14), scale=(1, 0.52, 1))
    m.sphere(0.09, 6, 4, at=(0.12, 0.98, 0.3))
    for s in (-1, 1):
        m.cone(0.085, 0.17, 5, at=(0.12 + s * 0.1, 1.06, 0.31), rot=(0, 0, -s * 0.75), scale=(1, 1, 0.4))
    m.fixed(0xffffff, surf='cloth', rough=0.9, texel=0.3)
    for i in range(9):
        a = i * 0.7 + 0.2
        h = 0.06 + (i % 2) * 0.08
        r = 0.44 * math.cos(h / 0.24)
        m.sphere(0.055, 6, 3, at=(0.12 + math.cos(a) * r * 0.95, 0.925 + h * 0.9, -0.14 + math.sin(a) * r * 0.95), scale=(1, 0.8, 1))
    m.fixed(CUFF, surf='cloth', rough=0.85, texel=0.8)
    for s in (-1, 1):
        m.box(0.27, 0.11, 0.77, at=(s * 0.68, 0.06, -0.02), bevel=0.035)

    # ---- the eye: a hooded lens on a cheek pod ---------------------------------------------------
    m.bone('eye', 'turret', (-0.34, 0.8, 0.2))
    m.darkmetal(texel=0.5)
    m.cyl(0.06, 0.075, 0.1, 8, at=(0, -0.14, -0.02))
    m.darkmetal(texel=0.9)
    m.box(0.26, 0.24, 0.2, bevel=0.05)
    m.paint('body', texel=0.7)
    m.box(0.3, 0.045, 0.26, at=(0, 0.135, 0.02), bevel=0.012)
    m.steel(texel=0.6)
    m.cyl(0.105, 0.105, 0.05, 10, at=(0, 0, 0.1), rot=(PI / 2, 0, 0))
    m.glow(emit=1.3, texel=1.2)
    m.sphere(0.078, 10, 5, at=(0, 0, 0.115), scale=(1, 1, 0.5))
    m.fixed(0x071015, surf='flat', rough=0.3, texel=0.4)
    m.sphere(0.03, 6, 3, at=(-0.01, 0.012, 0.152), scale=(1, 1, 0.5))
    m.bone('opt_nightElite_eye', 'eye', (0, 0, 0))
    m.fixed(0x15181d, surf='flat', rough=0.6, texel=0.3)
    for i in (-1, 0, 1):
        m.cone(0.016, 0.1, 4, at=(i * 0.07, 0.15, 0.13), rot=(0.9, 0, -i * 0.35))

    # ---- the rivet pile: loose chrome in the hopper, stirred by an agitator ----------------------
    m.bone('drum', 'turret', (0.12, 0.93, -0.14))
    m.darkmetal(texel=0.4)
    m.box(0.56, 0.03, 0.05, at=(0, 0.03, 0), bevel=0)
    m.cyl(0.04, 0.04, 0.08, 6, at=(0, 0.03, 0))
    m.fixed(CHROME, surf='metal', metal=0.9, rough=0.3, texel=0.35)
    for i in range(8):
        a = i * 2.4
        r = 0.08 + (i % 3) * 0.085
        m.sphere(0.07, 6, 3, at=(math.cos(a) * r, 0.01 + (i % 2) * 0.04, math.sin(a) * r))

    # ---- the gun -----------------------------------------------------------------------------------
    m.bone('barrel', 'turret', (0, 0.3, 0.52))
    m.steel(texel=0.9)
    m.cyl(0.15, 0.15, 0.34, 10, at=(0, 0, 0.17), rot=(PI / 2, 0, 0), bevel=0.02)
    m.darkmetal(texel=0.4)
    for i in range(3):
        m.cyl(0.17, 0.17, 0.03, 10, at=(0, 0, 0.08 + i * 0.09), rot=(PI / 2, 0, 0))
    m.darkmetal(texel=0.8)
    m.cyl(0.1, 0.1, 0.5, 9, at=(0, 0, 0.55), rot=(PI / 2, 0, 0))
    m.paint('body', texel=0.9)
    m.cyl(0.16, 0.14, 0.16, 10, at=(0, 0, 0.84), rot=(PI / 2, 0, 0), bevel=0.015)
    m.glow(emit=0.8, texel=0.6)
    m.cyl(0.062, 0.062, 0.02, 9, at=(0, 0, 0.915), rot=(PI / 2, 0, 0))
    # recoil cylinder over the barrel
    m.steel(texel=0.5)
    m.cyl(0.045, 0.045, 0.4, 6, at=(0, 0.17, 0.2), rot=(PI / 2, 0, 0))
    m.darkmetal(texel=0.3)
    m.box(0.06, 0.1, 0.05, at=(0, 0.14, 0.32), bevel=0)
    m.fixed(CHROME, surf='metal', metal=0.9, rough=0.3, texel=0.4)
    for s in (-1, 1):
        m.cyl(0.03, 0.03, 0.6, 5, at=(s * 0.18, -0.06, 0.3), rot=(PI / 2, 0, 0))

    # ---- variant dressing on the legs ----------------------------------------------------------------
    for th, sh in (('thighL', 'shinL'), ('thighR', 'shinR')):
        m.bone('opt_elite_' + sh, sh, (0, 0, 0))
        m.stripe(texel=1.0)
        m.box(0.25, 0.32, 0.05, at=(0, -0.19, 0.25), rot=(-0.54, 0, 0), bevel=0.012)
        m.bone('opt_night_' + sh, sh, (0, 0, 0))
        m.glow(slot='glow' if sh == 'shinL' else 'glow2', emit=1.6, texel=0.4)
        m.box(0.03, 0.24, 0.02, at=(0, -0.187, 0.255), rot=(-0.54, 0, 0), bevel=0)
        m.bone('opt_nightElite_' + th, th, (0, 0, 0))
        m.fixed(CUFF, surf='cloth', rough=0.85, texel=0.6)
        m.strut((0, -0.19, -0.144), (0, -0.26, -0.2), 0.17, 0.165, 8)
    return m
