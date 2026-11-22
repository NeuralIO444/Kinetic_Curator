// voiceFeatures — Persona Adapters A7 (#2400): the feature universe of the horns' line chooser.
// The horns' alone, versioned separately from the personas' decision universe
// (decisionFeatures.mjs) and from her timing universe (queenTimingFeatures.mjs): a voice head
// never enters the personas section, their earn-in list, or their featuresVersion.
//
// The universe is three categoricals — everything a line-moment is:
//   line  the candidate line's id in the signed copy matrix (hornLines.mjs HORN_LINES)
//   ctx   the moment's context (agree / disagree / layOut / cut)
//   to    the seat the line answers (the caller; 'lois' for a cut)
// These are the only quantities computable identically at training time (studio/voiceRows.mjs
// replays a take's band turns through hornLines.turnMoments + lineFor) and live (roomFeed
// chooses over the same moments) — the A2 law: a feature exists only if both sides compute it
// the same way. No numerics: heat was considered and excluded — it is not recorded per
// line-moment in a take and is not available where lines are chosen, so it cannot be a fact
// of the moment on both sides. No content features either: the chooser ranks Matt-signed
// lines, it never sees or makes new ones.

export const VOICE_FEATURES_VERSION = 1;

/** The categorical slots, in walk order. */
export const VOICE_CATEGORICALS = Object.freeze(['line', 'ctx', 'to']);

/** Every feature name a voice head may name (all categorical — there are no numerics), sorted. */
export function voiceFeatureNames() {
  return [...VOICE_CATEGORICALS].sort();
}

/**
 * One line-moment candidate → its feature vector, in the tree walker's shape ({ line, ctx,
 * to, num: {} }). Every field is optional in the input; what is absent stays absent (the
 * walker's law).   input { line, ctx, to }
 */
export function voiceFeatures(input = {}) {
  const src = input && typeof input === 'object' ? input : {};
  const out = { num: {} };
  for (const k of VOICE_CATEGORICALS) if (typeof src[k] === 'string' && src[k]) out[k] = src[k];
  return out;
}
