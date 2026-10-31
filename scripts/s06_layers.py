"""Scene 06, the teacher: the masks its motion needs (scene 06 in 3D).

    python3 scripts/s06_layers.py .

From the 2912 x 1632 painting (assets/source/s06_teacher_up.png):
  assets/cutouts/s06_mask.png   red: Finegas's hair (it lifts in the breeze)
                                green: what stands still (the two of them, the salmon, the
                                hut's stones), so the grass can stir everywhere else
                                blue: the salmon (the light runs along him)
  assets/cutouts/s06_plate.png  the painting with both their heads gone, the meadow (and
                                his cloak) carried on behind them (the plate in 3D)
  assets/cutouts/s06_fionn.png  his head turning to look up at Finegas, in FRAMES frames side
                                by side, from as painted to fully turned
  assets/cutouts/s06_finegas.png  his head bowing to look at the boy, the same way, alone
                                over nothing (RGBA)
  assets/cutouts/s06_teacher.json  the salmon's box, snout to tail, the hair's box, and the
                                head frames' boxes

The scene stays one plate: the pull back from scene 05 is straight back, so layers in depth
would only grow at slightly different rates. The two of them and the salmon are told apart
from the grass by their colour: the grass is a bright yellow green, his cloak is near black,
his hair a pale yellow, and the boy and the salmon are orange."""
import json
import sys
from pathlib import Path
import numpy as np
import cv2

ROOT = Path(sys.argv[1])
art = cv2.imread(str(ROOT / "assets/source/s06_teacher_up.png"))
H, W = art.shape[:2]
b, g, r = [art[..., i].astype(int) for i in range(3)]

# boxes (x0, y0, x1, y1) in the painting's px, found by eye
FINEGAS = (1360, 1060, 1600, 1370)
HAIR = (1415, 1060, 1525, 1190)
FIONN = (1595, 1160, 1700, 1365)
SALMON = (1735, 1310, 1985, 1385)
HUT = (2000, 960, 2912, 1340)  # the stone wall and its door, below the turf roof


def box(m, bx):
    out = np.zeros_like(m)
    x0, y0, x1, y1 = bx
    out[y0:y1, x0:x1] = m[y0:y1, x0:x1]
    return out


def biggest(m):
    """The largest connected shape, its holes filled."""
    n, lab, stats, _ = cv2.connectedComponentsWithStats(m, 8)
    if n < 2:
        return m
    i = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    contours, _ = cv2.findContours((lab == i).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    out = np.zeros_like(m)
    cv2.drawContours(out, contours, -1, 1, cv2.FILLED)
    return out


grass = (g > 90) & (g > r + 25) & (b < g * 0.6)  # bright yellow green
dark = (r + g + b) < 150
warm = (r > g + 30) & (r > 110)
pale = (r > 170) & (g > 160) & (np.abs(r - g) < 50) & ~grass

hair = biggest(box(pale.astype(np.uint8), HAIR))
cloak = biggest(box((dark | pale).astype(np.uint8), FINEGAS))
fionn = biggest(box((warm | dark).astype(np.uint8), FIONN))
salmon = biggest(box(warm.astype(np.uint8), SALMON))
close = lambda m, k: cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
salmon = close(salmon, 9)
still = close(cloak | hair | fionn | salmon, 7)
still = cv2.dilate(still, np.ones((5, 5), np.uint8))
x0, y0, x1, y1 = HUT
still[y0:y1, x0:x1] |= (~grass[y0:y1, x0:x1]).astype(np.uint8)  # the stones, not the grass between
still = close(still, 5)

feather = lambda m, s: np.clip(cv2.GaussianBlur(m.astype(np.float32), (0, 0), s) * 255, 0, 255).astype(np.uint8)
mask = np.dstack([feather(salmon, 1.5), feather(still, 2.0), feather(hair, 1.5)])  # BGR
cv2.imwrite(str(ROOT / "assets/cutouts/s06_mask.png"), mask)

# Fionn's head, seen from behind, turning to look up at Finegas on his left. As it turns his
# face swings round to the left, so a sliver of cheek and jaw shows at that edge, his left
# ear (nearer us now) slides in over the back of his head, his right ear goes round out of
# sight, and his head tips back and leans a little towards Finegas. Each frame is his
# painted head moved so, over the meadow as it carries on behind him.
HEAD = (1590, 1150, 1700, 1250)  # x0, y0, x1, y1: room around his head for it to move in
NECK = (1644, 1246)  # where it turns
NECK_Y = 1241  # below this his collar and shoulders stay in the painting
EAR_SPLIT = 1644  # ears left and right of this
FRAMES = 12
hx0, hy0, hx1, hy1 = HEAD
crop = art[hy0:hy1, hx0:hx1]
cb, cg, cr = [crop[..., i].astype(int) for i in range(3)]
cgrass = (cg > 90) & (cg > cr + 25) & (cb < cg * 0.6)
cwarm = (cr > cg + 30) & (cr > 110)
hh, hw = crop.shape[:2]
yy, xx = np.mgrid[0:hh, 0:hw]
above = yy + hy0 < NECK_Y
head = biggest((((cb + cg + cr < 200) | ((cg < 140) & (cr < 110))) & (yy + hy0 < NECK_Y + 5)).astype(np.uint8))  # his hair, near black, rimmed dark green
head = close(head, 5)
ears = ((cwarm | ((cr > 150) & (cb < 80) & ~cgrass)) & above & (cv2.dilate(head, np.ones((17, 17), np.uint8)) > 0)).astype(np.uint8)
ears = ears & (yy + hy0 > 1205)  # by his head's sides, not his shoulders
ear_l = ears * (xx + hx0 < EAR_SPLIT)
ear_r = ears * (xx + hx0 >= EAR_SPLIT)
skin = np.median(crop[(ears > 0) & cwarm], axis=0)  # the orange of his ears, not their highlights
gone = cv2.dilate(head | ears, np.ones((7, 7), np.uint8)) * above

# the meadow behind: each row of the head's place filled from the same row further right (its
# stripes run straight across), feathered in
plate = art.copy()
SHIFT = -90  # from the right: on the left is Finegas
region = plate[hy0:hy1, hx0:hx1].astype(np.float32)
left = art[hy0:hy1, hx0 - SHIFT:hx1 - SHIFT].astype(np.float32)
a = cv2.GaussianBlur(gone.astype(np.float32), (0, 0), 1.2)[..., None]
plate[hy0:hy1, hx0:hx1] = (region * (1 - a) + left * a).astype(np.uint8)
behind = plate[hy0:hy1, hx0:hx1]

# Each frame is drawn at U times the size and brought down, so the edges stay smooth.
U = 4
up = lambda x: cv2.resize(x.astype(np.float32), (hw * U, hh * U), interpolation=cv2.INTER_LINEAR)
crop_u = up(crop)
head_u = cv2.GaussianBlur(up(head), (0, 0), U * 0.4)
ear_l_u, ear_r_u = up(ear_l), up(ear_r)
yy_u = np.mgrid[0 : hh * U, 0 : hw * U][0] / U


def place(img, m, angle, dx, dy):
    """img and mask m turned by angle (degrees, + anticlockwise) about the neck, then moved (px)."""
    c = ((NECK[0] - hx0) * U, (NECK[1] - hy0) * U)
    M = cv2.getRotationMatrix2D(c, angle, 1.0)
    M[:, 2] += (dx * U, dy * U)
    w = lambda x: cv2.warpAffine(x, M, (hw * U, hh * U), flags=cv2.INTER_LINEAR, borderValue=0)
    return w(img), w(m)


def comp(base, img, m):
    m = np.clip(m, 0, 1)[..., None]
    return base * (1 - m) + img * m


hy_, hx_ = np.nonzero(head)
hw_ = hx_.max() - hx_.min()
mid_y = (hy_.min() + hy_.max()) / 2
frames = []
for i in range(FRAMES):
    t = i / (FRAMES - 1)
    e = t * t * (3 - 2 * t)
    ang, dx, dy = 6 * e, -1.0 * e, 0.0  # anticlockwise about his neck: tipped back, towards him
    out = up(behind)
    # his right ear goes round behind his head
    img, m = place(crop_u, ear_r_u, ang, dx - 0.12 * hw_ * e, dy)
    out = comp(out, img, m * max(0, 1 - e * 1.5))
    img, m = place(crop_u, head_u, ang, dx, dy)
    out = comp(out, img, m)
    # the cheek and jaw: a thin crescent at the lower left of his head, inside his outline,
    # where it's clear of his head moved right
    d = 0.17 * hw_ * e * U
    if d > 0.5:
        M = np.float32([[1, 0, d], [0, 1, -0.25 * d]])
        shifted = cv2.warpAffine(m, M, m.shape[::-1], flags=cv2.INTER_LINEAR)
        inner = cv2.erode(m, np.ones((U + 2, U + 2), np.uint8))  # his dark outline stays round it
        cheek = np.clip(inner - shifted, 0, 1) * np.clip((yy_u - mid_y + 8) / 8, 0, 1) * np.clip((NECK_Y - hy0 - 8 - yy_u) / 4, 0, 1)  # clear of his neck
        cheek = cv2.GaussianBlur(cheek, (0, 0), U * 0.35) * min(1, e * 1.5)
        out = comp(out, np.broadcast_to(skin * 0.92, out.shape).astype(np.float32), cheek)
    # his left ear slides in over the back of his head
    img, m = place(crop_u, ear_l_u, ang, dx + 0.1 * hw_ * e, dy - 0.8 * e)
    out = comp(out, img, m)
    frames.append(cv2.resize(out, (hw, hh), interpolation=cv2.INTER_AREA).clip(0, 255).astype(np.uint8))
cv2.imwrite(str(ROOT / "assets/cutouts/s06_fionn.png"), np.hstack(frames))

# Finegas's head, seen from behind, turning down to look at the boy on his right. His head
# bows and leans towards him, its top swinging right, his long hair hanging after it (its
# ends less), and a sliver of his face shows at the right edge of his hair as it turns. His
# frames are his head alone over nothing (RGBA), so his hair can still lift in the gusts
# over the plate, which carries on the meadow and his cloak behind it.
FHEAD = (1404, 1056, 1528, 1192)  # room around his head for it to move in
FNECK = (1466, 1150)  # where it turns
FTIPS = (1135, 1182)  # his hair hangs freer from here down to its ends
gx0, gy0, gx1, gy1 = FHEAD
fc = art[gy0:gy1, gx0:gx1]
fb, fg, fr = [fc[..., i].astype(int) for i in range(3)]
fgrass = (fg > 90) & (fg > fr + 25) & (fb < fg * 0.6)
gh, gw = fc.shape[:2]
gyy, gxx = np.mgrid[0:gh, 0:gw]
fpale = (fr > 90) & (fg > 80) & ~fgrass
upper = ~fgrass & (gyy + gy0 < 1152)  # his head and hair against the meadow
lower = close(fpale.astype(np.uint8), 7) & (gyy + gy0 >= 1152) & (gyy + gy0 < 1182)  # and over his cloak, the strands
fhead = biggest((upper | (lower > 0)).astype(np.uint8))
fhead = cv2.morphologyEx(fhead, cv2.MORPH_CLOSE, np.ones((9, 3), np.uint8))  # the dark between the strands
fgone = cv2.dilate(fhead, np.ones((7, 7), np.uint8))
# behind it: his cloak (near black) below his shoulders, the meadow (from the left) above
cloak_c = np.median(fc[(fb + fg + fr < 60) & (gyy + gy0 > 1180)], axis=0)
fill = art[gy0:gy1, gx0 - 120:gx1 - 120].astype(np.float32)
under = (gyy + gy0 >= 1150) & ~fgrass
fill[under] = cloak_c
fa = cv2.GaussianBlur(fgone.astype(np.float32), (0, 0), 1.2)[..., None]
plate[gy0:gy1, gx0:gx1] = (plate[gy0:gy1, gx0:gx1] * (1 - fa) + fill * fa).astype(np.uint8)
face_c = np.median(fc[fpale & (gxx + gx0 < 1432) & (gyy + gy0 > 1122) & (gyy + gy0 < 1146)], axis=0)  # his ear

fc_u = cv2.resize(fc.astype(np.float32), (gw * U, gh * U), interpolation=cv2.INTER_LINEAR)
fm_u = cv2.GaussianBlur(cv2.resize(fhead.astype(np.float32), (gw * U, gh * U), interpolation=cv2.INTER_LINEAR), (0, 0), U * 0.4)
gyu, gxu = np.mgrid[0 : gh * U, 0 : gw * U].astype(np.float32)


def turn(img, ang, dx, dy):
    """img turned by ang (degrees, + clockwise) about his neck and moved, less so at his hair's ends."""
    py = gyu / U + gy0
    w = 1 - 0.65 * np.clip((py - FTIPS[0]) / (FTIPS[1] - FTIPS[0]), 0, 1)
    t = np.radians(ang) * w
    cx, cy = (FNECK[0] - gx0) * U, (FNECK[1] - gy0) * U
    x, y = gxu - dx * w * U - cx, gyu - dy * w * U - cy  # back to where it came from
    sx = np.cos(t) * x + np.sin(t) * y + cx
    sy = -np.sin(t) * x + np.cos(t) * y + cy
    return cv2.remap(img, sx, sy, cv2.INTER_LINEAR, borderValue=0)


fy_, fx_ = np.nonzero(fhead)
fw_ = fx_.max() - fx_.min()
fframes = []
for i in range(FRAMES):
    t = i / (FRAMES - 1)
    e = t * t * (3 - 2 * t)
    ang, dx, dy = 10 * e, 3.0 * e, 2.0 * e
    rgb, m = turn(fc_u, ang, dx, dy), turn(fm_u, ang, dx, dy)
    # his face: a thin crescent at the right of his hair, about his ear's height, where it's
    # clear of his head moved left
    d = 0.09 * fw_ * e * U
    if d > 0.5:
        M = np.float32([[1, 0, -d], [0, 1, 0]])
        shifted = cv2.warpAffine(m, M, m.shape[::-1], flags=cv2.INTER_LINEAR)
        inner = cv2.erode(m, np.ones((U + 2, U + 2), np.uint8))
        py = gyu / U + gy0
        band = np.clip((py - 1108) / 8, 0, 1) * np.clip((1148 - py) / 8, 0, 1)
        face = cv2.GaussianBlur(np.clip(inner - shifted, 0, 1) * band, (0, 0), U * 0.35) * min(1, e * 1.5)
        rgb = comp(rgb, np.broadcast_to(face_c * 0.9, rgb.shape).astype(np.float32), face)
    rgba = np.dstack([rgb, np.clip(m, 0, 1) * 255])
    fframes.append(cv2.resize(rgba, (gw, gh), interpolation=cv2.INTER_AREA).clip(0, 255).astype(np.uint8))
cv2.imwrite(str(ROOT / "assets/cutouts/s06_finegas.png"), np.hstack(fframes))
cv2.imwrite(str(ROOT / "assets/cutouts/s06_plate.png"), plate)

ys, xs = np.nonzero(salmon)
hy, hx = np.nonzero(hair)
meta = {
    "size": [W, H],
    "salmon": {"x0": int(xs.min()), "y0": int(ys.min()), "x1": int(xs.max()) + 1, "y1": int(ys.max()) + 1},
    "hair": {"x0": int(hx.min()), "y0": int(hy.min()), "x1": int(hx.max()) + 1, "y1": int(hy.max()) + 1},
    "fionn": {"x0": hx0, "y0": hy0, "x1": hx1, "y1": hy1, "frames": FRAMES},
    "finegas": {"x0": gx0, "y0": gy0, "x1": gx1, "y1": gy1, "frames": FRAMES},
}
(ROOT / "assets/cutouts/s06_teacher.json").write_text(json.dumps(meta, indent=2) + "\n")
print(meta)
