// node scripts/bakeRegionMattes.mjs [--check]
// #1432 — bake the region mattes for the built-in asset library into src/data/assets/regions.generated.js (and the
// report under docs/research). `--check` writes nothing and exits 1 if the committed data is not what the bake gives.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ASSETS_AUTHORED as ASSETS } from '../src/data/assets/index.js';
import { bakeLibrary, renderModule, renderReport } from '../src/assets/regionBake.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODULE = join(root, 'src/data/assets/regions.generated.js');
const REPORT = join(root, '..', 'docs/research/region-mattes-bake-report.md');

const baked = bakeLibrary(ASSETS);
const text = renderModule(baked);
const report = renderReport(baked, ASSETS.length);
if (process.argv.includes('--check')) {
  let have = '';
  try { have = readFileSync(MODULE, 'utf8'); } catch { /* missing */ }
  if (have !== text) { console.error('regions.generated.js is out of date: run `npm run bake:regions`'); process.exit(1); }
  console.log(`region mattes: ${Object.keys(baked).length} of ${ASSETS.length} assets, committed data matches the bake`);
} else {
  writeFileSync(MODULE, text);
  mkdirSync(dirname(REPORT), { recursive: true });
  writeFileSync(REPORT, report);
  console.log(`region mattes: ${Object.keys(baked).length} of ${ASSETS.length} assets baked -> ${MODULE}`);
}
