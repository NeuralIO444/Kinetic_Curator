// FLOW wire — the trail advects through the project-seed curl, not a private hash.
// Static lookup. Not the Stage 3 ping-pong scent field.

import { createNoise } from '../engine/noise.js';

export const FLOW_FIELD_N = 32;

/** One curl2 sample per cell. Same createNoise the swarm uses. */
export function buildFlowField(seed) {
  const key = (seed >>> 0) || 444;
  const noise = createNoise(key);
  const n = FLOW_FIELD_N;
  const data = new Float32Array(n * n * 2);
  const out = { x: 0, y: 0 };
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const u = (x + 0.5) / n;
      const v = (y + 0.5) / n;
      noise.curl2(u * 6, v * 6, 0, 0.5, out);
      const o = (y * n + x) * 2;
      data[o] = out.x;
      data[o + 1] = out.y;
    }
  }
  return { n, seed: key, data };
}

/** Bilinear sample. Matches a linear texture of the same table. */
export function sampleFlowField(field, u, v) {
  const n = field.n;
  const x = Math.min(n - 1, Math.max(0, u * n - 0.5));
  const y = Math.min(n - 1, Math.max(0, v * n - 0.5));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(n - 1, x0 + 1);
  const y1 = Math.min(n - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const at = (ix, iy) => {
    const o = (iy * n + ix) * 2;
    return [field.data[o], field.data[o + 1]];
  };
  const a = at(x0, y0);
  const b = at(x1, y0);
  const c = at(x0, y1);
  const d = at(x1, y1);
  const lerp = (p, q, t) => p + (q - p) * t;
  return [
    lerp(lerp(a[0], b[0], tx), lerp(c[0], d[0], tx), ty),
    lerp(lerp(a[1], b[1], tx), lerp(c[1], d[1], tx), ty),
  ];
}
