// node src/panels/layout/kineticHeat.selfcheck.mjs
//
// #945 — heat model + CHAOS ceiling for the KINETIC button. Pure, wall-clock-free:
// the caller passes `now`; all timing is arithmetic on tap gaps. Asserts the
// heat math (build on rapid taps, exponential decay when idle) and the layer
// routing across tap sequences. #1772: a run sweeps LOOK → VOICE → CURATOR;
// sustained rapid tapping still breaks through the CHAOS ceiling.
import assert from 'node:assert';
import {
  KINETIC_WARM_MS,
  KINETIC_HEAT_TAP_MS,
  KINETIC_HEAT_HALF_LIFE_MS,
  KINETIC_HEAT_PER_TAP,
  KINETIC_CHAOS_HEAT,
  decayHeat,
  addHeat,
  heatLevel,
  routeKineticTapHeat,
  kineticLayerLabel,
} from './kineticHeat.mjs';

const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// ── heat math ──────────────────────────────────────────────────────────────
assert.strictEqual(decayHeat(0, 5000), 0, 'zero heat stays zero');
assert.strictEqual(decayHeat(0.5, 0), 0.5, 'zero dt keeps heat');
assert.ok(
  approx(decayHeat(1, KINETIC_HEAT_HALF_LIFE_MS), 0.5),
  `one half-life halves heat, got ${decayHeat(1, KINETIC_HEAT_HALF_LIFE_MS)}`,
);
assert.ok(decayHeat(0.8, 10000) < 0.05, 'long idleness cools to ~0');
assert.strictEqual(addHeat(0.9), 1, 'heat caps at 1');
assert.ok(approx(addHeat(0), KINETIC_HEAT_PER_TAP), 'one rapid tap adds HEAT_PER_TAP');

assert.strictEqual(heatLevel(0), 'cool', '0 → cool');
assert.strictEqual(heatLevel(0.4), 'warm', '0.4 → warm');
assert.strictEqual(heatLevel(KINETIC_CHAOS_HEAT), 'hot', 'chaos threshold → hot');
assert.strictEqual(heatLevel(1), 'hot', '1 → hot');

// ── routing: tap sequences ─────────────────────────────────────────────────
// Times are synthetic `now` values; gaps are what matter.
const tap = (run, now) => routeKineticTapHeat(run, now);

// 1. Fresh tap → LOOK.
let r = tap({ heat: 0, taps: 0, lastTapAt: 0 }, 100000);
assert.strictEqual(r.layer, 'look', 'fresh tap → LOOK');
assert.strictEqual(r.taps, 1, 'fresh tap starts the run');

// 2. Warm second tap (1.5s — inside the 2s window, outside the 600ms heat
//    window) → VOICE, no heat built.
r = tap(r, 100000 + 1500);
assert.strictEqual(r.layer, 'voice', 'warm second tap → VOICE');
assert.strictEqual(r.heat, 0, 'a non-rapid tap builds no heat');

// 3. Rapid third tap (400ms) below the chaos gate → the CURATOR's nudge.
const r3 = tap({ heat: 0, taps: 2, lastTapAt: 200000 }, 200000 + 400);
assert.strictEqual(r3.layer, 'curator', 'rapid 3rd tap below chaos heat → CURATOR');
assert.ok(r3.heat > 0 && r3.heat < KINETIC_CHAOS_HEAT, `heat ${r3.heat} below chaos gate`);

// 4. Sustained hammering (300ms gaps) breaks the CHAOS ceiling on the 3rd
//    rapid tap and pegs heat — decisive and learnable.
let run = { heat: 0, taps: 0, lastTapAt: 0 };
let now = 300000;
const layers = [];
for (let i = 0; i < 6; i++) {
  now += i === 0 ? 5000 : 300; // first tap fresh, then hammer
  run = tap(run, now);
  layers.push(run.layer);
}
assert.deepStrictEqual(
  layers,
  ['look', 'voice', 'chaos', 'chaos', 'chaos', 'chaos'],
  `hammering: look→voice→chaos…, got ${layers}`,
);
assert.strictEqual(run.heat, 1, 'sustained hammering pegs heat at 1');

// 5. Stale tap (≥2s gap) resets the run → LOOK, heat 0.
const stale = tap({ heat: 1, taps: 9, lastTapAt: 400000 }, 400000 + KINETIC_WARM_MS);
assert.strictEqual(stale.layer, 'look', 'stale tap → LOOK');
assert.strictEqual(stale.heat, 0, 'stale tap cools to 0');
assert.strictEqual(stale.taps, 1, 'stale tap restarts the run');

// 6. Five calm taps at 1.5s intervals sweep left to right — LOOK, VOICE, then
//    the CURATOR on every further tap — never CHAOS; heat never builds.
run = { heat: 0, taps: 0, lastTapAt: 0 };
now = 500000;
const calm = [];
for (let i = 0; i < 5; i++) {
  now += i === 0 ? 5000 : 1500;
  run = tap(run, now);
  calm.push(run.layer);
}
assert.deepStrictEqual(
  calm,
  ['look', 'voice', 'curator', 'curator', 'curator'],
  `calm taps sweep look → voice → curator, got ${calm}`,
);
assert.strictEqual(run.heat, 0, 'calm taps build no heat');

// 7. Five slow taps at 3s intervals: a fresh LOOK every time.
run = { heat: 0, taps: 0, lastTapAt: 0 };
now = 600000;
const slow = [];
for (let i = 0; i < 5; i++) {
  now += i === 0 ? 5000 : 3000;
  run = tap(run, now);
  slow.push(run.layer);
}
assert.ok(
  slow.every((l) => l === 'look'),
  `slow taps all LOOK, got ${slow}`,
);

// 8. The micro-label names the pass that ran (KC-1 DS: honest signals).
assert.deepStrictEqual(['look', 'voice', 'curator', 'chaos'].map(kineticLayerLabel), ['L', 'V', 'C', 'X']);
assert.strictEqual(kineticLayerLabel('nope'), '', 'an unknown layer shows no letter, never a wrong one');

console.log('ok kineticHeat: heat math + tap routing (#945, #1772 sweep)');
