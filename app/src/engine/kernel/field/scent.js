/**
 * scent.js — the scent field (#287, bio-drives).
 *
 * A coarse CPU grid (64×36) that agents deposit into, that diffuses and
 * decays every step, and that mold colonies climb via chemotaxis. It is the
 * shared invisible substrate for LEAK (pigment/scent bleed) and MOLD
 * (gradient-following colonies) — the "ground truth" of where the cast has
 * been, without ever rendering anything visible itself.
 *
 * Contract (same shape as the other kernel fields):
 *   { kind: 'scent', cols, rows, sample(nx, ny), deposit(nx, ny, amount),
 *     gradient(nx, ny) -> { gx, gy }, step(opts), clear() }
 *
 * Coordinates are normalized 0..1, clamped at the edges. The grid is Float64
 * (simulation state, not render state). All values are deterministic given
 * the same deposit sequence — no RNG inside.
 *
 * Cost: ~2.3k cells, one diffuse+decay pass per update. Declared tier 0
 * (structural substrate, never shed) beside the field definition, following
 * the measured-cost-tier pattern: the cost lives with the definition, not
 * in a separate list. costTiers.mjs is import-safe here (zero imports, no
 * cycle) — this is an engine→gl import by directory only; the module itself
 * has no browser dependencies.
 */

import { registerCostTier } from '../../../gl/costTiers.mjs';

export const SCENT_COLS = 64;
export const SCENT_ROWS = 36;

/** One simulation step = diffuse toward the 4-neighborhood, then decay. */
const DEFAULT_STEP = { decay: 0.97, diffuse: 0.25 };

export function createScentField(cols = SCENT_COLS, rows = SCENT_ROWS) {
  const cells = new Float64Array(cols * rows);
  // Scratch buffer allocated once — the per-frame step must not allocate.
  const scratch = new Float64Array(cols * rows);

  const at = (x, y) => cells[Math.min(rows - 1, Math.max(0, y)) * cols + Math.min(cols - 1, Math.max(0, x))];

  /**
   * Bilinear sample in normalized 0..1 coordinates, clamped at the edges.
   * Cell-centered: grid cell (cx, cy) covers [(cx-0.5)/cols, (cx+0.5)/cols].
   */
  function sample(nx, ny) {
    const gx = Math.min(cols - 1.001, Math.max(0, nx * cols - 0.5));
    const gy = Math.min(rows - 1.001, Math.max(0, ny * rows - 0.5));
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = gx - x0;
    const fy = gy - y0;
    const a = at(x0, y0);
    const b = at(x0 + 1, y0);
    const c = at(x0, y0 + 1);
    const d = at(x0 + 1, y0 + 1);
    const v = a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    // Clamp the top end so runaway deposits can't blow up forces.
    return v < 0 ? 0 : v > 4 ? 4 : v;
  }

  /** Add `amount` to the nearest cell (normalized 0..1 coords, clamped). */
  function deposit(nx, ny, amount) {
    if (!(amount > 0)) return;
    const cx = Math.min(cols - 1, Math.max(0, Math.round(nx * cols - 0.5)));
    const cy = Math.min(rows - 1, Math.max(0, Math.round(ny * rows - 0.5)));
    cells[cy * cols + cx] += amount;
  }

  /**
   * Scent gradient in normalized units, via central differences on sample().
   * Mold chemotaxis multiplies this by its profile gain — the vector points
   * uphill, toward the strongest colony scent.
   */
  function gradient(nx, ny) {
    const ex = 1 / cols;
    const ey = 1 / rows;
    const gx = (sample(nx + ex, ny) - sample(nx - ex, ny)) / (2 * ex);
    const gy = (sample(nx, ny + ey) - sample(nx, ny - ey)) / (2 * ey);
    return { gx, gy };
  }

  /** One simulation step: diffuse, then decay. Deterministic. */
  function step(opts = {}) {
    const { decay = DEFAULT_STEP.decay, diffuse = DEFAULT_STEP.diffuse } = opts;
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      for (let x = 0; x < cols; x++) {
        const i = row + x;
        const c = cells[i];
        const n =
          (at(x - 1, y) + at(x + 1, y) + at(x, y - 1) + at(x, y + 1)) * 0.25;
        scratch[i] = (c + (n - c) * diffuse) * decay;
      }
    }
    cells.set(scratch);
  }

  function clear() {
    cells.fill(0);
  }

  return { kind: 'scent', cols, rows, sample, deposit, gradient, step, clear };
}

registerCostTier('engine/scent-field', {
  tier: 0,
  memoryBytes: SCENT_COLS * SCENT_ROWS * 8,
  timeMs: 0.05,
  notes:
    '#287 bio-drives: 64×36 CPU scent grid — per-frame deposit + one diffuse/decay pass. ' +
    'Simulation substrate (drives/mold/leak), never shed; ~0.05 ms/frame.',
});
