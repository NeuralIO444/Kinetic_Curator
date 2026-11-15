// dishFluidChannel.mjs — FERROFLUID #2178 (Full WebGL program #2180, workstream 1): the GPU
// field-body channel's LAW. Pure: no GL, no DOM, no clock, no Math.random.
//
// The ferrofluid stays invisible (Matt's ruling, 2026-11-08): what appears on stage is a body
// of small whole assets attached to the field (Option B, ruled 2026-11-14 — the dense mockup:
// 36 catalogue assets, 8,358 pieces pooling at the magnet). Until this slice the body was
// ordinary contract items seated on the CPU (engine/dishFluidRender.mjs's fluidMatterItems —
// retired here): at 480 items that path already cost 0.84–1.85 ms a frame, and its items sat
// inside the resolver output every take's checkpoint chain hashes. The channel moves the
// body's PLACEMENT to the GPU, under the program's presentation ruling (#2180): the field
// stays the JS record (the kernel is untouched at 96×54 and remains hash-covered indirectly,
// through the culture output that reads it); where the pieces sit is presentation — stable on
// a device, not bit-exact across devices, and no longer inside the hashed resolver output.
// Matt's clean-break ruling (2026-11-15) covers the consequence: PERFORMANCE_VERSION 2 → 3,
// old fluid takes retire, no legacy replay path.
//
// THE SHAPE — the resolver publishes the field (engine/dishFluidStage.mjs's plan); this module
// turns the plan into a small contract descriptor (sanitizeFieldBody — vocabulary, ink, seed,
// floor, budget, scale law; the contract is not the hashed surface, so the descriptor costs
// the take story nothing) and the renderer seats the body in one instanced draw: the density
// texture (the plan's published array, quantized by packFieldDensity) uploads on step change,
// and the vertex shader derives every piece from gl_InstanceID — a 3×3 sub-lattice inside
// each dish cell, a density floor gate, a density-shaped fill gate, and the governor's budget.
// The seating law lives HERE as a JS model (fieldBodySeatModel) and is transcribed into
// gl/shaders.mjs FIELD_VS; the two share the kernel's own hash (hashU32 over the 'dish-fluid'
// channel — imul arithmetic, identical in GLSL uint math), so the model predicts the shader's
// seating exactly, seat for seat, on any device. The old body's "wear the nearest dealt mark"
// does not port (a vertex shader has no spatial search over the frame's marks) and retires
// with the CPU path: the channel body is the stage's POOL vocabulary, which is what the
// Option B reference mockup actually is.
//
// THE BUDGET — the governor's channel ladder, on the same cut as the kernel's (1.395):
// FIELD_BODY_BUDGETS denominated in instances. Shedding is a uniform change in the renderer
// (the draw spends the budget in whole sub-rounds — sub-major instance order, so a shed body
// thins evenly across the dish instead of amputating a corner) with zero CPU work: no
// re-seat, no re-pack, no re-upload. iPad-class devices start one rung down (4096).

import { hashU32 } from './kernel/rng.js';
import { FLUID_CHANNEL, FLUID_GRID_COLS, FLUID_GRID_ROWS } from './dishFluid.mjs';
import {
  MATTER_DENSITY_FLOOR,
  MATTER_SCALE_MIN,
  MATTER_CELL_RADIUS,
  FLUID_PRIMITIVE_ASSETS,
} from './dishFluidRender.mjs';
import { MARK_FRAC } from './dishLifeSeed.mjs';

/** Sub-seats per dish cell, per axis: the shader seats a 3×3 lattice inside each cell. */
export const FIELD_BODY_SUB = 3;
/** Total seats the channel offers at full budget: every cell × the 3×3 lattice (46,656). */
export const FIELD_BODY_SEATS = FLUID_GRID_COLS * FLUID_GRID_ROWS * FIELD_BODY_SUB * FIELD_BODY_SUB;
/** Most vocabulary entries the channel carries (the mockup used 36; the atlas cell table is small). */
export const FIELD_BODY_VOCAB_MAX = 96;
/**
 * The governor's channel budget ladder, denominated in instances, on cut 1.395 beside the
 * kernel ladder. The terminal 0 is the ladder's floor value — today's governor maps its
 * deepest kernel rung to 1024 (the body thins to its floor and stands); 0 is reached only
 * if a future cut or an explicit off demands it.
 */
export const FIELD_BODY_BUDGETS = Object.freeze([8192, 4096, 2048, 1024, 0]);
/**
 * Kernel shed rung → budget ladder index. The tempo rungs (0–3) are free — the fluid just
 * moves slower, the body stands whole; the seat rungs (4–6) spend the body next (4096, 2048,
 * 1024); the matter and hold rungs (7–9) hold the body at its floor. iPad-class devices
 * start one rung down (index +1, capped at the 1024 floor).
 */
const BUDGET_INDEX_BY_RUNG = Object.freeze([0, 0, 0, 0, 1, 2, 3, 3, 3, 3]);

/** The channel budget (instances) for a kernel shed rung and device class. Pure. */
export function fieldBodyBudgetFor(shedRung, ipadClass = false) {
  const r = Number.isFinite(Number(shedRung)) ? Math.min(9, Math.max(0, Math.round(Number(shedRung)))) : 0;
  let idx = BUDGET_INDEX_BY_RUNG[r];
  if (ipadClass) idx = Math.min(3, idx + 1);
  return FIELD_BODY_BUDGETS[idx];
}

/**
 * How many sub-rounds of the lattice a budget spends: the draw offers this many sub-seats
 * per cell (instance order is sub-major — round r covers every cell's r-th sub-seat — so a
 * shed body thins evenly across the dish). 0 = the channel does not draw at all.
 */
export function fieldBodyRounds(budget) {
  const b = Number(budget);
  if (!Number.isFinite(b) || b <= 0) return 0;
  const rounds = Math.ceil((FIELD_BODY_SUB * FIELD_BODY_SUB * b) / FIELD_BODY_BUDGETS[0]);
  return Math.min(FIELD_BODY_SUB * FIELD_BODY_SUB, Math.max(1, rounds));
}

/** The instanced draw count for a budget: whole sub-rounds over the whole grid. */
export const fieldBodyDrawCount = (budget) => fieldBodyRounds(budget) * FLUID_GRID_COLS * FLUID_GRID_ROWS;

/**
 * The hash stream indices the seating law draws from (the kernel's FLUID_CHANNEL stream,
 * continuing the retired CPU body's numbering discipline — distinct streams per purpose).
 * seat = cellIndex * 9 + subIndex.
 */
export const FIELD_BODY_STREAMS = Object.freeze({
  fill: 400000,
  pick: 410000,
  jitterX: 420000,
  jitterY: 430000,
  rotation: 440000,
});

/**
 * The 'dish-fluid' channel as a uint32 (FNV-1a, kernel/rng.js's hashChannel) — the constant
 * the GLSL transcription of hashU32 mixes, pinned against hashU01 by the channel selfcheck.
 */
export const FLUID_CHANNEL_U32 = 0xc91a0618;

/**
 * One seating hash draw, in [0, 1): the kernel's hashU32 over the FLUID_CHANNEL stream,
 * quantized to its top 24 bits — the quantization is deliberate: 2^24 is exactly
 * representable in the shader's float32, so the JS model and FIELD_VS draw the identical
 * value and every gate decision agrees seat for seat. Pure.
 */
export const fieldBodyHash01 = (seedKey, stream, seat) =>
  (hashU32(seedKey >>> 0, FLUID_CHANNEL, stream + seat) >>> 8) / 0x1000000;

/**
 * The density-shaped fill law: the fraction of a cell's sub-seats expected to exist at
 * quantized density d. 0 at the floor, 1 once the density runs FILL_SPAN past it — the
 * field's standing veins live at 0.3–0.5, so the span is tuned to that range: veins seat
 * sparsely, pools seat full. (Measured on a mature magnet field: ~7–9k pieces at full
 * budget — the Option B mockup's range; the channel selfcheck pins the count on its field.)
 */
export const FIELD_BODY_FILL_SPAN = 0.18;
export function fieldBodyFill(d) {
  const v = (Number(d) - MATTER_DENSITY_FLOOR) / FIELD_BODY_FILL_SPAN;
  return v <= 0 ? 0 : v >= 1 ? 1 : v;
}

/**
 * A seated item's stamp scale on a canvas of W×H, before the density factor — the retired
 * CPU body's own law (MATTER_CELL_RADIUS at the dish grid, in MARK_FRAC stamp units), so
 * the channel's pieces are the size the old body's were at the full seat grid.
 */
export function fieldBodyScaleBase(W, H) {
  const w = Number(W) || 0;
  const h = Number(H) || 0;
  if (!(w > 0) || !(h > 0)) return 0;
  const cw = w / FLUID_GRID_COLS;
  const ch = h / FLUID_GRID_ROWS;
  return (MATTER_CELL_RADIUS * Math.min(cw, ch)) / (MARK_FRAC * Math.min(w, h));
}

/**
 * Pack the published density (+ the bedrock mask) into the channel texture's bytes:
 * RG per cell — R the density quantized to a byte, G 255 on a blocked (bedrock) cell.
 * The quantization is part of the seating law: the shader gates on the byte it fetches,
 * and the JS model below reads the same bytes, so model and shader agree seat for seat.
 * A fresh Uint8Array each call — the renderer calls it on step change only.
 */
export function packFieldDensity(density, blocked = null) {
  const n = FLUID_GRID_COLS * FLUID_GRID_ROWS;
  const out = new Uint8Array(n * 2);
  if (!density || density.length !== n) return out;
  const hasBlocked = blocked && blocked.length === n;
  for (let i = 0; i < n; i++) {
    const d = density[i];
    out[i * 2] = Number.isFinite(d) ? Math.round(Math.min(1, Math.max(0, d)) * 255) : 0;
    out[i * 2 + 1] = hasBlocked && blocked[i] ? 255 : 0;
  }
  return out;
}

/**
 * The seating law as a JS model — FIELD_VS transcribed. Given the packed density bytes,
 * the cycle's seed key, the budget and the vocabulary size, produce every seat the shader
 * draws: { cell, sub, nx, ny (dish-normalized position), scaleF (the density scale factor),
 * rotation (degrees), vocab (vocabulary index), d (the quantized density = the piece's
 * opacity) }. Deterministic: same inputs, same seats, in instance order (sub-major, the
 * draw's own order). The selfcheck pins counts and spot seats; the GL capture verifies the
 * transcription on real hardware.
 */
export function fieldBodySeatModel(packed, seedKey, budget, vocabCount, { rounds = null } = {}) {
  const seats = [];
  const n = FLUID_GRID_COLS * FLUID_GRID_ROWS;
  if (!packed || packed.length !== n * 2 || !(vocabCount > 0)) return seats;
  const r = rounds == null ? fieldBodyRounds(budget) : Math.max(0, Math.min(9, rounds | 0));
  if (r === 0) return seats;
  const key = seedKey >>> 0;
  for (let sub = 0; sub < r; sub++) {
    for (let cell = 0; cell < n; cell++) {
      if (packed[cell * 2 + 1]) continue; // bedrock: no seat, ever
      const d = packed[cell * 2] / 255;
      if (!(d >= MATTER_DENSITY_FLOOR)) continue; // gate 1 — the density floor
      const seat = cell * 9 + sub;
      if (!(fieldBodyHash01(key, FIELD_BODY_STREAMS.fill, seat) < fieldBodyFill(d))) continue; // gate 2 — fill
      const cx = cell % FLUID_GRID_COLS;
      const cy = (cell - cx) / FLUID_GRID_COLS;
      const hx = fieldBodyHash01(key, FIELD_BODY_STREAMS.jitterX, seat);
      const hy = fieldBodyHash01(key, FIELD_BODY_STREAMS.jitterY, seat);
      seats.push({
        cell,
        sub,
        nx: (cx + hx) / FLUID_GRID_COLS,
        ny: (cy + hy) / FLUID_GRID_ROWS,
        scaleF: MATTER_SCALE_MIN + (1 - MATTER_SCALE_MIN) * d,
        rotation: fieldBodyHash01(key, FIELD_BODY_STREAMS.rotation, seat) * 360,
        vocab: Math.floor(fieldBodyHash01(key, FIELD_BODY_STREAMS.pick, seat) * vocabCount) % vocabCount,
        d,
      });
    }
  }
  return seats;
}

const hex6 = (c, fallback) => (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c.toLowerCase() : fallback);

/**
 * The contract descriptor for one frame's field body, sanitized fail-closed (the
 * sceneContract door): { layerId, vocab, ink, seedKey, floor, budget, scaleBase, aspectHW }
 * or null — no descriptor, no body. The vocabulary is the stage pool the resolver computed
 * (the pool deal's law, exactly as the retired CPU body read it): a caller that supplies no
 * pool at all gets the module's seed shapes (FLUID_PRIMITIVE_ASSETS); an explicitly empty
 * pool is an empty vocabulary and seats nothing. Capped at FIELD_BODY_VOCAB_MAX, first
 * entries in pool order.
 */
export function sanitizeFieldBody(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.layerId !== 'string' || !raw.layerId) return null;
  let vocab = null;
  if (Array.isArray(raw.poolIds)) {
    vocab = raw.poolIds.filter((id) => typeof id === 'string' && id.length > 0);
  } else if (raw.poolIds == null) {
    vocab = [...FLUID_PRIMITIVE_ASSETS];
  }
  if (!vocab || !vocab.length) return null;
  vocab = [...new Set(vocab)].slice(0, FIELD_BODY_VOCAB_MAX);
  const scaleBase = Number(raw.scaleBase);
  if (!Number.isFinite(scaleBase) || !(scaleBase > 0)) return null;
  const budgetRaw = Number(raw.budget);
  let budget = FIELD_BODY_BUDGETS[0];
  if (Number.isFinite(budgetRaw)) {
    budget = 0;
    for (const b of FIELD_BODY_BUDGETS) if (budgetRaw >= b) budget = Math.max(budget, b);
    if (budgetRaw > 0 && budget === 0) budget = FIELD_BODY_BUDGETS[FIELD_BODY_BUDGETS.length - 2];
  }
  const floor = Number(raw.floor);
  const aspectHW = Number(raw.aspectHW);
  return {
    layerId: raw.layerId,
    vocab,
    ink: hex6(raw.ink, '#000000'),
    seedKey: Number.isFinite(Number(raw.seedKey)) ? Number(raw.seedKey) >>> 0 : 0,
    floor: Number.isFinite(floor) && floor > 0 && floor < 1 ? floor : MATTER_DENSITY_FLOOR,
    budget,
    scaleBase,
    aspectHW: Number.isFinite(aspectHW) && aspectHW > 0 ? aspectHW : 0.7,
  };
}
