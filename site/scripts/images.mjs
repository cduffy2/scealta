// Turns the master artwork in ../assets into web-sized AVIF + WebP in public/images.
// Masters stay untouched. Re-run after replacing a master: `npm run images`.
import sharp from 'sharp';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.resolve(here, '../../assets');
const out = path.resolve(here, '../public/images');

const jobs = [
  // name, source, widths
  ['salmon', 'cutouts/s00_salmon_up.png', [960, 1600, 2400, 3200]],
  ['s01', 'source/s01_well_up.png', [960, 1600, 2400, 2912]],
  ['s01-calm', 'cutouts/s01_calm.png', [1600, 2912]], // pool without its painted ripples
  ['s02', 'source/s02_fintan_up.png', [960, 1600, 2400, 2912]], // flat scene 02 (2D fallback)
  ['s03', 'source/s03_finegas_up.png', [960, 1600, 2400, 2912]], // flat scene 03 (2D fallback)
  ['s03-norod', 'cutouts/s03_no-rod.png', [1600, 2912]], // scene 03 for 3D: rod and line drawn live
];

await mkdir(out, { recursive: true });
for (const [name, src, widths] of jobs) {
  for (const w of widths) {
    const img = sharp(path.join(assets, src)).resize({ width: w });
    await img.clone().avif({ quality: 60, effort: 6 }).toFile(path.join(out, `${name}-${w}.avif`));
    await img.clone().webp({ quality: 82, alphaQuality: 90 }).toFile(path.join(out, `${name}-${w}.webp`));
    console.log(`${name}-${w}`);
  }
}

// Scene 02's layers for the 3D dive, at the painting's full resolution (2912 x 1632). The
// cut-outs were made at half size (1456 x 816, aligned to the painting); their alpha is
// scaled up and laid over the full-size painting, then each layer is trimmed to its
// content and its box recorded, so it can be placed in depth.
const UP = path.join(assets, 'source/s02_fintan_up.png');
const [FW, FH] = [2912, 1632];
const layerOut = path.join(out, 's02');
await mkdir(layerOut, { recursive: true });
const paint = await sharp(UP).removeAlpha().raw().toBuffer();
async function fullSize(cutout, box = null) {
  // box: [left, top, width, height] of a small sprite in the half-size frame
  const src = sharp(path.join(assets, `cutouts/${cutout}`)).extractChannel(3);
  let a;
  if (box) {
    // the sprite's alpha, doubled, dropped into an empty full-size alpha at its place
    const [l, t, w, h] = box;
    const small = await src.resize(w * 2, h * 2, { kernel: 'lanczos3' }).raw().toBuffer();
    a = Buffer.alloc(FW * FH);
    for (let y = 0; y < h * 2; y++) small.copy(a, (t * 2 + y) * FW + l * 2, y * w * 2, (y + 1) * w * 2);
  } else a = await src.resize(FW, FH, { kernel: 'lanczos3' }).raw().toBuffer();
  return sharp(paint, { raw: { width: FW, height: FH, channels: 3 } }).joinChannel(a, { raw: { width: FW, height: FH, channels: 1 } });
}
async function writeLayer(name, img) {
  const { data, info } = await img.png().toBuffer({ resolveWithObject: true }).then(({ data }) =>
    sharp(data).trim({ threshold: 0 }).png().toBuffer({ resolveWithObject: true }),
  );
  await sharp(data).webp({ quality: 85, alphaQuality: 90 }).toFile(path.join(layerOut, `${name}.webp`));
  return { x: -info.trimOffsetLeft, y: -info.trimOffsetTop, w: info.width, h: info.height };
}
const LAYERS = ['s02_particles', 's02_hazel-leaves_tl', 's02_hazel-leaves_tr', 's02_hazel-leaves_bl', 's02_hazel-leaves_br'];
const manifest = { frame: [FW, FH], layers: {}, nuts: [] };
for (const name of LAYERS) {
  manifest.layers[name] = await writeLayer(name, await fullSize(`${name}.png`));
  console.log(name, manifest.layers[name]);
}
const meta = JSON.parse(await readFile(path.join(assets, 'cutouts/layers.json'), 'utf8'));
for (const nut of meta.s02.nuts) {
  const name = nut.file.replace('.png', '');
  const { width, height } = await sharp(path.join(assets, `cutouts/${nut.file}`)).metadata();
  const l = Math.round(nut.cx - width / 2), t = Math.round(nut.cy - height / 2);
  const b = await writeLayer(name, await fullSize(nut.file, [l, t, width, height]));
  manifest.nuts.push({ name, cx: b.x + b.w / 2, cy: b.y + b.h / 2, w: b.w, h: b.h });
}
await writeFile(path.resolve(here, '../src/three/s02-layers.json'), JSON.stringify(manifest, null, 2) + '\n');

// Scene 03's Finegas, in layers (scripts/s03_finegas.py): his upper body and arm move to cast.
const s03Out = path.join(out, 's03');
await mkdir(s03Out, { recursive: true });
await sharp(path.join(assets, 'cutouts/s03_water.png')).webp({ quality: 85 }).toFile(path.join(s03Out, 'water.webp')); // where the river moves
for (const name of ['torso', 'arm']) {
  await sharp(path.join(assets, `cutouts/s03_${name}.png`)).webp({ quality: 90, alphaQuality: 95 }).toFile(path.join(s03Out, `${name}.webp`));
}
await writeFile(path.resolve(here, '../src/three/s03-finegas.json'), await readFile(path.join(assets, 'cutouts/s03_finegas.json'), 'utf8'));
