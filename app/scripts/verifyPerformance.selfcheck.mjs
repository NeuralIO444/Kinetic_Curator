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

console.log('verifyPerformance.selfcheck: ok (good = 0, forged = 1, not a take = 2)');
