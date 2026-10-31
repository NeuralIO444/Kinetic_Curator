// emberDrive.mjs — #1837 (ACCUM as memory, rung 2 slice 2, of #1808):
// the ember-following drive. The moth grazes the light it lives beside:
// it steers, slowly and on a short leash, toward the cells of the trail
// grid (gl/trailGrid.mjs) whose light is MID-AGE — laid down a moment
// ago and still warm, neither fresh (just drawn, still arriving) nor
// old (faded to the paper). One drive, one creature type (the moth),
// integrated in the moth builder beside the hover (engine/creature.js),
// capped the way every drive in this instrument is capped.
//
// The field is derived state: a pure function of one trail grid, which
// is itself a pure function of the ACCUM buffer. Nothing here reads a
// clock or a chance source — the grid's stamp is the buffer's own step
// count — so the same grid sequence steers the same moths, exactly
// (the replay test in emberDrive.selfcheck.mjs pins 2,000 frames).
//
// The ember window is ONE triangular shape over a normalised age
// t ∈ [0, 1] (0 = just laid, 1 = fully faded), peaked at EMBER_PEAK_T.
// Two honest calibrations feed it, per #1808's own read surface:
//   · when the grid carries true ages (the #1805 age buffer rode the
//     snapshot), t = age / EMBER_OLD_S — measured seconds of show time.
//   · when it does not, t comes from the spectral-fade proxy (#1800):
//     fresh light is spectrally whole (blue/green ≈ 1) and the blue
//     dies first, so the cell's b/g ratio falls monotonically as its
//     light ages (slice 1's comet measured 1.000 → 0.161 head to tail).
//     t = (Q_FRESH − b/g) / (Q_FRESH − Q_OLD), clamped. A tinted light
//     fools the proxy; that is the documented price of the v1
//     substitute, and the age path supersedes it whenever it rides.

/** Oldest light that still counts as an ember, in seconds of show time
 *  (the age path's t = 1). Past it the trail is paper again. */
export const EMBER_OLD_S = 6;
/** The fresh deadband, as a fraction of the way from fresh to old
 *  (0.5 s of show time): light younger than this is not an ember yet —
 *  it is still being drawn. The deadband is also what keeps the drive
 *  honest about the moth's own body: a moth standing in the buffer
 *  re-lays its cell's light every frame, holding that cell's age near
 *  zero, so without a deadband the drive would read the moth's own
 *  fresh light as a weak ember and camp on itself (measured in the
 *  soak: a 70 s self-camp before this line existed). */
export const EMBER_FRESH_T = 1 / 12;
/** Where the ember window peaks, as a fraction of the way from fresh
 *  to old: young enough to still glow, old enough to be a path. */
export const EMBER_PEAK_T = 0.35;
/** Standing on this much ember (energy × window) is grazing: the moth
 *  holds its ground instead of wandering home. Below it, with no
 *  gradient to climb, there is nothing here for the moth — it goes
 *  home. That third mode is the non-collapse damping: a camp needs
 *  food, food is mid-age light, and mid-age light dies in seconds. */
export const EMBER_GRAZE = 0.05;
/** Spectral proxy calibration: b/g at fresh light, and at the oldest
 *  light slice 1 measured (the comet's tail). */
export const EMBER_PROXY_Q_FRESH = 0.95;
export const EMBER_PROXY_Q_OLD = 0.18;
/** A cell needs at least this mean light before its age means anything:
 *  below it the cell is unlit paper, not an ember. */
export const EMBER_ENERGY_FLOOR = 0.02;
/** The drive's top speed at weight 1, in scene px per resolver frame
 *  (≈33 px/s at 60 fps): a drift, not a dash — the moth stays a moth. */
export const EMBER_SPEED_PX = 0.55;
/** The gradient's sensor reach, in cells: the slope is read between the
 *  cells this far either side of the moth (the Physarum sensor offset —
 *  Jones's agents sense ahead of their bodies, and so does this drive).
 *  An ember further than this from the moth exerts no pull at all: the
 *  field beyond the apron is not the moth's business, and a moth far
 *  from any trail simply stays home. */
export const EMBER_SENSE_CELLS = 2;
/** The gradient strength (ember units per cell) at which the drive
 *  reaches full speed; weaker slopes move it proportionally less, so a
 *  nearly flat field barely stirs the moth. */
export const EMBER_GRAD_REF = 0.2;
/** The leash: how far from its pin the drive may carry a moth, in grid
 *  cells. The pin stays home; the drive borrows the neighbourhood. */
export const EMBER_LEASH_CELLS = 5;
/** When the drive is off (no grid, no declared weight, the governor's
 *  shed, a pinned-still citizen), the borrowed offset walks home at
 *  this rate, scene px per resolver frame — the moth falls back to
 *  today's drives, it does not snap. */
export const EMBER_HOME_PX = 0.3;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** The ember window: 0 through the fresh deadband, 1 at the peak,
 *  0 at old. */
export function emberWindow(t) {
  const x = clamp01(t);
  if (x <= EMBER_FRESH_T || x >= 1) return 0;
  return x < EMBER_PEAK_T ? (x - EMBER_FRESH_T) / (EMBER_PEAK_T - EMBER_FRESH_T) : (1 - x) / (1 - EMBER_PEAK_T);
}

/** One cell's ember value from its grid record: energy gated, windowed
 *  by true age when the grid carries ages, else by the ratio proxy. */
export function emberCellValue(grid, cell) {
  const energy = grid.energy[cell];
  if (!(energy > EMBER_ENERGY_FLOOR)) return 0;
  let t;
  if (grid.hasAge) {
    const age = grid.age[cell];
    if (!(age >= 0)) return 0; // void age: the light there has no past
    t = age / EMBER_OLD_S;
  } else {
    const g = grid.g[cell];
    if (!(g > 0)) return 0;
    t = (EMBER_PROXY_Q_FRESH - grid.b[cell] / g) / (EMBER_PROXY_Q_FRESH - EMBER_PROXY_Q_OLD);
  }
  return energy * emberWindow(t);
}

/**
 * The ember field of one trail grid: a Float64Array of ember values,
 * same shape and order as the grid's own cell arrays. Derived state —
 * callers cache it against the grid object's identity, never record it.
 */
export function emberField(grid) {
  const n = grid.cols * grid.rows;
  const field = new Float64Array(n);
  for (let cell = 0; cell < n; cell++) field[cell] = emberCellValue(grid, cell);
  return field;
}

const cellAt = (field, cols, rows, cx, cy) =>
  field[Math.min(rows - 1, Math.max(0, cy)) * cols + Math.min(cols - 1, Math.max(0, cx))];

/**
 * One steering step for one moth. Pure: the builder owns the offset,
 * this owns the arithmetic.
 *
 * @param {object} args
 * @param {object} args.grid — a trail grid (gl/trailGrid.mjs)
 * @param {Float64Array} args.field — emberField(grid)
 * @param {number} args.x, args.y — the moth's steered position (pin +
 *   current offset), scene px
 * @param {number} args.canvasW, args.canvasH — scene size, px (the grid
 *   covers the whole presented canvas; scene y grows downward, the
 *   grid's v grows upward — the flip happens here, once)
 * @param {number} args.weight — the look's declared ember weight, 0..1
 * @param {{x:number, y:number}} args.off — the current borrowed offset
 * @returns {{x:number, y:number}} the new offset, by the drive's three
 *   modes: a slope to climb → pulled up the local ember gradient by a
 *   capped step, leash-clamped to the pin; no slope but standing on an
 *   ember (≥ EMBER_GRAZE underfoot) → the offset holds (grazing); no
 *   slope and nothing underfoot → the offset relaxes one step home —
 *   borrowed ground is returned when there is nothing to graze.
 */
export function emberSteerStep({ grid, field, x, y, canvasW, canvasH, weight, off }) {
  const w = Number(canvasW);
  const h = Number(canvasH);
  if (!(w > 0) || !(h > 0) || !(weight > 0)) return off;
  const cols = grid.cols;
  const rows = grid.rows;
  const cx = Math.min(cols - 1, Math.max(0, Math.floor((x / w) * cols)));
  const cy = Math.min(rows - 1, Math.max(0, Math.floor((1 - y / h) * rows)));
  // Central differences at the sensor reach (clamped at the edges): the
  // local slope of the ember field, in ember units per cell.
  const S = EMBER_SENSE_CELLS;
  const gx = (cellAt(field, cols, rows, cx + S, cy) - cellAt(field, cols, rows, cx - S, cy)) / (2 * S);
  const gy = (cellAt(field, cols, rows, cx, cy + S) - cellAt(field, cols, rows, cx, cy - S)) / (2 * S);
  // To scene space: x scales by the cell's px width; the grid's +v is
  // up, the scene's +y is down, so the y slope flips sign.
  const cellW = w / cols;
  const cellH = h / rows;
  const sx = gx / cellW;
  const sy = -gy / cellH;
  const mag = Math.hypot(sx, sy);
  if (!(mag > 0)) {
    // No slope: graze if standing on an ember, else start home.
    return cellAt(field, cols, rows, cx, cy) >= EMBER_GRAZE ? off : emberRelaxStep(off);
  }
  const strength = Math.min(1, (mag * Math.min(cellW, cellH)) / EMBER_GRAD_REF);
  const step = EMBER_SPEED_PX * weight * strength;
  let nx = off.x + (sx / mag) * step;
  let ny = off.y + (sy / mag) * step;
  // The leash: the offset may never carry the moth further than
  // EMBER_LEASH_CELLS cells from its pin, in any direction.
  const leash = EMBER_LEASH_CELLS * Math.min(cellW, cellH);
  const dist = Math.hypot(nx, ny);
  if (dist > leash) {
    nx = (nx / dist) * leash;
    ny = (ny / dist) * leash;
  }
  return { x: nx, y: ny };
}

/**
 * The fallback step: the drive is off, so the borrowed offset walks
 * home at EMBER_HOME_PX per frame and lands exactly on the pin (an
 * offset of exactly 0 stays exactly 0 — a steering-less frame, and
 * every take recorded before this slice, is bit-identical).
 */
export function emberRelaxStep(off) {
  const dist = Math.hypot(off.x, off.y);
  if (!(dist > 0)) return off;
  if (dist <= EMBER_HOME_PX) return { x: 0, y: 0 };
  const k = (dist - EMBER_HOME_PX) / dist;
  return { x: off.x * k, y: off.y * k };
}
