// #1194 — Gaussian (probability-curve) cluster sampler.
//
// Organic grouping with soft falloff: dense cores feathering to sparse edges, the opposite answer to the Poisson
// sampler's "even and never clumped". The whole plate is one mixture of 2–3 Gaussian lobes, so it reads as
// intentional grouping, not a single blob.
//
// LOBES: per (seed, offsets, plate) a tiny table of 2–3 centres (kept inside the plate's inner 70%) with weights that
// sum to 1, drawn once from a dedicated stream `rngForChannel(seed, 'gaussian', seedOffsets)` and cached. 'gaussian'
// rides the spatial stream (STRING_CHANNEL_GROUPS): re-rolling SPATIAL re-rolls the grouping, colour must not.
//
// POINTS: index-stable (the rngForIndex contract): point i picks a lobe by weight, then a Box-Muller offset scaled by
// sigma (a fraction of the plate's shorter side; `ctx.gaussianSigma` overrides). Nothing is shared between indices, so
// the same (seed, i) always lands in the same place however many points are asked for.
//
// BOUNDS: points REFLECT off the plate edge (a triangle wave), never clamp and never leave: no pile-up on the border,
// no hard edge, no grid ghost. Jitter follows the grid convention (two ctx.rng draws, then reflect again).
import { rngForChannel, rngForIndex } from '../rng.js';
import { writeSampleColumns } from './columns.js';

/** Default spread: sigma as a fraction of the plate's shorter side. */
export const GAUSS_SIGMA_FRAC = 0.14;
export const GAUSS_MIN_LOBES = 2;
export const GAUSS_MAX_LOBES = 3;
/** Lobe centres live in [MARGIN, 1 - MARGIN] of each axis. */
export const GAUSS_MARGIN = 0.15;
const LOBE_CACHE_SIZE = 8;
const _lobeCache = new Map();
const TAU = Math.PI * 2;

/** Mirror `v` back into [0, size]: a triangle wave, exact for any distance. */
export function reflect(v, size) {
  if (!(size > 0)) return 0;
  const period = 2 * size;
  const p = ((v % period) + period) % period;
  return p <= size ? p : period - p;
}

/**
 * The lobe table for a plate: [{ cx, cy, cum }] with `cum` the cumulative weight (last is 1).
 * Deterministic in (seed, seedOffsets, w, h).
 */
export function gaussianLobes(seed, w, h, seedOffsets) {
  const key = `${seed >>> 0}|${w}|${h}|${seedOffsets ? JSON.stringify(seedOffsets) : ''}`;
  const hit = _lobeCache.get(key);
  if (hit) return hit;
  const stream = rngForChannel(seed, 'gaussian', seedOffsets);
  const n = GAUSS_MIN_LOBES + (stream() < 0.5 ? 0 : 1);
  const span = 1 - 2 * GAUSS_MARGIN;
  const raw = [];
  let total = 0;
  for (let k = 0; k < n; k++) {
    const cx = (GAUSS_MARGIN + stream() * span) * w;
    const cy = (GAUSS_MARGIN + stream() * span) * h;
    const weight = 0.5 + stream(); // 0.5..1.5: every lobe matters, none is a rounding error
    raw.push({ cx, cy, weight });
    total += weight;
  }
  let run = 0;
  const lobes = raw.map((l) => {
    run += l.weight / total;
    return { cx: l.cx, cy: l.cy, cum: run };
  });
  lobes[lobes.length - 1].cum = 1;
  if (_lobeCache.size >= LOBE_CACHE_SIZE) _lobeCache.delete(_lobeCache.keys().next().value);
  _lobeCache.set(key, lobes);
  return lobes;
}

/** Clear the lobe cache (tests). */
export function clearGaussianCache() {
  _lobeCache.clear();
}

/** Sampler: (ctx) => { x, y }. Pure per index; no shared sequential stream. */
export function gaussian(ctx) {
  const { i, w, h, seed, seedOffsets, rng, jitter, gaussianSigma, scratch } = ctx;
  const lobes = gaussianLobes(seed, w, h, seedOffsets);
  // #1250 — the placement call's scratch stream is bit-identical to rngForIndex and saves the allocation.
  const r = scratch
    ? scratch.reseed(seed, 'gaussian', i, seedOffsets).draw
    : rngForIndex(seed, 'gaussian', i, seedOffsets);
  const pick = r();
  let lobe = lobes[lobes.length - 1];
  for (let k = 0; k < lobes.length; k++) {
    if (pick <= lobes[k].cum) { lobe = lobes[k]; break; }
  }
  const sigma = (Number.isFinite(gaussianSigma) && gaussianSigma > 0 ? gaussianSigma : GAUSS_SIGMA_FRAC) * Math.min(w, h);
  const mag = Math.sqrt(-2 * Math.log(Math.max(r(), 1e-12)));
  const ang = r() * TAU;
  let x = lobe.cx + Math.cos(ang) * mag * sigma;
  let y = lobe.cy + Math.sin(ang) * mag * sigma;
  const j = Number.isFinite(jitter) ? jitter : 0;
  x += (rng() - 0.5) * j;
  y += (rng() - 0.5) * j;
  x = reflect(x, w);
  y = reflect(y, h);
  if (writeSampleColumns(ctx, x, y)) return; // #1309 — column mode
  return { x, y };
}
