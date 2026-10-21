// surgeLive.js — #1576 Q3 (RULED by Matt, 2026-10-20): the surge trigger is the third persona's taste call.
//
// Design-doc reference only (KC-1 DS rule 10): she is never named on a surface, and her decision never renders —
// the surge IS the motion. This module turns her validated decision into the one input the P3 machinery waits
// behind: the standing surge trigger { id, amount, atMs } on the store, which liveLoop stamps on every resolver
// input, so a take RECORDS each surge and replays it exactly — the resolver never decides one (engine/travel.js
// noteSurge only notes what the input carries).
//
//   - mind:decision (persona queen, reply.surge > 0)   a surge, at most one per phrase (PHRASE_BARS), stamped at
//                                                      the loop time it lands on
//   - a decision replayed from a take (cause 'replay')  ignored: the take's own input log already carries it
//
// Determinism: nothing here reads a wall clock or a die — a stamp is a pure function of the decision events (their
// bar and intensity) and the loop clock the frame reported.
import { on, Events } from '../composition/eventBus.js';
import { PHRASE_BARS } from './paceLive.js';

/** The fewest bars between two surges: one phrase. A surge every bar is a gimmick, not a taste call. */
export const SURGE_MIN_BARS = PHRASE_BARS;

/**
 * Pure decision step: given the last stamped bar (or null) and a validated decision, the next trigger or null.
 * Exported for the selfcheck.
 */
export function surgeFromDecision(decision, lastBar, nextId, nowMs) {
  if (!decision || decision.persona !== 'queen' || !decision.reply || typeof decision.reply !== 'object') return null;
  const amount = Number(decision.reply.surge);
  if (!Number.isFinite(amount) || !(amount > 0)) return null;
  const bar = Number.isInteger(decision.bar) ? decision.bar : null;
  if (bar !== null && lastBar !== null && bar - lastBar < SURGE_MIN_BARS && bar >= lastBar) return null;
  return { id: nextId, amount: Math.min(1, amount), atMs: Number.isFinite(nowMs) ? nowMs : 0, bar };
}

/**
 * @param setTrigger (trigger) => void   the store write (globalSlice.setSurgeTrigger)
 * @param getLoopMs  () => number        the loop clock at the frame (gl/loopClock.js mirror)
 * @param getLastId  () => number        the last stamped id (so ids keep counting across restarts of this module)
 * @returns stop()
 */
export function startSurge({ setTrigger, getLoopMs, getLastId = () => 0 }) {
  let lastBar = null;
  return on(Events.MIND_DECISION, (p, meta) => {
    if (meta && meta.cause === 'replay') return;
    let now;
    try { now = Number(getLoopMs()) || 0; } catch { now = 0; }
    let last;
    try { last = Number(getLastId()) | 0; } catch { last = 0; }
    const t = surgeFromDecision(p, lastBar, last + 1, now);
    if (!t) return;
    lastBar = t.bar;
    try { setTrigger({ id: t.id, amount: t.amount, atMs: t.atMs }); } catch { /* store gone */ }
  });
}
