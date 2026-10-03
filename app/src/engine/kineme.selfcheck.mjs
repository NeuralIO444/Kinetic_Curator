// node src/engine/kineme.selfcheck.mjs
// Slice 1 (kineme-time): the time core — shared loop-time source, boil
// clock, sine-free per-instance phase, anchored driver clock.
import assert from 'node:assert';
import {
  BOIL_FPS_DEFAULT, BOIL_FPS_MIN, BOIL_FPS_MAX,
  kinemeLoopSec, boilStep, boilSec, clampBoilFps,
  kinemePhase2, createDriverClock, driverTimeSec,
} from './kineme.js';

// ── loop seconds ─────────────────────────────────────────────────────────
assert.strictEqual(kinemeLoopSec(1000), 1);
assert.strictEqual(kinemeLoopSec(250), 0.25);
assert.strictEqual(kinemeLoopSec(0), 0, 'unobserved mirror (0) is not a stamp');
assert.strictEqual(kinemeLoopSec(-50), 0);
assert.strictEqual(kinemeLoopSec(NaN), 0);
assert.strictEqual(kinemeLoopSec('nope'), 0);

// ── boil clock ───────────────────────────────────────────────────────────
assert.strictEqual(BOIL_FPS_DEFAULT, 8);
assert.strictEqual(BOIL_FPS_MIN, 6);
assert.strictEqual(BOIL_FPS_MAX, 12);
assert.strictEqual(clampBoilFps(8), 8);
assert.strictEqual(clampBoilFps(3), 6, 'below range clamps');
assert.strictEqual(clampBoilFps(99), 12, 'above range clamps');
assert.strictEqual(clampBoilFps(NaN), 8, 'garbage → default');
assert.strictEqual(boilStep(0.13, 8), 1);
assert.strictEqual(boilSec(0.13, 8), 0.125);
assert.strictEqual(boilSec(0.13, 8), boilSec(0.2, 8), 'holds inside a frame');
assert.notStrictEqual(boilSec(0.124, 8), boilSec(0.126, 8), 'jumps at the frame edge');
assert.strictEqual(boilStep(2.0, 8), 16);

// ── per-instance phase: deterministic, decorrelated ──────────────────────
{
  const a = kinemePhase2(7, 3);
  const b = kinemePhase2(7, 3);
  assert.deepStrictEqual(a, b, 'same (seed, index) → same phase');
  assert.ok(a[0] >= 0 && a[0] < 1 && a[1] >= 0 && a[1] < 1, 'both in [0,1)');
  const seen = new Set();
  for (let i = 0; i < 60; i++) seen.add(kinemePhase2(7, i).join(','));
  assert.ok(seen.size >= 50, 'copies do not move in lockstep');
  let same = 0;
  for (let i = 0; i < 60; i++) { const [u, v] = kinemePhase2(7, i); if (u === v) same++; }
  assert.ok(same < 5, 'noise and boil offsets are decorrelated');
  assert.notDeepStrictEqual(kinemePhase2(7, 3), kinemePhase2(8, 3), 'seed matters');
}

// ── anchored driver clock: rate 1 is loop time, 0 freezes, changes anchor ─
{
  const c = createDriverClock();
  for (const t of [0, 0.25, 3.7]) assert.strictEqual(driverTimeSec(c, t * 1000, 1), t);
  const d = createDriverClock();
  assert.strictEqual(driverTimeSec(d, 2000, 1), 2);
  assert.strictEqual(driverTimeSec(d, 2000, 3), 2, 'rate change re-anchors, never jumps');
  assert.ok(Math.abs(driverTimeSec(d, 3000, 3) - 5) < 1e-12, 'then runs 3x');
  const f = createDriverClock();
  assert.strictEqual(driverTimeSec(f, 4000, 1), 4);
  assert.strictEqual(driverTimeSec(f, 4000, 0), 4, 'rate 0 freezes where it is');
  assert.strictEqual(driverTimeSec(f, 9000, 0), 4, 'held while loop time would advance');
  assert.strictEqual(driverTimeSec(f, 4000, 1), 4, 'rate restore at the held instant never jumps');
  assert.strictEqual(driverTimeSec(f, 5000, 1), 5, 'resume continues from the held pose');
}

console.log('kineme.selfcheck: OK (time core)');

// ── slice 2: driver API + evaluator ────────────────────────────────────────
import {
  KINEME_DRIVERS, getKinemeDriver, isKinemeDriver,
  evaluateKineme, applyKinemeDrivers, kinemeStillSec,
} from './kineme.js';

// declarations
assert.strictEqual(KINEME_DRIVERS.length, 4, 'curated v1 set (Matt decision 6)');
for (const d of KINEME_DRIVERS) {
  assert.ok(typeof d.id === 'string' && d.id, 'stable id');
  assert.ok(Array.isArray(d.targets) && d.targets.length, `${d.id}: targets`);
  assert.ok(typeof d.amountMeaning === 'string', `${d.id}: amount meaning in real units`);
  assert.deepStrictEqual(d.amountRange, [0, 1], `${d.id}: 0..1`);
  assert.ok(['per-instance', 'global'].includes(d.phaseMode), `${d.id}: phase mode`);
  assert.ok(['boil', 'smooth'].includes(d.clock), `${d.id}: clock`);
  assert.ok(typeof d.costTier === 'string', `${d.id}: cost tier declared once`);
}
assert.strictEqual(getKinemeDriver('breath').clock, 'smooth');
assert.strictEqual(getKinemeDriver('brush-wobble').clock, 'boil');
assert.strictEqual(getKinemeDriver('nope'), undefined);
assert.ok(isKinemeDriver('drift') && !isKinemeDriver('nope'));

const mkSoa = (n, seed) => ({
  n,
  index: Array.from({ length: n }, (_, k) => k * 7 + 1),
  scale: new Float64Array(n).fill(1),
  x: new Float64Array(n),
  y: new Float64Array(n),
});
const ctx0 = {
  seed: 42, driverSec: 3.25, boilStep: 26,
  amounts: { breath: 0, drift: 0, pulse: 0, brushWobble: 0 },
  canvasW: 1000, canvasH: 700,
};

// amount 0 → hard gate: inactive, zeros, applier leaves channels untouched
{
  const soa = mkSoa(24);
  const before = { scale: [...soa.scale], x: [...soa.x], y: [...soa.y] };
  const d = evaluateKineme(soa, ctx0);
  assert.strictEqual(d.active, false, 'all-zero amounts → inactive');
  assert.ok(d.dScale.every((v) => v === 0) && d.dx.every((v) => v === 0));
  applyKinemeDrivers(soa, ctx0);
  assert.deepStrictEqual([...soa.scale], before.scale, 'bit-identical: skip, not ×0');
  assert.deepStrictEqual([...soa.x], before.x);
  assert.deepStrictEqual([...soa.y], before.y);
}

// breath: bounded swell, periodic, per-instance phases differ
{
  const soa = mkSoa(24);
  const d = evaluateKineme(soa, { ...ctx0, amounts: { breath: 1 } });
  assert.ok(d.active);
  assert.ok(d.dScale.every((v) => v >= -0.09 - 1e-12 && v <= 0.09 + 1e-12), '±9% bound');
  assert.ok(new Set([...d.dScale].map((v) => v.toFixed(6))).size > 12, 'phases differ');
  const d2 = evaluateKineme(soa, { ...ctx0, driverSec: 3.25 + 1 / 0.11, amounts: { breath: 1 } });
  for (let k = 0; k < 24; k++) assert.ok(Math.abs(d.dScale[k] - d2.dScale[k]) < 1e-9, 'one period returns');
}

// drift: bounded wander in canvas units
{
  const soa = mkSoa(16);
  const d = evaluateKineme(soa, { ...ctx0, amounts: { drift: 1 } });
  const bound = 0.02 * 700 + 1e-9;
  assert.ok(d.dx.every((v) => Math.abs(v) <= bound) && d.dy.every((v) => Math.abs(v) <= bound));
}

// pulse: thump peaks at phase 0, decays across the period
{
  const soa = mkSoa(8);
  const at = (t) => evaluateKineme(soa, { ...ctx0, seed: 5, driverSec: t, amounts: { pulse: 1 } }).dScale[0];
  const [uN] = kinemePhase2(5, soa.index[0]);
  const peak = at(-uN / 0.5); // phase 0
  assert.ok(Math.abs(peak - 0.16) < 1e-9, 'thump peaks at 16%');
  assert.ok(at(-uN / 0.5 + 1.5) < peak * 0.05, 'decays across the period');
}

// brush-wobble: boil-quantized, deterministic, bounded
{
  const soa = mkSoa(12);
  const c = { ...ctx0, amounts: { brushWobble: 1 } };
  const a = evaluateKineme(soa, c).dWobble;
  const b = evaluateKineme(soa, { ...c, driverSec: 3.3 }).dWobble; // same boil frame
  assert.deepStrictEqual([...a], [...b], 'holds inside a boil frame');
  const d = evaluateKineme(soa, { ...c, boilStep: 27 }).dWobble;
  assert.ok(!a.every((v, k) => v === d[k]), 'jumps on the next frame');
  assert.ok(a.every((v) => v >= -1 && v <= 1), '±1 edge-band fraction');
}

// shed tiers 3/4 → identity even with amounts up
{
  const soa = mkSoa(10);
  const before = [...soa.scale];
  applyKinemeDrivers(soa, { ...ctx0, amounts: { breath: 1, drift: 1 }, shedTier: 3 });
  applyKinemeDrivers(soa, { ...ctx0, amounts: { breath: 1, drift: 1 }, shedTier: 4 });
  assert.deepStrictEqual([...soa.scale], before, 'pin/zero → untouched channels');
}

// still instant: deterministic from seed, inside one boil period
{
  const s1 = kinemeStillSec(1234);
  assert.strictEqual(s1, kinemeStillSec(1234), 'same seed → same instant');
  assert.ok(s1 >= 0 && s1 < 1 / 8, 'inside one boil period');
  assert.notStrictEqual(s1, kinemeStillSec(1235), 'reseed → new moment');
}

console.log('kineme.selfcheck: OK (drivers)');

// ── slice 2: buildPlacements integration ─────────────────────────────────
import { buildPlacements } from './buildPlacements.js';

{
  const assets = [
    { id: 'a', weight: 'heavy' },
    { id: 'b', weight: 'medium' },
  ];
  const palette = { swatches: ['#111', '#222', '#333'] };
  const layoutParams = {
    mode: 'grid', composition: 'default', count: 40,
    scale: [0.4, 0.8], rotate: [0, 45], alpha: [60, 100],
    jitter: 10, density: 100, zTiers: 1, bleed: false, mirror: false,
    displacement: 0, noiseFreq: 0.005, noiseSpeed: 0.5,
  };
  const base = {
    layoutParams, seed: 0x1a4f, activeAssets: assets, palette,
    caps: { maxCount: 420, maxCountMirrored: 360, maxParticles: 200, allowMirror: true },
    canvasW: 1000, canvasH: 700,
  };
  const kin = (amounts, extra = {}) => ({
    driverSec: 3.25, boilStep: 26, seed: 0x1a4f, amounts,
    canvasW: 1000, canvasH: 700, shedTier: 0, ...extra,
  });
  const zero = { breath: 0, drift: 0, pulse: 0, brushWobble: 0 };

  const plain = buildPlacements(base).items;
  const gated = buildPlacements({ ...base, kineme: kin(zero) }).items;
  assert.strictEqual(gated.length, plain.length);
  for (let i = 0; i < plain.length; i++) {
    assert.strictEqual(gated[i].x, plain[i].x, 'amount 0: x bit-identical');
    assert.strictEqual(gated[i].y, plain[i].y, 'amount 0: y bit-identical');
    assert.strictEqual(gated[i].scale, plain[i].scale, 'amount 0: scale bit-identical');
  }

  const alive = buildPlacements({ ...base, kineme: kin({ ...zero, breath: 1, drift: 1 }) }).items;
  assert.strictEqual(alive.length, plain.length, 'same count');
  let moved = 0;
  for (let i = 0; i < plain.length; i++) {
    if (alive[i].x !== plain[i].x || alive[i].scale !== plain[i].scale) moved++;
  }
  assert.ok(moved > plain.length / 2, 'drivers move most marks');

  // shed tier 3 → identity even with amounts up
  const pinned = buildPlacements({ ...base, kineme: kin({ ...zero, breath: 1 }, { shedTier: 3 }) }).items;
  for (let i = 0; i < plain.length; i++) {
    assert.strictEqual(pinned[i].x, plain[i].x, 'shed pin: x identical');
    assert.strictEqual(pinned[i].scale, plain[i].scale, 'shed pin: scale identical');
  }
}

console.log('kineme.selfcheck: OK (placements integration)');
