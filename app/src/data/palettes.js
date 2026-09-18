// Ghost Station palettes — generative-art lineage
// Each: { id, name, era, bg, ink, swatches: [colors] }
// `ink` = catalog-page text color when this palette is active (high contrast vs bg)

export const PALETTES = [
  {
    id: 'praystation',
    name: 'ORIGIN',
    era: 'Origin era',
    bg: '#0a0a0a',
    ink: '#f0f0e8',
    swatches: ['#ff2d6f', '#00d9ff', '#ffd400', '#ff6b00', '#00ff88', '#b400ff', '#f0f0e8', '#0a0a0a'],
  },
  {
    id: 'v01d',
    name: 'V01D',
    era: 'Dreamless · 2001',
    bg: '#08080d',
    ink: '#e8d8c0',
    swatches: ['#1a4d5c', '#5c1a2e', '#3d2a4d', '#8a3a3a', '#c08040', '#e8d8c0', '#2d1a3d', '#0d2030'],
  },
  {
    id: 'hydra',
    name: 'HYDRA',
    era: 'Aqueous folklore',
    bg: '#0c1420',
    ink: '#fff5e8',
    swatches: ['#00a896', '#02c39a', '#f0a202', '#d62828', '#003049', '#fdf0d5', '#669bbc', '#780000'],
  },
  {
    id: 'dystopia',
    name: 'NEONOIR',
    era: 'UV/blacklight',
    bg: '#000000',
    ink: '#f0f0ff',
    swatches: ['#ff006e', '#fb5607', '#ffbe0b', '#8338ec', '#3a86ff', '#06ffa5', '#f0f0ff', '#000000'],
  },
  {
    id: 'folktotem',
    name: 'TOTEM',
    era: 'Folk talisman',
    bg: '#1a1410',
    ink: '#f0e4d0',
    swatches: ['#c1432e', '#d68c45', '#e6b85c', '#3a6a4f', '#1d3557', '#f0e4d0', '#7a2e1f', '#2a1a14'],
  },
  {
    id: 'kiln-columns',
    name: 'KILN COLUMNS',
    era: 'Stacked organic melt · 2026',
    bg: '#a27a84',
    ink: '#224655',
    swatches: ['#7496a1', '#4d7182', '#d9d4d3', '#224655', '#a27a84', '#e95f63'],
  },
  {
    id: 'vortex-rwb',
    name: 'VORTEX RWB',
    era: 'Ribbon vortex study · 2026',
    bg: '#f2f3f8',
    ink: '#8c1f2e',
    swatches: ['#da4a5b', '#f2f3f8', '#4595f0', '#f2f3f8', '#da4a5b'],
  },
  // --- #220 preset-library palettes (each pairs with its showcase preset) ---
  {
    id: 'murmuration',
    name: 'MURMURATION',
    era: 'Dusk flock · preset library · 2026',
    bg: '#0d1626',
    ink: '#e8e6df',
    swatches: ['#f4f1de', '#e0ddcf', '#8899bb', '#3d5a80', '#22303f', '#d9a441'],
  },
  {
    id: 'neon-brood',
    name: 'NEON BROOD',
    era: 'Blacklight organism · preset library · 2026',
    bg: '#050505',
    ink: '#f0f0ff',
    swatches: ['#ff2fb3', '#00f5d4', '#fee440', '#00bbf9', '#9b5de5', '#f15bb5'],
  },
  {
    id: 'petri-bloom',
    name: 'PETRI BLOOM',
    era: 'Agar colonies · preset library · 2026',
    bg: '#f4f1ea',
    ink: '#1d2b2a',
    swatches: ['#1d6a5a', '#e36414', '#9a031e', '#5f0f40', '#fb8b24', '#2a9d8f'],
  },
  {
    id: 'river-delta',
    name: 'RIVER DELTA',
    era: 'Sediment flow · preset library · 2026',
    bg: '#0a2239',
    ink: '#eef4f1',
    swatches: ['#cdeac0', '#7fb3d5', '#2e86ab', '#a9d6e5', '#f4a259'],
  },
  {
    id: 'static-bloom',
    name: 'STATIC BLOOM',
    era: 'Phosphor interference · preset library · 2026',
    bg: '#0d0d0f',
    ink: '#e8e8e8',
    swatches: ['#e8e8e8', '#9a9a9a', '#4d4d4d', '#ff3b30', '#34c759'],
  },
  {
    id: 'strata',
    name: 'STRATA',
    era: 'Geological cut · preset library · 2026',
    bg: '#191410',
    ink: '#f0e4d0',
    swatches: ['#c9a227', '#8b5a2b', '#d8cfc0', '#4a4e69', '#22223b'],
  },
  {
    id: 'transit',
    name: 'TRANSIT',
    era: 'Metro diagram · preset library · 2026',
    bg: '#f5f2ea',
    ink: '#111111',
    swatches: ['#e63946', '#1d3557', '#f4a259', '#2a9d8f', '#111111'],
  },
  {
    id: 'solar-max',
    name: 'SOLAR MAX',
    era: 'Coronal storm · preset library · 2026',
    bg: '#1a0a00',
    ink: '#fff3b0',
    swatches: ['#ffd166', '#ef476f', '#f78c6b', '#fff3b0', '#fb8500'],
  },
  {
    id: 'perihelion',
    name: 'PERIHELION',
    era: 'Deep orbit burn · preset library · 2026',
    bg: '#04070f',
    ink: '#e0e1dd',
    swatches: ['#e0e1dd', '#778da9', '#415a77', '#1b263b', '#ff6b35'],
  },
  {
    id: 'tidepool',
    name: 'TIDEPOOL',
    era: 'Intertidal zones · preset library · 2026',
    bg: '#eef4f1',
    ink: '#264653',
    swatches: ['#2a9d8f', '#e9c46a', '#e76f51', '#264653', '#f4a261'],
  },
];

/**
 * Look up a palette by id. `extra` carries user-saved palettes (#55) so the
 * catalog stays immutable while user entries resolve through the same path.
 */
export function getCatalogPalette(id, extra = []) {
  return PALETTES.find((p) => p.id === id)
    || (Array.isArray(extra) ? extra.find((p) => p && p.id === id) : null)
    || PALETTES[0];
}

/** Normalize to #rrggbb lowercase; null if invalid. */
export function normalizeHex(hex) {
  if (typeof hex !== 'string') return null;
  let h = hex.trim();
  if (h[0] !== '#') h = `#${h}`;
  if (/^#[0-9a-fA-F]{3}$/.test(h)) {
    h = `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(h)) return null;
  return h.toLowerCase();
}

/**
 * Resolve effective palette from catalog + optional overrides.
 * Never mutates PALETTES. Missing override slots fall back to catalog.
 *
 * @param {string} paletteId
 * @param {null|{ swatches?: string[], bg?: string, ink?: string }} overrides
 */
export function resolvePalette(paletteId, overrides = null, extra = []) {
  const base = getCatalogPalette(paletteId, extra);
  const swatches = base.swatches.map((s, i) => {
    const o = overrides?.swatches?.[i];
    const n = o != null ? normalizeHex(o) : null;
    return n || s;
  });
  const bg = (overrides?.bg && normalizeHex(overrides.bg)) || base.bg;
  const ink = (overrides?.ink && normalizeHex(overrides.ink)) || base.ink;
  return {
    id: base.id,
    name: base.name,
    era: base.era,
    bg,
    ink,
    swatches: [...swatches],
    dirty: !!(overrides && (overrides.swatches || overrides.bg || overrides.ink)),
  };
}
