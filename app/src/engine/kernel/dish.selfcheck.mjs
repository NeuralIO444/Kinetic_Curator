// node src/engine/kernel/dish.selfcheck.mjs
// #1183 slice 1 — the dish: placement-filled point sets with identity,
// precomputed select(), and the tile-color lean proof (lean = 0 is
// byte-identical to the old path).

import assert from 'node:assert';
import { createDish, fillDishPoints } from './dish.js';
import { applyLean } from './color/index.js';
import { buildPlacements } from '../buildPlacements.js';
import { assign, groundColorAt } from '../../pattern/engine.js';

// --- applyLean unit semantics ---
assert.strictEqual(applyLean('#ff0000', '#0000ff', 0), '#ff0000', 'lean 0 returns input untouched');
assert.strictEqual(applyLean('#ff0000', '#0000ff', 1), '#0000ff', 'lean 1 is the ground exactly');
assert.strictEqual(applyLean('#ff0000', '#0000ff', 0.5), '#800080', 'lean 0.5 midpoints');
assert.strictEqual(applyLean('#f00', '#00f', 1), '#0000ff', '3-digit hex handled');
assert.strictEqual(applyLean('#ff0000', '#0000ff', -2), '#ff0000', 'negative lean is identity');
assert.strictEqual(applyLean('#ff0000', '#0000ff', 99), '#0000ff', 'lean clamps at 1');

// --- dish channels + select ---
{
  const dish = createDish({ seed: 123 });
  assert.strictEqual(dish.seed, 123);
  assert.deepStrictEqual(dish.points, {});
  assert.deepStrictEqual(dish.fields, {});
  assert.deepStrictEqual(dish.features, []);
  assert.strictEqual(dish.ground, null);
  assert.deepStrictEqual(dish.select({ family: 'mark' }), [], 'empty select');
  assert.deepStrictEqual(dish.select({}), [], 'family required');
  assert.deepStrictEqual(dish.select({ family: 'mark', source: 'x' }), [], 'empty select w/ source');

  const marks = [
    { id: 'm1', family: 'mark', source: 'asset:a', x: 1, y: 2 },
    { id: 'm2', family: 'mark', source: 'asset:b', x: 3, y: 4 },
  ];
  const shapes = [{ id: 's1', family: 'shape', source: 'pattern:quilt', x: 5, y: 6 }];
  fillDishPoints(dish, 'marks', marks);
  fillDishPoints(dish, 'shapes', shapes);
  assert.strictEqual(dish.points.marks, marks);
  assert.strictEqual(dish.select({ family: 'mark' }).length, 2, 'family select');
  assert.strictEqual(dish.select({ family: 'mark', source: 'asset:a' }).length, 1, 'family+source select');
  assert.strictEqual(dish.select({ family: 'mark', source: 'asset:a' })[0].id, 'm1');
  assert.strictEqual(dish.select({ family: 'shape', source: 'pattern:quilt' })[0].id, 's1');
  assert.strictEqual(dish.select({ family: 'mark', source: 'nope' }).length, 0);
  // Precomputed: same reference, no per-frame search.
  assert.strictEqual(dish.select({ family: 'mark' }), dish.select({ family: 'mark' }));

  // Refill replaces — no double-counting in the index.
  fillDishPoints(dish, 'marks', [marks[0]]);
  assert.strictEqual(dish.select({ family: 'mark' }).length, 1);
  assert.strictEqual(dish.select({ family: 'shape' }).length, 1, 'other sets survive refill');

  assert.throws(() => fillDishPoints(dish, '', []), /non-empty string/);
}

// --- the tile-color lean proof, end to end through the orchestrator ---
const assets = [
  { id: 'a', weight: 'heavy' },
  { id: 'b', weight: 'medium' },
];
const palette = { swatches: ['#0b0b0b', '#e03131', '#2f9e44', '#1971c2', '#f08c00'] };
const layoutParams = {
  mode: 'grid',
  composition: 'default',
  count: 40,
  scale: [0.4, 0.8],
  rotate: [0, 45],
  alpha: [60, 100],
  jitter: 10,
  density: 100,
  zTiers: 1,
  bleed: false,
  mirror: false,
  overlap: true,
  displacement: 0,
  noiseFreq: 0.005,
  noiseSpeed: 0.5,
};
const caps = { maxCount: 420, maxCountMirrored: 360, maxParticles: 200, allowMirror: true };
const opts = { layoutParams, seed: 0x1a4f, activeAssets: assets, palette, caps, canvasW: 1000, canvasH: 700 };

// The pattern ground the dish reads: one pure function (groundColorAt),
// the same value the renderer paints where no motif lands.
const grid = assign(0xbeef, 6, 0.5, palette);
const tileW = 1000 / grid.cols;
const tileH = 700 / grid.rows;
function makeDish() {
  const dish = createDish({ seed: 0x1a4f });
  dish.ground = (x, y) => groundColorAt(grid, x / tileW, y / tileH);
  return dish;
}

const base = buildPlacements(opts); // the old path: no dish, no lean
const colorsBase = base.items.map((i) => i.color);

// lean = 0 through the new path: byte-identical colors.
{
  const dish = makeDish();
  const r = buildPlacements({ ...opts, dish, lean: 0 });
  assert.deepStrictEqual(
    r.items.map((i) => i.color),
    colorsBase,
    'lean=0 must be byte-identical to the old path',
  );
  // …and the dish was filled with addressable marks.
  assert.strictEqual(dish.points.marks.length, r.items.length);
  assert.strictEqual(dish.select({ family: 'mark' }).length, r.items.length);
  assert.strictEqual(dish.select({ family: 'mark', source: 'a' }).length > 0, true);
  for (const e of dish.points.marks) {
    assert.strictEqual(e.family, 'mark');
    assert.ok(typeof e.id === 'string' && e.id, 'entity id');
    assert.ok(typeof e.source === 'string' && e.source, 'entity source');
  }
  // dish.ground reads the same ground the renderer paints.
  const e0 = dish.points.marks[0];
  assert.strictEqual(dish.ground(e0.x, e0.y), groundColorAt(grid, e0.x / tileW, e0.y / tileH));
}

// lean = 1: every mark is exactly its ground color.
{
  const dish = makeDish();
  const r = buildPlacements({ ...opts, dish, lean: 1 });
  assert.strictEqual(r.items.length, base.items.length);
  for (const it of r.items) {
    assert.strictEqual(it.color, groundColorAt(grid, it.x / tileW, it.y / tileH), 'lean=1 → ground');
  }
}

// lean = 0.5: each channel sits between the base color and the ground.
{
  const dish = makeDish();
  const r = buildPlacements({ ...opts, dish, lean: 0.5 });
  const px = (hex) => [0, 2, 4].map((o) => parseInt(hex.slice(1 + o, 3 + o), 16));
  for (let i = 0; i < r.items.length; i++) {
    const b = px(colorsBase[i]);
    const g = px(groundColorAt(grid, r.items[i].x / tileW, r.items[i].y / tileH));
    const m = px(r.items[i].color);
    if (colorsBase[i] !== groundColorAt(grid, r.items[i].x / tileW, r.items[i].y / tileH)) {
      assert.notStrictEqual(r.items[i].color, colorsBase[i], 'lean did something');
    }
    for (let c = 0; c < 3; c++) {
      const lo = Math.min(b[c], g[c]);
      const hi = Math.max(b[c], g[c]);
      assert.ok(m[c] >= lo && m[c] <= hi, `channel ${c} outside [base, ground]`);
    }
  }
}

// No dish at all: the old call shape is untouched.
{
  const r = buildPlacements(opts);
  assert.deepStrictEqual(r.items.map((i) => i.color), colorsBase);
}

console.log('dish.selfcheck: ok');
