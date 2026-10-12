// Kernel K2 — sampler registry (#60); declared entries (#1183 dish contract).
// Sampler: (ctx) => { x, y, t? }
// ctx: { i, count, w, h, rng, jitter, seed, caGrid }
// Pure; no React. Jitter/bleed/displacement applied in placement orchestrator optional —
// legacy modes still apply their own jitter for visual parity.
//
// #1309 — the ctx gains an OPTIONAL column-writing mode: when ctx.out is
// set ({ x, y, t, rot01 } Float64Array lanes + ctx.row), the sampler writes
// its lanes directly at ctx.row and returns undefined — no per-point
// {x, y} object. t/rot01 lanes arrive NaN-filled; a sampler that produces
// them overwrites the sentinel, others leave it. Samplers that don't
// implement the mode keep the legacy {x, y, t?} return and the orchestrator
// adapts them (unpacks into the lanes). See sample/columns.js.
//
// Every sampler declares, at registration: id, family ('sampler'), reads,
// writes, costTier — the dish contract's module shape. Two call shapes:
//   registerSampler(id, fn) — legacy; the declaration is filled with
//     reads ['seed'], writes ['points'], costTier 0 (structural: placement
//     is init-time CPU, never shed).
//   registerSampler({ id, reads, writes, costTier, fn }) — declared.

import { createRegistry } from '../registry.js';
import { makeCaField, sampleFieldPoint } from '../field/index.js';
import { CH, hashU01, hashU32, rngForIndex } from '../rng.js';
import { sampleGrowthPoint } from './growth.js'; // #720 — DLA / Eden growth
import { poisson } from './poisson.js'; // #1193 — Poisson-disc blue noise
import { gaussian } from './gaussian.js'; // #1194 — Gaussian cluster mixture
import { circlepack } from './circlepack.js'; // #1195 — circle packing
import { voronoiCells } from './voronoiCells.js'; // #1196 — true Voronoi cells
import { createNoise } from '../../noise.js';
import { makeSmallCache } from '../cache.js'; // #1243 — one cache discipline
import { writeSampleColumns } from './columns.js'; // #1309 — column-writing protocol
import { recordSamplerFallback } from '../tracks/patchDiag.mjs'; // #1245 — fallback diagnostic channel

/** @typedef {{ i: number, count: number, w: number, h: number, rng: () => number, jitter: number, seed: number, caGrid?: unknown, out?: { x: Float64Array, y: Float64Array, t: Float64Array, rot01: Float64Array } | null, row?: number }} SampleCtx */

const _reg = createRegistry('sampler', {
  payloadKey: 'fn',
  defaults: { reads: ['seed'], writes: ['points'], costTier: 0 },
});

export function registerSampler(idOrDecl, fn) {
  if (typeof idOrDecl === 'string') {
    // Legacy shape — the compatibility shim. Zero breakage: the declaration
    // is filled with the sampler defaults.
    return _reg.register({ id: idOrDecl, fn });
  }
  return _reg.register(idOrDecl);
}

// #1245 — once per (layer, mode) per session. getSampler runs once per
// computeGeometrySoA (not per point), but without this a live canvas would
// still report the same miss on every geometry rebuild of that layer.
const _fallbackReported = new Set();

export function getSampler(mode, layerId) {
  // Map-backed: `get('__proto__')` is simply undefined, so the poisoned-mode
  // vector the old Object.hasOwn guard defended against (#106) is gone
  // structurally. Unknown modes still fall back to `random` — the second
  // line of defence for callers that assemble layoutParams themselves.
  const decl = _reg.get(mode);
  if (decl && typeof decl.fn === 'function') return decl.fn;
  // #1245 — the fallback itself is KEPT (old projects must not break, and the
  // function returned here is byte-identical), but the miss is now visible:
  // it is recorded once per (layer, mode) into the patch-diagnostic channel
  // (#1246) so the instrument can show it, plus a single console.warn for
  // studio/batch runs with no panel attached.
  const key = `${String(layerId ?? '?')}::${String(mode)}`;
  if (!_fallbackReported.has(key)) {
    _fallbackReported.add(key);
    recordSamplerFallback(layerId, mode);
    console.warn(`[kernel] unknown sampler mode "${String(mode)}" — falling back to 'random'`);
  }
  return _reg.get('random').fn;
}

/** The full declaration for a sampler id, or undefined when undeclared. */
export function getSamplerDecl(mode) {
  return _reg.get(mode);
}

export function listSamplers() {
  return _reg.list();
}

// ── Legacy mode adapters (same math as the retired placement/modes.js) ─────

function random(ctx) {
  const { w, h, rng } = ctx;
  const x = rng() * w;
  const y = rng() * h;
  if (writeSampleColumns(ctx, x, y)) return; // #1309 — column mode
  return { x, y };
}

function grid(ctx) {
  const { i, count, w, h, rng, jitter } = ctx;
  const cols = Math.ceil(Math.sqrt(count * (w / h)));
  const rows = Math.ceil(count / cols);
  const cx = ((i % cols) + 0.5) / cols * w;
  const cy = (Math.floor(i / cols) + 0.5) / rows * h;
  const x = cx + (rng() - 0.5) * jitter;
  const y = cy + (rng() - 0.5) * jitter;
  if (writeSampleColumns(ctx, x, y)) return; // #1309 — column mode
  return { x, y };
}

function fibonacci(ctx) {
  const { i, count, w, h, rng, jitter } = ctx;
  const phi = (1 + Math.sqrt(5)) / 2;
  const angle = 2 * Math.PI * i / (phi * phi);
  const radius = Math.sqrt(i / count) * Math.min(w, h) * 0.48;
  const cx = w / 2 + Math.cos(angle) * radius;
  const cy = h / 2 + Math.sin(angle) * radius;
  const x = cx + (rng() - 0.5) * jitter;
  const y = cy + (rng() - 0.5) * jitter;
  if (writeSampleColumns(ctx, x, y)) return; // #1309 — column mode
  return { x, y };
}

/**
 * #585 — phyllotaxis: the golden-angle family, with the divergence exposed.
 *
 * `fibonacci` above is one fixed point of this family (Vogel's disc at exactly
 * 2*pi/phi^2). Phyllotaxis is its sibling, not a duplicate: it places on the
 * same rule and lets the divergence angle move, which is the only knob that
 * changes the PARASTICHY — the count of visible spiral arms. At the golden
 * angle the arms land on consecutive Fibonacci numbers (measured: 34, then 21
 * and 55); a fraction of a degree off and the eye counts a different family.
 *
 * `phylloDivergence` is therefore an OFFSET in degrees from the golden angle,
 * default 0 — so at defaults this sampler is bit-identical to `fibonacci`
 * (same expression, plus i*0), and the two really are siblings rather than two
 * near-miss discs. The radius law is Vogel's sqrt(i/count), shared for the
 * same reason.
 */
const PHYLLO_PHI = (1 + Math.sqrt(5)) / 2;
const DEG = Math.PI / 180;

function phyllotaxis(ctx) {
  const { i, count, w, h, rng, jitter, phylloDivergence } = ctx;
  const off = Number.isFinite(phylloDivergence) ? phylloDivergence : 0;
  // Written as fibonacci's own expression plus the offset term so that at
  // off = 0 the addition is exactly + 0 and the result is bit-identical.
  const angle = 2 * Math.PI * i / (PHYLLO_PHI * PHYLLO_PHI) + i * off * DEG;
  const radius = Math.sqrt(i / count) * Math.min(w, h) * 0.48;
  const cx = w / 2 + Math.cos(angle) * radius;
  const cy = h / 2 + Math.sin(angle) * radius;
  const x = cx + (rng() - 0.5) * jitter;
  const y = cy + (rng() - 0.5) * jitter;
  if (writeSampleColumns(ctx, x, y)) return; // #1309 — column mode
  return { x, y };
}

/**
 * #586 — Truchet: every cell makes the same small decision and a maze appears
 * that no one authored.
 *
 * TILE SET — two-arc Smith tiles, stated because it decides the character
 * completely. Each cell carries TWO quarter-arcs of radius half a cell,
 * centred on opposite corners, so every tile meets all four edge midpoints and
 * arcs always join across a shared edge. The cell's one bit picks which
 * diagonal pair of corners: that is the whole decision, and the winding maze is
 * what emerges from many of them. (The alternative four-way/diagonal-slash set
 * gives hard chevrons instead of continuous curve — a different piece.)
 *
 * Grid places points; Truchet ORIENTS them. `grid` drops one point in the
 * middle of each cell; this walks points ALONG the cell's arcs, which is why
 * it is not a duplicate of it.
 *
 * Orientation is drawn per CELL, off CH.geo keyed by the cell index — not from
 * ctx.rng, which is a per-ITEM stream: several items share a cell and every one
 * of them has to agree on which way that tile turns, or the arcs break apart.
 */
const TRUCHET_PER_CELL = 4;

function truchet(ctx) {
  const { i, count, w, h, rng, jitter, seed, seedOffsets } = ctx;
  const cellCount = Math.max(1, Math.ceil(count / TRUCHET_PER_CELL));
  const cols = Math.max(1, Math.ceil(Math.sqrt(cellCount * (w / h))));
  const rows = Math.max(1, Math.ceil(cellCount / cols));
  const cell = Math.floor(i / TRUCHET_PER_CELL) % (cols * rows);
  const col = cell % cols;
  const row = Math.floor(cell / cols);
  const cw = w / cols;
  const ch = h / rows;
  // The cell's one decision.
  const flip = hashU01(seed, CH.geo, 0x7c0000 + cell, seedOffsets) < 0.5;
  // Which of the tile's two arcs this item rides, and how far along it.
  const k = i % TRUCHET_PER_CELL;
  const half = TRUCHET_PER_CELL >> 1;
  const second = k >= half;
  const along = ((k % half) + rng()) / half;          // 0..1 along the quarter
  const ang = along * Math.PI * 0.5;
  // Corner the arc is centred on, in unit-cell coords.
  const ax = second ? (flip ? 0 : 1) : (flip ? 1 : 0);
  const ay = second ? 1 : 0;
  const ux = ax + (ax === 0 ? 0.5 * Math.cos(ang) : -0.5 * Math.cos(ang));
  const uy = ay + (ay === 0 ? 0.5 * Math.sin(ang) : -0.5 * Math.sin(ang));
  const x = (col + ux) * cw + (rng() - 0.5) * jitter;
  const y = (row + uy) * ch + (rng() - 0.5) * jitter;
  if (writeSampleColumns(ctx, x, y)) return; // #1309 — column mode
  return { x, y };
}

function radial(ctx) {
  const { i, count, w, h, rng, jitter } = ctx;
  const rings = Math.ceil(Math.sqrt(count));
  const ring = Math.floor(i / rings);
  const seg = i % rings;
  const angle = (seg / rings) * Math.PI * 2 + ring * 0.3;
  const radius = ((ring + 1) / rings) * Math.min(w, h) * 0.44;
  const x = w / 2 + Math.cos(angle) * radius + (rng() - 0.5) * jitter;
  const y = h / 2 + Math.sin(angle) * radius + (rng() - 0.5) * jitter;
  if (writeSampleColumns(ctx, x, y)) return; // #1309 — column mode
  return { x, y };
}

function swarm(ctx) {
  const { w, h, rng, jitter } = ctx;
  const cx = w * (0.3 + rng() * 0.4);
  const cy = h * (0.3 + rng() * 0.4);
  const spread = Math.min(w, h) * 0.35;
  const x = cx + (rng() - 0.5) * spread + (rng() - 0.5) * jitter;
  const y = cy + (rng() - 0.5) * spread + (rng() - 0.5) * jitter;
  if (writeSampleColumns(ctx, x, y)) return; // #1309 — column mode
  return { x, y };
}

function flow(ctx) {
  const { i, count, w, h, rng, jitter } = ctx;
  const t = count > 1 ? i / (count - 1) : 0.5;
  const bx = t * w;
  const wave = Math.sin(t * Math.PI * 3 + rng() * 2) * h * 0.3;
  const x = bx + (rng() - 0.5) * jitter;
  const y = h / 2 + wave + (rng() - 0.5) * jitter;
  if (writeSampleColumns(ctx, x, y, t)) return; // #1309 — column mode
  return { x, y, t };
}

function layers(ctx) {
  const { i, w, h, rng, jitter } = ctx;
  const n = 5;
  const layer = i % n;
  const y = ((layer + 0.5) / n) * h;
  const x = rng() * w;
  const yy = y + (rng() - 0.5) * jitter;
  if (writeSampleColumns(ctx, x, yy)) return; // #1309 — column mode
  return { x, y: yy };
}

function rails(ctx) {
  const { i, count, w, h, rng, jitter } = ctx;
  const n = 6;
  const rail = i % n;
  const x = ((rail + 0.5) / n) * w;
  const t = count > 1 ? i / (count - 1) : 0.5;
  const xx = x + (rng() - 0.5) * jitter;
  const y = t * h + (rng() - 0.5) * jitter;
  if (writeSampleColumns(ctx, xx, y, t)) return; // #1309 — column mode
  return { x: xx, y, t };
}

// Field cache keyed by grid identity: stepGrid() returns a new array each
// tick, so identity is exactly the right key — one blur per grid, not one
// per placement (the old aliveCells() call was O(n) inside an O(n) loop).
//
// WeakMap (not a single module slot) so concurrent evaluate() / Worker
// callers with different grids cannot stomp each other. GC drops entries
// when a grid is no longer referenced. NOT covered by the #1243 cache
// helper on purpose: a size-capped Map would pin grid keys and leak.
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
  const { i, w, h, rng, jitter, caGrid, seed, seedOffsets, scratch } = ctx;
  if (!caGrid) return random(ctx);
  const field = caFieldFor(caGrid);
  // #1250 — scratch is the placement call's reseedable stream (bit-identical
  // to rngForIndex); undefined for direct sampler callers, which fall back.
  const p = sampleFieldPoint(field, seed, i, { channel: 'ca', seedOffsets, scratch });
  const x = p.x * w + (rng() - 0.5) * jitter;
  const y = p.y * h + (rng() - 0.5) * jitter;
  if (writeSampleColumns(ctx, x, y)) return; // #1309 — column mode
  return { x, y };
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
// rebuilt per point. A small cache, not one slot: concurrent evaluate()/Worker
// callers with different seeds would otherwise evict each other every call.
// #1243: shared cap + evict-oldest discipline (see kernel/cache.js).
const _voronoiCentres = makeSmallCache(8);
function voronoiCentres(seed, seedOffsets) {
  const key = `${seed >>> 0}:${(seedOffsets && seedOffsets.spatial) || 0}`;
  let pts = _voronoiCentres.get(key);
  if (!pts) {
    pts = new Float64Array(VORONOI_CELLS * 2);
    for (let k = 0; k < VORONOI_CELLS; k++) {
      pts[k * 2] = hashU01(seed, 'voronoi', k * 2, seedOffsets);
      pts[k * 2 + 1] = hashU01(seed, 'voronoi', k * 2 + 1, seedOffsets);
    }
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
  const { i, w, h, rng, jitter, seed, seedOffsets, scratch } = ctx;
  const pts = voronoiCentres(seed, seedOffsets);
  // Its own stream, so the mask draws do not consume ctx.rng and shift every
  // other per-item draw (the same discipline sampleFieldPoint follows).
  // #1250 — one scratch stream per placement call, reseeded per index:
  // bit-identical to rngForIndex, without the per-point allocation.
  // Undefined for direct sampler callers, which fall back to rngForIndex.
  const r = scratch
    ? scratch.reseed(seed, 'voronoi', i, seedOffsets).draw
    : rngForIndex(seed, 'voronoi', i, seedOffsets);
  let bestX = 0.5;
  let bestY = 0.5;
  let bestGap = -1;
  for (let k = 0; k < VORONOI_ATTEMPTS; k++) {
    const x = r();
    const y = r();
    const gap = voronoiGap(pts, x, y);
    if (gap >= VORONOI_VEIN) {
      const px = x * w + (rng() - 0.5) * jitter;
      const py = y * h + (rng() - 0.5) * jitter;
      if (writeSampleColumns(ctx, px, py)) return; // #1309 — column mode
      return { x: px, y: py };
    }
    if (gap > bestGap) { bestGap = gap; bestX = x; bestY = y; }
  }
  // Graceful degradation, never a hang: the cap is hard, and on exhaustion we
  // keep the least-bad candidate (furthest from a seam) rather than looping or
  // returning nothing. The sampler ABI has to return a point, so "fewer
  // points" is not available here — this is the honest equivalent.
  const fx = bestX * w + (rng() - 0.5) * jitter;
  const fy = bestY * h + (rng() - 0.5) * jitter;
  if (writeSampleColumns(ctx, fx, fy)) return; // #1309 — column mode
  return { x: fx, y: fy };
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
function expandLsystem(axiom, rule, depth) {
  let s = axiom;
  for (let d = 0; d < depth; d++) {
    let next = '';
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      next += c === 'F' ? rule : c;
      if (next.length > LSYS_MAX_SEGMENTS) return next.slice(0, LSYS_MAX_SEGMENTS);
    }
    s = next;
  }
  return s;
}

// Turtle walk → segments. Cached by (seed, depth, angle) so the plant is
// built once per placement call, not once per point.
const _lsysCache = makeSmallCache(8);
function lsysSegments(seed, depth, angleDeg, seedOffsets) {
  const key = `${seed >>> 0}:${depth}:${angleDeg}:${(seedOffsets && seedOffsets.spatial) || 0}`;
  let segs = _lsysCache.get(key);
  if (segs) return segs;
  const rule = LSYS_RULES[hashU32(seed, CH.geo, 0x1e0000, seedOffsets) % LSYS_RULES.length];
  const expanded = expandLsystem('F', rule.rule, Math.min(depth, LSYS_MAX_DEPTH));
  // Walk the turtle.
  const segsOut = [];
  let x = 0, y = 0, a = -Math.PI / 2, len = 1, depthNow = 0;
  const stack = [];
  const ang = angleDeg * Math.PI / 180;
  for (let i = 0; i < expanded.length; i++) {
    const c = expanded[i];
    if (c === 'F') {
      const nx = x + Math.cos(a) * len;
      const ny = y + Math.sin(a) * len;
      segsOut.push({ x, y, nx, ny, depth: depthNow });
      x = nx; y = ny;
    } else if (c === '+') a += ang;
    else if (c === '-') a -= ang;
    else if (c === '[') { stack.push({ x, y, a, len, depthNow }); len *= LSYS_BRANCH_SCALE; depthNow++; }
    else if (c === ']') {
      const top = stack.pop();
      if (top) { x = top.x; y = top.y; a = top.a; len = top.len; depthNow = top.depth; }
    }
    if (segsOut.length >= LSYS_MAX_SEGMENTS) break;
  }
  _lsysCache.set(key, segsOut);
  return segsOut;
}

function lsystem(ctx) {
  const { i, count, w, h, rng, jitter, seed, seedOffsets, lsysDepth, lsysAngle } = ctx;
  const depth = Number.isFinite(lsysDepth) ? lsysDepth : 4;
  const ang = Number.isFinite(lsysAngle) ? lsysAngle : 25;
  const segs = lsysSegments(seed, depth, ang, seedOffsets);
  if (!segs.length) return random(ctx);
  const seg = segs[i % segs.length];
  const along = rng();
  const px = seg.x + (seg.nx - seg.x) * along;
  const py = seg.y + (seg.ny - seg.y) * along;
  // Fit to plate: the plant is built in unit space around the origin.
  const scale = Math.min(w, h) * 0.42;
  const x = w / 2 + px * scale + (rng() - 0.5) * jitter;
  const y = h / 2 + py * scale + (rng() - 0.5) * jitter;
  const t = segs.length > 1 ? seg.depth / Math.max(1, depth) : 0;
  if (writeSampleColumns(ctx, x, y, t)) return; // #1309 — column mode
  return { x, y, t };
}

// ── Growth samplers (#720) ──

function dla(ctx) {
  const { i, count, w, h, rng, jitter, seed, seedOffsets, growthTick, growthBranch } = ctx;
  const p = sampleGrowthPoint('dla', seed, i, count, { growthTick, growthBranch, seedOffsets });
  const x = p.x * w + (rng() - 0.5) * jitter;
  const y = p.y * h + (rng() - 0.5) * jitter;
  const t = p.t;
  if (writeSampleColumns(ctx, x, y, t)) return;
  return { x, y, t };
}

function eden(ctx) {
  const { i, count, w, h, rng, jitter, seed, seedOffsets, growthTick } = ctx;
  const p = sampleGrowthPoint('eden', seed, i, count, { growthTick, seedOffsets });
  const x = p.x * w + (rng() - 0.5) * jitter;
  const y = p.y * h + (rng() - 0.5) * jitter;
  const t = p.t;
  if (writeSampleColumns(ctx, x, y, t)) return;
  return { x, y, t };
}

// ── Remaining legacy + newer modes ──

function orbit(ctx) {
  const { i, count, w, h, rng, jitter } = ctx;
  const rings = Math.max(1, Math.ceil(Math.sqrt(count / 8)));
  const ring = Math.floor(i / 8);
  const seg = i % 8;
  const angle = (seg / 8) * Math.PI * 2 + ring * 0.4;
  const radius = ((ring + 1) / rings) * Math.min(w, h) * 0.42;
  const x = w / 2 + Math.cos(angle) * radius + (rng() - 0.5) * jitter;
  const y = h / 2 + Math.sin(angle) * radius + (rng() - 0.5) * jitter;
  if (writeSampleColumns(ctx, x, y)) return;
  return { x, y };
}

function abacus(ctx) {
  const { i, count, w, h, rng, jitter } = ctx;
  const rods = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rod = i % rods;
  const bead = Math.floor(i / rods);
  const x = ((rod + 0.5) / rods) * w;
  const y = ((bead + 0.5) / Math.ceil(count / rods)) * h;
  const xx = x + (rng() - 0.5) * jitter;
  const yy = y + (rng() - 0.5) * jitter;
  if (writeSampleColumns(ctx, xx, yy)) return;
  return { x: xx, y: yy };
}

function stratified(ctx) {
  const { i, count, w, h, rng, jitter } = ctx;
  const strata = 6;
  const s = i % strata;
  const x = rng() * w;
  const y = ((s + rng()) / strata) * h;
  const xx = x + (rng() - 0.5) * jitter;
  const yy = y + (rng() - 0.5) * jitter;
  if (writeSampleColumns(ctx, xx, yy)) return;
  return { x: xx, y: yy };
}

function noise(ctx) {
  const { i, count, w, h, rng, jitter, seed, noiseFreq } = ctx;
  const freq = Number.isFinite(noiseFreq) ? noiseFreq : 0.005;
  const n = createNoise(seed);
  const u = i / Math.max(1, count - 1);
  const x = u * w + n.noise2D(u * 40, 0.3) * 40;
  const y = h * 0.5 + n.noise2D(u * 40, 0.7) * h * 0.35;
  const xx = x + (rng() - 0.5) * jitter;
  const yy = y + (rng() - 0.5) * jitter;
  if (writeSampleColumns(ctx, xx, yy)) return;
  return { x: xx, y: yy };
}

function brush(ctx) {
  const { i, count, w, h, seed, seedOffsets, brushSize, brushSpacing, fieldScale, trailCount, wobbleAmp, wobbleFreq } = ctx;
  // Brush is a trail of stamps along a noise field. Simplified for the registry.
  const trails = Math.max(1, trailCount | 0);
  const trail = i % trails;
  const along = Math.floor(i / trails);
  const step = (brushSize || 24) * (brushSpacing || 0.5);
  const n = createNoise(seed);
  let x = (trail + 0.5) / trails * w;
  let y = h * 0.1;
  for (let s = 0; s < along; s++) {
    const a = n.noise2D(x * (fieldScale || 0.004), y * (fieldScale || 0.004)) * Math.PI * 2;
    x += Math.cos(a) * step;
    y += Math.sin(a) * step;
    if (wobbleAmp) {
      const wob = Math.sin(s * (wobbleFreq || 0.5)) * wobbleAmp;
      x += Math.cos(a + Math.PI / 2) * wob;
      y += Math.sin(a + Math.PI / 2) * wob;
    }
  }
  if (writeSampleColumns(ctx, x, y, undefined, along / Math.max(1, count))) return;
  return { x, y, rot01: along / Math.max(1, count) };
}

// ── Newer density samplers ──

function poissonSampler(ctx) {
  return poisson(ctx);
}
function gaussianSampler(ctx) {
  return gaussian(ctx);
}
function circlepackSampler(ctx) {
  return circlepack(ctx);
}
function voronoiCellsSampler(ctx) {
  return voronoiCells(ctx);
}

// ── Registrations ──

registerSampler({
  id: 'random',
  reads: ['w', 'h', 'rng'],
  writes: ['points'],
  costTier: 0,
  fn: random,
});
registerSampler({
  id: 'grid',
  reads: ['i', 'count', 'w', 'h', 'rng', 'jitter'],
  writes: ['points'],
  costTier: 0,
  fn: grid,
});
registerSampler({
  id: 'fibonacci',
  reads: ['i', 'count', 'w', 'h', 'rng', 'jitter'],
  writes: ['points'],
  costTier: 0,
  fn: fibonacci,
});
registerSampler({
  id: 'phyllotaxis',
  reads: ['i', 'count', 'w', 'h', 'rng', 'jitter', 'phylloDivergence'],
  writes: ['points'],
  costTier: 0,
  fn: phyllotaxis,
});
registerSampler({
  id: 'truchet',
  reads: ['i', 'count', 'w', 'h', 'rng', 'jitter', 'seed', 'seedOffsets'],
  writes: ['points'],
  costTier: 0,
  fn: truchet,
});
registerSampler({
  id: 'radial',
  reads: ['i', 'count', 'w', 'h', 'rng', 'jitter'],
  writes: ['points'],
  costTier: 0,
  fn: radial,
});
registerSampler({
  id: 'swarm',
  reads: ['w', 'h', 'rng', 'jitter'],
  writes: ['points'],
  costTier: 1,
  fn: swarm,
});
registerSampler({
  id: 'flow',
  reads: ['i', 'count', 'w', 'h', 'rng', 'jitter'],
  writes: ['points', 'points.t'],
  costTier: 1,
  fn: flow,
});
registerSampler({
  id: 'hype',
  reads: ['w', 'h', 'rng', 'jitter'],
  writes: ['points'],
  costTier: 1,
  fn: swarm, // hype reuses swarm placement; the organism engine owns the motion
});
registerSampler({
  id: 'murmuration',
  reads: ['w', 'h', 'rng', 'jitter'],
  writes: ['points'],
  costTier: 1,
  fn: swarm,
});
registerSampler({
  id: 'layers',
  reads: ['i', 'w', 'h', 'rng', 'jitter'],
  writes: ['points'],
  costTier: 0,
  fn: layers,
});
registerSampler({
  id: 'rails',
  reads: ['i', 'count', 'w', 'h', 'rng', 'jitter'],
  writes: ['points', 'points.t'],
  costTier: 0,
  fn: rails,
});
registerSampler({
  id: 'ca',
  reads: ['i', 'w', 'h', 'rng', 'jitter', 'caGrid', 'seed', 'seedOffsets'],
  writes: ['points'],
  costTier: 2,
  fn: ca,
});
registerSampler({
  id: 'voronoi',
  reads: ['i', 'w', 'h', 'rng', 'jitter', 'seed', 'seedOffsets'],
  writes: ['points'],
  costTier: 2,
  fn: voronoi,
});
registerSampler({
  id: 'lsystem',
  reads: ['i', 'count', 'w', 'h', 'rng', 'jitter', 'seed', 'seedOffsets', 'lsysDepth', 'lsysAngle'],
  writes: ['points', 'points.t'],
  costTier: 2,
  fn: lsystem,
});
registerSampler({
  id: 'dla',
  reads: ['i', 'count', 'w', 'h', 'rng', 'jitter', 'seed', 'seedOffsets', 'growthTick', 'growthBranch'],
  writes: ['points', 'points.t'],
  costTier: 2,
  fn: dla,
});
registerSampler({
  id: 'eden',
  reads: ['i', 'count', 'w', 'h', 'rng', 'jitter', 'seed', 'seedOffsets', 'growthTick'],
  writes: ['points', 'points.t'],
  costTier: 2,
  fn: eden,
});
registerSampler({
  id: 'orbit',
  reads: ['i', 'count', 'w', 'h', 'rng', 'jitter'],
  writes: ['points'],
  costTier: 0,
  fn: orbit,
});
registerSampler({
  id: 'abacus',
  reads: ['i', 'count', 'w', 'h', 'rng', 'jitter'],
  writes: ['points'],
  costTier: 0,
  fn: abacus,
});
registerSampler({
  id: 'stratified',
  reads: ['i', 'count', 'w', 'h', 'rng', 'jitter'],
  writes: ['points'],
  costTier: 0,
  fn: stratified,
});
registerSampler({
  id: 'noise',
  reads: ['i', 'count', 'w', 'h', 'rng', 'jitter', 'seed', 'noiseFreq'],
  writes: ['points'],
  costTier: 0,
  fn: noise,
});
registerSampler({
  id: 'brush',
  reads: ['i', 'count', 'w', 'h', 'seed', 'seedOffsets', 'brushSize', 'brushSpacing', 'fieldScale', 'trailCount', 'wobbleAmp', 'wobbleFreq'],
  writes: ['points', 'points.rot01'],
  costTier: 2,
  fn: brush,
});
registerSampler({
  // #1193 — tier 2: the disc is built once per (seed, plate, radius) and cached; a lookup per index.
  id: 'poisson',
  reads: ['i', 'count', 'w', 'h', 'seed', 'seedOffsets', 'poissonRadius'],
  writes: ['points'],
  costTier: 2,
  fn: poissonSampler,
});
registerSampler({
  // #1194 — tier 0: the mixture is pure hash math, no cache, no rejection loop.
  id: 'gaussian',
  reads: ['i', 'w', 'h', 'seed', 'seedOffsets', 'rng', 'jitter', 'gaussianSigma'],
  writes: ['points'],
  costTier: 0,
  fn: gaussianSampler,
});
registerSampler({
  // #1195 — tier 2: the packing is built once per (seed, plate, count, scale range) and cached; a lookup per index.
  id: 'circlepack',
  reads: ['i', 'count', 'w', 'h', 'seed', 'seedOffsets', 'zTiers', 'packScale'],
  writes: ['points'],
  costTier: 2,
  fn: circlepackSampler,
});
registerSampler({
  // #1196 — tier 2: Poisson seeds + nearest-cell rejection, cached seeds.
  id: 'voronoi-cells',
  reads: ['i', 'count', 'w', 'h', 'seed', 'seedOffsets', 'rng', 'jitter'],
  writes: ['points', 'points.t'],
  costTier: 2,
  fn: voronoiCellsSampler,
});

export {
  random,
  grid,
  fibonacci,
  phyllotaxis,
  truchet,
  radial,
  swarm,
  flow,
  layers,
  rails,
  ca,
  voronoi,
  lsystem,
  dla, // #720
  eden, // #720
  orbit,
  abacus,
  stratified,
  brush,
  poisson, // #1193
  gaussian, // #1194
  circlepack, // #1195
  voronoiCells, // #1196
};
