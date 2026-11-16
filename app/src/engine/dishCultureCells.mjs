// dishCultureCells.mjs — K2 slice 2b (#2187): the GPU culture's grid as a RECORDED INPUT. Pure.
//
// With the births decided in the shader (Matt, 2026-11-16) a GPU culture is a Tier S sim outcome (K0): its generation g is the
// recording device's. So the grid enters the resolver as a recorded, sparse input — only the non-dead cells, one byte of state
// each (0 dead, 1 alive, 2..255 decaying) — and the resolver reads THAT, live and on replay alike. Live == replay bit for bit,
// on any device, with no GPU needed to replay (the K1 dishFluidCells pattern; the JS culture stays the reference, R4).
import { STAGE_COLS, STAGE_ROWS } from './dishLifeStage.mjs';

const N = STAGE_COLS * STAGE_ROWS;

/** Pack a dense state grid (Uint8, cols*rows) into { gen, idx: Uint16Array, v: Uint8Array } — the non-dead cells. */
export function packCultureCells(grid, gen = 0, n = N) {
  const keep = [];
  if (grid && grid.length === n && n <= 65536) {
    for (let i = 0; i < n; i++) if (grid[i] > 0) keep.push(i, grid[i] & 255);
  }
  const idx = new Uint16Array(keep.length / 2);
  const v = new Uint8Array(keep.length / 2);
  for (let k = 0; k < idx.length; k++) {
    idx[k] = keep[k * 2];
    v[k] = keep[k * 2 + 1];
  }
  return { gen: Math.max(0, Math.floor(Number(gen) || 0)), idx, v };
}

/** Is this a well-formed cells object? (Fail-closed: a recorded input must never throw the resolver.) */
export function isCultureCells(c) {
  return (
    !!c &&
    typeof c === 'object' &&
    Number.isFinite(Number(c.gen)) &&
    ArrayBuffer.isView(c.idx) &&
    ArrayBuffer.isView(c.v) &&
    c.idx.length === c.v.length
  );
}

/** Unpack to the dense grid: zeros except the recorded cells. Out-of-range indices are skipped. */
export function unpackCultureCells(c, out = new Uint8Array(N)) {
  out.fill(0);
  if (!isCultureCells(c)) return out;
  for (let k = 0; k < c.idx.length; k++) {
    const i = c.idx[k];
    if (i < out.length) out[i] = c.v[k];
  }
  return out;
}
