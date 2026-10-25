// Turns the master artwork in ../assets into web-sized AVIF + WebP in public/images.
// Masters stay untouched. Re-run after replacing a master: `npm run images`.
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
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
