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
  assert.deepStrictEqual(order, ['fxaa', 'renderScale', 'quality', 'assetThin', 'countClamp', 'kinemeShed', 'slowRender']);
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

// #740 — cut 0: edge AA (FXAA) sheds before pixel trim, only when the GPU is the
// bottleneck, only when the caller says it is on-and-unshed, and restores last.
{
  const base = {
    renderScale: 1, quality: 'high', assetThin: false,
    perfClampOverride: null, effectiveCount: 400, slowRender: false,
    gpuSaturated: true,
  };
  // Older callers (no fxaa key) keep the pre-#740 ladder: renderScale first.
  assert.strictEqual(nextGovernorCut(base).kind, 'renderScale', 'no fxaa key → ladder unchanged');
  assert.strictEqual(nextGovernorCut({ ...base, fxaa: false }).kind, 'renderScale', 'fxaa off/shed → skip cut 0');
  // fxaa on + GPU-bound: cut 0 comes first, then the ladder proceeds as before.
  const c0 = nextGovernorCut({ ...base, fxaa: true });
  assert.deepStrictEqual([c0.kind, c0.label], ['fxaa', 'EDGE AA OFF']);
  assert.strictEqual(nextGovernorCut({ ...base, fxaa: false }).scale, 0.75, 'then pixel trim');
  // Main-thread bound: dropping AA cannot buy frames back → not shed (same gate as cut 1).
  assert.strictEqual(nextGovernorCut({ ...base, fxaa: true, gpuSaturated: false }).kind, 'quality');
  // Restore: only when the governor shed it, only when healthy; walked in reverse → last back.
  const r = GOVERNOR_RESTORE_CUTS.find((c) => c.kind === 'fxaa');
  assert.strictEqual(r.needsRestore({ fxaaShed: true }, { healthy: true }), true);
  assert.strictEqual(r.needsRestore({ fxaaShed: true }, { healthy: false }), false, 'not while still struggling');
  assert.strictEqual(r.needsRestore({ fxaaShed: false }, { healthy: true }), false, 'never restores a user-off FXAA');
  assert.strictEqual(GOVERNOR_RESTORE_CUTS[0].kind, 'fxaa', 'first shed = last restored');
  // Badge is honest about it.
  assert.deepStrictEqual(shedSummary({ renderScale: 1, fxaaShed: true }), ['edge AA off']);
  assert.strictEqual(shedSummary({ renderScale: 1, fxaaShed: false }), null);
  console.log('[selfcheck] governorCuts (#740 cut 0 edge AA): 10 cases passed');
}

// Kineme shed (slice 4): four tiers walk between countClamp and slowRender —
// gentler than the full freeze — and are skipped entirely when kineme is off.
{
  const base = {
    renderScale: 0.33, quality: 'performance', assetThin: true,
    perfClampOverride: { count: 80, mirror: false }, slowRender: false,
    gpuSaturated: true, kinemeShed: 0,
  };
  // Kineme off: straight to the full freeze, ladder unchanged.
  assert.strictEqual(
    nextGovernorCut({ ...base, kinemeActive: false }).kind, 'slowRender',
    'kineme off → skip to cut 6',
  );
  assert.strictEqual(
    nextGovernorCut({ ...base }).kind, 'slowRender',
    'no kinemeActive key → skip to cut 6',
  );
  // Kineme on: tiers walk 1 → 4, then the full freeze.
  let s = { ...base, kinemeActive: true };
  const tiers = [];
  for (let i = 0; i < 5; i++) {
    const c = nextGovernorCut(s);
    tiers.push([c.kind, c.tier, c.label]);
    if (c.kind === 'kinemeShed') s = { ...s, kinemeShed: c.tier };
    else break;
  }
  assert.deepStrictEqual(
    tiers.map(([k, t]) => `${k}:${t}`),
    ['kinemeShed:1', 'kinemeShed:2', 'kinemeShed:3', 'kinemeShed:4', 'slowRender:undefined'],
    'tiers walk 1→4, then cut 6',
  );
  assert.ok(tiers.slice(0, 4).every(([, , l]) => typeof l === 'string' && l.length > 0), 'labels set');
  // Tiers exhausted → the ladder holds at slowRender, never a tier 5.
  assert.strictEqual(nextGovernorCut({ ...base, kinemeActive: true, kinemeShed: 4 }).kind, 'slowRender');
  // Restore: only when the governor shed it, only when healthy.
  const k = GOVERNOR_RESTORE_CUTS.find((c) => c.kind === 'kinemeShed');
  assert.strictEqual(k.needsRestore({ kinemeShed: 2 }, { healthy: true }), true);
  assert.strictEqual(k.needsRestore({ kinemeShed: 2 }, { healthy: false }), false, 'not while struggling');
  assert.strictEqual(k.needsRestore({ kinemeShed: 0 }, { healthy: true }), false);
  assert.strictEqual(k.restoredLabel, 'living motion back');
  // Badge is honest about it.
  assert.deepStrictEqual(shedSummary({ renderScale: 1, kinemeShed: 3 }), ['living motion held']);
  console.log('[selfcheck] governorCuts (kineme shed tiers): 12 cases passed');
}
