// node src/engine/surge.selfcheck.mjs
// #1576 — travel kinemes P3: SURGE (engine/surge.js). The issue's
// acceptance, pinned. P3 drove the trigger as an INPUT SIGNAL here
// (synthetic envelopes); Q3 (ruled by Matt, 2026-10-20) made the
// trigger the Queen's call — sections G–J pin her stamp.
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
//   G. THE QUEEN'S READ (M9, through her Director host) — below her
//      keeps floor she is identity; a keep landing near her kept-taste
//      centroid is answered at the proximity's strength; a far keep,
//      no call. (The pure mechanic's own pins live in its home suite.)
//   H. HOST + FRAME SEAM (director) — pull hygiene (pattern keeps
//      neither build the anchor nor call), one pulse per keep, the
//      found ledger is history and does not call, a shrink resyncs.
//   I. END-TO-END + PARITY — her stamp on the resolver input fires the
//      envelope through buildPlacements and releases home bit-exact;
//      no recorded Queen state → trigger 0 and the frames are the
//      still frames; the stamp rides the take's input log.
//   J. DETERMINISM + COST OF THE STAMP — the same recorded ledger
//      stamps the same demand (repeat calls, a JSON round-trip of the
//      ledger, a rebuilt ledger); the stamp's measured cost.
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
import { queenSurgeCall, nextSurgeStamp } from '../curator/director.js';
import { createInputLog, replayInputs } from './kernel/replay/inputLog.js';

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

// ── Q3 fixtures: recorded keeps, in the pull's own shape ─────────────────
// A keep is { config: { layout }, stack: { l: [...] } } (davisSlice's
// ledger, kc:keeps:v1). NEAR keeps all carry the same layout, so their
// centroid IS that layout's feature map and a new keep with the same
// layout lands at proximity ~1; FAR_LAYOUT is its opposite on every
// axis the features read (measured 0.63 against the NEAR centroid —
// below her 0.72 bar).
const keepOf = (layout, over = {}) => ({ config: { layout }, stack: { l: [] }, ...over });
const NEAR_LAYOUT = lp();
const FAR_LAYOUT = {
  ...lp(), mode: 'swarm', composition: 'scatter', count: 700, scale: [1.6, 2.4],
  rotate: [120, 360], alpha: [5, 30], jitter: 90, density: 8, zTiers: 6,
  bleed: true, mirror: true, overlap: false, displacement: 0.9,
  noiseFreq: 0.09, noiseSpeed: 3,
};
const nearKeeps = (n) => Array.from({ length: n }, () => keepOf({ ...NEAR_LAYOUT }));

// ── G. the Queen's read (M9, through her Director host) ──────────────────
// The host splits the counted ledger — newest judged against the rest —
// so the floor reads here as: 8 counted keeps = the newest has only 7
// priors, anchor not live, no call. (The mechanic's own pins — the
// prior-count split at the function, the gate wrapper — live in its
// home suite in curator/.)
{
  assert.equal(queenSurgeCall({ keeps: nearKeeps(8) }), 0);
  checks++;
  // The anchor live + a keep landing on her taste: answered at the
  // proximity's strength (identical layout → proximity ~1).
  const near = queenSurgeCall({ keeps: nearKeeps(9) });
  ok(near > 0.99 && near <= 1, `a keep on her centroid is answered at strength ${near.toFixed(4)}`);
  // A far keep is not answered, however established the anchor.
  assert.equal(queenSurgeCall({ keeps: [...nearKeeps(8), keepOf({ ...FAR_LAYOUT })] }), 0);
  checks++;
  // Nothing to judge, or nothing to judge against: no call.
  assert.equal(queenSurgeCall({ keeps: [...nearKeeps(8), { config: {}, stack: { l: [] } }] }), 0);
  checks++;
  assert.equal(queenSurgeCall({ keeps: Array.from({ length: 9 }, () => ({ stack: { l: [] } })) }), 0);
  checks++;
  console.log(`surge.selfcheck G queen-read: floor identity, near keep answered at ${near.toFixed(4)}, far keep silent`);
}

// ── H. host + frame seam (director) ──────────────────────────────────────
{
  // The host splits the counted ledger: newest judged against the rest.
  const stamp = queenSurgeCall({ keeps: nearKeeps(9) });
  ok(stamp > 0.99, `the host answers the 9th near keep at ${stamp.toFixed(4)}`);
  // A pattern-layer keep neither builds the anchor nor calls: 8 plain
  // keeps + a pattern keep on top still reads as an 8-ledger whose
  // newest has only 7 priors — below the floor, no call.
  const withPattern = [...nearKeeps(8), keepOf({ ...NEAR_LAYOUT }, { stack: { l: [{ type: 'pattern' }] } })];
  assert.equal(queenSurgeCall({ keeps: withPattern }), 0);
  checks++;
  assert.equal(queenSurgeCall({ keeps: [] }), 0);
  checks++;
  assert.equal(queenSurgeCall({}), 0);
  checks++;

  // The seam script: (seen, ledger) → one pulse per counted keep.
  // Keeps land the way the store lands them — a NEW array per append
  // (davisSlice: keeps: [...state.keeps, entry]) — which is what the
  // pull's identity memo reads; the script honours that shape.
  const script = () => {
    const out = [];
    let ledger = nearKeeps(9);
    let seen = -1;
    let r = nextSurgeStamp(seen, ledger); out.push(r.stamp); seen = r.seen; // found ledger: history, no call
    r = nextSurgeStamp(seen, ledger); out.push(r.stamp); seen = r.seen; // no growth: 0
    ledger = [...ledger, keepOf({ ...FAR_LAYOUT })];
    r = nextSurgeStamp(seen, ledger); out.push(r.stamp); seen = r.seen; // a far keep lands: no call
    ledger = [...ledger, keepOf({ ...NEAR_LAYOUT })];
    r = nextSurgeStamp(seen, ledger); out.push(r.stamp); seen = r.seen; // a near keep lands: THE call
    r = nextSurgeStamp(seen, ledger); out.push(r.stamp); seen = r.seen; // same ledger again: never twice
    r = nextSurgeStamp(seen, ledger.slice(0, 4)); out.push(r.stamp); seen = r.seen; // shrink: resync, no call
    assert.equal(seen, 4);
    return out;
  };
  const seq = script();
  assert.deepEqual(seq.slice(0, 3), [0, 0, 0]);
  checks++;
  ok(seq[3] > 0.99, `the pulse fires exactly on the near keep's frame (${seq[3].toFixed(4)})`);
  assert.deepEqual(seq.slice(4), [0, 0]);
  checks++;
  assert.deepEqual(script(), seq, 'the same recorded script replays to the same stamp sequence');
  checks++;
  console.log('surge.selfcheck H seam: one pulse per counted keep, history silent, shrink resyncs, script deterministic');
}

// ── I. end-to-end through the resolver input + parity + the input log ────
{
  const SURGE_LP = lp({ transportSurge: 1 });
  const homes = place(lp(), null);
  const stamp = queenSurgeCall({ keeps: nearKeeps(9) });
  ok(stamp > 0, 'the fixture ledger produces a stamp');

  // The stamped frame, driven exactly as liveResolve drives it: the
  // surge base { store, frameMs, shed, trigger } + sceneId, the trigger
  // on the landing frame only (the seam's one pulse).
  const store = createSurgeStore();
  const base = { store, sceneId: 'queen', frameMs: 1000 / 60, shed: false };
  let items = null;
  let peakRatio = 0;
  for (let f = 0; f < 150; f++) {
    items = place(SURGE_LP, { ...base, trigger: f === 0 ? stamp : 0 });
    if (f === 53) {
      const h0 = homes[0];
      peakRatio = items[0].scale / h0.scale;
    }
  }
  ok(Math.abs(peakRatio - (1 + SURGE_SCALE_PER_Z * stamp)) < 1e-6,
    `at the peak the presentation is the declared read at her strength (scale ×${peakRatio.toFixed(4)} = 1 + ${SURGE_SCALE_PER_Z} × ${stamp.toFixed(4)})`);
  assert.equal(frameHash(items), frameHash(homes), 'after her envelope, frames are the still frames, bit for bit');
  checks++;

  // Parity: no recorded Queen state → the stamp is 0, and 0 changes
  // nothing, however long it runs — the pre-Q3 instrument, exactly.
  const noStamp = queenSurgeCall({ keeps: [] });
  assert.equal(noStamp, 0);
  checks++;
  const storeP = createSurgeStore();
  let parity = null;
  for (let f = 0; f < 150; f++) parity = place(SURGE_LP, { store: storeP, sceneId: 'queen0', frameMs: 1000 / 60, shed: false, trigger: noStamp });
  assert.equal(frameHash(parity), frameHash(homes), 'no Queen state → trigger 0 → still frames, bit for bit');
  checks++;
  assert.equal(surgeSceneSnapshot(storeP, 'queen0').active, false, 'no envelope ever fired');
  checks++;

  // The take's input log carries the stamp: recorded like every other
  // input key, replayed exactly; a pre-Q3 input (no key at all) stays
  // keyless in the log — liveResolve's ?? 0 reads those takes inert.
  const log = createInputLog();
  const frameInput = (t) => (t === null ? { seed: 42, loopTimeMs: 0 } : { seed: 42, loopTimeMs: 0, surgeTrigger: t });
  log.record(frameInput(0));
  log.record(frameInput(0));
  log.record(frameInput(stamp));
  log.record(frameInput(0));
  const replayed = [...replayInputs(log.finish())];
  assert.equal(replayed.length, 4);
  checks++;
  assert.equal(replayed[2].surgeTrigger, stamp, 'the stamped frame replays with the stamp intact');
  checks++;
  assert.equal(replayed[0].surgeTrigger, 0);
  checks++;
  assert.equal(replayed[3].surgeTrigger, 0);
  checks++;
  const preLog = createInputLog();
  preLog.record(frameInput(null));
  const [pre] = [...replayInputs(preLog.finish())];
  ok(!('surgeTrigger' in pre), 'a pre-Q3 take carries no stamp key (the resolver defaults it to 0)');
  console.log('surge.selfcheck I end-to-end: stamp → envelope → home bit-exact; no state → parity; the input log carries the stamp');
}

// ── J. determinism + the stamp's cost ────────────────────────────────────
{
  const ledger = [...nearKeeps(9), keepOf({ ...FAR_LAYOUT }), keepOf({ ...NEAR_LAYOUT })];
  const first = queenSurgeCall({ keeps: ledger });
  ok(first > 0, 'the mixed ledger calls on its newest (near) keep');
  for (let i = 0; i < 3; i++) assert.equal(queenSurgeCall({ keeps: ledger }), first);
  checks++;
  // The ledger AS RECORDED (JSON — kc:keeps:v1 is stored JSON) stamps
  // the identical demand: the call reads recorded state, not identity.
  const recorded = JSON.parse(JSON.stringify(ledger));
  assert.equal(queenSurgeCall({ keeps: recorded }), first);
  checks++;
  // A rebuilt, structurally identical ledger: the same call again.
  assert.equal(queenSurgeCall({ keeps: [...nearKeeps(9), keepOf({ ...FAR_LAYOUT }), keepOf({ ...NEAR_LAYOUT })] }), first);
  checks++;

  // Cost, measured like section E measures the pass: the stamp is
  // once-per-keep curation work (a centroid + one proximity over the
  // ledger), and the per-frame seam is a memoised length read. Neither
  // is a resolver or GPU cost; the numbers are printed, the bounds are
  // sanity rails only.
  const big = nearKeeps(40);
  const callTimes = [];
  for (let i = 0; i < 200; i++) {
    const t0 = performance.now();
    queenSurgeCall({ keeps: big });
    callTimes.push(performance.now() - t0);
  }
  callTimes.sort((a, b) => a - b);
  const callMs = callTimes[100];
  ok(callMs < 2.0, `the stamp computation at a 40-keep ledger: ${callMs.toFixed(3)} ms median, once per keep`);
  const seamTimes = [];
  for (let i = 0; i < 200; i++) {
    const t0 = performance.now();
    nextSurgeStamp(40, big);
    seamTimes.push(performance.now() - t0);
  }
  seamTimes.sort((a, b) => a - b);
  const seamMs = seamTimes[100];
  ok(seamMs < 2.0, `the per-frame seam (no growth): ${seamMs.toFixed(4)} ms median`);
  console.log(`surge.selfcheck J determinism + cost: identical stamps across repeats/records/rebuilds; stamp ${callMs.toFixed(3)} ms per keep, seam ${seamMs.toFixed(4)} ms per frame (sandbox)`);
}

console.log(`surge.selfcheck: ok — ${checks} checks passed (#1576 P3 surge + Q3 the Queen's stamp)`);
