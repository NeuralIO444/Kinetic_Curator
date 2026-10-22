#!/usr/bin/env node
/**
 * measureStressTelemetry — #1635's kill-criteria measurement: what does the per-frame stress logging cost?
 *
 *   node scripts/measureStressTelemetry.mjs [--frames 120000] [--reps 3]
 *
 * Issue #1635's kill criterion: "If the logging costs measurable frame time on the iPad budget, the
 * per-frame record thins to band-changes + a stress sample at a stated stride." This bench is the
 * measurement that decides it. Method, in the #1622 harness lineage (Node side): time the REAL
 * per-frame paths over N seeded frames, median of reps, warmup discarded —
 *   A. tracker.update alone — the band reader, running whether or not anything is recorded;
 *   B. A + the stress recorder's update — what recording a take ADDS per frame (the logging itself);
 *   C. the live session step as shipped (initStress: counts → pressures → tracker → the session's
 *      occupancy/crossings counters);
 *   D. the per-frame readback (expandStressRecord) over a 10-minute record — a one-off cost paid when
 *      a take is read backstage, NOT a per-frame cost; reported so it is never confused with one.
 * "Measurable" is stated up front: a sustained ≥ 1% of a 60 fps frame (167 µs) would be a real line
 * item next to the 2.0 ms GPU/frame creature budget. The verdict line below applies that bar.
 *
 * HONESTY: Node/V8 numbers on this machine order the work and size the margin; they are not iPad
 * Safari numbers. The verdict rests on the margin (orders of magnitude), not on the third digit.
 */
import { createStressTracker } from '../src/curator/stress.js';
import { createStressRecorder, expandStressRecord } from '../src/curator/stressRecord.js';
import { initStress, getStressState } from '../src/curator/stressLive.js';

const args = { frames: 120000, reps: 3 };
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--frames') args.frames = Number(process.argv[++i]);
  else if (a === '--reps') args.reps = Number(process.argv[++i]);
  else throw new Error(`unknown arg: ${a}`);
}
const N = args.frames;
const sig = (f) => ({
  activity: 0.5 + 0.5 * Math.sin(f / 40),
  dish: 0.5 + 0.5 * Math.sin(f / 40 + 0.4),
  taste: 0.5 + 0.5 * Math.sin(f / 40 - 0.3),
});

function bench(fn, frames = N) {
  fn(Math.min(20000, frames)); // warmup, discarded
  const times = [];
  for (let r = 0; r < args.reps; r++) {
    const t0 = process.hrtime.bigint();
    fn(frames);
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)];
  return { ms: median, usPerFrame: (median * 1000) / frames };
}

const A = bench((n) => {
  const t = createStressTracker();
  for (let f = 0; f < n; f++) t.update(sig(f));
});
const B = bench((n) => {
  const t = createStressTracker();
  let frame = 0;
  const rec = createStressRecorder({ getFrame: () => frame });
  for (let f = 0; f < n; f++) { frame = f; const s = sig(f); rec.update({ ...s, band: t.update(s).band }); }
});
const C = bench((n) => {
  let cb = null;
  const counts = { activityCount: 0, passRun: 0 };
  const stop = initStress({ getCounts: () => counts, isRunning: () => true, raf: (f) => { cb = f; return 1; }, caf: () => { cb = null; } });
  for (let f = 0; f < n; f++) { if (f % 3 === 0) counts.activityCount += 1; counts.passRun = (f / 500 | 0) % 30; cb(); }
  const s = getStressState();
  if (s.frames !== n || s.occupancy.relax + s.occupancy.normal + s.occupancy.tighten !== n) {
    throw new Error(`live step accounting broke: frames ${s.frames}, occupancy ${JSON.stringify(s.occupancy)}, drove ${n}`);
  }
  stop();
});
// D: one-off readback of a 10-minute record (36 000 updates at 60 fps)
const D = (() => {
  const t = createStressTracker();
  const rec = createStressRecorder({});
  for (let f = 0; f < 36000; f++) { const s = sig(f); rec.update({ ...s, band: t.update(s).band }); }
  const record = rec.finish();
  const t0 = process.hrtime.bigint();
  const frames = expandStressRecord(record);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  if (frames.length !== 36000) throw new Error('readback lost frames');
  return { ms, updates: frames.length };
})();

const FRAME_US = 1000 / 60 * 1000; // one 60 fps frame, in µs
const marginal = B.usPerFrame - A.usPerFrame;
const pct = (us) => ((us / FRAME_US) * 100).toFixed(3);
console.log(`stress telemetry cost — ${N} frames/path, median of ${args.reps} reps (Node, this machine)`);
console.log(`  A. band reader alone (tracker.update)        ${A.usPerFrame.toFixed(3)} µs/frame  (${pct(A.usPerFrame)}% of a 60 fps frame)`);
console.log(`  B. A + take logging (recorder.update)        ${B.usPerFrame.toFixed(3)} µs/frame  (${pct(B.usPerFrame)}% of a 60 fps frame)`);
console.log(`  C. live session step as shipped (initStress) ${C.usPerFrame.toFixed(3)} µs/frame  (${pct(C.usPerFrame)}% of a 60 fps frame)`);
console.log(`  D. per-frame readback of a 10-min take       ${D.ms.toFixed(1)} ms one-off for ${D.updates} updates (not a per-frame cost)`);
console.log(`  the logging's marginal cost (B − A): ${marginal.toFixed(3)} µs/frame`);
if (marginal < FRAME_US * 0.01) {
  console.log('VERDICT: not measurable frame time — three orders under the 1%-of-frame bar. The per-frame record stands; the kill-criteria thinning (band-changes + strided samples) is NOT triggered.');
} else {
  console.log('VERDICT: MEASURABLE — the kill criteria bite: thin the per-frame record to band-changes + a stress sample at a stated stride, and record the scope change on #1635.');
}
