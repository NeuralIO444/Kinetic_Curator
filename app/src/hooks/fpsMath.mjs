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
