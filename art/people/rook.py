"""
Rook, the hero: a test-yard technician-adventurer. Heroic stylised build, spiked hair under
pushed-up goggles, a short work jacket with a grey yoke over a slate under-suit, heavy gauntlets
with a wrist computer, a pack with a caged power cell (the signature from behind), tool belt,
knee guards and steel-toed boots. The scarf's knot is here; its tail is simulated cloth.

Bones: see people/base.py. No optional pieces: the hero wears all of it.
"""
import math

import numpy as np

from lib.kit import Model, PI, SLOTS
from people import base as B
from people.base import At, HC, SK, SIDES, Y_CHEST, Y_HIPS, Y_NECK, Y_SHOULDER, Y_THIGH

TEX = 1024
BUILD = dict(ao_dist=0.14, edge_dist=0.016, edge_w=0.005, scale=1.0, chip=0.45, grime=0.35, ao_min=0.42, edge_other=0.25)

PACK = 0x566070
PACK_LID = 0x6b7686
BEDROLL = 0x2f8795
GREY = 0x8b939d


def gauntlets(m):
    for s, k in SIDES:
        F = 'armF_' + s
        cx = k * SK['shX']
        with At(m, F):
            B.leather(m, 'glove', 1.1)
            R = [(-0.415, 0.066), (-0.396, 0.094), (-0.44, 0.085), (-0.5, 0.072), (-0.546, 0.06), (-0.568, 0.044)]
            B.wloft(m, [B.ell(Y_SHOULDER + y, r, r, cx=cx, seg=10) for y, r in R], [(F, 1.0)], close_start=False)
            B.cloth(m, 'accent', 0.9)
            R = [(-0.418, 0.09), (-0.388, 0.097), (-0.382, 0.102), (-0.408, 0.103), (-0.424, 0.092)]
            B.wloft(m, [B.ell(Y_SHOULDER + y, r, r, cx=cx, seg=10) for y, r in R], [(F, 1.0)], close_start=False, close_end=False)
            # the animation poses arm bones with +Z toward the elbow point (half a turn from this bind
            # pose), so what must end up on the outside of the arm is modelled on the inside here
            # knuckle-side armour plate
            m.steel(texel=1.1)
            m.box(0.03, 0.1, 0.066, at=(cx - k * 0.074, Y_SHOULDER - 0.475, 0), rot=(0, 0, -k * 0.1), bevel=0.01)
            if s == 'L':
                # wrist computer
                m.darkmetal(texel=1.2)
                m.box(0.026, 0.085, 0.078, at=(cx - k * 0.092, Y_SHOULDER - 0.47, 0), rot=(0, 0, -k * 0.1), bevel=0.008)
                m.glow(emit=1.2, texel=1.2)
                m.box(0.01, 0.052, 0.05, at=(cx - k * 0.105, Y_SHOULDER - 0.468, 0), rot=(0, 0, -k * 0.1), bevel=0.003)
        m.on(F)


def jacket_extras(m):
    # hem below the belt
    with At(m, 'hips'):
        B.cloth(m, 'top', 1.0)
        R = [(0.905, 0.184, 0.132), (0.912, 0.192, 0.139), (0.955, 0.186, 0.134), (0.975, 0.176, 0.126)]
        B.wloft(m, [B.ell(y, rx, rz, seg=16, p=2.2) for y, rx, rz in R], [('hips', 1.0)], close_start=False, close_end=False)
    # shoulder caps with a trim ring
    for s, k in SIDES:
        m.on('armU_' + s)
        B.cloth(m, 'top2', 1.0)
        m.sphere(0.102, 10, 6, at=(k * 0.008, 0.014, 0), scale=(1.04, 0.8, 1.1))
        B.cloth(m, 'accent', 0.8)
        m.cyl(0.098, 0.1, 0.022, 10, at=(k * 0.008, -0.04, 0), scale=(1.04, 1, 1.1), cap=False)
    # chest light, pocket, strap buckles
    m.on('chest')
    m.steel(texel=1.2)
    m.box(0.078, 0.056, 0.022, at=(0.097, 0.07, 0.129), rot=(0.0, 0.42, 0), bevel=0.008)
    m.glow(emit=1.0, texel=1.0)
    m.box(0.034, 0.016, 0.012, at=(0.1, 0.07, 0.139), rot=(0, 0.42, 0), bevel=0.003)
    B.cloth(m, 'top2', 0.9)
    m.box(0.088, 0.074, 0.016, at=(-0.098, -0.05, 0.117), rot=(-0.08, -0.45, 0), bevel=0.006)
    m.box(0.092, 0.024, 0.02, at=(-0.098, -0.02, 0.119), rot=(-0.08, -0.45, 0), bevel=0.006)
    # pack straps over the shoulders
    B.leather(m, 'leather', 0.9)
    for k in (1, -1):
        m.box(0.04, 0.3, 0.018, at=(k * 0.118, 0.045, 0.118), rot=(-0.07, k * 0.55, k * 0.1), bevel=0.005)
        m.box(0.04, 0.03, 0.2, at=(k * 0.118, 0.238, 0.0), rot=(0.0, 0, k * 0.2), bevel=0.005)
        m.steel(texel=1.0)
        m.box(0.048, 0.03, 0.022, at=(k * 0.106, 0.1, 0.133), rot=(-0.07, k * 0.55, k * 0.1), bevel=0.005)
        B.leather(m, 'leather', 0.9)


def backpack(m):
    m.on('chest')
    z = -0.205
    m.fixed(PACK, surf='cloth', rough=0.85, texel=1.0)
    m.box(0.28, 0.3, 0.155, at=(0, 0.02, z), bevel=0.035, seg=2)
    m.fixed(PACK_LID, surf='cloth', rough=0.85, texel=1.0)
    m.box(0.27, 0.115, 0.17, at=(0, 0.135, z - 0.003), bevel=0.03, seg=2)
    B.leather(m, 'leather', 0.8)
    for k in (1, -1):
        m.box(0.03, 0.15, 0.012, at=(k * 0.075, 0.1, z - 0.088), bevel=0.004)
    m.steel(texel=1.0)
    for k in (1, -1):
        m.box(0.04, 0.03, 0.018, at=(k * 0.075, 0.045, z - 0.09), bevel=0.005)
    # bedroll on top, strapped down
    m.fixed(BEDROLL, surf='knit', rough=0.95, texel=0.9)
    m.cyl(0.06, 0.06, 0.3, 10, at=(0, 0.236, z + 0.012), rot=(0, 0, PI / 2), bevel=0.014)
    B.leather(m, 'leather', 0.7)
    for k in (1, -1):
        m.cyl(0.064, 0.064, 0.024, 10, at=(k * 0.08, 0.236, z + 0.012), rot=(0, 0, PI / 2), cap=False)
    # side pocket and canteen
    m.fixed(PACK, surf='cloth', rough=0.85, texel=0.8)
    m.box(0.058, 0.135, 0.105, at=(0.152, -0.05, z + 0.005), bevel=0.018)
    m.steel(texel=0.9)
    m.cyl(0.038, 0.038, 0.12, 8, at=(-0.16, -0.04, z + 0.005), bevel=0.012)
    m.darkmetal(texel=0.6)
    m.cyl(0.018, 0.018, 0.03, 6, at=(-0.16, 0.035, z + 0.005))
    # power cell: a glowing tube in a cage
    m.glow(emit=1.25, texel=1.3)
    m.cyl(0.037, 0.037, 0.15, 10, at=(0, -0.04, z - 0.082))
    m.steel(texel=1.1)
    m.cyl(0.05, 0.05, 0.034, 10, at=(0, 0.049, z - 0.08), bevel=0.006)
    m.cyl(0.05, 0.05, 0.034, 10, at=(0, -0.129, z - 0.08), bevel=0.006)
    for k in (1, -1):
        m.box(0.012, 0.16, 0.012, at=(k * 0.045, -0.04, z - 0.1), bevel=0.003)
    m.box(0.012, 0.16, 0.012, at=(0, -0.04, z - 0.123), bevel=0.003)
    m.mat(slot='glow2', surf='glow', metal=0.0, rough=0.4, emit=1.4, texel=0.8)
    m.box(0.032, 0.014, 0.02, at=(0.086, 0.137, z - 0.088), bevel=0.003)
    # hose from the cell up into the pack
    m.fixed(0x23262c, surf='rubber', rough=0.9, texel=0.5)
    m.tube([(-0.03, 0.06, z - 0.09), (-0.07, 0.085, z - 0.1), (-0.1, 0.07, z - 0.085), (-0.105, 0.02, z - 0.07)], 0.011, seg=5)


def toolbelt(m, bone='hips'):
    m.on(bone)
    B.leather(m, 'leather', 1.0)
    m.box(0.074, 0.115, 0.088, at=(0.2, -0.01, 0.01), rot=(0, 0, 0.1), bevel=0.018)
    m.box(0.08, 0.036, 0.094, at=(0.204, 0.034, 0.01), rot=(0, 0, 0.1), bevel=0.01)
    m.box(0.094, 0.094, 0.058, at=(-0.078, -0.005, -0.136), rot=(0.1, -0.25, 0), bevel=0.016)
    m.box(0.07, 0.085, 0.05, at=(0.09, -0.005, -0.134), rot=(0.1, 0.25, 0), bevel=0.014)
    m.box(0.06, 0.07, 0.04, at=(-0.115, -0.01, 0.112), rot=(-0.05, -0.5, 0), bevel=0.012)
    m.steel(texel=0.9)
    m.box(0.02, 0.016, 0.01, at=(0.238, 0.018, 0.01), bevel=0.003)
    # wrench hanging on the right hip
    m.cyl(0.011, 0.011, 0.17, 6, at=(-0.207, -0.07, 0.02), rot=(0.1, 0, 0.06))
    m.box(0.016, 0.046, 0.052, at=(-0.212, -0.16, 0.012), bevel=0.005)
    B.leather(m, 'leather', 0.8)
    m.box(0.032, 0.046, 0.032, at=(-0.192, 0.02, 0.03), bevel=0.008)


def leg_gear(m):
    for s, k in SIDES:
        m.on('thigh_' + s)
        B.cloth(m, 'cloth2', 0.9)
        m.box(0.042, 0.13, 0.112, at=(k * 0.098, -0.195, 0.0), bevel=0.012)
        m.box(0.046, 0.034, 0.116, at=(k * 0.098, -0.145, 0.0), bevel=0.008)
        m.on('shin_' + s)
        m.fixed(GREY, surf='paint', metal=0.3, rough=0.55, texel=1.1)
        m.box(0.118, 0.13, 0.06, at=(0, -0.008, 0.07), rot=(0.06, 0, 0), bevel=0.02, seg=2)
        B.cloth(m, 'accent', 0.8)
        m.box(0.122, 0.022, 0.054, at=(0, -0.034, 0.076), rot=(0.06, 0, 0), bevel=0.006)
        B.leather(m, 'leather', 0.6)
        m.cyl(0.091, 0.091, 0.022, 8, at=(0, -0.01, 0.004), cap=False)


def goggles(m, bone='head'):
    m.on(bone)
    B.leather(m, 'leather', 0.8)
    m.torus(0.168, 0.014, 14, 5, at=(0, HC + 0.078, -0.006), rot=(-0.2, 0, 0), scale=(0.95, 1, 1.03))
    for k in (1, -1):
        p = B.on_skull(k * 0.36, 0.62, 0.7, 0.016)
        m.steel(texel=1.2)
        m.cyl(0.044, 0.048, 0.042, 10, at=tuple(p), rot=(0.98, 0, -k * 0.2), bevel=0.006)
        m.mat(slot='glow', surf='glass', metal=0.2, rough=0.15, emit=0.35, texel=1.2)
        p2 = B.on_skull(k * 0.36, 0.62, 0.7, 0.028)
        m.cyl(0.033, 0.033, 0.024, 10, at=tuple(p2), rot=(0.98, 0, -k * 0.2))
    m.steel(texel=0.8)
    m.box(0.032, 0.02, 0.02, at=tuple(B.on_skull(0, 0.6, 0.76, 0.014)), rot=(-0.6, 0, 0), bevel=0.005)


def hairdo(m):
    m.on('head')
    B.scalp(m, grow=0.009, fringe=0.34)
    B.hair(m, 1.0)
    L = [
        # (base direction, tip offset, radius, bend)
        ((0.3, 0.74, 0.6), (0.07, -0.075, 0.075), 0.05, (0.0, 0.01, 0.035)),    # fringe, falling to the left
        ((-0.02, 0.78, 0.62), (0.075, -0.085, 0.08), 0.054, (0.0, 0.01, 0.04)),
        ((-0.36, 0.74, 0.55), (0.02, -0.07, 0.075), 0.048, (0.0, 0.01, 0.035)),
        ((0.62, 0.66, 0.42), (0.06, -0.08, 0.05), 0.044, (0.01, 0.0, 0.03)),
        ((-0.64, 0.66, 0.4), (-0.04, -0.075, 0.05), 0.044, (-0.01, 0.0, 0.03)),
        ((0.1, 1.0, 0.1), (0.04, 0.15, 0.03), 0.056, (0.0, 0.0, 0.03)),        # crown
        ((-0.25, 0.95, 0.0), (-0.08, 0.14, -0.02), 0.054, (0.0, 0.0, 0.02)),
        ((0.3, 0.92, -0.2), (0.1, 0.13, -0.08), 0.054, (0.0, 0.02, 0.0)),
        ((-0.05, 0.9, -0.4), (0.0, 0.15, -0.12), 0.058, (0.0, 0.02, 0.0)),
        ((-0.45, 0.75, -0.35), (-0.12, 0.09, -0.1), 0.05, (0.0, 0.02, 0.0)),
        ((0.5, 0.62, -0.55), (0.11, 0.05, -0.13), 0.05, (0.0, 0.03, 0.0)),     # back
        ((0.05, 0.55, -0.85), (0.02, 0.05, -0.17), 0.056, (0.0, 0.03, 0.0)),
        ((-0.45, 0.5, -0.7), (-0.1, 0.03, -0.14), 0.05, (0.0, 0.03, 0.0)),
        ((0.3, 0.15, -0.95), (0.05, -0.05, -0.14), 0.05, (0.0, 0.0, -0.02)),
        ((-0.25, 0.1, -0.95), (-0.05, -0.06, -0.13), 0.048, (0.0, 0.0, -0.02)),
        ((0.0, -0.2, -0.95), (0.0, -0.1, -0.08), 0.044, (0.0, 0.0, -0.02)),
        ((0.85, 0.3, -0.3), (0.06, -0.02, -0.11), 0.042, (0.02, 0.0, 0.0)),    # sides, swept back
        ((-0.85, 0.3, -0.3), (-0.06, -0.02, -0.11), 0.042, (-0.02, 0.0, 0.0)),
        ((0.9, 0.05, -0.05), (0.03, -0.08, -0.03), 0.034, (0.01, 0.0, 0.0)),   # sideburns
        ((-0.9, 0.05, -0.05), (-0.03, -0.08, -0.03), 0.034, (-0.01, 0.0, 0.0)),
    ]
    for d, off, r, bend in L:
        b = B.on_skull(*d, out=-0.012)
        B.spike(m, b, b + np.asarray(off), r, bend)


def scarf(m):
    m.on('chest')
    B.knit(m, 'accent', 1.0)
    m.torus(0.1, 0.047, 12, 7, at=(0, 0.25, 0.006), rot=(0.16, 0, 0), scale=(1.1, 0.92, 1.04))
    m.sphere(0.052, 8, 6, at=(-0.07, 0.25, -0.105), scale=(1, 0.82, 1))


def make():
    m = Model('rook')
    B.skeleton(m)
    B.pelvis(m, 'bottom')
    B.legs(m, 'bottom')
    B.torso(m, 'top', 'top2')
    B.belt(m, glow=True)
    B.neck(m)
    B.arms(m, sleeve='cloth2', fore='cloth2', cuff=False)
    gauntlets(m)
    B.hands(m, 'glove')
    B.boots(m, 'boots', cuff=('fixed', GREY), toe=('fixed', 0x7b838d), welt='accent')
    jacket_extras(m)
    backpack(m)
    toolbelt(m)
    leg_gear(m)
    B.head(m)
    B.eyes(m)
    B.brows(m, tilt=0.16)
    B.mouth(m)
    hairdo(m)
    goggles(m)
    scarf(m)
    return m


def post(rgba, gb, cover):
    out = B.face_post(rgba, gb, cover)
    # jacket: a zip down the front and a stitched hem
    P = gb['pos'].astype(np.float64)
    slot = np.rint(gb['ids'][..., 1]).astype(np.int32)
    top = (slot == SLOTS.index('top')) & (P[..., 2] > 0.05)
    zipm = top & (np.abs(P[..., 0]) < 0.011) & (P[..., 1] > 0.98) & (P[..., 1] < 1.3)
    teeth = 0.5 + 0.3 * (np.sin(P[..., 1] * 520.0) > 0)
    out[..., :3] = np.where(zipm[..., None], out[..., :3] * (0.42 * teeth)[..., None], out[..., :3])
    edge = top & (np.abs(np.abs(P[..., 0]) - 0.0145) < 0.0025) & (P[..., 1] > 0.98) & (P[..., 1] < 1.3)
    out[..., :3] = np.where(edge[..., None], np.clip(out[..., :3] * 1.18, 0, 1), out[..., :3])
    return out
