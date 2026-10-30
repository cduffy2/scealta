"""Scene 05, the thumb, in layers, for the pan along to it (scene 05 in 3D).

    python3 scripts/s05_layers.py .

From the 2912 x 1632 painting (assets/source/s05_thumb_up.png):
  assets/cutouts/s05_sky.png      the night and its stars, carried on down behind the trees
  assets/cutouts/s05_trees.png    the band of trees, clear above their tops; where the salmon,
                                  the fire, the hand and the embers were, filled with trees
                                  borrowed from the right of the painting, feathered
  assets/cutouts/s05_near.png     the water, the grill, the fire, the salmon and Fionn's hand
                                  (clear above the water elsewhere)
  assets/cutouts/s05_flames.png   where the flames are (white), for their flicker
  assets/cutouts/s05_ember_N.png  the painted embers above the fire, each on its own
  assets/cutouts/s05_fire.json    their boxes, the water's edge and the fire's box

The layers sit at different depths, so the trees and the night lag behind the fire as the
camera pans along; at rest they line up as painted. The salmon, the flames and the hand are
told apart from the trees by their warmth (the trees, the night and the water have next to
no red in them)."""
import json
import sys
from pathlib import Path
import numpy as np
import cv2

ROOT = Path(sys.argv[1])
art = cv2.imread(str(ROOT / "assets/source/s05_thumb_up.png"))
H, W = art.shape[:2]
WATER = 1362  # the water's edge, behind the grill
CLEAN = 1660  # right of this, the trees are clear of everything (borrowed for the fills)
SKY = 380  # above this row the night is clear of the trees
FIRE = (340, 1250, 1680, 1440)  # x0, y0, x1, y1: the row of flames

b, g, r = [art[..., i].astype(int) for i in range(3)]
warm = (r > 60).astype(np.uint8)
warm[WATER:] = 0
n, lab, stats, _ = cv2.connectedComponentsWithStats(warm, 8)


def fill_holes(m):
    """Fill what a shape encloses (the salmon's dark spots, the gaps between the flames)."""
    contours, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    out = np.zeros_like(m)
    cv2.drawContours(out, contours, -1, 1, cv2.FILLED)
    return out


# The embers: small, orange-red, up among the trees above the fire.
embers = []
for i in range(1, n):
    x0, y0, w, h, area = stats[i]
    if 300 < area < 2500 and 20 < w < 120 and 30 < h < 100 and 600 < y0 < 1000 and 400 < x0 < 1600:
        m = (lab == i).astype(np.uint8)
        if (r[m > 0] - g[m > 0]).mean() > 40:  # orange, not a yellow star or a tree's rim
            embers.append((i, x0, y0, w, h))

# The salmon, the flames and the hand: the big warm shapes, with the gaps between the
# flames and his spots filled. Everything else warm and big enough (a flame tongue on its
# own) joins them if it's in the fire's row.
near = np.zeros((H, W), np.uint8)
for i in range(1, n):
    x0, y0, w, h, area = stats[i]
    fire = FIRE[0] <= x0 + w / 2 <= FIRE[2] and y0 + h > FIRE[1]
    if area > 20000 or (fire and area > 150):
        near |= (lab == i).astype(np.uint8)
near = cv2.morphologyEx(near, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
near = fill_holes(near)
# the gaps between the flame tongues stay clear (the trees show through), unless they're
# under him: only the row's bottom, where the flames join over the grill, is solid
near[WATER:] = 1

# The flames: their orange bodies (opened, so his thin red rim and spots drop out),
# widened to take in their yellow tips, over the grill.
fx0, fy0, fx1, fy1 = FIRE
orange = ((r > 180) & (r - g > 60)).astype(np.uint8)
orange = cv2.morphologyEx(orange, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
flames = np.zeros((H, W), np.uint8)
flames[fy0:fy1, fx0:fx1] = orange[fy0:fy1, fx0:fx1]
flames = cv2.dilate(flames, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (17, 17)))

# The trees: below their tops (green, not a yellow star), every column filled down.
green = ((g > 10) & (r * 2 < g + 4)).astype(np.uint8)
green = cv2.morphologyEx(green, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
green = cv2.morphologyEx(green, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31)))
trees = (np.maximum.accumulate(green, axis=0) > 0).astype(np.uint8)
tops = [int(np.argmax(trees[:, x])) for x in range(0, W, 16)]

feather = lambda m, s: cv2.GaussianBlur(m.astype(np.float32), (0, 0), s)
meta = {"size": [W, H], "water": WATER, "fire": list(FIRE), "embers": []}

# each ember, cut out, then gone from the trees
gone = near.copy()
gone[fy0:WATER, fx0:fx1] = 1  # and the whole row of flames, gaps and all (they'd show as they slid)
gone[WATER:] = 0
for k, (i, x0, y0, w, h) in enumerate(embers):
    m = cv2.dilate((lab == i).astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    gone |= m
    a = feather(m, 1.2)
    xa, ya, xb, yb = x0 - 6, y0 - 6, x0 + w + 6, y0 + h + 6
    rgba = np.dstack([art[ya:yb, xa:xb], (a[ya:yb, xa:xb] * 255).astype(np.uint8)])
    cv2.imwrite(str(ROOT / f"assets/cutouts/s05_ember_{k}.png"), rgba)
    meta["embers"].append({"name": f"s05_ember_{k}", "x": int(xa), "y": int(ya), "w": int(xb - xa), "h": int(yb - ya)})

# The trees layer: what was in front of them filled with trees from the clear stretch on
# the right, column for column (the seam falls under the salmon).
cols = np.arange(W)
src = np.where(cols < CLEAN, CLEAN + cols % (W - CLEAN), cols)
borrowed = art[:, src]
a = feather(cv2.dilate(gone, np.ones((15, 15), np.uint8)), 3)[..., None]
treesRGB = (art * (1 - a) + borrowed * a).astype(np.uint8)
treesA = feather(trees, 1.0)
treesA[WATER + 4 :] = 0  # the near layer has the water
cv2.imwrite(str(ROOT / "assets/cutouts/s05_trees.png"), np.dstack([treesRGB, (treesA * 255).astype(np.uint8)]))

# The sky: the clear night above the trees, repeated on down behind them.
rows = np.arange(H)
sky = art[np.where(rows < SKY, rows, rows % SKY)]
cv2.imwrite(str(ROOT / "assets/cutouts/s05_sky.png"), sky)

# The near layer: the water, the grill, the fire, the salmon and the hand.
nearA = feather(near, 0.8)
nearA[WATER:] = 1
cv2.imwrite(str(ROOT / "assets/cutouts/s05_near.png"), np.dstack([art, (nearA * 255).astype(np.uint8)]))

# Where the flames are, a quarter size, softened.
fl = cv2.resize(feather(flames, 6), (W // 4, H // 4), interpolation=cv2.INTER_AREA)
cv2.imwrite(str(ROOT / "assets/cutouts/s05_flames.png"), (np.clip(fl, 0, 1) * 255).astype(np.uint8))

meta["tops"] = tops  # the trees' top edge, every 16 px
(ROOT / "assets/cutouts/s05_fire.json").write_text(json.dumps(meta, indent=2) + "\n")
print(json.dumps({k: v for k, v in meta.items() if k != "tops"}))
print("tree tops", min(tops), max(tops))
