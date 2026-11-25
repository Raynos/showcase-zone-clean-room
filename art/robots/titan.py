"""
Crate Titan: fifteen metres of freight strapped onto a dark steel skeleton. Real plank crates
for limbs, hydraulic rams and red cables at the joints, a teal-grey head with eye slits and a
toothed mouth, a white-hot core in a bolted ring, a hazard plate at the waist.

Bones (driven by src/entities/robots/titan.ts). The game keeps its own detached skeleton and
writes every bone's transform in rig space each frame, so the bones are flat children of
`root`, one per rigid piece, each pivoting where the game's joint is:
  shinL/R, thighL/R, pelvis, chest, head, jaw, upperL/R, foreL/R
  shellA    front chest armour, torn off in phase 2
  shellB    pauldrons, back hump and skirt, torn off in phase 3
  seams     orange cracks that light once the armour is gone
  furnace   the core running away in phase 3
The four phase pieces rest far from the body, so they do not shadow it in the occlusion bake;
the game places them on the chest.
"""
import math
import random

from mathutils import Vector

from lib.kit import Model, PI

TEX = 2048
BUILD = dict(ao_dist=1.6, edge_dist=0.2, edge_w=0.010, scale=7.0, chip=0.8)

HIP, LT, LS = 6.3, 2.7, 3.6
CHY = HIP + 1.3
CORE = (0.0, 2.25, 0.3)          # relative to the chest pivot
TEAL = 0x5f858c
TEAL2 = 0x44656c
RED = 0xb42d24
INK = 0x0d0b0a
HOT = 0xfff1d6
FURNACE = 0xff6414
EMBER = 0xff9226
TOOTH = 0xe8e2d0

_rnd = random.Random(11)


def jit(t):
    return ((_rnd.random() - 0.5) * t, (_rnd.random() - 0.5) * t * 2, (_rnd.random() - 0.5) * t)


def crate(m, w, h, d, at=(0, 0, 0), rot=(0, 0, 0), n=3, tone=0, hero=True, texel=1.0, braces='fb', top=False):
    """
    A shipping crate: plank walls over a dark inside, battens round the top and bottom, a post
    at each corner and a diagonal brace on the faces named in `braces` (f, b, s). `top` planks
    the lid too, for crates seen from above; the others get one board. A filler crate
    (hero=False) is a single block with the battens and posts only.
    """
    k = min(w, h, d)
    tb, tp, bh, pw, g = 0.06 * k, 0.035 * k, 0.14 * k, 0.13 * k, 0.014 * k
    main, trim = ('wood', 'woodDark') if tone == 0 else ('woodDark', 'wood')
    m.push(at=at, rot=rot)
    if hero:
        m.fixed(INK, surf='dark', rough=0.95, texel=0.12)
        m.box(w - tb, h - tb, d - tb, bevel=0)
        m.wood(slot=main, texel=texel)
        row = h / n
        for i in range(n):
            y = -h / 2 + row * (i + 0.5)
            for s in (-1, 1):
                m.box(w, row - g, tb, at=(0, y, s * (d / 2 - tb / 2)), bevel=0)
                m.box(tb, row - g, d - 2 * tb, at=(s * (w / 2 - tb / 2), y, 0), bevel=0)
        col = w / n
        if top:
            for i in range(n):
                m.box(col - g, tb, d, at=(-w / 2 + col * (i + 0.5), h / 2 - tb / 2, 0), bevel=0)
        else:
            m.box(w, tb, d, at=(0, h / 2 - tb / 2, 0), bevel=0)
        m.box(w, tb, d, at=(0, -h / 2 + tb / 2, 0), bevel=0)
    else:
        m.wood(slot=main, texel=texel * 0.7)
        m.box(w, h, d, bevel=0)
    m.wood(slot=trim, texel=texel * 0.85)
    for s in (-1, 1):
        m.box(w + 2 * tp, bh, d + 2 * tp, at=(0, s * (h / 2 - bh / 2 - 0.012 * k), 0), bevel=0)
    for sx in (-1, 1):
        for sz in (-1, 1):
            m.box(pw, h + 0.02 * k, pw, at=(sx * (w / 2 - pw / 2 + 1.3 * tp), 0, sz * (d / 2 - pw / 2 + 1.3 * tp)), bevel=0)
    if hero:
        ih = h - 2 * bh
        if 'f' in braces or 'b' in braces:
            iw = w - 2 * pw
            L, ang = math.hypot(iw, ih) * 0.97, math.atan2(iw, ih)
            for s, tag in ((1, 'f'), (-1, 'b')):
                if tag in braces:
                    m.box(pw * 0.9, L, tp, at=(0, 0, s * (d / 2 + 0.4 * tp)), rot=(0, 0, s * ang), bevel=0)
        if 's' in braces:
            idp = d - 2 * pw
            L, ang = math.hypot(idp, ih) * 0.97, math.atan2(idp, ih)
            for s in (-1, 1):
                m.box(tp, L, pw * 0.9, at=(s * (w / 2 + 0.4 * tp), 0, 0), rot=(-s * ang, 0, 0), bevel=0)
    m.pop()


def band(m, w, h, d, at, hazard=False, texel=0.7):
    """A steel strap (or hazard strap) round a crate of footprint w x d."""
    if hazard: m.stripe(texel=texel + 0.2)
    else: m.darkmetal(texel=texel)
    m.box(w, h, d, at=at, bevel=min(0.04, h * 0.2))


def ram(m, a, b, r, texel=0.6):
    """A hydraulic ram from a to b: dark sleeve, bright rod, an eye at each end."""
    a, b = Vector(a), Vector(b)
    mid = a + (b - a) * 0.56
    m.darkmetal(texel=texel)
    m.strut(a, mid, r, r, 8)
    m.sphere(r * 1.05, 6, 4, at=tuple(a))
    m.sphere(r * 0.85, 6, 4, at=tuple(b))
    m.steel(texel=texel)
    m.strut(mid, b, r * 0.55, r * 0.55, 6)
    m.strut(mid - (b - a).normalized() * r * 0.3, mid + (b - a).normalized() * r * 0.3, r * 1.15, r * 1.15, 8)


def cable(m, pts, r=0.11, color=RED):
    m.fixed(color, surf='rubber', rough=0.75, texel=0.5)
    m.tube(pts, r, 6)


def bolts(m, pts, r, axis):
    m.steel(texel=0.4)
    for p in pts: m.bolt(p, r=r, axis=axis)


# ---- limbs -------------------------------------------------------------------------------------
def thigh(m, s):
    m.darkmetal(texel=0.8)
    m.sphere(0.98, 12, 7)
    m.box(0.85, 2.5, 0.85, at=(0, -1.35, 0), bevel=0.1)
    m.steel(texel=0.6)
    m.cyl(0.5, 0.5, 0.3, 12, at=(s * 0.92, 0, 0), rot=(0, 0, PI / 2), bevel=0.05)
    crate(m, 2.35, 1.45, 2.35, at=(0, -0.98, 0.05), rot=jit(0.06), texel=1.0, braces='fbs')
    crate(m, 2.0, 1.2, 2.0, at=(0, -2.05, 0), rot=jit(0.08), tone=1, texel=0.95)
    band(m, 2.56, 0.2, 2.56, (0, -0.98, 0.05))
    ram(m, (s * 0.55, -0.15, -1.3), (s * 0.55, -2.62, -1.12), 0.2)
    ram(m, (-s * 0.55, -0.15, -1.3), (-s * 0.55, -2.62, -1.12), 0.2)
    # knee: a through-axle with capped ends
    m.steel(texel=0.7)
    m.cyl(0.62, 0.62, 2.5, 12, at=(0, -LT, 0), rot=(0, 0, PI / 2))
    m.darkmetal(texel=0.6)
    for sx in (-1, 1):
        m.cyl(0.8, 0.8, 0.22, 12, at=(sx * 1.2, -LT, 0), rot=(0, 0, PI / 2))


def shin(m, s):
    m.darkmetal(texel=0.7)
    m.box(0.75, 2.5, 0.75, at=(0, -1.45, 0), bevel=0.1)
    crate(m, 1.9, 1.4, 1.9, at=(0, -0.98, 0), rot=jit(0.06), texel=1.0)
    crate(m, 2.3, 1.25, 2.3, at=(0, -2.1, 0.05), rot=jit(0.05), tone=1, texel=1.0, braces='fs')
    band(m, 2.5, 0.22, 2.5, (0, -2.1, 0.05), hazard=True)
    ram(m, (0, -0.5, -1.05), (0, -3.05, -1.55), 0.17)
    # ankle and foot: toe and heel crates on a steel chassis with rollers
    m.darkmetal(texel=0.6)
    m.cyl(0.46, 0.46, 2.7, 10, at=(0, -2.78, 0.1), rot=(0, 0, PI / 2))
    crate(m, 2.7, 1.05, 2.3, at=(0, -2.98, 1.3), rot=jit(0.03), texel=1.05, braces='fs', top=True)
    crate(m, 2.5, 1.05, 1.7, at=(0, -2.98, -0.6), rot=jit(0.03), tone=1, texel=0.95, braces='bs')
    m.darkmetal(texel=0.8)
    m.box(2.95, 0.3, 4.5, at=(0, -3.45, 0.4), bevel=0.08)
    m.steel(texel=0.8)
    m.box(2.85, 0.8, 0.5, at=(0, -3.1, 2.52), bevel=0.14)
    for i in (-1, 0, 1):
        m.cone(0.22, 0.6, 6, at=(i * 0.8, -3.3, 2.95), rot=(PI / 2, 0, 0))
    m.rubber(texel=0.5)
    for sx in (-1, 1):
        for z in (-1.2, 0.3, 1.7):
            m.cyl(0.3, 0.3, 0.26, 8, at=(sx * 1.52, -3.3, z), rot=(0, 0, PI / 2))


def upper(m, s):
    m.darkmetal(texel=0.7)
    m.box(0.7, 3.0, 0.7, at=(0, -1.5, 0), bevel=0.09)
    crate(m, 1.9, 1.5, 1.9, at=(0, -1.0, 0), rot=jit(0.07), texel=1.05, braces='fbs')
    band(m, 2.08, 0.2, 2.08, (0, -1.0, 0))
    # below it the arm is bare: the girder, a collar, three rams and a cable
    m.darkmetal(texel=0.7)
    m.box(1.05, 0.34, 1.05, at=(0, -1.95, 0), bevel=0.06)
    ram(m, (s * 0.52, -1.7, -0.5), (s * 0.5, -2.9, -0.55), 0.2)
    ram(m, (-s * 0.52, -1.7, -0.5), (-s * 0.5, -2.9, -0.55), 0.2)
    ram(m, (0, -1.7, 0.6), (0, -2.9, 0.6), 0.22)
    cable(m, [(s * 0.3, 0.3, 0.75), (s * 0.85, -0.3, 1.08), (s * 0.95, -1.5, 1.0), (s * 0.8, -2.2, 0.5), (s * 0.7, -2.8, 0.2)], 0.1)
    m.steel(texel=0.7)
    m.cyl(0.58, 0.58, 1.9, 12, at=(0, -3.0, 0), rot=(0, 0, PI / 2))
    m.darkmetal(texel=0.5)
    for sx in (-1, 1):
        m.cyl(0.74, 0.74, 0.2, 12, at=(sx * 0.95, -3.0, 0), rot=(0, 0, PI / 2))


def fore(m, s):
    crate(m, 1.55, 1.2, 1.55, at=(0, -0.82, 0), rot=jit(0.07), texel=1.0, braces='fbs')
    # the forearm is hydraulics: twin rams from the elbow crate to the wrist
    for dx in (-0.42, 0.42):
        m.darkmetal(texel=0.6)
        m.strut((dx, -0.1, 0), (dx, -1.62, 0), 0.27, 0.27, 10, bevel=0.04)
        m.steel(texel=0.6)
        m.strut((dx, -1.6, 0), (dx, -2.0, 0), 0.16, 0.16, 8)
    band(m, 1.72, 0.24, 1.72, (0, -1.5, 0), hazard=True)
    m.darkmetal(texel=0.6)
    m.cyl(0.72, 0.8, 0.34, 12, at=(0, -1.82, 0), bevel=0.05)
    # the fist: one enormous crate, steel-shod
    crate(m, 2.6, 2.3, 2.6, at=(0, -3.05, 0.05), rot=jit(0.02), n=4, texel=1.3, braces='fbs')
    band(m, 2.84, 0.26, 2.84, (0, -2.5, 0.05), texel=0.9)
    m.darkmetal(texel=1.0)
    m.box(2.82, 0.5, 2.82, at=(0, -4.02, 0.05), bevel=0.08)
    m.vent(texel=1.0)
    for sx in (-1, 1):
        m.box(0.05, 0.3, 1.9, at=(sx * 1.415, -4.02, 0.05), bevel=0)
    m.steel(texel=0.9)
    for i in range(4):
        m.box(0.52, 0.5, 0.7, at=(-0.93 + i * 0.62, -4.08, 0.95), bevel=0.12)
    for sx in (-1, 1):
        for sz in (-1, 1):
            m.box(0.5, 0.5, 0.5, at=(sx * 1.12, -2.0, 0.05 + sz * 1.12), bevel=0.06)


def make():
    m = Model('titan')
    m.bone('root', None, (0, 0, 0))

    # ======================================================================================
    for name, s in (('shinL', 1), ('shinR', -1)):
        m.bone(name, 'root', (s * 1.6, HIP - LT, 0))
        shin(m, s)
    for name, s in (('thighL', 1), ('thighR', -1)):
        m.bone(name, 'root', (s * 1.6, HIP, 0))
        thigh(m, s)

    # ======================================================================================
    m.bone('pelvis', 'root', (0, HIP, 0))
    m.darkmetal(texel=0.7)
    m.box(4.4, 0.7, 0.9, bevel=0.1)
    m.box(1.7, 1.5, 1.7, at=(0, 0.2, 0), bevel=0.14)
    for i, x in enumerate((-1.58, 0.0, 1.58)):
        crate(m, 1.5, 1.55, 1.3, at=(x, 0.5, 0.72), rot=jit(0.05), tone=i % 2, texel=1.0, braces='fs' if x else 's')
        crate(m, 1.5, 1.55, 1.3, at=(x, 0.5, -0.72), rot=jit(0.05), tone=(i + 1) % 2, hero=False)
    band(m, 5.0, 0.3, 3.0, (0, 0.5, 0))
    crate(m, 1.3, 1.1, 0.9, at=(0, -0.78, 0.1), rot=jit(0.04), tone=1, texel=0.8, braces='f')
    # the hazard plate
    m.steel(texel=0.8)
    m.box(1.74, 1.4, 0.12, at=(0, 0.38, 1.5), bevel=0.04)
    m.stripe(texel=1.3)
    m.box(1.5, 1.18, 0.2, at=(0, 0.38, 1.56), bevel=0.04)
    bolts(m, [(sx * 0.8, 0.38 + sy * 0.63, 1.57) for sx in (-1, 1) for sy in (-1, 1)], 0.06, (0, 0, 1))
    # waist: bellows over the spine, cables up into the chest
    m.rubber(texel=0.6)
    prof = [(0.74, 0.95)]
    for i in range(4):
        y = 1.0 + i * 0.2
        prof += [(0.94, y), (0.94, y + 0.09), (0.76, y + 0.15)]
    m.lathe(prof, 14, cap=False)
    for s in (-1, 1):
        cable(m, [(s * 1.3, 0.6, 1.45), (s * 1.15, 1.2, 1.6), (s * 0.95, 1.55, 1.2), (s * 0.8, 1.75, 0.6)], 0.1)
        ram(m, (s * 0.7, 0.5, -1.45), (s * 0.55, 1.85, -0.75), 0.15)

    # ======================================================================================
    m.bone('chest', 'root', (0, CHY, 0))
    # girder ribcage
    m.darkmetal(texel=0.75)
    for sx in (-1, 1):
        for sz in (-1, 1):
            m.box(0.42, 3.5, 0.42, at=(sx * 2.35, 2.35, sz * 1.1 - 0.1), bevel=0.06)
        for y in (0.8, 3.95):
            m.box(0.42, 0.42, 2.6, at=(sx * 2.35, y, -0.1), bevel=0.06)
    for sz in (-1, 1):
        for y in (0.8, 3.95):
            m.box(5.1, 0.42, 0.42, at=(0, y, sz * 1.1 - 0.1), bevel=0.06)
    m.steel(texel=0.5)
    for sx in (-1, 1):
        m.strut((sx * 2.35, 0.95, 0.95), (sx * 2.35, 3.8, -1.15), 0.13, 0.13, 6)
    # a plate wall behind the core so the cradle is closed
    m.mat(slot='dark', surf='panel', metal=0.6, rough=0.6, emit=0, texel=0.9)
    m.box(4.3, 2.9, 0.22, at=(0, 2.37, -0.3), bevel=0.04)
    # freight packed behind, beside and under the core
    for ix in range(3):
        for iy in range(3):
            crate(m, 1.36, 0.96, 1.3, at=((ix - 1) * 1.4, 1.37 + iy * 1.0, -1.02), rot=jit(0.06), tone=(ix + iy) % 2, hero=False, texel=0.9)
    for s in (-1, 1):
        crate(m, 0.92, 1.42, 1.3, at=(s * 2.02, 1.62, 0.18), rot=jit(0.04), tone=0, texel=1.1, braces='f')
        crate(m, 0.92, 1.42, 1.3, at=(s * 2.02, 3.1, 0.18), rot=jit(0.04), tone=1, texel=1.1, braces='f')
        crate(m, 1.6, 0.85, 2.0, at=(s * 0.84, 0.33, 0.0), rot=jit(0.05), tone=(s + 1) // 2, texel=1.0, braces='f')
    # ---- the core: white-hot, in a bolted steel ring held by four clamps ---------------------
    m.fixed(HOT, surf='glow', rough=0.4, emit=0.95, texel=1.2)
    m.sphere(1.0, 16, 10, at=CORE)
    m.steel(texel=1.4)
    m.lathe([(1.08, 0.0), (1.08, 0.5), (1.2, 0.64), (1.42, 0.64), (1.5, 0.52), (1.5, 0.0)], 24,
            at=(CORE[0], CORE[1], CORE[2] - 0.08), rot=(PI / 2, 0, 0), cap=False)
    m.darkmetal(texel=1.0)
    m.torus(1.1, 0.09, 24, 6, at=(CORE[0], CORE[1], CORE[2] + 0.56), rot=(PI / 2, 0, 0))
    bolts(m, [(CORE[0] + math.cos(i / 12 * 2 * PI + 0.26) * 1.32, CORE[1] + math.sin(i / 12 * 2 * PI + 0.26) * 1.32, CORE[2] + 0.56) for i in range(12)], 0.075, (0, 0, 1))
    m.darkmetal(texel=0.9)
    for i in range(4):
        a = i * PI / 2 + PI / 4
        m.box(0.46, 0.8, 0.7, at=(CORE[0] + math.cos(a) * 1.52, CORE[1] + math.sin(a) * 1.52, CORE[2] + 0.3), rot=(0, 0, a - PI / 2), bevel=0.08)
    # ---- shoulders: a yoke across the top, ball sockets, rams and red cables ------------------
    m.darkmetal(texel=0.8)
    m.box(7.0, 0.62, 0.8, at=(0, 3.42, -0.15), bevel=0.1)
    for s in (-1, 1):
        m.darkmetal(texel=0.9)
        m.sphere(1.05, 12, 7, at=(s * 3.55, 3.3, 0))
        m.steel(texel=0.6)
        m.cyl(0.62, 0.62, 0.3, 12, at=(s * 2.72, 3.3, 0), rot=(0, 0, PI / 2), bevel=0.05)
        ram(m, (s * 2.1, 1.3, -1.35), (s * 3.35, 2.75, -0.75), 0.2)
        ram(m, (s * 2.55, 1.5, 0.9), (s * 3.45, 2.6, 0.55), 0.15)
        m.rubber(texel=0.5)
        m.tube([(s * 0.8, 3.0, 0.2), (s * 1.6, 3.75, 0.45), (s * 2.6, 3.85, 0.4), (s * 3.3, 3.7, 0.5)], 0.16, 6)
        cable(m, [(s * 1.3, 4.1, 0.3), (s * 2.2, 4.5, 0.55), (s * 3.1, 4.35, 0.75), (s * 3.75, 3.9, 0.85), (s * 4.0, 3.3, 0.8)], 0.11)
        cable(m, [(s * 1.5, 4.05, -0.6), (s * 2.5, 4.4, -0.9), (s * 3.5, 4.2, -0.95), (s * 4.05, 3.5, -0.75)], 0.11)
        cable(m, [(s * 2.6, 0.9, 1.1), (s * 3.0, 1.6, 1.25), (s * 3.2, 2.4, 0.95)], 0.09)
    # neck
    m.rubber(texel=0.5)
    m.lathe([(0.72, 3.95), (0.9, 4.02), (0.9, 4.12), (0.74, 4.2), (0.9, 4.28), (0.9, 4.38), (0.7, 4.46)], 12, cap=False)

    # ======================================================================================
    # phase pieces: authored on the chest, rested far away (see the header)
    m.bone('shellA', 'root', (0, CHY, 40))
    for i, x in enumerate((-1.5, 0.0, 1.5)):
        crate(m, 1.46, 1.2, 1.0, at=(x, 3.42, 1.42), rot=jit(0.07), tone=i % 2, texel=1.15, braces='f')
        crate(m, 1.36, 1.1, 1.0, at=(x * 0.92, 0.96, 1.42), rot=jit(0.07), tone=(i + 1) % 2, texel=1.15, braces='f')
    for s in (-1, 1):
        crate(m, 1.3, 1.25, 1.0, at=(s * 1.66, 2.2, 1.44), rot=jit(0.08), tone=0, texel=1.15, braces='f')
        m.darkmetal(texel=0.6)
        m.box(0.16, 3.9, 1.14, at=(s * 0.78, 2.2, 1.42), bevel=0.03)
    m.darkmetal(texel=0.5)
    for y in (1.95, 2.55):
        m.cyl(0.09, 0.09, 2.1, 6, at=(0, y, 1.7), rot=(0, 0, PI / 2))
    band(m, 4.7, 0.22, 0.16, (0, 2.86, 1.96), hazard=True)

    m.bone('shellB', 'root', (0, CHY, -40))
    for s in (-1, 1):
        crate(m, 2.5, 1.5, 2.7, at=(s * 3.75, 4.75, 0), rot=jit(0.06), n=4, tone=(s + 1) // 2, texel=1.2, braces='fbs', top=True)
        crate(m, 1.4, 1.0, 1.4, at=(s * 3.9, 6.02, -0.25), rot=jit(0.14), tone=1 - (s + 1) // 2, texel=1.0, braces='fs', top=True)
        band(m, 2.72, 0.2, 2.92, (s * 3.75, 4.75, 0))
        crate(m, 1.5, 1.25, 0.8, at=(s * 1.05, 0.25, 1.38), rot=jit(0.08), tone=0, texel=1.0, braces='f')
        crate(m, 1.7, 1.6, 1.0, at=(s * 0.88, 3.7, -2.1), rot=jit(0.1), tone=(s + 1) // 2, texel=0.9, braces='b')
        cable(m, [(s * 2.6, 4.2, 1.2), (s * 3.2, 5.0, 1.42), (s * 4.2, 5.56, 1.2), (s * 4.9, 5.2, 0.6)], 0.1)
    crate(m, 1.3, 1.0, 0.9, at=(0.4, 2.3, -2.1), rot=jit(0.12), tone=1, texel=0.8, braces='b')

    m.bone('seams', 'root', (40, CHY, 0))
    m.fixed(FURNACE, surf='glow', rough=0.4, emit=1.5, texel=0.5)
    m.torus(1.0, 0.07, 24, 4, at=(CORE[0], CORE[1], CORE[2] + 0.6), rot=(PI / 2, 0, 0))
    for i in range(7):
        a, l = i * 0.9 + 0.35, 0.7 + (i % 3) * 0.35
        m.strut((math.cos(a) * 1.52, CORE[1] + math.sin(a) * 1.52, 0.9), (math.cos(a + 0.12) * (1.52 + l), CORE[1] + math.sin(a + 0.12) * (1.52 + l), 0.98), 0.06, 0.03, 4)
    for s in (-1, 1):
        m.box(0.08, 3.0, 0.05, at=(s * 2.35, 2.35, 1.23), bevel=0)
        m.box(0.05, 0.08, 1.6, at=(s * 2.58, 2.35, -0.1), bevel=0)
    for y in (0.8, 3.95):
        m.box(4.3, 0.08, 0.05, at=(0, y, 1.23), bevel=0)

    m.bone('furnace', 'root', (-40, CHY, 0))
    m.fixed(FURNACE, surf='glow', rough=0.4, emit=1.2, texel=0.6)
    m.sphere(1.12, 12, 7, at=CORE)
    for i in range(11):
        a, l = (i / 11) * PI * 2, 1.0 + ((i * 7) % 4) * 0.45
        m.fixed(EMBER if i % 2 else FURNACE, surf='glow', rough=0.4, emit=0.95, texel=0.4)
        m.cone(0.3, l, 5, at=(math.cos(a) * (1.3 + l / 2), CORE[1] + math.sin(a) * (1.3 + l / 2), 0.85 + (i % 2) * 0.25), rot=(0.25, 0, a - PI / 2))
    for s in (-1, 1):
        for i in range(3):
            m.fixed(EMBER if i % 2 else FURNACE, surf='glow', rough=0.4, emit=0.9, texel=0.4)
            m.cone(0.34 - i * 0.05, 1.6 + i * 0.5, 5, at=(s * (3.3 + i * 0.4), 4.9 + i * 0.25, -0.4 + i * 0.35), rot=(0, 0, -s * (0.1 + i * 0.16)))
    m.fixed(FURNACE, surf='glow', rough=0.4, emit=0.9, texel=0.4)
    for i in range(3):
        m.cone(0.3, 1.5 + (i % 2) * 0.6, 5, at=(-1.1 + i * 1.1, 4.6, -1.4), rot=(-0.3, 0, 0))

    # ======================================================================================
    m.bone('head', 'root', (0, CHY + 4.25, 0.3))
    m.darkmetal(texel=0.8)
    m.cyl(0.62, 0.7, 0.5, 12, at=(0, 0.2, -0.3))
    m.box(2.36, 0.5, 2.3, at=(0, 0.82, 0.0), bevel=0.08)
    # skull: a teal-grey steel box, heavy brow, cheek guards
    m.fixed(TEAL, surf='panel', metal=0.35, rough=0.55, texel=1.5)
    m.box(2.6, 1.5, 2.5, at=(0, 1.75, 0), bevel=0.2)
    m.fixed(TEAL, surf='paint', metal=0.35, rough=0.55, texel=1.3)
    m.box(2.74, 0.44, 0.9, at=(0, 2.16, 1.02), rot=(0.3, 0, 0), bevel=0.09)
    m.fixed(TEAL2, surf='panel', metal=0.35, rough=0.55, texel=1.2)
    for s in (-1, 1):
        m.box(0.3, 1.2, 1.5, at=(s * 1.36, 1.5, 0.35), bevel=0.07)
    m.box(1.3, 0.3, 1.7, at=(0, 2.56, -0.3), bevel=0.06)
    # the eyes: two slits in a dark band
    m.fixed(INK, surf='glass', rough=0.3, metal=0.3, texel=1.0)
    m.box(2.3, 0.66, 0.2, at=(0, 1.58, 1.18), bevel=0.03)
    m.glow(emit=1.6, texel=1.6)
    for s in (-1, 1):
        m.box(0.76, 0.25, 0.12, at=(s * 0.62, 1.58, 1.27), rot=(0, 0, -s * 0.16), bevel=0.02)
    m.fixed(TEAL2, surf='paint', metal=0.35, rough=0.55, texel=0.9)
    m.box(0.26, 0.74, 0.3, at=(0, 1.56, 1.2), bevel=0.05)
    # mouth: a dark cavity, a lit gullet, a row of teeth
    m.fixed(INK, surf='dark', rough=0.95, texel=0.3)
    m.box(2.1, 0.5, 1.9, at=(0, 0.4, 0.1), bevel=0)
    m.glow(emit=1.1, texel=0.8)
    m.box(1.7, 0.26, 0.08, at=(0, 0.36, 1.02), bevel=0)
    m.fixed(TOOTH, surf='flat', rough=0.5, texel=0.6)
    for i in range(5):
        m.cone(0.18, 0.46, 4, at=(-0.84 + i * 0.42, 0.36, 1.2), rot=(PI, PI / 4, 0))
    m.steel(texel=0.7)
    m.box(2.5, 0.2, 0.3, at=(0, 0.66, 1.14), bevel=0.05)
    for s in (-1, 1):
        m.cyl(0.36, 0.36, 0.2, 12, at=(s * 1.52, 1.62, -0.1), rot=(0, 0, PI / 2), bevel=0.04)
    m.vent(texel=1.0)
    m.box(1.6, 0.8, 0.06, at=(0, 1.7, -1.26), bevel=0)
    # loose freight for a crown, a beacon on a mast
    crate(m, 1.25, 0.9, 1.25, at=(0.38, 3.12, -0.3), rot=jit(0.2), texel=1.0, braces='fs', top=True)
    crate(m, 0.78, 0.62, 0.78, at=(-0.72, 3.0, 0.3), rot=jit(0.25), tone=1, texel=0.9, braces='f', top=True)
    m.darkmetal(texel=0.4)
    m.strut((0.95, 2.4, -0.95), (1.3, 4.3, -1.2), 0.08, 0.05, 6)
    m.fixed(0xff5a3a, surf='glow', rough=0.4, emit=1.7, texel=0.5)
    m.sphere(0.18, 8, 5, at=(1.3, 4.38, -1.2))

    m.bone('jaw', 'root', (0, CHY + 4.5, -0.6))
    m.fixed(TEAL, surf='panel', metal=0.35, rough=0.55, texel=1.3)
    m.box(2.5, 0.8, 2.2, at=(0, -0.32, 1.02), bevel=0.12)
    m.steel(texel=0.7)
    m.box(2.6, 0.3, 0.3, at=(0, -0.02, 2.05), bevel=0.06)
    m.fixed(TOOTH, surf='flat', rough=0.5, texel=0.6)
    for i in range(4):
        m.cone(0.19, 0.46, 4, at=(-0.66 + i * 0.44, 0.32, 2.02), rot=(0, PI / 4, 0))
    m.darkmetal(texel=0.5)
    for s in (-1, 1):
        m.cyl(0.3, 0.3, 0.16, 10, at=(s * 1.3, -0.1, 0.2), rot=(0, 0, PI / 2), bevel=0.03)

    # ======================================================================================
    for name, s in (('upperL', 1), ('upperR', -1)):
        m.bone(name, 'root', (s * 4.15, CHY + 3.3, 0))
        upper(m, s)
    for name, s in (('foreL', 1), ('foreR', -1)):
        m.bone(name, 'root', (s * 4.15, CHY + 0.3, 0))
        fore(m, s)
    return m
