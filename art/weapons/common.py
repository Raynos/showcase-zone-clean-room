"""
The thirteen weapons: yard tools pressed into service, modelled to be read at arm's length
(the first-person view looks straight at the blade, the grip, the bow limbs and the sights).

LOCAL AXES (the hand grip socket of the humanoid rig: +Y thumb side, +Z knuckles)
  swords   grip at the origin, blade along +Y, cutting edge toward +Z, flats facing +-X
  spears   rear-hand grip at the origin, shaft along +Y (butt near -0.9, point near +1.4)
  bows     grip at the origin, stave along +-Y, arrow flies along +Z, string on the -Z side
  guns     pistol grip at the origin, barrel along +Z, top of the gun +Y

Each pack (swords, spears, bows, guns) is one model with one texture. A weapon's geometry sits
on a bone named opt_<id>; the runtime keeps the one it wants and drops the others. A bow adds
opt_<id>__nock (the string's middle and the arrow ride it) and opt_<id>__arrow.
src/entities/humanoid/weapons.ts holds the tip / base / string numbers that go with these shapes.
"""
import math

from lib.kit import Model, PI

CYAN = 0x3fe3ff; ORANGE = 0xf28a2e; HOT = 0xffa53a; STEEL = 0xb4bcc5; DARK = 0x2a2e35; GUN = 0x3a4048
RUBBER = 0x1e2024; CREAM = 0xf3e3c8; WOOD = 0xb07a45; COPPER = 0xc9773a; YELLOW = 0xffcf3a; SLATE = 0x4b535e
IRON = 0x59626e; GREY = 0x8b939d; BRIGHT = 0xd4dae0; INK = 0x23272e

BUILD = dict(ao_dist=0.07, edge_dist=0.008, edge_w=0.0028, scale=0.42, chip=0.9, grime=0.8, ao_min=0.38, edge_gain=0.36, edge_other=0.8, quality=84)
NEAR = 1.6     # texel boost for what the hands hold and the eye rests on


# ---- brushes -------------------------------------------------------------------------------
def metal(m, c=STEEL, texel=1.0, rough=0.4): return m.fixed(c, surf='metal', metal=0.9, rough=rough, texel=texel)
def paint(m, c=ORANGE, texel=1.0): return m.fixed(c, surf='paint', metal=0.25, rough=0.6, texel=texel)
def panel(m, c=GUN, texel=1.0): return m.fixed(c, surf='panel', metal=0.3, rough=0.6, texel=texel)
def rubber(m, c=RUBBER, texel=1.0): return m.fixed(c, surf='rubber', metal=0.0, rough=0.95, texel=texel)
def wrap(m, c=ORANGE, texel=1.0): return m.fixed(c, surf='knit', metal=0.0, rough=0.92, texel=texel)
def leather(m, c=0x6b4a32, texel=1.0): return m.fixed(c, surf='leather', metal=0.0, rough=0.6, texel=texel)
def wood(m, c=WOOD, texel=1.0): return m.fixed(c, surf='wood', metal=0.0, rough=0.8, texel=texel)
def flat(m, c, texel=1.0): return m.fixed(c, surf='flat', metal=0.0, rough=0.8, texel=texel)
def glow(m, c=CYAN, emit=1.2, texel=1.0): return m.fixed(c, surf='glow', metal=0.0, rough=0.4, emit=emit, texel=texel)
def vent(m, c=DARK, texel=1.0): return m.fixed(c, surf='vent', metal=0.5, rough=0.6, texel=texel)
def stripe(m, texel=1.0): return m.stripe(YELLOW, texel=texel)


# ---- shapes --------------------------------------------------------------------------------
def blade(m, st, ridge=0.6, grind=0.3):
    """
    A ground blade through stations (y, zBack, zEdge, thickness): a square spine, flat sides and a
    bevel running down to the cutting edge, so the edge catches light the way a sharpened one does.
    """
    rings = []
    for y, zb, ze, th in st:
        w = ze - zb
        zs = zb + w * (1 - grind)
        h = th / 2
        rings.append([(-h * ridge, y, zb), (-h, y, zb + w * 0.18), (-h, y, zs), (0, y, ze), (h, y, zs), (h, y, zb + w * 0.18), (h * ridge, y, zb)])
    return m.loft(rings, smooth=False)


def zcyl(m, r1, r0, length, seg, x, y, zmid, bevel=0.0, **k):
    """Cylinder along +Z, r0 at the back, r1 at the front."""
    return m.cyl(r1, r0, length, seg, at=(x, y, zmid), rot=(PI / 2, 0, 0), bevel=bevel, **k)


def xcyl(m, r, length, seg, x, y, z, bevel=0.0, **k):
    return m.cyl(r, r, length, seg, at=(x, y, z), rot=(0, 0, PI / 2), bevel=bevel, **k)


def grip(m, band, pommel=True, core=RUBBER):
    """A two-hand-and-a-bit handle: ribbed rubber, two cord bands, a steel pommel."""
    rubber(m, core, NEAR)
    m.cyl(0.019, 0.021, 0.2, 10, at=(0, -0.03, 0), bevel=0.003)
    for i in range(7):
        m.torus(0.0205, 0.0028, 10, 4, at=(0, -0.06 + i * 0.0105, 0))
    wrap(m, band, NEAR)
    m.cyl(0.0235, 0.0235, 0.035, 10, at=(0, -0.085, 0), bevel=0.003)
    m.cyl(0.0235, 0.0235, 0.035, 10, at=(0, 0.02, 0), bevel=0.003)
    if pommel:
        metal(m, STEEL, NEAR)
        m.cyl(0.031, 0.027, 0.034, 8, at=(0, -0.146, 0), bevel=0.006)
        m.bolt((0, -0.166, 0), 0.011, (0, -1, 0))


def pistol_grip(m, w=0.04, h=0.14, d=0.052, rake=0.16):
    rubber(m, RUBBER, NEAR)
    m.box(w, h, d, at=(0, -0.02, -0.004), rot=(rake, 0, 0), bevel=0.014)
    for i in range(4):
        m.box(w + 0.004, 0.006, d * 0.7, at=(0, -0.06 + i * 0.024, -0.004 - (i - 1.5) * 0.0038), rot=(rake, 0, 0), bevel=0.002)
    # trigger and its guard
    metal(m, DARK, NEAR)
    m.box(0.008, 0.03, 0.012, at=(0, 0.03, 0.04), rot=(0.25, 0, 0), bevel=0.003)
    m.tube([(0, 0.048, 0.022), (0, 0.012, 0.03), (0, 0.004, 0.058), (0, 0.03, 0.078), (0, 0.05, 0.075)], 0.004, 5)


def start(m, wid):
    name = 'opt_' + wid
    m.bone(name, None, (0, 0, 0))
    m.on(name)
    return name


def pack(name, builders):
    m = Model(name)
    for wid, fn in builders:
        start(m, wid)
        fn(m, wid)
    return m


def string_and_arrow(m, wid, y, z, kind, r=0.0035):
    """
    The string runs from each limb tip to the nock bone; pulling the nock back draws it. The
    arrow rides its own bone on the nock so the runtime can show it only while drawing.
    """
    root = 'opt_' + wid
    nock = root + '__nock'
    m.bone(nock, root, (0, 0, z))
    m.on(nock)
    if kind == 'arc': glow(m, CYAN, 0.9, 2.0)
    else: flat(m, 0xe9e2d0, 2.0)
    if m.weights is None: m.weights = {}
    for s in (1, -1):
        ring = lambda yy, zz: [(math.cos(a) * r, yy, zz + math.sin(a) * r) for a in (0, 2.1, 4.2)]
        vs = list(m.loft([ring(s * y, 0.0), ring(0.0, 0.0)]))
        # the limb end of each half stays on the bow, the middle rides the nock
        for i, v in enumerate(vs):
            m.weights[v] = [(root, 1.0)] if i < 3 else [(nock, 1.0)]
    arrow = root + '__arrow'
    m.bone(arrow, nock, (0, 0, 0))
    m.on(arrow)
    arc = kind == 'arc'
    if arc: glow(m, CYAN, 1.0, 1.4)
    elif kind == 'wood': wood(m, 0xd6a66a, 1.4)
    else: metal(m, IRON, 1.4)
    zcyl(m, 0.006, 0.006, 0.66, 6, 0, 0, 0.33)
    if arc: glow(m, CYAN, 3.0, 1.4)
    else: metal(m, BRIGHT, 1.4)
    m.cone(0.016, 0.07, 4, at=(0, 0, 0.695), rot=(PI / 2, 0, 0), scale=(1, 1, 0.45))
    if arc: glow(m, CYAN, 2.0, 1.4)
    else: flat(m, ORANGE if kind == 'wood' else HOT, 1.4)
    for i in range(3):
        m.box(0.002, 0.03, 0.09, at=(0, 0, 0.06), rot=(0, 0, i / 3 * PI * 2), bevel=0)
    m.on(root)


# ============================================================================== swords
def shop_blade(m, wid):
    """A machine-shop cleaver: ground bar stock with a painted spine and a heat-blued marker."""
    grip(m, ORANGE)
    metal(m, STEEL, NEAR)
    m.box(0.04, 0.03, 0.16, at=(0, 0.088, 0.012), bevel=0.01)
    m.bolt((0.02, 0.088, 0.06), 0.008, (1, 0, 0)); m.bolt((-0.02, 0.088, 0.06), 0.008, (-1, 0, 0))
    metal(m, 0xc3cad2, 1.2, rough=0.32)
    blade(m, [(0.1, -0.034, 0.042, 0.016), (0.5, -0.036, 0.06, 0.015), (0.8, -0.034, 0.072, 0.012), (0.9, -0.012, 0.06, 0.009), (0.955, 0.03, 0.04, 0.003)])
    paint(m, ORANGE, 1.2)
    m.box(0.019, 0.3, 0.012, at=(0, 0.3, -0.036), bevel=0.003)
    glow(m, HOT, 0.7)
    m.box(0.02, 0.05, 0.013, at=(0, 0.5, -0.037), bevel=0.003)
    metal(m, DARK)
    for y, z in ((0.2, 0.0), (0.3, 0.004)):
        xcyl(m, 0.012, 0.021, 8, 0, y, z, bevel=0.003)
    # lightening holes drilled through the flat
    flat(m, 0x0c0e11)
    for y in (0.42, 0.52, 0.62):
        xcyl(m, 0.008, 0.0162, 8, 0, y, 0.012)


def bandsaw(m, wid):
    """A sabre built round a running saw band: teeth down the edge, a wheel at each end."""
    grip(m, SLATE)
    metal(m, 0x6f7883, NEAR)
    m.box(0.04, 0.035, 0.12, at=(0, 0.09, 0.01), bevel=0.01)
    paint(m, ORANGE, NEAR)
    m.tube([(0, 0.085, 0.06), (0, 0.06, 0.092), (0, 0.03, 0.105), (0, -0.04, 0.108), (0, -0.09, 0.1), (0, -0.125, 0.07), (0, -0.14, 0.03)], 0.009, 6)
    metal(m, 0x8e97a1, 1.1)
    blade(m, [(0.11, -0.03, 0.035, 0.018), (0.4, -0.036, 0.04, 0.017), (0.7, -0.046, 0.034, 0.015), (0.92, -0.075, 0.0, 0.012), (1.0, -0.1, -0.05, 0.006)], ridge=0.8, grind=0.22)
    vent(m, DARK)
    m.box(0.011, 0.52, 0.03, at=(0, 0.45, -0.005), rot=(-0.03, 0, 0), bevel=0.002)
    metal(m, 0xe1e6ea, 1.1, rough=0.3)
    for i in range(14):
        u = i / 13; y = 0.16 + u * 0.78; z = 0.04 - u * u * 0.075
        m.cone(0.012, 0.03, 3, at=(0, y, z + 0.008), rot=(PI / 2 - 0.5 - u * 0.25, 0, 0), scale=(0.45, 1, 1))
    for y, z, R in ((0.16, 0.0, 0.046), (0.9, -0.05, 0.03)):
        metal(m, SLATE)
        xcyl(m, R, 0.024 if R > 0.04 else 0.022, 12, 0, y, z, bevel=0.004)
        glow(m, HOT, 0.9)
        xcyl(m, R * 0.4, 0.03, 8, 0, y, z)
        metal(m, DARK)
        for k in range(5):
            a = k / 5 * PI * 2
            for sx in (1, -1):
                m.bolt((sx * 0.012, y + math.cos(a) * R * 0.7, z + math.sin(a) * R * 0.7), 0.0045, (sx, 0, 0))


def arc_cutter(m, wid):
    """A dark carrier blade with a strip of cutting light riding ahead of it."""
    grip(m, INK, pommel=False)
    glow(m, CYAN, 0.84, NEAR)
    m.cyl(0.026, 0.026, 0.014, 10, at=(0, -0.03, 0))
    metal(m, 0x6f7883, NEAR)
    m.cyl(0.03, 0.022, 0.04, 8, at=(0, -0.15, 0), bevel=0.005)
    panel(m, GUN, NEAR)
    m.box(0.045, 0.05, 0.17, at=(0, 0.095, 0.01), bevel=0.014)
    glow(m, CYAN, 0.97, NEAR)
    m.box(0.05, 0.018, 0.06, at=(0, 0.1, 0.07), bevel=0.004)
    m.box(0.05, 0.018, 0.04, at=(0, 0.1, -0.055), bevel=0.004)
    metal(m, 0x343b46, 1.1, rough=0.5)
    blade(m, [(0.12, -0.04, 0.02, 0.02), (0.55, -0.038, 0.022, 0.018), (0.86, -0.03, 0.02, 0.014), (0.99, 0.018, 0.03, 0.004)], ridge=0.7, grind=0.2)
    glow(m, CYAN, 1.0, 1.1)
    blade(m, [(0.13, 0.026, 0.062, 0.012), (0.5, 0.028, 0.07, 0.012), (0.86, 0.026, 0.062, 0.01), (1.04, 0.028, 0.036, 0.002)], ridge=0.5, grind=0.5)
    metal(m, 0x6f7883)
    for y in (0.3, 0.52, 0.74):
        m.box(0.024, 0.03, 0.03, at=(0, y, 0.022), bevel=0.005)
        m.bolt((0.012, y, 0.022), 0.006, (1, 0, 0)); m.bolt((-0.012, y, 0.022), 0.006, (-1, 0, 0))
    paint(m, ORANGE)
    m.box(0.022, 0.5, 0.008, at=(0, 0.45, -0.041), bevel=0.002)
    # feed line from the guard up the spine
    rubber(m, DARK)
    m.tube([(0.014, 0.12, -0.03), (0.016, 0.2, -0.046), (0.014, 0.4, -0.048), (0.012, 0.7, -0.044), (0.008, 0.84, -0.036)], 0.0045, 5)


# ============================================================================== spears
def rebar_pike(m, wid):
    """Ribbed reinforcing bar with a ground point welded on, the weld still glowing."""
    metal(m, 0x74625a, 1.0, rough=0.6)
    m.cyl(0.016, 0.016, 1.9, 8, at=(0, 0.05, 0))
    metal(m, 0x5e4f48, 1.0, rough=0.65)
    for i in range(30):
        y = -0.84 + i * 0.058
        if -0.1 < y < 0.1 or 0.34 < y < 0.5: continue
        m.torus(0.0165, 0.0035, 8, 4, at=(0, y, 0), rot=(0.3, i * 0.9, 0))
    wrap(m, ORANGE, NEAR)
    m.cyl(0.023, 0.023, 0.16, 10, at=(0, 0.0, 0), bevel=0.003)
    wrap(m, SLATE, NEAR)
    m.cyl(0.023, 0.023, 0.14, 10, at=(0, 0.42, 0), bevel=0.003)
    metal(m, DARK)
    m.cyl(0.026, 0.02, 0.05, 8, at=(0, -0.9, 0), bevel=0.004)
    metal(m, 0x74625a, 1.0, rough=0.6)
    m.cyl(0.014, 0.014, 0.2, 8, at=(0, 0.98, 0), rot=(PI / 2, 0, 0))
    glow(m, HOT, 0.67)
    m.sphere(0.034, 8, 6, at=(0, 1.0, 0), scale=(1, 0.8, 1))
    metal(m, BRIGHT, 1.2, rough=0.3)
    m.lathe([(0.03, -0.17), (0.036, -0.1), (0.0, 0.17)], 4, at=(0, 1.18, 0), scale=(0.55, 1, 1), smooth=False)


def jack_lance(m, wid):
    """A pavement breaker on a pole: painted housing, exposed piston, chisel bit."""
    metal(m, IRON)
    m.cyl(0.019, 0.019, 1.75, 10, at=(0, -0.03, 0))
    rubber(m, RUBBER, NEAR)
    for y, L in ((0.0, 0.18), (0.42, 0.16)):
        m.cyl(0.025, 0.025, L, 10, at=(0, y, 0), bevel=0.004)
        for i in range(5):
            m.torus(0.0255, 0.0026, 10, 4, at=(0, y - L * 0.32 + i * L * 0.16, 0))
    paint(m, ORANGE)
    m.cyl(0.03, 0.022, 0.06, 8, at=(0, -0.9, 0), bevel=0.004)
    paint(m, ORANGE, 1.2)
    m.box(0.085, 0.27, 0.1, at=(0, 0.94, 0), bevel=0.02)
    stripe(m)
    m.box(0.089, 0.06, 0.104, at=(0, 0.86, 0), bevel=0.004)
    vent(m, 0x3a2a1c)
    m.box(0.09, 0.09, 0.03, at=(0, 0.97, 0.045), bevel=0.003)
    glow(m, HOT, 0.74)
    m.box(0.07, 0.07, 0.012, at=(0, 0.97, 0.05), bevel=0)
    metal(m, DARK)
    for sx in (1, -1):
        for y in (0.83, 1.05):
            for z in (-0.036, 0.036):
                m.bolt((sx * 0.043, y, z), 0.007, (sx, 0, 0))
    rubber(m, DARK)
    m.tube([(0, 0.8, -0.05), (0, 0.76, -0.07), (0, 0.72, -0.075), (0, 0.6, -0.05), (0, 0.52, -0.022)], 0.008, 6)
    metal(m, DARK)
    m.tube([(0, 1.02, -0.05), (0, 1.01, -0.11), (0, 0.99, -0.12), (0, 0.89, -0.12), (0, 0.87, -0.11), (0, 0.86, -0.05)], 0.01, 6)
    metal(m, BRIGHT, 1.2, rough=0.25)
    m.cyl(0.03, 0.036, 0.1, 10, at=(0, 1.12, 0), bevel=0.004)
    metal(m, GREY, 1.2)
    m.cyl(0.022, 0.022, 0.07, 10, at=(0, 1.19, 0))
    metal(m, 0xe1e6ea, 1.2, rough=0.3)
    m.lathe([(0.03, -0.13), (0.034, -0.06), (0.0, 0.13)], 4, at=(0, 1.35, 0), scale=(0.5, 1, 1.25), smooth=False)


def stormrod(m, wid):
    """A lightning rod turned round: copper coils, three tines and a captive spark."""
    metal(m, 0x2c3440, 1.0, rough=0.5)
    m.cyl(0.015, 0.017, 1.86, 8, at=(0, 0.03, 0))
    rubber(m, INK, NEAR)
    for y, L in ((0.0, 0.17), (0.42, 0.15)):
        m.cyl(0.022, 0.022, L, 8, at=(0, y, 0), bevel=0.003)
    metal(m, COPPER, 1.2, rough=0.35)
    for y in (-0.5, -0.09, 0.09, 0.34, 0.5, 0.62):
        m.cyl(0.021, 0.021, 0.014, 8, at=(0, y, 0), bevel=0.003)
    m.cone(0.028, 0.1, 6, at=(0, -0.94, 0), rot=(PI, 0, 0))
    for i in range(3):
        if i == 1: glow(m, CYAN, 1.25)
        else: metal(m, COPPER, 1.2, rough=0.35)
        m.torus(0.034 - i * 0.003, 0.009, 12, 6, at=(0, 0.86 + i * 0.05, 0))
    metal(m, COPPER, 1.2, rough=0.35)
    m.tube([(0.018, 0.66, 0), (0.024, 0.72, 0.012), (0.02, 0.78, -0.012), (0.03, 0.84, 0.0)], 0.004, 5)
    metal(m, IRON)
    m.cyl(0.03, 0.022, 0.06, 8, at=(0, 1.02, 0), bevel=0.004)
    metal(m, 0xc5ccd4, 1.2, rough=0.3)
    for i in range(3):
        a = i / 3 * PI * 2 + 0.5; c = math.cos(a); s = math.sin(a)
        m.tube([(c * 0.025, 1.04, s * 0.025), (c * 0.07, 1.09, s * 0.07), (c * 0.09, 1.14, s * 0.09), (c * 0.092, 1.2, s * 0.092), (c * 0.085, 1.26, s * 0.085), (c * 0.03, 1.38, s * 0.03)], 0.009, 5, r_end=0.004)
    glow(m, CYAN, 1.25)
    m.sphere(0.046, 10, 7, at=(0, 1.2, 0))
    glow(m, CYAN, 1.04)
    m.cone(0.014, 0.1, 5, at=(0, 1.42, 0))


# ============================================================================== bows
def trainer_bow(m, wid):
    """A laminated practice recurve with a cord grip."""
    pts = [(0, -0.7, -0.1), (0, -0.67, -0.132), (0, -0.64, -0.145), (0, -0.55, -0.138), (0, -0.45, -0.115), (0, -0.32, -0.07), (0, -0.2, -0.03), (0, -0.1, -0.005),
           (0, 0, 0.004), (0, 0.1, -0.005), (0, 0.2, -0.03), (0, 0.32, -0.07), (0, 0.45, -0.115), (0, 0.55, -0.138), (0, 0.64, -0.145), (0, 0.67, -0.132), (0, 0.7, -0.1)]
    wood(m, WOOD, 1.3)
    rings = []
    for i, (x, y, z) in enumerate(pts):
        t = abs(i - 8) / 8
        w = 0.024 * (1 - 0.35 * t); d = 0.014 * (1 - 0.3 * t)
        # the section turns with the curve so the belly always faces the archer
        tz = pts[min(i + 1, 16)][2] - pts[max(i - 1, 0)][2]; ty = pts[min(i + 1, 16)][1] - pts[max(i - 1, 0)][1]
        L = math.hypot(tz, ty); ny, nz = -tz / L, ty / L
        rings.append([(sx * w, y + ny * sd * d, z + nz * sd * d) for sx, sd in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
    m.loft(rings, smooth=False)
    wood(m, 0x6e4a2a, 1.3)
    m.box(0.05, 0.3, 0.008, at=(0, 0, 0.012), bevel=0.003)
    wrap(m, ORANGE, NEAR)
    m.cyl(0.024, 0.024, 0.15, 10, at=(0, 0, 0.002), scale=(1.1, 1, 1.25), bevel=0.004)
    metal(m, DARK, NEAR)
    m.box(0.05, 0.012, 0.03, at=(0.012, 0.085, 0.01), bevel=0.003)
    for k in (-1, 1):
        flat(m, CREAM, 1.2)
        m.cyl(0.02, 0.02, 0.05, 8, at=(0, k * 0.665, -0.13), rot=(k * 0.7, 0, 0), scale=(1.3, 1, 0.9), bevel=0.003)
        glow(m, HOT, 0.9)
        m.cyl(0.021, 0.021, 0.03, 8, at=(0, k * 0.3, -0.06), rot=(k * -0.33, 0, 0), scale=(1.35, 1, 0.9))
    string_and_arrow(m, wid, 0.645, -0.14, 'wood')


def tension_bow(m, wid):
    """A compound bow machined from plate: split limbs, cams, cables and a sight ring."""
    rubber(m, RUBBER, NEAR)
    m.box(0.032, 0.17, 0.05, at=(0, 0, 0.004), bevel=0.012)
    for k in (-1, 1):
        metal(m, IRON, 1.2)
        m.box(0.026, 0.2, 0.034, at=(0, k * 0.17, 0.04), rot=(k * 0.42, 0, 0), bevel=0.006)
        paint(m, ORANGE, 1.2)
        m.box(0.03, 0.06, 0.04, at=(0, k * 0.27, 0.07), bevel=0.008)
        metal(m, DARK)
        m.bolt((0.016, k * 0.27, 0.07), 0.007, (1, 0, 0)); m.bolt((-0.016, k * 0.27, 0.07), 0.007, (-1, 0, 0))
        panel(m, 0x2c3138, 1.2)
        for sx in (-1, 1):
            m.box(0.02, 0.34, 0.012, at=(sx * 0.016, k * 0.42, -0.02), rot=(k * -0.58, 0, 0), bevel=0.003)
        metal(m, 0xb4bcc5, 1.2, rough=0.3)
        xcyl(m, 0.055, 0.016, 14, 0, k * 0.56, -0.115, bevel=0.003)
        flat(m, 0x0c0e11)
        for a in (0.4, 2.5, 4.6):
            xcyl(m, 0.014, 0.0165, 8, 0, k * 0.56 + math.cos(a) * 0.032, -0.115 + math.sin(a) * 0.032)
        glow(m, HOT, 0.84)
        xcyl(m, 0.012, 0.022, 8, 0, k * 0.56, -0.115)
        metal(m, IRON)
        m.box(0.02, 0.05, 0.04, at=(0, k * 0.55, -0.1), bevel=0.005)
    flat(m, 0x9aa4ae, 2.0)
    m.box(0.004, 1.06, 0.004, at=(0.012, 0, -0.075), bevel=0)
    m.box(0.004, 1.06, 0.004, at=(-0.012, 0, -0.085), bevel=0)
    metal(m, DARK)
    zcyl(m, 0.009, 0.009, 0.2, 8, 0, -0.07, 0.15)
    paint(m, ORANGE)
    zcyl(m, 0.018, 0.018, 0.05, 8, 0, -0.07, 0.26, bevel=0.004)
    metal(m, DARK, NEAR)
    m.box(0.05, 0.012, 0.03, at=(0.012, 0.09, 0.02), bevel=0.003)
    m.torus(0.022, 0.004, 12, 5, at=(0.045, 0.14, 0.05), rot=(PI / 2, 0, 0))
    m.box(0.02, 0.006, 0.006, at=(0.03, 0.118, 0.05), bevel=0)
    glow(m, HOT, 1.18, NEAR)
    m.sphere(0.004, 6, 4, at=(0.045, 0.14, 0.05))
    string_and_arrow(m, wid, 0.6, -0.155, 'steel')


def arcstring(m, wid):
    """A bow of dark alloy whose string and arrows are light."""
    pts = [(0, -0.68, -0.15), (0, -0.6, -0.132), (0, -0.5, -0.1), (0, -0.38, -0.06), (0, -0.26, -0.02), (0, -0.1, 0.02), (0, 0.1, 0.02), (0, 0.26, -0.02), (0, 0.38, -0.06), (0, 0.5, -0.1), (0, 0.6, -0.132), (0, 0.68, -0.15)]
    metal(m, 0x2c3440, 1.3, rough=0.45)
    rings = []
    n = len(pts)
    for i, (x, y, z) in enumerate(pts):
        t = abs(i - (n - 1) / 2) / ((n - 1) / 2)
        w = 0.025 * (1 - 0.3 * t); d = 0.016 * (1 - 0.25 * t)
        tz = pts[min(i + 1, n - 1)][2] - pts[max(i - 1, 0)][2]; ty = pts[min(i + 1, n - 1)][1] - pts[max(i - 1, 0)][1]
        L = math.hypot(tz, ty); ny, nz = -tz / L, ty / L
        rings.append([(sx * w * ww, y + ny * sd * d, z + nz * sd * d) for sx, sd, ww in ((-1, -1, 0.6), (1, -1, 0.6), (1, 0, 1), (1, 1, 0.6), (-1, 1, 0.6), (-1, 0, 1))])
    m.loft(rings, smooth=False)
    panel(m, INK, NEAR)
    m.box(0.036, 0.16, 0.05, at=(0, 0, 0.01), bevel=0.012)
    for k in (-1, 1):
        glow(m, CYAN, 0.91, 1.2)
        m.box(0.052, 0.2, 0.01, at=(0, k * 0.38, -0.047), rot=(k * -0.36, 0, 0), bevel=0.002)
        metal(m, GREY, 1.2)
        m.box(0.06, 0.05, 0.05, at=(0, k * 0.17, 0.012), bevel=0.008)
        m.bolt((0.03, k * 0.17, 0.012), 0.007, (1, 0, 0)); m.bolt((-0.03, k * 0.17, 0.012), 0.007, (-1, 0, 0))
        metal(m, 0xc5ccd4, 1.2, rough=0.3)
        for sx in (1, -1):
            m.cone(0.02, 0.1, 5, at=(sx * 0.022, k * 0.72, -0.17), rot=(-0.3 if k > 0 else PI + 0.3, 0, 0))
        glow(m, CYAN, 1.18)
        m.sphere(0.022, 8, 6, at=(0, k * 0.675, -0.15))
    glow(m, CYAN, 1.04, NEAR)
    m.sphere(0.022, 8, 6, at=(0, 0.105, 0.045))
    metal(m, GREY, NEAR)
    m.box(0.05, 0.012, 0.03, at=(0.012, 0.085, 0.02), bevel=0.003)
    string_and_arrow(m, wid, 0.675, -0.15, 'arc', r=0.0045)


# ============================================================================== crossbows
def bolt_driver(m, wid):
    """A cordless drill with a steel prod bolted across its nose."""
    pistol_grip(m)
    paint(m, ORANGE, NEAR)
    m.box(0.07, 0.055, 0.115, at=(0, -0.115, 0.004), bevel=0.014)
    glow(m, CYAN, 0.84, NEAR)
    m.box(0.074, 0.012, 0.05, at=(0, -0.1, 0.03), bevel=0.003)
    paint(m, ORANGE, NEAR)
    zcyl(m, 0.05, 0.05, 0.25, 12, 0, 0.085, 0.04, bevel=0.008)
    vent(m, DARK, NEAR)
    for sx in (1, -1):
        m.box(0.006, 0.05, 0.09, at=(sx * 0.049, 0.085, -0.02), bevel=0)
    paint(m, SLATE, NEAR)
    zcyl(m, 0.045, 0.036, 0.05, 12, 0, 0.085, -0.11, bevel=0.006)
    metal(m, SLATE, NEAR)
    zcyl(m, 0.03, 0.042, 0.075, 12, 0, 0.085, 0.2, bevel=0.004)
    for i in range(3):
        m.torus(0.0385 - i * 0.004, 0.003, 12, 4, at=(0, 0.085, 0.178 + i * 0.022), rot=(PI / 2, 0, 0))
    metal(m, IRON, NEAR)
    m.box(0.032, 0.022, 0.5, at=(0, 0.142, 0.2), bevel=0.004)
    flat(m, 0x0c0e11, NEAR)
    m.box(0.012, 0.004, 0.46, at=(0, 0.154, 0.2), bevel=0)
    rubber(m, RUBBER, NEAR)
    m.box(0.04, 0.05, 0.07, at=(0, 0.075, 0.3), bevel=0.012)
    metal(m, 0xb4bcc5, 1.2, rough=0.35)
    P = [(-0.25, 0.14, 0.31), (-0.2, 0.14, 0.358), (-0.14, 0.14, 0.4), (-0.07, 0.14, 0.43), (0, 0.14, 0.44), (0.07, 0.14, 0.43), (0.14, 0.14, 0.4), (0.2, 0.14, 0.358), (0.25, 0.14, 0.31)]
    m.loft([[(x - 0.006 * (1 if x < 0 else -1) * 0, y - 0.016, z - 0.007), (x, y + 0.016, z - 0.007), (x, y + 0.016, z + 0.007), (x, y - 0.016, z + 0.007)] for x, y, z in P], smooth=False)
    flat(m, CREAM, 2.0)
    m.tube([(-0.25, 0.14, 0.31), (0, 0.158, 0.1)], 0.0035, 4)
    m.tube([(0.25, 0.14, 0.31), (0, 0.158, 0.1)], 0.0035, 4)
    metal(m, GREY, 1.4)
    zcyl(m, 0.007, 0.007, 0.3, 6, 0, 0.162, 0.26)
    glow(m, CYAN, 1.04, 1.4)
    m.cone(0.015, 0.06, 4, at=(0, 0.162, 0.44), rot=(PI / 2, 0, 0))
    metal(m, DARK, NEAR)
    m.box(0.036, 0.03, 0.03, at=(0, 0.158, 0.09), bevel=0.005)
    # notch and post sights along the rail
    m.box(0.022, 0.016, 0.008, at=(0, 0.18, 0.11), bevel=0.002)
    m.box(0.005, 0.02, 0.006, at=(0, 0.164, 0.42), bevel=0)


def twin_driver(m, wid):
    """Two motors, two rails, two prods: an over-and-under bolt thrower."""
    pistol_grip(m, 0.042, 0.14, 0.054)
    panel(m, 0x343b46, NEAR)
    m.box(0.085, 0.06, 0.13, at=(0, -0.118, 0.004), bevel=0.012)
    glow(m, CYAN, 0.97, NEAR)
    m.box(0.089, 0.014, 0.08, at=(0, -0.1, 0.02), bevel=0.003)
    for k in (-1, 1):
        paint(m, 0x343b46, NEAR)
        zcyl(m, 0.04, 0.04, 0.25, 10, k * 0.035, 0.085, 0.04, bevel=0.006)
        metal(m, GREY, NEAR)
        zcyl(m, 0.026, 0.034, 0.07, 10, k * 0.035, 0.085, 0.2, bevel=0.004)
        vent(m, DARK, NEAR)
        m.box(0.006, 0.04, 0.08, at=(k * 0.074, 0.085, -0.02), bevel=0)
    paint(m, ORANGE, NEAR)
    m.box(0.05, 0.055, 0.08, at=(0, 0.07, 0.31), bevel=0.01)
    for i in range(2):
        y = 0.142 + i * 0.062; w = 0.27 - i * 0.045; z0 = 0.33 - i * 0.03
        metal(m, 0x6f7883 if i else IRON, NEAR)
        m.box(0.03, 0.02, 0.52, at=(0, y, 0.21), bevel=0.004)
        if i: paint(m, ORANGE, 1.2)
        else: metal(m, 0xb4bcc5, 1.2, rough=0.35)
        P = [(-w, z0), (-w * 0.8, z0 + 0.05), (-w * 0.55, z0 + 0.09), (-w * 0.28, z0 + 0.12), (0, z0 + 0.13), (w * 0.28, z0 + 0.12), (w * 0.55, z0 + 0.09), (w * 0.8, z0 + 0.05), (w, z0)]
        m.loft([[(x, y - 0.015, z - 0.007), (x, y + 0.015, z - 0.007), (x, y + 0.015, z + 0.007), (x, y - 0.015, z + 0.007)] for x, z in P], smooth=False)
        flat(m, CREAM, 2.0)
        m.tube([(-w, y, z0), (0, y + 0.018, 0.1)], 0.0035, 4)
        m.tube([(w, y, z0), (0, y + 0.018, 0.1)], 0.0035, 4)
        metal(m, GREY, 1.4)
        zcyl(m, 0.007, 0.007, 0.3, 6, 0, y + 0.02, 0.27)
        glow(m, CYAN, 1.11, 1.4)
        m.cone(0.015, 0.06, 4, at=(0, y + 0.02, 0.45), rot=(PI / 2, 0, 0))
    metal(m, DARK, NEAR)
    m.box(0.04, 0.1, 0.03, at=(0, 0.18, 0.09), bevel=0.006)
    glow(m, HOT, 1.0, NEAR)
    m.box(0.012, 0.03, 0.012, at=(0, 0.245, 0.09), bevel=0.003)


# ============================================================================== rifles
def rivet_rifle(m, wid):
    """A pneumatic rivet gun grown long: air tank under the barrel, drum of rivets, wire stock."""
    pistol_grip(m, 0.04, 0.13, 0.05, 0.22)
    paint(m, ORANGE, NEAR)
    m.box(0.056, 0.095, 0.32, at=(0, 0.075, 0.07), bevel=0.012)
    panel(m, IRON, NEAR)
    m.box(0.06, 0.03, 0.14, at=(0, 0.1, 0.05), bevel=0.004)
    metal(m, DARK, NEAR)
    for sx in (1, -1):
        for z in (-0.06, 0.2):
            m.bolt((sx * 0.028, 0.045, z), 0.007, (sx, 0, 0))
    metal(m, GREY, 1.2, rough=0.35)
    zcyl(m, 0.019, 0.019, 0.6, 10, 0, 0.09, 0.52)
    metal(m, DARK, 1.2)
    zcyl(m, 0.034, 0.03, 0.08, 12, 0, 0.09, 0.85, bevel=0.005)
    flat(m, 0x0c0e11)
    zcyl(m, 0.014, 0.014, 0.012, 8, 0, 0.09, 0.887)
    stripe(m)
    zcyl(m, 0.026, 0.026, 0.03, 10, 0, 0.09, 0.6)
    paint(m, YELLOW, 1.2)
    m.capsule(0.043, 0.26, 10, at=(0, 0.018, 0.445), rot=(PI / 2, 0, 0))
    metal(m, SLATE, 1.2)
    zcyl(m, 0.046, 0.046, 0.04, 10, 0, 0.018, 0.445, bevel=0.003)
    zcyl(m, 0.012, 0.012, 0.03, 6, 0, 0.018, 0.61)
    rubber(m, DARK)
    m.tube([(0, 0.018, 0.61), (0.018, 0.022, 0.66), (0.03, 0.03, 0.68), (0.044, 0.05, 0.66), (0.045, 0.07, 0.6), (0.04, 0.082, 0.45), (0.035, 0.085, 0.3)], 0.008, 6)
    metal(m, SLATE, NEAR)
    xcyl(m, 0.05, 0.05, 12, 0, 0.0, 0.17, bevel=0.004)
    metal(m, BRIGHT, NEAR)
    for k in range(6):
        a = k / 6 * PI * 2
        for sx in (1, -1):
            m.bolt((sx * 0.026, math.cos(a) * 0.034, 0.17 + math.sin(a) * 0.034), 0.007, (sx, 0, 0))
    flat(m, CREAM, NEAR)
    xcyl(m, 0.022, 0.02, 10, 0.032, 0.11, -0.03)
    glow(m, HOT, 0.97, NEAR)
    m.box(0.012, 0.022, 0.006, at=(0.044, 0.115, -0.03), bevel=0)
    metal(m, IRON, NEAR)
    m.box(0.026, 0.026, 0.3, at=(0, 0.095, -0.22), bevel=0.006)
    m.box(0.026, 0.026, 0.27, at=(0, 0.02, -0.25), rot=(-0.3, 0, 0), bevel=0.006)
    rubber(m, RUBBER, NEAR)
    m.box(0.04, 0.14, 0.03, at=(0, 0.04, -0.375), bevel=0.01)
    # open sights: a notch over the receiver, a hooded post at the muzzle
    metal(m, DARK, NEAR)
    m.box(0.03, 0.014, 0.012, at=(0, 0.13, -0.05), bevel=0.002)
    m.box(0.005, 0.03, 0.006, at=(0, 0.125, 0.8), bevel=0)
    m.torus(0.014, 0.003, 10, 4, at=(0, 0.13, 0.8), rot=(PI / 2, 0, 0))


def rail_rifle(m, wid):
    """Two rails, a lit bore and a row of accelerator coils, fed from a cell in the stock."""
    pistol_grip(m, 0.04, 0.13, 0.05, 0.22)
    panel(m, 0x343b46, NEAR)
    m.box(0.06, 0.12, 0.3, at=(0, 0.08, 0.04), bevel=0.02)
    paint(m, ORANGE, NEAR)
    m.box(0.064, 0.02, 0.2, at=(0, 0.06, 0.05), bevel=0.004)
    metal(m, IRON, 1.2)
    m.box(0.03, 0.024, 0.74, at=(0, 0.128, 0.55), bevel=0.004)
    m.box(0.03, 0.024, 0.74, at=(0, 0.048, 0.55), bevel=0.004)
    glow(m, CYAN, 0.75, 1.2)
    m.box(0.012, 0.05, 0.7, at=(0, 0.088, 0.55), bevel=0)
    for i in range(4):
        z = 0.3 + i * 0.165
        metal(m, COPPER if i % 2 else GREY, 1.2, rough=0.35)
        m.box(0.07, 0.115, 0.04, at=(0, 0.088, z), bevel=0.008)
        for sx in (1, -1):
            for y in (0.045, 0.131):
                m.bolt((sx * 0.035, y, z), 0.006, (sx, 0, 0))
        glow(m, CYAN, 0.97, 1.2)
        m.box(0.074, 0.03, 0.02, at=(0, 0.088, z), bevel=0.002)
    metal(m, DARK, 1.2)
    m.box(0.04, 0.03, 0.05, at=(0, 0.128, 0.93), bevel=0.006)
    m.box(0.04, 0.03, 0.05, at=(0, 0.048, 0.93), bevel=0.006)
    rubber(m, RUBBER, NEAR)
    m.box(0.042, 0.05, 0.14, at=(0, 0.012, 0.38), bevel=0.012)
    glow(m, CYAN, 0.91, NEAR)
    zcyl(m, 0.036, 0.036, 0.13, 10, 0, 0.1, -0.16)
    metal(m, GREY, NEAR)
    zcyl(m, 0.042, 0.042, 0.03, 10, 0, 0.1, -0.1, bevel=0.004)
    zcyl(m, 0.042, 0.042, 0.03, 10, 0, 0.1, -0.225, bevel=0.004)
    for a in (0.5, 2.6, 4.7):
        m.strut((math.cos(a) * 0.04, 0.1 + math.sin(a) * 0.04, -0.225), (math.cos(a) * 0.04, 0.1 + math.sin(a) * 0.04, -0.1), 0.004)
    panel(m, 0x343b46, NEAR)
    m.box(0.034, 0.05, 0.16, at=(0, 0.03, -0.26), rot=(-0.25, 0, 0), bevel=0.008)
    rubber(m, RUBBER, NEAR)
    m.box(0.044, 0.15, 0.035, at=(0, 0.055, -0.36), bevel=0.012)
    # optic: a tube on two rings, a lit lens at each end
    metal(m, DARK, NEAR)
    zcyl(m, 0.022, 0.022, 0.17, 10, 0, 0.185, 0.06, bevel=0.004)
    zcyl(m, 0.026, 0.026, 0.02, 10, 0, 0.185, 0.14, bevel=0.003)
    for z in (0.0, 0.1):
        m.box(0.016, 0.034, 0.014, at=(0, 0.155, z), bevel=0.003)
    glow(m, HOT, 0.91, NEAR)
    zcyl(m, 0.018, 0.018, 0.006, 10, 0, 0.185, 0.151)
    glow(m, CYAN, 0.5, NEAR)
    zcyl(m, 0.017, 0.017, 0.006, 10, 0, 0.185, -0.027)
