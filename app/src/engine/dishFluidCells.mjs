// dishFluidCells.mjs — K1 slice 4b (#2186, S2): the GPU fluid's field as a RECORDED INPUT. Pure.
//
// A GPU density is a continuous Tier S value (K0): it differs between devices at float noise, and two readers of it make
// DECISIONS the take must reproduce — the culture's births and the bone pull both gate on density > 0.25 (FLUID_BIRTH_FLOOR
// = MATTER_DENSITY_FLOOR). So the field enters the resolver as a quantized, sparse input — only the cells above that floor,
// 8 bits each — and the resolver reads the DEQUANTIZED field, live and on replay alike. The recorded input IS what was read:
// live == replay bit for bit, on any device, with no GPU needed to replay. (S2 refined: the bone cells are not known before the
// frame resolves, so the stamp is every cell the pull or a birth could read — the cells above the floor.)
import { FLUID_GRID_COLS, FLUID_GRID_ROWS } from './dishFluid.mjs';
import { MATTER_DENSITY_FLOOR } from './dishFluidRender.mjs';

const N = FLUID_GRID_COLS * FLUID_GRID_ROWS;
export const FLUID_CELLS_FLOOR = MATTER_DENSITY_FLOOR;

/** Pack a dense density (dish grid) into { step, idx: Uint16Array, q: Uint8Array } — the cells strictly above the floor. */
export function packFluidCells(density, step = 0) {
  const keep = [];
  if (density && density.length === N) {
    for (let i = 0; i < N; i++) {
      const v = density[i];
      // quantize FIRST, then gate on the quantized value: a cell that rounds to the floor or below reads as empty in
      // both the live and the replay field, so no reader can see a difference
      const q = Math.max(0, Math.min(255, Math.round(v * 255)));
      if (q / 255 > FLUID_CELLS_FLOOR) keep.push(i, q);
    }
  }
  const idx = new Uint16Array(keep.length / 2);
  const q = new Uint8Array(keep.length / 2);
  for (let k = 0; k < idx.length; k++) {
    idx[k] = keep[k * 2];
    q[k] = keep[k * 2 + 1];
  }
  return { step: Math.max(0, Math.floor(Number(step) || 0)), idx, q };
}

/** Is this a well-formed cells object? (Fail-closed: a recorded input must never throw the resolver.) */
export function isFluidCells(c) {
  return (
    !!c &&
    typeof c === 'object' &&
    Number.isFinite(Number(c.step)) &&
    ArrayBuffer.isView(c.idx) &&
    ArrayBuffer.isView(c.q) &&
    c.idx.length === c.q.length
  );
}

/** Unpack to the dense field the readers see: zeros except the recorded cells (q/255). Out-of-range indices are skipped. */
export function unpackFluidCells(c, out = new Float32Array(N)) {
  out.fill(0);
  if (!isFluidCells(c)) return out;
  for (let k = 0; k < c.idx.length; k++) {
    const i = c.idx[k];
    if (i < N) out[i] = c.q[k] / 255;
  }
  return out;
}

/** The field the resolver reads for a dense density: unpack(pack(d)). The host hands this, so live reads what replay reads. */
export const readableDensity = (density, step = 0) => unpackFluidCells(packFluidCells(density, step));
