"""
Arc Sentry: a tripod tesla mast that treats trespassers as a grounding path. 3.2 m tall.

Bones (driven by src/entities/robots/sentry.ts):
  body               hub pivot, 1.5 m up
    leg0..leg2       back, front-right, front-left; each hinges about its own tangent axis
                     (the rig turns them with a quaternion: the bones carry no rest rotation)
    mast             everything above the legs; topples in death, squashes when it fires
      collar         the capacitor carousel, turns slowly
      core           the charge core under the hub, swells with the charge
      ringA, ringB   the two floating field rings
      eyeP > eye     the eye pod rides a rail around the hub (eyeP yaws, eye pitches)
      arcs           the discharge bolts around the ball, scaled up from nothing
    opt_<variant>... variant dressing (also under mast and the legs)
"""
import math

from lib.kit import Model, PI

TEX = 512
BUILD = dict(ao_dist=0.4, edge_dist=0.03, edge_w=0.008, scale=1.0)

YELLOW = 0xf2b632
CHROME = 0xd8dde2
CERAMIC = 'wood'        # insulator sheds: slot wood carries the ceramic
BRASS = 'woodDark'      # field rings and terminals: slot woodDark carries the brass
LEG_YAW = (PI, PI / 3, -PI / 3)


def ring(m, R, n, tube, seg):
    m.steel(slot=BRASS, texel=0.9)
    m.torus(R, tube, seg, 4)
    for i in range(n):
        a = (i / n) * PI * 2
        m.glow(emit=0.95, texel=0.5)
        m.sphere(0.075, 6, 4, at=(math.cos(a) * R, 0, math.sin(a) * R))
        m.darkmetal(texel=0.5)
        b = a + 0.4
        m.box(0.1, 0.13, 0.14, at=(math.cos(b) * R, 0, math.sin(b) * R), rot=(0, -b, 0), bevel=0.02)


def make():
    m = Model('sentry')
    m.bone('body', None, (0, 1.5, 0))

    # ---- legs -------------------------------------------------------------------------------
    for i, yaw in enumerate(LEG_YAW):
        m.bone('leg%d' % i, 'body', (0.3 * math.sin(yaw), 0, 0.3 * math.cos(yaw)))
        m.push(rot=(0, yaw, 0))
        K = (0, 0.42, 0.62)
        # hip clevis, thigh and its brace
        m.darkmetal(texel=0.6)
        m.box(0.22, 0.17, 0.2, at=(0, 0.01, 0.03), bevel=0.03)
        m.darkmetal(texel=0.9)
        m.strut((0, 0.02, 0.06), K, 0.125, 0.1, 6)
        m.steel(texel=0.3)
        m.strut((0, -0.09, 0.1), (0, 0.24, 0.6), 0.022, 0.022, 4)
        # knee hub
        m.paint('body', texel=0.9)
        m.cyl(0.16, 0.16, 0.22, 10, at=K, rot=(0, 0, PI / 2), bevel=0.022)
        m.steel(texel=0.3)
        m.cyl(0.07, 0.07, 0.26, 6, at=K, rot=(0, 0, PI / 2))
        # shin, armour panel, hazard cuff
        m.steel(texel=1.0)
        m.strut(K, (0, -1.34, 0.964), 0.105, 0.06, 6)
        m.panel('body', texel=1.1)
        m.box(0.26, 0.66, 0.1, at=(0, -0.12, 0.8), rot=(-0.193, 0, 0), bevel=0.03)
        m.stripe(YELLOW, texel=0.9)
        m.box(0.19, 0.15, 0.19, at=(0, -0.95, 0.888), rot=(-0.193, 0, 0), bevel=0.012)
        # ram across the knee
        m.darkmetal(texel=0.4)
        m.strut((0, 0.1, 0.3), (0, 0.045, 0.5), 0.045, 0.045, 6)
        m.fixed(CHROME, surf='metal', metal=1.0, rough=0.25, texel=0.3)
        m.strut((0, 0.045, 0.5), (0, -0.02, 0.7), 0.024, 0.024, 5)
        # feed cable down the outside
        m.rubber(texel=0.3)
        m.tube([(0.1, 0.04, 0.08), (0.13, 0.36, 0.5), (0.15, 0.3, 0.74), (0.1, -0.4, 0.8)], 0.017, seg=4)
        # ankle, pad and three ground claws
        m.steel(texel=0.4)
        m.sphere(0.085, 7, 4, at=(0, -1.36, 0.966))
        m.darkmetal(texel=0.7)
        m.cyl(0.19, 0.25, 0.09, 9, at=(0, -1.44, 0.98))
        m.rubber(texel=0.4)
        m.cyl(0.265, 0.27, 0.03, 9, at=(0, -1.487, 0.98))
        for a in (-1.0, 0.0, 1.0):
            m.push(at=(0, -1.44, 0.98), rot=(0, a, 0))
            m.steel(texel=0.3)
            m.cone(0.055, 0.2, 4, at=(0, 0.0, 0.27), rot=(PI / 2 + 0.3, 0, 0))
            m.pop()
        m.pop()

        m.bone('opt_night_leg%d' % i, 'leg%d' % i, (0, 0, 0))
        m.push(rot=(0, yaw, 0))
        m.glow(slot='glow2', emit=1.2, texel=0.4)
        m.box(0.03, 0.5, 0.02, at=(0, -0.12, 0.858), rot=(-0.193, 0, 0), bevel=0)
        m.pop()
        m.bone('opt_elite_leg%d' % i, 'leg%d' % i, (0, 0, 0))
        m.push(rot=(0, yaw, 0))
        # striped greaves and a knee spike
        m.stripe(0xffc23a, texel=1.1)
        m.box(0.3, 0.7, 0.06, at=(0, -0.12, 0.845), rot=(-0.193, 0, 0), bevel=0.014)
        m.steel(texel=0.4)
        m.cone(0.07, 0.26, 5, at=(0, 0.6, 0.72), rot=(0.5, 0, 0))
        m.pop()

    # ---- hub: armoured drum on the mast bone, eye rails, the cone under it ----------------------
    m.bone('mast', 'body', (0, 0, 0))
    m.paint('body', texel=1.2)
    m.cyl(0.46, 0.5, 0.3, 12, bevel=0.03)
    m.stripe(YELLOW, texel=1.0)
    m.cyl(0.52, 0.52, 0.08, 12, at=(0, -0.02, 0), cap=False)
    m.steel(texel=0.4)
    for y in (-0.085, 0.045):
        m.cyl(0.528, 0.528, 0.022, 12, at=(0, y, 0), cap=False)
    m.darkmetal(texel=0.8)
    m.cyl(0.36, 0.2, 0.26, 10, at=(0, -0.27, 0))
    m.cyl(0.34, 0.44, 0.16, 10, at=(0, 0.22, 0))
    for k in range(3):
        a = k * PI * 2 / 3 + PI / 3
        m.steel(texel=0.25)
        m.strut((math.sin(a) * 0.2, -0.38, math.cos(a) * 0.2), (math.sin(a) * 0.13, -0.56, math.cos(a) * 0.13), 0.014, 0.014, 3)
    m.darkmetal(texel=0.3)
    m.cyl(0.15, 0.15, 0.02, 6, at=(0, -0.565, 0), cap=False)

    # ---- mast: column, four ceramic sheds, collar, the discharge ball in three horns ------------
    m.steel(texel=0.9)
    m.cyl(0.11, 0.15, 1.15, 8, at=(0, 0.85, 0), cap=False)
    for k in range(4):
        y = 0.5 + k * 0.25
        rb, rt = 0.29 - k * 0.02, 0.2 - k * 0.012
        m.mat(slot=CERAMIC, surf='paint', metal=0.05, rough=0.35, emit=0, texel=0.9)
        m.lathe([(0.12, y - 0.05), (rb, y - 0.045), (rb * 0.97, y - 0.02), (rt * 0.72, y + 0.04), (0.11, y + 0.05)], 10, cap=False)
    m.darkmetal(texel=0.6)
    m.cyl(0.2, 0.12, 0.12, 9, at=(0, 1.42, 0))
    m.fixed(CHROME, surf='metal', metal=1.0, rough=0.22, texel=1.0)
    m.sphere(0.26, 11, 7, at=(0, 1.66, 0))
    m.glow(emit=1.0, texel=0.7)
    m.torus(0.272, 0.024, 12, 3, at=(0, 1.66, 0))
    for k in range(3):
        a = k * PI * 2 / 3
        sx, cz = math.sin(a), math.cos(a)
        m.steel(slot=BRASS, texel=0.5)
        m.tube([(sx * 0.17, 1.4, cz * 0.17), (sx * 0.42, 1.5, cz * 0.42), (sx * 0.47, 1.74, cz * 0.47), (sx * 0.37, 1.97, cz * 0.37)], 0.024, seg=4, r_end=0.012)
        m.glow(slot='glow2', emit=1.1, texel=0.3)
        m.sphere(0.03, 5, 3, at=(sx * 0.365, 1.985, cz * 0.365))
    # vents in the drum between the legs
    for k in range(3):
        a = k * PI * 2 / 3
        m.push(rot=(0, a, 0))
        m.vent(texel=0.6)
        m.box(0.22, 0.09, 0.02, at=(0, 0.095, 0.468), bevel=0)
        m.pop()

    # ---- variant dressing on the mast -----------------------------------------------------
    m.bone('opt_night_mast', 'mast', (0, 0, 0))
    for k in range(6):
        a = k * PI / 3 + PI / 6
        m.glow(slot='glow' if k % 2 else 'glow2', emit=0.9, texel=0.3)
        m.box(0.06, 0.05, 0.05, at=(math.sin(a) * 0.5, 0.11, math.cos(a) * 0.5), rot=(0, a, 0), bevel=0)
    m.glow(slot='glow2', emit=1.1, texel=0.4)
    m.cyl(0.205, 0.205, 0.016, 9, at=(0, 1.385, 0), cap=False)
    # a warning lamp on a bracket each side of the collar
    for s in (-1, 1):
        m.darkmetal(texel=0.3)
        m.strut((s * 0.14, 1.36, 0), (s * 0.3, 1.3, 0), 0.016, 0.016, 4)
        m.glow(slot='glow', emit=1.2, texel=0.4)
        m.cyl(0.04, 0.05, 0.07, 6, at=(s * 0.32, 1.27, 0))

    m.bone('opt_rare_mast', 'mast', (0, 0, 0))
    # a polished band, a pennant on the hub and a lightning rod on the ball
    m.steel(slot='trim', texel=0.9)
    m.cyl(0.526, 0.526, 0.09, 12, at=(0, -0.02, 0), cap=False)
    m.darkmetal(texel=0.3)
    m.strut((0.3, 0.15, -0.3), (0.34, 0.9, -0.34), 0.016, 0.008, 5)
    m.mat(slot='glow', surf='cloth', metal=0, rough=0.9, emit=0.5, texel=0.7)
    m.prism([(0, 0), (0.34, 0.09), (0, 0.2)], 0.014, at=(0.334, 0.66, -0.345), rot=(0, PI / 2 + PI / 4, 0))
    m.steel(slot='trim', texel=0.5)
    m.cone(0.045, 0.4, 6, at=(0, 2.1, 0))
    m.glow(slot='glow2', emit=1.3, texel=0.3)
    m.sphere(0.035, 6, 4, at=(0, 2.31, 0))

    m.bone('opt_elite_mast', 'mast', (0, 0, 0))
    # a crown on the ball and a lesser coil standing on the hub over each leg
    r = 0.2
    m.push(at=(0, 1.86, 0))
    m.steel(slot='trim', texel=0.7)
    m.cyl(r * 1.02, r * 1.08, r * 0.3, 10, at=(0, r * 0.15, 0), bevel=0.008)
    for k in range(6):
        a = (k / 6) * PI * 2 + PI / 2
        cx, cz = math.cos(a) * r * 0.92, math.sin(a) * r * 0.92
        m.steel(slot='trim', texel=0.5)
        m.cone(r * 0.2, r * 0.7, 4, at=(cx, r * 0.62, cz))
        m.glow(emit=1.5, texel=0.3)
        m.sphere(r * 0.1, 5, 4, at=(cx, r * 1.0, cz))
    m.pop()
    for yaw in LEG_YAW:
        sx, cz = math.sin(yaw) * 0.52, math.cos(yaw) * 0.52
        m.darkmetal(texel=0.4)
        m.cyl(0.07, 0.09, 0.1, 7, at=(sx, 0.19, cz))
        m.mat(slot=CERAMIC, surf='paint', metal=0.05, rough=0.35, emit=0, texel=0.5)
        for j in range(2):
            m.cyl(0.05, 0.11, 0.07, 8, at=(sx, 0.29 + j * 0.1, cz), cap=False)
        m.steel(texel=0.3)
        m.cyl(0.035, 0.04, 0.3, 5, at=(sx, 0.36, cz), cap=False)
        m.fixed(CHROME, surf='metal', metal=1.0, rough=0.22, texel=0.5)
        m.sphere(0.085, 7, 5, at=(sx, 0.55, cz))
        m.glow(slot='glow2', emit=1.1, texel=0.3)
        m.torus(0.09, 0.012, 8, 3, at=(sx, 0.55, cz))

    # ---- capacitor carousel -----------------------------------------------------------------
    m.bone('collar', 'mast', (0, 0, 0))
    m.darkmetal(texel=0.5)
    m.cyl(0.46, 0.47, 0.035, 12, at=(0, 0.172, 0))
    m.steel(texel=0.3)
    m.cyl(0.19, 0.19, 0.05, 8, at=(0, 0.345, 0), cap=False)
    for k in range(3):
        a = k * PI * 2 / 3 + PI
        sx, cz = math.sin(a), math.cos(a)
        m.paint('body2', texel=0.8)
        m.cyl(0.085, 0.085, 0.3, 8, at=(sx * 0.38, 0.34, cz * 0.38), bevel=0.012)
        m.steel(slot=BRASS, texel=0.3)
        m.cyl(0.03, 0.03, 0.08, 5, at=(sx * 0.38, 0.52, cz * 0.38))
        m.rubber(texel=0.25)
        m.tube([(sx * 0.38, 0.55, cz * 0.38), (sx * 0.33, 0.62, cz * 0.33), (sx * 0.24, 0.5, cz * 0.24), (sx * 0.18, 0.36, cz * 0.18)], 0.014, seg=4)

    # ---- charge core under the hub -----------------------------------------------------------
    m.bone('core', 'mast', (0, -0.44, 0))
    m.glow(slot='glow2', emit=0.9, texel=0.8)
    m.sphere(0.115, 8, 5)

    # ---- field rings --------------------------------------------------------------------------
    m.bone('ringA', 'mast', (0, 0.74, 0))
    ring(m, 0.62, 3, 0.042, 16)
    m.bone('ringB', 'mast', (0, 1.16, 0))
    ring(m, 0.44, 2, 0.04, 14)

    # ---- eye pod -------------------------------------------------------------------------------
    m.bone('eyeP', 'mast', (0, 0, 0))
    m.bone('eye', 'eyeP', (0, 0.02, 0.46))
    m.darkmetal(texel=1.0)
    m.box(0.4, 0.36, 0.26, bevel=0.07)
    m.steel(texel=0.6)
    m.cyl(0.15, 0.16, 0.04, 10, at=(0, 0, 0.125), rot=(PI / 2, 0, 0))
    m.glow(emit=1.5, texel=1.3)
    m.sphere(0.125, 10, 4, at=(0, 0, 0.14), scale=(1, 1, 0.45))
    m.fixed(0x071015, surf='flat', rough=0.3, texel=0.4)
    m.sphere(0.045, 6, 3, at=(0.01, 0.012, 0.19), scale=(1, 1, 0.5))
    m.paint('body', texel=0.8)
    m.box(0.44, 0.07, 0.22, at=(0, 0.2, 0.08), rot=(0.3, 0, 0), bevel=0.02)
    for s in (-1, 1):
        m.steel(texel=0.3)
        m.box(0.05, 0.1, 0.14, at=(s * 0.215, 0, 0.0), bevel=0.012)
        m.glow(slot='glow2', emit=1.0, texel=0.25)
        m.box(0.012, 0.04, 0.05, at=(s * 0.244, 0, 0.02), bevel=0)

    # ---- discharge bolts around the ball ---------------------------------------------------------
    m.bone('arcs', 'mast', (0, 1.66, 0))
    m.fixed(0xdffbff, surf='glow', emit=2.3, rough=0.4, texel=0.15)
    for i in range(6):
        a = i * 1.047 + 0.3
        el = ((i * 37) % 5) * 0.25 - 0.3
        x, y, z = math.cos(a) * 0.28, el * 0.2, math.sin(a) * 0.28
        for k in range(4):
            da = 0.7 if k % 2 else -0.6
            nx = x + math.cos(a + da) * 0.22
            ny = y + (0.16 if k % 2 else -0.1) + el * 0.12
            nz = z + math.sin(a + da) * 0.22
            m.strut((x, y, z), (nx, ny, nz), 0.026 - k * 0.004, 0.02 - k * 0.004, 3)
            x, y, z = nx, ny, nz
    return m
