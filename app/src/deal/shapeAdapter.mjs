// deal/shapeAdapter.mjs — WetLab ladder, SHAPE rung (docs/design/wetlab-ladder-spec.md §12.4, §12.5; issue #2279).
//
// A candidate is one simple shape: `{ style, asset }`, an asset id from ONE Canon style's construct vocabulary
// (engine/constructRules.js). Not the whole library: the SHAPE rung deals primitives only (§12.4), and every shape in
// a hand shares one style (§12.5), so kept shapes fit the one-style-per-construct ruling when the CONSTRUCT rung
// builds from them.
//
// Scopes: ANY, then one per style. ANY picks a single style per press from the seeded draw; a named scope deals that
// style. A style has 3–5 primitives, so a hand is often shorter than the six KINETIC asks for: it is never padded
// with another style.
//
// Pure: no store, no React, no clock, no Math.random. Every draw is a string-keyed hash of (seed, press, scope).
// `ctx.library` (optional) is the pool the host can draw — `[{ id, svg }]`; the gate drops a shape it cannot draw.
// Without a library the gate trusts the vocabulary. This file never imports the asset index and never writes state.
import { CONSTRUCT_STYLE_IDS, constructVocabularyIds } from '../engine/constructRules.js';
import { u01, pickIndex } from './dealKey.mjs';

export const SHAPE_ANY = 'any';

/** The ladder: ANY first, then the construct styles in Canon order. */
export const SHAPE_SCOPES = Object.freeze([
  Object.freeze({ id: SHAPE_ANY, label: 'ANY' }),
  ...CONSTRUCT_STYLE_IDS.map((id) => Object.freeze({ id, label: id.toUpperCase() })),
]);
export const SHAPE_DEFAULT_SCOPE = SHAPE_ANY;

const isStyle = (s) => typeof s === 'string' && CONSTRUCT_STYLE_IDS.includes(s);

/** The stable id of a shape: `shape:<style>:<asset>`; '' for anything that is not a shape of a known style. */
export function shapeKey(candidate) {
  if (!candidate || typeof candidate !== 'object') return '';
  const { style, asset } = candidate;
  if (!isStyle(style) || typeof asset !== 'string' || !asset) return '';
  if (!constructVocabularyIds(style).includes(asset)) return '';
  return `shape:${style}:${asset}`;
}

/** The style one press deals: the named scope, or for ANY (and anything unknown) one style drawn from the press. */
export function shapeStyleFor(scope, { seed, press }) {
  if (isStyle(scope)) return scope;
  return CONSTRUCT_STYLE_IDS[pickIndex(`shape-style|${seed}|${press}`, CONSTRUCT_STYLE_IDS.length)];
}

/** A style's vocabulary in a seeded order (a shuffle without repeats), so a hand never deals the same shape twice. */
function shuffled(style, stem) {
  return constructVocabularyIds(style)
    .map((asset) => ({ asset, r: u01(`${stem}|${asset}`) }))
    .sort((a, b) => a.r - b.r || (a.asset < b.asset ? -1 : 1))
    .map(({ asset }) => ({ style, asset }));
}

const drawable = (ctx) => {
  const lib = ctx && Array.isArray(ctx.library) ? ctx.library : null;
  if (!lib) return null;
  const ok = new Set();
  for (const a of lib) if (a && typeof a.id === 'string' && typeof a.svg === 'string' && a.svg) ok.add(a.id);
  return ok;
};

/** The adapter the engines take: `kineticEngine.press(shapeAdapter, …)` and `curatorEngine.funnel(…)`. */
export const shapeAdapter = Object.freeze({
  scopes: SHAPE_SCOPES.map(({ id, label }) => ({ id, label })),
  defaultScope: SHAPE_DEFAULT_SCOPE,

  /** The wide deal: one style's whole vocabulary, in a seeded order, at most `maxDraws` of it. */
  deal(scope, { seed, press, maxDraws }) {
    const style = shapeStyleFor(scope, { seed, press });
    return shuffled(style, `shape-deal|${seed}|${press}|${style}`).slice(0, Math.max(0, maxDraws | 0));
  },

  /**
   * The fine deal: the other shapes of the subject's style, never the subject. `cap` does not apply — a style's
   * vocabulary is already a handful of near shapes, and there is no measured distance between two primitives yet.
   */
  near(subject, _cap, { seed, press, maxDraws }) {
    const key = shapeKey(subject);
    if (!key) return [];
    return shuffled(subject.style, `shape-near|${seed}|${press}|${key}`)
      .filter((c) => c.asset !== subject.asset)
      .slice(0, Math.max(0, maxDraws | 0));
  },

  /** Hard viability: a real shape of a known style, and — when the host passes its library — one it can draw. */
  gate(candidate, ctx) {
    if (!shapeKey(candidate)) return false;
    const ok = drawable(ctx);
    return ok ? ok.has(candidate.asset) : true;
  },

  /**
   * The read. NOT MEASURED YET: there is no measured read of a single primitive in KC-1 (LOIS, DAVIS and TE read
   * creatures and records, not one shape), so every shape reads the same neutral 0.5. A KINETIC hand keeps the seeded
   * deal order; a CURATOR funnel, which sorts by the read, falls back to key order. Deliberately not a score; replace
   * it only with a real measure.
   */
  read() {
    return { total: 0.5, measured: false };
  },

  key(candidate) {
    return shapeKey(candidate);
  },
});
