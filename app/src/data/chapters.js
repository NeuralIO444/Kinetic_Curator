// data/chapters.js — #1853 (BOOK S1): the Book's chapter registry — design-history chapters DERIVED from the
// existing movement groupings, the way data/assetStyle.js derives style: a table over what the library already
// declares, no edits to any authored record, and nothing the performer sees (silence is default; landing is S2).
//
// The spine is D1's ruling (Matt, 2026-10-31): the book OPENS at the primitive chapter —
//   Marks → Engraving → Bauhaus → Swiss → Op Art → Japan → Memphis → Grunge → Now
// A chapter declares: its look group(s) (data/styleLooks.js + presets.js), its asset styles/families
// (data/assetStyle.js), its voice styles (the pairing data/voiceDeck.js records declare), and a chapter CARD —
// the one-glance visual signature (a palette + representative marks) a landing will be recognized by in S2.
//
// Membership is derivation, never borrowing:
//   looks  — COMPOSITION_PRESETS whose `group` is one of the chapter's lookGroups
//   voices — VOICE_DECK records whose declared `styles` meet the chapter's voiceStyles
//   assets — dealable asset records whose derived style is one of the chapter's assetStyles, or whose derived
//            family is one of its assetFamilies (the family axis is the slot for material that has no style
//            yet — it is how #1854's Marks records will join this registry by declaring family/style, with no
//            change to the derivation below)
// The creature citizen is a pool citizen, never a dealt mark (state/rollPool.mjs NEVER_DEALT) — it belongs to
// no chapter's deck, not even Now's. The palette `era` strings are flavour text: this module never reads them
// (it does not import palettes.js at all; card palette ids are declared data, resolved by the S2 surface).
//
// Deck discipline: a chapter whose deck is empty or below CHAPTER_DECK_MINIMUM on any axis reports itself in
// deckReport() — backstage, by name, with the short axes listed — rather than silently borrowing a neighbour's
// pool. The minimums are the library's own floor: the smallest look/voice/asset counts among the seven
// movement chapters that exist today (a chapter smaller than the smallest deck the instrument already deals
// as a movement is not yet a chapter you can land in). Marks is that report's first honest entry: D1 put it
// first in the spine; its looks and assets are authored content (#1854) and meet the floor, and its voices
// stay short by that issue's own scope — the report says so instead of the chapter borrowing a voice deck.

import { ASSETS } from './assets/index.js';
import { STYLES, FAMILIES, assetRecords } from './assetStyle.js';
import { COMPOSITION_PRESETS, PRESET_GROUPS } from './presets.js';
import { VOICE_DECK } from './voiceDeck.js';

/** Never dealt into a chapter deck (the creature citizen — mirrors state/rollPool.mjs NEVER_DEALT). */
export const CHAPTER_UNDEALT = Object.freeze(['creature']);

/** The deck floor, per axis — the smallest movement chapter the library already deals (see header). */
export const CHAPTER_DECK_MINIMUM = Object.freeze({ looks: 4, voices: 8, assets: 14 });

// The spine, in order (D1). `prev`/`next` are attached from this order below — the order IS the neighbours.
const SPINE = [
  {
    // The primitive chapter. Its pool is authored content (#1854: cave signs, tallies, hands, a beast —
    // the `marks` family/style in assetStyle, the `marks` look group in styleLooks, the ochre/bone/carbon
    // palettes in palettes.js), and it joins here by declaring those axes — derivation does the rest.
    // voiceStyles stays empty on purpose: #1854 caps voice work at a minimal pairing and defers the
    // dedicated Marks voice deck to a later call, so deckReport() keeps naming Marks short on voices
    // rather than borrowing a neighbour's voices to clear the floor.
    id: 'marks',
    name: 'Marks',
    lookGroups: ['marks'],
    assetStyles: ['marks'],
    assetFamilies: ['marks'],
    voiceStyles: [],
    card: { paletteId: 'ochre-wall', marks: ['mrk_hand_01', 'mrk_ring_01', 'mrk_beast_01'] },
  },
  {
    id: 'engraving',
    name: 'Engraving',
    lookGroups: ['engraved'],
    assetStyles: ['engraved'],
    assetFamilies: [],
    voiceStyles: ['engraved'],
    card: { paletteId: 'persona-haeckel', marks: ['hae_radiolarian_01', 'hae_diatom_01', 'hae_medusa_01'] },
  },
  {
    id: 'bauhaus',
    name: 'Bauhaus',
    lookGroups: ['bauhaus'],
    assetStyles: ['bauhaus'],
    assetFamilies: [],
    voiceStyles: ['bauhaus'],
    card: { paletteId: 'solar-max', marks: ['geo_tri_01', 'geo_square_03', 'geo_circle_01'] },
  },
  {
    // Swiss is its own group — DIAGONAL GRID lives here, not in Bauhaus. The taxonomy in code is the taxonomy.
    id: 'swiss',
    name: 'Swiss',
    lookGroups: ['swiss'],
    assetStyles: ['swiss'],
    assetFamilies: [],
    voiceStyles: ['swiss'],
    card: { paletteId: 'transit', marks: ['typ_A', 'typ_B', 'typ_C'] },
  },
  {
    id: 'op-art',
    name: 'Op Art',
    lookGroups: ['op'],
    assetStyles: ['op'],
    assetFamilies: [],
    voiceStyles: ['op'],
    card: { paletteId: 'hydra', marks: ['dot_field_01', 'dot_cluster_01', 'line_hatch_01'] },
  },
  {
    id: 'japan',
    name: 'Japan',
    lookGroups: ['japanese'],
    assetStyles: ['japanese'],
    assetFamilies: [],
    voiceStyles: ['japanese'],
    card: { paletteId: 'sepia-plate', marks: ['org_petal_01', 'org_leaf_01', 'org_petal_02'] },
  },
  {
    id: 'memphis',
    name: 'Memphis',
    lookGroups: ['memphis'],
    assetStyles: ['memphis'],
    assetFamilies: [],
    voiceStyles: ['memphis'],
    card: { paletteId: 'neon-brood', marks: ['geo_star4_01', 'geo_star5_01', 'geo_chev_01'] },
  },
  {
    id: 'grunge',
    name: 'Grunge',
    lookGroups: ['grunge'],
    assetStyles: ['grunge'],
    assetFamilies: [],
    voiceStyles: ['grunge'],
    card: { paletteId: 'dirty', marks: ['stamp_num_01', 'stamp_glyph_01', 'stamp_num_02'] },
  },
  {
    // Now — the instrument's own era: the full library. Its lists are built from the source tables
    // (every look group, every style) so the chapter cannot drift from the library it sums.
    id: 'now',
    name: 'Now',
    lookGroups: PRESET_GROUPS.map((g) => g.id),
    assetStyles: [...STYLES],
    assetFamilies: FAMILIES.filter((f) => f !== 'creature'),
    voiceStyles: [...STYLES],
    card: { paletteId: 'praystation', marks: ['pxg_cross', 'pxg_diamond', 'pxg_frame'] },
  },
];

/** The chapters, in spine order, each carrying its position and its previous/next neighbours (null at the ends). */
export const CHAPTERS = Object.freeze(
  SPINE.map((c, i) =>
    Object.freeze({
      ...c,
      position: i,
      prev: i > 0 ? SPINE[i - 1].id : null,
      next: i < SPINE.length - 1 ? SPINE[i + 1].id : null,
      lookGroups: Object.freeze([...c.lookGroups]),
      assetStyles: Object.freeze([...c.assetStyles]),
      assetFamilies: Object.freeze([...c.assetFamilies]),
      voiceStyles: Object.freeze([...c.voiceStyles]),
      card: Object.freeze({ paletteId: c.card.paletteId, marks: Object.freeze([...c.card.marks]) }),
    }),
  ),
);

const BY_ID = new Map(CHAPTERS.map((c) => [c.id, c]));

/** A chapter by id, or null. */
export function chapterById(id) {
  return BY_ID.get(id) || null;
}

/** The chapter after this one along the spine (null past Now — the walk ends, it never cycles). */
export function nextChapter(id) {
  const c = chapterById(id);
  return c && c.next ? chapterById(c.next) : null;
}

/** The chapter before this one along the spine (null before Marks). */
export function prevChapter(id) {
  const c = chapterById(id);
  return c && c.prev ? chapterById(c.prev) : null;
}

/** The chapter that claims a look group (null for groups no chapter claims). */
export function chapterForLookGroup(groupId) {
  return CHAPTERS.find((c) => c.lookGroups.includes(groupId)) || null;
}

/** The chapter that claims an asset style as its movement axis (Now claims every style last — spine order wins). */
export function chapterForStyle(style) {
  return CHAPTERS.find((c) => c.id !== 'now' && c.assetStyles.includes(style)) || null;
}

const asChapter = (chapterOrId) => (typeof chapterOrId === 'string' ? chapterById(chapterOrId) : chapterOrId);

/** The dealable asset records chapters derive from: the whole library, minus the never-dealt citizen. */
export function dealableAssetRecords(assets = ASSETS) {
  return assetRecords(assets).filter((r) => !CHAPTER_UNDEALT.includes(r.id));
}

/** The chapter's looks, in library order (records, not ids). */
export function chapterLooks(chapterOrId, looks = COMPOSITION_PRESETS) {
  const c = asChapter(chapterOrId);
  if (!c) return [];
  return looks.filter((l) => c.lookGroups.includes(l.group));
}

/** The chapter's voices, in deck order (records, not ids): the voices whose declared styles meet the chapter's. */
export function chapterVoices(chapterOrId, deck = VOICE_DECK) {
  const c = asChapter(chapterOrId);
  if (!c) return [];
  return deck.filter((v) => (v.styles || []).some((s) => c.voiceStyles.includes(s)));
}

/** The chapter's asset ids, in library order: style- or family-derived from the dealable records. */
export function chapterAssets(chapterOrId, records = dealableAssetRecords()) {
  const c = asChapter(chapterOrId);
  if (!c) return [];
  return records.filter((r) => c.assetStyles.includes(r.style) || c.assetFamilies.includes(r.family)).map((r) => r.id);
}

/** One chapter's full deck as ids: { looks, voices, assets }. Pure derivation — same library, same deck. */
export function chapterDeck(chapterOrId, { looks, deck, records } = {}) {
  return {
    looks: chapterLooks(chapterOrId, looks).map((l) => l.id),
    voices: chapterVoices(chapterOrId, deck).map((v) => v.id),
    assets: chapterAssets(chapterOrId, records),
  };
}

/**
 * The backstage honesty read: every chapter's deck counts against CHAPTER_DECK_MINIMUM.
 * `ok` is false when any axis is empty or below the minimum; `shortfalls` names the axes. No borrowing,
 * no smoothing — a thin chapter reads thin here until its content exists.
 */
export function deckReport(data = {}) {
  return CHAPTERS.map((c) => {
    const d = chapterDeck(c, data);
    const counts = { looks: d.looks.length, voices: d.voices.length, assets: d.assets.length };
    const shortfalls = Object.keys(CHAPTER_DECK_MINIMUM).filter((axis) => counts[axis] < CHAPTER_DECK_MINIMUM[axis]);
    return { id: c.id, name: c.name, counts, ok: shortfalls.length === 0, shortfalls };
  });
}
