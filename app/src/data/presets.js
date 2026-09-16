// Composition presets — SINGLE SOURCE OF TRUTH
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
    desc: 'dense bloom of glyphs and color bursts',
    categories: ['organic', 'radial', 'stamps'],
    paletteShift: 'band',
    params: {
      mode: 'fibonacci', count: 240, scale: [0.4, 1.5], rotate: [-70, 70], alpha: [36, 96],
      zTiers: 4, jitter: 16, density: 82, bleed: false, recolor: true, mirror: false, overlap: true,
    },
  },
  {
    id: 'dripfield',
    name: 'DRIP FIELD',
    group: 'classic',
    desc: 'linework + drops with a wild spread',
    categories: ['linework', 'organic', 'dots'],
    paletteShift: 'split',
    params: {
      mode: 'swarm', count: 260, scale: [0.32, 1.2], rotate: [-80, 80], alpha: [36, 88],
      zTiers: 5, jitter: 28, density: 88, bleed: true, recolor: true, mirror: false, overlap: true,
    },
  },
  {
    id: 'eyearchipelago',
    name: 'EYE ARCHIPELAGO',
    group: 'classic',
    desc: 'radial anchors with clustered organic glyphs',
    categories: ['radial', 'organic', 'stamps'],
    paletteShift: 'band',
    params: {
      mode: 'radial', count: 180, scale: [0.45, 1.45], rotate: [-50, 50], alpha: [42, 98],
      zTiers: 4, jitter: 14, density: 76, bleed: false, recolor: true, mirror: true, overlap: true,
    },
  },
  {
    id: 'knotgrid',
    name: 'KNOT GRID',
    group: 'classic',
    desc: 'tight grid clusters with offset traps',
    categories: ['geometric', 'linework', 'floral'],
    paletteShift: 'zone',
    params: {
      mode: 'grid', count: 200, scale: [0.35, 1.05], rotate: [-60, 60], alpha: [32, 88],
      zTiers: 4, jitter: 18, density: 80, bleed: false, recolor: true, mirror: true, overlap: true,
    },
  },
  {
    id: 'fujimoto-prism',
    name: 'FUJIMOTO PRISM',
    group: 'rendah',
    desc: 'kinetic laser scan — sharp geometry in rapid color zones (Shohei Fujimoto)',
    categories: ['geometric', 'linework', 'crystalline'],
    paletteShift: 'zone',
    params: {
      mode: 'grid', count: 280, scale: [0.28, 1.4], rotate: [-90, 90], alpha: [22, 72],
      zTiers: 5, jitter: 22, density: 92, bleed: true, recolor: true, mirror: false, overlap: true,
    },
  },
  {
    id: 'meinesz-bloom',
    name: 'MEINESZ BLOOM',
    group: 'rendah',
    desc: 'bio-synthetic growth — organic radials in flowing color (Lisa Meinesz)',
    categories: ['organic', 'radial', 'biosynthetic'],
    paletteShift: 'band',
    params: {
      mode: 'radial', count: 200, scale: [0.45, 1.6], rotate: [-55, 55], alpha: [32, 92],
      zTiers: 5, jitter: 14, density: 72, bleed: false, recolor: true, mirror: true, overlap: true,
    },
  },
  {
    id: 'halftime-glitch',
    name: 'HALFTIME GLITCH',
    group: 'rendah',
    desc: 'fragmented bass aesthetic — crystalline + scanlines in split tones (Rendah Mag)',
    categories: ['geometric', 'fragments', 'scanlines'],
    paletteShift: 'split',
    params: {
      mode: 'swarm', count: 300, scale: [0.22, 1.15], rotate: [-90, 90], alpha: [24, 85],
      zTiers: 6, jitter: 32, density: 96, bleed: true, recolor: true, mirror: false, overlap: true,
    },
  },
  {
    id: 'bitshifter-chaos',
    name: 'BITSHIFTER CHAOS',
    group: 'ca',
    desc: 'cellular automaton + bitwise mutations — chaotic evolution (motion-driven)',
    categories: ['geometric', 'crystalline', 'fragments'],
    paletteShift: 'split',
    params: {
      mode: 'ca', count: 160, scale: [0.28, 1.05], rotate: [-90, 90], alpha: [34, 90],
      zTiers: 4, jitter: 12, density: 80, bleed: false, recolor: true, mirror: false, overlap: true,
    },
  },
  {
    id: 'ca-growth',
    name: 'CA GROWTH',
    group: 'ca',
    desc: 'life-like cellular automaton — emergent organic patterns from digital rules',
    categories: ['organic', 'geometric', 'biosynthetic'],
    paletteShift: 'band',
    params: {
      mode: 'ca', count: 200, scale: [0.38, 1.35], rotate: [-40, 40], alpha: [44, 100],
      zTiers: 4, jitter: 8, density: 70, bleed: false, recolor: true, mirror: true, overlap: true,
    },
  },
  {
    id: 'orbit-influence',
    name: 'ORBIT OF INFLUENCE',
    group: 'davis',
    desc: '3 invisible planets, 50 painters orbit at varied speeds and brush sizes (Joshua Davis · fxhash · ZeroSpace 2023)',
    categories: ['radial', 'organic', 'stamps'],
    paletteShift: 'zone',
    params: {
      mode: 'orbit', count: 420, scale: [0.42, 1.45], rotate: [-120, 120], alpha: [28, 90],
      zTiers: 3, jitter: 4, density: 92, bleed: true, recolor: true, mirror: false, overlap: true,
    },
  },
  {
    id: 'ghost-recoil',
    name: 'GHOST RECOIL ABACUS TOTEM',
    group: 'davis',
    desc: 'Chuck Anderson × Joshua Davis · Infinite Pressure #80 — abacus rows with ghost-recoil duplicates',
    categories: ['geometric', 'fragments', 'stamps'],
    paletteShift: 'split',
    params: {
      mode: 'abacus', count: 320, scale: [0.38, 1.15], rotate: [-6, 6], alpha: [36, 95],
      zTiers: 4, jitter: 4, density: 92, bleed: false, recolor: true, mirror: false, overlap: true,
    },
  },
  {
    id: 'conamara-chaos',
    name: 'CONAMARA CHAOS',
    group: 'davis',
    desc: 'Joshua Davis · post-terrestrial moving landscape · macro-analog textures (Jana Stýblová)',
    categories: ['organic', 'fragments', 'biosynthetic'],
    paletteShift: 'band',
    params: {
      mode: 'flow', count: 220, scale: [0.48, 1.5], rotate: [-80, 80], alpha: [38, 95],
      zTiers: 5, jitter: 32, density: 80, bleed: true, recolor: true, mirror: false, overlap: true,
    },
  },
  {
    id: 'first-contact-europa',
    name: 'FIRST CONTACT ON EUROPA',
    group: 'davis',
    desc: 'Joshua Davis · Europa-scale exploration with macro-analog textures + KØWCH audio',
    categories: ['organic', 'crystalline', 'radial'],
    paletteShift: 'band',
    params: {
      mode: 'orbit', count: 380, scale: [0.38, 1.4], rotate: [-90, 90], alpha: [32, 92],
      zTiers: 4, jitter: 8, density: 88, bleed: true, recolor: true, mirror: false, overlap: true,
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
