// Quality presets — soft ceilings for interactive performance.
// Showrunner budgets (§7): each tier now carries per-subsystem ceilings so
// the governor can shed the right thing instead of only stepping density.
// New keys: maxFxLayers, maxFilterPrimitives, maxAssetsPerLayer,
// turbulenceOctaves. FINAL_CAPS stays the ungoverned "cinematic" tier.

export const QUALITY_PRESETS = {
  high: {
    id: 'high',
    label: 'HIGH',
    maxCount: 800,
    maxCountMirrored: 650,
    maxParticles: 350,
    allowMirror: true,
    allowGloss: true,
    maxFxLayers: 3,
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
    maxFxLayers: 2,
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
    maxFxLayers: 1,
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
