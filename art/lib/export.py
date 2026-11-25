"""
Skeleton + skin + Draco-compressed .glb export, and the top-level `build` that runs a model
through the whole pipeline: geometry -> atlas -> bake -> paint -> texture + .glb on disk.
"""
import json
import os
import time

import bpy
import numpy as np

from . import bake, kit, paint

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'public', 'models')


def add_export_attributes(obj, model: kit.Model):
    """Per-corner shading inputs the runtime material reads: _MRE = (metal, rough, emit), _SLOT = palette slot."""
    mesh = obj.data
    nl = len(mesh.loops)
    counts = np.array([len(f) for f in model.F])
    rep = lambda a: np.repeat(np.asarray(a, dtype=np.float32), counts)
    mr = mesh.attributes.new('_MRE', 'FLOAT_VECTOR', 'CORNER')
    mr.data.foreach_set('vector', np.stack([rep(model.f_metal), rep(model.f_rough), rep(model.f_emit)], axis=1).ravel())
    es = mesh.attributes.new('_SLOT', 'FLOAT', 'CORNER')
    # the level-of-detail flag rides in the slot value: +32 fine-only, +64 far-only (src/gfx/models.ts)
    es.data.foreach_set('value', rep(np.asarray(model.f_slot, dtype=np.float32) + 32.0 * np.asarray(model.f_lod, dtype=np.float32)))
    assert len(mr.data) == nl
    for name in ('surf', 'slot', 'fmetal', 'frough', 'femit', 'fcol', 'tco', 'tsz', 'pinfo'):
        a = mesh.attributes.get(name)
        if a: mesh.attributes.remove(a)


def rig(obj, model: kit.Model):
    arm = bpy.data.armatures.new(model.name + '_rig')
    aobj = bpy.data.objects.new(model.name + '_rig', arm)
    bpy.context.scene.collection.objects.link(aobj)
    for o in bpy.context.selected_objects: o.select_set(False)
    bpy.context.view_layer.objects.active = aobj
    aobj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    for b in model.bones:
        eb = arm.edit_bones.new(b['name'])
        p = b['pos']
        eb.head = (p[0], -p[2], p[1])
        # pointing up with no roll, a bone's local axes are the game's (x right, y up, z forward),
        # so the exported joint has no rest rotation and behaves like a plain pivot
        eb.tail = (p[0], -p[2], p[1] + 0.1)
        eb.roll = 0.0
        if b['parent']: eb.parent = arm.edit_bones[b['parent']]
    bpy.ops.object.mode_set(mode='OBJECT')
    groups = {b['name']: obj.vertex_groups.new(name=b['name']) for b in model.bones}
    vb = {}
    for f, bi in zip(model.F, model.f_bone):
        for i in f: vb[i] = bi
    by_bone = {}
    for i, bi in vb.items():
        if model.weights and i in model.weights: continue
        by_bone.setdefault(bi, []).append(i)
    for bi, ix in by_bone.items():
        groups[model.bones[bi]['name']].add(ix, 1.0, 'REPLACE')
    if model.weights:
        for i, ws in model.weights.items():
            tot = sum(w for _, w in ws) or 1.0
            for name, w in ws:
                if w > 1e-4: groups[name].add([i], w / tot, 'REPLACE')
    mod = obj.modifiers.new('arm', 'ARMATURE')
    mod.object = aobj
    obj.parent = aobj
    return aobj


def export_glb(obj, aobj, path):
    for o in bpy.context.selected_objects: o.select_set(False)
    obj.select_set(True); aobj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
        export_texcoords=True, export_normals=True, export_tangents=False, export_materials='NONE',
        export_attributes=True, export_skins=True, export_def_bones=False, export_animations=False,
        export_vertex_color='NONE', export_extras=False, export_cameras=False, export_lights=False,
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14, export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12, export_draco_generic_quantization=12,
    )


def build(model: kit.Model, tex=512, ao_dist=0.3, edge_dist=0.03, samples=48, margin=4, quality=88, variant=None, post=None, **paint_cfg):
    """Run the whole pipeline for one model. Writes public/models/<name>.glb and <name>.webp."""
    t0 = time.time()
    if os.environ.get('ART_DRAFT'):   # quick look while modelling: few occlusion samples; never commit its output
        samples = 6
    os.makedirs(OUT, exist_ok=True)
    bake.reset_scene()
    obj = bake.build_object(model)
    bake.unwrap(obj, model, margin=max(0.002, 2.0 / tex))
    # variant dressing (opt_* bones) must not shadow the body it is optional on, and a far-only
    # stand-in (lod 2) sits in the same place as the detail it replaces: neither may shade the other
    apart = np.zeros((len(model.V), 3), dtype=np.float32)
    opt = {i: k for k, i in enumerate(i for i, b in enumerate(model.bones) if b['name'].startswith('opt_'))}
    far = False
    for f, bi, lod in zip(model.F, model.f_bone, model.f_lod):
        off = np.zeros(3, dtype=np.float32)
        if bi in opt: off[2] = 40.0 * (opt[bi] + 1)
        if lod == 2: off[0] = 60.0; far = True
        if off.any():
            for i in f: apart[i] = off
    gb = bake.gbuffer(obj, tex, ao_dist=ao_dist, edge_dist=edge_dist, samples=samples, margin=margin, apart=apart if (opt or far) else None)
    rgba, cover = paint.paint(gb, **paint_cfg)
    if post:
        painted = post(rgba, gb, cover)
        if painted is not None: rgba = painted
    tex_path = os.path.join(OUT, model.name + '.webp')
    rgba[..., 3] = np.maximum(rgba[..., 3], 3.0 / 255.0)   # lossy WebP discards colour under alpha 0
    bake.save_rgba(rgba, tex_path, quality)
    add_export_attributes(obj, model)
    aobj = rig(obj, model)
    glb = os.path.join(OUT, model.name + '.glb')
    export_glb(obj, aobj, glb)
    meta = {
        'name': model.name, 'tris': model.tri_count(), 'bones': [b['name'] for b in model.bones],
        'sockets': {k: {'bone': v[0], 'at': list(v[1])} for k, v in model.sockets.items()},
        'tex': tex, 'glb_bytes': os.path.getsize(glb), 'tex_bytes': os.path.getsize(tex_path),
    }
    print(f"BUILT {model.name}: {meta['tris']} tris, {len(model.bones)} bones, glb {meta['glb_bytes'] / 1024:.0f} KB, tex {meta['tex_bytes'] / 1024:.0f} KB, {time.time() - t0:.1f}s")
    return meta
