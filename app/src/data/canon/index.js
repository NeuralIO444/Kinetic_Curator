// data/canon/index.js — #2044 (Canon S1): the resolved style — "show me the Swiss style", whole.
//
// data/canon/styles.js is the declaration (a leaf every catalogue imports). This module is the read side: it
// joins that record to the catalogues that carry the style's members, so one call answers what no file could
// before — a style's looks, voices and palettes together. Membership is derivation, the Book's own rule
// (data/chapters.js): nothing here retypes a look or voice id, so the answer cannot drift from what deals.
//
//   looks     — the style's own Look group (COMPOSITION_PRESETS whose `group` is the style)
//   pairedLooks — looks from OTHER groups that name the style in their `styles` pairing
//   voices    — VOICE_DECK records whose declared `styles` include the style
//   palettes  — the palette ids those looks and voices are paired with, plus the chapter card's, first-seen order
//   chapter   — the Book chapter that stands on the style (null for a style with no chapter yet)
//
// Pure; reads only catalogue data. No render path imports this module.
import { CANON_STYLES, CANON_STYLE_IDS, canonStyleRecord } from './styles.js';
import { COMPOSITION_PRESETS } from '../presets.js';
import { VOICE_DECK } from '../voiceDeck.js';
import { CHAPTERS } from '../chapters.js';

export * from './styles.js';

const uniq = (xs) => [...new Set(xs.filter((x) => typeof x === 'string' && x))];

/** The chapter record that stands on a style (the movement chapter naming it), or null. */
export function canonChapterForStyle(styleId) {
  return CHAPTERS.find((c) => c.style === styleId) || null;
}

/**
 * One style, whole: the declared record plus its resolved members (ids, catalogue order).
 * Null for an unknown id. The catalogues are injectable for tests; the app passes none.
 */
export function canonStyle(id, { looks = COMPOSITION_PRESETS, deck = VOICE_DECK } = {}) {
  const record = canonStyleRecord(id);
  if (!record) return null;
  const own = looks.filter((l) => l.group === id);
  const paired = looks.filter((l) => l.group !== id && (l.styles || []).includes(id));
  const voices = deck.filter((v) => (v.styles || []).includes(id));
  const chapter = canonChapterForStyle(id);
  return {
    ...record,
    looks: own.map((l) => l.id),
    pairedLooks: paired.map((l) => l.id),
    voices: voices.map((v) => v.id),
    palettes: uniq([
      ...own.map((l) => l.paletteId),
      ...voices.map((v) => v.def && v.def.paletteId),
      chapter ? chapter.card.paletteId : null,
    ]),
    chapter: chapter ? chapter.id : null,
  };
}

/** Every style, resolved, in declaration order. */
export function canonStyles(data) {
  return CANON_STYLE_IDS.map((id) => canonStyle(id, data));
}

/** The Canon style a look belongs to (its Look group, when that group is a style), or null. */
export function canonStyleOfLook(lookId, looks = COMPOSITION_PRESETS) {
  const l = looks.find((p) => p.id === lookId);
  return l && canonStyleRecord(l.group) ? l.group : null;
}

/** The styles a look declares it pairs with (its `styles`, Canon ids only), or [] for an unknown look. */
export function canonPairingOfLook(lookId, looks = COMPOSITION_PRESETS) {
  const l = looks.find((p) => p.id === lookId);
  return l ? (l.styles || []).filter((s) => canonStyleRecord(s)) : [];
}

/** The styles a deck voice declares (Canon ids only), or [] for an unknown voice. */
export function canonStylesOfVoice(voiceId, deck = VOICE_DECK) {
  const v = deck.find((d) => d.id === voiceId);
  return v ? (v.styles || []).filter((s) => canonStyleRecord(s)) : [];
}

export { CANON_STYLES };
