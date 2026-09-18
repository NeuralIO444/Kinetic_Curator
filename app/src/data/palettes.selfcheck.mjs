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

// #287 — leak rides resolvePalette: declared values pass through, every
// other palette defaults to 0 (colors hold).
assert.strictEqual(resolvePalette('kiln-columns', null).leak, 0.5);
assert.strictEqual(resolvePalette('petri-bloom', null).leak, 0.35);
assert.strictEqual(resolvePalette('sepia-plate', null).leak, 0.5);
assert.strictEqual(resolvePalette('lithograph', null).leak, 0);
assert.strictEqual(resolvePalette('cyanotype', null).leak, 0.3);
assert.strictEqual(resolvePalette('praystation', null).leak, 0);
for (const p of PALETTES) {
  const r = resolvePalette(p.id, null);
  assert.ok(typeof r.leak === 'number' && r.leak >= 0 && r.leak <= 1, `${p.id}: leak must be 0..1`);
}
// The three plate palettes exist with light grounds (fade-to-paper).
for (const [pid, name] of [['sepia-plate', 'SEPIA PLATE'], ['lithograph', 'LITHOGRAPH'], ['cyanotype', 'CYANOTYPE']]) {
  const r = resolvePalette(pid, null);
  assert.strictEqual(r.name, name);
}

console.log('palettes.selfcheck: OK');
