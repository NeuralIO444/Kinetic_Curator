/**
 * Parity scene corpus — Phase 0 (#186).
 *
 * A fixed set of project documents the harness renders through the SVG
 * reference path (and, from Phase 1, the GL candidate path). Scenes are
 * small and deterministic by construction:
 *
 * - `lifeDrift: 0` and fixed seeds — no time-varying output.
 * - Text-bearing stamp assets are disabled — resvg needs no font
 *   configuration, so reference pixels don't depend on system fonts.
 * - Counts are small (12–48 items) — the corpus must stay fast in CI.
 *
 * Each scene declares its diff `policy`:
 * - 'default': perChannelTol 8, 10% pixel budget (owner call 2026-09-16:
 *   under 10% is a pass — sub-visible edge AA variance from the atlas
 *   architecture is accepted) — geometry, blends, and deterministic
 *   effects (invert, posterize, blur).
 * - 'fx': relaxed (perChannelTol 24, 2% pixels) — turbulence-based
 *   effects (grain, displace, tear, scanlines) rasterize differently on
 *   every backend by design; filter output is outside the determinism
 *   contract (see fxFilters.js).
 */

import { DEFAULT_LAYOUT_PARAMS } from '../../data/layout-modes.js';
import { ASSETS } from '../../data/assets/index.js';
import { DEFAULT_POLICY, FX_RELAXED_POLICY } from './diff.mjs';

export const POLICIES = Object.freeze({
  default: DEFAULT_POLICY,
  fx: FX_RELAXED_POLICY,
});

// Text is baked into these stamp assets as SVG <text>; keep them out of the
// corpus so reference pixels never depend on font resolution.
const TEXT_ASSET_IDS = new Set(
  ASSETS.filter((a) => a.svg.includes('<text')).map((a) => a.id)
);

const enabledAssets = Object.fromEntries(
  ASSETS.map((a) => [a.id, !TEXT_ASSET_IDS.has(a.id)])
);

const lp = (over = {}) => ({ ...DEFAULT_LAYOUT_PARAMS, lifeDrift: 0, ...over });

function doc(over = {}) {
  return {
    version: 1,
    seed: 0xC0FFEE,
    paletteId: 'praystation',
    paletteOverrides: null,
    layoutParams: lp({ count: 36 }),
    enabledAssets,
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

export const CORPUS = [
  {
    id: 'single-basic',
    description: 'One content layer, 36 items, no FX — geometry baseline.',
    policy: 'default',
    width: 400,
    doc: doc(),
  },
  {
    id: 'multi-blend',
    description: 'Two content layers; top uses screen blend at 0.5 opacity (snapshot).',
    policy: 'default',
    width: 400,
    doc: doc({
      layers: [
        { id: 'bg', name: 'BG', type: 'content', visible: true, layerBlendMode: 'normal', layerOpacity: 1 },
        { id: 'top', name: 'Top', type: 'content', visible: true, layerBlendMode: 'screen', layerOpacity: 0.5 },
      ],
      layerSnapshots: {
        top: {
          seed: 99, paletteId: 'praystation', paletteOverrides: null,
          layoutParams: lp({ count: 14 }), caGrid: null, enabledAssets,
        },
      },
    }),
  },
  {
    id: 'fx-chain-2',
    description: 'FX layer [rgbSplit, grain] wrapping content — the #185 default stack.',
    policy: 'fx',
    width: 400,
    doc: doc({
      layers: [
        { id: 'bg', name: 'BG', type: 'content', visible: true, layerBlendMode: 'normal', layerOpacity: 1 },
        fxLayer('fx1', [
          { kind: 'rgbSplit', params: { dx: 3 } },
          { kind: 'grain', params: { amount: 0.4 } },
        ]),
      ],
    }),
  },
  {
    id: 'fx-chain-3',
    description: 'FX layer [blur, rgbSplit, posterize] — three-deep top-down chain.',
    policy: 'fx',
    width: 400,
    doc: doc({
      layers: [
        { id: 'bg', name: 'BG', type: 'content', visible: true, layerBlendMode: 'normal', layerOpacity: 1 },
        fxLayer('fx1', [
          { kind: 'blur', params: { radius: 6 } },
          { kind: 'rgbSplit', params: { dx: 5 } },
          { kind: 'posterize', params: { levels: 4 } },
        ]),
      ],
    }),
  },
  {
    id: 'fx-invert-wrap',
    description: 'FX layer [invert] at 0.8 opacity above an unwrapped top layer — wrap fold + opacity.',
    policy: 'default',
    width: 400,
    doc: doc({
      layers: [
        { id: 'bg', name: 'BG', type: 'content', visible: true, layerBlendMode: 'normal', layerOpacity: 1 },
        fxLayer('fx1', [{ kind: 'invert', params: {} }], 0.8),
        { id: 'top', name: 'Top', type: 'content', visible: true, layerBlendMode: 'normal', layerOpacity: 1 },
      ],
      layerSnapshots: {
        top: {
          seed: 7, paletteId: 'praystation', paletteOverrides: null,
          layoutParams: lp({ count: 12 }), caGrid: null, enabledAssets,
        },
      },
    }),
  },
  {
    id: 'fx-stack-3',
    description: 'Stacked FX layers (invert / posterize / rgbSplit) with blend modes — multi-wrap compositing (#189). Under balanced caps the 3rd FX layer sheds (maxFxLayers 2), exercising the unwrapped pass-through; the 60fps probe scene.',
    policy: 'default',
    width: 400,
    doc: doc({
      // bg is the active layer: its count comes from the doc-level
      // layoutParams, not its snapshot. Small counts keep the baked atlas
      // under the harness ferry limit (a 44-combo atlas produced a 108MB
      // payload and killed page.evaluate).
      layoutParams: lp({ count: 10 }),
      layers: [
        { id: 'bg', name: 'BG', type: 'content', visible: true, layerBlendMode: 'normal', layerOpacity: 1 },
        fxLayer('fx1', [{ kind: 'invert', params: {} }]),
        { id: 'mid', name: 'Mid', type: 'content', visible: true, layerBlendMode: 'multiply', layerOpacity: 0.8 },
        fxLayer('fx2', [{ kind: 'posterize', params: { levels: 4 } }]),
        { id: 'top', name: 'Top', type: 'content', visible: true, layerBlendMode: 'screen', layerOpacity: 0.6 },
        fxLayer('fx3', [{ kind: 'rgbSplit', params: { dx: 2 } }]),
      ],
      layerSnapshots: {
        // Small counts keep the baked atlas under the harness ferry limit
        // (a 44-combo atlas produced a 108MB payload and killed evaluate).
        mid: {
          seed: 99, paletteId: 'praystation', paletteOverrides: null,
          layoutParams: lp({ count: 8 }), caGrid: null, enabledAssets,
        },
        top: {
          seed: 7, paletteId: 'praystation', paletteOverrides: null,
          layoutParams: lp({ count: 8 }), caGrid: null, enabledAssets,
        },
      },
    }),
  },
];

export function getScene(id) {
  const s = CORPUS.find((c) => c.id === id);
  if (!s) throw new Error(`[parity] unknown scene "${id}" (available: ${CORPUS.map((c) => c.id).join(', ')})`);
  return s;
}
