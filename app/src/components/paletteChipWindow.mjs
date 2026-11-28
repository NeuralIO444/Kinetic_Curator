// Palette strip chip window (#952) — pure, wall-clock-free.
//
// The strip shows a fixed number of chips (CHIP_CAP), but the KIN roll can
// land on any of the 37 system palettes plus saved user palettes. The window
// slides so the active palette is always one of the visible chips: the strip
// can never disagree with the roll about which palette is up.
//
// Behavior: while the active palette sits inside the head window the strip
// is stable (first `cap` chips, as before). Once the roll lands past it, the
// window slides just enough to keep the active chip as the last visible one.
export function chipWindowStart(count, activeIndex, cap) {
  if (!Number.isFinite(count) || !Number.isFinite(cap) || cap <= 0) return 0;
  if (count <= cap) return 0;
  if (!Number.isFinite(activeIndex) || activeIndex < 0) return 0;
  return Math.min(Math.max(0, activeIndex - cap + 1), count - cap);
}

// #2503 (B6) — the performer's own browse position over the same window.
// The follow window above only ever moves when the roll lands elsewhere;
// the strip's ‹ › keys step this clamp instead, so every palette is
// reachable without rolling. A browse start is just a start: clamped to
// the same legal range the follow window uses, 0 whenever the whole set
// fits or the inputs are degenerate.
export function clampChipWindowStart(count, start, cap) {
  if (!Number.isFinite(count) || !Number.isFinite(cap) || cap <= 0) return 0;
  if (count <= cap) return 0;
  if (!Number.isFinite(start)) return 0;
  return Math.min(Math.max(0, Math.floor(start)), count - cap);
}
