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
  // Two preallocated Float32Array buffers ping-ponged across passes (#1249):
  // no per-pass allocation. Edge semantics match the old array-of-arrays
  // blur exactly — out-of-bounds neighbours are skipped (not zero-padded)
  // and the average divides by the in-bounds neighbour count.
  const size = rows * cols;
  let src = new Float32Array(size);
  let dst = new Float32Array(size);
  for (let y = 0; y < rows; y++) {
    const row = grid[y];
    for (let x = 0; x < cols; x++) src[y * cols + x] = row[x] ? 1 : 0;
  }
  const passes = Math.max(0, Math.round(softness));
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < rows; y++) {
      const yBase = y * cols;
      for (let x = 0; x < cols; x++) {
        let sum = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= rows) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= cols) continue;
            sum += src[yy * cols + xx];
            n++;
          }
        }
        dst[yBase + x] = n ? sum / n : 0;
      }
    }
    const tmp = src;
    src = dst;
    dst = tmp;
  }
  const field = src; // row-major Float32Array after `passes` ping-pongs

  // A grid that blurred to near-nothing would reject every candidate and
  // degenerate to uniform; normalize so the brightest region reads 1.
  let max = 0;
  for (let i = 0; i < size; i++) if (field[i] > max) max = field[i];
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
      const a = field[y0 * cols + x0] * (1 - tx) + field[y0 * cols + x1] * tx;
      const b = field[y1 * cols + x0] * (1 - tx) + field[y1 * cols + x1] * tx;
      return Math.min(1, Math.max(0, (a * (1 - ty) + b * ty) * norm));
    },
  };
}

/**
 * Default opts for makeNoiseField. Exported so the GPU twin
 * (gl/fields/noiseField.glsl.js + fieldRunner.js) reads the same defaults
 * from one source of truth — the runner's uniform defaults can never drift
 * from the JS field silently.
 */
export const NOISE_FIELD_DEFAULTS = Object.freeze({
  freq: 2.5, octaves: 3, lacunarity: 2, gain: 0.5, z: 0,
});

/**
 * fBm density field. Same seed gives the same field, because the noise
 * instance is seeded (K1 removed the global perm table).
 */
export function makeNoiseField(seed, {
  freq = NOISE_FIELD_DEFAULTS.freq,
  octaves = NOISE_FIELD_DEFAULTS.octaves,
  lacunarity = NOISE_FIELD_DEFAULTS.lacunarity,
  gain = NOISE_FIELD_DEFAULTS.gain,
  z = NOISE_FIELD_DEFAULTS.z,
} = {}) {
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
export function sampleFieldPoint(field, seed, index, { attempts = 24, channel = 'field', seedOffsets = null } = {}) {
  const rng = rngForIndex(seed, channel, index, seedOffsets);
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
