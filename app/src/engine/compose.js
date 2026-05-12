// engine/compose.js — pure pipeline that turns a state snapshot into a flat
// list of renderable items. Used by the live canvas AND each frozen layer.

import { computePlacements } from './placement.js';
import { colorForPlacement, applyHarmony } from './color.js';
import { mkRng } from './prng.js';
import { processEffects } from './effects.js';
import { getPreset } from '../data/presets.js';

/**
 * Compose items for a single layer / snapshot.
 *
 * @param {Object} snapshot - state at capture time
 *   { seed, layoutParams, paletteId, enabledAssets,
 *     blendMode, blendStrength, echoEnabled, ..., colorHarmony }
 * @param {Object} ctx - render context
 *   { canvasW, canvasH, assets, palettes, preset, tick, blastCenter }
 * @returns {Array} items
 */
export function composeItems(snapshot, ctx) {
  const {
    seed,
    layoutParams,
    enabledAssets,
  } = snapshot;

  const palette = ctx.palettes.find(p => p.id === snapshot.paletteId) || ctx.palettes[0];
  const activeAssets = ctx.assets.filter(a => enabledAssets?.[a.id]);
  if (activeAssets.length === 0) return [];

  // Each snapshot resolves its own preset — layer snapshots must not pick up
  // the *live* preset's paletteShift just because the live state happened to
  // be on a different composition at render time.
  const ownPreset = getPreset(layoutParams.composition);

  const placements = computePlacements({
    mode: layoutParams.mode,
    count: layoutParams.count,
    seed,
    scale: layoutParams.scale,
    rotate: layoutParams.rotate,
    alpha: layoutParams.alpha,
    jitter: layoutParams.jitter,
    density: layoutParams.density,
    canvasW: ctx.canvasW,
    canvasH: ctx.canvasH,
    caGrid: null,
  });

  const harmonizedSwatches = applyHarmony(palette.swatches, snapshot.colorHarmony || 'none');
  const rng = mkRng(seed + 1);

  let items = placements.map((p, i) => {
    const asset = activeAssets[i % activeAssets.length];
    const color = colorForPlacement({
      swatches: harmonizedSwatches,
      strategy: snapshot.colorStrategy !== 'band'
        ? snapshot.colorStrategy
        : (ownPreset?.paletteShift || 'band'),
      t: p.t,
      index: p.index,
      rng: () => rng(),
    });
    const accent = harmonizedSwatches[(harmonizedSwatches.indexOf(color) + 3) % harmonizedSwatches.length] || harmonizedSwatches[0];
    return { ...p, asset, color, accent };
  });

  const effectConfig = {
    blendMode: snapshot.blendMode,
    blendStrength: snapshot.blendStrength,
    echoEnabled: snapshot.echoEnabled,
    echoCount: snapshot.echoCount,
    echoDecay: snapshot.echoDecay,
    trailEnabled: snapshot.trailEnabled,
    trailLength: snapshot.trailLength,
    feedbackEnabled: snapshot.feedbackEnabled,
    feedbackStrength: snapshot.feedbackStrength,
    feedbackDepth: snapshot.feedbackDepth,
    particlesEnabled: snapshot.particlesEnabled,
    particleCount: snapshot.particleCount,
    particleSpeed: snapshot.particleSpeed,
    motionEnabled: snapshot.motionEnabled,
    motionType: snapshot.motionType,
    blastRadiusEnabled: snapshot.blastRadiusEnabled,
    blastRadius: snapshot.blastRadius,
    blastForce: snapshot.blastForce,
    colorStrategy: snapshot.colorStrategy,
    colorHarmony: snapshot.colorHarmony,
  };

  const pipelineCtx = {
    canvasW: ctx.canvasW,
    canvasH: ctx.canvasH,
    seed,
    swatches: harmonizedSwatches,
    tick: ctx.tick || 0,
    blastCenter: ctx.blastCenter || null,
  };

  return processEffects(items, effectConfig, pipelineCtx);
}

// Keys captured when freezing the live composition into a layer snapshot.
export const LAYER_SNAPSHOT_KEYS = [
  'seed', 'paletteId', 'layoutParams', 'enabledAssets',
  'blendMode', 'blendStrength', 'echoEnabled', 'echoCount', 'echoDecay',
  'trailEnabled', 'trailLength', 'feedbackEnabled', 'feedbackStrength', 'feedbackDepth',
  'particlesEnabled', 'particleCount', 'particleSpeed', 'motionEnabled', 'motionType',
  'blastRadiusEnabled', 'blastRadius', 'blastForce', 'colorStrategy', 'colorHarmony',
];

export function snapshotFromState(state) {
  const out = {};
  for (const k of LAYER_SNAPSHOT_KEYS) out[k] = state[k];
  return out;
}
