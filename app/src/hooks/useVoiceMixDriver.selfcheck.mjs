// node src/hooks/useVoiceMixDriver.selfcheck.mjs
//
// #1935 — bounded crawl. While the engine DRAGS (presented frames arrive
// slower than real time), a MIX dissolve keeps blending on simulation
// time but must LAND by a wall-clock ceiling of 1.5× its authored
// duration. The ceiling reads presented time (loopClock.presentedMs —
// liveLoop's accumulation of real frame deltas), never a wall-clock API
// in the driver (the #806 must-loop ban stands).
//
// The hook itself is React/rAF; this suite pins the law three ways:
//   1. the pure predicate (mixCeilingHit) at its exact boundary;
//   2. a frame-by-frame drive of the REAL store + REAL predicate through
//      the hook's decision order (healthy / crawl / held), asserting the
//      landing step, the landing cause, and the committed end state;
//   3. source pins binding the hook and liveLoop to the shapes the drive
//      replicates, so the simulation cannot drift from the shipped code.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { useStore } from '../state/store.js';
import { loopClock } from '../gl/loopClock.js';
import { mixCeilingHit, MIX_WALL_CEILING_FACTOR } from './useVoiceMixDriver.js';

const S = () => useStore.getState();
const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

// ── 1. The constant and the predicate boundary ──────────────────────────
assert.strictEqual(MIX_WALL_CEILING_FACTOR, 1.5, 'the ruled ceiling factor is 1.5');

const mixAt = (presentedAt, durationMs = 2000) => ({ presentedAt, durationMs });
assert.strictEqual(mixCeilingHit(mixAt(1000), 1000 + 2999), false, 'one ms under the ceiling: no hit');
assert.strictEqual(mixCeilingHit(mixAt(1000), 1000 + 3000), true, 'exactly at the ceiling: hit');
assert.strictEqual(mixCeilingHit(mixAt(1000), 1000 + 3001), true, 'past the ceiling: hit');
assert.strictEqual(mixCeilingHit(mixAt(1000, 4000), 1000 + 5999), false, 'a 4 s blend gets a 6 s ceiling');
assert.strictEqual(mixCeilingHit(mixAt(1000, 4000), 1000 + 6000), true);
assert.strictEqual(mixCeilingHit(null, 99999), false, 'no mix: no hit');
assert.strictEqual(mixCeilingHit({ durationMs: 2000 }, 99999), false, 'unstamped mix: no hit');
assert.strictEqual(mixCeilingHit(mixAt(1000), NaN), false, 'unobserved presented clock: no hit');
assert.strictEqual(mixCeilingHit(mixAt(5000), 4000), false, 'presented clock behind the stamp (rollback): no hit');

// ── 2. The drive: the hook's decision order against the real store ──────
//
// Mirrors useVoiceMixDriver's tick for an auto mix, in its exact order,
// calling the real store actions and the real predicate. Section 3 pins
// the hook's source to this order.
function driverStep() {
  const s = S();
  const mix = s.voiceMix;
  if (!mix || !mix.auto) return 'idle';
  if (!s.running && mix.t <= 0) return 'held-branch'; // #806 never-started cut lives here
  const nowMs = loopClock.ms > 0 ? loopClock.ms : mix.startedAt;
  const t = Math.min(1, Math.max(0, nowMs - mix.startedAt) / mix.durationMs);
  if (t >= 1) {
    s.commitVoiceMix();
    return 'commit-complete';
  }
  if (s.running && mixCeilingHit(mix, loopClock.presentedMs)) {
    s.commitVoiceMix();
    return 'commit-ceiling';
  }
  s.advanceVoiceMix(t);
  return 'advance';
}

function present(frames, wallDtMs, simCreditMs) {
  const outcomes = [];
  for (let i = 0; i < frames; i++) {
    loopClock.ms += simCreditMs;
    loopClock.presentedMs += wallDtMs;
    outcomes.push(driverStep());
  }
  return outcomes;
}

function openLayoutMix() {
  useStore.setState({ voiceMix: null, activeVoiceId: null, running: true });
  loopClock.ms = 100000;
  loopClock.presentedMs = 500000;
  const target = S().layoutParams.mode === 'grid' ? 'rails' : 'grid';
  S().loadStubMode(target);
  const mix = S().voiceMix;
  assert.ok(mix, 'layout mix opens');
  return { mix, target };
}

// ── stamps: both clocks are stamped at open ──
{
  const { mix } = openLayoutMix();
  assert.strictEqual(mix.durationMs, 2000, 'layout blend is the authored 2 s');
  assert.strictEqual(mix.startedAt, 100000, 'sim stamp from loopClock.ms');
  assert.strictEqual(mix.presentedAt, 500000, 'presented stamp from loopClock.presentedMs (#1935)');
}

// ── healthy engine: sim keeps wall speed, ceiling never fires ──
// 20 fps presented: 50 ms wall per frame, 50 ms sim credit per frame —
// the issue's own arithmetic for the boundary of DRAGGING.
{
  const { target } = openLayoutMix();
  const outcomes = [];
  const tByFrame = {};
  for (let f = 1; f <= 40; f++) {
    loopClock.ms += 50;
    loopClock.presentedMs += 50;
    assert.strictEqual(
      mixCeilingHit(S().voiceMix, loopClock.presentedMs),
      false,
      `healthy frame ${f}: ceiling must not fire`,
    );
    outcomes.push(driverStep());
    if (S().voiceMix) tByFrame[f] = S().voiceMix.t;
  }
  assert.deepStrictEqual(outcomes.slice(0, 39), Array(39).fill('advance'), '39 advances, no early landing');
  assert.strictEqual(outcomes[39], 'commit-complete', 'lands by completion at the authored duration');
  // The blend position is the pre-fix sim-time formula, unaltered.
  assert.strictEqual(tByFrame[10], 0.25);
  assert.strictEqual(tByFrame[20], 0.5);
  assert.strictEqual(tByFrame[39], 0.975);
  assert.strictEqual(S().voiceMix, null, 'mix settled');
  assert.strictEqual(S().layoutParams.mode, target, 'the target state landed');
}

// ── DRAGGING engine: 5 fps presented, sim at quarter speed ──
// 200 ms wall per frame, 50 ms sim credit. Sim-only landing would take
// 8000 ms of presented time; the ceiling (1.5 × 2000 = 3000) must land
// the dissolve at frame 15, through the same commit as t=1.
{
  const { target } = openLayoutMix();
  const outcomes = present(14, 200, 50);
  assert.deepStrictEqual(outcomes, Array(14).fill('advance'), 'no landing before the ceiling');
  assert.ok(S().voiceMix, 'mix still in flight at 2800 ms presented');
  assert.ok(Math.abs(S().voiceMix.t - 0.35) < 1e-9, 'blend still early (t=0.35) when the ceiling nears');
  const landing = present(1, 200, 50);
  assert.strictEqual(landing[0], 'commit-ceiling', 'frame 15: presented age 3000 = the ceiling — lands');
  assert.strictEqual(S().voiceMix, null, 'mix settled by the ceiling landing');
  assert.strictEqual(S().layoutParams.mode, target, 'the ceiling landing applies the full target state');
}

// ── HELD engine: a started dissolve holds; the ceiling cannot land it ──
{
  openLayoutMix();
  present(10, 50, 50); // t = 0.25, in flight
  assert.ok(Math.abs(S().voiceMix.t - 0.25) < 1e-9);
  useStore.setState({ running: false });
  const heldT = S().voiceMix.t;
  // Presented clock frozen (tick does not run while HELD): many driver
  // observations across a long hold change nothing.
  for (let i = 0; i < 200; i++) assert.strictEqual(driverStep(), 'advance');
  assert.strictEqual(S().voiceMix.t, heldT, 'freeze-holds-dissolve: position unchanged across the hold');
  // Defence in depth: even if presentedMs were ahead, the running gate
  // keeps the ceiling from landing a held dissolve.
  loopClock.presentedMs += 60000;
  assert.strictEqual(driverStep(), 'advance', 'ceiling branch is unreachable while HELD');
  assert.ok(S().voiceMix, 'held dissolve still holds');
  // On resume the presented age is real presented time, so it lands.
  useStore.setState({ running: true });
  assert.strictEqual(driverStep(), 'commit-ceiling');
  assert.strictEqual(S().voiceMix, null);
}

// ── resume re-anchors the presented stamp in lockstep with the sim stamp ──
{
  useStore.setState({ voiceMix: null, activeVoiceId: null, running: true });
  loopClock.ms = 200000;
  loopClock.presentedMs = 700000;
  S().loadVoice('swarm');
  const opened = S().voiceMix;
  assert.ok(opened, 'voice mix opens');
  assert.strictEqual(opened.presentedAt, 700000);
  S().setVoiceMixT(0.5);
  loopClock.ms = 210000;
  loopClock.presentedMs = 720000;
  S().resumeVoiceMix();
  const resumed = S().voiceMix;
  assert.strictEqual(resumed.startedAt, 210000 - 0.5 * resumed.durationMs, 'sim stamp re-anchored');
  assert.strictEqual(resumed.presentedAt, 720000 - 0.5 * resumed.durationMs, 'presented stamp re-anchored (#1935)');
}

// ── 3. Source pins: the shipped code keeps the shapes driven above ──────
const driver = read('./useVoiceMixDriver.js');
assert.match(driver, /MIX_WALL_CEILING_FACTOR = 1\.5/, 'the ceiling factor ships as the named constant');
assert.match(driver, /mixCeilingHit\(mix, loopClock\.presentedMs\)/, 'the hook tests the ceiling on presented time');
assert.match(driver, /s\.running && mixCeilingHit/, 'the ceiling branch is gated on running');
assert.match(
  driver,
  /Math\.max\(0, nowMs - mix\.startedAt\) \/ mix\.durationMs/,
  'the blend position is still the sim-time formula',
);
assert.match(driver, /HELD_CUT_TICKS = 20/, 'the #806 never-started held cut still stands');
assert.ok(!/Date\.now\(\)|performance\.now\(\)/.test(driver), 'the driver reads no wall-clock API (#806 ban)');

const liveLoop = read('../gl/liveLoop.mjs');
assert.match(liveLoop, /PRESENTED_FRAME_MAX_MS = 250/, 'the presented credit cap ships as a named constant');
assert.match(liveLoop, /presentedMs \+= presentedDtMs/, 'presented time accumulates beside loopTimeMs');
assert.strictEqual(
  (liveLoop.match(/presentedMs -= presentedDtMs/g) || []).length,
  3,
  'all three reject paths roll presented time back',
);
assert.match(liveLoop, /getPresentedMs: \(\) => presentedMs/, 'liveLoop exposes the presented clock');

const loopClockSrc = read('../gl/loopClock.js');
assert.match(loopClockSrc, /presentedMs: 0/, 'loopClock mirrors presentedMs');

console.log('useVoiceMixDriver.selfcheck: bounded crawl pinned (healthy / crawl / held)');
