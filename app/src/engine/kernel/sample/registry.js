// Kernel K2 — sampler registry (#60)
// Sampler: (ctx) => { x, y, t? }
// ctx: { i, count, w, h, rng, jitter, seed, caGrid }
// Pure; no React. Jitter/bleed/displacement applied in placement orchestrator optional —
// legacy modes still apply their own jitter for visual parity.

import { makeCaField, sampleFieldPoint } from '../field/index.js';
import { CH, hashU01 } from '../rng.js';

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
 * #588 — L-system growth: branching fronds that fork, fork again, and stop.
 *
 * No other sampler does TOPOLOGY. Every one above answers "where is point i";
 * this one grows a structure and then reads points off it, so the points know
 * which branch they are on.
 *
 * CANONICAL RULE SET — three rules, picked by a seed hash on CH.geo. They are
 * pinned as a golden (see the selfcheck) so the plate demo is reproducible from
 * a single seed rather than found by rolling seeds until something symmetric
 * appears. Each is axiom "F" under one production; '+'/'-' turn, '[' / ']'
 * push and pop the turtle.
 *
 * BOUND — depth is capped at LSYS_MAX_DEPTH (5). Worst case is `bush` at 5:
 * 3,125 segments, generated ONCE per (seed, depth, angle) and cached. At most
 * `count` of them are ever read, and count is itself capped at 800 by the
 * quality caps, so the walk can never outgrow the placement budget. Expansion
 * also stops early if a string would exceed the segment budget, so a future
 * rule with a larger branching factor degrades to a shallower plant rather
 * than to a hang.
 *
 * `t` is the branch nesting depth, normalised — the fork-fork-stop arc. It
 * feeds `band` colouring directly, so branch order reads as colour, and a
 * phrase riding t reveals growth in the order it grew.
 */
const LSYS_RULES = [
  { name: 'bush', rule: 'F[+F]F[-F]F' },
  { name: 'frond', rule: 'FF[+F][-F]' },
  { name: 'plate', rule: 'F[+F][-F]F' },
];
const LSYS_MAX_DEPTH = 5;
const LSYS_MAX_SEGMENTS = 4096;
const LSYS_BRANCH_SCALE = 0.62;

/** Expand the axiom, stopping early rather than exceeding the segment budget. */
function lsystemString(rule, depth) {
  let s = 'F';
  for (let g = 0; g < depth; g++) {
    const next = s.replace(/F/g, rule);
    if ((next.match(/F/g) || []).length > LSYS_MAX_SEGMENTS) break;
    s = next;
  }
  return s;
}

/** Walk the string with a turtle; one point per segment, plus its branch depth. */
function lsystemWalk(str, angleDeg) {
  const turn = angleDeg * Math.PI / 180;
  let x = 0; let y = 0; let a = -Math.PI / 2; // grow upward
  let depth = 0;
  let maxDepth = 0;
  const stack = [];
  const xs = []; const ys = []; const ds = [];
  for (let k = 0; k < str.length; k++) {
    switch (str[k]) {
      case 'F': {
        // Segments shorten with branch depth: a LOOK choice, not a
        // correctness one. Measured, it changes no topology at all (identical
        // distinct-point counts either way) — it is what makes the plant read
        // as a frond, with a trunk and finer twigs, instead of a lattice of
        // equal-length struts.
        const step = Math.pow(LSYS_BRANCH_SCALE, depth);
        x += Math.cos(a) * step; y += Math.sin(a) * step;
        xs.push(x); ys.push(y); ds.push(depth);
        break;
      }
      case '+': a += turn; break;
      case '-': a -= turn; break;
      case '[': stack.push([x, y, a, depth]); depth++; if (depth > maxDepth) maxDepth = depth; break;
      case ']': if (stack.length) { const p = stack.pop(); x = p[0]; y = p[1]; a = p[2]; depth = p[3]; } break;
      default: break;
    }
  }
  return { xs, ys, ds, maxDepth };
}

// Cached per (seed, depth, angle): the walk is a one-time cost, not per point.
// A small Map rather than one slot, for the same reentrancy reason as the CA
// field cache and the Voronoi centres.
const _lsysCache = new Map();
function lsystemPlant(seed, seedOffsets, depth, angleDeg) {
  const off = (seedOffsets && seedOffsets.spatial) || 0;
  const key = `${seed >>> 0}:${off}:${depth}:${angleDeg}`;
  let plant = _lsysCache.get(key);
  if (!plant) {
    const pick = LSYS_RULES[Math.floor(hashU01(seed, CH.geo, 0x15e5, seedOffsets) * LSYS_RULES.length) % LSYS_RULES.length];
    const walk = lsystemWalk(lsystemString(pick.rule, depth), angleDeg);
    // Normalise the plant into the unit box, preserving aspect so a frond
    // stays a frond rather than being stretched to fill the plate.
    let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
    for (let k = 0; k < walk.xs.length; k++) {
      if (walk.xs[k] < minX) minX = walk.xs[k];
      if (walk.xs[k] > maxX) maxX = walk.xs[k];
      if (walk.ys[k] < minY) minY = walk.ys[k];
      if (walk.ys[k] > maxY) maxY = walk.ys[k];
    }
    const span = Math.max(maxX - minX, maxY - minY) || 1;
    const ox = (maxX + minX) / 2;
    const oy = (maxY + minY) / 2;
    const ux = new Float64Array(walk.xs.length);
    const uy = new Float64Array(walk.ys.length);
    const ut = new Float64Array(walk.ds.length);
    for (let k = 0; k < walk.xs.length; k++) {
      ux[k] = 0.5 + (walk.xs[k] - ox) / span;
      uy[k] = 0.5 + (walk.ys[k] - oy) / span;
      ut[k] = walk.maxDepth > 0 ? walk.ds[k] / walk.maxDepth : 0;
    }
    plant = { ux, uy, ut, rule: pick.name, n: ux.length };
    if (_lsysCache.size > 8) _lsysCache.clear();
    _lsysCache.set(key, plant);
  }
  return plant;
}

function lsystem(ctx) {
  const { i, w, h, rng, jitter, seed, seedOffsets, lsysDepth, lsysAngle } = ctx;
  const depth = Math.min(LSYS_MAX_DEPTH, Math.max(1, Math.round(Number(lsysDepth) || 4)));
  const angle = Number.isFinite(lsysAngle) ? lsysAngle : 25;
  const plant = lsystemPlant(seed, seedOffsets, depth, angle);
  if (!plant.n) return random(ctx);
  const k = i % plant.n;
  const fit = Math.min(w, h) * 0.92;
  return {
    x: w / 2 + (plant.ux[k] - 0.5) * fit + (rng() - 0.5) * jitter,
    y: h / 2 + (plant.uy[k] - 0.5) * fit + (rng() - 0.5) * jitter,
    t: plant.ut[k],
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
registerSampler('lsystem', lsystem);
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
  lsystem,
  orbit,
  abacus,
  stratified,
};
