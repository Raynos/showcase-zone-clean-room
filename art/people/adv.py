"""
Adventurers: the other heroes of the zone. One body, one texture, every kit.

The base is a figure in a long-sleeved tunic, trousers, gloves and tall boots. Everything that
makes a kit is an optional piece on bones named opt_<piece>_<bone it is worn on>;
src/entities/humanoid/fit.ts decides from a HumanLook's kit which pieces an instance wears and what
colour each palette slot is. Armour comes in three weights and is built from shared parts:

  head    hood, mask, capLeather, helmOpen, helmFull, kettle, rangeHat, circlet, plume
          (and from the townsfolk: hatGoggles, hatBandana, the hair styles, beards, glasses)
  body    jerkin, gambeson (light); brig, coat (medium); cuirass (heavy); tabard, sash
  arms    pauldL, pauldR, pauldBig, bracers, vambrace, gauntlet
  legs    tassets, greaves, kneepads, skirt
  back    bedroll, techpack, satchel, quiver, bandolier
  cloth   cape (three sway bones), cloak (two)
  weapon  one of the 13 weapons (art/weapons/common.py), on the `wpn` bone that the rig carries
          from the back to the hand

Palette: `body` and `body2` are the armour's plate and its second layer, `trim` its edging (iron on
a novice, brass, then gold), `glow` its inlays (dark until a high level lights them), `accent` and
`cloth2` the cloth.

Every piece is built twice where it matters: its near form (brush lod 1) and a far stand-in of a
few dozen triangles (lod 2), so a distant adventurer with weapon and cape stays near three thousand.
"""
import math

import numpy as np

from lib.kit import Model, PI
from people import base as B
from people import folk as F
from people import head as H
from people.base import At, HC, SK, SIDES, Y_CHEST, Y_SHOULDER
from weapons import common as W

TEX = 1024
BUILD = dict(ao_dist=0.14, edge_dist=0.016, edge_w=0.005, scale=1.0, chip=0.4, grime=0.3, ao_min=0.42, edge_other=0.25, quality=82)

PACK = 0x6b5a48
ROWS = B.TORSO + B.YOKE[1:]
NEAR_FAR = ((1, False), (2, True))

# what the adventurers keep of the townsfolk's wardrobe
KEEP_FOLK = {'hairBase', 'hairTop', 'hairShort', 'hairSwept', 'hairLong', 'hairMohawk', 'hairPonytail', 'hairBraid', 'hairBob',
             'hatGoggles', 'hatBandana', 'beard', 'moustache', 'goatee', 'lines', 'glasses', 'quiver', 'bandolier', 'bracers', 'kneepads'}


# ---- optional bones and brushes --------------------------------------------------------------
def obn(m, tag, parent, at=(0, 0, 0), suffix=None):
    """The optional bone of `tag` worn on `parent` (made on first use); the current bone is left alone."""
    name = 'opt_%s_%s' % (tag, suffix or parent)
    if name not in m.bone_ix:
        cur = m.cur_bone
        m.bone(name, parent, at)
        m.cur_bone = cur
    return name


class Opt:
    """Work on the optional bone of `tag` on `parent`, in model space (or the bone's own with local=True)."""
    def __init__(self, m, tag, parent, local=False):
        self.m, self.tag, self.parent, self.local = m, tag, parent, local

    def __enter__(self):
        m = self.m
        name = obn(m, self.tag, self.parent)
        p = m.bone_pos(self.parent)
        m.on(name)
        m.push(at=(0, 0, 0) if self.local else (-p.x, -p.y, -p.z))
        return name

    def __exit__(self, *a):
        self.m.pop()


def wmap(m, tag, ws):
    return [(obn(m, tag, b), w) for b, w in ws]


def plate(m, slot='body', texel=1.0, metal=0.65, rough=0.42): return m.mat(slot=slot, surf='paint', metal=metal, rough=rough, emit=0.0, texel=texel)
def trim(m, texel=0.8): return m.mat(slot='trim', surf='metal', metal=0.9, rough=0.34, emit=0.0, texel=texel)
def gem(m, emit=1.5, texel=0.6): return m.mat(slot='glow', surf='glow', metal=0.0, rough=0.4, emit=emit, texel=texel)


def row_at(y):
    y = min(max(y, ROWS[0][0]), ROWS[-1][0])
    for a, b in zip(ROWS, ROWS[1:]):
        if y <= b[0]: break
    t = (y - a[0]) / (b[0] - a[0])
    return [a[i] + (b[i] - a[i]) * t for i in range(6)]


def shell(m, tag, ys, grow, seg, keel=0.0, close_top=False):
    """A layer over the torso at heights `ys`, `grow` proud of the shirt (a number or grow(y)); keel rounds the chest out."""
    rings = []; ws = []
    for y in ys:
        _, rx, rzf, rzb, cz, p = row_at(y)
        g = grow(y) if callable(grow) else grow
        k = keel * B.sm(1.02, 1.2, y) * B.sm(1.4, 1.28, y)
        rings.append(B.ell(y, rx + g, rzf + g + k, cz=cz, seg=seg, p=p, rzb=rzb + g))
        ws.append(wmap(m, tag, B.w_torso(y)))
    with Opt(m, tag, 'chest'):
        return B.wloft(m, rings, ws, close_start=False, close_end=close_top)


def wgrid(m, rows, ws, centre):
    """An open surface through rows of points, one weight list per row."""
    rng = B.grid(m, rows, centre)
    n = len(rows[0])
    if m.weights is None: m.weights = {}
    for i, v in enumerate(rng): m.weights[v] = ws[i // n]
    return rng


def hip_ring(y, g, seg, p=2.25):
    """A ring round the hips at height y, g proud of the trousers."""
    return B.ell(y, 0.174 + g, 0.124 + g, seg=seg, p=p, rzb=0.127 + g)


# ---- head ------------------------------------------------------------------------------------
def tab(K, a):
    return H._lerp_tab([k[0] for k in K], [k[1] for k in K], abs(a))


def headgear(m):
    # hood: deep, with a point at the back and a cowl lying on the shoulders
    line = lambda a: tab([(0.0, 0.62), (0.5, 0.54), (0.8, 0.3), (1.0, -0.1), (1.14, -0.55), (1.3, -0.68), (PI, -0.68)], a)
    grow = lambda t, a: 0.03 + 0.03 * B.sm(0.15, 0.9, t) * B.sm(1.2, 2.6, abs(a))
    with Opt(m, 'hood', 'head', local=True):
        B.cloth(m, 'cloth2', 1.0).mat(lod=1)
        B.cap(m, line, grow, edge=0.01, roll=0.016, A=[0.0, 0.3, 0.5, 0.8, 1.0, 1.14, 1.3, 1.7, 2.2, 2.7, PI])
        m.torus(0.15, 0.045, 10, 5, at=(0, HC - 0.13, -0.014), rot=(0.25, 0, 0), scale=(1.05, 1, 1.0))
        B.cloth(m, 'cloth2', 0.5).mat(lod=2)
        B.cap(m, line, grow, edge=0.024, A=B.CAP_A_FAR, rows=(0.0, 0.4, 0.8))
        m.torus(0.15, 0.045, 6, 3, at=(0, HC - 0.13, -0.014), rot=(0.25, 0, 0))
        m.mat(lod=0)

    # mask: cloth pulled up over the nose
    with Opt(m, 'mask', 'head', local=True):
        B.cloth(m, 'accent', 0.9).mat(lod=1)
        rows = []
        for dy in (-0.02, -0.25, -0.5, -0.74, -0.9):
            row = []
            for a in (-1.25, -0.85, -0.45, 0.0, 0.45, 0.85, 1.25):
                c = math.sqrt(max(0.0, 1 - dy * dy))
                g = 0.01 + 0.03 * math.exp(-(a / 0.42) ** 2) * (1 - abs(dy + 0.35) * 0.9)
                row.append(B.skull_point(math.sin(a) * c, dy, math.cos(a) * c, g))
            rows.append(row)
        B.grid(m, rows, (0, HC, 0))
        m.mat(lod=0)

    # leather cap: close over the crown, flaps over the ears
    line = lambda a: tab([(0.0, 0.36), (0.8, 0.3), (1.1, -0.2), (1.5, -0.42), (2.2, -0.4), (PI, -0.36)], a)
    with Opt(m, 'capLeather', 'head', local=True):
        B.leather(m, 'leather', 1.0).mat(lod=1)
        B.cap(m, line, 0.02, edge=0.012, roll=0.006, A=[0.0, 0.4, 0.8, 1.1, 1.5, 2.0, 2.5, PI])
        trim(m, 0.6)
        for k in (1, -1): m.sphere(0.014, 5, 3, at=B.skull_point(k * 0.92, -0.3, 0.2, 0.022))
        B.leather(m, 'leather', 0.5).mat(lod=2)
        B.cap(m, line, 0.02, edge=0.014, A=B.CAP_A_FAR, rows=(0.0, 0.4, 0.8))
        m.mat(lod=0)

    # open helm: a dome with cheek plates, a nasal and a comb
    line = lambda a: tab([(0.0, 0.3), (0.42, 0.28), (0.62, -0.1), (0.8, -0.62), (1.2, -0.7), (PI, -0.62)], a)
    with Opt(m, 'helmOpen', 'head', local=True):
        plate(m, 'body', 1.1).mat(lod=1)
        B.cap(m, line, 0.03, edge=0.022, roll=0.006, A=[0.0, 0.25, 0.42, 0.62, 0.8, 1.0, 1.2, 1.6, 2.0, 2.5, PI])
        m.box(0.03, 0.12, 0.022, at=B.skull_point(0, 0.02, 1.0, 0.045), rot=(-0.08, 0, 0), bevel=0.006)
        trim(m, 0.7)
        m.tube([B.skull_point(0, math.sin(t), math.cos(t), 0.036) for t in (0.5, 0.9, 1.3, PI / 2 + 0.2, 2.3, 2.8, 3.3)], 0.013, seg=4)
        plate(m, 'body', 0.5).mat(lod=2)
        B.cap(m, line, 0.03, edge=0.024, A=B.CAP_A_FAR, rows=(0.0, 0.4, 0.8))
        m.box(0.03, 0.12, 0.022, at=B.skull_point(0, 0.02, 1.0, 0.045), bevel=0)
        m.mat(lod=0)

    # full helm: closed, a keeled face with a lit slit for the eyes, breaths, a comb
    line = lambda a: -0.86
    with Opt(m, 'helmFull', 'head', local=True):
        for lod, far in NEAR_FAR:
            plate(m, 'body', 0.5 if far else 1.1).mat(lod=lod)
            B.cap(m, line, 0.034, edge=0.03, A=B.CAP_A_FAR if far else [0.0, 0.3, 0.6, 0.9, 1.2, 1.6, 2.0, 2.5, PI], rows=(0.0, 0.4, 0.8) if far else (0.0, 0.1, 0.3, 0.58, 0.82))
            # the face plate: a keel running from brow to chin
            m.prism([(-0.075, -0.15), (0.075, -0.15), (0.095, 0.03), (0.06, 0.09), (-0.06, 0.09), (-0.095, 0.03)], 0.05, at=(0, HC - 0.02, 0.172), rot=(-0.06, 0, 0), bevel=0 if far else 0.012)
            m.fixed(0x101216, surf='dark', rough=0.5, texel=0.5)
            m.box(0.15, 0.022, 0.03, at=(0, HC + 0.012, 0.19), bevel=0)
            gem(m, 1.2)
            m.box(0.12, 0.009, 0.03, at=(0, HC + 0.012, 0.194), bevel=0)
        trim(m, 0.7).mat(lod=1)
        m.tube([B.skull_point(0, math.sin(t), math.cos(t), 0.04) for t in (0.6, 0.9, 1.3, PI / 2 + 0.2, 2.3, 2.8, 3.4)], 0.014, seg=4)
        m.lathe([(0.118, -0.01), (0.13, 0.0), (0.118, 0.012)], 10, at=(0, HC - 0.155, 0.0), scale=(1.0, 1, 1.12), cap=False)
        m.mat(lod=0)

    # kettle hat: a brimmed steel hat over a mail coif
    line = lambda a: 0.26
    coif = lambda a: tab([(0.0, 0.56), (0.5, 0.5), (0.8, 0.26), (1.0, -0.14), (1.14, -0.58), (1.3, -0.7), (PI, -0.7)], a)
    with Opt(m, 'kettle', 'head', local=True):
        for lod, far in NEAR_FAR:
            plate(m, 'body', 0.5 if far else 1.1).mat(lod=lod)
            B.cap(m, line, 0.03, edge=0.03, A=B.CAP_A_FAR if far else None, rows=(0.0, 0.4, 0.8) if far else (0.0, 0.1, 0.3, 0.58, 0.82))
            m.lathe([(0.18, 0.012), (0.285, -0.036), (0.297, -0.03), (0.292, -0.02), (0.19, 0.03)], 8 if far else 14, at=(0, HC + 0.062, -0.004), rot=(-0.05, 0, 0), scale=(1, 1, 1.08), cap=False)
            m.mat(slot='body2', surf='knit', metal=0.5, rough=0.6, emit=0.0, texel=0.5 if far else 1.0)
            B.cap(m, coif, 0.016, edge=0.012, A=B.CAP_A_FAR if far else [0.0, 0.3, 0.5, 0.8, 1.0, 1.14, 1.3, 1.7, 2.2, 2.7, PI], rows=(0.0, 0.4, 0.8) if far else (0.0, 0.1, 0.3, 0.58, 0.82))
            m.torus(0.13, 0.04, 6 if far else 10, 3 if far else 5, at=(0, HC - 0.135, -0.012), rot=(0.2, 0, 0))
        m.mat(lod=0)

    # range hat: a wide felt brim cocked to one side, a band and a feather
    with Opt(m, 'rangeHat', 'head', local=True):
        for lod, far in NEAR_FAR:
            B.cloth(m, 'cloth2', 0.5 if far else 1.0).mat(lod=lod)
            m.push(at=(0, HC + 0.066, -0.006), rot=(-0.1, 0, 0.1))
            m.lathe([(0.176, 0.0), (0.172, 0.07), (0.145, 0.115), (0.07, 0.128), (0.0, 0.124)], 8 if far else 12, scale=(1, 1, 1.1), cap=False)
            m.lathe([(0.176, 0.004), (0.33, -0.024), (0.345, -0.016), (0.338, -0.006), (0.18, 0.022)], 8 if far else 14, scale=(1, 1, 1.12), cap=False)
            B.cloth(m, 'accent', 0.4 if far else 0.8)
            m.cyl(0.18, 0.184, 0.03, 8 if far else 12, at=(0, 0.02, 0), scale=(1, 1, 1.1), cap=False)
            m.box(0.012, 0.2, 0.05, at=(0.17, 0.11, -0.08), rot=(-0.5, 0, -0.25), bevel=0)
            m.pop()
        m.mat(lod=0)

    # circlet: a band across the brow with a stone
    with Opt(m, 'circlet', 'head', local=True):
        trim(m, 0.8).mat(lod=0)
        pts = []
        for i in range(11):
            a = 2 * PI * i / 10
            dy = 0.36 - 0.14 * (1 - math.cos(a)) * 0.5
            c = math.sqrt(1 - dy * dy)
            pts.append(B.skull_point(math.sin(a) * c, dy, math.cos(a) * c, 0.018))
        m.tube(pts, 0.011, seg=4, closed_ends=False)
        gem(m, 1.8)
        m.sphere(0.02, 6, 4, at=B.skull_point(0, 0.36, 0.93, 0.022), scale=(0.9, 1.2, 0.7))

    # plume: a crest of cloth fins over any helm
    with Opt(m, 'plume', 'head', local=True):
        B.cloth(m, 'accent', 0.9).mat(lod=1)
        for i in range(5):
            a = -0.3 + i * 0.42
            b = np.asarray(B.skull_point(0, math.cos(a), -math.sin(a), 0.036))
            up = np.array([0.0, math.cos(a + 0.5), -math.sin(a + 0.5)])
            h = 0.13 + 0.05 * math.sin((i + 0.5) / 5 * PI)
            B.lockp(m, [b, b + up * h * 0.4, b + up * h * 0.75 + np.array([0, 0, -0.012]), b + up * h + np.array([0, 0, -0.035])], [(1 if i % 2 else -1, 0, 0)] * 4, 0.07, t=0.02)
        B.cloth(m, 'accent', 0.5).mat(lod=2)
        m.box(0.03, 0.14, 0.3, at=(0, HC + 0.24, -0.06), rot=(-0.35, 0, 0), bevel=0)
        m.mat(lod=0)


# ---- body ------------------------------------------------------------------------------------
def body_armour(m):
    YS = [1.035, 1.07, 1.12, 1.18, 1.24, 1.29, 1.33, 1.362, 1.385]
    YS_FAR = [1.035, 1.12, 1.24, 1.33, 1.385]

    # jerkin: sleeveless leather, laced down the front
    for lod, far in NEAR_FAR:
        B.leather(m, 'leather', 0.5 if far else 1.0).mat(lod=lod); B.region(m, 'none')
        shell(m, 'jerkin', YS_FAR if far else YS, 0.011, 8 if far else 16, close_top=True)
    with Opt(m, 'jerkin', 'chest', local=True):
        m.fixed(0x2a221c, surf='dark', rough=0.7, texel=0.6, lod=1)
        B.strap(m, [(0.0, y) for y in (-0.12, -0.04, 0.04, 0.11, 0.17)], 0.02, out=0.014)
        B.cloth(m, 'accent', 0.6)
        for y in (-0.09, -0.02, 0.05, 0.12):
            m.box(0.06, 0.008, 0.008, at=(0, y, B.chest_z(Y_CHEST + y, 0.0) + 0.016), rot=(0, 0, 0.5), bevel=0)
            m.box(0.06, 0.008, 0.008, at=(0, y, B.chest_z(Y_CHEST + y, 0.0) + 0.016), rot=(0, 0, -0.5), bevel=0)
        m.mat(lod=0)

    # gambeson: quilted cloth with a skirt to the thigh and a padded collar
    for lod, far in NEAR_FAR:
        seg = 8 if far else 16
        B.cloth(m, 'body2', 0.5 if far else 1.0).mat(lod=lod); B.region(m, 'none')
        shell(m, 'gambeson', YS_FAR if far else YS, 0.015, seg, close_top=True)
        with Opt(m, 'gambeson', 'hips') as hb:
            R = [(1.03, 0.012), (0.96, 0.02), (0.86, 0.03), (0.8, 0.036), (0.8, 0.02)]
            B.wloft(m, [hip_ring(y, g, seg) for y, g in R], [(hb, 1.0)], close_start=False, close_end=False)
        with Opt(m, 'gambeson', 'chest'):
            m.loft([B.ell(y, r, r * 0.96, cz=-0.004, seg=seg) for y, r in ((1.39, 0.098), (1.425, 0.112), (1.45, 0.105), (1.45, 0.09))], close_start=False, close_end=False)
    m.mat(lod=0)

    # brigandine: a coat of plates, riveted, with a short skirt of the same
    for lod, far in NEAR_FAR:
        seg = 8 if far else 16
        plate(m, 'body', 0.5 if far else 1.0, metal=0.3, rough=0.6).mat(lod=lod)
        shell(m, 'brig', YS_FAR if far else YS, 0.018, seg, close_top=True)
        with Opt(m, 'brig', 'hips') as hb:
            R = [(1.03, 0.016), (0.985, 0.026), (0.9, 0.034), (0.9, 0.02)]
            B.wloft(m, [hip_ring(y, g, seg) for y, g in R], [(hb, 1.0)], close_start=False, close_end=False)
    with Opt(m, 'brig', 'chest', local=True):
        trim(m, 0.5).mat(lod=1)
        for y in (-0.1, -0.02, 0.06, 0.13):
            for x in (-0.13, -0.065, 0.065, 0.13):
                for back in (False, True):
                    z = B.chest_z(Y_CHEST + y, x, back) + (-0.02 if back else 0.02)
                    m.sphere(0.009, 5, 3, at=(x, y, z))
        B.leather(m, 'leather', 0.7)
        for k in (1, -1):
            B.strap(m, [(k * 0.13, y) for y in (0.14, 0.19, 0.225, 0.25)], 0.04, out=0.024, over=[(k * 0.13, y) for y in (0.25, 0.22, 0.17)])
    m.mat(lod=0)

    # cuirass: breast and back plate with a keel, a gorget, and lames over the hips
    for lod, far in NEAR_FAR:
        seg = 8 if far else 16
        plate(m, 'body', 0.5 if far else 1.1).mat(lod=lod)
        shell(m, 'cuirass', YS_FAR if far else YS, lambda y: 0.02 + 0.014 * B.sm(1.03, 1.2, y) - 0.012 * B.sm(1.3, 1.385, y), seg, keel=0.022, close_top=True)
        with Opt(m, 'cuirass', 'chest'):
            m.loft([B.ell(y, r, r * 0.98, cz=-0.004, seg=seg) for y, r in ((1.385, 0.11), (1.4, 0.128), (1.438, 0.124), (1.45, 0.11), (1.44, 0.098))], close_start=False, close_end=False)
        with Opt(m, 'cuirass', 'hips') as hb:
            plate(m, 'body2', 0.5 if far else 1.0)
            R = [(1.035, 0.02), (1.03, 0.034), (0.975, 0.04), (0.97, 0.03), (0.965, 0.048), (0.905, 0.054), (0.9, 0.04)]
            if far: R = [R[1], R[4], R[5]]
            B.wloft(m, [hip_ring(y, g, seg) for y, g in R], [(hb, 1.0)], close_start=False, close_end=False)
    with Opt(m, 'cuirass', 'chest', local=True):
        trim(m, 0.6).mat(lod=1)
        m.loft([B.ell(y - Y_CHEST, r, r * 0.98, cz=-0.004, seg=12) for y, r in ((1.438, 0.127), (1.452, 0.127), (1.452, 0.112))], close_start=False, close_end=False)
        gem(m, 1.6).mat(lod=0)
        z = B.chest_z(Y_CHEST + 0.09, 0.0) + 0.05
        m.prism([(0, -0.034), (0.026, 0), (0, 0.034), (-0.026, 0)], 0.014, at=(0, 0.09, z), bevel=0)
        trim(m, 0.6).mat(lod=1)
        m.prism([(0, -0.046), (0.036, 0), (0, 0.046), (-0.036, 0)], 0.008, at=(0, 0.09, z - 0.006), bevel=0)
    m.mat(lod=0)

    # long coat: a layer over the tunic with a standing collar, and tails to the knee that swing with the legs
    for lod, far in NEAR_FAR:
        seg = 8 if far else 16
        B.cloth(m, 'cloth2', 0.5 if far else 1.0).mat(lod=lod); B.region(m, 'none')
        shell(m, 'coat', YS_FAR if far else YS, 0.017, seg, close_top=True)
        with Opt(m, 'coat', 'chest'):
            rows = []
            for y, r in ((1.39, 0.1), (1.44, 0.122), (1.49, 0.132)):
                rows.append([(r * 1.04 * math.sin(a), y - 0.012 * math.cos(a), -0.004 + r * math.cos(a)) for a in np.linspace(0.75, 2 * PI - 0.75, 5 if far else 9)])
            B.grid(m, rows, (0, 1.45, 0))
            if not far: B.grid(m, [[(x * 0.96, y, z * 0.96) for x, y, z in r] for r in rows], (0, 3.0, 0))
        hb = obn(m, 'coat', 'hips')
        for s, k in SIDES:
            tb = obn(m, 'coat', 'thigh_' + s)
            with Opt(m, 'coat', 'hips'):
                A = np.linspace(0.12, PI - 0.06, 4 if far else 7)
                rows = []; ws = []
                for y, f in ((1.03, 0.02), (0.94, 0.028), (0.82, 0.04), (0.68, 0.052), (0.54, 0.066), (0.5, 0.07)):
                    rows.append([(k * (0.174 + f) * math.sin(a), y, (0.124 + f) * math.cos(a) if math.cos(a) > 0 else (0.13 + f) * math.cos(a)) for a in A])
                    t = 0.75 * B.sm(0.95, 0.72, y)
                    ws.append([(hb, 1 - t), (tb, t)] if t > 0.001 else [(hb, 1.0)])
                wgrid(m, rows, ws, (0, 0.8, 0))
                if not far: wgrid(m, [[(x * 0.95, y, z * 0.95) for x, y, z in r] for r in rows], ws, (k * 3.0, 0.8, 0))
    with Opt(m, 'coat', 'chest', local=True):
        B.cloth(m, 'top2', 0.7).mat(lod=1)
        for k in (1, -1):
            B.strap(m, [(k * (0.03 + 0.11 * max(0.0, y - 0.02)), y) for y in (-0.12, -0.04, 0.04, 0.1, 0.15, 0.19, 0.22)], 0.05, out=0.024)
        trim(m, 0.5)
        for y in (-0.08, 0.0, 0.08):
            for k in (1, -1): m.sphere(0.011, 5, 3, at=(k * 0.05, y, B.chest_z(Y_CHEST + y, 0.05) + 0.028))
    m.mat(lod=0)

    # tabard: a cloth panel over the armour, front and back, belted, with a border and a device on the chest
    for lod, far in NEAR_FAR:
        for back in (False, True):
            sg = -1 if back else 1
            with Opt(m, 'tabard', 'chest') as cb:
                hb = obn(m, 'tabard', 'hips')
                B.cloth(m, 'accent', 0.5 if far else 1.0).mat(lod=lod); B.region(m, 'none')
                xs = (-0.125, 0.0, 0.125) if far else (-0.125, -0.065, 0.0, 0.065, 0.125)
                rows = []; ws = []
                for y in ((1.37, 1.2, 1.035, 0.9, 0.62) if far else (1.37, 1.3, 1.2, 1.1, 1.035, 0.98, 0.9, 0.76, 0.62)):
                    if y >= 1.03: z = B.chest_z(y, 0.0, back) + sg * (0.05 + 0.026 * B.sm(1.03, 1.2, y) * B.sm(1.4, 1.28, y) * (0 if back else 1) + 0.03 * B.sm(1.12, 1.03, y))
                    else: z = sg * (0.205 + 0.015 * B.sm(1.0, 0.62, y))
                    rows.append([(x * (1 + 0.2 * B.sm(1.0, 0.62, y) - 0.3 * B.sm(1.3, 1.37, y)), y, z - sg * 0.04 * (x / 0.125) ** 2) for x in xs])
                    ws.append(wmap(m, 'tabard', B.w_torso(y)) if y >= 1.03 else [(hb, 1.0)])
                wgrid(m, rows, ws, (0, 1.0, -sg * 3.0))
                if not far:
                    B.cloth(m, 'cloth2', 0.6)
                    wgrid(m, [[(x * 0.99, y, z - sg * 0.004) for x, y, z in r] for r in rows], ws, (0, 1.0, sg * 3.0))
                    r0 = rows[-1]
                    hem = [[(x * 1.02, y + dy, z + sg * 0.004) for x, y, z in r0] for dy in (0.07, 0.0)]
                    wgrid(m, hem, [[(hb, 1.0)]] * 2, (0, 1.0, -sg * 3.0))
    with Opt(m, 'tabard', 'chest', local=True):
        trim(m, 0.6).mat(lod=1)
        z = B.chest_z(Y_CHEST + 0.06, 0.0) + 0.072
        m.prism([(0, -0.05), (0.04, 0), (0, 0.05), (-0.04, 0)], 0.008, at=(0, 0.06, z), bevel=0)
    m.mat(lod=0)

    # sash: a wide cloth belt knotted at the hip, two tails
    with Opt(m, 'sash', 'hips') as hb:
        for lod, far in NEAR_FAR:
            B.cloth(m, 'accent', 0.5 if far else 0.9).mat(lod=lod)
            B.wloft(m, [hip_ring(y, g, 8 if far else 14) for y, g in ((0.955, 0.012), (0.96, 0.03), (1.03, 0.03), (1.035, 0.012))], [(hb, 1.0)], close_start=False, close_end=False)
        m.mat(lod=1)
        m.sphere(0.04, 6, 4, at=(-0.16, 0.99, 0.09), scale=(0.8, 1, 1))
        m.mat(lod=0)
        m.box(0.06, 0.26, 0.016, at=(-0.19, 0.85, 0.08), rot=(0.06, 0.5, 0.1), bevel=0)
        m.box(0.05, 0.2, 0.016, at=(-0.165, 0.88, 0.105), rot=(-0.05, 0.5, -0.08), bevel=0)


# ---- arms ------------------------------------------------------------------------------------
def pauldron(m, tag, s, k, R=1.0, lames=1, wing=False):
    """A domed cop over the shoulder with lames under it (arm bones hang half a turn round: outside is -k X here)."""
    with Opt(m, tag, 'armU_' + s, local=True):
        m.push(at=(-k * 0.03 * R, -0.004, 0), rot=(0, 0, k * 0.4))
        sc = (1.04 * R, R, 1.14 * R)
        for lod, far in NEAR_FAR:
            seg = 6 if far else 10
            plate(m, 'body', 0.5 if far else 1.2).mat(lod=lod)
            if far:
                m.lathe([(0.12, -0.03 - 0.065 * lames), (0.132, -0.024), (0.094, 0.06), (0.0, 0.088)], seg, scale=sc, cap=False)
            else:
                m.lathe([(0.108, -0.03), (0.128, -0.034), (0.132, -0.024), (0.122, 0.022), (0.094, 0.06), (0.047, 0.083), (0.0, 0.088)], seg, scale=sc, cap=False)
                plate(m, 'body2', 1.0)
                for i in range(lames):
                    y = -0.036 - i * 0.062
                    m.lathe([(0.104 - i * 0.004, y - 0.064), (0.116 - i * 0.004, y - 0.066), (0.121 - i * 0.004, y - 0.056), (0.121 - i * 0.004, y), (0.11, y + 0.004)], seg, scale=sc, cap=False)
                trim(m, 0.7)
                m.lathe([(0.129, -0.04), (0.139, -0.034), (0.136, -0.022), (0.127, -0.02)], seg, scale=sc, cap=False)
            if wing:
                # a standing plate by the neck
                plate(m, 'body', 0.5 if far else 1.0)
                m.box(0.014, 0.1, 0.17, at=(k * 0.06, 0.1, 0), rot=(0, 0, k * 0.5), bevel=0 if far else 0.005)
        if wing:
            gem(m, 1.6).mat(lod=0)
            m.sphere(0.022, 6, 4, at=(-k * 0.118 * 1.04, 0.012, 0.0), scale=(0.6, 1.2, 1.2))
        m.pop()
    m.mat(lod=0)


def arm_gear(m):
    for s, k in SIDES:
        pauldron(m, 'pauld' + s, s, k)
        pauldron(m, 'pauldBig', s, k, R=1.22, lames=2, wing=True)
        # vambrace: plate over the forearm, a cop on the elbow (+Z is the elbow's point on arm bones)
        with Opt(m, 'vambrace', 'armF_' + s, local=True):
            for lod, far in NEAR_FAR:
                seg = 6 if far else 9
                plate(m, 'body', 0.5 if far else 1.0).mat(lod=lod)
                R = [(-0.03, 0.074), (-0.045, 0.087), (-0.12, 0.081), (-0.19, 0.069), (-0.236, 0.058), (-0.24, 0.05)]
                if far: R = R[1::2] + [R[-1]]
                m.loft([B.ell(y, r, r * 0.95, seg=seg) for y, r in R], close_start=False, close_end=False)
                m.sphere(0.058, seg, 4, at=(0, 0.0, 0.052), scale=(0.9, 1.15, 0.7))
            trim(m, 0.6).mat(lod=1)
            m.loft([B.ell(y, r, r * 0.95, seg=9) for y, r in ((-0.04, 0.086), (-0.044, 0.091), (-0.058, 0.09), (-0.06, 0.085))], close_start=False, close_end=False)
        # gauntlet: a flared cuff and a plate on the back of the hand
        with Opt(m, 'gauntlet', 'armF_' + s, local=True):
            for lod, far in NEAR_FAR:
                plate(m, 'body', 0.5 if far else 1.0).mat(lod=lod)
                R = [(-0.17, 0.07), (-0.175, 0.092), (-0.235, 0.066), (-0.262, 0.052)]
                m.loft([B.ell(y, r, r * 0.95, seg=6 if far else 9) for y, r in R], close_start=False, close_end=False)
        with Opt(m, 'gauntlet', 'hand_' + s, local=True):
            plate(m, 'body', 1.2).mat(lod=1)
            m.box(0.014, 0.078, 0.07, at=(k * 0.05, 0, 0.05), bevel=0.005)
            plate(m, 'body2', 1.2)
            for y in (0.041, 0.0137, -0.0137, -0.04):
                m.box(0.014, 0.022, 0.028, at=(k * 0.047, y, 0.103), rot=(0, k * 0.12, 0), bevel=0.005)
    m.mat(lod=0)


# ---- legs ------------------------------------------------------------------------------------
def leg_gear(m):
    for s, k in SIDES:
        # tassets: a plate hung from the belt over the front and outside of each thigh
        with Opt(m, 'tassets', 'thigh_' + s, local=True):
            for lod, far in NEAR_FAR:
                plate(m, 'body', 0.5 if far else 1.0).mat(lod=lod)
                A = np.linspace(-0.45, 1.75, 4 if far else 7)
                rows = [[(k * math.sin(a) * r, y, math.cos(a) * r * 1.06) for a in A] for y, r in ((0.1, 0.118), (0.02, 0.136), (-0.09, 0.143), (-0.19, 0.14), (-0.215, 0.128))]
                B.grid(m, rows, (0, -0.05, 0))
                if not far:
                    plate(m, 'body2', 0.6)
                    B.grid(m, [[(x * 0.97, y, z * 0.97) for x, y, z in r] for r in rows], (k * 4.0, 0, 4.0))
                    trim(m, 0.5)
                    m.tube([(x * 1.01, y, z * 1.01) for x, y, z in rows[3]], 0.008, seg=4)
        # greaves: a plate down the shin over the boot, a winged cop on the knee
        with Opt(m, 'greaves', 'shin_' + s, local=True):
            for lod, far in NEAR_FAR:
                plate(m, 'body', 0.5 if far else 1.0).mat(lod=lod)
                A = np.linspace(-1.45, 1.45, 4 if far else 7)
                rows = [[(math.sin(a) * r, y, 0.004 + math.cos(a) * r * 1.05) for a in A] for y, r in ((-0.04, 0.086), (-0.11, 0.104), (-0.2, 0.106), (-0.3, 0.1), (-0.322, 0.094))]
                B.grid(m, rows, (0, -0.15, 0))
                m.sphere(0.062, 6 if far else 8, 4 if far else 5, at=(0, 0.004, 0.056), scale=(0.95, 1.2, 0.6))
            trim(m, 0.5).mat(lod=1)
            m.tube(rows[1], 0.008, seg=4)
        # war skirt: a cloth panel over each thigh that swings with it
        with Opt(m, 'skirt', 'hips'):
            tb = obn(m, 'skirt', 'thigh_' + s)
            m.on(tb)
            for lod, far in NEAR_FAR:
                B.cloth(m, 'cloth2', 0.5 if far else 1.0).mat(lod=lod); B.region(m, 'none')
                A = np.linspace(0.1, 1.9, 3 if far else 5)
                rows = []
                for y, f in ((0.98, 0.012), (0.86, 0.03), (0.72, 0.045), (0.58, 0.058)):
                    rows.append([(k * (0.174 + f) * math.sin(a), y, (0.124 + f) * math.cos(a)) for a in A])
                B.grid(m, rows, (0, 0.8, 0))
                if not far:
                    B.grid(m, [[(x * 0.96, y, z * 0.96) for x, y, z in r] for r in rows], (k * 4.0, 0.8, 2.0))
                    B.cloth(m, 'accent', 0.6)
                    B.grid(m, [[(x * 1.015, y + dy, z * 1.015) for x, y, z in rows[-1]] for dy in (0.06, 0.0)], (0, 0.8, 0))
    # ...and one behind, hanging from the belt
    with Opt(m, 'skirt', 'hips'):
        for lod, far in NEAR_FAR:
            B.cloth(m, 'cloth2', 0.5 if far else 1.0).mat(lod=lod)
            A = np.linspace(1.9, 2 * PI - 1.9, 3 if far else 6)
            rows = []
            for y, f in ((0.98, 0.012), (0.86, 0.026), (0.72, 0.036), (0.6, 0.042)):
                rows.append([((0.174 + f) * math.sin(a), y, (0.13 + f) * math.cos(a)) for a in A])
            B.grid(m, rows, (0, 0.8, 0))
            if not far: B.grid(m, [[(x * 0.96, y, z * 0.96) for x, y, z in r] for r in rows], (0, 0.8, -4.0))
    m.mat(lod=0)


# ---- back ------------------------------------------------------------------------------------
def back_gear(m):
    z = -0.2
    # bedroll pack: a canvas pack on two straps, a blanket rolled on top, a pan hung from it
    with Opt(m, 'bedroll', 'chest', local=True):
        m.fixed(PACK, surf='cloth', rough=0.85, texel=1.0, lod=1); B.region(m, 'pack')
        m.box(0.25, 0.27, 0.14, at=(0, 0.0, z), bevel=0.035, seg=2)
        m.fixed(0x86735c, surf='cloth', rough=0.85, texel=0.9)
        m.box(0.24, 0.1, 0.154, at=(0, 0.1, z - 0.003), bevel=0.03)
        m.box(0.11, 0.1, 0.05, at=(0, -0.05, z - 0.085), bevel=0.014)
        B.region(m, 'none')
        B.knit(m, 'accent', 0.9)
        m.cyl(0.066, 0.066, 0.36, 9, at=(0, 0.2, z + 0.012), rot=(0, 0, PI / 2), bevel=0.016)
        B.leather(m, 'leather', 0.7)
        for x in (-0.11, 0.11): m.cyl(0.069, 0.069, 0.024, 9, at=(x, 0.2, z + 0.012), rot=(0, 0, PI / 2), cap=False)
        m.steel(texel=0.7)
        m.cyl(0.07, 0.06, 0.03, 8, at=(-0.13, -0.08, z - 0.04), rot=(0, 0, PI / 2))
        B.leather(m, 'leather', 0.8)
        for k in (1, -1):
            B.strap(m, [(k * (0.13 - 0.09 * max(0.0, y - 0.02)), y) for y in (-0.12, -0.05, 0.02, 0.09, 0.15, 0.2, 0.235, 0.257, 0.268)], 0.04, out=0.03, over=[(k * 0.108, y) for y in (0.268, 0.255, 0.225, 0.18)])
        m.fixed(PACK, surf='cloth', rough=0.85, texel=0.5, lod=2)
        m.box(0.25, 0.28, 0.14, at=(0, 0.0, z), bevel=0)
        B.knit(m, 'accent', 0.4)
        m.box(0.36, 0.11, 0.11, at=(0, 0.2, z + 0.012), bevel=0)
        m.mat(lod=0)

    # tech pack: a framed power unit, two canisters with lit bands, an aerial with a lamp at its tip
    with Opt(m, 'techpack', 'chest', local=True):
        for lod, far in NEAR_FAR:
            m.darkmetal(texel=0.5 if far else 1.0).mat(lod=lod)
            m.box(0.2, 0.26, 0.11, at=(0, 0.02, z + 0.01), bevel=0 if far else 0.02)
            m.steel(texel=0.4 if far else 0.9)
            for k in (1, -1): m.cyl(0.047, 0.047, 0.24, 6 if far else 9, at=(k * 0.13, 0.02, z + 0.012), bevel=0 if far else 0.012)
        m.mat(slot='glow2', surf='glow', metal=0.0, rough=0.4, emit=1.4, texel=0.6, lod=0)
        for k in (1, -1): m.cyl(0.05, 0.05, 0.03, 6, at=(k * 0.13, 0.07, z + 0.012), cap=False)
        m.box(0.09, 0.05, 0.02, at=(0, 0.06, z - 0.05), bevel=0)
        m.steel(texel=0.5)
        m.strut((0.07, 0.14, z), (0.1, 0.66, z - 0.03), 0.008, 0.005, 4)
        m.mat(slot='glow2', surf='glow', metal=0.0, rough=0.4, emit=2.2, texel=0.5)
        m.sphere(0.022, 6, 4, at=(0.1, 0.675, z - 0.03))
        B.leather(m, 'leather', 0.8).mat(lod=1)
        for k in (1, -1):
            B.strap(m, [(k * (0.13 - 0.09 * max(0.0, y - 0.02)), y) for y in (-0.12, -0.05, 0.02, 0.09, 0.15, 0.2, 0.235, 0.257, 0.268)], 0.04, out=0.03, over=[(k * 0.108, y) for y in (0.268, 0.255, 0.225, 0.18)])
        m.mat(lod=0)

    # satchel: a bag on the hip, its strap across the chest
    with Opt(m, 'satchel', 'hips', local=True):
        B.leather(m, 'leather', 1.0).mat(lod=0)
        m.box(0.07, 0.17, 0.2, at=(0.215, -0.03, -0.03), rot=(0, 0, -0.1), bevel=0.02)
        m.mat(lod=1)
        m.box(0.076, 0.07, 0.206, at=(0.217, 0.03, -0.03), rot=(0, 0, -0.1), bevel=0.016)
        trim(m, 0.5)
        m.box(0.014, 0.03, 0.03, at=(0.256, 0.0, -0.03), bevel=0.004)
    with Opt(m, 'satchel', 'chest', local=True):
        B.leather(m, 'leather', 0.7).mat(lod=1)
        pts = [(-0.2 + 0.4 * t, 0.2 - 0.36 * t) for t in (0.0, 0.2, 0.4, 0.6, 0.8, 1.0)]
        B.strap(m, pts, 0.036, out=0.03)
        B.strap(m, pts, 0.036, out=0.03, back=True)
    m.mat(lod=0)


# ---- cloth that sways --------------------------------------------------------------------------
def sway_cloth(m, tag, n_bones, y_top, y_bot, w_top, w_bot, slot='accent'):
    """
    A cape down the back on a chain of bones the rig swings (opt_<tag>_1 ..): gathered at the
    shoulders, fuller at the hem, lined, held by two clasps and a chain across the collarbones.
    """
    span = (y_top - y_bot) / n_bones
    names = []
    parent = 'chest'
    for i in range(n_bones):
        y = y_top - 0.01 - i * span
        pp = m.bone_pos(parent)
        cur = m.cur_bone
        name = 'opt_%s_%d' % (tag, i + 1)
        m.bone(name, parent, (0 - pp.x, y - pp.y, -0.14 - pp.z))
        m.cur_bone = cur
        names.append(name); parent = name

    def weights(y):
        f = (y_top - 0.01 - y) / span          # 0 at the first pivot, 1 at the second ...
        i = int(min(max(f, 0.0), n_bones - 1e-6))
        t = B.sm(0.15, 0.85, f - i) if i + 1 < n_bones else 0.0
        return B.blend(names[i], names[min(i + 1, n_bones - 1)], t)

    p0 = m.bone_pos(names[0])
    m.on(names[0]); m.push(at=(-p0.x, -p0.y, -p0.z))
    for lod, far in NEAR_FAR:
        cols = np.linspace(-1.3, 1.3, 4 if far else 9)
        ny = 5 if far else 9
        rows = []; ws = []
        for j in range(ny):
            u = j / (ny - 1)
            y = y_top + (y_bot - y_top) * u
            w = w_top + (w_bot - w_top) * u ** 0.8
            zb = -0.152 - 0.06 * B.sm(0.0, 0.5, u) - 0.02 * u
            rows.append([(w * math.sin(a) / math.sin(1.3), y, zb + 0.1 * (1 - math.cos(a)) + 0.014 * math.sin(a * 5.3) * u) for a in cols])
            ws.append(weights(y))
        B.cloth(m, slot, 0.5 if far else 1.0).mat(lod=lod); B.region(m, 'drape')
        wgrid(m, rows, ws, (0, 1.0, 2.0))
        B.cloth(m, 'cloth2', 0.4 if far else 0.8)
        wgrid(m, [[(x, y, z + 0.012) for x, y, z in r] for r in rows], ws, (0, 1.0, -3.0))
    B.region(m, 'none')
    m.pop()
    # the collar of it, and what holds it on
    with Opt(m, tag, 'chest', local=True):
        B.cloth(m, slot, 0.8).mat(lod=1)
        m.torus(0.105, 0.03, 10, 5, at=(0, 0.255, -0.03), rot=(0.35, 0, 0), scale=(1.25, 1, 1.0))
        trim(m, 0.6)
        for k in (1, -1): m.sphere(0.026, 6, 4, at=(k * 0.115, 0.215, B.chest_z(Y_CHEST + 0.215, 0.115) + 0.04))
        B.strap(m, [(x, 0.215 - 0.012 * math.cos(x * 12)) for x in (-0.115, -0.06, 0.0, 0.06, 0.115)], 0.014, out=0.042)
    m.mat(lod=0)


# ---- weapons ---------------------------------------------------------------------------------
WEAPONS = [('shop_blade', W.shop_blade), ('bandsaw', W.bandsaw), ('arc_cutter', W.arc_cutter),
           ('rebar_pike', W.rebar_pike), ('jack_lance', W.jack_lance), ('stormrod', W.stormrod),
           ('trainer_bow', W.trainer_bow), ('tension_bow', W.tension_bow), ('arcstring', W.arcstring),
           ('bolt_driver', W.bolt_driver), ('twin_driver', W.twin_driver), ('rivet_rifle', W.rivet_rifle), ('rail_rifle', W.rail_rifle)]
# far stand-ins: (kind, length or size, main colour, second colour, glow or None)
FAR = {
    'shop_blade': ('sword', 0.95, 0xc3cad2, W.ORANGE, None), 'bandsaw': ('sword', 1.0, 0xe1e6ea, W.ORANGE, None), 'arc_cutter': ('sword', 1.03, 0x6f7883, W.GUN, W.CYAN),
    'rebar_pike': ('spear', 1.35, 0x74625a, W.BRIGHT, None), 'jack_lance': ('spear', 1.48, W.ORANGE, W.IRON, None), 'stormrod': ('spear', 1.46, W.COPPER, 0xc5ccd4, W.CYAN),
    'trainer_bow': ('bow', 0.645, W.WOOD, W.ORANGE, None), 'tension_bow': ('bow', 0.6, W.DARK, W.ORANGE, None), 'arcstring': ('bow', 0.675, W.GREY, W.INK, W.CYAN),
    'bolt_driver': ('xbow', 0.48, W.ORANGE, W.SLATE, W.CYAN), 'twin_driver': ('xbow', 0.5, 0x343b46, W.ORANGE, W.CYAN),
    'rivet_rifle': ('rifle', 0.9, W.SLATE, W.DARK, None), 'rail_rifle': ('rifle', 0.97, 0x343b46, W.ORANGE, W.CYAN),
}
TEXEL_WEAPON = 0.42


def bone_tag(wid):
    """shop_blade -> WshopBlade: one word, so it reads as the piece's tag in opt_<tag>."""
    p = wid.split('_')
    return 'W' + p[0] + ''.join(x.capitalize() for x in p[1:])


def far_weapon(m, wid):
    kind, L, c1, c2, g = FAR[wid]
    m.fixed(c1, surf='metal', metal=0.7, rough=0.45, texel=0.3, lod=2)
    if kind == 'sword':
        m.box(0.014, L - 0.14, 0.085, at=(0, 0.14 + (L - 0.14) / 2, 0.012), bevel=0)
        m.fixed(c2, surf='paint', metal=0.3, rough=0.6, texel=0.3)
        m.box(0.03, 0.03, 0.17, at=(0, 0.125, 0.0), bevel=0)
        m.box(0.03, 0.2, 0.034, at=(0, 0.01, 0.0), bevel=0)
        if g:
            m.fixed(g, surf='glow', emit=1.2, texel=0.3)
            m.box(0.018, L - 0.24, 0.012, at=(0, 0.2 + (L - 0.24) / 2, 0.058), bevel=0)
    elif kind == 'spear':
        m.cyl(0.017, 0.017, L + 0.6, 4, at=(0, (L - 0.9) / 2 + 0.15, 0))
        m.fixed(c2, surf='metal', metal=0.8, rough=0.4, texel=0.3)
        m.cone(0.04, 0.3, 4, at=(0, L - 0.15, 0), scale=(0.5, 1, 1))
        if g:
            m.fixed(g, surf='glow', emit=1.4, texel=0.3)
            m.box(0.03, 0.12, 0.03, at=(0, L - 0.36, 0), bevel=0)
    elif kind == 'bow':
        m.tube([(0, -L, -0.14), (0, -L * 0.55, -0.02), (0, 0, 0.03), (0, L * 0.55, -0.02), (0, L, -0.14)], 0.016, seg=4)
        m.fixed(g or 0xe9e2d0, surf='glow' if g else 'flat', emit=1.0 if g else 0.0, texel=0.3)
        m.box(0.006, 2 * L, 0.006, at=(0, 0, -0.14), bevel=0)
        m.fixed(c2, surf='paint', metal=0.2, rough=0.7, texel=0.3)
        m.box(0.03, 0.14, 0.04, at=(0, 0, 0.02), bevel=0)
    elif kind == 'xbow':
        m.box(0.05, 0.07, L + 0.12, at=(0, 0.12, L / 2 - 0.04), bevel=0)
        m.box(0.036, 0.13, 0.05, at=(0, 0.0, 0.0), rot=(0.16, 0, 0), bevel=0)
        m.fixed(c2, surf='metal', metal=0.7, rough=0.45, texel=0.3)
        m.box(0.52, 0.03, 0.04, at=(0, 0.15, L - 0.08), bevel=0)
        if g:
            m.fixed(g, surf='glow', emit=1.2, texel=0.3)
            m.box(0.056, 0.02, 0.1, at=(0, 0.16, 0.2), bevel=0)
    else:
        m.box(0.05, 0.08, L - 0.1, at=(0, 0.08, (L - 0.1) / 2 + 0.06), bevel=0)
        m.box(0.045, 0.1, 0.3, at=(0, 0.04, -0.14), rot=(-0.12, 0, 0), bevel=0)
        m.box(0.036, 0.13, 0.05, at=(0, 0.0, 0.0), rot=(0.16, 0, 0), bevel=0)
        m.fixed(c2, surf='metal', metal=0.7, rough=0.45, texel=0.3)
        m.box(0.03, 0.03, 0.3, at=(0, 0.09, L - 0.14), bevel=0)
        if g:
            m.fixed(g, surf='glow', emit=1.2, texel=0.3)
            m.box(0.056, 0.02, 0.16, at=(0, 0.1, 0.5), bevel=0)
    m.mat(lod=0)


def weapons(m):
    """Every weapon on the weapon bone: the real thing near (art/weapons/common.py), a few boxes far."""
    m.bone('wpn', 'root', (0, 0, 0))
    for wid, fn in WEAPONS:
        tag = bone_tag(wid)
        name = 'opt_' + tag
        m.bone(name, 'wpn', (0, 0, 0))
        m.on(name)
        n0 = len(m.F)
        fn(m, tag)
        for i in range(n0, len(m.F)):
            m.f_lod[i] = 1
            m.f_texel[i] *= TEXEL_WEAPON
        m.on(name)
        far_weapon(m, wid)


# ---- assembly --------------------------------------------------------------------------------
def prune(m, keep):
    """Drop the faces (and then the loose vertices) of every optional piece whose tag `keep` rejects."""
    ok = []
    for i, bi in enumerate(m.f_bone):
        n = m.bones[bi]['name']
        ok.append(not n.startswith('opt_') or keep(n.split('_')[1]))
    used = set()
    for f, k in zip(m.F, ok):
        if k: used.update(f)
    remap = {}; V = []; tco = []; tsz = []; prim = []
    for i in range(len(m.V)):
        if i in used:
            remap[i] = len(V); V.append(m.V[i]); tco.append(m.v_tco[i]); tsz.append(m.v_tsz[i]); prim.append(m.v_prim[i])
    for a in ('F', 'f_bone', 'f_slot', 'f_surf', 'f_col', 'f_metal', 'f_rough', 'f_emit', 'f_smooth', 'f_texel', 'f_lod'):
        setattr(m, a, [x for x, k in zip(getattr(m, a), ok) if k])
    m.F = [[remap[i] for i in f] for f in m.F]
    m.V, m.v_tco, m.v_tsz, m.v_prim = V, tco, tsz, prim
    if m.weights: m.weights = {remap[i]: w for i, w in m.weights.items() if i in remap}
    # bones nothing is left on go too (they are leaves: optional pieces hang nothing off themselves)
    live = {m.bones[bi]['name'] for bi in m.f_bone}
    if m.weights:
        for ws in m.weights.values(): live.update(n for n, _ in ws)
    parents = {b['parent'] for b in m.bones}
    old = m.bones
    m.bones = [b for b in old if not b['name'].startswith('opt_') or b['name'] in live or b['name'] in parents]
    ix = {b['name']: i for i, b in enumerate(m.bones)}
    m.f_bone = [ix[old[bi]['name']] for bi in m.f_bone]
    m.bone_ix = ix


def stats(m):
    by = {}
    for f, bi, lod in zip(m.F, m.f_bone, m.f_lod):
        n = m.bones[bi]['name']
        tag = n.split('_')[1] if n.startswith('opt_') else 'body'
        t = by.setdefault(tag, [0, 0, 0])
        t[lod] += len(f) - 2
    for tag in sorted(by): print('  %-14s always %5d  near %5d  far %5d' % (tag, *by[tag]))
    print('  bones', len(m.bones))


def make():
    m = Model('adv')
    B.skeleton(m)
    B.pelvis(m, 'bottom', lod=1); B.pelvis(m, 'bottom', seg=8, texel=0.5, lod=2)
    B.legs(m, 'bottom', lod=1); B.legs(m, 'bottom', seg=6, texel=0.5, lod=2)
    B.torso(m, 'top', 'top2', lod=1, collar='top2'); B.torso(m, 'top', 'top2', seg=8, texel=0.5, lod=2)
    B.belt(m, buckle_slot='trim', lod=1); B.belt(m, seg=8, lod=2)
    B.neck(m, lod=1); B.neck(m, seg=6, lod=2)
    B.arms(m, sleeve='top', fore='top', cuff=False, lod=1, cap='top2'); B.arms(m, sleeve='top', fore='top', seg=6, texel=0.5, lod=2, cap='top2')
    B.hands(m, 'glove', seg=5)
    B.boots(m, 'boots', cuff=('leather',), toe=None, welt=None, strap=True, lod=1); B.boots(m, 'boots', cuff=('leather',), seg=6, texel=0.5, lod=2)
    B.head(m, lod=1); B.head(m, texel=0.7, lod=2)
    B.eyes(m, lod=1); B.eyes(m, lod=2)
    m.mat(lod=1); B.brows(m); m.mat(lod=0)
    F.hair(m)
    F.hats(m)
    F.kit(m)
    F.adventurer(m)
    prune(m, lambda tag: tag in KEEP_FOLK)
    headgear(m)
    body_armour(m)
    arm_gear(m)
    leg_gear(m)
    back_gear(m)
    sway_cloth(m, 'cape', 3, 1.41, 0.46, 0.2, 0.31)
    sway_cloth(m, 'cloak', 2, 1.41, 0.86, 0.19, 0.26, slot='cloth2')
    weapons(m)
    stats(m)
    return B.remember(m)


def post(rgba, gb, cover):
    return B.face_post(B.people_post(rgba, gb, cover), gb, cover)
