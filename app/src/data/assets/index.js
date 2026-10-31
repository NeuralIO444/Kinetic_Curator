// Asset index — combines all parts into a single export
import { ASSETS_PART1 } from './assets-organic-geo.js';
import { ASSETS_PART2 } from './assets-line-floral.js';
import { ASSETS_PART3 } from './assets-stamp-radial.js';
import { ASSETS_PART4 } from './assets-experimental.js';
import { ASSETS_PART5 } from './assets-haeckel.js';
import { ASSETS_MICRO } from './assets-micro-hud.js';
import { ASSETS_LETTERS } from './assets-letterforms.js';
import { ASSETS_PIXEL } from './assets-pixel-glyphs.js';
import { ASSETS_MARKS } from './assets-marks.js';
import { BAKED_REGIONS } from './regions.generated.js'; // #1432: region mattes (#725) baked for the library

/** The catalogue as authored, before the baked mattes are attached (what the bake reads). */
export const ASSETS_AUTHORED = [
  ...ASSETS_PART1,
  ...ASSETS_PART2,
  ...ASSETS_PART3,
  ...ASSETS_PART4,
  ...ASSETS_PART5,
  ...ASSETS_MICRO,
  ...ASSETS_LETTERS,
  ...ASSETS_PIXEL,
  ...ASSETS_MARKS, // #1854 — the Marks chapter pool, authored content (BOOK S1b)
];

// #1432 — every built-in carries `regions` + `regionSlots`, the exact shape overlay.js validates for user imports. An
// asset with no baked entry is the very same object as before (no empty keys). #1434 — entries for the families the
// table names also carry `regionKinemes` (the family-default assignments; see data/regionDefaults.js).
// #1694 slice 2 — the creature citizen: ONE pool entry standing for both live creature families (the
// field-formed moths and the dish creature; Matt's ruling, #1694 Q4 — family is a tile OPTION on this
// entry, not a second entry). It is a citizen of the pool, not a mark: the resolver never places it
// (liveResolve excludes it from the placeable pool by id, before the pool signature is computed), it
// carries no baked regions (it is appended AFTER the region bake, and ASSETS_AUTHORED — what the bake
// reads — never sees it), and its tile art is the moth body's own pod glyph. Its behaviour binds to the
// S1 spawn machinery through the generic citizen maps (enabledAssets / assetWeightOverrides /
// assetStill / assetOptions) — see curator/creatureCitizen.js. The `options` declaration is the
// generic tile-option mechanism: any record may declare options; the panel renders a cycle chip per
// option and the store cycles it (cycleAssetOption), with no per-asset branches anywhere.
const CREATURE_CITIZEN = {
  id: 'creature',
  category: 'creature',
  tags: ['creature', 'moth', 'dish'],
  weight: 'medium',
  density: 'medium',
  scale: [0.5, 1.2],
  rotate: 'free',
  svg: `<ellipse cx="50" cy="50" rx="20" ry="42" fill="var(--ink)"/><line x1="50" y1="10" x2="50" y2="90" stroke="var(--accent)" stroke-width="2"/><circle cx="50" cy="35" r="3" fill="var(--accent)"/><circle cx="50" cy="50" r="3" fill="var(--accent)"/><circle cx="50" cy="65" r="3" fill="var(--accent)"/>`,
  options: [{ key: 'family', choices: ['both', 'moth', 'dish'], default: 'both' }],
};

export const ASSETS = [
  ...ASSETS_AUTHORED.map((a) => (BAKED_REGIONS[a.id] ? { ...a, ...BAKED_REGIONS[a.id] } : a)),
  CREATURE_CITIZEN,
];
