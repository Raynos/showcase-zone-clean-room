"""
Vault Warden: a strongroom door that learned to walk. A squat white-grey golem, 3.4 m, with
yellow shoulder and forearm armour, a round cyan core in a bezel where the door's dial was,
a door-slab shield on the left forearm and a piston fist on the right.

Bones (driven by src/entities/robots/warden.ts):
  all                 whole-body pivot at the ground (death fall, spawn rise)
    hips              pelvis pivot at hip height
      legL, legR      one bone per leg, pivot at the hip ball
      torso           pelvis, waist, chest hull, shoulders, reactor
        dial          combination wheel in front of the core, spins about z
        head
        armL          shield arm, pivot at the shoulder ball
        armR          piston arm
          fist        slides down the arm's axis when the piston fires
        opt_rare / opt_elite / opt_night        variant dressing
"""
import math

from lib.kit import Model, PI

TEX = 1024
BUILD = dict(ao_dist=0.55, edge_dist=0.05, edge_w=0.010, scale=2.5, chip=0.7, grime=0.85)

HIP = 1.15
HULL = 0xc6cbd0     # white-grey armour
HULL2 = 0x8f99a4    # second-tone plates
BRASS = 0xd9a441
INK = 0x0b1116


def hull(m, texel=1.0, color=HULL):
    m.fixed(color, surf='panel', metal=0.25, rough=0.6, texel=texel)


def hullp(m, texel=1.0, color=HULL):
    m.fixed(color, surf='paint', metal=0.25, rough=0.6, texel=texel)


def brass(m, texel=0.6):
    m.fixed(BRASS, surf='metal', metal=0.9, rough=0.4, texel=texel)


def ring_pts(n, r, a0=0.0):
    return [(math.cos(a0 + i / n * 2 * PI) * r, math.sin(a0 + i / n * 2 * PI) * r) for i in range(n)]


CH = (0.0, 0.98, 0.0)            # chest centre, relative to the torso bone
RA, RB, RC = 0.84, 0.72, 0.6     # chest ellipsoid half-extents
FZ = 0.6                         # front of the bezel


def chest_plate(m, phi, theta, w, h, t=0.1, bevel=0.04):
    """A plate lying on the chest ellipsoid at azimuth phi (0 = front) and elevation theta."""
    ct, st = math.cos(theta), math.sin(theta)
    x, y, z = RA * ct * math.sin(phi), RB * st, RC * ct * math.cos(phi)
    nx, ny, nz = x / RA ** 2, y / RB ** 2, z / RC ** 2
    yaw = math.atan2(nx, nz)
    pitch = math.atan2(ny, math.hypot(nx, nz))
    m.push(at=(CH[0] + x, CH[1] + y, CH[2] + z), rot=(0, yaw, 0))
    m.box(w, h, t, rot=(-pitch, 0, 0), bevel=bevel)
    m.pop()


def leg(m, s):
    # hip: dark ball in the pelvis socket, yellow disc on the outside
    m.darkmetal(texel=0.8)
    m.sphere(0.3, 12, 8)
    m.paint('body', texel=0.7)
    m.cyl(0.2, 0.2, 0.07, 12, at=(s * 0.29, 0, 0), rot=(0, 0, PI / 2), bevel=0.015)
    m.steel(texel=0.5)
    m.cyl(0.09, 0.09, 0.05, 8, at=(s * 0.33, 0, 0), rot=(0, 0, PI / 2))
    # thigh: frame member, twin rams behind, armour on the front and outside
    m.darkmetal(texel=0.7)
    m.strut((0, -0.05, 0), (0, -0.54, 0.03), 0.23, 0.2, 10)
    m.steel(texel=0.5)
    for dx in (-0.1, 0.1):
        m.strut((dx, -0.12, -0.19), (dx, -0.52, -0.16), 0.04, 0.04, 6)
    hull(m, 1.0)
    m.box(0.5, 0.38, 0.16, at=(0, -0.3, 0.24), rot=(-0.06, 0, 0), bevel=0.04)
    m.box(0.14, 0.36, 0.46, at=(s * 0.27, -0.3, 0.0), bevel=0.04)
    # knee: dark ball on a through-axle, yellow cap
    m.darkmetal(texel=0.8)
    m.sphere(0.27, 12, 7, at=(0, -0.56, 0.03))
    m.steel(texel=0.5)
    m.cyl(0.11, 0.11, 0.66, 10, at=(0, -0.56, 0.03), rot=(0, 0, PI / 2), bevel=0.02)
    m.panel('body', texel=0.9)
    m.box(0.34, 0.2, 0.12, at=(0, -0.55, 0.31), rot=(0.1, 0, 0), bevel=0.035)
    # shin: the big white block
    hull(m, 1.1)
    m.box(0.68, 0.44, 0.68, at=(0, -0.8, 0.03), bevel=0.095)
    hull(m, 0.9, HULL2)
    m.box(0.44, 0.3, 0.1, at=(0, -0.8, 0.36), bevel=0.03)
    m.vent(texel=0.9)
    m.box(0.05, 0.24, 0.38, at=(s * 0.345, -0.8, 0.0), bevel=0)
    m.steel(texel=0.5)
    m.strut((0, -0.5, -0.24), (0, -1.0, -0.44), 0.045, 0.045, 6)
    # ankle and foot
    m.darkmetal(texel=0.7)
    m.cyl(0.19, 0.19, 0.6, 10, at=(0, -0.98, 0.0), rot=(0, 0, PI / 2), bevel=0.02)
    m.box(0.5, 0.16, 0.22, at=(0, -1.01, -0.42), bevel=0.04)
    hull(m, 1.1)
    m.box(0.8, 0.22, 0.94, at=(0, -0.99, 0.16), bevel=0.07)
    m.box(0.7, 0.2, 0.34, at=(0, -0.92, 0.55), rot=(0.3, 0, 0), bevel=0.05)
    hull(m, 0.8, HULL2)
    for dx in (-0.2, 0.0, 0.2):
        m.box(0.16, 0.05, 0.2, at=(dx * 1.15, -0.872, 0.52), rot=(0.3, 0, 0), bevel=0.012)
    m.rubber(texel=0.5)
    m.box(0.82, 0.06, 1.12, at=(0, -1.12, 0.13), bevel=0)


def make():
    m = Model('warden')
    m.bone('all', None, (0, 0, 0))
    m.bone('hips', 'all', (0, HIP, 0))

    # ======================================================================================
    m.bone('torso', 'hips', (0, 0, 0))
    # ---- pelvis --------------------------------------------------------------------------
    m.darkmetal(texel=0.8)
    m.box(0.9, 0.34, 0.58, at=(0, -0.02, 0), bevel=0.07)
    m.steel(texel=0.6)
    m.box(0.98, 0.07, 0.64, at=(0, 0.16, 0), bevel=0.02)
    hull(m, 0.9)
    m.box(0.4, 0.38, 0.14, at=(0, -0.08, 0.3), rot=(-0.12, 0, 0), bevel=0.04)
    m.box(0.56, 0.3, 0.12, at=(0, -0.02, -0.3), rot=(0.1, 0, 0), bevel=0.04)
    m.stripe(texel=0.9)
    m.box(0.3, 0.09, 0.04, at=(0, 0.03, 0.385), rot=(-0.12, 0, 0), bevel=0)
    # ---- waist: bellows over the spine, two rams in front, hoses behind ----------------------
    m.rubber(texel=0.6)
    prof = [(0.38, 0.12)]
    for i in range(4):
        y = 0.15 + i * 0.075
        prof += [(0.45, y), (0.45, y + 0.035), (0.39, y + 0.055)]
    m.lathe(prof, 14, cap=False)
    for s in (-1, 1):
        m.darkmetal(texel=0.5)
        m.strut((s * 0.3, 0.04, 0.3), (s * 0.33, 0.26, 0.36), 0.062, 0.062, 8)
        m.steel(texel=0.5)
        m.strut((s * 0.33, 0.24, 0.355), (s * 0.36, 0.5, 0.4), 0.04, 0.04, 6)
        m.rubber(texel=0.5)
        m.tube([(s * 0.38, 0.02, -0.26), (s * 0.58, 0.16, -0.34), (s * 0.66, 0.36, -0.4), (s * 0.6, 0.56, -0.44)], 0.045, 6)

    # ---- chest: a barrel of armour plates hung on a dark frame, gaps left so the frame reads ---
    m.darkmetal(texel=0.5)
    m.sphere(1.0, 16, 10, at=CH, scale=(RA - 0.07, RB - 0.06, RC - 0.07))
    m.box(1.9, 0.2, 0.46, at=(0, 1.46, 0), bevel=0.05)
    U = 0.66
    for s in (-1, 1):
        hull(m, 1.25)
        chest_plate(m, s * 0.45, U, 0.5, 0.46)
        chest_plate(m, s * 0.45, -U, 0.5, 0.46)
        hull(m, 1.0)
        chest_plate(m, s * 1.36, U, 0.62, 0.46)
        chest_plate(m, s * 1.36, -U, 0.62, 0.46)
        chest_plate(m, s * 2.3, U, 0.58, 0.46)
        chest_plate(m, s * 2.3, -U, 0.58, 0.46)
        chest_plate(m, s * 0.98, 0, 0.3, 0.4)
        chest_plate(m, s * PI / 2, 0, 0.46, 0.4)
        chest_plate(m, s * 2.25, 0, 0.5, 0.4)
        m.vent(texel=1.0)
        chest_plate(m, s * PI / 2, 0, 0.32, 0.26, t=0.14, bevel=0)
        hull(m, 0.7, HULL2)
        chest_plate(m, s * 1.36, -U, 0.3, 0.18, t=0.14, bevel=0.012)
    hull(m, 0.9)
    chest_plate(m, PI, U, 0.5, 0.46)
    chest_plate(m, PI, -U, 0.5, 0.46)
    chest_plate(m, 0, 1.0, 0.34, 0.26)
    hull(m, 0.9, HULL2)
    chest_plate(m, 0, -1.0, 0.34, 0.26)
    hull(m, 0.9)
    m.box(0.92, 0.12, 0.7, at=(0, CH[1] + RB - 0.03, 0), bevel=0.04)

    # ---- the core: a lit lens in a bolted bezel, the brightest thing on the machine ----------
    m.steel(texel=1.1)
    m.cyl(0.45, 0.45, 0.24, 20, at=(0, 0.98, FZ - 0.1), rot=(PI / 2, 0, 0), bevel=0.035)
    m.darkmetal(texel=1.0)
    m.torus(0.375, 0.062, 20, 6, at=(0, 0.98, FZ + 0.02), rot=(PI / 2, 0, 0))
    m.fixed(INK, surf='dark', rough=0.9, texel=0.5)
    m.cyl(0.33, 0.33, 0.03, 16, at=(0, 0.98, FZ + 0.015), rot=(PI / 2, 0, 0))
    m.glow(emit=2.0, texel=1.5)
    m.sphere(0.265, 16, 6, at=(0, 0.98, FZ + 0.02), scale=(1, 1, 0.24))
    brass(m)
    for (x, y) in ring_pts(10, 0.415, 0.3):
        m.bolt((x, 0.98 + y, FZ + 0.02), r=0.03)
    # locking lugs gripping the bezel, as the door's bolts did
    m.darkmetal(texel=0.7)
    for a in (0.62, PI - 0.62, PI + 0.62, -0.62):
        m.box(0.22, 0.1, 0.22, at=(math.cos(a) * 0.5, 0.98 + math.sin(a) * 0.5, FZ - 0.1), rot=(0, 0, a), bevel=0.02)

    # ---- shoulders: mounts on the frame, yellow pauldrons over the arm balls -----------------
    for s in (-1, 1):
        m.darkmetal(texel=0.6)
        m.box(0.4, 0.34, 0.6, at=(s * 0.93, 1.42, 0), bevel=0.06)
        # one chunky block that wraps the chest's top corner
        m.panel('body', texel=1.25)
        m.push(at=(s * 0.9, 1.58, -0.01), rot=(0, 0, -s * 0.16))
        m.box(0.66, 0.5, 0.9, bevel=0.1)
        m.paint('body2', texel=0.8)
        m.box(0.5, 0.06, 0.66, at=(0, 0.265, 0), bevel=0.02)
        m.vent(texel=0.8)
        m.box(0.34, 0.2, 0.04, at=(0.02, 0.02, 0.45), bevel=0)
        brass(m)
        for dz in (-0.34, 0.34):
            for dx in (-0.22, 0.22):
                m.bolt((dx, 0.25, dz), r=0.028, axis=(0, 1, 0))
        m.pop()
    # collar and neck
    m.darkmetal(texel=0.6)
    m.cyl(0.21, 0.24, 0.2, 12, at=(0, 1.72, 0.1))
    hull(m, 0.8, HULL2)
    m.box(0.66, 0.26, 0.12, at=(0, 1.74, -0.27), rot=(-0.22, 0, 0), bevel=0.035)
    for s in (-1, 1):
        m.box(0.1, 0.2, 0.44, at=(s * 0.4, 1.72, -0.03), rot=(0, 0, -s * 0.2), bevel=0.03)

    # ---- back: reactor housing with a warm vent, twin stacks, feed cables ---------------------
    m.darkmetal(texel=0.8)
    m.box(0.6, 0.66, 0.24, at=(0, 1.0, -0.56), bevel=0.05)
    m.steel(texel=0.7)
    m.cyl(0.3, 0.3, 0.08, 14, at=(0, 1.0, -0.68), rot=(PI / 2, 0, 0), bevel=0.02)
    m.glow(slot='glow2', emit=0.5, texel=0.8)
    m.cyl(0.22, 0.22, 0.03, 14, at=(0, 1.0, -0.72), rot=(PI / 2, 0, 0))
    m.darkmetal(texel=0.4)
    for i in (-2, -1, 0, 1, 2):
        m.box(0.5, 0.05, 0.03, at=(0, 1.0 + i * 0.09, -0.74), bevel=0)
    for s in (-1, 1):
        m.darkmetal(texel=0.6)
        m.cyl(0.08, 0.09, 0.7, 10, at=(s * 0.4, 1.62, -0.46), rot=(-0.12, 0, 0), bevel=0.015)
        m.steel(texel=0.4)
        m.cyl(0.1, 0.09, 0.06, 10, at=(s * 0.4, 1.97, -0.5), rot=(-0.12, 0, 0))
        m.rubber(texel=0.5)
        m.tube([(s * 0.26, 1.24, -0.64), (s * 0.52, 1.42, -0.62), (s * 0.8, 1.5, -0.48), (s * 0.92, 1.46, -0.28)], 0.04, 6)
    m.fixed(0xb8322a, surf='rubber', rough=0.8, texel=0.5)
    m.tube([(0.2, 0.74, -0.66), (0.38, 0.56, -0.62), (0.46, 0.36, -0.46), (0.4, 0.16, -0.3)], 0.03, 6)

    # ---- variant dressing ------------------------------------------------------------------
    m.bone('opt_rare', 'torso', (0, 0, 0))
    m.steel(slot='trim', texel=0.4)
    m.strut((-0.62, 1.8, -0.36), (-0.62, 2.7, -0.36), 0.025, 0.02, 6)
    m.fixed(0xd8342a, surf='cloth', rough=0.9, texel=0.6)
    m.box(0.02, 0.3, 0.5, at=(-0.62, 2.52, -0.63), bevel=0)
    m.bone('opt_elite', 'torso', (0, 0, 0))
    for s in (-1, 1):
        m.stripe(texel=1.0)
        m.box(0.72, 0.12, 0.96, at=(s * 0.94, 1.4, -0.01), rot=(0, 0, -s * 0.16), bevel=0.03)
        m.darkmetal(texel=0.5)
        for i in (-1, 0, 1):
            m.cone(0.07, 0.2, 6, at=(s * 0.9, 1.96, -0.01 + i * 0.26))
    m.bone('opt_night', 'torso', (0, 0, 0))
    for s in (-1, 1):
        m.glow(slot='glow' if s > 0 else 'glow2', emit=1.5, texel=0.5)
        m.box(0.44, 0.05, 0.03, at=(s * 0.93, 1.74, 0.45), bevel=0)

    # ======================================================================================
    m.bone('dial', 'torso', (0, 0.98, FZ - 0.04))
    brass(m, 0.9)
    m.torus(0.3, 0.028, 20, 6, at=(0, 0, 0.075), rot=(PI / 2, 0, 0))
    for i, (x, y) in enumerate(ring_pts(5, 1.0, PI / 2)):
        m.strut((x * 0.06, y * 0.06, 0.13), (x * 0.29, y * 0.29, 0.09), 0.016, 0.02, 5)
        a = PI / 2 + i / 5 * 2 * PI
        m.box(0.06, 0.07, 0.055, at=(x * 0.335, y * 0.335, 0.075), rot=(0, 0, a - PI / 2), bevel=0.012)
    m.darkmetal(texel=0.7)
    m.cyl(0.06, 0.075, 0.07, 10, at=(0, 0, 0.12), rot=(PI / 2, 0, 0))
    m.glow(emit=1.6, texel=0.5)
    m.cyl(0.032, 0.032, 0.02, 8, at=(0, 0, 0.16), rot=(PI / 2, 0, 0))

    # ======================================================================================
    m.bone('head', 'torso', (0, 1.84, 0.12))
    m.darkmetal(texel=0.9)
    m.cyl(0.2, 0.2, 0.1, 12, at=(0, -0.01, 0))
    # a dark helmet: a drum with a domed crown, the face a slot across the front
    m.cyl(0.29, 0.31, 0.24, 14, at=(0, 0.15, 0), bevel=0.03)
    m.sphere(0.29, 14, 6, at=(0, 0.25, 0), scale=(1, 0.55, 1))
    hullp(m, 0.9, HULL2)
    m.box(0.4, 0.1, 0.1, at=(0, 0.07, 0.25), rot=(0.12, 0, 0), bevel=0.025)
    m.fixed(INK, surf='glass', rough=0.25, metal=0.3, texel=0.8)
    m.box(0.4, 0.1, 0.06, at=(0, 0.2, 0.265), bevel=0.015)
    m.glow(emit=1.25, texel=1.0)
    m.box(0.33, 0.05, 0.03, at=(0, 0.2, 0.29), bevel=0)
    # yellow crest plate and brow
    m.panel('body', texel=1.1)
    m.box(0.34, 0.1, 0.5, at=(0, 0.4, -0.02), rot=(0.1, 0, 0), bevel=0.035)
    m.paint('body', texel=0.8)
    m.box(0.46, 0.05, 0.12, at=(0, 0.29, 0.27), rot=(0.34, 0, 0), bevel=0.015)
    brass(m)
    for s in (-1, 1):
        m.cyl(0.085, 0.085, 0.07, 10, at=(s * 0.31, 0.17, 0.0), rot=(0, 0, PI / 2), bevel=0.012)
    m.steel(texel=0.3)
    m.strut((-0.2, 0.36, -0.16), (-0.24, 0.74, -0.22), 0.014, 0.01, 5)
    m.glow(slot='glow2', emit=1.3, texel=0.3)
    m.sphere(0.03, 6, 4, at=(-0.24, 0.75, -0.22))
    m.bone('opt_elite_head', 'head', (0, 0, 0))
    brass(m)
    m.cyl(0.24, 0.24, 0.05, 12, at=(0, 0.47, -0.02))
    for (x, z) in ring_pts(6, 0.19):
        m.cone(0.05, 0.16, 5, at=(x * 1.1, 0.57, z * 1.1 - 0.02))

    # ======================================================================================
    # shield arm: elbow bent a little, a slab of vault door carried on the forearm
    m.bone('armL', 'torso', (1.3, 1.5, 0))
    E = (0.04, -0.68, 0.04)                 # elbow
    Hn = (0.0, -1.34, 0.3)                  # wrist
    tilt = -math.atan2(Hn[2] - E[2], E[1] - Hn[1])
    m.darkmetal(texel=0.8)
    m.sphere(0.3, 12, 8)
    m.strut((0, 0, 0), E, 0.2, 0.17, 10)
    m.sphere(0.24, 12, 7, at=E)
    m.strut(E, Hn, 0.18, 0.16, 10)
    m.steel(texel=0.5)
    m.cyl(0.11, 0.11, 0.54, 10, at=E, rot=(0, 0, PI / 2), bevel=0.02)
    for dz in (-0.2, 0.2):
        m.strut((0.0, -0.14, dz), (0.04, -0.6, dz + 0.02), 0.04, 0.04, 6)
    hull(m, 0.9)
    m.box(0.16, 0.38, 0.42, at=(0.25, -0.36, 0.02), rot=(0, 0, 0.05), bevel=0.04)
    # forearm armour and cuff
    m.push(at=((E[0] + Hn[0]) / 2, (E[1] + Hn[1]) / 2, (E[2] + Hn[2]) / 2), rot=(tilt, 0, 0))
    m.panel('body', texel=1.1)
    m.box(0.66, 0.52, 0.62, at=(0, -0.05, 0), bevel=0.08)
    m.stripe(texel=1.0)
    m.box(0.7, 0.13, 0.66, at=(0, -0.37, 0), bevel=0.025)
    hull(m, 0.9)
    m.box(0.44, 0.3, 0.44, at=(0, -0.58, 0), bevel=0.08)
    m.darkmetal(texel=0.5)
    for dx in (-0.14, 0.0, 0.14):
        m.box(0.11, 0.16, 0.1, at=(dx, -0.72, 0.16), bevel=0.02)
    m.pop()
    # the shield
    SX, SY, SZ = -0.1, -1.02, 0.66
    m.darkmetal(texel=0.5)
    for dy in (-0.25, 0.2):
        m.strut((0.0, SY + dy + 0.05, 0.3), (SX, SY + dy, SZ - 0.06), 0.06, 0.06, 6)
    m.steel(texel=1.0)
    m.box(1.0, 1.36, 0.14, at=(SX, SY, SZ), bevel=0.05)
    m.panel('body', texel=1.25)
    m.box(0.84, 1.0, 0.08, at=(SX, SY + 0.1, SZ + 0.1), bevel=0.03)
    m.stripe(texel=1.1)
    m.box(1.04, 0.2, 0.2, at=(SX, SY - 0.6, SZ + 0.02), bevel=0.035)
    m.darkmetal(texel=0.8)
    m.cyl(0.24, 0.24, 0.08, 14, at=(SX, SY + 0.12, SZ + 0.16), rot=(PI / 2, 0, 0), bevel=0.02)
    brass(m)
    m.torus(0.15, 0.025, 12, 5, at=(SX, SY + 0.12, SZ + 0.2), rot=(PI / 2, 0, 0))
    m.glow(emit=0.8, texel=0.5)
    m.cyl(0.07, 0.07, 0.03, 10, at=(SX, SY + 0.12, SZ + 0.21), rot=(PI / 2, 0, 0))
    brass(m)
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.bolt((SX + sx * 0.34, SY + 0.1 + sy * 0.4, SZ + 0.14), r=0.035)
    m.darkmetal(texel=0.5)
    for i in range(3):
        m.cone(0.08, 0.2, 6, at=(SX - 0.32 + i * 0.32, SY + 0.76, SZ))

    # ======================================================================================
    # piston arm: the forearm is a ram housing, the fist is its head
    m.bone('armR', 'torso', (-1.3, 1.5, 0))
    m.darkmetal(texel=0.8)
    m.sphere(0.3, 12, 8)
    m.strut((0, 0, 0), (0, -0.6, 0), 0.2, 0.19, 10)
    m.cyl(0.29, 0.29, 0.56, 12, at=(0, -0.84, 0), bevel=0.02)
    hull(m, 0.9)
    m.box(0.16, 0.38, 0.42, at=(-0.25, -0.34, 0.0), rot=(0, 0, -0.05), bevel=0.04)
    m.panel('body', texel=1.1)
    m.box(0.12, 0.52, 0.6, at=(-0.32, -0.82, 0), bevel=0.035)
    m.box(0.6, 0.52, 0.12, at=(0, -0.82, 0.32), bevel=0.035)
    m.box(0.6, 0.52, 0.12, at=(0, -0.82, -0.32), bevel=0.035)
    m.vent(texel=0.9)
    m.box(0.05, 0.36, 0.4, at=(0.3, -0.82, 0), bevel=0)
    m.stripe(texel=1.0)
    m.box(0.78, 0.13, 0.78, at=(0, -1.1, 0), bevel=0.03)
    m.rubber(texel=0.5)
    m.tube([(0.04, -0.06, -0.27), (0.02, -0.3, -0.4), (0.0, -0.5, -0.42), (0.0, -0.62, -0.34)], 0.04, 6)
    m.steel(texel=0.5)
    for dz in (-0.16, 0.16):
        m.strut((0.2, -0.1, dz), (0.21, -0.56, dz), 0.04, 0.04, 6)

    m.bone('fist', 'armR', (0, -0.9, 0))
    m.steel(texel=0.7)
    m.cyl(0.12, 0.12, 0.72, 10, at=(0, -0.16, 0))
    m.darkmetal(texel=0.6)
    m.cyl(0.2, 0.24, 0.1, 12, at=(0, -0.47, 0))
    hull(m, 1.2)
    m.box(0.64, 0.5, 0.64, at=(0, -0.76, 0), bevel=0.1)
    hull(m, 0.9, HULL2)
    m.box(0.68, 0.12, 0.68, at=(0, -0.56, 0), bevel=0.03)
    m.glow(emit=1.1, texel=0.6)
    m.box(0.44, 0.045, 0.02, at=(0, -0.7, 0.322), bevel=0)
    m.darkmetal(texel=0.6)
    for i in range(4):
        m.box(0.12, 0.2, 0.07, at=(-0.21 + i * 0.14, -0.89, 0.31), bevel=0.02)
    m.steel(texel=0.5)
    for sx in (-1, 1):
        for sz in (-1, 1):
            m.cyl(0.075, 0.09, 0.07, 8, at=(sx * 0.17, -1.03, sz * 0.17))

    # ======================================================================================
    for name, s in (('legL', 1), ('legR', -1)):
        m.bone(name, 'hips', (s * 0.52, 0, 0))
        leg(m, s)
        m.bone('opt_elite_' + name, name, (0, 0, 0))
        m.stripe(texel=0.9)
        m.box(0.74, 0.1, 0.36, at=(0, -0.81, 0.58), rot=(0.3, 0, 0), bevel=0.02)

    m.socket('core', 'torso', (0, 0.98, 0.3))
    m.socket('head', 'head', (0, 0.5, 0))
    m.socket('muzzle', 'fist', (0, -1.05, 0))
    m.socket('shield', 'armL', (-0.1, -1.0, 0.9))
    m.thin_far(0.3)
    return m
