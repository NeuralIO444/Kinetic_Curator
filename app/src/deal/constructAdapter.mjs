// deal/constructAdapter.mjs — WetLab ladder, CONSTRUCT rung (docs/design/wetlab-ladder-spec.md §13.1, §13.2, §13.5;
// issue #2299).
//
// A candidate is a recipe for one construct: `{ style, vocabulary, seed }` — a Canon style, the asset ids the construct
// may use (sorted), and the assembler's seed. It is built ONLY from the artist's kept shapes (§13.1): the vocabulary is
// a subset of the SHAPE shelf's shapes of that style, never the rest of the style's primitives.
//
// A style is "in play" once the shelf holds CONSTRUCT_FLOOR (2) shapes of it (§13.2). The assembler would run on one,
// but two is the design floor, so a construct is never one shape repeated. No style in play: an empty hand.
//
// CUR (§13.5) changes one thing: the subject's vocabulary with exactly one asset swapped for another kept shape of the
// style, or one asset dropped while at least CONSTRUCT_FLOOR remain. The seed stays.
//
// `key(candidate)` takes no context (the engines' contract), so it is a pure string of the recipe, not the assembled
// record's `cn-…` id. `assembleCandidate(candidate, ctx)` builds the record.
//
// Pure: no store, no React, no clock, no Math.random. Every draw is a string-keyed hash of (seed, press, scope).
// `ctx` carries:
//   ctx.shelf        the SHAPE shelf, [{ style, asset }] (state.shapeShelf)
//   ctx.findAsset    (assetId) => the library asset ({ id, svg }) or nothing
//   ctx.assetAttach  the artist's own ATTACH points by asset id (a missing entry means the shape's AUTO points)
import { assembleConstruct } from '../engine/constructAssembler.js';
import { CONSTRUCT_STYLE_IDS, constructRule, constructVocabularyIds } from '../engine/constructRules.js';
import { hash32, pickIndex } from './dealKey.mjs';

export const CONSTRUCT_ANY = 'any';
/** Kept shapes of one style that put the style in play (§13.2). */
export const CONSTRUCT_FLOOR = 2;

export const CONSTRUCT_SCOPES = Object.freeze([
  Object.freeze({ id: CONSTRUCT_ANY, label: 'ANY' }),
  ...CONSTRUCT_STYLE_IDS.map((id) => Object.freeze({ id, label: id.toUpperCase() })),
]);
export const CONSTRUCT_DEFAULT_SCOPE = CONSTRUCT_ANY;

const isStyle = (s) => typeof s === 'string' && CONSTRUCT_STYLE_IDS.includes(s);
const list = (x) => (Array.isArray(x) ? x : []);

/** The kept shapes of each style, as sorted asset ids: Map(style → [ids]). Garbage and strays are dropped. */
function keptByStyle(shelf) {
  const out = new Map();
  for (const s of list(shelf)) {
    if (!s || !isStyle(s.style) || typeof s.asset !== 'string') continue;
    if (!constructVocabularyIds(s.style).includes(s.asset)) continue;
    const ids = out.get(s.style) || [];
    if (!ids.includes(s.asset)) ids.push(s.asset);
    out.set(s.style, ids);
  }
  for (const ids of out.values()) ids.sort();
  return out;
}

/** The styles a KIN press can build: those with at least CONSTRUCT_FLOOR kept shapes, in Canon order. */
export function constructStylesInPlay(shelf) {
  const kept = keptByStyle(shelf);
  return CONSTRUCT_STYLE_IDS.filter((s) => (kept.get(s) || []).length >= CONSTRUCT_FLOOR);
}

/** The recipe's stable key: `construct:<style>:<ids joined by +>:<seed>`; '' for anything that is not a recipe. */
export function constructKey(candidate) {
  if (!candidate || typeof candidate !== 'object' || !isStyle(candidate.style)) return '';
  const v = list(candidate.vocabulary);
  if (v.length < 1 || v.some((id) => typeof id !== 'string' || !id)) return '';
  const seed = Number(candidate.seed);
  if (!Number.isInteger(seed) || seed < 0) return '';
  return `construct:${candidate.style}:${[...v].sort().join('+')}:${seed >>> 0}`;
}

/**
 * Build the construct record a candidate names, or null. The vocabulary's ATTACH points come from the style's rule
 * against the host's library (the artist's own points first), filtered to the candidate's ids.
 */
export function assembleCandidate(candidate, ctx = {}) {
  if (!constructKey(candidate)) return null;
  const findAsset = typeof ctx.findAsset === 'function' ? ctx.findAsset : () => null;
  const rule = constructRule(candidate.style, findAsset, ctx.assetAttach || null);
  if (!rule) return null;
  const want = new Set(candidate.vocabulary);
  const vocabulary = rule.vocabulary.filter((v) => want.has(v.id));
  if (vocabulary.length !== want.size) return null; // a kept shape the library cannot draw
  return assembleConstruct({
    style: candidate.style,
    vocabulary,
    seed: candidate.seed >>> 0,
    rotations: rule.rotations,
  });
}

const seedFor = (stem, i) => hash32(`${stem}|${i}`);

/** The adapter the engines take: `kineticEngine.press(constructAdapter, …)` and `curatorEngine.funnel(…)`. */
export const constructAdapter = Object.freeze({
  scopes: CONSTRUCT_SCOPES.map(({ id, label }) => ({ id, label })),
  defaultScope: CONSTRUCT_DEFAULT_SCOPE,

  /** The wide deal: one style in play, its whole kept vocabulary, a fresh seed per draw. */
  deal(scope, { seed, press, maxDraws, ctx }) {
    const kept = keptByStyle(ctx && ctx.shelf);
    const inPlay = constructStylesInPlay(ctx && ctx.shelf);
    if (!inPlay.length) return [];
    const style = isStyle(scope)
      ? inPlay.includes(scope)
        ? scope
        : null
      : inPlay[pickIndex(`construct-style|${seed}|${press}`, inPlay.length)];
    if (!style) return [];
    const vocabulary = kept.get(style);
    const stem = `construct-deal|${seed}|${press}|${style}`;
    const out = [];
    for (let i = 0; i < Math.max(0, maxDraws | 0); i += 1) out.push({ style, vocabulary, seed: seedFor(stem, i) });
    return out;
  },

  /**
   * The fine deal: one change from the subject. Every swap of one asset for another kept shape of the style, and every
   * single drop that leaves CONSTRUCT_FLOOR, in a seeded order. The seed is the subject's. Never the subject itself.
   */
  near(subject, _cap, { seed, press, maxDraws, ctx }) {
    const key = constructKey(subject);
    if (!key) return [];
    const kept = keptByStyle(ctx && ctx.shelf).get(subject.style) || [];
    const own = [...subject.vocabulary].sort();
    const spare = kept.filter((id) => !own.includes(id));
    const out = [];
    for (const gone of own) {
      for (const add of spare) out.push([...own.filter((id) => id !== gone), add].sort());
      if (own.length - 1 >= CONSTRUCT_FLOOR) out.push(own.filter((id) => id !== gone));
    }
    const stem = `construct-near|${seed}|${press}|${key}`;
    return out
      .map((vocabulary) => ({ style: subject.style, vocabulary, seed: subject.seed >>> 0 }))
      .map((c) => ({ c, r: hash32(`${stem}|${constructKey(c)}`) }))
      .sort((a, b) => a.r - b.r || (constructKey(a.c) < constructKey(b.c) ? -1 : 1))
      .map(({ c }) => c)
      .slice(0, Math.max(0, maxDraws | 0));
  },

  /** Hard viability: a recipe of kept shapes only, at the floor, that assembles. */
  gate(candidate, ctx) {
    if (!constructKey(candidate)) return false;
    const kept = keptByStyle(ctx && ctx.shelf).get(candidate.style) || [];
    if (candidate.vocabulary.length < CONSTRUCT_FLOOR) return false;
    if (candidate.vocabulary.some((id) => !kept.includes(id))) return false;
    return !!assembleCandidate(candidate, ctx || {});
  },

  /**
   * The read. NOT MEASURED YET: there is no measured read of a construct in KC-1, so every candidate reads the same
   * neutral 0.5. A KINETIC hand keeps the seeded deal order; a CURATOR funnel falls back to key order. Deliberately not
   * a score; replace it only with a real measure.
   */
  read() {
    return { total: 0.5, measured: false };
  },

  key(candidate) {
    return constructKey(candidate);
  },
});
