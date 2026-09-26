// node src/state/paletteLibrary.selfcheck.mjs
// sanitizePalette guards a trust boundary: palette JSON arrives from a file.
import assert from 'node:assert';
import { sanitizePalette, createPaletteLibrarySlice } from './slices/paletteLibrarySlice.js';

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

// #628: id-less palettes must get DISTINCT fallback ids per call — a synchronous
// import map used to hand every id-less entry the same Date.now() millisecond,
// so the store's dedupe (later wins) silently kept only one.
{
  const N = 10;
  const idLess = Array.from({ length: N }, (_, i) => ({
    name: `KIT ${i}`, swatches: ['#ff0000', '#00ff00'],
  }));
  const sanitized = idLess.map(sanitizePalette);
  assert.strictEqual(new Set(sanitized.map((p) => p.id)).size, N, 'fallback ids must be unique per call');
  assert.ok(sanitized.every((p) => p.id.startsWith('user-')), 'fallback ids keep the user- prefix');

  // Drive importUserPalettes with a minimal zustand-like set/get.
  // localStorage stand-in so persist() exercises its real write path instead of warning.
  const backing = new Map();
  globalThis.localStorage = {
    getItem: (k) => (backing.has(k) ? backing.get(k) : null),
    setItem: (k, v) => { backing.set(k, String(v)); },
  };
  let state = { userPalettes: [] };
  const slice = createPaletteLibrarySlice(
    (updater) => { state = { ...state, ...(typeof updater === 'function' ? updater(state) : updater) }; },
    () => state,
  );
  slice.importUserPalettes(idLess);
  assert.strictEqual(state.userPalettes.length, N, 'all id-less palettes must survive import');
  assert.strictEqual(
    new Set(state.userPalettes.map((p) => p.id)).size, N,
    'stored ids must be distinct',
  );
  assert.strictEqual(
    JSON.parse(backing.get('kc:user-palettes:v1')).length, N,
    'persisted payload must hold all N entries',
  );

  // Explicit duplicate ids still merge later-wins (intended, unchanged by #628)
  slice.importUserPalettes([
    { id: 'dup', name: 'FIRST', swatches: ['#ff0000'] },
    { id: 'dup', name: 'SECOND', swatches: ['#00ff00'] },
  ]);
  assert.strictEqual(state.userPalettes.filter((p) => p.id === 'dup').length, 1);
  assert.strictEqual(state.userPalettes.find((p) => p.id === 'dup').name, 'SECOND');
}

console.log('paletteLibrary.selfcheck: OK');
