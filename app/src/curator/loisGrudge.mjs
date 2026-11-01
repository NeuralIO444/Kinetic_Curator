// loisGrudge.mjs — #1858 (BOOK S5): LOIS's grudge — the tally.
//
// Scope 4's tally half. Every cut LOIS spends (BOOK S3) is tallied by the
// genre of the look it killed, backstage, as character: a genre he cuts at
// a sustained high rate is his permaban, and the backstage readout says so.
// The grudge is a RECORD, never a gate — nothing here filters a deal, a
// pool, or a pick (models score and order; they never gate). It lives in
// the feed's world (loisActivity's pattern: its own clock, session state,
// writes nothing to the store, renders nothing itself).
//
// The genre of a cut is the Book's own vocabulary: inside the cut's
// chapter, the killed look's first declared keyword that honestly narrows
// the chapter (chapterNarrow's genreTable — the funnel's genre law). A
// look with no narrowing keyword tallies at chapter grain (genre null) —
// the tally never invents a finer grain than the chapter honestly has.
//
// The record never rewrites: cuts are timestamped lists; being overruled
// appends a reset marker, and a genre's EFFECTIVE cuts are those after
// its last reset ("resets entirely" — and the history stays readable).
// The overrule: a keep whose look's genre is currently permabanned. His
// being overruled is the strongest signal he was wrong, so the ban —
// not just its count — restarts from zero.
//
// Decay (D6, UNRULED): the machinery is built and proven — decayedWeight()
// below, and snapshot() accepts a half-life — but the standing constant is
// null, so the live tally applies NO decay until Matt rules the half-life.
// The ruling changes this one constant and nothing else.
import { genreTable, lookKeywords } from '../state/chapterNarrow.mjs';
import { chapterById, chapterLooks } from '../data/chapters.js';

/** A permaban needs at least this many effective cuts in one genre… */
export const GRUDGE_PERMABAN_MIN_CUTS = 5;
/** …carrying at least this share of all effective cuts. (Builder machinery
 * values — no ruling names them; flagged for Matt's feel check in the S5
 * staging report, not cited as decided anywhere.) */
export const GRUDGE_PERMABAN_SHARE = 0.5;
/** D6 — UNRULED: the grudge's decay half-life, ms. null = no decay applied. */
export const GRUDGE_DECAY_HALF_LIFE_MS = null;

/**
 * The genre a look carries inside its chapter, or null (chapter grain).
 * Unknown chapter / foreign look → null with no opinion either way; the
 * caller distinguishes "no genre" from "not a member" via chapterLooks.
 */
export function genreOfLook(chapterId, lookId) {
  if (!chapterById(chapterId) || typeof lookId !== 'string' || !lookId) return null;
  const look = chapterLooks(chapterId).find((l) => l.id === lookId);
  if (!look) return null;
  const table = new Set(genreTable(chapterId).map((g) => g.keyword));
  for (const kw of lookKeywords(look)) if (table.has(kw)) return kw;
  return null;
}

/** Σ 0.5 ** (age / half-life) over timestamps — the decay machinery (D6's
 * to enable). A non-positive half-life means "no decay": the raw count. */
export function decayedWeight(timestamps, at, halfLifeMs) {
  if (!(halfLifeMs > 0)) return timestamps.length;
  let s = 0;
  for (const ts of timestamps) {
    const age = at - ts;
    s += age <= 0 ? 1 : 0.5 ** (age / halfLifeMs);
  }
  return s;
}

const keyOf = (chapterId, genre) => `${chapterId}::${genre ?? ''}`;

/**
 * The tally. `now` is injectable (tests); the singleton uses the wall
 * clock, exactly the honest-feed pattern — this module is bookkeeping
 * about the performer's session, never replayed state.
 */
export function createGrudgeTally({ now = () => Date.now() } = {}) {
  const entries = new Map(); // key -> { chapterId, genre, cuts: [ts], resets: [ts] }
  const entryFor = (chapterId, genre) => {
    const key = keyOf(chapterId, genre);
    let e = entries.get(key);
    if (!e) {
      e = { chapterId, genre, cuts: [], resets: [] };
      entries.set(key, e);
    }
    return e;
  };
  const lastReset = (e) => (e.resets.length ? e.resets[e.resets.length - 1] : -Infinity);
  const effective = (e) => e.cuts.filter((ts) => ts > lastReset(e));

  /**
   * The standing picture. With a half-life (a number, D6's to rule), each
   * genre's weight is its decayed effective cuts and the permaban judges
   * the decayed values — the ban softens as the cuts age. Without one
   * (the standing GRUDGE_DECAY_HALF_LIFE_MS = null), weight IS the
   * effective count and no cut ever ages out.
   */
  function snapshot({ at = now(), halfLifeMs = GRUDGE_DECAY_HALF_LIFE_MS } = {}) {
    const rows = [];
    for (const e of entries.values()) {
      const eff = effective(e);
      if (!e.cuts.length) continue;
      const weight = decayedWeight(eff, at, halfLifeMs);
      rows.push({
        key: keyOf(e.chapterId, e.genre),
        chapterId: e.chapterId,
        genre: e.genre,
        cuts: e.cuts.length,
        effective: eff.length,
        weight,
        resets: e.resets.length,
        lastCutAt: e.cuts[e.cuts.length - 1],
        permaban: false,
      });
    }
    const totalWeight = rows.reduce((a, r) => a + r.weight, 0);
    for (const r of rows) {
      r.permaban =
        r.weight >= GRUDGE_PERMABAN_MIN_CUTS && totalWeight > 0 && r.weight / totalWeight >= GRUDGE_PERMABAN_SHARE;
    }
    rows.sort((a, b) => b.weight - a.weight || (a.key < b.key ? -1 : 1));
    return {
      rows,
      totalCuts: rows.reduce((a, r) => a + r.cuts, 0),
      totalEffective: rows.reduce((a, r) => a + r.effective, 0),
      permabans: rows.filter((r) => r.permaban),
      decayHalfLifeMs: halfLifeMs,
    };
  }

  /** One spent cut. Returns { chapterId, genre } as tallied, or null when
   * the cut names no real chapter/look (nothing is tallied on air). */
  function noteCut({ chapterId, lookId } = {}) {
    if (!chapterById(chapterId) || typeof lookId !== 'string' || !lookId) return null;
    if (!chapterLooks(chapterId).some((l) => l.id === lookId)) return null;
    const genre = genreOfLook(chapterId, lookId);
    entryFor(chapterId, genre).cuts.push(now());
    return { chapterId, genre };
  }

  /**
   * One keep, judged against the grudge: when the kept look's genre is
   * currently permabanned, the performer has overruled him — that genre's
   * grudge resets entirely. Returns { chapterId, genre } when a reset
   * landed, else null. A keep in any other genre changes nothing.
   */
  function noteKeep({ chapterId, lookId } = {}) {
    if (!chapterById(chapterId) || typeof lookId !== 'string' || !lookId) return null;
    const genre = genreOfLook(chapterId, lookId);
    const e = entries.get(keyOf(chapterId, genre));
    if (!e || !e.cuts.length) return null;
    const row = snapshot().rows.find((r) => r.key === keyOf(chapterId, genre));
    if (!row || !row.permaban) return null;
    e.resets.push(now());
    return { chapterId, genre };
  }

  return { noteCut, noteKeep, snapshot };
}

/** The session's tally — fed by the round wiring (cuts) and the keep doors
 * (overrules); read by the backstage readout. */
export const loisGrudge = createGrudgeTally();

const genreLabel = (r) => {
  const name = chapterById(r.chapterId)?.name ?? r.chapterId;
  return r.genre ? `${r.genre} (${name})` : name;
};

/** One backstage line for the Pipeline (loisSummary's pattern): the bans
 * as character, or the honest absence of one. */
export function grudgeSummary(snap) {
  if (!snap || snap.totalCuts === 0) return 'lois grudge · none — he has cut nothing yet';
  if (!snap.permabans.length)
    return `lois grudge · ${snap.totalEffective} cut${snap.totalEffective === 1 ? '' : 's'} tallied · no permaban`;
  const names = snap.permabans.slice(0, 2).map(genreLabel).join(', ');
  const more = snap.permabans.length > 2 ? ` +${snap.permabans.length - 2} more` : '';
  return `lois grudge · permaban: ${names}${more}`;
}
