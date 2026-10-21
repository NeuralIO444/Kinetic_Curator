// node src/engine/travelPath.selfcheck.mjs
// #1575 travel kinemes P2 — PATH transports + assignment: the four path families (pure functions of t, seed,
// params), family defaults (Q1), the per-stratum leash (Q4), stretch along velocity, the Jell-O census metric,
// parity for still scenes, determinism.
import assert from 'node:assert';
import { createHash } from 'node:crypto';
import { buildPlacements } from './buildPlacements.js';
import { createNoise } from './noise.js';
import { ASSETS } from '../data/assets/index.js';
import { resolvePalette } from '../data/palettes.js';
import { getQualityCaps } from '../data/quality.js';
import { DEFAULT_LAYOUT_PARAMS, NEW_SCENE_LAYOUT_PARAMS } from '../data/layout-modes.js';
import {
  PATH_KINDS, TRANSPORT_MODES, TRAVEL_STEP, STRETCH_CAP, familyTransport, pathDisplacement, segmentShape, pathProgress,
  createTravelStore, travelLayer, advanceTravelClock, travelParams, jelloReadout, snapshotTravelStore, restoreTravelStore,
} from './travel.js';

const W = 1000;
const H = 700;
const SEED = 909;
const byId = new Map(ASSETS.map((a) => [a.id, a]));
const pick = (pred, n) => ASSETS.filter(pred).slice(0, n);
const LINE = pick((a) => a.category === 'linework' && !(a.density === 'solid' && a.weight === 'heavy'), 2);
const GLYPH = pick((a) => (a.tags || []).includes('glyph') && a.category === 'stamps', 2);
const HEAVY = pick((a) => a.density === 'solid' && a.weight === 'heavy', 2);
const GEO = pick((a) => a.category === 'geometric' && !(a.tags || []).includes('letter'), 2);
assert.ok(LINE.length === 2 && GLYPH.length === 2 && HEAVY.length === 2 && GEO.length === 2, 'family casts resolve');
const CAST = [...LINE, ...GLYPH, ...HEAVY, ...GEO];
const palette = resolvePalette('hydra', null, []);
const caps = getQualityCaps('high');
const noise = createNoise(SEED);
const lp = (over = {}) => ({ ...DEFAULT_LAYOUT_PARAMS, count: 120, transport: 'still', ...over });
const build = (layoutParams, travel = null, cast = CAST) => buildPlacements({
  layoutParams, seed: SEED, activeAssets: cast, palette, caps, canvasW: W, canvasH: H, travel,
}).items;
const fp = (items) => createHash('sha256').update(JSON.stringify(items)).digest('hex');

function runFrames(p, frames, { store = createTravelStore(), id = 'S', cast = CAST, start = 1 } = {}) {
  let items = null;
  let ctx = null;
  for (let f = start; f < start + frames; f++) {
    const layer = travelLayer(store, id, SEED, W, H);
    advanceTravelClock(layer, f * (1000 / 60));
    ctx = { layer, seed: SEED, W, H, noise, params: travelParams(p, W, H) };
    items = build(p, ctx, cast);
  }
  return { items, store, ctx };
}
const homeOf = (p, cast = CAST) => new Map(build({ ...p, transport: 'still' }, null, cast).map((it) => [it.key, it]));

// ── vocabulary ─────────────────────────────────────────────────────────────────────────────────────────────────
assert.deepStrictEqual([...TRANSPORT_MODES], ['auto', 'still', 'flow', 'path']);
assert.deepStrictEqual([...PATH_KINDS], ['orbit', 'spiral', 'sweep', 'lissajous']);
assert.strictEqual(DEFAULT_LAYOUT_PARAMS.transport, 'still', 'saved things open as saved');
assert.strictEqual(NEW_SCENE_LAYOUT_PARAMS.transport, 'auto', 'a fresh scene starts on the family defaults');
assert.strictEqual(DEFAULT_LAYOUT_PARAMS.transportPath, 'orbit');

// ── Q1 family defaults: linework + glyphs roam, heavy solids anchor, the unnamed rest is still ──────────────────
{
  for (const a of LINE) assert.strictEqual(familyTransport(a), 'flow', `${a.id}: linework flows`);
  for (const a of GLYPH) assert.strictEqual(familyTransport(a), 'path', `${a.id}: glyphs travel their path`);
  for (const a of HEAVY) assert.strictEqual(familyTransport(a), 'still', `${a.id}: heavy solids anchor`);
  for (const a of GEO) assert.strictEqual(familyTransport(a), 'still', `${a.id}: an unnamed family is still`);
  const letter = byId.get('typ_A');
  assert.strictEqual(familyTransport(letter), 'path', 'letters (type) are glyphs');
  assert.strictEqual(familyTransport({ id: 'x', category: 'linework', density: 'solid', weight: 'heavy' }), 'still', 'a heavy-solid line anchors (the anchor rule wins)');
  assert.strictEqual(familyTransport(null), 'still');

  const p = lp({ transport: 'auto' });
  const home = homeOf(p);
  const { items } = runFrames(p, 240);
  const famOf = new Map(CAST.map((a) => [a.id, familyTransport(a)]));
  const moved = { flow: 0, path: 0, still: 0 };
  const total = { flow: 0, path: 0, still: 0 };
  for (const it of items) {
    const h = home.get(it.key);
    const f = famOf.get(it.assetId);
    total[f]++;
    if (Math.hypot(it.x - h.x, it.y - h.y) > 1) moved[f]++;
  }
  assert.strictEqual(moved.still, 0, 'auto: every still-family mark is home, exactly');
  assert.ok(moved.flow > 0.6 * total.flow, `auto: linework roams (${moved.flow}/${total.flow})`);
  assert.ok(moved.path > 0.6 * total.path, `auto: glyphs roam (${moved.path}/${total.path})`);
  // the per-stratum override tames: still is still for every family
  assert.strictEqual(fp(runFrames(lp({ transport: 'still' }), 60).items), fp(build(lp())), 'override: still');
  // and an explicit mode applies to every mark, heavy solids included
  const all = runFrames(lp({ transport: 'path' }), 240).items;
  const allMoved = all.filter((it) => { const h = home.get(it.key); return Math.hypot(it.x - h.x, it.y - h.y) > 1; }).length;
  assert.ok(allMoved > 0.8 * all.length, `override: path moves every family (${allMoved}/${all.length})`);
  console.log(`travelPath.selfcheck: ok (Q1 family defaults: flow ${moved.flow}/${total.flow}, path ${moved.path}/${total.path}, still 0/${total.still})`);
}

// ── the four families: pure, home at t = 0, inside the leash, actually travelling, arcs not lines ───────────────
{
  const L = 0.16 * 700;
  const rate = 0.25;
  for (const kind of PATH_KINDS) {
    let maxR = 0;
    let maxA = 0;
    let travelled = 0;
    let prev = null;
    for (let idx = 0; idx < 40; idx++) {
      const hx = 80 + (idx * 97) % 840;
      const hy = 60 + (idx * 61) % 580;
      const z = pathDisplacement(kind, hx, hy, 0, SEED, idx, L, rate, W, H, { x: 0, y: 0, a: 1 });
      assert.ok(Math.abs(z.x) < 1e-9 && Math.abs(z.y) < 1e-9, `${kind}: home at t = 0`);
      for (let t = 0; t <= 20; t += 0.05) {
        const a = pathDisplacement(kind, hx, hy, t, SEED, idx, L, rate, W, H, { x: 0, y: 0, a: 1 });
        const b = pathDisplacement(kind, hx, hy, t, SEED, idx, L, rate, W, H, { x: 0, y: 0, a: 1 });
        assert.ok(a.x === b.x && a.y === b.y, `${kind}: pure`);
        const along = Math.hypot(a.x, a.y);
        if (kind === 'sweep') {
          maxA = Math.max(maxA, along); // the sweep is capped only along its arc: |s| ≤ reach, sag rides on top
        } else {
          maxR = Math.max(maxR, along);
        }
        if (prev) travelled += Math.hypot(a.x - prev.x, a.y - prev.y);
        prev = { x: a.x, y: a.y };
      }
      prev = null;
    }
    if (kind !== 'sweep') assert.ok(maxR <= L * 1.0 + 1e-6, `${kind}: radial cap holds (${maxR.toFixed(1)} ≤ L ${L.toFixed(1)})`);
    else assert.ok(maxA <= L * 1.13, `${kind}: lane capped along its arc (${maxA.toFixed(1)} vs L ${L.toFixed(1)})`);
    assert.ok(travelled > 40 * L * 0.5, `${kind}: travels (${(travelled / 40).toFixed(0)} px per mark over 20 s)`);
  }
  // the orbit swirls the dish one way: each mark's NET angular travel about the centre (summed over its unfaded
  // samples — anticipation and follow-through reverse briefly, by design) has the stratum's one sign
  let pos = 0; let neg = 0;
  for (let idx = 0; idx < 60; idx++) {
    const hx = 80 + (idx * 97) % 840;
    const hy = 60 + (idx * 61) % 580;
    let net = 0;
    let prev = null;
    for (let t = 0; t <= 6; t += 0.05) {
      const a = pathDisplacement('orbit', hx, hy, t, SEED, idx, L, rate, W, H, { x: 0, y: 0, a: 1 });
      const ang = Math.atan2(hy + a.y - H / 2, hx + a.x - W / 2);
      if (prev !== null && a.a === 1) net += Math.atan2(Math.sin(ang - prev), Math.cos(ang - prev));
      prev = ang;
    }
    if (net > 1e-6) pos++; else if (net < -1e-6) neg++;
  }
  assert.ok((pos === 0) !== (neg === 0), `orbit: one swirl about the dish centre (${pos} / ${neg})`);
  console.log('travelPath.selfcheck: ok (four families: pure, home at 0, leashed, travelling, one-way orbit)');
}

// ── the timing law in the clock: held extremes, anticipation backward, overshoot, follow-through ───────────────
{
  assert.strictEqual(segmentShape(0), 0);
  assert.strictEqual(segmentShape(0.1), 0, 'held extreme');
  const antic = Math.min(...[0.18, 0.2, 0.22, 0.24].map(segmentShape));
  assert.ok(antic < -0.01, `anticipation leans back (${antic.toFixed(3)})`);
  const over = Math.max(...[0.8, 0.82, 0.84, 0.86].map(segmentShape));
  assert.ok(over > 1.01, `overshoot past the extreme (${over.toFixed(3)})`);
  assert.ok(Math.abs(segmentShape(0.9999) - 1) < 1e-3, 'follow-through settles on the extreme');
  for (let k = 0; k < 4; k++) assert.ok(Math.abs(pathProgress(k + 0.9999) - (k + 1)) < 1e-3, 'segments chain without a pop');
  // no linear glide: the travel's speed varies — the peak/mean speed ratio of a segment is well above a line's 1.0
  const sp = [];
  for (let f = 0.28; f < 0.83; f += 0.01) sp.push(Math.abs(segmentShape(f + 0.01) - segmentShape(f)));
  const mean = sp.reduce((a, b) => a + b, 0) / sp.length;
  assert.ok(Math.max(...sp) / mean > 1.4, 'eased, not linear');
  console.log('travelPath.selfcheck: ok (timing law: hold, anticipation, overshoot, follow-through, easing)');
}

// ── determinism + replay through the store: two runs / a snapshot continuation are bit-identical ───────────────
{
  for (const kind of PATH_KINDS) {
    const p = lp({ transport: 'path', transportPath: kind });
    const a = runFrames(p, 300);
    const b = runFrames(p, 300);
    assert.strictEqual(fp(a.items), fp(b.items), `${kind}: same steps → same picture`);
    const half = runFrames(p, 150);
    const snap = JSON.parse(JSON.stringify(snapshotTravelStore(half.store)));
    const store2 = createTravelStore();
    assert.ok(restoreTravelStore(store2, snap));
    const cont = runFrames(p, 150, { store: store2, start: 151 });
    assert.strictEqual(fp(cont.items), fp(a.items), `${kind}: a snapshot continues bit-identically`);
  }
  console.log('travelPath.selfcheck: ok (determinism + snapshot continuation, every family)');
}

// ── parity for still scenes; and a scene of only still families under 'auto' is today's build ──────────────────
{
  assert.strictEqual(fp(runFrames(lp({ transport: 'still', transportPath: 'sweep' }), 90).items), fp(build(lp())), 'still parity');
  const solids = [...HEAVY, ...GEO];
  const p = lp({ transport: 'auto' });
  const r = runFrames(p, 90, { cast: solids });
  assert.strictEqual(fp(r.items), fp(build(lp(), null, solids)), 'auto over still families = today, bit for bit');
  assert.strictEqual(r.store.layers.get('S').marks.size, 0, 'and no state was made');
  console.log('travelPath.selfcheck: ok (parity)');
}

// ── Q4: per-stratum leashes — each stratum's own transportLeash bounds its own marks ───────────────────────────
{
  const store = createTravelStore();
  const tight = lp({ transport: 'path', transportPath: 'orbit', transportLeash: 0.04 });
  const wide = lp({ transport: 'path', transportPath: 'orbit', transportLeash: 0.3 });
  const homeT = homeOf(tight);
  let a = null;
  let b = null;
  for (let f = 1; f <= 400; f++) {
    for (const [id, p] of [['ground', tight], ['front', wide]]) {
      const layer = travelLayer(store, id, SEED, W, H);
      advanceTravelClock(layer, f * (1000 / 60));
      const items = build(p, { layer, seed: SEED, W, H, noise, params: travelParams(p, W, H) });
      if (id === 'ground') a = items; else b = items;
    }
  }
  const dmax = (items) => Math.max(...items.map((it) => { const h = homeT.get(it.key); return Math.hypot(it.x - h.x, it.y - h.y); }));
  assert.ok(dmax(a) <= 0.04 * 700 + 1e-6, `ground stays tight (${dmax(a).toFixed(1)} px)`);
  assert.ok(dmax(b) > 0.15 * 700, `front roams wide (${dmax(b).toFixed(1)} px)`);
  console.log('travelPath.selfcheck: ok (Q4 per-stratum leashes)');
}

// ── stretch along velocity: fast travellers carry a capped deform across their velocity; at rest nothing ───────
{
  const p = lp({ transport: 'path', transportPath: 'sweep', transportFlow: 1 });
  const { items } = runFrames(p, 200);
  const stretched = items.filter((it) => it.deformAmt > 0);
  assert.ok(stretched.length > 10, `fast marks stretch (${stretched.length})`);
  for (const it of stretched) {
    assert.ok(it.deformAmt <= STRETCH_CAP + 1e-6, 'capped');
    assert.ok(Math.abs(Math.hypot(it.deformAxisX, it.deformAxisY) - 1) < 1e-4, 'a unit axis');
  }
  const still = build(lp());
  assert.ok(still.every((it) => !('deformAmt' in it)), 'a still build carries no deform key (contract hash parity)');
  // the pool: once travel stops, the stretch is stripped, not left on the reused items
  const cache = {};
  const store = createTravelStore();
  const pOn = lp({ transport: 'path', transportPath: 'sweep', transportFlow: 1 });
  for (let f = 1; f <= 60; f++) {
    const layer = travelLayer(store, 'S', SEED, W, H);
    advanceTravelClock(layer, f * (1000 / 60));
    buildPlacements({ layoutParams: pOn, seed: SEED, activeAssets: CAST, palette, caps, canvasW: W, canvasH: H, cache, travel: { layer, seed: SEED, W, H, noise, params: travelParams(pOn, W, H) } });
  }
  const after = buildPlacements({ layoutParams: lp(), seed: SEED, activeAssets: CAST, palette, caps, canvasW: W, canvasH: H, cache }).items;
  assert.ok(after.every((it) => !('deformAmt' in it)), 'pooled items are stripped when travel stops');
  console.log(`travelPath.selfcheck: ok (stretch along velocity: ${stretched.length} marks, cap ${STRETCH_CAP})`);
}

// ── the Jell-O metric: per stratum, travellers + mean distance from home over a window — reported only ─────────
{
  const p = lp({ transport: 'auto' });
  const { ctx } = runFrames(p, 300);
  const j = jelloReadout(ctx.layer, 700);
  assert.ok(j && j.frames === 120, 'a full window');
  assert.ok(j.travelling > 10, `travellers counted (${j.travelling.toFixed(1)})`);
  assert.ok(j.meanDistance > 5 && j.meanDistanceFrac < 0.2, `mean distance from home (${j.meanDistance.toFixed(1)} px)`);
  const s = runFrames(lp(), 30);
  assert.strictEqual(jelloReadout(s.ctx.layer, 700), null, 'a still stratum has no readout (nothing ran)');
  // steering nothing: the same run with the readout read and unread is the same picture
  const r1 = runFrames(p, 300);
  jelloReadout(r1.ctx.layer, 700);
  assert.strictEqual(fp(r1.items), fp(runFrames(p, 300).items), 'reported, steering nothing');
  console.log(`travelPath.selfcheck: ok (Jell-O metric: ${j.travelling.toFixed(1)}/${j.marks.toFixed(0)} travelling, mean ${j.meanDistance.toFixed(1)} px from home)`);
}

// ── switching transports mid-scene never pops: the largest single-frame jump stays a step's worth of travel ─────
{
  const store = createTravelStore();
  const seq = [['flow', 120], ['path', 120], ['still', 300]];
  let f = 0;
  let prev = null;
  let maxJump = 0;
  for (const [mode, frames] of seq) {
    const p = lp({ transport: mode, transportPath: 'lissajous' });
    for (let i = 0; i < frames; i++) {
      f++;
      const layer = travelLayer(store, 'S', SEED, W, H);
      advanceTravelClock(layer, f * (1000 / 60));
      const items = build(p, { layer, seed: SEED, W, H, noise, params: travelParams(p, W, H) });
      if (prev) for (let k = 0; k < items.length; k++) maxJump = Math.max(maxJump, Math.hypot(items[k].x - prev[k].x, items[k].y - prev[k].y));
      prev = items;
    }
  }
  assert.ok(maxJump < 0.02 * 700, `no pop across flow → path → still (max ${maxJump.toFixed(2)} px/frame)`);
  assert.strictEqual(store.layers.get('S').marks.size, 0, 'and the still tail settled every mark home');
  assert.strictEqual(fp(prev), fp(build(lp())), 'home exactly');
  void TRAVEL_STEP;
  console.log(`travelPath.selfcheck: ok (mode switches glide: max ${maxJump.toFixed(2)} px/frame)`);
}

console.log('travelPath.selfcheck: OK');
