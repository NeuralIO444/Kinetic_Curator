// node src/curator/recipeFeatures.selfcheck.mjs — #719 named keep/pass features.
import assert from 'node:assert';
import { recipeFeatures, FEATURES_VERSION } from './recipeFeatures.js';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';

const KEYS = ['v', 'system', 'symmetry', 'behave', 'blend', 'paletteShift', 'palette', 'accum', 'mirror',
  'bleed', 'overlap', 'bodies', 'density', 'scale', 'cast', 'castSize', 'castCategories'];

// shape is fixed: the model must see the same keys on every row
const d = recipeFeatures();
assert.deepStrictEqual(Object.keys(d), KEYS, 'stable key set');
assert.strictEqual(d.v, FEATURES_VERSION);
assert.strictEqual(d.system, DEFAULT_LAYOUT_PARAMS.mode, 'empty recipe → defaults, never throws');
assert.strictEqual(d.cast, null, 'no cast → the whole library (null), not an invented list');

// deterministic + JSON-safe
const r = { layoutParams: { mode: 'fibonacci', count: 24, scale: [1.6, 3.0], density: 50, accumulation: true, blendMode: 'normal' },
  paletteId: 'chiaroscuro', assets: ['xsh07', 'xsh01', 'xsh01', 'xsh05', 'xsh03'] };
const a = recipeFeatures(r);
assert.deepStrictEqual(a, recipeFeatures(JSON.parse(JSON.stringify(r))), 'deterministic');
assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), a, 'JSON round-trips');

// named values: DARK GLASS reads as what it is
assert.strictEqual(a.system, 'fibonacci');
assert.strictEqual(a.bodies, 'sparse');
assert.strictEqual(a.scale, 'large');
assert.strictEqual(a.density, 'mid');
assert.strictEqual(a.accum, true);
assert.strictEqual(a.palette, 'chiaroscuro');
assert.deepStrictEqual(a.cast, ['xsh01', 'xsh03', 'xsh05', 'xsh07'], 'cast sorted + deduped');
assert.strictEqual(a.castSize, 4);
assert.deepStrictEqual(a.castCategories, ['crystalline']);

// live systems count their particles, not their placement count
assert.strictEqual(recipeFeatures({ layoutParams: { mode: 'swarm', count: 20, particleCount: 400 } }).bodies, 'dense');
// bucket edges
assert.strictEqual(recipeFeatures({ layoutParams: { mode: 'grid', count: 59 } }).bodies, 'sparse');
assert.strictEqual(recipeFeatures({ layoutParams: { mode: 'grid', count: 60 } }).bodies, 'mid');
assert.strictEqual(recipeFeatures({ layoutParams: { mode: 'grid', count: 200 } }).bodies, 'dense');
// seed-independent: the recipe, not the draw
assert.deepStrictEqual(recipeFeatures({ ...r, seed: 1 }), recipeFeatures({ ...r, seed: 2 }));
// hostile input stays in the fixed vocabulary
const h = recipeFeatures({ layoutParams: { mode: 'nope', count: 'x', scale: 'big' }, paletteId: 7, assets: [1, 'user:mine', 'ghost'] });
assert.deepStrictEqual(Object.keys(h), KEYS);
assert.strictEqual(h.palette, null);
assert.deepStrictEqual(h.cast, ['ghost', 'user:mine']);
assert.deepStrictEqual(h.castCategories, ['unknown', 'user']);

console.log('recipeFeatures.selfcheck: OK');
