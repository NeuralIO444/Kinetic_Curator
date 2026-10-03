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

// ── brush-kineme wiring: the boiled wobble drives the trail perpendicular ──
// End to end through the real ctx factory: buildKinemeCtx threads the
// brush's wobbleAmp, the stage-C applier folds dWobble along the geometry
// normals. Amount 0 is bit-identical; the boil jumps per frame, holds on a
// repeated frame (freeze), and reseeds deterministically.
{
  const assets = [{ id: 'a', weight: 'heavy' }];
  const palette = { swatches: ['#111'] };
  const AMP = 8;
  const lp = {
    mode: 'brush', composition: 'default', count: 60,
    scale: [0.4, 0.8], rotate: [-180, 180], alpha: [60, 100],
    jitter: 0, density: 100, zTiers: 1, bleed: false, mirror: false,
    displacement: 0, noiseFreq: 0.005, noiseSpeed: 0.5,
    brushSize: 24, brushSpacing: 0.5, fieldScale: 0.004, trailCount: 6,
    wobbleAmp: AMP, wobbleFreq: 0.5,
  };
  const base = {
    seed: 0xbeef, activeAssets: assets, palette,
    caps: { maxCount: 420, maxCountMirrored: 360, maxParticles: 200, allowMirror: true },
    canvasW: 1000, canvasH: 700,
  };
  const frame = (seed, boilStep, wobble) => {
    const layoutParams = { ...lp, kinemeBrushWobble: wobble };
    return buildPlacements({
      ...base, seed, layoutParams,
      kineme: buildKinemeCtx({
        layoutParams, driverSec: 3.25, boilStep, seed,
        canvasW: 1000, canvasH: 700,
      }),
    }).items;
  };

  // amount 0 → bit-identical to no kineme at all
  const plain = buildPlacements({ ...base, layoutParams: lp }).items;
  const s0 = frame(0xbeef, 5, 0);
  assert.strictEqual(s0.length, plain.length);
  for (let i = 0; i < plain.length; i++) {
    assert.strictEqual(s0[i].x, plain[i].x, 'wobble amount 0: x bit-identical');
    assert.strictEqual(s0[i].y, plain[i].y, 'wobble amount 0: y bit-identical');
  }

  // amount > 0 → the trail boils between boil frames, bounded by wobbleAmp
  const f5 = frame(0xbeef, 5, 1);
  const f6 = frame(0xbeef, 6, 1);
  let jumped = 0;
  for (let i = 0; i < f5.length; i++) {
    if (f5[i].x !== f6[i].x || f5[i].y !== f6[i].y) jumped++;
    assert.ok(Math.abs(f5[i].x - s0[i].x) <= AMP + 1e-9, `boil x bounded by wobbleAmp (${i})`);
    assert.ok(Math.abs(f5[i].y - s0[i].y) <= AMP + 1e-9, `boil y bounded by wobbleAmp (${i})`);
  }
  assert.ok(jumped > f5.length / 2, `boil jumps between frames (${jumped}/${f5.length})`);

  // freeze: same boilStep → the held pose, no pop
  const f5b = frame(0xbeef, 5, 1);
  for (let i = 0; i < f5.length; i++) {
    assert.strictEqual(f5b[i].x, f5[i].x, 'freeze holds x');
    assert.strictEqual(f5b[i].y, f5[i].y, 'freeze holds y');
  }

  // reseed → a different but equally deterministic boiling line
  const g5 = frame(0xbeef + 1, 5, 1);
  const g5b = frame(0xbeef + 1, 5, 1);
  let moved = 0;
  for (let i = 0; i < f5.length; i++) {
    if (g5[i].x !== f5[i].x || g5[i].y !== f5[i].y) moved++;
    assert.strictEqual(g5b[i].x, g5[i].x, 'reseed deterministic x');
    assert.strictEqual(g5b[i].y, g5[i].y, 'reseed deterministic y');
  }
  assert.ok(moved > 0, 'reseed → a new boiling line');
}

console.log('kineme.selfcheck: OK (brush boil wiring)');

// ── slice 3: live ctx assembly + freeze contract ─────────────────────────
import { buildKinemeCtx, holdKinemeTimes, KINEME_SHED_LABELS } from './kineme.js';

{
  const lp = (o) => ({ kinemeBreath: 0, kinemeDrift: 0, kinemePulse: 0, kinemeBrushWobble: 0, kinemeBoilFps: 8, ...o });
  const base = { layoutParams: lp(), driverSec: 3.25, boilStep: 26, seed: 42, canvasW: 1000, canvasH: 700 };

  assert.strictEqual(buildKinemeCtx(base), null, 'all-zero amounts → null (zero cost when off)');

  const on = buildKinemeCtx({ ...base, layoutParams: lp({ kinemeBreath: 0.5 }) });
  assert.ok(on, 'amount up → ctx');
  assert.strictEqual(on.driverSec, 3.25);
  assert.strictEqual(on.boilStep, 26, 'boil step rides the caller (shed holds it)');
  assert.strictEqual(on.seed, 42);
  assert.strictEqual(on.amounts.breath, 0.5);
  assert.strictEqual(on.shedTier, 0);

  // garbage time → null, never NaN into the pipeline
  assert.strictEqual(buildKinemeCtx({ ...base, layoutParams: lp({ kinemeBreath: 1 }), driverSec: NaN }), null);

  // freeze: the same driver second assembles the identical ctx → same pose
  const held1 = buildKinemeCtx({ ...base, layoutParams: lp({ kinemeBreath: 1, kinemeDrift: 0.3 }) });
  const held2 = buildKinemeCtx({ ...base, layoutParams: lp({ kinemeBreath: 1, kinemeDrift: 0.3 }) });
  assert.deepStrictEqual(held1, held2, 'held clock → identical ctx → held pose');
}

console.log('kineme.selfcheck: OK (live ctx + freeze)');

// ── slice 4: governor shed hold logic ────────────────────────────────────
{
  assert.deepStrictEqual(
    Object.keys(KINEME_SHED_LABELS).map(Number), [1, 2, 3, 4], 'four tiers, one entry',
  );

  // tier 0: passthrough, held cleared
  let r = holdKinemeTimes({ driverSec: 9, boilStep: 70 }, 0, 3.25, 26);
  assert.deepStrictEqual([r.driverSec, r.boilStep], [3.25, 26]);
  assert.deepStrictEqual(r.held, { driverSec: null, boilStep: null }, 'tier 0 clears the hold');

  // tier 1: boil held, smooth drivers live
  r = holdKinemeTimes(null, 1, 3.25, 26);
  assert.deepStrictEqual([r.driverSec, r.boilStep], [3.25, 26], 'first held frame arms');
  r = holdKinemeTimes(r.held, 1, 5.5, 44);
  assert.strictEqual(r.driverSec, 5.5, 'smooth drivers keep living');
  assert.strictEqual(r.boilStep, 26, 'boil frozen at the held step');

  // tier 2: everything held
  r = holdKinemeTimes(null, 2, 3.25, 26);
  r = holdKinemeTimes(r.held, 2, 9.75, 78);
  assert.deepStrictEqual([r.driverSec, r.boilStep], [3.25, 26], 'all motion holds pose');

  // tier 2 → 1: smooth resumes, boil stays held
  r = holdKinemeTimes(r.held, 1, 12.0, 96);
  assert.strictEqual(r.driverSec, 12.0, 'smooth resumes live');
  assert.strictEqual(r.boilStep, 26, 'boil still held');

  // tier → 0: live again, holds released
  r = holdKinemeTimes(r.held, 0, 12.5, 100);
  assert.deepStrictEqual([r.driverSec, r.boilStep], [12.5, 100]);
  assert.deepStrictEqual(r.held, { driverSec: null, boilStep: null });
}

console.log('kineme.selfcheck: OK (shed hold)');

// ── slice 5: still/print path ────────────────────────────────────────────
import { kinemeStillStep } from './kineme.js';

{
  const st = kinemeStillStep(1234);
  assert.strictEqual(st, kinemeStillStep(1234), 'same seed → same boil frame');
  assert.ok(Number.isInteger(st) && st >= 0, 'a valid frame');
  assert.notStrictEqual(st, kinemeStillStep(1235), 'reseed → new drawing');
}

// The baker's contract: same seed + same amounts → same items, through the
// SAME evaluator the live canvas uses. Different seed → different pose.
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
    kinemeBreath: 0.6, kinemeDrift: 0.4, kinemePulse: 0.5, kinemeBoilFps: 8,
  };
  const base = {
    layoutParams, activeAssets: assets, palette,
    caps: { maxCount: 420, maxCountMirrored: 360, maxParticles: 200, allowMirror: true },
    canvasW: 1000, canvasH: 700,
  };
  const stillKineme = (seed) => buildKinemeCtx({
    layoutParams,
    driverSec: kinemeStillSec(seed, clampBoilFps(layoutParams.kinemeBoilFps)),
    boilStep: kinemeStillStep(seed),
    seed, canvasW: 1000, canvasH: 700, shedTier: 0,
  });
  const itemsFor = (seed) => buildPlacements({ ...base, seed, kineme: stillKineme(seed) }).items;
  const a = itemsFor(777);
  const b = itemsFor(777);
  assert.strictEqual(a.length, b.length);
  for (let i = 0; i < a.length; i++) {
    assert.strictEqual(a[i].x, b[i].x, 'reprint same seed → identical still');
    assert.strictEqual(a[i].scale, b[i].scale, 'reprint same seed → identical still');
  }
  const c = itemsFor(778);
  let moved = 0;
  for (let i = 0; i < a.length; i++) {
    if (c[i].x !== a[i].x || c[i].scale !== a[i].scale) moved++;
  }
  assert.ok(moved > 0, 'reseed → a new moment, not the same frame');
}

console.log('kineme.selfcheck: OK (still path)');
