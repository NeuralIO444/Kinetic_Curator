// Quality presets — soft ceilings for interactive performance

export const QUALITY_PRESETS = {
  high: {
    id: 'high',
    label: 'HIGH',
    maxCount: 800,
    maxCountMirrored: 650,
    maxParticles: 350,
    allowMirror: true,
    description: 'Full fidelity — best hardware',
  },
  balanced: {
    id: 'balanced',
    label: 'BALANCED',
    maxCount: 420,
    maxCountMirrored: 360,
    maxParticles: 200,
    allowMirror: true,
    description: 'Good density, stable frame rate',
  },
  performance: {
    id: 'performance',
    label: 'PERF',
    maxCount: 180,
    maxCountMirrored: 140,
    maxParticles: 100,
    allowMirror: false,
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
  description: 'Render-time density (not for live play)',
};

export function getQualityCaps(qualityId) {
  return QUALITY_PRESETS[qualityId] || QUALITY_PRESETS.balanced;
}

/** Live quality caps, or FINAL_CAPS when uncapped final render is requested. */
export function getRenderCaps(qualityId, uncapped = false) {
  if (uncapped) return FINAL_CAPS;
  return getQualityCaps(qualityId);
}
