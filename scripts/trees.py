"""Scene 01 foreground trees -> cut-outs + thickness maps for 3D inflation.
Outlines are hand-traced from full-res crops (automatic keying couldn't separate the
shaded canopy from the forest behind). Canopies get a domed profile, lumpier where the
dot clusters are brightest; trunks stay thin because they are narrow."""
import json
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

ROOT = Path(sys.argv[1])
im = np.asarray(Image.open(ROOT / "assets/source/s01_well_up.png").convert("RGB"))
H, W = im.shape[:2]
K = W / 1456  # outlines below were traced on the 1456px original
lum = ndi.gaussian_filter(im.max(2).astype(np.float32), 6 * K) / 255

TREES = {
    "left": [(0, 262), (30, 268), (60, 285), (95, 310), (120, 340), (135, 380), (138, 440), (140, 500),
             (150, 560), (155, 610), (150, 660), (130, 690), (95, 700), (60, 690), (42, 690), (42, 722),
             (20, 722), (20, 690), (0, 690)],
    "right": [(1456, 235), (1425, 245), (1395, 270), (1370, 300), (1355, 340), (1350, 390), (1330, 420),
              (1310, 450), (1300, 490), (1305, 540), (1315, 580), (1310, 620), (1300, 660), (1310, 700),
              (1456, 710)],
    "right-mid": [(1230, 188), (1300, 182), (1340, 200), (1365, 240), (1360, 300), (1335, 350), (1312, 390),
                  (1310, 505), (1294, 505), (1290, 462), (1265, 470), (1250, 452), (1210, 455), (1170, 440),
                  (1155, 400), (1150, 340), (1160, 290), (1175, 250), (1200, 210)],
}
TREES = {k: [(x * K, y * K) for x, y in v] for k, v in TREES.items()}
out = ROOT / "assets/cutouts"; out3 = ROOT / "assets/3d"
boxes = {}
for name, poly in TREES.items():
    m = Image.new("L", (W, H), 0); ImageDraw.Draw(m).polygon(poly, fill=1)
    mask = np.asarray(m, bool)
    ys, xs = np.nonzero(mask)
    y0, y1, x0, x1 = max(ys.min() - 6, 0), min(ys.max() + 7, H), max(xs.min() - 6, 0), min(xs.max() + 7, W)
    mk = mask[y0:y1, x0:x1]
    # pad so a canopy cut by the picture edge still rounds off instead of ending in a flat wall
    dist = ndi.distance_transform_edt(np.pad(mk, 1))[1:-1, 1:-1]
    dome = 0.75 * dist.max() * np.sqrt(dist / dist.max())
    lumpy = 0.85 + 0.35 * lum[y0:y1, x0:x1]
    z = np.where(mk, ndi.gaussian_filter(dome * lumpy, 2 * K), 0).astype(np.float32)
    alpha = (ndi.gaussian_filter(mk.astype(np.float32), 0.8) * 255).astype(np.uint8)
    Image.fromarray(np.dstack([im[y0:y1, x0:x1], alpha])).save(out / f"s01_tree_{name}.png")
    np.save(out3 / f"s01_tree_{name}_height.npy", z)
    boxes[name] = {"x": int(x0), "y": int(y0), "w": int(x1 - x0), "h": int(y1 - y0)}
    print(name, boxes[name], "zmax", round(float(z.max()), 1))

# Background without the trees. Each hole is filled with the foliage beside it, mirrored
# (from the side facing into the picture), so when the 3D trees move off their spots the
# camera sees more forest rather than a blur. Edges blend through a feathered mask.
bg = im.astype(np.float32)
clean = bg.copy()
FROM = {"left": "right", "right": "left", "right-mid": "left"}  # which side to borrow from
for name, poly in TREES.items():
    m = Image.new("L", (W, H), 0); ImageDraw.Draw(m).polygon(poly, fill=1)
    hole = ndi.binary_dilation(np.asarray(m, bool), iterations=round(6 * K))
    xs = np.nonzero(hole.any(0))[0]
    x0, x1 = xs.min(), xs.max() + 1
    w = x1 - x0
    if FROM[name] == "right":
        src = clean[:, x1:min(W, x1 + w)][:, ::-1]
    else:
        src = clean[:, max(0, x0 - w):x0][:, ::-1]
    patch = clean[:, x0:x1].copy()
    patch[:, : src.shape[1]] = src[:, :w] if FROM[name] == "right" else src[:, -w:] if src.shape[1] >= w else patch[:, : src.shape[1]]
    feather = ndi.gaussian_filter(hole.astype(np.float32), 10 * K)[:, x0:x1, None]
    clean[:, x0:x1] = clean[:, x0:x1] * (1 - feather) + patch * 0.88 * feather
clean = clean.clip(0, 255).astype(np.uint8)
Image.fromarray(clean).save(out / "s01_bg_no-trees.png")
(out3 / "s01_trees.json").write_text(json.dumps({"image": [W, H], "trees": boxes}, indent=2))
print("background filled", W, H)
