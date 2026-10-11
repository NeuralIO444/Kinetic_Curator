// node src/gl/performanceCapture.selfcheck.mjs
// #1353 step 4 — the on-demand take: off until started, captures the live frames, stops clean, and what it hands
// back is a performance that replays.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLiveResolver } from './liveResolve.mjs';
import { withResolveTap, tapResolveInput } from './resolveTap.mjs';
import { startPerformance, stopPerformance, isRecordingPerformance, performanceFrames } from './performanceCapture.mjs';
import { unpackPerformance, verifyPerformance } from './performanceFile.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';

const stable = {
  canvasW: 1000, canvasH: 700, layers: [{ id: 'a', name: 'a', visible: true, layerBlendMode: 'normal', layerOpacity: 1 }],
  activeLayerId: 'a', layerSnapshots: {}, seedOffsets: null, paletteId: 'bone', paletteOverrides: null, userPalettes: [],
  layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'swarm', count: 60, particleCount: 60 }, caGrid: null, enabledAssets: null,
  assetWeightOverrides: {}, customAssets: [], quality: 'balanced', lockedParams: {}, batchPaused: false, focusSwap: false,
  perfClampOverride: null, perfTier1: false, assetThin: false, slowRender: false, scaleMul: 1, alphaBoost: 0,
  effectiveAlpha: [20, 100], phraseWrapGen: 0, attractor: null,
};
const resolver = withResolveTap(createLiveResolver); // the instrument's one resolver, as liveLoop builds it
let t = 0;
let frame = 0;
const play = (n, seed = 0xbeef) => {
  for (let i = 0; i < n; i++) {
    t += 16.7;
    frame += 1;
    resolver.resolveLayers({ ...stable, seed, effectiveScale: [0.5, 1.5 + 0.2 * Math.sin(frame / 9)], loopTimeMs: t, dtSec: 0.0167 });
  }
};

// 1. off by default: playing without a take records nothing and costs no listener
{
  assert.equal(isRecordingPerformance(), false);
  assert.equal(performanceFrames(), 0);
  play(30);
  assert.equal(performanceFrames(), 0);
  assert.equal(await stopPerformance(), null, 'stopping with no take is a no-op');
}

// 2. a take STARTED MID-SESSION replays, because `rec` restarts the scene (Matt's decision, 2026-10-11)
{
  assert.equal(startPerformance(), true);
  assert.equal(startPerformance(), false, 'one take at a time');
  assert.equal(isRecordingPerformance(), true);
  play(200);
  assert.equal(performanceFrames(), 200);
  const take = await stopPerformance();
  assert.equal(isRecordingPerformance(), false);
  assert.ok(take && take.bytes instanceof Uint8Array);
  assert.equal(take.perf.frames, 181, 'the take ends on its last checkpoint');
  assert.equal(take.filename, 'kc-performance-beef-181f.kcperf', 'named by seed and frames, never a time');
  // 30 frames of swarm motion happened before `rec`. The take still replays from a fresh resolver, because starting
  // it restarted the scene: the first recorded frame was a fresh resolver's first frame.
  const v = verifyPerformance(await unpackPerformance(take.bytes));
  assert.deepEqual(v, { ok: true, frames: 181, checked: 4, firstMismatchFrame: null, kernelMismatch: false },
    'a mid-session take replays to every checkpoint');
}

// 3. and the restart is what makes that true: the same take WITHOUT it does not replay
{
  const { setResolveTap, setResolveOutputTap } = await import('./resolveTap.mjs');
  const { createPerformanceRecorder } = await import('./performanceFile.mjs');
  play(30); // the scene is in motion again
  const rec = createPerformanceRecorder();
  setResolveTap((i) => rec.onInput(i)); // record with NO restart
  setResolveOutputTap((o) => rec.onOutput(o));
  play(200);
  setResolveTap(null);
  setResolveOutputTap(null);
  assert.equal(verifyPerformance(rec.finish()).ok, false, 'without the restart, state from before the take makes the replay diverge');
  // a second real take is independent of everything before it
  assert.equal(startPerformance(), true);
  play(130, 0x51);
  const take = await stopPerformance();
  assert.equal(take.filename, 'kc-performance-51-121f.kcperf');
  assert.equal(verifyPerformance(await unpackPerformance(take.bytes)).ok, true);
}

// 4. stop releases the taps; an empty take is not a performance
{
  let seen = 0;
  assert.equal(startPerformance(), true);
  assert.equal(await stopPerformance(), null, 'no frame resolved: nothing to export');
  // after stop, the taps are free (a listener we set is not clobbered and nothing else is listening)
  const { setResolveTap } = await import('./resolveTap.mjs');
  assert.equal(setResolveTap((i) => { seen += i ? 1 : 0; }), null, 'the tap was released');
  tapResolveInput({});
  assert.equal(seen, 1);
  setResolveTap(null);
}

// 5. the footer wiring: the button is mounted and the old session log is gone
{
  const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
  assert.match(app, /<PerformanceButton \/>/);
  assert.ok(!/sessionLog/.test(app), 'the stopgap session log is retired');
}

resolver.dispose();
console.log('performanceCapture.selfcheck: ok (#1353 step 4)');
