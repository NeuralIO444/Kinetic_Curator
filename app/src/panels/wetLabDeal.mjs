// wetLabDeal.mjs — #2232 step 3: what the WetLab's KIN strip reads and does, apart from React and the store.
//
// The strip runs the KINETIC engine over the creature adapter (deal/creatureAdapter.mjs); this file is the glue that
// turns the lab's data into the adapter's `ctx`, and the three small facts the strip needs besides: a tile's drawing,
// the press counter's legal range, and which banked creatures are "unkept" (ruling Q4). Pure: no clock, no Math.random.
import { press as kineticPress, nextScope, sanitizeScope } from '../deal/kineticEngine.mjs';
import { funnel } from '../deal/curatorEngine.mjs';
import { creatureAdapter, CREATURE_SCOPES, CREATURE_DEFAULT_SCOPE } from '../deal/creatureAdapter.mjs';
import { dealableRecords } from '../state/rollPool.mjs';
import { creatureTileId } from '../engine/creatureTileId.js';

export { CREATURE_SCOPES };
/** Where the strip's width pill opens: the adapter's own default (the whole library, no breeding). */
export const KIN_DEFAULT_SCOPE = CREATURE_DEFAULT_SCOPE;
/** The press counter is a plain non-negative integer; anything else is 0 (the lab's first press). */
export const sanitizePress = (n) => (Number.isInteger(n) && n >= 0 && n < 1_000_000 ? n : 0);

/**
 * The assets a creature may be dealt from, WITH their markup (a body is read from its svg): the library's and the
 * imports' dealable assets (a creature's own tile is never a body). `base` is the library (ASSETS), `overlay` the
 * artist's imports (state.customAssets).
 */
export function dealLibrary(base, overlay) {
  const keep = new Set(dealableRecords(base || [], overlay || []).map((r) => r.id));
  const byId = new Map();
  for (const a of [...(base || []), ...(overlay || [])]) if (a && keep.has(a.id) && !byId.has(a.id)) byId.set(a.id, a);
  return [...byId.values()];
}

/** One KIN press: the wide deal of the adapter, under the scope, for this seed and press number. */
export function kinPress({ scope, seed, press, library, assetAttach, bank, lookId = null, voiceId = null }) {
  return kineticPress(creatureAdapter, {
    scope: sanitizeScope(creatureAdapter, scope),
    seed: seed >>> 0,
    press: sanitizePress(press),
    ctx: { library, assetAttach: assetAttach || {}, bank: bank || [], lookId, voiceId },
  });
}

/** The pill's next width (OFF → WEAK → MED → KOZ → OFF). */
export const nextKinScope = (scope) => nextScope(creatureAdapter, scope);

/**
 * Ruling Q4's "unkept": a creature banked from a KIN tap this session and not turned on for the stage. `dealtIds` are
 * the ids the strip banked; `bank` the banked records; `enabledAssets` the pool's on/off map (a creature's tile id is
 * its key there). A creature the artist did anything with (it stands on the stage) is kept.
 */
export function unkeptIds(dealtIds, bank, enabledAssets) {
  const dealt = new Set(dealtIds || []);
  const on = enabledAssets || {};
  return (bank || []).filter((r) => r && dealt.has(r.id) && !on[creatureTileId(r.id)]).map((r) => r.id);
}

/** A candidate's body drawing for its tile (the bank rail's own picture), or null when the body is not in the pool. */
export function bodySvgOf(record, library) {
  const a = (library || []).find((x) => x && record && x.id === record.body);
  return a && typeof a.svg === 'string' ? a.svg : null;
}

/**
 * CUR's closeness steps (ruling, 2026-11-16): the most of a creature's genes a neighbour may change. NEAR is the
 * funnel's own default (NEAR_CAP_DEFAULT). A pill steps them: TIGHT → NEAR → LOOSE → TIGHT.
 */
export const CUR_CAPS = Object.freeze([
  { id: 'tight', label: 'TIGHT', cap: 0.1 },
  { id: 'near', label: 'NEAR', cap: 0.25 },
  { id: 'loose', label: 'LOOSE', cap: 0.5 },
]);
export const CUR_DEFAULT_CAP = 'near';
export const sanitizeCurCap = (id) => (CUR_CAPS.some((c) => c.id === id) ? id : CUR_DEFAULT_CAP);
export const nextCurCap = (id) => {
  const i = CUR_CAPS.findIndex((c) => c.id === sanitizeCurCap(id));
  return CUR_CAPS[(i + 1) % CUR_CAPS.length].id;
};

/**
 * One CUR press: the funnel's narrow deal around `subject` — a hand of three neighbours within the closeness, ordered
 * by the trio's read (best first) with the top one marked as the pick. Taste only orders; the artist taps any.
 * Returns { hand, picked } — `hand` the ordered candidates, `picked` the one CUR would choose (or null).
 */
export function curPress({ subject, cap, seed, press, library, assetAttach, bank, lookId = null, voiceId = null }) {
  if (!subject) return { hand: [], picked: null };
  const step = CUR_CAPS.find((c) => c.id === sanitizeCurCap(cap));
  const r = funnel(creatureAdapter, subject, {
    cap: step.cap,
    seed: seed >>> 0,
    press: sanitizePress(press),
    ctx: { library, assetAttach: assetAttach || {}, bank: bank || [], lookId, voiceId },
  });
  return { hand: r.ordered.map((o) => o.candidate), picked: r.picked };
}
