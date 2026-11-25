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

/**
 * #2485 — why a running EVOLVE cannot fire right now, in the performer's
 * own terms, or null when the run can fire on its source. Pure: the panel
 * feeds it the store's own facts.
 *
 * Both EVOLVE sources are conditional drivers, and three independent gates
 * can starve them indefinitely: the beat arbiter's gate (slowRender /
 * batchPaused — the same holds the TIME interval honors, #107 §4/§5), the
 * beat route (PHRASE sends every attack to the phrase; EVOLVE gets none),
 * and the source's own input (a beat source with no beat arriving, a time
 * source whose loop clock is held because the loop is stopped). The
 * stopped loop also starves a beat source whose only input is the dial
 * metro — the metro is gated on the loop running (metroRunning) — but mic
 * input fires while the show is stopped, so that hold is named for the
 * metro sub-case only. Before
 * this helper, every one of those states rendered as a healthy run —
 * GEN 0 / SEEN 0 / S/GEN — for as long as the performer cared to watch
 * (the 2026-11-24 stress session watched for minutes). The numbers were
 * honest; the silence was the defect. A run that can never fire says why.
 *
 * Facts: { evolveMode, evolveSource, beatRoute, audioEnabled, beatMetro,
 * slowRender, batchPaused, running, gen } — gen is the live run's count.
 * Hard holds (can never fire until something changes) are named at any
 * gen; the soft wait (input live, nothing landed yet) only before the
 * first generation.
 */
export function evolveWaitReason(f) {
  if (!f || !f.evolveMode) return null;
  if (f.slowRender) return 'held — governor froze the loop';
  if (f.batchPaused) return 'held — batch export running';
  if (f.evolveSource === 'beat') {
    if (f.beatRoute === 'phrase') return 'beats go to PHRASE — none reach EVOLVE';
    if (!f.audioEnabled && !f.beatMetro) return 'no beat input — audio off, metro off';
    // The dial metro is the only possible input and it is gated on the
    // loop running: stopped, no beat can ever arrive — a hard hold, named
    // at any gen. (Audio input has no such gate; it fires while stopped.)
    if (!f.audioEnabled && f.beatMetro && !f.running) return 'loop stopped — RUN to evolve';
    return f.gen > 0 ? null : 'waiting for a beat';
  }
  if (!f.running) return 'loop stopped — RUN to evolve';
  return null;
}
