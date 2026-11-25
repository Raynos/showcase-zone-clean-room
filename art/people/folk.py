"""
Brasswick townsfolk: one body, one texture, every local.

The base is a worker in a shirt with a yoke, a standing collar and rolled sleeves, belted trousers
and boots. Everything else is an optional piece on a bone named opt_<piece>;
src/entities/humanoid/fit.ts decides from a HumanLook which pieces an instance wears, what colour
each palette slot is, how broad the frame is and how the face is proportioned. Adding a hat or a
hairstyle is one function here and one name in the look's type.

  hair    hairBase (scalp with the hairline), hairTop (crown and fringe, off under hats), hairShort,
          hairBun, hairLong, hairMohawk, hairPonytail, hairCurly, hairBob, hairSwept, hairBraid
  hats    hatGoggles, hatHardhat, hatCap, hatHood, hatWeldmask, hatStrawhat, hatBandana
  kit     scarf, apron, backpack, toolbelt, cape, pauldron, beard, moustache, goatee, stubble, glasses,
          bracers, kneepads, quiver, bandolier (the last four are adventurers' gear)
  outfit  hem (the shirt's tail, off under overalls), vest, overalls, sleeves (long, over the forearm)

Every piece is built twice where it matters: its near form (brush lod 1) and a far stand-in of a few
dozen triangles (lod 2), so a distant townsperson stays under two thousand triangles.
"""
import math

import numpy as np

from lib.kit import Model, PI
from people import base as B
from people import head as H
from people import rook as K
from people.base import At, HC, HR, SK, SIDES, Y_CHEST, Y_SHOULDER

TEX = 1024
BUILD = dict(ao_dist=0.14, edge_dist=0.016, edge_w=0.005, scale=1.0, chip=0.4, grime=0.3, ao_min=0.42, edge_other=0.25, quality=82)

STRAW = 0xe0c070
APRON = 0x7a5236
PACK = 0x6b5a48
GOLD = 0xe2c15a
CREAM = 0xf3e3c8
PLATE = 0x7f8a97
CROWN = (0.05, 0.88, -0.4)


def opt(m, tag, parent, suffix=''):
    name = 'opt_' + tag + suffix
    if name not in m.bone_ix:
        m.bone(name, parent, (0, 0, 0))
    m.on(name)
    return name


def tab(K, a):
    return H._lerp_tab([k[0] for k in K], [k[1] for k in K], abs(a))


def face_layer(m, tag, keep, grow, brush):
    """A patch of the face's own surface as an optional piece, weighted like the skin it lies on (people/head.py patch)."""
    names = {'head': opt(m, tag, 'head')}
    for b in ('jaw', 'cheek', 'nose'): names[b] = opt(m, tag, b, '_' + b)
    m.on(names['head']); brush()
    V, F, W = H.patch(keep, grow)
    rng = m.mesh(B.lift(V), F, recalc=False)
    _weigh(m, rng, W, names)


def _weigh(m, rng, W, names):
    if m.weights is None: m.weights = {}
    for v, w in zip(rng, W):
        acc = {}
        for b, x in w:
            n = names.get(b, names['head'])
            acc[n] = acc.get(n, 0.0) + x
        m.weights[v] = sorted(acc.items(), key=lambda t: -t[1])


def face_mass(m, tag, lod, A, y_top, y_bot, rows, grow, drop=None):
    """A shaped mass of hair on the face (people/base.py face_grid), moving as the skin under it does."""
    names = {'head': opt(m, tag, 'head')}
    for b in ('jaw', 'cheek', 'nose'): names[b] = opt(m, tag, b, '_' + b)
    m.on(names['head']); B.hair(m, 1.3).mat(lod=lod)
    V, F, W, across, along = B.face_grid(A, y_top, y_bot, rows, grow, drop)
    rng = m.mesh(B.lift(V), F, recalc=False)
    B.strand_map(m, rng, across, along, B.STRAND_BEARD, 0.2, 0.16)
    _weigh(m, rng, W, names)
    m.mat(lod=0)


# ---- hair ------------------------------------------------------------------------------------
def dirb(a, dy):
    """Unit direction at angle a round the back of the head (0 = straight back) and height dy."""
    c = math.sqrt(max(0.0, 1 - dy * dy))
    return (math.sin(a) * c, dy, -math.cos(a) * c)


def hang(m, a, dy0, length, w, sway=0.0, inward=0.012, n=4, prof=B.LOCK):
    """A lock that leaves the head at (a, dy0) round the back and hangs `length` below it."""
    p0 = B.on_skull(*dirb(a, dy0 + 0.3), out=0.006)
    p1 = B.on_skull(*dirb(a, dy0), out=0.016)
    out = np.array([math.sin(a), 0.0, -math.cos(a)])
    pts = [p0, p1] + [p1 + np.array([sway * u, -length * u, 0.0]) - out * inward * u for u in ([0.55, 1.0] if n == 4 else [0.35, 0.7, 1.0])]
    B.lockp(m, pts, [out] * len(pts), w, prof=prof)


def hair(m):
    opt(m, 'hairBase', 'head')
    B.scalp(m, lod=1); B.scalp(m, lod=2)

    # crown and fringe: tousled, combed a little to one side; off under hats
    opt(m, 'hairTop', 'head'); B.hair(m).mat(lod=1)
    B.whorl(m, CROWN, [(5, 0.1, 0.72, 0.054, 0.016, 0.014, 0.3)], seed=1, sweep=0.5, n=4)
    B.whorl(m, CROWN, [(11, 0.6, 1.52, 0.052, 0.015, 0.012, 0.0)], seed=2, sweep=0.3, keep=lambda d: d[2] > -0.1, n=4)

    # short back and sides
    opt(m, 'hairShort', 'head'); B.hair(m).mat(lod=1)
    B.whorl(m, CROWN, [(11, 0.6, 1.45, 0.054, 0.014, 0.008, 0.0)], seed=2, sweep=0.3, keep=lambda d: d[2] <= -0.1, n=4)
    B.whorl(m, CROWN, [(8, 1.0, 1.6, 0.05, 0.01, 0.004, 0.35)], seed=3, sweep=0.15, keep=lambda d: d[2] < 0.1, n=4)

    # swept back off the forehead, long on top: a second way to wear short hair
    opt(m, 'hairSwept', 'head'); B.hair(m).mat(lod=1)
    for i, x in enumerate((-0.62, -0.38, -0.13, 0.12, 0.37, 0.62)):
        B.lock(m, (x, 0.5, 0.82), (x * 1.25 + 0.12, 0.72, -0.62), 0.056, out=(0.004, 0.014), arch=0.024 - 0.008 * abs(x), n=5)
    for k in (1, -1):
        B.lock(m, (k * 0.86, 0.34, 0.4), (k * 0.8, 0.3, -0.62), 0.05, arch=0.008)
        B.lock(m, (k * 0.5, 0.1, -0.85), (k * 0.3, -0.42, -0.86), 0.05, arch=0.008)
    B.lock(m, (0.0, 0.3, -0.95), (0.05, -0.45, -0.9), 0.055, arch=0.008)

    opt(m, 'hairBun', 'head'); B.hair(m).mat(lod=0)
    p = B.on_skull(0, 0.6, -0.8, 0.038)
    m.sphere(0.07, 9, 6, at=tuple(p), scale=(1.05, 0.92, 0.95))
    m.mat(slot='accent', surf='cloth', metal=0, rough=0.8, emit=0, lod=1)
    m.torus(0.042, 0.011, 8, 4, at=tuple(B.on_skull(0, 0.6, -0.8, 0.004)), rot=(-0.9, 0, 0))
    B.hair(m).mat(lod=1)
    for k in (1, -1):
        B.lock(m, (k * 0.8, 0.36, 0.42), (k * 0.2, 0.6, -0.78), 0.052, arch=0.006)
        B.lock(m, (k * 0.6, -0.1, -0.8), (k * 0.1, 0.5, -0.86), 0.05, arch=0.006)

    # long: locks down the back to the shoulder blades, one in front of each ear
    opt(m, 'hairLong', 'head'); B.hair(m).mat(lod=1)
    for i, a in enumerate((-1.5, -1.0, -0.5, 0.0, 0.5, 1.0, 1.5)):
        hang(m, a, -0.1, 0.25 - 0.04 * abs(a) + 0.02 * (i % 2), 0.058, sway=0.012 * (1 if i % 2 else -1), inward=0.03 + 0.02 * abs(math.cos(a)))
    for k in (1, -1):
        p0 = B.on_skull(k * 0.86, 0.4, 0.3, 0.004); p1 = B.on_skull(k * 0.95, 0.0, 0.3, 0.014)
        B.lockp(m, [p0, p1, p1 + np.array([k * 0.006, -0.1, 0.004]), p1 + np.array([k * 0.0, -0.2, 0.012])], [(k, 0, 0.2)] * 4, 0.036)
    B.hair(m).mat(lod=2)
    rows = []
    for y, w, z in ((HC + 0.04, 0.15, -0.17), (HC - 0.12, 0.165, -0.15), (HC - 0.3, 0.12, -0.13)):
        rows.append([(w * math.sin(a), y, z + 0.11 * (1 - math.cos(a))) for a in (-1.5, -0.75, 0.0, 0.75, 1.5)])
    B.grid(m, rows, (0, HC - 0.1, 0.3))

    # a crest of overlapping fins
    opt(m, 'hairMohawk', 'head'); B.hair(m).mat(lod=1)
    for i in range(6):
        a = -0.62 + i * 0.46
        b = B.on_skull(0, math.cos(a), -math.sin(a) + 0.1, -0.01)
        up = np.array([0.0, math.cos(a + 0.3), -math.sin(a + 0.3)])
        h = 0.105 + 0.03 * math.sin((i + 0.5) / 6 * PI)
        B.lockp(m, [b, b + up * h * 0.35, b + up * h * 0.72 + np.array([0, 0, -0.008]), b + up * h + np.array([0, 0, -0.02])], [(1 if i % 2 else -1, 0, 0)] * 4, 0.062, t=0.016)
    B.hair(m).mat(lod=2)
    m.box(0.03, 0.1, 0.3, at=(0, HC + 0.19, -0.02), rot=(-0.15, 0, 0), bevel=0)

    opt(m, 'hairPonytail', 'head')
    b = B.on_skull(0, 0.45, -0.9, 0.0)
    m.mat(slot='accent', surf='cloth', metal=0, rough=0.8, emit=0, lod=0)
    m.sphere(0.03, 6, 4, at=tuple(b + np.asarray((0, 0, -0.012))))
    B.hair(m).mat(lod=1)
    for i, (dx, w, L) in enumerate(((0.0, 0.05, 0.3), (0.022, 0.04, 0.26), (-0.022, 0.04, 0.27))):
        q = b + np.array([dx, 0, -0.02])
        B.lockp(m, [q, q + np.array([dx * 0.5, -0.03, -0.06]), q + np.array([dx, -0.15, -0.085 - 0.01 * i]), q + np.array([dx * 1.5 + 0.01, L * -1.0, -0.05])],
                [(0, 0.5, -1), (0, 0.2, -1), (0, 0, -1), (0, 0, -1)], w, t=w * 0.6)
    for k in (1, -1): B.lock(m, (k * 0.8, 0.36, 0.42), (k * 0.2, 0.5, -0.86), 0.052, arch=0.006)
    B.hair(m).mat(lod=2)
    m.tube([tuple(b), tuple(b + np.asarray((0, -0.02, -0.07))), tuple(b + np.asarray((0.01, -0.28, -0.06)))], 0.04, seg=4, r_end=0.012)

    # a single thick braid down the back, tied at the end
    opt(m, 'hairBraid', 'head'); B.hair(m).mat(lod=0)
    b = B.on_skull(0, 0.2, -0.98, 0.0)
    for i in range(5):
        q = b + np.array([0.012 * (1 if i % 2 else -1), -0.062 * i - 0.01, -0.012 + 0.012 * i - 0.004 * i * i])
        m.sphere(0.036 - 0.003 * i, 6, 4, at=tuple(q), scale=(1.15, 1.0, 0.8))
    m.mat(slot='accent', surf='cloth', metal=0, rough=0.8, emit=0, lod=1)
    m.cyl(0.022, 0.022, 0.02, 6, at=tuple(b + np.array([0, -0.33, -0.03])))
    B.hair(m).mat(lod=1)
    for k in (1, -1):
        B.lock(m, (k * 0.8, 0.36, 0.42), (k * 0.25, 0.3, -0.9), 0.052, arch=0.006)
        B.lock(m, (k * 0.55, -0.2, -0.8), (k * 0.12, 0.1, -0.98), 0.05, arch=0.006)

    # curls: round clumps crowding over the scalp
    opt(m, 'hairCurly', 'head'); B.hair(m).mat(lod=1)
    for i, d in enumerate(((0.0, 1.0, 0.05), (0.52, 0.8, 0.3), (-0.5, 0.8, 0.3), (0.0, 0.78, 0.6), (0.78, 0.55, -0.2), (-0.78, 0.55, -0.2), (0.42, 0.7, -0.6),
                           (-0.4, 0.7, -0.6), (0.0, 0.36, -0.95), (0.62, 0.15, -0.8), (-0.62, 0.15, -0.8), (0.9, 0.3, 0.2), (-0.9, 0.3, 0.2))):
        m.sphere(0.06 + 0.008 * B._rand(i, 9), 7, 5, at=tuple(B.on_skull(*d, out=0.014)), rot=(B._rand(i) * 3, B._rand(i, 2) * 3, 0), scale=(1.0, 0.88, 1.0))
    B.hair(m).mat(lod=2)
    B.cap(m, lambda a: B.hairline(a) - 0.04, 0.05, edge=0.03, A=B.CAP_A_FAR, rows=(0.0, 0.4, 0.8))

    # a bob: cut straight above the brows, falling past the ears to the jaw, its edge turned under
    opt(m, 'hairBob', 'head')
    bob = lambda a: tab([(0.0, 0.3), (0.62, 0.3), (0.8, 0.24), (0.96, -0.3), (1.2, -0.5), (PI, -0.56)], a)
    B.hair(m).mat(lod=1)
    B.cap(m, bob, 0.026, edge=0.006, roll=0.012, A=[0.0, 0.3, 0.62, 0.8, 0.96, 1.2, 1.6, 2.0, 2.5, PI])
    B.hair(m).mat(lod=2)
    B.cap(m, bob, 0.026, edge=0.012, A=B.CAP_A_FAR, rows=(0.0, 0.4, 0.8))
    m.mat(lod=0)


# ---- hats ------------------------------------------------------------------------------------
def hats(m):
    b = opt(m, 'hatGoggles', 'head')
    K.goggles(m, b, lod=1)

    # hard hat: a shell with a crest, a brim all round that juts in front, a badge; it sits down over the brow
    opt(m, 'hatHardhat', 'head')
    m.mat(slot='accent', surf='paint', metal=0.1, rough=0.5, emit=0, texel=1.2, lod=1)
    m.push(at=(0, HC + 0.062, -0.004), rot=(-0.07, 0, 0))
    R = [(0.006, 0.177, 0.197), (0.05, 0.176, 0.196), (0.094, 0.160, 0.180), (0.132, 0.126, 0.144), (0.157, 0.072, 0.086), (0.166, 0.026, 0.032)]
    m.loft([B.ell(y, rx, rz, seg=14, p=2.15) for y, rx, rz in R], close_start=False)
    R = [(0.012, 0.176, 0.194, 0.194), (0.004, 0.198, 0.236, 0.21), (-0.002, 0.213, 0.264, 0.224), (-0.011, 0.209, 0.259, 0.22), (-0.012, 0.168, 0.186, 0.186)]
    m.loft([B.ell(y, rx, rz, seg=14, p=2.1, rzb=rb) for y, rx, rz, rb in R], close_start=False, close_end=False)
    m.tube([(0, 0.02, 0.2), (0, 0.1, 0.176), (0, 0.158, 0.09), (0, 0.172, 0.0), (0, 0.158, -0.09), (0, 0.1, -0.176), (0, 0.02, -0.198)], 0.016, seg=4)
    m.fixed(0x2a2a2e, surf='rubber', rough=0.9, texel=0.5)
    m.cyl(0.171, 0.171, 0.018, 12, at=(0, -0.004, 0), scale=(1, 1, 1.1), cap=False)          # the band inside, seen under the brim
    m.fixed(CREAM, surf='flat', rough=0.7, texel=0.8)
    m.box(0.052, 0.042, 0.01, at=(0, 0.062, 0.194), rot=(-0.12, 0, 0), bevel=0.003)
    m.mat(slot='accent', surf='paint', metal=0.1, rough=0.5, emit=0, texel=0.5, lod=2)
    R = [(-0.006, 0.21, 0.26, 0.22), (0.01, 0.176, 0.196, 0.196), (0.09, 0.160, 0.180, 0.18), (0.15, 0.08, 0.09, 0.09)]
    m.loft([B.ell(y, rx, rz, seg=8, p=2.1, rzb=rb) for y, rx, rz, rb in R], close_start=False)
    m.pop()

    # cap: a soft crown, a stiff curved bill, a button on top
    opt(m, 'hatCap', 'head')
    line = lambda a: tab([(0.0, 0.37), (0.9, 0.33), (1.6, 0.2), (2.4, 0.03), (PI, 0.0)], a)
    B.cloth(m, 'accent', 1.1).mat(lod=1)
    B.cap(m, line, 0.021, edge=0.014, roll=0.004, A=[0.0, 0.35, 0.75, 1.15, 1.6, 2.0, 2.4, 2.8, PI])
    secs = []
    for i in range(7):
        a = -0.78 + 1.56 * i / 6
        c = math.sqrt(1 - line(a) ** 2)
        d = np.array([math.sin(a) * c, line(a), math.cos(a) * c])
        p = np.asarray(B.skull_point(d[0], d[1], d[2], 0.016))
        reach = 0.115 * math.cos(a * 1.35) ** 0.6
        q = p + np.array([math.sin(a) * 0.35 * reach, -0.022 - 0.02 * (a / 0.78) ** 2, reach])
        secs.append([tuple(p + np.array([0, 0.006, -0.01])), tuple(q + np.array([0, 0.004, 0])), tuple(q - np.array([0, 0.004, 0])), tuple(p - np.array([0, 0.006, 0.01]))])
    m.loft(secs)
    m.sphere(0.016, 6, 3, at=tuple(B.on_skull(0, 1, -0.05, 0.022)), scale=(1, 0.6, 1))
    m.fixed(CREAM, surf='flat', rough=0.7, texel=0.8)
    m.box(0.055, 0.044, 0.008, at=tuple(B.on_skull(0, 0.62, 0.78, 0.021)), rot=(-0.62, 0, 0), bevel=0.003)
    B.cloth(m, 'accent', 0.5).mat(lod=2)
    B.cap(m, line, 0.021, edge=0.014, A=B.CAP_A_FAR, rows=(0.0, 0.4, 0.8))
    m.box(0.17, 0.012, 0.11, at=(0, HC + 0.05, 0.2), rot=(0.2, 0, 0), bevel=0)

    # hood: frames the face, a rolled edge, a cowl lying on the shoulders
    opt(m, 'hatHood', 'head')
    line = lambda a: tab([(0.0, 0.6), (0.5, 0.52), (0.8, 0.3), (1.0, -0.1), (1.14, -0.55), (1.3, -0.66), (PI, -0.66)], a)
    B.cloth(m, 'top', 1.0).mat(lod=1)
    B.cap(m, line, 0.026, edge=0.008, roll=0.014, A=[0.0, 0.3, 0.5, 0.8, 1.0, 1.14, 1.3, 1.7, 2.2, 2.7, PI])
    m.torus(0.142, 0.04, 10, 5, at=(0, HC - 0.125, -0.012), rot=(0.25, 0, 0))
    B.cloth(m, 'top', 0.5).mat(lod=2)
    B.cap(m, line, 0.026, edge=0.02, A=B.CAP_A_FAR, rows=(0.0, 0.4, 0.8))

    opt(m, 'hatWeldmask', 'head')
    B.leather(m, 'leather', 0.8).mat(lod=1)
    m.torus(0.168, 0.014, 14, 5, at=(0, HC + 0.062, 0), rot=(-0.1, 0, 0), scale=(0.95, 1, 1.03))
    m.fixed(0x7b848f, surf='paint', metal=0.5, rough=0.5, texel=1.1, lod=0)
    m.box(0.21, 0.22, 0.04, at=(0, HC + 0.2, 0.095), rot=(-1.05, 0, 0), bevel=0.018)
    m.fixed(0x15191e, surf='dark', rough=0.4, texel=0.8, lod=1)
    m.box(0.125, 0.052, 0.046, at=(0, HC + 0.222, 0.122), rot=(-1.05, 0, 0), bevel=0.006)
    m.mat(slot='glow', surf='glass', metal=0.1, rough=0.2, emit=0.4, texel=0.8)
    m.box(0.104, 0.032, 0.05, at=(0, HC + 0.223, 0.124), rot=(-1.05, 0, 0), bevel=0.004)

    # straw hat: a wide brim with an underside, a dented crown, a band
    opt(m, 'hatStrawhat', 'head')
    m.fixed(STRAW, surf='knit', rough=0.9, texel=1.0, lod=1)
    m.lathe([(0.176, 0.006), (0.34, -0.02), (0.372, -0.016), (0.365, -0.004), (0.19, 0.018), (0.178, 0.086), (0.124, 0.132), (0.05, 0.126), (0.0, 0.12)], 16,
            at=(0, HC + 0.056, -0.005), rot=(0.08, 0, 0), cap=False)
    B.cloth(m, 'accent', 0.8)
    m.cyl(0.181, 0.19, 0.034, 14, at=(0, HC + 0.092, -0.003), rot=(0.08, 0, 0), cap=False)
    m.fixed(STRAW, surf='knit', rough=0.9, texel=0.5, lod=2)
    m.lathe([(0.37, -0.016), (0.19, 0.018), (0.178, 0.086), (0.0, 0.13)], 8, at=(0, HC + 0.056, -0.005), rot=(0.08, 0, 0), cap=False)

    # bandana: tied tight over the crown, knotted behind with two tails
    opt(m, 'hatBandana', 'head')
    line = lambda a: tab([(0.0, 0.41), (1.0, 0.37), (1.6, 0.27), (2.4, 0.0), (PI, -0.06)], a)
    B.cloth(m, 'accent', 1.0).mat(lod=1)
    B.cap(m, line, 0.018, edge=0.013, roll=0.004, A=[0.0, 0.4, 0.8, 1.2, 1.6, 2.0, 2.4, 2.8, PI])
    for k in (1, -1):
        p = B.on_skull(k * 0.12, 0.05, -0.99, 0.012)
        m.box(0.04, 0.13, 0.01, at=tuple(p + np.asarray((k * 0.016, -0.062, -0.014))), rot=(0.3, 0, k * 0.3), bevel=0.003)
    m.sphere(0.028, 6, 4, at=tuple(B.on_skull(0, 0.02, -1.0, 0.018)))
    B.cloth(m, 'accent', 0.5).mat(lod=2)
    B.cap(m, line, 0.018, edge=0.013, A=B.CAP_A_FAR, rows=(0.0, 0.4, 0.8))
    m.mat(lod=0)


# ---- kit -------------------------------------------------------------------------------------
def slab(m, xs, ys, out, back=False):
    """A panel on the chest whose edges turn down to it, so it has thickness from every side."""
    e = 0.006
    X = [xs[0] - e] + list(xs) + [xs[-1] + e]; Y = [ys[0] - e] + list(ys) + [ys[-1] + e]
    rows = []
    for j, y in enumerate(Y):
        row = []
        for i, x in enumerate(X):
            o = 0.0005 if j in (0, len(Y) - 1) or i in (0, len(X) - 1) else out
            row.append((x, y, B.chest_z(Y_CHEST + y, x, back) + (-o if back else o)))
        rows.append(row)
    return B.grid(m, rows, (0, Y[len(Y) // 2], 0))


def kit(m):
    # scarf: wound twice round the neck, knotted at the front with two ends hanging
    opt(m, 'scarf', 'chest')
    B.knit(m, 'accent', 1.0).mat(lod=1); B.region(m, 'soft')
    m.torus(0.1, 0.044, 12, 6, at=(0, 0.243, 0.004), rot=(0.2, 0, 0.05), scale=(1.1, 0.86, 1.04))
    m.torus(0.088, 0.034, 10, 5, at=(0, 0.283, -0.004), rot=(0.02, 0.6, -0.1), scale=(1.08, 0.8, 1.0))
    m.sphere(0.04, 6, 4, at=(0.03, 0.215, 0.14), scale=(1.1, 0.85, 0.8))
    m.box(0.07, 0.19, 0.02, at=(0.066, 0.115, 0.146), rot=(-0.12, 0.3, -0.1), bevel=0.007)
    m.box(0.06, 0.14, 0.02, at=(0.012, 0.13, 0.154), rot=(-0.12, 0.1, 0.16), bevel=0.007)
    B.knit(m, 'accent', 0.5).mat(lod=2)
    m.torus(0.1, 0.046, 6, 4, at=(0, 0.25, 0.004), rot=(0.2, 0, 0), scale=(1.1, 0.9, 1.04))
    B.region(m, 'none')

    # apron: a leather bib on a neck strap, a skirt to the knee with a pocket, tied at the back
    opt(m, 'apron', 'chest')
    m.fixed(APRON, surf='leather', rough=0.75, texel=1.0, lod=1)
    slab(m, [-0.115, -0.06, 0.0, 0.06, 0.115], [-0.17, -0.08, 0.02, 0.1], 0.012)
    for k in (1, -1):
        B.strap(m, [(k * (0.1 - 0.16 * max(0.0, y - 0.1)), y) for y in (0.09, 0.14, 0.19, 0.22, 0.245, 0.262)], 0.026, over=[(k * 0.07, y) for y in (0.262, 0.24)])
    m.fixed(0x5e3e28, surf='leather', rough=0.75, texel=0.9)
    slab(m, [-0.06, 0.0, 0.06], [-0.04, 0.03], 0.02)
    m.fixed(APRON, surf='leather', rough=0.75, texel=0.5, lod=2)
    B.panel(m, [-0.115, 0.0, 0.115], [-0.17, 0.1], 0.012)
    opt(m, 'apron', 'hips', '_skirt')
    m.fixed(APRON, surf='leather', rough=0.75, texel=1.0, lod=0)
    rows = []
    for y, w, z in ((0.1, 0.165, 0.132), (-0.05, 0.19, 0.144), (-0.2, 0.2, 0.152), (-0.34, 0.2, 0.154)):
        rows.append([(w * math.sin(a), y, z - 0.085 * (1 - math.cos(a))) for a in (-1.25, -0.8, -0.4, 0.0, 0.4, 0.8, 1.25)])
    B.grid(m, rows, (0, -0.1, -1.0))
    m.mat(lod=1)
    B.grid(m, [[(x, y, z - 0.008) for x, y, z in r] for r in rows], (0, -0.1, 2.0))
    m.fixed(0x5e3e28, surf='leather', rough=0.75, texel=0.9)
    m.box(0.15, 0.09, 0.026, at=(0, -0.12, 0.164), rot=(-0.04, 0, 0), bevel=0.009)
    B.leather(m, 'leather', 0.6)
    R = [(0.998, 0.184, 0.135), (1.03, 0.184, 0.135)]
    with At(m, 'hips'):
        m.on('opt_apron_skirt')
        m.loft([B.ell(y, rx, rz, seg=12, p=2.25) for y, rx, rz in R], close_start=False, close_end=False)
    m.mat(lod=0)

    opt(m, 'backpack', 'chest')
    z = -0.2
    m.fixed(PACK, surf='cloth', rough=0.85, texel=1.0, lod=1); B.region(m, 'pack')
    m.box(0.27, 0.3, 0.15, at=(0, 0.02, z), bevel=0.035, seg=2)
    m.fixed(0x86735c, surf='cloth', rough=0.85, texel=1.0)
    m.box(0.26, 0.11, 0.166, at=(0, 0.135, z - 0.003), bevel=0.03)
    m.steel(texel=0.8)
    m.box(0.05, 0.04, 0.02, at=(0, 0.092, z - 0.086), bevel=0.006)
    B.knit(m, 'accent', 0.9)
    m.cyl(0.058, 0.058, 0.3, 9, at=(0, 0.232, z + 0.01), rot=(0, 0, PI / 2), bevel=0.014)
    m.fixed(PACK, surf='cloth', rough=0.85, texel=0.8)
    m.box(0.055, 0.13, 0.1, at=(0.15, -0.05, z + 0.005), bevel=0.018)
    m.steel(texel=0.8)
    m.cyl(0.037, 0.037, 0.12, 8, at=(-0.157, -0.04, z + 0.005), bevel=0.012)
    B.region(m, 'none')
    B.leather(m, 'leather', 0.8)
    for k in (1, -1):
        B.strap(m, [(k * (0.13 - 0.09 * max(0.0, y - 0.02)), y) for y in (-0.12, -0.05, 0.02, 0.09, 0.15, 0.2, 0.235, 0.257, 0.268)], 0.04, over=[(k * 0.108, y) for y in (0.268, 0.255, 0.225, 0.18)])
    m.fixed(PACK, surf='cloth', rough=0.85, texel=0.5, lod=2)
    m.box(0.27, 0.34, 0.15, at=(0, 0.04, z), bevel=0)
    B.knit(m, 'accent', 0.4)
    m.box(0.3, 0.1, 0.1, at=(0, 0.24, z + 0.01), bevel=0)
    m.mat(lod=0)

    b = opt(m, 'toolbelt', 'hips')
    K.toolbelt(m, b, lod=1)

    opt(m, 'cape', 'chest')
    B.cloth(m, 'accent', 1.0).mat(lod=1); B.region(m, 'drape')
    # a mantle over the shoulders and a drape down the back
    R = [(0.25, 0.085, 0.08), (0.215, 0.2, 0.135), (0.15, 0.262, 0.16), (0.09, 0.275, 0.165)]
    m.loft([B.ell(y, rx, rz, seg=12, p=2.2) for y, rx, rz in R], close_start=False, close_end=False)
    rows = []
    for y, w, z in ((0.12, 0.25, -0.15), (-0.1, 0.27, -0.17), (-0.32, 0.29, -0.19), (-0.52, 0.3, -0.2)):
        rows.append([(w * math.sin(a), y, z + 0.1 * (1 - math.cos(a)) + (0.012 * math.sin(a * 5.3) * (0.12 - y) if y < 0 else 0.0)) for a in (-1.3, -0.85, -0.4, 0.0, 0.4, 0.85, 1.3)])
    B.grid(m, rows, (0, -0.2, 2.0))
    B.grid(m, [[(x, y, z + 0.01) for x, y, z in r] for r in rows], (0, -0.2, -3.0))
    B.region(m, 'none')
    m.fixed(GOLD, surf='metal', metal=0.9, rough=0.35, texel=0.8)
    for k in (1, -1):
        m.sphere(0.028, 6, 4, at=(k * 0.125, 0.19, 0.13))
    B.cloth(m, 'accent', 0.5).mat(lod=2)
    R = [(0.25, 0.085, 0.08), (0.15, 0.262, 0.16), (0.09, 0.275, 0.165)]
    m.loft([B.ell(y, rx, rz, seg=6, p=2.2) for y, rx, rz in R], close_start=False, close_end=False)
    B.grid(m, [[r[0], r[3], r[6]] for r in rows[::3]], (0, -0.2, 2.0))
    B.grid(m, [[r[0], r[3], r[6]] for r in rows[::3]], (0, -0.2, -3.0))
    m.mat(lod=0)

    # arm bones are posed with +Z toward the elbow point, so on an arm the outside is -X for the left
    # pauldron: a domed cop over the shoulder, a lame under it, riveted; a strap across the chest holds it on
    opt(m, 'pauldron', 'armU_L')
    m.fixed(PLATE, surf='paint', metal=0.7, rough=0.42, texel=1.3, lod=1)
    m.push(at=(-0.03, -0.005, 0), rot=(0, 0, 0.4))
    m.lathe([(0.106, -0.03), (0.126, -0.034), (0.13, -0.024), (0.12, 0.022), (0.092, 0.06), (0.046, 0.082), (0.0, 0.087)], 10, scale=(1.04, 1, 1.12), cap=False)
    m.lathe([(0.102, -0.1), (0.114, -0.102), (0.119, -0.092), (0.119, -0.036), (0.108, -0.032)], 10, scale=(1.04, 1, 1.12), cap=False)
    m.fixed(GOLD, surf='metal', metal=0.9, rough=0.35, texel=0.6)
    for a in (-1.0, 0.0, 1.0):
        m.sphere(0.012, 5, 3, at=(-0.125 * math.cos(a) * 1.04, -0.066, 0.125 * math.sin(a) * 1.12))
    m.fixed(PLATE, surf='paint', metal=0.7, rough=0.42, texel=0.5, lod=2)
    m.lathe([(0.118, -0.1), (0.13, -0.024), (0.092, 0.06), (0.0, 0.087)], 6, scale=(1.04, 1, 1.12), cap=False)
    m.pop()
    opt(m, 'pauldron', 'chest', '_strap')
    B.leather(m, 'leather', 0.8).mat(lod=1)
    B.strap(m, [(0.2 - 0.34 * t, 0.2 - 0.2 * t) for t in (0.0, 0.2, 0.4, 0.6, 0.8, 1.0)], 0.034)
    B.strap(m, [(0.2 - 0.34 * t, 0.2 - 0.2 * t) for t in (0.0, 0.2, 0.4, 0.6, 0.8, 1.0)], 0.034, back=True)
    m.steel(texel=0.8)
    m.box(0.044, 0.04, 0.012, at=(0.07, 0.124, B.chest_z(Y_CHEST + 0.124, 0.07) + 0.01), rot=(0, 0.2, 0.53), bevel=0.004)
    m.mat(lod=0)

    # facial hair: shaped masses with a clean line, moving with the jaw; stubble and the marks of age are layers on the skin
    cheek = lambda aa: tab([(0.0, -0.109), (0.16, -0.107), (0.3, -0.095), (0.42, -0.079), (0.6, -0.068), (0.9, -0.05), (1.2, -0.03), (1.42, -0.018)], aa)
    under = lambda aa: -0.159
    full_g = lambda aa, v: 0.0008 + B.sm(0.0, 0.25, v) * B.sm(1.0, 0.82, v) * (0.004 + 0.008 * B.sm(1.42, 1.0, aa) + 0.014 * math.exp(-(aa / 0.6) ** 2))
    full_d = lambda aa, v: (-0.042 * math.exp(-(aa / 0.6) ** 2) * B.sm(0.3, 0.75, v) * (1 - B.sm(0.86, 1.0, v)), 0.014 * math.exp(-(aa / 0.6) ** 2) * B.sm(0.3, 0.75, v) * (1 - B.sm(0.86, 1.0, v)))
    FULL = [-1.42, -1.2, -0.95, -0.7, -0.48, -0.3, -0.15, 0.0, 0.15, 0.3, 0.48, 0.7, 0.95, 1.2, 1.42]
    t_top = lambda aa: -0.0655 - 0.006 * B.sm(0.2, 0.42, aa)
    t_bot = lambda aa: -0.0895 - 0.016 * B.sm(0.16, 0.42, aa)
    t_g = lambda aa, v: 0.0008 + 0.0105 * math.sin(v * PI) ** 0.7 * (1 - 0.55 * B.sm(0.24, 0.42, aa)) * (0.6 + 0.4 * B.sm(0.0, 0.07, aa))
    TACHE = [-0.42, -0.31, -0.2, -0.1, -0.03, 0.03, 0.1, 0.2, 0.31, 0.42]
    chin = lambda aa: -0.108 + 0.016 * (aa / 0.46) ** 2
    goat_g = lambda aa, v: 0.0008 + B.sm(0.0, 0.3, v) * B.sm(1.0, 0.82, v) * 0.017 * B.sm(0.46, 0.2, aa)
    goat_d = lambda aa, v: (-0.036 * B.sm(0.46, 0.1, aa) * B.sm(0.3, 0.75, v) * (1 - B.sm(0.86, 1.0, v)), 0.012 * B.sm(0.46, 0.1, aa) * B.sm(0.3, 0.75, v) * (1 - B.sm(0.86, 1.0, v)))
    GOAT = [-0.46, -0.3, -0.15, 0.0, 0.15, 0.3, 0.46]
    for lod, A, rows in ((1, FULL, 6), (2, FULL[::2], 4)):
        face_mass(m, 'beard', lod, A, cheek, under, rows, full_g, full_d)
    face_mass(m, 'beard', 1, TACHE, t_top, t_bot, 3, t_g)
    face_mass(m, 'moustache', 1, TACHE, t_top, t_bot, 3, t_g)
    face_mass(m, 'moustache', 2, TACHE[1::3], t_top, t_bot, 3, t_g)
    for lod, A, rows in ((1, GOAT, 5), (2, GOAT[::2], 4)):
        face_mass(m, 'goatee', lod, A, chin, under, rows, goat_g, goat_d)
    face_mass(m, 'goatee', 1, TACHE, t_top, t_bot, 3, t_g)
    tache = lambda y, a, x: abs(a) < 0.36 and -0.0925 < y < -0.066
    face_layer(m, 'lines', lambda y, a, x: abs(a) < 1.25 and ((0.058 < y < 0.14 and abs(x) < 0.095) or (-0.112 < y < -0.024 and 0.008 < abs(x) < 0.1) or (-0.03 <= y < 0.014 and abs(x) > 0.086)), 0.0006,
               lambda: m.mat(slot='skin', surf='skin', color=B.MARK_LINES, metal=0.0, rough=0.74, emit=0.0, texel=2.0, lod=1))
    m.mat(lod=0)

    opt(m, 'glasses', 'head')
    m.fixed(0x22262c, surf='dark', metal=0.3, rough=0.4, texel=0.8, lod=1)
    ez = 0.16
    for k in (1, -1):
        m.torus(0.042, 0.005, 12, 4, at=(k * B.EYE[0], B.EYE[1], ez), rot=(PI / 2, 0, 0))
        m.box(0.007, 0.007, 0.13, at=(k * 0.118, B.EYE[1] + 0.004, ez - 0.07), rot=(0, k * 0.28, 0), bevel=0)
    m.box(0.04, 0.007, 0.007, at=(0, B.EYE[1] + 0.008, ez), bevel=0)
    m.mat(lod=0)


def adventurer(m):
    """Gear for the simulated adventurers of the living zone: each is one optional piece."""
    for s, k in SIDES:
        # bracers: leather over the forearm, strapped twice (worn over bare arms or long sleeves)
        opt(m, 'bracers', 'armF_' + s, '_' + s)
        B.leather(m, 'leather', 0.9).mat(lod=1)
        R = [(-0.125, 0.071), (-0.13, 0.078), (-0.19, 0.068), (-0.238, 0.054), (-0.242, 0.047)]
        m.loft([B.ell(y, r, r * 0.95, seg=8) for y, r in R], close_start=False, close_end=False)
        m.steel(texel=0.6)
        for y, r in ((-0.15, 0.0775), (-0.215, 0.064)):
            m.loft([B.ell(y + dy, r + dr, (r + dr) * 0.95, seg=8) for dy, dr in ((0.008, -0.003), (0.006, 0.0), (-0.006, 0.0), (-0.008, -0.003))], close_start=False, close_end=False)
        # knee pads: a hard cap on a strap
        opt(m, 'kneepads', 'shin_' + s, '_' + s)
        m.fixed(PLATE, surf='paint', metal=0.5, rough=0.5, texel=1.0, lod=1)
        m.sphere(0.07, 7, 5, at=(0, 0.004, 0.06), scale=(0.95, 1.1, 0.62))
        B.leather(m, 'leather', 0.6)
        m.cyl(0.094, 0.094, 0.024, 8, at=(0, -0.012, 0.004), cap=False)
    # quiver: slung across the back, fletchings showing over the right shoulder
    opt(m, 'quiver', 'chest')
    B.leather(m, 'leather', 0.9).mat(lod=0)
    m.push(at=(-0.06, 0.04, -0.19), rot=(0.12, 0, 0.42))
    m.cyl(0.05, 0.042, 0.4, 8, bevel=0.008)
    m.mat(lod=1)
    m.cyl(0.054, 0.054, 0.03, 8, at=(0, 0.17, 0), cap=False)
    m.mat(slot='accent', surf='cloth', metal=0, rough=0.8, emit=0)
    for i, (dx, dz) in enumerate(((0.0, 0.0), (0.02, 0.014), (-0.018, 0.012), (0.004, -0.02))):
        m.box(0.008, 0.07, 0.034, at=(dx, 0.245 + 0.01 * i, dz), rot=(0, i * 0.8, 0), bevel=0)
    m.pop()
    B.leather(m, 'leather', 0.7).mat(lod=1)
    B.strap(m, [(-0.2 + 0.36 * t, 0.2 - 0.26 * t) for t in (0.0, 0.2, 0.4, 0.6, 0.8, 1.0)], 0.03)
    # bandolier: a belt of pouches from the left shoulder to the right hip
    opt(m, 'bandolier', 'chest')
    B.leather(m, 'leather', 0.9).mat(lod=1)
    pts = [(0.2 - 0.36 * t, 0.2 - 0.3 * t) for t in (0.0, 0.2, 0.4, 0.6, 0.8, 1.0)]
    B.strap(m, pts, 0.046)
    B.strap(m, pts, 0.046, back=True)
    for t in (0.3, 0.52, 0.74):
        x, y = 0.2 - 0.36 * t, 0.2 - 0.3 * t
        m.box(0.05, 0.056, 0.03, at=(x, y, B.chest_z(Y_CHEST + y, x) + 0.02), rot=(0, x * 2.2, 0.69), bevel=0.008)
    m.mat(lod=0)


# ---- outfits ---------------------------------------------------------------------------------
def outfits(m):
    opt(m, 'hem', 'hips')
    m.mat(lod=1)
    B.hem(m, 'top', seg=14, bone='opt_hem')
    m.mat(lod=0)

    opt(m, 'vest', 'chest')
    B.cloth(m, 'cloth2', 1.0).mat(lod=1)
    rows = []
    for y, rx, rz in ((-0.19, 0.178, 0.132), (-0.06, 0.186, 0.14), (0.04, 0.218, 0.16), (0.11, 0.232, 0.168), (0.16, 0.232, 0.163), (0.205, 0.21, 0.142), (0.238, 0.166, 0.118)):
        ring = B.ell(y, rx, rz, cz=0.008, seg=18, p=2.4, rzb=rz * 0.9)
        rows.append(ring[1:18])   # open at the front
    B.grid(m, rows, (0, 0.05, 0))
    # lapel edges and two pocket flaps
    B.cloth(m, 'top2', 0.8)
    for k in (1, -1):
        B.strap(m, [(k * (0.06 + 0.1 * max(0.0, y - 0.12)), y) for y in (-0.19, -0.1, -0.03, 0.04, 0.1, 0.15, 0.19, 0.22, 0.238)], 0.03, out=0.014)
        m.box(0.07, 0.022, 0.014, at=(k * 0.125, -0.07, B.chest_z(Y_CHEST - 0.07, 0.125) + 0.015), rot=(0.12, k * 0.62, 0), bevel=0.004)
    B.cloth(m, 'cloth2', 0.5).mat(lod=2)
    B.grid(m, [r[::4] for r in rows[::3]], (0, 0.05, 0))

    # overalls: a bib with a pocket on two straps crossed behind, buttoned
    opt(m, 'overalls', 'chest')
    B.cloth(m, 'bottom', 1.0).mat(lod=1)
    slab(m, [-0.11, -0.055, 0.0, 0.055, 0.11], [-0.19, -0.11, -0.03, 0.06], 0.012)
    slab(m, [-0.058, 0.0, 0.058], [-0.07, 0.0], 0.019)
    for k in (1, -1):
        B.strap(m, [(k * (0.095 - 0.1 * max(0.0, y - 0.1)), y) for y in (0.04, 0.11, 0.16, 0.2, 0.23, 0.25, 0.264)], 0.038)
        B.strap(m, [(k * (0.085 - 0.12 * max(0.0, 0.12 - y)), y) for y in (-0.16, -0.08, 0.0, 0.08, 0.15, 0.2, 0.235, 0.255, 0.264)][::-1], 0.038, back=True)
    m.steel(texel=0.7)
    for k in (1, -1):
        m.cyl(0.014, 0.014, 0.01, 7, at=(k * 0.095, 0.05, B.chest_z(Y_CHEST + 0.05, 0.095) + 0.014), rot=(PI / 2 + 0.19, 0, 0))
    B.cloth(m, 'bottom', 0.5).mat(lod=2)
    B.panel(m, [-0.11, 0.0, 0.11], [-0.19, 0.06], 0.012)
    m.mat(lod=0)

    for s, k in SIDES:
        opt(m, 'sleeves', 'armF_' + s, '_' + s)
        B.cloth(m, 'top', 1.0).mat(lod=1); B.region(m, 'none')
        R = [(-0.055, 0.076), (-0.12, 0.074), (-0.2, 0.064), (-0.244, 0.056)]
        m.loft([B.ell(y, r, r * 0.96, seg=10) for y, r in R], close_start=False, close_end=False)
        B.cloth(m, 'top2', 0.8)
        R = [(-0.232, 0.054), (-0.234, 0.062), (-0.262, 0.061), (-0.266, 0.047)]
        m.loft([B.ell(y, r, r * 0.96, seg=10) for y, r in R], close_start=False, close_end=False)
        B.cloth(m, 'top', 0.5).mat(lod=2)
        m.loft([B.ell(y, r, r * 0.96, seg=6) for y, r in ((-0.055, 0.076), (-0.16, 0.07), (-0.262, 0.058))], close_start=False, close_end=False)
    m.mat(lod=0)


def placket(m):
    """The strip the shirt buttons through, from the open collar to the belt (the collar itself is part of the shirt: base.torso)."""
    m.on('chest')
    B.cloth(m, 'top2', 0.9); B.region(m, 'none')
    B.strap(m, [(0.0, y) for y in (-0.19, -0.12, -0.04, 0.04, 0.11, 0.17, 0.215, 0.24)], 0.034, out=0.005)
    m.fixed(CREAM, surf='flat', rough=0.5, texel=0.6)
    for y in (0.15, 0.05, -0.05, -0.15):
        m.cyl(0.009, 0.009, 0.006, 5, at=(0, y, B.chest_z(Y_CHEST + y, 0.0) + 0.008), rot=(PI / 2, 0, 0))


def make():
    m = Model('folk')
    B.skeleton(m)
    # the body twice: full detail for near instances, and a stand-in with a sixth of the triangles
    # that far instances and the baked crowd copies use instead (kit brush `lod`)
    B.pelvis(m, 'bottom', lod=1); B.pelvis(m, 'bottom', seg=8, texel=0.5, lod=2)
    B.legs(m, 'bottom', lod=1); B.legs(m, 'bottom', seg=6, texel=0.5, lod=2)
    B.torso(m, 'top', 'top2', lod=1, collar='top2'); B.torso(m, 'top', 'top2', seg=8, texel=0.5, lod=2)
    B.belt(m, lod=1); B.belt(m, seg=8, lod=2)
    B.neck(m, lod=1); B.neck(m, seg=6, lod=2)
    B.arms(m, sleeve='top', fore='skin', cuff=True, lod=1, cap='top2'); B.arms(m, sleeve='top', fore='skin', seg=6, texel=0.5, lod=2, cap='top2')
    B.hands(m, 'skin', seg=5)
    B.boots(m, 'boots', cuff=('leather',), toe=None, welt=None, lod=1); B.boots(m, 'boots', cuff=('leather',), seg=6, texel=0.5, lod=2)
    m.mat(lod=1); placket(m); m.mat(lod=0)
    B.head(m, lod=1); B.head(m, texel=0.7, lod=2)
    B.eyes(m, lod=1); B.eyes(m, lod=2)
    m.mat(lod=1); B.brows(m); m.mat(lod=0)
    hair(m)
    hats(m)
    kit(m)
    adventurer(m)
    outfits(m)
    return B.remember(m)


def post(rgba, gb, cover):
    return B.face_post(B.people_post(rgba, gb, cover), gb, cover)
