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
