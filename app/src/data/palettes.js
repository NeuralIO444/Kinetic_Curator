// Ghost Station palettes — generative-art lineage
// Each: { id, name, era, bg, ink, swatches: [colors] }
// `ink` = catalog-page text color when this palette is active (high contrast vs bg)
// `weights` (#1049) = how strong each swatch is, 0..1, parallel to `swatches`. Baked by
// scripts/bake-swatch-weights.mjs, then hand-reviewed: a hand edit is the source of truth.
// Read them through data/swatchWeights.js, which derives them for a palette that has none.
// `leak` (#287) = pigment drift rate 0..1 — agents' colors melt toward their
// neighbours' average. Most palettes stay 0 (colors hold); a few melt slowly.

export const PALETTES = [
  {
    id: 'praystation',
    name: 'ORIGIN',
    era: 'Origin era',
    bg: '#0a0a0a',
    ink: '#f0f0e8',
    swatches: ['#ff2d6f', '#00d9ff', '#ffd400', '#ff6b00', '#00ff88', '#b400ff', '#f0f0e8', '#0a0a0a'],
    weights: [0.64, 0.89, 0.94, 0.81, 0.92, 0.68, 0.42, 0],
  },
  {
    id: 'v01d',
    name: 'V01D',
    era: 'Dreamless · 2001',
    bg: '#08080d',
    ink: '#e8d8c0',
    swatches: ['#1a4d5c', '#5c1a2e', '#3d2a4d', '#8a3a3a', '#c08040', '#e8d8c0', '#2d1a3d', '#0d2030'],
    weights: [0.42, 0.37, 0.24, 0.5, 0.85, 0.59, 0.21, 0.2],
  },
  {
    id: 'hydra',
    name: 'HYDRA',
    era: 'Aqueous folklore',
    bg: '#0c1420',
    ink: '#fff5e8',
    swatches: ['#00a896', '#02c39a', '#f0a202', '#d62828', '#003049', '#fdf0d5', '#669bbc', '#780000'],
    weights: [0.63, 0.72, 0.87, 0.54, 0.22, 0.5, 0.45, 0.31],
  },
  {
    id: 'dystopia',
    name: 'NEONOIR',
    era: 'UV/blacklight',
    bg: '#000000',
    ink: '#f0f0ff',
    swatches: ['#ff006e', '#fb5607', '#ffbe0b', '#8338ec', '#3a86ff', '#06ffa5', '#f0f0ff', '#000000'],
    weights: [0.7, 0.77, 0.89, 0.56, 0.67, 0.91, 0.44, 0],
  },
  {
    id: 'folktotem',
    name: 'TOTEM',
    era: 'Folk talisman',
    bg: '#1a1410',
    ink: '#f0e4d0',
    swatches: ['#c1432e', '#d68c45', '#e6b85c', '#3a6a4f', '#1d3557', '#f0e4d0', '#7a2e1f', '#2a1a14'],
    weights: [0.74, 0.84, 0.88, 0.34, 0.29, 0.53, 0.45, 0.11],
  },
  {
    id: 'kiln-columns',
    name: 'KILN COLUMNS',
    era: 'Stacked organic melt · 2026',
    bg: '#a27a84',
    ink: '#224655',
    swatches: ['#7496a1', '#4d7182', '#d9d4d3', '#224655', '#a27a84', '#e95f63'],
    weights: [0.26, 0.35, 0.43, 0.55, 0.17, 0.63],
    leak: 0.5, // #287 — the melt voice: glazes run into each other
  },
  {
    id: 'vortex-rwb',
    name: 'VORTEX RWB',
    era: 'Ribbon vortex study · 2026',
    bg: '#f2f3f8',
    ink: '#8c1f2e',
    swatches: ['#da4a5b', '#f2f3f8', '#4595f0', '#f2f3f8', '#da4a5b'],
    weights: [0.91, 0.02, 0.9, 0.02, 0.91],
  },
  // --- #220 preset-library palettes (each pairs with its showcase preset) ---
  {
    id: 'murmuration',
    name: 'MURMURATION',
    era: 'Dusk flock · preset library · 2026',
    bg: '#0d1626',
    ink: '#e8e6df',
    swatches: ['#f4f1de', '#e0ddcf', '#8899bb', '#3d5a80', '#22303f', '#d9a441'],
    weights: [0.49, 0.43, 0.44, 0.38, 0.16, 0.87],
  },
  {
    id: 'neon-brood',
    name: 'NEON BROOD',
    era: 'Blacklight organism · preset library · 2026',
    bg: '#050505',
    ink: '#f0f0ff',
    swatches: ['#ff2fb3', '#00f5d4', '#fee440', '#00bbf9', '#9b5de5', '#f15bb5'],
    weights: [0.68, 0.93, 0.86, 0.87, 0.53, 0.59],
  },
  {
    id: 'petri-bloom',
    name: 'PETRI BLOOM',
    era: 'Agar colonies · preset library · 2026',
    bg: '#f4f1ea',
    ink: '#1d2b2a',
    swatches: ['#1d6a5a', '#e36414', '#9a031e', '#5f0f40', '#fb8b24', '#2a9d8f'],
    weights: [0.51, 0.81, 0.82, 0.62, 0.77, 0.53],
    leak: 0.35, // #287 — colonies bleed into the agar
  },
  {
    id: 'river-delta',
    name: 'RIVER DELTA',
    era: 'Sediment flow · preset library · 2026',
    bg: '#0a2239',
    ink: '#eef4f1',
    swatches: ['#cdeac0', '#7fb3d5', '#2e86ab', '#a9d6e5', '#f4a259'],
    weights: [0.56, 0.62, 0.66, 0.59, 0.9],
  },
  {
    id: 'static-bloom',
    name: 'STATIC BLOOM',
    era: 'Phosphor interference · preset library · 2026',
    bg: '#0d0d0f',
    ink: '#e8e8e8',
    swatches: ['#e8e8e8', '#9a9a9a', '#4d4d4d', '#ff3b30', '#34c759'],
    weights: [0.4, 0.26, 0.12, 0.76, 0.69],
  },
  {
    id: 'strata',
    name: 'STRATA',
    era: 'Geological cut · preset library · 2026',
    bg: '#191410',
    ink: '#f0e4d0',
    swatches: ['#c9a227', '#8b5a2b', '#d8cfc0', '#4a4e69', '#22223b'],
    weights: [0.9, 0.52, 0.49, 0.24, 0.12],
  },
  {
    id: 'transit',
    name: 'TRANSIT',
    era: 'Metro diagram · preset library · 2026',
    bg: '#f5f2ea',
    ink: '#111111',
    swatches: ['#e63946', '#1d3557', '#f4a259', '#2a9d8f', '#111111'],
    weights: [0.86, 0.54, 0.66, 0.6, 0.4],
  },
  {
    id: 'solar-max',
    name: 'SOLAR MAX',
    era: 'Coronal storm · preset library · 2026',
    bg: '#1a0a00',
    ink: '#fff3b0',
    swatches: ['#ffd166', '#ef476f', '#f78c6b', '#fff3b0', '#fb8500'],
    weights: [0.71, 0.57, 0.59, 0.59, 0.84],
  },
  {
    id: 'perihelion',
    name: 'PERIHELION',
    era: 'Deep orbit burn · preset library · 2026',
    bg: '#04070f',
    ink: '#e0e1dd',
    swatches: ['#e0e1dd', '#778da9', '#415a77', '#1b263b', '#ff6b35'],
    weights: [0.41, 0.39, 0.31, 0.15, 0.83],
  },
  {
    id: 'tidepool',
    name: 'TIDEPOOL',
    era: 'Intertidal zones · preset library · 2026',
    bg: '#eef4f1',
    ink: '#264653',
    swatches: ['#2a9d8f', '#e9c46a', '#e76f51', '#264653', '#f4a261'],
    weights: [0.71, 0.61, 0.84, 0.58, 0.74],
  },
  // ── Persona palettes (curator render profiles) ──────────────────────────
  // One palette per proving persona. Brought in by the Curator when that
  // persona's voice is active — this is the color jump. Each is an honest
  // interpretation of the artist's working palette, documented in
  // app/src/curator/renderProfiles.js with its research source.
  {
    id: 'persona-davis',
    name: 'OVERLAP',
    era: 'Persona voice · after Joshua Davis',
    bg: '#0d0d12',
    ink: '#f5f2ea',
    swatches: ['#c6ff00', '#ff2d78', '#00e5ff', '#ff7a1a', '#8b2fff', '#00ffa3', '#ff3b30', '#f5f2ea'],
    weights: [0.97, 0.64, 0.9, 0.77, 0.61, 0.92, 0.64, 0.43],
  },
  {
    id: 'persona-benjamin',
    name: 'HARD EDGE',
    era: 'Persona voice · after Karl Benjamin',
    bg: '#ddd6c2',
    ink: '#161616',
    swatches: ['#d8361b', '#1fae9e', '#5cb531', '#f0b429', '#7b2ff7', '#7a2230', '#8a6b46', '#161616'],
    weights: [0.83, 0.58, 0.52, 0.66, 0.88, 0.6, 0.42, 0.4],
  },
  {
    id: 'persona-reas',
    name: 'PROCESS FIELD',
    era: 'Persona voice · after Casey Reas',
    bg: '#0a0a0a',
    ink: '#f5f5f5',
    swatches: ['#f5f5f5', '#cfcfcf', '#9a9a9a', '#6b6b6b', '#3f3f3f'],
    weights: [0.4, 0.34, 0.25, 0.17, 0.09],
  },
  {
    id: 'persona-haeckel',
    name: 'SPECIMEN',
    era: 'Persona voice · after Ernst Haeckel',
    bg: '#f0e8d0',
    ink: '#2a2419',
    swatches: ['#211d15', '#7d8b6f', '#d9a7a0', '#a3804f', '#75828c', '#c9963c', '#4e5a43'],
    weights: [0.45, 0.31, 0.35, 0.55, 0.3, 0.75, 0.39],
  },
  {
    id: 'persona-molnar',
    name: 'NEAR GRID',
    era: 'Persona voice · after Vera Molnár',
    bg: '#eeebe6',
    ink: '#1a1a1a',
    swatches: ['#d63a2f', '#e89fb8', '#4a9a52', '#e87e2e', '#f0c83a', '#7a4a9e', '#2e5fa8', '#1a1a1a'],
    weights: [0.82, 0.35, 0.46, 0.78, 0.66, 0.55, 0.67, 0.4],
  },
  {
    id: 'persona-mohr',
    name: 'MONO AXIS',
    era: 'Persona voice · after Manfred Mohr',
    bg: '#0d0d0f',
    ink: '#e8e8e8',
    swatches: ['#e8e8e8', '#8f8f8f', '#3a3a3e', '#7ac74f', '#2e5fd0', '#d06090'],
    weights: [0.4, 0.24, 0.1, 0.74, 0.75, 0.62],
  },
  {
    id: 'persona-anadol',
    name: 'LATENT DRIFT',
    era: 'Persona voice · after Refik Anadol',
    bg: '#14092b',
    ink: '#f1ede6',
    swatches: ['#d84e8c', '#7a2430', '#d9a62e', '#3aa5ba', '#e0523c', '#41c4de', '#e89ca8', '#d65f1c'],
    weights: [0.69, 0.38, 0.94, 0.74, 0.77, 0.9, 0.65, 0.86],
  },
  {
    id: 'persona-menkman',
    name: 'COMPRESSION',
    era: 'Persona voice · after Rosa Menkman',
    bg: '#0c0c0c',
    ink: '#eaeadf',
    swatches: ['#eaeadf', '#7ed42e', '#d62598', '#2b4fd8', '#dce82a', '#3ec83e', '#2ed8c8'],
    weights: [0.43, 0.83, 0.69, 0.67, 0.97, 0.7, 0.84],
  },
  {
    id: 'persona-oxman',
    name: 'GROWN',
    era: 'Persona voice · after Neri Oxman',
    bg: '#efe9dc',
    ink: '#5e3b1d',
    swatches: ['#d9cfb8', '#8a5a2b', '#5e3b1d', '#c98a3a', '#f5f2ea', '#9c8b70', '#6e6250'],
    weights: [0.2, 0.72, 0.67, 0.81, 0.07, 0.4, 0.44],
  },
  {
    id: 'persona-stock',
    name: 'VORTEX',
    era: 'Persona voice · after Mark Stock',
    bg: '#261e17',
    ink: '#d8d2c4',
    swatches: ['#d8d2c4', '#e8621c', '#7a8b3f', '#a8602f', '#1f5fbf', '#3fbf6a', '#b31217', '#2c3a55'],
    weights: [0.46, 0.8, 0.44, 0.53, 0.6, 0.66, 0.52, 0.18],
  },
  // #287 — specimen-plate grounds for the Haeckel pinch. Light papers that
  // the fade-to-paper ACCUM fix keeps honest (trails fall toward the paper,
  // not black).
  {
    id: 'sepia-plate',
    name: 'SEPIA PLATE',
    era: 'Specimen plate · bio-drives · 2026',
    bg: '#efe3cb',
    ink: '#3a2a1a',
    swatches: ['#5a3d22', '#8a5a2b', '#3a2a1a', '#b98a4b', '#6b4a2a', '#2a1d10'],
    weights: [0.64, 0.78, 0.55, 0.77, 0.66, 0.54],
    leak: 0.5, // plate inks bleed slowly into the paper
  },
  {
    id: 'lithograph',
    name: 'LITHOGRAPH',
    era: 'Specimen plate · bio-drives · 2026',
    bg: '#f2ecdd',
    ink: '#1a1a1a',
    swatches: ['#1a1a1a', '#3d3d3d', '#6b6b6b', '#8f8578', '#2a2a28', '#55504a'],
    weights: [0.4, 0.33, 0.25, 0.79, 0.42, 0.58],
  },
  {
    id: 'cyanotype',
    name: 'CYANOTYPE',
    era: 'Specimen plate · bio-drives · 2026',
    bg: '#dfe8ec',
    ink: '#123a5c',
    swatches: ['#123a5c', '#1d5a8a', '#0d2a44', '#3a7ca5', '#16425f', '#2a6a9a'],
    weights: [0.77, 0.9, 0.69, 0.82, 0.75, 0.88],
    leak: 0.3, // blueprint wash drifts
  },
  // --- #284 Smoke Study voice: monochrome gray ramp on black. Data-only
  // addition — no system change. Pairs with the smoke-study preset.
  {
    id: 'smoke',
    name: 'SMOKE',
    era: 'Smoke study · 2026',
    bg: '#000000',
    ink: '#e8e8e8',
    swatches: ['#f2f2f2', '#d9d9d9', '#b3b3b3', '#8c8c8c', '#666666', '#404040'],
    weights: [0.4, 0.36, 0.3, 0.23, 0.17, 0.11],
  },
  // #704 — CHIAROSCURO: the dark-glass ground the chiaroscuro render mode
  // steps into. Near-black WARM (not neutral black — a cool ground kills the
  // amber), amber ink, blue-violet accent. Every swatch is chosen to sit on
  // #0d0a08 without the mids going muddy: the ramp climbs amber through to a
  // pale ember, and the two cool slots are the only ones that read as light
  // rather than heat.
  //
  // Deliberately NOT a high-contrast palette. Chiaroscuro is mostly dark with
  // a few things catching the light; a bright ink on this ground would read
  // as a flat poster, which is the look this mode exists to leave behind.
  {
    id: 'chiaroscuro',
    name: 'CHIAROSCURO',
    era: 'Dark glass · 2026',
    bg: '#0d0a08',
    ink: '#e89b3c',
    swatches: [
      '#e89b3c', // amber — the ink itself, so a lit facet and its fill agree
      '#f5c26b', // pale ember, the highlight end of the ramp
      '#c2691f', // deep amber, the shadow end
      '#7c5cff', // blue-violet — the accent, and the only cool light here
      '#5a44c8', // deeper violet, for accents that recede
      '#8a6a3a', // dim bronze, the bridge between the ramp and the ground
    ],
    weights: [0.93, 0.88, 0.8, 0.78, 0.61, 0.49],
  },
  // --- Rendah style pack: five palettes translating the magazine's world
  // (dark neutrals + rendah-red identity, D&B glitch heritage, and the
  // signature looks of its featured artists) into the catalog.
  // Data-only addition — no system change. Each pairs with a same-id
  // preset in the 'rendah' preset group.
  {
    id: 'rendah',
    name: 'RENDAH',
    era: 'Rendah Mag identity · 2026',
    bg: '#0c0c0d',
    ink: '#e8e6e3',
    swatches: ['#ff2a1f', '#e8e6e3', '#8a8a8e', '#55555a', '#2a2a2e', '#0c0c0d'],
    weights: [0.74, 0.41, 0.24, 0.15, 0.07, 0],
  },
  {
    id: 'glitch',
    name: 'GLITCH',
    era: 'Kurokawa scan · 2026',
    bg: '#050505',
    ink: '#f0f0f0',
    swatches: ['#00e5ff', '#f0f0f0', '#a0a0a0', '#565656', '#1c1c1c', '#050505'],
    weights: [0.9, 0.4, 0.26, 0.14, 0.04, 0],
  },
  {
    id: 'ink-nebula',
    name: 'INK NEBULA',
    era: 'Vanz fluid cosmos · 2026',
    bg: '#04060f',
    ink: '#dfe8ff',
    swatches: ['#7b2ff7', '#00c2ff', '#ff4fd8', '#ff7a1a', '#1a2f6e', '#dfe8ff'],
    weights: [0.6, 0.87, 0.63, 0.78, 0.27, 0.48],
    leak: 0.3, // liquid-ink collisions bleed into each other
  },
  {
    id: 'megacity',
    name: 'MEGACITY',
    era: 'Siconolfi stacked dusk · 2026',
    bg: '#101014',
    ink: '#e8ddc8',
    swatches: ['#ffb347', '#8a8f98', '#4a4e57', '#2e6f5e', '#3b5a8a', '#e8ddc8'],
    weights: [0.93, 0.29, 0.16, 0.37, 0.39, 0.5],
  },
  {
    id: 'dirty',
    name: 'DIRTY',
    era: 'Strangeloop vibey · 2026',
    bg: '#0d0a08',
    ink: '#f5e6d0',
    swatches: ['#ff5a1f', '#ff2d78', '#ffd400', '#7a3cff', '#3d2b1f', '#f5e6d0'],
    weights: [0.73, 0.65, 0.95, 0.6, 0.13, 0.49],
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
    // #1049 — baked weights describe the catalog swatches. An override changes a color, so
    // the weights no longer describe it: drop them and let swatchWeights() derive.
    ...(Array.isArray(base.weights) && !overrides?.swatches && !overrides?.bg ? { weights: [...base.weights] } : {}),
    // #287 — leak is a catalog property, not a per-swatch override.
    leak: typeof base.leak === 'number' ? base.leak : 0,
    dirty: !!(overrides && (overrides.swatches || overrides.bg || overrides.ink)),
  };
}

/**
 * The KIN roll pool (#952): every system palette id, then saved user palette
 * ids. System first, deduped — a user entry shadowing a catalog id resolves
 * to the catalog palette via getCatalogPalette, so it gets one slot.
 *
 * @param {Array<{id?: string}>} [userPalettes]
 * @returns {string[]}
 */
export function paletteRollPoolIds(userPalettes = []) {
  const seen = new Set();
  const ids = [];
  for (const p of PALETTES) {
    if (p && !seen.has(p.id)) {
      seen.add(p.id);
      ids.push(p.id);
    }
  }
  if (Array.isArray(userPalettes)) {
    for (const p of userPalettes) {
      if (p && typeof p.id === 'string' && p.id && !seen.has(p.id)) {
        seen.add(p.id);
        ids.push(p.id);
      }
    }
  }
  return ids;
}
