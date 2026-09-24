// paletteMix.selfcheck.mjs — VJ MIX crossfade state machine (#278).
//
// Node-only: the machine is pure (no GL), so the whole lifecycle — cut,
// dissolve, arming, retarget, cancel — is unit-tested here.

import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  MIX_MIN, MIX_MAX, MIX_DEFAULT,
  sanitizeMixSeconds, mixEase, morphEase, createPaletteMix,
} from './paletteMix.mjs';

function base(over = {}) {
  return {
    id: 'praystation', overrides: null, userPalettes: null,
    mixSeconds: 2, now: 1000, canDissolve: true, bakeReady: true,
    ...over,
  };
}

// sanitizeMixSeconds
assert.strictEqual(sanitizeMixSeconds(2), 2);
assert.strictEqual(sanitizeMixSeconds(0), 0);
assert.strictEqual(sanitizeMixSeconds(8), 8);
assert.strictEqual(sanitizeMixSeconds(-3), MIX_MIN);
assert.strictEqual(sanitizeMixSeconds(99), MIX_MAX);
assert.strictEqual(sanitizeMixSeconds(2.5), 2.5);
assert.strictEqual(sanitizeMixSeconds(NaN), MIX_DEFAULT);
assert.strictEqual(sanitizeMixSeconds('nope'), MIX_DEFAULT);
assert.strictEqual(sanitizeMixSeconds(undefined), MIX_DEFAULT);

// mixEase — smootherstep: 0→0, 1→1, monotonic, eased midpoint
assert.strictEqual(mixEase(0), 0);
assert.strictEqual(mixEase(1), 1);
assert.strictEqual(mixEase(-5), 0);
assert.strictEqual(mixEase(9), 1);
const mid = mixEase(0.5);
assert.ok(mid > 0 && mid < 1, 'midpoint inside (0,1)');
assert.ok(Math.abs(mid - 0.5) < 1e-9, 'smootherstep is symmetric at 0.5');
let prev = -1;
for (let i = 0; i <= 20; i++) {
  const v = mixEase(i / 20);
  assert.ok(v >= prev, 'monotonic');
  prev = v;
}

// First sighting with no previous frame → hard cut, never a dissolve.
{
  const m = createPaletteMix();
  const ev = m.update(base({ canDissolve: false }));
  assert.strictEqual(ev.kind, 'cut');
  assert.strictEqual(m.isDissolving(), false);
  assert.deepStrictEqual(m.update(base({ now: 2000 })), { kind: 'none' });
}

// MIX = 0 → hard cut even when a previous frame exists.
{
  const m = createPaletteMix();
  m.update(base({ canDissolve: false }));
  const ev = m.update(base({ id: 'v01d', mixSeconds: 0, now: 2000 }));
  assert.strictEqual(ev.kind, 'cut');
  assert.strictEqual(m.isDissolving(), false);
}

// Full dissolve lifecycle: start → mix progresses eased → done.
{
  const m = createPaletteMix();
  m.update(base({ canDissolve: false, now: 0 }));
  const start = m.update(base({ id: 'v01d', now: 1000 }));
  assert.strictEqual(start.kind, 'start');
  assert.strictEqual(start.dur, 2);
  assert.strictEqual(start.retarget, false);
  assert.strictEqual(m.isDissolving(), true);
  let ev = m.update(base({ id: 'v01d', now: 1500 }));
  assert.strictEqual(ev.kind, 'mix');
  assert.strictEqual(ev.t, 0, 'clock starts when the bake lands, not at switch time');
  ev = m.update(base({ id: 'v01d', now: 2000 }));
  assert.strictEqual(ev.kind, 'mix');
  assert.ok(Math.abs(ev.t - mixEase(0.25)) < 1e-9, 't eased from dissolve start');
  ev = m.update(base({ id: 'v01d', now: 3499 }));
  assert.strictEqual(ev.kind, 'mix');
  assert.ok(ev.t < 1 && ev.t > 0.999, 'nearly done but not done');
  ev = m.update(base({ id: 'v01d', now: 3500 }));
  assert.strictEqual(ev.kind, 'done');
  assert.strictEqual(m.isDissolving(), false);
  assert.deepStrictEqual(m.update(base({ id: 'v01d', now: 4000 })), { kind: 'none' });
}

// Arming: the dissolve waits for the incoming palette's atlas bake.
{
  const m = createPaletteMix();
  m.update(base({ canDissolve: false, now: 0 }));
  m.update(base({ id: 'v01d', now: 1000, bakeReady: false }));
  const ev = m.update(base({ id: 'v01d', now: 5000, bakeReady: false }));
  assert.strictEqual(ev.kind, 'arming');
  assert.strictEqual(m.isDissolving(), true);
  // The clock starts when the bake lands, not at switch time.
  const go = m.update(base({ id: 'v01d', now: 9000, bakeReady: true }));
  assert.strictEqual(go.kind, 'mix');
  assert.strictEqual(go.t, 0);
  const done = m.update(base({ id: 'v01d', now: 11000, bakeReady: true }));
  assert.strictEqual(done.kind, 'done');
}

// Rapid successive switch retargets: keeps the ORIGINAL held frame, just
// retargets the incoming palette — converges, never stacks.
{
  const m = createPaletteMix();
  m.update(base({ canDissolve: false, now: 0 }));
  m.update(base({ id: 'v01d', now: 1000 }));
  m.update(base({ id: 'v01d', now: 1500 }));
  const re = m.update(base({ id: 'hydra', now: 1600 }));
  assert.strictEqual(re.kind, 'start');
  assert.strictEqual(re.retarget, true);
  assert.strictEqual(m.isDissolving(), true);
  // Retarget re-arms: the new incoming palette's bake must land first.
  const rearm = m.update(base({ id: 'hydra', now: 3600 }));
  assert.strictEqual(rearm.kind, 'mix');
  assert.strictEqual(rearm.t, 0);
  const done = m.update(base({ id: 'hydra', now: 5600 }));
  assert.strictEqual(done.kind, 'done');
}

// Swatch edits (overrides identity change) trigger a dissolve too — the
// loop's canDissolve already encodes "a snapshottable frame exists".
{
  const m = createPaletteMix();
  const o1 = { swatches: ['#ff0000'] };
  m.update(base({ canDissolve: false, now: 0 }));
  m.update(base({ now: 1000 }));
  const ev = m.update(base({ overrides: o1, now: 2000 }));
  assert.strictEqual(ev.kind, 'start');
  assert.strictEqual(ev.retarget, false);
  assert.strictEqual(m.isDissolving(), true);
}

// cancel() abandons the dissolve: the next update hard-cuts, never
// compositing against a dead hold target (context loss path).
{
  const m = createPaletteMix();
  m.update(base({ canDissolve: false, now: 0 }));
  m.update(base({ id: 'v01d', now: 1000 }));
  m.cancel();
  assert.strictEqual(m.isDissolving(), false);
  const ev = m.update(base({ id: 'hydra', now: 2000 }));
  assert.strictEqual(ev.kind, 'start');
  assert.strictEqual(ev.retarget, false, 'cancel cleared the dissolve, so this is fresh');
}

// Identity compare: same references → no spurious dissolve.
{
  const m = createPaletteMix();
  const o = { swatches: ['#ff0000'] };
  m.update(base({ canDissolve: false, now: 0 }));
  m.update(base({ overrides: o, now: 1000, canDissolve: false }));
  assert.deepStrictEqual(m.update(base({ overrides: o, now: 2000 })), { kind: 'none' });
  assert.strictEqual(m.isDissolving(), false);
}

// Spine E: Mode chip change triggers dissolve wipe.
{
  const m = createPaletteMix();
  m.update(base({ canDissolve: false, now: 0, mode: 'grid' }));
  const ev = m.update(base({ now: 1000, mode: 'swarm' }));
  assert.strictEqual(ev.kind, 'start');
  assert.strictEqual(ev.retarget, false);
  assert.strictEqual(m.isDissolving(), true);
  const mix = m.update(base({ now: 2000, mode: 'swarm' }));
  assert.strictEqual(mix.kind, 'mix');
}

// Spine E: Behave / assets change triggers dissolve wipe.
{
  const m = createPaletteMix();
  m.update(base({ canDissolve: false, now: 0, mode: 'swarm', behave: 'cruise' }));
  const ev = m.update(base({ now: 1000, mode: 'swarm', behave: 'wander' }));
  assert.strictEqual(ev.kind, 'start');
  assert.strictEqual(m.isDissolving(), true);
}

// Spine E: Manual scrubT drives dissolve directly.
{
  const m = createPaletteMix();
  m.update(base({ canDissolve: false, now: 0, mode: 'grid' }));
  m.update(base({ now: 1000, mode: 'swarm', scrubT: 0 }));
  const ev = m.update(base({ now: 1500, mode: 'swarm', scrubT: 0.5 }));
  assert.strictEqual(ev.kind, 'mix');
  assert.ok(Math.abs(ev.t - mixEase(0.5)) < 1e-9);
  const done = m.update(base({ now: 2000, mode: 'swarm', scrubT: 1.0 }));
  assert.strictEqual(done.kind, 'done');
  assert.strictEqual(m.isDissolving(), false);
}

// #453 — one clock: the dissolve must tick on the SAME accumulator the
// item morph reads (input.loopTimeMs, spine-A master clock), not the wall
// clock. Two clocks make their tails land frames apart — the held
// old-frame ghost snaps off while items are still easing in: the
// end-of-morph stutter/pop found in #464's QA. Pins the wiring: red on
// `now: performance.now()`, green on `now: loopTimeMs`.
{
  const src = readFileSync(new URL('./liveLoop.mjs', import.meta.url), 'utf8');
  const at = src.indexOf('paletteMix.update(');
  assert.ok(at >= 0, 'paletteMix.update call found in liveLoop.mjs');
  const call = src.slice(at, src.indexOf('});', at));
  assert.ok(call.includes('now: loopTimeMs'),
    'dissolve ticks on loopTimeMs — the same clock the item morph reads');
  assert.ok(!call.includes('performance.now()'),
    'no wall clock in the dissolve tick (#453: two time domains)');
}

// #465 — morphEase (expoOut): snappy morph arrival. Endpoints EXACT
// (f(1) === 1 matters: the landing frame IS the target, no residue),
// clamped input, monotone inside [0,1] (TRANSITIONS invariant I1), and it
// gets out ahead of smootherstep so the tail never reads stop-then-pop.
assert.strictEqual(typeof morphEase, 'function');
assert.strictEqual(morphEase(0), 0);
assert.strictEqual(morphEase(1), 1, 'exact landing — no 0.999 residue');
assert.strictEqual(morphEase(-5), 0);
assert.strictEqual(morphEase(9), 1);
{
  let prevE = -1;
  for (let i = 0; i <= 40; i++) {
    const v = morphEase(i / 40);
    assert.ok(v >= prevE, 'morphEase monotone');
    assert.ok(v >= 0 && v <= 1, 'morphEase stays in [0,1] (I1 — no overshoot)');
    prevE = v;
  }
}
assert.ok(morphEase(0.5) > mixEase(0.5), 'expoOut arrives ahead of smootherstep mid-flight');
assert.ok(Math.abs(morphEase(0.9) - 1) < 0.003, '99.7%+ arrived by raw=0.9 — sub-percent landing residual');

console.log('[selfcheck] paletteMix OK');
