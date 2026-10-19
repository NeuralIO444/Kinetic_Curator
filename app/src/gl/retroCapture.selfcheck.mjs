// node src/gl/retroCapture.selfcheck.mjs
// #1367 slice 3 — the retroactive capture ring: always-on recording with periodic resolver
// snapshots, a bounded window, and saveLast() emitting a take that begins mid-session and
// verifies (slice 2's initialState section). Plus the performanceCapture wiring: the ring
// starts, a deliberate take pre-empts it and restarts it, a resolver swap clears it.
import assert from 'node:assert/strict';
import { createLiveResolver } from './liveResolve.mjs';
import { createRetroCapture } from './retroCapture.mjs';
import { createPerformanceRecorder, verifyPerformance } from './performanceFile.mjs';
import { withResolveTap, requestResolverReset } from './resolveTap.mjs';
import {
  startRetroCapture, stopRetroCapture, isRetroCapturing, retroCaptureStats, saveRetroPerformance,
  startPerformance, stopPerformance, isRecordingPerformance,
} from './performanceCapture.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';

const DT_MS = [16.7, 16.7, 33.3, 8, 16.7, 50, 16.7, 12.5];
const L = (id, extra = {}) => ({ id, name: id, visible: true, layerBlendMode: 'normal', layerOpacity: 1, ...extra });
const lp = (over = {}) => ({ ...DEFAULT_LAYOUT_PARAMS, count: 48, particleCount: 48, ...over });
const baseInput = (over = {}) => ({
  layers: [L('lyr-a')], activeLayerId: 'lyr-a', layerSnapshots: {}, seed: 1234, seedOffsets: null,
  paletteId: 'bone', paletteOverrides: null, userPalettes: [], layoutParams: lp({ mode: 'random' }), caGrid: null,
  enabledAssets: null, assetWeightOverrides: {}, customAssets: [], quality: 'balanced', lockedParams: {},
  batchPaused: false, focusSwap: false, loopTimeMs: 0, dtSec: 1 / 60, perfClampOverride: null, perfTier1: false,
  assetThin: false, slowRender: false, scaleMul: 1, alphaBoost: 0, effectiveScale: [0.5, 1.5], effectiveAlpha: [20, 100],
  phraseWrapGen: 0, attractor: null, mixSeconds: 0, ...over,
});
const breathe = (f) => ({ effectiveScale: [0.5, 1.5 + 0.2 * Math.sin(f / 9)], effectiveAlpha: [20 + 10 * Math.sin(f / 13), 100] });
const frameInput = (f, t, over = {}) => baseInput({ layoutParams: lp({ mode: f >= 200 ? 'dla' : 'swarm', behave: 'scatter' }), loopTimeMs: t, dtSec: DT_MS[f % 8] / 1000, ...breathe(f), ...over });
const times = (n) => { const out = []; let t = 0; for (let f = 0; f < n; f++) { t += DT_MS[f % 8]; out.push(t); } return out; };

// ── 1. the ring end to end: bounded window, saveLast verifies and continues the live chain ──
{
  const resolver = createLiveResolver();
  let snapCalls = 0;
  const ring = createRetroCapture({
    snapshotProvider: () => { snapCalls += 1; return resolver.snapshotState(); },
    checkpointEvery: 10, snapshotEvery: 50, maxSnapshots: 4,
  });
  const oracle = createPerformanceRecorder({ checkpointEvery: 10 });
  const T = times(400);
  let feedNs = 0n;
  for (let f = 0; f < 400; f++) {
    const input = frameInput(f, T[f]);
    const t0 = process.hrtime.bigint();
    ring.onInput(input);
    feedNs += process.hrtime.bigint() - t0;
    oracle.onInput(input);
    const out = resolver.resolveLayers(input);
    const t1 = process.hrtime.bigint();
    ring.onOutput(out);
    feedNs += process.hrtime.bigint() - t1;
    oracle.onOutput(out);
  }
  const st = ring.stats();
  assert.ok(st.snapshots <= 4, `retention: at most maxSnapshots snapshots (got ${st.snapshots})`);
  assert.ok(st.logFrames <= 5 * 50, `bounded: retained inputs within (maxSnapshots+1) × snapshotEvery (got ${st.logFrames})`);
  assert.ok(st.baseFrame > 0, 'the window slid: early history was cut');
  assert.equal(snapCalls, 8, 'a snapshot was taken at every 50-frame boundary');
  const perfA = oracle.finish();

  const perf = ring.saveLast(120);
  assert.ok(perf, 'saveLast returned a take');
  assert.equal(perf.initialState.atFrame, 250, 'the take begins at the newest retained boundary at or before the target');
  assert.equal(perf.frames, 141, 'the take ends on its last checkpoint');
  const v = verifyPerformance(perf);
  assert.equal(v.ok, true, 'the saved take verifies from its snapshot');
  for (const c of perf.checkpoints) {
    const abs = perfA.checkpoints.find((x) => x.frame === perf.initialState.atFrame + c.frame);
    assert.equal(c.hash, abs.hash, `checkpoint rel ${c.frame} continues the live chain at absolute ${perf.initialState.atFrame + c.frame}`);
  }
  const snapBytes = JSON.stringify(perf.initialState.snapshot).length;
  const feedMs = Number(feedNs) / 400 / 1e6;
  console.log(`  [info] ring feed (onInput+onOutput, snapshots excluded): ${feedMs.toFixed(3)} ms/frame; snapshot ${(snapBytes / 1024).toFixed(0)} KiB JSON; take ${perf.frames} frames from a 400-frame session`);
  assert.ok(feedMs < 2, `the ring's per-frame cost stays a small fraction of a frame (got ${feedMs.toFixed(3)} ms)`);
  resolver.dispose();
}

// ── 2. before the first snapshot, saveLast is a from-launch take ──
{
  const resolver = createLiveResolver();
  const ring = createRetroCapture({ snapshotProvider: () => resolver.snapshotState(), checkpointEvery: 10, snapshotEvery: 50, maxSnapshots: 4 });
  const T = times(30);
  for (let f = 0; f < 30; f++) {
    const input = frameInput(f, T[f]);
    ring.onInput(input);
    ring.onOutput(resolver.resolveLayers(input));
  }
  const perf = ring.saveLast(10);
  assert.ok(perf && !('initialState' in perf), 'no snapshot yet: a from-launch take, no section');
  assert.equal(verifyPerformance(perf).ok, true, 'and it verifies');
  assert.equal(createRetroCapture({ snapshotProvider: () => null, checkpointEvery: 10, snapshotEvery: 50, maxSnapshots: 1 }).saveLast(5), null, 'an empty ring saves nothing');
  assert.throws(() => createRetroCapture({ snapshotProvider: () => null, checkpointEvery: 10, snapshotEvery: 45 }), /multiple/, 'snapshotEvery must land on checkpoints');
  resolver.dispose();
}

// ── 3. the governor shed: perfTier1 pauses snapshots; a long shed clears the window ──
{
  const resolver = createLiveResolver();
  let calls = 0;
  const ring = createRetroCapture({
    snapshotProvider: () => { calls += 1; return resolver.snapshotState(); },
    checkpointEvery: 10, snapshotEvery: 50, maxSnapshots: 10,
  });
  const T = times(400);
  const drive = (from, to, shed) => {
    for (let f = from; f < to; f++) {
      const input = frameInput(f, T[f], shed ? { perfTier1: true } : {});
      ring.onInput(input);
      ring.onOutput(resolver.resolveLayers(input));
    }
  };
  drive(0, 100, false);
  assert.equal(calls, 2, 'boundaries at 49 and 99 snapshotted');
  drive(100, 160, true);
  assert.equal(calls, 2, 'while perfTier1 holds, no new snapshots');
  assert.equal(ring.stats().shed, true, 'the shed reads off the input stream');
  drive(160, 400, true); // a shed far longer than 2 × snapshotEvery
  assert.ok(ring.stats().frames < 240, 'a long shed cleared the window instead of pretending coverage');
  resolver.dispose();
}

// ── 4. a resolver swap (clear) restarts the window on the new resolver ──
{
  const a = createLiveResolver();
  const ring = createRetroCapture({ snapshotProvider: () => live.snapshotState(), checkpointEvery: 10, snapshotEvery: 50, maxSnapshots: 4 });
  let live = a;
  const T = times(260);
  for (let f = 0; f < 120; f++) { const i = frameInput(f, T[f]); ring.onInput(i); ring.onOutput(live.resolveLayers(i)); }
  a.dispose();
  live = createLiveResolver(); // the swap: a fresh resolver, and the coordinator clears the ring
  ring.clear();
  assert.equal(ring.stats().frames, 0, 'cleared: no history crosses the swap');
  for (let f = 120; f < 260; f++) { const i = frameInput(f, T[f]); ring.onInput(i); ring.onOutput(live.resolveLayers(i)); }
  const perf = ring.saveLast(60);
  assert.ok(perf && perf.initialState, 'the new window saves from its own snapshot');
  assert.equal(verifyPerformance(perf).ok, true, 'and the take verifies against the new resolver’s history');
  live.dispose();
}

// ── 5. the coordinator wiring: start, pre-empt, restart, swap-clear, save ──
{
  const wrapped = withResolveTap(createLiveResolver);
  const T = times(400);
  assert.equal(startRetroCapture({ checkpointEvery: 10, snapshotEvery: 50, maxSnapshots: 4 }), true);
  assert.equal(startRetroCapture(), false, 'a second start refuses');
  for (let f = 0; f < 200; f++) wrapped.resolveLayers(frameInput(f, T[f]));
  assert.ok(retroCaptureStats().frames === 200, 'the ring followed the tapped resolver');
  const saved = await saveRetroPerformance(0.02); // ≈72 frames
  assert.ok(saved && saved.bytes[0] === 0x1f && saved.bytes[1] === 0x8b, 'a retro save packs to a .kcperf');
  assert.equal(verifyPerformance(saved.perf).ok, true, 'the coordinator’s retro take verifies');

  // a deliberate take pre-empts the ring, and stop restarts it fresh
  assert.equal(startPerformance({ checkpointEvery: 10 }), true);
  assert.equal(isRecordingPerformance(), true);
  assert.equal(isRetroCapturing(), false, 'the ring is suspended while a take records');
  for (let f = 200; f < 320; f++) wrapped.resolveLayers(frameInput(f, T[f]));
  const take = await stopPerformance();
  assert.ok(take && take.perf.frames > 0, 'the deliberate take finished');
  assert.equal(isRetroCapturing(), true, 'the ring restarted after the take');

  // a resolver swap clears the restarted ring
  for (let f = 320; f < 340; f++) wrapped.resolveLayers(frameInput(f, T[f]));
  const before = retroCaptureStats().frames;
  assert.ok(before > 0);
  requestResolverReset();
  wrapped.resolveLayers(frameInput(340, T[340])); // the swap happens at the top of this call
  assert.ok(retroCaptureStats().frames <= 1, 'the swap cleared the ring (only the swap frame itself is new)');
  assert.equal(stopRetroCapture(), true);
  assert.equal(isRetroCapturing(), false);
  wrapped.dispose();
}

console.log('retroCapture.selfcheck: ok (#1367 slice 3)');
