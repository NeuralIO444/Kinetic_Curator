// #781 Build C — cell kinemes. Parts stay static assets; only the UV window moves.
export const CELL_KINEMES = Object.freeze([
  { id: 'dial-sweep', cells: 8, period: 4, costCells: 8 },
  { id: 'wave-scroll', cells: 6, period: 2.4, costCells: 6 },
  { id: 'chevron-chase', cells: 4, period: 1.6, costCells: 4 },
  { id: 'spec-chase', cells: 8, period: 2, costCells: 8 }, // #705 — 3-bar accent window slides and wraps
].map(Object.freeze));

const BY_ID = new Map(CELL_KINEMES.map((k) => [k.id, k]));
export function getCellKineme(id) { return BY_ID.get(id); }

/**
 * #705 — which assets animate *inside* the mark via a baked UV strip.
 * The asset id never changes; only the UV window moves. Cell 0 is always the
 * canonical frame (pixel-identical to today's single-cell bake) — shed and
 * freeze park here. This is the AUTHORed track: frame-exact, deterministic.
 * (Region mattes #725 are the GENERAL track: auto-detected regions on
 * arbitrary assets. Complementary, not competing — the dial needle is the
 * bridge case and strips own it for v1.)
 */
export const ASSET_CELL_KINEME = Object.freeze({
  mic_dial: 'dial-sweep',
  mic_chevrons: 'chevron-chase',
  mic_specbar_h: 'spec-chase',
  mic_specbar_v: 'spec-chase',
  mic_wave: 'wave-scroll',
});

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
