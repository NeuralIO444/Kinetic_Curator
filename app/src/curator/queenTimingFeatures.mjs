// queenTimingFeatures — Persona Adapters A6 (#2399): the feature universe of her timing head.
// Hers alone, versioned separately from the personas' decision universe (decisionFeatures.mjs):
// she is not a persona entry and her head never enters their section, their earn-in list, or
// their featuresVersion.
//
// The universe is deliberately tiny — the leaned turn's kind and the three sway sizes she used:
//   enterEarlyMs  how early a horn came in (0 when the lean did not move this channel)
//   breathePct    how much longer a solo breathed, as a share of its length
//   tightMs       how tight a trade sat to the beat
// These are the only quantities recorded in the take (personas/rhythmRecord.mjs) and computable
// identically live (curator/queenLean.mjs's lean) — the A2 law: a feature exists only if both
// sides compute it the same way. Nothing about content — no asset, no recipe, no census — ever
// enters: she learns the SIZE of her sways, never what plays.

export const QUEEN_TIMING_FEATURES_VERSION = 1;

/** The categorical slot: which kind of turn was leaned. */
export const QUEEN_TIMING_CATEGORICALS = Object.freeze(['kind']);
/** The numeric slots, in walk order. */
export const QUEEN_TIMING_NUMERICS = Object.freeze(['enterEarlyMs', 'breathePct', 'tightMs']);

const finite = (x) => typeof x === 'number' && Number.isFinite(x);

/** Every feature name a queen timing head may name (categoricals + num.<name>), sorted. */
export function queenTimingFeatureNames() {
  return [...QUEEN_TIMING_CATEGORICALS, ...QUEEN_TIMING_NUMERICS.map((k) => `num.${k}`)].sort();
}

/**
 * One leaned turn → its feature vector, in the tree walker's shape ({ kind, num: {...} }).
 * Every field is optional in the input; what is absent stays absent (the walker's law).
 *   input { kind, enterEarlyMs, breathePct, tightMs }
 */
export function queenTimingFeatures(input = {}) {
  const src = input && typeof input === 'object' ? input : {};
  const out = { num: {} };
  if (typeof src.kind === 'string' && src.kind) out.kind = src.kind;
  for (const k of QUEEN_TIMING_NUMERICS) if (finite(src[k])) out.num[k] = src[k];
  return out;
}
