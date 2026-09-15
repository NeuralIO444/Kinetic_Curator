// Layout mode definitions — single source of truth

export const LAYOUT_MODES = [
  { id: 'random',    name: 'random',     glyph: 'rand'   },
  { id: 'grid',      name: 'grid',       glyph: 'grid'   },
  { id: 'fibonacci', name: 'fibonacci',  glyph: 'phi'    },
  { id: 'radial',    name: 'radial',     glyph: 'rad'    },
  { id: 'swarm',     name: 'swarm boids', glyph: 'swarm'  },
  { id: 'noise',     name: 'noise warp', glyph: 'noise'  },
  { id: 'hype',      name: 'swarm·hype', glyph: 'hype'   },
  { id: 'flow',      name: 'flow',       glyph: 'flow'   },
  { id: 'layers',    name: 'layers',     glyph: 'z'      },
  { id: 'rails',     name: 'rails',      glyph: 'rail'   },
  { id: 'ca',        name: 'cellular',   glyph: 'ca'     },
  { id: 'orbit',     name: 'orbit',      glyph: 'orbit'  },
  { id: 'abacus',    name: 'abacus',     glyph: 'abacus' },
];

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

  // Physics & Turbulence
  noiseFreq: 0.005,
  noiseSpeed: 0.5,
  displacement: 0,
  particleCount: 150,
  swarmCohesion: 1.5,
  gravityWells: 1.0,
  damping: 0.95,

  // Synthesizer / audio reactivity
  audioModDepth: 0.65,   // global 0–1 reactivity amount
  audioScaleMod: 0.45,   // how much beat/bands affect scale
  audioAlphaMod: 0.25,   // how much beat affects opacity pulse
  lifeDrift: 0.35,       // continuous LFO depth when running (0 = still)
};
