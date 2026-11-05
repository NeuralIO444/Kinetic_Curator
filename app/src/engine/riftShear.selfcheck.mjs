// node src/engine/riftShear.selfcheck.mjs
// #1183 rift slice 1 — the TEAR above a layer shears the marks below it. Off at 0 / no tear / key absent
// (byte-identical, the frame hash unchanged), the shear equals what the tear shader does to the picture,
// per frame and never accumulating, still marks stay put, and the nearest visible tear above is the one.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { riftShearAt, applyRiftShear } from './riftShear.mjs';
import { nearestRiftAbove, riftArgs, RIFT_KEY } from '../gl/dishRift.mjs';
import { refVnoise } from '../gl/effects/chunkReference.mjs';
import { createLiveResolver } from '../gl/liveResolve.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';

const W = 1000;
const H = 700;
const TEAR = { bands: 18, amount: 12 };

// 1. the shear mirrors FX_TEAR_FS: dx_uv = (vnoise(u*8+95.9, v*bands+49.7) - 0.5) * amount * 4 / 1000, the picture
//    is sampled at uv + dx (content moves by -dx), v is y-up. Recomputed here independently of the module.
{
  for (let i = 0; i < 300; i++) {
    const x = (i * 37.3) % W;
    const y = (i * 53.1) % H;
    const n = refVnoise((x / W) * 8 + 95.9, (1 - y / H) * TEAR.bands + 49.7);
    const want = -(((n - 0.5) * TEAR.amount * 4) / 1000) * W;
    assert.ok(Math.abs(riftShearAt(x, y, TEAR, W, H) - want) < 1e-9, `shear at ${x},${y} is the shader's`);
  }
  assert.equal(riftShearAt(10, 10, null, W, H), 0);
  assert.equal(riftShearAt(10, 10, { bands: 18, amount: 0 }, W, H), 0, 'amount 0: no shear');
  assert.equal(riftShearAt(NaN, 10, TEAR, W, H), 0);
  // bounded by amount*4/1000*W/2 (noise is 0..1, centred on 0.5)
  const cap = ((TEAR.amount * 4) / 1000) * W * 0.5 + 1e-9;
  let max = 0;
  for (let i = 0; i < 2000; i++) max = Math.max(max, Math.abs(riftShearAt((i * 7.1) % W, (i * 3.7) % H, TEAR, W, H)));
  assert.ok(max <= cap && max > cap * 0.2, `bounded by ${cap.toFixed(2)} and really moves (${max.toFixed(2)})`);
  // rows share a shear (band noise varies slowly in X): neighbouring marks on one row move about alike
  const a = riftShearAt(500, 300, TEAR, W, H);
  const b = riftShearAt(501, 300, TEAR, W, H);
  assert.ok(Math.abs(a - b) < 0.2, 'neighbours on a row tear together');
}

// 2. the applier: in place, strength scales, still marks untouched, undo restores exactly, 0 never runs
{
  const mk = () => ({ n: 4, x: new Float32Array([100, 400, 700, 900]), y: new Float32Array([50, 200, 350, 600]) });
  const soa = mk();
  const before = Array.from(soa.x);
  const yBefore = Array.from(soa.y);
  const still = new Uint8Array([0, 0, 0, 1]);
  const undo = applyRiftShear(soa, TEAR, W, H, 1, still);
  assert.equal(soa.x[3], 900, 'a mark pinned still is left where it is');
  assert.deepEqual(Array.from(soa.y), yBefore, 'the shear is X-only');
  for (let k = 0; k < 3; k++)
    assert.ok(Math.abs(soa.x[k] - (before[k] + riftShearAt(before[k], yBefore[k], TEAR, W, H))) < 1e-3);
  undo();
  assert.deepEqual(Array.from(soa.x), before, 'undo restores the placed positions exactly');
  const half = mk();
  applyRiftShear(half, TEAR, W, H, 0.5);
  const full = mk();
  applyRiftShear(full, TEAR, W, H, 1);
  for (let k = 0; k < 4; k++)
    assert.ok(Math.abs((half.x[k] - before[k]) * 2 - (full.x[k] - before[k])) < 1e-2, 'strength is linear');
  assert.equal(applyRiftShear(mk(), TEAR, W, H, 0), null, 'strength 0 does not run');
  assert.equal(applyRiftShear(mk(), null, W, H, 1), null, 'no tear does not run');
}

// 3. the connection: nearest visible tear ABOVE, never below; frozen empty object when off
const L = (id, extra = {}) => ({ id, name: id, visible: true, layerBlendMode: 'normal', layerOpacity: 1, ...extra });
const FX = (id, effects, extra = {}) => L(id, { type: 'fx', effects, ...extra });
const TR = (amount = 12, bands = 18) => ({ kind: 'tear', params: { amount, bands } });
{
  const stack = [L('a'), FX('fx-low', [TR(5)]), L('b'), FX('fx-high', [TR(30)]), L('c')];
  assert.equal(nearestRiftAbove(stack, 'a').layer.id, 'fx-low');
  assert.equal(nearestRiftAbove(stack, 'b').layer.id, 'fx-high', 'the nearest above, not the topmost');
  assert.equal(nearestRiftAbove(stack, 'c'), null);
  assert.equal(nearestRiftAbove([FX('below', [TR()]), L('a')], 'a'), null, 'a tear below is not a rift');
  assert.equal(nearestRiftAbove([L('a'), FX('fx', [{ kind: 'grain', params: { amount: 0.4 } }])], 'a'), null);
  assert.equal(nearestRiftAbove([L('a'), FX('fx', [TR(0)])], 'a'), null, 'amount 0 is not a tear');
  assert.equal(nearestRiftAbove([L('a'), FX('fx', [TR()], { visible: false })], 'a'), null, 'hidden FX is not a rift');
  const layers = [L('a'), FX('fx', [TR(20, 10)])];
  const on = riftArgs({ layers, layerId: 'a', rift: 0.5, W, H });
  assert.deepEqual(on.rift, { bands: 10, amount: 20, strength: 0.5, W, H });
  const none = riftArgs({ layers, layerId: 'a', rift: 0, W, H });
  assert.equal(
    none,
    riftArgs({ layers: [L('a')], layerId: 'a', rift: 1, W, H }),
    'every off path is the same frozen object',
  );
  assert.ok(Object.isFrozen(none) && Object.keys(none).length === 0);
  assert.equal(RIFT_KEY, 'riftShear');
  assert.equal(RIFT_KEY in DEFAULT_LAYOUT_PARAMS, false, 'the dial adds no default key: no existing hash can move');
}

// 4. the live frame
const lp = (over = {}) => ({
  ...DEFAULT_LAYOUT_PARAMS,
  mode: 'random',
  count: 300,
  kinemeBreath: 0,
  kinemeDrift: 0,
  kinemePaletteBreath: 0,
  lifeDrift: 0,
  ...over,
});
const input = (over = {}) => ({
  canvasW: W,
  canvasH: H,
  layers: [L('lyr-a'), FX('fx', [TR()])],
  activeLayerId: 'lyr-a',
  layerSnapshots: {},
  seed: 1234,
  seedOffsets: null,
  paletteId: 'bone',
  paletteOverrides: null,
  userPalettes: [],
  layoutParams: lp(),
  caGrid: null,
  enabledAssets: null,
  assetWeightOverrides: {},
  customAssets: [],
  quality: 'balanced',
  lockedParams: {},
  batchPaused: false,
  focusSwap: false,
  loopTimeMs: 16,
  dtSec: 0.016,
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
  ...over,
});
const itemsOf = (out, id = 'lyr-a') => out.find((l) => l.id === id).items;
const hash = (items) =>
  createHash('sha256')
    .update(JSON.stringify(items.map((i) => [i.x, i.y, i.scale, i.rotation, i.alpha, i.assetId, i.tint, i.color])))
    .digest('hex');
const frame = (over) => itemsOf(createLiveResolver().resolveLayers(input(over)));

// off is byte-identical: key absent, 0, no tear above, tear below
{
  const off = hash(frame());
  assert.equal(hash(frame({ layoutParams: lp({ [RIFT_KEY]: 0 }) })), off, 'dial 0');
  assert.equal(
    hash(frame({ layers: [L('lyr-a')], layoutParams: lp({ [RIFT_KEY]: 1 }) })),
    hash(frame({ layers: [L('lyr-a')] })),
    'no tear above',
  );
  assert.equal(
    hash(frame({ layers: [FX('fx', [TR()]), L('lyr-a')], layoutParams: lp({ [RIFT_KEY]: 1 }) })),
    hash(frame({ layers: [FX('fx', [TR()]), L('lyr-a')] })),
    'tear below',
  );
}

// on: marks move sideways by the tear's shear, nothing else changes, per frame never accumulating
{
  const off = frame();
  const on = frame({ layoutParams: lp({ [RIFT_KEY]: 1 }) });
  assert.equal(on.length, off.length);
  let moved = 0;
  for (let k = 0; k < off.length; k++) {
    assert.equal(on[k].y, off[k].y, 'X-only');
    assert.equal(on[k].scale, off[k].scale);
    assert.equal(on[k].alpha, off[k].alpha);
    assert.equal(String(on[k].tint ?? on[k].color), String(off[k].tint ?? off[k].color), 'colour untouched');
    if (Math.abs(on[k].x - off[k].x) > 1e-6) moved += 1;
  }
  assert.ok(moved > off.length * 0.8, `the rift really shears the marks (${moved}/${off.length})`);
  const r = createLiveResolver();
  const args = { layoutParams: lp({ [RIFT_KEY]: 1 }) };
  const first = hash(itemsOf(r.resolveLayers(input(args))));
  for (let i = 0; i < 5; i++) r.resolveLayers(input(args));
  assert.equal(hash(itemsOf(r.resolveLayers(input(args)))), first, 'repeated frames do not compound');
  const back = hash(itemsOf(r.resolveLayers(input())));
  assert.equal(back, hash(off), "turning the dial back to off restores today's frame exactly");
  // the nearest tear is the one: a second, stronger tear higher up does not take over
  const two = frame({
    layers: [L('lyr-a'), FX('near', [TR(12)]), FX('far', [TR(40)])],
    layoutParams: lp({ [RIFT_KEY]: 1 }),
  });
  assert.equal(hash(two), hash(on), "the nearest tear above is the layer's rift");
}

console.log('riftShear selfcheck: ok');
