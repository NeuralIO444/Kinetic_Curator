// swatchWeights.selfcheck.mjs — palette swatch weights (#1049).
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { PALETTES, resolvePalette } from './palettes.js';
import { deriveSwatchWeights, swatchWeights, rankedSwatches, validWeights } from './swatchWeights.js';
import { sanitizePalette } from '../state/slices/paletteLibrarySlice.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

ok('every catalog palette has weights: one per swatch, each in 0..1, 2 decimals', () => {
  assert.ok(PALETTES.length >= 37);
  for (const p of PALETTES) {
    assert.ok(Array.isArray(p.weights), `${p.id} has no weights`);
    assert.equal(p.weights.length, p.swatches.length, `${p.id} weights length`);
    for (const w of p.weights) {
      assert.ok(typeof w === 'number' && w >= 0 && w <= 1, `${p.id} weight ${w}`);
      assert.equal(Math.round(w * 100) / 100, w, `${p.id} weight ${w} is not 2 decimals`);
    }
    assert.ok(validWeights(p));
  }
});

ok('deriveSwatchWeights is deterministic and length-matched', () => {
  for (const p of PALETTES) {
    const a = deriveSwatchWeights(p); const b = deriveSwatchWeights({ ...p, swatches: [...p.swatches] });
    assert.deepEqual(a, b);
    assert.equal(a.length, p.swatches.length);
  }
  assert.deepEqual(deriveSwatchWeights({ bg: '#000000', swatches: [] }), []);
  assert.deepEqual(deriveSwatchWeights(null), []);
});

ok('a saturated high-contrast swatch outranks a near-background one', () => {
  const p = { bg: '#0a0a0a', swatches: ['#101012', '#ff2d6f', '#3a3a3a', '#00d9ff'] };
  const w = deriveSwatchWeights(p);
  assert.ok(w[1] > w[0] && w[3] > w[0] && w[1] > w[2] && w[3] > w[2], JSON.stringify(w));
  assert.equal(rankedSwatches(p)[3], '#101012', 'the near-background swatch ranks last');
  // on a light ground the dark saturated swatch still wins over a near-white one
  const light = { bg: '#f5f0e6', swatches: ['#f0ece2', '#c8102e'] };
  assert.deepEqual(rankedSwatches(light), ['#c8102e', '#f0ece2']);
});

ok('a flat grey palette does not divide by zero', () => {
  const w = deriveSwatchWeights({ bg: '#808080', swatches: ['#808080', '#808080'] });
  assert.deepEqual(w, [0, 0]);
});

ok('rankedSwatches: strongest first, ties keep original order, palette untouched', () => {
  const p = { bg: '#000000', swatches: ['#aa0000', '#00aa00', '#0000aa', '#ffffff'], weights: [0.5, 0.9, 0.5, 0.5] };
  const before = JSON.stringify(p);
  assert.deepEqual(rankedSwatches(p), ['#00aa00', '#aa0000', '#0000aa', '#ffffff']);
  assert.deepEqual(rankedSwatches(p), rankedSwatches(p));
  assert.equal(JSON.stringify(p), before);
});

ok('a palette with no weights ranks from derived weights', () => {
  const p = { bg: '#0a0a0a', swatches: ['#222222', '#ff00aa', '#888888'] };
  assert.equal(rankedSwatches(p)[0], '#ff00aa');
  assert.deepEqual(swatchWeights(p), deriveSwatchWeights(p));
});

ok('wrong-length, non-numeric or out-of-range weights fall back to derived and do not throw', () => {
  const base = { bg: '#0a0a0a', swatches: ['#222222', '#ff00aa', '#888888'] };
  const want = deriveSwatchWeights(base);
  for (const weights of [[1], [0.1, 0.2, 0.3, 0.4], ['a', 'b', 'c'], [0.1, NaN, 0.3], [0.1, 2, 0.3], [-1, 0, 0], 'nope', null, {}]) {
    assert.deepEqual(swatchWeights({ ...base, weights }), want, JSON.stringify(weights));
    assert.equal(rankedSwatches({ ...base, weights })[0], '#ff00aa');
  }
  assert.deepEqual(rankedSwatches(null), []);
  assert.deepEqual(rankedSwatches({}), []);
});

ok('a hand-set weight is the source of truth', () => {
  const p = { bg: '#0a0a0a', swatches: ['#222222', '#ff00aa'], weights: [1, 0] };
  assert.deepEqual(rankedSwatches(p), ['#222222', '#ff00aa']);
});

ok('resolvePalette carries baked weights, and drops them when a color is overridden', () => {
  const id = PALETTES[0].id;
  assert.deepEqual(resolvePalette(id, null).weights, PALETTES[0].weights);
  const r = resolvePalette(id, null); r.weights[0] = 0.123;
  assert.notEqual(PALETTES[0].weights[0], 0.123, 'the catalog is not mutated');
  const ov = resolvePalette(id, { swatches: ['#ffffff'] });
  assert.equal(ov.weights, undefined);
  assert.deepEqual(swatchWeights(ov), deriveSwatchWeights(ov), 'an edited palette derives');
  assert.equal(resolvePalette(id, { bg: '#ffffff' }).weights, undefined, 'bg changes contrast, so weights are derived');
});

ok('import/export round-trips weights; a file without them still imports', () => {
  const file = { id: 'u1', name: 'mine', bg: '#000000', ink: '#ffffff', swatches: ['#ff0000', '#00ff00'], weights: [0.2, 0.9] };
  const a = sanitizePalette(file);
  assert.deepEqual(a.weights, [0.2, 0.9]);
  assert.deepEqual(sanitizePalette(JSON.parse(JSON.stringify(a))).weights, [0.2, 0.9]);
  const bare = sanitizePalette({ name: 'old', swatches: ['#ff0000', '#00ff00'] });
  assert.ok(bare && !('weights' in bare));
  assert.equal(rankedSwatches(bare).length, 2);
  // a dropped invalid swatch shifts the indices: the weights no longer line up, so they go
  assert.ok(!('weights' in sanitizePalette({ swatches: ['#ff0000', 'nope', '#00ff00'], weights: [0.1, 0.2, 0.3] })));
  assert.ok(!('weights' in sanitizePalette({ swatches: ['#ff0000', '#00ff00'], weights: [0.1] })));
});

ok('nothing in the app reads the field yet (no visual change until #1041)', () => {
  const readers = ['../gl/liveResolve.mjs', '../gl/sceneContract.js', '../gl/liveLoop.mjs', '../components/PaletteStrip.jsx', '../components/PaletteWing.jsx'];
  for (const f of readers) assert.ok(!/swatchWeights|rankedSwatches|\.weights\b/.test(readFileSync(new URL(f, import.meta.url), 'utf8')), `${f} reads weights`);
});

console.log(`swatchWeights.selfcheck: ${n} checks passed`);
