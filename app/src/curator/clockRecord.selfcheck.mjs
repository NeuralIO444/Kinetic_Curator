// #1461 step 1 — a take carries its BPM sequence; bars are rebuilt from it and the loop times, and match the live clock.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLiveResolver } from '../gl/liveResolve.mjs';
import { withResolveTap, setResolveTap, setResolveOutputTap } from '../gl/resolveTap.mjs';
import { createPerformanceRecorder, packPerformance, unpackPerformance, verifyPerformance } from '../gl/performanceFile.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';
import { createMusicalClock } from '../gl/musicalClock.mjs';
import { createClockRecorder, checkClockRecord, loopTimesOf, rebuildBars, frameForBar, barAtFrame, scrubTarget } from './clockRecord.js';

let n = 0;
const ok = async (name, fn) => { await fn(); n++; console.log(`  [ok] ${name}`); };

const FRAMES = 240; // 4 s of loop time at 60 fps
const L = (id) => ({ id, name: id, visible: true, layerBlendMode: 'normal', layerOpacity: 1 });
const stable = {
  canvasW: 640, canvasH: 480, layers: [L('a')], activeLayerId: 'a', layerSnapshots: {}, seedOffsets: null, paletteId: 'bone',
  paletteOverrides: null, userPalettes: [], caGrid: null, enabledAssets: null, assetWeightOverrides: {}, customAssets: [],
  lockedParams: {}, batchPaused: false, focusSwap: false, perfClampOverride: null, scaleMul: 1, alphaBoost: 0, phraseWrapGen: 0,
  reducedMotion: false, quality: 'balanced', perfTier1: false, assetThin: false, slowRender: false,
  effectiveScale: [0.5, 1.5], effectiveAlpha: [20, 100], assetAttach: {}, attractor: null, dishPins: [],
  layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'random', count: 40 },
};

/** A live session: the real clock runs beside the resolver and the BPM changes at frames 90 and 170. */
async function record() {
  const rec = createPerformanceRecorder();
  const resolver = withResolveTap(createLiveResolver);
  setResolveTap((i) => rec.onInput(i));
  setResolveOutputTap((o) => rec.onOutput(o));
  let frame = 0;
  const clockRec = createClockRecorder({ initialBpm: 120, getFrame: () => frame });
  const live = createMusicalClock();
  const liveBars = [];
  let bpm = 120;
  let t = 0;
  for (frame = 0; frame < FRAMES; frame++) {
    t += 1000 / 60;
    if (frame === 90) { bpm = 150; clockRec.set(bpm); }
    if (frame === 170) { bpm = 100; clockRec.set(bpm); }
    resolver.resolveLayers({ ...stable, seed: 99, loopTimeMs: t, dtSec: 1 / 60 });
    for (const tick of live.advance(t, bpm).ticks) if (tick.type === 'bar') liveBars.push({ bar: tick.bar, frame });
  }
  setResolveTap(null); setResolveOutputTap(null);
  resolver.dispose();
  const perf = { ...rec.finish(), clock: clockRec.finish() };
  return { perf, liveBars };
}

const { perf, liveBars } = await record();

await ok('the recorder keeps the start and each change by frame, and ignores a repeat', () => {
  assert.deepEqual(perf.clock, { version: 1, beatsPerBar: 4, initial: 120, changes: [[90, 150], [170, 100]] });
  const r = createClockRecorder({ initialBpm: 100 });
  r.set(100); r.set(NaN); r.set(100);
  assert.deepEqual(r.finish().changes, []);
});

await ok('the bars rebuilt from the record and the take\'s loop times are exactly the bars the live clock made', () => {
  const times = loopTimesOf(perf);
  assert.equal(times.length, perf.frames, 'one loop time per kept frame (a take ends on its last checkpoint)');
  assert.ok(perf.frames > 170 && perf.frames <= FRAMES, 'and it holds both tempo changes');
  const { downbeats } = rebuildBars(perf.clock, times);
  const kept = liveBars.filter((b) => b.frame < perf.frames);
  assert.deepEqual(downbeats.filter((d) => d.bar > 0), kept, 'same bars on the same frames, tempo changes included');
  assert.ok(kept.length >= 1, 'the take crossed at least one downbeat');
});

await ok('bar lookups: a bar maps to its downbeat frame, a frame to its bar, and past the end is null', () => {
  const { downbeats } = rebuildBars(perf.clock, loopTimesOf(perf));
  assert.equal(frameForBar(downbeats, 0), 0);
  const d = downbeats.find((x) => x.bar > 0);
  assert.equal(frameForBar(downbeats, d.bar), d.frame);
  assert.equal(barAtFrame(downbeats, d.frame), d.bar);
  assert.equal(barAtFrame(downbeats, d.frame - 1), d.bar - 1);
  assert.equal(frameForBar(downbeats, 9999), null);
});

await ok('a scrub starts from the latest checkpoint at or before the bar (replay is exact from a checkpoint chain)', () => {
  const { downbeats } = rebuildBars(perf.clock, loopTimesOf(perf));
  const d = downbeats.filter((x) => x.bar > 0).pop();
  const s = scrubTarget(perf, downbeats, d.bar);
  assert.equal(s.frame, d.frame);
  assert.ok(s.checkpointFrame <= s.frame);
  assert.ok(perf.checkpoints.every((c) => !(c.frame > s.checkpointFrame && c.frame <= s.frame)), 'no later checkpoint before the bar');
  assert.equal(scrubTarget(perf, downbeats, 9999), null);
});

await ok('the section survives the file, the take still verifies, and a bad record is refused', async () => {
  const bytes = await packPerformance(perf);
  const back = await unpackPerformance(bytes);
  assert.deepEqual(back.clock, perf.clock);
  assert.equal(verifyPerformance(back).ok, true, 'an extra section never breaks the replay proof');
  assert.equal(checkClockRecord(null), null);
  assert.equal(checkClockRecord({ ...perf.clock, version: 2 }), null);
  assert.equal(checkClockRecord({ ...perf.clock, changes: [[5, 120], [3, 100]] }), null, 'changes must be in frame order');
  assert.equal(checkClockRecord({ ...perf.clock, initial: 5000 }), null);
  assert.deepEqual(rebuildBars({ nope: 1 }, [0, 16]).downbeats, [], 'a take without a clock section has no bars');
});

await ok('wired: REC records it beside stress, formation and davis; the module is pure', () => {
  const btn = readFileSync(new URL('../components/PerformanceButton.jsx', import.meta.url), 'utf8');
  assert.match(btn, /sections: \{ stress: stressSection, formation: formationSection, davis: davisSection, clock: clockSection[ ,]/);
  assert.match(btn, /createClockRecorder\(\{ initialBpm: useStore\.getState\(\)\.beatBpm, getFrame \}\)/);
  const src = readFileSync(new URL('./clockRecord.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  assert.ok(!/Date\.now|performance\.now|Math\.random|setTimeout|setInterval/.test(src));
});

console.log(`clockRecord.selfcheck: ${n} checks passed`);
