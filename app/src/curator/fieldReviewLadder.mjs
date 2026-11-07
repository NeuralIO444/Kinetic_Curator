// fieldReviewLadder.mjs — #2006 SLICE 3: the review loop gets its HAND
// (spec §3.5 the ladder, §3.8 replay/determinism, §4 slice 3; Matt's
// rulings D1 fresh landings only, D2 the loop may CUT, and the
// Sleight-of-Hand amendment: one planned morph, never visible snaps).
//
// Slice 1 measured, slice 2 spoke. Slice 3 ACTS — on the fresh landing
// the rules just judged janky, inside the same store commit that lands
// it, exactly once. The acting decision is the deterministic rules
// table in this module: no backend is consulted, no wall clock is read,
// no dice are rolled — the plan derives from the banked record and the
// landed form alone, so a take that replays the deal commit re-derives
// the identical adjustment beside the identical verdict (§3.8), and the
// settle itself replays because the morph rides the recorded input
// stream (liveLoop's reviewMorph stamp) into the resolver's snapshot.
//
// THE WALK. Rungs run in slice 2's gate-aware order (proposedOrder:
// the failing gate's lead rung first, then the ladder) — the ORDER is
// fixed at the landing's gate; whether a rung APPLIES is re-judged
// against the gate failing when the rung is reached. After every rung
// the landing is RE-MEASURED through slice 1's own reviewLanding on
// the adjusted params (a fresh build of the adjusted item list —
// measures are never projected from the plan), and the walk stops the
// moment the verdict goes clean. Each rung runs at most once; when
// every rung is exhausted and the landing is still janky, the loop
// CUTs (D2): the form never stands, silence, recorded.
//
// THE RUNGS.
//   1 SHRINK — the form's review transform steps its scale by
//      REVIEW_SHRINK_FACTOR (cumulative on the transform record the
//      form carries; the door in poets/fieldForm holds it honest).
//      Acts on the ink-share gates: selfOverlap, markCover, coverage,
//      crop. Never on coverageLow — shrinking a barely-there poem is
//      the opposite of the repair.
//   2 SHIFT — the transform shifts the form inside the dish: the dish
//      centre first, then the three lowest mark-density placements of
//      the form's ink footprint (density read off the same built list's
//      mark boxes — fieldReview.landingMarkBoxes), each re-measured in
//      turn; the first clean placement wins, else the placement with
//      the lowest failing-measure score stands if it beats standing
//      still. Acts on the position gates: markCover, crop,
//      selfOverlap. Candidates are clamped so the ink stays on-dish.
//   4 RE-DEAL — ONE fresh deal through the real deal path (the
//      caller's `redeal`, which draws the next poem stream index
//      avoiding the replaced piece — the dislike chip's machinery).
//      This is the loop's own repair act, recorded as such: D1 permits
//      it because it is not a performer's re-deal (those are never
//      reviewed and never adjusted). The new landing is reviewed once;
//      if it is still janky the walk continues onto it with the rungs
//      that remain (1/2 — a second re-deal is not in the ladder). A
//      re-deal landing silence or a gate refusal fails the rung.
//   5 CUT — the form leaves the commit. verdict 'cut', rung 5.
//
// THE RECORD. The banked record keeps the landing's provenance —
// measures, gate, gates, seed, stream are the LANDING's, untouched —
// and gains `rung` (the resolving rung; 5 on a cut) and the
// `adjustment` extension:
//   { plan, steps: [{ rung, review, measures, verdict }], outcome,
//     final, redeal, morph: { seed, dur } }
// A step is one rung's standing state after it ran: the transform then
// standing (null across a re-deal or the cut), the re-measured
// measures, the verdict then standing. A repaired record's verdict
// stays 'janky' — the judgment of the landing stands; the adjustment
// says what the loop then did about it. Only a cut rewrites the
// verdict. Clean and exempt records never gain an adjustment: they
// stay byte-identical to slices 1–2.
//
// rungOrder CONSUMPTION: NOT consumed in this slice. Slice 2's banked
// voice.rungOrder is a proposal written by an asynchronous voice
// driver AFTER the deal commit banks; the ladder must decide
// synchronously INSIDE the commit, because the commit is the unit of
// replay (§3.8 re-derives the adjustment from the replayed commit —
// a decision that waited on a backend could not re-derive, and a
// replay must never re-ask). Spec §3.7 bounds any model ordering to
// the rules-approved set in any case; the table below IS that set's
// order, walked directly. The voice still SPEAKS the order that ran
// (fieldReviewVoice reads adjustment.plan for acted records).
import { reviewLanding, landingMarkBoxes } from './fieldReview.mjs';
import { proposedOrder, askSeedFor } from './fieldReviewVoice.mjs';
import { sanitizeFieldForm, fieldFormInkBBox, reviewAdjustedForm } from '../poets/fieldForm.js';

/** Rung 1's ruled step: each SHRINK multiplies the type scale by this. */
export const REVIEW_SHRINK_FACTOR = 0.8;

/** The Sleight-of-Hand settle, in SIM milliseconds (the morph rides the
 * loop clock: HELD freezes it, DRAGGING crawls it under #1935). */
export const REVIEW_MORPH_MS = 1000;

const SHRINK_GATES = new Set(['selfOverlap', 'markCover', 'coverage', 'crop']);
const SHIFT_GATES = new Set(['selfOverlap', 'markCover', 'crop']);
const SHIFT_GRID = 4; // candidate placements are read off a 4x4 dish grid
const SHIFT_CANDIDATES = 3; // ...of which the three quietest are tried
const MORPH_SEED_SALT = 0x200603;

const intersectionArea = (a, b) => {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  if (w <= 0) return 0;
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return h <= 0 ? 0 : w * h;
};

/**
 * How badly a measured state fails, as one comparable number: the
 * failing measure's ratio to its gate (> 1 is failing, for every gate —
 * coverageLow inverts, crop's zero limit reads any crossing as 1 + the
 * crossed share). Two janky states compare honestly by it, which is
 * what lets SHIFT keep the best placement it measured.
 */
const scoreOf = (measures, gate, gates) => {
  if (!measures || !gate || !gates) return 0;
  switch (gate) {
    case 'selfOverlap':
      return measures.m1 / gates.selfOverlap;
    case 'markCover':
      return measures.m2 / gates.markCover;
    case 'coverage':
      return measures.m3 / gates.coverageMax;
    case 'coverageLow':
      return measures.m3 > 0 ? gates.coverageMin / measures.m3 : Infinity;
    case 'crop':
      return measures.m4 > 0 ? 1 + measures.m4 : 0;
    default:
      return 0;
  }
};

const morphSeedFor = (record) => (askSeedFor(record) ^ MORPH_SEED_SALT) >>> 0;

/**
 * Walk the ladder for one janky fresh landing. Pure planning over the
 * store's real seams: every (re-)measure is a reviewLanding call on
 * trial params, every re-deal is the caller's real deal path.
 *
 *   state         the store state the deal was dealt FROM
 *   landingParams the commit's landed params (carrying the dealt form)
 *   record        the landing's banked slice-1 record (verdict 'janky')
 *   redeal        () => { form, stream } | null — one fresh deal
 *                 avoiding the replaced piece, or null on silence
 *
 * Returns null when there is nothing honest to do (not a janky judged
 * landing, a form already carrying a transform, or a re-measure the
 * build cannot make — the caller banks the landing unacted, exactly
 * as slices 1–2 left it), else:
 *   { record, cut, form, review, redealt }
 * where `cut` clears the form from the commit; `form` is the re-dealt
 * form when one stands (with `review` its transform, or null); with
 * `form` null, `review` is the transform the standing form gains; and
 * `redealt` says a re-deal LANDED during the walk — even when the
 * walk then cut it. The caller advances the deal counter on `redealt`
 * whatever the outcome: the deal happened, the counter is the log of
 * deals (§3.8), and an uncounted stream would be drawn again by the
 * next deal and named by two landings.
 */
export function runReviewLadder(
  state,
  landingParams,
  record,
  { seed = null, enabledAssets = null, redeal = null } = {},
) {
  if (!record || record.verdict !== 'janky' || !record.measures || !record.gate) return null;
  const form = sanitizeFieldForm(landingParams?.fieldForm);
  if (!form || form.review) return null; // not a plain fresh landing — the loop never touches it twice

  const plan = proposedOrder(record.gate);
  const steps = [];
  let baseForm = form; // the form the transform applies to (the re-deal replaces it)
  let review = null; // the transform standing on baseForm, once a rung writes one
  let lastMeasures = record.measures;
  let lastGate = record.gate;
  let outcome = null;
  let resolvingRung = null;
  let redealt = false;
  let redealInfo = null;

  const standing = () => review ?? { scale: 1, dx: 0, dy: 0 };
  const trial = (trialForm) =>
    reviewLanding(state, { ...landingParams, fieldForm: trialForm }, { seed, enabledAssets, stream: record.stream });

  for (const rung of plan) {
    if (outcome) break;
    if (rung === 5) continue; // the cut is the exhaustion path, below

    if (rung === 1) {
      if (!SHRINK_GATES.has(lastGate)) continue;
      const next = { scale: standing().scale * REVIEW_SHRINK_FACTOR, dx: standing().dx, dy: standing().dy };
      const tr = trial({ ...baseForm, review: next });
      if (!tr || tr.verdict === 'exempt' || !tr.measures) return null;
      review = next;
      steps.push({ rung: 1, review: { ...next }, measures: tr.measures, verdict: tr.verdict });
      lastMeasures = tr.measures;
      lastGate = tr.gate;
      if (tr.verdict === 'clean') {
        outcome = 'repaired';
        resolvingRung = 1;
      }
      continue;
    }

    if (rung === 2) {
      if (!SHIFT_GATES.has(lastGate)) continue;
      const mb = landingMarkBoxes(state, { ...landingParams, fieldForm: baseForm }, { seed, enabledAssets });
      if (!mb) return null;
      const adjusted = review ? reviewAdjustedForm({ ...baseForm, review }) : baseForm;
      const bb = fieldFormInkBBox(adjusted);
      if (!bb) return null;
      const aspect = baseForm.aspect;
      const clampCentre = (tx, ty) => ({
        x: bb.w >= aspect ? aspect / 2 : Math.min(Math.max(tx, bb.w / 2), aspect - bb.w / 2),
        y: bb.h >= 1 ? 0.5 : Math.min(Math.max(ty, bb.h / 2), 1 - bb.h / 2),
      });
      const densityAt = (tx, ty) => {
        const fp = { x0: tx - bb.w / 2, y0: ty - bb.h / 2, x1: tx + bb.w / 2, y1: ty + bb.h / 2 };
        let covered = 0;
        for (const m of mb.marks) covered += intersectionArea(fp, m);
        return covered / (bb.w * bb.h);
      };
      const keyOf = (t) => `${t.x.toFixed(9)}|${t.y.toFixed(9)}`;
      const dishCentre = clampCentre(aspect / 2, 0.5);
      const seen = new Set([keyOf(dishCentre)]);
      const grid = [];
      for (let r = 0; r < SHIFT_GRID; r++) {
        for (let c = 0; c < SHIFT_GRID; c++) {
          const t = clampCentre(((c + 0.5) * aspect) / SHIFT_GRID, (r + 0.5) / SHIFT_GRID);
          const k = keyOf(t);
          if (seen.has(k)) continue;
          seen.add(k);
          grid.push({ t, i: grid.length, d: densityAt(t.x, t.y) });
        }
      }
      grid.sort((a, b) => a.d - b.d || a.i - b.i);
      const candidates = [dishCentre, ...grid.slice(0, SHIFT_CANDIDATES).map((g) => g.t)];
      const curScore = scoreOf(lastMeasures, lastGate, record.gates);
      let best = null;
      for (const cand of candidates) {
        const ddx = cand.x - bb.cx;
        const ddy = cand.y - bb.cy;
        if (Math.abs(ddx) < 1e-12 && Math.abs(ddy) < 1e-12) continue; // standing still is not a rung
        const next = { scale: standing().scale, dx: standing().dx + ddx, dy: standing().dy + ddy };
        const tr = trial({ ...baseForm, review: next });
        if (!tr || tr.verdict === 'exempt' || !tr.measures) return null;
        if (tr.verdict === 'clean') {
          best = { review: next, measures: tr.measures, verdict: 'clean', gate: null, score: 0 };
          break;
        }
        const sc = scoreOf(tr.measures, tr.gate, record.gates);
        if (!best || sc < best.score)
          best = { review: next, measures: tr.measures, verdict: 'janky', gate: tr.gate, score: sc };
      }
      if (best && (best.verdict === 'clean' || best.score < curScore)) {
        review = best.review;
        steps.push({ rung: 2, review: { ...best.review }, measures: best.measures, verdict: best.verdict });
        lastMeasures = best.measures;
        lastGate = best.gate;
        if (best.verdict === 'clean') {
          outcome = 'repaired';
          resolvingRung = 2;
        }
      } else {
        // The rung ran and bought nothing: the trace says so, with the
        // standing state's own measures — trials are planning, not states.
        steps.push({ rung: 2, review: { ...standing() }, measures: lastMeasures, verdict: 'janky' });
      }
      continue;
    }

    if (rung === 4) {
      if (typeof redeal !== 'function' || redealt) continue;
      const rep = redeal();
      if (!rep || !rep.form) {
        // The re-deal landed silence (or the gate refused it): the rung
        // fails and the ladder walks on to the cut with the janky
        // landing still standing.
        steps.push({ rung: 4, review: null, measures: null, verdict: 'janky' });
        continue;
      }
      redealt = true;
      redealInfo = { stream: rep.stream ?? null, poetId: rep.form.poetId, pieceId: rep.form.pieceId };
      baseForm = rep.form;
      review = null;
      const tr = trial(rep.form);
      if (!tr) return null;
      steps.push({ rung: 4, review: null, measures: tr.measures, verdict: tr.verdict });
      if (tr.verdict === 'clean' || tr.verdict === 'exempt') {
        // Clean: repaired. Exempt: the new form (a plate, say) is beyond
        // the loop's jurisdiction by ruling — the janky poem is gone
        // and what replaced it may not be touched. Either way the
        // ladder's work is done.
        outcome = 'repaired';
        resolvingRung = 4;
      } else {
        lastMeasures = tr.measures;
        lastGate = tr.gate;
      }
      continue;
    }
  }

  if (!outcome) {
    steps.push({ rung: 5, review: null, measures: lastMeasures, verdict: 'janky' });
    outcome = 'cut';
    resolvingRung = 5;
  }

  const final =
    outcome === 'repaired' && review && (review.scale !== 1 || review.dx !== 0 || review.dy !== 0)
      ? { ...review }
      : null;
  const adjustment = {
    plan: [...plan],
    steps,
    outcome,
    final,
    redeal: redealInfo,
    morph: { seed: morphSeedFor(record), dur: REVIEW_MORPH_MS },
  };
  const outRecord = { ...record, rung: resolvingRung, adjustment };
  if (outcome === 'cut') outRecord.verdict = 'cut';
  return {
    record: outRecord,
    cut: outcome === 'cut',
    form: outcome === 'cut' ? null : redealt ? baseForm : null,
    review: final,
    redealt,
  };
}
