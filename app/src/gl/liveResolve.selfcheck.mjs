/**
 * liveResolve.selfcheck.mjs — node selfcheck for the browser layer resolver (#224).
 *
 * Pins liveResolve.resolveLayers() against the resolveLayers() shape from
 * studio/render.mjs: content layers resolve to GL-renderable items
 * (assetId-bearing), FX layers pass through as markers, snapshots drive
 * non-active layers, and swarm modes advance real particle physics.
 *
 * Run: node --test src/gl/liveResolve.selfcheck.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLiveResolver } from './liveResolve.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';
import { ASSETS } from '../data/assets/index.js';

function baseInput(over = {}) {
  return {
    layers: [
      { id: 'lyr-a', name: 'A', visible: true, layerBlendMode: 'normal', layerOpacity: 1 },
      { id: 'lyr-fx', name: 'FX', visible: true, type: 'fx', layerBlendMode: 'normal', layerOpacity: 1 },
    ],
    activeLayerId: 'lyr-a',
    layerSnapshots: {},
    seed: 1234,
    paletteId: 'bone',
    paletteOverrides: null,
    userPalettes: [],
    layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'scatter', count: 40 },
    caGrid: null,
    enabledAssets: null,
    assetWeightOverrides: {},
    customAssets: [],
    quality: 'balanced',
    driftOverlay: null,
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
  };
}

test('content layers resolve to assetId-bearing items; fx layers are markers', () => {
  const r = createLiveResolver();
  const out = r.resolveLayers(baseInput());
  const content = out.find((l) => l.id === 'lyr-a');
  assert.ok(content && !content.isFx);
  assert.ok(Array.isArray(content.items) && content.items.length > 0);
  for (const it of content.items) {
    assert.ok(typeof it.assetId === 'string' && it.assetId.length > 0, 'item has assetId');
    assert.ok(typeof it.x === 'number' && typeof it.y === 'number');
  }
  const fx = out.find((l) => l.id === 'lyr-fx');
  assert.ok(fx && fx.isFx === true);
  assert.ok(!('items' in fx) || fx.items === undefined);
  r.dispose();
});

test('non-active layers resolve from their snapshots', () => {
  const r = createLiveResolver();
  const input = baseInput({
    layers: [
      { id: 'lyr-a', name: 'A', visible: true },
      { id: 'lyr-b', name: 'B', visible: true },
    ],
    activeLayerId: 'lyr-a',
    layerSnapshots: {
      'lyr-b': {
        seed: 999,
        paletteId: 'bone',
        paletteOverrides: null,
        layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'grid', count: 12 },
        caGrid: null,
        enabledAssets: null,
      },
    },
  });
  const out = r.resolveLayers(input);
  const b = out.find((l) => l.id === 'lyr-b');
  assert.equal(b.layoutParams.mode, 'grid');
  assert.ok(b.items.length > 0);
  r.dispose();
});

test('live swarm modes advance real particle physics', () => {
  const r = createLiveResolver();
  const input = baseInput({
    layers: [{ id: 'lyr-s', name: 'S', visible: true }],
    activeLayerId: 'lyr-s',
    layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'swarm', particleCount: 24 },
  });
  const a = r.resolveLayers(input);
  const b = r.resolveLayers(input);
  const pa = a[0].items.map((i) => i.x);
  const pb = b[0].items.map((i) => i.x);
  assert.equal(pa.length, pb.length);
  assert.ok(pa.length > 0);
  // Physics advanced between resolves (positions moved).
  assert.ok(pa.some((x, i) => Math.abs(x - pb[i]) > 1e-9), 'swarm moved between frames');
  for (const it of b[0].items) assert.ok(it.assetId, 'swarm item has assetId');
  r.dispose();
});

test('perfTier1 sheds mirror on every visible layer', () => {
  const r = createLiveResolver();
  const input = baseInput({
    layers: [{ id: 'lyr-a', name: 'A', visible: true }],
    perfTier1: true,
    layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'scatter', count: 40, mirror: true },
  });
  const out = r.resolveLayers(input);
  assert.equal(out[0].layoutParams.mirror, false);
  r.dispose();
});

test('known asset ids resolve (pool sanity)', () => {
  assert.ok(ASSETS.length > 0);
  assert.ok(ASSETS.every((a) => typeof a.id === 'string'));
});

test('#269: null layers are skipped, not thrown', () => {
  const r = createLiveResolver();
  const out = r.resolveLayers(baseInput({
    layers: [null, { id: 'lyr-a', name: 'A', visible: true }],
  }));
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'lyr-a');
  assert.ok(out[0].items.length > 0);
  r.dispose();
});

test('#269: rotate:null degrades to zero rotation', () => {
  const r = createLiveResolver();
  const out = r.resolveLayers(baseInput({
    layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'scatter', count: 40, rotate: null },
  }));
  const content = out.find((l) => l.id === 'lyr-a');
  assert.ok(content.items.length > 0);
  for (const it of content.items) assert.equal(it.rotation, 0);
  r.dispose();
});

test('#269: negative particleCount floors to 0 instead of RangeError', () => {
  const r = createLiveResolver();
  const out = r.resolveLayers(baseInput({
    layers: [{ id: 'lyr-s', name: 'S', visible: true }],
    activeLayerId: 'lyr-s',
    layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'swarm', particleCount: -50 },
  }));
  assert.equal(out[0].items.length, 0);
  r.dispose();
});

function modInput(patch) {
  return baseInput({
    layers: [
      { id: 'lyr-a', name: 'A', visible: true, layerBlendMode: 'normal', layerOpacity: 1 },
      {
        id: 'lyr-b', name: 'B', visible: true, layerBlendMode: 'normal', layerOpacity: 1,
        patch,
      },
    ],
    activeLayerId: 'lyr-a',
    layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'swarm', count: 30, particleCount: 30, behave: 'scatter' },
    layerSnapshots: {
      'lyr-b': {
        seed: 999,
        paletteId: 'bone',
        paletteOverrides: null,
        layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'scatter', count: 20 },
        caGrid: null,
        enabledAssets: null,
      },
    },
  });
}

test('#343: MOD patch perturbs the target when the source track has motion', () => {
  const off = createLiveResolver().resolveLayers(modInput(null));
  const on = createLiveResolver().resolveLayers(modInput({ mode: 'mod', to: 0, strength: 1 }));
  const bOff = off.find((l) => l.id === 'lyr-b');
  const bOn = on.find((l) => l.id === 'lyr-b');
  assert.equal(bOff.items.length, bOn.items.length, 'MOD does not add/remove items, only perturbs them');
  const changed = bOn.items.some((it, i) => {
    const base = bOff.items[i];
    return base && (it.scale !== base.scale || it.alpha !== base.alpha || it.x !== base.x);
  });
  assert.ok(changed, 'a swarm source with real motion perturbs the MOD target\'s scale/alpha/x');
});

test('#343: MOD is a no-op when strength is 0', () => {
  const off = createLiveResolver().resolveLayers(modInput(null));
  const zero = createLiveResolver().resolveLayers(modInput({ mode: 'mod', to: 0, strength: 0 }));
  const bOff = off.find((l) => l.id === 'lyr-b');
  const bZero = zero.find((l) => l.id === 'lyr-b');
  for (let i = 0; i < bOff.items.length; i++) {
    assert.equal(bZero.items[i].scale, bOff.items[i].scale);
    assert.equal(bZero.items[i].alpha, bOff.items[i].alpha);
    assert.equal(bZero.items[i].x, bOff.items[i].x);
  }
});
