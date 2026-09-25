// node src/panels/pipeline/paletteImportCopy.selfcheck.mjs — #601: the import toast doesn't lie.
import assert from 'node:assert';
import { paletteImportMessage } from './paletteImportCopy.mjs';

const pal = (id, name = 'P') => ({ id, name, swatches: ['#ff0000', '#00ff00'] });

assert.strictEqual(paletteImportMessage([pal('a'), pal('b')]), 'Imported 2 palettes');
assert.strictEqual(paletteImportMessage([pal('a')]), 'Imported 1 palette', 'singular');
assert.strictEqual(paletteImportMessage(pal('a')), 'Imported 1 palette', 'a bare object, not an array');

// all-junk files warn instead of toasting success
for (const junk of [[], [null, 3, 'x'], [{ swatches: [] }], [{ swatches: ['nope'] }], {}, null, undefined]) {
  assert.strictEqual(paletteImportMessage(junk), 'No valid palettes in file', `junk: ${JSON.stringify(junk)}`);
}

// mixed: only the survivors count
assert.strictEqual(paletteImportMessage([pal('a'), null, { swatches: [] }, pal('b')]), 'Imported 2 palettes');

// the store dedupes by id (later wins), so the honest count is distinct ids, not entries
assert.strictEqual(paletteImportMessage([pal('same'), pal('same'), pal('other')]), 'Imported 2 palettes');

console.log('paletteImportCopy.selfcheck: OK');
