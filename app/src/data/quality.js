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

export function getQualityCaps(qualityId) {
  return QUALITY_PRESETS[qualityId] || QUALITY_PRESETS.balanced;
}
