// curator/dishPins.js — #1355: a pin is a creature's HOME in the dish, as data. Auto spawn (curator/spawn.js) chooses
// them from the artist's creature count; nobody places one by hand.
//
// A pin marks a place where a creature may form (a spore): it builds nothing by itself, the formation rule decides.
// Pins live in SCENE coordinates (the canvas before zoom and pan), so they mean the same thing in a recorded
// performance. At most MAX_PINS: the TE four.

export const MAX_PINS = 4;

const finite = (n) => typeof n === 'number' && Number.isFinite(n);

/** Keep only well-formed pins, at most MAX_PINS. Junk degrades by reduction. */
export function sanitizePins(pins) {
  if (!Array.isArray(pins)) return [];
  return pins.filter((p) => p && finite(p.x) && finite(p.y)).slice(0, MAX_PINS).map((p) => ({ x: p.x, y: p.y }));
}
