// deal/curatorEngine.mjs — #2232: CURATOR as an engine — the NARROW pick. Pure: no store, no React, no clock, no
// Math.random. Same law as the stage's pickCurated and the creature hand's orderBirthHand: taste ORDERS and PICKS.
// It never adds a candidate to a hand it was handed, and it never vetoes what the gate passed.
//
//   narrow(adapter, hand, opts)    score the hand, order it, pick one
//   funnel(adapter, subject, opts) the fine-grained step: ask the adapter for candidates NEAR a subject, gate them,
//                                  then narrow — fewer candidates than the wide deal, all close to the pick
import { assertAdapter, clampInt, collectHand } from './dealAdapter.mjs';

/** Matt's ruling (2026-11-16): CUR deals a hand of 3. A named constant, tuned in one place. */
export const NARROW_HAND_SIZE = 3;
/** How far a near candidate may sit from the subject, 0 < cap ≤ 1. A starting value, tuned in the build (spec §9). */
export const NEAR_CAP_DEFAULT = 0.25;
const DRAW_BUDGET_PER_SLOT = 8; // the same budget law as the wide engine (kineticEngine.mjs)
const MAX_HAND = 64;
const MAX_BUDGET = 512;

/** A cap in (0, 1]: above 1 clamps to 1; zero, negative or not a number is the default. */
export function sanitizeCap(cap) {
  if (typeof cap !== 'number' || !Number.isFinite(cap) || cap <= 0) return NEAR_CAP_DEFAULT;
  return Math.min(1, cap);
}

// a key that cannot be read is the empty string: it sorts first and never matches a real key (no crash, no veto)
const keyOf = (a, candidate) => {
  try {
    return String(a.key(candidate));
  } catch {
    return '';
  }
};

const totalOf = (reads) => {
  const t = reads && typeof reads === 'object' ? reads.total : NaN;
  return typeof t === 'number' && Number.isFinite(t) ? t : 0; // a read that is not a number scores 0, it never throws
};

/**
 * Score and order a hand; pick one. The hand is not changed (a fresh array comes back).
 * @param opts { curator, rng, ctx }
 *   curator  optional taste: `pick(ordered, draw) → index` into the ORDERED list. A bad index or a throw falls back to
 *            the top of the order, like pickCurated's fallback. It chooses among what is there; it cannot add or veto.
 *   rng      a function returning [0,1) for the taste to draw from; none → a stream of zeros (no Math.random default,
 *            the audit-3a contract — pickCurated's own).
 * @returns { ordered: [{ candidate, key, reads, total }], picked, tasted } — `picked` is null only for an empty hand;
 *   `tasted` is true when the curator's own index chose.
 */
export function narrow(adapter, hand, { curator = null, rng = null, ctx = {} } = {}) {
  const a = assertAdapter(adapter);
  const scored = (Array.isArray(hand) ? hand : []).map((candidate) => {
    let reads = null;
    try {
      reads = a.read(candidate, ctx);
    } catch {
      reads = null;
    }
    return { candidate, key: keyOf(a, candidate), reads, total: totalOf(reads) };
  });
  // score descending; ties break on the key so the order is a pure function of the hand
  const ordered = scored.sort((x, y) => y.total - x.total || (x.key < y.key ? -1 : x.key > y.key ? 1 : 0));
  if (!ordered.length) return { ordered, picked: null, tasted: false };
  let idx = -1;
  if (curator && typeof curator.pick === 'function') {
    const draw = typeof rng === 'function' ? rng : () => 0;
    try {
      idx = curator.pick(ordered.map((o) => o.candidate), draw);
    } catch {
      idx = -1;
    }
  }
  const tasted = Number.isInteger(idx) && idx >= 0 && idx < ordered.length;
  return { ordered, picked: ordered[tasted ? idx : 0].candidate, tasted };
}

/**
 * The CURATOR funnel: candidates near `subject`, gated, then narrowed.
 * @param opts { cap, seed, press, handSize, maxDraws, curator, rng, ctx }
 * @returns { cap, hand, ordered, picked, tasted, draws, stillborn, duplicates, declined } — the subject itself is never
 *   in its own hand; `declined` when the adapter threw (a quiet empty hand).
 */
export function funnel(adapter, subject, { cap, seed = 0, press = 0, handSize, maxDraws, curator, rng, ctx = {} } = {}) {
  const a = assertAdapter(adapter);
  const c = sanitizeCap(cap);
  const want = clampInt(handSize, 1, MAX_HAND, NARROW_HAND_SIZE);
  const budget = clampInt(maxDraws, want, MAX_BUDGET, want * DRAW_BUDGET_PER_SLOT);
  let raw;
  try {
    raw = a.near(subject, c, { seed: seed >>> 0, press: press | 0, want, maxDraws: budget, ctx });
  } catch {
    return { cap: c, hand: [], ordered: [], picked: null, tasted: false, draws: 0, stillborn: 0, duplicates: 0, declined: true };
  }
  const exclude = [keyOf(a, subject)];
  const got = collectHand(a, raw, { want, budget, ctx, exclude });
  return { cap: c, ...got, ...narrow(a, got.hand, { curator, rng, ctx }), declined: false };
}
