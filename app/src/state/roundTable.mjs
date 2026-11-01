// roundTable.mjs — #1856 (BOOK S3): the round. One KINETIC engagement is a round at a four-sided table:
// Davis deals, LOIS spends at most one cut, the performer plays last. Today the personas act in parallel
// on separate surfaces and nothing sequences them; this module is the sequencing — a pure state machine
// over the deal S2's landing produces (state/chapterWalk.mjs, state/slices/layoutSlice.js). Moves are
// sequential, public, and never blended: the deal is a fixed object, LOIS's slot is a fixed slot after
// the deal, and a deal that completes the round settles and locks.
//
// The table has three public sides and the record names only their business: who dealt (the deal
// snapshot), who has moved (the log), what was cut (the cut record, with its one legible reason).
// There is no fourth move in this module and no field that could carry one.
//
// Phases: dealt → judging → standing → settled → closed.
//   dealt    the deal is complete (look + voice, chapter-scoped) and frozen; LOIS's slot has not opened.
//   judging  the slot is open. The deal stays frozen; LOIS may spend her one cut or pass.
//   standing the slot is closed and the standing deal is final — the original hand, or the hand the
//            cut left behind. Nothing in this phase can re-open the slot: the one-cut law is the phase
//            graph, not a counter a caller could talk the machine out of.
//   settled  the lock is on. It stops re-dealing, not playing: warm taps are absorbed without effect
//            (absorbWarmTap), and the only way out is a fresh flip (closeRound) — a lock that can be
//            spammed open means nothing.
//   closed   terminal. Outcome is 'settled' or 'unsettled'; an interrupted round (flip or CHAOS before
//            the settle) shows no settle in its log — honest signals only.
//
// Two rulings stay OUT of this module by design, and the module is shaped so neither can be smuggled in
// as a default:
//   D2 (the cut's shape — bounce-and-redeal vs trim) lives in the cut's EXECUTOR: spendCut takes the
//      post-cut deal as data from its caller and installs it, frozen. The machine enforces the law
//      around the spend (one per round, only in the slot, never silent); it does not know what the
//      spend did to the hand, beyond the before/after snapshots the log keeps.
//   D4 (the settle trigger — automatic on completion vs the performer's lock gesture) lives in the
//      CALLER of settle(): the machine only guarantees settle() lands from 'standing' and is refused,
//      untouched, from every earlier phase — so no caller, automatic or gestural, can settle a
//      partial round.
//
// Pure: no store, no clock, no RNG. Every transition returns a NEW frozen round, or the SAME round
// object (===) when the move is refused — refusal is detectable, never silent state corruption.

/** The phases, in table order. */
export const ROUND_PHASES = Object.freeze(['dealt', 'judging', 'standing', 'settled', 'closed']);

/** The ways a round can end: a fresh flip, the CHAOS escape, or the launch opener leaving the book. */
export const ROUND_CLOSE_VIAS = Object.freeze(['flip', 'chaos', 'opener']);

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

const handOf = (deal) => ({ lookId: deal?.lookId ?? null, voiceId: deal?.voiceId ?? null });

function next(round, patch, logEntry) {
  return deepFreeze({
    ...round,
    ...patch,
    log: logEntry ? [...round.log, logEntry] : round.log,
  });
}

/**
 * Open a round on a completed deal. `deal` is the caller's snapshot of the hand Davis dealt —
 * { chapterId, lookId, voiceId, dealtScope, redealt, ... } — and it is frozen on entry: from here
 * the hand is a fixed object and Davis cannot re-deal it (a re-deal is a new round, via a fresh flip).
 * The round opens on the COMPLETED deal (look + voice both landed): a half-dealt hand cannot be
 * judged or frozen, so the look→voice interval is Davis still dealing, not a round in progress.
 */
export function openRound({ seq = 0, chapterId, deal } = {}) {
  if (!deal || typeof deal !== 'object') throw new TypeError('openRound: a round opens on a deal');
  if (!chapterId) throw new TypeError('openRound: a round names its chapter');
  const frozenDeal = deepFreeze(deal);
  return deepFreeze({
    seq,
    chapterId,
    phase: 'dealt',
    deal: frozenDeal,
    cut: null,
    settled: false,
    log: [{ type: 'deal', chapterId, ...handOf(frozenDeal) }],
  });
}

/** Open LOIS's slot. Only from 'dealt'; the deal does not move — that is the point of the slot. */
export function openJudgement(round) {
  if (round.phase !== 'dealt') return round;
  return next(round, { phase: 'judging' }, { type: 'judging' });
}

/**
 * LOIS passes: the slot closes with the deal untouched. Her pass is a move and is logged as one —
 * the table records that she looked and let it stand.
 */
export function passCut(round) {
  if (round.phase !== 'judging' || round.cut) return round;
  return next(round, { phase: 'standing' }, { type: 'pass' });
}

/**
 * LOIS spends her one cut. `verdict` is the judge's word (curator/loisCut.mjs): { reason, gate, value,
 * limit } — the reason is required and non-empty, because LOIS may not cut silently (spec §4: she may
 * not propose, cut twice, or cut silently). `deal` is the post-cut hand the caller's executor produced
 * (D2's shape lives there, not here); it is installed frozen as the standing deal, and the cut record
 * keeps the before/after hands so the spend stays inspectable.
 *
 * One-cut law, structurally: this lands only from 'judging' with no cut yet spent, and it lands in
 * 'standing' — a phase no transition leaves back to 'judging'. There is no path to a second spend.
 */
export function spendCut(round, { verdict, deal } = {}) {
  if (round.phase !== 'judging' || round.cut) return round;
  if (!verdict || typeof verdict.reason !== 'string' || verdict.reason.trim() === '') return round;
  if (!deal || typeof deal !== 'object') return round;
  const after = deepFreeze(deal);
  const cut = deepFreeze({
    reason: verdict.reason,
    gate: verdict.gate ?? null,
    value: verdict.value ?? null,
    limit: verdict.limit ?? null,
    before: round.deal,
    after,
  });
  return next(
    round,
    { phase: 'standing', deal: after, cut },
    { type: 'cut', reason: cut.reason, gate: cut.gate, before: handOf(cut.before), after: handOf(after) },
  );
}

/**
 * Settle the round: the lock goes on. Lands only from 'standing' — a round that has not completed
 * (still dealt, still being judged) cannot settle no matter who asks, so the settle signal can only
 * ever fire on a completed round. Who calls this, and when, is ruling D4; the machine's part of the
 * honesty is that the call cannot succeed early.
 */
export function settle(round) {
  if (round.phase !== 'standing') return round;
  return next(round, { phase: 'settled', settled: true }, { type: 'settle' });
}

/**
 * A warm tap lands on the table. It never unlocks, never re-opens, never moves the deal: warm taps
 * are the inside-chapter cadence (S2) and the settled board is the standing piece they play on.
 * This is a named no-op on purpose — the wiring calls it so the law "warm taps do not unlock" is a
 * property of the machine the suite can pin, not a hope about the caller.
 */
export function absorbWarmTap(round) {
  return round;
}

/**
 * Close the round. The only exit from 'settled' — unlocking costs a fresh flip — and the exit from
 * every earlier phase too (a re-flip or the CHAOS escape interrupts the round). Outcome is read off
 * the record, not asserted by the caller: 'settled' iff the lock ever landed.
 */
export function closeRound(round, via) {
  if (round.phase === 'closed' || !ROUND_CLOSE_VIAS.includes(via)) return round;
  const outcome = round.settled ? 'settled' : 'unsettled';
  return next(round, { phase: 'closed' }, { type: 'close', via, outcome });
}
