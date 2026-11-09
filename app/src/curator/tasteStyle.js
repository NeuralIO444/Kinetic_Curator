// tasteStyle.js — #2044 (Canon S1): taste's style dimension.
//
// Taste spoke recipes and numbers only: "Matt favours op art" was not a thing the system could hold, and keeps
// could not be counted by style or chapter. This module is that dimension, in three pure pieces:
//
//   styleContextFor(state)   — the Canon style identity of what is on stage, stamped onto a keep/pass record
//                              by captureFavorite (the notch-context pattern, state/chapterNarrow.mjs)
//   sanitize / isStyleContext — the ledger's trust boundary for that stamp (curator/tasteLedger.js)
//   styleTerms / keepsByStyle — the style term of the taste vocabulary, and the aggregation over ledger rows
//
// The stamp, when present: { id, pairs, voice, chapter }
//   id      — the Canon style of the dealt Look (its Look group), or null when the Look's group is not a style
//   pairs   — every Canon style the dealt Look declares it pairs with (its `styles`), in the Look's order
//   voice   — the Canon styles of the dealt voice (a voice may carry two — swarm is memphis + japanese)
//   chapter — the Book chapter standing on `id` (null when `id` is null or the style has no chapter)
// Honesty rules, the ledger's own: absent stays absent. A record with no known Look and no known voice gets no
// stamp at all; nothing is guessed from the cast, the palette or dwell. `id` is never promoted from `pairs`.
//
// NOT here, on purpose: the trained taste head's feature vector (curator/recipeFeatures.js) is unchanged. Adding
// a key there is a FEATURES_VERSION bump, and every trained taste.json then refuses to load until retrained.
// styleTerms() speaks the same `key=value` term rule (tasteTerms.fixture.json) so that move is one line when
// Matt orders it — it is not taken silently by a data refactor.
import {
  isCanonStyle,
  canonStyleOfLook,
  canonPairingOfLook,
  canonStylesOfVoice,
  canonChapterForStyle,
} from '../data/canon/index.js';

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const styleList = (v) =>
  Array.isArray(v) && v.every((s) => typeof s === 'string' && isCanonStyle(s)) && new Set(v).size === v.length;

/** The style stamp for a recipe: the dealt Look id and (optionally) the dealt voice id. Null when neither is known. */
export function styleContextOf({ lookId, voiceId } = {}) {
  const pairs = typeof lookId === 'string' ? canonPairingOfLook(lookId) : [];
  const voice = typeof voiceId === 'string' ? canonStylesOfVoice(voiceId) : [];
  const id = typeof lookId === 'string' ? canonStyleOfLook(lookId) : null;
  if (!id && !pairs.length && !voice.length) return null;
  const chapter = id ? canonChapterForStyle(id) : null;
  return { id, pairs, voice, chapter: chapter ? chapter.id : null };
}

/**
 * The style stamp for the live store state (captureFavorite's argument): the Look is the standing composition,
 * the voice is the one the KINETIC voice pass dealt (falling back to a loaded deck voice). Never throws.
 */
export function styleContextFor(state) {
  if (!state) return null;
  try {
    return styleContextOf({
      lookId: state.layoutParams?.composition ?? null,
      voiceId: state.kineticVoiceId ?? state.activeVoiceId ?? null,
    });
  } catch {
    return null;
  }
}

/** Structural check (the isLedgerRow pattern): a claimed style stamp must be a real one. */
export function isStyleContext(o) {
  if (!isPlainObject(o)) return false;
  if (o.id !== null && !(typeof o.id === 'string' && isCanonStyle(o.id))) return false;
  if (!styleList(o.pairs) || !styleList(o.voice)) return false;
  if (o.id === null && !o.pairs.length && !o.voice.length) return false;
  if (o.chapter !== null && (typeof o.chapter !== 'string' || !o.chapter)) return false;
  // The chapter is derived from the style, never free text: it must be the chapter standing on `id`.
  const chapter = o.id ? canonChapterForStyle(o.id) : null;
  if (o.chapter !== (chapter ? chapter.id : null)) return false;
  return true;
}

/** Canonical style stamp from an untrusted value, or null — absent/garbled stays absent. */
export function sanitizeStyleContext(raw) {
  if (!isStyleContext(raw)) return null;
  return { id: raw.id, pairs: [...raw.pairs], voice: [...raw.voice], chapter: raw.chapter };
}

/**
 * The style terms of a stamp, in the taste vocabulary's one term rule (`key=value`; arrays one term per
 * element; nulls skipped — tasteTerms.fixture.json). [] for no stamp.
 */
export function styleTerms(ctx) {
  const c = sanitizeStyleContext(ctx);
  if (!c) return [];
  return [
    ...(c.id ? [`style=${c.id}`] : []),
    ...c.pairs.map((s) => `stylePairs=${s}`),
    ...c.voice.map((s) => `voiceStyle=${s}`),
    ...(c.chapter ? [`chapter=${c.chapter}`] : []),
  ];
}

/** The axes keepsByStyle can count along. */
export const STYLE_AXES = Object.freeze(['id', 'pairs', 'voice', 'chapter']);

/**
 * Count ledger rows by style. `axis`: 'id' (the dealt Look's style — the default), 'pairs', 'voice', or
 * 'chapter'. Returns { counts: { <style|chapter>: n }, unstyled: n, total: n }. A row with no stamp, or with
 * nothing on the asked axis, is counted in `unstyled` — never dropped, never guessed. On the array axes a row
 * counts once for each style it carries.
 */
export function keepsByStyle(rows, axis = 'id') {
  if (!STYLE_AXES.includes(axis)) throw new Error(`keepsByStyle: unknown axis ${axis}`);
  const counts = {};
  let unstyled = 0;
  let total = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    total++;
    const c = sanitizeStyleContext(row && row.style);
    const v = c ? c[axis] : null;
    const keys = Array.isArray(v) ? v : v ? [v] : [];
    if (!keys.length) {
      unstyled++;
      continue;
    }
    for (const k of keys) counts[k] = (counts[k] || 0) + 1;
  }
  return { counts, unstyled, total };
}
