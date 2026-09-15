// Kernel K2 — sampler registry (#60)
// Sampler: (ctx) => { x, y, t? }
// ctx: { i, count, w, h, rng, jitter, seed, caGrid }
// Pure; no React. Jitter/bleed/displacement applied in placement orchestrator optional —
// legacy modes still apply their own jitter for visual parity.

import { makeCaField, sampleFieldPoint } from '../field/index.js';

/** @typedef {{ i: number, count: number, w: number, h: number, rng: () => number, jitter: number, seed: number, caGrid?: unknown }} SampleCtx */

/** @type {Record<string, (ctx: SampleCtx) => { x: number, y: number, t?: number }>} */
export const SAMPLERS = {};

export function registerSampler(id, fn) {
  SAMPLERS[id] = fn;
}

export function getSampler(mode) {
  return SAMPLERS[mode] || SAMPLERS.random;
}

export function listSamplers() {
  return Object.keys(SAMPLERS);
}

// ── Legacy mode adapters (same math as placement/modes.js) ─────

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
let _caFieldGrid = null;
let _caField = null;
function caFieldFor(caGrid) {
  if (_caFieldGrid !== caGrid) {
    _caFieldGrid = caGrid;
    _caField = makeCaField(caGrid, { softness: 1 });
  }
  return _caField;
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
  const { i, w, h, rng, jitter, caGrid, seed } = ctx;
  if (!caGrid) return random(ctx);
  const field = caFieldFor(caGrid);
  const p = sampleFieldPoint(field, seed, i, { channel: 'ca' });
  return {
    x: p.x * w + (rng() - 0.5) * jitter,
    y: p.y * h + (rng() - 0.5) * jitter,
  };
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
registerSampler('orbit', orbit);
registerSampler('abacus', abacus);
registerSampler('noise', grid); // grid base; displacement warps in orchestrator
registerSampler('hype', swarm);
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
  orbit,
  abacus,
  stratified,
};
