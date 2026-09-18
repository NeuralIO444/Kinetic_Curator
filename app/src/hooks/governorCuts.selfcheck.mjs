// governorCuts.selfcheck.mjs — #103 Track A: GPU-implied frame rate feeding
// the governor's sustain windows. Under vsync the rAF cadence lies; the
// governor must act on the worse of the two rates.
import assert from 'node:assert';
import {
  gpuImpliedFps, effectiveGovernorFps, isGpuBinding,
  nextGovernorCut, shedSummary, GOVERNOR_RESTORE_CUTS,
} from './governorCuts.js';

// Absent timing → Infinity → governor reduces exactly to the rAF rate.
assert.strictEqual(gpuImpliedFps(undefined), Infinity);
assert.strictEqual(gpuImpliedFps(null), Infinity);
assert.strictEqual(gpuImpliedFps({}), Infinity);
assert.strictEqual(gpuImpliedFps({ gpuFrame: 0 }), Infinity);
assert.strictEqual(effectiveGovernorFps(60, undefined), 60);
assert.strictEqual(effectiveGovernorFps(30, {}), 30);

// GPU-bound while rAF reads 60: 40ms GPU frame → 25fps implied → the
// governor sees 25, not 60 (trips the low-FPS sustain windows).
assert.strictEqual(gpuImpliedFps({ gpuFrame: 40 }), 25);
assert.strictEqual(effectiveGovernorFps(60, { gpuFrame: 40 }), 25);

// GPU-bound + rAF-low: the worse of the two wins.
assert.strictEqual(effectiveGovernorFps(20, { gpuFrame: 40 }), 20);

// Healthy GPU (16.6ms → 60fps) with rAF 60: no behaviour change.
assert.strictEqual(effectiveGovernorFps(60, { gpuFrame: 16.6 }) > 59.9, true);

// Garbage stage values never poison the governor.
assert.strictEqual(effectiveGovernorFps(60, { gpuFrame: 'hot' }), 60);
assert.strictEqual(effectiveGovernorFps(60, { gpuFrame: NaN }), 60);
assert.strictEqual(effectiveGovernorFps(60, { gpuFrame: -5 }), 60);

console.log('[selfcheck] governorCuts (#103 GPU-implied FPS): 12 cases passed');

// #265 — the binding-constraint gate: cut 1 (resolution) fires when the
// GPU-implied rate is the binding constraint — including when BOTH rates
// are below the shed floor, the case the old predicate missed.
assert.strictEqual(isGpuBinding(60, 25, 28), true, 'gpu-bound, raf healthy → binding');
assert.strictEqual(isGpuBinding(20, 18, 28), true, 'both low, gpu binding → binding');
assert.strictEqual(isGpuBinding(20, 60, 28), false, 'main-thread bound → not binding');
assert.strictEqual(isGpuBinding(18, 25, 28), false, 'both low, main-thread binding → not binding');
assert.strictEqual(isGpuBinding(60, Infinity, 28), false, 'no gpu timing → not binding');
assert.strictEqual(isGpuBinding(60, 60, 28), false, 'healthy → not binding');
assert.strictEqual(isGpuBinding(27, 27, 28), true, 'tied at the floor → binding');
console.log('[selfcheck] governorCuts (#265 gpu binding gate): 7 cases passed');

// #264 — structural: every kind the shed ladder can produce MUST have a
// restore entry. Recovery iterates the table in reverse; a shed kind with
// no entry here is the trap that left quality shed forever.
{
  const shedKinds = new Set();
  let s = {
    renderScale: 1, quality: 'high', assetThin: false,
    perfClampOverride: null, effectiveCount: 400, slowRender: false,
    gpuSaturated: true,
  };
  for (let i = 0; i < 12; i++) {
    const c = nextGovernorCut(s);
    if (!c) break;
    shedKinds.add(c.kind);
    if (c.kind === 'renderScale') s = { ...s, renderScale: c.scale };
    else if (c.kind === 'quality') s = { ...s, quality: c.quality };
    else if (c.kind === 'assetThin') s = { ...s, assetThin: true };
    else if (c.kind === 'countClamp') s = { ...s, perfClampOverride: { count: c.count, mirror: false } };
    else if (c.kind === 'slowRender') s = { ...s, slowRender: true };
  }
  assert.ok(shedKinds.size > 0, 'ladder walk must produce kinds');
  const restoreKinds = new Set(GOVERNOR_RESTORE_CUTS.map((c) => c.kind));
  for (const k of shedKinds) {
    assert.ok(restoreKinds.has(k), `shed kind '${k}' has no restore entry — trap #2`);
  }
  // The table is in shed order (recovery iterates it reversed).
  const order = GOVERNOR_RESTORE_CUTS.map((c) => c.kind);
  assert.deepStrictEqual(order, ['renderScale', 'quality', 'assetThin', 'countClamp', 'slowRender']);
  console.log('[selfcheck] governorCuts (#264 restore coverage):',
    `shed kinds [${[...shedKinds].join(', ')}] all restorable`);
}

// #264 — quality restores only when the GOVERNOR shed it (qualityShedFrom
// tracks the tier it stepped down from); a user-chosen tier is untouched,
// and nothing restores while unhealthy.
{
  const q = GOVERNOR_RESTORE_CUTS.find((c) => c.kind === 'quality');
  assert.ok(q, 'quality must be in the restore table');
  const gov = { quality: 'performance', qualityShedFrom: 'balanced' };
  assert.strictEqual(q.needsRestore(gov, { healthy: true }), true, 'governor-shed quality restores');
  assert.strictEqual(q.needsRestore(gov, { healthy: false }), false, 'no restore while unhealthy');
  assert.strictEqual(
    q.needsRestore({ quality: 'performance', qualityShedFrom: null }, { healthy: true }),
    false, 'user-chosen tier never restores',
  );
  // The badge shows governor-shed quality and stays silent otherwise.
  assert.deepStrictEqual(
    shedSummary({ renderScale: 1, quality: 'performance', qualityShedFrom: 'balanced' }),
    ['tier → PERFORMANCE'],
  );
  assert.deepStrictEqual(
    shedSummary({ renderScale: 0.5, quality: 'performance', qualityShedFrom: 'balanced' }),
    ['pixel trim 50%', 'tier → PERFORMANCE'],
  );
  assert.strictEqual(
    shedSummary({ renderScale: 1, quality: 'performance', qualityShedFrom: null }),
    null, 'user-chosen PERF is not a shed',
  );
  console.log('[selfcheck] governorCuts (#264 quality restore + badge): 7 cases passed');
}

// #264 — the watchdog is NOT in the restore table by design: the hard stop
// needs manual resume and must never auto-restore.
{
  const kinds = GOVERNOR_RESTORE_CUTS.map((c) => c.kind);
  assert.ok(!kinds.includes('watchdog'), 'watchdog must not auto-restore');
  assert.ok(!kinds.includes('perfTier1'), 'perfTier1 keeps its own mechanism');
  const sr = GOVERNOR_RESTORE_CUTS.find((c) => c.kind === 'slowRender');
  assert.strictEqual(
    sr.needsRestore({ slowRender: true, slowRenderSource: 'cut6' }, { healthy: true }),
    true, 'cut-6 soft freeze auto-clears',
  );
  assert.strictEqual(
    sr.needsRestore({ slowRender: true, slowRenderSource: 'watchdog' }, { healthy: true }),
    false, 'watchdog stop never auto-clears',
  );
  console.log('[selfcheck] governorCuts (#264 watchdog/manual-resume contract): 4 cases passed');
}
