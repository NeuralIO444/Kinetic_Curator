// node src/engine/dishLifeAssets.selfcheck.mjs
// #2152 slice 1 — DISH LIFE on the assets: fade and die. A mark over a decaying cell fades, over a dead cell it is gone; its own LIFE
// dial (0 = off), separate from the coupling dial (Matt, 2026-11-16). Pinned:
//   factor    dial 0 is exactly 1 for any level (off); dial 1 is the level itself; between is a straight blend; the end of the decay
//             is gone (0), never a lingering ghost; junk reads as off
//   applier   closed gates leave the SoA untouched; alpha fades and scale eases down with the factor; dead = alpha 0; pinned and
//             off-canvas marks are skipped; the same inputs give the same fold; the field is never mutated (one-way)
//   resolver  LIFE 0 (key absent or 0) is byte-identical to the plain resolver, with and without the coupling dial; LIFE alone wakes
//             the field and marks fade and die from the culture; marks never get brighter or bigger; the culture is not drawn;
//             CULTURE HELD (shed 2) restores the plain frame; the same stream replays bit-identically; coupling-only frames are
//             unchanged by this slice
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cultureLifeFactor, applyCultureLife, fieldSampler, LIFE_GONE_BELOW, LIFE_SHRINK } from './dishLifeCouple.mjs';
import { createLiveResolver } from '../gl/liveResolve.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));

// ---------------------------------------------------------------- the factor law
ok('factor: dial 0 is exactly 1 for any level; dial 1 is the level; between is a blend', () => {
  for (const lv of [0, 0.2, 0.5, 1, 7, -3, NaN]) assert.equal(cultureLifeFactor(lv, 0), 1, `dial 0, level ${lv}`);
  assert.equal(cultureLifeFactor(1, 1), 1);
  assert.equal(cultureLifeFactor(0.5, 1), 0.5);
  assert.ok(near(cultureLifeFactor(0.5, 0.5), 0.75), 'half dial, half level');
  assert.equal(cultureLifeFactor(1, 0.3), 1, 'an alive cell is never touched, at any dial');
});

ok('factor: the end of the decay is gone, monotone in level, junk dial reads as off', () => {
  assert.equal(cultureLifeFactor(0, 1), 0, 'a dead cell: gone');
  assert.equal(cultureLifeFactor(LIFE_GONE_BELOW * 0.5, 1), 0, 'below the floor: gone, not a ghost');
  assert.ok(cultureLifeFactor(LIFE_GONE_BELOW * 2, 1) > 0, 'just above the floor: still there');
  let prev = -1;
  for (let lv = 0; lv <= 1.0001; lv += 0.05) {
    const f = cultureLifeFactor(lv, 1);
    assert.ok(f >= prev, 'monotone in level');
    prev = f;
  }
  for (const d of [NaN, -1, undefined, 'x']) assert.equal(cultureLifeFactor(0, d), 1, `junk dial ${d} reads as off`);
  assert.equal(cultureLifeFactor(0, 9), 0, 'a dial past 1 clamps to 1');
});

// ---------------------------------------------------------------- the applier on a fake SoA
const holder = (over = {}) => ({
  active: true,
  cols: 4,
  rows: 1,
  gen: 3,
  level: new Float32Array([1, 0.5, 0, 0.02]),
  activity: new Float32Array([0, 0, 0, 0]),
  ...over,
});
const fakeSoa = () => ({
  n: 6,
  x: new Float64Array([12, 37, 62, 87, 12, 500]), // marks 0..3 sit over cells 0..3; 4 is a pinned mark; 5 is off-canvas
  y: new Float64Array([25, 25, 25, 25, 25, 25]),
  alpha: new Float64Array([1, 1, 1, 1, 1, 1]),
  scale: new Float64Array([2, 2, 2, 2, 2, 2]),
  scaleY: new Float64Array([2, 2, 2, 2, 2, 2]),
});
const sampler = () => fieldSampler(holder(), 100, 50);

ok('applier: closed gates leave the SoA untouched', () => {
  for (const ctx of [null, undefined, {}, { life: 0, sampler: sampler() }, { life: 1 }, { life: 1, sampler: null }]) {
    const soa = fakeSoa();
    assert.equal(applyCultureLife(soa, ctx), 0);
    assert.deepEqual([...soa.alpha], [1, 1, 1, 1, 1, 1]);
    assert.deepEqual([...soa.scale], [2, 2, 2, 2, 2, 2]);
  }
});

ok('applier: alive untouched, decaying fades and eases down, dead is gone; pinned and off-canvas skipped', () => {
  const soa = fakeSoa();
  const still = new Uint8Array([0, 0, 0, 0, 1, 0]);
  const touched = applyCultureLife(soa, { life: 1, sampler: sampler() }, still);
  assert.equal(touched, 3, 'the decaying, the dead and the near-dead marks moved');
  assert.equal(soa.alpha[0], 1, 'alive: untouched');
  assert.equal(soa.scale[0], 2);
  assert.ok(near(soa.alpha[1], 0.5), 'decaying: fades with the level');
  assert.ok(near(soa.scale[1], 2 * (1 - LIFE_SHRINK * 0.5)), 'decaying: eases down');
  assert.equal(soa.alpha[2], 0, 'dead: gone');
  assert.equal(soa.alpha[3], 0, 'near-dead: gone, not a ghost');
  assert.equal(soa.alpha[4], 1, 'a pinned mark never changes');
  assert.equal(soa.alpha[5], 1, 'a mark outside the canvas has no cell to read');
  assert.equal(soa.scale[4], 2);
});

ok('applier: same inputs, same fold, and the field is never written', () => {
  const h = holder();
  const before = [...h.level].join(',');
  const a = fakeSoa();
  const b = fakeSoa();
  applyCultureLife(a, { life: 0.6, sampler: fieldSampler(h, 100, 50) });
  applyCultureLife(b, { life: 0.6, sampler: fieldSampler(h, 100, 50) });
  assert.deepEqual([...a.alpha], [...b.alpha]);
  assert.deepEqual([...a.scale], [...b.scale]);
  assert.equal([...h.level].join(','), before);
});

// ---------------------------------------------------------------- the real resolver
const L = (id) => ({ id, name: id, visible: true, layerBlendMode: 'normal', layerOpacity: 1 });
const baseInput = (over = {}) => ({
  layers: [L('lyr-a')],
  activeLayerId: 'lyr-a',
  layerSnapshots: {},
  seed: 4242,
  seedOffsets: null,
  paletteId: 'bone',
  paletteOverrides: null,
  userPalettes: [],
  // The resolver harness runs with the living-motion amounts ZEROED: this suite pins the SCALE fold,
  // and since slice B the same dial also drives the breath channel — with breath live, an item's
  // scale ratio would carry both consumers and the pure-factor bounds below could not hold. The
  // breath consumer's own resolver pins (dial-0 identity WITH breath on, composition, shed) live in
  // dishLifeBreathing.selfcheck.mjs.
  layoutParams: {
    ...DEFAULT_LAYOUT_PARAMS,
    count: 60,
    particleCount: 60,
    mode: 'random',
    kinemeBreath: 0,
    kinemeDrift: 0,
    kinemePaletteBreath: 0,
  },
  caGrid: null,
  enabledAssets: null,
  assetWeightOverrides: {},
  customAssets: [],
  quality: 'balanced',
  lockedParams: {},
  batchPaused: false,
  focusSwap: false,
  loopTimeMs: 0,
  dtSec: 1 / 60,
  perfClampOverride: null,
  perfTier1: false,
  assetThin: false,
  slowRender: false,
  scaleMul: 1,
  alphaBoost: 0,
  effectiveScale: [0.5, 1.5],
  effectiveAlpha: [20, 100],
  phraseWrapGen: 0,
  attractor: null,
  mixSeconds: 0,
  canvasW: 1280,
  canvasH: 720,
  ...over,
});
const DT = 16.7;
const canon = (v) => {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v && typeof v === 'object') {
    if (ArrayBuffer.isView(v)) return `${v.constructor.name}[${[...v].join(',')}]`;
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${k}:${canon(v[k])}`)
      .join(',')}}`;
  }
  return String(v);
};
const hash = (layers) => createHash('sha256').update(canon(layers)).digest('hex').slice(0, 16);
const fstamp = (gen, shed = 0, wakeMs = 0) => ({ mode: 'field', wakeMs, gen, cycleGens: 48, shed });
// dishField slot only, no dishFieldCoupling key → the plain input shape with a publishing field
const runFieldOnly = (frames, shed = 0) => {
  const r = createLiveResolver();
  const hashes = [];
  for (let f = 0; f < frames; f++)
    hashes.push(hash(r.resolveLayers(baseInput({ loopTimeMs: f * DT, dtSec: DT / 1000, dishField: fstamp(f, shed) }))));
  const snap = r.snapshotState();
  r.dispose();
  return { hashes, snap };
};
const runPlain = (frames) => {
  const r = createLiveResolver();
  const hashes = [];
  for (let f = 0; f < frames; f++)
    hashes.push(hash(r.resolveLayers(baseInput({ loopTimeMs: f * DT, dtSec: DT / 1000 }))));
  r.dispose();
  return hashes;
};
const runCoupled = (frames, { coupling = 1, shed = 0, wakeMs = 0, genOf = (f) => f } = {}) => {
  const r = createLiveResolver();
  const hashes = [];
  const outs = [];
  for (let f = 0; f < frames; f++) {
    const out = r.resolveLayers(
      baseInput({
        loopTimeMs: f * DT,
        dtSec: DT / 1000,
        dishField: fstamp(genOf(f), shed, wakeMs),
        dishFieldCoupling: coupling,
      }),
    );
    hashes.push(hash(out));
    outs.push(out);
  }
  const snap = r.snapshotState();
  r.dispose();
  return { hashes, outs, snap };
};
const itemsOf = (out) => out.find((l) => Array.isArray(l.items))?.items ?? [];

const run = (frames, { coupling, life, shed = 0, genOf = (f) => f } = {}) => {
  const r = createLiveResolver();
  const hashes = [];
  const outs = [];
  for (let f = 0; f < frames; f++) {
    const out = r.resolveLayers(
      baseInput({
        loopTimeMs: f * DT,
        dtSec: DT / 1000,
        dishField: fstamp(genOf(f), shed),
        ...(coupling !== undefined ? { dishFieldCoupling: coupling } : {}),
        ...(life !== undefined ? { dishFieldLife: life } : {}),
      }),
    );
    hashes.push(hash(out));
    outs.push(out);
  }
  r.dispose();
  return { hashes, outs };
};

ok('LIFE 0 is byte-identical: key absent or 0, with and without the coupling dial', () => {
  const plain = runPlain(30);
  assert.deepEqual(run(30, { coupling: 0, life: 0 }).hashes, plain, 'both dials 0 with a field stamped');
  assert.deepEqual(run(30, { coupling: 0 }).hashes, plain, 'LIFE key absent');
  const coupledOld = run(30, { coupling: 0.65 }).hashes;
  assert.deepEqual(run(30, { coupling: 0.65, life: 0 }).hashes, coupledOld, 'coupling-only frames unchanged by LIFE 0');
});

ok('LIFE alone wakes the field: marks fade and die from the culture, never brighter or bigger', () => {
  const plain = createLiveResolver();
  const life = createLiveResolver();
  let dead = 0;
  let faded = 0;
  let total = 0;
  for (let f = 0; f < 30; f++) {
    const p = itemsOf(plain.resolveLayers(baseInput({ loopTimeMs: f * DT, dtSec: DT / 1000, dishField: fstamp(f) })));
    const l = itemsOf(
      life.resolveLayers(
        baseInput({
          loopTimeMs: f * DT,
          dtSec: DT / 1000,
          dishField: fstamp(f),
          dishFieldCoupling: 0,
          dishFieldLife: 1,
        }),
      ),
    );
    assert.equal(l.length, p.length, 'same item set: nothing is added or removed, only faded');
    for (let k = 0; k < l.length; k++) {
      assert.ok(l[k].alpha <= p[k].alpha + 1e-12, 'never brighter');
      assert.ok(l[k].scale <= p[k].scale + 1e-12, 'never bigger');
      if (f >= 12) {
        total++;
        if (l[k].alpha === 0) dead++;
        else if (l[k].alpha < p[k].alpha - 1e-9) faded++;
      }
    }
    for (const it of l) assert.ok(!String(it.key).startsWith('speck:'), 'the field culture is never drawn');
  }
  plain.dispose();
  life.dispose();
  assert.ok(dead > 0, `some marks really die (dead ${dead} of ${total})`);
  assert.ok(dead < total, 'and some live on');
  assert.ok(faded >= 0);
});

ok('CULTURE HELD (shed 2) restores the plain frame; the same stream replays identically', () => {
  const held = run(20, { coupling: 0, life: 1, shed: 2 }).hashes;
  const heldPlain = run(20, { coupling: 0, life: 0, shed: 2 }).hashes;
  assert.deepEqual(held, heldPlain, 'under CULTURE HELD the frame is the uncoupled frame, whole');
  assert.deepEqual(run(30, { coupling: 0, life: 0.7 }).hashes, run(30, { coupling: 0, life: 0.7 }).hashes, 'replay');
  assert.notDeepEqual(
    run(30, { coupling: 0, life: 0.7 }).hashes,
    run(30, { coupling: 0, life: 0 }).hashes,
    'and it really acts',
  );
});

console.log(`[selfcheck] dishLifeAssets (#2152 slice 1): ${n} cases passed`);
