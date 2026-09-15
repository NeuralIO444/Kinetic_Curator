// node src/data/palettes.selfcheck.mjs
import assert from 'node:assert';
import { PALETTES, resolvePalette, normalizeHex, getCatalogPalette } from './palettes.js';

const id = 'praystation';
const base = getCatalogPalette(id);

const clean = resolvePalette(id, null);
assert.deepStrictEqual(clean.swatches, base.swatches);
assert.strictEqual(clean.bg, base.bg);
assert.strictEqual(clean.dirty, false);

const ov = resolvePalette(id, { swatches: ['#ffffff'] });
assert.strictEqual(ov.swatches[0], '#ffffff');
assert.strictEqual(ov.swatches[1], base.swatches[1]);
assert.strictEqual(ov.dirty, true);

const mutated = resolvePalette(id, { swatches: ['#111111'] });
mutated.swatches[0] = '#dead00';
assert.strictEqual(PALETTES.find(p => p.id === id).swatches[0], base.swatches[0]);

assert.strictEqual(normalizeHex('abc'), '#aabbcc');
assert.strictEqual(normalizeHex('#FF00AA'), '#ff00aa');
assert.strictEqual(normalizeHex('nope'), null);

console.log('palettes.selfcheck: OK');
