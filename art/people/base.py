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
from lib.paint import fbm, smooth

SK = dict(hipY=0.89, hipX=0.1, hipDrop=0.05, thigh=0.39, shin=0.38, ankle=0.1, spine=0.11, chest=0.17, neck=0.26,
          headC=0.14, shX=0.2, shY=0.19, upper=0.28, fore=0.27)
Y_HIPS = SK['hipY']; Y_SPINE = Y_HIPS + SK['spine']; Y_CHEST = Y_SPINE + SK['chest']; Y_NECK = Y_CHEST + SK['neck']
Y_SHOULDER = Y_CHEST + SK['shY']; Y_THIGH = Y_HIPS - SK['hipDrop']
HC = 0.15                    # head centre above the neck joint
HR = 0.168                   # skull radius
EYE = (0.061, HC - 0.012, 0.108)   # left eye centre in neck-joint space
EYE_R = 0.037
HAND = 1.18                  # heroic hands
KNUCKLE_Z = 0.088 * HAND
FING_L1 = 0.04 * HAND
FING_REST = (0.5, 0.75)      # baked curl of the two finger joints, radians
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


def skeleton(m):
    m.bone('root', None, (0, 0, 0))
    m.bone('hips', 'root', (0, Y_HIPS, 0))
    m.bone('spine', 'hips', (0, SK['spine'], 0))
    m.bone('chest', 'spine', (0, SK['chest'], 0))
    m.bone('head', 'chest', (0, SK['neck'], 0))
    for s, k in SIDES:
        m.bone('eye_' + s, 'head', (k * EYE[0], EYE[1], EYE[2]))
        m.bone('lid_' + s, 'head', (k * EYE[0], EYE[1], EYE[2]))
        m.bone('brow_' + s, 'head', (k * 0.06, EYE[1] + 0.047, 0.14))
    m.bone('mouth', 'head', (0, HC - 0.09, 0.147))
    m.bone('nose', 'head', (0, HC - 0.048, 0.156))
    for s, k in SIDES:
        m.bone('armU_' + s, 'chest', (k * SK['shX'], SK['shY'], 0))
        m.bone('armF_' + s, 'armU_' + s, (0, -SK['upper'], 0))
        m.bone('hand_' + s, 'armF_' + s, (0, -SK['fore'], 0))
        m.bone('fingA_' + s, 'hand_' + s, knuckle(k))
        a = FING_REST[0]
        m.bone('fingB_' + s, 'fingA_' + s, (-k * math.sin(a) * FING_L1, 0, math.cos(a) * FING_L1))
        m.bone('thumb_' + s, 'hand_' + s, (k * 0.004 * HAND, 0.04 * HAND, 0.03 * HAND))
        m.bone('thigh_' + s, 'root', (k * SK['hipX'], Y_THIGH, 0))
        m.bone('shin_' + s, 'thigh_' + s, (0, -SK['thigh'], 0))
        m.bone('foot_' + s, 'shin_' + s, (0, -SK['shin'], 0))


# ---- body ------------------------------------------------------------------------------------
def torso(m, top='top', yoke='top2', seg=16, texel=1.0, lod=0):
    """Shirt or jacket body from the belt to the neck, with a yoke across the shoulders."""
    with At(m, 'chest'):
        cloth(m, top, texel).mat(lod=lod)
        R = thin([(0.952, 0.170, 0.122, 0.0), (1.0, 0.163, 0.117, 0.0), (1.06, 0.160, 0.116, 0.002), (1.13, 0.172, 0.124, 0.004),
                  (1.21, 0.192, 0.137, 0.007), (1.285, 0.203, 0.141, 0.008)], lod)
        wloft(m, [ell(y, rx, rz, cz=cz, seg=seg, p=2.25, rzb=rz * 0.92) for y, rx, rz, cz in R], [w_torso(r[0]) for r in R], close_start=False, close_end=False)
        cloth(m, yoke, texel)
        R = [(1.278, 0.207, 0.145, 0.008), (1.335, 0.205, 0.139, 0.006), (1.385, 0.186, 0.122, 0.003), (1.42, 0.132, 0.102, 0.0), (1.452, 0.074, 0.072, 0.0)]
        wloft(m, [ell(y, rx, rz, cz=cz, seg=seg, p=2.2, rzb=rz * 0.94) for y, rx, rz, cz in R], [('chest', 1.0)])
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


def neck(m, seg=10, lod=0):
    with At(m, 'chest'):
        skin(m, 0.5 if lod == 2 else 1.0).mat(lod=lod)
        R = [(1.395, 0.062), (1.45, 0.057), (1.505, 0.056)]
        W = [[('chest', 1.0)], [('chest', 0.5), ('head', 0.5)], [('head', 1.0)]]
        wloft(m, [ell(y, r, r * 0.98, cz=0.004, seg=seg) for y, r in R], W, close_start=False, close_end=False)
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


def arms(m, sleeve='top', fore='skin', seg=10, texel=1.0, cuff=True, lod=0):
    """Sleeve from the shoulder to below the elbow (rolled cuff), then the forearm."""
    for s, k in SIDES:
        U, F = 'armU_' + s, 'armF_' + s
        cx = k * SK['shX']
        with At(m, U):
            cloth(m, sleeve, texel).mat(lod=lod)
            R = [(0.062, 0.04), (0.025, 0.082), (-0.02, 0.09), (-0.10, 0.08), (-0.19, 0.071), (-0.245, 0.068), (-0.28, 0.067), (-0.315, 0.069), (-0.365, 0.071)]
            R = thin(R, lod)
            W = [blend(U, F, sm(-0.225, -0.335, y)) for y, _ in R]
            wloft(m, [ell(Y_SHOULDER + y, r, r, cx=cx, seg=seg) for y, r in R], W)
        with At(m, F):
            if cuff and lod != 2:
                cloth(m, sleeve, texel)
                R = [(-0.345, 0.07), (-0.352, 0.082), (-0.39, 0.082), (-0.398, 0.066)]
                wloft(m, [ell(Y_SHOULDER + y, r, r, cx=cx, seg=seg) for y, r in R], [(F, 1.0)], close_start=False, close_end=False)
            if fore:
                if fore == 'skin': skin(m, texel)
                else: cloth(m, fore, texel)
                R = [(-0.35, 0.062), (-0.40, 0.065), (-0.47, 0.056), (-0.535, 0.045), (-0.556, 0.038)]
                wloft(m, [ell(Y_SHOULDER + y, r, r * 0.95, cx=cx, seg=seg) for y, r in R], [(F, 1.0)])
    m.mat(lod=0)


def hands(m, slot='skin', texel=1.25):
    """Real hands: palm, four fingers in two segments, thumb. Fingers curl on fingA / fingB, the thumb on thumb."""
    L1 = FING_L1 / HAND
    for s, k in SIDES:
        H = 'hand_' + s

        def brush(lod=0):
            if slot == 'skin': skin(m, texel)
            else: leather(m, slot, texel)
            m.mat(lod=lod)
        m.on(H); brush()
        m.push(scale=HAND)
        # palm slab on the back-of-hand side of the grip axis; the heel of the hand reaches the wrist
        m.box(0.036, 0.094, 0.082, at=(k * 0.02, 0.0, 0.046), bevel=0.013)
        m.box(0.03, 0.07, 0.03, at=(k * 0.012, 0.0, 0.004), bevel=0.011)
        # thumb base muscle
        m.sphere(0.024, 7, 5, at=(k * 0.004, 0.036, 0.03), scale=(0.9, 1.0, 1.3))
        a0, a1 = FING_REST
        # far away the four fingers are one mitt
        m.push(at=(k * 0.02, 0, 0.088), rot=(0, -k * (a0 + 0.2), 0))
        m.box(0.024, 0.09, 0.066, at=(0, 0, 0.026), bevel=0.01, lod=2)
        m.pop()
        m.pop()
        ys = (0.034, 0.0115, -0.0115, -0.034)
        l2 = (0.034, 0.038, 0.034, 0.027)
        th = (0.0215, 0.022, 0.021, 0.0185)
        for y, L2, t in zip(ys, l2, th):
            m.on('fingA_' + s); brush(1)
            m.push(scale=HAND); m.push(at=(0, y, 0), rot=(0, -k * a0, 0))
            m.box(t, t, L1 + 0.012, at=(0, 0, L1 * 0.5 - 0.004), bevel=t * 0.3)
            m.pop(); m.pop()
            m.on('fingB_' + s); brush(1)
            m.push(scale=HAND); m.push(at=(0, y, 0), rot=(0, -k * (a0 + a1), 0))
            m.box(t * 0.94, t * 0.94, L2 + 0.008, at=(0, 0, L2 * 0.5 - 0.002), bevel=t * 0.32)
            m.pop(); m.pop()
        m.on('thumb_' + s); brush(1)
        m.push(scale=HAND); m.push(rot=(-0.5, -k * 0.55, 0))
        m.box(0.024, 0.024, 0.04, at=(0, 0, 0.018), bevel=0.008)
        m.push(at=(0, 0, 0.036), rot=(0, -k * 0.45, 0))
        m.box(0.022, 0.022, 0.034, at=(0, 0, 0.015), bevel=0.008)
        m.pop(); m.pop(); m.pop()
        m.mat(lod=0)
        m.on(H)


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
    """The sculpted head surface along unit direction d, relative to the neck joint."""
    R = HR + grow
    x, y, z = dx * R * 0.94, dy * R, dz * R
    if dz < 0: z *= 1.05
    low = sm(0.05, 0.95, -dy)
    front = max(dz, 0.0)
    x *= 1 - 0.3 * low * low
    if dy < 0:
        z += 0.024 * low * front
        y += 0.04 * low * sm(0.3, -0.8, dz)
        y *= 1 - 0.09 * low * front
    z -= 0.011 * sm(0.55, 1.0, dz) * (1 - low)
    if dz > 0 and grow == 0.0:
        for k in (1, -1):
            ex, ey = k * EYE[0], EYE[1] - HC
            z -= 0.016 * math.exp(-((x - ex) ** 2 + (y - ey) ** 2) / 0.04 ** 2)
            z += 0.006 * math.exp(-(((x - ex) / 0.055) ** 2 + ((y - (ey + 0.052)) / 0.016) ** 2))
            z += 0.006 * math.exp(-(((x - k * 0.08) / 0.036) ** 2 + ((y + 0.07) / 0.032) ** 2))
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


def head(m, seg=24, rings=16, texel=1.7, nose=1.0, ears=True, lod=0):
    m.on('head')
    skin(m, texel).mat(lod=lod)
    D = sphere_dirs(seg, rings)
    verts = [skull_point(*D[0][0])]
    for j in range(1, rings):
        for d in D[j]: verts.append(skull_point(*d))
    verts.append(skull_point(*D[rings][0]))
    top = len(verts) - 1
    faces = []
    for i in range(seg):
        i2 = (i + 1) % seg
        faces.append((0, 1 + i2, 1 + i))
        faces.append((top, 1 + (rings - 2) * seg + i, 1 + (rings - 2) * seg + i2))
        for j in range(rings - 2):
            a = 1 + j * seg
            faces.append((a + i, a + i2, a + seg + i2, a + seg + i))
    m.mesh(verts, oriented(verts, faces, (0, HC, 0)), recalc=False)
    if lod == 2:
        m.mat(lod=0)
        return
    m.on('nose')
    m.sphere(0.018 * nose, 8, 6, scale=(1.0, 0.8, 0.72))
    m.on('head')
    if ears:
        for k in (1, -1):
            m.sphere(0.04, 7, 5, at=(k * 0.158, HC - 0.02, -0.006), rot=(0, k * 0.35, 0), scale=(0.42, 1.0, 0.74))
    m.mat(lod=0)


def eyes(m, texel=2.2, lod=0):
    r = EYE_R
    for s, k in SIDES:
        m.on('eye_' + s)
        if lod == 2:
            # far away an eye is a white dot with a dark centre
            m.fixed(0xf6f3ec, surf='eye', rough=0.25, texel=0.6, lod=2)
            m.sphere(r, 6, 4, rot=(PI / 2, 0, 0))
            m.fixed(0x2a1c14, surf='eye', rough=0.2, texel=0.6, lod=2)
            m.lathe([(r * 0.55, r * 0.86), (0.0, r + 0.002)], 6, rot=(PI / 2, 0, 0), cap=False)
            m.mat(lod=0)
            continue
        m.mat(lod=lod)
        m.fixed(0xf6f3ec, surf='eye', rough=0.25, texel=texel)
        m.sphere(r, 12, 8, rot=(PI / 2, 0, 0))
        m.mat(slot='iris', surf='eye', metal=0.0, rough=0.2, emit=0.0, texel=texel * 1.3)
        r1 = r + 0.0006
        m.lathe([(r1 * math.sin(a), r1 * math.cos(a)) for a in (0.62, 0.42, 0.2)] + [(0.0, r1)], 10, rot=(PI / 2, 0, 0), cap=False)
        m.fixed(0x120d0c, surf='eye', rough=0.2, texel=texel)
        r2 = r + 0.0011
        m.lathe([(r2 * math.sin(a), r2 * math.cos(a)) for a in (0.34, 0.17)] + [(0.0, r2)], 8, rot=(PI / 2, 0, 0), cap=False)
        m.fixed(0xffffff, surf='glass', rough=0.2, emit=0.55, texel=0.5)
        m.sphere(0.0066, 5, 4, at=(0.01, 0.012, r - 0.0024))
        m.sphere(0.0034, 4, 3, at=(-0.008, -0.009, r - 0.0016))
        # upper lid: a shell that rolls down over the eye; its leading edge is the lash line
        m.on('lid_' + s)
        rl = r + 0.0028

        def P(th, ph, rr):
            return (rr * math.sin(th), rr * math.cos(th) * math.sin(ph), rr * math.cos(th) * math.cos(ph))
        TH = [(-1.45 + 2.9 * i / 8) for i in range(9)]
        skin(m, texel * 0.7)
        grid(m, [[P(th, ph, rl) for th in TH] for ph in (0.93, 1.25, 1.7, 2.25, 2.9)], (0, 0, 0))
        m.fixed(0x241812, surf='flat', rough=0.6, texel=0.6)
        grid(m, [[P(th, ph, rl + 0.0008) for th in TH] for ph in (0.82, 0.88, 0.94)], (0, 0, 0))
    m.mat(lod=0)


def brows(m, w=0.06, h=0.017, tilt=0.12):
    hair(m, 1.0)
    for s, k in SIDES:
        m.on('brow_' + s)
        m.box(w, h, 0.018, rot=(0.1, k * 0.32, -k * tilt), bevel=0.006)


def mouth(m, color=0x6a2a22):
    m.on('mouth')
    m.fixed(color, surf='flat', rough=0.6, texel=1.2)
    pts = [(-0.047, 0.017, -0.011), (-0.027, 0.004, -0.004), (0.0, -0.003, 0.0), (0.027, 0.004, -0.004), (0.047, 0.017, -0.011)]
    m.tube(pts, 0.0058, seg=5)


# ---- hair ------------------------------------------------------------------------------------
def hairline(d, fringe=0.42, nape=-0.55, side=0.06):
    """True where hair grows: above the forehead line (which drops at the temples), behind the ears, down to the nape."""
    if d[2] > side:
        line = fringe + 0.25 * max(0.0, d[2] - 0.6) - 0.62 * sm(0.62, 0.92, abs(d[0]))
        return d[1] > line
    return d[1] > nape


def scalp(m, grow=0.008, texel=1.0, **kw):
    hair(m, texel)
    return shell(m, 20, 12, lambda d: hairline(d, **kw), grow)


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
    """Paint what the generic painter cannot know: blush, lips, lash shadow, iris detail."""
    P = gb['pos'].astype(np.float64)
    slot = np.rint(gb['ids'][..., 1]).astype(np.int32)
    out = rgba.copy()
    hc = np.array([0.0, Y_NECK + HC, 0.0])
    Q = P - hc
    sk = (slot == SLOTS.index('skin')) & (Q[..., 2] > 0.02) & (np.abs(Q[..., 1]) < 0.2) & (np.abs(Q[..., 0]) < 0.17)
    mul = np.ones(P.shape[:2] + (3,))

    def blob(cx, cy, rx, ry):
        return np.exp(-(((Q[..., 0] - cx) / rx) ** 2 + ((Q[..., 1] - cy) / ry) ** 2))

    def tint(w, c):
        nonlocal mul
        mul = mul * (1 - w[..., None] * (1 - np.asarray(c)))
    for k in (1, -1):
        ex, ey = k * EYE[0], EYE[1] - HC
        tint(0.85 * blob(k * 0.09, -0.064, 0.036, 0.027), (1.0, 0.80, 0.77))                 # cheek
        tint(0.5 * blob(k * 0.1, -0.03, 0.03, 0.02), (1.05, 1.02, 0.97))                     # cheekbone light
        tint(0.6 * blob(ex, ey + 0.004, 0.046, 0.044), (0.88, 0.78, 0.76))                  # socket
        tint(0.6 * blob(ex, ey + 0.037, 0.042, 0.011), (0.80, 0.68, 0.68))                   # lid crease
        tint(0.5 * blob(ex, ey - 0.036, 0.034, 0.009), (0.86, 0.76, 0.76))                   # under the eye
    tint(0.75 * blob(0, -0.048, 0.022, 0.018), (1.0, 0.82, 0.78))                              # nose
    tint(0.6 * blob(0, 0.07, 0.07, 0.035), (1.05, 1.03, 0.98))                               # forehead light
    tint(0.7 * np.clip((-Q[..., 1] - 0.105) / 0.05, 0, 1), (0.86, 0.84, 0.9))                # under the jaw turns cool
    tint(0.5 * blob(0, -0.068, 0.016, 0.006), (0.76, 0.64, 0.62))                            # under the nose
    tint(0.7 * blob(0, -0.108, 0.027, 0.008), (0.90, 0.64, 0.62))                            # lower lip
    tint(0.45 * blob(0, -0.132, 0.03, 0.01), (0.84, 0.74, 0.72))                              # chin crease
    out[..., :3] = np.where(sk[..., None], np.clip(out[..., :3] * mul, 0, 1), out[..., :3])

    # eyes: limbal ring, radial fibres and a lit lower crescent on the iris; lid shadow on the white
    ir = slot == SLOTS.index('iris')
    for k in (1, -1):
        e = hc + np.array([k * EYE[0], EYE[1] - HC, EYE[2]])
        D = P - e
        near = (np.linalg.norm(D, axis=-1) < EYE_R + 0.004)
        rr = np.sqrt(D[..., 0] ** 2 + D[..., 1] ** 2) / (EYE_R * math.sin(0.62))
        ang = np.arctan2(D[..., 1], D[..., 0])
        fib = 0.9 + 0.1 * np.sin(ang * 23.0) * np.sin(ang * 7.0 + 1.3)
        v = (0.55 + 0.75 * np.clip(rr, 0, 1) ** 1.5) * fib
        v = v * (1 - 0.55 * np.clip((rr - 0.8) / 0.2, 0, 1))                                  # dark rim
        v = v * (0.72 + 0.5 * np.clip(-D[..., 1] / (EYE_R * 0.5) * 0.5 + 0.5, 0, 1))          # brighter below
        m_ = ir & near
        out[..., :3] = np.where(m_[..., None], np.clip(0.66 * v, 0, 1)[..., None], out[..., :3])
        wh = (slot == SLOTS.index('fixed')) & near & (np.rint(gb['ids'][..., 0]).astype(np.int32) == 10) & (rr > 1.0)
        sh = 1 - 0.38 * np.clip((D[..., 1] / EYE_R - 0.05) / 0.6, 0, 1) - 0.12 * np.clip(rr - 1.2, 0, 1)
        out[..., :3] = np.where(wh[..., None], out[..., :3] * sh[..., None] * np.array([0.97, 0.98, 1.0]), out[..., :3])
    return out
