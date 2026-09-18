// Each chip is a designer brief. params must make that brief visible on click.
export const PRESET_GROUPS = [
  { id: 'showcase', label: 'Showcase' },
  { id: 'classic', label: 'Classic' },
  { id: 'rendah',  label: 'Rendah Mag' },
  { id: 'ca',      label: 'Cellular Automaton' },
  { id: 'davis',   label: 'Ghost-Lineage' },
];

export const COMPOSITION_PRESETS = [
  {
    id: 'praystation', name: 'ORIGIN', group: 'classic',
    desc: 'Dense glyph bloom — phi spiral, slow breath, no boids',
    categories: ['organic', 'radial', 'stamps'], paletteShift: 'band',
    params: {
      mode: 'fibonacci', count: 240, scale: [0.4, 1.5], rotate: [-55, 55], alpha: [40, 96],
      zTiers: 4, jitter: 12, density: 82, bleed: false, recolor: true, mirror: false, overlap: true,
      lifeDrift: 0.18, noiseSpeed: 0.2, displacement: 8, flap: 0.12, wind: 0.2, behave: 'cruise',
    },
  },
  {
    id: 'dripfield', name: 'DRIP FIELD', group: 'classic',
    desc: 'Wet flock — swarm, high damping, bleed',
    categories: ['linework', 'organic', 'dots'], paletteShift: 'split',
    params: {
      mode: 'swarm', count: 220, scale: [0.3, 1.15], rotate: [-40, 40], alpha: [36, 88],
      zTiers: 5, jitter: 20, density: 84, bleed: true, recolor: true, mirror: false, overlap: true,
      particleCount: 180, swarmCohesion: 1.2, damping: 0.97, gravityWells: 0.6,
      lifeDrift: 0.22, displacement: 18, behave: 'flock',
    },
  },
  {
    id: 'eyearchipelago', name: 'EYE ARCHIPELAGO', group: 'classic',
    desc: 'Mirrored radial islands — almost still',
    categories: ['radial', 'organic', 'stamps'], paletteShift: 'band',
    params: {
      mode: 'radial', count: 180, scale: [0.45, 1.4], rotate: [-30, 30], alpha: [44, 98],
      zTiers: 4, jitter: 10, density: 74, bleed: false, recolor: true, mirror: true, overlap: true,
      lifeDrift: 0.08, displacement: 4, behave: 'cruise',
    },
  },
  {
    id: 'knotgrid', name: 'KNOT GRID', group: 'classic',
    desc: 'Locked lattice — grid, tiny rotate',
    categories: ['geometric', 'linework', 'floral'], paletteShift: 'zone',
    params: {
      mode: 'grid', count: 200, scale: [0.35, 1.0], rotate: [-18, 18], alpha: [36, 88],
      zTiers: 4, jitter: 8, density: 80, bleed: false, recolor: true, mirror: true, overlap: true,
      lifeDrift: 0.04, displacement: 0, behave: 'cruise',
    },
  },
  {
    id: 'fujimoto-prism', name: 'FUJIMOTO PRISM', group: 'rendah',
    desc: 'Hard scan — dense grid, zone color',
    categories: ['geometric', 'linework', 'crystalline'], paletteShift: 'zone',
    params: {
      mode: 'grid', count: 280, scale: [0.28, 1.35], rotate: [-90, 90], alpha: [22, 70],
      zTiers: 5, jitter: 16, density: 92, bleed: true, recolor: true, mirror: true, overlap: true,
      lifeDrift: 0.06, displacement: 6, behave: 'cruise',
    },
  },
  {
    id: 'meinesz-bloom', name: 'MEINESZ BLOOM', group: 'rendah',
    desc: 'Slow radial growth — not a flock',
    categories: ['organic', 'radial', 'biosynthetic'], paletteShift: 'band',
    params: {
      mode: 'radial', count: 200, scale: [0.5, 1.7], rotate: [-35, 35], alpha: [34, 92],
      zTiers: 5, jitter: 10, density: 70, bleed: false, recolor: true, mirror: true, overlap: true,
      lifeDrift: 0.28, noiseSpeed: 0.18, displacement: 10, behave: 'cruise',
    },
  },
  {
    id: 'halftime-glitch', name: 'HALFTIME GLITCH', group: 'rendah',
    desc: 'Nervous flock — swarm, low damping',
    categories: ['geometric', 'fragments', 'scanlines'], paletteShift: 'split',
    params: {
      mode: 'swarm', count: 260, scale: [0.22, 1.1], rotate: [-70, 70], alpha: [24, 82],
      zTiers: 6, jitter: 28, density: 94, bleed: true, recolor: true, mirror: false, overlap: true,
      particleCount: 240, swarmCohesion: 0.7, damping: 0.90, gravityWells: 1.4,
      lifeDrift: 0.3, displacement: 28, behave: 'scatter',
    },
  },
  {
    id: 'bitshifter-chaos', name: 'BITSHIFTER CHAOS', group: 'ca',
    desc: 'CA scramble',
    categories: ['geometric', 'crystalline', 'fragments'], paletteShift: 'split',
    params: {
      mode: 'ca', count: 160, scale: [0.28, 1.05], rotate: [-80, 80], alpha: [34, 90],
      zTiers: 4, jitter: 10, density: 80, bleed: false, recolor: true, mirror: false, overlap: true,
      lifeDrift: 0.2, displacement: 12, behave: 'scatter',
    },
  },
  {
    id: 'ca-growth', name: 'CA GROWTH', group: 'ca',
    desc: 'Petri still — CA + mirror',
    categories: ['organic', 'geometric', 'biosynthetic'], paletteShift: 'band',
    params: {
      mode: 'ca', count: 200, scale: [0.4, 1.3], rotate: [-20, 20], alpha: [48, 100],
      zTiers: 4, jitter: 6, density: 68, bleed: false, recolor: true, mirror: true, overlap: true,
      lifeDrift: 0.14, displacement: 4, behave: 'cruise',
    },
  },
  {
    id: 'orbit-influence', name: 'ORBIT OF INFLUENCE', group: 'davis',
    desc: 'Painters on rails — orbit mode',
    categories: ['radial', 'organic', 'stamps'], paletteShift: 'zone',
    params: {
      mode: 'orbit', count: 360, scale: [0.42, 1.4], rotate: [-100, 100], alpha: [30, 90],
      zTiers: 3, jitter: 3, density: 90, bleed: true, recolor: true, mirror: false, overlap: true,
      lifeDrift: 0.1, displacement: 0, behave: 'orbit',
    },
  },
  {
    id: 'ghost-recoil', name: 'GHOST RECOIL ABACUS TOTEM', group: 'davis',
    desc: 'Abacus rows — near-zero rotate',
    categories: ['geometric', 'fragments', 'stamps'], paletteShift: 'split',
    params: {
      mode: 'abacus', count: 300, scale: [0.38, 1.1], rotate: [-4, 4], alpha: [38, 95],
      zTiers: 4, jitter: 3, density: 90, bleed: false, recolor: true, mirror: false, overlap: true,
      lifeDrift: 0.06, displacement: 0, behave: 'cruise',
    },
  },
  {
    id: 'conamara-chaos', name: 'CONAMARA CHAOS', group: 'davis',
    desc: 'Terrain current — flow + displace',
    categories: ['organic', 'fragments', 'biosynthetic'], paletteShift: 'band',
    params: {
      mode: 'flow', count: 220, scale: [0.48, 1.5], rotate: [-60, 60], alpha: [38, 95],
      zTiers: 5, jitter: 24, density: 78, bleed: true, recolor: true, mirror: false, overlap: true,
      lifeDrift: 0.24, noiseSpeed: 0.35, displacement: 40, behave: 'scatter',
    },
  },
  {
    id: 'first-contact-europa', name: 'FIRST CONTACT ON EUROPA', group: 'davis',
    desc: 'Ice orbit',
    categories: ['organic', 'crystalline', 'radial'], paletteShift: 'band',
    params: {
      mode: 'orbit', count: 340, scale: [0.38, 1.35], rotate: [-70, 70], alpha: [32, 92],
      zTiers: 4, jitter: 6, density: 86, bleed: true, recolor: true, mirror: false, overlap: true,
      lifeDrift: 0.16, displacement: 8, behave: 'orbit',
    },
  },
  {
    id: 'kiln-columns', name: 'KILN COLUMNS', group: 'classic',
    desc: 'Stacked organic melt — vertical rails, per-segment color drift, dusty matte palette. Finish: set the layer blend to soft-light.',
    categories: ['organic'], paletteShift: 'zone',
    params: {
      mode: 'rails', count: 520, scale: [0.8, 2.0], rotate: [-14, 14], alpha: [45, 85],
      zTiers: 4, jitter: 26, density: 110, bleed: false, recolor: true, mirror: false, overlap: true,
      blendMode: 'soft-light',
      lifeDrift: 0.04, displacement: 0, behave: 'cruise',
    },
  },
  {
    id: 'vortex-rwb', name: 'VORTEX RWB', group: 'classic',
    desc: 'Ribbon-vortex study — marbled RWB bands warped by Perlin displacement, mirrored. Still image; see docs/VORTEX_RWB.md.',
    categories: ['organic'], paletteShift: 'band',
    params: {
      mode: 'fibonacci', count: 640, scale: [1.3, 2.2], rotate: [0, 0], alpha: [80, 100],
      zTiers: 3, jitter: 18, density: 100, bleed: true, recolor: true, mirror: true, overlap: true,
      blendMode: 'normal',
      lifeDrift: 0.04, displacement: 130, noiseFreq: 0.006, behave: 'cruise',
    },
  },
  // --- #220 showcase library: 10 opinionated engine-mode presets.
  // Each pairs with the same-id catalog palette (see data/palettes.js) and a
  // render-proof project JSON under docs/presets/. One preset per engine
  // mode, pulled from existing systems — no invented modes.
  {
    id: 'murmuration', name: 'MURMURATION', group: 'showcase',
    desc: 'Dusk flock — cohesive swarm boids, tight damping, split ink on deep indigo',
    categories: ['organic', 'dots'], paletteShift: 'split',
    params: {
      mode: 'swarm', count: 300, scale: [0.3, 0.9], rotate: [-30, 30], alpha: [50, 100],
      zTiers: 5, jitter: 16, density: 88, bleed: true, recolor: true, mirror: false, overlap: true,
      particleCount: 280, swarmCohesion: 1.5, damping: 0.96, gravityWells: 0.4,
      lifeDrift: 0.12, displacement: 10, behave: 'flock',
    },
  },
  {
    id: 'neon-brood', name: 'NEON BROOD', group: 'showcase',
    desc: 'Blacklight organism — moth·hype at full scatter, zone-colored neon on black',
    categories: ['organic', 'biosynthetic', 'dots'], paletteShift: 'zone',
    params: {
      mode: 'hype', count: 240, scale: [0.5, 1.4], rotate: [-70, 70], alpha: [40, 100],
      zTiers: 4, jitter: 14, density: 85, bleed: true, recolor: true, mirror: false, overlap: true,
      lifeDrift: 0.2, displacement: 20, behave: 'scatter',
    },
  },
  {
    id: 'petri-bloom', name: 'PETRI BLOOM', group: 'showcase',
    desc: 'Agar colonies — mirrored CA, band coloring on a pale ground',
    categories: ['organic', 'dots'], paletteShift: 'band',
    params: {
      mode: 'ca', count: 400, scale: [0.25, 0.7], rotate: [-20, 20], alpha: [60, 100],
      zTiers: 3, jitter: 6, density: 92, bleed: false, recolor: true, mirror: true, overlap: true,
      lifeDrift: 0.1, displacement: 4, behave: 'cruise',
    },
  },
  {
    id: 'river-delta', name: 'RIVER DELTA', group: 'showcase',
    desc: 'Sediment flow — banded flow-field drift, soft blobs marbling over linework',
    categories: ['linework', 'organic'], paletteShift: 'band',
    params: {
      mode: 'flow', count: 420, scale: [0.4, 1.2], rotate: [-45, 45], alpha: [36, 92],
      zTiers: 4, jitter: 12, density: 90, bleed: true, recolor: true, mirror: false, overlap: true,
      lifeDrift: 0.1, noiseSpeed: 0.25, displacement: 30, behave: 'cruise',
    },
  },
  {
    id: 'static-bloom', name: 'STATIC BLOOM', group: 'showcase',
    desc: 'Phosphor interference — noise-warped dots, hard split with red/green hits',
    categories: ['dots'], paletteShift: 'split',
    params: {
      mode: 'noise', count: 500, scale: [0.2, 0.8], rotate: [-90, 90], alpha: [28, 80],
      zTiers: 5, jitter: 20, density: 95, bleed: true, recolor: true, mirror: false, overlap: true,
      lifeDrift: 0.08, displacement: 120, noiseFreq: 0.01, behave: 'scatter',
    },
  },
  {
    id: 'strata', name: 'STRATA', group: 'showcase',
    desc: 'Geological cut — mirrored layers mode, zone coloring, ochre over shale',
    categories: ['geometric', 'linework'], paletteShift: 'zone',
    params: {
      mode: 'layers', count: 320, scale: [0.6, 1.8], rotate: [-10, 10], alpha: [50, 95],
      zTiers: 6, jitter: 8, density: 96, bleed: false, recolor: true, mirror: true, overlap: true,
      lifeDrift: 0.05, displacement: 0, behave: 'cruise',
    },
  },
  {
    id: 'transit', name: 'TRANSIT', group: 'showcase',
    desc: 'Metro diagram — rails with full rotation, five-line zone coloring on paper',
    categories: ['linework', 'geometric'], paletteShift: 'zone',
    params: {
      mode: 'rails', count: 260, scale: [0.3, 1.0], rotate: [-90, 90], alpha: [50, 100],
      zTiers: 4, jitter: 10, density: 88, bleed: true, recolor: true, mirror: false, overlap: true,
      lifeDrift: 0.06, displacement: 6, behave: 'cruise',
    },
  },
  {
    id: 'solar-max', name: 'SOLAR MAX', group: 'showcase',
    desc: 'Coronal storm — mirrored radial bloom, band coloring from corona white to ember',
    categories: ['radial', 'organic'], paletteShift: 'band',
    params: {
      mode: 'radial', count: 360, scale: [0.5, 1.6], rotate: [-35, 35], alpha: [44, 98],
      zTiers: 4, jitter: 10, density: 86, bleed: true, recolor: true, mirror: true, overlap: true,
      lifeDrift: 0.22, displacement: 14, behave: 'cruise',
    },
  },
  {
    id: 'perihelion', name: 'PERIHELION', group: 'showcase',
    desc: 'Deep orbit burn — orbit rails on near-black, one ember accent against cold greys',
    categories: ['radial', 'dots'], paletteShift: 'split',
    params: {
      mode: 'orbit', count: 300, scale: [0.3, 1.1], rotate: [-100, 100], alpha: [34, 90],
      zTiers: 3, jitter: 4, density: 90, bleed: true, recolor: true, mirror: false, overlap: true,
      lifeDrift: 0.1, displacement: 0, behave: 'orbit',
    },
  },
  {
    id: 'tidepool', name: 'TIDEPOOL', group: 'showcase',
    desc: 'Intertidal zones — mirrored stratified drift, banded algae/sand/anemone on pale ground',
    categories: ['organic', 'floral', 'dots'], paletteShift: 'band',
    params: {
      mode: 'stratified', count: 380, scale: [0.3, 1.0], rotate: [-25, 25], alpha: [48, 98],
      zTiers: 5, jitter: 8, density: 90, bleed: false, recolor: true, mirror: true, overlap: true,
      lifeDrift: 0.14, displacement: 6, behave: 'cruise',
    },
  },
];

export function getPreset(id) {
  return COMPOSITION_PRESETS.find(p => p.id === id) || COMPOSITION_PRESETS[0];
}

export function getPresetsByGroup() {
  return PRESET_GROUPS.map(g => ({
    ...g,
    presets: COMPOSITION_PRESETS.filter(p => p.group === g.id),
  }));
}
