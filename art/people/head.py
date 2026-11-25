"""
The head, as geometry: a constructed, stylised skull instead of a ball.

Everything here is in HEAD-CENTRE space (origin at the middle of the skull, y up, +Z the face,
+X the character's left); base.py lifts it onto the head bone. The surface is a stack of
horizontal cross-sections (PROF: half width, front, back, where it is widest, how boxy), which
is what gives it a cranium, cheekbones, a jaw with an angle and a chin; the face is then
sculpted into the front of that stack (brow ridge, orbits, a nose with a bridge, lips, chin).

The mesh is a grid of ROWS (heights) by COLS (angles round the section, crowded toward the
front), with a slit along the mouth so the jaw bone can part the lips. `weights` says which
face bone moves a point: jaw (talking, and jaw width / length per person), corner_L/R (smile,
mouth width), nose and cheek (size per person). Everything else rides the head.
"""
import bisect
import math

PI = math.pi
HC = 0.15                       # head centre above the neck joint
HR = 0.168                      # nominal skull radius (hats and hair are sized to it)
Y_TOP, Y_BOT = 0.168, -0.166
EYE = (0.061, -0.012, 0.092)    # left eye centre
EYE_R = 0.046                   # a large, shallow ball: the visible cap is nearly flat
LID_R = EYE_R + 0.0035
MOUND = LID_R * 0.97 - 0.0012     # the lids' mound in the face: under the lid shells at any eye size fit.ts picks
MOUND_R = 0.043
IRIS_A, PUPIL_A = 0.40, 0.175   # angular radii on the ball
Y_MOUTH = -0.0925
MOUTH_W = 0.033
JAW_PIVOT = (0.0, -0.035, 0.0)
NOSE_PIVOT = (0.0, -0.048, 0.146)
CHEEK_PIVOT = (0.0, -0.06, 0.04)
EAR_AT = (0.147, -0.021, -0.012)


def sm(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def G(v, c, s):
    return math.exp(-((v - c) / s) ** 2)


def smin(a, b, k=0.004):
    h = max(0.0, min(1.0, 0.5 + 0.5 * (b - a) / k))
    return b + (a - b) * h - k * h * (1 - h)


# height, half width, front, back, widest at (z), boxiness
PROF = [
    (-0.166, 0.000, 0.105, 0.105, 0.105, 2.0),
    (-0.157, 0.037, 0.128, 0.078, 0.098, 2.2),
    (-0.145, 0.057, 0.136, 0.050, 0.085, 2.4),
    (-0.130, 0.076, 0.139, 0.010, 0.060, 2.5),
    (-0.115, 0.094, 0.141, -0.040, 0.030, 2.5),
    (-0.100, 0.109, 0.144, -0.085, 0.010, 2.5),
    (-0.085, 0.121, 0.146, -0.112, 0.004, 2.4),
    (-0.060, 0.136, 0.147, -0.143, -0.002, 2.3),
    (-0.035, 0.146, 0.148, -0.163, -0.006, 2.25),
    (-0.012, 0.152, 0.149, -0.172, -0.010, 2.2),
    (0.010, 0.153, 0.150, -0.175, -0.014, 2.2),
    (0.040, 0.151, 0.147, -0.175, -0.018, 2.2),
    (0.070, 0.144, 0.138, -0.170, -0.020, 2.15),
    (0.100, 0.130, 0.121, -0.158, -0.020, 2.1),
    (0.125, 0.109, 0.098, -0.137, -0.018, 2.05),
    (0.145, 0.083, 0.070, -0.108, -0.016, 2.0),
    (0.160, 0.050, 0.035, -0.068, -0.014, 2.0),
    (0.168, 0.000, -0.012, -0.012, -0.012, 2.0),
]
_PY = [r[0] for r in PROF]


def prof(y):
    """The cross-section at height y (Catmull-Rom through PROF)."""
    y = min(max(y, _PY[0]), _PY[-1])
    i = min(max(bisect.bisect_right(_PY, y) - 1, 0), len(PROF) - 2)
    y0, y1 = _PY[i], _PY[i + 1]
    t = (y - y0) / (y1 - y0)
    if i == 0 or i == len(PROF) - 2:      # straight into the poles
        return tuple(PROF[i][c] + (PROF[i + 1][c] - PROF[i][c]) * t for c in range(1, 6))
    out = []
    h00 = 2 * t ** 3 - 3 * t ** 2 + 1; h10 = t ** 3 - 2 * t ** 2 + t; h01 = -2 * t ** 3 + 3 * t ** 2; h11 = t ** 3 - t ** 2
    for c in range(1, 6):
        p0, p1 = PROF[i][c], PROF[i + 1][c]
        m0 = (p1 - PROF[i - 1][c]) / (y1 - _PY[i - 1]); m1 = (PROF[i + 2][c] - p0) / (_PY[i + 2] - y0)
        out.append(h00 * p0 + h10 * (y1 - y0) * m0 + h01 * p1 + h11 * (y1 - y0) * m1)
    return tuple(out)


def ring_pt(a, y):
    """The smooth skull at angle a round the section at height y (a = 0 is the face, pi/2 the left ear)."""
    W, Zf, Zb, zc, p = prof(y)
    sa, ca = math.sin(a), math.cos(a)
    e = 2.0 / p
    x = W * math.copysign(abs(sa) ** e, sa)
    z = zc + (Zf - zc) * abs(ca) ** e if ca >= 0 else zc - (zc - Zb) * abs(ca) ** e
    return x, y, z


_NOSE_Y = [-0.076, -0.070, -0.064, -0.058, -0.052, -0.044, -0.030, -0.012, 0.015, 0.035]
_NOSE_A = [0.0, 0.004, 0.016, 0.030, 0.033, 0.0265, 0.0155, 0.0075, 0.004, 0.002]
_NOSE_S = [0.018, 0.018, 0.0175, 0.0165, 0.015, 0.0135, 0.012, 0.0115, 0.014, 0.016]


def _lerp_tab(X, Y, x):
    if x <= X[0]: return Y[0]
    if x >= X[-1]: return Y[-1]
    i = bisect.bisect_right(X, x) - 1
    t = (x - X[i]) / (X[i + 1] - X[i])
    return Y[i] + (Y[i + 1] - Y[i]) * t


def sculpt(x, y, z, ca):
    """Push a skull point to the face surface. ca is the cosine of its angle round the section."""
    fr = sm(-0.05, 0.45, ca)
    if fr <= 0: return z
    ax = abs(x)
    F = 0.0
    # brow ridge over each eye, a little between them
    F += 0.0055 * G(y, 0.037, 0.016) * sm(0.0, 0.035, ax) * sm(0.135, 0.085, ax)
    F += 0.002 * G(y, 0.03, 0.02) * G(x, 0, 0.02)
    # nose: bridge from between the brows, ball at the tip, wings
    na = _lerp_tab(_NOSE_Y, _NOSE_A, y)
    if na > 0: F += na * math.exp(-(ax / _lerp_tab(_NOSE_Y, _NOSE_S, y)) ** 2.4)
    F += 0.011 * G(ax, 0.0175, 0.0075) * G(y, -0.0565, 0.0085)
    # cheekbones and the fullness beside the mouth
    F += 0.005 * G(ax, 0.092, 0.03) * G(y, -0.04, 0.021)
    F += 0.003 * G(ax, 0.055, 0.03) * G(y, -0.072, 0.025)
    # mouth: the muzzle, both lips, the line between them, the dip under the lower lip, the chin
    F += 0.004 * G(y, -0.092, 0.03) * math.exp(-(ax / 0.046) ** 2)
    F += 0.0062 * G(y, -0.0848, 0.0072) * math.exp(-(ax / 0.030) ** 2.2)
    F -= 0.0012 * G(x, 0, 0.005) * G(y, -0.082, 0.006)
    F -= 0.0018 * G(x, 0, 0.0065) * G(y, -0.074, 0.006)
    F -= 0.0045 * G(y, Y_MOUTH, 0.0034) * math.exp(-(ax / 0.037) ** 2.5)
    F += 0.0072 * G(y, -0.1015, 0.0078) * math.exp(-(ax / 0.026) ** 2.2)
    F -= 0.004 * G(y, -0.119, 0.009) * math.exp(-(ax / 0.03) ** 2)
    F += 0.006 * G(y, -0.142, 0.014) * math.exp(-(ax / 0.032) ** 2)
    z2 = z + F * fr
    # the orbit: inside the brow and the cheekbone the surface is the mound of the closed lids, a
    # sphere just under the lid shells; the eye itself looks out through a hole cut in it (head_mesh)
    d = math.hypot(ax - EYE[0], y - EYE[1])
    if d < MOUND_R:
        mound = EYE[2] + math.sqrt(MOUND * MOUND - d * d)
        t = sm(0.027, MOUND_R, d)
        z2 = mound + (z2 - mound) * t
    return z2


def face_pt(a, y):
    x, y, z = ring_pt(a, y)
    return x, y, sculpt(x, y, z, math.cos(a))


def face_z(x, y):
    """Depth of the face surface at (x, y) on the front of the head."""
    W, Zf, Zb, zc, p = prof(y)
    sa = min(1.0, abs(x) / max(W, 1e-6)) ** (p / 2.0)
    ca = math.sqrt(max(0.0, 1 - sa * sa))
    return sculpt(x, y, zc + (Zf - zc) * ca ** (2.0 / p), ca)


def _inside(x, y, z):
    if y >= Y_TOP - 1e-4 or y <= Y_BOT + 1e-4: return False
    W, Zf, Zb, zc, p = prof(y)
    if W < 1e-5: return False
    dz = (z - zc) / max((Zf - zc) if z >= zc else (zc - Zb), 1e-5)
    return abs(x / W) ** p + abs(dz) ** p < 1.0


def skull_dir(dx, dy, dz, grow=0.0):
    """Where the ray from the head's centre along unit direction d leaves the smooth skull, pushed out by `grow`."""
    r = 0.02
    while r < 0.3 and _inside(dx * r, dy * r, dz * r): r += 0.006
    lo, hi = r - 0.006, r
    for _ in range(14):
        mid = (lo + hi) * 0.5
        if _inside(dx * mid, dy * mid, dz * mid): lo = mid
        else: hi = mid
    r = lo + grow
    return dx * r, dy * r, dz * r


# ---- the mesh --------------------------------------------------------------------------------
ROWS = [-0.160, -0.150, -0.138, -0.124, -0.112, -0.1015, Y_MOUTH, Y_MOUTH, -0.0848, -0.076, -0.068, -0.060, -0.052, -0.043,
        -0.030, -0.012, 0.008, 0.026, 0.042, 0.065, 0.092, 0.120, 0.143, 0.158]
J_LOW, J_UP = 6, 7              # the two copies of the mouth row
HALF = [0.0, 0.06, 0.128, 0.2, 0.285, 0.38, 0.477, 0.59, 0.71, 0.84, 1.0, 1.18, 1.38, 1.6, 1.88, 2.18, 2.5, 2.83, PI]
COLS = HALF + [2 * PI - a for a in reversed(HALF[1:-1])]
SLIT = 3                        # the lips part between columns -SLIT..SLIT (the corners themselves are shared)
ROWS_FAR = [-0.150, -0.112, -0.076, -0.043, -0.012, 0.03, 0.075, 0.12, 0.152]
COLS_FAR = [i * 2 * PI / 12 for i in range(12)]


def in_eye(x, y):
    """True inside the opening the eye looks through (a little smaller than the lids' own)."""
    return ((abs(x) - EYE[0] - 0.002) / 0.03) ** 2 + ((y - EYE[1] - 0.001) / 0.024) ** 2 < 1.0


def in_slit(i):
    n = len(COLS)
    return i < SLIT or i > n - SLIT


def weights(x, y, z, ca, lower):
    """Face-bone weights of a surface point. `lower` marks the lower lip's own copy of the mouth row."""
    ax = abs(x)
    fr = sm(-0.2, 0.3, ca)
    wj = 0.0
    if lower:
        wj = sm(MOUTH_W, 0.012, ax)
    elif y < Y_MOUTH - 1e-5:
        lip = sm(0.036, 0.016, ax) * sm(-0.128, -0.104, y)
        wj = max(sm(-0.094, -0.122, y) * fr, lip)
    out = {}
    wc = 0.0
    if ca > 0:
        for s, k in (('L', 1), ('R', -1)):
            w = 0.85 * math.exp(-((x - k * MOUTH_W) ** 2 + (y - Y_MOUTH) ** 2) / 0.013 ** 2)
            if w > 0.02: out['corner_' + s] = w; wc += w
    wn = math.exp(-(ax / 0.024) ** 2.5) * sm(0.02, -0.012, y) * sm(-0.074, -0.064, y) if ca > 0.5 else 0.0
    wk = 0.8 * G(ax, 0.085, 0.04) * G(y, -0.065, 0.035) * sm(-0.3, 0.4, ca)
    wj *= max(0.0, 1 - wc)
    if wj > 0.02: out['jaw'] = wj
    if wn > 0.02: out['nose'] = wn
    if wk > 0.02: out['cheek'] = wk * max(0.0, 1 - wj - wc)
    tot = sum(out.values())
    if tot > 1.0: out = {b: w / tot for b, w in out.items()}; tot = 1.0
    if tot < 0.98: out['head'] = 1.0 - tot
    return sorted(out.items(), key=lambda t: -t[1])[:4]


def head_mesh(rows=None, cols=None, slit=True):
    """(verts, faces, per-vertex weights, index of (row, col)). Faces wind outward."""
    rows = ROWS if rows is None else rows
    cols = COLS if cols is None else cols
    n = len(cols)
    V, Wt, ix = [], [], {}
    V.append((0.0, Y_BOT, 0.105)); Wt.append([('jaw', 1.0)] if slit else [('head', 1.0)])
    for j, y in enumerate(rows):
        dup = slit and j in (J_LOW, J_UP)
        for i, a in enumerate(cols):
            if dup and j == J_UP and not in_slit(i):
                ix[(j, i)] = ix[(J_LOW, i)]; continue
            p = face_pt(a, y)
            ix[(j, i)] = len(V); V.append(p)
            Wt.append(weights(p[0], p[1], p[2], math.cos(a), dup and j == J_LOW and in_slit(i)) if slit else [('head', 1.0)])
    top = len(V); V.append((0.0, Y_TOP, -0.012)); Wt.append([('head', 1.0)])
    F = []
    for i in range(n):
        i2 = (i + 1) % n
        F.append((0, ix[(0, i2)], ix[(0, i)]))
        F.append((top, ix[(len(rows) - 1, i)], ix[(len(rows) - 1, i2)]))
        for j in range(len(rows) - 1):
            if slit and j == J_LOW:
                continue                                        # the two mouth rows coincide: nothing spans them
            if slit and in_eye(*[sum(V[ix[c]][t] for c in ((j, i), (j, i2), (j + 1, i2), (j + 1, i))) / 4 for t in (0, 1)]):
                continue                                        # the eye looks out here; the lids cover the cut
            F.append((ix[(j, i)], ix[(j, i2)], ix[(j + 1, i2)], ix[(j + 1, i)]))
    if slit:
        # the lips have thickness: each edge of the slit turns in toward the mouth
        for j, wname in ((J_UP, 'head'), (J_LOW, 'jaw')):
            inner = {}
            for i in range(n):
                if not (in_slit(i) or i == SLIT or i == n - SLIT): continue
                x, y, z = V[ix[(j, i)]]
                if in_slit(i):
                    inner[i] = len(V); V.append((x, y, z - 0.012)); Wt.append(list(Wt[ix[(j, i)]]))
                else:
                    inner[i] = ix[(j, i)]
            for i in list(range(n - SLIT, n)) + list(range(0, SLIT)):
                i2 = (i + 1) % n
                q = [ix[(j, i)], ix[(j, i2)], inner[i2], inner[i]]
                q = [v for t, v in enumerate(q) if v not in q[:t]]          # a triangle at each corner
                F.append(tuple(q) if j == J_LOW else tuple(reversed(q)))
    return V, F, Wt, ix


def normals(V, F):
    import numpy as np
    P = np.asarray(V, dtype=float); N = np.zeros_like(P)
    for f in F:
        a, b, c = P[f[0]], P[f[1]], P[f[2]]
        nrm = np.cross(b - a, c - a)
        for i in f: N[i] += nrm
    L = np.linalg.norm(N, axis=1); L[L < 1e-12] = 1
    return N / L[:, None]


def patch(keep, grow, rows=None, cols=None):
    """
    A layer over part of the face (beard, stubble, age lines): the grid cells keep(y, a, x) accepts
    (a is signed, 0 at the nose), lifted off the skin by grow(y, a, x). Returns verts, faces and each
    vertex's face-bone weights, so the layer can move exactly as the skin under it does.
    """
    V, F, _, ix = head_mesh(rows, cols, slit=False)
    N = normals(V, F)
    rows = ROWS if rows is None else rows
    cols = COLS if cols is None else cols
    n = len(cols)
    sgn = lambda a: a if a <= PI else a - 2 * PI
    used, verts, faces, wts = {}, [], [], []

    def vid(j, i):
        v = ix[(j, i)]
        if v not in used:
            x, y, z = V[v]
            g = grow(y, sgn(cols[i]), x) if callable(grow) else grow
            used[v] = len(verts); verts.append((x + N[v][0] * g, y + N[v][1] * g, z + N[v][2] * g))
            wts.append(weights(x, y, z, math.cos(cols[i]), False))
        return used[v]
    def want(j, i):
        if j < 0 or j >= len(rows) - 1 or rows[j] == rows[j + 1]: return False
        i %= n
        i2 = (i + 1) % n
        a = (cols[i] + (cols[i2] if i2 else 2 * PI)) * 0.5
        y = (rows[j] + rows[j + 1]) * 0.5
        x = (V[ix[(j, i)]][0] + V[ix[(j, i2)]][0]) * 0.5
        return not in_eye(x, y) and bool(keep(y, sgn(a), x))
    for j in range(len(rows) - 1):
        if rows[j] == rows[j + 1]: continue
        for i in range(n):
            i2 = (i + 1) % n
            c = {'bl': (j, i), 'br': (j, i2), 'tr': (j + 1, i2), 'tl': (j + 1, i)}
            if want(j, i):
                faces.append((vid(*c['bl']), vid(*c['br']), vid(*c['tr']), vid(*c['tl'])))
                continue
            # a stair in the outline becomes a slope: half a cell where two neighbours meet at a corner
            jb = j - 1 if rows[j] != rows[j - 1] or j == 0 else j - 2
            jt = j + 1 if j + 2 >= len(rows) or rows[j + 1] != rows[j + 2] else j + 2
            below, above, left, right = want(jb, i), want(jt, i), want(j, i - 1), want(j, i + 1)
            if below and left and not above and not right: faces.append((vid(*c['bl']), vid(*c['br']), vid(*c['tl'])))
            elif below and right and not above and not left: faces.append((vid(*c['bl']), vid(*c['br']), vid(*c['tr'])))
            elif above and left and not below and not right: faces.append((vid(*c['bl']), vid(*c['tr']), vid(*c['tl'])))
            elif above and right and not below and not left: faces.append((vid(*c['br']), vid(*c['tr']), vid(*c['tl'])))
    return verts, faces, wts


def beard_top(aa):
    """How high a full beard grows at angle aa from the nose: under the lip, up past the mouth corner, up the cheek to the ear."""
    if aa < 0.2: return -0.098
    if aa < 0.45: return -0.07
    if aa < 0.9: return -0.07 + (aa - 0.45) / 0.45 * 0.035
    return -0.022


# ---- eyes ------------------------------------------------------------------------------------
T_IN, T_OUT = -0.63, 0.70       # the corners of the opening, as angles round the ball (outer is +)
PH_UP, PH_LO = 0.36, -0.41


def _s(t):
    return max(-1.0, min(1.0, (t - (T_IN + T_OUT) * 0.5) / ((T_OUT - T_IN) * 0.5)))


def lid_edge(t, upper):
    """Height (angle above straight ahead) of a lid's edge at angle t round the ball."""
    s = _s(t)
    pc = -0.012 + 0.062 * s                                 # the outer corner sits a little higher
    arch = (1 - s * s) ** (0.55 if upper else 0.62)
    peak = (PH_UP + 0.03 * -s) if upper else PH_LO
    return pc + (peak - pc) * arch


def ball(th, ph, r):
    return (r * math.sin(th), r * math.cos(th) * math.sin(ph), r * math.cos(th) * math.cos(ph))


def lid_grid(k, upper, r, t_span=1.3, nt=11, vs=(0.0, 0.1, 0.28, 0.6, 1.0), back=2.3, lift=0.0):
    """Rows of points for a lid shell of radius r, from its edge back over (or under) the ball. k mirrors it for the right eye."""
    rows = []
    for v in vs:
        row = []
        for i in range(nt):
            t = -t_span + 2 * t_span * i / (nt - 1)
            e = lid_edge(t, upper) + lift
            ph = e + v * (back - e) if upper else e - v * (e + back)
            row.append(ball(k * t, ph, r))
        rows.append(row)
    return rows


def lash_grid(k, r, nt=11):
    """The dark edge of the upper lid: tucked against the ball, across the lid's thickness, and a band up its face."""
    rows = [[], [], []]
    for i in range(nt):
        t = T_IN - 0.06 + (T_OUT + 0.2 - T_IN + 0.06) * i / (nt - 1)
        e = lid_edge(t, True)
        s = _s(t)
        w = 0.05 + 0.035 * max(0.0, s)                       # thicker toward the outer corner
        if t > T_OUT: e += (t - T_OUT) * 0.5; w *= max(0.15, 1 - (t - T_OUT) / 0.2)      # the flick past the corner
        if t < T_IN: w *= 0.5
        rows[0].append(ball(k * t, e - 0.02, EYE_R + 0.0005))
        rows[1].append(ball(k * t, e - 0.004, r))
        rows[2].append(ball(k * t, e + w, r))
    return rows


def ear_mesh(k, Ru=0.0165, Rv=0.034, tilt=0.5, nth=12):
    """An ear in its own frame (origin where its front edge meets the head): rim, bowl, lobe and a back."""
    V, F = [], []
    ct, st = math.cos(tilt), math.sin(tilt)

    def P(rho, th, h):
        sv = math.sin(th)
        u = rho * Ru * math.cos(th) * (1 - 0.3 * sm(0.0, -1.0, sv)) * (1 + 0.12 * sm(0.2, 1.0, sv))
        v = rho * Rv * sv - 0.004
        b = Ru - u                                           # distance back from the front edge
        h *= 0.55 + 0.45 * sm(0.9, 0.3, math.cos(th))        # the rim is low where the ear joins the head
        return (k * (b * st + h * ct), v, -(b * ct - h * st))
    rings = [(0.42, 0.0025), (0.78, 0.0085), (1.0, 0.0065), (0.93, -0.004)]
    c_front = len(V); V.append(P(0.0, 0.0, 0.0008))
    idx = []
    for rho, h in rings:
        idx.append([len(V) + i for i in range(nth)])
        for i in range(nth): V.append(P(rho, 2 * PI * i / nth, h))
    c_back = len(V); V.append(P(0.0, 0.0, -0.0045))
    for i in range(nth):
        i2 = (i + 1) % nth
        F.append((c_front, idx[0][i], idx[0][i2]))
        for a, b in zip(idx, idx[1:]):
            F.append((a[i], b[i], b[i2], a[i2]))
        F.append((c_back, idx[-1][i2], idx[-1][i]))
    return V, F
