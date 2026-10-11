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
 * @param pins     [{x, y}] scene coordinates (curator/dishPins.js)
 * @param entries  the resolver's output: layers with `items` [{x, y}] (pattern and FX layers have none)
 * @returns 0..1
 */
export function dishPressure(pins, entries, canvasW, canvasH) {
  if (!Array.isArray(pins) || pins.length === 0 || !Array.isArray(entries)) return 0;
  const r = DISH_RADIUS * Math.min(canvasW, canvasH);
  if (!(r > 0)) return 0;
  const r2 = r * r;
  let most = 0;
  for (const pin of pins) {
    if (!pin || !Number.isFinite(pin.x) || !Number.isFinite(pin.y)) continue;
    let n = 0;
    for (const e of entries) {
      const items = e && e.items;
      if (!Array.isArray(items)) continue;
      for (let i = 0; i < items.length; i++) {
        const dx = items[i].x - pin.x;
        const dy = items[i].y - pin.y;
        if (dx * dx + dy * dy <= r2) n++; // NaN compares false: a broken mark is not a neighbour
      }
    }
    if (n > most) most = n;
  }
  return Math.min(1, most / DISH_SATURATE);
}

let latest = 0;

/** The resolver frame tap (gl/resolveTap.mjs): keep the latest reading for the stress tracker. */
export function observeDish(input, output) {
  latest = dishPressure(input && input.dishPins, output, input && input.canvasW, input && input.canvasH);
}

/** The latest dish pressure, 0..1. 0 until a frame with pins has been resolved. */
export function getDishPressure() {
  return latest;
}
