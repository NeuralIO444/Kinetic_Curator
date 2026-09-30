// evolveProgress.js — the numbers behind DAVIS's EVOLVE progress readout (#616).
//
// Pure and browser-safe. The store keeps three small facts (davisSlice.js):
//   evolveRun  — { gen, startedTs, lastTs } while EVOLVE runs, else null
//   evolveLast — { gen, seconds } summary of the last finished run, else null
//   evolveSeen — candidates seen this session (every evolve tick, run or manual)
// Seconds-per-generation is the run's own average, so it reads the REAL cadence
// whatever the source (time, beat, phrase): not the interval slider's promise.

/** Start a run (EVOLVE on). */
export function startRun(now) {
  return { gen: 0, startedTs: now, lastTs: 0 };
}

/** One generation landed at `now`. */
export function tickRun(run, now) {
  return run ? { ...run, gen: run.gen + 1, lastTs: now } : run;
}

/** End a run (EVOLVE off): the summary the panel shows while stopped. */
export function finishRun(run, now) {
  if (!run) return null;
  return { gen: run.gen, seconds: Math.max(0, (now - run.startedTs) / 1000) };
}

/** Average seconds per generation for a live run, or null before the first lands. */
export function secPerGen(run) {
  if (!run || run.gen < 1 || !(run.lastTs > run.startedTs)) return null;
  return (run.lastTs - run.startedTs) / 1000 / run.gen;
}
