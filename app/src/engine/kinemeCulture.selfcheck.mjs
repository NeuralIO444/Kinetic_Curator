// node src/engine/kinemeCulture.selfcheck.mjs
// #1923 (rebalanced) — the culture as a Kineme motion source: a SECONDARY read. Marks near a living colony swell
// and fray a little; everything else is untouched; strength 0 / no culture is the hard gate (bit-identical).
import assert from 'node:assert/strict';
import { evaluateKineme, applyKinemeDrivers, CULTURE_SCALE, CULTURE_FRAY } from './kineme.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const N = 12;
const mkSoa = () => ({
  n: N,
  index: Array.from({ length: N }, (_, k) => k * 5 + 2),
  scale: new Float64Array(N).fill(1),
  scaleY: new Float64Array(N).fill(1),
  rotation: new Float64Array(N),
  x: Float64Array.from({ length: N }, (_, k) => 40 + k * 70),
  y: Float64Array.from({ length: N }, (_, k) => 60 + (k % 4) * 150),
});
// a fake culture: the left half alive and changing, the right half dead
const sampler = (strength, gen = 7) => ({
  strength,
  gen,
  sample(x, _y, out) {
    out.level = x < 400 ? 1 : 0;
    out.activity = x < 400 ? 0.8 : 0;
    return true;
  },
});
const ctx = (culture, extra = {}) => ({
  seed: 42,
  driverSec: 3.25,
  boilStep: 0,
  amounts: { breath: 0, drift: 0, pulse: 0, brushWobble: 0 },
  canvasW: 1000,
  canvasH: 700,
  anchored: true,
  ...(culture ? { culture } : {}),
  ...extra,
});

ok('no culture, or strength 0: the hard gate — inactive, and bit-identical with a scene that never heard of it', () => {
  for (const c of [ctx(null), ctx(sampler(0)), ctx({ strength: 0.5 }), ctx({ strength: NaN, sample: () => true })]) {
    const soa = mkSoa();
    const d = evaluateKineme(soa, c);
    assert.equal(d.active, false);
    assert.ok([...d.dScale, ...d.dx, ...d.dy].every((v) => v === 0));
    const before = { s: [...soa.scale], x: [...soa.x], y: [...soa.y] };
    assert.equal(applyKinemeDrivers(soa, c), null, 'nothing applied, no undo');
    assert.deepEqual([...soa.scale], before.s);
    assert.deepEqual([...soa.x], before.x);
  }
});

ok('a living colony: marks inside swell and fray, marks outside do not move at all', () => {
  const soa = mkSoa();
  const d = evaluateKineme(soa, ctx(sampler(1)));
  assert.equal(d.active, true);
  let inside = 0;
  for (let k = 0; k < N; k++) {
    if (soa.x[k] < 400) {
      inside++;
      assert.ok(d.dScale[k] > 0, 'swells');
      assert.ok(Math.abs(d.dx[k]) + Math.abs(d.dy[k]) > 0, 'frays');
    } else {
      assert.equal(d.dScale[k], 0, 'dead ground: no swell');
      assert.equal(d.dx[k], 0);
      assert.equal(d.dy[k], 0);
    }
  }
  assert.ok(inside > 0 && inside < N, 'the fixture has both');
});

ok('it stays a SECONDARY read: swell ≤ CULTURE_SCALE, fray ≤ CULTURE_FRAY of the small side, at full strength', () => {
  const soa = mkSoa();
  const d = evaluateKineme(soa, ctx(sampler(1)));
  const m = 700;
  for (let k = 0; k < N; k++) {
    assert.ok(d.dScale[k] <= CULTURE_SCALE + 1e-12, `swell ${d.dScale[k]}`);
    assert.ok(Math.abs(d.dx[k]) <= CULTURE_FRAY * m + 1e-9);
    assert.ok(Math.abs(d.dy[k]) <= CULTURE_FRAY * m + 1e-9);
  }
  assert.ok(CULTURE_SCALE <= 0.06 && CULTURE_FRAY <= 0.008, 'the peaks are small by contract');
});

ok('strength scales it linearly; half strength is half the swell', () => {
  const a = evaluateKineme(mkSoa(), ctx(sampler(1)));
  const b = evaluateKineme(mkSoa(), ctx(sampler(0.5)));
  for (let k = 0; k < N; k++) assert.ok(Math.abs(b.dScale[k] - a.dScale[k] * 0.5) < 1e-12);
  for (let k = 0; k < N; k++) assert.ok(Math.abs(b.dx[k] - a.dx[k] * 0.5) < 1e-12);
});

ok('deterministic, and the fray is boiled to the generation (flickers per gen, holds within one)', () => {
  const a = evaluateKineme(mkSoa(), ctx(sampler(1, 7)));
  const b = evaluateKineme(mkSoa(), ctx(sampler(1, 7)));
  assert.deepEqual([...a.dx], [...b.dx]);
  assert.deepEqual([...a.dy], [...b.dy]);
  const c = evaluateKineme(mkSoa(), ctx(sampler(1, 8)));
  assert.notDeepEqual([...a.dx], [...c.dx], 'a new generation re-rolls the fray');
  assert.deepEqual([...a.dScale], [...c.dScale], 'the swell follows the field, not the dice');
  // driver time does not move the culture's fray: it is the culture's tick
  const d = evaluateKineme(mkSoa(), ctx(sampler(1, 7), { driverSec: 99 }));
  assert.deepEqual([...a.dx], [...d.dx]);
});

ok('it composes with the other drivers (adds to breath) and never cancels them', () => {
  const only = evaluateKineme(mkSoa(), ctx(null, { amounts: { breath: 0.5, drift: 0, pulse: 0, brushWobble: 0 } }));
  const both = evaluateKineme(
    mkSoa(),
    ctx(sampler(1), { amounts: { breath: 0.5, drift: 0, pulse: 0, brushWobble: 0 } }),
  );
  const cul = evaluateKineme(mkSoa(), ctx(sampler(1)));
  for (let k = 0; k < N; k++) assert.ok(Math.abs(both.dScale[k] - (only.dScale[k] + cul.dScale[k])) < 1e-12);
});

ok('the applier: pinned (still) marks keep everything; the undo restores the cached positions exactly', () => {
  const soa = mkSoa();
  const x0 = [...soa.x];
  const still = new Uint8Array(N);
  still[0] = 1;
  const undo = applyKinemeDrivers(soa, ctx(sampler(1)), still);
  assert.equal(typeof undo, 'function');
  assert.equal(soa.scale[0], 1, 'a pinned mark does not swell');
  assert.equal(soa.x[0], x0[0], 'nor fray');
  assert.ok(soa.scale[1] > 1, 'a free mark in the colony swells');
  undo();
  assert.deepEqual([...soa.x], x0, 'the cached x is restored — no walk across frames');
});

ok('shed tier 3 (the governor froze motion) is identity; a sampler outside the canvas moves nothing', () => {
  const soa = mkSoa();
  assert.equal(applyKinemeDrivers(soa, ctx(sampler(1), { shedTier: 3 })), null);
  assert.ok([...soa.scale].every((v) => v === 1));
  const away = { strength: 1, gen: 1, sample: () => false };
  const d = evaluateKineme(mkSoa(), ctx(away));
  assert.equal(d.active, false);
});

console.log(`[selfcheck] kinemeCulture (#1923): ${n} cases passed`);
