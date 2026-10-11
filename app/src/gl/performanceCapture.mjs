// performanceCapture.mjs — #1353 step 4: record a take of the live instrument, on demand.
//
// Recording is OFF until the artist starts it: while it runs, every frame's inputs are diffed and its output folded
// into the hash chain (about 0.1 to 0.3 ms a frame), and nobody should pay that for a feature they are not using.
// Start attaches the recorder to the two resolver taps AND RESTARTS THE SCENE (a fresh resolver: a take that began
// mid-session could not replay, because the resolver carries state from before it). Stop detaches the recorder and
// returns the finished performance.
// One take at a time. The take's seed is read from the first recorded frame, for the file name only.
import { setResolveTap, setResolveOutputTap, requestResolverReset } from './resolveTap.mjs';
import { createPerformanceRecorder, packPerformance } from './performanceFile.mjs';

let recorder = null;
let seed = 0;
let sections = null; // name -> { stop() => data }: extra tracks a caller records alongside the take

export function isRecordingPerformance() {
  return recorder !== null;
}

/** Frames captured so far in the current take (0 when not recording). */
export function performanceFrames() {
  return recorder ? recorder.frames : 0;
}

/**
 * Begin a take. Returns false when one is already running.
 * `opts.sections` is an optional map name -> (getFrame) => ({ stop() => data }): each is started now with a function
 * that returns the take's current frame, and its data is stored on the performance under that name when the take
 * stops. This is how the stress record rides along without this module knowing what it is.
 */
export function startPerformance(opts = {}) {
  if (recorder) return false;
  const { sections: makers, ...recOpts } = opts;
  const r = createPerformanceRecorder(recOpts);
  let first = true;
  recorder = r;
  seed = 0;
  setResolveTap((input) => {
    if (first) { first = false; seed = Number.isFinite(input && input.seed) ? input.seed >>> 0 : 0; }
    r.onInput(input);
  });
  setResolveOutputTap((output) => r.onOutput(output));
  // THE SCENE RESTARTS (Matt, 2026-10-11): the take begins on a fresh resolver, so it replays exactly.
  requestResolverReset();
  sections = {};
  for (const name of Object.keys(makers || {})) {
    try { sections[name] = makers[name](() => r.frames); } catch { /* a section that cannot start is simply absent */ }
  }
  return true;
}

/**
 * End the take. Resolves to { perf, bytes, filename }, or null when nothing was recording or no frame was resolved
 * (an empty take is not a performance). The taps are always released.
 */
export async function stopPerformance() {
  const r = recorder;
  if (!r) return null;
  recorder = null;
  setResolveTap(null);
  setResolveOutputTap(null);
  const extra = sections || {};
  sections = null;
  const data = {};
  for (const name of Object.keys(extra)) {
    try { data[name] = extra[name].stop(); } catch { /* a section that cannot finish is left out */ }
  }
  let perf;
  try {
    perf = { ...r.finish(), ...data };
  } catch {
    return null;
  }
  const bytes = await packPerformance(perf);
  return { perf, bytes, filename: `kc-performance-${seed.toString(16)}-${perf.frames}f.kcperf` };
}
