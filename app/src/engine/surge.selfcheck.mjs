// node src/engine/surge.selfcheck.mjs
// #1576 — travel kinemes P3: SURGE (engine/surge.js). The issue's
// acceptance, pinned — with the Q3 carve-out: the trigger is an INPUT
// SIGNAL here (synthetic envelopes), because what fires a surge in the
// instrument has no ruling from Matt and no surface is built.
//   A. ENVELOPE LAWS — the pure envelope: anticipation dip, approach,
//      held peak, eased release, exact zeros outside its life.
//   B. ANTICIPATION, MEASURED — through the applier, step by step: the
//      mark settles AWAY (z < 0, presented scale below home) for a
//      quantified span before z crosses zero; the envelope leaves home
//      gently (no full-speed start); the peak is +1 and holds.
//   C. THE Z READ — surgeZRead is exact: z 0 is identity, z +1 is the
//      declared scale-up / rise / sharpening, z < 0 inverts them.
//   D. LIVE THROUGH buildPlacements — parity when off (amount 0,
//      trigger inert, no input), replay determinism over an uneven
//      trigger sequence, the peak presentation through the real path
//      (what the packer packs), release home bit-exact, the shed kill,
//      the trigger edge law, the artist's pin.
//   E. COST — declared tier 0 with a measured timeMs, re-measured here.
//   F. PARAMS — the recipe key normalizes/clamps like every other.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildPlacements } from './buildPlacements.js';
import {
  createSurgeStore, pruneSurgeStore, surgeSceneSnapshot, applySurge,
  surgeEnvelope, surgeZRead, SURGE_STEPS, SURGE_ANTICIPATION_Z,
  SURGE_SCALE_PER_Z, SURGE_RISE_PX_PER_Z, SURGE_ALPHA_PER_Z,
} from './surge.js';
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
  alpha: [60, 100], jitter: 10, density: 100, zTiers: 1, bleed: false, mirror: false,
  overlap: true, displacement: 0, noiseFreq: 0.005, noiseSpeed: 0.5, ...over,
});
const place = (params, surge, extra = {}) => buildPlacements({
  layoutParams: params, seed: 42, activeAssets: ASSETS, palette: PALETTE, caps: CAPS,
  canvasW: W, canvasH: H, surge, ...extra,
}).items;
const frameHash = (items) => createHash('sha256')
  .update(items.map((it) => `${it.x},${it.y},${it.scale},${it.rotation},${it.alpha}`).join('|'))
  .digest('hex');

// ── A. envelope laws ─────────────────────────────────────────────────────
{
  assert.equal(surgeEnvelope(0), 0); assert.equal(surgeEnvelope(1), 0);
  assert.equal(surgeEnvelope(-0.5), 0); assert.equal(surgeEnvelope(2), 0);
  checks += 4;
  // Anticipation: the whole first joint is at or below zero, bottoming
  // at the declared dip.
  let min = 0;
  for (let i = 0; i <= 100; i++) {
    const p = (i / 100) * 0.18;
    const z = surgeEnvelope(p);
    ok(z <= 0, `anticipation never approaches (z ${z} at phase ${p})`);
    if (z < min) min = z;
  }
  ok(Math.abs(min - SURGE_ANTICIPATION_Z) < 0.01, `the dip reaches the declared depth (${min.toFixed(3)} vs ${SURGE_ANTICIPATION_Z})`);
  // The peak holds at exactly +1 across the hold joint.
  for (const p of [0.55, 0.6, 0.65, 0.699]) assert.equal(surgeEnvelope(p), 1, `peak holds at phase ${p}`);
  checks += 4;
  // Release lands on 0 and the envelope is continuous (no step anywhere
  // exceeds a small per-phase bound at fine grain).
  let prev = surgeEnvelope(0);
  for (let i = 1; i <= 1000; i++) {
    const z = surgeEnvelope(i / 1000);
    ok(Math.abs(z - prev) < 0.02, 'the envelope never jumps');
    prev = z;
  }
  console.log('surge.selfcheck A envelope: dip → approach → held peak → eased release, continuous');
}

// ── B. anticipation, measured through the applier ────────────────────────
{
  const store = createSurgeStore();
  const soa = {
    n: 1, x: new Float64Array([500]), y: new Float64Array([350]),
    scale: new Float64Array([1]), scaleY: new Float64Array([1]),
    alpha: new Float64Array([80]), index: new Uint32Array([0]),
  };
  const ctx = (trigger) => ({ seed: 9, surge: { amount: 1, store, sceneId: 'antic', frameMs: 1000 / 60, shed: false, trigger } });
  const trace = [];
  for (let s = 0; s < SURGE_STEPS + 30; s++) {
    soa.scale[0] = 1; soa.scaleY[0] = 1; soa.alpha[0] = 80; soa.y[0] = 350; // stage C re-derives these per frame live
    const u = applySurge(soa, ctx(s === 0 ? 1 : 0));
    const snap = surgeSceneSnapshot(store, 'antic');
    trace.push({ z: snap.active ? snap.envZ : 0, scale: soa.scale[0], y: soa.y[0], alpha: soa.alpha[0] });
    if (u) u();
  }
  const minZ = Math.min(...trace.map((t) => t.z));
  const crossStep = trace.findIndex((t) => t.z > 0);
  ok(minZ < -0.20 && minZ >= SURGE_ANTICIPATION_Z - 0.002, `anticipation dip measured: min z ${minZ.toFixed(3)} (declared ${SURGE_ANTICIPATION_Z})`);
  ok(crossStep >= 17, `z stays away for ${crossStep} locked steps (~${(crossStep * TRAVEL_STEP_SEC).toFixed(2)} s) before crossing zero`);
  ok(trace.slice(0, crossStep).every((t) => t.scale <= 1), 'through the whole settle the presented scale is at or below home (the settle AWAY, in presentation)');
  const dipScale = Math.min(...trace.slice(0, crossStep).map((t) => t.scale));
  ok(dipScale < 0.90, `the settle reads in presentation: scale dips to ${dipScale.toFixed(3)} before the approach`);
  ok(Math.abs(trace[1].z) < 0.03, `no full-speed start: |z| one step in is ${Math.abs(trace[1].z).toFixed(3)}`);
  const peak = trace.reduce((a, t, i) => (t.z > a.z ? { z: t.z, i } : a), { z: -1, i: -1 });
  ok(peak.z === 1, 'the envelope peaks at exactly z +1');
  ok(Math.abs(trace[peak.i].scale - (1 + SURGE_SCALE_PER_Z)) < 1e-9, 'at the peak the presented scale is the declared read');
  ok(Math.abs(trace[peak.i].y - (350 - SURGE_RISE_PX_PER_Z)) < 1e-9, 'at the peak the mark has risen the declared px');
  const settled = trace[trace.length - 1];
  ok(settled.z === 0 && settled.scale === 1 && settled.y === 350 && settled.alpha === 80, 'after the envelope the mark is home, exactly');
  console.log(`surge.selfcheck B anticipation: dip ${minZ.toFixed(3)} held ${crossStep} steps, scale dip ${dipScale.toFixed(3)}, peak z +1 at step ${peak.i}`);
}

// ── C. the z read ────────────────────────────────────────────────────────
{
  assert.deepEqual(surgeZRead(0), { scaleMul: 1, risePx: 0, alphaLerp: 0 });
  checks++;
  const one = surgeZRead(1);
  ok(one.scaleMul === 1 + SURGE_SCALE_PER_Z && one.risePx === SURGE_RISE_PX_PER_Z && one.alphaLerp === SURGE_ALPHA_PER_Z,
    'z +1 reads as the declared scale-up + rise + sharpening');
  const away = surgeZRead(SURGE_ANTICIPATION_Z);
  ok(away.scaleMul < 1 && away.risePx < 0 && away.alphaLerp < 0, 'negative z inverts the read (smaller, sunk, softer — the settle)');
  console.log('surge.selfcheck C z-read: identity at 0, declared read at +1, inverted in the dip');
}

// ── D. live through buildPlacements ──────────────────────────────────────
{
  const SURGE_LP = lp({ transportSurge: 1 });
  const homes = place(lp(), null);
  // Parity: amount 0 with a live trigger changes nothing, touches nothing.
  const store0 = createSurgeStore();
  const off = place(lp({ transportSurge: 0 }), { store: store0, sceneId: 'a', frameMs: 100, shed: false, trigger: 1 });
  assert.equal(frameHash(off), frameHash(homes), 'amount 0 + trigger is bit-identical');
  checks++;
  assert.equal(store0.scenes.size, 0, 'amount 0 never creates envelope state');
  checks++;
  // Inert by default: amount up, trigger 0/absent — no envelope, home frames.
  const storeI = createSurgeStore();
  let inert = null;
  for (let f = 0; f < 60; f++) inert = place(SURGE_LP, { store: storeI, sceneId: 'i', frameMs: 1000 / 60, shed: false, trigger: 0 });
  assert.equal(frameHash(inert), frameHash(homes), 'no trigger → no surge, however long it runs (Q3 inert default)');
  checks++;
  assert.equal(surgeSceneSnapshot(storeI, 'i').active, false, 'the envelope never fired');
  checks++;

  // Determinism: an uneven frame sequence with a synthetic trigger
  // pattern replays bit-for-bit on a fresh store.
  const DT = [16.7, 16.7, 33.3, 8, 16.7, 50, 12.5];
  const run = () => {
    const store = createSurgeStore();
    const hashes = [];
    for (let f = 0; f < 300; f++) {
      const trigger = (f >= 10 && f < 13) || (f >= 200 && f < 203) ? 1 : 0;
      hashes.push(frameHash(place(SURGE_LP, { store, sceneId: 'det', frameMs: DT[f % DT.length], shed: false, trigger })));
    }
    return hashes;
  };
  const a = run(); const b = run();
  assert.deepEqual(a, b, 'two fresh stores, one uneven trigger sequence: every frame identical');
  checks++;
  ok(new Set(a).size > 50, 'the run actually surges (frames differ across the envelopes)');

  // The peak presentation through the real path — the values the packer
  // packs: scale-up, rise, sharpened alpha, per item.
  const store = createSurgeStore();
  let items = null;
  for (let f = 0; f < 60; f++) items = place(SURGE_LP, { store, sceneId: 'pk', frameMs: 1000 / 60, shed: false, trigger: f === 0 ? 1 : 0 });
  const homeByKey = new Map(homes.map((it) => [it.key, it]));
  let peakChecked = 0;
  for (const it of items) {
    const h = homeByKey.get(it.key);
    if (Math.abs(it.scale / h.scale - (1 + SURGE_SCALE_PER_Z)) < 1e-9) {
      peakChecked++;
      ok(Math.abs(it.y - (h.y - SURGE_RISE_PX_PER_Z)) < 1e-9, 'peak rise is the declared px');
      ok(Math.abs(it.alpha - (h.alpha + (100 - h.alpha) * SURGE_ALPHA_PER_Z)) < 1e-6, 'peak alpha is the declared sharpening');
    }
  }
  ok(peakChecked === items.length, `every mark presents at the peak read (${peakChecked}/${items.length})`);
  // Release: run the envelope out with the trigger low — home, bit-exact.
  for (let f = 0; f < 80; f++) items = place(SURGE_LP, { store, sceneId: 'pk', frameMs: 1000 / 60, shed: false, trigger: 0 });
  assert.equal(frameHash(items), frameHash(homes), 'after the envelope, frames are the still frames, bit for bit');
  checks++;

  // Trigger edge law: a HELD trigger fires once; a mid-flight trigger is
  // ignored; a fresh edge after release fires again.
  const storeE = createSurgeStore();
  let fires = 0; let wasActive = false;
  for (let f = 0; f < 400; f++) {
    place(SURGE_LP, { store: storeE, sceneId: 'e', frameMs: 1000 / 60, shed: false, trigger: 1 });
    const act = surgeSceneSnapshot(storeE, 'e').active;
    if (act && !wasActive) fires++;
    wasActive = act;
  }
  assert.equal(fires, 1, 'a held trigger fires exactly one envelope');
  checks++;
  const storeM = createSurgeStore();
  for (let f = 0; f < 30; f++) place(SURGE_LP, { store: storeM, sceneId: 'm', frameMs: 1000 / 60, shed: false, trigger: f === 0 ? 1 : 0 });
  const midBefore = surgeSceneSnapshot(storeM, 'm');
  for (let f = 0; f < 5; f++) place(SURGE_LP, { store: storeM, sceneId: 'm', frameMs: 1000 / 60, shed: false, trigger: 0 });
  place(SURGE_LP, { store: storeM, sceneId: 'm', frameMs: 1000 / 60, shed: false, trigger: 1 }); // mid-flight edge attempt
  const midAfter = surgeSceneSnapshot(storeM, 'm');
  ok(midAfter.active && midAfter.phaseSteps > midBefore.phaseSteps, 'a mid-flight trigger does not restart the envelope');

  // Shed: the envelope dies where it stands, the frame is home, and a
  // trigger held through the shed does not fire on restore.
  const storeS = createSurgeStore();
  for (let f = 0; f < 30; f++) place(SURGE_LP, { store: storeS, sceneId: 's', frameMs: 1000 / 60, shed: false, trigger: f === 0 ? 1 : 0 });
  ok(surgeSceneSnapshot(storeS, 's').active, 'the envelope is live before the shed');
  const shedItems = place(SURGE_LP, { store: storeS, sceneId: 's', frameMs: 1000 / 60, shed: true, trigger: 1 });
  assert.equal(frameHash(shedItems), frameHash(homes), 'a shed surge frame is the still frame, bit for bit');
  checks++;
  assert.equal(surgeSceneSnapshot(storeS, 's').active, false, 'the shed killed the envelope');
  checks++;
  const afterShed = place(SURGE_LP, { store: storeS, sceneId: 's', frameMs: 1000 / 60, shed: false, trigger: 1 });
  assert.equal(frameHash(afterShed), frameHash(homes), 'a trigger held through the shed stays swallowed (no edge on restore)');
  checks++;
  pruneSurgeStore(storeS, new Set(['other']));
  assert.equal(surgeSceneSnapshot(storeS, 's'), null, 'prune drops a removed scene');
  checks++;

  // The artist's pin tames: pinned-asset marks keep z 0 at the peak.
  const storeP = createSurgeStore();
  const kinemePin = { seed: 42, driverSec: 0, boilStep: 0, amounts: {}, canvasW: W, canvasH: H, shedTier: 0, stillAssets: new Set(['a']) };
  let pinned = null;
  for (let f = 0; f < 60; f++) pinned = place(SURGE_LP, { store: storeP, sceneId: 'pin', frameMs: 1000 / 60, shed: false, trigger: f === 0 ? 1 : 0 }, { kineme: kinemePin });
  let pinOk = 0, freeMoved = 0;
  for (const it of pinned) {
    const h = homeByKey.get(it.key);
    if (it.assetId === 'a') { if (it.scale === h.scale && it.y === h.y && it.alpha === h.alpha) pinOk++; }
    else if (it.scale !== h.scale) freeMoved++;
  }
  ok(pinOk > 0 && freeMoved > 0, `pinned marks hold home z while the rest surge (pinned-home ${pinOk}, free-surged ${freeMoved})`);
  console.log('surge.selfcheck D live: parity, inert default, determinism, peak read, release, edge law, shed kill, pin');
}

// ── E. cost ──────────────────────────────────────────────────────────────
{
  const decl = getCostTier('travel/surge');
  ok(!!decl && decl.tier === 0 && decl.timeMs > 0, 'travel/surge is declared, tier 0, with a measured timeMs');
  const n = 800;
  const soa = {
    n, x: new Float64Array(n), y: new Float64Array(n),
    scale: new Float64Array(n), scaleY: new Float64Array(n), alpha: new Float64Array(n),
    index: new Uint32Array(n),
  };
  for (let k = 0; k < n; k++) { soa.x[k] = (k % 40) * 25; soa.y[k] = Math.floor(k / 40) * 35; soa.scale[k] = 1; soa.scaleY[k] = 1; soa.alpha[k] = 80; soa.index[k] = k; }
  const medians = [];
  for (let run = 0; run < 7; run++) {
    const store = createSurgeStore();
    const ctx = (trigger) => ({ seed: 7, surge: { amount: 1, store, sceneId: 'cost', frameMs: 1000 / 60, shed: false, trigger } });
    applySurge(soa, ctx(1)); // fire; the timed loop rides the envelope (re-fired on expiry by the pattern below)
    const times = [];
    for (let i = 0; i < 200; i++) {
      const snap = surgeSceneSnapshot(store, 'cost');
      const t0 = performance.now();
      const u = applySurge(soa, ctx(snap && !snap.active ? 1 : 0));
      times.push(performance.now() - t0);
      if (u) u();
    }
    times.sort((a, b) => a - b);
    medians.push(times[100]);
  }
  medians.sort((a, b) => a - b);
  const measured = medians[3];
  ok(measured < 2.0, `measured ${measured.toFixed(3)} ms at the 800-mark cap sits inside the 2.0 ms class allowance`);
  console.log(`surge.selfcheck E cost: declared ${decl.timeMs} ms; re-measured median-of-medians ${measured.toFixed(3)} ms @800 marks, envelope live (sandbox)`);
}

// ── F. params ────────────────────────────────────────────────────────────
{
  assert.deepEqual(PARAM_SPEC.transportSurge, { min: 0, max: 1 });
  checks++;
  assert.equal(DEFAULT_LAYOUT_PARAMS.transportSurge, 0, 'the shipped default is 0 (off — parity)');
  checks++;
  assert.equal(normalizeLayoutParams({ transportSurge: 99 }).transportSurge, 1, 'the amount clamps at the trust boundary');
  checks++;
  assert.equal(normalizeLayoutParams({}).transportSurge, 0, 'a pre-#1576 document opens with surge off');
  checks++;
  const v = validateLayoutParams({ transportSurge: 'abc' });
  ok(v.rejected.includes('transportSurge'), 'a non-numeric surge amount is rejected at the trust boundary');
  console.log('surge.selfcheck F params: spec, default-off, clamp and trust boundary all hold');
}

console.log(`surge.selfcheck: ok — ${checks} checks passed (#1576 P3 surge)`);
