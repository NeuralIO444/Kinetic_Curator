// sourceFeed.mjs — #1475: the one door a synthetic source uses to add to the band feed. The live loop asks once a
// frame; the provider (curator/setLive.js) answers null when nothing is playing, so an ordinary frame costs nothing and
// is unchanged. Kept in gl/ so the loop never imports the curator.
let provider = null;
let last = null; // #1482: this frame's answer, for a second reader (the provider is stateful: ask it once a frame)

/** fn(loopMs) => null | { mix, coarse: { rms, bass, mid, treble, beatPulse }, bands: { sub..air } }, or null to remove. */
export function setSourceFeed(fn) {
  provider = typeof fn === 'function' ? fn : null;
  last = null;
}

/** The synthetic source's levels for this frame, or null. Never throws. The live loop's call, once a frame. */
export function readSourceFeed(loopMs) {
  if (!provider) return (last = null);
  try {
    const f = provider(loopMs);
    return (last = f && Number.isFinite(f.mix) && f.mix > 0 ? f : null);
  } catch {
    return (last = null);
  }
}

/** The answer the live loop got this frame, without asking the provider again. */
export function peekSourceFeed() {
  return last;
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
