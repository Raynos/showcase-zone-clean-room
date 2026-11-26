"""
Static world pieces: turn an authored hard-surface mesh into the terms the game's world material
speaks (src/world/pieces.ts), so it merges into the world chunks and costs triangles only.

A piece is a list of parts. A part has one texture layer, one base colour, an emission and a
level-of-detail bias; its vertices carry a position, a normal and a shade (baked occlusion, tone
drift from plank to plank, grime toward the ground) that multiplies the base colour. There are
no textures and no UVs: the world material tiles its layers over world position.

    weld -> thin (planar dissolve, collapse, drop) -> normals (bevels shade round, flats stay flat)
         -> shade (occlusion, island tone, grime) -> parts (bodies, and small things in clusters)
"""
import math
import random

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def meshes():
    return [o for o in bpy.context.scene.objects if o.type == 'MESH']


def only(objs):
    for o in bpy.context.scene.objects: o.select_set(False)
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


def bake_transforms(objs):
    """World transform into the vertices; shape keys and animation are left at rest."""
    for o in objs:
        if o.data.shape_keys:
            # (the rest pose: a cloth's breeze keys are dropped, not mixed in)
            o.shape_key_clear()
        o.animation_data_clear()
        if o.data.users > 1: o.data = o.data.copy()
        m = o.matrix_world.copy()
        o.parent = None
        o.data.transform(m)
        o.matrix_world.identity()
        if m.determinant() < 0: o.data.flip_normals()


def by_material(objs, role_of):
    """Join, weld and split again by role. role_of(material name) -> role key or None to drop. Returns {role key: object}."""
    only(objs)
    if len(objs) > 1: bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    me = obj.data
    names = [m.name if m else '' for m in me.materials] or ['']
    bm = bmesh.new(); bm.from_mesh(me)
    lay = bm.faces.layers.int.new('role')
    keys = []
    drop = []
    for f in bm.faces:
        k = role_of(names[f.material_index] if f.material_index < len(names) else '')
        if k is None: drop.append(f); continue
        if k not in keys: keys.append(k)
        f[lay] = keys.index(k)
    bmesh.ops.delete(bm, geom=drop, context='FACES')
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=2e-4)
    out = {}
    for i, k in enumerate(keys):
        part = bm.copy()
        pl = part.faces.layers.int['role']
        bmesh.ops.delete(part, geom=[f for f in part.faces if f[pl] != i], context='FACES')
        m2 = bpy.data.meshes.new(str(k))
        part.to_mesh(m2); part.free()
        o2 = bpy.data.objects.new(str(k), m2)
        bpy.context.scene.collection.objects.link(o2)
        out[k] = o2
    bm.free()
    bpy.data.objects.remove(obj)
    return out


def thin(obj, dissolve=0.6, ratio=1.0):
    """Planar dissolve (degrees; loses nothing a flat face needs), then an edge-collapse to `ratio` of what is left."""
    only([obj])
    if dissolve and dissolve > 0:
        m = obj.modifiers.new('flat', 'DECIMATE')
        m.decimate_type = 'DISSOLVE'; m.angle_limit = math.radians(dissolve); m.delimit = {'SHARP', 'SEAM'}
        bpy.ops.object.modifier_apply(modifier=m.name)
    if ratio < 0.999:
        m = obj.modifiers.new('thin', 'DECIMATE')
        m.decimate_type = 'COLLAPSE'; m.ratio = ratio; m.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=m.name)
    m = obj.modifiers.new('tri', 'TRIANGULATE')
    m.quad_method = 'SHORTEST_DIAGONAL'; m.ngon_method = 'BEAUTY'
    bpy.ops.object.modifier_apply(modifier=m.name)


def normals(obj, angle=38.0):
    """
    Corner normals: edges sharper than `angle` split, everything gentler shades round, weighted by
    face area so a bevel bends and the flat faces beside it stay flat. A bevel that bends is what
    the world material rubs pale (its edge wear reads the change of normal across a pixel).
    """
    me = obj.data
    me.attributes.active = None
    for a in list(me.attributes):
        if a.name in ('sharp_face', 'sharp_edge', 'custom_normal'): me.attributes.remove(a)
    only([obj])
    bpy.ops.object.shade_smooth()
    me.set_sharp_from_angle(angle=math.radians(angle))
    m = obj.modifiers.new('wn', 'WEIGHTED_NORMAL')
    m.mode = 'FACE_AREA'; m.weight = 60; m.keep_sharp = True
    bpy.ops.object.modifier_apply(modifier=m.name)


def soup(objs):
    """Triangles of every object as arrays: positions per vertex, and per corner the vertex, normal, source colour and role index."""
    P = []; tri = []; nor = []; col = []; role = []
    base = 0
    for ri, (key, o) in enumerate(objs.items()):
        me = o.data
        n = len(me.vertices)
        co = np.empty(n * 3, dtype=np.float64); me.vertices.foreach_get('co', co)
        P.append(co.reshape(-1, 3))
        nl = len(me.loops)
        lv = np.empty(nl, dtype=np.int64); me.loops.foreach_get('vertex_index', lv)
        cn = np.empty(nl * 3, dtype=np.float64); me.corner_normals.foreach_get('vector', cn)
        cn = cn.reshape(-1, 3)
        ca = me.color_attributes.active_color if len(me.color_attributes) else None
        if ca is not None:
            raw = np.empty(len(ca.data) * 4, dtype=np.float64); ca.data.foreach_get('color', raw)
            raw = raw.reshape(-1, 4)[:, :3]
            cc = raw[lv] if ca.domain == 'POINT' else raw
        else:
            cc = np.ones((nl, 3))
        for p in me.polygons:
            ls = list(p.loop_indices)
            if len(ls) != 3: continue
            tri.append([lv[i] + base for i in ls]); nor.append([cn[i] for i in ls]); col.append([cc[i] for i in ls]); role.append(ri)
        base += n
    return np.concatenate(P), np.array(tri, dtype=np.int64), np.array(nor), np.array(col), np.array(role, dtype=np.int64)


def sizeable(P, tri, role, roles):
    """Mask of triangles to keep: a role with "minExtent" loses every island smaller than that (louvres, nail heads, lettering)."""
    keep = np.ones(len(tri), dtype=bool)
    if not any(r.get('minExtent') for r in roles): return keep
    ids = islands(tri, len(P))
    for ri, r in enumerate(roles):
        lim = r.get('minExtent')
        if not lim: continue
        for isl in np.unique(ids[role == ri]):
            m = (ids == isl) & (role == ri)
            pts = P[np.unique(tri[m])]
            if float((pts.max(axis=0) - pts.min(axis=0)).max()) < lim: keep &= ~m
    return keep


def boxify(P, tri, nor, src, role, roles, lo=0.72, hi=1.3):
    """
    The cheap level of a board: for every role marked "box", each island that is near enough a box
    (its surface within `lo`..`hi` of its bounding box's, axis-aligned or along its own axes) is
    replaced by that box, twelve flat triangles. Bevels go, and so does every triangle a board spends
    on them; what is not a box (a ring, a cross, a bracket folded round a corner) is left alone.
    Returns the new arrays and how many islands were boxed.
    """
    ids = islands(tri, len(P))
    e1 = P[tri[:, 1]] - P[tri[:, 0]]; e2 = P[tri[:, 2]] - P[tri[:, 0]]
    area = np.linalg.norm(np.cross(e1, e2), axis=1) / 2
    keep = np.ones(len(tri), dtype=bool)
    addP = []; addT = []; addN = []; addS = []; addR = []
    base = len(P); done = 0
    QUADS = [((0, 2, 6, 4), 0, -1), ((1, 5, 7, 3), 0, 1), ((0, 4, 5, 1), 1, -1), ((2, 3, 7, 6), 1, 1), ((0, 1, 3, 2), 2, -1), ((4, 6, 7, 5), 2, 1)]
    for ri, r in enumerate(roles):
        if not r.get('box'): continue
        for isl in np.unique(ids[role == ri]):
            m = (ids == isl) & (role == ri)
            if m.sum() <= 12: continue
            vs = np.unique(tri[m]); pts = P[vs]
            a = float(area[m].sum())
            best = None
            for axes in (np.eye(3), np.linalg.eigh(np.cov((pts - pts.mean(axis=0)).T))[1].T):
                q = pts @ axes.T
                mn, mx = q.min(axis=0), q.max(axis=0); d = mx - mn
                ba = 2 * (d[0] * d[1] + d[1] * d[2] + d[0] * d[2])
                if best is None or ba < best[0]: best = (ba, axes, mn, mx)
            ba, axes, mn, mx = best
            if not (lo <= a / max(ba, 1e-12) <= hi): continue
            if np.linalg.det(axes) < 0: axes = axes * np.array([[1], [1], [-1]]); mn, mx = mn * [1, 1, -1], mx * [1, 1, -1]; mn[2], mx[2] = mx[2], mn[2]
            corners = np.array([[(mx if (k >> 0) & 1 else mn)[0], (mx if (k >> 1) & 1 else mn)[1], (mx if (k >> 2) & 1 else mn)[2]] for k in range(8)]) @ axes
            colour = src[m].reshape(-1, 3).mean(axis=0)
            for (q, ax, sg) in QUADS:
                n = axes[ax] * sg
                c = [corners[k] for k in q]
                if np.dot(np.cross(c[1] - c[0], c[2] - c[0]), n) < 0: c = c[::-1]
                i0 = base + len(addP)
                addP.extend(c)
                for t in ((0, 1, 2), (0, 2, 3)):
                    addT.append([i0 + t[0], i0 + t[1], i0 + t[2]]); addN.append([n, n, n]); addS.append([colour] * 3); addR.append(ri)
            keep &= ~m; done += 1
    if not done: return P, tri, nor, src, role, 0
    P = np.concatenate([P, np.array(addP)])
    tri = np.concatenate([tri[keep], np.array(addT, dtype=np.int64)])
    nor = np.concatenate([nor[keep], np.array(addN)])
    src = np.concatenate([src[keep], np.array(addS)])
    role = np.concatenate([role[keep], np.array(addR, dtype=np.int64)])
    return P, tri, nor, src, role, done


def _hemisphere(n, seed=7):
    rnd = random.Random(seed)
    out = []
    for i in range(n):
        u = (i + rnd.random()) / n; v = rnd.random()
        r = math.sqrt(u); t = 2 * math.pi * v
        out.append((r * math.cos(t), r * math.sin(t), math.sqrt(max(0.0, 1 - u))))
    return out


def occlusion(P, tri, nor, dist, rays=24, pull=0.3):
    """
    Per corner, 0 (buried) to 1 (open): cosine-weighted rays of length `dist`, nearer hits counting
    for more. A big flat face has vertices only at its edges, which is where the creases are, and
    shading it from there would darken all of it; so each corner is sampled a way in toward the
    middle of its triangle (`pull`), and a vertex takes the mean over the triangles that share it.
    """
    bvh = BVHTree.FromPolygons([Vector(p) for p in P], [tuple(int(i) for i in t) for t in tri], all_triangles=True)
    hemi = _hemisphere(rays)
    acc = {}
    keys = []
    for ti in range(len(tri)):
        a, b, c = (Vector(P[i]) for i in tri[ti])
        mid = (a + b + c) / 3
        for k in range(3):
            n = Vector(nor[ti][k])
            key = (int(tri[ti][k]), round(n.x * 6), round(n.y * 6), round(n.z * 6))
            keys.append(key)
            co = Vector(P[tri[ti][k]])
            o = co + n * (dist * 0.02 + 0.002) + (mid - co) * pull
            t = n.orthogonal().normalized(); bt = n.cross(t)
            hit = 0.0
            for hx, hy, hz in hemi:
                d = t * hx + bt * hy + n * hz
                r = bvh.ray_cast(o, d, dist)
                if r[0] is not None: hit += 1.0 - (r[3] / dist) ** 1.5
            e = acc.setdefault(key, [0.0, 0])
            e[0] += 1.0 - hit / len(hemi); e[1] += 1
    out = np.ones((len(tri), 3))
    for i, key in enumerate(keys):
        e = acc[key]
        out[i // 3][i % 3] = e[0] / e[1]
    return out


def islands(tri, nv):
    """Connected component id per triangle (triangles sharing a vertex are connected)."""
    parent = np.arange(nv)

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]; x = parent[x]
        return x
    for a, b, c in tri:
        ra, rb, rc = find(a), find(b), find(c)
        if rb != ra: parent[rb] = ra
        if rc != ra: parent[find(rc)] = ra
    ids = {}
    out = np.empty(len(tri), dtype=np.int64)
    for i, t in enumerate(tri):
        out[i] = ids.setdefault(find(t[0]), len(ids))
    return out


def shade(P, tri, nor, src, role, roles, ao_dist, seed=1, grime=(0.35, 0.16), rays=24, cool=(0.80, 0.80, 1.0)):
    """
    The colour multiplier per corner. Occlusion darkens toward a shade of its own, `cool` (shadows
    are coloured, never grey: blue on stone and metal, a deep warm brown between boards); each island drifts a little in tone and warmth so planks, stones and plates read
    as separate pieces; the bottom of the piece takes grime from the ground it stands on.
    """
    ao = occlusion(P, tri, nor, ao_dist, rays)
    rnd = random.Random(seed)
    isl = islands(tri, len(P))
    tone = {}
    out = np.empty((len(tri), 3, 3))
    y0 = P[:, 2].min()
    cool = np.array(cool, dtype=np.float64)
    for ti in range(len(tri)):
        r = roles[role[ti]]
        j = r.get('jit', 0.05)
        key = (int(isl[ti]), int(role[ti]))
        t = tone.get(key)
        if t is None:
            k = 1 + (rnd.random() - 0.5) * 2 * j
            w = (rnd.random() - 0.5) * j
            t = np.array([k * (1 + w), k, k * (1 - w)]); tone[key] = t
        depth = r.get('ao', 0.55)
        for k in range(3):
            a = ao[ti][k]
            s = (1 - depth) + depth * a
            c = s * (cool + (1 - cool) * a) * t
            if grime and grime[1] > 0:
                h = P[tri[ti][k]][2] - y0
                gk = max(0.0, 1 - h / grime[0]) ** 1.5 * grime[1]
                c = c * (1 - gk * np.array([1.0, 1.06, 1.18]))
            if r.get('src'): c = c * src[ti][k] / r['src']
            out[ti][k] = c
    # occlusion says where a piece is darker, not that the piece is dark: each role keeps its
    # colour on average (by area), so a recessed panel is shaded at its edges and honey in the middle
    e1 = P[tri[:, 1]] - P[tri[:, 0]]; e2 = P[tri[:, 2]] - P[tri[:, 0]]
    area = np.linalg.norm(np.cross(e1, e2), axis=1) + 1e-9
    lum = out.mean(axis=(1, 2))
    for ri in range(len(roles)):
        m = role == ri
        if not m.any(): continue
        mean = float((lum[m] * area[m]).sum() / area[m].sum())
        out[m] *= min(1.7, roles[ri].get('level', 0.97) / max(mean, 1e-3))
    out = np.round(out * 48) / 48
    return out, ao


def parts(P, tri, role, roles, small=0.2, cell=0.7):
    """
    Group triangles into parts: per role one body (everything big), and the small things (bolts,
    nails, handles) clustered by where they are, so the world's distance level-of-detail can stop
    drawing them one cluster at a time. Returns the part index per triangle and the part list.
    """
    isl = islands(tri, len(P))
    lo = {}; hi = {}
    for ti, t in enumerate(tri):
        k = (int(isl[ti]), int(role[ti]))
        p = P[t]
        a = p.min(axis=0); b = p.max(axis=0)
        if k in lo: lo[k] = np.minimum(lo[k], a); hi[k] = np.maximum(hi[k], b)
        else: lo[k] = a; hi[k] = b
    index = {}
    table = []
    out = np.empty(len(tri), dtype=np.int64)
    for ti in range(len(tri)):
        k = (int(isl[ti]), int(role[ti]))
        r = roles[role[ti]]
        e = np.sort(hi[k] - lo[k])
        size = math.sqrt(e[2] * max(e[1], 1e-3))
        if r.get('split'):
            key = (int(role[ti]), 'i', int(isl[ti]))
        elif size < r.get('small', small) and not r.get('whole'):
            c = (lo[k] + hi[k]) / 2
            key = (int(role[ti]), 's', int(c[0] // cell), int(c[1] // cell), int(c[2] // cell))
        else:
            key = (int(role[ti]), 'b')
        if key not in index:
            index[key] = len(table)
            table.append({'role': int(role[ti]), 'small': key[1] == 's'})
        out[ti] = index[key]
    return out, table


def to_object(name, P, tri, nor, rgb, part):
    """One mesh carrying the piece: custom normals, and the _RGB and _PART corner attributes the game reads."""
    me = bpy.data.meshes.new(name)
    nt = len(tri)
    # only the vertices in use, shared between the triangles that meet there: the exporter welds
    # the corners of a vertex whose normal, shade and part agree, and Draco is paid per vertex
    used, inv = np.unique(tri.reshape(-1), return_inverse=True)
    me.from_pydata([tuple(v) for v in P[used]], [], [tuple(int(i) for i in t) for t in inv.reshape(-1, 3)])
    me.polygons.foreach_set('use_smooth', [True] * nt)
    me.normals_split_custom_set([tuple(n) for n in nor.reshape(-1, 3)])
    a = me.attributes.new('_RGB', 'FLOAT_VECTOR', 'CORNER')
    a.data.foreach_set('vector', np.clip(rgb, 0, 2).reshape(-1).astype(np.float32))
    b = me.attributes.new('_PART', 'FLOAT', 'CORNER')
    b.data.foreach_set('value', np.repeat(part, 3).astype(np.float32))
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def visible(P, tri, rays=48, reach=None, floor=None, wall=None):
    """
    `floor` (a height) and `wall` (a depth, blender y) are what the piece will stand on and hang
    against: neither is part of it, both hide what faces them, and nothing behind the wall is kept.
    Triangles that can be seen from outside the piece: a ray from somewhere on the triangle gets
    away without hitting anything. Board backs, the faces boxes press together and whatever is
    sealed inside go; nothing that could ever be looked at does.
    """
    pts = [Vector(p) for p in P]; polys = [tuple(int(i) for i in t) for t in tri]
    lo, hi = P.min(axis=0), P.max(axis=0); pad = float(np.linalg.norm(hi - lo)) * 4 + 1
    def sheet(a, b, c, d):
        n = len(pts); pts.extend(Vector(v) for v in (a, b, c, d)); polys.append((n, n + 1, n + 2)); polys.append((n, n + 2, n + 3))
    if floor is not None:
        z = floor - 0.004
        sheet((lo[0] - pad, lo[1] - pad, z), (hi[0] + pad, lo[1] - pad, z), (hi[0] + pad, hi[1] + pad, z), (lo[0] - pad, hi[1] + pad, z))
    if wall is not None:
        y = wall + 0.004
        sheet((lo[0] - pad, y, lo[2] - pad), (hi[0] + pad, y, lo[2] - pad), (hi[0] + pad, y, hi[2] + pad), (lo[0] - pad, y, hi[2] + pad))
    bvh = BVHTree.FromPolygons(pts, polys, all_triangles=True)
    if reach is None: reach = float(np.linalg.norm(hi - lo)) * 2
    hemi = _hemisphere(rays, seed=3)
    rnd = random.Random(11)
    bary = [(1 / 3, 1 / 3)] + [(rnd.random(), rnd.random()) for _ in range(14)]
    keep = np.zeros(len(tri), dtype=bool)
    for ti in range(len(tri)):
        a, b, c = (Vector(P[i]) for i in tri[ti])
        n = (b - a).cross(c - a)
        if n.length < 1e-12: continue
        if wall is not None and min(a.y, b.y, c.y) >= wall - 1e-4: continue
        if floor is not None and max(a.z, b.z, c.z) <= floor + 1e-4: continue
        n.normalize()
        t = n.orthogonal().normalized(); bt = n.cross(t)
        mid = (a + b + c) / 3
        seen = False
        # a panel's middle and corners are exactly where a brace or a frame board lies over it: look from all over
        for u, v in bary:
            if u + v > 1: u, v = 1 - u, 1 - v
            o = a + (b - a) * u + (c - a) * v + n * 0.0015
            for hx, hy, hz in hemi:
                if bvh.ray_cast(o, t * hx + bt * hy + n * hz, reach)[0] is None: seen = True; break
            if seen: break
        keep[ti] = seen
    return keep


def unburied(ao, floor=0.035):
    """Triangles worth keeping: those not sealed inside the piece (all three corners fully occluded)."""
    return ao.max(axis=1) > floor
