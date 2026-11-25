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


# ---- body ------------------------------------------------------------------------------------
TORSO = [(0.952, 0.170, 0.124, 0.0), (1.0, 0.165, 0.120, 0.0), (1.055, 0.159, 0.116, 0.002), (1.12, 0.176, 0.126, 0.005),
         (1.20, 0.204, 0.140, 0.009), (1.285, 0.216, 0.148, 0.010)]
YOKE = [(1.285, 0.216, 0.148, 0.010), (1.33, 0.218, 0.146, 0.007), (1.375, 0.202, 0.130, 0.002), (1.405, 0.152, 0.108, -0.002),
        (1.426, 0.104, 0.088, -0.004), (1.438, 0.078, 0.076, -0.004)]


def chest_z(y, x, back=False):
    """Depth of the chest's front (or back) surface at height y above the ground and x off the middle."""
    R = TORSO + YOKE[1:]
    y = min(max(y, R[0][0]), R[-1][0])
    for a, b in zip(R, R[1:]):
        if y <= b[0]: break
    t = (y - a[0]) / (b[0] - a[0])
    _, rx, rz, cz = [a[i] + (b[i] - a[i]) * t for i in range(4)]
    f = max(0.0, 1 - min(1.0, abs(x) / rx) ** 2.3) ** (1 / 2.3)
    return cz - rz * 0.9 * f if back else cz + rz * f


def strap(m, pts, w, out=0.006, back=False, over=()):
    """A flat strap lying on the chest through (x, y) points given in chest space; `over` carries it on down the back."""
    rows = []
    for i, (x, y) in enumerate(list(pts) + list(over)):
        bk = back or i >= len(pts)
        z = chest_z(Y_CHEST + y, x, bk) + (-out if bk else out)
        rows.append([(x - w / 2, y + (out if over and y > 0.26 else 0.0), z), (x + w / 2, y + (out if over and y > 0.26 else 0.0), z)])
    grid(m, rows, (0, 0.1, 0))


def torso(m, top='top', yoke='top2', seg=16, texel=1.0, lod=0, collar=None):
    """
    Shirt or jacket body from the belt to the neck: narrow at the waist, broad across the chest,
    a yoke that slopes up from the shoulders, and (collar = a slot) a standing collar the neck sits in.
    """
    with At(m, 'chest'):
        cloth(m, top, texel).mat(lod=lod)
        R = thin(TORSO, lod)
        wloft(m, [ell(y, rx, rz, cz=cz, seg=seg, p=2.3, rzb=rz * 0.9) for y, rx, rz, cz in R], [w_torso(r[0]) for r in R], close_start=False, close_end=False)
        cloth(m, yoke, texel)
        R = YOKE if lod != 2 else YOKE[::2] + [YOKE[-1]]
        wloft(m, [ell(y, rx, rz, cz=cz, seg=seg, p=2.3, rzb=rz * 0.9) for y, rx, rz, cz in R], [('chest', 1.0)], close_start=False, close_end=lod == 2 or not collar)
        if collar and lod != 2:
            # up the outside, over the lip and down the inside, so there is no flat cap round the neck
            cloth(m, collar, texel)
            R = [(1.434, 0.081, 0.079, 0.0), (1.452, 0.079, 0.077, -0.008), (1.474, 0.076, 0.075, -0.012), (1.476, 0.07, 0.069, -0.012), (1.44, 0.066, 0.066, -0.004), (1.40, 0.066, 0.066, 0.0)]
            wloft(m, [ell(y, rx, rz, cz=0.0, seg=seg, p=2.1, tilt=t) for y, rx, rz, t in R], [('chest', 1.0)], close_start=False, close_end=False)
    m.mat(lod=0)


def pelvis(m, slot='bottom', seg=16, texel=1.0, lod=0):
    with At(m, 'hips'):
        cloth(m, slot, texel).mat(lod=lod)
        R = [(0.772, 0.06, 0.07), (0.82, 0.15, 0.112), (0.88, 0.176, 0.126), (0.94, 0.178, 0.127), (0.99, 0.166, 0.119)]
        wloft(m, [ell(y, rx, rz, seg=seg, p=2.2) for y, rx, rz in R], [('hips', 1.0)])
    m.mat(lod=0)


def belt(m, buckle_slot='steel', seg=16, glow=False, lod=0):
    with At(m, 'hips'):
        leather(m, 'leather', 0.5 if lod == 2 else 1.0).mat(lod=lod)
        R = [(0.966, 0.169, 0.121), (0.976, 0.1765, 0.1275), (1.014, 0.1755, 0.127), (1.024, 0.168, 0.12)]
        wloft(m, [ell(y, rx, rz, seg=seg, p=2.2) for y, rx, rz in R], [('hips', 1.0)], close_start=False, close_end=False)
        if lod == 2:
            m.mat(lod=0); m.on('hips')
            return
        m.steel(slot=buckle_slot, texel=1.4)
        m.box(0.064, 0.056, 0.02, at=(0, 0.995, 0.128), bevel=0.008)
        if glow:
            m.glow(emit=0.9, texel=0.8)
            m.box(0.026, 0.022, 0.012, at=(0, 0.995, 0.139), bevel=0.003)
        else:
            m.fixed(0x2a2420, surf='dark', texel=0.6)
            m.box(0.03, 0.026, 0.012, at=(0, 0.995, 0.136), bevel=0.003)
        m.mat(lod=0)
        m.on('hips')


def neck(m, seg=12, lod=0):
    """The neck rises out of the collar, leans forward and goes up inside the jaw; it turns with the head."""
    with At(m, 'chest'):
        skin(m, 0.5 if lod == 2 else 1.2).mat(lod=lod)
        R = [(1.385, 0.064, 0.062, -0.006, 0.0), (1.42, 0.059, 0.058, 0.0, 0.25), (1.455, 0.056, 0.057, 0.006, 0.7), (1.49, 0.056, 0.058, 0.010, 1.0), (1.53, 0.054, 0.056, 0.012, 1.0)]
        if lod == 2: R = R[::2]
        wloft(m, [ell(y, rx, rz, cz=cz, seg=seg) for y, rx, rz, cz, _ in R], [blend('chest', 'head', w) for *_, w in R], close_start=False, close_end=False)
    m.mat(lod=0)


def legs(m, slot='bottom', seg=10, texel=1.0, lod=0):
    for s, k in SIDES:
        U, F = 'thigh_' + s, 'shin_' + s
        with At(m, U):
            cloth(m, slot, texel).mat(lod=lod)
            cx = k * SK['hipX']
            R = [(0.055, 0.062), (0.0, 0.114), (-0.12, 0.110), (-0.26, 0.097), (-0.345, 0.089), (-0.39, 0.087), (-0.435, 0.088), (-0.53, 0.084), (-0.63, 0.072)]
            R = thin(R, lod)
            W = [blend(U, F, sm(-0.33, -0.45, y)) for y, _ in R]
            wloft(m, [ell(Y_THIGH + y, r, r * 1.05, cx=cx + k * 0.006 * sm(-0.2, 0.05, y), cz=0.004 if -0.5 < y < -0.2 else 0.0, seg=seg) for y, r in R], W)
    m.mat(lod=0)


def arms(m, sleeve='top', fore='skin', seg=10, texel=1.0, cuff=True, lod=0, cap=None):
    """
    Sleeve from the shoulder to below the elbow (rolled cuff), then the forearm: a deltoid cap, a
    biceps, a narrow elbow, the forearm's muscle below it and a flat wrist.
    The animation poses arm bones half a turn from this bind pose, so the biceps is modelled on -Z.
    """
    for s, k in SIDES:
        U, F = 'armU_' + s, 'armF_' + s
        cx = k * SK['shX']
        with At(m, U):
            cloth(m, sleeve, texel).mat(lod=lod)
            R = [(0.068, 0.044, 0.0), (0.032, 0.089, 0.0), (-0.02, 0.098, 0.0), (-0.085, 0.091, -0.003), (-0.15, 0.081, -0.006), (-0.205, 0.076, -0.004),
                 (-0.245, 0.069, 0.0), (-0.28, 0.066, 0.003), (-0.315, 0.07, 0.0), (-0.365, 0.072, 0.0)]
            R = thin(R, lod)
            W = [blend(U, F, sm(-0.225, -0.335, y)) for y, *_ in R]
            rings = [ell(Y_SHOULDER + y, r, r * 1.03, cx=cx, cz=cz, seg=seg) for y, r, cz in R]
            if cap:
                # the shoulder cap takes the yoke's colour, down to the seam
                c = 3 if lod != 2 else 1
                wloft(m, rings[c:], W[c:], close_start=False)
                cloth(m, cap, texel)
                wloft(m, rings[:c + 1], W[:c + 1], close_end=False)
            else:
                wloft(m, rings, W)
        with At(m, F):
            if cuff and lod != 2:
                cloth(m, sleeve, texel)
                R = [(-0.343, 0.071), (-0.348, 0.086), (-0.37, 0.089), (-0.392, 0.086), (-0.4, 0.068)]
                wloft(m, [ell(Y_SHOULDER + y, r, r, cx=cx, seg=seg) for y, r in R], [(F, 1.0)], close_start=False, close_end=False)
            if fore:
                if fore == 'skin': skin(m, texel * (1.0 if lod == 2 else 1.3))
                else: cloth(m, fore, texel)
                R = [(-0.35, 0.060, 1.0), (-0.385, 0.068, 0.98), (-0.42, 0.0705, 0.95), (-0.46, 0.064, 0.92), (-0.5, 0.053, 0.88), (-0.53, 0.044, 0.84), (-0.552, 0.037, 0.82), (-0.564, 0.028, 0.82)]
                R = thin(R, lod)
                wloft(m, [ell(Y_SHOULDER + y, r, r * f, cx=cx, seg=seg) for y, r, f in R], [(F, 1.0)])
    m.mat(lod=0)


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
        m.on(H_); brush()
        m.push(scale=HAND)
        # palm: wrist, heel, the broad middle, the knuckle line
        P = [(-0.008, 0.012, 0.022, 0.0, 0.010), (0.004, 0.0155, 0.030, 0.002, 0.013), (0.026, 0.018, 0.041, 0.004, 0.017),
             (0.054, 0.0175, 0.0465, 0.001, 0.019), (0.076, 0.0165, 0.047, 0.0, 0.02), (0.088, 0.014, 0.046, 0.0, 0.02), (0.095, 0.008, 0.041, 0.0, 0.02)]
        m.loft([ell_xy(z, rx, ry, cy=cy, cx=k * cx, seg=10, p=2.35) for z, rx, ry, cy, cx in P])
        # thumb muscle
        m.sphere(0.0225, 8, 6, at=(k * 0.007, 0.033, 0.03), scale=(0.85, 1.0, 1.4))
        # far away the four fingers are one mitt
        m.push(at=(k * 0.02, 0, 0.088), rot=(0, -k * (a0 + 0.2), 0))
        m.box(0.024, 0.09, 0.066, at=(0, 0, 0.026), bevel=0.01, lod=2)
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
            pts = [(K - z0 * 0.014 * HAND, z0, r * 0.98, [(H_, 1.0)]),
                   (K - z0 * e * 0.6, z0 * 0.7 + d1 * 0.3, r * 1.13, [(H_, 0.8), (A, 0.2)]), (K + d1 * e * 1.2, z0 * 0.3 + d1 * 0.7, r * 1.1, [(H_, 0.25), (A, 0.75)]),
                   (K + d1 * L1 * 0.55, d1, r * 0.97, [(A, 1.0)]),
                   (J1 - d1 * e, d1 * 0.7 + d2 * 0.3, r * 1.06, [(A, 0.75), (Bn, 0.25)]), (J1 + d2 * e, d1 * 0.3 + d2 * 0.7, r * 1.06, [(A, 0.25), (Bn, 0.75)]),
                   (J1 + d2 * L2 * 0.55, d2, r * 0.93, [(Bn, 1.0)]),
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


def boots(m, slot='boots', cuff=('fixed', 0x8b939d), toe=None, welt=None, seg=10, texel=1.0, lod=0):
    """Chunky boots: shaft with a folded cuff on the shin, the shoe on the foot, a thick sole."""
    for s, k in SIDES:
        S, Ft = 'shin_' + s, 'foot_' + s
        cx = k * SK['hipX']
        y_ankle = Y_THIGH - SK['thigh'] - SK['shin']
        with At(m, S):
            leather(m, slot, texel).mat(lod=lod)
            R = [(0.245, 0.074), (0.238, 0.093), (0.15, 0.09), (0.06, 0.084), (-0.01, 0.08)]
            wloft(m, [ell(y_ankle + y, r, r * 1.04, cx=cx, cz=0.004, seg=seg) for y, r in R], [(S, 1.0)], close_start=False)
            if cuff[0] == 'fixed': m.fixed(cuff[1], surf='leather', rough=0.7, texel=texel)
            else: leather(m, cuff[0], texel)
            R = [(0.19, 0.092), (0.2, 0.103), (0.25, 0.105), (0.262, 0.094), (0.255, 0.078)]
            wloft(m, [ell(y_ankle + y, r, r * 1.04, cx=cx, cz=0.004, seg=seg) for y, r in R], [(S, 1.0)], close_start=False, close_end=False)
        m.on(Ft)
        leather(m, slot, texel)
        fl = -SK['ankle'] + 0.026
        R = [(-0.098, 0.03, 0.03, -0.045), (-0.074, 0.066, 0.058, -0.03), (0.0, 0.076, 0.074, -0.012), (0.07, 0.078, 0.05, -0.034),
             (0.14, 0.081, 0.042, -0.044), (0.2, 0.072, 0.037, -0.05), (0.238, 0.034, 0.022, -0.058)]
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
        if lod != 2: m.box(0.15, 0.022, 0.1, at=(0, -SK['ankle'] + 0.036, -0.04), bevel=0.006)
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
            m.sphere(0.021, 6, 4, at=(0, 0.0, r - 0.014), scale=(1.25, 0.85, 0.5))
            m.fixed(0x2a1c14, surf='eye', rough=0.2, texel=0.6, lod=2)
            m.sphere(0.012, 6, 4, at=(0, 0.0, r - 0.006), scale=(1, 1, 0.5))
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
        skin(m, texel * 0.55)
        grid(m, _sink(H.lid_grid(k, True, H.LID_R), k, True), (0, 0, 0))
        m.fixed(0x1c1210, surf='flat', rough=0.6, texel=0.8)
        grid(m, H.lash_grid(k, H.LID_R + 0.0008), (0, 0, 0))
        # lower lid: still, with a lip that catches the light
        m.on('lidLo_' + s)
        skin(m, texel * 0.55)
        lo_r = H.LID_R - 0.0008
        grid(m, _sink(H.lid_grid(k, False, lo_r, vs=(0.0, 0.2, 0.55, 1.0), back=1.9), k), (0, 0, 0))
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
def hairline(d, fringe=0.42, nape=-0.55, side=0.06):
    """True where hair grows: above the forehead line (which drops at the temples), behind the ears, down to the nape."""
    if d[2] > side:
        line = fringe + 0.25 * max(0.0, d[2] - 0.6) - 0.46 * sm(0.62, 0.92, abs(d[0]))
        return d[1] > line
    return d[1] > nape


def scalp(m, grow=0.008, texel=1.0, **kw):
    hair(m, texel)
    return shell(m, 26, 15, lambda d: hairline(d, **kw), grow)


def spike(m, base, tip, r, bend=(0, 0, 0), seg=5):
    """A tapered lock of hair from base to tip, bowed by `bend`."""
    b = np.asarray(base, float); t = np.asarray(tip, float); bd = np.asarray(bend, float)
    pts = []
    for u in (0.0, 0.34, 0.7, 1.0):
        p = b + (t - b) * u + bd * math.sin(u * PI) * 1.0
        pts.append(tuple(p))
    m.tube(pts, r, seg=seg, r_end=r * 0.12)


def on_skull(dx, dy, dz, out=0.0):
    n = math.sqrt(dx * dx + dy * dy + dz * dz)
    return np.asarray(skull_point(dx / n, dy / n, dz / n, out if out else 1e-9))


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


def people_post(rgba, gb, cover):
    """
    The hand-painted pass over a person. The generic painter knows surfaces; this knows a body:
    where cloth bunches at a joint, where a garment is seamed and stitched, where knees and elbows
    fade, how hair falls in strand groups from the crown and catches a band of light, and that
    skin runs warm where it is lit and cool where it turns away. Everything is a multiplier on
    what the painter left, so palette tints still drive the colours.
    """
    P = gb['pos'].astype(np.float64)
    N = gb['nor'].astype(np.float64)
    surf = np.rint(gb['ids'][..., 0]).astype(np.int32)
    tco = gb['tco'].astype(np.float64); tsz = gb['tsz'].astype(np.float64)
    ao_l = np.clip(gb['ao'][..., 1], 0, 1).astype(np.float64)
    x, y, z = P[..., 0], P[..., 1], P[..., 2]
    H, W = surf.shape
    mul = np.ones((H, W, 3)); add = np.zeros((H, W))
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
    wob = fbm(P, 7.0, 3, 201)
    brush = fbm(P * np.array([3.0, 1.0, 3.0]), 16.0, 3, 207) - 0.5
    ang = np.arctan2(N[..., 2], N[..., 0])
    ty = np.clip(tco[..., 1] / np.maximum(tsz[..., 1], 1e-4), -1, 1)
    edge_m = (1 - np.abs(ty)) * tsz[..., 1]                       # metres from the garment's top or bottom edge
    garment = tsz[..., 1] > 0.055
    leg = (y < Y_THIGH + 0.03) & (np.abs(x) > 0.02)
    arm = (np.abs(x) > SK['shX'] - 0.035) & (y < Y_SHOULDER + 0.06) & (y > 0.75)
    limb = leg | arm

    # ---- cloth: brushwork, creases where a joint bunches it, seams, stitching, fading -----
    w = cl.astype(np.float64)
    tone(w * brush * 1.0, WARM)                                   # light strokes lean warm, dark ones cool
    tone(w * -np.minimum(brush, 0) * 0.5, COOL)
    Y_KNEE = Y_THIGH - SK['thigh']; Y_ELBOW = Y_SHOULDER - SK['upper']
    joints = ((Y_KNEE, 0.085, leg, 0.021), (Y_KNEE - 0.19, 0.06, leg, 0.017), (Y_THIGH - 0.03, 0.05, leg, 0.019),
              (Y_ELBOW, 0.07, arm, 0.018), (Y_ELBOW - 0.2, 0.05, arm, 0.015), (Y_SHOULDER - 0.03, 0.05, arm, 0.019),
              (1.045, 0.04, ~limb, 0.02))
    for yj, sig, where, period in joints:
        g = np.exp(-((y - yj) / sig) ** 2) * where * cl
        # each wrinkle wanders and breaks as it runs round the limb
        ph = y * (2 * PI / period) + 2.2 * np.sin(ang * 2.0 + yj * 31.0) + 7.0 * wob
        band = np.sin(ph)
        gate = smooth(0.35, 0.65, fbm(P * np.array([1.0, 0.3, 1.0]), 11.0, 2, 211 + int(yj * 100)))
        crease = smooth(0.45, 0.95, band) * gate
        ridge = smooth(0.3, 0.9, np.sin(ph - 1.3)) * gate
        value(-0.34 * g * crease)
        add += 0.085 * g * ridge
        tone(g * crease * 0.5, COOL)
    # long soft folds hanging down a trouser leg and a shirt body
    hang = np.sin(ang * 4.0 + 9.0 * wob + y * 5.0)
    value(0.10 * hang * cl * garment * (1 - smooth(0.0, 0.05, -np.abs(y - Y_KNEE) + 0.06)))
    # side seams: a dark line where the garment turns the corner, a row of pale stitches beside it
    nz = np.abs(N[..., 2])
    seamable = cl & garment & (np.abs(N[..., 1]) < 0.5)
    value(-0.38 * (1 - smooth(0.012, 0.045, nz)) * seamable)
    dash = np.sin(y * (2 * PI / 0.011)) > -0.1
    stitch = (nz > 0.075) & (nz < 0.125) & dash & seamable
    add += 0.11 * stitch
    # hems: a turned edge, its shadow line and a stitch row
    hem = (cl | le) & garment
    value(-0.22 * (np.abs(edge_m - 0.016) < 0.0022) * hem)
    add += 0.11 * ((np.abs(edge_m - 0.0105) < 0.0016) & (np.sin(ang * 46.0) > -0.2) & hem)
    value(0.05 * (edge_m < 0.008) * hem)
    # fading where the cloth takes the wear: knees in front, elbows behind, the seat
    wear = np.exp(-((y - Y_KNEE) / 0.07) ** 2) * leg * smooth(0.2, 0.8, N[..., 2]) \
        + np.exp(-((y - Y_ELBOW) / 0.06) ** 2) * arm * smooth(0.2, 0.8, -N[..., 2]) \
        + np.exp(-((y - 0.9) / 0.07) ** 2) * (~limb) * smooth(0.5, 0.9, -N[..., 2])
    speck = fbm(P, 60.0, 2, 219)
    value(cl * wear * (0.12 + 0.10 * (speck - 0.5)))
    tone(cl * wear * 0.35, (1.0, 1.0, 0.94))

    # ---- leather: stitched edges, scuffs on the high points, dirt in the folds ------------
    ew = np.abs(ty)
    belt_like = le & ~garment
    add += 0.12 * (belt_like & (ew > 0.60) & (ew < 0.74) & (np.sin(ang * 60.0) > -0.2))
    value(-0.20 * smooth(0.82, 1.0, ew) * belt_like)
    scuff = smooth(0.62, 0.8, fbm(P, 38.0, 3, 223)) * smooth(0.5, 0.9, ao_l)
    add += 0.07 * scuff * le
    value(-0.30 * (1 - ao_l) * le)
    tone(le * (1 - ao_l) * 0.6, (1.0, 0.9, 0.78))
    tone(le * brush * 0.8, WARM)

    # ---- skin: warm where the light lands, cool where it turns away, never one flat colour --
    up = N[..., 1] * 0.5 + 0.5
    tone(sk * (up - 0.5) * 0.9, WARM)
    tone(sk * np.maximum(0.5 - up, 0) * 0.8, COOL)
    tone(sk * (fbm(P, 22.0, 3, 227) - 0.5) * 0.3, (1.12, 0.98, 0.92))
    value(sk * 0.05 * (up - 0.5))

    # ---- hair: strand groups falling from the crown, and a band of light across them --------
    Q = P - np.array([0.0, Y_NECK + HC, 0.0])
    r = np.maximum(np.linalg.norm(Q, axis=-1), 1e-4)
    theta = np.arccos(np.clip(Q[..., 1] / r, -1, 1)); phi = np.arctan2(Q[..., 0], Q[..., 2])
    C = np.stack([np.sin(phi) * 7.0, np.cos(phi) * 7.0, theta * 0.7 + r * 1.5], axis=-1)
    clump = fbm(C, 1.0, 3, 231)
    fine = fbm(C * np.array([3.3, 3.3, 1.0]), 1.0, 2, 233)
    group = smooth(0.32, 0.68, clump)
    value(hr * (0.42 * (group - 0.5) + 0.20 * (fine - 0.5)))
    tone(hr * (group - 0.5) * 0.5, WARM)
    out_facing = np.clip(np.sum(N * (Q / r[..., None]), axis=-1), 0, 1)
    ring = np.exp(-((theta - (0.92 + 0.5 * (clump - 0.5))) / 0.11) ** 2) * smooth(0.15, 0.7, out_facing)
    add += hr * ring * (0.10 + 0.22 * group) * (0.6 + 0.8 * fine)
    value(-0.18 * hr * smooth(1.2, 2.2, theta) * (1 - out_facing))

    # ---- painted brush detail over all of it ------------------------------------------------
    sw = swatches()
    value(cl * 0.6 * triplanar(sw['cloth'], P, N, 0.34))
    value(le * 0.8 * triplanar(sw['leather'], P, N, 0.2))
    value(sk * 0.28 * triplanar(sw['skin'], P, N, 0.25))
    # hair strands run down the tile: wrap it round the head, crown at the top
    value(hr * 0.9 * tile(sw['hair'], phi * (4.0 / (2 * PI)), (theta * HR + (r - HR)) / 0.2))

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
    for k in (1, -1): relief = np.maximum(relief, blob(k * H.EYE[0], ey, 0.055, 0.045))
    mul = mul * shade ** (-0.85 * np.clip(relief * 1.5, 0, 1))[..., None]
    for k in (1, -1):
        ex = k * H.EYE[0]
        tint(0.8 * blob(k * 0.088, -0.062, 0.036, 0.026), (1.0, 0.80, 0.76))                 # cheek flush
        tint(0.5 * blob(k * 0.098, -0.034, 0.03, 0.016), (1.06, 1.03, 0.97))                 # cheekbone light
        tint(0.3 * blob(ex, ey + 0.004, 0.044, 0.034), (0.92, 0.82, 0.80))                   # orbit
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
    top = np.where(aa < 0.2, -0.098, np.where(aa < 0.45, -0.07, np.where(aa < 0.9, -0.07 + (aa - 0.45) / 0.45 * 0.035, -0.022)))
    dens = smooth(0.0, 0.022, top + 0.006 - qy) * smooth(1.45, 1.1, aa)
    dens = np.maximum(dens, np.exp(-((qy + 0.078) / 0.008) ** 2) * smooth(0.04, 0.028, np.abs(qx)))
    grain = fbm(P, 420.0, 2, 241)
    k_st = dens * (0.55 + 0.6 * grain)
    mul_s = mul * (1 - np.clip(k_st, 0, 1)[..., None] * (1 - np.array([0.60, 0.62, 0.70])))
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
