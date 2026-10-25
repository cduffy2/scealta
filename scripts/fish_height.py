"""Thickness map for inflating the 2D salmon into a 3D body.
Body: rounded (sqrt of distance to the outline). Fins and tail: stay thin."""
import sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(sys.argv[1])
im = np.asarray(Image.open(ROOT / "assets/source/s00_salmon_complete.png"))
alpha = im[..., 3] > 40

# clean mask: largest component, holes filled (drops the stray white specks)
lab, n = ndi.label(alpha)
sizes = ndi.sum(alpha, lab, range(1, n + 1))
mask = ndi.binary_fill_holes(lab == 1 + int(np.argmax(sizes)))

dist = ndi.distance_transform_edt(mask)
H, W = mask.shape
# Per column: top and bottom of the silhouette. Fins are short local spikes in
# those curves, so a wide median ignores them; max/min keep the body side.
cols = np.arange(W)
has_m = mask.any(0)
top_raw = np.where(has_m, mask.argmax(0), H / 2).astype(float)
bot_raw = np.where(has_m, H - 1 - mask[::-1].argmax(0), H / 2).astype(float)
top = ndi.gaussian_filter1d(np.maximum(top_raw, ndi.median_filter(top_raw, 801, mode="nearest")), 10)
bot = ndi.gaussian_filter1d(np.minimum(bot_raw, ndi.median_filter(bot_raw, 401, mode="nearest")), 10)
c, R = (top + bot) / 2, np.maximum((bot - top) / 2, 1)
# Thickness tapers away after the narrowest point in front of the tail
search = (cols > W * 0.72) & (cols < W * 0.92) & has_m
x1 = int(cols[search][np.argmin(R[search])])
taper = np.where(cols > x1, np.exp(-(cols - x1) / 30.0), 1.0) * has_m
x0 = int(cols[has_m][0])
Y = np.arange(H)[:, None]
u = (Y - c[None, :]) / R[None, :]
body_z = 0.45 * R[None, :] * np.sqrt(np.clip(1 - u ** 2, 0, 1)) * taper[None, :]
fin_z = np.minimum(dist, 2.5)
z = np.where(mask, np.maximum(body_z, fin_z), 0).astype(np.float32)
z = np.where(mask, ndi.gaussian_filter(z, 2), 0).astype(np.float32)
np.save(ROOT / "assets/3d/salmon_height.npy", z)
Image.fromarray((z / z.max() * 255).astype(np.uint8)).save(ROOT / "assets/3d/salmon_height_preview.png")
Image.fromarray((mask * 255).astype(np.uint8)).save(ROOT / "assets/3d/salmon_mask.png")
print("size", mask.shape[::-1], "z max px", round(float(z.max()), 1), "body x range", int(x0), int(x1))
