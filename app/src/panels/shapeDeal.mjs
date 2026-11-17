// shapeDeal.mjs — WetLab ladder, SHAPE rung (docs/design/wetlab-ladder-spec.md §12.4–12.6; issue #2282).
//
// What the SHAPE strip reads and does, apart from React and the store: the KIN press and the CUR funnel over the shape
// adapter (deal/shapeAdapter.mjs), which shape CUR narrows from, and a shape's drawing. A candidate is `{ style, asset }`,
// one primitive of one Canon style. Pure: no clock, no Math.random, no store.
import { press as kineticPress, nextScope, sanitizeScope } from '../deal/kineticEngine.mjs';
import { funnel } from '../deal/curatorEngine.mjs';
import { shapeAdapter, shapeKey, SHAPE_SCOPES, SHAPE_DEFAULT_SCOPE } from '../deal/shapeAdapter.mjs';
import { sanitizePress } from './wetLabDeal.mjs';

export { SHAPE_SCOPES, SHAPE_DEFAULT_SCOPE, shapeKey };

/** The pool a shape may be drawn from, as the adapter's gate reads it: [{ id, svg }]. */
const ctxOf = (library) => ({ library: Array.isArray(library) ? library : [] });

/** One KIN press: one style's shapes, in a seeded order, for this seed and press number. Never padded across styles. */
export function shapeKinPress({ scope, seed, press, library }) {
  return kineticPress(shapeAdapter, {
    scope: sanitizeScope(shapeAdapter, scope),
    seed: seed >>> 0,
    press: sanitizePress(press),
    ctx: ctxOf(library),
  }).hand;
}

/**
 * One CUR press: the other shapes of the subject's style. `picked` is the funnel's pick; the shape read is not measured
 * yet (shapeAdapter.read), so the pick falls to key order — the strip marks it, it does not rank it.
 */
export function shapeCurPress({ subject, seed, press, library }) {
  if (!subject || !shapeKey(subject)) return { hand: [], picked: null };
  const r = funnel(shapeAdapter, subject, {
    cap: 0.25,
    seed: seed >>> 0,
    press: sanitizePress(press),
    ctx: ctxOf(library),
  });
  return { hand: r.ordered.map((o) => o.candidate), picked: r.picked };
}

/** The scope pill's next step (ANY → each style in Canon order → ANY). */
export const nextShapeScope = (scope) => nextScope(shapeAdapter, scope);

/** The shape CUR narrows from: the last one the artist kept, else the lead of the hand on screen, else none. */
export function shapeSubject(shelf, hand) {
  const kept = Array.isArray(shelf) ? shelf.filter((s) => shapeKey(s)) : [];
  if (kept.length) return kept[kept.length - 1];
  const lead = Array.isArray(hand) ? hand.find((s) => shapeKey(s)) : null;
  return lead || null;
}

/** A shape's drawing (the library asset's inner svg), or null when the pool does not carry it. */
export function shapeSvg(library, asset) {
  const a = (library || []).find((x) => x && x.id === asset);
  return a && typeof a.svg === 'string' && a.svg ? a.svg : null;
}
