// Kernel K3 — scalar fields over the canvas (#62).
//
// A field is just `{ sample(nx, ny) -> 0..1 }` in normalized canvas space.
// Placement samplers use it for density: draw where the field is high,
// sparsely where it is low. Pure — no React, no store, no globals.
//
// Why this exists: the CA sampler used `cells[i % aliveCells.length]`.
// That is not a density mapping, it is a round-robin over a list whose
// ORDER and LENGTH change every CA step — so placement i jumped to an
// unrelated cell whenever the grid ticked or the count changed, and
// aliveCells() was rebuilt on every single placement (O(n²) overall).
//
// Rejection sampling against a field fixes both: position depends only on
// (seed, index, field), never on `count` or on the other placements, which
// is the kernel's index-stability rule.

import { createNoise } from '../../noise.js';
import { rngForIndex } from '../rng.js';

/** Uniform field — every point equally likely. The no-op case. */
export function makeConstantField(value = 1) {
  return { kind: 'constant', sample: () => value };
}

/**
 * Soft mask from a CA grid. Alive cells read 1, dead 0, bilinearly
 * interpolated, then optionally box-blurred so shapes cluster around
 * living regions instead of snapping to cell centres.
 *
 * @param {number[][]} grid rows of 0/1
 * @param {{softness?: number}} [opts] 0 = hard cells, 1+ = blurred
 */
export function makeCaField(grid, { softness = 1 } = {}) {
  if (!grid || !grid.length || !grid[0]?.length) return makeConstantField(1);
  const rows = grid.length;
  const cols = grid[0].length;

  // Pre-blur once into a float grid; sampling stays O(1) per point.
  let field = grid.map((row) => row.map((c) => (c ? 1 : 0)));
  const passes = Math.max(0, Math.round(softness));
  for (let p = 0; p < passes; p++) {
    const prev = field;
    field = prev.map((row, y) => row.map((_, x) => {
      let sum = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy;
          const xx = x + dx;
          if (yy < 0 || yy >= rows || xx < 0 || xx >= cols) continue;
          sum += prev[yy][xx];
          n++;
        }
      }
      return n ? sum / n : 0;
    }));
  }

  // A grid that blurred to near-nothing would reject every candidate and
  // degenerate to uniform; normalize so the brightest region reads 1.
  let max = 0;
  for (const row of field) for (const v of row) if (v > max) max = v;
  const norm = max > 1e-6 ? 1 / max : 0;

  return {
    kind: 'ca',
    sample(nx, ny) {
      if (norm === 0) return 1;
      const fx = Math.min(cols - 1, Math.max(0, nx * (cols - 1)));
      const fy = Math.min(rows - 1, Math.max(0, ny * (rows - 1)));
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const x1 = Math.min(cols - 1, x0 + 1);
      const y1 = Math.min(rows - 1, y0 + 1);
      const tx = fx - x0;
      const ty = fy - y0;
      const a = field[y0][x0] * (1 - tx) + field[y0][x1] * tx;
      const b = field[y1][x0] * (1 - tx) + field[y1][x1] * tx;
      return Math.min(1, Math.max(0, (a * (1 - ty) + b * ty) * norm));
    },
  };
}

/**
 * fBm density field. Same seed gives the same field, because the noise
 * instance is seeded (K1 removed the global perm table).
 */
export function makeNoiseField(seed, { freq = 2.5, octaves = 3, lacunarity = 2, gain = 0.5, z = 0 } = {}) {
  const noise = createNoise(seed >>> 0);
  return {
    kind: 'noise',
    sample(nx, ny) {
      const v = noise.fBm3D(nx * freq, ny * freq, z, octaves, lacunarity, gain);
      return Math.min(1, Math.max(0, (v + 1) / 2)); // -1..1 -> 0..1
    },
  };
}

/** Multiply two fields (mask one by the other). */
export function combineFields(a, b) {
  return { kind: 'combine', sample: (x, y) => a.sample(x, y) * b.sample(x, y) };
}

/**
 * Index-stable rejection sampling: find a point whose field value beats a
 * random threshold. Depends only on (seed, index, field) — NOT on count,
 * so placement i keeps its position when the operator changes density.
 *
 * Falls back to the best candidate seen rather than looping forever, so a
 * nearly-empty field still yields a point (in its densest region).
 *
 * @returns {{x:number,y:number,accepted:boolean}} normalized 0..1
 */
export function sampleFieldPoint(field, seed, index, { attempts = 24, channel = 'field' } = {}) {
  const rng = rngForIndex(seed, channel, index);
  let bestX = 0.5;
  let bestY = 0.5;
  let bestV = -1;
  for (let k = 0; k < attempts; k++) {
    const x = rng();
    const y = rng();
    const v = field.sample(x, y);
    if (v > bestV) { bestV = v; bestX = x; bestY = y; }
    if (rng() < v) return { x, y, accepted: true };
  }
  return { x: bestX, y: bestY, accepted: false };
}
