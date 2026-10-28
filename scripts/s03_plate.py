"""Scene 03 without Finegas's rod and lines, so they can be drawn live (cast) in 3D.

    python3 scripts/s03_plate.py .   ->  assets/cutouts/s03_no-rod.png

The rod, the long line into the water, the short dangling end and the line hanging from
his hands are traced as paths (coordinates on the 2912 x 1632 painting). Each path is
covered with background texture borrowed from just beside it."""
import sys
from pathlib import Path
import numpy as np
import cv2

ROOT = Path(sys.argv[1])
im = cv2.imread(str(ROOT / "assets/source/s03_finegas_up.png"))

# (points, half-width, texture source offset). Each path is filled with the background
# from just beside it (feathered), which keeps the backdrop's leaf texture; the rod is
# shallow so it borrows from above, the steep lines from the side (same height, same
# backdrop or grass).
PATHS = {
    "rod": ([(1002, 1138), (1145, 1012), (1300, 880), (1460, 798), (1550, 775), (1662, 765)], 14, (0, -34)),
    "line": ([(1657, 768), (1643, 780), (1624, 805), (1610, 850), (1595, 895), (1583, 930), (1563, 980), (1541, 1030), (1514, 1080), (1482, 1130), (1442, 1180), (1392, 1230), (1359, 1255), (1319, 1280), (1265, 1306), (1240, 1316)], 7, (24, 0)),
    "dangle": ([(1657, 768), (1645, 780), (1657, 850), (1670, 950), (1690, 990), (1707, 1022)], 7, (-26, 0)),
    "reel": ([(1000, 1150), (990, 1200), (975, 1262)], 9, (22, 0)),  # from his right: his leg is on the left
    # where the line met the river: the water's stripes run level, so borrow along them
    "wet": ([(1180, 1316), (1230, 1306), (1300, 1297), (1340, 1293)], 7, (90, 0)),
    "wet2": ([(1200, 1321), (1225, 1317), (1252, 1312)], 5, (90, 0)),
    "grass": ([(1232, 1303), (1268, 1292), (1306, 1281)], 6, (170, 0)),
    "grass2": ([(1290, 1306), (1318, 1294), (1348, 1281)], 6, (170, 0)),
}
DOTS = [(1374, 925, 11), (1387, 1022, 9), (1672, 955, 9)]  # stray specks along the lines
FLOAT = (1445, 1355, 24)  # the painted float on the water

out = im.astype(np.float32)
for name, (pts, hw, (dx, dy)) in PATHS.items():
    m = np.zeros(im.shape[:2], np.uint8)
    cv2.polylines(m, [np.array(pts, np.int32)], False, 255, hw * 2)
    if name == "rod":
        m[1120:, :1012] = 0  # keep his hands
    src = np.roll(np.roll(im, -dy, 0), -dx, 1).astype(np.float32)
    a = cv2.GaussianBlur(m, (0, 0), 2.0).astype(np.float32)[..., None] / 255
    out = out * (1 - a) + src * a
for x, y, r in DOTS:
    m = np.zeros(im.shape[:2], np.uint8)
    cv2.circle(m, (x, y), r, 255, -1)
    src = np.roll(im, -24, 1).astype(np.float32)
    a = cv2.GaussianBlur(m, (0, 0), 2.0).astype(np.float32)[..., None] / 255
    out = out * (1 - a) + src * a
m = np.zeros(im.shape[:2], np.uint8)
cv2.circle(m, FLOAT[:2], FLOAT[2], 255, -1)
src = np.roll(im, -90, 1).astype(np.float32)  # same stripes, further along the river
a = cv2.GaussianBlur(m, (0, 0), 2.5).astype(np.float32)[..., None] / 255
out = out * (1 - a) + src * a
# Last sweep: the backdrop behind the rod has almost no red in it (99th percentile 7), so
# anything reddish there is left over from the rod, the line or the line parallel to the
# rod. Fill those too, borrowing from 60 px along.
out = np.clip(out, 0, 255).astype(np.uint8)
left = np.zeros(im.shape[:2], np.uint8)
left[740:1140, 1020:1730] = (out[740:1140, 1020:1730, 2] > 16).astype(np.uint8) * 255
left = cv2.dilate(left, np.ones((7, 7), np.uint8))
src = np.roll(out, -60, 1).astype(np.float32)
a = cv2.GaussianBlur(left, (0, 0), 1.5).astype(np.float32)[..., None] / 255
out = np.clip(out * (1 - a) + src * a, 0, 255).astype(np.uint8)
cv2.imwrite(str(ROOT / "assets/cutouts/s03_no-rod.png"), out)
print("done")
