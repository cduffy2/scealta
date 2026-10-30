"""Scene 05, the thumb, in layers, for the pan along to it (scene 05 in 3D).

    python3 scripts/s05_layers.py .

From the 2912 x 1632 painting (assets/source/s05_thumb_up.png), all of it mirrored at the
end so the salmon lies on the right, clear of the text, and Fionn reaches in from there:
  assets/cutouts/s05_sky.png      the night and its stars, carried on down behind the trees
  assets/cutouts/s05_trees.png    the band of trees, clear above their tops; where the salmon,
                                  the fire, the hand and the embers were, filled with trees
                                  borrowed from the right of the painting, feathered
  assets/cutouts/s05_near.png     the water, the grill, the fire, the salmon and Fionn's hand
                                  (clear above the water elsewhere)
  assets/cutouts/s05_flames.png   where the flames are (white), for their flicker
  assets/cutouts/s05_ember_N.png  the painted embers above the fire, each on its own
  assets/cutouts/s05_hand.png     Fionn's hand, without his sticks (they're drawn live, prodding
                                  the salmon; where they went into the flames, more flames)
  assets/cutouts/s05_mirrored.png the whole painting, mirrored (the flat scene)
  assets/cutouts/s05_fire.json    their boxes, the water's edge, the fire's box, and where
                                  the sticks leave his fingers and meet the salmon

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
# Fionn's two sticks, from his fingertips down into the flames: their centre lines
STICKS = [lambda x: 1313.3 + 0.155 * (x - 220), lambda x: 1325.3 + 0.155 * (x - 220)]
STICK_X = (200, 488)
GRIP = [(227, 1316), (227, 1328)]  # where they leave his fingers
PROD = [(505, 1226), (502, 1237)]  # and where they meet the salmon, under his tail
HAND_X = 236  # his hand is left of this
ROW = (345, 1592)  # where the row of flames starts and ends
SWAP = (340, 1278, 532, 1396)  # x0, y0, x1, y1: the first flames, swapped for the last

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

fx0, fy0, fx1, fy1 = FIRE

# The trees: below their tops (green, not a yellow star), every column filled down.
green = ((g > 10) & (r * 2 < g + 4)).astype(np.uint8)
green = cv2.morphologyEx(green, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
green = cv2.morphologyEx(green, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31)))
trees = (np.maximum.accumulate(green, axis=0) > 0).astype(np.uint8)
tops = [int(np.argmax(trees[:, x])) for x in range(0, W, 16)]

feather = lambda m, s: cv2.GaussianBlur(m.astype(np.float32), (0, 0), s)
meta = {"size": [W, H], "water": WATER, "fire": list(FIRE), "embers": []}
outputs = {}  # written at the end, mirrored

# each ember, cut out, then gone from the trees
gone = near.copy()
gone[fy0:WATER, fx0:fx1] = 1  # and the whole row of flames, gaps and all (they'd show as they slid)
gone[WATER:] = 0
for k, (i, x0, y0, w, h) in enumerate(embers):
    comp = (lab == i).astype(np.uint8)
    gone |= cv2.dilate(comp, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    # only the ember (red, orange, yellow) and its dark outline: no tree's green rim with it
    m = fill_holes(comp & (r >= g - 10).astype(np.uint8))
    m = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))) & ~((g > r + 40) & (g > 60))
    a = feather(m, 1.0)
    my, mx = np.nonzero(m)  # its box, trimmed to it
    xa, ya, xb, yb = mx.min() - 4, my.min() - 4, mx.max() + 5, my.max() + 5
    rgba = np.dstack([art[ya:yb, xa:xb], (a[ya:yb, xa:xb] * 255).astype(np.uint8)])
    outputs[f"s05_ember_{k}.png"] = rgba
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
outputs["s05_trees.png"] = np.dstack([treesRGB, (treesA * 255).astype(np.uint8)])

# The sky: the clear night above the trees, repeated on down behind them.
rows = np.arange(H)
sky = art[np.where(rows < SKY, rows, rows % SKY)]
outputs["s05_sky.png"] = sky

# The sticks: gone. Over the trees that leaves the near layer clear (the trees layer is
# filled behind). Where they went into the flames, the row's first few flames are swapped
# for its last few, mirrored (the right end of the row curls round just as a start would,
# and it's clear above, where his jaw isn't in the way), up to a gap that matches.
ys, xs = np.mgrid[0:H, 0:W]
stick = np.zeros((H, W), np.uint8)
band = (xs >= STICK_X[0]) & (xs <= STICK_X[1])
for line in STICKS:
    stick |= (band & (np.abs(ys - line(xs)) <= 5)).astype(np.uint8)
stick = cv2.dilate(stick, np.ones((3, 3), np.uint8))
stick[:, :HAND_X - 12] = 0  # what's under his fingers stays his
hand = near.copy()
hand[:1150] = 0
hand[WATER:] = 0
hand[:, HAND_X:] = 0
hand &= 1 - stick
near[stick > 0] = 0
near[hand > 0] = 0
nearRGB = art.astype(np.float32)
nearA = feather(near, 0.8)
nearA[WATER:] = 1
cols = np.arange(W)
mirror = np.clip(ROW[0] + ROW[1] - cols, 0, W - 1)  # x -> the same distance in from the row's other end
swap = np.zeros((H, W), np.float32)
swap[SWAP[1] : SWAP[3], SWAP[0] : SWAP[2]] = 1
swap = cv2.GaussianBlur(swap, (0, 0), 3)
nearRGB = nearRGB * (1 - swap[..., None]) + nearRGB[:, mirror] * swap[..., None]
nearA = nearA * (1 - swap) + nearA[:, mirror] * swap
# and above the swap, up to his tail and belly, the first flames' old tips go
for x in range(SWAP[0], SWAP[2]):
    edge = max(1283 - 0.45 * (x - 300), 1226) + 8  # the underside of his tail fin, then his belly
    nearA[int(edge) : SWAP[1] + 4, x] = 0
nearRGB = nearRGB.astype(np.uint8)

# His hand, on its own (feathered), so it can move with the sticks.
ha = feather(hand, 0.8)
yy, xx = np.nonzero(hand)
hx0, hx1, hy0, hy1 = max(0, xx.min() - 3), xx.max() + 4, yy.min() - 3, yy.max() + 4
outputs["s05_hand.png"] = np.dstack([art[hy0:hy1, hx0:hx1], (ha[hy0:hy1, hx0:hx1] * 255).astype(np.uint8)])
meta["hand"] = {"x": int(hx0), "y": int(hy0), "w": int(hx1 - hx0), "h": int(hy1 - hy0)}
meta["grip"] = [list(p) for p in GRIP]
meta["prod"] = [list(p) for p in PROD]

# The near layer: the water, the grill, the fire and the salmon.
outputs["s05_near.png"] = np.dstack([nearRGB, (np.clip(nearA, 0, 1) * 255).astype(np.uint8)])

# Where the flames are (now there are no sticks in them), a quarter size, softened.
nb, ng, nr = [nearRGB[..., i].astype(int) for i in range(3)]
orange = ((nr > 180) & (nr - ng > 60)).astype(np.uint8)
orange = cv2.morphologyEx(orange, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
flames = np.zeros((H, W), np.uint8)
flames[fy0:fy1, fx0:fx1] = orange[fy0:fy1, fx0:fx1]
flames = cv2.dilate(flames, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (17, 17)))
fl = cv2.resize(feather(flames, 6), (W // 4, H // 4), interpolation=cv2.INTER_AREA)
outputs["s05_flames.png"] = (np.clip(fl, 0, 1) * 255).astype(np.uint8)
outputs["s05_mirrored.png"] = art

# Everything mirrored: the images flipped, every x in the meta measured from the other side.
for name, im in outputs.items():
    cv2.imwrite(str(ROOT / "assets/cutouts" / name), np.ascontiguousarray(im[:, ::-1]))
box = lambda d: {**d, "x": W - d["x"] - d["w"]}
meta["embers"] = [box(e) for e in meta["embers"]]
meta["hand"] = box(meta["hand"])
meta["fire"] = [W - FIRE[2], FIRE[1], W - FIRE[0], FIRE[3]]
meta["grip"] = [[W - x, y] for x, y in meta["grip"]]
meta["prod"] = [[W - x, y] for x, y in meta["prod"]]
meta["tops"] = [int(np.argmax(trees[:, W - 1 - x])) for x in range(0, W, 16)]  # the trees' top edge, every 16 px
(ROOT / "assets/cutouts/s05_fire.json").write_text(json.dumps(meta, indent=2) + "\n")
print(json.dumps({k: v for k, v in meta.items() if k != "tops"}))
