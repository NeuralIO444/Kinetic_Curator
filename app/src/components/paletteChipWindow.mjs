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
