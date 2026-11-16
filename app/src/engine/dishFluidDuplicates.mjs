// dishFluidDuplicates.mjs — the one force seam, slice 1b (docs/design/one-force-seam.md): the ferrofluid's dense look,
// made of the stage's own marks. Pure.
//
// Matt's rulings (2026-11-16): one system replaces the separate body for the ferrofluid; its density comes from
// DUPLICATES OF REAL MARKS — where the field is densest near a magnet, copies of the nearest dealt mark bunch up, at most
// DUP_CAP of them. A copy is smaller than its original and fades in with the field (never pops); culture first, so a
// copy over dead culture fades like any mark; the fluid's own lean (dishFluidDrift) then moves it like any mark.
//
// The law, per frame (a pure function of the fluid plan, the frame's marks, and the culture read — no memory):
//   candidates  dish cells whose density is above the matter floor, not bedrock, and near a magnet (the kernel's own
//               magnet falloff ≥ DUP_NEAR); scored density × falloff, strongest first, ties by cell index; the top
//               DUP_CAP are seated
//   copy        the nearest dealt mark (any field it carries rides along, so it is drawn exactly as that mark), at the
//               cell centre, scale × (DUP_SCALE_MIN … 1) and alpha × (0 … 1) by the density's rise above the floor
//   culture     with the LIFE dial up, the copy takes the same fade and shrink a mark there would (dropped when gone)
//   lean        then the same lean toward the nearest magnet a mark there would take
// No dealt marks → no copies (never a shape of the fluid's own).

import { FLUID_GRID_COLS, FLUID_GRID_ROWS, magnetFieldAt } from './dishFluid.mjs';
import { MATTER_DENSITY_FLOOR } from './dishFluidRender.mjs';
import { markDriftDelta } from './dishFluidDrift.mjs';
import { cultureLifeFactor, LIFE_SHRINK } from './dishLifeCouple.mjs';

/** The most copies the fluid seats at once (Matt, 2026-11-16 — LIFE's born-mark cap). */
export const DUP_CAP = 64;
/** A cell must sit at least this deep in a magnet's falloff (magnetFieldAt) to seat a copy: near magnets only. */
export const DUP_NEAR = 0.25;
/** A barely-seated copy's scale relative to its original (a saturated copy is full size). */
export const DUP_SCALE_MIN = 0.4;
/** Every copy's key starts with this — the copies are recognisable and never copied themselves. */
export const DUP_KEY = 'fluid-dup:';

export const isFluidDuplicate = (it) => !!it && typeof it.key === 'string' && it.key.startsWith(DUP_KEY);

const alpha01 = (a) => {
  const v = Number.isFinite(Number(a)) ? Number(a) : 1;
  return Math.max(0, Math.min(1, v > 1 ? v / 100 : v));
};

/**
 * The copies for one frame. `plan`: the fluid plan ({ active, density, magnets, dial: { pull }, aspectHW, blocked }).
 * `marks`: the frame's dealt mark items (copies and terrain already excluded by the caller). `opts`: { W, H, culture }
 * where culture is null or { life, sampler } (the resolver's LIFE read). Returns placement items (alpha 0..100).
 */
export function fluidDuplicateItems(plan, marks, { W, H, culture = null } = {}) {
  if (!plan || !plan.active || !plan.density || plan.density.length !== FLUID_GRID_COLS * FLUID_GRID_ROWS) return [];
  const w = Number(W) || 0;
  const h = Number(H) || 0;
  if (!(w > 0) || !(h > 0)) return [];
  const magnets = Array.isArray(plan.magnets) ? plan.magnets : [];
  const pull = Math.min(1, Math.max(0, Number(plan.dial && plan.dial.pull) || 0));
  if (!magnets.length || !(pull > 0)) return [];
  const valid = Array.isArray(marks)
    ? marks.filter((m) => m && Number.isFinite(m.x) && Number.isFinite(m.y) && !isFluidDuplicate(m))
    : [];
  if (!valid.length) return [];
  const aspectHW = Number.isFinite(Number(plan.aspectHW)) && Number(plan.aspectHW) > 0 ? Number(plan.aspectHW) : h / w;
  const blocked = plan.blocked && plan.blocked.length === FLUID_GRID_COLS * FLUID_GRID_ROWS ? plan.blocked : null;

  const cands = [];
  for (let i = 0; i < plan.density.length; i++) {
    const d = plan.density[i];
    if (!(d > MATTER_DENSITY_FLOOR)) continue;
    if (blocked && blocked[i]) continue;
    const cx = i % FLUID_GRID_COLS;
    const cy = (i - cx) / FLUID_GRID_COLS;
    const mf = magnetFieldAt(magnets, (cx + 0.5) / FLUID_GRID_COLS, (cy + 0.5) / FLUID_GRID_ROWS, aspectHW);
    if (!(mf >= DUP_NEAR)) continue;
    cands.push({ i, cx, cy, d, score: d * mf });
  }
  if (!cands.length) return [];
  cands.sort((a, b) => b.score - a.score || a.i - b.i);
  const chosen = cands.slice(0, DUP_CAP);

  const drift = { density: plan.density, magnets, pull, aspectHW, W: w, H: h };
  const out = [];
  const read = { level: 0, activity: 0 };
  for (const c of chosen) {
    let x = ((c.cx + 0.5) / FLUID_GRID_COLS) * w;
    let y = ((c.cy + 0.5) / FLUID_GRID_ROWS) * h;
    let best = null;
    let bd = Infinity;
    for (const m of valid) {
      const dx = m.x - x;
      const dy = m.y - y;
      const dd = dx * dx + dy * dy;
      if (dd < bd) {
        bd = dd;
        best = m;
      }
    }
    const rise = Math.min(1, (c.d - MATTER_DENSITY_FLOOR) / (1 - MATTER_DENSITY_FLOOR));
    const base = Number.isFinite(Number(best.scale)) ? Number(best.scale) : 1;
    const baseY = Number.isFinite(Number(best.scaleY)) ? Number(best.scaleY) : base;
    let grow = DUP_SCALE_MIN + (1 - DUP_SCALE_MIN) * rise;
    let alpha = alpha01(best.alpha) * rise;
    // culture first: the copy fades and shrinks where a mark would (order 1 of the seam)
    if (culture && culture.life > 0 && culture.sampler && typeof culture.sampler.sample === 'function') {
      if (culture.sampler.sample(x, y, read)) {
        const f = cultureLifeFactor(read.level, culture.life);
        alpha *= f;
        grow *= 1 - LIFE_SHRINK * (1 - f);
      }
    }
    if (!(alpha > 0)) continue;
    // then the fluid's own lean (order 2), as a mark standing there would take it
    const lean = markDriftDelta(drift, x, y);
    if (lean) {
      x += lean.dx;
      y += lean.dy;
    }
    out.push({
      ...best,
      x,
      y,
      scale: base * grow,
      scaleY: baseY * grow,
      alpha: alpha * 100,
      index: c.i,
      key: `${DUP_KEY}${c.i}`,
    });
  }
  return out;
}
