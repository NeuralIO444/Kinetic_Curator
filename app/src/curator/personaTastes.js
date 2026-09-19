// personaTastes.js — taste profiles distilled from the mode-persona files.
//
// SOURCE OF TRUTH: ~/workspace/your_files/personas/<slug>.md (NOT in this
// repo — they live in the user's files). This registry is a compiled,
// hand-distilled mapping from each persona's Loves/Avoids onto the 15
// measurable features in taste.js. It is an interpretation, not a
// measurement: weights were set by reading each persona file and mapping
// only what is actually computable from candidate params. Anything the
// file says about palette, brushwork, or photorealism has no measurable
// counterpart in the randomized params and is deliberately left out —
// never faked.
//
// If a persona .md changes, re-distill by hand and update the rationale.
// A future MLX ranker replaces this whole file; the engine contract in
// curate.js is unchanged by that swap.
//
// DISPLAY POLICY (Matt's IP caution): the product surface NEVER shows real
// artist names. `name` is the honest lineage kept in code only; `alias` is
// the TE-style evocative label the UI shows (voice selector, "persona pick:
// <alias>" hint). After <artist> attribution stays here in code and in the
// persona source files — lineage documented, just not on the surface.

export const TASTE_FEATURES = [
  'markDensity',    // count — how many marks
  'markSize',       // mean(scale) — how big the marks are
  'sizeVariety',    // scale range — size diversity across marks
  'rotationSpread', // rotate range — angular diversity
  'opacity',        // mean(alpha)
  'opacityVariety', // alpha range
  'disorder',       // jitter + displacement — chaotic placement
  'coverage',       // density — how much of the field is filled
  'depth',          // zTiers — layering
  'flowEnergy',     // noiseSpeed — motion speed
  'flowWarp',       // noiseFreq — spatial warping of the field
  'swarmDrive',     // swarmCohesion — flocking tightness
  'attractors',     // gravityWells — structured pull points
  'particles',      // particleCount — fine particulate detail
  'calm',           // damping — how fast motion settles
];

// weights: +loves / −avoids. Sparse on purpose — only set where the
// persona file actually says something measurable.
export const PERSONA_TASTES = [
  {
    id: 'davis',
    name: 'Joshua Davis',
    alias: 'OVERLAP',
    rationale:
      'Loves maximum density with legible modules and weighted-probability richness; avoids pure noise with no authored structure.',
    weights: {
      markDensity: 1.0, coverage: 0.5, markSize: 0.5, sizeVariety: 0.6,
      rotationSpread: 0.4, disorder: -0.8, depth: 0.5, flowEnergy: 0.4,
      particles: 0.4,
    },
  },
  {
    id: 'molnar',
    name: 'Vera Molnár',
    alias: 'NEAR GRID',
    rationale:
      'Organized structure with ~1% disorder: vast seas of tiny marks, near-zero chaos, pared-down vocabulary.',
    weights: {
      markDensity: 0.6, markSize: -0.8, disorder: -1.0, calm: 0.6,
      sizeVariety: -0.4, opacityVariety: -0.4,
    },
  },
  {
    id: 'mohr',
    name: 'Manfred Mohr',
    alias: 'MONO AXIS',
    rationale:
      'Rational exhaustive variation on one motif; disturbance of symmetry for tension but never chaos; slow structural motion.',
    weights: {
      disorder: -0.7, rotationSpread: 0.3, depth: 0.3, flowEnergy: -0.3,
      calm: 0.4, markSize: -0.3,
    },
  },
  {
    id: 'benjamin',
    name: 'Karl Benjamin',
    alias: 'HARD EDGE',
    rationale:
      'Tight ordered structure as the setting for invention; flat, calm, full fields; no gestural chaos.',
    weights: {
      disorder: -0.8, calm: 0.4, coverage: 0.4, markDensity: 0.3,
      opacityVariety: -0.5,
    },
  },
  {
    id: 'reas',
    name: 'Casey Reas',
    alias: 'PROCESS FIELD',
    rationale:
      'Simple elements + behaviors in continuous motion; full-surface field, no focal center, no finished state.',
    weights: {
      flowEnergy: 0.8, coverage: 0.6, markDensity: 0.5, markSize: -0.4,
      swarmDrive: 0.6, attractors: 0.4, calm: -0.5, opacityVariety: -0.3,
    },
  },
  {
    id: 'haeckel',
    name: 'Ernst Haeckel',
    alias: 'SPECIMEN',
    rationale:
      'Perfect symmetry as organizing law; dense fine detail on a stripped void ground; only slow ornamental breathing.',
    weights: {
      disorder: -1.0, markDensity: 0.7, particles: 0.5, coverage: -0.6,
      sizeVariety: 0.4, flowEnergy: -0.6, calm: 0.6,
    },
  },
  {
    id: 'oxman',
    name: 'Neri Oxman',
    alias: 'GROWN',
    rationale:
      'Grown gradients varying by field logic; environmental responsiveness; never static, never assembled.',
    weights: {
      opacityVariety: 0.5, sizeVariety: 0.5, coverage: 0.5, flowEnergy: 0.5,
      flowWarp: 0.4, calm: -0.4, markDensity: 0.4,
    },
  },
  {
    id: 'stock',
    name: 'Mark Stock',
    alias: 'VORTEX',
    rationale:
      'One dominant flow event in deep negative space; real turbulence frozen at peak; fine filamentary detail.',
    weights: {
      markDensity: -0.5, particles: 0.6, flowEnergy: 0.6, flowWarp: 0.7,
      attractors: -0.5, coverage: -0.6, calm: -0.3,
    },
  },
  {
    id: 'anadol',
    name: 'Refik Anadol',
    alias: 'LATENT DRIFT',
    rationale:
      'Everything in ceaseless flow; full-bleed with no center; never still, never a frozen frame.',
    weights: {
      flowEnergy: 1.0, flowWarp: 0.8, coverage: 0.8, markDensity: 0.5,
      disorder: -0.4, calm: -0.8, particles: 0.5,
    },
  },
  {
    id: 'menkman',
    name: 'Rosa Menkman',
    alias: 'COMPRESSION',
    rationale:
      'Rupture as material: the accident legible, feedback in the loop, seamless polish is the enemy.',
    weights: {
      disorder: 0.8, calm: -0.6, flowEnergy: 0.5, markDensity: 0.4,
      rotationSpread: 0.4,
    },
  },
];

export function getPersonaTaste(id) {
  return PERSONA_TASTES.find((p) => p.id === id) ?? null;
}

export function personaTasteIds() {
  return PERSONA_TASTES.map((p) => p.id);
}
