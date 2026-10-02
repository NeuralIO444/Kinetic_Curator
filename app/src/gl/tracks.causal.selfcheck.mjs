// #822 — PATCH / FEED / FIELD stay causal across hide/show.
//
// Hide is not remove. Warp phase and life-drift phase keep the loop clock
// (a hidden span is not a reset to t=0). FEED does not invent a partner:
// one track, a self-target, a ghost id, or a hidden source is identity.
// A real partner's delay slot survives hide so re-show does not read
// someone else's buffer.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLiveResolver } from './liveResolve.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';

function layer(id, over = {}) {
  return {
    id, name: id, visible: true, type: 'content',
    layerBlendMode: 'normal', layerOpacity: 1,
    patch: { mode: 'off', to: null, strength: 0.16 },
    ...over,
  };
}

function input(over = {}) {
  return {
    layers: [layer('lyr-a')],
    activeLayerId: 'lyr-a',
    layerSnapshots: {},
    seed: 822,
    paletteId: 'bone',
    paletteOverrides: null,
    userPalettes: [],
    layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'scatter', count: 12, displacement: 0, lifeDrift: 0 },
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
    slowRender: false,
    mixSeconds: 0,
    ...over,
  };
}

function pts(out, id = 'lyr-a') {
  const e = out.find((x) => x.id === id);
  return (e?.items || []).map((it) => ({
    x: Math.round(it.x * 1000) / 1000,
    y: Math.round(it.y * 1000) / 1000,
  }));
}

test('#822 life-drift phase survives hide → show (no reset to t=0)', () => {
  const lp = { ...DEFAULT_LAYOUT_PARAMS, mode: 'scatter', count: 12, displacement: 0, lifeDrift: 1 };
  const mk = (visible, loopTimeMs) => input({
    layoutParams: lp,
    loopTimeMs,
    layers: [layer('lyr-a', { visible })],
  });
  const held = createLiveResolver();
  held.resolveLayers(mk(true, 0));
  held.resolveLayers(mk(true, 1000));
  const continuous = pts(held.resolveLayers(mk(true, 3000)));
  held.dispose();

  const hidden = createLiveResolver();
  hidden.resolveLayers(mk(true, 0));
  hidden.resolveLayers(mk(true, 1000));
  hidden.resolveLayers(mk(false, 2000));
  const resumed = pts(hidden.resolveLayers(mk(true, 3000)));
  hidden.dispose();

  assert.equal(resumed.length, continuous.length);
  assert.deepEqual(resumed, continuous, 'life drift is a function of loop time, not of visibility');
});

test('#822 FEED with one track does not invent a partner', () => {
  const off = createLiveResolver();
  const plain = pts(off.resolveLayers(input({ loopTimeMs: 16 })));
  off.resolveLayers(input({ loopTimeMs: 32 }));
  const plain2 = pts(off.resolveLayers(input({ loopTimeMs: 48 })));
  off.dispose();

  for (const to of [null, 'lyr-a', 'ghost-track']) {
    const r = createLiveResolver();
    const patch = { mode: 'feed', to, strength: 1 };
    const a = pts(r.resolveLayers(input({ loopTimeMs: 16, layers: [layer('lyr-a', { patch })] })));
    r.resolveLayers(input({ loopTimeMs: 32, layers: [layer('lyr-a', { patch })] }));
    const b = pts(r.resolveLayers(input({ loopTimeMs: 48, layers: [layer('lyr-a', { patch })] })));
    r.dispose();
    assert.deepEqual(a, plain, `first frame identity for to=${to}`);
    assert.deepEqual(b, plain2, `later frames stay identity for to=${to} — no invented partner`);
  }
});

test('#822 FIELD/FEED with a hidden partner do not hop', () => {
  const off = createLiveResolver();
  const plain = pts(off.resolveLayers(input({ loopTimeMs: 32 })));
  off.dispose();

  for (const mode of ['field', 'feed']) {
    const r = createLiveResolver();
    const layers = [
      layer('lyr-a', { patch: { mode, to: 'lyr-b', strength: 1 } }),
      layer('lyr-b', { visible: false }),
    ];
    r.resolveLayers(input({ loopTimeMs: 0, layers }));
    const shown = pts(r.resolveLayers(input({ loopTimeMs: 32, layers })));
    r.dispose();
    assert.deepEqual(shown, plain, `${mode} must not invent a stand-in for a hidden partner`);
  }
});

test('#822 FEED slot survives hide → show (re-show reads the same partner, not a recycled slot)', () => {
  const patch = { mode: 'feed', to: 'lyr-a', strength: 1 };
  const layers = [layer('lyr-a'), layer('lyr-b', { patch })];
  const mk = (bVisible, loopTimeMs) => input({
    loopTimeMs,
    dtSec: 1 / 60,
    layers: layers.map((l) => (l.id === 'lyr-b' ? { ...l, visible: bVisible } : l)),
  });

  const held = createLiveResolver();
  held.resolveLayers(mk(true, 0));
  held.resolveLayers(mk(true, 16));
  held.resolveLayers(mk(true, 32));
  const continuous = pts(held.resolveLayers(mk(true, 48)), 'lyr-b');
  held.dispose();

  const hidden = createLiveResolver();
  hidden.resolveLayers(mk(true, 0));
  hidden.resolveLayers(mk(true, 16));
  hidden.resolveLayers(mk(false, 24));
  const resumed = pts(hidden.resolveLayers(mk(true, 48)), 'lyr-b');
  hidden.dispose();

  assert.equal(resumed.length, continuous.length);
  assert.ok(resumed.length > 0, 'target track produced items');
  assert.deepEqual(resumed, continuous, 'hide must not recycle the source delay slot');
});
