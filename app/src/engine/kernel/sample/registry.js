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
import { circlepack } from './circlepack.js'; // #1195 — circle packing
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
// A small cache rather than one slot, for the same reentrancy reason as the CA
// field cache and the Voronoi centres. #1243: cap + evict-oldest (see kernel/cache.js).
const _lsysCache = makeSmallCache(8);
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
  const t = plant.ut[k];
  const x = w / 2 + (plant.ux[k] - 0.5) * fit + (rng() - 0.5) * jitter;
  const y = h / 2 + (plant.uy[k] - 0.5) * fit + (rng() - 0.5) * jitter;
  if (writeSampleColumns(ctx, x, y, t)) return; // #1309 — column mode
  return { x, y, t };
}

// #720 — DLA / Eden growth. Two organisms, one engine (growth.js): the
// sampler reads instance marks off a living aggregate that advances one
// tick per presented frame. Per-sampler params ride ctx like lsysDepth —
// growthRate and growthBranch are exposed for the curator engine (#762),
// which owns the audio→growth mapping; this module never hardcodes it.
function dla(ctx) {
  return sampleGrowthPoint(ctx, 'dla');
}

function eden(ctx) {
  return sampleGrowthPoint(ctx, 'eden');
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
  const x = p.cx + Math.cos(angle) * (p.r + radJitter);
  const y = p.cy + Math.sin(angle) * (p.r + radJitter);
  if (writeSampleColumns(ctx, x, y)) return; // #1309 — column mode
  return { x, y };
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
  const px = x + ghostOffset;
  const py = y + (rng() - 0.5) * 4;
  if (writeSampleColumns(ctx, px, py)) return; // #1309 — column mode
  return { x: px, y: py };
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
    const fx = rng() * w;
    const fy = rng() * h;
    if (writeSampleColumns(ctx, fx, fy)) return; // #1309 — column mode
    return { x: fx, y: fy };
  }
  const cellW = w / cols;
  const cellH = h / rows;
  const x = (col + rng()) * cellW;
  const y = (row + rng()) * cellH;
  const cx = Math.min(w - 1e-6, Math.max(0, x));
  const cy = Math.min(h - 1e-6, Math.max(0, y));
  if (writeSampleColumns(ctx, cx, cy)) return; // #1309 — column mode
  return { x: cx, y: cy };
}

// Cost tiers follow the kernel cost-tier contract
// (engine/kernel/costRegistry.mjs, shared with #1239): 0 structural/never
// shed, 1 shed first, 2 expensive-but-not-shed-first, 3 cosmetic. The
// sampler family's reading:
//   0 — structural placement: closed-form per-item math, no rejection
//       loops, no precomputed builds. Init-time CPU the governor never
//       sheds.
//   1 — voice samplers, shed first among placement: swarm/flow (and the
//       hype/murmuration voices over the swarm engine) are ambient voices
//       the governor substitutes with tier-0 geometry at negligible cost.
//   2 — expensive builds: a cached per-seed structure plus per-point reads
//       off it — ca's blurred field, voronoi's centres, the l-system plant,
//       the DLA/Eden aggregates, brush's traced noise-field trails,
//       poisson's dart-thrown point set. Real CPU, shed after tier-1
//       effects, before tier-3 cosmetics.
//   3 — unused in this family (tier 3 is cheap color ops on the gl side).
//
// Every entry declares id, reads, writes, costTier, fn explicitly — the
// registry is the single readable list, and the legacy registerSampler(id,
// fn) shape below stays only as the third-party compatibility shim.
//
// reads are the ctx keys the sampler actually consumes (rng is the per-item
// stream; seed/seedOffsets are the hashed identity streams; wobbleAmp etc.
// are brush knobs). writes are the dish channels it produces: 'points' is
// x/y, 'points.t' the normalised param the orchestrator maps to soa.t,
// 'points.rot01' the trail tangent brush reports for stamp rotation.

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
// Tier 1 — voice samplers, shed first among placement.
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
// Tier 2 — expensive builds: rejection sampling against a cached field.
registerSampler({
  id: 'ca',
  reads: ['i', 'w', 'h', 'rng', 'jitter', 'seed', 'seedOffsets', 'caGrid'],
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
  reads: ['i', 'w', 'h', 'rng', 'jitter', 'seed', 'seedOffsets', 'lsysDepth', 'lsysAngle'],
  writes: ['points', 'points.t'],
  costTier: 2,
  fn: lsystem,
});
registerSampler({
  id: 'dla', // #720
  reads: ['i', 'w', 'h', 'rng', 'jitter', 'seed', 'seedOffsets', 'growthTick', 'growthRate', 'growthBranch', 'audioEnergy'],
  writes: ['points', 'points.t'],
  costTier: 2,
  fn: dla,
});
registerSampler({
  id: 'eden', // #720
  reads: ['i', 'w', 'h', 'rng', 'jitter', 'seed', 'seedOffsets', 'growthTick', 'growthRate', 'growthBranch', 'audioEnergy'],
  writes: ['points', 'points.t'],
  costTier: 2,
  fn: eden,
});
registerSampler({
  id: 'orbit',
  reads: ['i', 'count', 'w', 'h', 'rng', 'seed'],
  writes: ['points'],
  costTier: 0,
  fn: orbit,
});
registerSampler({
  id: 'abacus',
  reads: ['i', 'count', 'w', 'h', 'rng', 'seed'],
  writes: ['points'],
  costTier: 0,
  fn: abacus,
});
// 'noise' registers the grid fn itself (displacement warps in the
// orchestrator) — its declaration mirrors grid's.
registerSampler({
  id: 'noise',
  reads: ['i', 'count', 'w', 'h', 'rng', 'jitter'],
  writes: ['points'],
  costTier: 0,
  fn: grid,
});
// 'hype' and 'murmuration' ride the swarm engine (#280) — same voice tier
// as swarm.
registerSampler({
  id: 'hype',
  reads: ['w', 'h', 'rng', 'jitter'],
  writes: ['points'],
  costTier: 1,
  fn: swarm,
});
registerSampler({
  id: 'murmuration', // #280 — voice over the swarm engine
  reads: ['w', 'h', 'rng', 'jitter'],
  writes: ['points'],
  costTier: 1,
  fn: swarm,
});
/**
 * brush — flow-field trail stamping for the Crooked Hand brush line.
 *
 * K seeded trails are traced through a simplex vector field
 * (angle = noise3D(x·fieldScale, y·fieldScale, seedZ) · TAU); the count is
 * dealt round-robin as stamps along the trails. Each stamp returns its
 * trail-tangent as rot01 so the orchestrator can aim the stamp: stage C
 * maps the unit draw through the rotate range, which at the default
 * [-180, 180] IS the tangent angle in degrees.
 *
 * Pure and memoized per ctx: the ctx object is fresh per
 * computeGeometrySoA call, so ctx._brush cannot leak across calls (same
 * pattern as the CA field WeakMap, but call-scoped). Deliberately does NOT
 * apply ctx.jitter — jitter would scatter stamps off the trail and break
 * the line; wobbleAmp (slice 2) is the crooked knob.
 */
const BRUSH_TAU = Math.PI * 2;

function traceBrushTrails(ctx, trailCount, per) {
  const { w, h, seed, seedOffsets } = ctx;
  const fieldScale = ctx.fieldScale ?? 0.004;
  const brushSize = ctx.brushSize ?? 24;
  const brushSpacing = ctx.brushSpacing ?? 0.5;
  const stepLen = Math.max(0.5, brushSpacing * brushSize);
  const noise = createNoise(hashU32(seed, CH.noise, 1, seedOffsets));
  const seedZ = hashU01(seed, CH.noise, 2, seedOffsets) * 100;
  // Slice 2 — the crooked: perpendicular trail wobble. Amp 0 skips the
  // noise eval entirely, so amp 0 is bit-identical to no wobble knob.
  const wobbleAmp = ctx.wobbleAmp ?? 0;
  const wobbleFreq = ctx.wobbleFreq ?? 0.5;
  const trails = [];
  for (let k = 0; k < trailCount; k++) {
    let x = hashU01(seed, CH.noise, 10 + k * 2, seedOffsets) * w;
    let y = hashU01(seed, CH.noise, 11 + k * 2, seedOffsets) * h;
    const pts = [];
    for (let s = 0; s < per; s++) {
      const ang = noise.noise3D(x * fieldScale, y * fieldScale, seedZ) * BRUSH_TAU;
      // Step, reflecting off the canvas edges so trails stay on the page.
      // Reflection preserves the step length, which the spacing invariant needs.
      let a = ang;
      let nx = x + Math.cos(a) * stepLen;
      let ny = y + Math.sin(a) * stepLen;
      if (nx < 0 || nx > w) { a = Math.PI - a; nx = x + Math.cos(a) * stepLen; }
      if (ny < 0 || ny > h) { a = -a; ny = y + Math.sin(a) * stepLen; }
      nx = Math.min(w, Math.max(0, nx));
      ny = Math.min(h, Math.max(0, ny));
      // Wobble pushes the stamp off the trail, perpendicular to the step,
      // by fBm noise — the hand-drawn quiver. Bounded by wobbleAmp.
      let ox = 0, oy = 0;
      if (wobbleAmp > 0) {
        const off = noise.fBm3D(s * wobbleFreq, k * 13.7 + 5, seedZ * 2 + 3, 2) * wobbleAmp;
        ox = -Math.sin(a) * off;
        oy = Math.cos(a) * off;
      }
      // rot01 maps the full circle onto the stage-C unit draw so that the
      // default rotate range [-180, 180] reproduces the tangent in degrees.
      const deg = a * 180 / Math.PI;
      pts.push({ x: nx + ox, y: ny + oy, rot01: (((deg % 360) + 540) % 360) / 360 });
      x = nx;
      y = ny;
    }
    trails.push(pts);
  }
  return trails;
}

function brush(ctx) {
  const { i, count } = ctx;
  const trailCount = Math.max(1, Math.round(ctx.trailCount ?? 6));
  const per = Math.max(1, Math.ceil(count / trailCount));
  const cache = ctx._brush || (ctx._brush = traceBrushTrails(ctx, trailCount, per));
  const trail = Math.floor(i / per) % trailCount;
  const step = i % per;
  const pts = cache[trail];
  const p = pts[Math.min(step, pts.length - 1)];
  const t = per > 1 ? step / (per - 1) : 0.5;
  if (writeSampleColumns(ctx, p.x, p.y, t, p.rot01)) return; // #1309 — column mode
  return { x: p.x, y: p.y, t, rot01: p.rot01 };
}

registerSampler({
  // Tier 2 — expensive build: K noise-field trails traced and cached per
  // call, then dealt round-robin. Deliberately does NOT read ctx.rng or
  // jitter (the file comment explains why) — neither is declared.
  id: 'brush',
  reads: ['i', 'count', 'w', 'h', 'seed', 'seedOffsets', 'fieldScale', 'brushSize', 'brushSpacing', 'wobbleAmp', 'wobbleFreq', 'trailCount'],
  writes: ['points', 'points.t', 'points.rot01'],
  costTier: 2,
  fn: brush,
});
registerSampler({
  id: 'stratified',
  reads: ['i', 'count', 'w', 'h', 'rng'],
  writes: ['points'],
  costTier: 0,
  fn: stratified,
});
registerSampler({
  // #1193 — tier 2: the blue-noise set is dart-thrown once per
  // (seed, count, w, h) and cached; no jitter, no ctx.rng.
  id: 'poisson',
  reads: ['i', 'count', 'w', 'h', 'seed', 'seedOffsets', 'poissonRadius'],
  writes: ['points'],
  costTier: 2,
  fn: poisson,
});
registerSampler({
  // #1195 — tier 2: the packing is built once per (seed, plate, count, scale range) and cached; a lookup per index.
  id: 'circlepack',
  reads: ['i', 'count', 'w', 'h', 'seed', 'seedOffsets', 'zTiers', 'packScale'],
  writes: ['points'],
  costTier: 2,
  fn: circlepack,
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
  circlepack, // #1195
};
