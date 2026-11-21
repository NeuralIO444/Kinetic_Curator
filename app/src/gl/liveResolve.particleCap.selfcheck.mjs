// node src/gl/liveResolve.particleCap.selfcheck.mjs — K3 cap ladder step 1 (#2188), at the resolver: a cloud swarm asked for 500 runs
// 350 at FULL as it always did, and its full 500 only while the frame carries the recorded swarmGpu marker. An organism never rises.
import assert from 'node:assert/strict';
import { createLiveResolver } from './liveResolve.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';

const L = (id) => ({ id, name: id, visible: true, layerBlendMode: 'normal', layerOpacity: 1 });
const input = (f, mode, quality, extra = {}) => ({
  canvasW: 320,
  canvasH: 240,
  layers: [L('a')],
  activeLayerId: 'a',
  layerSnapshots: {},
  seed: 1802,
  seedOffsets: null,
  paletteId: 'bone',
  paletteOverrides: null,
  userPalettes: [],
  caGrid: null,
  enabledAssets: null,
  assetWeightOverrides: {},
  customAssets: [],
  lockedParams: {},
  batchPaused: false,
  focusSwap: false,
  perfClampOverride: null,
  scaleMul: 1,
  alphaBoost: 0,
  phraseWrapGen: 0,
  reducedMotion: false,
  quality,
  perfTier1: false,
  assetThin: false,
  slowRender: false,
  effectiveScale: [0.5, 1.5],
  effectiveAlpha: [20, 100],
  assetAttach: {},
  attractor: null,
  dishPins: [],
  layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode, count: 30, particleCount: 500, body: 1 },
  loopTimeMs: (f + 1) * (1000 / 60),
  dtSec: 1 / 60,
  ...extra,
});
const bodies = (mode, quality, extra) => {
  const r = createLiveResolver();
  let out;
  for (let f = 0; f < 3; f++) out = r.resolveLayers(input(f, mode, quality, extra));
  const n = out.reduce((sum, l) => sum + (l.items ? l.items.length : 0), 0);
  r.dispose?.();
  return n;
};

assert.equal(bodies('swarm', 'high'), 350, 'no marker: the FULL tier cuts 500 to 350, as always');
assert.equal(
  bodies('swarm', 'high', { swarmGpu: 1 }),
  500,
  'marker: the layer runs its full 500 (cap 2,048, range 500)',
);
assert.equal(bodies('swarm', 'balanced'), 200);
assert.equal(bodies('swarm', 'balanced', { swarmGpu: 1 }), 500, 'SHOW tier GPU cap is 1,170 (range 500 binds)');
assert.equal(bodies('swarm', 'performance'), 100);
assert.equal(
  bodies('swarm', 'performance', { swarmGpu: 1 }),
  500,
  'LEAN tier GPU cap is 585: the range (500) binds now',
);
assert.equal(
  bodies('hype', 'high', { swarmGpu: 1 }),
  bodies('hype', 'high'),
  'an organism layer is not covered: its cap does not move',
);
console.log('liveResolve.particleCap.selfcheck: ok — K3 cap ladder step 1 #2188');
