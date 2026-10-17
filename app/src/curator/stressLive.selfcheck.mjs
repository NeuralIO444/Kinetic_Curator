// node src/curator/stressLive.selfcheck.mjs
// #1354 — the live stress tracker: honest counts in, a band out, and nothing that reads a clock.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initStress, getStressState, NEUTRAL_STRESS, ACTIVITY_WINDOW_FRAMES } from './stressLive.js';
import { BAND_RELAX, BAND_NORMAL, tastePressure } from './stress.js';
import { createLoisActivity } from './loisActivity.js';

function rig() {
  let cb = null;
  const counts = { activityCount: 0, passRun: 0 };
  let running = true;
  const stop = initStress({
    getCounts: () => counts,
    isRunning: () => running,
    raf: (f) => { cb = f; return 1; },
    caf: () => { cb = null; },
  });
  return { counts, frame: (n = 1) => { for (let i = 0; i < n; i++) cb(); }, setRunning: (v) => { running = v; }, stop };
}

// 1. neutral before the first frame; a quiet room is RELAX; stop puts it back
{
  assert.deepEqual(getStressState(), NEUTRAL_STRESS);
  const r = rig();
  assert.equal(getStressState().band, null, 'no band before a frame is presented');
  r.frame();
  const s = getStressState();
  assert.equal(s.band, BAND_RELAX, 'no actions, no rolls: relaxed');
  assert.equal(s.dish, 0, 'no dish reader given: 0, said, not faked');
  assert.equal(s.frames, 1);
  r.stop();
  assert.deepEqual(getStressState(), NEUTRAL_STRESS);
}

// 2. activity is ACTIONS inside a frame window: it rises with input and falls back when the hands stop
{
  const r = rig();
  r.frame(); // the first frame only sets the baseline (a count that was already 500 at start is not 500 actions)
  for (let f = 0; f < 60; f++) { r.counts.activityCount += 1; r.frame(); }
  const busy = getStressState().activity;
  assert.equal(busy, 1, 'an action a frame saturates the signal');
  r.frame(ACTIVITY_WINDOW_FRAMES);
  assert.equal(getStressState().activity, 0, 'the window empties after it passes with no input');
  r.stop();
  // a count that starts high is a baseline, not a burst
  const r2 = rig();
  r2.counts.activityCount = 9000;
  r2.frame(3);
  assert.equal(getStressState().activity, 0);
  r2.stop();
}

// 3. taste pressure is rolls since the last keep; a keep resets it
{
  const r = rig();
  r.counts.passRun = 12;
  r.frame();
  assert.equal(getStressState().taste, tastePressure(12));
  r.counts.passRun = 0; // a keep landed
  r.frame();
  assert.equal(getStressState().taste, 0);
  r.stop();
}

// 4. sustained pressure moves the band (and it is deterministic)
{
  const run = () => {
    const r = rig();
    const bands = [];
    r.frame();
    for (let f = 0; f < 400; f++) {
      r.counts.activityCount += 1;
      r.counts.passRun = 40;
      r.frame();
      const b = getStressState().band;
      if (bands[bands.length - 1] !== b) bands.push(b);
    }
    const end = getStressState();
    r.stop();
    return { bands, end };
  };
  const a = run();
  assert.deepEqual(a.bands, [BAND_RELAX, BAND_NORMAL], 'activity + taste at full is 0.62: NORMAL, not TIGHTEN, while dish is 0');
  assert.ok(Math.abs(a.end.smoothed - 0.62) < 0.01, `settles at 0.38 + 0.24 (got ${a.end.smoothed})`);
  assert.deepEqual(run().bands, a.bands, 'same counts, same bands');
}

// 5. paused: no frames are presented, so nothing advances
{
  const r = rig();
  r.frame(5);
  const before = getStressState();
  r.setRunning(false);
  r.counts.activityCount += 50;
  r.frame(30);
  assert.deepEqual(getStressState(), before, 'a paused instrument does not accumulate stress');
  r.stop();
}

// 6. a feed that throws never breaks the loop
{
  let cb = null;
  const stop = initStress({ getCounts: () => { throw new Error('boom'); }, isRunning: () => true, raf: (f) => { cb = f; return 1; }, caf: () => {} });
  assert.doesNotThrow(() => { cb(); cb(); });
  assert.equal(getStressState().band, null, 'no reading is no band');
  stop();
}

// 7. #1635 session telemetry: frames per band and crossings, counted from the tracker's own band as the
//    session runs — and gone when the session stops (the state IS the neutral shape again)
{
  const r = rig();
  r.frame();
  r.frame(30); // a quiet room: RELAX
  assert.equal(getStressState().band, BAND_RELAX);
  for (let f = 0; f < 200; f++) { r.counts.activityCount += 1; r.counts.passRun = 40; r.frame(); } // busy: NORMAL
  assert.equal(getStressState().band, BAND_NORMAL);
  r.counts.passRun = 0; // a keep lands, the hands stop: the room settles back
  r.frame(300);
  const s = getStressState();
  assert.equal(s.band, BAND_RELAX);
  assert.equal(s.crossings, 2, 'RELAX -> NORMAL -> RELAX is two crossings, counted once each');
  assert.equal(s.occupancy.relax + s.occupancy.normal + s.occupancy.tighten, s.frames,
    'every presented frame is accounted to exactly one band');
  assert.ok(s.occupancy.normal > 0 && s.occupancy.relax > 0 && s.occupancy.tighten === 0,
    `the session's time per band is readable (R ${s.occupancy.relax} / N ${s.occupancy.normal} / T ${s.occupancy.tighten})`);
  r.stop();
  assert.deepEqual(getStressState(), NEUTRAL_STRESS, 'stopped: counters zero with the rest of the state');
}

// 8. the real feed exposes the two counts, from real actions, and no clock is read anywhere here
{
  const feed = createLoisActivity({ now: () => 1000 });
  assert.deepEqual(feed.pressureCounts(), { activityCount: 0, passRun: 0 });
  feed.beat();
  feed.beat();
  assert.equal(feed.pressureCounts().activityCount, 2, 'every real action is counted');
  const src = readFileSync(new URL('./stressLive.js', import.meta.url), 'utf8');
  assert.ok(!/Date\.now|performance\.now|setTimeout|setInterval|new Date|Math\.random/.test(src), 'no clock, no randomness');
  const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
  assert.match(app, /\{DEBUG_STRESS && <StressReadout \/>\}/, 'the readout mounts only behind ?debug=stress');
  assert.match(app, /getCounts: loisActivity\.pressureCounts/);
}

console.log('stressLive.selfcheck: ok (#1354)');
