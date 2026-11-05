// node src/engine/dishLifeQuiet.selfcheck.mjs
// #1923 (rebalanced) — the quiet culture's pure half: the cycle stamp, the envelope, the read-only sampler.
import assert from 'node:assert/strict';
import {
  quietStamp,
  envelope,
  cultureSampler,
  CYCLE_GENS,
  QUIET_GPS,
  IDLE_BOOST,
  DEFAULT_STRENGTH,
} from './dishLifeQuiet.mjs';
import { createCulture, stepCulture, seedRandom } from './dishLife.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const CYCLE_MS = (CYCLE_GENS / QUIET_GPS) * 1000;

ok('off at strength 0 (and for junk): null, no work', () => {
  assert.equal(quietStamp(1234, { strength: 0 }), null);
  assert.equal(quietStamp(1234, { strength: -1 }), null);
  assert.equal(quietStamp(1234, { strength: NaN }), null);
  assert.equal(quietStamp(1234, { strength: 'x' }), null);
});

ok('the cycle: wakeMs is the cycle start, gen climbs inside it, a new cycle re-seeds', () => {
  const a = quietStamp(0, {});
  assert.deepEqual([a.mode, a.wakeMs, a.gen, a.cycleGens], ['quiet', 0, 0, CYCLE_GENS]);
  const b = quietStamp(1000, {});
  assert.deepEqual([b.wakeMs, b.gen], [0, QUIET_GPS]);
  const last = quietStamp(CYCLE_MS - 1, {});
  assert.deepEqual([last.wakeMs, last.gen], [0, CYCLE_GENS - 1], 'the last generation of a cycle');
  const next = quietStamp(CYCLE_MS, {});
  assert.deepEqual([next.wakeMs, next.gen], [CYCLE_MS, 0], 'the next cycle re-seeds');
  assert.equal(quietStamp(-50, {}).wakeMs, 0, 'before the clock: the first cycle');
  assert.deepEqual(quietStamp(4321, {}), quietStamp(4321, {}), 'pure: same loop time, same stamp');
});

ok('strength: the dial, lifted by the idle boost, clamped to 0..1', () => {
  assert.equal(quietStamp(0, {}).strength, DEFAULT_STRENGTH);
  assert.equal(quietStamp(0, { strength: 0.5 }).strength, 0.5);
  assert.ok(Math.abs(quietStamp(0, { strength: 0.5, boost: 1 }).strength - 0.5 * (1 + IDLE_BOOST)) < 1e-12);
  assert.ok(Math.abs(quietStamp(0, { strength: 0.5, boost: 0.5 }).strength - 0.5 * (1 + IDLE_BOOST * 0.5)) < 1e-12);
  assert.equal(quietStamp(0, { strength: 1, boost: 1 }).strength, 1, 'never above 1');
  assert.equal(quietStamp(0, { strength: 5 }).strength, 1, 'the dial clamps');
  assert.equal(
    quietStamp(0, { strength: 0.5, boost: 9 }).strength,
    quietStamp(0, { strength: 0.5, boost: 1 }).strength,
  );
  assert.equal(quietStamp(0, { shed: 2 }).shed, 2);
});

ok('the envelope: 0 at the seed, 1 mid-bloom, 0 at the end — a re-seed never pops', () => {
  assert.equal(envelope(0), 0);
  assert.ok(Math.abs(envelope(CYCLE_GENS / 2) - 1) < 1e-12);
  assert.ok(Math.abs(envelope(CYCLE_GENS)) < 1e-12);
  assert.ok(envelope(CYCLE_GENS / 4) > 0.7 && envelope(CYCLE_GENS / 4) < 0.72);
  assert.equal(envelope(-5), 0);
  assert.equal(envelope(1e9), envelope(CYCLE_GENS));
  assert.equal(envelope(3, 0), 0);
});

ok('the sampler: read-only, nearest cell, envelope-scaled, off-canvas is false', () => {
  const c = createCulture({ cols: 8, rows: 6, seed: seedRandom(8, 6, 11, 0.3) });
  for (let g = 0; g < 12; g++) stepCulture(c);
  const s = cultureSampler(c, { canvasW: 800, canvasH: 600, strength: 0.5 });
  assert.ok(Math.abs(s.strength - 0.5 * envelope(c.gen)) < 1e-12, 'strength rides the envelope');
  assert.equal(s.gen, c.gen);
  const out = { level: -1, activity: -1 };
  assert.equal(s.sample(150, 250, out), true);
  const i = Math.floor((250 / 600) * 6) * 8 + Math.floor((150 / 800) * 8);
  assert.equal(out.level, c.field.level[i]);
  assert.equal(out.activity, c.field.activity[i]);
  assert.equal(s.sample(-1, 10, out), false);
  assert.equal(s.sample(10, 600, out), false);
  assert.equal(s.sample(800, 10, out), false);
  const before = [...c.cur];
  s.sample(100, 100, out);
  out.level = 9;
  assert.deepEqual([...c.cur], before, 'sampling never writes the culture');
  assert.ok(
    Object.keys(s).every((k) => ['strength', 'gen', 'sample'].includes(k)),
    'no handle on the culture itself',
  );
});

console.log(`[selfcheck] dishLifeQuiet (#1923): ${n} cases passed`);
