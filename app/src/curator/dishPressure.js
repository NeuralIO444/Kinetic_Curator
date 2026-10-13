// curator/dishPressure.js — #1355 Phase 3 step 2: dish pressure, the third stress signal.
//
// How crowded the dish is around the canvas pins: the number of marks inside a small radius of a pin, at the MOST
// crowded pin, as a share of DISH_SATURATE. A count of what the resolver actually placed this frame: no clock, no
// chance, nothing invented. No pins, no pressure.
//
// The radius and the saturation count are the roadmap's open tunables ("telemetry will inform"): the ?debug=stress
// readout and the take's stress record are how they get tuned. Like all stress, this is telemetry: it is recomputed
// on the machine that plays, never read back from a file (roadmap decision 1), so a machine that sheds detail
// honestly reads a less crowded dish.

/** The neighbourhood radius, as a share of the canvas's shorter side. */
export const DISH_RADIUS = 0.12;
/** Marks around the most crowded pin that read as full pressure. */
export const DISH_SATURATE = 24;

/**
 * #1355 step 3 — each pin's own pressure, in pin order (the formation rule reads every pin, not just the most crowded).
 * Same count, radius and saturation as dishPressure. A malformed pin reads 0.
 * @param pins     [{x, y}] scene coordinates (curator/dishPins.js)
 * @param entries  the resolver's output: layers with `items` [{x, y}] (pattern and FX layers have none)
 * @returns number[] 0..1 per pin
 */
export function pinPressures(pins, entries, canvasW, canvasH) {
  if (!Array.isArray(pins) || pins.length === 0) return [];
  const r = DISH_RADIUS * Math.min(canvasW, canvasH);
  if (!(r > 0) || !Array.isArray(entries)) return pins.map(() => 0);
  const r2 = r * r;
  return pins.map((pin) => {
    if (!pin || !Number.isFinite(pin.x) || !Number.isFinite(pin.y)) return 0;
    let n = 0;
    for (const e of entries) {
      const items = e && e.items;
      if (!Array.isArray(items)) continue;
      for (let i = 0; i < items.length; i++) {
        if (items[i]._creature) continue; // a creature's own marks are not the crowd that formed it
        const dx = items[i].x - pin.x;
        const dy = items[i].y - pin.y;
        if (dx * dx + dy * dy <= r2) n++; // NaN compares false: a broken mark is not a neighbour
      }
    }
    return Math.min(1, n / DISH_SATURATE);
  });
}

/**
 * The dish's pressure: the MOST crowded pin's.
 * @returns 0..1
 */
export function dishPressure(pins, entries, canvasW, canvasH) {
  if (!Array.isArray(pins) || pins.length === 0 || !Array.isArray(entries)) return 0;
  const each = pinPressures(pins, entries, canvasW, canvasH);
  return each.length ? Math.max(...each) : 0;
}

let latest = 0;
let pinCount = 0;

/** The resolver frame tap (gl/resolveTap.mjs): keep the latest reading for the stress tracker. */
export function observeDish(input, output) {
  pinCount = input && Array.isArray(input.dishPins) ? input.dishPins.length : 0;
  latest = dishPressure(input && input.dishPins, output, input && input.canvasW, input && input.canvasH);
}

/** The latest dish pressure, 0..1. 0 until a frame with pins has been resolved. */
export function getDishPressure() {
  return latest;
}

/** #1356 step 4 — the room's reading: the dish's pressure, or null while there are no pins (an empty dish has no opinion). */
export function getDishReading() {
  return pinCount > 0 ? latest : null;
}
