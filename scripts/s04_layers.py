"""Scene 04, the catch, in layers, so the salmon can strain on the line (scene 04 in 3D).

    python3 scripts/s04_layers.py .

From the 2912 x 1632 painting (assets/source/s04_catch_up.png):
  assets/cutouts/s04_plate.png    the night and the water, without the salmon, line and drops
  assets/cutouts/s04_salmon.png   the salmon (with the hook in his jaw), trimmed to its box
  assets/cutouts/s04_drop_N.png   the painted drops of water around him, each on its own
  assets/cutouts/s04_catch.json   their boxes, where his body meets the water, where the line
                                  meets his jaw, the line's painted path, and the moon

The salmon is traced by hand (the background is full of small green dashes, so his colour
alone doesn't separate him). Where he, the line and the drops were, the plate is filled
with the dark backdrop borrowed from beside them, feathered."""
import json
import sys
from pathlib import Path
import numpy as np
import cv2

ROOT = Path(sys.argv[1])
art = cv2.imread(str(ROOT / "assets/source/s04_catch_up.png"))
H, W = art.shape[:2]
WATER = 1392  # the glowing water's edge under him
MOON = (274, 120, 22)  # x, y, radius

# his outline, clockwise from the tip of his snout: back, dorsal fin, down to the water,
# up his belly, out along the pectoral fin and back, then the throat and lower jaw
SALMON = [
    (2154, 753), (2163, 756), (2184, 775), (2236, 827), (2278, 875), (2313, 922), (2349, 975),
    (2375, 1022), (2393, 1081), (2402, 1140), (2404, 1194),
    (2429, 1231), (2454, 1281), (2463, 1312), (2435, 1325), (2413, 1328), (2400, 1325),
    (2397, 1362), (2394, WATER + 2), (2154, WATER + 2), (2154, 1381), (2169, 1350), (2185, 1319),
    (2200, 1281), (2210, 1238), (2216, 1188), (2216, 1138), (2216, 1088), (2215, 1053),
    (2198, 1067), (2168, 1085), (2139, 1108), (2115, 1138), (2096, 1155), (2097, 1130),
    (2110, 1095), (2134, 1058), (2166, 1031), (2209, 1010), (2196, 1004), (2183, 965),
    (2162, 936), (2139, 895), (2124, 842), (2116, 800), (2114, 790), (2141, 759),
]
MOUTH = (2120, 793)  # where the line meets his lower jaw

salmon = np.zeros((H, W), np.uint8)
cv2.fillPoly(salmon, [np.array(SALMON, np.int32)], 1)

b, g, r = [art[..., i].astype(int) for i in range(3)]

# the line: yellow, running from the top edge down to his jaw
yellow = (r > 120) & (g > 120) & (b < 140) & (np.abs(r - g) < 90)
line = np.zeros((H, W), np.uint8)
path = []
x = 2023
for y in range(0, MOUTH[1] + 1):
    xs = np.nonzero(yellow[y, max(0, x - 10) : x + 11])[0]
    if len(xs):
        x = max(0, x - 10) + int(round(xs.mean()))
    line[y, max(0, x - 5) : x + 6] = 1
    if y % 40 == 0:
        path.append((x, y))
path.append(MOUTH)
# and any yellow left near its path (where it bends in to his jaw)
line |= (cv2.dilate(line, np.ones((25, 25), np.uint8)) & yellow).astype(np.uint8)
line = cv2.dilate(line, np.ones((7, 7), np.uint8)) & (salmon == 0)

# the drops: bright, rounded clusters around him (the dashes in the backdrop are small)
bright = ((g > 120) | (r > 120)).astype(np.uint8)
bright = cv2.morphologyEx(bright, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
near = np.zeros((H, W), np.uint8)
near[640:WATER - 30, 1850:2300] = 1
cand = bright & near & (cv2.dilate(salmon, np.ones((9, 9), np.uint8)) == 0) & (line == 0)
n, lab, stats, _ = cv2.connectedComponentsWithStats(cand, 8)
drops = np.zeros((H, W), np.uint8)
meta = {"size": [W, H], "water": WATER, "moon": MOON, "mouth": MOUTH, "line": path, "drops": []}
k = 0
for i in range(1, n):
    x0, y0, w, h, area = stats[i]
    if area < 90 or w < 10 or h < 10 or w > 90 or h > 90:
        continue
    m = (lab == i).astype(np.uint8)
    m = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    drops |= m
    a = cv2.GaussianBlur(m.astype(np.float32), (0, 0), 1.2)
    xa, ya, xb, yb = x0 - 6, y0 - 6, x0 + w + 6, y0 + h + 6
    rgba = np.dstack([art[ya:yb, xa:xb], (a[ya:yb, xa:xb] * 255).astype(np.uint8)])
    cv2.imwrite(str(ROOT / f"assets/cutouts/s04_drop_{k}.png"), rgba)
    meta["drops"].append({"name": f"s04_drop_{k}", "x": int(xa), "y": int(ya), "w": int(xb - xa), "h": int(yb - ya)})
    k += 1

# the plate: everything that moves is filled with the backdrop from beside it, feathered
# (his glowing outline with him). The salmon's place borrows the plain night well to his
# left, as do the line's and the drops' (clear of him and the drops).
plate = art.astype(np.float32)
for mask, shift in ((salmon, 880), (line | drops, 760)):
    gone = cv2.dilate(mask, np.ones((15, 15), np.uint8))
    gone[WATER:] = 0  # the water stays as painted
    a = cv2.GaussianBlur(gone.astype(np.float32), (0, 0), 2.5)[..., None]
    plate = plate * (1 - a) + np.roll(art, shift, 1).astype(np.float32) * a
plate = plate.astype(np.uint8)
cv2.imwrite(str(ROOT / "assets/cutouts/s04_plate.png"), plate)

# the salmon, trimmed to his box (feathered by a pixel)
m = cv2.GaussianBlur(salmon.astype(np.float32), (0, 0), 0.8)
ys, xs = np.nonzero(m > 0.02)
x0, x1, y0, y1 = xs.min() - 2, xs.max() + 3, ys.min() - 2, ys.max() + 1
rgba = np.dstack([art[y0:y1, x0:x1], (m[y0:y1, x0:x1] * 255).astype(np.uint8)])
cv2.imwrite(str(ROOT / "assets/cutouts/s04_salmon.png"), rgba)
meta["salmon"] = {"x": int(x0), "y": int(y0), "w": int(x1 - x0), "h": int(y1 - y0)}
(ROOT / "assets/cutouts/s04_catch.json").write_text(json.dumps(meta, indent=2) + "\n")
print(json.dumps({k: v for k, v in meta.items() if k != "line"}))
