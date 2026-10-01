// #781 Build C — cell kinemes. Parts stay static assets; only the UV window moves.
export const CELL_KINEMES = Object.freeze([
  { id: 'dial-sweep', cells: 8, period: 4, costCells: 8 },
  { id: 'wave-scroll', cells: 6, period: 2.4, costCells: 6 },
  { id: 'chevron-chase', cells: 4, period: 1.6, costCells: 4 },
].map(Object.freeze));

const BY_ID = new Map(CELL_KINEMES.map((k) => [k.id, k]));
export function getCellKineme(id) { return BY_ID.get(id); }

/** Shed / freeze pins cell 0. */
export function cellIndexAt(motionTime, { period = 1, cells = 4, shed = false } = {}) {
  const n = Math.max(1, Math.floor(cells));
  if (shed) return 0;
  const p = period > 0 ? period : 1;
  const t = Number(motionTime) || 0;
  return Math.floor(((t % p) + p) % p / p * n) % n;
}

/** Horizontal strip: cell i of n inside a baked UV rect. Asset id never changes. */
export function cellUvWindow(cell, index, count) {
  const n = Math.max(1, Math.floor(count));
  const i = Math.max(0, Math.min(n - 1, Math.floor(index)));
  const w = (cell.u1 - cell.u0) / n;
  return { u0: cell.u0 + w * i, v0: cell.v0, u1: cell.u0 + w * (i + 1), v1: cell.v1 };
}
