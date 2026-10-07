// quilt.js — PATTERN QUILT mode: ten tile motifs (#1040).
//
// Spec: docs/PATTERN_SPEC.md — Composition (QUILT), vocabulary 1–10.
//
// Every motif is a pure function Q(u, v, p) -> 0 | 1 | 2 on the unit square
// [0,1)². Unlike FIELD (field.js) these do NOT have to wrap: a quilt tile is a
// patch, not a textile, and the grid does not pan. A motif paints the whole
// tile rect (edge bleed): there is no inset and nothing is clipped to make room
// for grout, which the engine lays over the seams afterwards.
//
// A hero tile is the SAME function sampled across a 2×2 block, so the motif
// draws once at twice the size, not four times.
//
// The return value indexes the tile's three colors: 0 = ground, 1 and 2 = the
// tile's two motif colors (at most 3 hues per tile, per the spec).
//
// Pure: no DOM, no Math.random, no time. All variation comes from `p`.

const mod = (i, n) => ((i % n) + n) % n;
const TAU = Math.PI * 2;
// 0..1 around the tile center, 0 pointing left, continuous except at the cut.
const turn = (a, b) => (Math.atan2(b, a) + Math.PI) / TAU;

/** Motif names in spec order (1–10). The array index + 1 is the motif id. */
export const QUILT_MOTIFS = Object.freeze([
  'nestedDiamond', // 1
  'medallion',     // 2
  'hexNest',       // 3
  'stripeField',   // 4
  'dotGrid',       // 5
  'pinwheel',      // 6
  'bullseye',      // 7
  'leafRows',      // 8
  'solidBlock',    // 9
  'cube',          // 10 — hero only, never a 1×1 tile
]);

/** Spec id (1–10) of a motif name. */
export const motifId = (name) => QUILT_MOTIFS.indexOf(name) + 1;

/** Motifs a 1×1 tile may draw: everything but the cube. */
export const TILE_MOTIFS = Object.freeze(QUILT_MOTIFS.filter((n) => n !== 'cube'));

/** Motifs a 2×2 hero may draw. */
export const HERO_MOTIFS = Object.freeze(['cube', 'medallion']);

const Q = {
  // 1 — concentric diamonds, alternating the two motif colors, ground corners.
  nestedDiamond: (u, v, p) => {
    const d = Math.abs(u - 0.5) + Math.abs(v - 0.5);
    if (d >= 0.5) return 0;
    return mod(Math.floor(d * 2 * p.rings), 2) === 0 ? 1 : 2;
  },

  // 2 — a scalloped rosette around a solid core.
  medallion: (u, v, p) => {
    const a = u - 0.5; const b = v - 0.5;
    const r = Math.sqrt(a * a + b * b);
    if (r < p.core) return 2;
    const edge = 0.36 + 0.09 * Math.cos(turn(a, b) * TAU * p.petals);
    return r < edge ? 1 : 0;
  },

  // 3 — nested hexagons (flat-top), ground corners.
  hexNest: (u, v, p) => {
    const a = Math.abs(u - 0.5); const b = Math.abs(v - 0.5);
    const h = Math.max(b, b * 0.5 + a * 0.8660254);
    if (h >= 0.5) return 0;
    return mod(Math.floor(h * 2 * p.rings), 2) === 0 ? 1 : 2;
  },

  // 4 — two-color stripes: horizontal, vertical or diagonal. No ground.
  stripeField: (u, v, p) => {
    const t = p.dir === 'h' ? v : p.dir === 'v' ? u : (u + v) / 2;
    return mod(Math.floor(t * p.n), 2) === 0 ? 1 : 2;
  },

  // 5 — a grid of dots on ground.
  dotGrid: (u, v, p) => {
    const a = (u * p.n) % 1 - 0.5; const b = (v * p.n) % 1 - 0.5;
    return a * a + b * b < p.r * p.r ? 1 : 0;
  },

  // 6 — triangle fan around the center. Even blade count so the alternation
  // closes across the atan2 branch cut. No ground: the fan fills the tile.
  pinwheel: (u, v, p) => {
    const s = mod(Math.floor((turn(u - 0.5, v - 0.5) + p.twist) * p.blades), p.blades);
    return s % 2 === 0 ? 1 : 2;
  },

  // 7 — concentric rings, ground corners.
  bullseye: (u, v, p) => {
    const a = u - 0.5; const b = v - 0.5;
    const r = Math.sqrt(a * a + b * b);
    if (r >= 0.5) return 0;
    return mod(Math.floor(r * 2 * p.rings), 2) === 0 ? 1 : 2;
  },

  // 8 — rows of leaves (lens shapes) on ground, rows alternating color and
  // offset by half a leaf like feather barbs.
  leafRows: (u, v, p) => {
    const row = Math.min(p.rows - 1, Math.floor(v * p.rows));
    const fy = v * p.rows - row - 0.5;
    const fx = mod(u * p.cols + (row % 2 ? 0.5 : 0), 1);
    return Math.abs(fy) < 0.46 * Math.sin(Math.PI * fx) ? (row % 2 ? 2 : 1) : 0;
  },

  // 9 — one flat color. A legal tile, not a degenerate one.
  solidBlock: () => 1,

  // 10 — isometric cube: a pointy-top hexagon split into three rhombi. The top
  // and left faces take the motif colors, the right face is the ground, which
  // is the darkest role: it reads as the face in shadow.
  cube: (u, v) => {
    const a = u - 0.5; const b = v - 0.5;
    const ax = Math.abs(a);
    if (Math.max(ax, ax * 0.5 + Math.abs(b) * 0.8660254) >= 0.46) return 0;
    if (b < -ax * 0.5773503) return 1;  // top face: above both upper diagonals
    return a < 0 ? 2 : 0;               // left face, then the shadowed right
  },
};

/** Sample one motif at (u, v) in the unit square. */
export function sampleQuilt(name, u, v, p) {
  return Q[name](u, v, p);
}

/** The motif's sampler itself, so a hot loop looks it up once per tile instead of once per pixel (#1101). */
export const quiltSampler = (name) => Q[name];

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

/** Fresh params for a motif, drawn from the tile's seeded rng. */
export function quiltParams(name, rng) {
  switch (name) {
    case 'nestedDiamond': return { rings: pick(rng, [2, 3, 4]) };
    case 'medallion': return { petals: pick(rng, [6, 8, 12]), core: pick(rng, [0.1, 0.14, 0.18]) };
    case 'hexNest': return { rings: pick(rng, [2, 3, 4]) };
    case 'stripeField': return { dir: pick(rng, ['h', 'v', 'd']), n: pick(rng, [4, 6, 8]) };
    case 'dotGrid': return { n: pick(rng, [2, 3, 4]), r: pick(rng, [0.22, 0.3, 0.38]) };
    case 'pinwheel': return { blades: pick(rng, [4, 8, 12]), twist: pick(rng, [0, 0.0625, 0.125]) };
    case 'bullseye': return { rings: pick(rng, [2, 3, 4, 5]) };
    case 'leafRows': return { rows: pick(rng, [2, 3, 4]), cols: pick(rng, [1, 2, 3]) };
    case 'solidBlock': return {};
    case 'cube': return {};
    default: throw new Error(`unknown quilt motif: ${name}`);
  }
}
