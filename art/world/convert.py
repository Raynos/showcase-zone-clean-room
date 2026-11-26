"""
Static world pieces:  blender -b --factory-startup -P art/world/convert.py -- <manifest.json> [piece ...]

Converts authored meshes (.glb) into public/models/world/<out>.glb: one Draco mesh per piece,
with no materials, textures or UVs. Each corner carries a shade (_RGB) and a part index (_PART);
the piece's part table (texture layer, base colour, emission, level-of-detail bias) rides in the
node's extras. src/world/pieces.ts stacks the parts into the world chunks like any other
primitive, so a piece takes the world's light, fog, wetness, shadows and surface detail and costs
triangles only. The method is in art/lib/static.py.

The manifest is kept outside the repository, next to the source meshes:

    { "root": "<dir the sources are under>", "cache": "<dir for converted pieces>", "out": "kit",
      "roles": { "<name>": {role}, ... },     shared roles; "mats" may name one, or {"use": "<name>", ...changes}
      "pieces": { "<piece name>": {
          "src": "file.glb"  |  [{"file": "a.glb", "at": [x, y, z], "yaw": deg, "scale": s, "keep": "<node regex>", "drop": "<node regex>"}],
          "fit": [x, y, z],        size to stretch the piece to, metres, game axes (null keeps an axis in proportion)
          "scale": s, "yaw": deg,  applied before fit
          "origin": "base" | "keep" | "centre",
          "angle": 38, "dissolve": 0.6, "ratio": 1.0, "ao": metres, "cool": [r, g, b] (the tint occlusion darkens toward), "grime": [height, strength], "small": 0.2,
          "mats": [["<material regex>", {role}], ...]     first match wins; no match keeps the source colour on a layer guessed from the name
      } } }

A role: {"name", "layer" (a T layer name in src/gfx/textures.ts), "color" "#rrggbb", "emit", "uv" (tiles per metre),
"lod" (size multiplier for the distance level-of-detail; under 1 also makes the part trim, which casts no shadow, unless "cast": true), "jit" (tone drift between islands), "ao" (depth of occlusion),
"ratio" (edge-collapse for this role alone), "drop": true, "split": true (each island its own part), "whole": true
(never clustered as small), "vcol": true (keep the source's vertex colours as tone), "show": true (never dropped as hidden: decals that lie on a face), "box": true (each island
that is nearly a box becomes one: the cheap level of a board)}.

Pieces are cached one file each, so naming pieces rebuilds only those; the .glb is always
written from everything in the cache that the manifest lists.
"""
import json
import math
import os
import re
import sys
import time

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

from lib import static  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, 'public', 'models', 'world')

# layer guessed from a material's name when the manifest gives no role
GUESS = [
    (r'glass|lens|ember|glow|diode|opal|tungsten|emissive', 'flat'),
    (r'brick|terracotta|kiln', 'redbrick'), (r'clay|tile', 'roof'),
    (r'brass|bronze|gold', 'brass'),
    (r'oak|wood|timber|plank', 'planks'),
    (r'stone|sandstone|limestone|basalt|mortar|concrete|precast', 'brick'),
    (r'canvas|linen|cloth|saffron', 'canvas'),
    (r'rubber|gasket|seal', 'rubber'),
    (r'enamel|paint|orange|ochre|powder', 'panel'),
    (r'iron|steel|metal|zinc|gunmetal|graphite|alloy|nail|fastener|bolt', 'metal'),
]


def srgb(c):
    return '#%02x%02x%02x' % tuple(int(round(255 * (12.92 * x if x <= 0.0031308 else 1.055 * x ** (1 / 2.4) - 0.055))) for x in (max(0.0, min(1.0, v)) for v in c[:3]))


def source_colour(mat):
    if not mat or not mat.node_tree: return (0.5, 0.5, 0.5), 0.0
    for n in mat.node_tree.nodes:
        if n.type == 'BSDF_PRINCIPLED':
            base = n.inputs['Base Color']
            col = tuple(base.default_value[:3])
            em = n.inputs.get('Emission Strength'); ec = n.inputs.get('Emission Color')
            glow = (em.default_value if em else 0.0) * (max(ec.default_value[:3]) if ec else 0.0)
            return col, glow
    return (0.5, 0.5, 0.5), 0.0


def load_sources(spec, root):
    srcs = spec['src'] if isinstance(spec['src'], list) else [spec['src']]
    objs = []
    for s in srcs:
        if isinstance(s, str): s = {'file': s}
        before = set(bpy.context.scene.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(root, s['file']))
        new = [o for o in bpy.context.scene.objects if o not in before]
        tops = [o for o in new if o.parent is None or o.parent not in new]
        at = s.get('at', [0, 0, 0]); yaw = math.radians(s.get('yaw', 0)); sc = s.get('scale', 1)
        from mathutils import Matrix
        # game axes (x right, y up, z front) -> blender (x, -z, y)
        m = Matrix.Translation((at[0], -at[2], at[1])) @ Matrix.Rotation(yaw, 4, 'Z') @ Matrix.Scale(sc, 4)
        for o in tops: o.matrix_world = m @ o.matrix_world
        bpy.context.view_layer.update()
        for o in new:
            if o.type != 'MESH': continue
            if s.get('keep') and not re.search(s['keep'], o.name, re.I): continue
            if s.get('drop') and re.search(s['drop'], o.name, re.I): continue
            objs.append(o)
    return objs


def convert(name, spec, root, presets=None):
    t0 = time.time()
    presets = presets or {}
    static.reset()
    objs = load_sources(spec, root)
    static.bake_transforms(objs)
    roles = []
    seen = {}
    colours = {}
    for o in objs:
        for m in o.data.materials:
            if m: colours[m.name] = source_colour(m)

    def role_of(mname):
        if mname in seen: return seen[mname]
        role = None
        for rx, r in spec.get('mats', []):
            if re.search(rx, mname, re.I):
                # a role by name is one of the manifest's shared "roles"; {"use": name, ...} is one with changes
                if isinstance(r, str): role = dict(presets[r]); role.setdefault('name', r)
                elif 'use' in r: role = {**presets[r['use']], **{k: v for k, v in r.items() if k != 'use'}}; role.setdefault('name', r['use'])
                else: role = dict(r)
                break
        col, glow = colours.get(mname, ((0.5, 0.5, 0.5), 0.0))
        if role is None:
            role = {}
            print(f'  {name}: no role for material "{mname}" {srgb(col)}: guessing')
        if role.get('drop'): seen[mname] = None; return None
        if 'layer' not in role:
            role['layer'] = next((l for rx, l in GUESS if re.search(rx, mname, re.I)), 'metal')
        if 'color' not in role: role['color'] = srgb(col)
        if 'emit' not in role: role['emit'] = 1.2 if glow > 0.3 else 0.0
        role.setdefault('name', role['layer'])
        key = json.dumps(role, sort_keys=True)
        for i, r in enumerate(roles):
            if r['_key'] == key: seen[mname] = i; return i
        role['_key'] = key
        roles.append(role)
        seen[mname] = len(roles) - 1
        return seen[mname]

    split = static.by_material(objs, role_of)
    for ri, o in split.items():
        r = roles[ri]
        if r.get('vcol') and len(o.data.color_attributes):
            ca = o.data.color_attributes.active_color or o.data.color_attributes[0]
            o.data.color_attributes.active_color = ca
            raw = np.empty(len(ca.data) * 4); ca.data.foreach_get('color', raw)
            mean = raw.reshape(-1, 4)[:, :3].mean(axis=0)
            r['src'] = np.maximum(mean, 1e-3)
            if 'color' not in spec_role_colour(spec, r): r['color'] = srgb(mean)
        static.thin(o, spec.get('dissolve', 0.6), r.get('ratio', spec.get('ratio', 1.0)))
        static.normals(o, r.get('angle', spec.get('angle', 38.0)))
    P, tri, nor, src, role = static.soup(split)
    P, tri, nor, src, role, boxed = static.boxify(P, tri, nor, src, role, roles)

    # placement: yaw and scale, then stretch to fit, then the origin (blender axes: z up, -y front)
    yaw = math.radians(spec.get('yaw', 0)); sc = spec.get('scale', 1)
    c, s = math.cos(yaw), math.sin(yaw)
    R = np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])
    P = (P @ R.T) * sc
    nor = nor @ R.T
    lo, hi = P.min(axis=0), P.max(axis=0)
    fit = spec.get('fit')
    k = np.ones(3)
    if fit:
        want = [fit[0], fit[2], fit[1]]
        given = [w / (hi[i] - lo[i]) for i, w in enumerate(want) if w]
        prop = sum(given) / len(given)
        k = np.array([(w / (hi[i] - lo[i])) if w else prop for i, w in enumerate(want)])
        P = P * k
        nor = nor / k
        nor = nor / np.linalg.norm(nor, axis=2, keepdims=True)
        lo, hi = P.min(axis=0), P.max(axis=0)
    origin = spec.get('origin', 'base')
    if origin == 'base': P = P - np.array([(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]])
    elif origin == 'centre': P = P - (lo + hi) / 2
    lo, hi = P.min(axis=0), P.max(axis=0)
    size = hi - lo
    ao_dist = spec.get('ao', float(min(0.6, max(0.12, 0.14 * max(size)))))
    rgb, ao = static.shade(P, tri, nor, src, role, roles, ao_dist, seed=sum(map(ord, name)), grime=tuple(spec.get('grime', (0.35, 0.16))), rays=spec.get('rays', 24), cool=tuple(spec.get('cool', (0.80, 0.80, 1.0))))
    if spec.get('hidden', True):
        keep = static.visible(P, tri)
        for ri, r in enumerate(roles):
            if r.get('show'): keep |= role == ri
        tri, nor, src, role, rgb = tri[keep], nor[keep], src[keep], role[keep], rgb[keep]
    part, table = static.parts(P, tri, role, roles, small=spec.get('small', 0.2), cell=spec.get('cell', 0.7))
    if len(table) > 120: raise RuntimeError(f'{len(table)} parts: raise "cell" or "small" (the part index is stored in 7 bits)')
    meta = {'size': [round(float(size[0]), 3), round(float(size[2]), 3), round(float(size[1]), 3)], 'parts': []}
    for t in table:
        r = roles[t['role']]
        e = {'n': r['name'], 'l': r['layer'], 'c': r['color'].lstrip('#')}
        if r.get('emit'): e['e'] = r['emit']
        if r.get('uv'): e['u'] = r['uv']
        lod = r.get('lod', 1) * (r.get('lodSmall', 1) if t['small'] else 1)
        if lod != 1: e['k'] = round(lod, 3)
        if t['small']: e['s'] = 1
        # trim throws no shadow of its own: whatever is small, or goes early with distance
        if (t['small'] or lod < 1) and not r.get('cast'): e['t'] = 1
        meta['parts'].append(e)
    per = ', '.join(f"{r['name']} {int((role == i).sum())}" for i, r in enumerate(roles))
    print(f'PIECE {name}: {len(tri)} tris ({per}), {boxed} boxed, {len(table)} parts, size {meta["size"]}, ao {ao_dist:.2f} m, {time.time() - t0:.1f}s')
    return {'P': P, 'tri': tri, 'nor': nor, 'rgb': rgb, 'part': part, 'meta': json.dumps(meta)}


def spec_role_colour(spec, r):
    for rx, role in spec.get('mats', []):
        if isinstance(role, dict) and role.get('name') == r.get('name'): return role
    return {}


def export(names, cache, out):
    static.reset()
    objs = []
    tris = 0
    for n in names:
        path = os.path.join(cache, n + '.npz')
        if not os.path.exists(path): print(f'  (not converted yet: {n})'); continue
        d = np.load(path, allow_pickle=False)
        o = static.to_object(n, d['P'], d['tri'], d['nor'], d['rgb'], d['part'])
        o['kit'] = str(d['meta'])
        o.data.name = n
        objs.append(o); tris += len(d['tri'])
    static.only(objs)
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, out + '.glb')
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
        export_texcoords=False, export_normals=True, export_tangents=False, export_materials='NONE',
        export_attributes=True, export_skins=False, export_animations=False,
        export_vertex_color='NONE', export_extras=True, export_cameras=False, export_lights=False,
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
        export_draco_position_quantization=12, export_draco_normal_quantization=7,
        export_draco_generic_quantization=7,
    )
    print(f'WROTE {os.path.relpath(path, ROOT)}: {len(objs)} pieces, {tris} tris, {os.path.getsize(path) / 1024:.0f} KB')


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if not argv: print(__doc__); return
    man = json.load(open(argv[0]))
    want = argv[1:]
    cache = man['cache']
    os.makedirs(cache, exist_ok=True)
    for name, spec in man['pieces'].items():
        path = os.path.join(cache, name + '.npz')
        stale = not os.path.exists(path) or name in want or 'all' in want
        if not stale: continue
        try:
            np.savez(path, **convert(name, spec, man['root'], man.get('roles')))
        except Exception as e:  # one bad piece must not stop the rest
            import traceback; traceback.print_exc()
            print(f'FAILED {name}: {e}')
    export(list(man['pieces'].keys()), cache, man.get('out', 'kit'))


main()
