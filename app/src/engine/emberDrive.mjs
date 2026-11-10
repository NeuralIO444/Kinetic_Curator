// emberDrive.mjs — #1837 (ACCUM as memory, rung 2 slice 2, of #1808):
// the moth's one TRAIL DRIVE. The moth grazes the light it lives
// beside: it steers, slowly and on a short leash, on the trail grid
// (gl/trailGrid.mjs) — toward the cells whose light is MID-AGE (the
// ember pole, slice 2: laid down a moment ago and still warm, neither
// fresh nor faded to the paper). #1838 (slice 3) adds the drive's
// other pole: FRESH light — just drawn, still arriving — read through
// a SIGNED weight the look declares: positive seeks the new trail
// (Matt's ruling, 2026-11-10: fresh light ATTRACTS), negative flees
// it. One drive, two poles, one creature type (the moth), integrated
// in the moth builder beside the hover (engine/creature.js), capped
// the way every drive in this instrument is capped. The parent issue
// caps a creature type at ONE trail-drive in v1; the poles are the
// two ends of this one, never two drives — a frame steers on the
// single combined field (trailDriveField) whenever the fresh pole is
// declared, and on slice 2's exact path when it is not.
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

/** One cell's normalised age t ∈ [0, 1] (0 = just laid, 1 = fully
 *  faded), or null when the cell carries no readable age: energy at or
 *  below the floor (unlit paper), a void age (the light there has no
 *  past), or a dead green channel on the proxy path. Both poles of the
 *  trail drive read a cell's age through this one door — by true age
 *  when the grid carries ages, else by the spectral ratio proxy. */
function cellAgeT(grid, cell) {
  const energy = grid.energy[cell];
  if (!(energy > EMBER_ENERGY_FLOOR)) return null;
  if (grid.hasAge) {
    const age = grid.age[cell];
    if (!(age >= 0)) return null; // void age: the light there has no past
    return clamp01(age / EMBER_OLD_S);
  }
  const g = grid.g[cell];
  if (!(g > 0)) return null;
  return clamp01((EMBER_PROXY_Q_FRESH - grid.b[cell] / g) / (EMBER_PROXY_Q_FRESH - EMBER_PROXY_Q_OLD));
}

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
  const t = cellAgeT(grid, cell);
  return t === null ? 0 : grid.energy[cell] * emberWindow(t);
}

/** #1838 — the fresh window: 1 at just-laid, falling linearly to 0 at
 *  the ember window's near edge (EMBER_FRESH_T). The two windows tile
 *  the age axis — a cell's light is FRESH, then an EMBER, then paper,
 *  never two at once — so the fresh pole is not a second field laid
 *  over the ember's; it is the same axis's other end. */
export function freshWindow(t) {
  const x = clamp01(t);
  return x >= EMBER_FRESH_T ? 0 : 1 - x / EMBER_FRESH_T;
}

/** One cell's fresh value: the same energy gate and age read as the
 *  ember pole's, windowed to the fresh end of the axis. */
export function freshCellValue(grid, cell) {
  const t = cellAgeT(grid, cell);
  return t === null ? 0 : grid.energy[cell] * freshWindow(t);
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

/** #1838 — the fresh field of one trail grid: fresh values, same shape
 *  and order as the grid's own cell arrays. Derived state, like the
 *  ember field — cached against the grid's identity, never recorded. */
export function freshField(grid) {
  const n = grid.cols * grid.rows;
  const field = new Float64Array(n);
  for (let cell = 0; cell < n; cell++) field[cell] = freshCellValue(grid, cell);
  return field;
}

/**
 * #1838 — THE trail-drive field: the one field the drive steers on
 * when the fresh pole is declared. Per cell it is the declared-weight
 * sum of the two poles — emberWeight × ember + freshWeight × fresh —
 * with freshWeight SIGNED: a seeking look's fresh cells stand high, a
 * fleeing look's stand low (below the paper), and climbing the field
 * flees them. Because the two windows tile the age axis, at most one
 * term per cell is ever non-zero; the sum never double-counts a cell.
 */
export function trailDriveField(grid, emberWeight, freshWeight) {
  const n = grid.cols * grid.rows;
  const field = new Float64Array(n);
  for (let cell = 0; cell < n; cell++) {
    const t = cellAgeT(grid, cell);
    if (t === null) continue;
    const e = grid.energy[cell];
    field[cell] = emberWeight * (e * emberWindow(t)) + freshWeight * (e * freshWindow(t));
  }
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
 * #1838 — one steering step on the COMBINED trail-drive field (see
 * trailDriveField). The builder routes here only when the look
 * declares a fresh weight; with the fresh pole undeclared the drive
 * is slice 2's emberSteerStep, untouched, so every ember-only take
 * replays bit-for-bit. The machinery is slice 2's — same sensor
 * reach, same leash, same capped step — generalised in exactly two
 * places:
 *   · the step's scale is the drive's standing weight
 *     W = max(emberWeight, |freshWeight|), and the gradient reference
 *     scales by W with it (the field's values already carry the
 *     declared weights, so an unscaled reference would double-count
 *     them). For a fresh-only declaration this reduces exactly to
 *     slice 2's step over the signed fresh field at weight |fresh|.
 *   · the no-slope modes: GRAZING IS THE EMBER POLE'S ALONE. Standing
 *     on warm food (the ember field underfoot ≥ EMBER_GRAZE, and the
 *     ember pole declared) holds the moth, exactly as slice 2. Fresh
 *     light NEVER holds a moth: the buffer's age reset keeps a
 *     standing creature's own cell at age 0 (gl/accum.mjs, the age
 *     pass's mode 1), so an underfoot fresh read is the moth's own
 *     light — a graze on it would pin the moth wherever it first
 *     stood, and a moth that reached fresh light would camp on it
 *     forever, self-lit. The fresh pole is read where Jones's agents
 *     read their field: at the sensors, ahead of the body — never
 *     underfoot. No slope and nothing to graze → the offset relaxes
 *     one step home, slice 2's fallback; that return is the fresh
 *     pole's damping, and the non-collapse soak exercises it.
 *
 * @param {object} args — grid/field/x/y/canvasW/canvasH/off as
 *   emberSteerStep, plus:
 * @param {Float64Array} args.field — trailDriveField(grid, …)
 * @param {Float64Array} args.emberField — emberField(grid), read ONLY
 *   for the graze decision underfoot
 * @param {number} args.emberWeight — the look's declared ember weight, 0..1
 * @param {number} args.freshWeight — the look's declared fresh weight,
 *   SIGNED −1..1 (positive seeks, negative flees)
 */
export function trailSteerStep({ grid, field, emberField, x, y, canvasW, canvasH, emberWeight, freshWeight, off }) {
  const w = Number(canvasW);
  const h = Number(canvasH);
  const W = Math.max(emberWeight, Math.abs(freshWeight));
  if (!(w > 0) || !(h > 0) || !(W > 0)) return off;
  const cols = grid.cols;
  const rows = grid.rows;
  const cx = Math.min(cols - 1, Math.max(0, Math.floor((x / w) * cols)));
  const cy = Math.min(rows - 1, Math.max(0, Math.floor((1 - y / h) * rows)));
  const S = EMBER_SENSE_CELLS;
  const gx = (cellAt(field, cols, rows, cx + S, cy) - cellAt(field, cols, rows, cx - S, cy)) / (2 * S);
  const gy = (cellAt(field, cols, rows, cx, cy + S) - cellAt(field, cols, rows, cx, cy - S)) / (2 * S);
  const cellW = w / cols;
  const cellH = h / rows;
  const sx = gx / cellW;
  const sy = -gy / cellH;
  const mag = Math.hypot(sx, sy);
  if (!(mag > 0)) {
    // No slope: graze if the EMBER pole is declared and warm food is
    // underfoot; fresh light underfoot is the moth's own and holds
    // nothing — else start home.
    return emberWeight > 0 && cellAt(emberField, cols, rows, cx, cy) >= EMBER_GRAZE ? off : emberRelaxStep(off);
  }
  const strength = Math.min(1, (mag * Math.min(cellW, cellH)) / (EMBER_GRAD_REF * W));
  const step = EMBER_SPEED_PX * W * strength;
  let nx = off.x + (sx / mag) * step;
  let ny = off.y + (sy / mag) * step;
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
