// beastDeal.mjs — #2232 step 7: what the WetLab's beast KIN / CUR strip reads and does, apart from React and the store.
//
// The strip runs the KINETIC and CURATOR engines over the beast adapter (deal/beastAdapter.mjs). This file is the glue:
// the press, the funnel, which beast CUR narrows from, a beast's walking drawing, and which dealt beasts are "unkept".
// A candidate is a measure set; a banked beast is a pool tile carrying `rig.linkage` (engine/beastTile.js). Pure: no
// clock, no Math.random — the walk's time `t` is handed in by whoever draws.
import { press as kineticPress, nextScope, sanitizeScope } from '../deal/kineticEngine.mjs';
import { funnel } from '../deal/curatorEngine.mjs';
import { beastAdapter, beastKey, BEAST_SCOPES, BEAST_DEFAULT_SCOPE } from '../deal/beastAdapter.mjs';
import { isBeastTileId } from '../engine/beastTile.js';
import { poseLinkage } from '../engine/beastRig.js';
import { sanitizeRig } from '../engine/creatureRig.js';
import { CUR_CAPS, sanitizeCurCap, sanitizePress } from './wetLabDeal.mjs';

export { BEAST_SCOPES, CUR_CAPS, sanitizeCurCap, sanitizePress };
/** Where the beast strip's width pill opens: the adapter's own default (the ASSEMBLE A BEAST button's stray). */
export const BEAST_KIN_DEFAULT_SCOPE = BEAST_DEFAULT_SCOPE;

/** One KIN press: the wide deal of the adapter, under the scope, for this seed and press number. A hand of measure sets. */
export function beastKinPress({ scope, seed, press }) {
  return kineticPress(beastAdapter, {
    scope: sanitizeScope(beastAdapter, scope),
    seed: seed >>> 0,
    press: sanitizePress(press),
    ctx: {},
  }).hand;
}

/** The pill's next width (TAME → LOOSE → WILD → FERAL → TAME). */
export const nextBeastScope = (scope) => nextScope(beastAdapter, scope);

/** The beasts standing in the pool, in pool order: [{ id, measures }]. A tile whose linkage will not read is left out. */
export function poolBeasts(customAssets) {
  const out = [];
  for (const a of customAssets || []) {
    if (!a || !isBeastTileId(a.id) || a.category !== 'creature' || a.source !== 'wetlab') continue;
    const rig = sanitizeRig(a.rig);
    if (rig && rig.linkage && rig.linkage.measures) out.push({ id: a.id, measures: rig.linkage.measures });
  }
  return out;
}

/**
 * The beast CUR narrows from: the one last banked or tapped (`lastId`) if it still stands in the pool, else the newest
 * beast in the pool, else null (CUR has nothing to narrow from).
 */
export function beastSubject(customAssets, lastId) {
  const beasts = poolBeasts(customAssets);
  return beasts.find((b) => b.id === lastId) || beasts[beasts.length - 1] || null;
}

/** One CUR press: up to three close neighbours of `subject` (a measure set), best read first, with the pick. Empty with no subject. */
export function beastCurPress({ subject, cap, seed, press }) {
  if (!subject) return { hand: [], picked: null };
  const step = CUR_CAPS.find((c) => c.id === sanitizeCurCap(cap));
  const r = funnel(beastAdapter, subject, { cap: step.cap, seed: seed >>> 0, press: sanitizePress(press), ctx: {} });
  return { hand: r.ordered.map((o) => o.candidate), picked: r.picked };
}

const r2 = (n) => Math.round(n * 100) / 100;

/**
 * A beast's drawing at crank time `t` (seconds): the linkage's bars in the tile box, the same drawing the pool tile
 * shows at rest (t = 0), set walking. Null for a linkage that cannot turn.
 */
export function walkPath(measures, t = 0) {
  const pose = poseLinkage({ measures, phase: 0 }, Number.isFinite(t) ? t : 0);
  if (!pose) return null;
  return pose.map((p) => `M${r2(p.x)} ${r2(p.y)}L${r2(p.tx)} ${r2(p.ty)}`).join('');
}

/**
 * "Unkept": a beast banked from the strip this session and not turned on for the stage. `dealtIds` are the ids the strip
 * banked; `customAssets` the pool's imports; `enabledAssets` the on/off map. A beast the artist turned on is kept.
 */
export function unkeptBeastIds(dealtIds, customAssets, enabledAssets) {
  const standing = new Set((customAssets || []).map((a) => a && a.id));
  const on = enabledAssets || {};
  return (dealtIds || []).filter((id) => standing.has(id) && on[id] !== true);
}

export { beastKey };
