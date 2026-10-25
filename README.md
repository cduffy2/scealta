# Scéalta

Scrollytelling websites of Irish mythology.

The first story is **Bradán an Feasa, the Salmon of Knowledge**: six illustrated scenes,
read or listened to, that you scroll through. It opens on a 3D title you fly through
into the Well of Segais.

## Running the site

```bash
cd site
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in site/dist
```

### Fonts

- **BioRhyme** (Aoife Mooney) is under the SIL Open Font License and is included.
- **Gaillimh** (Bobby Tannam / Unthink, for Galway 2020) is **not** included yet. The font
  files say they are licensed for exclusive use by Unthink, so they stay out of the repo
  until that is confirmed. To run the site locally, install the Gaillimh `.otf` files, then:

  ```bash
  # web fonts
  python3 -c "from fontTools.ttLib import TTFont; import os
  for w in ['thin','light','medium','bold','black']:
      t=TTFont(os.path.expanduser(f'~/Library/Fonts/Gaillimh-{w.title()}.otf')); t.flavor='woff2'; t.save(f'site/public/fonts/gaillimh-{w}.woff2')"
  # 3D title glyphs
  cd site && node scripts/fonts3d.mjs
  ```

## Layout

| Folder | What's in it |
|---|---|
| `site/` | The website: Vite, plain JS, GSAP ScrollTrigger, Three.js for the 3D splash |
| `site/public/` | Web-ready images (AVIF/WebP), compressed 3D models (glTF + Draco) |
| `assets/` | Master artwork: Midjourney sources, cut-outs, height maps |
| `scripts/` | Python tools: cut-outs, height maps for inflating 2D art into 3D, the calm pool |
| `blender/` | Editable Blender files for the salmon, hazelnut and scene 01 layers |

`npm run images` (in `site/`) regenerates the web images from `assets/`.

## Credits

Retold, designed and developed by Ciarán Duffy. Illustrations generated with Midjourney,
art-directed by Ciarán Duffy. Type: Gaillimh by Unthink for Galway 2020, BioRhyme by Aoife
Mooney.
