// dishFluidDrift.mjs — the one force seam, slice 1 (docs/design/one-force-seam.md): the ferrofluid moves the stage's
// own marks. Pure.
//
// Matt's ruling (2026-11-16): assets, type, creatures, beasts, DISH LIFE and the ferrofluid are one system — fields are
// never drawn, only the stage's assets move. Bones already lean toward the magnets (engine/dishFluidPull.mjs, #2190);
// this is the same law for a plain mark: a mark standing in field at or above the matter floor LEANS toward the nearest
// magnet, by up to DRIFT_MAX_PX (about a mark's width), and springs back when the field leaves. Lean, not travel: the
// read is stateless, so a mark never leaves its place in the layout and the dealt scene returns exactly at dial 0.
//
// The law, per mark: no magnets, PULL at 0, the mark off the dish, or the cell under it below the floor → no lean. Else
// the lean points at the nearest magnet (the kernel's aspect-corrected metric, bonePullDelta's), its length is
// DRIFT_MAX_PX × PULL × the density's rise above the floor (0 at the floor, so a mark never snaps on), and it never
// overshoots the magnet.
//
// Order (the seam's fixed order): this runs AFTER the culture's LIFE fade — the culture decides presence, the fluid
// moves what is left. It writes x/y, so like every position pass it returns an undo that restores the exact cached
// values (the geometry cache must stay clean).

import { FLUID_GRID_COLS, FLUID_GRID_ROWS } from './dishFluid.mjs';
import { MATTER_DENSITY_FLOOR } from './dishFluidRender.mjs';

/** The density a mark's cell must reach before the field can lean it (the matter floor, the bone pull's floor). */
export const DRIFT_DENSITY_FLOOR = MATTER_DENSITY_FLOOR;
/** The farthest a mark leans toward a magnet, at saturated field and full PULL, in stage px (about a mark's width). */
export const DRIFT_MAX_PX = 32;

/**
 * The lean on one mark at stage (x, y). `field`: { density (dish grid), magnets (sanitized, dish-normalized), pull
 * (0..1), aspectHW, W, H }. Returns { dx, dy } in stage px, or null (no lean — the mark stands exactly as dealt).
 */
export function markDriftDelta(field, x, y) {
  if (!field || !field.density || field.density.length !== FLUID_GRID_COLS * FLUID_GRID_ROWS) return null;
  const magnets = Array.isArray(field.magnets) ? field.magnets : [];
  const pull = Number(field.pull);
  if (!magnets.length || !(pull > 0)) return null;
  const W = Number(field.W) || 0;
  const H = Number(field.H) || 0;
  if (!(W > 0) || !(H > 0)) return null;
  const nx = x / W;
  const ny = y / H;
  if (!(nx >= 0) || !(nx < 1) || !(ny >= 0) || !(ny < 1)) return null;
  const cx = Math.min(FLUID_GRID_COLS - 1, Math.floor(nx * FLUID_GRID_COLS));
  const cy = Math.min(FLUID_GRID_ROWS - 1, Math.floor(ny * FLUID_GRID_ROWS));
  const d = field.density[cy * FLUID_GRID_COLS + cx];
  if (!(d > DRIFT_DENSITY_FLOOR)) return null;
  const aspectHW =
    Number.isFinite(Number(field.aspectHW)) && Number(field.aspectHW) > 0 ? Number(field.aspectHW) : H / W;
  let best = null;
  let bd = Infinity;
  for (const m of magnets) {
    const ddx = nx - m.x;
    const ddy = (ny - m.y) * aspectHW;
    const dd = ddx * ddx + ddy * ddy;
    if (dd < bd) {
      bd = dd;
      best = m;
    }
  }
  if (!best) return null;
  const vx = best.x * W - x;
  const vy = best.y * H - y;
  const dist = Math.hypot(vx, vy);
  if (!(dist > 1e-6)) return null;
  const rise = Math.min(1, (d - DRIFT_DENSITY_FLOOR) / (1 - DRIFT_DENSITY_FLOOR));
  const len = Math.min(dist, DRIFT_MAX_PX * Math.min(1, pull) * rise);
  if (!(len > 0)) return null;
  return { dx: (vx / dist) * len, dy: (vy / dist) * len };
}

/**
 * Lean the placed marks toward the magnets. Pinned marks (`still[k] === 1`) stand still. Returns an undo that restores
 * the SoA's exact x/y, or null when nothing moved (the SoA is untouched).
 */
export function applyFluidDrift(soa, field, still = null) {
  if (!soa || !field) return null;
  const n = soa.n | 0;
  const idx = [];
  const ox = [];
  const oy = [];
  for (let k = 0; k < n; k++) {
    if (still && still[k] === 1) continue;
    const x = soa.x[k];
    const y = soa.y[k];
    const lean = markDriftDelta(field, x, y);
    if (!lean) continue;
    idx.push(k);
    ox.push(x);
    oy.push(y);
    soa.x[k] = x + lean.dx;
    soa.y[k] = y + lean.dy;
  }
  if (!idx.length) return null;
  return () => {
    for (let j = 0; j < idx.length; j++) {
      soa.x[idx[j]] = ox[j];
      soa.y[idx[j]] = oy[j];
    }
  };
}
