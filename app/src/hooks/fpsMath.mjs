// fpsMath.mjs — useFpsMeter's pure core (audit standards, hooks tests
// slice 1, #1686). Factored out of the hook verbatim so the patrol's
// arithmetic is pinnable headlessly.

const round1 = (v) => Math.round(v * 10) / 10;
const round2 = (v) => Math.round(v * 100) / 100;

/** Frames over an elapsed window → FPS, one decimal. */
export function fpsFromCount(frames, elapsedMs) {
  return round1((frames / elapsedMs) * 1000);
}

/** Frame-delta window → { avg, worst }, two decimals; empty reads 0/0. */
export function frameStats(deltas) {
  let worst = 0;
  let sum = 0;
  for (const d of deltas) {
    sum += d;
    if (d > worst) worst = d;
  }
  return {
    avg: deltas.length ? round2(sum / deltas.length) : 0,
    worst: round2(worst),
  };
}

/**
 * Drain the stage-sample accumulators (name → { total, n }) into a
 * snapshot of per-stage averages (two decimals; an unsampled stage
 * reads 0), resetting every accumulator as part of the drain — the
 * meter's 4 Hz patrol cadence owns the rhythm, this owns the math.
 */
export function drainStageAverages(stageSamples) {
  const stages = {};
  for (const [name, s] of stageSamples) {
    stages[name] = s.n > 0 ? round2(s.total / s.n) : 0;
    s.total = 0;
    s.n = 0;
  }
  return stages;
}

/** Minimum delta samples before a refresh estimate is evidence, not noise. */
export const REFRESH_MIN_SAMPLES = 30;

/**
 * Estimate the display's refresh rate (whole fps) from a window of rAF
 * frame deltas — #2482, the GOV TUNE recover clamp's measuring stick.
 *
 * rAF is vsync-bound, so every delta is (to timestamp precision) an
 * integer multiple of the refresh interval: load can only STRETCH a
 * delta (2x, 3x the interval), never shrink one below it. The cadence
 * therefore lives at the bottom of the distribution — the 10th
 * percentile delta is the refresh interval whenever at least a tenth
 * of the window's frames landed on consecutive vsyncs, and the rate
 * is floored so timestamp jitter can only ever understate it. A fully
 * saturated window (every frame missing vsync) honestly reads its
 * presented rate; the meter keeps the best estimate of the session,
 * so a later light window raises it to the truth.
 *
 * Returns null when the window is too small or holds no usable delta
 * — an absent measurement, never an invented one (the stage-display
 * descriptors take the same line: refreshRateHz stays null when the
 * platform won't say).
 */
export function estimateRefreshFps(deltas) {
  if (!Array.isArray(deltas)) return null;
  const usable = deltas.filter((d) => Number.isFinite(d) && d > 0).sort((a, b) => a - b);
  if (usable.length < REFRESH_MIN_SAMPLES) return null;
  const cadence = usable[Math.floor(usable.length * 0.1)];
  if (!(cadence > 0)) return null;
  const fps = Math.floor(1000 / cadence);
  return fps >= 1 ? fps : null;
}
