// curator/decisionFeatures.mjs — Persona Adapters A1 (#2394): the DECISION-feature universe.
//
// The taste head walks recipe features (what a look is). A persona head judges a DECISION (what a player
// did), and ruling Q1 on #2394 (Matt, 2026-11-20) says those are different inputs: the personas section
// gets its own feature universe, named and versioned here, defined from the adapters spec §3 input list —
// phrase context, stage census, the call being answered, the persona's own heat and recent keep rate, and
// recipe features v4. This module is the ONE definition: the app walks persona heads over exactly the
// vectors this function builds, and A2's trainer (studio side) binds its columns to decisionFeatureNames()
// and encodes its training rows through this same function — a feature a train row has but a live decision
// lacks (or the reverse) would teach the head a world that does not exist.
//
// The decision kinds are A0's label kinds (ruling Q3: one vocabulary end to end — the extractor's labels,
// the taste.json personas entries and the trainer all key on persona × kind):
//   solo   the decision to take a solo (the soloist pick)
//   trade  one answerer's verdict on a call (agree / disagree / lay out)
//   cut    the bandleader's decision to cut a standing solo
//
// Encoding law (the walker's conventions, shared with the recipe tree walk in tasteHead.js):
//   - categoricals live at the top level; an absent one fails every '=' split test,
//   - numerics live in the `num` block under their full name; an absent one walks as 0.
// So any subset of inputs yields a valid vector, and absence is one consistent fact on both sides of the
// train/walk boundary. Recipe features ride under a `recipe.` prefix (numerics `num.recipe.<key>`), so
// the two universes can never collide under one name. The census's principle scores ride as
// `num.principle.<key>` when a supplier provides them; v1 of the universe names no principle keys (the
// census publishes none yet), so they are carried in the encoding but not yet bindable — naming the first
// ones is a DECISION_FEATURES_VERSION bump, never a silent drift.
//
// Bump DECISION_FEATURES_VERSION whenever a name, a meaning or an encoding rule changes: heads declare
// the features they split on, validation binds those names to this universe, and a stale head's names
// falling out of the universe neutralizes the personas section rather than walking a lie.
import { recipeFeatures } from './recipeFeatures.js';

/** The decision-feature universe version. A2 stamps it into every personas entry it trains. */
export const DECISION_FEATURES_VERSION = 1;

/** A0's label kinds — the decision kinds a persona head is keyed by (ruling Q3 on #2394). */
export const PERSONA_DECISION_KINDS = Object.freeze(['solo', 'trade', 'cut']);

/** Categorical decision features (top level of the vector). */
export const DECISION_CATEGORICALS = Object.freeze(['phase', 'caller', 'verdict', 'move', 'target']);
/** Numeric decision features (the vector's `num` block, by bare key). */
export const DECISION_NUMERICS = Object.freeze([
  'bar',
  'bpm',
  'energy',
  'beatConfidence',
  'density',
  'coverage',
  'heat',
  'recentKeepRate',
  'pressure',
  'soloAge',
]);

/** Recipe keys a tree never carries: the term-rule skips, plus array-valued castCategories.
 * Mirrors tasteHead.js's TREE_FEATURE_SKIP so both universes treat the recipe shape the same way. */
const RECIPE_SKIP = new Set(['v', 'cast', 'castSize', 'num', 'castCategories']);

/**
 * The feature names a persona head may declare, in binding order: the decision categoricals, the recipe
 * categoricals under their prefix, then `num.<key>` for every decision numeric and every recipe numeric.
 * The trainer binds its columns to exactly this universe; anything outside it is a head the app cannot
 * score honestly.
 */
export function decisionFeatureNames() {
  const sample = recipeFeatures();
  const recipeCats = Object.keys(sample).filter((k) => !RECIPE_SKIP.has(k));
  return [
    ...DECISION_CATEGORICALS,
    ...recipeCats.map((k) => `recipe.${k}`),
    ...DECISION_NUMERICS.map((k) => `num.${k}`),
    ...Object.keys(sample.num).map((k) => `num.recipe.${k}`),
  ];
}

const finite = (x) => typeof x === 'number' && Number.isFinite(x);

/**
 * One decision → its feature vector, in the recipe walker's shape ({ ...categoricals, num: {...} }).
 * Every field is optional; what is absent stays absent (see the encoding law above).
 *
 *   input {
 *     phase, caller, verdict, move, target     categoricals (strings)
 *     bar, bpm, energy, beatConfidence,        numerics: phrase context and census
 *     density, coverage,
 *     heat, recentKeepRate,                    the deciding persona's own state
 *     pressure, soloAge,                       the band's room: how pressed, how long the solo has stood
 *     recipe | layoutParams,                   recipe features v4: a recipeFeatures() object, or layout
 *                                              params to compute one from
 *     principles: { <key>: score }             census principle scores (carried, not yet bindable in v1)
 *   }
 */
export function decisionFeatures(input = {}) {
  const src = input && typeof input === 'object' ? input : {};
  const out = { num: {} };
  for (const k of DECISION_CATEGORICALS) if (typeof src[k] === 'string' && src[k]) out[k] = src[k];
  for (const k of DECISION_NUMERICS) if (finite(src[k])) out.num[k] = src[k];
  const recipe =
    src.recipe && typeof src.recipe === 'object'
      ? src.recipe
      : src.layoutParams && typeof src.layoutParams === 'object'
        ? recipeFeatures({ layoutParams: src.layoutParams })
        : null;
  if (recipe) {
    for (const [k, v] of Object.entries(recipe)) {
      if (RECIPE_SKIP.has(k)) continue;
      if (typeof v === 'string' || typeof v === 'boolean') out[`recipe.${k}`] = v;
    }
    for (const [k, v] of Object.entries(recipe.num || {})) if (finite(v)) out.num[`recipe.${k}`] = v;
  }
  if (src.principles && typeof src.principles === 'object') {
    for (const [k, v] of Object.entries(src.principles)) if (finite(v)) out.num[`principle.${k}`] = v;
  }
  return out;
}
