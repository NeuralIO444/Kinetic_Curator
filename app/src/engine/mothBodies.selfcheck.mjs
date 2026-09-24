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

// u is a scalar the kernel sets
const { sys, items } = run();
assert.strictEqual(sys.physicsCount(), 16, 'bilateral does not double physics');
const wings = items.filter((it) => it.role === 'wing');
assert.strictEqual(wings.length, 32);
assert.ok(wings.every((w) => w.u >= 0 && w.u <= 1));
assert.ok(wings.some((w) => w._mirrored));

// flap + speed actually sweep u (not stuck at 0)
const us = sys.particles.map((p) => p.u);
assert.ok(Math.max(...us) - Math.min(...us) > 0.05, 'field u should vary across the flock');

// same seed → same leaders
const a = run({}, 12).sys.particles.map((p) => [+p.x.toFixed(3), +p.y.toFixed(3)]);
const b = run({}, 12).sys.particles.map((p) => [+p.x.toFixed(3), +p.y.toFixed(3)]);
assert.deepStrictEqual(a, b);

// dish
for (const p of run({}, 80).sys.particles) {
  assert.ok(p.x >= 0 && p.x <= 1000);
  assert.ok(p.y >= 0 && p.y <= 700);
}

// remainder A — second pair (uncomment when pair-2 is wired)
// import { LADDERS } from '../data/bodies/demoLadder.js';
// assert.ok(LADDERS['lobe-petal']?.length >= 5);
// assert.ok(new Set(run().items.map((it) => it.ladderId)).size >= 2);

// remainder B — paint u (uncomment when a gradient follows u)
// assert.ok(items.some((it) => it.paintHref || it.role === 'wing'));

void DEMO_LADDER_ID;
console.log('mothBodies.selfcheck: OK');