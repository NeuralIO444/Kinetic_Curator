// node src/engine/parallaxDrift.selfcheck.mjs
// #1576 — travel kinemes P3: parallax drift (engine/parallaxDrift.js),
// surge's quiet sibling — deliberately its OWN suite and module, so the
// issue's kill criterion stays provable: if surge comes out, this
// suite (and the drift) stand untouched.
//   A. OFFSET LAWS — the pure function: exactly proportional to zTier,
//      amount and time; zero at amount 0, t 0 and tier 0; constant
//      velocity (equal time slices add equal drift).
//   B. LIVE THROUGH buildPlacements — parity when off (store
//      untouched), per-tier drift exact against the banked step count,
//      foreground faster than ground, replay determinism, the shed
//      (home now, clock frozen, resume continues), the artist's pin.
//   C. COST — declared tier 0 with a measured timeMs, re-measured here.
//   D. PARAMS — the recipe key normalizes/clamps like every other.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildPlacements } from './buildPlacements.js';
import {
  createParallaxStore, pruneParallaxStore, parallaxSceneSnapshot, applyParallaxDrift,
  parallaxDriftOffset, PARALLAX_DRIFT_PX_SEC,
} from './parallaxDrift.js';
import { TRAVEL_STEP_SEC } from './kineme.js';
import { DEFAULT_LAYOUT_PARAMS, PARAM_SPEC, normalizeLayoutParams, validateLayoutParams } from '../data/layout-modes.js';
import { getCostTier } from './kernel/costRegistry.mjs';

let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };

const ASSETS = [{ id: 'a', weight: 'heavy' }, { id: 'b', weight: 'medium' }, { id: 'c', weight: 'light' }];
const PALETTE = { swatches: ['#111111', '#222222', '#333333', '#444444'] };
const CAPS = { maxCount: 800, maxCountMirrored: 800, maxParticles: 400, allowMirror: true };
const W = 1000, H = 700;
const lp = (over = {}) => ({
  mode: 'grid', composition: 'default', count: 120, scale: [0.4, 0.8], rotate: [0, 45],
  alpha: [60, 100], jitter: 10, density: 100, zTiers: 4, bleed: false, mirror: false,
  overlap: true, displacement: 0, noiseFreq: 0.005, noiseSpeed: 0.5, ...over,
});
const place = (params, parallaxDrift, extra = {}) => buildPlacements({
  layoutParams: params, seed: 42, activeAssets: ASSETS, palette: PALETTE, caps: CAPS,
  canvasW: W, canvasH: H, parallaxDrift, ...extra,
}).items;
const frameHash = (items) => createHash('sha256')
  .update(items.map((it) => `${it.x},${it.y},${it.scale},${it.rotation},${it.alpha}`).join('|'))
  .digest('hex');

// ── A. offset laws ───────────────────────────────────────────────────────
{
  assert.equal(parallaxDriftOffset(3, 0, 10), 0, 'amount 0 is zero drift');
  assert.equal(parallaxDriftOffset(3, 1, 0), 0, 't 0 is zero drift');
  assert.equal(parallaxDriftOffset(0, 1, 10), 0, 'ground (tier 0) never drifts');
  checks += 3;
  assert.equal(parallaxDriftOffset(1, 1, 2), PARALLAX_DRIFT_PX_SEC * 2, 'the unit rate is the declared constant');
  checks++;
  ok(parallaxDriftOffset(3, 1, 2) === 3 * parallaxDriftOffset(1, 1, 2), 'exactly proportional to zTier (3× tier, 3× drift)');
  ok(parallaxDriftOffset(2, 0.5, 2) === 0.5 * parallaxDriftOffset(2, 1, 2), 'exactly proportional to amount');
  const slice = parallaxDriftOffset(2, 1, 3) - parallaxDriftOffset(2, 1, 2);
  ok(Math.abs((parallaxDriftOffset(2, 1, 9) - parallaxDriftOffset(2, 1, 8)) - slice) < 1e-12, 'constant velocity: equal slices add equal drift, early and late');
  console.log('parallaxDrift.selfcheck A offset: ∝ zTier / amount / time, zero at 0, constant velocity');
}

// ── B. live through buildPlacements ──────────────────────────────────────
{
  const DRIFT_LP = lp({ transportParallax: 1 });
  const homes = place(lp(), null);
  const homeByKey = new Map(homes.map((it) => [it.key, it]));
  // Parity: amount 0 with an input handed in changes nothing, touches nothing.
  const store0 = createParallaxStore();
  const off = place(lp({ transportParallax: 0 }), { store: store0, sceneId: 'a', frameMs: 1000, shed: false });
  assert.equal(frameHash(off), frameHash(homes), 'amount 0 is bit-identical');
  checks++;
  assert.equal(store0.scenes.size, 0, 'amount 0 never creates drift state');
  checks++;

  // Per-tier drift is EXACT against the banked step count: after some
  // frames, every item's x − home is the pure function of its own tier.
  const store = createParallaxStore();
  let items = null;
  for (let f = 0; f < 40; f++) items = place(DRIFT_LP, { store, sceneId: 'live', frameMs: 1000 / 60, shed: false });
  const snap = parallaxSceneSnapshot(store, 'live');
  ok(snap.steps > 0, `steps banked (${snap.steps})`);
  const byTier = new Map();
  for (const it of items) {
    const h = homeByKey.get(it.key);
    const dx = it.x - h.x;
    const expected = parallaxDriftOffset(it.zTier, 1, snap.tSec);
    ok(Math.abs(dx - expected) < 1e-9, `tier ${it.zTier} drift is the pure function of the step count (${dx.toFixed(3)} vs ${expected.toFixed(3)})`);
    ok(it.y === h.y, 'drift is x-only: y is home, bit-exact');
    if (!byTier.has(it.zTier)) byTier.set(it.zTier, []);
    byTier.get(it.zTier).push(dx);
  }
  const mean = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;
  const tiers = [...byTier.keys()].sort((x, y) => x - y);
  ok(tiers.length >= 3, `the cast spans strata (${tiers.join('/')})`);
  for (let i = 1; i < tiers.length; i++) {
    ok(mean(byTier.get(tiers[i])) > mean(byTier.get(tiers[i - 1])), 'foreground strata travel faster than ground, tier by tier');
  }
  ok(mean(byTier.get(0)) === 0, 'the ground stratum is exactly home');

  // Determinism: uneven frames replay bit-for-bit on a fresh store.
  const DT = [16.7, 16.7, 33.3, 8, 16.7, 50, 12.5];
  const run = () => {
    const s = createParallaxStore();
    const hashes = [];
    for (let f = 0; f < 300; f++) hashes.push(frameHash(place(DRIFT_LP, { store: s, sceneId: 'det', frameMs: DT[f % DT.length], shed: false })));
    return hashes;
  };
  assert.deepEqual(run(), run(), 'two fresh stores, one uneven input sequence: every frame identical');
  checks++;

  // Step-chunking: the same total frame time in different slices lands
  // on the same step count and the same drift (the locked-step law).
  const stepped = (slices) => {
    const s = createParallaxStore();
    const soa = { n: 1, x: new Float64Array([500]), y: new Float64Array([350]), zTier: new Uint16Array([3]), index: new Uint32Array([0]) };
    let presented = 0;
    for (const ms of slices) {
      const u = applyParallaxDrift(soa, { seed: 9, drift: { amount: 1, store: s, sceneId: 'chunk', frameMs: ms, shed: false } });
      presented = soa.x[0];
      if (u) u();
    }
    return { snap: parallaxSceneSnapshot(s, 'chunk'), presented };
  };
  const whole = stepped([100, 100, 100, 100]);
  const sliced = stepped([50, 50, 50, 50, 50, 50, 50, 50]);
  assert.equal(whole.snap.steps, 24, '400 ms at the locked step is 24 steps');
  checks++;
  assert.deepEqual(sliced.snap, whole.snap, '50 ms slices == 100 ms slices (same step count)');
  ok(Math.abs(whole.presented - (500 + parallaxDriftOffset(3, 1, 24 * TRAVEL_STEP_SEC))) < 1e-9, 'the presented drift is the step count’s pure function');

  // Shed: home now, clock frozen, resume continues from the frozen
  // count — the drift never jumps to where its clock would have been.
  const storeS = createParallaxStore();
  for (let f = 0; f < 40; f++) place(DRIFT_LP, { store: storeS, sceneId: 's', frameMs: 1000 / 60, shed: false });
  const stepsBefore = parallaxSceneSnapshot(storeS, 's').steps;
  const shedItems = place(DRIFT_LP, { store: storeS, sceneId: 's', frameMs: 1000 / 60, shed: true });
  assert.equal(frameHash(shedItems), frameHash(homes), 'a shed drift frame is the still frame, bit for bit');
  checks++;
  for (let f = 0; f < 30; f++) place(DRIFT_LP, { store: storeS, sceneId: 's', frameMs: 1000 / 60, shed: true });
  assert.equal(parallaxSceneSnapshot(storeS, 's').steps, stepsBefore, 'the drift clock freezes under shed');
  checks++;
  let resumed = null;
  for (let f = 0; f < 10; f++) resumed = place(DRIFT_LP, { store: storeS, sceneId: 's', frameMs: 1000 / 60, shed: false });
  const snapR = parallaxSceneSnapshot(storeS, 's');
  const it0 = resumed.find((it) => it.zTier === 3);
  const h0 = homeByKey.get(it0.key);
  ok(Math.abs((it0.x - h0.x) - parallaxDriftOffset(3, 1, snapR.tSec)) < 1e-9, 'resume continues from the frozen count, not the wall clock');
  pruneParallaxStore(storeS, new Set(['other']));
  assert.equal(parallaxSceneSnapshot(storeS, 's'), null, 'prune drops a removed scene');
  checks++;

  // The artist's pin tames: pinned-asset marks never drift.
  const storeP = createParallaxStore();
  const kinemePin = { seed: 42, driverSec: 0, boilStep: 0, amounts: {}, canvasW: W, canvasH: H, shedTier: 0, stillAssets: new Set(['a']) };
  let pinned = null;
  for (let f = 0; f < 40; f++) pinned = place(DRIFT_LP, { store: storeP, sceneId: 'pin', frameMs: 1000 / 60, shed: false }, { kineme: kinemePin });
  let pinOk = 0, freeMoved = 0;
  for (const it of pinned) {
    const h = homeByKey.get(it.key);
    if (it.assetId === 'a') { if (it.x === h.x) pinOk++; }
    else if (it.x !== h.x) freeMoved++;
  }
  ok(pinOk > 0 && freeMoved > 0, `pinned marks hold home while the rest drift (pinned-home ${pinOk}, free-drifted ${freeMoved})`);
  console.log('parallaxDrift.selfcheck B live: parity, exact per-tier drift, determinism, chunking, shed freeze, pin');
}

// ── C. cost ──────────────────────────────────────────────────────────────
{
  const decl = getCostTier('travel/parallax');
  ok(!!decl && decl.tier === 0 && decl.timeMs > 0, 'travel/parallax is declared, tier 0, with a measured timeMs');
  const n = 800;
  const soa = { n, x: new Float64Array(n), y: new Float64Array(n), zTier: new Uint16Array(n), index: new Uint32Array(n) };
  for (let k = 0; k < n; k++) { soa.x[k] = (k % 40) * 25; soa.y[k] = Math.floor(k / 40) * 35; soa.zTier[k] = k % 4; soa.index[k] = k; }
  const medians = [];
  for (let run = 0; run < 7; run++) {
    const store = createParallaxStore();
    const ctx = { seed: 7, drift: { amount: 1, store, sceneId: 'cost', frameMs: 1000 / 60, shed: false } };
    for (let i = 0; i < 60; i++) { const u = applyParallaxDrift(soa, ctx); if (u) u(); }
    const times = [];
    for (let i = 0; i < 200; i++) {
      const t0 = performance.now();
      const u = applyParallaxDrift(soa, ctx);
      times.push(performance.now() - t0);
      if (u) u();
    }
    times.sort((a, b) => a - b);
    medians.push(times[100]);
  }
  medians.sort((a, b) => a - b);
  const measured = medians[3];
  ok(measured < 2.0, `measured ${measured.toFixed(3)} ms at the 800-mark cap sits inside the 2.0 ms class allowance`);
  console.log(`parallaxDrift.selfcheck C cost: declared ${decl.timeMs} ms; re-measured median-of-medians ${measured.toFixed(3)} ms @800 marks, 1 step + present (sandbox)`);
}

// ── D. params ────────────────────────────────────────────────────────────
{
  assert.deepEqual(PARAM_SPEC.transportParallax, { min: 0, max: 1 });
  checks++;
  assert.equal(DEFAULT_LAYOUT_PARAMS.transportParallax, 0, 'the shipped default is 0 (off — parity)');
  checks++;
  assert.equal(normalizeLayoutParams({ transportParallax: 99 }).transportParallax, 1, 'the amount clamps at the trust boundary');
  checks++;
  assert.equal(normalizeLayoutParams({}).transportParallax, 0, 'a pre-#1576 document opens with drift off');
  checks++;
  const v = validateLayoutParams({ transportParallax: null });
  ok(v.rejected.includes('transportParallax'), 'a non-numeric drift amount is rejected at the trust boundary');
  console.log('parallaxDrift.selfcheck D params: spec, default-off, clamp and trust boundary all hold');
}

console.log(`parallaxDrift.selfcheck: ok — ${checks} checks passed (#1576 P3 parallax drift)`);
