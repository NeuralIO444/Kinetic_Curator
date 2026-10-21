// node src/engine/travel.selfcheck.mjs
// #1574 travel kinemes P1 — the transport core: parity (still = today, bit for bit), fixed-step determinism, the
// leash, the timing law's anticipation, settle-home, snapshot continuation, clock rollback/freeze.
import assert from 'node:assert';
import { createHash } from 'node:crypto';
import { buildPlacements } from './buildPlacements.js';
import { createNoise } from './noise.js';
import { ASSETS } from '../data/assets/index.js';
import { resolvePalette } from '../data/palettes.js';
import { getQualityCaps } from '../data/quality.js';
import { DEFAULT_LAYOUT_PARAMS, normalizeLayoutParams } from '../data/layout-modes.js';
import {
  TRAVEL_STEP, TRAVEL_MAX_STEPS, createTravelStore, travelLayer, advanceTravelClock, travelParams, applyTravel,
  snapshotTravelStore, restoreTravelStore, checkTravelSnapshot, pruneTravelStore,
  travelBudget, TRAVEL_SHED_FRACTIONS, DEFAULT_CEILING,
} from './travel.js';
import { TRAVEL_BUDGETS, travelBudgetForDevice } from '../data/quality.js';

const W = 1000;
const H = 700;
const SEED = 4242;
const CAST = ['line_squiggle_01', 'stamp_num_01', 'geo_tri_01', 'org_blob_04'].map((id) => ASSETS.find((a) => a.id === id)).filter(Boolean);
assert.ok(CAST.length >= 3, 'cast resolves');
const palette = resolvePalette('hydra', null, []);
const caps = getQualityCaps('high');
const noise = createNoise(SEED);

const lp = (over = {}) => ({ ...DEFAULT_LAYOUT_PARAMS, count: 80, mode: DEFAULT_LAYOUT_PARAMS.mode, ...over });
const build = (layoutParams, travel = null, cache = undefined) => buildPlacements({
  layoutParams, seed: SEED, activeAssets: CAST, palette, caps, canvasW: W, canvasH: H, travel, cache,
}).items;
const fp = (items) => createHash('sha256').update(JSON.stringify(items)).digest('hex');

function ctxFor(store, layoutParams, nowMs, frozen = false) {
  const params = travelParams(layoutParams, W, H);
  const layer = travelLayer(store, 'L1', SEED, W, H);
  advanceTravelClock(layer, nowMs, frozen);
  return { layer, seed: SEED, W, H, noise, params };
}

// ── params + the hard gate ─────────────────────────────────────────────────────────────────────────────────────
{
  assert.strictEqual(DEFAULT_LAYOUT_PARAMS.transport, 'still', 'P1 default: still (today)');
  assert.strictEqual(travelParams(lp(), W, H).active, false, 'still is inactive');
  assert.strictEqual(travelParams(lp({ transport: 'flow' }), W, H).active, true, 'flow is active');
  assert.strictEqual(travelParams(lp({ transport: 'flow', transportLeash: 0 }), W, H).active, false, 'leash 0 = still');
  assert.strictEqual(travelParams(lp({ transport: 'flow', transportFlow: 0 }), W, H).active, false, 'flow 0 = still');
  assert.strictEqual(travelParams(lp({ transport: 'bogus' }), W, H).active, false, 'unknown mode = still');
  const p = travelParams(lp({ transport: 'flow' }), W, H);
  assert.ok(Math.abs(p.L - 0.16 * 700) < 1e-9, 'leash in px of the small dimension');
  assert.ok(Math.abs(p.cruise - 0.11 * 700) < 1e-9, 'flow 0.5 = the spike cruise (0.11·m/s)');
  const norm = normalizeLayoutParams({ transport: 'warp', transportLeash: 9, transportFlow: -1 });
  assert.strictEqual(norm.transport, 'still');
  assert.strictEqual(norm.transportLeash, 0.4);
  assert.strictEqual(norm.transportFlow, 0);
  console.log('travel.selfcheck: ok (params + hard gate)');
}

// ── parity: still / leash 0 / flow 0 are bit-identical to a build without travel ─────────────────────────────────
{
  const base = fp(build(lp()));
  for (const over of [{}, { transport: 'flow', transportLeash: 0 }, { transport: 'flow', transportFlow: 0 }]) {
    const store = createTravelStore();
    let last = null;
    for (let f = 1; f <= 30; f++) last = build(lp(over), ctxFor(store, lp(over), f * 16.7));
    assert.strictEqual(fp(last), base, `parity: ${JSON.stringify(over)} is today's build, bit for bit`);
    assert.strictEqual(store.layers.get('L1').marks.size, 0, 'no state is created while the gate holds');
  }
  // the cached path too (pool + geometry caches): still with a ctx never perturbs the cache
  const cache = {};
  const c0 = fp(build(lp(), null, cache));
  const store = createTravelStore();
  for (let f = 1; f <= 5; f++) assert.strictEqual(fp(build(lp(), ctxFor(store, lp(), f * 16.7), cache)), c0, 'cached parity');
  console.log('travel.selfcheck: ok (parity)');
}

// ── fixed-step determinism: same seed + same step count = same positions, however the frames were paced ─────────
function runPaced(paceMs, totalMs) {
  const store = createTravelStore();
  const p = lp({ transport: 'flow' });
  let t = 0;
  let items = build(p, ctxFor(store, p, 0)); // anchors the clock at 0
  while (t < totalMs - 1e-9) { t = Math.min(totalMs, t + paceMs); items = build(p, ctxFor(store, p, t)); }
  return { items, store };
}
{
  // 0 anchors the clock; 6000 ms ⇒ 360 steps either way
  const a = runPaced(1000 / 60, 6000);
  const b = runPaced(2000 / 60, 6000);
  const ca = travelLayer(a.store, 'L1', SEED, W, H);
  const cb = travelLayer(b.store, 'L1', SEED, W, H);
  assert.strictEqual(ca.stepN, cb.stepN, 'same step count');
  assert.strictEqual(ca.stepN, 360, '6 s = 360 steps');
  assert.strictEqual(fp(a.items), fp(b.items), 'same step count ⇒ same trajectory hash, bit for bit');
  const c = runPaced(1000 / 60, 6000);
  assert.strictEqual(fp(c.items), fp(a.items), 'a rerun is bit-identical');
  const moved = a.items.filter((it, k) => it.x !== build(lp())[k].x).length;
  assert.ok(moved > 10, `flow moves marks (${moved})`);
  console.log('travel.selfcheck: ok (fixed-step determinism)');
}

// ── the leash: marks leave home and stay on it (spring overshoot is the follow-through) ─────────────────────────
{
  const store = createTravelStore();
  const p = lp({ transport: 'flow' });
  const L = travelParams(p, W, H).L;
  const home = build(lp());
  const homeByKey = new Map(home.map((it) => [it.key, it]));
  const dists = [];
  for (let f = 1; f <= 900; f++) {
    const items = build(p, ctxFor(store, p, f * (1000 / 60)));
    if (f > 120) for (const it of items) { const h = homeByKey.get(it.key); dists.push(Math.hypot(it.x - h.x, it.y - h.y)); }
  }
  dists.sort((x, y) => x - y);
  const q = (u) => dists[Math.round(u * (dists.length - 1))];
  assert.ok(q(0.5) > 0.25 * L, `p50 roams well past the rhythm cap (${q(0.5).toFixed(1)} px, L ${L.toFixed(0)})`);
  assert.ok(q(1) < 1.25 * L, `max stays on the leash (${q(1).toFixed(1)} ≤ 1.25·L)`);
  assert.ok(q(0.99) > L, 'some marks overshoot the leash (follow-through)');
  console.log(`travel.selfcheck: ok (leash: p50 ${q(0.5).toFixed(1)} p90 ${q(0.9).toFixed(1)} max ${q(1).toFixed(1)} px, L ${L.toFixed(0)})`);
}

// ── anticipation: a departure pulls AGAINST its direction before it goes (the timing law) ───────────────────────
{
  const store = createTravelStore();
  const p = lp({ transport: 'flow' });
  const layer = travelLayer(store, 'L1', SEED, W, H);
  let sawAntic = 0;
  let ok = 0;
  for (let f = 1; f <= 240; f++) {
    build(p, ctxFor(store, p, f * (1000 / 60)));
    for (const s of layer.marks.values()) {
      if (s.ph === 0 && s.t < 0.1) { // late in anticipation: velocity points backward along the chosen direction
        sawAntic++;
        if (s.vx * s.dx + s.vy * s.dy < 0) ok++;
      }
    }
  }
  assert.ok(sawAntic > 20, `anticipation phases observed (${sawAntic})`);
  assert.strictEqual(ok, sawAntic, 'every anticipation moves against the coming direction');
  console.log('travel.selfcheck: ok (anticipation)');
}

// ── settle: switching travel off glides every mark home and drops its state; then the build is today's exactly ──
{
  const store = createTravelStore();
  const on = lp({ transport: 'flow' });
  let f = 0;
  for (; f < 300; f++) build(on, ctxFor(store, on, (f + 1) * (1000 / 60)));
  const layer = travelLayer(store, 'L1', SEED, W, H);
  assert.ok(layer.marks.size > 0, 'travellers exist');
  const off = lp();
  let items = null;
  let frames = 0;
  while (layer.marks.size > 0 && frames < 1200) { f++; frames++; items = build(off, ctxFor(store, off, (f + 1) * (1000 / 60))); }
  assert.strictEqual(layer.marks.size, 0, `every mark settled home (${frames} frames)`);
  assert.ok(frames < 600, 'settle takes under ten seconds');
  assert.strictEqual(fp(items), fp(build(lp())), 'once home: today\'s build, bit for bit');
  console.log(`travel.selfcheck: ok (settle home in ${(frames / 60).toFixed(1)} s)`);
}

// ── clock: rollback holds, freeze credits nothing and banks nothing, a big gap is capped ─────────────────────────
{
  const L = travelLayer(createTravelStore(), 'x', 1, W, H);
  assert.strictEqual(advanceTravelClock(L, 1000), 0, 'first call anchors');
  assert.strictEqual(advanceTravelClock(L, 1000 + 1000 / 60), 1);
  assert.strictEqual(advanceTravelClock(L, 900), 0, 'a backward jump never steps');
  assert.strictEqual(L.lastMs, 1000 + 1000 / 60, 'high-water: lastMs never walks down');
  assert.strictEqual(advanceTravelClock(L, 5000, true), 0, 'frozen: nothing');
  assert.strictEqual(advanceTravelClock(L, 5000 + 1000 / 60), 1, 'the thaw credits only its own frame');
  assert.strictEqual(advanceTravelClock(L, 60000), TRAVEL_MAX_STEPS, 'a stall is capped');
  assert.strictEqual(advanceTravelClock(L, 60000 + 1), 0, 'and not banked');
  assert.ok(TRAVEL_STEP === 1 / 60);
  console.log('travel.selfcheck: ok (clock)');
}

// ── undo: a held frame (0 steps) twice is the same picture — the cached positions never walk ─────────────────────
{
  const store = createTravelStore();
  const p = lp({ transport: 'flow' });
  const cache = {};
  for (let f = 1; f <= 120; f++) build(p, ctxFor(store, p, f * (1000 / 60)), cache);
  const a = fp(build(p, ctxFor(store, p, 120 * (1000 / 60)), cache));
  const b = fp(build(p, ctxFor(store, p, 120 * (1000 / 60)), cache));
  assert.strictEqual(a, b, 'held frame repeats');
  assert.strictEqual(fp(build(lp(), null, cache)), fp(build(lp())), 'the cache holds home, not the last offset');
  console.log('travel.selfcheck: ok (undo)');
}

// ── snapshot: a restored store continues bit-identically ────────────────────────────────────────────────────────
{
  const p = lp({ transport: 'flow' });
  const A = createTravelStore();
  for (let f = 1; f <= 200; f++) build(p, ctxFor(A, p, f * (1000 / 60)));
  const snap = JSON.parse(JSON.stringify(snapshotTravelStore(A)));
  assert.ok(checkTravelSnapshot(snap), 'snapshot validates');
  const B = createTravelStore();
  assert.ok(restoreTravelStore(B, snap), 'restores');
  let ia = null;
  let ib = null;
  for (let f = 201; f <= 400; f++) {
    ia = build(p, ctxFor(A, p, f * (1000 / 60)));
    ib = build(p, ctxFor(B, p, f * (1000 / 60)));
  }
  assert.strictEqual(fp(ia), fp(ib), 'continuation is bit-identical');
  assert.strictEqual(checkTravelSnapshot({ v: 1, layers: [['L1', { key: 'k', lastMs: 0, acc: 0, stepN: -1, marks: [] }]] }), false, 'fail-closed');
  assert.strictEqual(restoreTravelStore(B, { v: 2 }), false, 'a bad snapshot is refused');
  pruneTravelStore(A, new Set());
  assert.strictEqual(A.layers.size, 0, 'prune drops strata gone from the document');
  console.log('travel.selfcheck: ok (snapshot)');
}

// ── pinned marks stay home; a reseed starts a new scene ─────────────────────────────────────────────────────────
{
  const p = lp({ transport: 'flow' });
  const store = createTravelStore();
  const pinned = new Set([CAST[0].id]);
  let items = null;
  for (let f = 1; f <= 200; f++) {
    const ctx = ctxFor(store, p, f * (1000 / 60));
    ctx.stillAssets = pinned;
    items = build(p, ctx);
  }
  const home = new Map(build(lp()).map((it) => [it.key, it]));
  for (const it of items) if (it.assetId === CAST[0].id) assert.ok(it.x === home.get(it.key).x && it.y === home.get(it.key).y, 'pinned stays home');
  const L1 = travelLayer(store, 'L1', SEED, W, H);
  assert.ok(L1.marks.size > 0);
  const L2 = travelLayer(store, 'L1', SEED + 1, W, H);
  assert.notStrictEqual(L1, L2, 'a reseed is a new scene');
  assert.strictEqual(L2.marks.size, 0);
  console.log('travel.selfcheck: ok (pins + reseed)');
}

// ── Q2: the budget — governor-selected within the device-class cap; the author sets the ceiling ────────────────
{
  assert.strictEqual(DEFAULT_LAYOUT_PARAMS.transportCeiling, DEFAULT_CEILING);
  assert.strictEqual(DEFAULT_CEILING, TRAVEL_BUDGETS.desktop, 'a fresh scene asks for the full desktop measure');
  assert.strictEqual(travelBudgetForDevice(false), TRAVEL_BUDGETS.desktop);
  assert.strictEqual(travelBudgetForDevice(true), TRAVEL_BUDGETS.ipad);
  assert.ok(TRAVEL_BUDGETS.ipad < TRAVEL_BUDGETS.desktop);
  assert.strictEqual(travelBudget(400, null, 0), 400, 'no cap: the ceiling');
  assert.strictEqual(travelBudget(400, 250, 0), 250, 'the device cap bounds the ceiling');
  assert.strictEqual(travelBudget(100, 250, 0), 100, 'the ceiling bounds the device');
  assert.deepStrictEqual([0, 1, 2, 3].map((l) => travelBudget(400, 400, l)), [400, 200, 100, 0], 'the rung');
  assert.deepStrictEqual(TRAVEL_SHED_FRACTIONS, [1, 0.5, 0.25, 0]);
  assert.strictEqual(travelBudget(400, 400, 99), 0, 'past the last level: home');
  assert.strictEqual(travelParams(lp({ transport: 'flow' }), W, H, { shed: 3 }).active, false, 'shed home is the hard gate');
  assert.strictEqual(travelParams(lp({ transport: 'flow', transportCeiling: 0 }), W, H).active, false, 'ceiling 0 = still');

  // the selection: at most `budget` travellers, a NESTED subset as the budget tightens
  const run = (budgetShed, cap, frames = 90) => {
    const store = createTravelStore();
    const p = lp({ transport: 'flow' });
    for (let f = 1; f <= frames; f++) {
      const params = travelParams(p, W, H, { deviceCap: cap, shed: budgetShed });
      const layer = travelLayer(store, 'L1', SEED, W, H);
      advanceTravelClock(layer, f * (1000 / 60));
      build(p, { layer, seed: SEED, W, H, noise, params });
    }
    return new Set(travelLayer(store, 'L1', SEED, W, H).marks.keys());
  };
  const all = run(0, null);
  const ten = run(0, 10);
  const five = run(1, 10);
  assert.ok(all.size > 10, `uncapped: every mark travels (${all.size})`);
  assert.strictEqual(ten.size, 10, 'a cap of 10 → 10 travellers');
  assert.strictEqual(five.size, 5, 'shed level 1 halves it');
  for (const i of five) assert.ok(ten.has(i), 'nested: the tighter budget keeps a subset');

  // shedding to home mid-scene: every traveller settles, and the build is today's again, bit for bit
  {
    const store = createTravelStore();
    const p = lp({ transport: 'flow' });
    let f = 0;
    const frame = (shed) => {
      f++;
      const params = travelParams(p, W, H, { deviceCap: 400, shed });
      const layer = travelLayer(store, 'L1', SEED, W, H);
      advanceTravelClock(layer, f * (1000 / 60));
      return build(p, { layer, seed: SEED, W, H, noise, params });
    };
    for (let i = 0; i < 200; i++) frame(0);
    let items = null;
    for (let i = 0; i < 900 && travelLayer(store, 'L1', SEED, W, H).marks.size; i++) items = frame(3);
    assert.strictEqual(travelLayer(store, 'L1', SEED, W, H).marks.size, 0, 'shed home: every mark settled');
    assert.strictEqual(fp(items), fp(build(lp())), 'shed home = today\'s output exactly');
  }
  console.log('travel.selfcheck: ok (Q2 budget: ceiling × device cap × governor rung, nested selection, shed home)');
}

void applyTravel;
console.log('travel.selfcheck: OK');
