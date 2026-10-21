// node src/engine/travel.selfcheck.mjs
// #1574 — travel kinemes P1 (transport core). The issue's acceptance, pinned:
//   A. PARITY — transport 'still' (the default) or leash 0 produces a
//      bit-identical item stream to the pre-#1574 pipeline: the sim never
//      runs, its store is never touched, and an off scene is today's frame.
//   B. DETERMINISM — same seed + same step count = same positions, bit for
//      bit: two fresh stores over an uneven frame-time sequence hash
//      identically every frame, and different chunkings of the same total
//      frame time (never hitting the step cap) land on the same trajectory.
//   C. FLOW LIVE — through the real placement path (buildPlacements), marks
//      roam from home, stay leashed, and the sim state survives a placement
//      rebuild (it lives in the caller's store, not the geometry cache).
//   D. THE LEASH — no home force inside radius L (an offset inside, at rest,
//      with no drive, is bit-exact forever); outside it the spring returns
//      the mark WITH the underdamped overshoot (it crosses inside L).
//   E. SHED SETTLE — the governor's travel shed zeroes velocities and the
//      marks settle home: the presented items become bit-identical to the
//      still scene (a shed travel state reads as settled home, not frozen).
//   F. GOVERNOR ORDER — the travel rung (cut 1.6) sheds after the creature
//      count (cut 1.5, unmoved) and ahead of the quality tier; absent the
//      caller's travelActive it does not exist. Restore + badge agree.
//   G. COST — the pass is declared in the cost registry (tier 0, measured
//      timeMs) and the measurement re-runs here: applyTransport at the
//      800-mark cap, one locked step + present, must sit far inside the
//      2.0 ms creature-class allowance it shares the frame with.
//   H. PARAMS — the recipe keys normalize/clamp/validate like every other
//      layout param; a pre-#1574 document (no keys) opens still.
//   P. Q2 BUDGET — the traveler budget (ruled 2026-10-20, governor-selected
//      within a device-class cap): the selection is a pure function of
//      recorded state (mark count + device class), the effective amount is
//      at or below the authored ceiling and at or below the class cap in
//      cost terms, non-travelers hold no state and present exactly at
//      home, a budget shrink drops their state, the desktop class is P1
//      bit-for-bit, and the selection's own cost is declared + measured.
//   Q. Q4 PER-STRATUM LEASHES — the leash is ruled per-stratum (Matt,
//      2026-10-20): two strata threaded through one store (the resolver's
//      own seam) are each capped by their OWN leash, FLOW and PATH alike;
//      interleaving them reproduces each stratum's solo run hash-for-hash
//      (no cross-talk, no shared leash state); sweep's arc reads its own
//      stratum's leash while its lane runs free; a zero leash stills only
//      its stratum; a stratum whose snapshot carries no leash falls back
//      to the shipped default exactly as the pre-Q4 defaults merge did —
//      and the caps are proven again through the real resolver, where the
//      strata's leashes arrive via their per-stratum snapshots.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildPlacements } from './buildPlacements.js';
import {
  createTravelStore, pruneTravelStore, travelSceneSnapshot, applyTransport,
  TRAVEL_STEP_SEC, TRANSPORT_MODES, selectTravelers, TRAVEL_COST_REFERENCE_MARKS,
  PATH_FAMILIES, pathAnchor, familyDefaultTransport, isFamilyAnchored,
  defaultTransportForCast, nextTransportMode, transportChipLabel,
  travelStretchAmount, TRAVEL_STRETCH_CAP,
} from './kineme.js';
import { TRAVEL_BUDGETS, travelBudgetForDevice } from '../data/quality.js';
import { DEFAULT_LAYOUT_PARAMS, PARAM_SPEC, normalizeLayoutParams, validateLayoutParams } from '../data/layout-modes.js';
import { nextGovernorCut, shedSummary, GOVERNOR_RESTORE_CUTS } from '../hooks/governorCuts.js';
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
const FLOW_LP = lp({ transport: 'flow', transportLeash: 112, transportFlow: 0.8 });
const place = (params, travel, extra = {}) => buildPlacements({
  layoutParams: params, seed: 42, activeAssets: ASSETS, palette: PALETTE, caps: CAPS,
  canvasW: W, canvasH: H, travel, ...extra,
}).items;
const frameHash = (items) => createHash('sha256')
  .update(items.map((it) => `${it.x},${it.y},${it.scale},${it.rotation},${it.alpha}`).join('|'))
  .digest('hex');

// ── A. parity ────────────────────────────────────────────────────────────
{
  const stillA = place(lp(), null);
  const stillB = place(lp({ transport: 'still', transportLeash: 112, transportFlow: 0.8 }), null);
  assert.equal(frameHash(stillA), frameHash(stillB), "'still' with leash/flow set is bit-identical");
  checks++;
  // A travel input handed in under 'still' changes nothing and touches nothing.
  const store = createTravelStore();
  const stillC = place(lp({ transport: 'still' }), { store, sceneId: 'a', frameMs: 1000, shed: false });
  assert.equal(frameHash(stillC), frameHash(stillA), "'still' + travel input is bit-identical");
  checks++;
  assert.equal(store.scenes.size, 0, 'the sim store is never touched while still');
  checks++;
  // Leash 0 is still, whatever the mode and strength.
  const store0 = createTravelStore();
  const zero = place(lp({ transport: 'flow', transportLeash: 0, transportFlow: 1 }),
    { store: store0, sceneId: 'a', frameMs: 1000, shed: false });
  assert.equal(frameHash(zero), frameHash(stillA), 'leash 0 is bit-identical');
  checks++;
  assert.equal(store0.scenes.size, 0, 'leash 0 never creates sim state');
  checks++;
  assert.equal(DEFAULT_LAYOUT_PARAMS.transport, 'still', "the shipped default is 'still'");
  checks++;
  console.log('travel.selfcheck A parity: still / leash-0 bit-identical, store untouched');
}

// ── B. fixed-step determinism ────────────────────────────────────────────
{
  const DT = [16.7, 16.7, 33.3, 8, 16.7, 50, 12.5]; // uneven, like a real loop under load
  const run = () => {
    const store = createTravelStore();
    const hashes = [];
    for (let f = 0; f < 300; f++) {
      const items = place(FLOW_LP, { store, sceneId: 'det', frameMs: DT[f % DT.length], shed: false });
      hashes.push(frameHash(items));
    }
    return { hashes, snap: travelSceneSnapshot(store, 'det') };
  };
  const a = run();
  const b = run();
  assert.deepEqual(a.hashes, b.hashes, 'two fresh stores, one uneven input sequence: every frame identical');
  checks++;
  assert.deepEqual(a.snap, b.snap, 'final sim states identical');
  checks++;
  ok(new Set(a.hashes).size > 250, 'the run actually travels (frames differ)');
  const trajHash = createHash('sha256').update(a.hashes.join('')).digest('hex').slice(0, 16);
  console.log(`travel.selfcheck B determinism: 300 frames identical on two fresh stores; trajectory hash ${trajHash}; steps ${a.snap.steps}`);

  // Chunking: the same total frame time in different slices (none hitting
  // the 8-step cap) spends the same steps and lands on the same state.
  const stepped = (slices) => {
    const store = createTravelStore();
    const soa = { n: 1, x: new Float64Array([500]), y: new Float64Array([350]), index: new Uint32Array([0]) };
    for (const ms of slices) {
      const u = applyTransport(soa, { seed: 9, canvasW: W, canvasH: H, travel: { mode: 'flow', leash: 112, flow: 1, store, sceneId: 'chunk', frameMs: ms, shed: false } });
      if (u) u();
    }
    return travelSceneSnapshot(store, 'chunk');
  };
  const whole = stepped([100, 100, 100, 100]);
  const sliced = stepped([50, 50, 50, 50, 50, 50, 50, 50]);
  const frames = stepped(Array(24).fill(1000 / 60));
  assert.deepEqual(sliced, whole, '50 ms slices == 100 ms slices');
  checks++;
  assert.deepEqual(frames, whole, '60 fps frames == 100 ms slices (same step count)');
  checks++;
  assert.equal(whole.steps, 24, '400 ms at the locked step is 24 steps');
  checks++;
  assert.equal(TRAVEL_STEP_SEC, 1 / 60, 'the step is locked at 1/60');
  checks++;

  // A reseed starts the scene's roam over (state is keyed by seed).
  const store = createTravelStore();
  const soa = { n: 1, x: new Float64Array([500]), y: new Float64Array([350]), index: new Uint32Array([0]) };
  for (let i = 0; i < 30; i++) applyTransport(soa, { seed: 9, canvasW: W, canvasH: H, travel: { mode: 'flow', leash: 112, flow: 1, store, sceneId: 'rs', frameMs: 50, shed: false } });
  const before = travelSceneSnapshot(store, 'rs');
  applyTransport(soa, { seed: 10, canvasW: W, canvasH: H, travel: { mode: 'flow', leash: 112, flow: 1, store, sceneId: 'rs', frameMs: 0, shed: false } });
  const after = travelSceneSnapshot(store, 'rs');
  assert.equal(before.seed, 9); assert.equal(after.seed, 10); assert.equal(after.steps, 0);
  checks += 3;
  console.log('travel.selfcheck B chunking + reseed: step count is the clock, seed keys the state');
}

// ── C. FLOW live through the real placement path ─────────────────────────
{
  const homes = place(lp(), null);
  const homeByIndex = new Map(homes.map((it) => [it.index, it]));
  const store = createTravelStore();
  const cache = {};
  let items = null;
  for (let f = 0; f < 240; f++) {
    items = place(FLOW_LP, { store, sceneId: 'live', frameMs: 1000 / 60, shed: false }, { cache });
  }
  let moved = 0, sum = 0, max = 0;
  for (const it of items) {
    const h = homeByIndex.get(it.index);
    const d = Math.hypot(it.x - h.x, it.y - h.y);
    if (d > 0.5) moved++;
    sum += d; if (d > max) max = d;
  }
  ok(moved === items.length, `every mark roams (moved ${moved}/${items.length})`);
  ok(sum / items.length > 20, `the roam is real: mean ${(sum / items.length).toFixed(1)} px from home`);
  ok(max <= 112 * 1.25, `the leash holds: max ${max.toFixed(1)} px vs leash 112 + overshoot allowance`);
  const snap1 = travelSceneSnapshot(store, 'live');
  ok(snap1.steps === 240, `one locked step per 60 fps frame (steps ${snap1.steps})`);
  // A placement rebuild (count change busts the geometry cache) does not
  // reset the roam: same store, steps keep counting, state persists.
  const rebuilt = place(lp({ ...FLOW_LP, count: 60 }), { store, sceneId: 'live', frameMs: 1000 / 60, shed: false }, { cache });
  const snap2 = travelSceneSnapshot(store, 'live');
  ok(snap2.steps === 241 && rebuilt.length === 60, 'the sim survives a placement rebuild');
  pruneTravelStore(store, new Set(['other']));
  assert.equal(travelSceneSnapshot(store, 'live'), null, 'prune drops a removed scene');
  checks++;
  console.log(`travel.selfcheck C live: mean roam ${(sum / items.length).toFixed(1)} px, max ${max.toFixed(1)} px, state survives rebuilds`);
}

// ── D. the leash law ─────────────────────────────────────────────────────
{
  const mk = () => {
    const store = createTravelStore();
    const soa = { n: 1, x: new Float64Array([500]), y: new Float64Array([350]), index: new Uint32Array([0]) };
    const ctx = (over = {}) => ({ seed: 9, canvasW: W, canvasH: H, travel: { mode: 'flow', leash: 112, flow: 0, store, sceneId: 'leash', frameMs: 1000 / 60, shed: false, ...over } });
    applyTransport(soa, ctx()); // creates the scene + state
    return { store, soa, ctx, state: store.scenes.get('leash').states.get(0) };
  };
  // Inside the leash, at rest, no drive: nothing pulls home. Bit-exact.
  {
    const { soa, ctx, state } = mk();
    state.ox = 50; state.oy = -30;
    let presented = null;
    for (let i = 0; i < 120; i++) { const u = applyTransport(soa, ctx()); presented = soa.x[0]; if (u) u(); }
    assert.equal(state.ox, 50); assert.equal(state.oy, -30);
    checks += 2;
    assert.equal(presented, 550, 'the presented position is home + offset');
    checks++;
  }
  // Outside the leash: the spring returns the mark and OVERSHOOTS inside L
  // (underdamped, zeta 0.38) before the drive-less mark settles inside.
  {
    const { soa, ctx, state } = mk();
    state.ox = 200; state.oy = 0;
    let min = Infinity;
    for (let i = 0; i < 600; i++) {
      const u = applyTransport(soa, ctx()); if (u) u();
      min = Math.min(min, Math.hypot(state.ox, state.oy));
    }
    const r = Math.hypot(state.ox, state.oy);
    ok(min < 100, `the return overshoots inside the leash (min r ${min.toFixed(1)} < 112)`);
    ok(r < 112 && Math.hypot(state.vx, state.vy) < 1, `and settles inside (r ${r.toFixed(1)}, |v| ${Math.hypot(state.vx, state.vy).toFixed(2)})`);
  }
  console.log('travel.selfcheck D leash: no force inside L; spring return overshoots, then settles');
}

// ── E. shed settle ───────────────────────────────────────────────────────
{
  const homes = place(lp(), null);
  const store = createTravelStore();
  for (let f = 0; f < 240; f++) place(FLOW_LP, { store, sceneId: 'shed', frameMs: 1000 / 60, shed: false });
  let items = null;
  for (let f = 0; f < 600; f++) items = place(FLOW_LP, { store, sceneId: 'shed', frameMs: 1000 / 60, shed: true });
  assert.equal(frameHash(items), frameHash(homes), 'shed + settled = the still frame, bit for bit');
  checks++;
  const snap = travelSceneSnapshot(store, 'shed');
  ok(snap.states.every((s) => s.ox === 0 && s.oy === 0 && s.vx === 0 && s.vy === 0), 'velocities zero, offsets home');
  console.log('travel.selfcheck E shed: marks settle home to exactly the still behaviour');
}

// ── F. governor order ────────────────────────────────────────────────────
{
  const walk = (s0) => {
    const kinds = [];
    let s = { ...s0 };
    for (let i = 0; i < 16; i++) {
      const cut = nextGovernorCut(s);
      if (!cut) break;
      kinds.push(cut.kind);
      if (cut.kind === 'renderScale') s = { ...s, renderScale: cut.scale };
      else if (cut.kind === 'creatureCount') s = { ...s, creatureShed: cut.creatureShed };
      else if (cut.kind === 'travel') s = { ...s, travelShed: true };
      else if (cut.kind === 'quality') s = { ...s, quality: cut.quality };
      else if (cut.kind === 'assetThin') s = { ...s, assetThin: true };
      else if (cut.kind === 'countClamp') s = { ...s, perfClampOverride: { count: cut.count }, effectiveCount: cut.count };
      else if (cut.kind === 'slowRender') s = { ...s, slowRender: true };
    }
    return kinds;
  };
  const PRESSURE = { renderScale: 1, quality: 'high', assetThin: false, perfClampOverride: null, effectiveCount: 400, slowRender: false, gpuSaturated: true };
  const kinds = walk({ ...PRESSURE, creatureCount: 2, creatureShed: 0, travelActive: true, travelShed: false });
  assert.deepEqual(kinds.slice(0, 6), ['renderScale', 'renderScale', 'renderScale', 'creatureCount', 'creatureCount', 'travel'],
    'pixel trim, then population (1.5 unmoved), then travel (1.6)');
  checks++;
  ok(kinds.indexOf('travel') < kinds.indexOf('quality'), 'travel sheds ahead of the quality tier');
  ok(kinds.indexOf('travel') < kinds.indexOf('slowRender'), 'travel sheds ahead of the motion freeze');
  const noTravel = walk({ ...PRESSURE, creatureCount: 0, creatureShed: 0 });
  ok(!noTravel.includes('travel'), 'no travelActive from the caller → no travel rung (pre-#1574 ladder)');
  const entry = GOVERNOR_RESTORE_CUTS.find((c) => c.kind === 'travel');
  ok(!!entry, 'travel has a restore entry');
  const order = GOVERNOR_RESTORE_CUTS.map((c) => c.kind);
  ok(order.indexOf('creatureCount') < order.indexOf('travel') && order.indexOf('travel') < order.indexOf('quality'),
    'restore table order matches shed order around the new rung');
  assert.equal(entry.needsRestore({ travelShed: true }, { healthy: true }), true);
  assert.equal(entry.needsRestore({ travelShed: true }, { healthy: false }), false);
  assert.equal(entry.needsRestore({ travelShed: false }, { healthy: true }), false);
  checks += 3;
  assert.deepEqual(shedSummary({ renderScale: 1, travelShed: true }), ['travel held'], 'the badge is honest about a travel shed');
  checks++;
  console.log('travel.selfcheck F governor: cut 1.6 sits between creature 1.5 and quality 2; restore + badge agree');
}

// ── G. cost ──────────────────────────────────────────────────────────────
{
  const decl = getCostTier('travel/flow');
  ok(!!decl && decl.tier === 0 && decl.timeMs > 0, 'travel/flow is declared, tier 0, with a measured timeMs');
  const n = 800;
  const soa = { n, x: new Float64Array(n), y: new Float64Array(n), index: new Uint32Array(n) };
  for (let k = 0; k < n; k++) { soa.x[k] = (k % 40) * 25; soa.y[k] = Math.floor(k / 40) * 35; soa.index[k] = k; }
  const medians = [];
  for (let run = 0; run < 7; run++) {
    const store = createTravelStore();
    const ctx = { seed: 7, canvasW: W, canvasH: H, travel: { mode: 'flow', leash: 112, flow: 0.8, store, sceneId: 'cost', frameMs: 1000 / 60, shed: false } };
    for (let i = 0; i < 60; i++) { const u = applyTransport(soa, ctx); if (u) u(); }
    const times = [];
    for (let i = 0; i < 200; i++) {
      const t0 = performance.now();
      const u = applyTransport(soa, ctx);
      times.push(performance.now() - t0);
      if (u) u();
    }
    times.sort((a, b) => a - b);
    medians.push(times[100]);
  }
  medians.sort((a, b) => a - b);
  const measured = medians[3];
  ok(measured < 2.0, `measured ${measured.toFixed(3)} ms at the 800-mark cap sits inside the 2.0 ms class allowance`);
  console.log(`travel.selfcheck G cost: declared ${decl.timeMs} ms; re-measured median-of-medians ${measured.toFixed(3)} ms @800 marks, 1 step + present (sandbox)`);
}

// ── H. params ────────────────────────────────────────────────────────────
{
  assert.deepEqual(PARAM_SPEC.transportLeash, { min: 0, max: 400 });
  assert.deepEqual(PARAM_SPEC.transportFlow, { min: 0, max: 1 });
  checks += 2;
  assert.deepEqual(TRANSPORT_MODES, ['still', 'flow', 'path']); // #1575 — 'path' joins the vocabulary
  checks++;
  const n = normalizeLayoutParams({ transport: 'flow', transportLeash: 9999, transportFlow: -2 });
  assert.equal(n.transport, 'flow'); assert.equal(n.transportLeash, 400); assert.equal(n.transportFlow, 0);
  checks += 3;
  assert.equal(normalizeLayoutParams({ transport: 'warp' }).transport, 'still', 'an unknown mode is still');
  checks++;
  assert.equal(normalizeLayoutParams({}).transport, 'still', 'a pre-#1574 document opens still');
  checks++;
  const v = validateLayoutParams({ transportLeash: 'abc' });
  ok(v.rejected.includes('transportLeash'), 'a non-numeric leash is rejected at the trust boundary');
  console.log('travel.selfcheck H params: spec, clamp, enum and trust boundary all hold');
}

// ── I. PATH — the pure function (#1575) ──────────────────────────────────
{
  const home = { x: 800, y: 200 };
  const opts = (over = {}) => ({ family: 'lissajous', seed: 42, index: 3, canvasW: W, canvasH: H, radius: 140, speed: 1, ...over });
  // Anchored families: at t=0 the anchor IS home, exactly.
  for (const family of ['orbit', 'spiral', 'lissajous']) {
    for (const h of [home, { x: 100, y: 600 }, { x: 500, y: 350 }]) {
      assert.deepEqual(pathAnchor(h, 0, opts({ family })), h, `${family}: t=0 anchor is home`);
      checks++;
    }
  }
  // Pure: same (t, seed, params) → same anchor, bit for bit; a different
  // instance index deals a different weave.
  const a1 = pathAnchor(home, 3.7, opts());
  const a2 = pathAnchor(home, 3.7, opts());
  assert.deepEqual(a1, a2, 'pathAnchor is a pure function of (t, seed, params)');
  checks++;
  const other = pathAnchor(home, 3.7, opts({ index: 4 }));
  ok(a1.x !== other.x || a1.y !== other.y, 'per-instance phase: copies never move in lockstep');
  // Orbit is an arc, not a glide: the anchor stays on the home's own
  // circle around the dish centre at every t.
  for (const t of [0.3, 1.7, 5.25, 19.9]) {
    const a = pathAnchor(home, t, opts({ family: 'orbit' }));
    const r = Math.hypot(a.x - W / 2, a.y - H / 2);
    ok(Math.abs(r - Math.hypot(home.x - W / 2, home.y - H / 2)) < 1e-9, `orbit keeps its radius (t=${t})`);
  }
  // Spiral breathes: the radius from centre actually varies with t.
  const radii = new Set();
  for (let t = 0; t < 14; t += 0.7) {
    const a = pathAnchor(home, t, opts({ family: 'spiral' }));
    radii.add(Math.round(Math.hypot(a.x - W / 2, a.y - H / 2)));
  }
  ok(radii.size > 5, `spiral radius breathes (${radii.size} distinct radii over 14 s)`);
  // Sweep stays in its lane band and wraps the canvas width.
  let sawLeft = false, sawRight = false;
  for (let t = 0; t < 40; t += 0.25) {
    const a = pathAnchor(home, t, opts({ family: 'sweep' }));
    ok(a.x >= -0.05 * W - 11 && a.x <= 1.05 * W + 1, 'sweep x stays in the lane span');
    ok(Math.abs(a.y - home.y) <= 140 * 0.35 + 1e-9, 'sweep arc stays within its bow');
    if (a.x < 100) sawLeft = true;
    if (a.x > 900) sawRight = true;
  }
  ok(sawLeft && sawRight, 'sweep crosses the whole canvas (and wraps)');
  // Held extremes: the weave's speed collapses somewhere in its cycle
  // (velocity → 0 at the extremes) instead of reversing at full speed.
  {
    let maxSp = 0, minSp = Infinity;
    for (let t = 0.2; t < 12; t += 0.05) {
      const p0 = pathAnchor(home, t, opts());
      const p1 = pathAnchor(home, t + 0.01, opts());
      const sp = Math.hypot(p1.x - p0.x, p1.y - p0.y) / 0.01;
      if (sp > maxSp) maxSp = sp;
      if (sp < minSp) minSp = sp;
    }
    ok(minSp < 0.35 * maxSp, `held extremes: weave speed falls to ${minSp.toFixed(1)} from a ${maxSp.toFixed(1)} px/s peak`);
  }
  // Anticipation: the lean measurably bends the departure backwards —
  // sweep dips against its +x travel inside the departure window, and
  // the lissajous lean displaces its first half-second.
  {
    let sweepLean = 0;
    for (let t = 0; t < 30; t += 0.01) {
      const withLean = pathAnchor(home, t, opts({ family: 'sweep', lean: 1 }));
      const noLean = pathAnchor(home, t, opts({ family: 'sweep', lean: 0 }));
      if (noLean.x - withLean.x > sweepLean) sweepLean = noLean.x - withLean.x;
    }
    ok(sweepLean > 3, `sweep anticipation dip is real (${sweepLean.toFixed(1)} px against departure)`);
    let weaveLean = 0;
    for (let t = 0.02; t < 0.45; t += 0.01) {
      const withLean = pathAnchor(home, t, opts({ lean: 1 }));
      const noLean = pathAnchor(home, t, opts({ lean: 0 }));
      weaveLean = Math.max(weaveLean, Math.hypot(withLean.x - noLean.x, withLean.y - noLean.y));
    }
    ok(weaveLean > 1, `lissajous anticipation lean is real (${weaveLean.toFixed(1)} px)`);
  }
  console.log('travel.selfcheck I path-pure: anchored deal, arcs, breathing, wrap, held extremes, anticipation lean');
}

// ── J. PATH through the real placement path ──────────────────────────────
const PATH_LP = lp({ transport: 'path', transportPath: 'lissajous', transportLeash: 300, transportSpeed: 1, transportRadius: 140 });
{
  const homes = place(lp(), null);
  // Leash 0 is still for PATH too, and never touches the store.
  const store0 = createTravelStore();
  const zero = place(lp({ transport: 'path', transportLeash: 0, transportPath: 'sweep', transportSpeed: 2, transportRadius: 300 }),
    { store: store0, sceneId: 'a', frameMs: 1000, shed: false });
  assert.equal(frameHash(zero), frameHash(homes), 'PATH + leash 0 is bit-identical');
  checks++;
  assert.equal(store0.scenes.size, 0, 'PATH + leash 0 never creates state');
  checks++;
  // Replay-exact across two fresh stores over uneven frames; the store
  // holds NO per-mark state (stateless by construction).
  const DT = [16.7, 16.7, 33.3, 8, 16.7, 50, 12.5];
  const run = () => {
    const store = createTravelStore();
    const hashes = [];
    for (let f = 0; f < 300; f++) hashes.push(frameHash(place(PATH_LP, { store, sceneId: 'p', frameMs: DT[f % DT.length], shed: false })));
    return { hashes, snap: travelSceneSnapshot(store, 'p') };
  };
  const a = run(); const b = run();
  assert.deepEqual(a.hashes, b.hashes, 'PATH: two fresh stores, one uneven input sequence — every frame identical');
  checks++;
  assert.equal(a.snap.states.length, 0, 'PATH keeps no per-mark sim state (the store holds only the step clock)');
  checks++;
  ok(new Set(a.hashes).size > 250, 'the PATH run actually travels');
  // Roam is real and the leash caps the centred/weave families radially.
  const store = createTravelStore();
  let items = null;
  for (let f = 0; f < 240; f++) items = place(PATH_LP, { store, sceneId: 'p2', frameMs: 1000 / 60, shed: false });
  const homeByIndex = new Map(homes.map((it) => [it.index, it]));
  let sum = 0, max = 0;
  for (const it of items) {
    const h = homeByIndex.get(it.index);
    const d = Math.hypot(it.x - h.x, it.y - h.y);
    sum += d; if (d > max) max = d;
  }
  ok(sum / items.length > 10, `PATH roam is real: mean ${(sum / items.length).toFixed(1)} px from home`);
  ok(max <= 300 + 1e-9, `the leash caps the weave: max ${max.toFixed(1)} px vs leash 300`);
  // Sweep's lane is its geometry: marks travel far beyond the leash
  // radially (the leash caps only its arc) — cross-canvas by definition.
  const sweepStore = createTravelStore();
  let sweepItems = null;
  for (let f = 0; f < 240; f++) sweepItems = place(lp({ ...PATH_LP, transportPath: 'sweep' }), { store: sweepStore, sceneId: 'sw', frameMs: 1000 / 60, shed: false });
  let maxDx = 0;
  for (const it of sweepItems) maxDx = Math.max(maxDx, Math.abs(it.x - homeByIndex.get(it.index).x));
  ok(maxDx > 150, `sweep travels its lane: max |dx| ${maxDx.toFixed(0)} px`);
  // Speed 0 freezes the path at its deal; radius 0 is home. Both exact
  // after the departure window has passed.
  const frozenStore = createTravelStore();
  let frozen = null;
  for (let f = 0; f < 180; f++) frozen = place(lp({ ...PATH_LP, transportSpeed: 0 }), { store: frozenStore, sceneId: 'fz', frameMs: 1000 / 60, shed: false });
  assert.equal(frameHash(frozen), frameHash(homes), 'PATH speed 0 = the still frame, bit for bit');
  checks++;
  const flatStore = createTravelStore();
  let flat = null;
  for (let f = 0; f < 180; f++) flat = place(lp({ ...PATH_LP, transportRadius: 0 }), { store: flatStore, sceneId: 'fl', frameMs: 1000 / 60, shed: false });
  assert.equal(frameHash(flat), frameHash(homes), 'PATH radius 0 (lissajous) = the still frame, bit for bit');
  checks++;
  console.log('travel.selfcheck J path-live: replay-exact, stateless, leashed weave, cross-canvas sweep, frozen at speed/radius 0');
}

// ── K. PATH shed — home now, clock frozen, resume continues ──────────────
{
  const homes = place(lp(), null);
  const store = createTravelStore();
  for (let f = 0; f < 120; f++) place(PATH_LP, { store, sceneId: 'ps', frameMs: 1000 / 60, shed: false });
  const stepsBefore = travelSceneSnapshot(store, 'ps').steps;
  const shedItems = place(PATH_LP, { store, sceneId: 'ps', frameMs: 1000 / 60, shed: true });
  assert.equal(frameHash(shedItems), frameHash(homes), 'a shed PATH frame is the still frame, bit for bit');
  checks++;
  assert.equal(travelSceneSnapshot(store, 'ps').steps, stepsBefore, 'the PATH clock freezes under shed (no jump on resume)');
  checks++;
  let resumed = null;
  for (let f = 0; f < 30; f++) resumed = place(PATH_LP, { store, sceneId: 'ps', frameMs: 1000 / 60, shed: false });
  ok(frameHash(resumed) !== frameHash(homes), 'resume travels again from where the clock froze');
  console.log('travel.selfcheck K path-shed: home immediately, clock frozen, resume continues');
}

// ── L. family assignment (#1575 Q1) ──────────────────────────────────────
{
  const line = { id: 'l', category: 'linework', tags: ['squiggle'], weight: 'light', density: 'sparse' };
  const glyph = { id: 'g', category: 'stamps', tags: ['glyph'], weight: 'medium', density: 'sparse' };
  const letter = { id: 't', category: 'geometric', tags: ['type', 'letter'], weight: 'medium', density: 'solid' };
  const blob = { id: 'b', category: 'organic', tags: ['blob'], weight: 'heavy', density: 'solid' };
  assert.equal(familyDefaultTransport(line), 'flow', 'linework roams by FLOW (its declaration)');
  assert.equal(familyDefaultTransport(glyph), 'path', 'glyphs roam by PATH (their declaration)');
  assert.equal(familyDefaultTransport(letter), 'path', 'letterforms are glyphs');
  assert.equal(familyDefaultTransport(blob), 'still', 'heavy solids anchor');
  assert.equal(familyDefaultTransport({ id: 'x', category: 'geometric', tags: ['shape'], weight: 'medium', density: 'medium' }), null, 'an unnamed family declares nothing (the #1434 silence)');
  assert.equal(familyDefaultTransport(null), null);
  checks += 6;
  ok(isFamilyAnchored(blob) && !isFamilyAnchored({ ...blob, density: 'medium' }) && !isFamilyAnchored({ ...blob, weight: 'medium' }),
    'the anchor class is heavy AND solid — either alone still roams');
  assert.equal(defaultTransportForCast([line, line, glyph]), 'flow', 'the cast default is its most-declared roam');
  assert.equal(defaultTransportForCast([glyph, glyph, line]), 'path');
  assert.equal(defaultTransportForCast([blob]), 'still', 'an anchoring cast defaults still');
  assert.equal(defaultTransportForCast([]), 'still');
  checks += 4;
  assert.equal(nextTransportMode('still'), 'flow');
  assert.equal(nextTransportMode('flow'), 'path');
  assert.equal(nextTransportMode('path'), 'still');
  assert.equal(nextTransportMode('warp'), 'flow', 'an unknown mode cycles from still');
  checks += 4;
  assert.equal(transportChipLabel('path', 'flow'), 'travel path · fam flow', 'the chip shows mode + family default');
  checks++;

  // Through the pipeline: in a FLOW scene the heavy-solid marks stay
  // home bit-exact while the linework roams; the artist's pin tames
  // the linework too.
  const cast = [
    { id: 'line_a', category: 'linework', tags: [], weight: 'light', density: 'sparse' },
    { id: 'blob_a', category: 'organic', tags: [], weight: 'heavy', density: 'solid' },
  ];
  const castLp = (over = {}) => ({
    mode: 'grid', composition: 'default', count: 120, scale: [0.4, 0.8], rotate: [0, 45],
    alpha: [60, 100], jitter: 10, density: 100, zTiers: 1, bleed: false, mirror: false,
    overlap: true, displacement: 0, noiseFreq: 0.005, noiseSpeed: 0.5, ...over,
  });
  const castPlace = (params, travel, extra = {}) => buildPlacements({
    layoutParams: params, seed: 42, activeAssets: cast, palette: PALETTE, caps: CAPS,
    canvasW: W, canvasH: H, travel, ...extra,
  }).items;
  const castHomes = castPlace(castLp(), null);
  const homeOf = new Map(castHomes.map((it) => [it.key, it]));
  const store = createTravelStore();
  let roamed = null;
  for (let f = 0; f < 240; f++) roamed = castPlace(castLp(FLOW_LP), { store, sceneId: 'fam', frameMs: 1000 / 60, shed: false });
  let blobMoved = 0, lineSum = 0, lineN = 0;
  for (const it of roamed) {
    const h = homeOf.get(it.key);
    const d = Math.hypot(it.x - h.x, it.y - h.y);
    if (it.assetId === 'blob_a') { if (d !== 0) blobMoved++; }
    else { lineSum += d; lineN++; }
  }
  ok(lineN > 0 && blobMoved === 0, `heavy solids anchor in a FLOW scene (${blobMoved} blob marks moved)`);
  ok(lineSum / lineN > 5, `linework roams beside them (mean ${(lineSum / lineN).toFixed(1)} px)`);
  const pinStore = createTravelStore();
  let pinned = null;
  const kinemePin = { seed: 42, driverSec: 0, boilStep: 0, amounts: {}, canvasW: W, canvasH: H, shedTier: 0, stillAssets: new Set(['line_a']) };
  for (let f = 0; f < 240; f++) pinned = castPlace(castLp(FLOW_LP), { store: pinStore, sceneId: 'pin', frameMs: 1000 / 60, shed: false }, { kineme: kinemePin });
  ok(pinned.every((it) => { const h = homeOf.get(it.key); return it.x === h.x && it.y === h.y; }),
    "the artist's per-asset pin tames every mark home (the #1434 override)");
  console.log('travel.selfcheck L assignment: family table, cast default, chip cycle, anchor + pin through the pipeline');
}

// ── M. stretch along velocity ────────────────────────────────────────────
{
  assert.equal(travelStretchAmount(45), 0, 'at the floor: no stretch');
  assert.equal(travelStretchAmount(20), 0);
  ok(Math.abs(travelStretchAmount(200) - 155 / 600) < 1e-12, 'stretch grows with speed');
  assert.equal(travelStretchAmount(100000), TRAVEL_STRETCH_CAP, 'stretch is capped');
  checks += 3;
  // A fast PATH scene stamps the deform triple; the axis is the
  // velocity's perpendicular (that is what elongates along travel in
  // the a_def shader), and one frame's displacement proves it.
  const fastLp = lp({ transport: 'path', transportPath: 'lissajous', transportLeash: 400, transportSpeed: 2, transportRadius: 300 });
  const store = createTravelStore();
  let prev = null, items = null;
  for (let f = 0; f < 120; f++) { prev = items; items = place(fastLp, { store, sceneId: 'st', frameMs: 1000 / 60, shed: false }); }
  let stamped = 0;
  for (const it of items) {
    if (!(it.deformAmt > 0)) continue;
    stamped++;
    ok(it.deformAmt <= TRAVEL_STRETCH_CAP + 1e-6, 'stamped stretch never exceeds the cap (float32 scratch epsilon)');
    ok(Math.abs(Math.hypot(it.deformAxisX, it.deformAxisY) - 1) < 1e-5, 'the deform axis is a unit vector');
  }
  ok(stamped > 0, `fast PATH marks stretch (${stamped}/${items.length} stamped at this frame)`);
  // The axis is the velocity's perpendicular, exactly: one mark through
  // applyTransport, its deform axis against the pure function's own
  // finite-difference velocity at the same step count.
  {
    const store = createTravelStore();
    const deform = { amt: new Float32Array(1), ax: new Float32Array(1), ay: new Float32Array(1) };
    const soa = { n: 1, x: new Float64Array([500]), y: new Float64Array([350]), index: new Uint32Array([0]) };
    const ctx = { seed: 9, canvasW: W, canvasH: H, travel: { mode: 'path', path: 'lissajous', leash: 400, speed: 2, radius: 300, deform, store, sceneId: 'perp', frameMs: 100, shed: false } };
    for (let i = 0; i < 20; i++) { const u = applyTransport(soa, ctx); if (u) u(); }
    const tSec = 120 * TRAVEL_STEP_SEC; // 20 calls × 6 locked steps
    const home = { x: 500, y: 350 };
    const o = { family: 'lissajous', seed: 9, index: 0, canvasW: W, canvasH: H, radius: 300, speed: 2 };
    const aNow = pathAnchor(home, tSec, o);
    const aPrev = pathAnchor(home, tSec - TRAVEL_STEP_SEC, o);
    const vx = aNow.x - aPrev.x, vy = aNow.y - aPrev.y;
    const vl = Math.hypot(vx, vy);
    ok(deform.amt[0] > 0, 'the single fast mark carries stretch');
    ok(Math.abs((deform.ax[0] * vx + deform.ay[0] * vy) / vl) < 1e-6, 'the deform axis is perpendicular to the travel direction (to float32 scratch precision)');
  }
  // A still scene stamps nothing — items are field-for-field pre-P2.
  ok(place(lp(), null).every((it) => !('deformAmt' in it)), 'still items carry no deform fields');
  // A slow path (under the speed floor) stamps nothing either.
  const slowStore = createTravelStore();
  let slow = null;
  for (let f = 0; f < 60; f++) slow = place(lp({ transport: 'path', transportPath: 'lissajous', transportLeash: 300, transportSpeed: 0.2, transportRadius: 20 }), { store: slowStore, sceneId: 'sl', frameMs: 1000 / 60, shed: false });
  ok(slow.every((it) => !('deformAmt' in it)), 'slow marks stay round — no deform fields under the floor');
  console.log('travel.selfcheck M stretch: capped, perpendicular-axis, stamped only while fast');
}

// ── N. PATH cost ─────────────────────────────────────────────────────────
{
  const decl = getCostTier('travel/path');
  ok(!!decl && decl.tier === 0 && decl.timeMs > 0, 'travel/path is declared, tier 0, with a measured timeMs');
  const n = 800;
  const soa = { n, x: new Float64Array(n), y: new Float64Array(n), index: new Uint32Array(n) };
  for (let k = 0; k < n; k++) { soa.x[k] = (k % 40) * 25; soa.y[k] = Math.floor(k / 40) * 35; soa.index[k] = k; }
  const medians = [];
  for (let run = 0; run < 7; run++) {
    const store = createTravelStore();
    const deform = { amt: new Float32Array(n), ax: new Float32Array(n), ay: new Float32Array(n) };
    const ctx = { seed: 7, canvasW: W, canvasH: H, travel: { mode: 'path', path: 'lissajous', leash: 300, speed: 1, radius: 140, deform, store, sceneId: 'costp', frameMs: 1000 / 60, shed: false } };
    for (let i = 0; i < 60; i++) { const u = applyTransport(soa, ctx); if (u) u(); }
    const times = [];
    for (let i = 0; i < 200; i++) {
      const t0 = performance.now();
      const u = applyTransport(soa, ctx);
      times.push(performance.now() - t0);
      if (u) u();
    }
    times.sort((a, b) => a - b);
    medians.push(times[100]);
  }
  medians.sort((a, b) => a - b);
  const measured = medians[3];
  ok(measured < 2.0, `PATH measured ${measured.toFixed(3)} ms at the 800-mark cap sits inside the 2.0 ms class allowance`);
  console.log(`travel.selfcheck N path-cost: declared ${decl.timeMs} ms; re-measured median-of-medians ${measured.toFixed(3)} ms @800 marks, 1 step + present (sandbox)`);
}

// ── O. PATH params ───────────────────────────────────────────────────────
{
  assert.deepEqual(PARAM_SPEC.transportSpeed, { min: 0, max: 2 });
  assert.deepEqual(PARAM_SPEC.transportRadius, { min: 0, max: 300 });
  checks += 2;
  assert.deepEqual(PATH_FAMILIES, ['orbit', 'spiral', 'sweep', 'lissajous']);
  checks++;
  const n = normalizeLayoutParams({ transport: 'path', transportPath: 'sweep', transportSpeed: 99, transportRadius: -5 });
  assert.equal(n.transport, 'path'); assert.equal(n.transportPath, 'sweep');
  assert.equal(n.transportSpeed, 2); assert.equal(n.transportRadius, 0);
  checks += 4;
  assert.equal(normalizeLayoutParams({ transportPath: 'warp' }).transportPath, 'orbit', 'an unknown family is orbit');
  checks++;
  const d = normalizeLayoutParams({});
  assert.equal(d.transportPath, 'orbit'); assert.equal(d.transportSpeed, 1); assert.equal(d.transportRadius, 140);
  checks += 3;
  const v = validateLayoutParams({ transportSpeed: 'abc', transportRadius: null });
  ok(v.rejected.includes('transportSpeed') && v.rejected.includes('transportRadius'), 'non-numeric PATH params are rejected at the trust boundary');
  console.log('travel.selfcheck O path-params: spec, clamp, enum and trust boundary all hold');
}


// ── P. Q2 — the traveler budget ──────────────────────────────────────────
{
  // The cap table lives with the other device budgets and reads honestly:
  // desktop is the measured point, iPad is tighter, and each entry's timeMs
  // is the traveler count's cost equivalence against the declared cost.
  const declared = getCostTier('travel/flow');
  assert.equal(TRAVEL_BUDGETS.desktop.maxTravelers, TRAVEL_COST_REFERENCE_MARKS, 'the desktop cap is the count the FLOW cost was measured at');
  checks++;
  assert.equal(TRAVEL_BUDGETS.desktop.timeMs, declared.timeMs, 'the desktop cap costs exactly the declared travel cost');
  checks++;
  ok(TRAVEL_BUDGETS.ipad.maxTravelers < TRAVEL_BUDGETS.desktop.maxTravelers, 'the iPad class is the tighter cap');
  const perMark = declared.timeMs / TRAVEL_COST_REFERENCE_MARKS;
  ok(Math.abs(TRAVEL_BUDGETS.ipad.timeMs - TRAVEL_BUDGETS.ipad.maxTravelers * perMark) < 1e-9,
    'the iPad cap timeMs is its traveler count at the declared per-mark cost (a cost allowance, not a guess)');
  assert.equal(travelBudgetForDevice(true), TRAVEL_BUDGETS.ipad);
  assert.equal(travelBudgetForDevice(false), TRAVEL_BUDGETS.desktop);
  assert.equal(travelBudgetForDevice(undefined), TRAVEL_BUDGETS.desktop, 'an absent class reads desktop (the pre-Q2 behaviour)');
  checks += 3;

  // The selection itself: at or below the authored ceiling (requested),
  // at or below the class cap, and within the cap in cost terms.
  const under = selectTravelers({ requested: 120, ipadClass: false });
  assert.equal(under.travelers, 120, 'under the cap, the ceiling is honoured whole');
  checks++;
  const desk = selectTravelers({ requested: 5000, ipadClass: false });
  assert.equal(desk.travelers, 800, 'the desktop selection caps at the placement cap');
  checks++;
  ok(desk.estimatedMs <= desk.budgetMs + 1e-12, 'the desktop selection spends at most the budget in cost terms');
  const pad = selectTravelers({ requested: 5000, ipadClass: true });
  assert.equal(pad.travelers, TRAVEL_BUDGETS.ipad.maxTravelers, 'the iPad selection caps at the iPad travelers');
  checks++;
  ok(pad.estimatedMs <= pad.budgetMs + 1e-12, `the iPad selection spends at most its budget (${pad.estimatedMs.toFixed(5)} ≤ ${pad.budgetMs} ms)`);
  assert.equal(selectTravelers({ requested: 0, ipadClass: true }).travelers, 0);
  assert.equal(selectTravelers({ requested: -5, ipadClass: true }).travelers, 0);
  assert.equal(selectTravelers({ requested: NaN, ipadClass: true }).travelers, 0, 'a non-finite request selects nothing');
  checks += 3;
  // Purity / replay safety: identical recorded inputs → identical selection,
  // every time (no clock, no live readings, no randomness anywhere near it).
  for (let i = 0; i < 100; i++) assert.deepEqual(selectTravelers({ requested: 640, ipadClass: true }), selectTravelers({ requested: 640, ipadClass: true }));
  checks++;
  console.log('travel.selfcheck P budget table + selection: ceiling honoured, cap binds, cost terms hold, selection pure');

  // The selection's own cost: declared at registration, measured here.
  const bdecl = getCostTier('travel/budget');
  ok(!!bdecl && bdecl.tier === 0 && bdecl.timeMs === 0, 'travel/budget is declared, tier 0, timeMs 0 (below the registry ms scale)');
  const CALLS = 20000;
  let acc = 0;
  const t0 = performance.now();
  for (let i = 0; i < CALLS; i++) acc += selectTravelers({ requested: 800, ipadClass: true }).travelers;
  const perCallMs = (performance.now() - t0) / CALLS;
  assert.equal(acc, TRAVEL_BUDGETS.ipad.maxTravelers * CALLS);
  checks++;
  ok(perCallMs < 0.005, `selection cost ${perCallMs.toFixed(6)} ms/call is far below the registry's ms currency`);
  console.log(`travel.selfcheck P selection cost: ${(perCallMs * 1e6).toFixed(0)} ns/call over ${CALLS} calls (sandbox), once per scene/resolve`);

  // Live through the real placement path, on the tighter class: an
  // 800-mark FLOW scene travels only its first 500 instance indices.
  const BIG = lp({ count: 800, transport: 'flow', transportLeash: 112, transportFlow: 0.8 });
  const bigHomes = place(lp({ count: 800 }), null);
  const bigHomeByIndex = new Map(bigHomes.map((it) => [it.index, it]));
  const runBig = (ipadClass) => {
    const store = createTravelStore();
    const hashes = [];
    let items = null;
    for (let f = 0; f < 90; f++) {
      items = place(BIG, { store, sceneId: 'big', frameMs: 1000 / 60, shed: false, ipadClass });
      hashes.push(frameHash(items));
    }
    return { store, items, hashes };
  };
  const padRun = runBig(true);
  const snap = travelSceneSnapshot(padRun.store, 'big');
  ok(snap.states.length === TRAVEL_BUDGETS.ipad.maxTravelers, `exactly the budgeted travelers hold sim state (${snap.states.length})`);
  ok(snap.states.every((s) => s.index < TRAVEL_BUDGETS.ipad.maxTravelers), 'travelers are the first instance indices, ascending');
  let roamed = 0, homeExact = 0;
  for (const it of padRun.items) {
    const h = bigHomeByIndex.get(it.index);
    const d = Math.hypot(it.x - h.x, it.y - h.y);
    if (it.index < TRAVEL_BUDGETS.ipad.maxTravelers) { if (d > 0.5) roamed++; }
    else if (it.x === h.x && it.y === h.y) homeExact++;
  }
  ok(roamed > 250, `the budgeted travelers actually roam (${roamed} moved)`);
  ok(homeExact === 800 - TRAVEL_BUDGETS.ipad.maxTravelers, `every non-traveler presents exactly at home (${homeExact})`);
  // Replay safety under the budget: a fresh run of the same recorded inputs
  // lands on the same frames, bit for bit.
  const padRun2 = runBig(true);
  assert.deepEqual(padRun2.hashes, padRun.hashes, 'two fresh iPad-class runs: every frame identical');
  checks++;
  // The desktop class on the same scene is P1 exactly: every mark travels.
  const deskRun = runBig(false);
  const deskSnap = travelSceneSnapshot(deskRun.store, 'big');
  ok(deskSnap.states.length === 800, 'desktop class: all 800 marks hold state (P1 behaviour)');
  // Absent class (a pre-Q2 caller) is the desktop class, bit for bit.
  const legacyRun = runBig(undefined);
  assert.deepEqual(legacyRun.hashes, deskRun.hashes, 'no ipadClass on the travel input = the desktop run, bit for bit');
  checks++;
  console.log('travel.selfcheck P live: iPad class travels the budgeted subset, non-travelers at home, desktop/absent = P1');

  // A budget shrink under a live scene drops the excess state and the
  // excess marks present at home from that frame on.
  const shrinkStore = createTravelStore();
  for (let f = 0; f < 30; f++) place(BIG, { store: shrinkStore, sceneId: 'shrink', frameMs: 1000 / 60, shed: false, ipadClass: false });
  ok(travelSceneSnapshot(shrinkStore, 'shrink').states.length === 800, 'the scene roams whole on desktop first');
  const shrunk = place(BIG, { store: shrinkStore, sceneId: 'shrink', frameMs: 1000 / 60, shed: false, ipadClass: true });
  const shrinkSnap = travelSceneSnapshot(shrinkStore, 'shrink');
  ok(shrinkSnap.states.length === TRAVEL_BUDGETS.ipad.maxTravelers, 'the shrink drops state beyond the budget');
  ok(shrunk.every((it) => it.index < TRAVEL_BUDGETS.ipad.maxTravelers || (it.x === bigHomeByIndex.get(it.index).x && it.y === bigHomeByIndex.get(it.index).y)),
    'after the shrink, non-travelers present exactly at home');
  console.log('travel.selfcheck P shrink: excess state dropped, excess marks home');
}


// ── Q. Q4 — per-stratum leashes (#1575, ruled 2026-10-20) ────────────────
{
  const homes = place(lp(), null);
  const homeByIndex = new Map(homes.map((it) => [it.index, it]));
  const roam = (items) => {
    let max = 0, maxDx = 0, maxDy = 0;
    for (const it of items) {
      const h = homeByIndex.get(it.index);
      max = Math.max(max, Math.hypot(it.x - h.x, it.y - h.y));
      maxDx = Math.max(maxDx, Math.abs(it.x - h.x));
      maxDy = Math.max(maxDy, Math.abs(it.y - h.y));
    }
    return { max, maxDx, maxDy };
  };
  // Two strata threaded through ONE store — liveResolve's own seam (one
  // store per resolver, sceneId per stratum) — interleaved frame by
  // frame. Each stratum's interleaved frames must equal its solo run
  // hash-for-hash: per-scene state, per-scene leash, no bleed either way.
  const interleaved = (paramsA, paramsB, frames = 240) => {
    const solo = (params, sceneId) => {
      const store = createTravelStore();
      const hashes = [];
      for (let f = 0; f < frames; f++) hashes.push(frameHash(place(params, { store, sceneId, frameMs: 1000 / 60, shed: false })));
      return hashes;
    };
    const store = createTravelStore();
    const mixA = [], mixB = [];
    let itemsA = null, itemsB = null;
    for (let f = 0; f < frames; f++) {
      itemsA = place(paramsA, { store, sceneId: 'qa', frameMs: 1000 / 60, shed: false });
      mixA.push(frameHash(itemsA));
      itemsB = place(paramsB, { store, sceneId: 'qb', frameMs: 1000 / 60, shed: false });
      mixB.push(frameHash(itemsB));
    }
    assert.deepEqual(mixA, solo(paramsA, 'qa'), 'interleaved stratum A == solo stratum A, every frame');
    checks++;
    assert.deepEqual(mixB, solo(paramsB, 'qb'), 'interleaved stratum B == solo stratum B, every frame');
    checks++;
    return { itemsA, itemsB };
  };

  // FLOW: the tight stratum is held by the tight leash, the loose one by
  // the loose — same field, same strength, only the leash differs.
  {
    const { itemsA, itemsB } = interleaved(
      lp({ transport: 'flow', transportLeash: 40, transportFlow: 1 }),
      lp({ transport: 'flow', transportLeash: 280, transportFlow: 1 }));
    const rA = roam(itemsA), rB = roam(itemsB);
    ok(rA.max > 3, `the tight stratum still roams (max ${rA.max.toFixed(1)} px)`);
    ok(rA.max <= 40 * 1.5, `the tight leash holds FLOW: max ${rA.max.toFixed(1)} px vs leash 40 + spring allowance`);
    ok(rB.max <= 280 * 1.25, `the loose leash holds FLOW: max ${rB.max.toFixed(1)} px vs leash 280 + overshoot allowance`);
    ok(rB.max > rA.max + 40, `the leashes are really different laws: loose max ${rB.max.toFixed(1)} vs tight max ${rA.max.toFixed(1)}`);
    console.log(`travel.selfcheck Q flow-strata: leash 40 caps at ${rA.max.toFixed(1)} px, leash 280 at ${rB.max.toFixed(1)} px, interleaved == solo`);
  }

  // PATH (orbit, a centred family): the radial cap is exact per stratum.
  {
    const { itemsA, itemsB } = interleaved(
      lp({ transport: 'path', transportPath: 'orbit', transportRadius: 300, transportSpeed: 1, transportLeash: 60 }),
      lp({ transport: 'path', transportPath: 'orbit', transportRadius: 300, transportSpeed: 1, transportLeash: 280 }));
    const rA = roam(itemsA), rB = roam(itemsB);
    ok(rA.max <= 60 + 1e-9, `orbit capped by its own stratum's leash: max ${rA.max.toFixed(2)} px vs 60`);
    ok(rA.max > 45, `the tight cap binds (uncapped orbit reaches ~300): max ${rA.max.toFixed(2)} px`);
    ok(rB.max <= 280 + 1e-9, `orbit capped by the loose stratum's leash: max ${rB.max.toFixed(2)} px vs 280`);
    ok(rB.max > 200, `the loose stratum's orbit really travels: max ${rB.max.toFixed(2)} px`);
    console.log(`travel.selfcheck Q path-strata: orbit caps at ${rA.max.toFixed(1)} px (leash 60) and ${rB.max.toFixed(1)} px (leash 280)`);
  }

  // Sweep: the arc (y) reads its own stratum's leash; the lane (x) is
  // geometry and runs free under both leashes (the kept P2 sub-call).
  {
    const { itemsA, itemsB } = interleaved(
      lp({ transport: 'path', transportPath: 'sweep', transportRadius: 300, transportSpeed: 1, transportLeash: 50 }),
      lp({ transport: 'path', transportPath: 'sweep', transportRadius: 300, transportSpeed: 1, transportLeash: 200 }));
    const rA = roam(itemsA), rB = roam(itemsB);
    ok(rA.maxDy <= 50 + 1e-9, `sweep's arc capped by its own leash: max |dy| ${rA.maxDy.toFixed(2)} px vs 50`);
    ok(rB.maxDy <= 200 + 1e-9, `sweep's arc capped by the loose leash: max |dy| ${rB.maxDy.toFixed(2)} px vs 200`);
    ok(rB.maxDy > rA.maxDy + 30, `the arc really reads the stratum's leash: ${rB.maxDy.toFixed(1)} vs ${rA.maxDy.toFixed(1)} px`);
    ok(rA.maxDx > 150 && rB.maxDx > 150, `the lane runs free under both leashes: max |dx| ${rA.maxDx.toFixed(0)} / ${rB.maxDx.toFixed(0)} px`);
    console.log(`travel.selfcheck Q sweep-strata: arc caps ${rA.maxDy.toFixed(1)} px (leash 50) / ${rB.maxDy.toFixed(1)} px (leash 200); lane free`);
  }

  // A zero leash stills only its own stratum: no scene state is created
  // for it, its frame is the still frame, and its neighbour roams on.
  {
    const store = createTravelStore();
    let zeroItems = null, roamItems = null;
    for (let f = 0; f < 240; f++) {
      zeroItems = place(lp({ transport: 'flow', transportLeash: 0, transportFlow: 1 }), { store, sceneId: 'qz-a', frameMs: 1000 / 60, shed: false });
      roamItems = place(FLOW_LP, { store, sceneId: 'qz-b', frameMs: 1000 / 60, shed: false });
    }
    assert.equal(frameHash(zeroItems), frameHash(homes), 'the zero-leash stratum presents the still frame, bit for bit');
    checks++;
    ok(!store.scenes.has('qz-a'), 'the zero-leash stratum never creates travel state');
    ok(store.scenes.has('qz-b') && roam(roamItems).max > 20, `its neighbour stratum roams on the same store (max ${roam(roamItems).max.toFixed(1)} px)`);
    console.log('travel.selfcheck Q zero-stratum: leash 0 stills only its own stratum');
  }

  // Through the real resolver: the strata's leashes arrive via their
  // per-stratum snapshots (the active stratum's ride the live params) —
  // the same caps, the unset fallback, and the zero stratum, end to end.
  {
    const { createLiveResolver } = await import('../gl/liveResolve.mjs');
    const RLp = (over = {}) => ({ ...DEFAULT_LAYOUT_PARAMS, mode: 'random', count: 60, particleCount: 60, ...over });
    const RSnap = (over = {}) => ({
      seed: 1234, seedOffsets: null, paletteId: 'bone', paletteOverrides: null,
      layoutParams: RLp(over), lockedParams: {}, caGrid: null, enabledAssets: null,
    });
    const RBase = (aOver, bSnap) => ({
      canvasW: W, canvasH: H,
      layers: [
        { id: 'a', name: 'a', visible: true, layerBlendMode: 'normal', layerOpacity: 1 },
        { id: 'b', name: 'b', visible: true, layerBlendMode: 'normal', layerOpacity: 1 },
      ],
      activeLayerId: 'a', layerSnapshots: { b: bSnap }, seed: 1234, seedOffsets: null,
      paletteId: 'bone', paletteOverrides: null, userPalettes: [], layoutParams: RLp(aOver), caGrid: null,
      enabledAssets: null, assetWeightOverrides: {}, customAssets: [], quality: 'balanced', lockedParams: {},
      batchPaused: false, focusSwap: false, dtSec: 1 / 60, perfClampOverride: null, perfTier1: false, assetThin: false,
      slowRender: false, scaleMul: 1, alphaBoost: 0, effectiveScale: [0.5, 1.5], effectiveAlpha: [20, 100],
      phraseWrapGen: 0, attractor: null,
    });
    const RRun = (aOver, bSnap, frames = 30) => {
      const r = createLiveResolver();
      let out = null;
      for (let i = 0; i <= frames; i++) out = r.resolveLayers({ ...RBase(aOver, bSnap), loopTimeMs: i * 100 });
      r.dispose();
      return out;
    };
    const layerItems = (out, id) => out.find((e) => (e.layerId || e.id) === id)?.items || [];
    const layerHash = (out, id) => JSON.stringify(layerItems(out, id).map((i) => [i.x, i.y, i.key]));
    const RMax = (out, stillOut, id) => {
      const home = new Map(layerItems(stillOut, id).map((i) => [i.key, i]));
      let max = 0;
      for (const it of layerItems(out, id)) {
        const h = home.get(it.key);
        if (h) max = Math.max(max, Math.hypot(it.x - h.x, it.y - h.y));
      }
      return max;
    };
    const PATH = { transport: 'path', transportPath: 'orbit', transportRadius: 300, transportSpeed: 1 };
    // The still reference runs the SAME frame count: the always-alive
    // kineme drivers move items with loop time even when travel is off,
    // so homes are only comparable at the same final loopTimeMs.
    const stillOut = RRun({ transport: 'still' }, RSnap({ transport: 'still' }));
    // Different leashes per stratum, end to end: each caps its own marks
    // (the resolver adds the living-motion drivers on top of travel, so
    // the bound carries their allowance; the placement seam above holds
    // the exact cap).
    const diff = RRun({ ...PATH, transportLeash: 280 }, RSnap({ ...PATH, transportLeash: 45 }));
    const dA = RMax(diff, stillOut, 'a'), dB = RMax(diff, stillOut, 'b');
    ok(dA > 150, `resolver: the loose stratum travels (max ${dA.toFixed(1)} px, leash 280)`);
    ok(dB <= 45 * 1.45, `resolver: the tight stratum is held by its own leash (max ${dB.toFixed(1)} px, leash 45 + driver allowance)`);
    ok(dB < dA * 0.45, `resolver: the strata obey different laws (${dB.toFixed(1)} vs ${dA.toFixed(1)} px)`);
    // Unset per-stratum leash: a snapshot carrying no transportLeash at
    // all resolves bit-identically to the explicit shipped default —
    // the pre-Q4 defaults merge, unchanged.
    const unsetSnap = RSnap({ ...PATH });
    delete unsetSnap.layoutParams.transportLeash;
    const unsetRun = RRun({ transport: 'still' }, unsetSnap);
    const explicitRun = RRun({ transport: 'still' }, RSnap({ ...PATH, transportLeash: DEFAULT_LAYOUT_PARAMS.transportLeash }));
    assert.equal(layerHash(unsetRun, 'b'), layerHash(explicitRun, 'b'), 'a snapshot with no leash == the explicit default leash, bit for bit');
    checks++;
    // Zero leash on the snapshot stratum: it presents its still frame
    // while the active stratum roams.
    const zeroRun = RRun({ ...PATH, transportLeash: 280 }, RSnap({ ...PATH, transportLeash: 0 }));
    assert.equal(layerHash(zeroRun, 'b'), layerHash(stillOut, 'b'), 'resolver: the zero-leash stratum is its still frame, bit for bit');
    checks++;
    ok(RMax(zeroRun, stillOut, 'a') > 150, 'resolver: the roaming stratum is untouched by its neighbour\'s zero leash');
    console.log(`travel.selfcheck Q resolver-strata: caps ${dB.toFixed(1)} px (leash 45) vs ${dA.toFixed(1)} px (leash 280); unset == default; zero stills one stratum`);
  }
  console.log('travel.selfcheck Q per-stratum: FLOW + PATH + sweep caps per stratum, zero stills one, unset = default — parity intact');
}

console.log(`travel.selfcheck: ok — ${checks} checks passed (#1574 P1 + Q2 + #1575 P2 + Q4)`);
