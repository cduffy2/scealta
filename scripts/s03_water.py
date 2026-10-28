"""Scene 03's river mask (where the water may move): assets/cutouts/s03_water.png

    python3 scripts/s03_water.py .

The painted water is level stripes, the banks a fine grass texture, so the banks are where
the picture changes a lot both across and down. Only the big grassy mounds count as bank;
narrow reflections (tree trunks) stay water. Saved at half size, softened at the edges."""
import sys
from pathlib import Path
import numpy as np
import cv2

ROOT = Path(sys.argv[1])
p = cv2.imread(str(ROOT / "assets/cutouts/s03_no-rod.png"))
H, W = p.shape[:2]
SURFACE = 1300

lum = p.max(2).astype(np.float32)
horiz = cv2.GaussianBlur(np.abs(cv2.Sobel(lum, cv2.CV_32F, 1, 0)), (0, 0), 6)
vert = cv2.GaussianBlur(np.abs(cv2.Sobel(lum, cv2.CV_32F, 0, 1)), (0, 0), 6)
# grass changes both across and down; stripes only down, trunk reflections only across
bank = cv2.morphologyEx(((horiz > 18) & (vert > 18)).astype(np.uint8), cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
n, lab, stats, _ = cv2.connectedComponentsWithStats(bank, 8)
# the mounds are big and wide; reflections of trunks are narrow, however tall
big = np.isin(lab, [i for i in range(1, n) if stats[i, cv2.CC_STAT_AREA] > 30000 and stats[i, cv2.CC_STAT_WIDTH] > 260])
water = np.zeros((H, W), np.uint8)
water[SURFACE:] = 1
cnts, _ = cv2.findContours(big.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
big = cv2.drawContours(np.zeros((H, W), np.uint8), cnts, -1, 1, -1) > 0  # boulders on them too
water[big] = 0
water = cv2.morphologyEx(water, cv2.MORPH_OPEN, np.ones((9, 9), np.uint8))
# trunk reflections (narrow gaps across the water) are water too; the mounds are far wider
water = cv2.morphologyEx(water, cv2.MORPH_CLOSE, np.ones((1, 71), np.uint8))
water[:SURFACE] = 0
soft = cv2.GaussianBlur(water.astype(np.float32), (0, 0), 4)
soft[: SURFACE - 4] = 0
out = cv2.resize((soft * 255).astype(np.uint8), (W // 2, H // 2), interpolation=cv2.INTER_AREA)
cv2.imwrite(str(ROOT / "assets/cutouts/s03_water.png"), out)
print("water share below the surface", round(float(water[SURFACE:].mean()), 2))
