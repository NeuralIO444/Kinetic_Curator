// curator/dishDensityLive.js — #1412 (petri dish B3): the contact-
// density field, bridged to the bus.
//
// The engine computes the field from the shared grid each tick
// (engine/dishDensity.mjs) and the resolver publishes it per frame;
// this module is the shell-side seam that puts it on the typed bus
// (composition/eventBus.js), so a formation check (#1355's class of
// reader), telemetry, or any future consumer can read the density
// field from the bus with no engine change — the #1412 acceptance
// shape. A pull getter rides along, the dishPressure.js precedent.
//
// The emitted field is the tick's own object: its counts array is
// that tick's measurement (treat as read-only; copy it to keep it).
// Emitted when the published field changes identity — every frame
// the dish pass runs, and once when it falls back to empty.
import { emit, Events } from '../composition/eventBus.js';
import { getDishDensity } from '../engine/dishDensity.mjs';

let lastEmitted = null;

/** The resolver frame tap (App.jsx): emit the latest field on change. */
export function observeDishDensity() {
  const field = getDishDensity();
  if (field !== lastEmitted) {
    lastEmitted = field;
    emit(Events.DISH_DENSITY, { field });
  }
  return field;
}

/** The latest published field (the empty field until a dish frame resolves). */
export function getDishDensityField() {
  return getDishDensity();
}
