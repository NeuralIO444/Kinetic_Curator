// dishFluidRender.mjs — FERROFLUID (#1997): the fluid as marks. Pure.
//
// The ferrofluid system is INVISIBLE (Matt's ruling, 2026-11-08): like FLOW's curl field or the
// culture field, it is an underneath system and is never itself drawn — there is no fluid
// texture and no floor pass. What appears on stage as the ferrofluid is a BODY OF ASSETS
// attached to the field: ordinary placement items (the same { x, y, scale, rotation, alpha,
// assetId, color, key, … } shape buildPlacements emits), seated where the coupling instance's
// published density runs high and weighted toward the placed magnets by the PULL dial, so the
// body pools in the veins, fills the dense regions and gathers at the magnets — the spikes.
// The resolver stamps them exactly as it stamps any other mark (they ride the top content
// layer, added after the culture's draw, never taking a mark's place), so every Look, palette,
// effect, take, ACCUM pass and the review loop sees normal content — and a still or capture
// shows the body like any other content, because it IS content.
//
//   THE STAGE'S OWN SHAPES — each seated cell wears the NEAREST dealt mark (asset, colour,
//   tier, every field it carries), the cultureItems discipline: the body reads as the
//   performer's own shapes gathered by the field, any asset shape at all. On a stage with no
//   dealt marks to wear, the body falls back to the pool's primitive shapes (dots, a ring, a
//   pit — the Marks chapter's seed vocabulary), dealt per cell from the seeded stream and
//   coloured with the palette's ink.
//
//   BOUNDED + GOVERNED — at most MAX_FLUID_ITEMS items at full matter, strongest first
//   (score, then cell index), so the cut is deterministic; the governor's ladder spends the
//   body's seating resolution, then its count (the plan carries the rung's seat + matter).
//
//   PURE — no clock, no random, no module state. Same (plan, marks) = same items. The plan's
//   density is the stage's published array: read it the frame you get it, never retain it.

import { hashU01 } from './kernel/rng.js';
import { magnetFieldAt, FLUID_CHANNEL, FLUID_GRID_COLS, FLUID_GRID_ROWS } from './dishFluid.mjs';
import { MARK_FRAC } from './dishLifeSeed.mjs';

/** A seat cell must average at least this much dark phase before matter attaches to it. */
export const MATTER_DENSITY_FLOOR = 0.25;
/** Most attached items emitted per frame at full matter (the body's budget; strongest first). */
export const MAX_FLUID_ITEMS = 480;
/** A seated item's stamp radius, in seat cells (the culture's CELL_RADIUS class). */
export const MATTER_CELL_RADIUS = 0.6;
/** Scale of a barely-seated item (at the density floor) relative to a saturated one. */
export const MATTER_SCALE_MIN = 0.45;
/**
 * The fallback shape vocabulary when the stage holds no dealt marks to wear: the pool's
 * primitive dots / ring / pit from the Marks chapter. Any pool asset id is safe here — the
 * loop bakes atlas cells for the combos the contract actually uses, on demand.
 */
export const FLUID_PRIMITIVE_ASSETS = Object.freeze(['mrk_dots_01', 'mrk_ring_01', 'mrk_pit_01']);

/** A ferrofluid matter item this module (or a previous frame) attached: key `fluid:<cell>`. */
export const isFluidMatter = (it) => !!it && typeof it.key === 'string' && it.key.startsWith('fluid:');

const alpha01 = (a) => {
  const v = Number.isFinite(Number(a)) ? Number(a) : 1;
  return Math.max(0, Math.min(1, v > 1 ? v / 100 : v));
};

/**
 * The published dish-grid density box-averaged down to a seating grid (seatCols × seatRows):
 * identity — a copy — when the seat grid IS the dish grid. A fresh Float32Array each call.
 */
export function seatDensity(density, seatCols, seatRows) {
  const sc = Math.max(1, seatCols | 0);
  const sr = Math.max(1, seatRows | 0);
  const out = new Float32Array(sc * sr);
  if (!density || density.length !== FLUID_GRID_COLS * FLUID_GRID_ROWS) return out;
  if (sc === FLUID_GRID_COLS && sr === FLUID_GRID_ROWS) return Float32Array.from(density);
  for (let gy = 0; gy < sr; gy++) {
    const y0 = Math.floor((gy / sr) * FLUID_GRID_ROWS);
    const y1 = Math.max(y0 + 1, Math.floor(((gy + 1) / sr) * FLUID_GRID_ROWS));
    for (let gx = 0; gx < sc; gx++) {
      const x0 = Math.floor((gx / sc) * FLUID_GRID_COLS);
      const x1 = Math.max(x0 + 1, Math.floor(((gx + 1) / sc) * FLUID_GRID_COLS));
      let t = 0;
      let c = 0;
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          t += density[y * FLUID_GRID_COLS + x];
          c++;
        }
      out[gy * sc + gx] = c ? t / c : 0;
    }
  }
  return out;
}

/**
 * The attached body for one frame.
 *   plan — the fluid stage's attachment plan: { active, seedKey, density (dish grid), magnets,
 *          dial: { pull, … }, seatCols, seatRows, matterFrac, aspectHW }
 *   marks — the stage's dealt marks (the shapes the body wears; empty = the primitive fallback)
 *   opts — { canvasW, canvasH, blocked (dish-grid Uint8Array of bedrock cells, or null),
 *            paletteInk (hex for the fallback shapes) }
 * Seats exist only where the field runs dense (≥ MATTER_DENSITY_FLOOR after seat averaging),
 * never on a blocked (bedrock) cell, never outside the dish. Scores weight density by the
 * magnet field × PULL, so raising PULL gathers the body at the magnets — but PULL cannot
 * create matter where the field is thin: no density, no seat, at any dial.
 */
export function fluidMatterItems(plan, marks, { canvasW, canvasH, blocked = null, paletteInk = null } = {}) {
  if (!plan || !plan.active || !plan.density || plan.density.length !== FLUID_GRID_COLS * FLUID_GRID_ROWS) return [];
  const W = Number(canvasW) || 0;
  const H = Number(canvasH) || 0;
  if (!(W > 0) || !(H > 0)) return [];
  const seatCols = Math.min(FLUID_GRID_COLS, Math.max(1, plan.seatCols | 0 || FLUID_GRID_COLS));
  const seatRows = Math.min(FLUID_GRID_ROWS, Math.max(1, plan.seatRows | 0 || FLUID_GRID_ROWS));
  const matterFrac = Math.min(1, Math.max(0, Number(plan.matterFrac ?? 1)));
  if (!(matterFrac > 0)) return [];
  const pull = Math.min(1, Math.max(0, Number(plan.dial?.pull ?? 0.7)));
  const magnets = Array.isArray(plan.magnets) ? plan.magnets : [];
  const aspectHW = Number.isFinite(Number(plan.aspectHW)) && Number(plan.aspectHW) > 0 ? Number(plan.aspectHW) : H / W;
  const seat = seatDensity(plan.density, seatCols, seatRows);
  const cw = W / seatCols;
  const ch = H / seatRows;
  // candidate seats: dense enough, and not bedrock (sampled at the seat cell's dish cell)
  const cands = [];
  for (let i = 0; i < seat.length; i++) {
    const d = seat[i];
    if (!(d >= MATTER_DENSITY_FLOOR)) continue;
    const sx = i % seatCols;
    const sy = (i - sx) / seatCols;
    if (blocked && blocked.length === FLUID_GRID_COLS * FLUID_GRID_ROWS) {
      const bx = Math.min(FLUID_GRID_COLS - 1, Math.floor(((sx + 0.5) / seatCols) * FLUID_GRID_COLS));
      const by = Math.min(FLUID_GRID_ROWS - 1, Math.floor(((sy + 0.5) / seatRows) * FLUID_GRID_ROWS));
      if (blocked[by * FLUID_GRID_COLS + bx]) continue;
    }
    const nx = (sx + 0.5) / seatCols;
    const ny = (sy + 0.5) / seatRows;
    const mf = magnets.length && pull > 0 ? magnetFieldAt(magnets, nx, ny, aspectHW) : 0;
    cands.push({ i, sx, sy, d, score: d * (1 + pull * mf) });
  }
  if (!cands.length) return [];
  // strongest first, ties by cell index — the cut is deterministic and keeps the body's cores
  cands.sort((a, b) => b.score - a.score || a.i - b.i);
  const cap = Math.min(cands.length, Math.floor(MAX_FLUID_ITEMS * matterFrac));
  if (!(cap > 0)) return [];
  const chosen = cands.slice(0, cap);
  const short = Math.min(W, H);
  const liveScale = (MATTER_CELL_RADIUS * Math.min(cw, ch)) / (MARK_FRAC * short);
  const validMarks = Array.isArray(marks) ? marks.filter((m) => m && Number.isFinite(m.x) && Number.isFinite(m.y)) : [];
  const wear = validMarks.length > 0;
  const seedKey = plan.seedKey >>> 0;
  const out = new Array(chosen.length);
  for (let k = 0; k < chosen.length; k++) {
    const c = chosen[k];
    const x = (c.sx + 0.5) * cw;
    const y = (c.sy + 0.5) * ch;
    const scale = liveScale * (MATTER_SCALE_MIN + (1 - MATTER_SCALE_MIN) * c.d);
    if (wear) {
      // the nearest dealt mark: the cell IS that mark's kind — every field it carries rides
      // along, so the stamp/Look path draws it exactly as it draws that mark
      let best = null;
      let bd = Infinity;
      for (const m of validMarks) {
        const dx = m.x - x;
        const dy = m.y - y;
        const dd = dx * dx + dy * dy;
        if (dd < bd) {
          bd = dd;
          best = m;
        }
      }
      out[k] = {
        ...best,
        x,
        y,
        scale,
        scaleY: scale,
        alpha: alpha01(best.alpha) * c.d * 100, // placement alpha is 0..100
        index: c.i,
        key: `fluid:${c.i}`,
      };
    } else {
      const pick =
        Math.floor(hashU01(seedKey, FLUID_CHANNEL, 300000 + c.i) * FLUID_PRIMITIVE_ASSETS.length) %
        FLUID_PRIMITIVE_ASSETS.length;
      out[k] = {
        assetId: FLUID_PRIMITIVE_ASSETS[pick],
        x,
        y,
        scale,
        scaleY: scale,
        rotation: hashU01(seedKey, FLUID_CHANNEL, 310000 + c.i) * 360,
        color: paletteInk || '#000000',
        accent: paletteInk || '#000000',
        alpha: c.d * 100,
        index: c.i,
        key: `fluid:${c.i}`,
      };
    }
  }
  return out;
}
