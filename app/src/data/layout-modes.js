// Layout mode definitions — single source of truth

export const LAYOUT_MODES = [
  { id: 'random',    name: 'random',     glyph: 'rand'   },
  { id: 'grid',      name: 'grid',       glyph: 'grid'   },
  { id: 'fibonacci', name: 'fibonacci',  glyph: 'phi'    },
  { id: 'radial',    name: 'radial',     glyph: 'rad'    },
  { id: 'swarm',     name: 'swarm boids', glyph: 'swarm'  },
  { id: 'noise',     name: 'noise warp', glyph: 'noise'  },
  { id: 'hype',      name: 'moth·hype', glyph: 'hype'   },
  { id: 'stratified', name: 'stratified', glyph: 'strat' },
  { id: 'flow',      name: 'flow',       glyph: 'flow'   },
  { id: 'layers',    name: 'layers',     glyph: 'z'      },
  { id: 'rails',     name: 'rails',      glyph: 'rail'   },
  { id: 'ca',        name: 'cellular',   glyph: 'ca'     },
  { id: 'orbit',     name: 'orbit',      glyph: 'orbit'  },
  { id: 'abacus',    name: 'abacus',     glyph: 'abacus' },
];

export function isLiveSwarmMode(mode) {
  return mode === 'swarm' || mode === 'hype';
}

/** hype is the organism swarm (#109). swarm stays a particle cloud. */
export function isOrganismMode(mode) {
  return mode === 'hype';
}

export const SYMMETRY_MODES = ['none', 'bilateral', 'stamp'];

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

  accumulation: false,
  accumulationFade: 0.88,

  noiseFreq: 0.005,
  noiseSpeed: 0.5,
  displacement: 0,
  particleCount: 150,
  swarmCohesion: 1.5,
  gravityWells: 1.0,
  damping: 0.95,

  // Organism / moth (#109) — sleeper knobs. Species radii stay dyn.
  body: 3,
  flap: 0.35,
  tight: 0.55,
  wind: 1,
  symmetry: 'none',

  audioModDepth: 0.65,
  audioScaleMod: 0.45,
  audioAlphaMod: 0.25,
  lifeDrift: 0.35,
};

const RANGE_KEYS = ['scale', 'rotate', 'alpha'];

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
  if (!SYMMETRY_MODES.includes(next.symmetry)) next.symmetry = 'none';
  next.body = Math.max(1, Math.min(7, Math.round(Number(next.body) || 1)));
  return next;
}
