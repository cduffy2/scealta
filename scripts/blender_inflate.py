"""Blender helper: turn a cut-out PNG + thickness map (.npy) into a closed 3D mesh.
Front and back are mirrored height fields stitched at the outline; the artwork is
projected onto both sides. Run inside Blender (exec), then call inflate(...)."""
import bpy
import numpy as np


def inflate(name, png, npy, px, step=3, emission=0.6, collection=None, uv_affine=None):
    """px = world units per image pixel. Returns the new object, centred on its image.
    uv_affine = (sx, ox, sy, oy): when the texture is framed differently from the image the
    thickness map was made from, maps image coords (0-1, v down) to texture coords:
    u' = sx * u + ox, v' = sy * v + oy."""
    z = np.load(npy)
    H, W = z.shape
    ys, xs = np.arange(0, H, step), np.arange(0, W, step)
    zz = z[np.ix_(ys, xs)]
    inside = zz > 0
    # Bleed the mesh one grid cell past the silhouette (at zero thickness) so it covers
    # the artwork's edge; the texture's alpha cuts the exact outline, not the stepped grid.
    pad = np.pad(inside, 1)
    grown = np.zeros_like(inside)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            grown |= pad[1 + dy:pad.shape[0] - 1 + dy, 1 + dx:pad.shape[1] - 1 + dx]
    inside = grown
    pad = np.pad(inside, 1)
    # A point is on the outline if any of its 8 neighbours is outside. With only 4, a point
    # whose outside neighbour is diagonal kept its thickness, the quad it touches was never
    # built, and front and back were left unstitched there (holes into the mesh).
    full = np.ones_like(inside)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            full &= pad[1 + dy:pad.shape[0] - 1 + dy, 1 + dx:pad.shape[1] - 1 + dx]
    edge = inside & ~full

    sx, ox, sy, oy = uv_affine or (1.0, 0.0, 1.0, 0.0)
    uv_of = lambda x, y: (sx * x / W + ox, 1 - (sy * y / H + oy))
    verts, uvs = [], []
    front = -np.ones(inside.shape, int); back = -np.ones(inside.shape, int)
    for i, j in zip(*np.nonzero(inside)):
        x, y = xs[j], ys[i]
        t = 0.0 if edge[i, j] else float(zz[i, j])
        front[i, j] = len(verts); verts.append(((x - W / 2) * px, t * px, (H / 2 - y) * px)); uvs.append(uv_of(x, y))
        if edge[i, j]:
            back[i, j] = front[i, j]
        else:
            back[i, j] = len(verts); verts.append(((x - W / 2) * px, -t * px, (H / 2 - y) * px)); uvs.append(uv_of(x, y))
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
