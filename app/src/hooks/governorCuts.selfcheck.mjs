// governorCuts.selfcheck.mjs — #103 Track A: GPU-implied frame rate feeding
// the governor's sustain windows. Under vsync the rAF cadence lies; the
// governor must act on the worse of the two rates.
import assert from 'node:assert';
import {
  gpuImpliedFps,
  effectiveGovernorFps,
  isGpuBinding,
  nextGovernorCut,
  shedSummary,
  GOVERNOR_RESTORE_CUTS,
  watchdogMayTrip,
  frameStalled,
  FRAME_STALL_MS,
  measureLoopRate,
  loopTimeCrawling,
  CRAWL_WINDOW_MS,
  CRAWL_MIN_FRAMES,
  CRAWL_MAX_LOOP_RATIO,
  LOOP_DT_MIN_MS,
  LOOP_DT_MAX_MS,
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
    renderScale: 1,
    quality: 'high',
    assetThin: false,
    perfClampOverride: null,
    effectiveCount: 400,
    slowRender: false,
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
  // #1694 S2 — 'creatureCount' joins the table between renderScale and quality:
  // the population sheds first among content cuts (Matt's ruling, #1694 Q2).
  // #1574 — 'travel' joins between creatureCount and quality (cut 1.6):
  // the population still sheds first; travel sheds ahead of the tier step.
  // #1627 S1 — 'markWeather' joins between renderScale and creatureCount
  // (cut 1.4): weather dies before marks — ahead of the population and
  // travel alike (the full walk is pinned in markWeather.selfcheck F).
  // #1490 — 'feedbackWarp' joins between markWeather and creatureCount
  // (cut 1.45): the warp sheds before body counts, weather still first
  // (the full walk is pinned in spectrumWarp.selfcheck G).
  // #1806 slice 2 — 'accumFeed' joins between feedbackWarp and
  // creatureCount (cut 1.47): the subset render sheds with its ACCUM
  // family, before body counts (the full walk is pinned in
  // accumFeed.selfcheck).
  // #1837 — 'trailSteer' joins between accumFeed and creatureCount
  // (cut 1.48): ember steering sheds with its ACCUM family, ahead of the
  // population it steers (the full walk is pinned in
  // emberDrive.selfcheck).
  // #1923 — 'dishLife' joins between renderScale and markWeather (cut 1.39): the idle culture is the first
  // sacrifice after the pixel trim (the full walk is pinned in governorDishLife.selfcheck).
  const order = GOVERNOR_RESTORE_CUTS.map((c) => c.kind);
  assert.deepStrictEqual(order, [
    'fxaa',
    'renderScale',
    'dishLife',
    'markWeather',
    'feedbackWarp',
    'accumFeed',
    'trailSteer',
    'creatureCount',
    'travel',
    'quality',
    'assetThin',
    'countClamp',
    'slowRender',
  ]);
  console.log(
    '[selfcheck] governorCuts (#264 restore coverage):',
    `shed kinds [${[...shedKinds].join(', ')}] all restorable`,
  );
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
    false,
    'user-chosen tier never restores',
  );
  // The badge shows governor-shed quality and stays silent otherwise.
  assert.deepStrictEqual(shedSummary({ renderScale: 1, quality: 'performance', qualityShedFrom: 'balanced' }), [
    'tier → PERFORMANCE',
  ]);
  assert.deepStrictEqual(shedSummary({ renderScale: 0.5, quality: 'performance', qualityShedFrom: 'balanced' }), [
    'pixel trim 50%',
    'tier → PERFORMANCE',
  ]);
  assert.strictEqual(
    shedSummary({ renderScale: 1, quality: 'performance', qualityShedFrom: null }),
    null,
    'user-chosen PERF is not a shed',
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
    true,
    'cut-6 soft freeze auto-clears',
  );
  assert.strictEqual(
    sr.needsRestore({ slowRender: true, slowRenderSource: 'watchdog' }, { healthy: true }),
    false,
    'watchdog stop never auto-clears',
  );
  console.log('[selfcheck] governorCuts (#264 watchdog/manual-resume contract): 4 cases passed');
}

// #740 — cut 0: edge AA (FXAA) sheds before pixel trim, only when the GPU is the
// bottleneck, only when the caller says it is on-and-unshed, and restores last.
{
  const base = {
    renderScale: 1,
    quality: 'high',
    assetThin: false,
    perfClampOverride: null,
    effectiveCount: 400,
    slowRender: false,
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

// #1919 — ladder-first (Matt's ruling, 2026-11-01): the watchdog is the
// ladder's LAST rung. This section REPLACES the pre-#1919 contract the
// header of governorCuts.js used to state — "the watchdog is a separate,
// faster mechanism" — under which the fps-critical trip fired after
// 800 ms below 10 regardless of ladder state. Now: while a rung the
// ladder is eligible to apply remains, watchdogMayTrip is false (the
// hook's critical window does not even run); only an exhausted ladder
// arms it, and the hook then runs the unchanged 800 ms window.
// The walk below drives the ladder the way usePerformanceGovernor does —
// ask for the next cut, apply it — under sustained critical pressure
// (effFps 5, far below CRITICAL_FPS 10) the whole way down.
{
  const apply = (s, c) => {
    if (c.kind === 'fxaa') return { ...s, fxaaShed: true };
    if (c.kind === 'renderScale') return { ...s, renderScale: c.scale };
    if (c.kind === 'quality') return { ...s, quality: c.quality };
    if (c.kind === 'assetThin') return { ...s, assetThin: true };
    if (c.kind === 'countClamp') return { ...s, perfClampOverride: { count: c.count, mirror: false } };
    if (c.kind === 'slowRender') return { ...s, slowRender: true };
    assert.fail(`walk met an unhandled cut kind ${c.kind}`);
  };
  const query = (s) => ({
    fxaa: !s.fxaaShed,
    renderScale: s.renderScale,
    quality: s.quality,
    assetThin: s.assetThin,
    perfClampOverride: s.perfClampOverride,
    effectiveCount: s.effectiveCount,
    slowRender: s.slowRender,
    gpuSaturated: true,
  });
  let s = {
    fxaaShed: false,
    renderScale: 1,
    quality: 'high',
    assetThin: false,
    perfClampOverride: null,
    effectiveCount: 400,
    slowRender: false,
  };
  let cuts = 0;
  for (let guard = 0; guard < 64; guard++) {
    const c = nextGovernorCut(query(s));
    if (!c) break;
    assert.strictEqual(
      watchdogMayTrip(query(s), { effFps: 5, shedFps: 28 }),
      false,
      `sustained effFps 5 with rungs remaining (after ${cuts} cuts) → the watchdog waits, no trip`,
    );
    s = apply(s, c);
    cuts++;
  }
  assert.ok(cuts > 0, 'the walk landed cuts before the ladder exhausted');
  assert.strictEqual(nextGovernorCut(query(s)), null, 'the walk ends exhausted');
  assert.strictEqual(
    watchdogMayTrip(query(s), { effFps: 5, shedFps: 28 }),
    true,
    'rungs exhausted + sustained effFps 5 → the watchdog is armed (the hook runs its 800 ms window)',
  );

  // Boot (the ruling's explicit check): the store's fresh state —
  // quality 'balanced', full pixels, nothing shed, motion unfrozen
  // (globalSlice defaults) — always holds rungs, in every sensor
  // combination, so a starved first 800 ms cannot trip before the
  // ladder has even started: the gate holds from the first frame.
  const boot = {
    renderScale: 1,
    quality: 'balanced',
    assetThin: false,
    perfClampOverride: null,
    effectiveCount: 0,
    slowRender: false,
  };
  for (const gpuSaturated of [true, false]) {
    for (const fxaa of [true, false]) {
      assert.strictEqual(
        watchdogMayTrip({ ...boot, gpuSaturated, fxaa }, { effFps: 5, shedFps: 28 }),
        false,
        `boot state (gpuSaturated ${gpuSaturated}, fxaa ${fxaa}) → the watchdog waits`,
      );
    }
  }
  assert.strictEqual(
    watchdogMayTrip({ ...boot, quality: 'performance', gpuSaturated: false }, { effFps: 5, shedFps: 28 }),
    false,
    'even at the lowest tier a fresh ladder holds rungs (asset thinning, the freeze) → the watchdog waits',
  );

  // A GOV TUNE shed floor tuned below the rate takes the ladder out of
  // play at that rate — its effect will not fire there — so there is
  // nothing for the watchdog to wait for and the gate releases.
  const fresh = {
    fxaa: true,
    renderScale: 1,
    quality: 'high',
    assetThin: false,
    perfClampOverride: null,
    effectiveCount: 400,
    slowRender: false,
    gpuSaturated: true,
  };
  assert.strictEqual(
    watchdogMayTrip(fresh, { effFps: 8, shedFps: 5 }),
    true,
    'ladder tuned out of play at this rate → the watchdog is armed even with rungs standing',
  );
  assert.strictEqual(
    watchdogMayTrip(fresh, { effFps: 5, shedFps: 28 }),
    false,
    'the same state inside the shed region → the watchdog waits',
  );
  console.log('[selfcheck] governorCuts (#1919 ladder-first gate): walk + boot + tuned-floor cases passed');
}

// #1919 carve-out — the frozen frame: frameStalled keys on frame
// COMPLETION, never on ladder state, and the two watchdog gates never
// consult each other. Both directions pinned:
//  (a) a throttled-but-alive scene — frames completing slowly — keeps
//      its heartbeat fresh: no stall, and (above) the ladder gate also
//      holds. The carve-out stays out of ladder territory.
//  (b) silence past the bound on a FRESH ladder: the fps-critical gate
//      still says wait (rungs remain), yet the stall predicate fires —
//      the hook trips 'fps-stalled' without waiting minutes for
//      exhaustion.
{
  const now = 1_000_000;
  assert.strictEqual(FRAME_STALL_MS, 2000, 'the ruled bound: 2s of frame silence');
  // (a) slow but alive: last frame 200 ms ago at a crawling rate.
  assert.strictEqual(frameStalled(now - 200, now), false, 'a frame 200ms ago (slow scene) → no stall');
  assert.strictEqual(frameStalled(now - (FRAME_STALL_MS - 1), now), false, 'one ms inside the bound → no stall');
  // (b) frozen: exactly at the bound the silence is a hang.
  assert.strictEqual(frameStalled(now - FRAME_STALL_MS, now), true, 'silence at the bound → stalled');
  assert.strictEqual(frameStalled(now - FRAME_STALL_MS * 10, now), true, 'long silence → stalled');
  // The ladder gate on the same fresh state still refuses the
  // fps-critical trip — the carve-out does not borrow its permission.
  const fresh = {
    fxaa: true,
    renderScale: 1,
    quality: 'high',
    assetThin: false,
    perfClampOverride: null,
    effectiveCount: 400,
    slowRender: false,
    gpuSaturated: true,
  };
  assert.strictEqual(
    watchdogMayTrip(fresh, { effFps: 5, shedFps: 28 }),
    false,
    'fresh ladder: fps-critical still waits while the stall fires — the gates are independent',
  );
  // No frame observed yet (a scene that has never drawn) never stalls,
  // and garbage never stalls.
  assert.strictEqual(frameStalled(null, now), false, 'no frame observed yet → no stall');
  assert.strictEqual(frameStalled(undefined, now), false, 'undefined heartbeat → no stall');
  assert.strictEqual(frameStalled(now - FRAME_STALL_MS * 10, NaN), false, 'garbage clock → no stall');
  console.log('[selfcheck] governorCuts (#1919 frozen-frame carve-out): both directions pinned');
}

// #1919 Option B — the crawl (Matt's ruling, 2026-11-01 22:00 PT):
// the ladder-first gate holds the fps-critical trip for the whole
// ladder walk (~70–95 s under load), so a loop running at 3–5 fps
// starves the main thread and stretches loop-time landings past any
// reasonable wait — yet never trips anything: frames keep completing
// inside the stall bound, and PERF PAUSED never occurs (the PR #1920
// e2e failure). The crawl predicate measures the rate loop time
// advances — the patrol's delta stream replayed through the loop's
// own dt clamp — and the hook trips 'fps-crawl' when it stays under
// the threshold across the window. Both directions pinned below,
// the healthy direction BY ARITHMETIC: at 41 fps the raw delta
// (~24.4 ms) is under the 50 ms clamp ceiling, so every frame books
// its full delta and the booked share of wall time is exactly 1.
{
  const seq = (d, n) => Array.from({ length: n }, () => d);
  // The ruled sketch's numbers, pinned so they can't drift silently.
  assert.strictEqual(CRAWL_WINDOW_MS, 4000, 'the crawl window: ~4s of trailing wall time');
  assert.strictEqual(CRAWL_MIN_FRAMES, 8, 'a window needs 8 presented frames to read as a rate');
  assert.strictEqual(CRAWL_MAX_LOOP_RATIO, 0.25, 'the crawl threshold: loop time under 25% of wall');
  assert.strictEqual(LOOP_DT_MAX_MS, 50, 'the loop dt clamp ceiling (liveLoop.mjs tick, Spine A)');
  assert.strictEqual(LOOP_DT_MIN_MS, 8, 'the loop dt clamp floor (liveLoop.mjs tick, Spine A)');

  // NEVER FIRES AT HEALTHY RATES — Matt's incident: rAF 41 fps.
  // Raw dt = 1000/41 ≈ 24.39 ms < 50 ms clamp → each frame books its
  // full delta → loopMs accumulates the identical sum as wallMs.
  const at41 = measureLoopRate(seq(1000 / 41, 240));
  assert.ok(at41, 'a full window of 41 fps deltas measures');
  assert.strictEqual(at41.ratio, 1, 'at 41 fps loop time == wall time (raw dt 24.4ms < the 50ms clamp)');
  assert.strictEqual(loopTimeCrawling(seq(1000 / 41, 240)), false, '41 fps → no crawl trip');
  // Jitter entirely under the ceiling books whole too.
  const jitter = Array.from({ length: 300 }, (_, i) => (i % 2 ? 12 : 21));
  assert.strictEqual(measureLoopRate(jitter).ratio, 1, 'sub-clamp jitter books whole: ratio exactly 1');
  assert.strictEqual(loopTimeCrawling(jitter), false, 'jittered healthy deltas → no crawl trip');
  // The clamp ceiling itself (an even 20 fps, delta exactly 50) is
  // not a crawl: every frame still books its full delta.
  assert.strictEqual(loopTimeCrawling(seq(50, 200)), false, '20 fps (delta == clamp) → ratio 1 → no crawl trip');
  // The critical band is the ladder's, not this trip's: an even
  // 10 fps books half of wall — bars land in seconds, the gate governs.
  const at10 = measureLoopRate(seq(100, 100));
  assert.strictEqual(at10.ratio, 0.5, 'an even 10 fps books exactly half of wall');
  assert.strictEqual(loopTimeCrawling(seq(100, 100)), false, '10 fps → ratio 0.5 → no crawl trip');
  // The boundary: an even 5 fps books exactly the threshold rate
  // (50 of every 200 ms); the trip needs strictly below it.
  const at5 = measureLoopRate(seq(200, 40));
  assert.strictEqual(at5.ratio, 0.25, 'an even 5 fps books exactly the 0.25 threshold');
  assert.strictEqual(loopTimeCrawling(seq(200, 40)), false, 'an even 5 fps sits AT the threshold → no crawl trip');

  // FIRES IN THE DIAGNOSED CRAWL — an even ~4 fps: 16 frames fill
  // the window, each booking 50 of its 250 ms.
  const at4 = measureLoopRate(seq(250, 32));
  assert.strictEqual(at4.wallMs, 4000, 'the walk stops once the window is full');
  assert.strictEqual(at4.loopMs, 800, '16 frames × the 50ms clamp ceiling');
  assert.strictEqual(at4.frames, 16);
  assert.strictEqual(at4.ratio, 0.2, '~4 fps books a fifth of wall');
  assert.strictEqual(loopTimeCrawling(seq(250, 32)), true, '~4 fps sustained → crawl trip');
  // The A/B probe's crawl (2.7 fps, deltas ~370 ms): deeper still.
  const probe = measureLoopRate(seq(370, 30));
  assert.strictEqual(probe.loopMs, 550, '11 frames × 50ms booked');
  assert.strictEqual(probe.wallMs, 4070, '11 frames × 370ms of wall');
  assert.strictEqual(loopTimeCrawling(seq(370, 30)), true, '2.7 fps sustained → crawl trip');
  // Variance only lowers the booked share (the clamp is concave
  // above 50): a stream averaging 6 fps that mixes fast and slow
  // frames books (16 + 50) / (16 + 317) ≈ 0.198.
  const mixed = Array.from({ length: 60 }, (_, i) => (i % 2 ? 317 : 16));
  assert.strictEqual(loopTimeCrawling(mixed), true, 'mixed fast/slow stream averaging 6 fps → crawl trip');

  // A crawl younger than the window does not trip: the trailing
  // window blends it with the healthy stream ahead of it until the
  // crawl fills the window (3 s healthy + 2 s crawl → booked share
  // (400 + 2000) / 4000 = 0.6; the same crawl at 5 s fills the
  // window outright).
  const young = [...seq(1000 / 60, 180), ...seq(250, 8)];
  assert.strictEqual(
    loopTimeCrawling(young),
    false,
    '2s into a crawl the window is still mostly healthy → no trip yet',
  );
  const filled = [...seq(1000 / 60, 180), ...seq(250, 20)];
  assert.strictEqual(loopTimeCrawling(filled), true, 'once the crawl fills the trailing window → crawl trip');
  // Recovery reads clean: the window is trailing, so a crawl that
  // has ended no longer measures (whether a trip latches is the
  // hook's affair, not the predicate's).
  const recovered = [...seq(250, 20), ...seq(1000 / 60, 300)];
  assert.strictEqual(loopTimeCrawling(recovered), false, 'crawl followed by healthy frames → window reads healthy');

  // A lone hitch is not a rate: one 5 s delta at the tail ends the
  // measurable episode before a single frame is counted (and in the
  // live wiring a silence that long is the stall trip's catch long
  // before this window would judge — the two carve-outs compose).
  const hitch = [...seq(1000 / 60, 200), 5000];
  assert.strictEqual(measureLoopRate(hitch), null, 'a stall-bound silence at the tail → no measurement');
  assert.strictEqual(loopTimeCrawling(hitch), false, 'one 5s hitch + healthy stream → no crawl trip');
  // A silence mid-stream bounds the episode the same way: judged on
  // the completing stream after it — enough crawl frames after the
  // gap fill the window and fire; four frames are not a window yet.
  const afterGap = [...seq(250, 20), 3000, ...seq(250, 20)];
  assert.strictEqual(
    loopTimeCrawling(afterGap),
    true,
    'crawl filling the window after a gap → crawl trip (gap never reached)',
  );
  const gapNear = [...seq(250, 20), 3000, ...seq(250, 4)];
  assert.strictEqual(
    loopTimeCrawling(gapNear),
    false,
    'four crawl frames since a gap → no measurable window → no crawl trip',
  );

  // Too little history is no verdict, and garbage never crawls.
  assert.strictEqual(measureLoopRate([]), null, 'no deltas → no measurement');
  assert.strictEqual(loopTimeCrawling([]), false, 'no deltas → no crawl trip');
  assert.strictEqual(loopTimeCrawling(seq(250, 4)), false, 'four crawl frames (1s) is not a sustained window');
  assert.strictEqual(loopTimeCrawling(null), false, 'a non-stream → no crawl trip');
  assert.strictEqual(loopTimeCrawling([NaN, -5, 'hot']), false, 'garbage deltas are skipped → no crawl trip');
  console.log('[selfcheck] governorCuts (#1919 crawl carve-out, Option B): healthy + crawl + episode cases pinned');
}
