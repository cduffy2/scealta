"""Scene 01 foreground layers from the isolated Midjourney pieces (trees A and B, bushes),
cut off their black backgrounds, plus thickness maps for 3D inflation.
The background stays the original painting (s01_well_up.png)."""
import json
import sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(sys.argv[1])
SRC, CUT, OUT3 = ROOT / "assets/source", ROOT / "assets/cutouts", ROOT / "assets/3d"

# name: (source, working width, luminance threshold, dome height as share of the half-width)
# TRIM: below this share of the tree's height, keep only the trunk (drops painted ground bushes)
LAYERS = {
    "tree_a": ("s01_tree_a.png", 1200, 40, 0.55),
    "tree_b": ("s01_tree_b.png", 1200, 40, 0.55),
    "bushes": ("s01_bushes.png", 2400, 40, 0.35),
}
TRIM = {"tree_b": 0.83}
# ROUND_ENDS: share of the width at each end shaped into a rounded bush outline, so a band
# cut by the image frame ends in a curve instead of a straight edge
ROUND_ENDS = {"bushes": 0.07}
meta = {}
for name, (file, width, thresh, dome_k) in LAYERS.items():
    im = Image.open(SRC / file).convert("RGB")
    im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    a = np.asarray(im)
    lum = a.max(2).astype(np.float32)
    m = ndi.binary_closing(lum > thresh, np.ones((7, 7)))
    m = ndi.binary_fill_holes(m)
    lab, n = ndi.label(m)
    sizes = ndi.sum(m, lab, range(1, n + 1))
    m = lab == 1 + int(np.argmax(sizes))  # the tree (or bush band); drops stars and stray bits
    m = ndi.binary_opening(m, np.ones((3, 3)))
    if name in TRIM:
        ys, _ = np.nonzero(m)
        cut = int(ys.min() + (ys.max() - ys.min()) * TRIM[name])
        r, g = a[..., 0].astype(int), a[..., 1].astype(int)
        trunk = ndi.binary_closing((r > g + 15) & (r > 90), np.ones((9, 9)))
        m[cut:] &= trunk[cut:]
        lab, n2 = ndi.label(m)
        m = lab == 1 + int(np.argmax(ndi.sum(m, lab, range(1, n2 + 1))))
    alpha = ndi.gaussian_filter(m.astype(np.float32), 0.8)

    if name in ROUND_ENDS:
        H_, W_ = m.shape
        ys, xs = np.nonzero(m)
        top, bot = ys.min(), ys.max()
        e = ROUND_ENDS[name] * W_
        X = np.arange(W_)[None, :]
        Y = np.arange(H_)[:, None]
        for x_end, sign in ((xs.min(), 1), (xs.max(), -1)):
            # quarter-ellipse falling from full height to the ground over the end
            u = np.clip((X - x_end) * sign / e, 0, 1)
            limit = bot - (bot - top) * np.sqrt(np.clip(1 - (1 - u) ** 2, 0, 1))
            near = (X - x_end) * sign < e
            m &= ~(near & (Y < limit))
    ys, xs = np.nonzero(m)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgba = np.dstack([a, (alpha * 255).astype(np.uint8)])[y0:y1, x0:x1]
    Image.fromarray(rgba).save(CUT / f"s01_{name}.png")

    mk = m[y0:y1, x0:x1]
    # pad every side except the ones cut by the image frame, so cut edges stay full height
    pad = [(0 if y1 == m.shape[0] else 1, 1), (1 if x0 > 0 else 0, 1 if x1 < m.shape[1] else 0)]
    pad[0] = (1, 0 if y1 == m.shape[0] else 1)
    dist = ndi.distance_transform_edt(np.pad(mk, pad, mode="edge"))[pad[0][0]:pad[0][0] + mk.shape[0], pad[1][0]:pad[1][0] + mk.shape[1]]
    dome = np.sqrt(dist / dist.max()) * dist.max() * dome_k
    lumpy = 0.85 + 0.3 * ndi.gaussian_filter(lum[y0:y1, x0:x1], 6) / 255
    z = np.where(mk, ndi.gaussian_filter(dome * lumpy, 2), 0).astype(np.float32)
    np.save(OUT3 / f"s01_{name}_height.npy", z)
    meta[name] = {"w": int(x1 - x0), "h": int(y1 - y0)}
    print(name, meta[name], "zmax", round(float(z.max()), 1), "components dropped", n - 1)
(OUT3 / "s01_layers.json").write_text(json.dumps(meta, indent=2))
