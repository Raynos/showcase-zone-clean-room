"""
Brasswick townsfolk: one body, one texture, every local.

The base is a worker in a shirt with rolled sleeves, belted trousers and boots. Everything else
is an optional piece on a bone named opt_<piece>; src/entities/humanoid/fit.ts decides from a
HumanLook which pieces an instance wears, what colour each palette slot is, how broad the frame
is and how the face is proportioned. Adding a hat or a hairstyle is one function here and one
name in the look's type.

  hair    hairBase (scalp), hairTop (crown and fringe, off under hats), hairShort, hairBun,
          hairLong, hairMohawk, hairPonytail, hairCurly, hairBob
  hats    hatGoggles, hatHardhat, hatCap, hatHood, hatWeldmask, hatStrawhat, hatBandana
  kit     scarf, apron, backpack, toolbelt, cape, pauldron, beard, glasses
  outfit  vest, overalls, sleeves (long sleeves over the bare forearm)
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
FINE = dict(lod=1)


def opt(m, tag, parent, suffix=''):
    name = 'opt_' + tag + suffix
    if name not in m.bone_ix:
        m.bone(name, parent, (0, 0, 0))
    m.on(name)
    return name


def face_layer(m, tag, keep, grow, brush):
    """A patch of the face's own surface as an optional piece, weighted like the skin it lies on (people/head.py patch)."""
    names = {'head': opt(m, tag, 'head')}
    for b in ('jaw', 'cheek', 'nose'): names[b] = opt(m, tag, b, '_' + b)
    m.on(names['head']); brush()
    V, F, W = H.patch(keep, grow)
    rng = m.mesh(B.lift(V), F, recalc=False)
    if m.weights is None: m.weights = {}
    for v, w in zip(rng, W):
        acc = {}
        for b, x in w:
            n = names.get(b, names['head'])
            acc[n] = acc.get(n, 0.0) + x
        m.weights[v] = sorted(acc.items(), key=lambda t: -t[1])


# ---- hair ------------------------------------------------------------------------------------
def tufts(m, L):
    for d, off, r, bend in L:
        b = B.on_skull(*d, out=-0.012)
        B.spike(m, b, b + np.asarray(off), r, bend)


def hair(m):
    opt(m, 'hairBase', 'head')
    B.scalp(m, grow=0.009, fringe=0.4)
    # a tuft in front of each ear and at the nape: what shows of the hair under a hat
    for k in (1, -1):
        b = B.on_skull(k * 0.9, 0.2, 0.3, -0.012)
        B.spike(m, b, b + np.asarray((k * 0.002, -0.07, 0.008)), 0.022, (k * 0.006, 0, 0.004))
        b = B.on_skull(k * 0.55, -0.3, -0.8, -0.01)
        B.spike(m, b, b + np.asarray((k * 0.02, -0.07, -0.03)), 0.045, (0, 0, -0.01))
    opt(m, 'hairTop', 'head'); B.hair(m)
    tufts(m, [
        ((0.3, 0.74, 0.6), (0.06, -0.05, 0.07), 0.052, (0, 0.012, 0.03)),
        ((-0.05, 0.8, 0.6), (0.07, -0.055, 0.075), 0.056, (0, 0.012, 0.035)),
        ((-0.4, 0.74, 0.52), (0.03, -0.05, 0.06), 0.05, (0, 0.012, 0.03)),
        ((0.15, 1.0, 0.05), (0.05, 0.07, 0.02), 0.07, (0, 0, 0.02)),
        ((-0.3, 0.95, -0.15), (-0.05, 0.06, -0.04), 0.07, (0, 0, 0.02)),
        ((0.35, 0.85, -0.4), (0.05, 0.05, -0.07), 0.066, (0, 0.02, 0)),
    ])
    opt(m, 'hairShort', 'head'); B.hair(m)
    tufts(m, [
        ((0.3, 0.3, -0.9), (0.04, -0.03, -0.07), 0.06, (0, 0.02, 0)),
        ((-0.3, 0.3, -0.9), (-0.04, -0.03, -0.07), 0.06, (0, 0.02, 0)),
        ((0.0, -0.1, -0.98), (0.0, -0.06, -0.05), 0.055, (0, 0, -0.01)),
    ])
    opt(m, 'hairBun', 'head'); B.hair(m)
    p = B.on_skull(0, 0.72, -0.7, 0.03)
    m.sphere(0.066, 9, 7, at=tuple(p))
    m.mat(slot='accent', surf='cloth', metal=0, rough=0.8, emit=0)
    m.torus(0.04, 0.012, 8, 4, at=tuple(B.on_skull(0, 0.72, -0.7, 0.0)), rot=(-0.8, 0, 0))
    opt(m, 'hairLong', 'head'); B.hair(m)
    # a curtain down the back to the shoulders, with a lock in front of each ear
    rows = []
    for y, w, z in ((HC + 0.06, 0.15, -0.165), (HC - 0.04, 0.165, -0.168), (HC - 0.14, 0.16, -0.13), (HC - 0.24, 0.14, -0.115), (HC - 0.3, 0.1, -0.12)):
        rows.append([(w * math.sin(a), y, z + 0.11 * (1 - math.cos(a))) for a in (-1.5, -1.0, -0.5, 0.0, 0.5, 1.0, 1.5)])
    B.grid(m, rows, (0, HC - 0.1, 0.3))
    B.grid(m, [[(x, y, z + 0.012) for x, y, z in r] for r in rows], (0, HC - 0.1, -2.0))
    for k in (1, -1):
        b = B.on_skull(k * 0.88, 0.3, 0.25, -0.01)
        B.spike(m, b, b + np.asarray((k * 0.01, -0.2, 0.0)), 0.036, (k * 0.012, 0, 0.01))
    opt(m, 'hairMohawk', 'head'); B.hair(m)
    for i in range(6):
        a = -0.75 + i * 0.52
        b = B.on_skull(0, math.cos(a), -math.sin(a) + 0.12, -0.012)
        t = b + np.asarray((0, math.cos(a) * 0.14, -math.sin(a) * 0.14 - 0.02))
        B.spike(m, b, t, 0.05, (0, 0, -0.012), seg=4)
    opt(m, 'hairPonytail', 'head'); B.hair(m)
    b = B.on_skull(0, 0.45, -0.9, 0.0)
    m.mat(slot='accent', surf='cloth', metal=0, rough=0.8, emit=0)
    m.sphere(0.03, 7, 5, at=tuple(b + np.asarray((0, 0, -0.012))))
    B.hair(m)
    m.tube([tuple(b), tuple(b + np.asarray((0, -0.02, -0.07))), tuple(b + np.asarray((0, -0.14, -0.1))), tuple(b + np.asarray((0.01, -0.28, -0.06)))], 0.042, seg=6, r_end=0.012)
    opt(m, 'hairCurly', 'head'); B.hair(m)
    for d in ((0.0, 1.0, 0.1), (0.5, 0.8, 0.3), (-0.5, 0.8, 0.3), (0.0, 0.8, 0.62), (0.75, 0.6, -0.2), (-0.75, 0.6, -0.2), (0.4, 0.7, -0.6),
              (-0.4, 0.7, -0.6), (0.0, 0.4, -0.95), (0.6, 0.2, -0.8), (-0.6, 0.2, -0.8), (0.9, 0.3, 0.1), (-0.9, 0.3, 0.1), (0.35, 0.92, -0.15), (-0.3, 0.85, 0.5)):
        m.ico(0.062, 1, at=tuple(B.on_skull(*d, out=0.012)))
    opt(m, 'hairBob', 'head'); B.hair(m)
    B.shell(m, 20, 12, lambda d: d[1] > -0.62 and (d[2] < 0.28 or d[1] > 0.52), lambda d: 0.02 + 0.016 * B.sm(0.2, -0.6, d[1]))


# ---- hats ------------------------------------------------------------------------------------
def hats(m):
    b = opt(m, 'hatGoggles', 'head')
    K.goggles(m, b)

    opt(m, 'hatHardhat', 'head')
    m.mat(slot='accent', surf='paint', metal=0.1, rough=0.5, emit=0, texel=1.2)
    m.lathe([(0.19, 0.0), (0.188, 0.05), (0.156, 0.122), (0.085, 0.168), (0.0, 0.178)], 14, at=(0, HC + 0.066, -0.01), rot=(-0.1, 0, 0))
    m.cyl(0.215, 0.215, 0.016, 14, at=(0, HC + 0.072, 0.024), rot=(-0.1, 0, 0), scale=(0.95, 1, 1.14), bevel=0.005)
    m.box(0.04, 0.024, 0.3, at=(0, HC + 0.234, -0.027), rot=(-0.1, 0, 0), bevel=0.01)
    m.fixed(CREAM, surf='flat', rough=0.7, texel=0.8, **FINE)
    m.box(0.05, 0.04, 0.01, at=(0, HC + 0.137, 0.166), rot=(-0.45, 0, 0), bevel=0.003)
    m.mat(lod=0)

    opt(m, 'hatCap', 'head')
    B.cloth(m, 'accent', 1.1)
    m.lathe([(0.18, 0.0), (0.177, 0.056), (0.136, 0.122), (0.058, 0.152), (0.0, 0.157)], 14, at=(0, HC + 0.05, -0.006))
    m.box(0.19, 0.016, 0.15, at=(0, HC + 0.058, 0.215), rot=(0.14, 0, 0), bevel=0.007)
    m.fixed(CREAM, surf='flat', rough=0.7, texel=0.8, **FINE)
    m.box(0.055, 0.044, 0.01, at=(0, HC + 0.098, 0.168), rot=(-0.25, 0, 0), bevel=0.003)
    m.mat(lod=0)

    opt(m, 'hatHood', 'head')
    B.cloth(m, 'top', 1.0)
    B.shell(m, 20, 12, lambda d: d[2] < 0.42 or d[1] > 0.62, 0.022)
    m.torus(0.142, 0.04, 12, 6, at=(0, HC - 0.125, -0.012), rot=(0.25, 0, 0))

    opt(m, 'hatWeldmask', 'head')
    B.leather(m, 'leather', 0.8)
    m.torus(0.168, 0.014, 14, 5, at=(0, HC + 0.062, 0), rot=(-0.1, 0, 0), scale=(0.95, 1, 1.03))
    m.fixed(0x7b848f, surf='paint', metal=0.5, rough=0.5, texel=1.1)
    m.box(0.21, 0.22, 0.04, at=(0, HC + 0.2, 0.095), rot=(-1.05, 0, 0), bevel=0.018)
    m.fixed(0x15191e, surf='dark', rough=0.4, texel=0.8)
    m.box(0.125, 0.052, 0.046, at=(0, HC + 0.222, 0.122), rot=(-1.05, 0, 0), bevel=0.006)
    m.mat(slot='glow', surf='glass', metal=0.1, rough=0.2, emit=0.4, texel=0.8)
    m.box(0.104, 0.032, 0.05, at=(0, HC + 0.223, 0.124), rot=(-1.05, 0, 0), bevel=0.004)

    opt(m, 'hatStrawhat', 'head')
    m.fixed(STRAW, surf='knit', rough=0.9, texel=1.0)
    m.lathe([(0.37, -0.014), (0.36, 0.0), (0.182, 0.014), (0.17, 0.082), (0.11, 0.132), (0.0, 0.14)], 16, at=(0, HC + 0.066, -0.005), rot=(0.08, 0, 0))
    B.cloth(m, 'accent', 0.8)
    m.cyl(0.178, 0.184, 0.032, 14, at=(0, HC + 0.098, -0.004), rot=(0.08, 0, 0), cap=False)

    opt(m, 'hatBandana', 'head')
    B.cloth(m, 'accent', 1.0)
    B.shell(m, 20, 12, lambda d: d[1] > 0.36 - 0.25 * max(0.0, -d[2]), 0.011)
    for k in (1, -1):
        p = B.on_skull(k * 0.12, 0.25, -0.95, 0.01)
        m.box(0.04, 0.13, 0.012, at=tuple(p + np.asarray((k * 0.012, -0.06, -0.012))), rot=(0.28, 0, k * 0.28), bevel=0.004)
    m.sphere(0.03, 6, 5, at=tuple(B.on_skull(0, 0.3, -0.95, 0.014)))


# ---- kit -------------------------------------------------------------------------------------
def kit(m):
    opt(m, 'scarf', 'chest')
    B.knit(m, 'accent', 1.0)
    m.torus(0.098, 0.044, 12, 6, at=(0, 0.25, 0.006), rot=(0.16, 0, 0), scale=(1.1, 0.9, 1.04))
    m.box(0.07, 0.2, 0.024, at=(0.06, 0.13, 0.142), rot=(-0.1, 0.3, -0.08), bevel=0.008)
    m.box(0.062, 0.14, 0.022, at=(0.015, 0.15, 0.15), rot=(-0.1, 0.1, 0.14), bevel=0.008)

    opt(m, 'apron', 'chest')
    m.fixed(APRON, surf='leather', rough=0.75, texel=1.0)
    m.box(0.25, 0.27, 0.016, at=(0, -0.06, 0.143), rot=(0.17, 0, 0), bevel=0.006)
    for k in (1, -1):
        B.strap(m, [(k * (0.108 - 0.14 * max(0.0, y - 0.06)), y) for y in (0.05, 0.1, 0.15, 0.19, 0.22, 0.245, 0.262)], 0.026)
    opt(m, 'apron', 'hips', '_skirt')
    m.fixed(APRON, surf='leather', rough=0.75, texel=1.0)
    rows = []
    for y, w, z in ((0.1, 0.165, 0.128), (-0.05, 0.19, 0.142), (-0.2, 0.2, 0.15), (-0.34, 0.2, 0.152)):
        rows.append([(w * math.sin(a), y, z - 0.085 * (1 - math.cos(a))) for a in (-1.25, -0.8, -0.4, 0.0, 0.4, 0.8, 1.25)])
    B.grid(m, rows, (0, -0.1, -1.0))
    B.grid(m, [[(x, y, z - 0.008) for x, y, z in r] for r in rows], (0, -0.1, 2.0))
    m.fixed(0x5e3e28, surf='leather', rough=0.75, texel=0.9)
    m.box(0.14, 0.085, 0.03, at=(0, -0.1, 0.162), rot=(-0.05, 0, 0), bevel=0.01)

    opt(m, 'backpack', 'chest')
    z = -0.2
    m.fixed(PACK, surf='cloth', rough=0.85, texel=1.0)
    m.box(0.27, 0.3, 0.15, at=(0, 0.02, z), bevel=0.035, seg=2)
    m.fixed(0x86735c, surf='cloth', rough=0.85, texel=1.0)
    m.box(0.26, 0.11, 0.166, at=(0, 0.135, z - 0.003), bevel=0.03)
    m.steel(texel=0.8, **FINE)
    m.box(0.05, 0.04, 0.02, at=(0, 0.092, z - 0.086), bevel=0.006)
    m.mat(lod=0)
    B.knit(m, 'accent', 0.9)
    m.cyl(0.058, 0.058, 0.3, 9, at=(0, 0.232, z + 0.01), rot=(0, 0, PI / 2), bevel=0.014)
    m.fixed(PACK, surf='cloth', rough=0.85, texel=0.8)
    m.box(0.055, 0.13, 0.1, at=(0.15, -0.05, z + 0.005), bevel=0.018)
    m.steel(texel=0.8)
    m.cyl(0.037, 0.037, 0.12, 8, at=(-0.157, -0.04, z + 0.005), bevel=0.012)
    B.leather(m, 'leather', 0.8)
    for k in (1, -1):
        B.strap(m, [(k * (0.13 - 0.09 * max(0.0, y - 0.02)), y) for y in (-0.12, -0.05, 0.02, 0.09, 0.15, 0.2, 0.235, 0.257, 0.268)], 0.04, over=[(k * 0.108, y) for y in (0.268, 0.255, 0.225, 0.18)])

    b = opt(m, 'toolbelt', 'hips')
    K.toolbelt(m, b)

    opt(m, 'cape', 'chest')
    B.cloth(m, 'accent', 1.0)
    # a mantle over the shoulders and a drape down the back
    R = [(0.25, 0.085, 0.08), (0.215, 0.2, 0.135), (0.15, 0.262, 0.16), (0.09, 0.275, 0.165)]
    m.loft([B.ell(y, rx, rz, seg=14, p=2.2) for y, rx, rz in R], close_start=False, close_end=False)
    rows = []
    for y, w, z in ((0.12, 0.25, -0.15), (-0.1, 0.27, -0.17), (-0.32, 0.29, -0.19), (-0.52, 0.3, -0.2)):
        rows.append([(w * math.sin(a), y, z + 0.1 * (1 - math.cos(a))) for a in (-1.3, -0.85, -0.4, 0.0, 0.4, 0.85, 1.3)])
    B.grid(m, rows, (0, -0.2, 2.0))
    B.grid(m, [[(x, y, z + 0.01) for x, y, z in r] for r in rows], (0, -0.2, -3.0))
    m.fixed(GOLD, surf='metal', metal=0.9, rough=0.35, texel=0.8)
    for k in (1, -1):
        m.sphere(0.03, 7, 5, at=(k * 0.125, 0.19, 0.128))

    # arm bones are posed with +Z toward the elbow point, so on an arm the outside is -X for the left
    opt(m, 'pauldron', 'armU_L')
    m.fixed(0x8b939d, surf='paint', metal=0.6, rough=0.45, texel=1.2)
    m.sphere(0.122, 10, 7, at=(-0.014, 0.02, 0), scale=(1.05, 0.72, 1.1))
    B.cloth(m, 'accent', 0.8)
    m.cyl(0.128, 0.128, 0.024, 10, at=(-0.014, -0.024, 0), scale=(1.05, 1, 1.1), cap=False)
    m.fixed(GOLD, surf='metal', metal=0.9, rough=0.35, texel=0.6, **FINE)
    m.sphere(0.022, 6, 4, at=(-0.11, 0.034, 0))
    m.mat(lod=0)

    # facial hair and the marks of age: layers over the face that move with the skin under them
    full = lambda y, a, x: abs(a) < 1.5 and y < H.beard_top(abs(a))
    tache = lambda y, a, x: abs(a) < 0.36 and -0.0925 < y < -0.066
    goat = lambda y, a, x: abs(a) < 0.42 and y < -0.098
    edge = lambda y, a: B.sm(0.0, 0.022, H.beard_top(abs(a)) - y) * B.sm(1.5, 1.2, abs(a))
    thick = lambda y, a, x: 0.0012 + (0.006 + 0.013 * B.sm(-0.07, -0.14, y)) * edge(y, a)
    tache_g = lambda y, a, x: 0.0008 + 0.0085 * B.sm(-0.0935, -0.08, y) * B.sm(-0.066, -0.074, y) * (0.55 + 0.45 * B.sm(0.0, 0.2, abs(a))) * B.sm(0.36, 0.26, abs(a))
    face_layer(m, 'beard', lambda y, a, x: full(y, a, x) or tache(y, a, x), lambda y, a, x: max(thick(y, a, x) if full(y + 0.004, a, x) else 0.0, tache_g(y, a, x)), lambda: B.hair(m, 1.2))
    face_layer(m, 'moustache', tache, tache_g, lambda: B.hair(m, 1.2))
    face_layer(m, 'goatee', lambda y, a, x: goat(y, a, x) or tache(y, a, x),
               lambda y, a, x: max((0.0012 + 0.012 * B.sm(0.42, 0.25, abs(a)) * B.sm(-0.098, -0.115, y)) if y < -0.097 else 0.0, tache_g(y, a, x)), lambda: B.hair(m, 1.2))
    face_layer(m, 'stubble', lambda y, a, x: abs(a) < 1.5 and y < H.beard_top(abs(a)) + 0.012 or tache(y, a, x), 0.0007,
               lambda: m.mat(slot='skin', surf='skin', color=B.MARK_STUBBLE, metal=0.0, rough=0.8, emit=0.0, texel=1.6, lod=1))
    face_layer(m, 'lines', lambda y, a, x: abs(a) < 1.25 and ((0.058 < y < 0.14 and abs(x) < 0.095) or (-0.112 < y < -0.024 and 0.008 < abs(x) < 0.1) or (-0.03 <= y < 0.014 and abs(x) > 0.086)), 0.0006,
               lambda: m.mat(slot='skin', surf='skin', color=B.MARK_LINES, metal=0.0, rough=0.74, emit=0.0, texel=2.0, lod=1))
    m.mat(lod=0)

    opt(m, 'glasses', 'head')
    m.fixed(0x22262c, surf='dark', metal=0.3, rough=0.4, texel=0.8)
    ez = 0.16
    for k in (1, -1):
        m.torus(0.042, 0.0055, 10, 4, at=(k * B.EYE[0], B.EYE[1], ez), rot=(PI / 2, 0, 0))
        m.box(0.008, 0.008, 0.13, at=(k * 0.118, B.EYE[1] + 0.004, ez - 0.07), rot=(0, k * 0.28, 0), bevel=0)
    m.box(0.04, 0.008, 0.008, at=(0, B.EYE[1] + 0.008, ez), bevel=0)


# ---- outfits ---------------------------------------------------------------------------------
def outfits(m):
    opt(m, 'vest', 'chest')
    B.cloth(m, 'cloth2', 1.0)
    rows = []
    for y, rx, rz in ((-0.17, 0.174, 0.13), (-0.04, 0.188, 0.138), (0.045, 0.215, 0.152), (0.12, 0.226, 0.158), (0.17, 0.224, 0.153), (0.215, 0.2, 0.134), (0.24, 0.158, 0.112)):
        ring = B.ell(y, rx, rz, cz=0.006, seg=18, p=2.3, rzb=rz * 0.93)
        rows.append(ring[1:18])   # open at the front
    B.grid(m, rows, (0, 0.05, 0))
    # lapel edges and two pocket flaps
    B.cloth(m, 'top2', 0.8)
    for k in (1, -1):
        B.strap(m, [(k * (0.06 + 0.1 * max(0.0, y - 0.12)), y) for y in (-0.17, -0.1, -0.03, 0.04, 0.1, 0.15, 0.19, 0.22, 0.24)], 0.03, out=0.013)
        m.box(0.07, 0.022, 0.014, at=(k * 0.125, -0.07, B.chest_z(Y_CHEST - 0.07, 0.125) + 0.014), rot=(0.12, k * 0.62, 0), bevel=0.004, **FINE)

    opt(m, 'overalls', 'chest')
    B.cloth(m, 'bottom', 1.0)
    m.box(0.22, 0.2, 0.016, at=(0, -0.02, 0.15), rot=(0.19, 0, 0), bevel=0.006)
    m.box(0.12, 0.07, 0.02, at=(0, -0.01, 0.158), rot=(0.19, 0, 0), bevel=0.006)
    for k in (1, -1):
        B.strap(m, [(k * (0.095 - 0.1 * max(0.0, y - 0.1)), y) for y in (0.06, 0.11, 0.16, 0.2, 0.23, 0.25, 0.264)], 0.038)
        B.strap(m, [(k * (0.085 - 0.12 * max(0.0, 0.12 - y)), y) for y in (-0.16, -0.08, 0.0, 0.08, 0.15, 0.2, 0.235, 0.255, 0.264)][::-1], 0.038, back=True)
    m.steel(texel=0.7, **FINE)
    for k in (1, -1):
        m.cyl(0.014, 0.014, 0.01, 7, at=(k * 0.095, 0.066, B.chest_z(Y_CHEST + 0.066, 0.095) + 0.012), rot=(PI / 2 + 0.19, 0, 0))
    m.mat(lod=0)

    for s, k in SIDES:
        opt(m, 'sleeves', 'armF_' + s, '_' + s)
        B.cloth(m, 'top', 1.0)
        cx = 0.0
        R = [(-0.055, 0.074), (-0.12, 0.07), (-0.2, 0.06), (-0.248, 0.052)]
        m.loft([B.ell(y, r, r * 0.96, cx=cx, seg=10) for y, r in R], close_start=False, close_end=False)
        B.cloth(m, 'top2', 0.8)
        R = [(-0.236, 0.05), (-0.238, 0.058), (-0.262, 0.057), (-0.266, 0.046)]
        m.loft([B.ell(y, r, r * 0.96, cx=cx, seg=10) for y, r in R], close_start=False, close_end=False)


def collar(m):
    m.on('chest')
    B.cloth(m, 'top2', 0.9)
    # placket and buttons (the standing collar is part of the shirt: base.torso)
    m.box(0.03, 0.26, 0.012, at=(0, 0.06, 0.143), rot=(-0.06, 0, 0), bevel=0.004)
    m.fixed(CREAM, surf='flat', rough=0.5, texel=0.6, **FINE)
    for y in (0.14, 0.05, -0.04):
        m.cyl(0.009, 0.009, 0.008, 6, at=(0, y, 0.15 - (0.14 - y) * 0.03), rot=(PI / 2, 0, 0))
    m.mat(lod=0)


def make():
    m = Model('folk')
    B.skeleton(m)
    # the body twice: full detail for near instances, and a stand-in with a third of the triangles
    # that far instances and the baked crowd copies use instead (kit brush `lod`)
    B.pelvis(m, 'bottom', lod=1); B.pelvis(m, 'bottom', seg=8, texel=0.5, lod=2)
    B.legs(m, 'bottom', lod=1); B.legs(m, 'bottom', seg=6, texel=0.5, lod=2)
    B.torso(m, 'top', 'top2', lod=1, collar='top2'); B.torso(m, 'top', 'top2', seg=8, texel=0.5, lod=2)
    B.belt(m, lod=1); B.belt(m, seg=8, lod=2)
    B.neck(m, lod=1); B.neck(m, seg=6, lod=2)
    B.arms(m, sleeve='top', fore='skin', cuff=True, lod=1, cap='top2'); B.arms(m, sleeve='top', fore='skin', seg=6, texel=0.5, lod=2, cap='top2')
    B.hands(m, 'skin', seg=5)
    B.boots(m, 'boots', cuff=('leather',), toe=None, welt=None, lod=1); B.boots(m, 'boots', cuff=('leather',), seg=6, texel=0.5, lod=2)
    m.mat(lod=1); collar(m); m.mat(lod=0)
    B.head(m, lod=1); B.head(m, texel=0.7, lod=2)
    B.eyes(m, lod=1); B.eyes(m, lod=2)
    m.mat(lod=1); B.brows(m); m.mat(lod=0)
    hair(m)
    hats(m)
    kit(m)
    outfits(m)
    return m


def post(rgba, gb, cover):
    return B.face_post(B.people_post(rgba, gb, cover), gb, cover)
