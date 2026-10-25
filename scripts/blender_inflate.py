"""Blender helper: turn a cut-out PNG + thickness map (.npy) into a closed 3D mesh.
Front and back are mirrored height fields stitched at the outline; the artwork is
projected onto both sides. Run inside Blender (exec), then call inflate(...)."""
import bpy
import numpy as np


def inflate(name, png, npy, px, step=3, emission=0.6, collection=None):
    """px = world units per image pixel. Returns the new object, centred on its image."""
    z = np.load(npy)
    H, W = z.shape
    ys, xs = np.arange(0, H, step), np.arange(0, W, step)
    zz = z[np.ix_(ys, xs)]
    inside = zz > 0
    pad = np.pad(inside, 1)
    edge = inside & ~(pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:])

    verts, uvs = [], []
    front = -np.ones(inside.shape, int); back = -np.ones(inside.shape, int)
    for i, j in zip(*np.nonzero(inside)):
        x, y = xs[j], ys[i]
        t = 0.0 if edge[i, j] else float(zz[i, j])
        front[i, j] = len(verts); verts.append(((x - W / 2) * px, t * px, (H / 2 - y) * px)); uvs.append((x / W, 1 - y / H))
        if edge[i, j]:
            back[i, j] = front[i, j]
        else:
            back[i, j] = len(verts); verts.append(((x - W / 2) * px, -t * px, (H / 2 - y) * px)); uvs.append((x / W, 1 - y / H))
    faces = []
    gh, gw = inside.shape
    for i in range(gh - 1):
        for j in range(gw - 1):
            if inside[i, j] and inside[i, j + 1] and inside[i + 1, j + 1] and inside[i + 1, j]:
                f = [front[i, j], front[i, j + 1], front[i + 1, j + 1], front[i + 1, j]]
                b = [back[i, j], back[i + 1, j], back[i + 1, j + 1], back[i, j + 1]]
                faces.append(f)
                if len(set(b)) == 4 and b != f[::-1]:
                    faces.append(b)

    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    uvl = me.uv_layers.new()
    for poly in me.polygons:
        for li in poly.loop_indices:
            uvl.data[li].uv = uvs[me.loops[li].vertex_index]
    me.shade_smooth(); me.validate(); me.update()

    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree; nt.nodes.clear()
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(png, check_existing=True); tex.interpolation = "Cubic"
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(tex.outputs["Color"], b.inputs["Base Color"])
    nt.links.new(tex.outputs["Color"], b.inputs["Emission Color"])
    b.inputs["Emission Strength"].default_value = emission
    b.inputs["Roughness"].default_value = 0.8
    b.inputs["Specular IOR Level"].default_value = 0.1
    out = nt.nodes.new("ShaderNodeOutputMaterial"); nt.links.new(b.outputs[0], out.inputs[0])
    me.materials.append(mat)

    ob = bpy.data.objects.new(name, me)
    (collection or bpy.context.scene.collection).objects.link(ob)
    return ob
