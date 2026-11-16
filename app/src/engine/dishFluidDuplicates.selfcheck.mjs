// node src/engine/dishFluidDuplicates.selfcheck.mjs
// One force seam slice 1b (docs/design/one-force-seam.md) — the ferrofluid's density as copies of the stage's own marks.
// Matt's rulings 2026-11-16: copies of real marks (never a shape of the fluid's own), at most 64, densest field near
// magnets, smaller and fading in with the field, culture first (a copy over dead culture fades like any mark). Pinned:
//   law       closed gates (no plan / no magnet / PULL 0 / no marks) seat nothing; only cells above the floor, off
//             bedrock and near a magnet seat; at most DUP_CAP, strongest first; each copy wears its nearest mark, is
//             no bigger and no brighter than it, and is never a copy of a copy; the culture's fade drops a copy over
//             dead culture; pure (same inputs, same copies; inputs never written)
//   resolver  with a magnet, copies ride the top content layer — at most DUP_CAP, all wearing a dealt mark's asset, all
//             near the magnet; no magnet, or a take without the seam marker, seats none; the stream replays identically
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fluidDuplicateItems, isFluidDuplicate, DUP_CAP, DUP_KEY, DUP_NEAR } from './dishFluidDuplicates.mjs';
import { FLUID_GRID_COLS, FLUID_GRID_ROWS, fluidStamp, magnetFieldAt } from './dishFluid.mjs';
import { MATTER_DENSITY_FLOOR } from './dishFluidRender.mjs';
import { createLiveResolver } from '../gl/liveResolve.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const W = 960;
const H = 540;
const N = FLUID_GRID_COLS * FLUID_GRID_ROWS;
const grid = (v) => new Float32Array(N).fill(v);
const plan = (over = {}) => ({
  active: true,
  density: grid(0.9),
  magnets: [{ x: 0.5, y: 0.5 }],
  dial: { pull: 0.7 },
  aspectHW: H / W,
  blocked: null,
  ...over,
});
const marks = [
  { assetId: 'a', x: 100, y: 100, scale: 1.2, scaleY: 1.2, alpha: 80, key: 'm0' },
  { assetId: 'b', x: 480, y: 270, scale: 0.8, scaleY: 0.8, alpha: 100, key: 'm1' },
  { assetId: 'c', x: 900, y: 500, scale: 1, scaleY: 1, alpha: 60, key: 'm2' },
];

// ---------------------------------------------------------------- the law
ok('law: closed gates seat nothing', () => {
  assert.deepEqual(fluidDuplicateItems(null, marks, { W, H }), []);
  assert.deepEqual(fluidDuplicateItems(plan({ active: false }), marks, { W, H }), []);
  assert.deepEqual(fluidDuplicateItems(plan({ magnets: [] }), marks, { W, H }), [], 'no magnet');
  assert.deepEqual(fluidDuplicateItems(plan({ dial: { pull: 0 } }), marks, { W, H }), [], 'PULL 0');
  assert.deepEqual(fluidDuplicateItems(plan(), [], { W, H }), [], 'no marks: never a shape of its own');
  assert.deepEqual(fluidDuplicateItems(plan({ density: grid(MATTER_DENSITY_FLOOR) }), marks, { W, H }), [], 'floor');
  assert.deepEqual(fluidDuplicateItems(plan({ density: new Float32Array(5) }), marks, { W, H }), [], 'wrong size');
  assert.deepEqual(fluidDuplicateItems(plan(), marks, { W: 0, H }), [], 'no canvas');
});

ok('law: at most DUP_CAP, only near a magnet, off bedrock, strongest first', () => {
  const dups = fluidDuplicateItems(plan(), marks, { W, H });
  assert.ok(dups.length > 0 && dups.length <= DUP_CAP, `${dups.length} copies`);
  assert.equal(dups.length, DUP_CAP, 'a saturated field fills the cap');
  for (const d of dups) {
    assert.ok(isFluidDuplicate(d) && d.key === `${DUP_KEY}${d.index}`);
    const cx = d.index % FLUID_GRID_COLS;
    const cy = (d.index - cx) / FLUID_GRID_COLS;
    const mf = magnetFieldAt(plan().magnets, (cx + 0.5) / FLUID_GRID_COLS, (cy + 0.5) / FLUID_GRID_ROWS, H / W);
    assert.ok(mf >= DUP_NEAR, 'seated near a magnet');
  }
  const mfOf = (d) => {
    const cx = d.index % FLUID_GRID_COLS;
    const cy = (d.index - cx) / FLUID_GRID_COLS;
    return magnetFieldAt(plan().magnets, (cx + 0.5) / FLUID_GRID_COLS, (cy + 0.5) / FLUID_GRID_ROWS, H / W);
  };
  for (let k = 1; k < dups.length; k++) assert.ok(mfOf(dups[k]) <= mfOf(dups[k - 1]) + 1e-12, 'strongest first');
  const blockedAll = new Uint8Array(N).fill(1);
  assert.deepEqual(fluidDuplicateItems(plan({ blocked: blockedAll }), marks, { W, H }), [], 'never on bedrock');
  const far = plan({ magnets: [{ x: 0.02, y: 0.02 }], density: grid(0) });
  far.density[Math.floor(FLUID_GRID_ROWS / 2) * FLUID_GRID_COLS + Math.floor(FLUID_GRID_COLS / 2)] = 1;
  assert.deepEqual(fluidDuplicateItems(far, marks, { W, H }), [], 'dense field far from any magnet seats nothing');
});

ok('law: a copy wears its nearest mark, never bigger or brighter, never a copy of a copy', () => {
  const dups = fluidDuplicateItems(plan(), marks, { W, H });
  for (const d of dups) {
    const src = marks.find((m) => m.assetId === d.assetId);
    assert.ok(src, 'wears a dealt mark');
    assert.ok(d.scale <= src.scale + 1e-12 && d.scaleY <= src.scaleY + 1e-12, 'no bigger');
    assert.ok(d.alpha <= src.alpha + 1e-9, 'no brighter');
  }
  assert.ok(
    dups.every((d) => d.assetId === 'b'),
    'near the centre magnet the nearest mark is the centre one',
  );
  const again = fluidDuplicateItems(plan(), [...marks, ...dups], { W, H });
  assert.deepEqual(again, dups, 'copies already on stage are never worn');
});

ok('law: fades in with the field (no pop at the floor)', () => {
  const thin = fluidDuplicateItems(plan({ density: grid(MATTER_DENSITY_FLOOR + 0.01) }), marks, { W, H });
  const thick = fluidDuplicateItems(plan(), marks, { W, H });
  assert.ok(thin.length && thick.length);
  assert.ok(thin[0].alpha < thick[0].alpha / 10, 'barely above the floor: barely visible');
  assert.ok(thin[0].scale < thick[0].scale, 'and smaller');
});

ok('law: culture first — a copy over dead culture is dropped, over living culture kept', () => {
  const dead = { life: 1, sampler: { sample: (x, y, o) => ((o.level = 0), (o.activity = 0), true) } };
  const alive = { life: 1, sampler: { sample: (x, y, o) => ((o.level = 1), (o.activity = 0), true) } };
  assert.deepEqual(fluidDuplicateItems(plan(), marks, { W, H, culture: dead }), [], 'dead culture: gone');
  assert.deepEqual(
    fluidDuplicateItems(plan(), marks, { W, H, culture: alive }),
    fluidDuplicateItems(plan(), marks, { W, H }),
    'living culture: untouched',
  );
});

ok('law: pure — same inputs, same copies; nothing written', () => {
  const p = plan();
  const before = p.density.join(',');
  const m = JSON.parse(JSON.stringify(marks));
  const a = fluidDuplicateItems(p, m, { W, H });
  const b = fluidDuplicateItems(p, m, { W, H });
  assert.deepEqual(a, b);
  assert.equal(p.density.join(','), before);
  assert.deepEqual(m, marks);
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
  layoutParams: {
    ...DEFAULT_LAYOUT_PARAMS,
    count: 80,
    particleCount: 80,
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
const FRAMES = 90;
const MAG = { x: 0.5, y: 0.5 };
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
const hash = (o) => createHash('sha256').update(canon(o)).digest('hex').slice(0, 16);
const itemsOf = (out) => out.find((l) => Array.isArray(l.items))?.items ?? [];
const fluidOver = (t, magnets, marker = true) => ({
  dishFluid: fluidStamp(t, { shed: 0 }),
  dishFluidMagnets: magnets,
  dishFluidDial: { flow: 0.5, pull: 0.7, couple: 0 },
  ...(marker ? { dishFluidMarks: 1 } : {}),
});
const run = (over) => {
  const r = createLiveResolver();
  const outs = [];
  for (let f = 0; f < FRAMES; f++) {
    const t = f * DT;
    outs.push(r.resolveLayers(baseInput({ loopTimeMs: t, dtSec: DT / 1000, ...(over ? over(t) : {}) })));
  }
  r.dispose?.();
  return outs;
};

const withMag = run((t) => fluidOver(t, [MAG]));

ok('resolver: with a magnet, copies of dealt marks gather near it, at most DUP_CAP', () => {
  let seen = 0;
  for (let f = 0; f < FRAMES; f++) {
    const items = itemsOf(withMag[f]);
    const dealt = new Set(items.filter((it) => !isFluidDuplicate(it)).map((it) => it.assetId));
    const dups = items.filter(isFluidDuplicate);
    assert.ok(dups.length <= DUP_CAP, `frame ${f}: ${dups.length} ≤ ${DUP_CAP}`);
    for (const d of dups) {
      assert.ok(dealt.has(d.assetId), 'a copy wears a dealt mark');
      const dist = Math.hypot(d.x / 1280 - MAG.x, (d.y / 720 - MAG.y) * (720 / 1280));
      assert.ok(dist < 0.25, `a copy sits near the magnet (${dist.toFixed(3)})`);
    }
    seen += dups.length;
  }
  assert.ok(seen > 0, `copies appeared (${seen} copy-frames)`);
});

ok('resolver: no magnet, or a take without the seam marker, seats no copy', () => {
  for (const outs of [run((t) => fluidOver(t, [])), run((t) => fluidOver(t, [MAG], false))])
    for (let f = 0; f < FRAMES; f++) assert.equal(itemsOf(outs[f]).filter(isFluidDuplicate).length, 0);
});

ok('resolver: the same stream replays bit-identically', () => {
  const again = run((t) => fluidOver(t, [MAG]));
  for (let f = 0; f < FRAMES; f++) assert.equal(hash(again[f]), hash(withMag[f]), `frame ${f}`);
});

console.log(`dishFluidDuplicates: ${n} checks ok`);
