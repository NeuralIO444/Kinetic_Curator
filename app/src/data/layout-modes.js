// Layout mode definitions — single source of truth

export const LAYOUT_MODES = [
  { id: 'random',    name: 'random',     glyph: 'rand'   },
  { id: 'grid',      name: 'grid',       glyph: 'grid'   },
  { id: 'fibonacci', name: 'fibonacci',  glyph: 'phi'    },
  { id: 'radial',    name: 'radial',     glyph: 'rad'    },
  { id: 'swarm',     name: 'swarm boids', glyph: 'swarm'  },
  { id: 'noise',     name: 'noise warp', glyph: 'noise'  },
  { id: 'hype',      name: 'swarm·hype', glyph: 'hype'   },
  { id: 'stratified', name: 'stratified', glyph: 'strat' },
  { id: 'flow',      name: 'flow',       glyph: 'flow'   },
  { id: 'layers',    name: 'layers',     glyph: 'z'      },
  { id: 'rails',     name: 'rails',      glyph: 'rail'   },
  { id: 'ca',        name: 'cellular',   glyph: 'ca'     },
  { id: 'orbit',     name: 'orbit',      glyph: 'orbit'  },
  { id: 'abacus',    name: 'abacus',     glyph: 'abacus' },
];

/** Color strategies from engine/color.js; 'auto' defers to the preset (#54). */
export function isLiveSwarmMode(mode) {
  return mode === 'swarm' || mode === 'hype';
}

export const PALETTE_SHIFTS = ['auto', 'band', 'zone', 'split'];

export const BLEND_MODES = [
  'normal', 'screen', 'multiply', 'overlay', 'difference', 'plus-lighter', 'soft-light',
];

export const DEFAULT_LAYOUT_PARAMS = {
  composition: 'praystation',
  mode: 'fibonacci',
  count: 240,
  scale: [0.4, 1.6],
  rotate: [-180, 180],
  alpha: [40, 100],
  zTiers: 4,
  jitter: 24,
  density: 78,
  bleed: false,
  recolor: true,
  mirror: false,
  overlap: true,
  blendMode: 'normal',
  shading: 'flat',
  hueRotate: 0,
  paletteShift: 'auto',

  // Accumulation / trails (#28) — pixel buffer, not SVG DOM
  accumulation: false,
  accumulationFade: 0.88, // 0–0.99; higher = longer trails

  // Physics & Turbulence
  noiseFreq: 0.005,
  noiseSpeed: 0.5,
  displacement: 0,
  particleCount: 150,
  swarmCohesion: 1.5,
  gravityWells: 1.0,
  damping: 0.95,

  // Synthesizer / audio reactivity
  audioModDepth: 0.65,
  audioScaleMod: 0.45,
  audioAlphaMod: 0.25,
  lifeDrift: 0.35,
};

const RANGE_KEYS = ['scale', 'rotate', 'alpha'];

/**
 * Fill missing layout keys from DEFAULT_LAYOUT_PARAMS.
 * Sparse / legacy project JSON must not leave sliders on `undefined`.
 * Documented keys in `partial` win; unknown extra keys are kept.
 */
export function normalizeLayoutParams(partial) {
  const src = partial && typeof partial === 'object' && !Array.isArray(partial) ? partial : {};
  const next = { ...DEFAULT_LAYOUT_PARAMS, ...src };
  for (const key of RANGE_KEYS) {
    const v = next[key];
    if (!Array.isArray(v) || v.length < 2) {
      next[key] = DEFAULT_LAYOUT_PARAMS[key].slice();
    } else {
      next[key] = [v[0], v[1]];
    }
  }
  return next;
}
