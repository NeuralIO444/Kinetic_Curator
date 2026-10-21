// node src/engine/travelSurge.selfcheck.mjs
// #1576 travel kinemes P3 — SURGE (a z-approach driver with MANDATORY anticipation) + parallax drift (by zTier).
// Parity when off; the split line (parallax ships without surge and surge without parallax); determinism and
// snapshot continuation; the contract's z read; the travel-first shed; the Q3 trigger (a stamped taste call,
// recorded, never recomputed).
import assert from 'node:assert';
import { createHash } from 'node:crypto';
import { buildPlacements } from './buildPlacements.js';
import { createNoise } from './noise.js';
import { ASSETS } from '../data/assets/index.js';
import { resolvePalette } from '../data/palettes.js';
import { getQualityCaps } from '../data/quality.js';
import { DEFAULT_LAYOUT_PARAMS, normalizeLayoutParams } from '../data/layout-modes.js';
import {
  surgeEnvelope, surgeZ, noteSurge, parallaxDrift, surgeInstance, SURGE_S, SURGE_WINDOW_MS, TRAVEL_STEP,
  createTravelStore, travelLayer, advanceTravelClock, travelParams, snapshotTravelStore, restoreTravelStore,
  TRAVEL_SHED_MAX,
} from './travel.js';
import { buildSceneContract } from '../gl/sceneContract.js';
import { validateReply } from '../curator/mindContract.js';
import { surgeFromDecision, SURGE_MIN_BARS } from '../curator/surgeLive.js';

const W = 1000;
const H = 700;
const SEED = 777;
const CAST = ['geo_tri_01', 'org_blob_04', 'stamp_num_01', 'dot_field_01'].map((id) => ASSETS.find((a) => a.id === id)).filter(Boolean);
assert.ok(CAST.length === 4);
const palette = resolvePalette('hydra', null, []);
const caps = getQualityCaps('high');
const noise = createNoise(SEED);
const lp = (over = {}) => ({ ...DEFAULT_LAYOUT_PARAMS, count: 150, zTiers: 4, transport: 'still', ...over });
const build = (layoutParams, travel = null) => buildPlacements({
  layoutParams, seed: SEED, activeAssets: CAST, palette, caps, canvasW: W, canvasH: H, travel,
}).items;
const fp = (items) => createHash('sha256').update(JSON.stringify(items)).digest('hex');

/** Run frames 1..N; `trigger(f)` returns the stamped surge trigger for frame f (or null). */
function run(p, frames, { trigger = () => null, store = createTravelStore(), start = 1, shed = 0 } = {}) {
  let items = null;
  for (let f = start; f < start + frames; f++) {
    const params = travelParams(p, W, H, { shed });
    const layer = travelLayer(store, 'S', SEED, W, H);
    const now = f * (1000 / 60);
    advanceTravelClock(layer, now);
    const t = trigger(f);
    if (t && params.surge > 0) noteSurge(layer, t, params.surge, now);
    items = build(p, { layer, seed: SEED, W, H, noise, params });
  }
  return { items, store };
}

// ── the envelope: anticipation is MANDATORY — it leaves 0 at rest, settles AWAY first, then approaches ──────────
{
  assert.strictEqual(surgeEnvelope(0), 0);
  assert.strictEqual(surgeEnvelope(1), 0);
  assert.strictEqual(surgeEnvelope(-0.1), 0);
  const N = 2000;
  const z = Array.from({ length: N + 1 }, (_, i) => surgeEnvelope(i / N));
  const firstNeg = z.findIndex((v) => v < -1e-6);
  const firstPos = z.findIndex((v) => v > 1e-6);
  assert.ok(firstNeg > 0 && firstNeg < firstPos, 'anticipation: z goes negative (settles away) before it approaches');
  assert.ok(Math.min(...z) < -0.1, `the settle-away is visible (${Math.min(...z).toFixed(3)})`);
  assert.ok(Math.abs(z[1] - z[0]) < 1e-3, 'a surge never starts at full speed: zero slope at the trigger');
  assert.ok(Math.max(...z) > 1.0, 'the approach overshoots its extreme');
  const held = z.slice(Math.round(0.5 * N), Math.round(0.6 * N));
  assert.ok(Math.max(...held) - Math.min(...held) < 0.06, 'a held extreme');
  const tail = z.slice(Math.round(0.6 * N));
  assert.ok(Math.min(...tail) < 0, 'the release follows through below home before it settles');
  assert.ok(Math.abs(z[N - 1]) < 1e-3, 'and ends home');
  let maxStep = 0;
  for (let i = 1; i <= N; i++) maxStep = Math.max(maxStep, Math.abs(z[i] - z[i - 1]));
  assert.ok(maxStep < 0.01, 'continuous: no pop anywhere on the envelope');
  console.log(`travelSurge.selfcheck: ok (envelope: anticipation ${Math.min(...z).toFixed(3)} before the approach, overshoot ${Math.max(...z).toFixed(3)}, follow-through)`);
}

// ── parity: drift 0 + surge 0 (and a trigger with surge 0) is today's build, bit for bit ───────────────────────
{
  const base = fp(build(lp()));
  assert.strictEqual(fp(run(lp(), 120).items), base, 'off: today');
  assert.strictEqual(fp(run(lp(), 120, { trigger: () => ({ id: 1, amount: 1, atMs: 0 }) }).items), base, 'a trigger on a stratum with surge 0: today');
  assert.strictEqual(normalizeLayoutParams({}).transportParallax, 0);
  assert.strictEqual(normalizeLayoutParams({}).transportSurge, 0);
  assert.ok(build(lp()).every((it) => !('surgeZ' in it)), 'no z key at rest');
  console.log('travelSurge.selfcheck: ok (parity)');
}

// ── parallax drift: constant, by zTier (front faster), wraps without a pop, stateless in travel time ────────────
{
  const p = lp({ transportParallax: 1 });
  const home = new Map(build(lp()).map((it) => [it.key, it]));
  const a = run(p, 60).items;
  const b = run(p, 120).items;
  const speedByTier = new Map();
  for (let k = 0; k < a.length; k++) {
    const h = home.get(a[k].key);
    const da = Math.hypot(a[k].x - h.x, a[k].y - h.y);
    const db = Math.hypot(b[k].x - h.x, b[k].y - h.y);
    if (da > 0 && db < W * 0.5) {
      // frame 1 anchors the clock: 60 frames = 59 locked steps, 120 frames = 119
      assert.ok(Math.abs(db - (119 / 59) * da) < 1e-6 * Math.max(1, db), 'constant: the drift is linear in travel time');
      const list = speedByTier.get(a[k].zTier) || [];
      list.push(da);
      speedByTier.set(a[k].zTier, list);
    }
  }
  const tiers = [...speedByTier.keys()].sort((x, y) => x - y);
  assert.ok(tiers.length >= 2, 'several tiers placed');
  const mean = (t) => speedByTier.get(t).reduce((x, y) => x + y, 0) / speedByTier.get(t).length;
  for (let i = 1; i < tiers.length; i++) assert.ok(mean(tiers[i]) > mean(tiers[i - 1]), 'front tiers drift faster than ground');
  // the wrap: a mark carried across the domain re-enters the other side faded — never popping into view
  let maxVisJump = 0;
  let prev = null;
  for (let s = 0; s <= 120; s += 1 / 30) {
    const d = parallaxDrift(990, 350, 3, 4, 1, s, SEED, W, H, { x: 0, y: 0, a: 1 });
    const x = 990 + d.x; const y = 350 + d.y;
    if (prev && Math.hypot(x - prev.x, y - prev.y) > 50) {
      assert.ok(prev.a < 0.05 && d.a < 0.05, 'the wrap happens off canvas, faded out');
      const onCanvas = (q) => q.x >= 0 && q.x <= W && q.y >= 0 && q.y <= H;
      assert.ok(!onCanvas(prev) && !onCanvas({ x, y }), 'and both sides of the seam are off the canvas');
    } else if (prev) {
      maxVisJump = Math.max(maxVisJump, Math.hypot(x - prev.x, y - prev.y));
    }
    prev = { x, y, a: d.a };
  }
  assert.ok(maxVisJump < 2, 'a slow, constant drift');
  console.log(`travelSurge.selfcheck: ok (parallax: tiers ${tiers.map((t) => mean(t).toFixed(1)).join(' < ')} px over 1 s, wraps unseen)`);
}

// ── surge on a stratum: a share of marks rise to z ≈ 1 and come home; the contract reads it; anticipation shows ──
{
  const p = lp({ transportSurge: 1 });
  const trigger = (f) => (f >= 30 ? { id: 1, amount: 1, atMs: 30 * (1000 / 60) } : null);
  const seen = new Map();
  let maxZ = 0;
  let minZ = 0;
  let firstNegFrame = null;
  let firstPosFrame = null;
  const store = createTravelStore();
  for (let f = 1; f <= 240; f++) {
    const { items } = run(p, 1, { trigger, store, start: f });
    for (const it of items) {
      if (it.surgeZ === undefined) continue;
      seen.set(it.key, true);
      maxZ = Math.max(maxZ, it.surgeZ); minZ = Math.min(minZ, it.surgeZ);
      if (it.surgeZ < 0 && firstNegFrame === null) firstNegFrame = f;
      if (it.surgeZ > 0 && firstPosFrame === null) firstPosFrame = f;
    }
  }
  assert.ok(firstNegFrame !== null && firstNegFrame < firstPosFrame, 'on the stage too: settle away first');
  assert.ok(maxZ > 1 && minZ < -0.1, `z spans the envelope (${minZ.toFixed(2)}..${maxZ.toFixed(2)})`);
  const n = build(p).length;
  assert.ok(seen.size > 0.35 * n && seen.size < 0.65 * n, `a share surges at intensity 1 (${seen.size}/${n})`);
  const after = run(p, 1, { trigger, store, start: 241 }).items;
  assert.ok(after.every((it) => !('surgeZ' in it)), 'and every mark is home after its envelope');
  assert.strictEqual(fp(after), fp(build(p)), 'home: the build is today\'s again, bit for bit');

  // the contract: z reads as scale-up + rise + sharper alpha; no z → the exact old instance
  const s0 = surgeInstance(1, 2, 2, 100, 0.4);
  assert.deepStrictEqual(s0, { scaleX: 3, scaleY: 3, y: 90, opacity: 0.7 });
  const sA = surgeInstance(-0.1, 2, 2, 100, 0.4);
  assert.ok(sA.scaleX < 2 && sA.y > 100 && sA.opacity === 0.4, 'anticipation: draws back and sinks, alpha untouched');
  const doc = { seed: SEED, quality: 'balanced', layers: [] };
  const item = { ...build(lp())[0] };
  const mk = (it) => buildSceneContract({ doc, resolvedLayers: [{ id: 'S', layer: { id: 'S', visible: true, layerBlendMode: 'normal', layerOpacity: 1 }, layerOpacity: 1, layoutParams: lp(), items: [it] }], caps: null, accum: null });
  const c0 = mk(item);
  const c1 = mk({ ...item, surgeZ: 0.5 });
  const i0 = c0.instances[0];
  const i1 = c1.instances[0];
  assert.ok(i0 && i1, 'the contract carries the instance');
  assert.ok(i1.scaleY > i0.scaleY && i1.y < i0.y && i1.opacity >= i0.opacity, 'the contract reads z');
  assert.deepStrictEqual(Object.keys(i1).sort(), Object.keys(i0).sort(), 'no new contract key: the z is read, not carried');
  assert.deepStrictEqual(mk({ ...item }).instances, c0.instances, 'no z: the exact old instance');
  console.log(`travelSurge.selfcheck: ok (surge on stage: ${seen.size}/${n} marks, settle-away at frame ${firstNegFrame} before the approach at ${firstPosFrame})`);
}

// ── the split line: parallax ships without surge, surge without parallax ────────────────────────────────────────
{
  const trigger = (f) => (f >= 10 ? { id: 1, amount: 1, atMs: 10 * (1000 / 60) } : null);
  const both = run(lp({ transportParallax: 1, transportSurge: 1 }), 90, { trigger }).items;
  const driftOnly = run(lp({ transportParallax: 1 }), 90, { trigger }).items;
  const surgeOnly = run(lp({ transportSurge: 1 }), 90, { trigger }).items;
  assert.ok(driftOnly.every((it) => !('surgeZ' in it)), 'drift alone: no z');
  const home = build(lp());
  assert.ok(surgeOnly.every((it, k) => it.x === home[k].x && it.y === home[k].y), 'surge alone: no drift — z never moves the anchor');
  for (let k = 0; k < both.length; k++) {
    assert.strictEqual(both[k].x, driftOnly[k].x, 'together = drift positions …');
    assert.strictEqual(both[k].surgeZ, surgeOnly[k].surgeZ, '… + surge z, independently');
  }
  console.log('travelSurge.selfcheck: ok (splittable: parallax without surge, surge without parallax)');
}

// ── determinism, snapshot continuation, and the shed/stale rules ────────────────────────────────────────────────
{
  const p = lp({ transportParallax: 0.6, transportSurge: 0.8, transport: 'flow' });
  const trigger = (f) => (f >= 50 ? { id: 3, amount: 0.7, atMs: 50 * (1000 / 60) } : null);
  const a = run(p, 200, { trigger });
  const b = run(p, 200, { trigger });
  assert.strictEqual(fp(a.items), fp(b.items), 'bit-identical reruns');
  const half = run(p, 100, { trigger });
  const snap = JSON.parse(JSON.stringify(snapshotTravelStore(half.store)));
  const st2 = createTravelStore();
  assert.ok(restoreTravelStore(st2, snap), 'the surge record rides the snapshot');
  const cont = run(p, 100, { trigger, store: st2, start: 101 });
  assert.strictEqual(fp(cont.items), fp(a.items), 'a snapshot continues bit-identically through a live surge');

  // shed home: the travel-first shed withdraws drift and surge with the transports
  assert.strictEqual(travelParams(p, W, H, { shed: TRAVEL_SHED_MAX }).parallax, 0);
  assert.strictEqual(travelParams(p, W, H, { shed: TRAVEL_SHED_MAX }).surge, 0);
  assert.ok(travelParams(p, W, H, { shed: 1 }).parallax > 0, 'partial sheds keep the drift');

  // a trigger first seen after its window is spent (a stratum added later, a reseed): never replays itself
  const L = travelLayer(createTravelStore(), 'x', 1, W, H);
  noteSurge(L, { id: 9, amount: 1, atMs: 0 }, 1, SURGE_WINDOW_MS + 1);
  assert.strictEqual(L.surge.amount, 0, 'stale → spent');
  noteSurge(L, { id: 9, amount: 1, atMs: SURGE_WINDOW_MS }, 1, SURGE_WINDOW_MS + 1);
  assert.strictEqual(L.surge.amount, 0, 'the same id again is a no-op');
  const L2 = travelLayer(createTravelStore(), 'x', 1, W, H);
  noteSurge(L2, { id: 9, amount: 0.5, atMs: 1000 }, 0.5, 1100);
  assert.strictEqual(L2.surge.amount, 0.25, 'fresh: intensity × the stratum\'s depth');
  assert.strictEqual(surgeZ(L2.surge, 1, 0, 1e9), 0, 'long after: home');
  void SURGE_S; void TRAVEL_STEP;
  console.log('travelSurge.selfcheck: ok (determinism, snapshot, shed, stale triggers)');
}

// ── Q3: the trigger is a stamped taste call — validated, rate-limited per phrase, never re-decided on replay ─────
{
  assert.deepStrictEqual(validateReply('queen', { mood: 'lift', lean: {}, surge: 0.6 }), { mood: 'lift', lean: {}, surge: 0.6 });
  assert.deepStrictEqual(validateReply('queen', { mood: 'lift', lean: {} }), { mood: 'lift', lean: {} }, 'no surge: the old reply exactly');
  assert.deepStrictEqual(validateReply('queen', { mood: 'lift', lean: {}, surge: 0 }), { mood: 'lift', lean: {} }, 'surge 0 says nothing');
  assert.strictEqual(validateReply('queen', { mood: 'lift', surge: 3 }), null, 'out of range is malformed, not clamped');
  const d = (bar, surge, persona = 'queen') => ({ persona, bar, reply: { mood: 'lift', lean: {}, ...(surge !== undefined ? { surge } : {}) } });
  assert.strictEqual(surgeFromDecision(d(4), null, 1, 100), null, 'no surge asked');
  assert.strictEqual(surgeFromDecision(d(4, 0.5, 'lois'), null, 1, 100), null, 'only her decisions stamp');
  assert.deepStrictEqual(surgeFromDecision(d(4, 0.5), null, 1, 100), { id: 1, amount: 0.5, atMs: 100, bar: 4 });
  assert.strictEqual(surgeFromDecision(d(4 + SURGE_MIN_BARS - 1, 0.5), 4, 2, 100), null, 'at most one per phrase');
  assert.ok(surgeFromDecision(d(4 + SURGE_MIN_BARS, 0.5), 4, 2, 100), 'a phrase later: again');
  console.log('travelSurge.selfcheck: ok (Q3 trigger: validated, once a phrase, stamped not recomputed)');
}

console.log('travelSurge.selfcheck: OK');
