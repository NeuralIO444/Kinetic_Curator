// node src/curator/stressRecord.selfcheck.mjs
// #1354 — PHASE 2's EXIT: bands change deterministically from a recorded log, and the log carries the telemetry
// (how long the session spent in each band) needed to retune the thresholds.
import assert from 'node:assert/strict';
import { createStressTracker, BAND_RELAX, BAND_NORMAL, BAND_TIGHTEN } from './stress.js';
import { createStressRecorder, replayStress, verifyStressRecord, STRESS_RECORD_VERSION } from './stressRecord.js';
import { initStress, getStressState, setStressTap } from './stressLive.js';
import { createLiveResolver } from '../gl/liveResolve.mjs';
import { withResolveTap } from '../gl/resolveTap.mjs';
import { startPerformance, stopPerformance } from '../gl/performanceCapture.mjs';
import { unpackPerformance, verifyPerformance } from '../gl/performanceFile.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';

// 1. a tracker resumed from a snapshot continues exactly as the original would have
{
  const sig = (f) => ({ activity: 0.5 + 0.5 * Math.sin(f / 17), dish: 0.5 + 0.5 * Math.sin(f / 29), taste: 0.5 + 0.5 * Math.cos(f / 11) });
  const a = createStressTracker();
  for (let f = 0; f < 137; f++) a.update(sig(f));
  const b = createStressTracker({ initial: { smoothed: a.smoothed, band: a.band } });
  for (let f = 137; f < 400; f++) {
    const ra = a.update(sig(f));
    const rb = b.update(sig(f));
    assert.equal(rb.smoothed, ra.smoothed, `frame ${f}: same smoothed value`);
    assert.equal(rb.band, ra.band);
    assert.deepEqual(rb.events, ra.events, `frame ${f}: same events`);
  }
}

// 2. THE EXIT, on all three bands: a take recorded from mid-session replays to the same band changes
{
  const sig = (f) => ({ activity: 0.5 + 0.5 * Math.sin(f / 40), dish: 0.5 + 0.5 * Math.sin(f / 40 + 0.4), taste: 0.5 + 0.5 * Math.sin(f / 40 - 0.3) });
  const live = createStressTracker();
  for (let f = 0; f < 90; f++) live.update(sig(f)); // the session was already running
  let frame = 0;
  const rec = createStressRecorder({ initial: { smoothed: live.smoothed, band: live.band }, getFrame: () => frame });
  const seen = [];
  for (let f = 90; f < 900; f++) {
    frame = f - 90;
    const s = sig(f);
    const r = live.update(s);
    rec.update({ ...s, band: r.band });
    for (const e of r.events) if (e.type === 'band') seen.push(e.band);
  }
  const record = JSON.parse(JSON.stringify(rec.finish())); // through text, like the file
  assert.equal(record.version, STRESS_RECORD_VERSION);
  assert.deepEqual(record.bands.map((b) => b[1]), seen, 'the log holds exactly the band changes that happened');
  assert.ok(seen.includes(BAND_RELAX) && seen.includes(BAND_NORMAL) && seen.includes(BAND_TIGHTEN), 'the take visits every band');
  assert.deepEqual(replayStress(record), seen, 'replaying the recorded signals reproduces the band changes, in order');
  const v = verifyStressRecord(record);
  assert.deepEqual(v, { ok: true, updates: 810, bandChanges: seen.length, firstMismatch: null });
  // telemetry: every update is accounted to a band
  const { relax, normal, tighten } = record.occupancy;
  assert.equal(relax + normal + tighten, 810, 'occupancy covers every update');
  assert.ok(relax > 0 && normal > 0 && tighten > 0, `time in each band is recorded (${relax}/${normal}/${tighten})`);
  for (const [f] of record.bands) assert.ok(Number.isInteger(f) && f >= 0 && f < 810, 'band changes carry the take frame they happened on');

  // the starting state is part of the record: without it the replay does not match
  const cold = replayStress({ ...record, initial: null });
  assert.notDeepEqual(cold, seen, 'a replay that ignores the starting state announces a band the take did not');

  // tampering with a signal is caught
  const forged = JSON.parse(JSON.stringify(record));
  const big = forged.runs.findIndex((r) => r[1] > 0.9);
  for (let i = big; i < Math.min(forged.runs.length, big + 80); i++) { forged.runs[i][1] = 0; forged.runs[i][2] = 0; forged.runs[i][3] = 0; }
  const fv = verifyStressRecord(forged);
  assert.equal(fv.ok, false);
  assert.ok(Number.isInteger(fv.firstMismatch), 'and the first differing band change is named');
  assert.equal(verifyStressRecord(null).ok, false);
  assert.equal(verifyStressRecord({ version: 99, runs: [], bands: [] }).ok, false);
}

// 3. signals that hold are stored as a run, not once per update (the smoothing still advances on every one)
{
  const rec = createStressRecorder({});
  const t = createStressTracker();
  for (let i = 0; i < 500; i++) rec.update({ activity: 1, dish: 0, taste: 1, band: t.update({ activity: 1, dish: 0, taste: 1 }).band });
  const r = rec.finish();
  assert.equal(r.runs.length, 1);
  assert.equal(r.runs[0][4], 500, 'one run of 500 updates');
  assert.equal(verifyStressRecord(r).ok, true);
}

// 4. the live wiring: the tracker's tap feeds the recorder, and a take carries the record
{
  let cb = null;
  const counts = { activityCount: 0, passRun: 0 };
  const stop = initStress({ getCounts: () => counts, isRunning: () => true, raf: (f) => { cb = f; return 1; }, caf: () => {} });
  for (let i = 0; i < 50; i++) { counts.activityCount += 1; cb(); } // a session already in progress
  const stressSection = (getFrame) => {
    const now = getStressState();
    const rec = createStressRecorder({ initial: { smoothed: now.band === null ? null : now.smoothed, band: now.band }, getFrame });
    setStressTap((u) => rec.update(u));
    return { stop() { setStressTap(null); return rec.finish(); } };
  };
  const resolver = withResolveTap(createLiveResolver);
  const input = (t) => ({
    canvasW: 1000, canvasH: 700, layers: [{ id: 'a', name: 'a', visible: true, layerBlendMode: 'normal', layerOpacity: 1 }], activeLayerId: 'a',
    layerSnapshots: {}, seed: 5, seedOffsets: null, paletteId: 'bone', paletteOverrides: null, userPalettes: [],
    layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'grid', count: 40 }, caGrid: null, enabledAssets: null, assetWeightOverrides: {},
    customAssets: [], quality: 'balanced', lockedParams: {}, batchPaused: false, focusSwap: false, perfClampOverride: null, perfTier1: false,
    assetThin: false, slowRender: false, scaleMul: 1, alphaBoost: 0, effectiveScale: [0.5, 1.5], effectiveAlpha: [20, 100], phraseWrapGen: 0,
    attractor: null, loopTimeMs: t, dtSec: 0.0167,
  });
  assert.equal(startPerformance({ sections: { stress: stressSection, broken: () => { throw new Error('nope'); } } }), true);
  for (let f = 0; f < 200; f++) {
    if (f < 60) counts.activityCount += 1; // busy, then the hands stop
    counts.passRun = f < 120 ? 30 : 0; // rolling, then a keep
    cb();
    resolver.resolveLayers(input(16.7 * (f + 1)));
  }
  const take = await stopPerformance();
  stop();
  resolver.dispose();
  assert.ok(take.perf.stress, 'the performance carries its stress record');
  assert.equal(take.perf.broken, undefined, 'a section that fails to start is simply absent; the take is fine');
  const back = await unpackPerformance(take.bytes);
  assert.deepEqual(back.stress, JSON.parse(JSON.stringify(take.perf.stress)), 'and it survives the file');
  assert.equal(verifyPerformance(back).ok, true, 'the frames still replay');
  const sv = verifyStressRecord(back.stress);
  assert.equal(sv.ok, true, 'and the bands follow from the recorded signals');
  assert.equal(sv.updates, 200);
  assert.ok(back.stress.bands.length >= 1, 'band changes were logged');
  assert.equal(back.stress.occupancy.tighten, 0, 'dish pressure is 0 until pins exist, so a live take cannot reach TIGHTEN yet');
  assert.ok(back.stress.occupancy.normal > 0 && back.stress.occupancy.relax > 0, 'it moved between RELAX and NORMAL');
}

console.log('stressRecord.selfcheck: ok (#1354 exit)');
