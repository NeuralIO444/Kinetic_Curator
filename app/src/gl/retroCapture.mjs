// retroCapture.mjs — #1367 slice 3: the retroactive capture ring.
//
// The capture performers asked for (#1367): press a button AFTER a great moment and keep the last
// N minutes. This ring is always on while the instrument plays: every frame's input goes into a
// delta log and its output into the hash chain (the recorder's two taps, the same ~0.1–0.3 ms a
// frame), and every `snapshotEvery` frames the ring takes a snapshot of the resolver's state
// (slice 1) together with the chain's value at that boundary. `saveLast(n)` then emits a take
// that begins at a retained snapshot — its input log rebased to the boundary, its checkpoints
// continuing the live chain through the seed (slice 2's initialState section) — and the take
// verifies exactly like a deliberate one.
//
// BOUNDED, by construction: at most `maxSnapshots` snapshots are retained, and the input log is
// cut at the oldest retained snapshot's boundary whenever retention moves past it, so retained
// inputs stay within (maxSnapshots + 1) × snapshotEvery frames. If snapshots stop arriving for
// more than 2 × snapshotEvery frames — a long governor shed, a dead snapshot provider — the ring
// CLEARS and restarts its window rather than pretend coverage it does not have: a gap in the
// input sequence would make every take it emitted a lie.
//
// THE GOVERNOR TIER: the shed signal is already in every recorded input — while `perfTier1`
// holds (the governor's tier-1 state), the ring stops taking snapshots (the expensive part).
// Saves during a shed reach back to the last pre-shed boundary; a shed longer than the
// staleness bound clears the ring, and coverage re-arms when the shed lifts.
//
// A resolver SWAP (reset, playback rewind) invalidates every snapshot and the chain's history:
// the coordinator clears the ring from resolveTap's swap listener. Playback frames are never
// tapped, so they never enter the ring.
import { createInputLog, rebaseInputLog } from '../engine/kernel/replay/inputLog.js';
import { KERNEL_VERSION } from '../engine/kernel/version.js';
import {
  createHashChain,
  checkPerformance,
  PERFORMANCE_FORMAT,
  PERFORMANCE_VERSION,
  CHECKPOINT_EVERY,
  MACHINE_KEYS,
} from './performanceFile.mjs';

export const RETRO_DEFAULTS = Object.freeze({
  checkpointEvery: CHECKPOINT_EVERY,
  snapshotEvery: 1800, // 30 s at 60 fps
  maxSnapshots: 10, // ≈ a 5-minute window at the default spacing
});

/**
 * Create the ring. `snapshotProvider` returns the live resolver's snapshot at a frame boundary
 * (resolveTap's snapshotLiveResolver), or null when none is available — a null skips that
 * boundary, and the staleness rule handles a provider that stays dead.
 */
export function createRetroCapture({
  snapshotProvider,
  checkpointEvery = RETRO_DEFAULTS.checkpointEvery,
  snapshotEvery = RETRO_DEFAULTS.snapshotEvery,
  maxSnapshots = RETRO_DEFAULTS.maxSnapshots,
} = {}) {
  if (typeof snapshotProvider !== 'function') throw new TypeError('[retroCapture] a snapshotProvider is required');
  if (!Number.isInteger(checkpointEvery) || checkpointEvery < 1)
    throw new RangeError('[retroCapture] checkpointEvery must be a positive integer');
  if (!Number.isInteger(snapshotEvery) || snapshotEvery < checkpointEvery || snapshotEvery % checkpointEvery !== 0) {
    throw new RangeError(
      '[retroCapture] snapshotEvery must be a multiple of checkpointEvery (snapshots land on checkpoints)',
    );
  }
  if (!Number.isInteger(maxSnapshots) || maxSnapshots < 1)
    throw new RangeError('[retroCapture] maxSnapshots must be a positive integer');

  let log = createInputLog();
  let chain = createHashChain();
  let checkpoints = []; // { frame, hash } — ring frames
  let snapshots = []; // { frame, snapshot, chainSeed } — frame = the boundary's last resolved frame
  let baseFrame = 0; // the ring frame the log's frame 0 currently is
  let resolved = 0; // outputs seen = frames resolved since the window started
  let pending = false; // an input was recorded and its output has not arrived yet
  let shedInput = false; // the governor's tier-1 signal, read off the input stream
  let shedManual = false;

  /** Drop every retained structure. The window restarts at the next frame. */
  function clear() {
    log = createInputLog();
    chain = createHashChain();
    checkpoints = [];
    snapshots = [];
    baseFrame = 0;
    resolved = 0;
    pending = false;
  }

  /**
   * Cut the log so its frame 0 is ring frame `newBase`. When the cut point is the next frame
   * to be recorded (newBase == resolved), every recorded frame precedes it: the log restarts
   * EMPTY and the next record() writes a full-state step — dropBefore cannot express that cut
   * (it clamps to the last recorded frame and would leave the log's frame 0 one behind the base).
   */
  function cutLogTo(newBase) {
    if (newBase <= baseFrame) return;
    if (newBase >= resolved) log = createInputLog();
    else log.dropBefore(newBase - baseFrame);
    baseFrame = newBase;
    checkpoints = checkpoints.filter((c) => c.frame >= baseFrame);
  }

  /** Retention + staleness, run per resolved frame. See the header for the invariants. */
  function prune() {
    while (snapshots.length > maxSnapshots) snapshots.shift();
    if (snapshots.length) {
      cutLogTo(snapshots[0].frame + 1);
      // snapshots gone stale (a long shed): the window restarts rather than lie about coverage
      if (resolved - snapshots[snapshots.length - 1].frame > 2 * snapshotEvery) clear();
    } else if (log.frames > 2 * snapshotEvery) {
      clear(); // no boundary ever landed and the log outgrew the arming window
    }
  }

  function onInput(input) {
    shedInput = !!(input && input.perfTier1);
    log.record(input);
    pending = true;
  }

  function onOutput(output) {
    if (!pending) return;
    pending = false;
    const frame = resolved;
    resolved += 1;
    chain.push(output);
    if (frame % checkpointEvery === 0) checkpoints.push({ frame, hash: chain.value() });
    if ((frame + 1) % snapshotEvery === 0 && !shedInput && !shedManual) {
      const snapshot = snapshotProvider();
      if (snapshot) snapshots.push({ frame, snapshot, chainSeed: chain.value() });
    }
    prune();
  }

  /**
   * Build the take covering the last `wantFrames` frames (or the closest the window allows):
   * the newest snapshot boundary at or before the target, else the oldest retained one, else —
   * while nothing has ever been cut — a from-launch take with no initialState section.
   * Returns a validated performance object, or null when the window holds nothing takeable.
   */
  function saveLast(wantFrames) {
    if (resolved === 0) return null;
    const now = resolved - 1;
    let entry = null;
    for (const s of snapshots) if (s.frame <= now - wantFrames) entry = s;
    if (!entry && snapshots.length) entry = snapshots[0];
    if (!entry && baseFrame !== 0) return null;
    const startFrame = entry ? entry.frame + 1 : 0;
    if (startFrame > now) return null; // the boundary is the newest frame: nothing after it to take
    const rel = checkpoints
      .filter((c) => c.frame >= startFrame)
      .map((c) => ({ frame: c.frame - startFrame, hash: c.hash }));
    if (!rel.length) return null;
    const frames = rel[rel.length - 1].frame + 1;
    const rebased = rebaseInputLog(log.finish(), startFrame - baseFrame);
    return checkPerformance({
      format: PERFORMANCE_FORMAT,
      version: PERFORMANCE_VERSION,
      kernelVersion: KERNEL_VERSION,
      frames,
      truncated: false,
      machineKeys: [...MACHINE_KEYS],
      checkpointEvery,
      checkpoints: rel,
      inputs: { ...rebased, frames, steps: rebased.steps.slice(0, frames) },
      ...(entry ? { initialState: { atFrame: startFrame, chainSeed: entry.chainSeed, snapshot: entry.snapshot } } : {}),
    });
  }

  return {
    onInput,
    onOutput,
    saveLast,
    clear,
    /** The coordinator's manual shed (the input stream's perfTier1 is the automatic one). */
    setShed(on) {
      shedManual = !!on;
    },
    /** Window state, for readouts and proofs. */
    stats() {
      return {
        frames: resolved,
        logFrames: log.frames,
        baseFrame,
        snapshots: snapshots.length,
        checkpoints: checkpoints.length,
        shed: shedInput || shedManual,
      };
    },
  };
}
