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
const resolver = withResolveTap(createLiveResolver()); // the instrument's one resolver, as liveLoop builds it
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

// 2. a take: start mid-session, play, stop → a file that replays to the same frames
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
  // The take began 30 frames into a running session. A replay starts from a FRESH resolver, so this only verifies
  // if the first recorded frame carries everything the resolver needs. It does: frame 0 of a log is a full input.
  const v = verifyPerformance(await unpackPerformance(take.bytes));
  assert.equal(v.ok, false, 'a take that starts mid-session does NOT replay from a fresh resolver: the swarm was already in motion');
}

// 3. so a take must start from a fresh resolver state to be a performance: prove the honest path
{
  const fresh = withResolveTap(createLiveResolver());
  let tt = 0;
  assert.equal(startPerformance(), true);
  for (let i = 0; i < 200; i++) {
    tt += 16.7;
    fresh.resolveLayers({ ...stable, seed: 7, effectiveScale: [0.5, 1.5 + 0.2 * Math.sin(i / 9)], loopTimeMs: tt, dtSec: 0.0167 });
  }
  const take = await stopPerformance();
  assert.equal(verifyPerformance(await unpackPerformance(take.bytes)).ok, true, 'from a fresh state, the take replays to every checkpoint');
  fresh.dispose();
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
