// takeStrip.mjs — #1461 step 3: what the scrub strip shows for a loaded take. Pure.
//
// A take with a clock section (step 1) has bars: the strip says BAR n / m and scrubbing is by bar number. A take
// without one (recorded before bars existed) says seconds, and scrubbing is by time. Either way the strip's real unit
// is the frame: it hands playback a frame to seek to.
import { checkClockRecord, loopTimesOf, rebuildBars, barAtFrame, frameForBar } from './clockRecord.js';

const mmss = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * @param perf a loaded performance (checkPerformance'd)
 * @returns {{ frames, hasBars, lastBar, labelFor(frame), frameForPosition(p01), positionOf(frame), frameForBarNumber(bar) }}
 */
export function takeStripModel(perf) {
  const frames = perf.frames;
  const loopTimes = loopTimesOf(perf);
  const t0 = loopTimes.length ? loopTimes[0] : 0;
  const clock = checkClockRecord(perf.clock);
  const { downbeats } = clock ? rebuildBars(clock, loopTimes) : { downbeats: [] };
  const hasBars = !!clock && downbeats.length > 1;
  const lastBar = hasBars ? downbeats[downbeats.length - 1].bar : 0;
  const durationMs = Math.max(0, (loopTimes[frames - 1] ?? t0) - t0);
  const clampFrame = (f) => Math.max(0, Math.min(frames - 1, Math.floor(Number.isFinite(f) ? f : 0)));
  return {
    frames, hasBars, lastBar, durationMs,
    /** The text for the cursor at a frame. */
    labelFor(frame) {
      const f = clampFrame(frame);
      if (hasBars) return `BAR ${barAtFrame(downbeats, f) + 1} / ${lastBar + 1}`;
      return `${mmss((loopTimes[f] ?? t0) - t0)} / ${mmss(durationMs)}`;
    },
    /** 0..1 along the take for a frame. */
    positionOf(frame) {
      return frames > 1 ? clampFrame(frame) / (frames - 1) : 0;
    },
    /** The frame a drag to position p (0..1) means: snapped to a downbeat when the take has bars. */
    frameForPosition(p) {
      const q = Math.max(0, Math.min(1, Number.isFinite(p) ? p : 0));
      const raw = clampFrame(q * (frames - 1));
      if (!hasBars) return raw;
      const bar = barAtFrame(downbeats, raw);
      const f = frameForBar(downbeats, bar);
      return f === null ? raw : f;
    },
    frameForBarNumber(bar) {
      if (!hasBars) return null;
      return frameForBar(downbeats, bar);
    },
  };
}
