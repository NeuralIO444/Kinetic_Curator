// #716 Part 2 — EF rack tile face. Abbreviation, one mode word, glyph id.
// The ✕ stays the existing remove; there is no bypass flag in the store.

export const SLOT_ABBR = {
  'EF-1': 'BLR',
  'EF-2': 'DST',
  'EF-3': 'TON',
  'EF-4': 'FIN',
};

export const KIND_FACE = {
  displace: { abbr: 'WRP', word: 'warp' },
  tear: { abbr: 'TEAR', word: 'tear' },
  rgbSplit: { abbr: 'SPL', word: 'split' },
  edge: { abbr: 'EDG', word: 'edge' },
  posterize: { abbr: 'PST', word: 'post' },
  solarize: { abbr: 'SOL', word: 'solar' },
  invert: { abbr: 'INV', word: 'invert' },
  grade: { abbr: 'GRD', word: 'grade' },
  grain: { abbr: 'GRN', word: 'grain' },
  scanlines: { abbr: 'SCN', word: 'scan' },
  halo: { abbr: 'HAL', word: 'halo' },
};

export function efTileFace(slot, kind) {
  const family = SLOT_ABBR[slot?.slot] || 'EF';
  if (!kind) return { abbr: family, word: 'empty', glyph: 'empty' };
  const face = KIND_FACE[kind];
  if (!face) return { abbr: family, word: String(kind), glyph: kind };
  return { abbr: face.abbr, word: face.word, glyph: kind };
}
