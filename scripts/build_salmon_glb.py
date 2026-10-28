"""Rebuild site/public/3d/salmon.glb from the thickness map, in a background Blender:

    python3 scripts/fish_height.py .
    python3 scripts/salmon_texture.py <source texture>   # only if the artwork changes
    /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python scripts/build_salmon_glb.py

The material is carried over from the current salmon.glb, with its texture swapped for
assets/3d/salmon_texture.png (the cleaned outline); the mesh is rebuilt with
scripts/blender_inflate.py. Nothing in the blender/ files is touched."""
import os
import bpy
import bmesh

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
GLB = os.path.join(ROOT, "site/public/3d/salmon.glb")
PX = 0.002  # world units per pixel of s00_salmon_complete.png (the model is 3.27 long)
STEP = 5
# The texture is the upscaled cut-out (s00_salmon_complete_up.png), cropped tighter than
# s00_salmon_complete.png, so its fish sits slightly larger in frame. Fitted by matching
# the two alpha masks; without it the artwork overran the mesh and the edge showed steps.
UV_AFFINE = (1.00298, -0.00068, 1.04580, -0.02328)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)
old = next(o for o in bpy.data.objects if o.type == "MESH")
tex = bpy.data.images.load(os.path.join(ROOT, "assets/3d/salmon_texture.png"))
for node in old.data.materials[0].node_tree.nodes:
    if node.type == "TEX_IMAGE":
        node.image = tex
exec(open(os.path.join(ROOT, "scripts/blender_inflate.py")).read())
new = inflate("salmon", os.path.join(ROOT, "assets/source/s00_salmon_complete.png"),
              os.path.join(ROOT, "assets/3d/salmon_height.npy"), PX, step=STEP, uv_affine=UV_AFFINE)

bm = bmesh.new()
bm.from_mesh(new.data)
open_edges = sum(e.is_boundary for e in bm.edges)
bm.free()
print(f"salmon: {len(new.data.vertices)} verts, {open_edges} open edges")

new.data.materials.clear()
new.data.materials.append(old.data.materials[0])
old.data = new.data
bpy.data.objects.remove(new, do_unlink=True)
old.name = "salmon"
for o in bpy.data.objects:
    o.select_set(o == old)
bpy.ops.export_scene.gltf(
    filepath=GLB, export_format="GLB", use_selection=True, export_yup=True, export_normals=True,
    export_materials="EXPORT", export_image_format="WEBP", export_image_quality=90,
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
    export_draco_position_quantization=14, export_draco_normal_quantization=10,
    export_draco_texcoord_quantization=12, export_animations=False,
)
print("wrote", GLB, os.path.getsize(GLB))
