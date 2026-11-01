// chapterWalk.mjs — #1855 (BOOK S2): the landing. A cold KINETIC flip stops dealing from the whole library
// at once: it walks the Book's spine (data/chapters.js) and lands inside ONE chapter, and the sweep's passes
// then deal from that chapter's deck ∩ the START scope's deck. Nothing blends across a chapter line — that
// is the anti-mush wall, and every list this module returns is an intersection, never a borrowing.
//
// The walk's weighting is honest weights + a novelty term (spec §7, the diversity pressure): a chapter
// nobody has visited this session weighs UNVISITED_WEIGHT; a visited chapter weighs 1/visits, so the more a
// chapter has been dealt the less it pulls. S5 (#1858) adds the one further term the spec reserved: the
// per-chapter lean from the imported taste file's histograms (curator/chapterMemory.mjs) — an optional,
// additive bias inside her standing bounds (never negative, never above the +0.06 cap, identity below
// the 8-keeps floor — the derivation owns those laws; this module clamps at the point of application so
// no caller can exceed them). Novelty stays separate and stronger: the largest visited weight is
// 1 + 0.06, the smallest unvisited weight is 3, so the lean can aim the walk but can never wall off the
// book. Still no cost gate (D6 stays out of v1). The path the walk takes is the spine
// traversal from the standing chapter — or from Marks when none stands (D1: the book opens at Marks) —
// through every neighbour to the landing: in a book you get anywhere by passing the adjacent chapters, and
// the path is what the landing card display walks (panels/layout/ChapterCard.jsx).
//
// The deal gate is honest too. A chapter deals at a scope only when its deck ∩ that scope is non-empty on
// ALL THREE axes (looks, voices, assets). Where the intersection is empty at the performer's scope — at OFF
// that is every chapter but Now: their looks are style looks (MED's deck) and their pools are not whole
// curated sets — the chapter re-deals at the nearest wider scope where it has a deck. The START pill itself
// never moves (it is the performer's ceiling, not the deal's), and the landing record + the deck readout
// name the scope the deal was actually made at. The decks grow monotonically along the cycle (33 ⊂ 69 looks,
// 19 ⊂ 72 voices, curated sets ⊂ the library), so the nearest wider scope is the first fit walking forward
// from the performer's scope — and KOZ always fits, because its decks are the whole library and every
// chapter's own deck meets the floor (chapters.selfcheck §6).
//
// Pure: no store, no clock, no Math.random — the caller passes rng, like every dealer (#710).
import { CHAPTERS, chapterById, chapterLooks, chapterVoices, chapterAssets } from '../data/chapters.js';
import { CHAPTER_LEAN_CAP } from '../curator/chapterMemory.mjs'; // #1858: her cap, enforced here
import { SCOPE_CYCLE, sanitizeScope, scopeDecks, CURATED_SETS } from './kineticScope.mjs';
import { dealableRecords } from './rollPool.mjs';
import { ASSETS } from '../data/assets/index.js';

/** The novelty term: an unvisited chapter weighs this much against a once-visited chapter's 1. */
export const UNVISITED_WEIGHT = 3;

/** One chapter's pull on the walk: unvisited chapters pull hardest; every visit halves-ish the pull (1/n). */
export function chapterWeight(visits) {
  const n = Math.max(0, visits | 0);
  return n === 0 ? UNVISITED_WEIGHT : 1 / n;
}

/** One chapter's lean as the walk may apply it: a finite bias clamped into [0, CHAPTER_LEAN_CAP]. */
const leanOf = (lean, id) => {
  const b = lean ? Number(lean[id]) : 0;
  return Number.isFinite(b) ? Math.min(CHAPTER_LEAN_CAP, Math.max(0, b)) : 0;
};

/**
 * The walk's table: every chapter's session visits and weight, in spine order (the coverage ledger's
 * math). With a lean map (chapterMemory's chapterLeanBiases over the imported taste), each weight is
 * novelty + lean and the row names its lean; with none, the table is S2's exactly — same rows, same
 * weights, no lean field.
 */
export function chapterWeights(visits = {}, lean = null) {
  return CHAPTERS.map((c) => {
    const n = Math.max(0, (visits[c.id] || 0) | 0);
    if (!lean) return { id: c.id, visits: n, weight: chapterWeight(n) };
    const bias = leanOf(lean, c.id);
    return { id: c.id, visits: n, weight: chapterWeight(n) + bias, lean: bias };
  });
}

/**
 * Deal one landing: { chapterId, path, weights }. The landing is a weighted choice over the spine (novelty
 * term included); the path is the contiguous spine traversal from `fromId` (the standing chapter, or Marks
 * when none stands) to the landing, in walking order — neighbours only, the ends never wrap.
 */
export function dealLanding(rng, { fromId = null, visits = {}, lean = null } = {}) {
  const weights = chapterWeights(visits, lean);
  const total = weights.reduce((a, w) => a + w.weight, 0);
  let roll = rng() * total;
  let target = weights[weights.length - 1].id;
  for (const w of weights) {
    roll -= w.weight;
    if (roll < 0) {
      target = w.id;
      break;
    }
  }
  const from = chapterById(fromId) || CHAPTERS[0];
  const to = chapterById(target);
  const lo = Math.min(from.position, to.position);
  const hi = Math.max(from.position, to.position);
  const slice = CHAPTERS.slice(lo, hi + 1).map((c) => c.id);
  return { chapterId: target, path: from.position <= to.position ? slice : slice.reverse(), weights };
}

/**
 * The chapter's deck ∩ a scope's deck, axis by axis: { looks, voices, records, sets, poolKind, assetCount }.
 * `records` is the dealable derived record set the pool deals from (the store's — imports included, and an
 * import joins a chapter by its derived style/family exactly like a library asset, because chapters.js
 * derives membership from whatever records it is handed). At a 'sets' scope the pool axis is whole curated
 * sets only: the sets fully contained in the chapter — a set is never dealt in pieces.
 */
export function chapterScopeDeck(chapterId, scope, { records } = {}) {
  const s = scopeDecks(scope);
  const recs = records || dealableRecords(ASSETS);
  const lookIds = new Set(s.looks.map((l) => l.id));
  const voiceIds = new Set(s.voices.map((v) => v.id));
  const looks = chapterLooks(chapterId).filter((l) => lookIds.has(l.id));
  const voices = chapterVoices(chapterId).filter((v) => voiceIds.has(v.id));
  const assetIds = new Set(chapterAssets(chapterId, recs));
  const poolRecords = recs.filter((r) => assetIds.has(r.id));
  const sets = s.pool === 'sets' ? CURATED_SETS.filter((set) => set.every((id) => assetIds.has(id))) : [];
  return {
    looks,
    voices,
    records: poolRecords,
    sets,
    poolKind: s.pool,
    assetCount: s.pool === 'sets' ? new Set(sets.flat()).size : poolRecords.length,
  };
}

/** True when the chapter can deal at this scope: every axis of the intersection is non-empty. */
export function chapterHasDeck(chapterId, scope, ctx) {
  const d = chapterScopeDeck(chapterId, scope, ctx);
  return (
    d.looks.length > 0 && d.voices.length > 0 && (d.poolKind === 'sets' ? d.sets.length > 0 : d.records.length > 0)
  );
}

/**
 * The scope a chapter's deal is actually made at: the performer's scope when the chapter has a deck there,
 * else the nearest wider scope that gives it one. `redealt` says the deal moved — the pill never does.
 */
export function effectiveChapterScope(chapterId, scope, ctx) {
  const start = SCOPE_CYCLE.indexOf(sanitizeScope(scope));
  for (let i = start; i < SCOPE_CYCLE.length; i++) {
    if (chapterHasDeck(chapterId, SCOPE_CYCLE[i], ctx)) return { scope: SCOPE_CYCLE[i], redealt: i !== start };
  }
  return { scope: 'koz', redealt: true }; // unreachable while every chapter's own deck is non-empty (chapters §6)
}

/**
 * The honest deck readout for a standing chapter: what a tap can actually reach inside it, at the scope
 * its deals are made. Null for an unknown chapter — the caller falls back to the plain scope readout.
 */
export function chapterDeckReadout(chapterId, scope, ctx) {
  const c = chapterById(chapterId);
  if (!c) return null;
  const eff = effectiveChapterScope(chapterId, scope, ctx);
  const d = chapterScopeDeck(chapterId, eff.scope, ctx);
  return {
    chapterId: c.id,
    name: c.name,
    assets: d.assetCount,
    looks: d.looks.length,
    voices: d.voices.length,
    dealtScope: eff.scope,
    redealt: eff.redealt,
  };
}
