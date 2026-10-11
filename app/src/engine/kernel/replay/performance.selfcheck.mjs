// node src/engine/kernel/replay/performance.selfcheck.mjs
// #1314 — performance files: record → export → import → replay.
//
// Acceptance (issue #1314):
//   1. a recorded session, exported then imported, replays to the same frame
//      hashes as the "live" run;
//   2. the file is kilobytes for a minutes-long session.
// "Live" here is the replayer driven frame-by-frame with inputs fed through
// the recorder exactly as the instrument would (input, then step, then tick).

import assert from 'node:assert/strict';
import { replay } from './replayer.js';
import {
  createRecorder,
  withCheckpoints,
  exportPerformance,
  importPerformance,
  parsePerformance,
  replayPerformance,
  verifyPerformance,
  PerformanceError,
  CHECKPOINT_EVERY,
} from './performance.js';
import { KERNEL_VERSION } from '../version.js';

const SEED = 0x1314;
// A recipe where every recorded input matters: a moving field, audio drive
// on, and an attractor with real strength (the default recipe has neither
// pointer nor a gradient, which would make a tamper check vacuous).
const RECIPE = {
  sampler: 'grid', count: 64, canvasW: 1000, canvasH: 700,
  field: 'noise', fieldOpts: { freq: 3, octaves: 3 },
  params: { fieldStrength: 1, attractorStrength: 1, damping: 0.5, speed: 1 },
  modules: { audio: true, field: true, attractor: true },
};
const FPS = 60;
const FRAMES = FPS * 150; // 2.5 minutes

// A deterministic "performer": audio envelope breathing, a wandering pointer
// that is held (not re-sent) most frames, an occasional param change.
function perform(rec, frames) {
  for (let f = 0; f < frames; f++) {
    // raw analyser energy (unquantized, noisy) — recorder quantizes + dedupes
    rec.audio(0.5 + 0.5 * Math.sin(f / 90) + 0.004 * Math.sin(f * 7.1));
    if (f % 45 === 0) rec.pointer(100 + (f % 700), 50 + ((f * 3) % 500), 1);
    if (f === 600) rec.params({ damping: 0.9 });
    if (f === 1800) rec.toggle('attractor', false);
    rec.tick();
  }
}

// 1. record → export → import → replay equals the direct replay of the log.
{
  const rec = createRecorder({ seed: SEED, recipe: RECIPE });
  perform(rec, 600);
  const perf = withCheckpoints(rec.finish());
  const text = exportPerformance(perf);
  const { perf: back, kernelMismatch } = importPerformance(text);
  assert.equal(kernelMismatch, false);
  assert.deepEqual(back, parsePerformance(perf), 'import round-trips the file exactly');

  const live = replay(SEED, perf.eventLog, perf.frameCount, { recipe: RECIPE });
  const again = replayPerformance(text);
  assert.deepEqual(again.frameHashes, live.frameHashes, 'imported replay frame hashes match the live run');
  assert.equal(again.frameCount, 600);

  const v = verifyPerformance(text);
  assert.equal(v.ok, true, 'checkpoints verify');
  assert.equal(v.firstMismatchFrame, null);
  assert.equal(v.checked, Math.ceil(600 / CHECKPOINT_EVERY) + (599 % CHECKPOINT_EVERY === 0 ? 0 : 1) - 0);
  console.log('performance.selfcheck: OK (export → import → replay hashes match)');
}

// 2. minutes-long session stays kilobytes.
{
  const rec = createRecorder({ seed: SEED, recipe: RECIPE });
  perform(rec, FRAMES);
  const perf = withCheckpoints(rec.finish());
  const text = exportPerformance(perf);
  assert.ok(text.length < 64 * 1024, `2.5 min session is ${text.length} bytes — want < 64 KiB`);
  const v = verifyPerformance(text);
  assert.equal(v.ok, true, '2.5 min session verifies');
  console.log(`performance.selfcheck: OK (${FRAMES} frames → ${(text.length / 1024).toFixed(1)} KiB)`);
}

// 3. tampering is caught by the checkpoints, with the frame named.
{
  const rec = createRecorder({ seed: SEED, recipe: RECIPE });
  perform(rec, 300);
  const perf = withCheckpoints(rec.finish());
  const forged = JSON.parse(exportPerformance(perf));
  assert.ok(Array.isArray(forged.eventLog.rows), 'exported log is packed rows');
  const row = forged.eventLog.rows.find((r) => r[1] === 3);
  row[2] += 25; // pointer x
  const v = verifyPerformance(forged);
  assert.equal(v.ok, false);
  assert.ok(Number.isInteger(v.firstMismatchFrame), 'first differing checkpoint frame is reported');
  const noCheckpoints = { ...perf, checkpoints: [] };
  assert.equal(verifyPerformance(noCheckpoints).ok, false, 'no checkpoints is not a pass');
  console.log('performance.selfcheck: OK (tampered log named at its first bad checkpoint)');
}

// 4. fail-closed import + honest kernel-version signal.
{
  const rec = createRecorder({ seed: SEED, recipe: RECIPE });
  perform(rec, 30);
  const perf = rec.finish();
  const bad = (mut, re) => assert.throws(() => parsePerformance(mut), (e) => e instanceof PerformanceError && re.test(e.message));
  bad('{nope', /not valid JSON/);
  bad({ ...perf, format: 'other' }, /unknown format/);
  bad({ ...perf, version: 99 }, /unsupported version/);
  bad({ ...perf, frameCount: 0 }, /frameCount/);
  bad({ ...perf, checkpoints: [{ frame: 9999, hash: 'x' }] }, /checkpoints/);
  bad({ ...perf, eventLog: { version: 1, rows: [[0, 99, {}]] } }, /unknown event type index/);
  bad({ ...perf, recipe: { sampler: 'no-such-sampler' } }, /recipe/);
  assert.throws(() => parsePerformance({ ...perf, eventLog: { version: 1, events: [{ frame: 0, type: 'pointer', payload: { x: 1, y: 1, timestamp: 5 } }] } }),
    /wall-clock|timestamp/i, 'wall-clock keys still rejected on import');
  // unknown module names are the replayer's check (not the log's): replay is loud, never silent
  assert.throws(() => replayPerformance({ ...perf, eventLog: { version: 1, rows: [[0, 5, { module: 'nope', enabled: true }]] } }),
    /unknown module/, 'a bad module toggle fails loudly at replay');
  const old = importPerformance({ ...perf, kernelVersion: 'kernel.v0' });
  assert.equal(old.kernelMismatch, true, 'a file from another kernel version is flagged');
  assert.equal(importPerformance(perf).perf.kernelVersion, KERNEL_VERSION);
  assert.throws(() => createRecorder({ seed: NaN }), PerformanceError);
  assert.throws(() => createRecorder({ seed: 1 }).finish(), /nothing recorded/);
  console.log('performance.selfcheck: OK (fail-closed import, kernel mismatch flagged)');
}

// 5. repeats are not logged (size), but replay-exact (pointer/audio persist).
{
  const a = createRecorder({ seed: 5, recipe: RECIPE });
  const b = createRecorder({ seed: 5, recipe: RECIPE });
  for (let f = 0; f < 120; f++) {
    a.audio(0.4); a.pointer(10, 20, 1); a.tick(); // sent every frame
    if (f === 0) { b.audio(0.4); b.pointer(10, 20, 1); } // sent once
    b.tick();
  }
  const pa = a.finish();
  const pb = b.finish();
  assert.equal(pa.eventLog.events.length, 2, 'unchanged audio/pointer collapse to one event each');
  assert.deepEqual(replayPerformance(pa).frameHashes, replayPerformance(pb).frameHashes);
  console.log('performance.selfcheck: OK (dedupe is replay-exact)');
}

// 6. seed/recipe resets: recorder dedupe stays replay-exact across a reset.
{
  const a = createRecorder({ seed: 9, recipe: RECIPE });
  a.audio(0.6); a.pointer(300, 200, 1);
  for (let f = 0; f < 10; f++) a.tick();
  a.seed(77); // replayer zeroes audio + recentres pointer here
  a.audio(0.6); // must be logged again: replayer is back at 0
  a.pointer(300, 200, 1);
  for (let f = 0; f < 10; f++) a.tick();
  const pa = a.finish();
  assert.equal(pa.eventLog.events.filter((e) => e.type === 'audio-envelope').length, 2, 'audio re-logged after a reset');
  const back = importPerformance(exportPerformance(withCheckpoints(pa)));
  assert.deepEqual(replayPerformance(back.perf).frameHashes, replayPerformance(pa).frameHashes);
  assert.equal(a.audio(0.123), 0.12, 'audio() returns the recorded (1/100) value');
  console.log('performance.selfcheck: OK (resets, audio resolution)');
}

console.log('performance.selfcheck: all green (#1314)');
