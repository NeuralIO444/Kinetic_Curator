// node src/engine/dishFluidDrift.selfcheck.mjs
// One force seam slice 1 (docs/design/one-force-seam.md) — the ferrofluid leans the stage's own marks toward the magnets.
// Matt's rulings 2026-11-16: fields are never drawn, only the stage's assets move; lean then return (never travel); marks
// only in this slice; culture first, fluid second. Pinned:
//   law       no magnets / PULL 0 / off the dish / at or under the floor → no lean; the lean points at the nearest magnet,
//             is at most DRIFT_MAX_PX, grows with density and PULL, never overshoots the magnet; junk reads as no lean
//   applier   pinned marks stand; the undo restores the exact x/y; nothing moved → null and the SoA is untouched; the field
//             is never written
//   resolver  no fluid, or a fluid with no magnet, is byte-identical to the plain resolver; with a magnet the same marks
//             (same count, same assets) lean toward it by at most DRIFT_MAX_PX and nothing else changes (alpha and scale
//             stay the culture's to decide); the same stream replays bit-identically
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { markDriftDelta, applyFluidDrift, DRIFT_MAX_PX, DRIFT_DENSITY_FLOOR } from './dishFluidDrift.mjs';
import { FLUID_GRID_COLS, FLUID_GRID_ROWS, fluidStamp } from './dishFluid.mjs';
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
const grid = (v) => new Float32Array(FLUID_GRID_COLS * FLUID_GRID_ROWS).fill(v);
const field = (over = {}) => ({
  density: grid(1),
  magnets: [{ x: 0.5, y: 0.5 }],
  pull: 1,
  aspectHW: H / W,
  W,
  H,
  ...over,
});

// ---------------------------------------------------------------- the law
ok('law: closed gates give no lean', () => {
  assert.equal(markDriftDelta(field({ magnets: [] }), 100, 100), null, 'no magnet');
  assert.equal(markDriftDelta(field({ pull: 0 }), 100, 100), null, 'PULL 0');
  assert.equal(markDriftDelta(field({ density: grid(DRIFT_DENSITY_FLOOR) }), 100, 100), null, 'at the floor');
  assert.equal(markDriftDelta(field({ density: grid(0) }), 100, 100), null, 'empty field');
  assert.equal(markDriftDelta(field(), -5, 100), null, 'off the dish');
  assert.equal(markDriftDelta(field(), 100, H + 1), null, 'off the dish (below)');
  assert.equal(markDriftDelta(field({ density: new Float32Array(10) }), 100, 100), null, 'wrong-sized field');
  for (const junk of [null, undefined, {}, { density: null }]) assert.equal(markDriftDelta(junk, 100, 100), null);
  assert.equal(markDriftDelta(field({ pull: NaN }), 100, 100), null, 'junk PULL');
});

ok('law: the lean points at the nearest magnet, capped at DRIFT_MAX_PX, never overshooting', () => {
  const l = markDriftDelta(field(), 100, H / 2);
  assert.ok(l && l.dx > 0 && Math.abs(l.dy) < 1e-9, 'a mark left of the magnet leans right');
  assert.ok(Math.abs(Math.hypot(l.dx, l.dy) - DRIFT_MAX_PX) < 1e-9, 'saturated field, full PULL: the full lean');
  const two = field({
    magnets: [
      { x: 0.1, y: 0.5 },
      { x: 0.9, y: 0.5 },
    ],
  });
  assert.ok(markDriftDelta(two, 0.8 * W, H / 2).dx > 0, 'the nearer magnet wins');
  assert.ok(markDriftDelta(two, 0.2 * W, H / 2).dx < 0, 'the nearer magnet wins (other side)');
  const near = markDriftDelta(field(), W / 2 - 5, H / 2);
  assert.ok(Math.abs(near.dx - 5) < 1e-9, 'never overshoots the magnet');
  assert.equal(markDriftDelta(field(), W / 2, H / 2), null, 'a mark on the magnet stays');
});

ok('law: the lean grows with density and PULL, from 0 at the floor', () => {
  let prev = -1;
  for (let d = DRIFT_DENSITY_FLOOR + 0.05; d <= 1.0001; d += 0.05) {
    const l = markDriftDelta(field({ density: grid(d) }), 100, H / 2);
    assert.ok(l.dx > prev, `monotone in density (${d.toFixed(2)})`);
    prev = l.dx;
  }
  const tiny = markDriftDelta(field({ density: grid(DRIFT_DENSITY_FLOOR + 1e-4) }), 100, H / 2);
  assert.ok(tiny.dx < 0.01, 'just over the floor: barely a lean (no snap on)');
  assert.ok(
    markDriftDelta(field({ pull: 0.5 }), 100, H / 2).dx < markDriftDelta(field(), 100, H / 2).dx,
    'PULL scales it',
  );
  assert.ok(Math.abs(markDriftDelta(field({ pull: 9 }), 100, H / 2).dx - DRIFT_MAX_PX) < 1e-9, 'PULL clamps at 1');
});

// ---------------------------------------------------------------- the applier
const fakeSoa = () => ({
  n: 4,
  x: Float32Array.from([100, 200, 0.5 * W, 900]),
  y: Float32Array.from([H / 2, 100, H / 2, 500]),
});

ok('applier: pinned marks stand; the undo restores the exact cache', () => {
  const s = fakeSoa();
  const x0 = [...s.x];
  const y0 = [...s.y];
  const undo = applyFluidDrift(s, field(), Uint8Array.from([0, 1, 0, 0]));
  assert.equal(typeof undo, 'function');
  assert.notEqual(s.x[0], x0[0], 'a free mark leans');
  assert.equal(s.x[1], x0[1], 'a pinned mark stands');
  assert.equal(s.y[1], y0[1]);
  assert.equal(s.x[2], x0[2], 'a mark on the magnet stays');
  undo();
  assert.deepEqual([...s.x], x0, 'undo restores x exactly');
  assert.deepEqual([...s.y], y0, 'undo restores y exactly');
});

ok('applier: nothing to move → null, SoA untouched; the field is never written', () => {
  const s = fakeSoa();
  const x0 = [...s.x];
  assert.equal(applyFluidDrift(s, field({ magnets: [] })), null);
  assert.equal(applyFluidDrift(s, null), null);
  assert.deepEqual([...s.x], x0);
  const f = field({ density: grid(0.8) });
  const before = f.density.join(',');
  applyFluidDrift(fakeSoa(), f);
  assert.equal(f.density.join(','), before);
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
const fluidOver = (t, magnets, pull = 0.7) => ({
  dishFluid: fluidStamp(t, { shed: 0 }),
  dishFluidMagnets: magnets,
  dishFluidDial: { flow: 0.5, pull, couple: 0 },
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

const plain = run(null);

ok('resolver: a fluid with no magnet leans nothing — the marks are the plain marks', () => {
  const noMag = run((t) => fluidOver(t, []));
  for (let f = 0; f < FRAMES; f++) assert.equal(hash(itemsOf(noMag[f])), hash(itemsOf(plain[f])), `frame ${f}`);
});

const leaned = run((t) => fluidOver(t, [MAG]));

ok('resolver: with a magnet the same marks lean toward it, by at most DRIFT_MAX_PX, and nothing else changes', () => {
  let moved = 0;
  const mx = MAG.x * 1280;
  const my = MAG.y * 720;
  for (let f = 0; f < FRAMES; f++) {
    const p = itemsOf(plain[f]);
    const l = itemsOf(leaned[f]);
    assert.equal(l.length, p.length, `frame ${f}: no item added or removed`);
    for (let k = 0; k < p.length; k++) {
      assert.equal(l[k].assetId, p[k].assetId, 'same asset');
      assert.equal(l[k].alpha, p[k].alpha, 'alpha untouched by the fluid');
      assert.equal(l[k].scale, p[k].scale, 'scale untouched by the fluid');
      const d = Math.hypot(l[k].x - p[k].x, l[k].y - p[k].y);
      if (d === 0) continue;
      moved++;
      assert.ok(d <= DRIFT_MAX_PX + 1e-3, `lean ${d.toFixed(2)} ≤ ${DRIFT_MAX_PX}`);
      const before = Math.hypot(p[k].x - mx, p[k].y - my);
      const after = Math.hypot(l[k].x - mx, l[k].y - my);
      assert.ok(after < before, 'a leaned mark is nearer the magnet');
    }
  }
  assert.ok(moved > 0, `some marks leaned (${moved} mark-frames)`);
});

ok('resolver: no fluid at all is untouched, and the same stream replays bit-identically', () => {
  const again = run((t) => fluidOver(t, [MAG]));
  for (let f = 0; f < FRAMES; f++) assert.equal(hash(again[f]), hash(leaned[f]), `frame ${f}`);
  const plain2 = run(null);
  for (let f = 0; f < FRAMES; f++) assert.equal(hash(plain2[f]), hash(plain[f]), `frame ${f}`);
});

console.log(`dishFluidDrift: ${n} checks ok`);
