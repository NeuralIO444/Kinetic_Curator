// Asset index — combines all parts into a single export
import { ASSETS_PART1 } from './assets-organic-geo.js';
import { ASSETS_PART2 } from './assets-line-floral.js';
import { ASSETS_PART3 } from './assets-stamp-radial.js';
import { ASSETS_PART4 } from './assets-experimental.js';
import { ASSETS_PART5 } from './assets-haeckel.js';
import { ASSETS_MICRO } from './assets-micro-hud.js';
import { ASSETS_LETTERS } from './assets-letterforms.js';
import { ASSETS_PIXEL } from './assets-pixel-glyphs.js';
import { BAKED_REGIONS } from './regions.generated.js'; // #1432: region mattes (#725) baked for the library

/** The catalogue as authored, before the baked mattes are attached (what the bake reads). */
export const ASSETS_AUTHORED = [...ASSETS_PART1, ...ASSETS_PART2, ...ASSETS_PART3, ...ASSETS_PART4, ...ASSETS_PART5, ...ASSETS_MICRO, ...ASSETS_LETTERS, ...ASSETS_PIXEL];

// #1432 — every built-in carries `regions` + `regionSlots`, the exact shape overlay.js validates for user imports. An
// asset with no baked entry is the very same object as before (no empty keys). #1434 — entries for the families the
// table names also carry `regionKinemes` (the family-default assignments; see data/regionDefaults.js).
export const ASSETS = ASSETS_AUTHORED.map((a) => (BAKED_REGIONS[a.id] ? { ...a, ...BAKED_REGIONS[a.id] } : a));
