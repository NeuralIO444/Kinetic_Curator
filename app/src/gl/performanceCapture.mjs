// performanceCapture.mjs — #1353 step 4: record a take of the live instrument, on demand.
//
// Recording is OFF until the artist starts it: while it runs, every frame's inputs are diffed and its output folded
// into the hash chain (about 0.1 to 0.3 ms a frame), and nobody should pay that for a feature they are not using.
// Start attaches the recorder to the two resolver taps AND RESTARTS THE SCENE (a fresh resolver: a take that began
// mid-session could not replay, because the resolver carries state from before it). Stop detaches the recorder and
// returns the finished performance.
// One take at a time. The take's seed is read from the first recorded frame, for the file name only.
import {
  setResolveTap,
  setResolveOutputTap,
  requestResolverReset,
  setResolverSwapListener,
  snapshotLiveResolver,
} from './resolveTap.mjs';
import { createPerformanceRecorder, packPerformance } from './performanceFile.mjs';
import { createRetroCapture } from './retroCapture.mjs';

let recorder = null;
let seed = 0;
let sections = null; // name -> { stop() => data }: extra tracks a caller records alongside the take

// ── #1367 — retroactive capture: the always-on ring ─────────────────────────────────────────────
// The ring records every frame from when it starts, so a moment can be saved after it happens
// (retroCapture.mjs). It owns the two taps while it runs. A deliberate take PRE-EMPTS it: rec
// restarts the scene, which would invalidate the ring's history anyway, so startPerformance
// suspends the ring and stopPerformance restarts it fresh on the new scene. A resolver swap
// from anywhere else (a playback rewind) clears the ring through the swap listener.
let retro = null;
let retroOpts = null;
let suspendedRetroOpts = null;

setResolverSwapListener(() => {
  if (retro) retro.clear();
});

/** Begin retroactive capture. Returns false when the ring or a take is already running. */
export function startRetroCapture(opts = {}) {
  if (retro || recorder) return false;
  retroOpts = opts;
  retro = createRetroCapture({ snapshotProvider: snapshotLiveResolver, ...opts });
  const ring = retro;
  setResolveTap((input) => ring.onInput(input));
  setResolveOutputTap((output) => ring.onOutput(output));
  return true;
}

/** Stop retroactive capture and release the taps. Returns false when it was not running. */
export function stopRetroCapture() {
  if (!retro) return false;
  retro = null;
  retroOpts = null;
  if (!recorder) {
    setResolveTap(null);
    setResolveOutputTap(null);
  }
  return true;
}

export function isRetroCapturing() {
  return retro !== null;
}

/** The ring's window state (frames held, snapshots retained), or null when it is not running. */
export function retroCaptureStats() {
  return retro ? retro.stats() : null;
}

/**
 * Save the last `minutes` (nominal, at 60 fps — frames are the ring's currency) as a take that
 * begins mid-session. Resolves to { perf, bytes, filename }, or null when the ring is not
 * running or holds nothing takeable yet.
 */
export async function saveRetroPerformance(minutes = 3) {
  if (!retro) return null;
  const perf = retro.saveLast(Math.max(1, Math.round(minutes * 60 * 60)));
  if (!perf) return null;
  const bytes = await packPerformance(perf);
  return { perf, bytes, filename: `kc-performance-retro-${perf.frames}f.kcperf` };
}

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
  // #1367 — a deliberate take pre-empts the ring (its scene restart invalidates the ring's
  // history); the ring restarts fresh when the take stops.
  suspendedRetroOpts = retro ? retroOpts : null;
  if (retro) stopRetroCapture();
  const { sections: makers, ...recOpts } = opts;
  const r = createPerformanceRecorder(recOpts);
  let first = true;
  recorder = r;
  seed = 0;
  setResolveTap((input) => {
    if (first) {
      first = false;
      seed = Number.isFinite(input && input.seed) ? input.seed >>> 0 : 0;
    }
    r.onInput(input);
  });
  setResolveOutputTap((output) => r.onOutput(output));
  // THE SCENE RESTARTS (Matt, 2026-10-11): the take begins on a fresh resolver, so it replays exactly.
  requestResolverReset();
  sections = {};
  for (const name of Object.keys(makers || {})) {
    try {
      sections[name] = makers[name](() => r.frames);
    } catch {
      /* a section that cannot start is simply absent */
    }
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
  // #1367 — restart the ring the take pre-empted, fresh on the take's scene.
  if (suspendedRetroOpts) {
    const o = suspendedRetroOpts;
    suspendedRetroOpts = null;
    startRetroCapture(o);
  }
  const extra = sections || {};
  sections = null;
  const data = {};
  for (const name of Object.keys(extra)) {
    try {
      data[name] = extra[name].stop();
    } catch {
      /* a section that cannot finish is left out */
    }
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
