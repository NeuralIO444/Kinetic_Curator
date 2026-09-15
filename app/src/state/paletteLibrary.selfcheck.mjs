// node src/state/paletteLibrary.selfcheck.mjs
// sanitizePalette guards a trust boundary: palette JSON arrives from a file.
import assert from 'node:assert';
import { sanitizePalette } from './slices/paletteLibrarySlice.js';

// Well-formed entry survives intact
const good = sanitizePalette({
  id: 'user-abc', name: 'MY KIT', bg: '#101010', ink: '#EEEEEE',
  swatches: ['#FF0000', '#00ff00'],
});
assert.strictEqual(good.id, 'user-abc');
assert.strictEqual(good.name, 'MY KIT');
assert.deepStrictEqual(good.swatches, ['#ff0000', '#00ff00'], 'hex is normalized lowercase');
assert.strictEqual(good.user, true, 'must be flagged as a user palette');

// Shorthand hex expands
assert.deepStrictEqual(sanitizePalette({ swatches: ['#f0a'] }).swatches, ['#ff00aa']);

// Junk swatches are dropped, not passed through
const mixed = sanitizePalette({ swatches: ['#ff0000', 'not-a-color', null, 42, '#00f'] });
assert.deepStrictEqual(mixed.swatches, ['#ff0000', '#0000ff']);

// Entries with no usable swatch are rejected outright
assert.strictEqual(sanitizePalette({ swatches: [] }), null);
assert.strictEqual(sanitizePalette({ swatches: ['nope'] }), null);
assert.strictEqual(sanitizePalette(null), null);
assert.strictEqual(sanitizePalette('a string'), null);
assert.strictEqual(sanitizePalette(undefined), null);

// Missing metadata gets sane defaults rather than undefined
const bare = sanitizePalette({ swatches: ['#123456'] });
assert.ok(bare.id.startsWith('user-'));
assert.strictEqual(bare.name, 'UNTITLED');
assert.ok(bare.bg && bare.ink, 'bg/ink must default');

// Absurd names are truncated, not stored whole
assert.strictEqual(sanitizePalette({ name: 'x'.repeat(200), swatches: ['#123456'] }).name.length, 40);

console.log('paletteLibrary.selfcheck: OK');
