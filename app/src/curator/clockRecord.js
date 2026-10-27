// clockRecord.js — #1461 step 1: a take carries its BPM sequence, so bars can be rebuilt on playback.
//
// The resolver's input does not carry the BEAT BPM (it drives the phrase, the pulse and the clock, which sit beside
// the resolver). The musical clock is a pure function of (loop time, BPM), and a take already holds the loop time of
// every frame, so the only thing missing to know "where is bar 12" is the BPM at each moment. This records exactly
// that: the BPM when the take began and every change after, by frame. Everything else is re-derived, never stored.
//
// THE LOG WINS (roadmap decision 1) like the other sections: these changes are the authority; replay is the check.
import { createMusicalClock, BEATS_PER_BAR } from '../gl/musicalClock.mjs';
import { replayInputs } from '../engine/kernel/replay/inputLog.js';

export const CLOCK_RECORD_VERSION = 1;

/**
 * Recorder. `getFrame()` returns the take's current frame index (an annotation: order is what replays).
 * @param initialBpm the BEAT BPM when the take begins
 */
export function createClockRecorder({ initialBpm = 120, beatsPerBar = BEATS_PER_BAR, getFrame = () => 0 } = {}) {
  const changes = []; // [frame, bpm]
  let bpm = Number.isFinite(initialBpm) ? initialBpm : 120;
  return {
    /** The BPM now (call on every change; the same value is ignored). */
    set(next) {
      if (!Number.isFinite(next) || next === bpm) return;
      bpm = next;
      changes.push([getFrame() | 0, bpm]);
    },
    finish() {
      return {
        version: CLOCK_RECORD_VERSION,
        beatsPerBar,
        initial: Number.isFinite(initialBpm) ? initialBpm : 120,
        changes: changes.map((c) => c.slice()),
      };
    },
  };
}

/** Fail-closed shape check: the record, or null. */
export function checkClockRecord(r) {
  if (!r || typeof r !== 'object' || r.version !== CLOCK_RECORD_VERSION) return null;
  if (!Number.isInteger(r.beatsPerBar) || r.beatsPerBar < 1 || r.beatsPerBar > 16) return null;
  if (!Number.isFinite(r.initial) || r.initial < 30 || r.initial > 300) return null;
  if (!Array.isArray(r.changes)) return null;
  let prev = -1;
  for (const c of r.changes) {
    if (!Array.isArray(c) || c.length !== 2 || !Number.isInteger(c[0]) || c[0] < prev || !Number.isFinite(c[1]))
      return null;
    prev = c[0];
  }
  return r;
}

/** The loop time (ms) of every frame of a take, in order. */
export function loopTimesOf(perf) {
  const out = [];
  for (const input of replayInputs(perf.inputs))
    out.push(Number.isFinite(input && input.loopTimeMs) ? input.loopTimeMs : 0);
  return out;
}

/**
 * Re-run the musical clock over a take. Returns the downbeats and the BPM at every frame.
 * @returns {{ downbeats: Array<{bar:number, frame:number}>, bpmAt: number[] }}
 */
export function rebuildBars(record, loopTimes) {
  const rec = checkClockRecord(record);
  if (!rec) return { downbeats: [], bpmAt: [] };
  const clock = createMusicalClock({ beatsPerBar: rec.beatsPerBar });
  const downbeats = [{ bar: 0, frame: 0 }];
  const bpmAt = [];
  let bpm = rec.initial;
  let ci = 0;
  for (let f = 0; f < loopTimes.length; f++) {
    while (ci < rec.changes.length && rec.changes[ci][0] <= f) {
      bpm = rec.changes[ci][1];
      ci++;
    }
    bpmAt.push(bpm);
    const r = clock.advance(loopTimes[f], bpm);
    if (r.restarted) continue;
    for (const t of r.ticks) if (t.type === 'bar') downbeats.push({ bar: t.bar, frame: f });
  }
  return { downbeats, bpmAt };
}

/** The frame of a bar's downbeat, or null past the end of the take. */
export function frameForBar(downbeats, bar) {
  const hit = downbeats.find((d) => d.bar === bar);
  return hit ? hit.frame : null;
}

/** The bar a frame falls in (the last downbeat at or before it). */
export function barAtFrame(downbeats, frame) {
  let bar = 0;
  for (const d of downbeats) {
    if (d.frame <= frame) bar = d.bar;
    else break;
  }
  return bar;
}

/**
 * The checkpoint a scrub to `bar` should start from: the latest checkpoint frame at or before the bar's downbeat
 * (replay is exact only from the start of the take or a checkpoint's chain, so playback re-applies from there).
 * @returns {{ bar, frame, checkpointFrame }|null}
 */
export function scrubTarget(perf, downbeats, bar) {
  const frame = frameForBar(downbeats, bar);
  if (frame === null) return null;
  let checkpointFrame = 0;
  for (const c of perf.checkpoints) if (c.frame <= frame && c.frame >= checkpointFrame) checkpointFrame = c.frame;
  return { bar, frame, checkpointFrame };
}
