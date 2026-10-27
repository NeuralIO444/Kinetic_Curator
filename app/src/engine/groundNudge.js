// groundNudge.js — #1183 tile-edge nudge: marks ease off the edges of the PATTERN tile beneath them.
//
// "One Petri Dish": the ground is something the marks rest ON, so its edges are felt. A mark that lands close to a
// tile edge is eased inward, so the marks gather inside their tiles and the pattern's grid reads through the layout.
//
// The shape, per axis (u = position across the tile, 0..1; d = distance to the nearer edge, 0..0.5):
//   d >= EDGE_BAND            untouched
//   d <  EDGE_BAND            d' = d + amount * 0.5 * (EDGE_BAND - d)^2 / EDGE_BAND
// Properties the selfcheck pins:
//   - amount 0 is a hard gate: nothing runs, the frame is byte-identical
//   - smooth at the band edge (zero offset and zero slope there): no visible seam
//   - monotonic for every amount in [0, 1] (slope >= 1 - amount): two marks never swap order across the edge
//   - bounded: the largest move is amount * EDGE_BAND / 2 of the tile (1/8 of a tile at full)
//   - never crosses an edge: d' < EDGE_BAND <= 0.5, so a mark stays in its tile and its leaned colour is unchanged
//
// Per frame, never accumulating (the kineme rule): the applier writes the presented x/y into the SoA and returns an
// undo that puts the placed values back, so a drifting pattern moves the nudge with it and nothing compounds.
// Pure: no clock, no randomness, no store.

/** The edge band, as a fraction of the tile: marks closer than this to an edge feel it. */
export const EDGE_BAND = 0.25;

/** The offset (in tile units, signed, pointing inward) for one axis position u in [0, 1). */
export function nudgeAxis(u, amount) {
  if (!(amount > 0) || !Number.isFinite(u)) return 0;
  const a = Math.min(1, amount);
  const lowSide = u < 0.5;
  const d = lowSide ? u : 1 - u;
  if (!(d < EDGE_BAND) || d < 0) return 0;
  const push = (a * 0.5 * (EDGE_BAND - d) * (EDGE_BAND - d)) / EDGE_BAND;
  return lowSide ? push : -push;
}

/**
 * Nudge the placed marks off the tile edges. `cellAt(x, y)` returns `{ u, v, size }` for the tile under a scene
 * point (pattern/ground.js `cell`). Marks pinned still (`stillMarks[k] === 1`) are left exactly where they are.
 * Returns an undo that restores the SoA's x/y, or null when nothing ran.
 */
export function applyGroundNudge(soa, cellAt, amount, stillMarks = null) {
  if (!soa || typeof cellAt !== 'function' || !(amount > 0)) return null;
  const n = soa.n | 0;
  const idx = [];
  const ox = [];
  const oy = [];
  for (let k = 0; k < n; k++) {
    if (stillMarks && stillMarks[k] === 1) continue;
    const x = soa.x[k];
    const y = soa.y[k];
    const c = cellAt(x, y);
    if (!c || !(c.size > 0)) continue;
    const dx = nudgeAxis(c.u, amount) * c.size;
    const dy = nudgeAxis(c.v, amount) * c.size;
    if (dx === 0 && dy === 0) continue;
    idx.push(k);
    ox.push(x);
    oy.push(y);
    soa.x[k] = x + dx;
    soa.y[k] = y + dy;
  }
  if (!idx.length) return null;
  return () => {
    for (let j = 0; j < idx.length; j++) {
      soa.x[idx[j]] = ox[j];
      soa.y[idx[j]] = oy[j];
    }
  };
}
