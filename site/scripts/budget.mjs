// Fails when what every visitor downloads up front grows past its budget. Sizes are brotli,
// which is what the site is served with. Run after a build: `npm run check:budget`.
// If a budget has to rise, raise it here on purpose and say why in the commit.
import { readFile, readdir } from 'node:fs/promises';
import { brotliCompressSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../dist');
const KB = 1024;

// pattern, within dist, and the most any matching file may be
const budgets = [
  [/^assets\/index-.*\.js$/, 70 * KB, 'entry JS, on every visit'],
  [/^assets\/splash3d-.*\.js$/, 200 * KB, '3D chunk'],
  [/^assets\/.*\.css$/, 8 * KB, 'CSS, render-blocking'],
  [/^3d\/salmon\.glb$/, 600 * KB, 'the salmon, which holds up the opening'],
  [/^images\/.*-1600\.(webp|avif)$/, 600 * KB, 'phone-sized painting'],
];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])));
  return files.flat();
}

const files = (await walk(dist)).map((f) => path.relative(dist, f).split(path.sep).join('/'));
let failed = false;
for (const [pattern, max, what] of budgets) {
  const matches = files.filter((f) => pattern.test(f));
  if (!matches.length) {
    console.error(`FAIL  nothing matches ${pattern} (${what}): update this budget`);
    failed = true;
  }
  for (const f of matches) {
    const size = brotliCompressSync(await readFile(path.join(dist, f))).length;
    const over = size > max;
    failed ||= over;
    console.log(`${over ? 'FAIL' : 'ok  '}  ${f}  ${(size / KB).toFixed(1)} / ${max / KB} KB  (${what})`);
  }
}
if (failed) process.exit(1);
