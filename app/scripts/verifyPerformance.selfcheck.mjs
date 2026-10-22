// node scripts/verifyPerformance.selfcheck.mjs
// The `verify:take` CLI: a good take exits 0, a tampered one exits 1 and names the frame, a non-take exits 2.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLiveResolver } from '../src/gl/liveResolve.mjs';
import { withResolveTap, setResolveTap, setResolveOutputTap } from '../src/gl/resolveTap.mjs';
import { createPerformanceRecorder, packPerformance } from '../src/gl/performanceFile.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../src/data/layout-modes.js';
import { createStressTracker } from '../src/curator/stress.js';
import { createStressRecorder } from '../src/curator/stressRecord.js';

const cli = fileURLToPath(new URL('./verifyPerformance.mjs', import.meta.url));
const L = (id) => ({ id, name: id, visible: true, layerBlendMode: 'normal', layerOpacity: 1 });
function take(frames = 130) {
  const rec = createPerformanceRecorder();
  const res = withResolveTap(createLiveResolver);
  setResolveTap((i) => rec.onInput(i)); setResolveOutputTap((o) => rec.onOutput(o));
  for (let f = 0; f < frames; f++) {
    res.resolveLayers({
      canvasW: 1000, canvasH: 700, layers: [L('a')], activeLayerId: 'a', layerSnapshots: {}, seed: 7, seedOffsets: null, paletteId: 'bone',
      paletteOverrides: null, userPalettes: [], caGrid: null, enabledAssets: null, assetWeightOverrides: {}, customAssets: [], quality: 'balanced',
      lockedParams: {}, batchPaused: false, focusSwap: false, perfClampOverride: null, perfTier1: false, assetThin: false, slowRender: false,
      scaleMul: 1, alphaBoost: 0, effectiveScale: [0.5, 1.5 + 0.2 * Math.sin(f / 9)], effectiveAlpha: [20, 100], phraseWrapGen: 0, attractor: null,
      layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'random', count: 60, particleCount: 60 }, loopTimeMs: f * 16.7, dtSec: 1 / 60,
    });
  }
  setResolveTap(null); setResolveOutputTap(null); res.dispose();
  return rec.finish();
}

const dir = mkdtempSync(join(tmpdir(), 'kc-verify-'));
const perf = take();
const goodPath = join(dir, 'good.kcperf');
writeFileSync(goodPath, await packPerformance(perf));
const forged = JSON.parse(JSON.stringify(perf));
const i = forged.inputs.steps.findIndex((s, f) => f > 20 && s.k && Array.isArray(s.k.effectiveScale));
forged.inputs.steps[i].k.effectiveScale[1] += 0.05;
const badPath = join(dir, 'forged.kcperf');
writeFileSync(badPath, await packPerformance(forged));
const junkPath = join(dir, 'junk.kcperf');
writeFileSync(junkPath, Buffer.from('this is not a performance'));

const run = (...a) => spawnSync(process.execPath, ['--no-warnings', cli, ...a], { encoding: 'utf8' });

// 1. a good take: exit 0, and says what it checked
{
  const r = run(goodPath);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^OK /);
  assert.match(r.stdout, /\d+ frames .* \d+ checkpoints/);
  const j = JSON.parse(execFileSync(process.execPath, ['--no-warnings', cli, goodPath, '--json'], { encoding: 'utf8' }));
  assert.equal(j.ok, true); assert.equal(j.firstMismatchFrame, null); assert.ok(j.checkpoints >= 2);
}

// 2. a tampered take: exit 1, names the frame
{
  const r = run(badPath);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /^FAIL /);
  assert.match(r.stdout, /first mismatch at frame \d+/);
}

// 3. not a performance, no file, no arguments: exit 2, never a crash
{
  assert.equal(run(junkPath).status, 2);
  assert.equal(run(join(dir, 'missing.kcperf')).status, 2);
  assert.equal(run().status, 2);
}

// 4. #1635 — a take carrying its stress record is summarised backstage: occupancy per band, crossings
//    per minute, and the record's own verdict. The summary reports; the exit code stays the frames'.
{
  const j0 = JSON.parse(execFileSync(process.execPath, ['--no-warnings', cli, goodPath, '--json'], { encoding: 'utf8' }));
  assert.equal(j0.stress, null, 'a take with no stress record summarises as none');
  assert.ok(!run(goodPath).stdout.includes('stress:'), 'and prints no stress line');

  const t = createStressTracker();
  const rec = createStressRecorder({});
  for (let f = 0; f < 130; f++) {
    const v = f < 65 ? 0.1 : 0.95; // a quiet room, then a loud one: the readback crosses bands
    rec.update({ activity: v, dish: v, taste: v, band: t.update({ activity: v, dish: v, taste: v }).band });
  }
  const perfS = take();
  perfS.stress = rec.finish();
  const stressPath = join(dir, 'stress.kcperf');
  writeFileSync(stressPath, await packPerformance(perfS));
  const r = run(stressPath);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /stress: 130 updates — relax \d+ \(\d+%\) · normal \d+ \(\d+%\) · tighten \d+ \(\d+%\), \d+ crossings \(\d+(\.\d+)?\/min\), record verifies against its signals/);
  const j = JSON.parse(execFileSync(process.execPath, ['--no-warnings', cli, stressPath, '--json'], { encoding: 'utf8' }));
  assert.equal(j.stress.ok, true);
  assert.equal(j.stress.updates, 130);
  assert.equal(j.stress.occupancy.relax + j.stress.occupancy.normal + j.stress.occupancy.tighten, 130,
    'occupancy sums to the session’s frame count');
  assert.ok(j.stress.crossings >= 2 && j.stress.occupancy.tighten > 0, 'the loud half tightened');
  assert.ok(j.stress.crossingsPerMinute > 0);

  // forge the stress record only: the frames still replay (exit 0), the summary refuses to vouch for it
  const perfF = JSON.parse(JSON.stringify(perfS));
  perfF.stress.runs[1][1] = 0; perfF.stress.runs[1][2] = 0; perfF.stress.runs[1][3] = 0;
  const forgedStressPath = join(dir, 'stress-forged.kcperf');
  writeFileSync(forgedStressPath, await packPerformance(perfF));
  const rf = run(forgedStressPath);
  assert.equal(rf.status, 0, rf.stdout + rf.stderr);
  assert.match(rf.stdout, /RECORD DOES NOT VERIFY/);
  const jf = JSON.parse(execFileSync(process.execPath, ['--no-warnings', cli, forgedStressPath, '--json'], { encoding: 'utf8' }));
  assert.equal(jf.stress.ok, false);
}

console.log('verifyPerformance.selfcheck: ok (good = 0, forged = 1, not a take = 2)');
