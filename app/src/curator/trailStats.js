// trailStats.js — #1807: the ACCUM buffer's statistics, boiled down for the personas' `show` block
// (showSpectrum.js's sibling). Pure shaping plus the per-bar reader the trio samples.
//   energy      trail energy — the buffer's mean luminance (how much light the stage is holding)
//   channels    the RGB means — under spectral fade (#1800) their ratios are a coarse average age
//               of the held light: the buffer's colour tells its memory's age
//   saturation  saturation pressure — the fraction of pixels above the #1801 knee (how close the
//               buffer is to blowing out)
// The numbers are honest measurements of the buffer, rounded for speech (r3, the show block's
// convention) but NEVER clamped into a range they didn't measure: a buffer holding mean light
// above 1.0 says so. Absence stays absence — ACCUM off (or no reading yet) is null, not zeros.
import { getStatsSnapshot } from '../gl/statsLive.mjs';

const r3 = (v) => Math.round(v * 1000) / 1000;

/** A stat may be consumed while it is at most this many frames old (it is born up to
 *  STATS_EVERY frames stale by design). Older than this, a consumer must log the
 *  consumption — the acceptance's staleness rule. */
export const STALE_MAX_FRAMES = 30;

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Shape one stamped reading for the show block, or null when it is missing or malformed.
 * @param st { frame, energy, channels: [r, g, b], saturation } | null
 */
export function trailSummary(st) {
  if (!st || typeof st !== 'object') return null;
  const ch = st.channels;
  if (!Array.isArray(ch) || ch.length !== 3 || !ch.every(finite)) return null;
  if (!finite(st.energy) || !finite(st.saturation)) return null;
  return {
    energy: r3(st.energy),
    channels: [r3(ch[0]), r3(ch[1]), r3(ch[2])],
    saturation: r3(Math.min(1, Math.max(0, st.saturation))),
  };
}

/**
 * The per-bar reader the trio samples (createShowSpectrum's shape): the latest stamped
 * reading, shaped. The sampler is a CONSUMER, so it honours the staleness rule: when the
 * reading it hands over is older than STALE_MAX_FRAMES against the loop's own step count,
 * the consumption is appended to its stale log (readable via staleLog() — the backstage
 * and the selfcheck read it). It still returns the reading: a flagged stale number is
 * honest; silently dressing it as current would not be.
 * @param getSnapshot () => { stats, frame } | null — injected for tests; defaults to the live wire.
 */
export function createTrailSampler(getSnapshot = getStatsSnapshot) {
  const stale = [];
  return {
    sample() {
      const snap = (() => {
        try {
          return getSnapshot();
        } catch {
          return null;
        }
      })();
      if (!snap || !snap.stats) return null;
      const sum = trailSummary(snap.stats);
      if (!sum) return null;
      const age = snap.frame - snap.stats.frame;
      if (age > STALE_MAX_FRAMES) {
        stale.push({ at: snap.frame, stamp: snap.stats.frame, age });
        if (stale.length > 50) stale.shift();
      }
      return sum;
    },
    /** Every consumption this sampler made of a too-old reading, oldest first. */
    staleLog() {
      return stale.slice();
    },
    reset() {
      stale.length = 0;
    },
  };
}
