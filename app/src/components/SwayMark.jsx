// SwayMark (#1258) — the presence mark next to BEATS on the top bar.
//
// Amends the 2026-10-07 never-renders law per Matt's 2026-10-09 call: exactly
// one icon, and it is never named — no name, no tooltip, no label, no
// user-visible identifier. (The sway mechanics' deniability selfcheck scans UI
// source for her identifiers; this file references none of them.)
//
// Behavior: present and breathing amber (Davis — sway is a continuous signal)
// when the last Director tick's sway clears the threshold; fully absent
// below it (silence is default, not a dimmed ghost). The Director ticks at
// pick time (roll/keep/seed/evolve), never per frame, so the mark reflects
// the steering of the last pick. Reduced motion: static mark, no pulse.
import { useStore } from '../state/store.js';
import { getDirector } from '../curator/director.js';
import { swayMagnitude, swayVisible } from './swayMark.mjs';

/** The last tick's sway view, or null when the Director is unreachable. */
function readSwayView() {
  try {
    return getDirector().lastSway;
  } catch {
    return null;
  }
}

export function SwayMark() {
  // Re-render whenever a pick could have run the Director. The tick writes
  // lastSway before the store update commits, so the read below is fresh.
  // Values unused — subscription is the point.
  useStore((s) => s.curatePress);
  useStore((s) => (Array.isArray(s.keeps) ? s.keeps.length : 0));
  useStore((s) => s.seed);
  const swayView = readSwayView();
  if (!swayVisible(swayView)) return null;
  const mag = swayMagnitude(swayView);
  return (
    <span
      className="sway-mark"
      aria-hidden="true"
      style={{ '--sway': mag.toFixed(3) }}
    >
      👸🏽
    </span>
  );
}
