// loisCut.mjs — #1856 (BOOK S3): LOIS judges the round's deal.
//
// His verdict machinery already exists (curator/loisRank.js): scoreLoisHeuristic reads a recipe's
// features (curator/taste.js extractFeatures) against the pool's mean and parts them into glance /
// originality / boldness, and loisVerdict turns the weakest part into one legible line — his pan
// lines are the gates talking: glance under 0.28 is 'No hit at a glance. Out.', originality under
// 0.22 is 'Too close to the pile. Habit.', boldness under 0.30 is 'Cautious or creative, kid.
// Pick one.' When he RANKS, a candidate that draws a pan line simply loses to a better one. A deal
// cannot lose — it stands there, already dealt. So at the table the same verdict, on the dealt
// hand, is a cut: judgeDeal extends the machinery by pointing it at the one hand Davis put down,
// against the mean of the chapter deck it was dealt from (the pile it has to not be too close to).
//
// The cut gates are loisVerdict's own thresholds, named here once (LOIS_CUT_GATES) and cross-pinned
// against loisVerdict's behaviour by the selfcheck: if his lines ever move, this suite says so.
// The reason a cut carries into the round log is loisVerdict's line itself, plus the gate that
// drove it and the measured value against its limit — a reader can re-derive the cut from the
// numbers, the way loisJudge's verdicts carry their provenance (#1508 idiom).
//
// The judge reads the LOOK only: the look is the visible hand (its recipe features are what glance /
// originality / boldness have ever measured), and the voice rides the look in the deal. What a cut
// DOES to the hand — bounce it, trim it — is ruling D2 and lives in the caller's executor; this
// module only answers the prior question: does LOIS spend, and why.
//
// Pure: same params + same deck in, same verdict out. No store, no clock, no RNG, no mutation.

import { extractFeatures } from './taste.js';
import { scoreLoisHeuristic, loisVerdict } from './loisRank.js';

/** The gates, in loisVerdict's own order and at its own thresholds (#1856: the cut is the pan, spent). */
export const LOIS_CUT_GATES = Object.freeze({ glance: 0.28, originality: 0.22, boldness: 0.3 });

const GATE_ORDER = Object.freeze(['glance', 'originality', 'boldness']);

function meanOf(rows) {
  const keys = Object.keys(rows[0]);
  const mean = {};
  for (const k of keys) {
    let s = 0;
    for (const row of rows) s += row[k];
    mean[k] = s / rows.length;
  }
  return mean;
}

/**
 * Judge one dealt hand.
 *   dealParams: the dealt look's recipe params (the pass's landed layoutParams).
 *   deckParams: the params of every look in the chapter deck the hand was dealt from — the pile.
 * Returns { cut, parts, gate, reason }:
 *   cut    — true when a part falls under its gate; LOIS spends.
 *   parts  — the heuristic's { score, glance, originality, boldness } (null when there is no pile).
 *   gate   — { key, value, limit } for the part that drove the cut, else null.
 *   reason — loisVerdict's line for those parts when he cuts; '' when he lets it stand.
 * An empty deck cannot be judged against: no pile, no verdict, no cut.
 */
export function judgeDeal(dealParams, deckParams) {
  const deck = Array.isArray(deckParams) ? deckParams.filter(Boolean) : [];
  if (!dealParams || deck.length === 0) return { cut: false, parts: null, gate: null, reason: '' };
  const mean = meanOf(deck.map((p) => extractFeatures(p)));
  const parts = scoreLoisHeuristic(extractFeatures(dealParams), mean);
  for (const key of GATE_ORDER) {
    if (parts[key] < LOIS_CUT_GATES[key]) {
      return {
        cut: true,
        parts,
        gate: { key, value: parts[key], limit: LOIS_CUT_GATES[key] },
        reason: loisVerdict(parts),
      };
    }
  }
  return { cut: false, parts, gate: null, reason: '' };
}
