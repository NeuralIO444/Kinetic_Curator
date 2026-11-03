// node scripts/bakeAssetTraits.mjs [--check] — #1942: bake the library's measured traits into
// src/data/assets/traits.generated.js. `--check` writes nothing and exits 1 if the committed data differs.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ASSETS_AUTHORED as ASSETS } from '../src/data/assets/index.js';
import { bakeTraitsLibrary, renderTraitsModule } from '../src/assets/assetTraitsBake.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODULE = join(root, 'src/data/assets/traits.generated.js');
const baked = bakeTraitsLibrary(ASSETS);
const text = renderTraitsModule(baked);
if (process.argv.includes('--check')) {
  let have = '';
  try {
    have = readFileSync(MODULE, 'utf8');
  } catch {
    /* missing */
  }
  if (have !== text) {
    console.error('traits.generated.js is out of date: run `npm run bake:traits`');
    process.exit(1);
  }
  console.log(`asset traits: ${Object.keys(baked).length} assets, committed data matches the bake`);
} else {
  writeFileSync(MODULE, text);
  console.log(`asset traits: ${Object.keys(baked).length} assets baked -> ${MODULE}`);
}
