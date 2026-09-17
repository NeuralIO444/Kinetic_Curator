// Quality presets — soft ceilings for interactive performance.
// Showrunner budgets (§7): each tier carries per-subsystem ceilings so
// the governor can shed the right thing instead of only stepping density.
//
// Phase 6 (#192): `maxFxLayers` is retired as a tier budget. FX compositing
// runs on the GPU (one extra FBO pair + one filter pass per wrap), so the
// per-tier FX-layer caps that culled stacked FX on the SVG path no longer
// buy anything — all live tiers allow unbounded FX wraps, like FINAL_CAPS.
// The tier budgets that remain are placement/particle counts (CPU-side
// kernel + atlas upload work), filter-primitive counts, and the per-layer
// asset budget. New keys: maxFilterPrimitives, maxAssetsPerLayer,
// turbulenceOctaves. FINAL_CAPS stays the ungoverned "cinematic" tier.
//
// Governor shed order (see hooks/governorCuts.js): dynamic resolution
// scale first, then quality tier step, then mirror/gloss/ACCUM (perfTier1),
// then asset thinning, then a render-only count clamp, then motion freeze,
// then the watchdog. FX layers are NEVER culled — that was the silent-cull
// trap (#103 P1, #192): an FX layer shown in the UI while its wrap was
// shed. buildSceneContract still *reports* any shed wraps (contract.shed)
// so a future cap can never go silent again.

export const QUALITY_PRESETS = {
  high: {
    id: 'high',
    label: 'HIGH',
    maxCount: 800,
    maxCountMirrored: 650,
    maxParticles: 350,
    allowMirror: true,
    allowGloss: true,
    maxFxLayers: Infinity, // #192: retired as a budget — GPU composites all FX wraps
    maxFilterPrimitives: 8,
    maxAssetsPerLayer: 96,
    turbulenceOctaves: 3,
    description: 'Full fidelity — best hardware',
  },
  balanced: {
    id: 'balanced',
    label: 'BALANCED',
    maxCount: 420,
    maxCountMirrored: 360,
    maxParticles: 200,
    allowMirror: true,
    allowGloss: true,
    maxFxLayers: Infinity, // #192: retired as a budget — GPU composites all FX wraps
    maxFilterPrimitives: 6,
    maxAssetsPerLayer: 48,
    turbulenceOctaves: 2,
    description: 'Good density, stable frame rate',
  },
  performance: {
    id: 'performance',
    label: 'PERF',
    maxCount: 180,
    maxCountMirrored: 140,
    maxParticles: 100,
    allowMirror: false,
    allowGloss: false,
    maxFxLayers: Infinity, // #192: retired as a budget — GPU composites all FX wraps
    maxFilterPrimitives: 4,
    maxAssetsPerLayer: 24,
    turbulenceOctaves: 1,
    description: 'Protects interactivity on weaker machines',
  },
};

/** Caps used when RENDER · UNCAPPED is on — no interactivity to protect. */
export const FINAL_CAPS = {
  id: 'final',
  label: 'FINAL',
  maxCount: 800,
  maxCountMirrored: 800,
  maxParticles: 400,
  allowMirror: true,
  allowGloss: true,
  maxFxLayers: Infinity,
  maxFilterPrimitives: Infinity,
  maxAssetsPerLayer: Infinity,
  turbulenceOctaves: 4,
  description: 'Render-time density (not for live play)',
};

/** Skip second gloss <use> when node count exceeds this under BALANCED/HIGH. */
export const GLOSS_NODE_THRESHOLD = 280;

/**
 * SVG filter regions are clamped to this fraction of the viewport.
 * Unbounded filter regions are a silent frame-rate killer (the browser
 * rasterizes the whole region per filter pass), so this is a clamp, not a
 * tier — it applies at every quality level including final renders.
 */
export const MAX_FILTER_REGION = 1.0;

/** Was a local const in OutputPanel.jsx; needed by every file the OUTPUT
 *  panel split into, so it lives here instead of being recomputed per file. */
export function resolutionLabel(exportResolution) {
  return `1000×700@${exportResolution}x`;
}

export function getQualityCaps(qualityId) {
  return QUALITY_PRESETS[qualityId] || QUALITY_PRESETS.balanced;
}

/** Live quality caps, or FINAL_CAPS when uncapped final render is requested. */
export function getRenderCaps(qualityId, uncapped = false) {
  if (uncapped) return FINAL_CAPS;
  return getQualityCaps(qualityId);
}

/** Whether the live path should draw the gloss overlay pass. */
export function shouldRenderGloss(qualityId, shading, nodeCount) {
  if (shading !== 'gloss') return false;
  const caps = getQualityCaps(qualityId);
  if (caps.allowGloss === false) return false;
  if (nodeCount > GLOSS_NODE_THRESHOLD) return false;
  return true;
}
