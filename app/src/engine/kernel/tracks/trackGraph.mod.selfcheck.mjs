// node src/engine/kernel/tracks/trackGraph.mod.selfcheck.mjs
// #343: MOD-coupling engine contract. Test-only — locks the source-motion →
// target-knobs contract of applyMod()/motionMetrics() before any PATCH-row
// or live-loop wiring exists. No engine code is touched here.
import assert from 'node:assert';
import { applyMod, motionMetrics, normalizePatch } from './trackGraph.js';

const patch = (over = {}) =>
  normalizePatch({ from: 0, to: 1, mode: 'mod', strength: 1, polarity: 1, ...over });
const knobs0 = () => ({ glow: 0, fade: 0, displace: 0 });

// --- motionMetrics -----------------------------------------------------
assert.deepStrictEqual(
  motionMetrics([]),
  { cx: 0.5, cy: 0.5, vx: 0, vy: 0, speed: 0, agitation: 0, density: 0 },
  'no points: centered, at rest',
);
const still = motionMetrics([{ x: 0.3, y: 0.3, vx: 0, vy: 0 }, { x: 0.7, y: 0.7, vx: 0, vy: 0 }]);
assert.strictEqual(still.speed, 0, 'zero velocity → zero speed');
assert.strictEqual(still.agitation, 0, 'zero velocity → zero agitation');
assert.ok(Math.abs(still.cx - 0.5) < 1e-9, 'centroid x averages the points');

const moving = motionMetrics([{ x: 0.5, y: 0.5, vx: 1, vy: 0 }, { x: 0.5, y: 0.5, vx: 1, vy: 0 }]);
assert.ok(moving.speed > 0, 'shared-direction velocity produces nonzero speed');
assert.ok(moving.agitation > 0, 'moving points produce nonzero agitation');

const jittery = motionMetrics([{ x: 0.5, y: 0.5, vx: 5, vy: 0 }, { x: 0.5, y: 0.5, vx: -5, vy: 0 }]);
assert.ok(jittery.speed < 1e-9, 'opposed velocities cancel in mean speed');
assert.ok(jittery.agitation > 0, 'opposed velocities still register as agitation (energy, not drift)');

// --- applyMod: off / non-mod modes pass knobs through untouched --------
const m = motionMetrics([{ x: 0.5, y: 0.5, vx: 5, vy: 5 }]);
assert.deepStrictEqual(applyMod(knobs0(), m, patch({ mode: 'off' })), knobs0(), 'off: knobs untouched');
assert.deepStrictEqual(applyMod(knobs0(), m, patch({ mode: 'field' })), knobs0(), 'field mode: not applyMod\'s to touch');

// --- applyMod: strength 0 is a no-op, even with real source motion -----
const zeroed = applyMod(knobs0(), m, patch({ strength: 0 }));
assert.deepStrictEqual(zeroed, knobs0(), 'strength 0: knobs unchanged regardless of source motion');

// --- applyMod: agitation drives glow + displace; speed drives fade -----
const driven = applyMod(knobs0(), m, patch());
assert.ok(driven.glow > 0, 'agitated source raises target glow');
assert.ok(driven.displace > 0, 'agitated source raises target displace');
const still2 = applyMod(knobs0(), motionMetrics([{ x: 0.5, y: 0.5, vx: 0, vy: 0 }]), patch());
assert.deepStrictEqual(still2, knobs0(), 'a motionless source drives nothing');

// --- applyMod: polarity flips the sign of the push ----------------------
const posK = { glow: 0.5, fade: 0.5, displace: 2 };
const withPos = applyMod(posK, m, patch({ polarity: 1 }));
const withNeg = applyMod(posK, m, patch({ polarity: -1 }));
assert.ok(withPos.glow > posK.glow, 'positive polarity raises glow off a nonzero base');
assert.ok(withNeg.glow < posK.glow, 'negative polarity lowers glow off a nonzero base');

// --- applyMod: output stays in contract (glow/fade clamp to 0..1, displace >= 0) ---
const extreme = applyMod(knobs0(), motionMetrics([{ x: 0.5, y: 0.5, vx: 500, vy: 500 }]), patch({ strength: 4 }));
assert.ok(extreme.glow >= 0 && extreme.glow <= 1, 'glow stays in 0..1 under an extreme source');
assert.ok(extreme.fade >= 0 && extreme.fade <= 1, 'fade stays in 0..1 under an extreme source');
assert.ok(extreme.displace >= 0, 'displace never goes negative');

// --- applyMod: existing knob fields not in its contract ride along -----
const withExtra = applyMod({ ...knobs0(), someOtherKnob: 7 }, m, patch());
assert.strictEqual(withExtra.someOtherKnob, 7, 'unrelated knob fields are preserved');

// --- deterministic across runs -------------------------------------------
const runA = applyMod(knobs0(), m, patch());
const runB = applyMod(knobs0(), m, patch());
assert.deepStrictEqual(runA, runB, 'same input → same output, every run');

console.log('kernel/tracks.mod.selfcheck: OK (#343)', {
  drivenGlow: +driven.glow.toFixed(5),
  drivenDisplace: +driven.displace.toFixed(5),
});
