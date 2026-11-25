"""
CRATEFALL model kit: build a character or robot from primitives in GAME coordinates
(y up, the model faces +Z, metres), exactly as the old TypeScript builders did, then hand the
result to bake.py (UV atlas + painted texture) and export.py (skinned, Draco-compressed .glb).

A Model is one mesh bound to a skeleton of named bones. Every bone has an identity rest
rotation, so the runtime animation code can treat bones like the plain pivot groups it always
used: bone.position / rotation / scale mean the same thing they did for a THREE.Group.

Each primitive is rigidly bound to the bone that is current when it is added (smooth weights
can be supplied afterwards with Model.reweight). Primitive coordinates are relative to that
bone's pivot, which is how the runtime code thinks about parts.

Surface description per face:
  slot   which runtime palette entry tints it (SLOTS); 'fixed' means the colour is painted in
  surf   what the painter draws on it (SURF): painted metal, bare metal, wood, rubber ...
  color  the fixed colour (ignored for tinted slots except in previews)
  metal, rough, emit   shading inputs exported per vertex
"""
import math

import bmesh
import numpy as np
from mathutils import Matrix, Vector

# Runtime palette slots. The order is shared with src/gfx/models.ts: keep both in step.
SLOTS = [
    'fixed', 'body', 'body2', 'steel', 'dark', 'rubber', 'glow', 'glow2', 'trim', 'wood', 'woodDark',
    'skin', 'hair', 'top', 'bottom', 'accent', 'boots', 'top2', 'glove', 'iris', 'cloth2', 'leather',
]
# What the texture painter draws.
SURF = {
    'flat': 0, 'paint': 1, 'metal': 2, 'wood': 3, 'rubber': 4, 'glow': 5, 'cloth': 6, 'leather': 7,
    'skin': 8, 'hair': 9, 'eye': 10, 'dark': 11, 'stripe': 12, 'endgrain': 13, 'glass': 14, 'knit': 15,
}

PI = math.pi


def hex_rgb(c):
    """0xRRGGBB -> sRGB floats."""
    return ((c >> 16) & 255) / 255.0, ((c >> 8) & 255) / 255.0, (c & 255) / 255.0


def rot_xyz(rx, ry, rz):
    """three.js Euler 'XYZ' as a matrix (so ported coordinates behave the same)."""
    return Matrix.Rotation(rx, 4, 'X') @ Matrix.Rotation(ry, 4, 'Y') @ Matrix.Rotation(rz, 4, 'Z')


def xform(at=(0, 0, 0), rot=(0, 0, 0), scale=1.0):
    s = (scale, scale, scale) if isinstance(scale, (int, float)) else scale
    return Matrix.Translation(Vector(at)) @ rot_xyz(*rot) @ Matrix.Diagonal((s[0], s[1], s[2], 1.0))


_Z_TO_Y = Matrix.Rotation(-PI / 2, 4, 'X')  # bmesh primitives are built along Z; the game is y-up


class Brush:
    __slots__ = ('slot', 'surf', 'color', 'metal', 'rough', 'emit', 'texel')

    def __init__(self):
        self.slot = 'fixed'; self.surf = 'flat'; self.color = 0xffffff
        self.metal = 0.0; self.rough = 0.8; self.emit = 0.0; self.texel = 1.0


class Model:
    def __init__(self, name):
        self.name = name
        self.bones = []          # dicts: name, parent, pos (absolute rest, game coords)
        self.bone_ix = {}
        self.cur_bone = None
        self.brush = Brush()
        self.stack = [Matrix.Identity(4)]
        # accumulated geometry (game coords, absolute rest positions)
        self.V = []              # [x, y, z]
        self.F = []              # vertex index lists
        self.f_bone = []; self.f_slot = []; self.f_surf = []; self.f_col = []
        self.f_metal = []; self.f_rough = []; self.f_emit = []; self.f_smooth = []; self.f_texel = []
        self.v_tco = []; self.v_tsz = []   # per vertex: primitive-local coords and half size
        self.v_prim = []
        self.p_type = []         # per primitive: 0 box, 1 cylinder along local y, 2 other
        self.n_prims = 0
        self.weights = None      # optional {vertex index: [(bone name, weight), ...]}
        self.sockets = {}

    # ---- skeleton --------------------------------------------------------------------------
    def bone(self, name, parent=None, at=(0, 0, 0)):
        """Declare a bone whose pivot sits at `at` relative to its parent's pivot, and make it current."""
        base = Vector(self.bones[self.bone_ix[parent]]['pos']) if parent else Vector((0, 0, 0))
        self.bone_ix[name] = len(self.bones)
        self.bones.append({'name': name, 'parent': parent, 'pos': tuple(base + Vector(at))})
        self.cur_bone = name
        return name

    def on(self, bone):
        self.cur_bone = bone
        return self

    def bone_pos(self, name):
        return Vector(self.bones[self.bone_ix[name]]['pos'])

    # ---- brush -----------------------------------------------------------------------------
    def mat(self, slot=None, surf=None, color=None, metal=None, rough=None, emit=None, texel=None):
        b = self.brush
        if slot is not None: b.slot = slot
        if surf is not None: b.surf = surf
        if color is not None: b.color = color
        if metal is not None: b.metal = metal
        if rough is not None: b.rough = rough
        if emit is not None: b.emit = emit
        if texel is not None: b.texel = texel
        return self

    # material presets -----------------------------------------------------------------------
    def paint(self, slot='body', **k): return self.mat(slot=slot, surf='paint', metal=0.25, rough=0.62, emit=0, **k)
    def steel(self, slot='steel', **k): return self.mat(slot=slot, surf='metal', metal=0.9, rough=0.42, emit=0, **k)
    def darkmetal(self, slot='dark', **k): return self.mat(slot=slot, surf='metal', metal=0.7, rough=0.55, emit=0, **k)
    def rubber(self, slot='rubber', **k): return self.mat(slot=slot, surf='rubber', metal=0.0, rough=0.95, emit=0, **k)
    def wood(self, slot='wood', **k): return self.mat(slot=slot, surf='wood', metal=0.0, rough=0.86, emit=0, **k)
    def glow(self, slot='glow', emit=1.4, **k): return self.mat(slot=slot, surf='glow', metal=0.0, rough=0.4, emit=emit, **k)
    def fixed(self, color, surf='flat', metal=0.0, rough=0.8, emit=0.0, **k):
        return self.mat(slot='fixed', surf=surf, color=color, metal=metal, rough=rough, emit=emit, **k)

    # ---- transform stack -------------------------------------------------------------------
    def push(self, at=(0, 0, 0), rot=(0, 0, 0), scale=1.0):
        self.stack.append(self.stack[-1] @ xform(at, rot, scale))
        return self

    def pop(self):
        self.stack.pop()
        return self

    # ---- low level -------------------------------------------------------------------------
    def _emit_bm(self, bm, M, smooth, size=None, ptype=2, **over):
        """Copy a temporary bmesh (primitive-local, y-up) into the model through matrix M."""
        b = self.brush
        slot = over.get('slot', b.slot); surf = over.get('surf', b.surf); color = over.get('color', b.color)
        metal = over.get('metal', b.metal); rough = over.get('rough', b.rough); emit = over.get('emit', b.emit)
        texel = over.get('texel', b.texel)
        base = self.bone_pos(self.cur_bone)
        full = Matrix.Translation(base) @ self.stack[-1] @ M
        bm.verts.ensure_lookup_table()
        v0 = len(self.V)
        los = [v.co.copy() for v in bm.verts]
        if size is None:
            mn = Vector((min(c.x for c in los), min(c.y for c in los), min(c.z for c in los)))
            mx = Vector((max(c.x for c in los), max(c.y for c in los), max(c.z for c in los)))
            half = (mx - mn) * 0.5; cen = (mx + mn) * 0.5
        else:
            half = Vector(size) * 0.5; cen = Vector((0, 0, 0))
        # tco is in metres along the primitive's own axes, so painters can find borders and grain
        sc = full.to_scale()
        for co in los:
            w = full @ co
            self.V.append((w.x, w.y, w.z))
            l = co - cen
            self.v_tco.append((l.x * sc.x, l.y * sc.y, l.z * sc.z))
            self.v_tsz.append((half.x * sc.x, half.y * sc.y, half.z * sc.z))
            self.v_prim.append(self.n_prims)
        flip = full.determinant() < 0
        bi = self.bone_ix[self.cur_bone]
        for f in bm.faces:
            ix = [v0 + v.index for v in f.verts]
            if flip: ix.reverse()
            self.F.append(ix)
            self.f_bone.append(bi); self.f_slot.append(SLOTS.index(slot)); self.f_surf.append(SURF[surf])
            self.f_col.append(hex_rgb(color)); self.f_metal.append(metal); self.f_rough.append(rough); self.f_emit.append(emit)
            self.f_smooth.append(bool(f.smooth) if smooth is None else smooth)
            self.f_texel.append(texel)
        self.p_type.append(ptype)
        self.n_prims += 1
        bm.free()
        return range(v0, len(self.V))

    # ---- primitives (all centred on `at`) --------------------------------------------------
    def box(self, w, h, d, at=(0, 0, 0), rot=(0, 0, 0), bevel=None, seg=1, **over):
        """Soft-edged box. bevel=None picks a bevel from the smallest side; bevel=0 is a hard box."""
        m = min(w, h, d)
        if bevel is None: bevel = m * 0.14
        bevel = min(bevel, m * 0.49)
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts: v.co = Vector((v.co.x * w, v.co.y * h, v.co.z * d))
        if bevel > 1e-5:
            bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, offset_type='OFFSET', segments=seg, profile=0.5, affect='EDGES', clamp_overlap=True)
        return self._emit_bm(bm, xform(at, rot), bevel > 1e-5, size=(w, h, d), ptype=0, **over)

    def cyl(self, r_top, r_bot, h, seg=10, at=(0, 0, 0), rot=(0, 0, 0), scale=1.0, bevel=0.0, cap=True, **over):
        """Cylinder / cone frustum along +Y. bevel rounds the rims."""
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=seg, radius1=max(r_bot, 1e-4), radius2=max(r_top, 1e-4), depth=h, matrix=_Z_TO_Y)
        side = [f for f in bm.faces if len(f.verts) == 4 and abs(f.normal.y) < 0.9]
        for f in bm.faces: f.smooth = f in side
        if bevel > 1e-5 and cap:
            rim = [e for e in bm.edges if len(e.link_faces) == 2 and (e.link_faces[0] in side) != (e.link_faces[1] in side)]
            bmesh.ops.bevel(bm, geom=rim, offset=min(bevel, h * 0.45, max(r_top, r_bot) * 0.6), offset_type='OFFSET', segments=1, profile=0.5, affect='EDGES', clamp_overlap=True)
            for f in bm.faces: f.smooth = True
        r = max(r_top, r_bot)
        return self._emit_bm(bm, xform(at, rot, scale), None, size=(2 * r, h, 2 * r), ptype=1, **over)

    def cone(self, r, h, seg=8, at=(0, 0, 0), rot=(0, 0, 0), scale=1.0, **over):
        """Cone along +Y, centred, base down."""
        return self.lathe([(r, -h / 2), (0.0, h / 2)], seg, at=at, rot=rot, scale=scale, **over)

    def sphere(self, r, seg=10, rings=7, at=(0, 0, 0), rot=(0, 0, 0), scale=1.0, **over):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r, matrix=_Z_TO_Y)
        return self._emit_bm(bm, xform(at, rot, scale), True, size=(2 * r, 2 * r, 2 * r), **over)

    def ico(self, r, sub=2, at=(0, 0, 0), rot=(0, 0, 0), scale=1.0, **over):
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
        return self._emit_bm(bm, xform(at, rot, scale), True, size=(2 * r, 2 * r, 2 * r), **over)

    def capsule(self, r, length, seg=8, at=(0, 0, 0), rot=(0, 0, 0), scale=1.0, **over):
        """Capsule along +Y; `length` is the straight section."""
        prof = []
        n = 4
        for i in range(n + 1):
            a = -PI / 2 + (PI / 2) * i / n
            prof.append((r * math.cos(a), -length / 2 + r * math.sin(a)))
        for i in range(n + 1):
            a = (PI / 2) * i / n
            prof.append((r * math.cos(a), length / 2 + r * math.sin(a)))
        return self.lathe(prof, seg, at=at, rot=rot, scale=scale, **over)

    def torus(self, R, r, seg=12, tube=6, at=(0, 0, 0), rot=(0, 0, 0), scale=1.0, **over):
        """Torus in the XZ plane (axis +Y)."""
        bm = bmesh.new()
        vs = []
        for i in range(seg):
            a = 2 * PI * i / seg
            row = []
            for j in range(tube):
                b = 2 * PI * j / tube
                rr = R + r * math.cos(b)
                row.append(bm.verts.new((rr * math.cos(a), r * math.sin(b), rr * math.sin(a))))
            vs.append(row)
        for i in range(seg):
            for j in range(tube):
                f = bm.faces.new((vs[i][j], vs[i][(j + 1) % tube], vs[(i + 1) % seg][(j + 1) % tube], vs[(i + 1) % seg][j]))
                f.smooth = True
        bm.verts.index_update()
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        return self._emit_bm(bm, xform(at, rot, scale), True, **over)

    def lathe(self, profile, seg=12, at=(0, 0, 0), rot=(0, 0, 0), scale=1.0, cap=True, smooth=True, **over):
        """Revolve (radius, y) points around +Y, bottom to top. Zero radii close the ends."""
        bm = bmesh.new()
        rings = []
        for (r, y) in profile:
            if r < 1e-5:
                rings.append([bm.verts.new((0, y, 0))])
            else:
                rings.append([bm.verts.new((r * math.sin(2 * PI * i / seg), y, r * math.cos(2 * PI * i / seg))) for i in range(seg)])
        for a, b in zip(rings, rings[1:]):
            for i in range(seg):
                j = (i + 1) % seg
                if len(a) == 1 and len(b) == 1: continue
                if len(a) == 1: f = bm.faces.new((a[0], b[j], b[i]))
                elif len(b) == 1: f = bm.faces.new((a[i], a[j], b[0]))
                else: f = bm.faces.new((a[i], a[j], b[j], b[i]))
                f.smooth = smooth
        if cap:
            if len(rings[0]) > 1: bm.faces.new(list(reversed(rings[0]))).smooth = False
            if len(rings[-1]) > 1: bm.faces.new(list(rings[-1])).smooth = False
        bm.verts.index_update()
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        return self._emit_bm(bm, xform(at, rot, scale), None, **over)

    def strut(self, a, b, r0, r1=None, seg=6, bevel=0.0, **over):
        """Tapered cylinder from a (radius r0) to b (radius r1)."""
        if r1 is None: r1 = r0
        a = Vector(a); b = Vector(b)
        d = b - a
        L = d.length or 1e-4
        q = Vector((0, 1, 0)).rotation_difference(d / L)
        M = Matrix.Translation((a + b) * 0.5) @ q.to_matrix().to_4x4()
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=max(r0, 1e-4), radius2=max(r1, 1e-4), depth=L, matrix=_Z_TO_Y)
        side = [f for f in bm.faces if len(f.verts) == 4 and abs(f.normal.y) < 0.9]
        for f in bm.faces: f.smooth = f in side
        if bevel > 1e-5:
            rim = [e for e in bm.edges if len(e.link_faces) == 2 and (e.link_faces[0] in side) != (e.link_faces[1] in side)]
            bmesh.ops.bevel(bm, geom=rim, offset=bevel, offset_type='OFFSET', segments=1, profile=0.5, affect='EDGES', clamp_overlap=True)
            for f in bm.faces: f.smooth = True
        r = max(r0, r1)
        return self._emit_bm(bm, M, None, size=(2 * r, L, 2 * r), ptype=1, **over)

    def tube(self, pts, r, seg=6, r_end=None, closed_ends=True, **over):
        """Round tube through points (cables, hoses, rails). r_end tapers the far end."""
        P = [Vector(p) for p in pts]
        n = len(P)
        bm = bmesh.new()
        rings = []
        prev_n = None
        for i, p in enumerate(P):
            t = (P[min(i + 1, n - 1)] - P[max(i - 1, 0)]).normalized()
            if prev_n is None:
                up = Vector((0, 1, 0)) if abs(t.y) < 0.9 else Vector((1, 0, 0))
                nrm = t.cross(up).normalized()
            else:
                nrm = (prev_n - t * prev_n.dot(t)).normalized()
            prev_n = nrm
            bn = t.cross(nrm)
            rr = r if r_end is None else r + (r_end - r) * i / (n - 1)
            rings.append([bm.verts.new(p + (nrm * math.cos(2 * PI * k / seg) + bn * math.sin(2 * PI * k / seg)) * rr) for k in range(seg)])
        for a, b in zip(rings, rings[1:]):
            for k in range(seg):
                j = (k + 1) % seg
                bm.faces.new((a[k], a[j], b[j], b[k])).smooth = True
        if closed_ends:
            bm.faces.new(list(reversed(rings[0]))).smooth = False
            bm.faces.new(list(rings[-1])).smooth = False
        bm.verts.index_update()
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        return self._emit_bm(bm, Matrix.Identity(4), None, **over)

    def loft(self, rings, close_start=True, close_end=True, smooth=True, **over):
        """Skin a list of vertex rings (each a list of (x, y, z), same count) into a surface."""
        bm = bmesh.new()
        R = [[bm.verts.new(p) for p in ring] for ring in rings]
        n = len(R[0])
        for a, b in zip(R, R[1:]):
            for k in range(n):
                j = (k + 1) % n
                bm.faces.new((a[k], a[j], b[j], b[k])).smooth = smooth
        if close_start: bm.faces.new(list(reversed(R[0]))).smooth = smooth
        if close_end: bm.faces.new(list(R[-1])).smooth = smooth
        bm.verts.index_update()
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        return self._emit_bm(bm, Matrix.Identity(4), None, **over)

    def mesh(self, verts, faces, smooth=True, at=(0, 0, 0), rot=(0, 0, 0), scale=1.0, recalc=True, **over):
        """Raw geometry."""
        bm = bmesh.new()
        vs = [bm.verts.new(v) for v in verts]
        for f in faces:
            try: bm.faces.new([vs[i] for i in f]).smooth = smooth
            except ValueError: pass
        bm.verts.index_update()
        if recalc: bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        return self._emit_bm(bm, xform(at, rot, scale), None, **over)

    def prism(self, pts, depth, at=(0, 0, 0), rot=(0, 0, 0), bevel=0.0, **over):
        """Extrude a convex XY polygon (counter-clockwise) by `depth` along Z, centred."""
        bm = bmesh.new()
        a = [bm.verts.new((x, y, -depth / 2)) for (x, y) in pts]
        b = [bm.verts.new((x, y, depth / 2)) for (x, y) in pts]
        n = len(pts)
        bm.faces.new(list(reversed(a))); bm.faces.new(b)
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        if bevel > 1e-5:
            bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, offset_type='OFFSET', segments=1, profile=0.5, affect='EDGES', clamp_overlap=True)
        bm.verts.index_update()
        return self._emit_bm(bm, xform(at, rot), bevel > 1e-5, **over)

    # ---- composites ------------------------------------------------------------------------
    def joint(self, at, r, seg=8, **over):
        return self.sphere(r, seg, 6, at=at, **over)

    def bolt(self, at, r=0.012, axis=(0, 0, 1), **over):
        """A bolt head: a short hex stub pointing along `axis`."""
        a = Vector(axis).normalized()
        return self.strut(Vector(at) - a * r * 0.3, Vector(at) + a * r * 0.7, r, r * 0.85, 6, **over)

    def socket(self, name, bone, at=(0, 0, 0)):
        self.sockets[name] = (bone, tuple(at))

    # ---- queries ---------------------------------------------------------------------------
    def tri_count(self):
        return sum(len(f) - 2 for f in self.F)

    def reweight(self, fn):
        """fn(vertex index, position Vector, rigid bone name) -> [(bone, weight), ...] or None to keep rigid."""
        self.weights = {}
        vb = {}
        for f, bi in zip(self.F, self.f_bone):
            for i in f: vb[i] = bi
        for i, co in enumerate(self.V):
            if i not in vb: continue
            w = fn(i, Vector(co), self.bones[vb[i]]['name'])
            if w: self.weights[i] = w


def arr(x, dtype=np.float32):
    return np.asarray(x, dtype=dtype)
