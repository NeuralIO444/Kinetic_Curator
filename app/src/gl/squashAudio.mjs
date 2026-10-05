// squashAudio.mjs — apply the #790 render.squash route output to the scene squash.
//
// The route output is in [0,1] (per ROUTE_TARGETS clamp). It rides on top of
// the layout's static squash param — the #594 squash-and-stretch amount that
// thins a moving mark across its motion while holding its area (u_smear.z).
// A loud moment pushes squash toward 1 (full area-preserving thin); silence
// falls back to whatever the layout dial says.
//
// The scene contract already omits the squash key at 0, so 0 on the default
// table (routes.squash undefined) renders bit-identical. Non-finite input is
// ignored: a NaN squash would poison the smear shader for the whole frame.

/** Clamp a route squash output to the finite [0,1] the shader expects. Never trust the caller. */
export function sanitizeSquashAudio(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

/**
 * Combine the layout squash with the audio route output. Both live in [0,1];
 * the audio ride adds on top and the sum is clamped to the [0,1] ceiling the
 * contract and shader expect. 0 audio is identity — the layout value passes
 * through untouched (undefined layout → 0 → contract key omitted).
 */
export function squashWithAudio(layoutSquash, audioSquash) {
  const base = sanitizeSquashAudio(layoutSquash);
  const ride = sanitizeSquashAudio(audioSquash);
  if (ride === 0) return base;
  return Math.min(1, base + ride);
}
