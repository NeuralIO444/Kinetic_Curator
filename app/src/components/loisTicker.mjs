// loisTicker.mjs — the LOIS verdict line as a footer ticker (#1588, direction + tape re-cut 2026-10-22).
//
// The verdict sentence used to sit in the top bar beside the Curator button, truncated with an
// ellipsis. It lives in LOIS's footer slot now, in the place the kaomoji face held: when the line is
// wider than the slot it runs as TAPE — right to left, the crawl read (Matt, 2026-10-22; it ran left to
// right until then) — carrying a solid-block divider after every line, so successive loops read as one
// continuous 80s stock tape rather than a sentence that leaves and comes back. The run holds two copies
// of the line+divider unit and travels by exactly ONE unit per loop, which is what makes the wrap
// invisible (the pattern's period is the travel), so there is never a blank frame in the slot. When the
// unit fits, it sits still. Reduced motion settles it: static, ellipsized by the slot's CSS.
// This module owns the decisions only; LoisPill.jsx measures the real widths and paints. The line
// itself is loisRank's last verdict — the exact string the top bar showed. The divider is decoration
// beside it (aria-hidden in the paint), never copy: no new words, no new state.

import { getLoisVerdict } from '../curator/loisRank.js';

/** The line the ticker carries. '' until LOIS has actually picked; then the slot shows her state alone. */
export function tickerLine() {
  return getLoisVerdict();
}

/** Ticker speed, px per second. Slow and readable — a ticker, not a marquee advertisement. */
export const TICKER_SPEED_PX_S = 30;

/** The tape's divider: solid blocks between repeats (80s stock tape). Decoration, not copy — the paint
 *  gives it its side-spacing (CSS), so the measured unit and the painted unit are the same width. */
export const TICKER_DIVIDER = '■■■';

/**
 * How the line renders in its slot.
 * - scroll: only when one line+divider unit is wider than the slot AND motion is allowed (Matt, 2026-10-22:
 *   enough text to keep scrolling, and it keeps scrolling; too short to be tape, it sits still). The run
 *   carries two units and travels from translateX = 0 to translateX = -textWidth — one whole unit leftward,
 *   so the tape runs right to left and the wrap lands on an identical frame. The duration is that one unit
 *   over TICKER_SPEED_PX_S, so the speed is the same whatever the line's length.
 * - static: the unit fits, or reduced motion settles it (the slot ellipsizes it), or the widths are
 *   not measured yet — nothing animates on a guess.
 */
export function tickerMotion({ textWidth = 0, slotWidth = 0, reducedMotion = false } = {}) {
  if (!(textWidth > 0) || !(slotWidth > 0) || reducedMotion || textWidth <= slotWidth) {
    return { mode: 'static', from: 0, to: 0, durationS: 0 };
  }
  const from = 0;
  const to = -textWidth;
  return { mode: 'scroll', from, to, durationS: (from - to) / TICKER_SPEED_PX_S };
}
