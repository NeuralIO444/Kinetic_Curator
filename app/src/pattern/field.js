// field.js — PATTERN FIELD mode: ten periodic micro-patterns (#1039).
//
// Spec: docs/PATTERN_SPEC.md — Composition (FIELD), vocabulary 24–33.
//
// Every pattern is a pure function G(x, y, p) -> 0 | 1 | 2 defined on the WHOLE
// plane, with period exactly 1 in both axes: G(x+1, y) === G(x, y) and
// G(x, y+1) === G(x, y). Tile-local u,v in [0,1) are just the first period.
// The period is by construction, never by clamping: every repetition count is
// an integer, and every pattern that alternates by cell parity uses an EVEN
// count so the parity continues across the seam. A pattern that cannot wrap is
// not a field motif.
//
// The return value indexes the tile's three colors: 0 = ground, 1 and 2 = the
// tile's two motif colors (at most 3 hues per tile, per the spec).
//
// Pure: no DOM, no Math.random, no time. All variation comes from `p`, which
// the engine draws from the tile's seeded rng.

const mod = (i, n) => ((i % n) + n) % n;

// Pixel centers land EXACTLY on diagonals and cell edges (x == y, |a|+|b| == .5,
// ray boundaries at 45 degrees). Evaluated through a wrapped coordinate versus
// an unwrapped one, such a point differs by one ulp and could flip color: a
// one-pixel seam speckle. EPS makes every near-tie fall the same way on both
// sides, so the decision is the same wherever the point is reached from.
const EPS = 1e-9;
// Phase and cell index both read the coordinate shifted by EPS, so a value that
// is exactly on a cell edge (x*n integer) and one a single ulp below it land in
// the SAME cell. Without this, 0 versus 0.9999999999 at a wrap is a full-color flip.
const flE = (v) => Math.floor(v + EPS);
const frE = (v) => (v + EPS) - Math.floor(v + EPS);

/** Pattern names in spec order (24–33). The array index is the pattern id. */
export const FIELD_PATTERNS = Object.freeze([
  'stripeStack',     // 24
  'triangleField',   // 25
  'plusGrid',        // 26
  'zigzagRows',      // 27
  'diamondLattice',  // 28
  'concentricArcs',  // 29
  'pinstripes',      // 30
  'rayBurst',        // 31
  'barStack',        // 32
  'diamondBands',    // 33
]);

// Cell lookup along one axis: a wrapped sequence, periodic for any length.
const seqAt = (seq, t) => seq[mod(Math.floor(t * seq.length), seq.length)];

const G = {
  // 24 — horizontal bars of 2–3 widths. `seq` is a wrapped cell sequence.
  stripeStack: (x, y, p) => seqAt(p.seq, y),

  // 25 — grid of solid triangles. n even so the parity flip continues.
  triangleField: (x, y, p) => {
    const cx = flE(x * p.n); const cy = flE(y * p.n);
    const fx = frE(x * p.n); const fy = frE(y * p.n);
    const flip = mod(cx + cy, 2) === 1;
    const upper = flip ? fx + fy > 1 + EPS : fx > fy + EPS;
    return upper ? 1 : 2;
  },

  // 26 — evenly spaced crosses.
  plusGrid: (x, y, p) => {
    const a = Math.abs(frE(x * p.n) - 0.5); const b = Math.abs(frE(y * p.n) - 0.5);
    return (a < p.arm - EPS && b < p.len - EPS) || (b < p.arm - EPS && a < p.len - EPS) ? 1 : 0;
  },

  // 27 — chevron bands: horizontal bands displaced by a triangle wave.
  // rows even (parity of the band index); waves integer (the wave closes).
  zigzagRows: (x, y, p) => {
    const tri = Math.abs(frE(x * p.waves) * 2 - 1); // 0..1, period 1/waves
    return mod(flE(y * p.rows + tri * p.amp), 2) === 0 ? 1 : 2;
  },

  // 28 — interlocking diamond grid: a diamond in each cell, corners between.
  diamondLattice: (x, y, p) => {
    const a = frE(x * p.n) - 0.5; const b = frE(y * p.n) - 0.5;
    return Math.abs(a) + Math.abs(b) < 0.5 - EPS ? 1 : 2;
  },

  // 29 — radiating arc bands around each cell center (periodic distance).
  concentricArcs: (x, y, p) => {
    const a = frE(x * p.n) - 0.5; const b = frE(y * p.n) - 0.5;
    const r = Math.sqrt(a * a + b * b);
    return mod(flE(r * p.bands), 2) === 0 ? 1 : 2;
  },

  // 30 — fine diagonal lines. Integer k keeps the phase closed on both axes.
  pinstripes: (x, y, p) => (frE((x + (p.dir > 0 ? y : -y)) * p.k) < p.width - EPS ? 1 : 0),

  // 31 — radial ticks around EVERY lattice point, not one corner. Even ray
  // count so alternation continues across the branch cut of atan2.
  rayBurst: (x, y, p) => {
    const a = frE(x * p.n + 0.5) - 0.5; const b = frE(y * p.n + 0.5) - 0.5;
    if (Math.sqrt(a * a + b * b) > p.reach + EPS) return 0;
    const ang = (Math.atan2(b, a) + Math.PI) / (2 * Math.PI);
    return mod(flE(ang * p.rays), 2) === 0 ? 1 : 2;
  },

  // 32 — vertical bars of varied widths.
  barStack: (x, y, p) => seqAt(p.seq, x),

  // 33 — expanding diamond outlines, periodic per cell.
  diamondBands: (x, y, p) => {
    const a = frE(x * p.n) - 0.5; const b = frE(y * p.n) - 0.5;
    return mod(flE((Math.abs(a) + Math.abs(b)) * p.bands), 3);
  },
};

/** Sample one pattern at (x, y). Defined on the whole plane, period 1. */
export function samplePattern(name, x, y, p) {
  return G[name](x, y, p);
}

/** The pattern's sampler itself, so a hot loop looks it up once per tile instead of once per pixel (#1101). */
export const fieldSampler = (name) => G[name];

// ── params, drawn from the tile's seeded rng ────────────────────────────────
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

// A wrapped sequence of cell colors with runs of 1–3 cells (2–3 widths),
// cycling motif 1 → ground → motif 2.
function runSeq(rng, cells) {
  const order = [1, 0, 2];
  const seq = [];
  let k = 0;
  while (seq.length < cells) {
    const run = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < run && seq.length < cells; i++) seq.push(order[k % 3]);
    k += 1;
  }
  return seq;
}

/** Fresh params for a pattern. Every count is an integer; parity counts are even. */
export function patternParams(name, rng) {
  switch (name) {
    case 'stripeStack': return { seq: runSeq(rng, pick(rng, [8, 12, 16])) };
    case 'triangleField': return { n: pick(rng, [2, 4, 6]) };
    case 'plusGrid': return { n: pick(rng, [2, 3, 4, 5]), arm: pick(rng, [0.08, 0.12, 0.16]), len: pick(rng, [0.3, 0.38, 0.44]) };
    case 'zigzagRows': return { rows: pick(rng, [4, 6, 8]), waves: pick(rng, [2, 3, 4]), amp: pick(rng, [1, 2]) };
    case 'diamondLattice': return { n: pick(rng, [2, 3, 4]) };
    case 'concentricArcs': return { n: pick(rng, [1, 2, 3]), bands: pick(rng, [4, 6, 8]) };
    case 'pinstripes': return { k: pick(rng, [4, 6, 8, 12]), width: pick(rng, [0.18, 0.3, 0.45]), dir: pick(rng, [1, -1]) };
    case 'rayBurst': return { n: pick(rng, [1, 2, 3]), rays: pick(rng, [8, 12, 16]), reach: pick(rng, [0.28, 0.4, 0.5]) };
    case 'barStack': return { seq: runSeq(rng, pick(rng, [8, 12, 16])) };
    case 'diamondBands': return { n: pick(rng, [1, 2, 3]), bands: pick(rng, [3, 4, 6]) };
    default: throw new Error(`unknown field pattern: ${name}`);
  }
}
