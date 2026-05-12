// Composition presets — SINGLE SOURCE OF TRUTH
// Fixes B3: previously duplicated in ui-canvas.jsx and ui-controls.jsx
//
// Each preset defines:
//   - id, name, desc: identification
//   - group: for UI grouping (classic / rendah / ca / davis)
//   - categories: asset categories to weight toward
//   - paletteShift: coloring strategy (band / zone / split)
//   - params: layout parameter overrides

export const PRESET_GROUPS = [
  { id: 'classic', label: 'Classic' },
  { id: 'rendah',  label: 'Rendah Mag' },
  { id: 'ca',      label: 'Cellular Automaton' },
  { id: 'davis',   label: 'Davis-Lineage' },
];

export const COMPOSITION_PRESETS = [
  // ── Classic (Joshua Davis style) ──────────────────────────
  {
    id: 'praystation',
    name: 'PRAYSTATION',
    group: 'classic',
    desc: 'dense bloom of glyphs and color bursts',
    categories: ['organic', 'radial', 'stamps'],
    paletteShift: 'band',
    params: {
      mode: 'fibonacci', count: 300, scale: [0.35, 1.4], rotate: [-140, 140], alpha: [24, 96],
      zTiers: 5, jitter: 42, density: 92, bleed: false, recolor: true, mirror: false, overlap: true,
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
      mode: 'swarm', count: 340, scale: [0.28, 1.25], rotate: [-160, 160], alpha: [32, 88],
      zTiers: 6, jitter: 66, density: 100, bleed: true, recolor: true, mirror: false, overlap: true,
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
      mode: 'radial', count: 220, scale: [0.4, 1.5], rotate: [-90, 90], alpha: [38, 98],
      zTiers: 5, jitter: 28, density: 82, bleed: false, recolor: true, mirror: true, overlap: true,
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
      mode: 'grid', count: 260, scale: [0.3, 1.1], rotate: [-140, 140], alpha: [26, 88],
      zTiers: 4, jitter: 48, density: 86, bleed: false, recolor: true, mirror: true, overlap: true,
    },
  },

  // ── Rendah Mag Integration ────────────────────────────────
  {
    id: 'fujimoto-prism',
    name: 'FUJIMOTO PRISM',
    group: 'rendah',
    desc: 'kinetic laser scan — sharp geometry in rapid color zones (Shohei Fujimoto)',
    categories: ['geometric', 'linework', 'crystalline'],
    paletteShift: 'zone',
    params: {
      mode: 'grid', count: 380, scale: [0.25, 1.6], rotate: [-180, 180], alpha: [18, 72],
      zTiers: 7, jitter: 52, density: 105, bleed: true, recolor: true, mirror: false, overlap: true,
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
      mode: 'radial', count: 250, scale: [0.42, 1.8], rotate: [-120, 120], alpha: [28, 92],
      zTiers: 6, jitter: 35, density: 78, bleed: false, recolor: true, mirror: true, overlap: true,
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
      mode: 'swarm', count: 420, scale: [0.2, 1.3], rotate: [-170, 170], alpha: [20, 85],
      zTiers: 8, jitter: 74, density: 112, bleed: true, recolor: true, mirror: false, overlap: true,
    },
  },

  // ── Cellular Automaton ────────────────────────────────────
  {
    id: 'bitshifter-chaos',
    name: 'BITSHIFTER CHAOS',
    group: 'ca',
    desc: 'cellular automaton + bitwise mutations — chaotic evolution (motion-driven)',
    categories: ['geometric', 'crystalline', 'fragments'],
    paletteShift: 'split',
    params: {
      mode: 'ca', count: 180, scale: [0.25, 1.1], rotate: [-180, 180], alpha: [30, 90],
      zTiers: 4, jitter: 28, density: 88, bleed: false, recolor: true, mirror: false, overlap: true,
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
      mode: 'ca', count: 240, scale: [0.35, 1.5], rotate: [-90, 90], alpha: [40, 100],
      zTiers: 5, jitter: 18, density: 75, bleed: false, recolor: true, mirror: true, overlap: true,
    },
  },

  // ── Davis-Lineage ─────────────────────────────────────────
  {
    id: 'orbit-influence',
    name: 'ORBIT OF INFLUENCE',
    group: 'davis',
    desc: '3 invisible planets, 50 painters orbit at varied speeds and brush sizes (Joshua Davis · fxhash · ZeroSpace 2023)',
    categories: ['radial', 'organic', 'stamps'],
    paletteShift: 'zone',
    params: {
      mode: 'orbit', count: 600, scale: [0.4, 1.6], rotate: [-180, 180], alpha: [25, 90],
      zTiers: 3, jitter: 6, density: 100, bleed: true, recolor: true, mirror: false, overlap: true,
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
      mode: 'abacus', count: 420, scale: [0.35, 1.2], rotate: [-8, 8], alpha: [32, 95],
      zTiers: 4, jitter: 8, density: 100, bleed: false, recolor: true, mirror: false, overlap: true,
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
      mode: 'flow', count: 280, scale: [0.45, 1.7], rotate: [-180, 180], alpha: [35, 95],
      zTiers: 6, jitter: 92, density: 88, bleed: true, recolor: true, mirror: false, overlap: true,
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
      mode: 'orbit', count: 540, scale: [0.35, 1.55], rotate: [-180, 180], alpha: [28, 92],
      zTiers: 4, jitter: 14, density: 95, bleed: true, recolor: true, mirror: false, overlap: true,
    },
  },
];

/** Find a preset by ID, falling back to the first preset */
export function getPreset(id) {
  return COMPOSITION_PRESETS.find(p => p.id === id) || COMPOSITION_PRESETS[0];
}

/** Get presets grouped by their group field */
export function getPresetsByGroup() {
  return PRESET_GROUPS.map(g => ({
    ...g,
    presets: COMPOSITION_PRESETS.filter(p => p.group === g.id),
  }));
}
