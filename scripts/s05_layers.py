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
  assets/cutouts/s05_hand.png     Fionn's hand round his one stick, repainted (below), so it can
                                  prod the salmon (where the painted sticks went into the
                                  flames, more flames)
  assets/cutouts/s05_mirrored.png the whole painting, mirrored, his stick to the salmon, without
                                  the embers (the flat scene)
  assets/cutouts/s05_fire.json    their boxes, the water's edge, the fire's box, and his arm:
                                  where it turns (at the edge), the stick's tip, where it
                                  meets the salmon, and how far it turns to get there

The painted hand pinched two sticks down into the fire. It was repainted in Midjourney's
editor, over this scene as it stood (mirrored, the sticks gone), as a fist round one stick:
assets/source/s05_thumb_hand.png. Only the hand, his stick and his sleeve are taken from it,
found as what differs from the scene in the area that was repainted.
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
HAND_X = 236  # his hand is left of this
ROW = (345, 1592)  # where the row of flames starts and ends
SWAP = (340, 1278, 532, 1396)  # x0, y0, x1, y1: the first flames, swapped for the last
# (mirrored, as the scene is seen) the area that was repainted, and where his stick meets the
# salmon: the underside of his tail, just in from the fin
REPAINTED = [(2912, 1165), (2640, 1165), (2605, 1292), (2400, 1246), (2392, 1268), (2585, 1300), (2590, 1362), (2912, 1362)]
POKE = (2478, 1234)
# his stick as drawn again (mirrored, as the scene is seen): where it leaves his fist and its
# tip, its half-width at each, and where its painted cross-section is taken
FISH_X = (290, 1640)  # the salmon, tail to snout
FISH_BELOW = 1318
STICK_FIST = (2700, 1320)
STICK_TIP = (2472, 1279)
STICK_HALF = (6.0, 18.0)
STICK_SAMPLE = 2662
FIST_OVERLAP = 6  # px it runs on in under his fingers
NOTCH_X, NOTCH_Y = 2713, 1291  # where his thumb's outline reaches the stick's lip

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

# Where the salmon is (not the flames licking up round him, nor the grill), a quarter size,
# softened a little: he cooks, slowly.
body = near.copy()
body[FISH_BELOW:] = 0  # below his lowest fins it is all flames
body[:, :FISH_X[0]] = 0
body[:, FISH_X[1]:] = 0
body &= 1 - cv2.dilate(orange, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))  # the flames' bodies
n, lab, stats, _ = cv2.connectedComponentsWithStats(body, 8)
body = fill_holes((lab == 1 + np.argmax(stats[1:, 4])).astype(np.uint8))
fy, _ = np.nonzero(body)
meta["salmon"] = {"top": int(fy.min()), "bottom": int(fy.max())}
fm = cv2.resize(feather(body, 2), (W // 4, H // 4), interpolation=cv2.INTER_AREA)
outputs["s05_fish.png"] = (np.clip(fm, 0, 1) * 255).astype(np.uint8)

# Everything mirrored: the images flipped, every x in the meta measured from the other side.
for name, im in outputs.items():
    cv2.imwrite(str(ROOT / "assets/cutouts" / name), np.ascontiguousarray(im[:, ::-1]))
box = lambda d: {**d, "x": W - d["x"] - d["w"]}
meta["embers"] = [box(e) for e in meta["embers"]]
meta["hand"] = box(meta["hand"])
meta["fire"] = [W - FIRE[2], FIRE[1], W - FIRE[0], FIRE[3]]
meta["tops"] = [int(np.argmax(trees[:, W - 1 - x])) for x in range(0, W, 16)]  # the trees' top edge, every 16 px

# The repainted hand (mirrored, like everything from here on). The scene as it stood when it
# was repainted: the layers, the old hand and the embers in place.
mir = {k: np.ascontiguousarray(v[:, ::-1]) for k, v in outputs.items()}


def over(base, im, x, y):
    h, w = im.shape[:2]
    a = im[..., 3:4].astype(np.float32) / 255
    base[y : y + h, x : x + w] = base[y : y + h, x : x + w] * (1 - a) + im[..., :3] * a


scene = mir["s05_sky.png"].astype(np.float32)
over(scene, mir["s05_trees.png"], 0, 0)
over(scene, mir["s05_near.png"], 0, 0)
bare = scene.copy()  # without the embers (on the site, smoke rises instead)
for e in meta["embers"]:
    over(scene, mir[e["name"] + ".png"], e["x"], e["y"])
before = scene.copy()
over(before, mir["s05_hand.png"], meta["hand"]["x"], meta["hand"]["y"])
edit = cv2.resize(cv2.imread(str(ROOT / "assets/source/s05_thumb_hand.png")), (W, H), interpolation=cv2.INTER_CUBIC)
# where it was repainted (the hand, and a strip up under his tail for the stick)
area = np.zeros((H, W), np.uint8)
cv2.fillPoly(area, [np.array(REPAINTED, np.int32)], 1)
diff = cv2.GaussianBlur(np.abs(edit.astype(np.float32) - before).sum(2), (0, 0), 2)
arm = ((diff > 60) & (area > 0)).astype(np.uint8)
arm = cv2.morphologyEx(arm, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
n, lab, stats, _ = cv2.connectedComponentsWithStats(arm, 8)
arm = fill_holes((lab == 1 + np.argmax(stats[1:, 4])).astype(np.uint8))
arm = cv2.erode(arm, np.ones((3, 3), np.uint8))  # just inside its outline
ys, xs = np.nonzero(arm)
ax0, ax1, ay0, ay1 = xs.min() - 3, W, ys.min() - 3, ys.max() + 4
PAD = 60  # his sleeve carries on past the edge, so none of it comes away as he pushes
rgb = np.concatenate([edit[ay0:ay1, ax0:ax1], np.repeat(edit[ay0:ay1, W - 1 : W], PAD, 1)], 1)
a = feather(arm, 0.8)[ay0:ay1, ax0:ax1]
a = np.concatenate([a, np.repeat(a[:, -1:], PAD, 1)], 1)
handRGBA = np.dstack([rgb, (a * 255).astype(np.uint8)])

# His stick, past his fist, drawn again: as painted it thins in a step partway along. It
# tapers evenly from his fist to its tip instead, shaded across with the painted stick's own
# cross-section by his fist (its light top, its darker underside).
ox, oy = ax0, ay0  # the cut-out's origin in the scene
col = handRGBA[:, STICK_SAMPLE - ox]
rows = np.nonzero(col[:, 3] > 128)[0]
profile = col[rows.min() : rows.max() + 1, :3].astype(np.float32)  # top to bottom, across it
(fx, fy), (tx, ty) = STICK_FIST, STICK_TIP
yy, xx = np.mgrid[0 : handRGBA.shape[0], 0 : NOTCH_X - ox]
sx, sy = xx + ox + 0.5, yy + oy + 0.5
f = np.clip((sx - tx) / (fx - tx), 0, 1)  # 0 at the tip, 1 at his fist
centre = ty + (fy - ty) * f
half = STICK_HALF[0] + (STICK_HALF[1] - STICK_HALF[0]) * f
# the painted stick goes: everything along its way left of his fist (his knuckles stay)
way = (np.abs(sy - centre) <= half + 6) & (sx < fx)
handRGBA[:, : NOTCH_X - ox, 3][way] = 0
t = (sy - (centre - half)) / (2 * half)  # 0 at its top edge, 1 at its bottom
inside = np.clip(np.minimum(sy - (centre - half), centre + half - sy) + 0.5, 0, 1)
inside *= np.clip(sx - tx + 0.5, 0, 1)  # its end, cut square and soft
idx = np.clip(t * (len(profile) - 1), 0, len(profile) - 1)
lo = np.floor(idx).astype(int)
hi = np.minimum(lo + 1, len(profile) - 1)
w = (idx - lo)[..., None]
shade = profile[lo] * (1 - w) + profile[hi] * w
shade *= (0.9 + 0.1 * f)[..., None]  # a touch darker towards its tip, out of the firelight
region = handRGBA[:, : NOTCH_X - ox]
inside *= sx < fx + FIST_OVERLAP
cover = inside * (region[..., 3] < 250)  # under his fingers his fist stays on top
new_a = np.maximum(region[..., 3] / 255, inside)
region[..., :3] = (region[..., :3] * (1 - cover[..., None]) + shade * cover[..., None]).astype(np.uint8)
region[..., 3] = (new_a * 255).astype(np.uint8)
# and above it, left of his thumb's outline, the painted stick's lip goes too (the trees show)
# his thumb's outline carried on down to the stick's top edge, on a slant
edge = NOTCH_Y + (NOTCH_X - sx) * (fy - STICK_HALF[1] - NOTCH_Y) / (NOTCH_X - fx)
above = np.clip(edge - sy + 0.5, 0, 1) * (sx < NOTCH_X) * (sx >= fx)
above = np.maximum(above, (sx < fx) & (sy < centre - half))
region[..., 3] = (region[..., 3] * (1 - above)).astype(np.uint8)
rim = np.clip(1 - np.abs(sy - edge - 1.2) / 1.5, 0, 1) * (sx < NOTCH_X) * (sx >= fx) * (region[..., 3] > 0)
region[..., :3] = (region[..., :3] * (1 - 0.6 * rim[..., None])).astype(np.uint8)
# and no crumbs of the old stick's tip left about it
n, lab, stats, _ = cv2.connectedComponentsWithStats((handRGBA[..., 3] > 0).astype(np.uint8), 8)
handRGBA[..., 3][lab != 1 + np.argmax(stats[1:, 4])] = 0
cv2.imwrite(str(ROOT / "assets/cutouts/s05_hand.png"), handRGBA)
meta["hand"] = {"x": int(ax0), "y": int(ay0), "w": int(ax1 + PAD - ax0), "h": int(ay1 - ay0)}
edgeYs = np.nonzero(arm[:, W - 1])[0]
pivot = (float(W), float(edgeYs.mean()))  # his arm turns about where it comes in
tip = (float(STICK_TIP[0]), float(STICK_TIP[1]))
ang = np.arctan2(POKE[1] - pivot[1], POKE[0] - pivot[0]) - np.arctan2(tip[1] - pivot[1], tip[0] - pivot[0])
ang = (ang + np.pi) % (2 * np.pi) - np.pi  # clockwise on screen, as the turn up to him
meta["arm"] = {"pivot": [pivot[0], round(pivot[1], 1)], "tip": [tip[0], round(tip[1], 1)], "poke": list(POKE), "turn": round(float(np.degrees(ang)), 2)}

# The flat scene: as it stands, his stick turned up to the salmon.
M = 150  # room above and below for it to turn into
held = np.pad(handRGBA, ((M, M), (0, 0), (0, 0)))
R = cv2.getRotationMatrix2D((float(pivot[0] - ax0), float(pivot[1] - ay0 + M)), -float(np.degrees(ang)), 1)
turned = cv2.warpAffine(held, R, (held.shape[1], held.shape[0]), flags=cv2.INTER_CUBIC, borderValue=(0, 0, 0, 0))
flat = np.zeros((H + 2 * M, W + PAD, 3), np.float32)
flat[M : M + H, :W] = bare
over(flat, turned, ax0, ay0)
cv2.imwrite(str(ROOT / "assets/cutouts/s05_mirrored.png"), flat[M : M + H, :W].astype(np.uint8))
(ROOT / "assets/cutouts/s05_fire.json").write_text(json.dumps(meta, indent=2) + "\n")
print(json.dumps({k: v for k, v in meta.items() if k != "tops"}))
