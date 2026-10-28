// Converts the Gaillimh weights to Three.js typeface JSON, subset to the title glyphs,
// so the 3D title can be extruded in the browser without shipping a font parser.
// Usage: `node scripts/fonts3d.mjs [fontDir]` (default: ~/Library/Fonts). Dev-only.
import opentype from 'opentype.js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = process.argv[2] ?? path.join(os.homedir(), 'Library/Fonts');
const out = path.resolve(here, '../public/3d');
const TEXT = 'The Salmon of Knowledge Bradán an Feasa';
const WEIGHTS = { 300: 'Light' }; // the 3D title uses Light only

const r = (n) => Math.round(n * 10) / 10;

function reverseContours(commands) {
  const out = [];
  let contour = [];
  const flush = () => {
    if (!contour.length) return;
    const ends = contour.map((c) => ({ x: c.x, y: c.y })); // ends[0] is the M point
    out.push({ type: 'M', ...ends[ends.length - 1] });
    for (let i = contour.length - 1; i >= 1; i--) {
      const c = contour[i];
      const to = ends[i - 1];
      if (c.type === 'L') out.push({ type: 'L', ...to });
      else if (c.type === 'Q') out.push({ type: 'Q', ...to, x1: c.x1, y1: c.y1 });
      else if (c.type === 'C') out.push({ type: 'C', ...to, x1: c.x2, y1: c.y2, x2: c.x1, y2: c.y1 });
    }
    out.push({ type: 'Z' });
    contour = [];
  };
  for (const c of commands) {
    if (c.type === 'M') flush();
    if (c.type === 'Z') flush();
    else contour.push(c);
  }
  flush();
  return out;
}

await mkdir(out, { recursive: true });
for (const [weight, style] of Object.entries(WEIGHTS)) {
  const buf = await readFile(path.join(dir, `Gaillimh-${style}.otf`));
  const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const glyphs = {};
  for (const ch of new Set(TEXT)) {
    const g = font.charToGlyph(ch);
    // Three's typeface format: end point first, then control points. Gaillimh is a CFF
    // font, wound the opposite way to the TrueType outlines Three expects, so every
    // contour is reversed (otherwise counters fill in and strokes go hollow).
    const o = reverseContours(g.path.commands)
      .map((c) => {
        switch (c.type) {
          case 'M': return `m ${r(c.x)} ${r(c.y)}`;
          case 'L': return `l ${r(c.x)} ${r(c.y)}`;
          case 'Q': return `q ${r(c.x)} ${r(c.y)} ${r(c.x1)} ${r(c.y1)}`;
          case 'C': return `b ${r(c.x)} ${r(c.y)} ${r(c.x1)} ${r(c.y1)} ${r(c.x2)} ${r(c.y2)}`;
          default: return '';
        }
      })
      .filter(Boolean)
      .join(' ');
    const bb = g.getBoundingBox();
    glyphs[ch] = { ha: Math.round(g.advanceWidth), x_min: Math.round(bb.x1), x_max: Math.round(bb.x2), o };
  }
  const data = {
    glyphs,
    familyName: 'Gaillimh',
    ascender: font.ascender,
    descender: font.descender,
    underlinePosition: font.tables.post.underlinePosition,
    underlineThickness: font.tables.post.underlineThickness,
    boundingBox: { xMin: font.tables.head.xMin, yMin: font.tables.head.yMin, xMax: font.tables.head.xMax, yMax: font.tables.head.yMax },
    resolution: font.unitsPerEm,
    original_font_information: { format: 0, weight, style },
  };
  const file = path.join(out, `gaillimh-${weight}.json`);
  await writeFile(file, JSON.stringify(data));
  console.log(path.basename(file), Object.keys(glyphs).length, 'glyphs');
}
