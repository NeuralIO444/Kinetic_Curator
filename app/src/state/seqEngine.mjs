// seqEngine — pure sequencer step math. No store, no DOM, no clock.
// The clock hook (seq-clocked slice) and the manual transport both drive
// through here; the selfcheck pins the semantics.

/** Visible setlist window. Slice seq-strip-cap replaces this with paging. */
export const SEQ_WINDOW = 12;

/** The arranged setlist the sequencer plays: oldest → newest, windowed. */
export function seqWindow(favorites) {
  const list = Array.isArray(favorites) ? favorites : [];
  return list.slice(Math.max(0, list.length - SEQ_WINDOW));
}

/**
 * Next playhead position.
 * Returns { index, wrapped, stopped }.
 * - Empty list: stopped, index 0.
 * - Past the end with loop on: wraps to 0.
 * - Past the end with loop off: holds at the last index, stopped.
 */
export function seqNextIndex(index, length, loop) {
  if (!Number.isFinite(length) || length <= 0) return { index: 0, wrapped: false, stopped: true };
  const next = (Number.isFinite(index) ? Math.trunc(index) : -1) + 1;
  if (next < length) return { index: next, wrapped: false, stopped: false };
  if (loop) return { index: 0, wrapped: true, stopped: false };
  return { index: length - 1, wrapped: false, stopped: true };
}

/** Transition mode for stepping INTO a favorite. Slice seq-gap-toggles owns the map. */
export function seqFireMode(gaps, favId) {
  if (gaps && favId != null && gaps[favId] === 'cut') return 'cut';
  return 'morph';
}
