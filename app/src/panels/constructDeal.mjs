// constructDeal.mjs — WetLab ladder, CONSTRUCT rung (spec §13; issue #2301).
//
// What the CONSTRUCT strip reads and does, apart from React and the store: the KIN press and the CUR funnel over the
// construct adapter (deal/constructAdapter.mjs), which recipe CUR narrows from, and a candidate's record. Pure: no
// clock, no Math.random, no store.
import { press as kineticPress, nextScope, sanitizeScope } from '../deal/kineticEngine.mjs';
import { funnel } from '../deal/curatorEngine.mjs';
import {
  constructAdapter,
  constructKey,
  constructStylesInPlay,
  assembleCandidate,
  CONSTRUCT_FLOOR,
  CONSTRUCT_SCOPES,
  CONSTRUCT_DEFAULT_SCOPE,
} from '../deal/constructAdapter.mjs';
import { sanitizePress } from './wetLabDeal.mjs';

export {
  constructKey,
  constructStylesInPlay,
  assembleCandidate,
  CONSTRUCT_FLOOR,
  CONSTRUCT_SCOPES,
  CONSTRUCT_DEFAULT_SCOPE,
};

/** The line KIN shows when no style is in play (§13.2). */
export const TOO_FEW_LINE = `KEEP ${CONSTRUCT_FLOOR} SHAPES OF ONE STYLE`;

/** One KIN press: recipes from one style's kept shapes. `ctx` = { shelf, findAsset, assetAttach }. */
export function constructKinPress({ scope, seed, press, ctx }) {
  return kineticPress(constructAdapter, {
    scope: sanitizeScope(constructAdapter, scope),
    seed: seed >>> 0,
    press: sanitizePress(press),
    ctx: ctx || {},
  }).hand;
}

/** One CUR press: recipes one change away from the subject. `picked` is marked, not ranked (the read is neutral). */
export function constructCurPress({ subject, seed, press, ctx }) {
  if (!subject || !constructKey(subject)) return { hand: [], picked: null };
  const r = funnel(constructAdapter, subject, {
    cap: 0.25,
    seed: seed >>> 0,
    press: sanitizePress(press),
    ctx: ctx || {},
  });
  return { hand: r.ordered.map((o) => o.candidate), picked: r.picked };
}

/** The scope pill's next step (ANY → each style → ANY). */
export const nextConstructScope = (scope) => nextScope(constructAdapter, scope);

/**
 * The recipe a banked record was built from, as near as the record can say: its style, seed, and the shapes it
 * actually used. Null for a record that is not a construct or uses fewer than CONSTRUCT_FLOOR distinct shapes.
 */
export function recipeOfRecord(record) {
  if (!record || typeof record.style !== 'string' || !Array.isArray(record.parts)) return null;
  const vocabulary = [...new Set(record.parts.map((p) => p && p.asset).filter((a) => typeof a === 'string'))].sort();
  const c = { style: record.style, vocabulary, seed: Number(record.seed) >>> 0 };
  return vocabulary.length >= CONSTRUCT_FLOOR && constructKey(c) ? c : null;
}

/**
 * The recipe CUR narrows from: the one the artist kept last this session, else the recipe of the last banked
 * construct, else the lead of the hand on screen, else none.
 */
export function constructSubject(lastKept, bank, hand) {
  if (lastKept && constructKey(lastKept)) return lastKept;
  const recs = Array.isArray(bank) ? bank : [];
  for (let i = recs.length - 1; i >= 0; i -= 1) {
    const r = recipeOfRecord(recs[i]);
    if (r) return r;
  }
  const lead = Array.isArray(hand) ? hand.find((c) => constructKey(c)) : null;
  return lead || null;
}
