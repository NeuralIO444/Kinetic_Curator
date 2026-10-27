// node src/gl/dishContacts.selfcheck.mjs
// #1407 (petri dish A1) — the live frame: two swarm strata in one resolver
// share one contact grid. A body in one stratum displaces a body in the
// other through the real resolve path; with contacts off — or a stratum
// alone — the frame is byte-identical to the engine before the dish.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createLiveResolver } from './liveResolve.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';

const L = (id, extra = {}) => ({ id, name: id, visible: true, layerBlendMode: 'normal', layerOpacity: 1, ...extra });
const swarmLp = (over = {}) => ({
  ...DEFAULT_LAYOUT_PARAMS,
  mode: 'swarm',
  particleCount: 90,
  contactRadius: 26,
  contactMode: 'bounce',
  contactRestitution: 0.6,
  kinemeBreath: 0,
  kinemeDrift: 0,
  kinemePaletteBreath: 0,
  lifeDrift: 0,
  ...over,
});
const snap = (seed, lp) => ({
  seed,
  seedOffsets: null,
  paletteId: 'bone',
  paletteOverrides: null,
  layoutParams: lp,
  caGrid: null,
  enabledAssets: null,
  lockedParams: {},
});

const FRAMES = 25;
const input = (over = {}) => ({
  canvasW: 1000,
  canvasH: 700,
  layers: [L('lyr-b'), L('lyr-a')],
  activeLayerId: 'lyr-a',
  layerSnapshots: { 'lyr-b': snap(777, swarmLp()) },
  seed: 1234,
  seedOffsets: null,
  paletteId: 'bone',
  paletteOverrides: null,
  userPalettes: [],
  layoutParams: swarmLp(),
  caGrid: null,
  enabledAssets: null,
  assetWeightOverrides: {},
  customAssets: [],
  quality: 'balanced',
  lockedParams: {},
  batchPaused: false,
  focusSwap: false,
  loopTimeMs: 16,
  dtSec: 1 / 60,
  perfClampOverride: null,
  perfTier1: false,
  assetThin: false,
  slowRender: false,
  scaleMul: 1,
  alphaBoost: 0,
  phraseWrapGen: 0,
  attractor: null,
  ...over,
});
const runFrames = (inp) => {
  const r = createLiveResolver();
  const hashes = [];
  let out = null;
  for (let f = 0; f < FRAMES; f++) {
    out = r.resolveLayers({ ...inp, loopTimeMs: 16 + f * (1000 / 60) });
    hashes.push(hash(out));
  }
  return { hashes, out };
};
const hash = (out) =>
  createHash('sha256')
    .update(JSON.stringify(out.map((l) => (l.items || []).map((i) => [i.x, i.y, i.assetId]))))
    .digest('hex');
const itemsOf = (out, id) => out.find((l) => l.id === id).items;
const movedCount = (xs, ys) => xs.filter((it, k) => !Object.is(it.x, ys[k].x) || !Object.is(it.y, ys[k].y)).length;

// 1. deterministic: two fresh resolvers, same scene, same frames.
{
  const a = runFrames(input());
  const b = runFrames(input());
  assert.deepEqual(a.hashes, b.hashes, 'the dish frame is a pure function of the scene + frame count');
}

// 2. the dish acts through the resolver: co-resident strata displace each
// other. Layer A in the combined scene vs layer A alone (same seed, same
// params, same shared world noise) — every difference is the dish.
{
  const combined = runFrames(input()).out;
  const solo = runFrames(
    input({
      layers: [L('lyr-a')],
      layerSnapshots: {},
    }),
  ).out;
  const moved = movedCount(itemsOf(combined, 'lyr-a'), itemsOf(solo, 'lyr-a'));
  assert.ok(moved >= 4, `stratum B's bodies pushed stratum A's (moved ${moved})`);
  // Same isolation, other expression: hide B and A's dish displacement goes.
  const hidden = runFrames(
    input({
      layers: [L('lyr-b', { visible: false }), L('lyr-a')],
    }),
  ).out;
  assert.deepEqual(
    itemsOf(hidden, 'lyr-a').map((i) => [i.x, i.y]),
    itemsOf(solo, 'lyr-a').map((i) => [i.x, i.y]),
    'a hidden stratum is not in the dish: A resolves exactly as if alone',
  );
}

// 3. dish-off is untouched: contacts at 0 equal a scene that never heard of
// contact params, frame for frame.
{
  const off = runFrames(
    input({
      layoutParams: swarmLp({ contactRadius: 0 }),
      layerSnapshots: { 'lyr-b': snap(777, swarmLp({ contactRadius: 0 })) },
    }),
  );
  const noKeys = (lp) => {
    const c = { ...lp };
    delete c.contactRadius;
    delete c.contactMode;
    delete c.contactRestitution;
    return c;
  };
  const never = runFrames(
    input({
      layoutParams: noKeys(swarmLp()),
      layerSnapshots: { 'lyr-b': snap(777, noKeys(swarmLp())) },
    }),
  );
  assert.deepEqual(off.hashes, never.hashes, 'radius 0 is bit-identical to no dish at all');
}

// 5. #1409 (petri dish A3) — the per-Look DISH switch through the real
// resolver. OFF restores the ghost stack: each stratum resolves exactly
// as if the other were not there. The default is ON: a document with no
// dish key anywhere (the pre-A3 shape) resolves frame-for-frame like
// dish:true, and differently from OFF.
{
  const offLp = () => swarmLp({ dish: false });
  const combinedOff = runFrames(
    input({
      layoutParams: offLp(),
      layerSnapshots: { 'lyr-b': snap(777, offLp()) },
    }),
  ).out;
  const soloAOff = runFrames(
    input({
      layers: [L('lyr-a')],
      layerSnapshots: {},
      layoutParams: offLp(),
    }),
  ).out;
  assert.deepEqual(
    itemsOf(combinedOff, 'lyr-a').map((i) => [i.x, i.y]),
    itemsOf(soloAOff, 'lyr-a').map((i) => [i.x, i.y]),
    'dish OFF: stratum A resolves exactly as if alone (ghost stack)',
  );
  const bAloneOff = runFrames(
    input({
      layers: [L('lyr-b'), L('lyr-a', { visible: false })],
      layoutParams: offLp(),
      layerSnapshots: { 'lyr-b': snap(777, offLp()) },
    }),
  ).out;
  assert.deepEqual(
    itemsOf(combinedOff, 'lyr-b').map((i) => [i.x, i.y]),
    itemsOf(bAloneOff, 'lyr-b').map((i) => [i.x, i.y]),
    'dish OFF: stratum B resolves exactly as if alone (ghost stack)',
  );
  const stripDish = (lp) => {
    const c = { ...lp };
    delete c.dish;
    return c;
  };
  const preA3 = runFrames(
    input({
      layoutParams: stripDish(swarmLp()),
      layerSnapshots: { 'lyr-b': snap(777, stripDish(swarmLp())) },
    }),
  );
  const explicitOn = runFrames(
    input({
      layoutParams: swarmLp({ dish: true }),
      layerSnapshots: { 'lyr-b': snap(777, swarmLp({ dish: true })) },
    }),
  );
  assert.deepEqual(preA3.hashes, explicitOn.hashes, 'a pre-A3 document (no dish key) == dish ON, frame for frame');
  const offHashes = runFrames(
    input({
      layoutParams: offLp(),
      layerSnapshots: { 'lyr-b': snap(777, offLp()) },
    }),
  ).hashes;
  assert.notDeepEqual(preA3.hashes, offHashes, 'ON and OFF are different frames (the switch is real)');
}

// 4. the one-writer files took call sites only.
{
  const lr = readFileSync(new URL('./liveResolve.mjs', import.meta.url), 'utf8');
  assert.equal((lr.match(/createDishSession\(/g) || []).length, 1, 'one dish session per resolver');
  assert.equal((lr.match(/armDish\(/g) || []).length, 1, 'armed once per resolve');
  assert.equal((lr.match(/enrolDishBody\(/g) || []).length, 1, 'enrolled at one call site');
  const pj = readFileSync(new URL('../engine/particles.js', import.meta.url), 'utf8');
  assert.equal((pj.match(/runDishContacts\(/g) || []).length, 1, 'particles.js takes one call site');
}

console.log(
  'dishContacts.selfcheck: ok (#1407 — live strata share one contact grid; #1409 — the per-Look switch gates enrolment)',
);
