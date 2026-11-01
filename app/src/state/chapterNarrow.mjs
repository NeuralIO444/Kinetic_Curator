// chapterNarrow.mjs — #1857 (BOOK S4): the notch machine. Once a round has SETTLED inside a chapter
// (S3's kineticRound), CURATOR is meant to stop rolling the whole world and start narrowing inside
// that chapter: chapter → genre → artist-flavoured hand, one notch per press, widening only by an
// explicit step back. This module is the pure machinery for that funnel — the pools, the notch
// state, the readout label, and the keeps-ledger notch context.
//
// D3 STOP: whether the settled board hands this machine to the CURATOR button (the spec's shape)
// or narrowing lives on a different gesture is D3, and D3 is UNRULED. Nothing here is wired:
// curateUnlocked, the store, and the CuratorBar are untouched, and no notch state exists in the
// live app. What is built is everything the ruling does not change — when D3 lands, the wiring
// pass connects a gesture to narrow()/widen() and a pool to the candidate roll, and nothing in
// this file needs to move.
//
// The anchor is the settled deal's look (kineticRound.deal.lookId): the funnel narrows AROUND
// what settled. Genres and hands are DERIVED from the look records' own declared keywords
// (categories, then styles — the Heilbrunn shape the issue names: eras are the spine, movements
// and artists are keywords inside them), the way chapters.js derives decks and assetStyle derives
// style. No authored record is edited and no keyword is invented.
//
//   genre (notch 1) — the anchor's first keyword, in authored order, whose member set inside the
//     chapter is a proper subset of at least 2. A keyword covering the whole chapter narrows
//     nothing and is skipped; a singleton is an artist, not a genre.
//   hand (notch 2) — inside the genre pool: the first remaining keyword whose intersection with
//     the genre pool is a proper subset containing the anchor (a singleton hand is allowed — the
//     funnel may end at the artist alone); failing that, the style-signature subset (same declared
//     styles list) when proper; failing that, this anchor has no hand notch.
//
// Depth is HONEST: pools strictly shrink by construction, so an anchor narrows exactly as far as
// its chapter's data honestly goes — twice, once, or not at all (Engraving's specimen-drawer,
// whose only category covers its whole chapter, does not narrow; the machine says so instead of
// borrowing a neighbour keyword). A press at the floor is refused — the identical object comes
// back — never a silent re-roll at a wider pool. Widening restores the wider pool EXACTLY: the
// pools array is frozen at open and shared by every transition, so a step back returns the same
// array, not a recomputation.
//
// The taste engine is not consulted here and never gates: pools are structure (which looks a
// candidate may be based on); ranking and picking stay the engine's, whole and unchanged.
//
// Pure: no store, no clock, no rng. Membership of a dealt candidate is its composition — the
// CURATOR chain never deals a look today (composition is not a randomizable key), so in settled
// mode a candidate is a chapter member iff it is based on a pool look, which is exactly what
// poolFor()/inPool() answer.
import { chapterById, chapterLooks } from '../data/chapters.js';
import { COMPOSITION_PRESETS } from '../data/presets.js';

export const NOTCH_CHAPTER = 0;
export const NOTCH_GENRE = 1;
export const NOTCH_HAND = 2;
/** The deepest notch the funnel has names for. */
export const NOTCH_MAX = NOTCH_HAND;

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

const freezeState = (s) => {
  for (const p of s.pools) Object.freeze(p);
  Object.freeze(s.pools);
  if (s.genre) Object.freeze(s.genre);
  if (s.hand) Object.freeze(s.hand);
  return Object.freeze(s);
};

/** A look's keyword list, in the order the record declares it: categories, then styles, deduped. */
export function lookKeywords(look) {
  const out = [];
  for (const k of [...(look?.categories || []), ...(look?.styles || [])]) {
    if (typeof k === 'string' && k && !out.includes(k)) out.push(k);
  }
  return out;
}

const memberIds = (looks, keyword) => looks.filter((l) => lookKeywords(l).includes(keyword)).map((l) => l.id);

/**
 * The chapter's genre table: every keyword that honestly narrows this chapter (a proper subset
 * of at least 2), in first-appearance order across the chapter's looks. Backstage inspection —
 * the performer's surface never sees the table, only the one genre their anchor dealt.
 */
export function genreTable(chapterId, { looks } = {}) {
  const c = chapterById(chapterId);
  if (!c) return [];
  const chapterLookList = chapterLooks(c.id, looks);
  const seen = new Set();
  const table = [];
  for (const look of chapterLookList) {
    for (const kw of lookKeywords(look)) {
      if (seen.has(kw)) continue;
      seen.add(kw);
      const members = memberIds(chapterLookList, kw);
      if (members.length >= 2 && members.length < chapterLookList.length) table.push({ keyword: kw, members });
    }
  }
  return table;
}

/**
 * Open a narrowing on a settled board: the chapter + the settled deal's look. Returns the frozen
 * notch state at notch 0 (the chapter pool), or null when there is nothing to narrow — unknown
 * chapter, or an anchor that is not a member of the chapter (a foreign look never anchors a
 * funnel in someone else's chapter).
 *
 * State shape: { chapterId, chapterName, anchorLookId, notch, genre, hand, pools } —
 * genre: { keyword, members } | null; hand: { keyword|null, members } | null;
 * pools: the frozen look-id arrays per notch, strictly shrinking, pools[0] = the chapter.
 */
export function openNarrowing(chapterId, anchorLookId, { looks } = {}) {
  const c = chapterById(chapterId);
  if (!c) return null;
  const chapterLookList = chapterLooks(c.id, looks);
  const anchor = chapterLookList.find((l) => l.id === anchorLookId);
  if (!anchor) return null;

  let genre = null;
  for (const kw of lookKeywords(anchor)) {
    const members = memberIds(chapterLookList, kw);
    if (members.length >= 2 && members.length < chapterLookList.length) {
      genre = { keyword: kw, members };
      break;
    }
  }

  let hand = null;
  if (genre) {
    const genreLooks = chapterLookList.filter((l) => genre.members.includes(l.id));
    for (const kw of lookKeywords(anchor)) {
      if (kw === genre.keyword) continue;
      const sub = memberIds(genreLooks, kw);
      if (sub.length >= 1 && sub.length < genre.members.length) {
        hand = { keyword: kw, members: sub };
        break;
      }
    }
    if (!hand) {
      const sig = JSON.stringify([...(anchor.styles || [])]);
      const sub = genreLooks.filter((l) => JSON.stringify([...(l.styles || [])]) === sig).map((l) => l.id);
      if (sub.length >= 1 && sub.length < genre.members.length) hand = { keyword: null, members: sub };
    }
  }

  const pools = [chapterLookList.map((l) => l.id)];
  if (genre) pools.push(genre.members);
  if (hand) pools.push(hand.members);
  return freezeState({ chapterId: c.id, chapterName: c.name, anchorLookId, notch: NOTCH_CHAPTER, genre, hand, pools });
}

/** How far this anchor honestly narrows: the deepest reachable notch (0, 1 or 2). */
export function narrowDepth(state) {
  return state ? state.pools.length - 1 : 0;
}

/** One notch down. At the floor, the identical object comes back — refused, never re-widened. */
export function narrow(state) {
  if (!state || state.notch >= state.pools.length - 1) return state;
  return freezeState({ ...state, notch: state.notch + 1 });
}

/** One notch back — the explicit widen. At the chapter notch, the identical object comes back. */
export function widen(state) {
  if (!state || state.notch <= NOTCH_CHAPTER) return state;
  return freezeState({ ...state, notch: state.notch - 1 });
}

/**
 * The look ids a candidate may be based on at the current notch. With no deck given, the frozen
 * pool itself. With the live dealt-scope deck's look ids (chapterWalk's chapterScopeDeck), the
 * pool intersected with it, pool order preserved — S2's honest scope composes, not reimplemented.
 */
export function poolFor(state, deckLookIds) {
  if (!state) return [];
  const pool = state.pools[state.notch];
  if (!deckLookIds) return pool;
  const deck = new Set(deckLookIds);
  return pool.filter((id) => deck.has(id));
}

/** Membership: is this look a member of the current notch's pool (optionally deck-intersected)? */
export function inPool(state, lookId, deckLookIds) {
  return poolFor(state, deckLookIds).includes(lookId);
}

/**
 * The readout label for a notch state — parts, plus a default text. The surface vocabulary is
 * chapters and artists, never plumbing (spec §12): notch 0 names the chapter, notch 1 the
 * chapter and its keyword, notch 2 the anchor artist's own name. Pure derivation; the wiring
 * pass decides where it renders (the deck readout area is its home — no new panel).
 */
export function notchLabel(state, { looks = COMPOSITION_PRESETS } = {}) {
  if (!state) return null;
  const chapter = state.chapterName;
  if (state.notch === NOTCH_CHAPTER) return { chapter, keyword: null, artist: null, text: chapter };
  const keyword = state.genre?.keyword ?? null;
  if (state.notch === NOTCH_GENRE) {
    return { chapter, keyword, artist: null, text: keyword ? `${chapter} · ${keyword}` : chapter };
  }
  const artist = looks.find((l) => l.id === state.anchorLookId)?.name ?? state.anchorLookId;
  return { chapter, keyword, artist, text: artist };
}

// ─── The keeps-ledger notch context (issue scope 4) ─────────────────────────
// Schema-additive, the ledgerRow `provenance` pattern (#1507): a keep made while a narrowing
// stands carries { chapter, level, keyword, anchor } beside the row's other fields; a keep made
// with no narrowing standing carries nothing — absent stays absent, and old readers (the Studio
// trainer's hits_bridge.py included) ignore the field whole. S5's per-chapter learning consumes
// exactly this. Nothing stamps it yet: the stamp is wiring, and wiring waits on D3.

/** The notch context for a machine state — what a keep at this notch would record. */
export function notchContextFor(state) {
  if (!state) return null;
  return {
    chapter: state.chapterId,
    level: state.notch,
    keyword: state.notch >= NOTCH_GENRE ? (state.genre?.keyword ?? null) : null,
    anchor: state.anchorLookId,
  };
}

/** Structural check (the isLedgerRow pattern): a claimed notch context must be a real one. */
export function isNotchContext(o) {
  if (!isPlainObject(o)) return false;
  if (typeof o.chapter !== 'string' || !chapterById(o.chapter)) return false;
  if (!Number.isInteger(o.level) || o.level < NOTCH_CHAPTER || o.level > NOTCH_MAX) return false;
  if (o.keyword !== null && (typeof o.keyword !== 'string' || !o.keyword)) return false;
  if (typeof o.anchor !== 'string' || !o.anchor) return false;
  return true;
}

/** Canonical notch context from an untrusted value, or null — absent/garbled stays absent. */
export function sanitizeNotchContext(raw) {
  if (!isNotchContext(raw)) return null;
  return { chapter: raw.chapter, level: raw.level, keyword: raw.keyword ?? null, anchor: raw.anchor };
}
