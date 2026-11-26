"""
Rook's arms as his own eyes see them: the pair the first-person camera draws in place of the body's.

The body's arms (people/rook.py) are made to read from five metres behind: forearms as thick as a
thigh under a slab of bracer, mitten gloves. Held a forearm's length from a phone's lens they are a
wall. These are the same outfit cut for the lens: the orange jacket sleeve gathered at a stitched
cuff, a fitted leather bracer under two buckled straps with a steel guard along the outside (the
wrist computer on the left), and a jointed glove with a plate on every knuckle and a pad on every
finger segment, so a closed hand reads as fingers round a grip and not as a fist of clay.

Same skeleton as the body (people/base.py), so the game binds this mesh to the hero's own bones and
every pose that moves his arms moves these. One more chain per hand, idxA / idxB / idxC: the index
finger on its own, for a trigger and a bowstring. Nothing above the middle of the upper arm is
built: the shoulder sits under the lens.
"""
import math

import numpy as np

from lib.kit import Model, PI
from people import base as B
from people.base import At, SK, SIDES, Y_SHOULDER, HAND, FING_REST, FINGERS

TEX = 1024
BUILD = dict(ao_dist=0.05, edge_dist=0.008, edge_w=0.003, scale=1.0, chip=0.5, grime=0.3, ao_min=0.5, edge_other=0.25, quality=84)

SEG = 12


def ring(y, r, cx, seg=SEG, f=1.0):
    return B.ell(Y_SHOULDER + y, r, r * f, cx=cx, seg=seg)


def wt(m, rng, w):
    if m.weights is None: m.weights = {}
    for v in rng: m.weights[v] = w


def sleeves(m):
    for s, k in SIDES:
        U, F = 'armU_' + s, 'armF_' + s
        cx = k * SK['shX']
        with At(m, U):
            # the jacket sleeve from the middle of the upper arm, loose over the elbow
            B.cloth(m, 'top', 1.5); B.region(m, 'sleeve')
            R = [(-0.07, 0.03), (-0.085, 0.064), (-0.15, 0.065), (-0.235, 0.058), (-0.275, 0.057), (-0.31, 0.058), (-0.345, 0.056),
                 (-0.395, 0.052), (-0.446, 0.046), (-0.452, 0.04)]
            W = [B.blend(U, F, B.sm(-0.235, -0.325, y)) for y, _ in R]
            B.wloft(m, [ring(y, r, cx) for y, r in R], W)
            # the navy band round the upper sleeve
            B.cloth(m, 'cloth2', 1.5); B.region(m, 'band')
            R = [(-0.168, 0.062), (-0.166, 0.0685), (-0.2, 0.0655), (-0.202, 0.06)]
            B.wloft(m, [ring(y, r, cx) for y, r in R], [(U, 1.0)], close_start=False, close_end=False)
        with At(m, F):
            # the sleeve's own cuff: a rolled, stitched edge where the bracer starts
            B.cloth(m, 'cloth2', 1.6); B.region(m, 'band')
            R = [(-0.432, 0.046), (-0.434, 0.0535), (-0.446, 0.0545), (-0.452, 0.0525), (-0.454, 0.045)]
            B.wloft(m, [ring(y, r, cx) for y, r in R], [(F, 1.0)], close_start=False, close_end=False)
            B.region(m, 'none')
            # the glove's long cuff runs up under the bracer
            B.leather(m, 'glove', 2.2)
            R = [(-0.448, 0.041), (-0.452, 0.0455), (-0.49, 0.043), (-0.522, 0.0395), (-0.545, 0.036), (-0.562, 0.0335), (-0.572, 0.027)]
            B.wloft(m, [ring(y, r, cx, f=0.94 if y < -0.53 else 1.0) for y, r in R], [(F, 1.0)], close_start=False)
            # bracer: fitted leather, open along the inside of the arm where it laces
            B.leather(m, 'leather', 2.0)
            R = [(-0.458, 0.045), (-0.46, 0.0505), (-0.464, 0.052), (-0.5, 0.0485), (-0.532, 0.0445), (-0.536, 0.043), (-0.538, 0.038)]
            B.wloft(m, [ring(y, r, cx) for y, r in R], [(F, 1.0)], close_start=False, close_end=False)
            # two straps over it, each with a buckle on the outside
            for y in (-0.474, -0.522):
                r = 0.0515 - (0.0065 if y < -0.5 else 0.0)
                B.cloth(m, 'accent', 1.6)
                B.wloft(m, [ring(y + dy, r + dr, cx) for dy, dr in ((0.0075, -0.003), (0.006, 0.0), (-0.006, 0.0), (-0.0075, -0.003))], [(F, 1.0)], close_start=False, close_end=False)
                m.steel(texel=2.4)
                # (the animation carries the arm half a turn from this pose: outside is toward the body here)
                m.box(0.006, 0.019, 0.022, at=(cx - k * (r + 0.002), Y_SHOULDER + y, 0.012), rot=(0, 0, 0), bevel=0.002)
                m.box(0.0075, 0.006, 0.009, at=(cx - k * (r + 0.003), Y_SHOULDER + y, 0.012), bevel=0)
            # the guard: a steel splint down the outside of the forearm, riveted at both ends
            m.steel(texel=2.2)
            m.box(0.008, 0.064, 0.034, at=(cx - k * 0.0525, Y_SHOULDER - 0.498, -0.012), rot=(0, 0, -k * 0.105), bevel=0.003)
            for dy in (0.024, -0.024):
                m.box(0.005, 0.006, 0.006, at=(cx - k * (0.0565 + dy * 0.1), Y_SHOULDER - 0.498 + dy, -0.012), rot=(0, 0, -k * 0.105), bevel=0)
            if s == 'L':
                # the wrist computer: a dark case on the splint, its screen lit
                m.darkmetal(texel=2.2)
                m.box(0.012, 0.05, 0.04, at=(cx - k * 0.06, Y_SHOULDER - 0.497, -0.012), rot=(0, 0, -k * 0.105), bevel=0.003)
                m.glow(emit=1.2, texel=1.6)
                m.box(0.004, 0.034, 0.027, at=(cx - k * 0.0668, Y_SHOULDER - 0.4965, -0.012), rot=(0, 0, -k * 0.105), bevel=0.001)
                m.steel(texel=2.2)
                for dz in (-0.014, 0.0, 0.014):
                    m.box(0.004, 0.005, 0.007, at=(cx - k * 0.0655, Y_SHOULDER - 0.5185, -0.012 + dz), rot=(0, 0, -k * 0.105), bevel=0.001)
    B.region(m, 'none'); m.mat(lod=0)


def hands(m):
    """
    The glove, in the hand frame (+Z knuckles, +Y thumb, the back of the hand toward +k X). The body's
    hand curls its four fingers on one chain; here the index finger has a chain of its own.
    """
    a0, a1, a2 = FING_REST
    for s, k in SIDES:
        H_ = 'hand_' + s
        m.on(H_)
        B.leather(m, 'glove', 2.6)
        m.push(scale=HAND)
        P = [(-0.012, 0.0125, 0.021, 0.0, 0.009), (-0.002, 0.014, 0.0265, 0.001, 0.011), (0.012, 0.0165, 0.034, 0.003, 0.014), (0.03, 0.018, 0.0415, 0.004, 0.017),
             (0.054, 0.0175, 0.0465, 0.001, 0.019), (0.076, 0.0165, 0.047, 0.0, 0.02), (0.088, 0.0145, 0.046, 0.0, 0.02), (0.096, 0.008, 0.041, 0.0, 0.02)]
        m.loft([B.ell_xy(z, rx, ry, cy=cy, cx=k * cx, seg=SEG, p=2.35) for z, rx, ry, cy, cx in P])
        # thumb muscle, and the pad under the roots of the fingers
        m.sphere(0.0225, 8, 5, at=(k * 0.007, 0.033, 0.03), scale=(0.85, 1.0, 1.4))
        m.sphere(0.0125, 6, 4, at=(k * 0.0125, 0.001, 0.0845), scale=(0.95, 3.5, 1.25))
        # the wrist strap of the glove, and its tab
        B.leather(m, 'leather', 2.6)
        m.loft([B.ell_xy(z, rx, ry, cy=0.0005, cx=k * 0.0095, seg=SEG, p=2.35) for z, rx, ry in ((-0.004, 0.0142, 0.0262), (-0.003, 0.0162, 0.0288), (0.007, 0.0178, 0.0318), (0.008, 0.016, 0.03))], close_start=False, close_end=False)
        m.steel(texel=2.8)
        m.box(0.004, 0.011, 0.009, at=(k * 0.0275, 0.006, 0.002), bevel=0.001)
        # the back of the hand: a leather plate with a steel boss, and a plate on each knuckle
        B.leather(m, 'leather', 2.8)
        m.box(0.006, 0.062, 0.044, at=(k * 0.036, 0.0, 0.05), rot=(0, k * 0.05, 0), bevel=0.0025)
        m.steel(texel=2.8)
        m.box(0.004, 0.03, 0.02, at=(k * 0.0395, 0.0, 0.05), rot=(0, k * 0.05, 0), bevel=0.0015)
        for y in (0.0348, 0.0116, -0.0116, -0.0338):
            m.box(0.009, 0.0185, 0.021, at=(k * 0.0355, y, 0.086 - (0.005 if y < -0.03 else 0.0)), rot=(0, k * 0.16, 0), bevel=0.0035)
        m.pop()
        d1, d2, d3 = (np.asarray(B.finger_dir(k, a)) for a in (a0, a0 + a1, a0 + a1 + a2))
        n1, n2 = (np.array([k * math.cos(a), 0.0, math.sin(a)]) for a in (a0, a0 + a1))
        z0 = np.array([0.0, 0.0, 1.0])
        for fi, (y, L1, L2, L3, r, back) in enumerate(FINGERS):
            pre = 'idx' if fi == 0 else 'fing'
            A, Bn, C = pre + 'A_' + s, pre + 'B_' + s, pre + 'C_' + s
            K = np.array([k * 0.02, y, 0.088 - back]) * HAND
            r *= HAND; L1 *= HAND; L2 *= HAND; L3 *= HAND
            J1 = K + d1 * L1; J2 = J1 + d2 * L2
            e = 0.005 * HAND
            pts = [(K - z0 * 0.02 * HAND, z0, r * 0.98, [(H_, 1.0)]),
                   (K - z0 * e * 0.6, z0 * 0.7 + d1 * 0.3, r * 1.13, [(H_, 0.8), (A, 0.2)]), (K + d1 * e * 1.2, z0 * 0.3 + d1 * 0.7, r * 1.1, [(H_, 0.25), (A, 0.75)]),
                   (K + d1 * L1 * 0.55, d1, r * 0.97, [(A, 1.0)]),
                   (J1 - d1 * e, d1 * 0.7 + d2 * 0.3, r * 1.07, [(A, 0.75), (Bn, 0.25)]), (J1 + d2 * e, d1 * 0.3 + d2 * 0.7, r * 1.07, [(A, 0.25), (Bn, 0.75)]),
                   (J2 - d2 * e * 0.8, d2 * 0.7 + d3 * 0.3, r * 1.0, [(Bn, 0.75), (C, 0.25)]), (J2 + d3 * e * 0.8, d2 * 0.3 + d3 * 0.7, r * 1.0, [(Bn, 0.25), (C, 0.75)]),
                   (J2 + d3 * L3 * 0.62, d3, r * 0.9, [(C, 1.0)]), (J2 + d3 * L3 * 0.96, d3, r * 0.64, [(C, 1.0)]), (J2 + d3 * L3 * 1.06, d3, r * 0.25, [(C, 1.0)])]
            B.leather(m, 'glove', 2.6)
            B._tube(m, [q[:3] for q in pts], [q[3] for q in pts], 8)
            # a pad on the back of the first two segments, so the fingers read one from the next
            B.leather(m, 'leather', 2.8)
            c1 = K + d1 * L1 * 0.55 + n1 * r * 0.86
            wt(m, m.box(0.006, r * 1.5, L1 * 0.56, at=tuple(c1), rot=(0, -k * a0, 0), bevel=0.002), [(A, 1.0)])
            c2 = J1 + d2 * L2 * 0.52 + n2 * r * 0.84
            wt(m, m.box(0.005, r * 1.4, L2 * 0.6, at=tuple(c2), rot=(0, -k * (a0 + a1), 0), bevel=0), [(Bn, 1.0)])
        # thumb: out of the muscle, forward and across the palm
        from lib.kit import rot_xyz
        from mathutils import Vector
        T = np.array([k * 0.004, 0.04, 0.03]) * HAND
        t1 = np.asarray(rot_xyz(-0.5, -k * 0.55, 0) @ Vector((0, 0, 1)))[:3]
        t2 = np.asarray(rot_xyz(-0.5, -k * 1.0, 0) @ Vector((0, 0, 1)))[:3]
        r = 0.0124 * HAND
        J = T + t1 * 0.031 * HAND
        pts = [(T - t1 * 0.008 * HAND, t1, r * 1.06), (T + t1 * 0.012 * HAND, t1, r), (J, t1 + t2, r * 1.04), (J + t2 * 0.014 * HAND, t2, r * 0.93),
               (J + t2 * 0.025 * HAND, t2, r * 0.7), (J + t2 * 0.03 * HAND, t2, r * 0.3)]
        Tn = 'thumb_' + s
        B.leather(m, 'glove', 2.6)
        B._tube(m, pts, [[(H_, 0.5), (Tn, 0.5)]] + [[(Tn, 1.0)]] * 5, 8)
        m.on(H_)


def zipbar(m):
    """
    The zipline's trolley handle, as the eyes see it between their own two fists: a bar with rubber grips, a
    yoke up to the trolley and its wheels. On a bone of its own (the game puts it between the hands while the
    hero rides the wire and folds it away otherwise); +X is toward the left hand, +Y up to the wire.
    """
    m.on('zipbar')
    m.darkmetal(texel=1.6)
    m.cyl(0.0125, 0.0125, 0.46, 8, rot=(0, 0, PI / 2))
    m.rubber(texel=1.6)
    for k in (1, -1):
        m.cyl(0.0155, 0.0155, 0.17, 8, at=(k * 0.125, 0, 0), rot=(0, 0, PI / 2), bevel=0.003)
    m.steel(texel=1.6)
    for k in (1, -1):
        m.cyl(0.02, 0.02, 0.012, 8, at=(k * 0.233, 0, 0), rot=(0, 0, PI / 2))
        m.strut((k * 0.026, 0.008, 0), (k * 0.012, 0.21, 0), 0.008, 0.007, seg=5)
    # the trolley: a painted block on the wire with a wheel at each end, and its lamp
    m.fixed(0xd9792a, surf='paint', metal=0.4, rough=0.5, texel=1.4)
    m.box(0.05, 0.07, 0.19, at=(0, 0.245, 0), bevel=0.008)
    m.darkmetal(texel=1.4)
    for dz in (-0.062, 0.062):
        m.cyl(0.034, 0.034, 0.058, 8, at=(0, 0.29, dz), rot=(0, 0, PI / 2))
    m.glow(emit=1.2, texel=1.2)
    m.box(0.052, 0.012, 0.05, at=(0, 0.232, 0.05), bevel=0)
    m.on('root')


def make():
    m = Model('fparms')
    B.skeleton(m)
    a0, a1, _ = FING_REST
    for s, k in SIDES:
        # the index finger's own chain: the same pivots as the other three fingers' (they curl about one line)
        m.bone('idxA_' + s, 'hand_' + s, B.knuckle(k))
        d = B.finger_dir(k, a0)
        m.bone('idxB_' + s, 'idxA_' + s, (d[0] * B.FING_L1, 0, d[2] * B.FING_L1))
        d = B.finger_dir(k, a0 + a1)
        m.bone('idxC_' + s, 'idxB_' + s, (d[0] * B.FING_L2, 0, d[2] * B.FING_L2))
    for g, (s, _) in zip(m.bake_groups, SIDES): g.extend(n + s for n in ('idxA_', 'idxB_', 'idxC_'))
    m.bone('zipbar', 'root', (0, 0, 0))
    sleeves(m)
    hands(m)
    zipbar(m)
    print(f'  fparms: {m.tri_count()} triangles')
    return B.remember(m)


def post(rgba, gb, cover):
    return B.people_post(rgba, gb, cover)
