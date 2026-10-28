"""Finegas in layers, so his upper body and arm can drive the cast (scene 03).

    python3 scripts/s03_plate.py . && python3 scripts/s03_finegas.py .

From the 2912 x 1632 painting:
  assets/cutouts/s03_no-rod.png  is rewritten without his upper body (his legs stay put)
  assets/cutouts/s03_torso.png   coat and head, with the coat filled in where the arm was
  assets/cutouts/s03_arm.png     sleeve and hands
  assets/cutouts/s03_finegas.json  their boxes and pivots (hip, shoulder) and the hands"""
import json
import sys
from pathlib import Path
import numpy as np
import cv2

ROOT = Path(sys.argv[1])
art = cv2.imread(str(ROOT / "assets/source/s03_finegas_up.png"))
plate = cv2.imread(str(ROOT / "assets/cutouts/s03_no-rod.png"))
H, W = art.shape[:2]

HIP = (937, 1184)  # the coat's hem: above this he's cut out, below his legs stay painted
SHOULDER = (936, 1072)
HANDS = (1002, 1140)
BOX = (880, 1000, 1030, HIP[1])  # x0, y0, x1, y1
ARM = [(921, 1064), (936, 1060), (956, 1078), (964, 1108), (986, 1124), (1004, 1130), (1017, 1138),
       (1016, 1158), (998, 1163), (976, 1153), (950, 1152), (933, 1134), (921, 1102)]

b, g, r = [art[..., i].astype(int) for i in range(3)]
fig = (r > g + 8) | ((r > 170) & (g > 170) & (b > 140))  # coat, skin, hair: not the greens or rod
box = np.zeros((H, W), bool)
box[BOX[1]:BOX[3], BOX[0]:BOX[2]] = True
fig = (fig & box).astype(np.uint8)
fig = cv2.morphologyEx(fig, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
n, lab, stats, _ = cv2.connectedComponentsWithStats(fig, 8)
fig = (lab == 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))).astype(np.uint8)
cnts, _ = cv2.findContours(fig, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
fig = cv2.drawContours(np.zeros_like(fig), cnts, -1, 1, -1)  # holes filled

arm_poly = np.zeros_like(fig)
cv2.fillPoly(arm_poly, [np.array(ARM, np.int32)], 1)
arm = fig & arm_poly
coat_right = 963  # the coat's front edge; the arm reaches past it to the hands
torso = fig.copy()
torso[(arm > 0) & (np.arange(W)[None, :] > coat_right)] = 0
torso_px = art.copy()
under = (arm > 0) & (np.arange(W)[None, :] <= coat_right)
# Where the arm lay over the coat, paint the coat in from around it (inpainted), taking
# the sleeve's dark outline with it, so a raised arm leaves no second sleeve behind.
coat = np.median(art[1158:1178, 935:955].reshape(-1, 3), 0)
fill = cv2.dilate(under.astype(np.uint8), np.ones((9, 9), np.uint8)) & fig
torso_px[(fig == 0) & (cv2.dilate(fig, np.ones((15, 15), np.uint8)) > 0)] = coat  # no green to pull in
torso_px = cv2.inpaint(torso_px, fill * 255, 9, cv2.INPAINT_TELEA)
n, lab, stats, _ = cv2.connectedComponentsWithStats(torso, 8)
torso = (lab == 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))).astype(np.uint8)  # no specks

# the plate without him above the hips: the backdrop borrowed from beside him, feathered
gone = cv2.dilate(fig, np.ones((25, 25), np.uint8))
gone[HIP[1] - 2:] = 0
src = np.roll(plate, -170, 1).astype(np.float32)  # the plain backdrop 170 px to his right
a = cv2.GaussianBlur(gone.astype(np.float32), (0, 0), 3)[..., None]
plate = (plate * (1 - a) + src * a).astype(np.uint8)
cv2.imwrite(str(ROOT / "assets/cutouts/s03_no-rod.png"), plate)

meta = {"hip": HIP, "shoulder": SHOULDER, "hands": HANDS, "layers": {}}
for name, m, px in (("torso", torso, torso_px), ("arm", arm, art)):
    m = cv2.GaussianBlur(m.astype(np.float32), (0, 0), 0.7)
    ys, xs = np.nonzero(m > 0.02)
    x0, x1, y0, y1 = xs.min() - 2, xs.max() + 3, ys.min() - 2, ys.max() + 3
    rgba = np.dstack([px[y0:y1, x0:x1], (m[y0:y1, x0:x1] * 255).astype(np.uint8)])
    cv2.imwrite(str(ROOT / f"assets/cutouts/s03_{name}.png"), rgba)
    meta["layers"][name] = {"x": int(x0), "y": int(y0), "w": int(x1 - x0), "h": int(y1 - y0)}
(ROOT / "assets/cutouts/s03_finegas.json").write_text(json.dumps(meta, indent=2) + "\n")
print(meta)
