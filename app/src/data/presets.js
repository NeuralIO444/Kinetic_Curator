// Each chip is a designer brief. params must make that brief visible on click.
export const PRESET_GROUPS = [
  { id: 'classic', label: 'Classic' },
  { id: 'rendah',  label: 'Rendah Mag' },
  { id: 'ca',      label: 'Cellular Automaton' },
  { id: 'davis',   label: 'Davis-Lineage' },
];

export const COMPOSITION_PRESETS = [
  {
    id: 'praystation',
    name: 'PRAYSTATION',
    group: 'classic',
    desc: 'Davis dense glyph bloom — phi spiral, slow breath, no boids',
    categories: ['organic', 'radial', 'stamps'],
    paletteShift: 'band',
    params: {
      mode: 'fibonacci', count: 240, scale: [0.4, 1.5], rotate: [-55, 55], alpha: [40, 96],
      zTiers: 4, jitter: 12, density: 82, bleed: false, recolor: true, mirror: false, overlap: true,
      lifeDrift: 0.18, noiseSpeed: 0.2, displacement: 8, flap: 0.12, wind: 0.2, behave: 'cruise',
    },
  },
  {
    id: 'dripfield',
    name: 'DRIP FIELD',
    group: 'classic',
    desc: 'Wet flock — swarm with high damping, bleed, lazy cohesion',
    categories: ['linework', 'organic', 'dots'],
    paletteShift: 'split',
    params: {
      mode: 'swarm', count: 220, scale: [0.3, 1.15], rotate: [-40, 40], alpha: [36, 88],
      zTiers: 5, jitter: 20, density: 84, bleed: true, recolor: true, mirror: false, overlap: true,
      particleCount: 180, swarmCohesion: 1.2, damping: 0.97, gravityWells: 0.6,
      lifeDrift: 0.22, displacement: 18, behave: 'drift',
    },
  },
  {
    id: 'eyearchipelago',
    name: 'EYE ARCHIPELAGO',
    group: 'classic',
    desc: 'Mirrored radial islands — almost still, tiny life',
    categories: ['radial', 'organic', 'stamps'],
    paletteShift: 'band',
    params: {
      mode: 'radial', count: 180, scale: [0.45, 1.4], rotate: [-30, 30], alpha: [44, 98],
      zTiers: 4, jitter: 10, density: 74, bleed: false, recolor: true, mirror: true, overlap: true,
      lifeDrift: 0.08, displacement: 4, behave: 'cruise',
    },
  },
  {
    id: 'knotgrid',
    name: 'KNOT GRID',
    group: 'classic',
    desc: 'Locked lattice — grid, tiny rotate, no life',
    categories: ['geometric', 'linework', 'floral'],
    paletteShift: 'zone',
    params: {
      mode: 'grid', count: 200, scale: [0.35, 1.0], rotate: [-18, 18], alpha: [36, 88],
      zTiers: 4, jitter: 8, density: 80, bleed: false, recolor: true, mirror: true, overlap: true,
      lifeDrift: 0.04, displacement: 0, behave: 'cruise',
    },
  },
  {
    id: 'fujimoto-prism',
    name: 'FUJIMOTO PRISM',
    group: 'rendah',
    desc: 'Hard scan lines — dense grid, zone color, almost no breath',
    categories: ['geometric', 'linework', 'crystalline'],
    paletteShift: 'zone',
    params: {
      mode: 'grid', count: 280, scale: [0.28, 1.35], rotate: [-90, 90], alpha: [22, 70],
      zTiers: 5, jitter: 16, density: 92, bleed: true, recolor: true, mirror: false, overlap: true,
      lifeDrift: 0.06, displacement: 6, behave: 'cruise',
    },
  },
  {
    id: 'meinesz-bloom',
    name: 'MEINESZ BLOOM',
    group: 'rendah',
    desc: 'Slow radial growth — not a flock. Soft scale pulse via life.',
    categories: ['organic', 'radial', 'biosynthetic'],
    paletteShift: 'band',
    params: {
      mode: 'radial', count: 200, scale: [0.5, 1.7], rotate: [-35, 35], alpha: [34, 92],
      zTiers: 5, jitter: 10, density: 70, bleed: false, recolor: true, mirror: true, overlap: true,
      lifeDrift: 0.28, noiseSpeed: 0.18, displacement: 10, behave: 'bloom',
    },
  },
  {
    id: 'halftime-glitch',
    name: 'HALFTIME GLITCH',
    group: 'rendah',
    desc: 'Nervous flock — swarm, low damping, split palette',
    categories: ['geometric', 'fragments', 'scanlines'],
    paletteShift: 'split',
    params: {
      mode: 'swarm', count: 260, scale: [0.22, 1.1], rotate: [-70, 70], alpha: [24, 82],
      zTiers: 6, jitter: 28, density: 94, bleed: true, recolor: true, mirror: false, overlap: true,
      particleCount: 240, swarmCohesion: 0.7, damping: 0.90, gravityWells: 1.4,
      lifeDrift: 0.3, displacement: 28, behave: 'jitter',
    },
  },
  {
    id: 'bitshifter-chaos',
    name: 'BITSHIFTER CHAOS',
    group: 'ca',
    desc: 'CA scramble — cellular mode, short rotate, mid life',
    categories: ['geometric', 'crystalline', 'fragments'],
    paletteShift: 'split',
    params: {
      mode: 'ca', count: 160, scale: [0.28, 1.05], rotate: [-80, 80], alpha: [34, 90],
      zTiers: 4, jitter: 10, density: 80, bleed: false, recolor: true, mirror: false, overlap: true,
      lifeDrift: 0.2, displacement: 12, behave: 'jitter',
    },
  },
  {
    id: 'ca-growth',
    name: 'CA GROWTH',
    group: 'ca',
    desc: 'Petri still — CA + mirror, almost no jitter',
    categories: ['organic', 'geometric', 'biosynthetic'],
    paletteShift: 'band',
    params: {
      mode: 'ca', count: 200, scale: [0.4, 1.3], rotate: [-20, 20], alpha: [48, 100],
      zTiers: 4, jitter: 6, density: 68, bleed: false, recolor: true, mirror: true, overlap: true,
      lifeDrift: 0.14, displacement: 4, behave: 'bloom',
    },
  },
  {
    id: 'orbit-influence',
    name: 'ORBIT OF INFLUENCE',
    group: 'davis',
    desc: 'Painters on rails — orbit mode, almost no scatter',
    categories: ['radial', 'organic', 'stamps'],
    paletteShift: 'zone',
    params: {
      mode: 'orbit', count: 360, scale: [0.42, 1.4], rotate: [-100, 100], alpha: [30, 90],
      zTiers: 3, jitter: 3, density: 90, bleed: true, recolor: true, mirror: false, overlap: true,
      lifeDrift: 0.1, displacement: 0, behave: 'cruise',
    },
  },
  {
    id: 'ghost-recoil',
    name: 'GHOST RECOIL ABACUS TOTEM',
    group: 'davis',
    desc: 'Abacus rows — near-zero rotate, stamp geometry',
    categories: ['geometric', 'fragments', 'stamps'],
    paletteShift: 'split',
    params: {
      mode: 'abacus', count: 300, scale: [0.38, 1.1], rotate: [-4, 4], alpha: [38, 95],
      zTiers: 4, jitter: 3, density: 90, bleed: false, recolor: true, mirror: false, overlap: true,
      lifeDrift: 0.06, displacement: 0, behave: 'cruise',
    },
  },
  {
    id: 'conamara-chaos',
    name: 'CONAMARA CHAOS',
    group: 'davis',
    desc: 'Terrain current — flow mode, visible displace, slow life',
    categories: ['organic', 'fragments', 'biosynthetic'],
    paletteShift: 'band',
    params: {
      mode: 'flow', count: 220, scale: [0.48, 1.5], rotate: [-60, 60], alpha: [38, 95],
      zTiers: 5, jitter: 24, density: 78, bleed: true, recolor: true, mirror: false, overlap: true,
      lifeDrift: 0.24, noiseSpeed: 0.35, displacement: 40, behave: 'drift',
    },
  },
  {
    id: 'first-contact-europa',
    name: 'FIRST CONTACT ON EUROPA',
    group: 'davis',
    desc: 'Ice orbit — orbit + crystalline, low jitter, cool life',
    categories: ['organic', 'crystalline', 'radial'],
    paletteShift: 'band',
    params: {
      mode: 'orbit', count: 340, scale: [0.38, 1.35], rotate: [-70, 70], alpha: [32, 92],
      zTiers: 4, jitter: 6, density: 86, bleed: true, recolor: true, mirror: false, overlap: true,
      lifeDrift: 0.16, displacement: 8, behave: 'cruise',
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
