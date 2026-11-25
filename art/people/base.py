"""
The human base: one skinned body that the hero and every townsperson are built from.

Bind pose: standing, arms and legs hanging straight down, every joint without rest rotation, so
the procedural animation (src/entities/humanoid/anim.ts through rig.ts) poses bones exactly as
it posed the old pivot groups. Hands are modelled in the hand frame the animation writes:
+Z knuckles, +Y thumb side, wrist at the origin. Faces +Z; the character's left is +X.

Skeleton (names are what rig.ts looks up):
  root > hips > spine > chest > head > eye_L/R, lid_L/R, brow_L/R, mouth
                         chest > armU_L/R > armF_L/R > hand_L/R > fingA > fingB, thumb
  root > thigh_L/R > shin_L/R > foot_L/R
Optional pieces sit on bones named opt_<piece>[_suffix]; the runtime drops the ones a look
does not wear.
"""
import math

import numpy as np

from lib.kit import PI, SLOTS, SURF
from people import head as H
from lib.paint import fbm, smooth

SK = dict(hipY=0.89, hipX=0.1, hipDrop=0.05, thigh=0.39, shin=0.38, ankle=0.1, spine=0.11, chest=0.17, neck=0.26,
          headC=0.14, shX=0.2, shY=0.19, upper=0.28, fore=0.27)
Y_HIPS = SK['hipY']; Y_SPINE = Y_HIPS + SK['spine']; Y_CHEST = Y_SPINE + SK['chest']; Y_NECK = Y_CHEST + SK['neck']
Y_SHOULDER = Y_CHEST + SK['shY']; Y_THIGH = Y_HIPS - SK['hipDrop']
HC = H.HC                    # head centre above the neck joint
HR = H.HR                    # skull radius
EYE = (H.EYE[0], HC + H.EYE[1], H.EYE[2])   # left eye centre in neck-joint space
EYE_R = H.EYE_R
HAND = 1.18                  # heroic hands
KNUCKLE_Z = 0.088 * HAND
FING_L1 = 0.04 * HAND
FING_L2 = 0.026 * HAND
FING_REST = (0.5, 0.75, 0.45)    # baked curl of the three finger joints, radians
BROW = (0.058, 0.043, 0.141)     # brow centre, head-centre space
MARK_STUBBLE, MARK_LINES = 0x010203, 0x030201     # fixed colours that tell the painter a skin layer is stubble or age lines
SIDES = (('L', 1), ('R', -1))


def sm(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


class At:
    """Work on `bone` with coordinates given in model space (or relative to `origin`)."""
    def __init__(self, m, bone, origin=(0, 0, 0)):
        self.m, self.bone, self.o = m, bone, origin

    def __enter__(self):
        p = self.m.bone_pos(self.bone)
        self.m.on(self.bone)
        self.m.push(at=(self.o[0] - p.x, self.o[1] - p.y, self.o[2] - p.z))
        return self.m

    def __exit__(self, *a):
        self.m.pop()


# ---- brushes -------------------------------------------------------------------------------
def cloth(m, slot, texel=1.0, rough=0.88): return m.mat(slot=slot, surf='cloth', metal=0.0, rough=rough, emit=0.0, texel=texel)
def knit(m, slot, texel=1.0): return m.mat(slot=slot, surf='knit', metal=0.0, rough=0.95, emit=0.0, texel=texel)
def leather(m, slot='leather', texel=1.0): return m.mat(slot=slot, surf='leather', metal=0.0, rough=0.6, emit=0.0, texel=texel)
def skin(m, texel=1.0): return m.mat(slot='skin', surf='skin', metal=0.0, rough=0.74, emit=0.0, texel=texel)
def hair(m, texel=1.0): return m.mat(slot='hair', surf='hair', metal=0.0, rough=0.6, emit=0.0, texel=texel)


# ---- rings and weighted lofts ----------------------------------------------------------------
def ell(y, rx, rz, cx=0.0, cz=0.0, seg=14, p=2.0, rzb=None, tilt=0.0):
    """A horizontal superellipse ring at height y. rzb is the back half-depth; tilt raises the front."""
    out = []
    for i in range(seg):
        a = 2 * PI * i / seg
        s, c = math.sin(a), math.cos(a)
        sx = math.copysign(abs(s) ** (2.0 / p), s); sz = math.copysign(abs(c) ** (2.0 / p), c)
        rz_ = rz if (sz >= 0 or rzb is None) else rzb
        out.append((cx + rx * sx, y + tilt * sz, cz + rz_ * sz))
    return out


def ell_xy(z, rx, ry, cy=0.0, cx=0.0, seg=10, p=2.0, flat=None):
    """A ring in the XY plane at depth z (feet, pouches). flat clamps the bottom at that y."""
    out = []
    for i in range(seg):
        a = 2 * PI * i / seg
        s, c = math.sin(a), math.cos(a)
        sx = math.copysign(abs(s) ** (2.0 / p), s); sy = math.copysign(abs(c) ** (2.0 / p), c)
        y = cy + ry * sy
        if flat is not None: y = max(y, flat)
        out.append((cx + rx * sx, y, z))
    return out


def recolor(m, rng, slot, pred):
    """Give the faces of a primitive whose centre passes pred(x, y, z) another palette slot: panels in a garment."""
    si = SLOTS.index(slot)
    for i, f in enumerate(m.F):
        if rng.start <= f[0] < rng.stop:
            c = np.mean([m.V[v] for v in f], axis=0)
            if pred(c[0], c[1], c[2]): m.f_slot[i] = si


def wloft(m, rings, w, **kw):
    """Loft with skin weights: w is one weight list for all rings or one per ring."""
    rng = m.loft(rings, **kw)
    n = len(rings[0])
    if m.weights is None: m.weights = {}
    per = isinstance(w[0], list)
    for i, v in enumerate(rng):
        m.weights[v] = w[i // n] if per else w
    return rng


def thin(R, lod):
    """The far stand-in of a loft keeps every other ring (and always the ends)."""
    if lod != 2 or len(R) < 5: return R
    out = R[::2]
    if out[-1] is not R[-1]: out = out + [R[-1]]
    return out


def blend(a, b, t):
    t = min(1.0, max(0.0, t))
    if t <= 1e-3: return [(a, 1.0)]
    if t >= 1 - 1e-3: return [(b, 1.0)]
    return [(a, 1 - t), (b, t)]


def w_torso(y):
    if y < Y_SPINE - 0.05: return [('hips', 1.0)]
    if y < Y_SPINE + 0.05: return blend('hips', 'spine', sm(Y_SPINE - 0.05, Y_SPINE + 0.05, y))
    if y < Y_CHEST + 0.06: return blend('spine', 'chest', sm(Y_CHEST - 0.07, Y_CHEST + 0.06, y))
    return [('chest', 1.0)]


def oriented(verts, faces, centre):
    """Wind each face so its normal points away from `centre`."""
    out = []
    c = np.asarray(centre, dtype=float)
    V = np.asarray(verts, dtype=float)
    for f in faces:
        p = V[list(f)]
        n = np.cross(p[1] - p[0], p[2] - p[0])
        out.append(tuple(f) if np.dot(n, p.mean(axis=0) - c) >= 0 else tuple(reversed(f)))
    return out


def grid(m, rows, centre, **kw):
    """Open surface through a grid of points rows[j][i], facing away from `centre`."""
    nj, ni = len(rows), len(rows[0])
    verts = [p for r in rows for p in r]
    faces = [(j * ni + i, j * ni + i + 1, (j + 1) * ni + i + 1, (j + 1) * ni + i) for j in range(nj - 1) for i in range(ni - 1)]
    return m.mesh(verts, oriented(verts, faces, centre), recalc=False, **kw)


# ---- skeleton --------------------------------------------------------------------------------
def knuckle(k):
    return (k * 0.02 * HAND, 0.0, KNUCKLE_Z)


def finger_dir(k, a):
    """Unit direction of a finger segment curled by `a` radians from straight, in the hand frame."""
    return (-k * math.sin(a), 0.0, math.cos(a))


def skeleton(m):
    m.bone('root', None, (0, 0, 0))
    m.bone('hips', 'root', (0, Y_HIPS, 0))
    m.bone('spine', 'hips', (0, SK['spine'], 0))
    m.bone('chest', 'spine', (0, SK['chest'], 0))
    m.bone('head', 'chest', (0, SK['neck'], 0))
    hc = lambda p: (p[0], p[1] + HC, p[2])
    for s, k in SIDES:
        m.bone('eye_' + s, 'head', (k * EYE[0], EYE[1], EYE[2]))
        m.bone('lid_' + s, 'head', (k * EYE[0], EYE[1], EYE[2]))
        m.bone('lidLo_' + s, 'head', (k * EYE[0], EYE[1], EYE[2]))
        m.bone('brow_' + s, 'head', (k * BROW[0], HC + BROW[1], BROW[2]))
        m.bone('corner_' + s, 'head', (k * H.MOUTH_W, HC + H.Y_MOUTH, 0.135))
        m.bone('ear_' + s, 'head', (k * H.EAR_AT[0], HC + H.EAR_AT[1], H.EAR_AT[2]))
    m.apart = ['lid_L', 'lid_R', 'lidLo_L', 'lidLo_R']      # lids are painted, not shaded by the bake (lib/export.py)
    m.bone('jaw', 'head', hc(H.JAW_PIVOT))
    m.bone('nose', 'head', hc(H.NOSE_PIVOT))
    m.bone('cheek', 'head', hc(H.CHEEK_PIVOT))
    for s, k in SIDES:
        m.bone('armU_' + s, 'chest', (k * SK['shX'], SK['shY'], 0))
        m.bone('armF_' + s, 'armU_' + s, (0, -SK['upper'], 0))
        m.bone('hand_' + s, 'armF_' + s, (0, -SK['fore'], 0))
        m.bone('fingA_' + s, 'hand_' + s, knuckle(k))
        a0, a1, _ = FING_REST
        d = finger_dir(k, a0)
        m.bone('fingB_' + s, 'fingA_' + s, (d[0] * FING_L1, 0, d[2] * FING_L1))
        d = finger_dir(k, a0 + a1)
        m.bone('fingC_' + s, 'fingB_' + s, (d[0] * FING_L2, 0, d[2] * FING_L2))
        m.bone('thumb_' + s, 'hand_' + s, (k * 0.004 * HAND, 0.04 * HAND, 0.03 * HAND))
        m.bone('thigh_' + s, 'root', (k * SK['hipX'], Y_THIGH, 0))
        m.bone('shin_' + s, 'thigh_' + s, (0, -SK['thigh'], 0))
        m.bone('foot_' + s, 'shin_' + s, (0, -SK['shin'], 0))
    # the bake (lib/export.py): arms are carried half a turn from this pose, and a hand must not be shaded by the thigh beside it
    m.bake_turn = {n + s: k * SK['shX'] for s, k in SIDES for n in ('armU_', 'armF_')}
    m.bake_groups = [[n + s for n in ('hand_', 'fingA_', 'fingB_', 'fingC_', 'thumb_')] for s, _ in SIDES]


# ---- body ------------------------------------------------------------------------------------
# What a piece of cloth is, for the painter (kit Model.region): it decides where folds, seams and hems go.
REGION = dict(none=0, shirt=1, sleeve=2, leg=3, seat=4, band=5, drape=6, soft=7, pack=8, hem=9, lid=10)


def region(m, name):
    m.region = REGION[name]
    return m


# height, half width, front depth, back depth, centre z, boxiness: a waist, ribs, a chest that is fullest
# below the armpit, then shoulders sloping up to the root of the neck
TORSO = [(0.952, 0.171, 0.123, 0.119, 0.000, 2.3), (1.000, 0.166, 0.120, 0.114, 0.000, 2.3), (1.052, 0.163, 0.119, 0.110, 0.003, 2.3),
         (1.115, 0.179, 0.130, 0.116, 0.006, 2.4), (1.185, 0.204, 0.147, 0.126, 0.009, 2.5), (1.250, 0.220, 0.157, 0.134, 0.010, 2.5),
         (1.300, 0.224, 0.154, 0.138, 0.008, 2.45)]
YOKE = [(1.300, 0.224, 0.154, 0.138, 0.008, 2.45), (1.338, 0.221, 0.146, 0.137, 0.005, 2.4), (1.372, 0.203, 0.128, 0.127, 0.0, 2.3),
        (1.396, 0.158, 0.106, 0.110, -0.004, 2.2), (1.412, 0.110, 0.088, 0.092, -0.005, 2.1), (1.422, 0.084, 0.079, 0.080, -0.004, 2.0)]
Y_YOKE = YOKE[0][0]


def _sec(y, rx, rzf, rzb, cz, p, seg, grow=0.0):
    return ell(y, rx + grow, rzf + grow, cz=cz, seg=seg, p=p, rzb=rzb + grow)


def chest_z(y, x, back=False):
    """Depth of the chest's front (or back) surface at height y above the ground and x off the middle."""
    R = TORSO + YOKE[1:]
    y = min(max(y, R[0][0]), R[-1][0])
    for a, b in zip(R, R[1:]):
        if y <= b[0]: break
    t = (y - a[0]) / (b[0] - a[0])
    _, rx, rzf, rzb, cz, p = [a[i] + (b[i] - a[i]) * t for i in range(6)]
    f = max(0.0, 1 - min(1.0, abs(x) / rx) ** p) ** (1 / p)
    return cz - rzb * f if back else cz + rzf * f


def strap(m, pts, w, out=0.006, back=False, over=(), thick=0.0):
    """A flat strap lying on the chest through (x, y) points given in chest space; `over` carries it on down the back."""
    rows = []
    for i, (x, y) in enumerate(list(pts) + list(over)):
        bk = back or i >= len(pts)
        z = chest_z(Y_CHEST + y, x, bk) + (-out if bk else out)
        rows.append([(x - w / 2, y + (out if over and y > 0.26 else 0.0), z), (x + w / 2, y + (out if over and y > 0.26 else 0.0), z)])
    grid(m, rows, (0, 0.1, 0))


def panel(m, xs, ys, out=0.006, back=False, at=Y_CHEST):
    """A piece of cloth or leather lying on the chest (or back) over a grid of x and y (chest space): bibs, pockets, patches."""
    rows = [[(x, y, chest_z(at + y, x, back) + (-out if back else out)) for x in xs] for y in ys]
    return grid(m, rows, (0, ys[len(ys) // 2], 0))


def stand_collar(m, slot, texel=1.0, n=13, y0=1.416, h=0.036, gap=(0.17, 0.52)):
    """A standing band collar, open at the throat: two layers thick, its ends cut on a slant so it opens in a V."""
    cloth(m, slot, texel); region(m, 'band')
    secs = []
    for i in range(n):
        u = i / (n - 1)
        a = gap[0] + (2 * PI - 2 * gap[0]) * u
        e = max(0.0, 1 - min(u, 1 - u) * 9.0)                       # 1 at an end, 0 a little way round
        da = (gap[1] - gap[0]) * e * e * (1 if u < 0.5 else -1)     # the top edge is cut back from the throat

        def pt(ang, r, y):
            s, c = math.sin(ang), math.cos(ang)
            return (r * 1.04 * s, y - 0.007 * c, -0.004 + r * c)
        yt = y0 + h * (1 - 0.3 * e)
        secs.append([pt(a, 0.0855, y0), pt(a + da, 0.089, yt), pt(a + da, 0.080, yt + 0.001), pt(a, 0.074, y0 - 0.004)])
    wloft(m, secs, [('chest', 1.0)])
    region(m, 'none')


def torso(m, top='top', yoke='top2', seg=16, texel=1.0, lod=0, collar=None, side=None):
    """
    Shirt or jacket body from the belt to the neck: a waist, a chest, shoulders that slope. The yoke is a
    second layer lapped over the body with a turned edge, and (collar = a slot) a standing collar open at the throat.
    """
    with At(m, 'chest'):
        region(m, 'shirt')
        cloth(m, top, texel).mat(lod=lod)
        R = thin(TORSO, lod)
        n0 = len(m.F)
        wloft(m, [_sec(*r, seg) for r in R], [w_torso(r[0]) for r in R], close_start=False, close_end=False)
        if side:
            # a panel of another colour down each side, under the arm (side = its slot)
            for j, fi in enumerate(range(n0, len(m.F))):
                if (j % seg) * 4 // seg in (0, 2) and (j % seg) % (seg // 4) == seg // 4 - 1 or (j % seg) * 4 // seg in (1, 3) and (j % seg) % (seg // 4) == 0:
                    m.f_slot[fi] = SLOTS.index(side)
        cloth(m, yoke, texel)
        if lod == 2:
            R = YOKE[::2] + [YOKE[-1]]
            wloft(m, [_sec(*r, seg) for r in R], [('chest', 1.0)], close_start=False, close_end=True)
        else:
            y0 = YOKE[0]
            R = [(y0[0] - 0.015, *y0[1:], 0.0005), (y0[0] - 0.018, *y0[1:], 0.006), (y0[0], *y0[1:], 0.0065)]
            R += [(*r, 0.0065 * (1 - i / (len(YOKE) - 1))) for i, r in enumerate(YOKE)][1:]
            wloft(m, [_sec(*r[:6], seg, r[6]) for r in R], [('chest', 1.0)], close_start=False, close_end=not collar)
            if collar: stand_collar(m, collar, texel)
    region(m, 'none'); m.mat(lod=0)


def hem(m, slot='top', seg=16, texel=1.0, drop=0.925, flare=0.012, bone='hips'):
    """The tail of a shirt or jacket below the belt: a turned edge standing off the trousers."""
    with At(m, 'hips'):
        m.on(bone)
        cloth(m, slot, texel); region(m, 'hem')
        R = [(drop + 0.004, 0.176, 0.126, 0.128), (drop, 0.181 + flare, 0.131 + flare, 0.134 + flare), (drop + 0.03, 0.180 + flare * 0.6, 0.130 + flare * 0.6, 0.131 + flare * 0.6),
             (0.972, 0.174, 0.125, 0.121)]
        wloft(m, [ell(y, rx, rz, seg=seg, p=2.25, rzb=rb) for y, rx, rz, rb in R], [(bone, 1.0)], close_start=False, close_end=False)
    region(m, 'none'); m.on('hips')


def pelvis(m, slot='bottom', seg=16, texel=1.0, lod=0):
    with At(m, 'hips'):
        cloth(m, slot, texel).mat(lod=lod); region(m, 'seat')
        R = [(0.775, 0.055, 0.066, 0.070), (0.82, 0.148, 0.110, 0.122), (0.88, 0.177, 0.124, 0.135), (0.94, 0.177, 0.125, 0.129), (0.99, 0.166, 0.119, 0.114)]
        wloft(m, [ell(y, rx, rz, seg=seg, p=2.2, rzb=rb) for y, rx, rz, rb in R], [('hips', 1.0)])
    region(m, 'none'); m.mat(lod=0)


def belt(m, buckle_slot='steel', seg=16, glow=False, lod=0):
    with At(m, 'hips'):
        leather(m, 'leather', 0.5 if lod == 2 else 1.0).mat(lod=lod)
        R = [(0.964, 0.170, 0.122), (0.972, 0.1785, 0.1295), (1.016, 0.1775, 0.129), (1.024, 0.168, 0.12)]
        wloft(m, [ell(y, rx, rz, seg=seg, p=2.25) for y, rx, rz in R], [('hips', 1.0)], close_start=False, close_end=False)
        if lod == 2:
            m.mat(lod=0); m.on('hips')
            return
        # the buckle: a frame, the dark of its opening and a prong across it; the belt's tongue runs on through a keeper
        m.steel(slot=buckle_slot, texel=1.5)
        m.box(0.07, 0.062, 0.016, at=(0, 0.994, 0.131), bevel=0.007)
        if glow:
            m.glow(emit=0.9, texel=0.8)
            m.box(0.03, 0.026, 0.012, at=(0, 0.994, 0.139), bevel=0.003)
        else:
            m.fixed(0x241d19, surf='dark', texel=0.6)
            m.box(0.042, 0.036, 0.008, at=(0, 0.994, 0.1375), bevel=0)
            m.steel(slot=buckle_slot, texel=0.8)
            m.box(0.05, 0.009, 0.008, at=(0.002, 0.994, 0.1405), bevel=0)
        leather(m, 'leather', 0.8)
        m.box(0.012, 0.056, 0.012, at=(0.062, 0.994, 0.128), rot=(0, 0.42, 0), bevel=0)
        m.mat(lod=0)
        m.on('hips')


def neck(m, seg=12, lod=0):
    """The neck spreads into the shoulders under the collar, rises, leans forward and goes up inside the jaw; it turns with the head."""
    with At(m, 'chest'):
        skin(m, 0.5 if lod == 2 else 1.2).mat(lod=lod)
        R = [(1.398, 0.083, 0.078, -0.004, 0.0), (1.418, 0.066, 0.064, -0.004, 0.0), (1.44, 0.059, 0.058, 0.0, 0.3), (1.465, 0.056, 0.057, 0.006, 0.75),
             (1.49, 0.056, 0.058, 0.010, 1.0), (1.53, 0.054, 0.056, 0.012, 1.0)]
        if lod == 2: R = R[1::2]
        wloft(m, [ell(y, rx, rz, cz=cz, seg=seg) for y, rx, rz, cz, _ in R], [blend('chest', 'head', w) for *_, w in R], close_start=False, close_end=False)
    m.mat(lod=0)


def legs(m, slot='bottom', seg=10, texel=1.0, lod=0):
    """Trouser legs: a full thigh, a knee, a calf, and the cloth bunched where it goes into the boot."""
    for s, k in SIDES:
        U, F = 'thigh_' + s, 'shin_' + s
        with At(m, U):
            cloth(m, slot, texel).mat(lod=lod); region(m, 'leg')
            cx = k * SK['hipX']
            R = [(0.055, 0.062, 0.0), (0.0, 0.117, 0.0), (-0.10, 0.115, 0.002), (-0.21, 0.105, 0.004), (-0.31, 0.093, 0.004), (-0.385, 0.089, 0.006), (-0.44, 0.087, 0.0),
                 (-0.495, 0.092, -0.005), (-0.52, 0.094, -0.003), (-0.545, 0.084, 0.0), (-0.62, 0.07, 0.0)]
            if lod == 2: R = [R[0], R[1], R[3], R[5], R[8], R[10]]
            W = [blend(U, F, sm(-0.33, -0.45, y)) for y, *_ in R]
            wloft(m, [ell(Y_THIGH + y, r, r * 1.05, cx=cx + k * 0.006 * sm(-0.2, 0.05, y), cz=cz, seg=seg) for y, r, cz in R], W)
    region(m, 'none'); m.mat(lod=0)


def arms(m, sleeve='top', fore='skin', seg=10, texel=1.0, cuff=True, lod=0, cap=None):
    """
    Sleeve from the shoulder to the elbow, where it is rolled into a thick cuff, then the forearm: a deltoid
    cap, a biceps, the narrow of the elbow, the forearm's muscle below it and a flat wrist.
    The animation poses arm bones half a turn from this bind pose, so the biceps is modelled on -Z.
    """
    for s, k in SIDES:
        U, F = 'armU_' + s, 'armF_' + s
        cx = k * SK['shX']
        with At(m, U):
            cloth(m, sleeve, texel).mat(lod=lod); region(m, 'sleeve')
            R = [(0.052, 0.040, 0.0), (0.026, 0.085, 0.0), (-0.02, 0.097, 0.0), (-0.06, 0.096, -0.002), (-0.115, 0.090, -0.005), (-0.175, 0.083, -0.005),
                 (-0.23, 0.077, -0.002), (-0.275, 0.075, 0.002), (-0.315, 0.077, 0.0), (-0.35, 0.078, 0.0)]
            if lod == 2: R = [R[0], R[1], R[3], R[5], R[7], R[9]]
            W = [blend(U, F, sm(-0.225, -0.335, y)) for y, *_ in R]
            rings = [ell(Y_SHOULDER + y, r, r * 1.03, cx=cx, cz=cz, seg=seg) for y, r, cz in R]
            if cap:
                # the shoulder cap takes the yoke's colour, down to the seam
                c = 3 if lod != 2 else 2
                wloft(m, rings[c:], W[c:], close_start=False)
                cloth(m, cap, texel)
                wloft(m, rings[:c + 1], W[:c + 1], close_end=False)
            else:
                wloft(m, rings, W)
        with At(m, F):
            if cuff and lod != 2:
                # two turns of the sleeve, with the crease between them
                cloth(m, sleeve, texel); region(m, 'band')
                R = [(-0.336, 0.074), (-0.34, 0.0905), (-0.362, 0.094), (-0.369, 0.0905), (-0.374, 0.094), (-0.397, 0.0925), (-0.405, 0.07)]
                wloft(m, [ell(Y_SHOULDER + y, r, r, cx=cx, seg=seg) for y, r in R], [(F, 1.0)], close_start=False, close_end=False)
            region(m, 'sleeve')
            if fore:
                if fore == 'skin': skin(m, texel * (1.0 if lod == 2 else 1.3))
                else: cloth(m, fore, texel)
                R = [(-0.35, 0.060, 1.0), (-0.385, 0.069, 0.98), (-0.42, 0.072, 0.95), (-0.46, 0.066, 0.92), (-0.5, 0.055, 0.88), (-0.53, 0.046, 0.84), (-0.552, 0.039, 0.82), (-0.564, 0.03, 0.82)]
                if lod == 2: R = R[::3] + [R[-1]]
                wloft(m, [ell(Y_SHOULDER + y, r, r * f, cx=cx, seg=seg) for y, r, f in R], [(F, 1.0)])
    region(m, 'none'); m.mat(lod=0)


# (centre across the palm, first / second / third segment length, radius, how far the knuckle sits back)
FINGERS = [(0.0348, 0.040, 0.0245, 0.021, 0.0116, 0.003), (0.0116, 0.041, 0.027, 0.022, 0.012, 0.0),
           (-0.0116, 0.040, 0.025, 0.021, 0.0114, 0.002), (-0.0338, 0.034, 0.019, 0.0185, 0.0102, 0.007)]


def _tube(m, pts, weights, seg, squash=1.0):
    """A round, jointed tube through pts = [(centre, tangent, radius)], ending in a rounded tip. weights: one list per ring."""
    rings = []
    for c, t, r in pts:
        c = np.asarray(c, float); t = np.asarray(t, float); t = t / np.linalg.norm(t)
        up = np.array([0.0, 1.0, 0.0])
        u = np.cross(up, t); u = u / np.linalg.norm(u)
        v = np.cross(t, u)
        rings.append([tuple(c + r * (math.cos(2 * PI * i / seg) * u * squash + math.sin(2 * PI * i / seg) * v)) for i in range(seg)])
    rng = m.loft(rings)
    if m.weights is None: m.weights = {}
    for i, vtx in enumerate(rng): m.weights[vtx] = weights[i // seg]
    return rng


def hands(m, slot='skin', texel=1.25, seg=6):
    """
    Real hands in the hand frame (+Z knuckles, +Y thumb, the back of the hand toward +k X): a palm
    with a heel and a thumb muscle, four round fingers of three joints with knuckles, and a thumb.
    Fingers curl on fingA / fingB / fingC, the thumb on thumb; far away the fingers are one mitt.
    """
    a0, a1, a2 = FING_REST
    for s, k in SIDES:
        H_, A, Bn, C = 'hand_' + s, 'fingA_' + s, 'fingB_' + s, 'fingC_' + s

        def brush(lod=0):
            if slot == 'skin': skin(m, texel)
            else: leather(m, slot, texel)
            m.mat(lod=lod)
        m.on(H_); brush(1)
        m.push(scale=HAND)
        # palm: wrist, heel, the broad middle, the knuckle line
        P = [(-0.008, 0.012, 0.022, 0.0, 0.010), (0.004, 0.0155, 0.030, 0.002, 0.013), (0.026, 0.018, 0.041, 0.004, 0.017),
             (0.054, 0.0175, 0.0465, 0.001, 0.019), (0.076, 0.0165, 0.047, 0.0, 0.02), (0.088, 0.0145, 0.046, 0.0, 0.02), (0.096, 0.008, 0.041, 0.0, 0.02)]
        m.loft([ell_xy(z, rx, ry, cy=cy, cx=k * cx, seg=10, p=2.35) for z, rx, ry, cy, cx in P])
        # thumb muscle, and the pad under the roots of the fingers (an opening hand shows no gap there)
        m.sphere(0.0225, 6, 4, at=(k * 0.007, 0.033, 0.03), scale=(0.85, 1.0, 1.4))
        m.sphere(0.0125, 6, 4, at=(k * 0.0125, 0.001, 0.0845), scale=(0.95, 3.5, 1.25))
        # far away the hand is a mitt: palm and fingers, a box each
        m.box(0.032, 0.088, 0.1, at=(k * 0.019, 0.004, 0.044), bevel=0, lod=2)
        m.push(at=(k * 0.02, 0, 0.088), rot=(0, -k * (a0 + 0.2), 0))
        m.box(0.024, 0.088, 0.066, at=(0, 0, 0.026), bevel=0, lod=2)
        m.pop()
        m.pop()
        d1, d2, d3 = (np.asarray(finger_dir(k, a)) for a in (a0, a0 + a1, a0 + a1 + a2))
        z0 = np.array([0.0, 0.0, 1.0])
        for y, L1, L2, L3, r, back in FINGERS:
            K = np.array([k * 0.02, y, 0.088 - back]) * HAND
            r *= HAND; L1 *= HAND; L2 *= HAND; L3 *= HAND
            J1 = K + d1 * L1; J2 = J1 + d2 * L2
            e = 0.005 * HAND
            # two rings at each joint, so a bent knuckle stays round instead of pinching
            pts = [(K - z0 * 0.02 * HAND, z0, r * 0.98, [(H_, 1.0)]),
                   (K - z0 * e * 0.6, z0 * 0.7 + d1 * 0.3, r * 1.13, [(H_, 0.8), (A, 0.2)]), (K + d1 * e * 1.2, z0 * 0.3 + d1 * 0.7, r * 1.1, [(H_, 0.25), (A, 0.75)]),
                   (K + d1 * L1 * 0.55, d1, r * 0.97, [(A, 1.0)]),
                   (J1 - d1 * e, d1 * 0.7 + d2 * 0.3, r * 1.06, [(A, 0.75), (Bn, 0.25)]), (J1 + d2 * e, d1 * 0.3 + d2 * 0.7, r * 1.06, [(A, 0.25), (Bn, 0.75)]),
                   (J2 - d2 * e * 0.8, d2 * 0.7 + d3 * 0.3, r * 0.99, [(Bn, 0.75), (C, 0.25)]), (J2 + d3 * e * 0.8, d2 * 0.3 + d3 * 0.7, r * 0.99, [(Bn, 0.25), (C, 0.75)]),
                   (J2 + d3 * L3 * 0.62, d3, r * 0.88, [(C, 1.0)]), (J2 + d3 * L3 * 0.96, d3, r * 0.62, [(C, 1.0)]), (J2 + d3 * L3 * 1.06, d3, r * 0.25, [(C, 1.0)])]
            brush(1)
            _tube(m, [q[:3] for q in pts], [q[3] for q in pts], seg)
        # thumb: out of the muscle, forward and across the palm
        T = np.array([k * 0.004, 0.04, 0.03]) * HAND
        from lib.kit import rot_xyz
        from mathutils import Vector
        t1 = np.asarray(rot_xyz(-0.5, -k * 0.55, 0) @ Vector((0, 0, 1)))[:3]
        t2 = np.asarray(rot_xyz(-0.5, -k * 1.0, 0) @ Vector((0, 0, 1)))[:3]
        r = 0.0124 * HAND
        J = T + t1 * 0.031 * HAND
        pts = [(T - t1 * 0.008 * HAND, t1, r * 1.06), (T + t1 * 0.012 * HAND, t1, r), (J, t1 + t2, r * 1.04), (J + t2 * 0.014 * HAND, t2, r * 0.93),
               (J + t2 * 0.025 * HAND, t2, r * 0.7), (J + t2 * 0.03 * HAND, t2, r * 0.3)]
        Tn = 'thumb_' + s
        brush(1)
        _tube(m, pts, [[(H_, 0.5), (Tn, 0.5)]] + [[(Tn, 1.0)]] * 5, seg)
        m.mat(lod=0)
        m.on(H_)


def boots(m, slot='boots', cuff=('fixed', 0x8b939d), toe=None, welt=None, seg=10, texel=1.0, lod=0, strap=False):
    """Chunky boots: shaft with a folded cuff on the shin, the shoe on the foot, a thick sole."""
    for s, k in SIDES:
        S, Ft = 'shin_' + s, 'foot_' + s
        cx = k * SK['hipX']
        y_ankle = Y_THIGH - SK['thigh'] - SK['shin']
        with At(m, S):
            leather(m, slot, texel).mat(lod=lod)
            R = [(0.245, 0.076), (0.238, 0.096), (0.15, 0.093), (0.06, 0.087), (-0.01, 0.083)]
            if lod == 2: R = [(0.262, 0.08), (0.255, 0.104), (0.19, 0.1), (0.06, 0.087), (-0.01, 0.083)]      # far: shaft and cuff in one
            wloft(m, [ell(y_ankle + y, r, r * 1.04, cx=cx, cz=0.004, seg=seg) for y, r in R], [(S, 1.0)], close_start=False)
            if lod != 2:
                if cuff[0] == 'fixed': m.fixed(cuff[1], surf='leather', rough=0.7, texel=texel)
                else: leather(m, cuff[0], texel)
                R = [(0.185, 0.095), (0.196, 0.107), (0.25, 0.11), (0.265, 0.099), (0.257, 0.08)]
                wloft(m, [ell(y_ankle + y, r, r * 1.04, cx=cx, cz=0.004, seg=seg) for y, r in R], [(S, 1.0)], close_start=False, close_end=False)
            if strap and lod != 2:
                # a strap round the ankle, buckled on the outside
                leather(m, 'leather', texel * 0.7)
                R = [(0.078, 0.0885), (0.08, 0.0935), (0.108, 0.095), (0.11, 0.0905)]
                wloft(m, [ell(y_ankle + y, r, r * 1.04, cx=cx, cz=0.004, seg=seg) for y, r in R], [(S, 1.0)], close_start=False, close_end=False)
                m.steel(texel=0.7)
                m.box(0.014, 0.036, 0.034, at=(cx + k * 0.096, y_ankle + 0.094, 0.004), bevel=0)
        m.on(Ft)
        leather(m, slot, texel)
        fl = -SK['ankle'] + 0.026
        R = [(-0.098, 0.03, 0.03, -0.045), (-0.074, 0.066, 0.058, -0.03), (0.0, 0.076, 0.074, -0.012), (0.07, 0.078, 0.05, -0.034),
             (0.14, 0.081, 0.042, -0.044), (0.2, 0.072, 0.037, -0.05), (0.238, 0.034, 0.022, -0.058)]
        if lod == 2: R = R[::2]
        m.loft([ell_xy(z, rx, ry, cy=cy, seg=seg, p=2.4, flat=fl) for z, rx, ry, cy in R])
        if toe:
            if toe[0] == 'fixed': m.fixed(toe[1], surf='metal', metal=0.8, rough=0.45, texel=texel)
            else: m.steel(slot=toe[0], texel=texel)
            R = [(0.125, 0.079, 0.036, -0.047), (0.135, 0.086, 0.046, -0.044), (0.2, 0.077, 0.041, -0.05), (0.244, 0.036, 0.024, -0.058)]
            m.loft([ell_xy(z, rx, ry, cy=cy, seg=seg, p=2.4, flat=fl) for z, rx, ry, cy in R], close_start=False)
        if welt:
            m.mat(slot=welt, surf='rubber', metal=0.0, rough=0.8, emit=0.0, texel=0.8)
            m.box(0.168, 0.014, 0.335, at=(0, -SK['ankle'] + 0.034, 0.066), bevel=0.006)
        m.fixed(0x1c1d20, surf='rubber', rough=0.95, texel=0.8)
        m.box(0.162, 0.03, 0.33, at=(0, -SK['ankle'] + 0.015, 0.066), bevel=0 if lod == 2 else 0.011)
        if lod != 2: m.box(0.15, 0.022, 0.1, at=(0, -SK['ankle'] + 0.036, -0.04), bevel=0)
    m.mat(lod=0)


# ---- head ------------------------------------------------------------------------------------
def skull_point(dx, dy, dz, grow=0.0):
    """The smooth skull (no face) along unit direction d, relative to the neck joint, pushed out by `grow`."""
    x, y, z = H.skull_dir(dx, dy, dz, grow)
    return (x, y + HC, z)


def sphere_dirs(seg, rings):
    D = []
    for j in range(rings + 1):
        lat = -PI / 2 + PI * j / rings
        row = []
        for i in range(seg):
            lon = 2 * PI * i / seg
            row.append((math.cos(lat) * math.sin(lon), math.sin(lat), math.cos(lat) * math.cos(lon)))
        D.append(row)
    return D


def shell(m, seg, rings, keep, grow, **kw):
    """Part of the skull surface, pushed out by `grow`: hair caps, hats, hoods. keep(d) picks directions."""
    D = sphere_dirs(seg, rings)
    verts, ix = [], {}
    for j, row in enumerate(D):
        for i, d in enumerate(row):
            g = grow(d) if callable(grow) else grow
            ix[(j, i)] = len(verts)
            verts.append(skull_point(d[0], d[1], d[2], g if g else 1e-9))
    faces = []
    for j in range(rings):
        for i in range(seg):
            i2 = (i + 1) % seg
            q = [(j, i), (j, i2), (j + 1, i2), (j + 1, i)]
            if all(keep(D[a][b]) for a, b in q):
                faces.append(tuple(ix[c] for c in q))
    return m.mesh(verts, oriented(verts, faces, (0, HC, 0)), recalc=False, **kw)


def lift(V):
    return [(x, y + HC, z) for x, y, z in V]


def head(m, texel=2.4, ears=True, lod=0):
    """The skull and face (people/head.py), the inside of the mouth, and the ears."""
    m.on('head')
    skin(m, texel).mat(lod=lod)
    if lod == 2:
        V, F, _, _ = H.head_mesh(H.ROWS_FAR, H.COLS_FAR, slit=False)
        m.mesh(lift(V), F, recalc=False)
        m.mat(lod=0)
        return
    V, F, W, _ = H.head_mesh()
    rng = m.mesh(lift(V), F, recalc=False)
    if m.weights is None: m.weights = {}
    for v, w in zip(rng, W): m.weights[v] = w
    # behind the lips: the dark of the mouth and the upper teeth, seen when the jaw drops
    zl = H.face_z(0.0, H.Y_MOUTH)
    m.fixed(0x3a1513, surf='flat', rough=0.8, texel=0.5)
    m.box(0.07, 0.056, 0.004, at=(0, HC + H.Y_MOUTH - 0.008, zl - 0.027), bevel=0)
    m.fixed(0xf4efe4, surf='flat', rough=0.35, texel=0.6)
    m.box(0.048, 0.011, 0.005, at=(0, HC + H.Y_MOUTH - 0.0005, zl - 0.0165), bevel=0.002)
    if ears:
        for s, k in SIDES:
            m.on('ear_' + s); skin(m, texel * 0.75)
            V, F = H.ear_mesh(k)
            m.mesh(V, F, recalc=True)
    m.on('head')
    m.mat(lod=0)


def _sink(rows, k, lateral=False):
    out = []
    for row in rows:
        o = []
        for x, y, z in row:
            hx = k * H.EYE[0] + x; hy = H.EYE[1] + y
            dx = ((abs(hx) - H.EYE[0] - 0.002) / 0.03) ** 2; dy = ((hy - H.EYE[1] - 0.001) / 0.024) ** 2
            w = sm(1.0, 1.7, dx if lateral else dx + dy)
            zf = H.face_z(hx, hy) - H.EYE[2] - 0.0015
            o.append((x, y, z + (min(z, zf) - z) * w))
        out.append(o)
    return out


def eyes(m, texel=2.6, lod=0):
    """Eyeballs with iris, pupil and catchlights; an upper lid with a lash line that rolls shut; a lower lid."""
    r = EYE_R
    cap = lambda rr, angles, seg: m.lathe([(rr * math.sin(a), rr * math.cos(a)) for a in angles] + [(0.0, rr)], seg, rot=(PI / 2, 0, 0), cap=False)
    for s, k in SIDES:
        m.on('eye_' + s)
        if lod == 2:
            # far away an eye is a white almond with a dark centre
            m.fixed(0xf6f3ec, surf='eye', rough=0.25, texel=0.6, lod=2)
            m.sphere(0.021, 5, 3, at=(0, 0.0, r - 0.014), scale=(1.25, 0.85, 0.5))
            m.fixed(0x2a1c14, surf='eye', rough=0.2, texel=0.6, lod=2)
            m.sphere(0.012, 4, 2, at=(0, 0.0, r - 0.006), scale=(1, 1, 0.5))
            m.mat(lod=0)
            continue
        m.mat(lod=lod)
        m.fixed(0xf6f3ec, surf='eye', rough=0.25, texel=texel)
        cap(r, (1.15, 0.8, 0.5, 0.22), 10)
        m.mat(slot='iris', surf='eye', metal=0.0, rough=0.2, emit=0.0, texel=texel * 1.5)
        cap(r + 0.0006, (H.IRIS_A, H.IRIS_A * 0.55), 10)
        m.fixed(0x120d0c, surf='eye', rough=0.2, texel=texel)
        cap(r + 0.0011, (H.PUPIL_A, H.PUPIL_A * 0.5), 8)
        m.fixed(0xffffff, surf='glass', rough=0.2, emit=0.14, texel=0.5)
        m.sphere(0.0056, 5, 3, at=(0.0085, 0.0095, r - 0.0022))
        m.sphere(0.003, 4, 2, at=(-0.0075, -0.0085, r - 0.0012))
        # upper lid: a shell with a thick, dark leading edge; it rolls down over the eye
        m.on('lid_' + s)
        skin(m, texel * 0.55); region(m, 'lid')
        grid(m, _sink(H.lid_grid(k, True, H.LID_R), k, True), (0, 0, 0))
        region(m, 'none')
        m.fixed(0x1c1210, surf='flat', rough=0.6, texel=0.8)
        grid(m, H.lash_grid(k, H.LID_R + 0.0008), (0, 0, 0))
        # lower lid: still, with a lip that catches the light
        m.on('lidLo_' + s)
        skin(m, texel * 0.55)
        lo_r = H.LID_R - 0.0008
        region(m, 'lid')
        grid(m, _sink(H.lid_grid(k, False, lo_r, vs=(0.0, 0.2, 0.55, 1.0), back=1.9), k), (0, 0, 0))
        region(m, 'none')
        ts = [-1.3 + 2.6 * i / 10 for i in range(11)]
        grid(m, _sink([[H.ball(k * t, H.lid_edge(t, False) + 0.022, r + 0.0005) for t in ts], [H.ball(k * t, H.lid_edge(t, False), lo_r) for t in ts]], k), (0, 0, 0))
    m.mat(lod=0)


def brows(m, w=0.034, h=0.0155):
    """Eyebrows with a shape: full at the nose end, arched, tapering to a tail; they follow the brow ridge."""
    hair(m, 1.4)
    for s, k in SIDES:
        m.on('brow_' + s)
        rows = [[], [], []]
        n = 7
        for i in range(n):
            t = -1 + 2 * i / (n - 1)                         # inner end to tail
            x = BROW[0] + w * t
            y = BROW[1] + 0.005 * (1 - t * t) - 0.0045 * max(t, 0.0) ** 2 - 0.002 * max(-t, 0.0)
            th = h * (1.0 - 0.62 * max(t, 0.0) ** 1.4) * (0.7 if i == 0 else 0.22 if i == n - 1 else 1.0)
            for row, dy, dz in ((0, th * 0.5, 0.0012), (1, 0.0, 0.0055), (2, -th * 0.5, 0.0012)):
                yy = y + dy
                rows[row].append((k * (x - BROW[0]), yy - BROW[1], H.face_z(x, yy) + dz - BROW[2]))
        grid(m, rows, (0, 0, -0.08))


# ---- hair ------------------------------------------------------------------------------------
# Hair is a scalp with a clean hairline, and locks laid over it: tapered ribbons with a rounded back that
# overlap like roof tiles. A lock carries the painter's strand coordinates (metres across it and along it
# from the root) in place of the kit's primitive coordinates, so strands, the dark of its edges and the
# band of light across it are painted along the lock whichever way it lies.
STRAND_LOCK, STRAND_BEARD = 1.0, 3.0      # what a strand-mapped surface is (third number of its `tsz`)
CAP_A = [0.0, 0.2, 0.42, 0.64, 0.84, 1.0, 1.12, 1.22, 1.38, 1.46, 1.64, 1.84, 2.0, 2.25, 2.6, 2.9, PI]
CAP_A_FAR = [0.0, 0.5, 1.0, 1.3, 1.64, 2.1, 2.6, PI]


def hairline(a, fringe=0.42, nape=-0.52, burn=-0.1, ear=0.16):
    """
    Where hair starts at angle a round the head (0 = the face), as the height of a unit direction from the
    head's centre: across the forehead, back at the temple, down in front of the ear as a sideburn, up
    and over the ear, and down behind it to the nape.
    """
    K = [(0.0, fringe - 0.015), (0.42, fringe), (0.84, fringe + 0.04), (1.0, fringe - 0.03), (1.12, burn + 0.3), (1.22, burn), (1.38, burn),
         (1.46, ear), (1.84, ear), (2.0, nape + 0.27), (2.25, nape + 0.06), (2.6, nape), (PI, nape + 0.03)]
    return H._lerp_tab([k[0] for k in K], [k[1] for k in K], abs(a))


def cap(m, line, grow=0.011, edge=0.002, A=None, rows=(0.0, 0.1, 0.3, 0.58, 0.82), roll=0.0, **kw):
    """
    Part of the skull grown outward, with a clean lower edge: a scalp of hair, a cap, a hood, a bandana.
    line(a) is the height of the edge at each angle round the head; the surface runs from it to the crown,
    `grow` proud of the skull (a number, or grow(t, a) with t = 0 at the edge and 1 at the crown) and
    thinning to `edge` where it meets the skin. roll > 0 turns the edge under in a soft rim that thick.
    """
    A = A or CAP_A
    cols = A + [2 * PI - a for a in reversed(A[1:-1])]
    verts = []
    rows = list(rows)
    if roll: rows = [-1.0] + rows                       # the turned-under edge
    for t in rows:
        for a in cols:
            sa = a if a <= PI else a - 2 * PI
            y0 = line(sa)
            tt = max(t, 0.0)
            dy = y0 + (1 - y0) * tt
            c = math.sqrt(max(0.0, 1 - dy * dy))
            if t < 0: g = edge
            elif callable(grow): g = grow(tt, sa)
            else: g = (edge + roll) + (grow - edge - roll) * sm(0.0, 0.3, tt) if roll else edge + (grow - edge) * sm(0.0, 0.3, tt)
            x, y, z = skull_point(math.sin(a) * c, dy, math.cos(a) * c, g)
            if t < 0: y += 0.004
            verts.append((x, y, z))
    verts.append(skull_point(0, 1, 0, grow(1.0, 0.0) if callable(grow) else grow))
    n = len(cols); faces = []
    for j in range(len(rows) - 1):
        for i in range(n):
            i2 = (i + 1) % n
            faces.append((j * n + i, j * n + i2, (j + 1) * n + i2, (j + 1) * n + i))
    j = len(rows) - 1
    for i in range(n): faces.append((j * n + i, j * n + (i + 1) % n, len(verts) - 1))
    return m.mesh(verts, oriented(verts, faces, (0, HC, 0)), recalc=False, **kw)


def scalp(m, grow=0.011, texel=1.0, lod=0, **kw):
    hair(m, texel).mat(lod=lod)
    line = lambda a: hairline(a, **kw)
    if lod == 2: rng = cap(m, line, grow, A=CAP_A_FAR, rows=(0.0, 0.35, 0.75))
    else: rng = cap(m, line, grow)
    m.mat(lod=0)
    return rng


def strand_map(m, rng, across, along, kind, half_w, length, seed=0.0):
    """Give hair geometry the painter's strand coordinates: metres across the lock and along it from the root."""
    for v, a, l in zip(rng, across, along):
        m.v_tco[v] = (a, l, seed)
        m.v_tsz[v] = (half_w, max(length, 1e-4), kind)
    m.p_type[m.v_prim[rng[0]]] = 3


_LOCKS = [0]
LOCK = (0.72, 1.0, 0.9, 0.6, 0.07)       # a lock's width along its length: full just past the root, tapering to a point
BLUNT = (0.8, 1.0, 1.0, 0.95, 0.7)       # ... or cut square (a bob, a fringe)


def lockp(m, pts, nrm, w, t=None, prof=LOCK):
    """A lock of hair through centre points `pts` (root first), lying flat against the normals `nrm`."""
    P = [np.asarray(p, float) for p in pts]; n = len(P)
    t = w * 0.42 if t is None else t
    rings, across, along = [], [], []
    L = 0.0
    for i in range(n):
        if i: L += float(np.linalg.norm(P[i] - P[i - 1]))
        tan = P[min(i + 1, n - 1)] - P[max(i - 1, 0)]; tan = tan / max(np.linalg.norm(tan), 1e-9)
        nn = np.asarray(nrm[min(i, len(nrm) - 1)], float); nn = nn - tan * nn.dot(tan); nn = nn / max(np.linalg.norm(nn), 1e-9)
        side = np.cross(tan, nn)
        k = float(np.interp(i / (n - 1), np.linspace(0, 1, len(prof)), prof))
        ww, tt = w * k, t * (0.5 + 0.5 * k)
        rings.append([tuple(q) for q in (P[i] - side * ww, P[i] - side * ww * 0.5 + nn * tt, P[i] + side * ww * 0.5 + nn * tt, P[i] + side * ww, P[i] - nn * tt * 0.3)])
        across += [-ww, -ww * 0.5, ww * 0.5, ww, 0.0]; along += [L] * 5
    rng = m.loft(rings)
    _LOCKS[0] += 1
    strand_map(m, rng, across, along, STRAND_LOCK, w, L, float(_LOCKS[0] * 7 % 31))
    return rng


def _unit(d):
    d = np.asarray(d, float)
    return d / max(np.linalg.norm(d), 1e-9)


def lock(m, d0, d1, w, out=(0.002, 0.012), arch=0.012, tip=(0, 0, 0), n=5, t=None, prof=LOCK):
    """
    A lock lying on the head from direction d0 to d1 (from the head's centre), standing `arch` off the
    skull mid-way; `tip` carries its end on past the skull (a fringe over the brow, a flick, a spike).
    """
    a, b = _unit(d0), _unit(d1)
    pts, nrm = [], []
    for i in range(n):
        u = i / (n - 1)
        d = _unit(a + (b - a) * u)
        o = out[0] + (out[1] - out[0]) * u + arch * math.sin(u * PI) ** 0.8
        p = np.asarray(skull_point(d[0], d[1], d[2], o if abs(o) > 1e-9 else 1e-9)) + np.asarray(tip, float) * u * u
        pts.append(p); nrm.append(d)
    return lockp(m, pts, nrm, w, t, prof)


def _rand(i, j=0):
    """A repeatable 0..1 number."""
    x = math.sin(i * 127.1 + j * 311.7 + 1.3) * 43758.5453
    return x - math.floor(x)


def whorl(m, crown, rings, seed=0, sweep=0.0, keep=None, n=5):
    """
    Locks growing out of a crown the way hair does: each ring is (count, r0, r1, width, arch, lift, turn):
    locks rooted r0 radians from the crown reaching to r1, standing `arch` off the head, their tips lifted
    `lift` metres off it (tousled) and the ring turned `turn` radians. `sweep` combs every lock round the crown.
    keep(direction) can drop locks (those a hat would cover).
    """
    c = _unit(crown)
    e1 = _unit(np.cross(c, (0.0, 0.0, 1.0)) if abs(c[2]) < 0.9 else np.cross(c, (1.0, 0.0, 0.0)))
    e2 = np.cross(c, e1)
    at = lambda rho, phi: c * math.cos(rho) + (e1 * math.cos(phi) + e2 * math.sin(phi)) * math.sin(rho)
    for ri, (count, r0, r1, w, arch, lift, turn) in enumerate(rings):
        for j in range(count):
            q = seed * 13 + ri * 5 + j
            phi = turn + 2 * PI * (j + 0.35 * (_rand(q, 1) - 0.5)) / count
            reach = r1 * (0.9 + 0.2 * _rand(q, 2))
            d0 = at(r0, phi - sweep * 0.3); d1 = at(reach, phi + sweep * (0.6 + 0.5 * _rand(q, 3)))
            if keep and not keep(d1): continue
            tip = d1 * lift * (0.6 + 0.8 * _rand(q, 4))
            lock(m, d0, d1, w * (0.85 + 0.3 * _rand(q, 5)), arch=arch * (0.7 + 0.6 * _rand(q, 6)), tip=tip, n=n)


def on_skull(dx, dy, dz, out=0.0):
    n = math.sqrt(dx * dx + dy * dy + dz * dz)
    return np.asarray(skull_point(dx / n, dy / n, dz / n, out if out else 1e-9))


def face_grid(A, y_top, y_bot, rows, grow, drop=None, kind=STRAND_BEARD):
    """
    A mass of hair on the face (a beard, a moustache): a grid over the angles A round the head, from the clean
    line y_top(a) down to y_bot(a), `grow(a, v)` metres proud of the skin (v = 0 at the top edge, 1 at the
    bottom) and hanging `drop(a, v)` = (dy, dz) below it. Returns verts, faces, weights (as the skin under
    each point moves) and strand coordinates.
    """
    V, Wt, across, along = [], [], [], []
    e = 0.004
    for j in range(rows):
        v = j / (rows - 1)
        for a in A:
            aa = abs(a) if abs(a) > 1e-6 else 1e-6
            y = y_top(aa) + (y_bot(aa) - y_top(aa)) * v
            p = np.asarray(H.face_pt(a, y))
            # the skin's normal here, from its neighbours
            pu = np.asarray(H.face_pt(a + e * 4, y)) - np.asarray(H.face_pt(a - e * 4, y))
            pv = np.asarray(H.face_pt(a, y + e)) - np.asarray(H.face_pt(a, y - e))
            nn = np.cross(pu, pv); nn = nn / max(np.linalg.norm(nn), 1e-9)
            if nn.dot(p - np.array([0.0, y, 0.0])) < 0: nn = -nn
            q = p + nn * grow(aa, v)
            if drop:
                dy, dz = drop(aa, v)
                q = q + np.array([0.0, dy, dz])
            V.append((float(q[0]), float(q[1]), float(q[2])))
            Wt.append(H.weights(p[0], p[1], p[2], math.cos(a), False))
            across.append(a * 0.13); along.append(v * 0.09 - (dy if drop else 0.0))
    n = len(A)
    F = [(j * n + i, j * n + i + 1, (j + 1) * n + i + 1, (j + 1) * n + i) for j in range(rows - 1) for i in range(n - 1)]
    return V, oriented(V, F, (0.0, -0.05, 0.02)), Wt, across, along


# ---- face and skin painting ------------------------------------------------------------------
_SWATCH = None


def swatches():
    """
    Painted brush detail, generated once with the image tool (paint/swatches.prompt.txt) and kept
    as paint/swatches.png: four greyscale tiles (cloth, leather, hair, skin). Each comes back as
    detail around zero, with its own broad light and dark flattened out so it tiles.
    """
    global _SWATCH
    if _SWATCH is not None: return _SWATCH
    import os
    import bpy
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'paint', 'swatches.png')
    img = bpy.data.images.load(path)
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32); img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    g = px.reshape(h, w, 4)[::-1, :, :3].mean(axis=-1).astype(np.float64)       # top row first
    out = {}
    for name, (r, c) in (('cloth', (0, 0)), ('leather', (0, 1)), ('hair', (1, 0)), ('skin', (1, 1))):
        q = g[r * h // 2:(r + 1) * h // 2, c * w // 2:(c + 1) * w // 2]
        m = int(q.shape[0] * 0.06); q = q[m:-m, m:-m]                           # clear of the grid lines
        # flatten the broad gradient: divide by a heavy box blur of itself
        k = max(8, q.shape[0] // 6)
        blur = q
        for ax in (0, 1):
            pad = np.pad(blur, [(k, k) if i == ax else (0, 0) for i in (0, 1)], mode='reflect')
            cs = np.cumsum(pad, axis=ax)
            cs = np.concatenate([np.zeros_like(np.take(cs, [0], axis=ax)), cs], axis=ax)
            n = 2 * k + 1
            blur = (np.take(cs, range(n, cs.shape[ax]), axis=ax) - np.take(cs, range(0, cs.shape[ax] - n), axis=ax)) / n
        d = q / np.maximum(blur, 1e-3) - 1.0
        out[name] = np.clip(d / max(d.std(), 1e-4) * 0.13, -0.5, 0.5)                # the same strength whatever the tile's contrast
    _SWATCH = out
    return out


def tile(sw, u, v):
    """Mirror-repeat bilinear lookup: u, v in tiles."""
    h, w = sw.shape

    def fold(t, n):
        t = np.mod(t, 2.0); t = np.where(t > 1.0, 2.0 - t, t)
        return t * (n - 1)
    x = fold(u, w); y = fold(v, h)
    x0 = np.clip(np.floor(x).astype(np.int64), 0, w - 2); y0 = np.clip(np.floor(y).astype(np.int64), 0, h - 2)
    fx = x - x0; fy = y - y0
    return (sw[y0, x0] * (1 - fx) + sw[y0, x0 + 1] * fx) * (1 - fy) + (sw[y0 + 1, x0] * (1 - fx) + sw[y0 + 1, x0 + 1] * fx) * fy


def triplanar(sw, P, N, size):
    """A tile wrapped over a surface from three sides, blended by which way the surface faces."""
    w = np.abs(N) ** 4; w = w / np.maximum(w.sum(axis=-1, keepdims=True), 1e-6)
    Q = P / size
    return tile(sw, Q[..., 2], Q[..., 1]) * w[..., 0] + tile(sw, Q[..., 0], Q[..., 2]) * w[..., 1] + tile(sw, Q[..., 0], Q[..., 1]) * w[..., 2]


_PAINT = {}


def remember(m):
    """Keep what the painter needs from the model: which garment region each primitive is."""
    _PAINT['region'] = np.asarray(m.p_region, dtype=np.int32)
    return m


def people_post(rgba, gb, cover):
    """
    The hand-painted pass over a person. The generic painter knows surfaces; this knows a body and its
    clothes. Cloth is a soft even ground with no weave to see; on it go folds, each one a drawn stroke (a
    shadow under a soft ridge, tapering to nothing at both ends) placed where cloth gathers: the bend
    of the elbow, the armpit, the waist above the belt, behind the knee, the crotch, the stack over the
    boot. Then seams with their stitching, pockets, hems, and fading where cloth takes the wear. Hair is
    painted along each lock: strands, darker edges and roots, a band of light. Skin runs warm where it
    is lit and cool where it turns away. Everything is a multiplier on what the painter left, so palette
    tints still drive the colours.

    Nothing here may be a contour of a noise field (a threshold, or a sine, of noise): that draws rings
    and reads as wood grain. Noise is only ever used as a small direct value.
    """
    P = gb['pos'].astype(np.float64)
    N = gb['nor'].astype(np.float64)
    surf = np.rint(gb['ids'][..., 0]).astype(np.int32)
    tco = gb['tco'].astype(np.float64); tsz = gb['tsz'].astype(np.float64)
    ao_l = np.clip(gb['ao'][..., 1], 0, 1).astype(np.float64)
    pid = np.rint(gb['pinfo'][..., 0]).astype(np.int64); ptype = np.rint(gb['pinfo'][..., 1]).astype(np.int32)
    R = _PAINT.get('region')
    reg = R[np.clip(pid, 0, len(R) - 1)] if R is not None and len(R) else np.zeros(pid.shape, dtype=np.int32)
    x, y, z = P[..., 0], P[..., 1], P[..., 2]
    H_, W_ = surf.shape
    mul = np.ones((H_, W_, 3)); add = np.zeros((H_, W_))
    WARM = np.array([1.10, 1.0, 0.86]); COOL = np.array([0.90, 0.97, 1.08])

    def tone(w, c):
        nonlocal mul
        mul = mul * (1 + w[..., None] * (np.asarray(c) - 1))

    def value(w):
        nonlocal mul
        mul = mul * (1 + w)[..., None]
    cl = (surf == SURF['cloth']) | (surf == SURF['knit'])
    le = surf == SURF['leather']
    sk = surf == SURF['skin']
    hr = surf == SURF['hair']
    ang = np.arctan2(N[..., 2], N[..., 0])
    ty = np.clip(tco[..., 1] / np.maximum(tsz[..., 1], 1e-4), -1, 1)
    edge_m = (1 - np.abs(ty)) * tsz[..., 1]                       # metres from the garment's top or bottom edge
    from_bottom = (1 + ty) * tsz[..., 1]; from_top = (1 - ty) * tsz[..., 1]
    garment = tsz[..., 1] > 0.055
    front = N[..., 2] > 0.0

    # ---- cloth: an even ground, washed a little warmer and cooler -------------------------
    wash = fbm(P, 5.0, 3, 201) - 0.5
    dab = fbm(P * np.array([2.2, 1.0, 2.2]), 13.0, 2, 207) - 0.5
    wob = fbm(P, 9.0, 2, 211) - 0.5                               # keeps a drawn line from being ruler-straight
    value(cl * (0.10 * wash + 0.05 * dab))
    tone(cl * np.maximum(wash, 0) * 0.6, WARM)
    tone(cl * np.maximum(-wash, 0) * 0.6, COOL)

    dark = np.zeros((H_, W_)); lite = np.zeros((H_, W_)); line = np.zeros((H_, W_)); stitch = np.zeros((H_, W_))
    wrap = lambda a: (a + PI) % (2 * PI) - PI

    def fold_h(mask, u, v, uc, vc, half, w, tilt=0.0, sag=0.0, k=1.0, turn=False):
        """A crease running across at height vc, from uc - half to uc + half; turn = u is an angle round a limb."""
        nonlocal dark, lite
        du = wrap(u - uc) if turn else u - uc
        s = np.clip(du / half, -1, 1)
        dv = v - (vc + tilt * s + sag * (1 - s * s)) + 0.7 * w * wob
        taper = (1 - s * s) ** 0.8 * mask * k
        dark = dark + taper * np.exp(-(dv / w) ** 2)
        lite = lite + taper * np.exp(-((dv - 1.8 * w) / (1.4 * w)) ** 2)

    def fold_v(mask, u, v, uc, v0, v1, w, tilt=0.0, sag=0.0, k=1.0, turn=False, lit=1.0):
        """A fold running up and down from v0 to v1 at uc; `lit` = which side its ridge is on."""
        nonlocal dark, lite
        s = np.clip((v - (v0 + v1) * 0.5) / ((v1 - v0) * 0.5), -1, 1)
        du = u - (uc + tilt * s + sag * (1 - s * s))
        if turn: du = wrap(du)
        du = du + 0.7 * w * wob
        taper = (1 - s * s) ** 0.8 * mask * k
        dark = dark + taper * np.exp(-(du / w) ** 2)
        lite = lite + taper * np.exp(-((du - lit * 1.8 * w) / (1.4 * w)) ** 2)

    def seam(mask, d, stitches=None, off=0.007, pitch=0.011):
        """A sewn line where d (metres) is zero, and a row of stitches beside it, dashed along `stitches` (metres)."""
        nonlocal line, stitch
        line = np.maximum(line, mask * np.exp(-(d / 0.0022) ** 2))
        if stitches is not None:
            dash = np.sin(stitches * (2 * PI / pitch)) > -0.15
            stitch = np.maximum(stitch, mask * dash * (np.abs(np.abs(d) - off) < 0.0014))

    def box(mask, u, v, u0, u1, v0, v1):
        """Signed distance to a rectangle's outline (negative inside), for pockets and patches."""
        du = np.maximum(u0 - u, u - u1); dv = np.maximum(v0 - v, v - v1)
        return np.where(mask, np.maximum(du, dv), 1.0)

    Y_KNEE = Y_THIGH - SK['thigh']; Y_ELBOW = Y_SHOULDER - SK['upper']
    is_ = lambda name: cl & (reg == REGION[name])

    # ---- sleeves. An arm hangs half a turn from how it is modelled: th = 0 is its front in the game, +pi/2 its outside
    for k in (1, -1):
        cx = k * SK['shX']
        ms = is_('sleeve') & (x * k > 0)
        if not ms.any(): continue
        th = np.arctan2(-(x - cx) * k, -z)
        for dy, half, sg, w in ((0.03, 1.15, 0.010, 0.0065), (0.004, 1.35, 0.0, 0.0075), (-0.024, 1.1, -0.009, 0.006)):   # the bend of the elbow
            fold_h(ms, th, y, 0.1, Y_ELBOW + dy, half, w, sag=sg, turn=True)
        fold_h(ms, th, y, 2.6, Y_ELBOW - 0.035, 1.0, 0.006, turn=True, k=0.8)       # bunched above the cuff, round the back
        fold_h(ms, th, y, -2.2, Y_ELBOW - 0.05, 0.8, 0.0055, turn=True, k=0.7)
        fold_h(ms, th, y, -1.5, Y_SHOULDER - 0.085, 0.75, 0.007, tilt=-0.03, turn=True)   # pulled into the armpit
        fold_h(ms, th, y, -1.3, Y_SHOULDER - 0.135, 0.6, 0.006, tilt=-0.022, turn=True, k=0.8)
        fold_h(ms, th, y, 1.5, Y_SHOULDER - 0.115, 0.9, 0.007, sag=-0.012, turn=True, k=0.6)   # under the swell of the shoulder
        seam(ms & (y < Y_SHOULDER - 0.03), wrap(th + PI / 2) * 0.085)                 # the underarm seam
        value(0.07 * ms * np.exp(-((y - Y_ELBOW) / 0.05) ** 2) * smooth(0.3, 0.9, -np.cos(th)))      # the point of the elbow fades

    # ---- trouser legs: th = 0 front, +pi/2 the outside ------------------------------------
    for k in (1, -1):
        cx = k * SK['hipX']
        ml = is_('leg') & (x * k > 0)
        if not ml.any(): continue
        th = np.arctan2((x - cx) * k, z)
        for dy, half, sg in ((0.034, 1.05, 0.008), (0.002, 1.3, 0.0), (-0.03, 1.0, -0.008)):       # behind the knee
            fold_h(ml, th, y, PI, Y_KNEE + dy, half, 0.007, sag=sg, turn=True)
        fold_h(ml, th, y, 0.55, Y_KNEE + 0.055, 0.7, 0.008, tilt=0.012, turn=True, k=0.7)         # over and under the kneecap
        fold_h(ml, th, y, -0.55, Y_KNEE - 0.05, 0.75, 0.008, tilt=-0.012, turn=True, k=0.7)
        fold_h(ml, th, y, -0.55, Y_THIGH - 0.075, 1.0, 0.009, tilt=0.04, turn=True)               # out of the crotch
        fold_h(ml, th, y, -0.3, Y_THIGH - 0.14, 0.85, 0.008, tilt=0.03, turn=True, k=0.8)
        fold_h(ml, th, y, 0.4, 0.375, 1.3, 0.0065, sag=0.004, turn=True)                          # stacked on the boot
        fold_h(ml, th, y, 2.7, 0.398, 1.2, 0.0065, turn=True)
        fold_h(ml, th, y, -1.6, 0.42, 0.9, 0.006, turn=True, k=0.8)
        seam(ml, wrap(th - PI / 2) * 0.1, y)                                                      # outseam, stitched
        seam(ml, wrap(th + PI / 2) * 0.1)                                                         # inseam
        # a cargo pocket on the outside of the thigh: outline, a flap, its stitching
        u = wrap(th - PI / 2) * 0.1 - 0.012
        d = box(ml, u, y, -0.05, 0.05, Y_KNEE + 0.105, Y_KNEE + 0.235)
        line = np.maximum(line, np.exp(-(d / 0.0024) ** 2) * ml)
        stitch = np.maximum(stitch, ml * (np.abs(d + 0.007) < 0.0014) * (np.sin((u + y) * (2 * PI / 0.011)) > -0.15))
        flap = (d < 0) & (y > Y_KNEE + 0.19)
        line = np.maximum(line, ml * (d < 0) * np.exp(-((y - (Y_KNEE + 0.19 - 0.012 * (1 - (u / 0.05) ** 2))) / 0.0024) ** 2))
        value(0.05 * ml * (d < 0) + 0.03 * ml * flap)
        value(0.09 * ml * np.exp(-((y - Y_KNEE) / 0.06) ** 2) * smooth(0.3, 0.9, np.cos(th)))      # the knee fades

    # ---- the seat: fly, back pockets ------------------------------------------------------
    mt = is_('seat')
    seam(mt & front & (y > 0.85), x - 0.004)
    seam(mt & front & (y > 0.83), np.hypot(np.maximum(x - 0.004, 0), np.minimum(y - 0.865, 0)) - 0.03, y + x)   # the J of the fly
    for k in (1, -1):
        d = box(mt & ~front, x * k, y, 0.035, 0.125, 0.845, 0.935)
        line = np.maximum(line, np.exp(-(d / 0.0022) ** 2) * (mt & ~front))
        stitch = np.maximum(stitch, (mt & ~front) * (np.abs(d + 0.006) < 0.0013) * (np.sin((x + y) * (2 * PI / 0.011)) > -0.15))
    value(0.06 * mt * np.exp(-((y - 0.89) / 0.06) ** 2) * smooth(0.4, 0.9, -N[..., 2]))

    # ---- the shirt body: bloused over the belt, pulled toward the armpits -------------------
    mb = is_('shirt')
    if mb.any():
        for xc, top, tl in ((-0.142, 1.115, 0.004), (-0.098, 1.135, -0.005), (-0.052, 1.105, 0.004), (0.048, 1.12, -0.004), (0.094, 1.14, 0.005), (0.14, 1.11, -0.004)):
            fold_v(mb & front, x, y, xc, 1.012, top, 0.0055, tilt=tl, lit=1.0 if xc < 0 else -1.0)
            fold_v(mb & ~front, x, y, xc * 1.06 + 0.012, 1.012, top - 0.012, 0.0055, tilt=-tl, lit=1.0 if xc < 0 else -1.0, k=0.8)
        for k in (1, -1):
            for sel in (front, ~front):
                fold_h(mb & sel, x, y, k * 0.152, 1.215, 0.066, 0.007, tilt=k * 0.048)
                fold_h(mb & sel, x, y, k * 0.165, 1.168, 0.05, 0.006, tilt=k * 0.034, k=0.8)
            # side seam where the body turns the corner, stitched
            seam(mb & (x * k > 0.1) & (y < Y_YOKE - 0.02), N[..., 2] * 0.12, y)
            # a patch pocket with a flap on the left breast
        d = box(mb & front, x, y, 0.058, 0.136, 1.172, 1.262)
        line = np.maximum(line, np.exp(-(d / 0.0022) ** 2) * (mb & front))
        stitch = np.maximum(stitch, (mb & front) * (np.abs(d + 0.006) < 0.0013) * (np.sin((x + y) * (2 * PI / 0.011)) > -0.15))
        line = np.maximum(line, (mb & front) * (d < 0) * np.exp(-((y - (1.236 - 0.01 * (1 - ((x - 0.097) / 0.039) ** 2))) / 0.0022) ** 2))
        value(0.04 * (mb & front) * (d < 0))
        # form: a soft shadow under the chest and down the spine
        value(-0.07 * (mb & front) * np.exp(-((y - 1.158) / 0.028) ** 2) * smooth(0.19, 0.1, np.abs(x)))
        value(-0.08 * (mb & ~front) * np.exp(-(x / 0.02) ** 2) * smooth(1.02, 1.1, y) * smooth(1.36, 1.26, y))
        # the yoke's turned edge is stitched down
        stitch = np.maximum(stitch, mb * (np.abs(y - (Y_YOKE - 0.006)) < 0.0015) * (np.sin(ang * 64.0) > -0.15) * (y > Y_YOKE - 0.02))

    # ---- bands (collar, cuffs) and hems: a turned edge and its stitch row ------------------
    bd = is_('band') | is_('hem')
    stitch = np.maximum(stitch, bd * (np.abs(edge_m - 0.007) < 0.0014) * (np.sin(ang * 52.0) > -0.15) * (tsz[..., 1] > 0.012))
    mh = is_('hem')
    value(0.05 * mh * np.sin(ang * 9.0 + 1.0) * smooth(0.0, 0.04, from_top))                       # the tail flutes a little
    # ---- drapes (a cape, an apron's skirt): long flutes that deepen toward the hem -----------
    md = is_('drape')
    if md.any():
        deep = smooth(0.0, 0.25, from_top)
        for xc in (-0.21, -0.13, -0.055, 0.03, 0.105, 0.185):
            du = (x - xc - 0.02 * (y - 1.0)) + 0.01 * wob
            dark = dark + md * deep * 0.8 * np.exp(-(du / 0.011) ** 2)
            lite = lite + md * deep * np.exp(-((du - 0.024) / 0.016) ** 2)
        stitch = np.maximum(stitch, md * (np.abs(from_bottom - 0.012) < 0.0016) * (np.sin(x * (2 * PI / 0.012)) > -0.15))

    dark = np.clip(dark, 0, 1); lite = np.clip(lite, 0, 1)
    value(-0.30 * dark * cl)
    tone(dark * cl * 0.45, COOL)
    add += 0.075 * lite * cl * (1 - dark)
    value(-0.36 * line * cl)
    add += 0.10 * stitch * cl * (1 - line)

    # ---- leather: stitched edges, scuffs on the high points, dirt in the folds ------------
    brush = dab
    ew = np.abs(ty)
    belt_like = le & ~garment
    add += 0.12 * (belt_like & (ew > 0.60) & (ew < 0.74) & (np.sin(ang * 60.0) > -0.2))
    value(-0.20 * smooth(0.82, 1.0, ew) * belt_like)
    scuff = smooth(0.62, 0.8, fbm(P, 38.0, 3, 223)) * smooth(0.5, 0.9, ao_l)
    add += 0.07 * scuff * le
    value(-0.30 * (1 - ao_l) * le)
    tone(le * (1 - ao_l) * 0.6, (1.0, 0.9, 0.78))
    tone(le * brush * 1.2, WARM)

    # ---- skin: warm where the light lands, cool where it turns away, never one flat colour --
    up = N[..., 1] * 0.5 + 0.5
    tone(sk * (up - 0.5) * 0.9, WARM)
    tone(sk * np.maximum(0.5 - up, 0) * 0.8, COOL)
    tone(sk * (fbm(P, 22.0, 3, 227) - 0.5) * 0.3, (1.12, 0.98, 0.92))
    value(sk * 0.05 * (up - 0.5))

    # ---- hair ---------------------------------------------------------------------------------
    sw = swatches()
    # locks, beards: painted along the lock (tco = metres across, metres from the root, a seed; tsz = half width, length, kind)
    lk = hr & (ptype == 3)
    kind = np.rint(tsz[..., 2]).astype(np.int32)
    a = np.clip(tco[..., 0] / np.maximum(tsz[..., 0], 1e-4), -1, 1)
    v = np.clip(tco[..., 1] / np.maximum(tsz[..., 1], 1e-4), 0, 1)
    strands = tile(sw['hair'], tco[..., 0] / 0.085 + tco[..., 2] * 0.37, tco[..., 1] / 0.26 + tco[..., 2] * 0.23)
    lock_ = lk & (kind == 1)
    value(lock_ * (1.5 * strands - 0.20 * np.abs(a) ** 2.2 - 0.16 * (1 - smooth(0.0, 0.3, v)) + 0.05))
    add += lock_ * 0.15 * np.exp(-((v - 0.44 - 0.07 * a) / 0.13) ** 2) * (1 - np.abs(a) ** 3) * (0.6 + 3.0 * np.maximum(strands, 0))
    tone(lock_ * smooth(0.55, 1.0, v) * 0.3, WARM)
    beard = lk & (kind == 3)
    value(beard * (1.7 * strands - 0.10 * smooth(0.2, 1.0, v)))
    add += beard * 0.05 * np.exp(-((v - 0.4) / 0.2) ** 2) * (0.5 + 3.0 * np.maximum(strands, 0))
    # scalp, buns, brows: strand groups falling from the crown, and a band of light across them
    cp = hr & ~lk
    Q = P - np.array([0.0, Y_NECK + HC, 0.0])
    r = np.maximum(np.linalg.norm(Q, axis=-1), 1e-4)
    theta = np.arccos(np.clip(Q[..., 1] / r, -1, 1)); phi = np.arctan2(Q[..., 0], Q[..., 2])
    C = np.stack([np.sin(phi) * 7.0, np.cos(phi) * 7.0, theta * 0.7 + r * 1.5], axis=-1)
    clump = fbm(C, 1.0, 3, 231)
    value(cp * (0.22 * (clump - 0.5) + 1.3 * tile(sw['hair'], phi * (6.0 / (2 * PI)), (theta * HR + (r - HR)) / 0.24)))
    out_facing = np.clip(np.sum(N * (Q / r[..., None]), axis=-1), 0, 1)
    ring = np.exp(-((theta - (0.95 + 0.3 * (clump - 0.5))) / 0.13) ** 2) * smooth(0.15, 0.7, out_facing)
    add += cp * ring * 0.12
    value(-0.14 * cp * smooth(1.2, 2.2, theta) * (1 - out_facing))

    # ---- painted brush detail on leather and skin (cloth takes none: a tiled swatch shows as a pattern) --
    value(le * 0.8 * triplanar(sw['leather'], P, N, 0.2))
    value(sk * 0.28 * triplanar(sw['skin'], P, N, 0.25))

    out = rgba.copy()
    painted = (cl | le | sk | hr)[..., None]
    out[..., :3] = np.where(painted, np.clip(out[..., :3] * mul + add[..., None] * mul, 0, 1), out[..., :3])
    return out


def face_post(rgba, gb, cover):
    """Paint what the generic painter cannot know: flush, lips, nostrils, the lid crease, iris detail."""
    P = gb['pos'].astype(np.float64)
    N = gb['nor'].astype(np.float64)
    slot = np.rint(gb['ids'][..., 1]).astype(np.int32)
    out = rgba.copy()
    hc = np.array([0.0, Y_NECK + HC, 0.0])
    Q = P - hc
    qx, qy = Q[..., 0], Q[..., 1]
    sk = (slot == SLOTS.index('skin')) & (Q[..., 2] > 0.02) & (np.abs(qy) < 0.2) & (np.abs(qx) < 0.17)
    mul = np.ones(P.shape[:2] + (3,))

    def blob(cx, cy, rx, ry):
        return np.exp(-(((qx - cx) / rx) ** 2 + ((qy - cy) / ry) ** 2))

    def tint(w, c):
        nonlocal mul
        mul = mul * (1 - w[..., None] * (1 - np.asarray(c)))
    ey = H.EYE[1]
    ao = np.clip(gb['ao'][..., 0], 0, 1).astype(np.float64)
    shade = np.stack([0.62 + 0.38 * ao, 0.40 + 0.60 * ao, 0.36 + 0.64 * ao], axis=-1) * (0.72 + 0.28 * ao[..., None])     # what paint.py put on skin
    relief = np.zeros(P.shape[:2])
    for k in (1, -1): relief = np.maximum(relief, blob(k * (H.EYE[0] + 0.006), ey - 0.006, 0.068, 0.056))
    # the lids are shells the bake does not shade, so the skin of the orbit round them is brought to
    # the lids' own flat tone (not merely un-shaded: the painter's wear and grime follow the bake too)
    Rg = _PAINT.get('region')
    if Rg is not None:
        pid = np.rint(gb['pinfo'][..., 0]).astype(np.int64)
        lidm = (Rg[np.clip(pid, 0, len(Rg) - 1)] == REGION['lid']) & (slot == SLOTS.index('skin'))
        if lidm.sum() > 16:
            flat = np.median(out[..., :3][lidm], axis=0)
            w = (np.clip(relief * 1.9, 0, 1) * (sk & ~lidm))[..., None]
            out[..., :3] = out[..., :3] * (1 - w) + flat * w
    else:
        mul = mul * shade ** (-1.0 * np.clip(relief * 1.9, 0, 1))[..., None]
    for k in (1, -1):
        ex = k * H.EYE[0]
        tint(0.8 * blob(k * 0.088, -0.062, 0.036, 0.026), (1.06, 0.86, 0.82))                # cheek flush: redder, not darker
        tint(0.5 * blob(k * 0.098, -0.034, 0.03, 0.016), (1.06, 1.03, 0.97))                 # cheekbone light
        tint(0.3 * blob(ex, ey + 0.008, 0.044, 0.03), (0.94, 0.86, 0.84))                    # orbit
        tint(0.6 * blob(ex, ey + 0.027, 0.036, 0.007), (0.76, 0.64, 0.64))                   # lid crease
        tint(0.5 * blob(k * 0.0165, -0.04, 0.005, 0.02), (0.82, 0.71, 0.69))                 # the side of the nose
        tint(0.85 * blob(k * 0.0092, -0.0632, 0.0046, 0.0034) * (N[..., 1] < 0.2), (0.45, 0.32, 0.30))   # nostril
        tint(0.4 * blob(k * 0.0225, -0.058, 0.0035, 0.009), (0.78, 0.66, 0.64))              # crease round the wing
    tint(0.55 * blob(0, -0.05, 0.017, 0.013), (1.0, 0.84, 0.79))                             # nose tip runs warm
    tint(0.45 * blob(0, -0.022, 0.006, 0.026), (1.07, 1.05, 1.0))                            # light down the bridge
    tint(0.5 * blob(0, 0.075, 0.07, 0.035), (1.05, 1.03, 0.98))                              # forehead light
    tint(0.7 * np.clip((-qy - 0.118) / 0.04, 0, 1) * np.clip(-N[..., 1] * 2.0, 0, 1), (0.84, 0.82, 0.9))   # under the jaw turns cool
    tint(0.6 * blob(0, -0.069, 0.016, 0.0055), (0.72, 0.58, 0.56))                           # under the nose
    tint(0.5 * blob(0.003, -0.046, 0.006, 0.005), (1.16, 1.13, 1.08))                        # the light on its tip
    tint(0.4 * blob(0, -0.119, 0.026, 0.007), (0.84, 0.74, 0.72))                            # under the lower lip
    # lips: a shaped upper lip with its bow, a fuller lower lip, the line between them
    ym = H.Y_MOUTH
    hu = 0.0118 * np.clip(1 - (qx / 0.0345) ** 2, 0, 1) ** 0.8 * (1 - 0.16 * np.exp(-(qx / 0.006) ** 2))
    hl = 0.0138 * np.clip(1 - (qx / 0.031) ** 2, 0, 1) ** 0.7
    lip_u = smooth(0.0, 0.0025, ym + hu - qy) * (qy >= ym - 1e-4)
    lip_l = smooth(0.0, 0.0025, qy - (ym - hl)) * (qy < ym + 1e-4)
    tint(0.8 * lip_u, (0.80, 0.50, 0.49))
    tint(0.72 * lip_l, (0.88, 0.57, 0.54))
    tint(0.3 * blob(0, ym - 0.008, 0.012, 0.003), (1.12, 1.1, 1.08))                         # the wet light on the lower lip
    tint(0.75 * np.exp(-((qy - ym) / 0.0016) ** 2) * (np.abs(qx) < 0.036), (0.42, 0.26, 0.26))
    for k in (1, -1):
        tint(0.5 * blob(k * 0.036, ym, 0.004, 0.004), (0.6, 0.45, 0.44))                     # the corners
    # layers: stubble shades the jaw and upper lip, fading out at its edges; age draws its lines
    col = gb['col']
    mark = lambda c: (np.abs(col - np.asarray([((c >> 16) & 255) / 255.0, ((c >> 8) & 255) / 255.0, (c & 255) / 255.0])).max(axis=-1) < 0.006) & (slot == SLOTS.index('skin'))
    stub = mark(MARK_STUBBLE); lines = mark(MARK_LINES)
    aa = np.arctan2(np.abs(qx), Q[..., 2])
    jaw_y = -0.118 + 0.085 * smooth(0.25, 1.35, aa)                 # the jaw line, rising from the chin to the ear
    dens = smooth(0.03, 0.0, qy - jaw_y) * smooth(1.5, 1.15, aa)
    dens = np.maximum(dens, 0.9 * np.exp(-((qy + 0.079) / 0.0075) ** 2) * smooth(0.042, 0.026, np.abs(qx)))    # upper lip
    dens = np.maximum(dens, 0.8 * np.exp(-((qy + 0.128) / 0.016) ** 2) * smooth(0.04, 0.02, np.abs(qx)))       # chin
    grain = fbm(P, 420.0, 2, 241)
    k_st = dens * (0.30 + 0.34 * grain)
    mul_s = mul * (1 - np.clip(k_st, 0, 1)[..., None] * (1 - np.array([0.74, 0.74, 0.80])))
    out[..., :3] = np.where(stub[..., None], np.clip(out[..., :3] * mul_s, 0, 1), out[..., :3])

    def stroke(x0, y0, x1, y1, w, sag=0.0):
        """A soft dark line from (x0, y0) to (x1, y1) on both sides of the face, bowed by `sag`."""
        ax = np.abs(qx)
        t = np.clip(((ax - x0) * (x1 - x0) + (qy - y0) * (y1 - y0)) / ((x1 - x0) ** 2 + (y1 - y0) ** 2), 0, 1)
        bow = sag * np.sin(t * PI)
        d = np.hypot(ax - (x0 + (x1 - x0) * t), qy - (y0 + (y1 - y0) * t) - bow)
        return np.exp(-(d / w) ** 2) * np.sin(np.clip(t, 0.02, 0.98) * PI) ** 0.5
    crease = np.zeros(P.shape[:2])
    for y0, half, sag in ((0.064, 0.062, 0.004), (0.08, 0.07, 0.005), (0.097, 0.058, 0.004)):
        crease = np.maximum(crease, 0.75 * stroke(0.0, y0, half, y0 - 0.004, 0.0016, sag) + 0.75 * stroke(-0.001, y0, 0.012, y0, 0.0016))
    crease = np.maximum(crease, stroke(0.023, -0.05, 0.045, -0.1, 0.002, 0.004))                # nose to mouth
    for dy in (0.012, 0.002, -0.009):
        crease = np.maximum(crease, 0.8 * stroke(0.096, -0.011 + dy * 0.3, 0.118, -0.011 + dy * 1.4, 0.0013))   # crow's feet
    crease = np.maximum(crease, 0.7 * stroke(0.038, -0.034, 0.088, -0.036, 0.0018, -0.006))     # under the eye
    crease = np.maximum(crease, 0.6 * stroke(0.012, 0.04, 0.014, 0.062, 0.0015))                # between the brows
    mul_l = mul * (1 - np.clip(crease, 0, 1)[..., None] * (1 - np.array([0.66, 0.54, 0.52])))
    out[..., :3] = np.where(lines[..., None], np.clip(out[..., :3] * mul_l, 0, 1), out[..., :3])
    sk = sk & ~stub & ~lines
    out[..., :3] = np.where(sk[..., None], np.clip(out[..., :3] * mul, 0, 1), out[..., :3])
    nk = (slot == SLOTS.index('skin')) & (np.abs(qx) < 0.085) & (qy < -0.1) & (qy > -0.24) & (np.abs(Q[..., 2]) < 0.09)
    lift_n = shade ** (-0.6 * np.clip((-0.1 - qy) / 0.05, 0, 1))[..., None]
    out[..., :3] = np.where(nk[..., None], np.clip(out[..., :3] * lift_n, 0, 1), out[..., :3])

    # eyes: limbal ring, radial fibres and a lit lower crescent on the iris; lid shadow on the white
    ir = slot == SLOTS.index('iris')
    skin_px = slot == SLOTS.index('skin')
    for k in (1, -1):
        e = hc + np.array([k * H.EYE[0], H.EYE[1], H.EYE[2]])
        D = P - e
        # the lids bake unshaded (they slide over the face): give them the tone of the orbit they sit in
        rad = np.linalg.norm(D, axis=-1); dxy = np.hypot(D[..., 0], D[..., 1])
        lidm = skin_px & (np.abs(rad - H.LID_R) < 0.0016) & (D[..., 2] > -0.02)
        rim = skin_px & ~lidm & (dxy > 0.031) & (dxy < 0.04) & (D[..., 2] > 0.01) & (rad < 0.06) & cover
        if lidm.any() and rim.any():
            ratio = (out[..., :3][rim].mean(axis=0) / np.maximum(out[..., :3][lidm & cover].mean(axis=0), 1e-3)) ** 0.7
            fall = 1 - 0.1 * np.clip(dxy / 0.03, 0, 1)                    # a touch lighter on the swell of the lid
            out[..., :3] = np.where(lidm[..., None], np.clip(out[..., :3] * ratio * fall[..., None], 0, 1), out[..., :3])
        near = (np.linalg.norm(D, axis=-1) < EYE_R + 0.004)
        rr = np.sqrt(D[..., 0] ** 2 + D[..., 1] ** 2) / (EYE_R * math.sin(H.IRIS_A))
        ang = np.arctan2(D[..., 1], D[..., 0])
        fib = 0.9 + 0.1 * np.sin(ang * 23.0) * np.sin(ang * 7.0 + 1.3)
        v = (0.5 + 0.8 * np.clip(rr, 0, 1) ** 1.5) * fib
        v = v * (1 - 0.6 * np.clip((rr - 0.8) / 0.2, 0, 1))                                   # dark rim
        v = v * (0.62 + 0.62 * np.clip(-D[..., 1] / (EYE_R * 0.3) * 0.5 + 0.5, 0, 1))         # brighter below
        m_ = ir & near
        out[..., :3] = np.where(m_[..., None], np.clip(0.7 * v, 0, 1)[..., None], out[..., :3])
        wh = (slot == SLOTS.index('fixed')) & near & (np.rint(gb['ids'][..., 0]).astype(np.int32) == 10) & (rr > 1.0)
        sh = 1 - 0.42 * np.clip((D[..., 1] - 0.002) / 0.014, 0, 1) - 0.1 * np.clip(rr - 1.3, 0, 1)
        out[..., :3] = np.where(wh[..., None], out[..., :3] * sh[..., None] * np.array([0.97, 0.98, 1.0]), out[..., :3])
    return out
