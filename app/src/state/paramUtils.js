// Shared parameter randomization + morph key lists
import { PALETTES } from '../data/palettes.js';

export const RANDOMIZABLE_KEYS = [
  'count', 'scale', 'rotate', 'alpha', 'jitter', 'density', 'zTiers',
  'noiseFreq', 'noiseSpeed', 'displacement', 'particleCount',
  'swarmCohesion', 'gravityWells', 'damping',
];

export const MORPHABLE_KEYS = [...RANDOMIZABLE_KEYS];

const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const randInt = (lo, hi) => Math.floor(rand(lo, hi + 1));

export function randomizeKey(key) {
  switch (key) {
    case 'count':         return randInt(30, 600);
    case 'scale':         return [+(rand(0.1, 1.0).toFixed(2)), +(rand(1.0, 3.0).toFixed(2))];
    case 'rotate':        return [randInt(-180, 0), randInt(0, 180)];
    case 'alpha':         return [randInt(15, 60), randInt(70, 100)];
    case 'jitter':        return randInt(0, 150);
    case 'density':       return randInt(20, 120);
    case 'zTiers':        return randInt(1, 10);
    case 'noiseFreq':     return +(rand(0.002, 0.015).toFixed(4));
    case 'noiseSpeed':    return +(rand(0.1, 2.0).toFixed(2));
    case 'displacement':  return randInt(0, 150);
    case 'particleCount': return randInt(50, 300);
    case 'swarmCohesion': return +(rand(0.2, 4.0).toFixed(2));
    case 'gravityWells':  return +(rand(0.1, 3.0).toFixed(2));
    case 'damping':       return +(rand(0.90, 0.98).toFixed(2));
    default:              return undefined;
  }
}

/** Build a random layout-param target object for Evolve (respects locks). */
export function generateLayoutTargets(state) {
  const newLayout = {};
  const params = {
    count: { min: 10, max: 500, type: 'int', isRange: false },
    scale: { min: 0.1, max: 3.0, type: 'float', isRange: true },
    rotate: { min: -180, max: 180, type: 'float', isRange: true },
    alpha: { min: 10, max: 100, type: 'int', isRange: true },
    jitter: { min: 0, max: 150, type: 'int', isRange: false },
    density: { min: 10, max: 100, type: 'int', isRange: false },
    zTiers: { min: 1, max: 10, type: 'int', isRange: false },
    noiseFreq: { min: 0.002, max: 0.02, type: 'float', isRange: false },
    noiseSpeed: { min: 0.1, max: 2.0, type: 'float', isRange: false },
    displacement: { min: 0, max: 120, type: 'int', isRange: false },
    particleCount: { min: 30, max: 300, type: 'int', isRange: false },
    swarmCohesion: { min: 0.5, max: 3.5, type: 'float', isRange: false },
    gravityWells: { min: 0.1, max: 3.5, type: 'float', isRange: false },
    damping: { min: 0.90, max: 0.98, type: 'float', isRange: false },
  };

  Object.entries(params).forEach(([key, conf]) => {
    if (state.lockedParams[key]) return;
    if (conf.isRange) {
      const mid = (conf.max + conf.min) / 2;
      const low = Math.random() * (mid - conf.min) + conf.min;
      const high = Math.random() * (conf.max - mid) + mid;
      newLayout[key] = conf.type === 'int'
        ? [Math.floor(low), Math.floor(high)]
        : [Number(low.toFixed(2)), Number(high.toFixed(2))];
    } else {
      const v = Math.random() * (conf.max - conf.min) + conf.min;
      newLayout[key] = conf.type === 'int' ? Math.floor(v) : Number(v.toFixed(2));
    }
  });
  return newLayout;
}

// Derived from the palette catalog so new palettes join Evolve's cycle
// without a second edit site.
export const PALETTE_IDS = PALETTES.map((p) => p.id);
