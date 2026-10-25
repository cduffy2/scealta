"""Scene 01 plate with the painted ripples taken out of the pool, so the animated rings
drawn in code are the only ones. The thin bright ring lines are removed with a grey
opening (anything thinner than the structuring element goes), then smoothed, and blended
in over the pool through a feathered ellipse. Writes assets/cutouts/s01_calm.png."""
import sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(sys.argv[1])
im = np.asarray(Image.open(ROOT / "assets/source/s01_well_up.png").convert("RGB")).astype(np.float32)
H, W = im.shape[:2]

# pool ellipse (matches the ripple shader in site/src/three/scene01.js)
cx, cy, rx, ry = 0.505 * W, 0.78 * H, 0.34 * W * 1.35, 0.125 * H * 1.35
Y, X = np.mgrid[0:H, 0:W]
r = np.hypot((X - cx) / rx, (Y - cy) / ry)
mask = 1 - np.clip((r - 0.85) / 0.25, 0, 1)
# keep the stippled bushes along the bottom: dense yellow dots below the waterline
bright = (im[..., 0] > 120) & (im[..., 1] > 140)
# the painted rings are long horizontal strokes; the bushes are round dots. Drop anything
# that survives a long horizontal opening, so only the dots count.
lines = ndi.binary_dilation(ndi.binary_opening(bright, structure=np.ones((1, 25))), iterations=2)
dots = (bright & ~lines).astype(np.float32)
dense = ndi.uniform_filter(dots, 41) > 0.12
bushes = dense & (Y > cy + 0.55 * ry)
lab, n = ndi.label(bushes)
if n:  # real bush masses are big; small dense patches are leftover ring fragments
    sizes = ndi.sum(bushes, lab, range(1, n + 1))
    bushes = np.isin(lab, 1 + np.flatnonzero(sizes > 6000))
bushes = ndi.binary_dilation(bushes, iterations=6)
mask *= 1 - ndi.gaussian_filter(bushes.astype(np.float32), 8)
mask = mask[..., None]

# the rings run nearly horizontal, so open with a tall, narrow element: kills lines a few
# px thick, keeps the broad tone of the water
calm = np.dstack([ndi.grey_opening(im[..., c], size=(15, 5)) for c in range(3)])
calm = np.dstack([ndi.gaussian_filter(calm[..., c], (6, 14)) for c in range(3)])
out = im * (1 - mask) + calm * mask
Image.fromarray(out.clip(0, 255).astype(np.uint8)).save(ROOT / "assets/cutouts/s01_calm.png")
print("saved", W, H)
