import assert from 'node:assert';
import { ParticleSystem } from './particles.js';
import { DEFAULT_LAYOUT_PARAMS, normalizeLayoutParams } from '../data/layout-modes.js';
import { DEMO_LADDER_ID, DEMO_LADDER_STEPS, ladderFrame } from '../data/bodies/demoLadder.js';

const assets = [{ id: 'a' }, { id: 'b' }];
const palette = { swatches: ['#111', '#222'] };

function run(over = {}, steps = 24) {
  const sys = new ParticleSystem();
  const lp = normalizeLayoutParams({
    ...DEFAULT_LAYOUT_PARAMS,
    mode: 'hype',
    particleCount: 16,
    symmetry: 'bilateral',
    body: 1,
    flap: 0.6,
    wind: 1,
    ...over,
  });
  sys.init(lp.particleCount, 1000, 700, assets, palette, 0x109);
  for (let s = 0; s < steps; s++) {
    sys.update(lp, assets, palette, 0x109, 5000 + s * (1000 / 60), null);
  }
  return { sys, lp, items: sys.getItems(assets) };
}

// ladder is a flipbook
assert.ok(DEMO_LADDER_STEPS.length >= 5, 'ship at least one 5-step pair');
assert.strictEqual(ladderFrame(0), 0);
assert.strictEqual(ladderFrame(1), DEMO_LADDER_STEPS.length - 1);
assert.strictEqual(ladderFrame(0.5), Math.round(0.5 * (DEMO_LADDER_STEPS.length - 1)));
assert.strictEqual(ladderFrame(NaN), 0);
assert.ok(DEMO_LADDER_STEPS.every((s) => typeof s === 'string' && s.includes('<')), 'frames are SVG, not path math');

// The system stores particles as SoA typed arrays (sys.x / sys.y / sys.u, live
// range [0, physicsCount())) — the old `sys.particles` object array is gone.
const live = (sys, key) => Array.from(sys[key].subarray(0, sys.physicsCount()));

// u is a scalar the kernel sets
const { sys, items } = run();
assert.strictEqual(sys.physicsCount(), 16, 'bilateral does not double physics');
const wings = items.filter((it) => it.role === 'wing');
assert.strictEqual(wings.length, 32);
assert.ok(wings.every((w) => w.u >= 0 && w.u <= 1));
assert.ok(wings.some((w) => w._mirrored));

// flap + speed actually sweep u (not stuck at 0)
const us = live(sys, 'u');
assert.ok(Math.max(...us) - Math.min(...us) > 0.05, 'field u should vary across the flock');

// same seed → same leaders
const leaders = (sys) => live(sys, 'x').map((x, i) => [+x.toFixed(3), +live(sys, 'y')[i].toFixed(3)]);
const a = leaders(run({}, 12).sys);
const b = leaders(run({}, 12).sys);
assert.ok(a.length > 0, 'the flock is not empty — the equality below must compare something');
assert.deepStrictEqual(a, b);

// dish
{
  const dish = run({}, 80).sys;
  const xs = live(dish, 'x'), ys = live(dish, 'y');
  assert.ok(xs.length > 0);
  for (let i = 0; i < xs.length; i++) {
    assert.ok(xs[i] >= 0 && xs[i] <= 1000, `x[${i}]=${xs[i]} inside the dish`);
    assert.ok(ys[i] >= 0 && ys[i] <= 700, `y[${i}]=${ys[i]} inside the dish`);
  }
}

// remainder A — second pair (uncomment when pair-2 is wired)
// import { LADDERS } from '../data/bodies/demoLadder.js';
// assert.ok(LADDERS['lobe-petal']?.length >= 5);
// assert.ok(new Set(run().items.map((it) => it.ladderId)).size >= 2);

// remainder B — paint u (uncomment when a gradient follows u)
// assert.ok(items.some((it) => it.paintHref || it.role === 'wing'));

void DEMO_LADDER_ID;
console.log('mothBodies.selfcheck: OK');