"""Scene 06, the teacher: a sheep, frame by frame, to graze on the far hills (scene 06 in 3D).

    python3 scripts/s06_sheep.py .

  assets/cutouts/s06_sheep.png  FRAMES frames side by side (RGBA), facing right, its feet on
                                a line FEET px from the top: grazing (two, as it crops the
                                grass), lifting its head, and walking (two, its legs apart
                                and together)

Drawn like the painting: a cream fleece with a near black outline, dark streaks run across
it like the lines on the hills, darker underneath; a black face and legs; a soft shadow
under it. A frame is W x H painting px, drawn at SCALE times that (so it stays sharp on
screens with more pixels than the painting) and U times again, then brought down."""
import sys
from pathlib import Path
import numpy as np
import cv2

ROOT = Path(sys.argv[1])
W, H = 48, 32  # painting px
FEET = 27
SCALE = 2
U = 4
K = SCALE * U  # drawing px per painting px
WOOL = np.array([165, 214, 222], np.float32)  # BGR, cream
UNDER = np.array([105, 148, 156], np.float32)
STREAK = np.array([60, 105, 115], np.float32)
DARK = np.array([8, 16, 14], np.float32)

rng = np.random.default_rng(6)
streaks = [(y, x0, x1) for y in np.arange(7.5, 26, 2.1) for x0, x1 in [sorted(rng.uniform(6, 40, 2))] if x1 - x0 > 3]


def P(x, y):
    return (int(round(x * K)), int(round(y * K)))


def frame(head, legs):
    """head: 'down' (grazing), 'mid', 'up'; legs: 0 together, +1 or -1 apart."""
    h, w = H * K, W * K
    shadow = np.zeros((h, w), np.float32)
    cv2.ellipse(shadow, P(23, FEET + 0.6), (int(15 * K), int(2.2 * K)), 0, 0, 360, 1, -1, cv2.LINE_AA)
    shadow = cv2.GaussianBlur(shadow, (0, 0), K * 0.8)
    # the fleece: a body and the lumps along its back
    wool = np.zeros((h, w), np.uint8)
    cv2.ellipse(wool, P(22, 15.5), (int(13 * K), int(7 * K)), 0, 0, 360, 255, -1, cv2.LINE_AA)
    for x in np.arange(11, 34, 3.6):
        cv2.circle(wool, P(x, 10.5 + 0.6 * np.sin(x)), int(3.4 * K), 255, -1, cv2.LINE_AA)
    for x in np.arange(12, 33, 4.2):
        cv2.circle(wool, P(x, 20.5), int(2.3 * K), 255, -1, cv2.LINE_AA)
    wool = wool.astype(np.float32) / 255
    back = np.zeros((h, w), np.uint8)  # under the fleece
    # legs, out from under the fleece to its feet
    for x, side in [(14, -1), (18, 1), (27, 1), (31, -1)]:
        dx = 1.4 * legs * side
        cv2.line(back, P(x, 19), P(x + dx, FEET), 255, int(2.2 * K), cv2.LINE_AA)
    # the head on its neck
    hx, hy, ang = {'down': (37, 23, 60), 'mid': (37.5, 17.5, 20), 'up': (37, 12.5, -15)}[head]
    cv2.line(back, P(31, 16), P(hx - 1, hy), 255, int(4.5 * K), cv2.LINE_AA)
    back = back.astype(np.float32) / 255
    dark = np.zeros((h, w), np.uint8)
    cv2.ellipse(dark, P(hx, hy), (int(4.8 * K), int(3.1 * K)), ang, 0, 360, 255, -1, cv2.LINE_AA)
    ex, ey = hx - 2.5 * np.cos(np.radians(ang)) - 1, hy - 2.5 * np.sin(np.radians(ang)) - 1.8
    cv2.ellipse(dark, P(ex, ey), (int(2.2 * K), int(1.0 * K)), ang - 35, 0, 360, 255, -1, cv2.LINE_AA)  # its ear
    dark = dark.astype(np.float32) / 255
    # the fleece's colour: cream, darker underneath, with dark streaks across it
    yy = np.mgrid[0:h, 0:w][0] / K
    under = np.clip((yy - 13) / 9, 0, 1)[..., None]
    rgb = WOOL * (1 - under) + UNDER * under
    lines = np.zeros((h, w), np.uint8)
    for y, x0, x1 in streaks:
        cv2.line(lines, P(x0, y), P(x1, y), 255, max(1, int(0.75 * K)), cv2.LINE_AA)
    lines = lines.astype(np.float32)[..., None] / 255 * (0.55 + 0.45 * under)
    rgb = rgb * (1 - lines) + STREAK * lines
    # its outline, near black, round the fleece
    edge = np.clip(wool - cv2.erode(wool, np.ones((int(1.3 * K), int(1.3 * K)), np.uint8)), 0, 1)[..., None]
    rgb = rgb * (1 - edge) + DARK * edge
    alpha = shadow[..., None] * 0.4
    out = DARK * np.ones_like(rgb)
    b = back[..., None]
    alpha = alpha * (1 - b) + b
    a = wool[..., None]
    out = out * (1 - a) + rgb * a
    alpha = alpha * (1 - a) + a
    d = dark[..., None]
    out = out * (1 - d) + DARK * d
    alpha = alpha * (1 - d) + d
    small = lambda x: cv2.resize(x, (W * SCALE, H * SCALE), interpolation=cv2.INTER_AREA)
    return np.dstack([small(out), small(alpha[..., 0]) * 255]).clip(0, 255).astype(np.uint8)


frames = [frame('down', 0), frame('down', 0.0), frame('mid', 0), frame('up', 1), frame('up', -1)]
# the second grazing frame: its head a little forward, as it crops
frames[1] = np.roll(frames[1], SCALE, axis=1)
frames[1][:, : SCALE * 30] = frames[0][:, : SCALE * 30]
cv2.imwrite(str(ROOT / "assets/cutouts/s06_sheep.png"), np.hstack(frames))
print(len(frames), "frames", W, "x", H)
