// chapterMemory.mjs — #1858 (BOOK S5): the runtime side of the taste file's
// chapters extension — the per-chapter keep/pass histograms the Studio
// trainer distils from the keep/pass ledgers (studio/curator.py
// build_chapter_memory) and the walk consumes (state/chapterWalk.mjs).
//
// What lives here: the trust-boundary validation of the extension
// (validateTaste calls it), the derivation of the per-chapter lean from a
// validated extension, and the backstage line that states which memory
// produced it. What does NOT live here: any learning. Nothing in the app
// trains; the histogram arrives in the imported file or not at all.
//
// Her bounds, applied to a new surface: the lean is a bias, never a gate —
// it is >= 0 always (she never demotes a chapter) and capped at the same
// +0.06 the rank bias has always had; below the same 8-keeps floor she is
// identity. The constants are named here and CROSS-PINNED BY VALUE against
// queenLean.mjs (M1_BIAS / MIN_KEEPS) in chapterMemory.selfcheck — the
// loisCut precedent (LOIS_CUT_GATES): this module may not import the hidden
// modules (the deniability import graph), so the numbers agree by test,
// not by reference.
import { chapterById } from '../data/chapters.js';

export const CHAPTER_MEMORY_VERSION = 1;
/** The lean's cap — the M1 rank bias's own bound, cross-pinned by the selfcheck. */
export const CHAPTER_LEAN_CAP = 0.06;
/** Identity below this many counted keeps — MIN_KEEPS' floor, cross-pinned. */
export const CHAPTER_MEMORY_MIN_KEEPS = 8;
/** Pseudo-observations at the global rate that shrink each chapter's rate:
 * a chapter with one lucky keep has an opinion, not a conviction. */
export const CHAPTER_LEAN_PRIOR = 4;

const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const NOTCH_LEVEL_KEYS = new Set(['0', '1', '2']);
const MAX_WEIGHT = 1e7;

/**
 * Validate the file's chapters extension (a trust boundary: it comes from a
 * file). Returns a clean copy with ONLY what the app reads, or null when the
 * section is unreadable — validateTaste then keeps the taste and drops the
 * section (the #1140 queen-section law: a garbled memory neutralizes the
 * lean, it never refuses the heads that exist).
 *
 * Teeth: the version must be this one; the memory declaration must be real
 * (recency names a positive half-life); chapter ids must be the Book's own;
 * notch levels must be real notches; every weight finite and >= 0; and the
 * arithmetic must cohere — byChapter sums may not exceed the counted totals,
 * and byNotch sums may not exceed their chapter. A file that lies about its
 * own counts is not a memory, it is a forgery.
 */
export function validateChapterMemory(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.version !== CHAPTER_MEMORY_VERSION) return null;
  const mem = raw.memory;
  if (!mem || typeof mem !== 'object' || Array.isArray(mem)) return null;
  if (mem.kind !== 'recency' && mem.kind !== 'canon') return null;
  let halfLifeDays = null;
  if (mem.kind === 'recency') {
    if (!finite(mem.halfLifeDays) || mem.halfLifeDays <= 0 || mem.halfLifeDays > 36500) return null;
    halfLifeDays = mem.halfLifeDays;
  }
  const tot = raw.totals;
  if (!tot || typeof tot !== 'object' || Array.isArray(tot)) return null;
  const totals = {};
  for (const k of ['keeps', 'passes']) {
    if (!Number.isInteger(tot[k]) || tot[k] < 0 || tot[k] > 1e9) return null;
    totals[k] = tot[k];
  }
  const pair = (v) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    if (!finite(v.keeps) || !finite(v.passes)) return null;
    if (v.keeps < 0 || v.passes < 0 || v.keeps > MAX_WEIGHT || v.passes > MAX_WEIGHT) return null;
    return { keeps: v.keeps, passes: v.passes };
  };
  if (!raw.byChapter || typeof raw.byChapter !== 'object' || Array.isArray(raw.byChapter)) return null;
  const byChapter = {};
  let sumK = 0;
  let sumP = 0;
  for (const [id, v] of Object.entries(raw.byChapter)) {
    if (!chapterById(id)) return null;
    const p = pair(v);
    if (!p) return null;
    byChapter[id] = p;
    sumK += p.keeps;
    sumP += p.passes;
  }
  if (sumK > totals.keeps + 1e-6 || sumP > totals.passes + 1e-6) return null;
  const byNotch = {};
  if (raw.byNotch != null) {
    if (typeof raw.byNotch !== 'object' || Array.isArray(raw.byNotch)) return null;
    for (const [id, levels] of Object.entries(raw.byNotch)) {
      if (!chapterById(id) || !levels || typeof levels !== 'object' || Array.isArray(levels)) return null;
      const cleanLevels = {};
      let lk = 0;
      let lp = 0;
      for (const [lv, v] of Object.entries(levels)) {
        if (!NOTCH_LEVEL_KEYS.has(lv)) return null;
        const p = pair(v);
        if (!p) return null;
        cleanLevels[lv] = p;
        lk += p.keeps;
        lp += p.passes;
      }
      const ch = byChapter[id];
      if (!ch || lk > ch.keeps + 1e-6 || lp > ch.passes + 1e-6) return null;
      byNotch[id] = cleanLevels;
    }
  }
  return {
    version: CHAPTER_MEMORY_VERSION,
    memory: { kind: mem.kind, halfLifeDays },
    totals,
    byChapter,
    byNotch,
  };
}

/**
 * The per-chapter lean for the walk: { chapterId: bias } with every bias in
 * [0, CHAPTER_LEAN_CAP], or null when she has no per-chapter opinion —
 * no extension, or fewer counted keeps than the floor (identity, exactly
 * the M1 law), or no observations at all.
 *
 * The rate is fictitious play's empirical frequency, shrunk toward the
 * global rate by the prior: rate = (keeps + PRIOR * global) / (obs + PRIOR).
 * A chapter's bias is the cap times its rate — saturation at the cap is
 * arithmetic (a rate cannot exceed 1), not a clamp applied after the fact.
 */
export function chapterLeanBiases(ext) {
  if (!ext || typeof ext !== 'object') return null;
  const totals = ext.totals || {};
  if (!(Number(totals.keeps) >= CHAPTER_MEMORY_MIN_KEEPS)) return null;
  const by = ext.byChapter || {};
  let gk = 0;
  let gp = 0;
  for (const v of Object.values(by)) {
    gk += Number(v.keeps) || 0;
    gp += Number(v.passes) || 0;
  }
  if (!(gk + gp > 0)) return null;
  const globalRate = gk / (gk + gp);
  const out = {};
  for (const [id, v] of Object.entries(by)) {
    if (!chapterById(id)) continue;
    const keeps = Number(v.keeps) || 0;
    const obs = keeps + (Number(v.passes) || 0);
    if (!(obs > 0)) continue;
    const rate = (keeps + CHAPTER_LEAN_PRIOR * globalRate) / (obs + CHAPTER_LEAN_PRIOR);
    out[id] = Math.min(CHAPTER_LEAN_CAP, Math.max(0, CHAPTER_LEAN_CAP * rate));
  }
  return Object.keys(out).length ? Object.freeze(out) : null;
}

const fmtDays = (d) => (finite(d) ? `${Math.round(d * 10) / 10}d` : '—');

/**
 * One backstage line for the Pipeline (tasteSummary's pattern): which
 * memory the current lean plays from — recency and its half-life, or
 * canon — and the chapter it leans hardest toward. No silent drift of the
 * instrument's taste: the declaration in the file is the declaration on
 * the readout.
 */
export function chapterMemorySummary(taste) {
  const ext = taste && taste.chapters;
  if (!ext) return 'book memory · none — chapter landings run on novelty alone';
  const mem = ext.memory || {};
  const memline = mem.kind === 'canon' ? 'canon · all-time' : `recency · half-life ${fmtDays(mem.halfLifeDays)}`;
  const keeps = Number(ext.totals?.keeps) || 0;
  const passes = Number(ext.totals?.passes) || 0;
  const biases = chapterLeanBiases(ext);
  if (!biases)
    return `book memory · ${memline} · ${keeps} keeps counted — under the ${CHAPTER_MEMORY_MIN_KEEPS}-keep floor, no lean yet`;
  let top = null;
  for (const [id, bias] of Object.entries(biases)) if (!top || bias > top.bias) top = { id, bias };
  const name = chapterById(top.id)?.name ?? top.id;
  return `book memory · ${memline} · ${keeps} keeps / ${passes} passes counted · leans ${name} +${top.bias.toFixed(2)}`;
}
