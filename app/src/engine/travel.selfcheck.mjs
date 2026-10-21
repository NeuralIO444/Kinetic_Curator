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
//   I. Q2 BUDGET — the traveler budget (ruled 2026-10-20, governor-selected
//      within a device-class cap): the selection is a pure function of
//      recorded state (mark count + device class), the effective amount is
//      at or below the authored ceiling and at or below the class cap in
//      cost terms, non-travelers hold no state and present exactly at
//      home, a budget shrink drops their state, the desktop class is P1
//      bit-for-bit, and the selection's own cost is declared + measured.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildPlacements } from './buildPlacements.js';
import {
  createTravelStore, pruneTravelStore, travelSceneSnapshot, applyTransport,
  TRAVEL_STEP_SEC, TRANSPORT_MODES, selectTravelers, TRAVEL_COST_REFERENCE_MARKS,
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
  assert.deepEqual(TRANSPORT_MODES, ['still', 'flow']);
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

// ── I. Q2 — the traveler budget ──────────────────────────────────────────
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
  console.log('travel.selfcheck I budget table + selection: ceiling honoured, cap binds, cost terms hold, selection pure');

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
  console.log(`travel.selfcheck I selection cost: ${(perCallMs * 1e6).toFixed(0)} ns/call over ${CALLS} calls (sandbox), once per scene/resolve`);

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
  console.log('travel.selfcheck I live: iPad class travels the budgeted subset, non-travelers at home, desktop/absent = P1');

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
  console.log('travel.selfcheck I shrink: excess state dropped, excess marks home');
}

console.log(`travel.selfcheck: ok — ${checks} checks passed (#1574 P1 + Q2)`);
