"""Cut scene 01 and 02 into depth layers for the S01 -> S02 transition.
Originals in assets/source stay untouched; layers go to assets/cutouts."""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as ndi

ROOT = Path(sys.argv[1])
SRC, OUT = ROOT / "assets/source", ROOT / "assets/cutouts"
OUT.mkdir(parents=True, exist_ok=True)
W, H = 1456, 816


def save(rgb, alpha, name):
    a = (np.clip(alpha, 0, 1) * 255).astype(np.uint8)
    Image.fromarray(np.dstack([rgb, a])).save(OUT / name)


def poly_mask(points, feather=3):
    m = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m).polygon(points, fill=255)
    return np.asarray(m.filter(ImageFilter.GaussianBlur(feather)), dtype=np.float32) / 255


def solid(mask, close=9, min_size=400):
    """Solid silhouette from dotted engraving: close gaps, fill holes, drop specks."""
    m = ndi.binary_closing(mask, structure=np.ones((close, close)))
    m = ndi.binary_fill_holes(m)
    lab, n = ndi.label(m)
    if n:
        sizes = ndi.sum(m, lab, range(1, n + 1))
        m = np.isin(lab, 1 + np.flatnonzero(sizes >= min_size))
    return ndi.gaussian_filter(m.astype(np.float32), 1.2)


def rect(x0, y0, x1, y1):
    r = np.zeros((H, W), bool)
    r[y0:y1, x0:x1] = True
    return r


meta = {"size": [W, H], "s01": {}, "s02": {"nuts": []}}

# ---- Scene 01: An Tobar ------------------------------------------------------
s1 = np.asarray(Image.open(SRC / "s01_well.png").convert("RGB"))
save(s1, np.ones((H, W)), "s01_bg.png")
layers = {
    "s01_trees_left.png": [(0, 268), (55, 272), (115, 320), (140, 395), (128, 470), (150, 560),
                           (148, 640), (120, 700), (60, 735), (0, 740)],
    "s01_trees_right.png": [(1456, 232), (1405, 245), (1372, 300), (1352, 380), (1318, 440),
                            (1300, 520), (1310, 600), (1290, 640), (1240, 650), (1205, 690),
                            (1200, 816), (1456, 816)],
    "s01_bushes_front.png": [(0, 735), (90, 720), (170, 738), (260, 720), (330, 718), (420, 740),
                             (520, 748), (600, 765), (680, 772), (760, 755), (840, 742),
                             (900, 718), (980, 692), (1060, 688), (1140, 700), (1210, 672),
                             (1260, 660), (1456, 700), (1456, 816), (0, 816)],
}
for name, pts in layers.items():
    save(s1, poly_mask(pts), name)
meta["s01"]["pool_centre"] = [735, 635]

# ---- Scene 02: Fintan --------------------------------------------------------
s2 = np.asarray(Image.open(SRC / "s02_fintan.png").convert("RGB")).astype(np.int16)
r, g, b = s2[..., 0], s2[..., 1], s2[..., 2]
lum = s2.max(axis=2)
rgb2 = s2.astype(np.uint8)

# Hazelnuts: orange/yellow discs. The fish's eye is orange too, so skip it.
orange = (r > 140) & (b < 130) & (r - g > 15)
lab, n = ndi.label(ndi.binary_closing(orange, np.ones((5, 5))))
eye = rect(510, 360, 580, 430)
nut_mask = np.zeros((H, W), bool)
for i, sl in enumerate(ndi.find_objects(lab), start=1):
    comp = lab[sl] == i
    # Real nuts are round and have a red rim; the yellow fins are neither.
    red = ((r[sl] > 200) & (g[sl] < 130))[comp].sum()
    h_, w_ = comp.shape
    if comp.sum() < 40 or eye[sl][comp].any() or red < 8 or not 0.7 < w_ / h_ < 1.4:
        continue
    y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
    pad = 10
    y0, x0, y1, x1 = max(0, y0 - pad), max(0, x0 - pad), min(H, y1 + pad), min(W, x1 + pad)
    region = np.zeros((H, W), bool)
    region[y0:y1, x0:x1] = True
    m = solid((lum > 30) & region, close=5, min_size=30)
    nut_mask |= m > 0.05
    k = len(meta["s02"]["nuts"])
    name = f"s02_hazelnut_{k:02d}.png"
    crop = np.dstack([rgb2[y0:y1, x0:x1], (np.clip(m[y0:y1, x0:x1], 0, 1) * 255).astype(np.uint8)])
    Image.fromarray(crop).save(OUT / name)
    meta["s02"]["nuts"].append({"file": name, "cx": (x0 + x1) / 2, "cy": (y0 + y1) / 2,
                                "w": x1 - x0, "h": y1 - y0})

fish = solid((lum > 18) & rect(380, 128, W, 642) & ~nut_mask)
save(rgb2, fish, "s02_salmon.png")

leaf_regions = {"tl": rect(0, 0, 600, 245), "tr": rect(1070, 0, W, 125),
                "bl": rect(0, 495, 380, H), "br": rect(1170, 630, W, H)}
taken = fish > 0.05
for k, reg in leaf_regions.items():
    m = solid((lum > 20) & reg & ~nut_mask)
    taken |= m > 0.05
    save(rgb2, m, f"s02_hazel-leaves_{k}.png")

# Particles: whatever glows that isn't fish, leaf or nut. Soft luminance key.
rest = ~ndi.binary_dilation(taken | nut_mask, iterations=4)
save(rgb2, np.clip((lum - 10) / 40.0, 0, 1) * rest, "s02_particles.png")
meta["s02"]["bg"] = "#000600"

(OUT / "layers.json").write_text(json.dumps(meta, indent=2))
print(len(meta["s02"]["nuts"]), "hazelnuts;", sorted(p.name for p in OUT.glob("*.png")))
