"""
Pallet Jack: a grumpy pallet truck that settles arguments fork-first. Chest-high, 1.3 m.

Bones (driven by src/entities/robots/pallet.ts):
  truck              whole machine, pivot on the ground under the mast
    forks            carriage and tines; slides up the mast and tilts
    eye              the cab head on its neck
      beacon         amber beacon, spins
    wheelsR, wheelsF the two axles, spin about x
    tiller           steering arm at the back
    armL, armR       piston arms on the shoulder yoke
    flap             exhaust rain cap, chatters with the revs
    opt_<variant>... variant dressing (also under forks, eye and the arms)
"""
import math

from lib.kit import Model, PI

TEX = 512
BUILD = dict(ao_dist=0.3, edge_dist=0.025, edge_w=0.008, scale=1.0)

YELLOW = 0xf2b632
CHROME = 0xd8dde2


def wheels(m, r, w, x):
    for s in (-1, 1):
        m.rubber(texel=0.8)
        m.cyl(r, r, w, 12, at=(s * x, 0, 0), rot=(0, 0, PI / 2), bevel=r * 0.16)
        m.paint('body2', texel=0.6)
        m.cyl(r * 0.56, r * 0.6, 0.03, 8, at=(s * (x + w / 2), 0, 0), rot=(0, 0, -s * PI / 2))
        # an off-centre lug bar so the spin reads
        m.darkmetal(texel=0.3)
        m.box(0.02, r * 0.26, r * 0.98, at=(s * (x + w / 2 + 0.012), 0, 0), bevel=0)
    m.darkmetal(texel=0.3)
    m.cyl(0.03, 0.03, x * 2, 5, rot=(0, 0, PI / 2), cap=False)


def pallet(m, w, d, at, rot):
    """A shipping pallet lying flat (deck up), w across x, d along z."""
    m.push(at=at, rot=rot)
    m.wood(texel=0.8)
    n = 5
    for i in range(n):
        m.box(w, 0.022, d / n - 0.02, at=(0, 0.04, -d / 2 + (i + 0.5) * d / n), bevel=0)
    for i in (-1, 1):
        m.box(w, 0.02, 0.09, at=(0, -0.04, i * (d / 2 - 0.045)), bevel=0)
    m.wood(slot='woodDark', texel=0.6)
    for i in (-1, 0, 1):
        m.box(0.07, 0.06, d, at=(i * (w / 2 - 0.035), 0, 0), bevel=0)
    m.pop()


def make():
    m = Model('pallet')
    m.bone('truck', None, (0, 0, 0))

    # ---- frame: a dark ladder under everything, straddle legs out to the front axle --------
    m.darkmetal(texel=0.6)
    m.box(0.8, 0.1, 0.76, at=(0, 0.25, -0.47), bevel=0.02)
    for s in (-1, 1):
        m.box(0.07, 0.07, 0.34, at=(s * 0.3, 0.2, 0.02), bevel=0)
        m.box(0.05, 0.12, 0.06, at=(s * 0.3, 0.16, -0.08), bevel=0)

    # ---- power unit: cream panels on the frame, grey counterweight behind ------------------
    m.panel('body', texel=1.25)
    m.box(0.76, 0.44, 0.58, at=(0, 0.52, -0.46), bevel=0.045)
    m.panel('body', texel=1.0)
    m.box(0.6, 0.2, 0.42, at=(0, 0.82, -0.5), bevel=0.045)
    m.paint('body2', texel=0.9)
    m.box(0.7, 0.36, 0.12, at=(0, 0.5, -0.8), bevel=0.04)
    m.vent(texel=0.9)
    m.box(0.36, 0.15, 0.02, at=(0, 0.55, -0.862), bevel=0)
    # the weak point: the battery's lit vent, framed in hazard bars, square on the back
    m.glow(slot='glow2', emit=1.4, texel=0.8)
    m.box(0.26, 0.05, 0.014, at=(0, 0.55, -0.874), bevel=0)
    m.stripe(YELLOW, texel=0.8)
    for s in (-1, 1):
        m.box(0.035, 0.19, 0.024, at=(s * 0.205, 0.55, -0.864), bevel=0)
    m.stripe(YELLOW, texel=0.8)
    m.box(0.66, 0.075, 0.02, at=(0, 0.375, -0.862), bevel=0)
    for s in (-1, 1):
        m.stripe(YELLOW, texel=0.8)
        m.box(0.02, 0.085, 0.5, at=(s * 0.382, 0.36, -0.46), bevel=0)
        m.vent(texel=0.8)
        m.box(0.02, 0.15, 0.24, at=(s * 0.382, 0.6, -0.56), bevel=0)
        # fenders over the drive wheels, a headlamp on each
        m.paint('body2', texel=0.9)
        m.box(0.2, 0.085, 0.5, at=(s * 0.465, 0.465, -0.52), bevel=0.03)
        m.darkmetal(texel=0.5)
        m.cyl(0.05, 0.056, 0.08, 8, at=(s * 0.465, 0.545, -0.31), rot=(PI / 2, 0, 0))
        m.glow(emit=1.0, texel=0.6)
        m.sphere(0.04, 8, 3, at=(s * 0.465, 0.545, -0.272), scale=(1, 1, 0.45))
    # status lamps on the cowl's back edge
    for i in range(3):
        m.glow(slot='glow2' if i == 2 else 'glow', emit=1.0, texel=0.35)
        m.box(0.09, 0.03, 0.014, at=(-0.12 + i * 0.12, 0.85, -0.713), bevel=0)
    # exhaust stack in a heat shield
    m.steel(texel=0.6)
    m.cyl(0.036, 0.04, 0.4, 7, at=(0.33, 0.93, -0.64))
    m.vent(texel=0.6)
    m.cyl(0.054, 0.054, 0.17, 7, at=(0.33, 0.9, -0.64), cap=False)
    m.darkmetal(texel=0.3)
    m.cyl(0.058, 0.064, 0.05, 7, at=(0.33, 0.765, -0.64))

    # ---- mast: two channel uprights, the lift ram between them -----------------------------
    for s in (-1, 1):
        m.steel(texel=1.0)
        m.box(0.08, 0.84, 0.11, at=(s * 0.3, 0.57, -0.1), bevel=0.014)
        m.darkmetal(texel=0.5)
        m.box(0.03, 0.78, 0.05, at=(s * 0.247, 0.57, -0.1), bevel=0)
    m.steel(texel=0.9)
    m.box(0.68, 0.08, 0.11, at=(0, 0.975, -0.1), bevel=0.018)
    m.darkmetal(texel=0.6)
    m.box(0.67, 0.07, 0.1, at=(0, 0.2, -0.1), bevel=0)
    m.cyl(0.046, 0.05, 0.44, 8, at=(0, 0.44, -0.14))
    m.fixed(CHROME, surf='metal', metal=1.0, rough=0.25, texel=0.4)
    m.cyl(0.026, 0.026, 0.29, 6, at=(0, 0.8, -0.14), cap=False)
    # hoses from the pump to the ram head and the mast top
    m.rubber(texel=0.35)
    m.tube([(0.2, 0.9, -0.34), (0.22, 1.0, -0.28), (0.2, 1.02, -0.2), (0.16, 0.97, -0.15)], 0.014, seg=5)
    m.tube([(-0.2, 0.74, -0.24), (-0.16, 0.84, -0.16), (-0.08, 0.72, -0.13), (-0.04, 0.66, -0.14)], 0.013, seg=5)

    # ---- neck and the shoulder yoke -----------------------------------------------------------
    m.darkmetal(texel=0.6)
    m.cyl(0.07, 0.09, 0.16, 8, at=(0, 0.99, -0.38))
    m.steel(texel=0.4)
    m.cyl(0.084, 0.084, 0.03, 8, at=(0, 1.0, -0.38))
    m.steel(texel=0.6)
    m.cyl(0.055, 0.055, 0.94, 7, at=(0, 0.82, -0.5), rot=(0, 0, PI / 2), cap=False)

    # ---- variant dressing on the body -----------------------------------------------------
    m.bone('opt_night', 'truck', (0, 0, 0))
    for s in (-1, 1):
        m.glow(slot='glow' if s > 0 else 'glow2', emit=1.2, texel=0.4)
        m.box(0.014, 0.028, 0.5, at=(s * 0.394, 0.47, -0.46), bevel=0)
        # searchlights on the mast head
        m.darkmetal(texel=0.5)
        m.cyl(0.06, 0.05, 0.1, 8, at=(s * 0.32, 1.075, -0.09), rot=(PI / 2, 0, 0))
        m.box(0.03, 0.05, 0.03, at=(s * 0.32, 1.025, -0.1), bevel=0)
        m.glow(slot='glow', emit=1.2, texel=0.6)
        m.sphere(0.042, 8, 3, at=(s * 0.32, 1.075, -0.04), scale=(1, 1, 0.4))
    m.glow(slot='glow2', emit=1.2, texel=0.4)
    m.box(0.46, 0.022, 0.012, at=(0, 0.975, -0.04), bevel=0)

    m.bone('opt_rare', 'truck', (0, 0, 0))
    # show truck: a pennant on a whip aerial
    m.darkmetal(texel=0.3)
    m.strut((-0.3, 0.74, -0.68), (-0.3, 1.42, -0.72), 0.014, 0.007, 5)
    m.mat(slot='glow', surf='cloth', metal=0, rough=0.9, emit=0.5, texel=0.7)
    m.prism([(0, 0), (0.26, 0.07), (0, 0.15)], 0.012, at=(-0.3, 1.24, -0.726), rot=(0, PI / 2, 0))
    m.glow(slot='glow2', emit=1.5, texel=0.3)
    m.sphere(0.026, 6, 4, at=(-0.3, 1.43, -0.72))

    m.bone('opt_elite', 'truck', (0, 0, 0))
    # Big Pallet: striped side skirts and a second stack
    m.stripe(0xffc23a, texel=1.0)
    for s in (-1, 1):
        m.box(0.035, 0.3, 0.56, at=(s * 0.4, 0.56, -0.46), bevel=0.01)
    m.steel(texel=0.6)
    m.cyl(0.036, 0.04, 0.4, 7, at=(-0.33, 0.93, -0.64))
    m.darkmetal(texel=0.3)
    m.cyl(0.058, 0.064, 0.05, 7, at=(-0.33, 0.765, -0.64))
    m.cyl(0.05, 0.04, 0.045, 7, at=(-0.33, 1.14, -0.64))

    # ---- exhaust rain cap -----------------------------------------------------------------
    m.bone('flap', 'truck', (0.33, 1.135, -0.69))
    m.darkmetal(texel=0.35)
    m.cyl(0.05, 0.05, 0.014, 7, at=(0, 0.004, 0.05))
    m.box(0.03, 0.02, 0.03, at=(0, 0, -0.005), bevel=0)

    # ---- forks: carriage plate, load backrest and two tines -------------------------------
    m.bone('forks', 'truck', (0, 0.07, -0.03))
    m.panel('body', texel=1.2)
    m.box(0.68, 0.38, 0.07, at=(0, 0.21, 0.02), bevel=0.02)
    # a chest block over the plate with a work lamp set into it, steel rail on top
    m.panel('body', texel=1.1)
    m.box(0.5, 0.22, 0.07, at=(0, 0.5, 0.02), bevel=0.022)
    m.steel(texel=0.4)
    m.box(0.58, 0.03, 0.04, at=(0, 0.625, 0.01), bevel=0)
    m.darkmetal(texel=0.5)
    m.box(0.2, 0.1, 0.03, at=(-0.11, 0.5, 0.05), bevel=0.01)
    m.glow(emit=1.1, texel=0.6)
    m.box(0.15, 0.058, 0.02, at=(-0.11, 0.5, 0.064), bevel=0.008)
    m.vent(texel=0.6)
    m.box(0.16, 0.1, 0.012, at=(0.13, 0.5, 0.056), bevel=0)
    m.paint('body2', texel=0.7)
    m.box(0.2, 0.13, 0.05, at=(0, 0.25, 0.07), bevel=0.014)
    m.glow(slot='glow2', emit=1.0, texel=0.4)
    m.box(0.12, 0.03, 0.012, at=(0, 0.26, 0.098), bevel=0)
    for s in (-1, 1):
        # heel: a striped shank block, then the tine
        m.stripe(YELLOW, texel=1.1)
        m.box(0.17, 0.36, 0.09, at=(s * 0.2, 0.17, 0.085), bevel=0.018)
        m.steel(texel=0.9)
        m.box(0.16, 0.07, 0.38, at=(s * 0.2, 0, 0.27), bevel=0.014)
        m.stripe(YELLOW, texel=1.1)
        m.box(0.16, 0.07, 0.7, at=(s * 0.2, 0, 0.81), bevel=0.014)
        m.fixed(YELLOW, surf='paint', metal=0.3, rough=0.55, texel=0.8)
        m.box(0.16, 0.042, 0.2, at=(s * 0.2, -0.011, 1.25), rot=(0.07, 0, 0), bevel=0.014)
        m.rubber(texel=0.4)
        m.cyl(0.05, 0.05, 0.1, 8, at=(s * 0.2, -0.02, 0.95), rot=(0, 0, PI / 2))

    m.bone('opt_night_forks', 'forks', (0, 0, 0))
    # running lights down the outside of each tine
    m.glow(slot='glow2', emit=1.2, texel=0.4)
    for s in (-1, 1):
        m.box(0.012, 0.022, 0.86, at=(s * 0.286, 0.004, 0.86), bevel=0)
    m.bone('opt_rare_forks', 'forks', (0, 0, 0))
    # a polished crest on the carriage
    m.steel(slot='trim', texel=0.8)
    m.cyl(0.14, 0.14, 0.03, 4, at=(0, 0.25, 0.1), rot=(PI / 2, 0, 0), bevel=0.008)
    m.glow(emit=1.3, texel=0.5)
    m.sphere(0.05, 6, 3, at=(0, 0.25, 0.116), scale=(1, 1, 0.5))
    m.bone('opt_elite_forks', 'forks', (0, 0, 0))
    # a striped ram plate with two spikes, and steel shoes on the tines
    m.stripe(0xffc23a, texel=1.2)
    m.box(0.74, 0.44, 0.03, at=(0, 0.22, 0.135), bevel=0.01)
    m.steel(texel=0.6)
    for s in (-1, 1):
        m.cone(0.055, 0.17, 6, at=(s * 0.2, 0.3, 0.23), rot=(PI / 2, 0, 0))
        m.box(0.17, 0.07, 0.22, at=(s * 0.2, -0.004, 1.26), rot=(0.06, 0, 0), bevel=0.012)
        m.cone(0.05, 0.14, 4, at=(s * 0.2, -0.01, 1.43), rot=(PI / 2, PI / 4, 0))

    # ---- head: a cab with one wide lamp for an eye ------------------------------------------
    m.bone('eye', 'truck', (0, 1.1, -0.36))
    m.panel('body', texel=1.3)
    m.box(0.42, 0.28, 0.33, at=(0, 0.06, 0), bevel=0.055)
    m.fixed(0x0a0e12, surf='glass', rough=0.25, metal=0.3, texel=0.9)
    m.box(0.34, 0.14, 0.02, at=(0, 0.05, 0.161), bevel=0.006)
    m.glow(emit=1.6, texel=1.3)
    m.box(0.27, 0.078, 0.02, at=(0, 0.05, 0.171), bevel=0.008)
    m.darkmetal(texel=0.3)
    for s in (-1, 1):
        m.box(0.013, 0.088, 0.012, at=(s * 0.046, 0.05, 0.181), bevel=0)
    # grumpy brow, chin grille, ear hubs
    m.paint('body2', texel=0.9)
    m.box(0.46, 0.06, 0.22, at=(0, 0.2, 0.09), rot=(0.4, 0, 0), bevel=0.016)
    m.darkmetal(texel=0.6)
    m.box(0.3, 0.05, 0.27, at=(0, -0.095, 0.01), bevel=0.012)
    m.vent(texel=0.6)
    m.box(0.22, 0.034, 0.012, at=(0, -0.095, 0.147), bevel=0)
    m.steel(texel=0.5)
    for s in (-1, 1):
        m.cyl(0.05, 0.058, 0.04, 8, at=(s * 0.225, 0.04, 0), rot=(0, 0, -s * PI / 2))
    m.stripe(YELLOW, texel=0.7)
    m.box(0.22, 0.012, 0.13, at=(0.05, 0.202, -0.075), bevel=0)
    m.darkmetal(texel=0.3)
    m.cyl(0.04, 0.046, 0.02, 7, at=(-0.13, 0.208, -0.08))

    m.bone('beacon', 'eye', (-0.13, 0.22, -0.08))
    m.glow(slot='glow2', emit=1.3, texel=0.5)
    m.cyl(0.026, 0.03, 0.05, 7, at=(0, 0.025, 0))
    m.darkmetal(texel=0.3)
    m.cyl(0.034, 0.034, 0.012, 7, at=(0, 0.056, 0))
    m.box(0.012, 0.05, 0.05, at=(0.03, 0.025, 0), bevel=0)

    m.bone('opt_elite_eye', 'eye', (0, 0, 0))
    r = 0.12
    m.push(at=(0.05, 0.2, -0.05))
    m.steel(slot='trim', texel=0.7)
    m.cyl(r * 1.02, r * 1.08, r * 0.3, 10, at=(0, r * 0.15, 0), bevel=0.006)
    for i in range(5):
        a = (i / 5) * PI * 2 + PI / 2
        px, pz = math.cos(a) * r * 0.92, math.sin(a) * r * 0.92
        m.steel(slot='trim', texel=0.5)
        m.cone(r * 0.2, r * 0.7, 4, at=(px, r * 0.62, pz))
        m.glow(emit=1.6, texel=0.3)
        m.sphere(r * 0.1, 5, 4, at=(px, r * 1.0, pz))
    m.pop()

    # ---- wheels ---------------------------------------------------------------------------
    m.bone('wheelsR', 'truck', (0, 0.2, -0.52))
    wheels(m, 0.2, 0.15, 0.45)
    m.bone('wheelsF', 'truck', (0, 0.13, -0.08))
    wheels(m, 0.13, 0.1, 0.38)

    # ---- tiller ---------------------------------------------------------------------------
    m.bone('tiller', 'truck', (0, 0.7, -0.8))
    m.steel(texel=0.4)
    m.sphere(0.06, 7, 5)
    m.darkmetal(texel=0.5)
    m.strut((0, 0, 0), (0, 0.5, -0.18), 0.034, 0.026, 6)
    m.box(0.07, 0.05, 0.06, at=(0, 0.5, -0.18), rot=(0.35, 0, 0), bevel=0)
    m.rubber(texel=0.5)
    m.torus(0.095, 0.026, 10, 5, at=(0, 0.59, -0.213), rot=(0.35 + PI / 2, 0, 0))
    m.glow(slot='glow2', emit=1.0, texel=0.25)
    m.box(0.03, 0.02, 0.02, at=(0, 0.515, -0.15), rot=(0.35, 0, 0), bevel=0)

    # ---- piston arms ----------------------------------------------------------------------
    th = -0.34
    c, sn = math.cos(th), math.sin(th)
    for name, s in (('armL', 1), ('armR', -1)):
        m.bone(name, 'truck', (s * 0.5, 0.82, -0.5))
        E = (s * 0.22, 0.3, 0.12)
        m.paint('body2', texel=0.8)
        m.cyl(0.1, 0.1, 0.13, 10, at=(s * 0.03, 0, 0), rot=(0, 0, PI / 2), bevel=0.014)
        m.steel(texel=0.3)
        m.cyl(0.04, 0.04, 0.15, 6, at=(s * 0.03, 0, 0), rot=(0, 0, PI / 2))
        m.steel(texel=0.8)
        m.strut((s * 0.07, 0.02, 0.01), E, 0.056, 0.05, 6)
        m.paint('body', texel=0.7)
        m.cyl(0.08, 0.08, 0.13, 10, at=E, rot=(0, 0, PI / 2), bevel=0.012)
        m.steel(texel=0.3)
        m.cyl(0.032, 0.032, 0.15, 6, at=E, rot=(0, 0, PI / 2))
        # forearm: a panelled box beam with a hazard cuff and a two-finger clamp
        m.push(at=E, rot=(th, 0, 0))
        m.panel('body', texel=1.0)
        m.box(0.125, 0.38, 0.135, at=(0, -0.25, 0), bevel=0.024)
        m.stripe(YELLOW, texel=0.7)
        m.box(0.133, 0.07, 0.143, at=(0, -0.385, 0), bevel=0)
        m.darkmetal(texel=0.5)
        m.box(0.1, 0.08, 0.15, at=(0, -0.48, 0), bevel=0.012)
        m.steel(texel=0.5)
        for k in (-1, 1):
            m.box(0.06, 0.18, 0.04, at=(0, -0.59, k * 0.066), rot=(k * 0.3, 0, 0), bevel=0.009)
        m.pop()
        # ram from the shoulder to the forearm
        A = (s * 0.19, -0.05, 0.1)
        C = (E[0] - s * 0.005, E[1] + (-0.2) * c - 0.085 * sn, E[2] + (-0.2) * sn + 0.085 * c)
        mid = tuple(A[i] + (C[i] - A[i]) * 0.55 for i in range(3))
        m.darkmetal(texel=0.4)
        m.strut(A, mid, 0.027, 0.027, 6)
        m.box(0.06, 0.05, 0.05, at=(s * 0.14, -0.05, 0.08), bevel=0)
        m.fixed(CHROME, surf='metal', metal=1.0, rough=0.25, texel=0.3)
        m.strut(mid, C, 0.014, 0.014, 5)

        m.bone('opt_elite_' + name, name, (0, 0, 0))
        # Big Pallet carries its own pallets: one strapped to each forearm as a shield
        m.push(at=E, rot=(th, 0, 0))
        pallet(m, 0.52, 0.44, at=(s * 0.13, -0.24, 0.0), rot=(PI / 2, 0, -s * PI / 2))
        m.steel(texel=0.3)
        for y in (-0.12, -0.34):
            m.box(0.16, 0.03, 0.15, at=(s * 0.02, y, 0), bevel=0)
        m.pop()
    m.thin_far(0.17)
    return m
