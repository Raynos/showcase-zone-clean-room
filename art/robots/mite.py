"""
Crate Mite: a shipping crate that grew six legs and an appetite. Knee-high, 0.7 m.

Bones (driven by src/entities/robots/mite.ts):
  chassis            body pivot at the crate's centre
    lid              hinged along the back top edge; it is the upper jaw
    legsA, legsB     the two alternating tripods
    opt_rare / opt_elite / opt_night / opt_nightElite   variant dressing, collapsed when unused
"""
import math

from lib.kit import Model, PI

TEX = 512
BUILD = dict(ao_dist=0.22, edge_dist=0.02, edge_w=0.008, scale=1.0)

BONE = 0xf1e6cf


def make():
    m = Model('mite')
    m.bone('chassis', None, (0, 0.42, 0))

    # ---- crate body: real planks in a steel frame, dark inside so the gaps read ---------
    m.fixed(0x130e0b, surf='dark', rough=0.95, texel=0.35)
    m.box(0.45, 0.33, 0.45, bevel=0)
    m.wood(texel=1.15)
    for y in (-0.118, 0.0, 0.118):
        for s in (-1, 1):
            m.box(0.03, 0.105, 0.43, at=(s * 0.236, y, 0), bevel=0)
        m.box(0.43, 0.105, 0.03, at=(0, y, -0.236), bevel=0)
    for y in (-0.118, 0.0):
        m.box(0.43, 0.105, 0.03, at=(0, y, 0.236), bevel=0.006)
    # diagonal brace on each side wall, the mark of a proper crate
    m.wood(slot='woodDark', texel=1.0)
    for s in (-1, 1):
        m.box(0.022, 0.07, 0.47, at=(s * 0.256, 0, 0), rot=(s * 0.62, 0, 0), bevel=0)
    # steel frame: corner posts and a skid rail under each side
    m.steel(texel=1.0)
    for sx in (-1, 1):
        for sz in (-1, 1):
            m.box(0.066, 0.385, 0.066, at=(sx * 0.232, 0, sz * 0.232), bevel=0.011)
    m.darkmetal(texel=0.7)
    for s in (-1, 1):
        m.box(0.05, 0.035, 0.5, at=(s * 0.2, -0.19, 0), bevel=0)
    m.box(0.4, 0.03, 0.05, at=(0, -0.188, 0.2), bevel=0)
    m.box(0.4, 0.03, 0.05, at=(0, -0.188, -0.2), bevel=0)

    # ---- face: a visor slot cut into the top front plank, two lenses behind it ----------
    m.steel(texel=1.0)
    m.box(0.41, 0.118, 0.034, at=(0, 0.117, 0.234), bevel=0.008)
    m.fixed(0x0a0e12, surf='glass', rough=0.25, metal=0.3, texel=1.0)
    m.box(0.35, 0.074, 0.02, at=(0, 0.117, 0.246), bevel=0.006)
    for s in (-1, 1):
        m.darkmetal(texel=0.9)
        m.cyl(0.047, 0.047, 0.022, 10, at=(s * 0.088, 0.117, 0.256), rot=(PI / 2, 0, 0))
        m.glow(emit=1.5, texel=1.3)
        m.sphere(0.036, 8, 4, at=(s * 0.088, 0.117, 0.262), scale=(1, 1, 0.5))
        m.fixed(0x071015, surf='flat', rough=0.3, texel=0.6)
        m.sphere(0.014, 5, 3, at=(s * 0.084, 0.123, 0.278), scale=(1, 1, 0.5))
    # nose grille between the lenses
    m.darkmetal(texel=0.6)
    for i in (-1, 0, 1):
        m.box(0.008, 0.05, 0.012, at=(i * 0.016, 0.117, 0.258), bevel=0)

    # ---- maw: the crate's open top, a hot core glowing in the dark ----------------------
    m.fixed(0x0d0908, surf='dark', rough=0.95, texel=0.4)
    m.box(0.4, 0.02, 0.4, at=(0, 0.168, 0), bevel=0)
    m.darkmetal(texel=0.6)
    m.cyl(0.085, 0.1, 0.03, 8, at=(0, 0.176, -0.02))
    m.glow(slot='glow2', emit=1.3, texel=0.9)
    m.sphere(0.066, 8, 4, at=(0, 0.186, -0.02), scale=(1, 0.5, 1))
    # lower teeth along the front rim
    m.fixed(BONE, surf='flat', rough=0.5, texel=0.5)
    for i in range(5):
        m.cone(0.027, 0.078, 4, at=(-0.18 + i * 0.09, 0.213, 0.222), rot=(0, PI / 4, 0))

    # ---- hip housings and a caged power cell on the back --------------------------------
    for s in (-1, 1):
        for z in (0.17, 0.0, -0.17):
            m.paint('body', texel=0.9)
            m.cyl(0.05, 0.058, 0.06, 8, at=(s * 0.268, -0.09, z), rot=(0, 0, -s * PI / 2))
    m.glow(emit=1.1, texel=0.9)
    m.cyl(0.034, 0.034, 0.15, 8, at=(0, 0.0, -0.283))
    m.steel(texel=0.6)
    m.cyl(0.046, 0.046, 0.03, 8, at=(0, 0.085, -0.28))
    m.cyl(0.046, 0.046, 0.03, 8, at=(0, -0.085, -0.28))
    for s in (-1, 1):
        m.box(0.012, 0.15, 0.012, at=(s * 0.04, 0, -0.312), bevel=0)
    m.paint('body', texel=0.7)
    m.box(0.11, 0.06, 0.03, at=(0.13, -0.11, -0.262), bevel=0.006)
    m.darkmetal(texel=0.5)
    for i in range(3):
        m.box(0.085, 0.008, 0.01, at=(0.13, -0.126 + i * 0.016, -0.279), bevel=0)

    # ---- variant dressing on the body ----------------------------------------------------
    m.bone('opt_night', 'chassis', (0, 0, 0))
    m.glow(slot='glow2', emit=1.6, texel=0.5)
    m.box(0.34, 0.022, 0.014, at=(0, -0.165, 0.262), bevel=0)
    m.glow(slot='glow', emit=1.6, texel=0.5)
    for s in (-1, 1):
        m.box(0.014, 0.022, 0.34, at=(s * 0.272, -0.165, 0), bevel=0)
    m.bone('opt_elite', 'chassis', (0, 0, 0))
    # Gatecrasher: hazard bumper, brow armour and twin stacks
    m.fixed(0xffc23a, surf='stripe', rough=0.6, metal=0.2, texel=1.0)
    m.box(0.56, 0.085, 0.56, at=(0, -0.085, 0), bevel=0.012)
    m.paint('body', texel=0.9)
    m.box(0.46, 0.05, 0.07, at=(0, 0.172, 0.262), rot=(0.35, 0, 0), bevel=0.012)
    for s in (-1, 1):
        m.darkmetal(texel=0.6)
        m.cyl(0.03, 0.036, 0.22, 8, at=(s * 0.17, 0.2, -0.285), bevel=0.006)
        m.steel(texel=0.4)
        m.cyl(0.04, 0.036, 0.03, 8, at=(s * 0.17, 0.315, -0.285))
    m.bone('opt_nightElite', 'chassis', (0, 0, 0))
    # Sir Nibbles: a toothpick lance with a pennant, couched on the right
    m.wood(slot='woodDark', texel=0.6)
    m.strut((-0.31, -0.02, -0.25), (-0.31, 0.06, 0.8), 0.028, 0.008, 6)
    m.steel(slot='trim', texel=0.5)
    m.cone(0.07, 0.1, 8, at=(-0.31, 0.0, 0.02), rot=(PI / 2, 0, 0))
    m.fixed(0xd8342a, surf='cloth', rough=0.9, texel=0.6)
    m.box(0.012, 0.09, 0.16, at=(-0.31, 0.1, 0.5), bevel=0)

    # ---- lid: the upper jaw ---------------------------------------------------------------
    m.bone('lid', 'chassis', (0, 0.18, -0.25))
    m.push(at=(0, 0, 0.27))
    m.darkmetal(slot='steel', texel=0.7)
    m.box(0.5, 0.02, 0.5, at=(0, 0.008, 0), bevel=0)
    m.darkmetal(texel=0.5)
    for i in (-1, 0, 1):
        m.box(0.42, 0.014, 0.03, at=(0, -0.006, i * 0.14 - 0.02), bevel=0)
    m.wood(texel=1.15)
    for i in range(4):
        m.box(0.127, 0.045, 0.54, at=(-0.2025 + i * 0.135, 0.04, 0), bevel=0.007)
    m.steel(texel=0.9)
    for z in (-0.17, 0.17):
        m.box(0.565, 0.02, 0.052, at=(0, 0.064, z), bevel=0.006)
    # upper teeth, latch, hinges
    m.fixed(BONE, surf='flat', rough=0.5, texel=0.5)
    for i in range(4):
        m.cone(0.027, 0.078, 4, at=(-0.135 + i * 0.09, -0.04, 0.232), rot=(PI, PI / 4, 0))
    m.steel(texel=0.7)
    m.box(0.1, 0.055, 0.03, at=(0, 0.035, 0.278), bevel=0.008)
    m.darkmetal(texel=0.6)
    for s in (-1, 1):
        m.cyl(0.03, 0.03, 0.1, 6, at=(s * 0.16, 0.012, -0.27), rot=(0, 0, PI / 2))
    # sensor stalk
    m.darkmetal(texel=0.4)
    m.strut((0.19, 0.06, -0.19), (0.2, 0.2, -0.21), 0.011, 0.007, 5)
    m.glow(emit=1.4, texel=0.4)
    m.sphere(0.02, 6, 4, at=(0.2, 0.21, -0.21))
    m.pop()

    m.bone('opt_rare', 'lid', (0, 0, 0))
    m.push(at=(0, 0, 0.27))
    # whip antenna with a pennant
    m.darkmetal(texel=0.4)
    m.strut((-0.16, 0.06, -0.15), (-0.16, 0.42, -0.15), 0.012, 0.006, 5)
    m.mat(slot='glow', surf='cloth', metal=0, rough=0.9, emit=0.5, texel=0.6)
    m.box(0.014, 0.1, 0.15, at=(-0.16, 0.345, -0.235), bevel=0)
    m.glow(slot='glow2', emit=1.5, texel=0.4)
    m.sphere(0.024, 6, 4, at=(-0.16, 0.43, -0.15))
    m.pop()

    m.bone('opt_elite_lid', 'lid', (0, 0, 0))
    m.push(at=(0, 0.065, 0.27))
    # crown: a ring of sensor prongs with lit tips
    r = 0.13
    m.steel(slot='trim', texel=0.7)
    m.cyl(r * 1.02, r * 1.08, r * 0.28, 10, at=(0, r * 0.14, 0), bevel=0.006)
    for i in range(5):
        a = (i / 5) * PI * 2 + PI / 2
        px, pz = math.cos(a) * r * 0.92, math.sin(a) * r * 0.92
        m.steel(slot='trim', texel=0.5)
        m.cone(r * 0.2, r * 0.7, 4, at=(px, r * 0.6, pz))
        m.glow(emit=1.7, texel=0.3)
        m.sphere(r * 0.1, 5, 4, at=(px, r * 0.98, pz))
    m.pop()

    m.bone('opt_nightElite_lid', 'lid', (0, 0, 0))
    m.push(at=(0, 0, 0.27))
    # a tiny knight's helm with a plume
    m.fixed(0xb9c2cc, surf='metal', metal=0.9, rough=0.38, texel=0.9)
    m.sphere(0.17, 10, 6, at=(0, 0.1, 0), scale=(1, 0.9, 1.05))
    m.fixed(0x0c1014, surf='flat', rough=0.4, texel=0.4)
    m.box(0.24, 0.035, 0.03, at=(0, 0.13, 0.165), bevel=0)
    m.steel(slot='trim', texel=0.6)
    m.box(0.03, 0.2, 0.34, at=(0, 0.2, -0.02), bevel=0.01)
    m.fixed(0xd8342a, surf='cloth', rough=0.9, texel=0.5)
    for i in range(4):
        m.sphere(0.07 - i * 0.008, 6, 5, at=(0, 0.32 + i * 0.035 - i * i * 0.012, -0.07 - i * 0.085))
    m.pop()

    # ---- legs: two tripods; each leg is a braced thigh, a hub knee and a bladed shin ------
    zs = (0.17, 0.0, -0.17)
    for name, setn in (('legsA', 0), ('legsB', 1)):
        m.bone(name, 'chassis', (0, 0, 0))
        for i in range(3):
            s = 1 if (i + setn) % 2 == 0 else -1
            z = zs[i]
            hip = (s * 0.268, -0.09, z); knee = (s * 0.47, 0.09, z * 1.35); foot = (s * 0.53, -0.42, z * 1.6)
            m.steel(texel=0.8)
            m.strut(hip, knee, 0.042, 0.034, 6)
            # hydraulic ram from the crate wall to the knee
            m.steel(texel=0.4)
            m.strut((s * 0.255, 0.07, z), (s * 0.43, 0.115, z * 1.3), 0.012, 0.012, 5)
            m.paint('body', texel=0.9)
            m.cyl(0.05, 0.05, 0.075, 10, at=knee, rot=(PI / 2, 0, 0), bevel=0.009)
            m.steel(texel=0.9)
            m.strut(knee, (foot[0], foot[1] + 0.035, foot[2]), 0.036, 0.014, 6)
            m.rubber(texel=0.4)
            m.sphere(0.021, 5, 3, at=(foot[0], foot[1] + 0.02, foot[2]), scale=(1, 1.1, 1))
    return m
