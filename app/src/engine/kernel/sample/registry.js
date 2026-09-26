// Kernel K2 — sampler registry (#60)
// Sampler: (ctx) => { x, y, t? }
// ctx: { i, count, w, h, rng, jitter, seed, caGrid }
// Pure; no React. Jitter/bleed/displacement applied in placement orchestrator optional —
// legacy modes still apply their own jitter for visual parity.

import { makeCaField, sampleFieldPoint } from '../field/index.js';
import { hashU01, rngForIndex } from '../rng.js';

/** @typedef {{ i: number, count: number, w: number, h: number, rng: () => number, jitter: number, seed: number, caGrid?: unknown }} SampleCtx */

/** @type {Record<string, (ctx: SampleCtx) => { x: number, y: number, t?: number }>} */
export const SAMPLERS = {};

export function registerSampler(id, fn) {
  SAMPLERS[id] = fn;
}

export function getSampler(mode) {
  // Own-property check, not a bare index. `SAMPLERS['__proto__']` returns
  // Object.prototype — truthy but not callable — so a poisoned project's mode
  // threw "sample is not a function" from inside the placement loop, taking
  // down a studio batch or the live canvas. normalizeLayoutParams allow-lists
  // `mode` now; this is the second line of defence for callers that assemble
  // layoutParams themselves (#106).
  return Object.hasOwn(SAMPLERS, mode) && typeof SAMPLERS[mode] === 'function'
    ? SAMPLERS[mode]
    : SAMPLERS.random;
}

export function listSamplers() {
  return Object.keys(SAMPLERS);
}

// ── Legacy mode adapters (same math as the retired placement/modes.js) ─────

function random(ctx) {
  const { w, h, rng } = ctx;
  return { x: rng() * w, y: rng() * h };
}

function grid(ctx) {
  const { i, count, w, h, rng, jitter } = ctx;
  const cols = Math.ceil(Math.sqrt(count * (w / h)));
  const rows = Math.ceil(count / cols);
  const cx = ((i % cols) + 0.5) / cols * w;
  const cy = (Math.floor(i / cols) + 0.5) / rows * h;
  return { x: cx + (rng() - 0.5) * jitter, y: cy + (rng() - 0.5) * jitter };
}

function fibonacci(ctx) {
  const { i, count, w, h, rng, jitter } = ctx;
  const phi = (1 + Math.sqrt(5)) / 2;
  const angle = 2 * Math.PI * i / (phi * phi);
  const radius = Math.sqrt(i / count) * Math.min(w, h) * 0.48;
  const cx = w / 2 + Math.cos(angle) * radius;
  const cy = h / 2 + Math.sin(angle) * radius;
  return { x: cx + (rng() - 0.5) * jitter, y: cy + (rng() - 0.5) * jitter };
}

function radial(ctx) {
  const { i, count, w, h, rng, jitter } = ctx;
  const rings = Math.ceil(Math.sqrt(count));
  const ring = Math.floor(i / rings);
  const seg = i % rings;
  const angle = (seg / rings) * Math.PI * 2 + ring * 0.3;
  const radius = ((ring + 1) / rings) * Math.min(w, h) * 0.44;
  return {
    x: w / 2 + Math.cos(angle) * radius + (rng() - 0.5) * jitter,
    y: h / 2 + Math.sin(angle) * radius + (rng() - 0.5) * jitter,
  };
}

function swarm(ctx) {
  const { w, h, rng, jitter } = ctx;
  const cx = w * (0.3 + rng() * 0.4);
  const cy = h * (0.3 + rng() * 0.4);
  const spread = Math.min(w, h) * 0.35;
  return {
    x: cx + (rng() - 0.5) * spread + (rng() - 0.5) * jitter,
    y: cy + (rng() - 0.5) * spread + (rng() - 0.5) * jitter,
  };
}

function flow(ctx) {
  const { i, count, w, h, rng, jitter } = ctx;
  const t = count > 1 ? i / (count - 1) : 0.5;
  const x = t * w;
  const wave = Math.sin(t * Math.PI * 3 + rng() * 2) * h * 0.3;
  return { x: x + (rng() - 0.5) * jitter, y: h / 2 + wave + (rng() - 0.5) * jitter, t };
}

function layers(ctx) {
  const { i, w, h, rng, jitter } = ctx;
  const n = 5;
  const layer = i % n;
  const y = ((layer + 0.5) / n) * h;
  return { x: rng() * w, y: y + (rng() - 0.5) * jitter };
}

function rails(ctx) {
  const { i, count, w, h, rng, jitter } = ctx;
  const n = 6;
  const rail = i % n;
  const x = ((rail + 0.5) / n) * w;
  const t = count > 1 ? i / (count - 1) : 0.5;
  return { x: x + (rng() - 0.5) * jitter, y: t * h + (rng() - 0.5) * jitter, t };
}

// Field cache keyed by grid identity: stepGrid() returns a new array each
// tick, so identity is exactly the right key — one blur per grid, not one
// per placement (the old aliveCells() call was O(n) inside an O(n) loop).
//
// WeakMap (not a single module slot) so concurrent evaluate() / Worker
// callers with different grids cannot stomp each other. GC drops entries
// when a grid is no longer referenced.
const _caFieldByGrid = new WeakMap();
function caFieldFor(caGrid) {
  if (!caGrid) return null;
  let field = _caFieldByGrid.get(caGrid);
  if (!field) {
    field = makeCaField(caGrid, { softness: 1 });
    _caFieldByGrid.set(caGrid, field);
  }
  return field;
}

/**
 * K3 (#62): density sampling against a soft CA mask.
 *
 * AC1 — CA mode uses the *field*, not a sorted-cell mapping. The previous
 * `cells[i % cells.length]` was a round-robin over a list whose order and
 * length changed on every CA tick, so placement i had no stable identity.
 * Rejection sampling makes position a function of (seed, i, field) only.
 */
function ca(ctx) {
  const { i, w, h, rng, jitter, caGrid, seed, seedOffsets } = ctx;
  if (!caGrid) return random(ctx);
  const field = caFieldFor(caGrid);
  const p = sampleFieldPoint(field, seed, i, { channel: 'ca', seedOffsets });
  return {
    x: p.x * w + (rng() - 0.5) * jitter,
    y: p.y * h + (rng() - 0.5) * jitter,
  };
}

/**
 * #587 — Voronoi-masked scatter: dense clusters separated by empty veins.
 * Cracked mud, agar colonies — negative space with intent.
 *
 * Same shape as `ca` above (rejection sampling against a mask) but the mask is
 * generated, not observed: a hashed set of cell centres, and the "veins" are
 * the Voronoi BOUNDARIES between them. A point is in a vein when the distance
 * to its nearest centre and its second-nearest are close — that set is exactly
 * the cracks — so rejecting it leaves the interiors dense and the seams empty.
 * Unlike `ca` this needs no live grid, so it is independent of the CA tick.
 *
 * Measured at the authored constants: veins are ~33% of the plate and a point
 * is placed in 1.5 attempts on average.
 */
const VORONOI_CELLS = 14;
const VORONOI_VEIN = 0.04;   // unit-space half-width of the empty seam
const VORONOI_ATTEMPTS = 24; // hard cap — see below

// Centres are pure in (seed, spatial offset), so they are cached rather than
// rebuilt per point. A small Map, not one slot: concurrent evaluate()/Worker
// callers with different seeds would otherwise evict each other every call.
const _voronoiCentres = new Map();
function voronoiCentres(seed, seedOffsets) {
  const key = `${seed >>> 0}:${(seedOffsets && seedOffsets.spatial) || 0}`;
  let pts = _voronoiCentres.get(key);
  if (!pts) {
    pts = new Float64Array(VORONOI_CELLS * 2);
    for (let k = 0; k < VORONOI_CELLS; k++) {
      pts[k * 2] = hashU01(seed, 'voronoi', k * 2, seedOffsets);
      pts[k * 2 + 1] = hashU01(seed, 'voronoi', k * 2 + 1, seedOffsets);
    }
    if (_voronoiCentres.size > 8) _voronoiCentres.clear();
    _voronoiCentres.set(key, pts);
  }
  return pts;
}

/** Gap between the nearest and second-nearest centre: small = on a seam. */
function voronoiGap(pts, x, y) {
  let d1 = Infinity;
  let d2 = Infinity;
  for (let k = 0; k < VORONOI_CELLS; k++) {
    const dx = x - pts[k * 2];
    const dy = y - pts[k * 2 + 1];
    const d = dx * dx + dy * dy;
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
  }
  return Math.sqrt(d2) - Math.sqrt(d1);
}

function voronoi(ctx) {
  const { i, w, h, rng, jitter, seed, seedOffsets } = ctx;
  const pts = voronoiCentres(seed, seedOffsets);
  // Its own stream, so the mask draws do not consume ctx.rng and shift every
  // other per-item draw (the same discipline sampleFieldPoint follows).
  const r = rngForIndex(seed, 'voronoi', i, seedOffsets);
  let bestX = 0.5;
  let bestY = 0.5;
  let bestGap = -1;
  for (let k = 0; k < VORONOI_ATTEMPTS; k++) {
    const x = r();
    const y = r();
    const gap = voronoiGap(pts, x, y);
    if (gap >= VORONOI_VEIN) {
      return { x: x * w + (rng() - 0.5) * jitter, y: y * h + (rng() - 0.5) * jitter };
    }
    if (gap > bestGap) { bestGap = gap; bestX = x; bestY = y; }
  }
  // Graceful degradation, never a hang: the cap is hard, and on exhaustion we
  // keep the least-bad candidate (furthest from a seam) rather than looping or
  // returning nothing. The sampler ABI has to return a point, so "fewer
  // points" is not available here — this is the honest equivalent.
  return { x: bestX * w + (rng() - 0.5) * jitter, y: bestY * h + (rng() - 0.5) * jitter };
}

function orbit(ctx) {
  const { i, count, w, h, rng, seed } = ctx;
  const planets = [
    { cx: w * 0.28, cy: h * 0.35, r: Math.min(w, h) * 0.22, speed: 1.0 },
    { cx: w * 0.68, cy: h * 0.55, r: Math.min(w, h) * 0.28, speed: 0.7 },
    { cx: w * 0.48, cy: h * 0.75, r: Math.min(w, h) * 0.18, speed: 1.3 },
  ];
  const p = planets[i % 3];
  const angle = (i / count) * Math.PI * 2 * p.speed + (seed & 0xff) * 0.01;
  const radJitter = rng() * p.r * 0.3;
  return {
    x: p.cx + Math.cos(angle) * (p.r + radJitter),
    y: p.cy + Math.sin(angle) * (p.r + radJitter),
  };
}

function abacus(ctx) {
  const { i, count, w, h, rng, seed } = ctx;
  const rows = 8;
  const row = i % rows;
  const beadsPerRow = Math.ceil(count / rows);
  const beadIndex = Math.floor(i / rows);
  const y = ((row + 0.5) / rows) * h;
  const x = ((beadIndex + 0.5) / beadsPerRow) * w;
  const ghostOffset = ((seed >> (row * 2)) & 3) * 6 - 9;
  return { x: x + ghostOffset, y: y + (rng() - 0.5) * 4 };
}

/**
 * Power sampler: jittered stratified grid — even coverage, seed-stable.
 * One point per stratum cell; uniform sample inside cell (blue-noise-ish).
 */
function stratified(ctx) {
  const { i, count, w, h, rng } = ctx;
  const cols = Math.ceil(Math.sqrt(count * (w / h)));
  const rows = Math.ceil(count / cols);
  const col = i % cols;
  const row = Math.floor(i / cols);
  if (row >= rows) {
    // overflow indices: fall back to random in bounds
    return { x: rng() * w, y: rng() * h };
  }
  const cellW = w / cols;
  const cellH = h / rows;
  const x = (col + rng()) * cellW;
  const y = (row + rng()) * cellH;
  return {
    x: Math.min(w - 1e-6, Math.max(0, x)),
    y: Math.min(h - 1e-6, Math.max(0, y)),
  };
}

registerSampler('random', random);
registerSampler('grid', grid);
registerSampler('fibonacci', fibonacci);
registerSampler('radial', radial);
registerSampler('swarm', swarm);
registerSampler('flow', flow);
registerSampler('layers', layers);
registerSampler('rails', rails);
registerSampler('ca', ca);
registerSampler('voronoi', voronoi);
registerSampler('orbit', orbit);
registerSampler('abacus', abacus);
registerSampler('noise', grid); // grid base; displacement warps in orchestrator
registerSampler('hype', swarm);
registerSampler('murmuration', swarm); // #280 — voice over the swarm engine
registerSampler('stratified', stratified);

export {
  random,
  grid,
  fibonacci,
  radial,
  swarm,
  flow,
  layers,
  rails,
  ca,
  voronoi,
  orbit,
  abacus,
  stratified,
};
