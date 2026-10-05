// HITS queue transport (#966) — pure helpers, no React, no store.
// The queue is the FavoritesTray's visible setlist window: performance order
// is favorites array order (oldest → newest), last N visible.

/** Tray window size — matches FavoritesTray's MAX_VISIBLE. */
export const QUEUE_MAX_VISIBLE = 12;

/** Fallback tempo until the UX-4 BEAT button (state.beatBpm) lands. */
export const QUEUE_BEAT_FALLBACK_BPM = 120;

export const QUEUE_SECONDS_MIN = 2;
export const QUEUE_SECONDS_MAX = 60;
export const QUEUE_SECONDS_DEFAULT = 8;
export const QUEUE_BEATS_MIN = 1;
export const QUEUE_BEATS_MAX = 32;
export const QUEUE_BEATS_DEFAULT = 4;

/** The setlist the transport walks: same window the tray shows. */
export function visibleQueue(favorites) {
  const list = Array.isArray(favorites) ? favorites : [];
  const start = Math.max(0, list.length - QUEUE_MAX_VISIBLE);
  return list.slice(start);
}

/** End of queue loops back to the head. */
export function nextQueueIndex(idx, len) {
  if (!len) return 0;
  return (idx + 1) % len;
}

/** Clamp an index into a queue of len (used when favorites are removed mid-play). */
export function clampQueueIndex(idx, len) {
  if (!len) return 0;
  const i = Math.floor(Number(idx) || 0);
  return Math.max(0, Math.min(len - 1, i));
}

export function sanitizeQueueSeconds(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return QUEUE_SECONDS_DEFAULT;
  return Math.max(QUEUE_SECONDS_MIN, Math.min(QUEUE_SECONDS_MAX, n));
}

export function sanitizeQueueBeats(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return QUEUE_BEATS_DEFAULT;
  return Math.max(QUEUE_BEATS_MIN, Math.min(QUEUE_BEATS_MAX, n));
}

export function sanitizeQueueSource(v) {
  return v === 'beat' ? 'beat' : 'time';
}

/**
 * Milliseconds a hit holds before the transport advances.
 * TIME: seconds per hit. BEAT: beats per hit at the BEAT-button tempo.
 */
export function queueHoldMs(source, secondsPerHit, beatsPerHit, beatBpm) {
  if (sanitizeQueueSource(source) === 'beat') {
    const beats = sanitizeQueueBeats(beatsPerHit);
    const bpm = Number(beatBpm) > 0 ? Number(beatBpm) : QUEUE_BEAT_FALLBACK_BPM;
    return Math.round((beats * 60000) / bpm);
  }
  return Math.round(sanitizeQueueSeconds(secondsPerHit) * 1000);
}

/** "3/5" style advance indicator. Empty queue → '—'. */
export function queuePositionLabel(idx, len) {
  if (!len) return '—';
  return `${clampQueueIndex(idx, len) + 1}/${len}`;
}
