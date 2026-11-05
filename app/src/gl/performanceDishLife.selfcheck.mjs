// node src/gl/performanceDishLife.selfcheck.mjs
// #1923 — the culture is LOG-ACCOUNTABLE, replayably (the contract's fourth test: seeded, loop-clock, sheddable,
// log-accountable). The loop stamps the quiet culture on every frame's input (`input.dishLife`: the cycle's wake on the
// loop clock, the generation, the strength, the shed), so the take already carries "when it woke and how strongly" like
// any other recorded input. This proves it end to end: a take through several culture cycles
// replays to every checkpoint; the file round-trips; a forged wake or strength is caught (the culture is in the take,
// not recomputed from the clock); and a take that begins MID-bloom verifies from its snapshot.
import assert from 'node:assert/strict';
import { createLiveResolver } from './liveResolve.mjs';
import { createInputLog, replayInputs } from '../engine/kernel/replay/inputLog.js';
import {
  createPerformanceRecorder,
  verifyPerformance,
  packPerformance,
  unpackPerformance,
} from './performanceFile.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';
import { quietStamp, CYCLE_GENS, QUIET_GPS } from '../engine/dishLifeQuiet.mjs';

const L = (id) => ({ id, name: id, visible: true, layerBlendMode: 'normal', layerOpacity: 1 });
const DT = 1000 / 30;
const CYCLE_MS = (CYCLE_GENS / QUIET_GPS) * 1000; // 6 s
const FRAMES = 400; // ~13 s: two full cycles and the start of a third
const AT = 130; // inside the first bloom

const stable = {
  canvasW: 1000,
  canvasH: 700,
  layers: [L('lyr-a')],
  activeLayerId: 'lyr-a',
  layerSnapshots: {},
  seed: 777,
  seedOffsets: null,
  paletteId: 'bone',
  paletteOverrides: null,
  userPalettes: [],
  caGrid: null,
  enabledAssets: null,
  assetWeightOverrides: {},
  customAssets: [],
  lockedParams: {},
  batchPaused: false,
  focusSwap: false,
  perfClampOverride: null,
  scaleMul: 1,
  alphaBoost: 0,
  phraseWrapGen: 0,
  reducedMotion: false,
  quality: 'balanced',
  perfTier1: false,
  assetThin: false,
  slowRender: false,
  effectiveScale: [0.5, 1.5],
  effectiveAlpha: [20, 100],
  assetAttach: {},
  attractor: null,
  layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'random', count: 60, particleCount: 40 },
};

/** The loop's own arithmetic: the stamp is a pure function of the loop clock, the dial and the idle boost. */
const inputAt = (f) => {
  const loopTimeMs = (f + 1) * DT;
  const boost = f > 200 ? 1 : 0; // the room goes idle part-way through
  const stamp = quietStamp(loopTimeMs, { strength: 0.6, boost, shed: f > 300 ? 1 : 0 });
  return { ...stable, loopTimeMs, dtSec: DT / 1000, ...(stamp ? { dishLife: stamp } : {}) };
};

const resolver = createLiveResolver();
const a = createPerformanceRecorder({ checkpointEvery: 10 });
let b = null;
const wakes = new Set();
for (let f = 0; f < FRAMES; f++) {
  const input = inputAt(f);
  if (f === AT) {
    b = createPerformanceRecorder({
      checkpointEvery: 10,
      initialState: { atFrame: AT, chainSeed: a.chainValue(), snapshot: resolver.snapshotState() },
    });
  }
  a.onInput(input);
  if (b) b.onInput(input);
  const out = resolver.resolveLayers(input);
  a.onOutput(out);
  if (b) b.onOutput(out);
  wakes.add(input.dishLife.wakeMs);
}
resolver.dispose();

// 1. the take really contains culture cycles: three wakes on the loop clock
assert.ok(wakes.size >= 3, `the run crossed ${wakes.size} culture cycles`);
assert.ok(
  [...wakes].every((w) => w % CYCLE_MS === 0),
  'every wake is a cycle boundary on the loop clock',
);

// 2. THE EXIT: the file replays to every checkpoint, and round-trips
const perf = a.finish();
{
  const stamped = perf.inputs.steps.filter((s) => s.k && s.k.dishLife);
  assert.ok(stamped.length > 0, 'the stamp is in the take');
  const v = verifyPerformance(perf);
  assert.equal(v.ok, true, JSON.stringify(v));
  const bytes = await packPerformance(perf);
  const back = await unpackPerformance(bytes);
  assert.deepEqual(back, JSON.parse(JSON.stringify(perf)), 'the file round-trips');
  assert.equal(verifyPerformance(back).ok, true, 'and the round-tripped file still replays');
}

// 3. the culture is in the take, not recomputed from the clock: a forged strength (rewritten into the input log from
//    frame 100 on) no longer replays, and the replay names the first frame that differs
{
  const forgedLog = createInputLog();
  let i = 0;
  for (const input of replayInputs(perf.inputs)) {
    forgedLog.record(
      i >= 100 && input.dishLife
        ? { ...input, dishLife: { ...input.dishLife, strength: input.dishLife.strength * 0.5 } }
        : input,
    );
    i += 1;
  }
  const forged = JSON.parse(JSON.stringify(perf));
  forged.inputs = {
    ...forgedLog.finish(),
    frames: perf.inputs.frames,
    steps: forgedLog.finish().steps.slice(0, perf.frames),
  };
  const vf = verifyPerformance(forged);
  assert.equal(vf.ok, false, 'a forged strength no longer replays');
  assert.ok(
    vf.firstMismatchFrame !== null && vf.firstMismatchFrame >= 100,
    `first differing frame ${vf.firstMismatchFrame}`,
  );
}

// 4. a take that begins MID-BLOOM verifies from its snapshot, and its chain continues the live one
{
  const pb = b.finish();
  assert.equal(pb.initialState.atFrame, AT);
  assert.ok(
    pb.initialState.snapshot.dishLife,
    'the snapshot carries the running culture (its seed marks and generation)',
  );
  assert.ok(pb.initialState.snapshot.dishLife.quiet, 'and its quiet dial');
  const vb = verifyPerformance(pb);
  assert.equal(vb.ok, true, JSON.stringify(vb));
  assert.equal(vb.checked, pb.checkpoints.length);
  for (const c of pb.checkpoints) {
    const abs = perf.checkpoints.find((x) => x.frame === AT + c.frame);
    if (abs) assert.equal(c.hash, abs.hash, `mid-take checkpoint ${c.frame} continues the live chain`);
  }
}

console.log(`performanceDishLife.selfcheck: ok (${perf.frames} frames, ${wakes.size} cycles)`);
