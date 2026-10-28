"""Clean the salmon texture's outline: assets/3d/salmon_texture.png (used by build_salmon_glb.py).

    python3 scripts/salmon_texture.py <source texture>

The cut-out's alpha had stray specks floating off the fins and small notches along the
edges (from keying and upscaling). This keeps the artwork, rebuilds only the alpha: the
main silhouette, opened to drop specks, closed to fill notches, then softened by about a
pixel so the edge anti-aliases (the web material uses alpha to coverage)."""
import sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parent.parent
im = Image.open(sys.argv[1]).convert("RGBA")
px = np.asarray(im).copy()
m = px[..., 3] > 127

lab, n = ndi.label(m)
m = lab == 1 + int(np.argmax(ndi.sum(m, lab, range(1, n + 1))))  # the fish only
disk = ndi.generate_binary_structure(2, 1)
disk = ndi.iterate_structure(disk, 2)  # radius 2
m = ndi.binary_opening(m, disk)  # specks and hairline spurs off the edge
m = ndi.binary_closing(m, disk)  # small notches into it
m = ndi.binary_fill_holes(m)
alpha = ndi.gaussian_filter(m.astype(np.float32), 0.8)

px[..., 3] = np.round(alpha * 255).astype(np.uint8)
out = ROOT / "assets/3d/salmon_texture.png"
Image.fromarray(px).save(out, optimize=True)
print("wrote", out, im.size, "components dropped:", n - 1)
