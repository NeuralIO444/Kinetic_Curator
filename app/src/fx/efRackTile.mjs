// #716 — EF rack tile face; #1046 — header strip. The editor opens with one
// line, `abbreviation · mode word · ✕` (e.g. `GRN · grain · ✕`), then only its
// controls. There is no glyph and no reserved row: the tile is as tall as its
// content. An empty slot's mode word is the slot's own name (`fin · finish`).

export const SLOT_ABBR = {
  'EF-1': 'BLR',
  'EF-2': 'DST',
  'EF-3': 'TON',
  'EF-4': 'FIN',
};

export const KIND_FACE = {
  sharpen: { abbr: 'SHP', word: 'sharp' },
  haze: { abbr: 'HAZ', word: 'haze' },
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
  // #1046: an empty slot says what the slot is for, never the bare word "empty".
  if (!kind) return { abbr: family, word: String(slot?.label || family).toLowerCase() };
  const face = KIND_FACE[kind];
  if (!face) return { abbr: family, word: String(kind) };
  return { abbr: face.abbr, word: face.word };
}
