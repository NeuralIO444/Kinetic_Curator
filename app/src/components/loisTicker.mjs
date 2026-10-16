// loisTicker.mjs — the LOIS verdict line as a footer ticker (#1588).
//
// The verdict sentence used to sit in the top bar beside the Curator button, truncated with an
// ellipsis. It lives in LOIS's footer slot now, in the place the kaomoji face held: when the line is
// wider than the slot it scrolls — left to right, Matt's direction, literal — and loops; when it fits,
// it sits still. Reduced motion settles it: static, ellipsized by the slot's CSS. This module owns the
// decisions only; LoisPill.jsx measures the real widths and paints. The line itself is loisRank's
// last verdict — the exact string the top bar showed. No new copy, no new state.

import { getLoisVerdict } from '../curator/loisRank.js';

/** The line the ticker carries. '' until LOIS has actually picked; then the slot shows her state alone. */
export function tickerLine() {
  return getLoisVerdict();
}

/** Ticker speed, px per second. Slow and readable — a ticker, not a marquee advertisement. */
export const TICKER_SPEED_PX_S = 30;

/**
 * How the line renders in its slot.
 * - scroll: only when the text is wider than the slot AND motion is allowed. The run travels from
 *   fully left of the slot (translateX = -textWidth) to fully right of it (translateX = slotWidth),
 *   so it enters at the left edge and leaves at the right; the duration is the travel distance over
 *   TICKER_SPEED_PX_S, so the speed is the same whatever the line's length.
 * - static: the line fits, or reduced motion settles it (the slot ellipsizes it), or the widths are
 *   not measured yet — nothing animates on a guess.
 */
export function tickerMotion({ textWidth = 0, slotWidth = 0, reducedMotion = false } = {}) {
  if (!(textWidth > 0) || !(slotWidth > 0) || reducedMotion || textWidth <= slotWidth) {
    return { mode: 'static', from: 0, to: 0, durationS: 0 };
  }
  const from = -textWidth;
  const to = slotWidth;
  return { mode: 'scroll', from, to, durationS: (to - from) / TICKER_SPEED_PX_S };
}
