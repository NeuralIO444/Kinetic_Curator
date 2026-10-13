// sourceFeed.mjs — #1475: the one door a synthetic source uses to add to the band feed. The live loop asks once a
// frame; the provider (curator/setLive.js) answers null when nothing is playing, so an ordinary frame costs nothing and
// is unchanged. Kept in gl/ so the loop never imports the curator.
let provider = null;

/** fn(loopMs) => null | { mix, coarse: { rms, bass, mid, treble, beatPulse }, bands: { sub..air } }, or null to remove. */
export function setSourceFeed(fn) {
  provider = typeof fn === 'function' ? fn : null;
}

/** The synthetic source's levels for this frame, or null. Never throws. */
export function readSourceFeed(loopMs) {
  if (!provider) return null;
  try {
    const f = provider(loopMs);
    return f && Number.isFinite(f.mix) && f.mix > 0 ? f : null;
  } catch {
    return null;
  }
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** real * (1 - mix) + synthetic * mix, per key, kept in 0..1. `real` may be null (audio off: all zeros). */
export function mixLevels(real, synthetic, mix, keys) {
  const m = clamp01(mix);
  const out = {};
  for (const k of keys) {
    const r = real && Number.isFinite(real[k]) ? real[k] : 0;
    const s = synthetic && Number.isFinite(synthetic[k]) ? synthetic[k] : 0;
    out[k] = clamp01(r * (1 - m) + s * m);
  }
  return out;
}
