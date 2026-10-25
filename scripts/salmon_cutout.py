"""Cut the upscaled salmon off its black background.
Solid silhouette (closed, holes filled) for the body, plus a luminance-soft edge so the
fine fin rays keep their glow instead of being clipped."""
import sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(sys.argv[1])
im = np.asarray(Image.open(ROOT / "assets/source/s00_salmon_complete_up.png").convert("RGB"))
lum = im.max(axis=2).astype(np.float32)

m = ndi.binary_closing(lum > 14, structure=np.ones((9, 9)))
lab, n = ndi.label(m)
m = ndi.binary_fill_holes(lab == 1 + int(np.argmax(ndi.sum(m, lab, range(1, n + 1)))))
core = ndi.binary_erosion(m, iterations=3)
edge = np.clip((lum - 6) / 40.0, 0, 1) * ndi.binary_dilation(m, iterations=2)
alpha = np.maximum(ndi.gaussian_filter(core.astype(np.float32), 1.0), edge)

out = ROOT / "assets/cutouts/s00_salmon_up.png"
Image.fromarray(np.dstack([im, (alpha * 255).astype(np.uint8)])).save(out)
old = np.asarray(Image.open(ROOT / "assets/source/s00_salmon_complete.png"))[..., 3] > 128
new = np.asarray(Image.fromarray((alpha > 0.5).astype(np.uint8) * 255).resize(old.shape[::-1])) > 128
print(out.name, im.shape[1], "x", im.shape[0], "| overlap with old cut-out (IoU):", round((old & new).sum() / (old | new).sum(), 3))
