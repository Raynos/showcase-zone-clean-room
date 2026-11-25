"""
Mesh -> Blender object -> UV atlas -> Cycles bakes of a UV-space G-buffer (ambient occlusion,
edge proximity, position, normal, primitive coordinates, colour, ids) -> numpy arrays that
paint.py turns into the model's painted texture.
"""
import math
import os
import time

import bmesh
import bpy
import numpy as np

from . import kit


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.use_denoising = False
    sc.render.threads_mode = 'AUTO'
    return sc


def g2b(V):
    """game (x, y, z) -> Blender (x, -z, y)"""
    V = np.asarray(V, dtype=np.float64)
    return np.stack([V[:, 0], -V[:, 2], V[:, 1]], axis=1)


def build_object(model: kit.Model):
    V = np.asarray(model.V, dtype=np.float64)
    mesh = bpy.data.meshes.new(model.name)
    mesh.from_pydata(g2b(V).tolist(), [], model.F)
    mesh.update()
    nf = len(model.F)

    def fattr(name, vals, typ='FLOAT'):
        a = mesh.attributes.new(name, typ, 'FACE')
        a.data.foreach_set('value', np.asarray(vals, dtype=np.float32))

    fattr('surf', model.f_surf); fattr('slot', model.f_slot)
    fattr('fmetal', model.f_metal); fattr('frough', model.f_rough); fattr('femit', model.f_emit)
    col = mesh.attributes.new('fcol', 'FLOAT_COLOR', 'FACE')
    c = np.ones((nf, 4), dtype=np.float32); c[:, :3] = np.asarray(model.f_col, dtype=np.float32)
    col.data.foreach_set('color', c.ravel())
    pv = np.asarray(model.v_prim)
    pinfo = np.stack([pv, np.asarray(model.p_type)[pv], np.zeros(len(pv))], axis=1)
    for name, vals in (('tco', model.v_tco), ('tsz', model.v_tsz), ('pinfo', pinfo)):
        a = mesh.attributes.new(name, 'FLOAT_VECTOR', 'POINT')
        a.data.foreach_set('vector', np.asarray(vals, dtype=np.float32).ravel())

    obj = bpy.data.objects.new(model.name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)

    # hard edges around flat faces, then everything smooth: weighted normals keep panels flat
    bm = bmesh.new(); bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()
    for f, sm in zip(bm.faces, model.f_smooth):
        if not sm:
            for e in f.edges: e.smooth = False
        f.smooth = True
    bm.to_mesh(mesh); bm.free()
    mod = obj.modifiers.new('wn', 'WEIGHTED_NORMAL')
    mod.keep_sharp = True; mod.weight = 60; mod.mode = 'FACE_AREA'
    bpy.ops.object.modifier_apply(modifier='wn')
    return obj


def unwrap(obj, model: kit.Model, margin=0.004, angle=66.0):
    """Smart-project the whole model into one atlas. Per-primitive `texel` scales its share."""
    mesh = obj.data
    V = np.asarray(model.V, dtype=np.float64)
    prim = np.asarray(model.v_prim)
    # texel density: scale each primitive about its centre before projecting, restore after
    tex_v = np.ones(len(V))
    for f, t in zip(model.F, model.f_texel):
        for i in f: tex_v[i] = t
    cen = np.zeros((model.n_prims, 3)); cnt = np.zeros(model.n_prims)
    np.add.at(cen, prim, V); np.add.at(cnt, prim, 1)
    cen /= np.maximum(cnt, 1)[:, None]
    S = cen[prim] + (V - cen[prim]) * tex_v[:, None]
    mesh.vertices.foreach_set('co', g2b(S).ravel())
    mesh.update()
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(angle), island_margin=0.0, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.select_all(action='SELECT')
    try:
        bpy.ops.uv.pack_islands(rotate=True, margin_method='FRACTION', margin=margin, shape_method='AABB')
    except TypeError:
        bpy.ops.uv.pack_islands(rotate=True, margin=margin)
    bpy.ops.object.mode_set(mode='OBJECT')
    mesh.vertices.foreach_set('co', g2b(V).ravel())
    mesh.update()


def _bake_material(obj, size):
    mat = bpy.data.materials.new('bake')
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes): nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(em.outputs[0], out.inputs[0])
    img_node = nt.nodes.new('ShaderNodeTexImage')
    nt.nodes.active = img_node
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return mat, nt, em, img_node


def gbuffer(obj, size, ao_dist=0.3, edge_dist=0.03, samples=48, margin=4):
    """Bake the UV-space G-buffer. Returns dict of float arrays (size, size, 3), top row first."""
    sc = bpy.context.scene
    mat, nt, em, img_node = _bake_material(obj, size)
    N = nt.nodes
    geo = N.new('ShaderNodeNewGeometry')
    ao = N.new('ShaderNodeAmbientOcclusion'); ao.samples = 16; ao.inputs['Distance'].default_value = ao_dist
    ao2 = N.new('ShaderNodeAmbientOcclusion'); ao2.samples = 16; ao2.inputs['Distance'].default_value = ao_dist * 3.0
    edge = N.new('ShaderNodeAmbientOcclusion'); edge.samples = 16; edge.inside = True; edge.only_local = True
    edge.inputs['Distance'].default_value = edge_dist

    def attr(name):
        a = N.new('ShaderNodeAttribute'); a.attribute_type = 'GEOMETRY'; a.attribute_name = name
        return a

    ids = N.new('ShaderNodeCombineXYZ')
    nt.links.new(attr('surf').outputs['Fac'], ids.inputs[0])
    nt.links.new(attr('slot').outputs['Fac'], ids.inputs[1])
    nt.links.new(attr('femit').outputs['Fac'], ids.inputs[2])
    aoc = N.new('ShaderNodeCombineXYZ')
    nt.links.new(ao.outputs['AO'], aoc.inputs[0])
    nt.links.new(ao2.outputs['AO'], aoc.inputs[1])
    nt.links.new(edge.outputs['AO'], aoc.inputs[2])
    one = N.new('ShaderNodeRGB'); one.outputs[0].default_value = (1, 1, 1, 1)
    passes = [
        ('cover', one.outputs[0], 1, 0),
        ('ao', aoc.outputs[0], samples, margin),
        ('pos', geo.outputs['Position'], 1, margin),
        ('nor', geo.outputs['Normal'], 1, margin),
        ('tco', attr('tco').outputs['Vector'], 1, margin),
        ('tsz', attr('tsz').outputs['Vector'], 1, margin),
        ('col', attr('fcol').outputs['Color'], 1, margin),
        ('ids', ids.outputs[0], 1, margin),
        ('pinfo', attr('pinfo').outputs['Vector'], 1, margin),
    ]
    res = {}
    sc.render.bake.use_clear = True
    sc.render.bake.margin_type = 'EXTEND'
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    for name, sock, spp, mg in passes:
        img = bpy.data.images.new('bake_' + name, size, size, alpha=False, float_buffer=True, is_data=True)
        img_node.image = img
        for l in list(em.inputs[0].links): nt.links.remove(l)
        nt.links.new(sock, em.inputs[0])
        sc.cycles.samples = spp
        sc.render.bake.margin = mg
        t0 = time.time()
        bpy.ops.object.bake(type='EMIT')
        px = np.empty(size * size * 4, dtype=np.float32)
        img.pixels.foreach_get(px)
        res[name] = px.reshape(size, size, 4)[::-1, :, :3].copy()
        bpy.data.images.remove(img)
        print(f'  bake {name}: {time.time() - t0:.1f}s')
    # back to game coordinates
    for k in ('pos', 'nor'):
        a = res[k]
        res[k] = np.stack([a[..., 0], a[..., 2], -a[..., 1]], axis=-1)
    obj.data.materials.clear()
    return res


def save_rgba(arr, path, quality=90):
    """arr: (H, W, 4) floats 0..1, top row first, already in sRGB. Writes .png or .webp."""
    h, w = arr.shape[:2]
    img = bpy.data.images.new('out', w, h, alpha=True, float_buffer=False, is_data=True)
    img.alpha_mode = 'STRAIGHT'
    img.pixels.foreach_set(np.clip(arr[::-1], 0, 1).astype(np.float32).ravel())
    ext = os.path.splitext(path)[1].lower()
    img.file_format = 'WEBP' if ext == '.webp' else 'PNG'
    img.filepath_raw = path
    try:
        img.save(quality=quality)
    except TypeError:
        img.save()
    bpy.data.images.remove(img)
