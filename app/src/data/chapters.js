// data/chapters.js — #1853 (BOOK S1): the Book's chapter registry — design-history chapters DERIVED from the
// existing movement groupings, the way data/assetStyle.js derives style: a table over what the library already
// declares, no edits to any authored record, and nothing the performer sees (silence is default; landing is S2).
//
// The spine is D1's ruling (Matt, 2026-10-31): the book OPENS at the primitive chapter —
//   Marks → Engraving → Bauhaus → Swiss → Op Art → Japan → Memphis → Grunge → Now
// #2046 — a chapter is no longer only an address book: it also carries `settings` (palette / motion / feel)
// that a system can apply, and taste reads the standing chapter back (curator/taste.js, chapterSettings below).
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
// as a movement is not yet a chapter you can land in). Marks was that report's first honest entry: D1 put it
// first in the spine, and its pool is authored content (#1854) — looks, assets, and (under Matt's
// 2026-10-31 ruling, in the same slice) its own voice family — so it now meets the floor on every axis
// without borrowing a neighbour's deck.

import { ASSETS } from './assets/index.js';
import { ASSETS_KANA } from './assets/assets-kana.js';
import { ASSETS_KANJI } from './assets/assets-kanji.js';
import { ASSETS_LATIN } from './assets/assets-latin.js';
import { ASSETS_SERIF } from './assets/assets-serif.js';
import { ASSETS_ORNAMENTS } from './assets/assets-ornaments.js';
import { ASSETS_PLATE } from './assets/assets-plate.js';
import { ASSETS_WEAR } from './assets/assets-wear.js'; // #2010 P1: the poem-only worn letters (torn / xerox)
import { ASSETS_RISO } from './assets/assets-riso.js';
import { ASSETS_LETTERS } from './assets/assets-letterforms.js'; // #2150: the caps/digits pack
import { SOLO_TEXT_STAMP_IDS } from './assets/assets-stamp-radial.js'; // #2150: the bare <text> letter/number stamps
import { PIXEL_LETTER_ANATOMY_IDS } from './assets/assets-pixel-glyphs.js'; // #2150 (Q4): the letter-anatomy emblems
import { STYLES, FAMILIES, assetRecords } from './assetStyle.js';
import { COMPOSITION_PRESETS, PRESET_GROUPS } from './presets.js';
import { VOICE_DECK } from './voiceDeck.js';
import { canonChapterAxes } from './canon/styles.js';
import { canonStyleSettings } from './canon/settings.js';

/** Never dealt into a chapter deck (the creature citizen — mirrors state/rollPool.mjs NEVER_DEALT).
 * #1982: the kana stamps join the citizen in this class — catalogue members
 * (census, atlas), but no chapter deck may deal them as marks; the FIELD
 * director deals them alone, as poem type.
 * #1998: the curated kanji stamps join the same class, on the same terms.
 * #2002: the slice-3 packs (lowercase + punctuation, serif, ornaments) join
 * the same class, on the same terms.
 * #2005: the plate stamps (Fraunces, the clean plate's face) join too.
 * #2150: the glyphs join the same class — the caps/digits pack (poem-only
 * now), the solo text stamps and the pixel letter-anatomy emblems (Q4): no
 * chapter deck deals a letter or digit as a solo asset. The Swiss chapter's
 * CARD keeps its letters (Q6) — a card is a menu visual, not a deck. */
export const CHAPTER_UNDEALT = Object.freeze([
  'creature',
  ...ASSETS_KANA.map((a) => a.id),
  ...ASSETS_KANJI.map((a) => a.id),
  ...ASSETS_LATIN.map((a) => a.id),
  ...ASSETS_SERIF.map((a) => a.id),
  ...ASSETS_ORNAMENTS.map((a) => a.id),
  ...ASSETS_PLATE.map((a) => a.id),
  ...ASSETS_WEAR.map((a) => a.id),
  // #2008: the riso icons join the same class — catalogue members dealt only by the riso field dealer.
  ...ASSETS_RISO.map((a) => a.id),
  // #2150: the glyphs join the same class.
  ...ASSETS_LETTERS.map((a) => a.id),
  ...SOLO_TEXT_STAMP_IDS,
  ...PIXEL_LETTER_ANATOMY_IDS,
]);

/** The deck floor, per axis — the smallest movement chapter the library already deals (see header). */
export const CHAPTER_DECK_MINIMUM = Object.freeze({ looks: 4, voices: 8, assets: 14 });

// The spine, in order (D1). `prev`/`next` are attached from this order below — the order IS the neighbours.
// #2044 — a movement chapter names the ONE Canon style it stands on (`style`) and takes its pointer lists from
// that record (canonChapterAxes): the look group, asset style, asset families and voice style are no longer
// retyped here. The chapter still owns what is the Book's alone: its id, name, spine position and card.
const SPINE = [
  {
    // The primitive chapter. Its pool is authored content (#1854: cave signs, tallies, hands, a beast —
    // the `marks` family/style in assetStyle, the `marks` look group in styleLooks, the ochre/bone/carbon
    // palettes in palettes.js), and it joins here by declaring those axes — derivation does the rest.
    // Its voices are its own family too: #1854 first scoped them to a later call, but the voiceDeck §4
    // law (every look group carries ≥6 family voices) made the group undealable without them, so Matt
    // ruled (2026-10-31) to author the Marks voice family in this slice rather than borrow or exempt.
    id: 'marks',
    name: 'Marks',
    style: 'marks',
    ...canonChapterAxes('marks'),
    card: { paletteId: 'ochre-wall', marks: ['mrk_hand_01', 'mrk_ring_01', 'mrk_beast_01'] },
  },
  {
    id: 'engraving',
    name: 'Engraving',
    style: 'engraved',
    ...canonChapterAxes('engraved'),
    card: { paletteId: 'persona-haeckel', marks: ['hae_radiolarian_01', 'hae_diatom_01', 'hae_medusa_01'] },
  },
  {
    id: 'bauhaus',
    name: 'Bauhaus',
    style: 'bauhaus',
    ...canonChapterAxes('bauhaus'),
    card: { paletteId: 'solar-max', marks: ['geo_tri_01', 'geo_square_03', 'geo_circle_01'] },
  },
  {
    // Swiss is its own group — DIAGONAL GRID lives here, not in Bauhaus. The taxonomy in code is the taxonomy.
    id: 'swiss',
    name: 'Swiss',
    style: 'swiss',
    ...canonChapterAxes('swiss'),
    card: { paletteId: 'transit', marks: ['typ_A', 'typ_B', 'typ_C'] },
  },
  {
    id: 'op-art',
    name: 'Op Art',
    style: 'op',
    ...canonChapterAxes('op'),
    card: { paletteId: 'hydra', marks: ['dot_field_01', 'dot_cluster_01', 'line_hatch_01'] },
  },
  {
    id: 'japan',
    name: 'Japan',
    style: 'japanese',
    ...canonChapterAxes('japanese'),
    card: { paletteId: 'sepia-plate', marks: ['org_petal_01', 'org_leaf_01', 'org_petal_02'] },
  },
  {
    id: 'memphis',
    name: 'Memphis',
    style: 'memphis',
    ...canonChapterAxes('memphis'),
    card: { paletteId: 'neon-brood', marks: ['geo_star4_01', 'geo_star5_01', 'geo_chev_01'] },
  },
  {
    id: 'grunge',
    name: 'Grunge',
    style: 'grunge',
    ...canonChapterAxes('grunge'),
    card: { paletteId: 'dirty', marks: ['stamp_num_01', 'stamp_glyph_01', 'stamp_num_02'] },
  },
  {
    // Now — the instrument's own era: the full library. Its lists are built from the source tables
    // (every look group, every style) so the chapter cannot drift from the library it sums.
    id: 'now',
    name: 'Now',
    style: null, // the whole library — it stands on every Canon style, so it names none
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
      style: c.style ?? null,
      // #2046 — the chapter's applicable settings, drawn from the Canon style it stands on: palette behaviour,
      // motion and feel, measured from the style's own looks and voices (data/canon/settings.js). Deep-frozen.
      // Now stands on the whole library and names no style, so it carries none (null) — it narrows nothing.
      settings: c.style ? canonStyleSettings(c.style) : null,
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

/**
 * #2046 — the read-back door: a chapter's applicable settings by id (`{ basis, palette, motion, feel }`), or
 * null when no chapter stands, the id is unknown, or the chapter carries none (Now). What the taste path
 * consults for the standing chapter.
 */
export function chapterSettings(chapterOrId) {
  const c = typeof chapterOrId === 'string' ? chapterById(chapterOrId) : chapterOrId;
  return (c && c.settings) || null;
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
