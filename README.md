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
- **Gaillimh** (Bobby Tannam / Unthink) is the Galway typeface, released free for all by
  Galway Culture Company as a public cultural asset:
  https://galwayculturecompany.ie/projects/clofhoireann-na-gaillimh-galway-printing-press-our-font/
  The web fonts and the 3D title glyphs made from it are in `site/public/`. To regenerate the
  glyphs after a font update: `cd site && node scripts/fonts3d.mjs`.

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

## Performance

The site is held to a budget: `npm run check:budget` after a build, and Lighthouse on every pull request (`.github/workflows/performance.yml`).

- Only the title and the salmon may hold up the opening. Everything else loads in a stage, after the first frame or after the reader first acts (`src/three/splash3d.js`).
- A new scene's images go through `createAssets()` (`src/three/assets.js`), and the scene stays hidden until they're all in. No `await` on assets in a scene.
- Paintings load at 1600 under 1000px wide, 2912 above.
- A browser with no usable GPU gets the flat version. `/?3d=force` runs the 3D there, for testing.
