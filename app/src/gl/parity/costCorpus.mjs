/**
 * costCorpus — the recipe corpus for the T4 cost-head benchmark harness (#1578).
 *
 * Two parts:
 * - ANCHORS: the parity corpus scenes, verbatim (same docs the GL parity
 *   suite already renders). They are known quantities with known relative
 *   costs — the harness's sanity ladder.
 * - GRID: a designed sample of the recipe space, built like corpus.mjs docs.
 *   Full factorial over every knob is thousands of scenes; instead: a
 *   one-factor ladder around a base recipe (count / cast / scale / FX depth),
 *   the pairwise combinations of the expensive factors, and deliberate
 *   heavy-tail oversampling near and above the frame budget — the band the
 *   governor exists for is the band FTRF measured worst, because it was the
 *   band they sampled least.
 *
 * Corpus discipline (learned by the parity corpus the hard way): the baked
 * atlas is ferried to the page as base64 — keep per-scene combo counts low.
 * Counts stay moderate and casts are bounded subsets, so one scene's payload
 * stays far under the ~100MB evaluate ceiling that killed a 44-combo atlas.
 *
 * Deterministic by construction: fixed seeds, fixed cast slices (assets
 * sorted by id, strided picks) — no RNG anywhere, so two builds of this
 * corpus are deep-equal (the selfcheck pins that).
 *
 * Known v1 gap: layoutParams.accumulation stays OFF everywhere. The accum
 * trail renders through the live renderer's sequence path (__kcAccum), not
 * renderScene — pricing it needs a live-frame bench, a later harness slice.
 */

import { DEFAULT_LAYOUT_PARAMS } from '../../data/layout-modes.js';
import { ASSETS } from '../../data/assets/index.js';
import { CORPUS as PARITY_CORPUS } from './corpus.mjs';

// Text-bearing stamps stay out (same rule as corpus.mjs: reference pixels —
// and here, atlas bakes — must not depend on font resolution).
const TEXT_ASSET_IDS = new Set(
  ASSETS.filter((a) => a.svg.includes('<text')).map((a) => a.id)
);
const ALL_ASSET_IDS = ASSETS.map((a) => a.id).sort();
const CASTABLE_IDS = ALL_ASSET_IDS.filter((id) => !TEXT_ASSET_IDS.has(id));

/** A bounded cast: `n` castable assets picked at a fixed stride from a
 * rotated start, so different sizes give different (overlapping) casts. */
function castOf(n, rotate = 0) {
  const out = {};
  for (const id of ALL_ASSET_IDS) out[id] = false;
  const stride = Math.max(1, Math.floor(CASTABLE_IDS.length / n));
  for (let i = 0; i < n; i++) {
    out[CASTABLE_IDS[(rotate + i * stride) % CASTABLE_IDS.length]] = true;
  }
  return out;
}

const lp = (over = {}) => ({ ...DEFAULT_LAYOUT_PARAMS, lifeDrift: 0, ...over });

function doc(over = {}) {
  return {
    version: 1,
    seed: 0xC057,
    paletteId: 'praystation',
    paletteOverrides: null,
    layoutParams: lp({ count: 48 }),
    enabledAssets: castOf(8),
    quality: 'balanced',
    layers: [
      { id: 'bg', name: 'BG', type: 'content', visible: true, layerBlendMode: 'normal', layerOpacity: 1 },
    ],
    activeLayerId: 'bg',
    layerSnapshots: {},
    ...over,
  };
}

function fxLayer(id, effects, layerOpacity = 1) {
  return {
    id, name: id.toUpperCase(), type: 'fx', visible: true,
    layerBlendMode: 'normal', layerOpacity, effects,
  };
}

// FX chains rotate through the shipped effect kinds, cheapest-looking first;
// depth d takes the first d effects of the rotation, one FX layer per effect
// past the first (wraps are the expensive shape — see fx-stack-3).
const FX_ROTATION = [
  { kind: 'grain', params: { amount: 0.4 } },
  { kind: 'rgbSplit', params: { dx: 3 } },
  { kind: 'blur', params: { radius: 6 } },
  { kind: 'posterize', params: { levels: 4 } },
];
function fxLayers(depth) {
  return FX_ROTATION.slice(0, depth).map((fx, i) => fxLayer(`fx${i + 1}`, [fx]));
}

const BG = { id: 'bg', name: 'BG', type: 'content', visible: true, layerBlendMode: 'normal', layerOpacity: 1 };
const withFx = (depth, over = {}) => doc({ layers: [BG, ...fxLayers(depth)], ...over });

const GRID = [
  // — the base recipe everything ladders from —
  { id: 'grid-base', description: 'Base: fibonacci, 48 bodies, cast of 8, default scale, no FX.', doc: doc() },

  // — count ladder (bodies axis) —
  { id: 'grid-count-12', description: 'Count ladder: 12 bodies.', doc: doc({ layoutParams: lp({ count: 12 }) }) },
  { id: 'grid-count-160', description: 'Count ladder: 160 bodies.', doc: doc({ layoutParams: lp({ count: 160 }) }) },
  { id: 'grid-count-480', description: 'Count ladder: 480 bodies (heavy tail).', doc: doc({ layoutParams: lp({ count: 480 }) }) },

  // — cast ladder (atlas/instance variety axis) —
  { id: 'grid-cast-4', description: 'Cast ladder: 4 assets, 160 bodies.', doc: doc({ layoutParams: lp({ count: 160 }), enabledAssets: castOf(4) }) },
  { id: 'grid-cast-24', description: 'Cast ladder: 24 assets, 160 bodies.', doc: doc({ layoutParams: lp({ count: 160 }), enabledAssets: castOf(24, 7) }) },

  // — scale ladder (overdraw axis) —
  { id: 'grid-scale-small', description: 'Scale ladder: small marks (0.2-0.4), 160 bodies.', doc: doc({ layoutParams: lp({ count: 160, scale: { x: [0.2, 0.4], y: [0.2, 0.4] } }) }) },
  { id: 'grid-scale-large', description: 'Scale ladder: large marks (1.8-2.6), 160 bodies.', doc: doc({ layoutParams: lp({ count: 160, scale: { x: [1.8, 2.6], y: [1.8, 2.6] } }) }) },

  // — FX depth ladder (fullscreen-pass axis) —
  { id: 'grid-fx-1', description: 'FX ladder: 1 wrap (grain).', doc: withFx(1) },
  { id: 'grid-fx-2', description: 'FX ladder: 2 wraps (grain, rgbSplit).', doc: withFx(2) },
  { id: 'grid-fx-3', description: 'FX ladder: 3 wraps (+ blur).', doc: withFx(3) },
  { id: 'grid-fx-4', description: 'FX ladder: 4 wraps (+ posterize).', doc: withFx(4) },

  // — blend + mirror (composite axis) —
  { id: 'grid-blend-screen', description: 'Blend: screen at 160 bodies.', doc: doc({ layoutParams: lp({ count: 160, blendMode: 'screen' }) }) },
  { id: 'grid-mirror-x', description: 'Mirror: x at 160 bodies.', doc: doc({ layoutParams: lp({ count: 160, mirror: 'x' }) }) },

  // — live modes (particle axis; particleCount spec max is 500) —
  { id: 'grid-swarm-150', description: 'Swarm: 150 particles (spec default).', doc: doc({ layoutParams: lp({ mode: 'swarm', particleCount: 150 }) }) },
  { id: 'grid-swarm-500', description: 'Swarm: 500 particles (spec max).', doc: doc({ layoutParams: lp({ mode: 'swarm', particleCount: 500 }) }) },

  // — heavy tail: pairwise expensive combinations, deliberately oversampled —
  { id: 'grid-heavy-count-fx', description: 'Heavy: 480 bodies x 3 FX wraps.', doc: withFx(3, { layoutParams: lp({ count: 480 }) }) },
  { id: 'grid-heavy-scale-fx', description: 'Heavy: large marks x 2 FX wraps, 160 bodies.', doc: withFx(2, { layoutParams: lp({ count: 160, scale: { x: [1.8, 2.6], y: [1.8, 2.6] } }) }) },
  { id: 'grid-heavy-count-scale', description: 'Heavy: 480 bodies x large marks.', doc: doc({ layoutParams: lp({ count: 480, scale: { x: [1.8, 2.6], y: [1.8, 2.6] } }) }) },
  { id: 'grid-heavy-all', description: 'Heavy: 480 bodies x large marks x cast 24 x 4 FX wraps.', doc: withFx(4, { layoutParams: lp({ count: 480, scale: { x: [1.8, 2.6], y: [1.8, 2.6] } }), enabledAssets: castOf(24, 7) }) },
];

/** All bench recipes: parity anchors first (the sanity ladder), then the grid. */
export const COST_CORPUS = [
  ...PARITY_CORPUS.map((s) => ({ id: `parity-${s.id}`, description: `Parity anchor: ${s.description}`, doc: s.doc })),
  ...GRID,
];

export function getCostScene(id) {
  const scene = COST_CORPUS.find((s) => s.id === id);
  if (!scene) throw new Error(`[costBench] unknown recipe: ${id} (have: ${COST_CORPUS.map((s) => s.id).join(', ')})`);
  return scene;
}

/** The enabled cast ids of a doc — the `assets` input recipeFeatures expects. */
export function castIdsOf(doc) {
  const enabled = doc.enabledAssets || {};
  return Object.keys(enabled).filter((id) => enabled[id]).sort();
}
