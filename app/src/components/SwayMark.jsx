// SwayMark (#1258) — the presence mark next to BEATS on the top bar.
//
// Amends the 2026-10-07 never-renders law per Matt's 2026-10-09 call: exactly
// one icon, and it is never named — no name, no tooltip, no label, no
// user-visible identifier. (The sway mechanics' deniability selfcheck scans UI
// source for her identifiers; this file references none of them.)
//
// Behavior: present and breathing amber (Davis — sway is a continuous signal)
// when the sway magnitude in the store clears the threshold; fully absent
// below it (silence is default, not a dimmed ghost). The pick path publishes
// the magnitude on every CURATE press. The component never references the
// scheduler (director.selfcheck: "the Director never renders") — it reads
// the store, which the allowed pick path writes. Reduced motion: static
// mark, no pulse.
import { useStore } from '../state/store.js';
import { SWAY_VISIBLE_THRESHOLD } from '../curator/swayView.mjs';

export function SwayMark() {
  // The store carries the magnitude; the component re-renders when the pick
  // path publishes a new one (same commit as curatePress).
  const mag = useStore((s) => s.swayMagnitude);
  const visible = Number.isFinite(mag) && mag > SWAY_VISIBLE_THRESHOLD;
  if (!visible) return null;
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
