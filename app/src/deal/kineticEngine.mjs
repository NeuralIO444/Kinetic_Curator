// deal/kineticEngine.mjs — #2232: KINETIC as an engine — the WIDE deal. Pure: no store, no React, no clock, no
// Math.random. A host hands it an adapter (dealAdapter.mjs) and a seed; it returns a hand of candidates.
//
// What it owns: the scope ladder (ordered ceilings, narrowest first; one pill cycles them — the stage's
// OFF → WEAK → MED → KOZ, whatever an editor's own ladder is) and the press: ask the adapter for a wide deal under
// the ceiling, bound what it hands back by a draw budget, drop what the gate refuses, drop duplicates, keep a hand.
// What it does not own: what a candidate is, what "wide" means, and what happens to a hand (the host applies a pick).
// The stage's own KINETIC buttons do not run on this yet (the stage keeps its store actions until Matt orders a change).
import { assertAdapter, clampInt, collectHand } from './dealAdapter.mjs';

/** Matt's ruling (2026-11-16): KIN deals a hand of 6. A named constant, tuned in one place. */
export const WIDE_HAND_SIZE = 6;
/** The draw budget per hand slot: a press reads at most `want × this` candidates (kineticBirths' own 24-for-3). */
export const DRAW_BUDGET_PER_SLOT = 8;
const MAX_HAND = 64;
const MAX_BUDGET = 512;

/** The ladder's ids, narrowest first. */
export const scopeIds = (adapter) => assertAdapter(adapter).scopes.map((s) => s.id);

/** Any stored / dispatched value → a scope id of this adapter's ladder (unknown → its defaultScope). */
export function sanitizeScope(adapter, id) {
  const a = assertAdapter(adapter);
  return a.scopes.some((s) => s.id === id) ? id : a.defaultScope;
}

/** The next scope on the ladder, wrapping (the same one-pill gesture as the stage's START pill). */
export function nextScope(adapter, id) {
  const ids = scopeIds(adapter);
  const i = ids.indexOf(sanitizeScope(adapter, id));
  return ids[(i + 1) % ids.length];
}

/**
 * One KINETIC press: the wide deal.
 * @param adapter  a deal adapter (dealAdapter.mjs)
 * @param opts     { scope, seed, press, handSize, maxDraws, ctx }
 *   seed     the project seed; press the press counter. The hand is a pure function of
 *            (adapter, scope, seed, press, ctx): same in, identical hand out.
 * @returns { scope, hand, draws, stillborn, duplicates, declined } — `declined` when the adapter threw: a quiet
 *   empty hand, never a crash (the standing machinery's law, as kineticBirths).
 */
export function press(adapter, { scope, seed = 0, press: n = 0, handSize, maxDraws, ctx = {} } = {}) {
  const a = assertAdapter(adapter);
  const sc = sanitizeScope(a, scope);
  const want = clampInt(handSize, 1, MAX_HAND, WIDE_HAND_SIZE);
  const budget = clampInt(maxDraws, want, MAX_BUDGET, want * DRAW_BUDGET_PER_SLOT);
  let raw;
  try {
    raw = a.deal(sc, { seed: seed >>> 0, press: n | 0, want, maxDraws: budget, ctx });
  } catch {
    return { scope: sc, hand: [], draws: 0, stillborn: 0, duplicates: 0, declined: true };
  }
  return { scope: sc, ...collectHand(a, raw, { want, budget, ctx }), declined: false };
}
