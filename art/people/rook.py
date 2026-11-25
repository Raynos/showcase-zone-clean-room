"""
Rook, the hero: a test-yard technician-adventurer, seen from behind in every frame of the game.

From the back, top to bottom: tousled chestnut hair in overlapping locks, goggles' strap, a red
scarf wound round the neck (its knot is here; its tail is simulated cloth), an orange work jacket
with a navy yoke, collar, side panels and arm bands, slate shoulder plates, a rounded pack on
leather straps with a buckled lid and a caged cyan power cell (the signature), a tool belt, navy
trousers with a thigh pouch and knee guards, cuffed steel-toed boots with a heel light. Gloves with
leather bracers and a wrist computer are what first person looks at.

Bones: see people/base.py. No optional pieces: the hero wears all of it.
"""
import math

import numpy as np

from lib.kit import Model, PI, SLOTS
from people import base as B
from people.base import At, HC, SK, SIDES, Y_CHEST, Y_HIPS, Y_NECK, Y_SHOULDER, Y_THIGH

TEX = 2048   # first person looks straight at his hands, forearms and whatever they hold
BUILD = dict(ao_dist=0.14, edge_dist=0.016, edge_w=0.005, scale=1.0, chip=0.45, grime=0.35, ao_min=0.42, edge_other=0.25, quality=80)

PACK = 0x6f8aa6
PACK_LID = 0x8aa2ba
PACK_DARK = 0x4b5f78
PLATE = 0x6c86a4
GREY = 0x8b939d


def gauntlets(m):
    for s, k in SIDES:
        F = 'armF_' + s
        cx = k * SK['shX']
        with At(m, F):
            # glove cuff over the sleeve, then a leather bracer strapped on top of it
            B.leather(m, 'glove', 1.9)
            R = [(-0.415, 0.066), (-0.396, 0.092), (-0.44, 0.085), (-0.5, 0.072), (-0.546, 0.06), (-0.568, 0.044)]
            B.wloft(m, [B.ell(Y_SHOULDER + y, r, r, cx=cx, seg=10) for y, r in R], [(F, 1.0)], close_start=False)
            B.leather(m, 'leather', 1.7)
            R = [(-0.43, 0.086), (-0.412, 0.097), (-0.404, 0.101), (-0.47, 0.087), (-0.518, 0.074), (-0.524, 0.066)]
            B.wloft(m, [B.ell(Y_SHOULDER + y, r, r, cx=cx, seg=10) for y, r in R], [(F, 1.0)], close_start=False, close_end=False)
            B.cloth(m, 'accent', 1.4)
            for y, r in ((-0.46, 0.0895),):
                B.wloft(m, [B.ell(Y_SHOULDER + y + dy, r + dr, r + dr, cx=cx, seg=10) for dy, dr in ((0.008, -0.004), (0.006, 0.0), (-0.006, 0.0), (-0.008, -0.004))], [(F, 1.0)], close_start=False, close_end=False)
            # the animation poses arm bones with +Z toward the elbow point (half a turn from this bind
            # pose), so what must end up on the outside of the arm is modelled on the inside here
            m.steel(texel=1.9)
            m.box(0.026, 0.09, 0.062, at=(cx - k * 0.086, Y_SHOULDER - 0.468, 0), rot=(0, 0, -k * 0.16), bevel=0.009)
            if s == 'L':
                # wrist computer
                m.darkmetal(texel=1.9)
                m.box(0.026, 0.08, 0.074, at=(cx - k * 0.1, Y_SHOULDER - 0.466, 0), rot=(0, 0, -k * 0.16), bevel=0.008)
                m.glow(emit=1.2, texel=1.2)
                m.box(0.01, 0.05, 0.048, at=(cx - k * 0.113, Y_SHOULDER - 0.465, 0), rot=(0, 0, -k * 0.16), bevel=0.003)
        m.on(F)
        # armoured glove: a knuckle bar and a plate on the back of the hand (hand frame: +Z knuckles,
        # the back of the hand toward +k X)
        m.on('hand_' + s)
        m.steel(texel=2.6)
        for y in (0.041, 0.0137, -0.0137, -0.04):
            m.box(0.012, 0.021, 0.026, at=(k * 0.0425, y, 0.099), rot=(0, k * 0.12, 0), bevel=0.005)
        B.leather(m, 'leather', 2.6)
        m.box(0.008, 0.068, 0.05, at=(k * 0.0445, 0, 0.052), bevel=0.003)
        m.on(F)


def shoulder_plates(m):
    """A domed plate over each shoulder with a lame under it: arm bones hang half a turn round, so outside is -k X here."""
    for s, k in SIDES:
        m.on('armU_' + s)
        m.fixed(PLATE, surf='paint', metal=0.55, rough=0.45, texel=1.3)
        m.push(at=(-k * 0.026, -0.004, 0), rot=(0, 0, k * 0.38))
        m.lathe([(0.1, -0.026), (0.117, -0.03), (0.121, -0.02), (0.112, 0.02), (0.086, 0.054), (0.042, 0.074), (0.0, 0.078)], 9, scale=(1.04, 1, 1.12), cap=False)
        m.lathe([(0.097, -0.088), (0.108, -0.09), (0.112, -0.08), (0.112, -0.032), (0.102, -0.028)], 9, scale=(1.04, 1, 1.12), cap=False)
        B.cloth(m, 'accent', 0.8)
        m.lathe([(0.114, -0.092), (0.1155, -0.084), (0.105, -0.084)], 9, scale=(1.04, 1, 1.12), cap=False)
        m.steel(texel=0.7)
        for a in (-0.6, 0.6):
            m.sphere(0.011, 5, 3, at=(-k * 0.116 * math.cos(a) * 1.04, -0.056, 0.116 * math.sin(a) * 1.12))
        m.pop()
        # a navy band stitched round the upper sleeve
        with At(m, 'armU_' + s):
            B.cloth(m, 'cloth2', 1.3); B.region(m, 'band')
            cx = k * SK['shX']
            R = [(-0.168, 0.0815), (-0.166, 0.0885), (-0.206, 0.0835), (-0.208, 0.0775)]
            B.wloft(m, [B.ell(Y_SHOULDER + y, r, r * 1.03, cx=cx, cz=-0.005, seg=10) for y, r in R], [('armU_' + s, 1.0)], close_start=False, close_end=False)
            B.region(m, 'none')


def jacket_extras(m):
    B.hem(m, 'top', drop=0.9, flare=0.014)
    m.on('chest')
    # chest light on the left breast, a flapped pocket on the right
    m.steel(texel=1.2)
    m.box(0.078, 0.056, 0.02, at=(0.097, 0.07, B.chest_z(Y_CHEST + 0.07, 0.097) + 0.006), rot=(0.0, 0.42, 0), bevel=0.008)
    m.glow(emit=1.0, texel=1.0)
    m.box(0.034, 0.016, 0.012, at=(0.1, 0.07, B.chest_z(Y_CHEST + 0.07, 0.1) + 0.016), rot=(0, 0.42, 0), bevel=0.003)
    B.cloth(m, 'cloth2', 0.9)
    m.box(0.088, 0.07, 0.014, at=(-0.098, -0.05, B.chest_z(Y_CHEST - 0.05, 0.098) + 0.004), rot=(-0.08, -0.45, 0), bevel=0.006)
    m.box(0.092, 0.024, 0.018, at=(-0.098, -0.02, B.chest_z(Y_CHEST - 0.02, 0.098) + 0.006), rot=(-0.08, -0.45, 0), bevel=0.006)
    # pack straps: over the shoulders and down to the belt, with a strap across the chest and buckles
    B.leather(m, 'leather', 0.9)
    for k in (1, -1):
        B.strap(m, [(k * (0.128 - 0.07 * max(0.0, y - 0.05)), y) for y in (-0.16, -0.08, 0.0, 0.08, 0.15, 0.2, 0.235, 0.255, 0.265)], 0.042, out=0.008,
                over=[(k * 0.108, y) for y in (0.265, 0.25, 0.22, 0.17)])
    B.strap(m, [(x, 0.105 + 0.004 * math.cos(x * 12)) for x in (-0.125, -0.06, 0.0, 0.06, 0.125)], 0.026, out=0.011)
    m.steel(texel=1.0)
    for k in (1, -1):
        m.box(0.05, 0.03, 0.014, at=(k * 0.118, 0.14, B.chest_z(Y_CHEST + 0.14, 0.118) + 0.012), rot=(-0.05, k * 0.5, 0), bevel=0)
    m.box(0.034, 0.036, 0.014, at=(0.0, 0.105, B.chest_z(Y_CHEST + 0.105, 0.0) + 0.016), bevel=0)


def backpack(m):
    """
    The pack: a rounded body, a lid buckled down with two straps, a pocket on each side, a bedroll-free
    top so the scarf and hair read above it, and low on its back the power cell: a cyan tube in a steel cage.
    """
    m.on('chest')
    z = -0.2
    m.fixed(PACK, surf='cloth', rough=0.85, texel=1.1); B.region(m, 'pack')
    R = [(-0.165, 0.09, 0.045), (-0.15, 0.128, 0.07), (-0.06, 0.143, 0.086), (0.05, 0.14, 0.084), (0.13, 0.13, 0.074), (0.175, 0.1, 0.05)]
    m.loft([B.ell(y, rx, rz, cz=z, seg=12, p=3.2) for y, rx, rz in R])
    # the lid: a second layer over the top third, its edge turned
    m.fixed(PACK_LID, surf='cloth', rough=0.85, texel=1.1)
    R = [(0.052, 0.14, 0.085), (0.046, 0.149, 0.094), (0.09, 0.148, 0.093), (0.14, 0.137, 0.081), (0.185, 0.106, 0.056), (0.198, 0.05, 0.02)]
    m.loft([B.ell(y, rx, rz, cz=z, seg=12, p=3.2) for y, rx, rz in R], close_start=False)
    B.region(m, 'none')
    # two straps over the lid, buckled below it
    B.leather(m, 'leather', 0.9)
    for k in (1, -1):
        m.box(0.03, 0.2, 0.012, at=(k * 0.07, 0.085, z - 0.097), rot=(0.06, 0, 0), bevel=0.004)
    m.steel(texel=1.0)
    for k in (1, -1):
        m.box(0.042, 0.03, 0.016, at=(k * 0.07, 0.022, z - 0.094), bevel=0.005)
    # side pocket and canteen
    m.fixed(PACK_DARK, surf='cloth', rough=0.85, texel=0.9)
    m.box(0.056, 0.13, 0.1, at=(0.15, -0.055, z + 0.005), bevel=0.02, seg=2)
    m.fixed(PACK_LID, surf='cloth', rough=0.85, texel=0.7)
    m.box(0.06, 0.04, 0.104, at=(0.151, -0.002, z + 0.005), bevel=0.012)
    m.steel(texel=0.9)
    m.cyl(0.038, 0.038, 0.12, 8, at=(-0.158, -0.05, z + 0.005), bevel=0.012)
    m.darkmetal(texel=0.6)
    m.cyl(0.018, 0.018, 0.03, 6, at=(-0.158, 0.025, z + 0.005))
    # power cell: a dark recess, a glowing tube, a steel cage over it
    zc = z - 0.086
    m.fixed(0x1a2230, surf='dark', rough=0.5, texel=0.7)
    m.box(0.1, 0.17, 0.02, at=(0, -0.065, zc + 0.004), bevel=0)
    m.glow(emit=1.45, texel=1.4)
    m.capsule(0.027, 0.085, 6, at=(0, -0.065, zc - 0.01))
    m.steel(texel=1.1)
    for y in (0.012, -0.142):
        m.cyl(0.038, 0.038, 0.022, 8, at=(0, y, zc - 0.008), bevel=0.005)
    for k in (1, -1):
        m.box(0.01, 0.15, 0.01, at=(k * 0.031, -0.065, zc - 0.03), bevel=0)
    m.box(0.07, 0.01, 0.01, at=(0, -0.065, zc - 0.036), bevel=0)
    m.mat(slot='glow2', surf='glow', metal=0.0, rough=0.4, emit=1.4, texel=0.8)
    m.box(0.03, 0.014, 0.016, at=(0.092, 0.03, z - 0.082), bevel=0)
    # hose from the cell up into the pack
    m.fixed(0x23262c, surf='rubber', rough=0.9, texel=0.5)
    m.tube([(-0.036, 0.012, zc - 0.008), (-0.075, 0.03, zc - 0.012), (-0.105, 0.02, zc + 0.004), (-0.115, -0.03, zc + 0.02)], 0.011, seg=5)


def toolbelt(m, bone='hips', lod=0):
    m.on(bone)
    B.leather(m, 'leather', 1.0).mat(lod=lod)
    m.box(0.074, 0.115, 0.088, at=(0.2, -0.01, 0.01), rot=(0, 0, 0.1), bevel=0.018)
    m.box(0.08, 0.036, 0.094, at=(0.204, 0.034, 0.01), rot=(0, 0, 0.1), bevel=0.01)
    m.box(0.094, 0.094, 0.058, at=(-0.078, -0.005, -0.136), rot=(0.1, -0.25, 0), bevel=0.016)
    m.box(0.098, 0.03, 0.062, at=(-0.078, 0.03, -0.138), rot=(0.1, -0.25, 0), bevel=0.01)
    m.box(0.07, 0.085, 0.05, at=(0.09, -0.005, -0.134), rot=(0.1, 0.25, 0), bevel=0.014)
    m.box(0.06, 0.07, 0.04, at=(-0.115, -0.01, 0.112), rot=(-0.05, -0.5, 0), bevel=0.012)
    m.steel(texel=0.9)
    m.box(0.02, 0.016, 0.01, at=(0.238, 0.018, 0.01), bevel=0)
    # wrench hanging on the right hip
    m.cyl(0.011, 0.011, 0.17, 6, at=(-0.207, -0.07, 0.02), rot=(0.1, 0, 0.06))
    m.box(0.016, 0.046, 0.052, at=(-0.212, -0.16, 0.012), bevel=0)
    B.leather(m, 'leather', 0.8)
    m.box(0.032, 0.046, 0.032, at=(-0.192, 0.02, 0.03), bevel=0)
    if lod == 1:
        B.leather(m, 'leather', 0.4).mat(lod=2)
        m.box(0.074, 0.13, 0.088, at=(0.2, 0.0, 0.01), bevel=0)
        m.box(0.094, 0.1, 0.058, at=(-0.078, 0.0, -0.136), bevel=0)
    m.mat(lod=0)


def leg_gear(m):
    for s, k in SIDES:
        m.on('thigh_' + s)
        if s == 'R':
            # a pouch strapped to the outside of the right thigh
            B.leather(m, 'leather', 0.9)
            m.box(0.046, 0.12, 0.104, at=(k * 0.112, -0.2, 0.0), bevel=0.014)
            m.box(0.05, 0.036, 0.108, at=(k * 0.113, -0.152, 0.0), bevel=0.009)
            m.cyl(0.115, 0.113, 0.026, 10, at=(k * 0.004, -0.165, 0.002), cap=False)
            m.steel(texel=0.7)
            m.box(0.012, 0.02, 0.026, at=(k * 0.139, -0.168, 0.0), bevel=0.003)
        else:
            B.cloth(m, 'cloth2', 0.9)
            m.box(0.04, 0.12, 0.108, at=(k * 0.104, -0.2, 0.0), bevel=0.012)
            m.box(0.044, 0.034, 0.112, at=(k * 0.104, -0.15, 0.0), bevel=0.008)
        m.on('shin_' + s)
        m.fixed(GREY, surf='paint', metal=0.3, rough=0.55, texel=1.1)
        m.box(0.118, 0.13, 0.06, at=(0, -0.008, 0.07), rot=(0.06, 0, 0), bevel=0.02, seg=2)
        B.cloth(m, 'accent', 0.8)
        m.box(0.122, 0.022, 0.054, at=(0, -0.034, 0.076), rot=(0.06, 0, 0), bevel=0.006)
        B.leather(m, 'leather', 0.6)
        m.cyl(0.092, 0.092, 0.022, 8, at=(0, -0.01, 0.004), cap=False)
        # heel light
        m.on('foot_' + s)
        m.glow(emit=1.1, texel=0.6)
        m.box(0.05, 0.014, 0.012, at=(0, -SK['ankle'] + 0.058, -0.098), bevel=0)


def goggles(m, bone='head', lod=0):
    m.on(bone)
    B.leather(m, 'leather', 0.8).mat(lod=lod)
    m.torus(0.168, 0.014, 10, 4, at=(0, HC + 0.078, -0.006), rot=(-0.2, 0, 0), scale=(0.95, 1, 1.03))
    for k in (1, -1):
        p = B.on_skull(k * 0.36, 0.62, 0.7, 0.016)
        m.steel(texel=1.2)
        m.cyl(0.044, 0.048, 0.042, 10, at=tuple(p), rot=(0.98, 0, -k * 0.2), bevel=0.006)
        m.mat(slot='glow', surf='glass', metal=0.2, rough=0.15, emit=0.35, texel=1.2)
        p2 = B.on_skull(k * 0.36, 0.62, 0.7, 0.028)
        m.cyl(0.033, 0.033, 0.024, 10, at=tuple(p2), rot=(0.98, 0, -k * 0.2))
    m.steel(texel=0.8)
    m.box(0.032, 0.02, 0.02, at=tuple(B.on_skull(0, 0.6, 0.76, 0.014)), rot=(-0.6, 0, 0), bevel=0.005)
    if lod == 1:
        B.leather(m, 'leather', 0.4).mat(lod=2)
        m.torus(0.168, 0.016, 6, 3, at=(0, HC + 0.078, -0.006), rot=(-0.2, 0, 0), scale=(0.95, 1, 1.03))
    m.mat(lod=0)


def hairdo(m):
    """Tousled: a whorl of thick locks from the crown, their tips lifted; shorter ones to the nape; tufts pushed up by the goggles."""
    m.on('head')
    B.scalp(m, fringe=0.4)
    B.hair(m, 1.0)
    crown = (0.06, 0.9, -0.36)
    clear = lambda d: not (d[2] > 0.42 and d[1] < 0.86)          # nothing through the goggles
    B.whorl(m, crown, [(6, 0.08, 0.74, 0.06, 0.024, 0.032, 0.2)], seed=11, sweep=0.55)
    B.whorl(m, crown, [(12, 0.5, 1.36, 0.06, 0.02, 0.03, 0.1)], seed=12, sweep=0.42, keep=clear)
    B.whorl(m, crown, [(11, 0.95, 1.68, 0.054, 0.014, 0.018, 0.35)], seed=13, sweep=0.25, keep=lambda d: d[2] < 0.3, n=4)
    # the fringe stands up over the goggles' strap, falling to his left
    for x, lean, h in ((-0.42, -0.02, 0.05), (-0.14, 0.03, 0.062), (0.16, 0.06, 0.058), (0.44, 0.07, 0.046)):
        B.lock(m, (x, 0.84, 0.36), (x + 0.1, 0.72, 0.66), 0.054, out=(0.004, 0.034), arch=0.016, tip=(lean, h, 0.035), n=5)
    # in front of each ear
    for k in (1, -1):
        B.lock(m, (k * 0.9, 0.42, 0.2), (k * 0.93, -0.12, 0.22), 0.034, arch=0.004, out=(0.002, 0.006))


def scarf(m):
    """Wound twice round the neck, bunched high at the back, knotted behind the right shoulder where the tail leaves."""
    m.on('chest')
    B.knit(m, 'accent', 1.0); B.region(m, 'soft')
    m.torus(0.1, 0.048, 12, 6, at=(0, 0.245, 0.004), rot=(0.2, 0, 0.04), scale=(1.1, 0.9, 1.05))
    m.torus(0.088, 0.036, 9, 4, at=(0.004, 0.288, -0.008), rot=(-0.04, 0.5, -0.1), scale=(1.08, 0.82, 1.02))
    m.sphere(0.052, 6, 4, at=(-0.07, 0.25, -0.108), scale=(1, 0.84, 1))
    m.box(0.06, 0.1, 0.02, at=(-0.03, 0.2, -0.128), rot=(0.25, 0, 0.5), bevel=0.007)
    B.region(m, 'none')


def make():
    m = Model('rook')
    B.skeleton(m)
    B.pelvis(m, 'bottom')
    B.legs(m, 'bottom')
    B.torso(m, 'top', 'cloth2', collar='cloth2', side='cloth2')
    B.belt(m, glow=True)
    B.neck(m)
    B.arms(m, sleeve='top', fore='top', cuff=False, texel=1.5, cap='cloth2')
    gauntlets(m)
    B.hands(m, 'glove', texel=2.6, seg=8)
    B.boots(m, 'boots', cuff=('fixed', GREY), toe=('fixed', 0x7b838d), welt='accent', strap=True)
    jacket_extras(m)
    shoulder_plates(m)
    backpack(m)
    toolbelt(m)
    leg_gear(m)
    B.head(m)
    B.eyes(m)
    B.brows(m)
    hairdo(m)
    goggles(m)
    scarf(m)
    return B.remember(m)


def post(rgba, gb, cover):
    out = B.face_post(B.people_post(rgba, gb, cover), gb, cover)
    # jacket: a zip down the front, and the seams of its panels down the back, each with its row of stitches
    P = gb['pos'].astype(np.float64)
    slot = np.rint(gb['ids'][..., 1]).astype(np.int32)
    x, y, z = P[..., 0], P[..., 1], P[..., 2]
    top = slot == SLOTS.index('top')
    body = top & (np.abs(x) < 0.17) & (y > 0.9) & (y < 1.3)
    zipm = body & (z > 0.05) & (np.abs(x) < 0.011) & (y > 0.98)
    teeth = 0.5 + 0.3 * (np.sin(y * 520.0) > 0)
    out[..., :3] = np.where(zipm[..., None], out[..., :3] * (0.42 * teeth)[..., None], out[..., :3])
    edge = body & (z > 0.05) & (np.abs(np.abs(x) - 0.0145) < 0.0025) & (y > 0.98)
    out[..., :3] = np.where(edge[..., None], np.clip(out[..., :3] * 1.18, 0, 1), out[..., :3])
    back = body & (z < -0.04)
    curve = 0.085 + 0.03 * np.clip((y - 1.0) / 0.3, 0, 1) ** 1.5              # seams that spread toward the shoulder blades
    d = np.minimum(np.abs(np.abs(x) - curve), np.abs(x) + 0.004)
    seam = back & (d < 0.0022)
    stitch = back & (np.abs(d - 0.007) < 0.0013) & (np.sin(y * (2 * PI / 0.011)) > -0.15)
    out[..., :3] = np.where(seam[..., None], out[..., :3] * 0.62, out[..., :3])
    out[..., :3] = np.where(stitch[..., None], np.clip(out[..., :3] * 1.22 + 0.03, 0, 1), out[..., :3])
    return out
