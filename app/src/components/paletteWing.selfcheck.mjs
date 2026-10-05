// node src/components/paletteWing.selfcheck.mjs
// #953 — the standalone palette file format round-trips, and hostile files
// can't smuggle junk into the library.
import assert from 'node:assert';
import {
  paletteToExportJson,
  parseImportPalettes,
  randomSeedHex,
} from './paletteWing.mjs';

const palette = {
  id: 'user-abc', name: 'VOIDISH', bg: '#0b0b0b', ink: '#f0ead8',
  swatches: ['#ff006e', '#00d9ff', '#ffd400'],
};

// Export shape: name first-class, colors array, meta carries bg/ink
const exported = paletteToExportJson(palette, '  MY KIT  ');
assert.strictEqual(exported.name, 'MY KIT', 'name is trimmed, not defaulted');
assert.deepStrictEqual(exported.colors, ['#ff006e', '#00d9ff', '#ffd400']);
assert.strictEqual(exported.meta.bg, '#0b0b0b');
assert.strictEqual(exported.meta.ink, '#f0ead8');
assert.strictEqual(exported.meta.version, 1);

// Empty name falls back to the palette name, never '' or 'Palette 1'
assert.strictEqual(paletteToExportJson(palette, '   ').name, 'VOIDISH');
assert.strictEqual(paletteToExportJson(palette, '').name, 'VOIDISH');

// Round-trip: export -> parse -> sanitized palette with identical colors
const roundTripped = parseImportPalettes(JSON.stringify(exported));
assert.strictEqual(roundTripped.length, 1);
assert.strictEqual(roundTripped[0].name, 'MY KIT');
assert.deepStrictEqual(roundTripped[0].swatches, exported.colors);
assert.strictEqual(roundTripped[0].bg, '#0b0b0b');
assert.ok(roundTripped[0].user, 'must be flagged as a user palette');

// Arrays import as a batch
const batch = parseImportPalettes(JSON.stringify([exported, exported]));
assert.strictEqual(batch.length, 2);
assert.notStrictEqual(batch[0].id, batch[1].id, 'id-less entries must not collapse to one');

// Raw stored shape (no colors/meta wrapper) also imports
const raw = parseImportPalettes(JSON.stringify({
  name: 'RAW', bg: '#111111', ink: '#eeeeee', swatches: ['#123456'],
}));
assert.strictEqual(raw.length, 1);
assert.strictEqual(raw[0].name, 'RAW');

// Junk is rejected, never thrown
assert.deepStrictEqual(parseImportPalettes('not json'), []);
assert.deepStrictEqual(parseImportPalettes('{"name":"x"}'), [], 'no colors, no palette');
assert.deepStrictEqual(parseImportPalettes('42'), []);
assert.deepStrictEqual(parseImportPalettes('null'), []);
assert.deepStrictEqual(parseImportPalettes(JSON.stringify({ name: 'x', colors: ['nope'] })), []);

// Seed hexes are valid 6-digit hex
for (let i = 0; i < 20; i++) {
  assert.match(randomSeedHex(), /^#[0-9a-f]{6}$/);
}

console.log('paletteWing.selfcheck: ok');
