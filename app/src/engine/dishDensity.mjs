// dishDensity.mjs — petri dish B3 (#1412): the contact-density field.
// Spec: docs/research/petri-dish-physics-scope-2026-10-12.md §4; issue
// #1412 ("Density field computed from the shared grid each tick;
// published on the bus; telemetry may sample it").
//
// The A1 shared grid (engine/dishContacts.mjs) already counts every
// enrolled body into a cell each tick — its counting sort IS a density
// measurement. This module is the field law around that count:
//
//   FIELD — { cellSize, originX, originY, cols, rows, counts, total,
//   max, tick }: counts[c] is the bodies in cell c at the tick the
//   pass ran, in the grid's own geometry (cell = 2 × the largest disc
//   radius, origin at the grid's minimum cell corner — the same
//   construction as ParticleSystem._buildSpatialHash). Measurements
//   only: the field is computed from the pass's snapshot and never
//   read back by any physics — it cannot move a body.
//
//   PUBLICATION — the pass stamps the field onto its session (with a
//   monotonically increasing tick); the resolver publishes the frame's
//   field here (publishDishDensity) after the layer loop; the shell
//   bridges it to the typed bus (curator/dishDensityLive.js →
//   Events.DISH_DENSITY), where #1355-class formation checks and
//   telemetry read it with no engine change. A frame whose pass never
//   ran (dish off, a single stratum, slow render) publishes the EMPTY
//   field — never a stale one.
//
//   DETERMINISM — the field is a pure function of the pass, so the
//   live loop and the bake driver (which owns its own session) compute
//   identical fields for identical steps. The bake never publishes to
//   the holder here; its field stays on its session.
//
//   TUNABLE — DISH_DENSITY_SATURATE (bodies per cell that read as
//   full density) is an open tunable in the dishPressure.js sense:
//   telemetry informs it; it is named here, not buried in a reader.

/** Bodies in one cell that read as full density (share 1). */
export const DISH_DENSITY_SATURATE = 8;

/** The empty field: no grid this frame — no bodies, no cells. */
export const EMPTY_DISH_DENSITY = Object.freeze({
  cellSize: 0, originX: 0, originY: 0, cols: 0, rows: 0,
  counts: new Int32Array(0), total: 0, max: 0, tick: 0,
});

/**
 * Build the field from a counting sort's cell starts: counts are the
 * per-cell differences. `cellStart` has cols*rows+1 entries. The
 * counts array is freshly allocated per call — a listener may hold
 * the field past the tick without the next pass mutating it.
 */
export function buildDishDensity({ cellStart, cols, rows, cellSize, minCx, minCy }) {
  const counts = new Int32Array(Math.max(0, cols * rows));
  let total = 0;
  let max = 0;
  for (let c = 0; c < counts.length; c++) {
    const n = cellStart[c + 1] - cellStart[c];
    counts[c] = n;
    total += n;
    if (n > max) max = n;
  }
  return {
    cellSize, originX: minCx * cellSize, originY: minCy * cellSize,
    cols, rows, counts, total, max, tick: 0,
  };
}

/** Bodies in the field's cell at world (x, y); 0 outside the grid. */
export function sampleDishDensity(field, x, y) {
  if (!field || !(field.cellSize > 0)) return 0;
  const cx = Math.floor((x - field.originX) / field.cellSize);
  const cy = Math.floor((y - field.originY) / field.cellSize);
  if (cx < 0 || cy < 0 || cx >= field.cols || cy >= field.rows) return 0;
  return field.counts[cy * field.cols + cx];
}

/** The density at (x, y) as a share of saturation, 0..1. */
export function dishDensityShare(field, x, y) {
  const n = sampleDishDensity(field, x, y);
  return n >= DISH_DENSITY_SATURATE ? 1 : n / DISH_DENSITY_SATURATE;
}

let latest = EMPTY_DISH_DENSITY;

/** The resolver's per-frame publication (gl/liveResolve.mjs). */
export function publishDishDensity(field) {
  latest = field || EMPTY_DISH_DENSITY;
}

/** The latest published field. The empty field until a dish frame resolves. */
export function getDishDensity() {
  return latest;
}
