// stressRecord.js — #1354: a take's stress, recorded and replayable. Pure.
//
// "Bands change deterministically from a recorded log" (Phase 2's exit). While a performance is being recorded, every
// stress-tracker update is logged: the three signals it was fed, as run-lengths (the smoothing advances on every
// update, so the COUNT of updates matters even when the signals hold), plus each band change. Replaying those
// signals through a tracker that starts from the same state must reproduce the same band changes, in order.
//
// THE LOG WINS (roadmap decision 1): the recorded `bands` are the authority. Replay is the CHECK that they follow
// from the recorded signals, and `occupancy` (updates spent in each band) is the telemetry for tuning thresholds.
import { createStressTracker, BANDS } from './stress.js';

export const STRESS_RECORD_VERSION = 1;

/**
 * Recorder. `initial` is the live tracker's state when the take begins ({ smoothed, band }); `getFrame()` returns
 * the take's current frame index (an annotation: order is what replays). Feed it every tracker update.
 */
export function createStressRecorder({ initial = null, getFrame = () => 0 } = {}) {
  const runs = []; // [frame, activity, dish, taste, n]
  const bands = []; // [frame, band]
  const occupancy = { relax: 0, normal: 0, tighten: 0 };
  let last = null;
  let band = initial && BANDS.includes(initial.band) ? initial.band : null;
  return {
    update({ activity, dish, taste, band: now }) {
      const frame = getFrame() | 0;
      if (last && last[1] === activity && last[2] === dish && last[3] === taste) last[4] += 1;
      else { last = [frame, activity, dish, taste, 1]; runs.push(last); }
      if (now !== band) { band = now; bands.push([frame, now]); }
      if (now in occupancy) occupancy[now] += 1;
    },
    finish() {
      return {
        version: STRESS_RECORD_VERSION,
        initial: initial ? { smoothed: initial.smoothed ?? null, band: initial.band ?? null } : null,
        runs: runs.map((r) => r.slice()),
        bands: bands.map((b) => b.slice()),
        occupancy: { ...occupancy },
      };
    },
  };
}

/** Replay a record's signals; returns the band changes they produce, in order (frames are not recomputed). */
export function replayStress(record) {
  const t = createStressTracker({ initial: record.initial });
  const out = [];
  for (const [, activity, dish, taste, n] of record.runs) {
    for (let i = 0; i < n; i++) {
      for (const e of t.update({ activity, dish, taste }).events) if (e.type === 'band') out.push(e.band);
    }
  }
  return out;
}

/**
 * Check a record: do its logged band changes follow from its logged signals?
 * @returns {{ ok: boolean, updates: number, bandChanges: number, firstMismatch: number|null }}
 */
export function verifyStressRecord(record) {
  if (!record || record.version !== STRESS_RECORD_VERSION || !Array.isArray(record.runs) || !Array.isArray(record.bands)) {
    return { ok: false, updates: 0, bandChanges: 0, firstMismatch: 0 };
  }
  const got = replayStress(record);
  const want = record.bands.map((b) => b[1]);
  let firstMismatch = null;
  for (let i = 0; i < Math.max(got.length, want.length); i++) {
    if (got[i] !== want[i]) { firstMismatch = i; break; }
  }
  return {
    ok: firstMismatch === null,
    updates: record.runs.reduce((s, r) => s + r[4], 0),
    bandChanges: want.length,
    firstMismatch,
  };
}
