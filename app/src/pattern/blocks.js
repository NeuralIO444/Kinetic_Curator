// blocks.js — PATTERN BLOCKS mode: merged-cell blocks, colour once per block (#1798).
//
// Spec: docs/PATTERN_SPEC.md — Composition (BLOCKS). Reference loot: Sai Karlen's
// "Colour Block" carousel (@s_n_k_, 2023-11-15): a square lattice on black where
// adjacent cells MERGE into larger squircle blocks — single cells, bars two to
// four long, 2×2 squares, L / T / plus polyominoes — and each merged block takes
// ONE flat colour. Black gaps separate every block, so the ground reads as a
// thin lattice.
//
// The two moves, kept exactly:
//   1. Merge before you colour. The atom is the merged block, not the cell: a
//      seeded polyomino pass fuses neighbours first, then colour is assigned
//      once per block, riding the palette rails (paletteRoles, QUILT's rails).
//   2. The series is the same generator re-dealt. Nothing changes but the seed:
//      SHUFFLE is this mode's motion. A deal is a still — DRIFT has no clock
//      here yet, and the editor disables it with that reason.
//
// MIX is the merge appetite: 0 = no merges at all (the plain per-cell grid,
// each cell its own block), 1 = a merge attempted at every anchor. In between,
// the appetite draw at each anchor is the probability of trying to fuse.
//
// Pure: no DOM, no Math.random, no clock. The partition and the colours are
// pure functions of (seed, density, mix, palette, rows) — same inputs, same
// deal (the replay law).

import { mkRng } from '../engine/prng.js';
import { registerCostTier } from '../engine/kernel/costRegistry.mjs';
import { hash32, toRgba, paletteRoles } from './engine.js';

/** DENSITY 4..12 → 8..24 cells across (TIDES' mapping: the reference lattice is fine). */
export const BLOCKS_CELLS_PER_DENSITY = 2;
export const BLOCKS_DEFAULT_DENSITY = 10;
export const BLOCKS_DEFAULT_MIX = 0.55;
/** The lattice gap: each block is inset this fraction of a cell on every side that faces another block or the frame edge. */
export const BLOCKS_INSET = 0.085;
/** Outer corner radius, as a fraction of a cell: the merged blocks are squircles, not slabs. */
export const BLOCKS_CORNER = 0.24;
/** Merge attempts per anchor before the anchor falls back to smaller shapes, then a single cell. */
export const BLOCKS_MAX_TRIES = 8;

const clamp01 = (v) => Math.min(1, Math.max(0, Number(v) || 0));

// ── the block vocabulary ────────────────────────────────────────────────────
// Base shapes as [x, y] cell offsets, in the reference's vocabulary: bars two
// to four long, the 2×2 square, the L tromino and tetromino, the T tetromino
// and the plus pentomino. Every rotation is generated, never hand-listed.
const BASE_SHAPES = [
  {
    name: 'bar2',
    weight: 3,
    cells: [
      [0, 0],
      [1, 0],
    ],
  },
  {
    name: 'bar3',
    weight: 3,
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
    ],
  },
  {
    name: 'bar4',
    weight: 2,
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ],
  },
  {
    name: 'square',
    weight: 3,
    cells: [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ],
  },
  {
    name: 'ell3',
    weight: 2,
    cells: [
      [0, 0],
      [0, 1],
      [1, 1],
    ],
  },
  {
    name: 'ell4',
    weight: 2,
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 2],
    ],
  },
  {
    name: 'tee',
    weight: 2,
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
      [1, 1],
    ],
  },
  {
    name: 'plus',
    weight: 1,
    cells: [
      [1, 0],
      [0, 1],
      [1, 1],
      [2, 1],
      [1, 2],
    ],
  },
];

/** A shape's canonical key: offsets translated to a (0,0) minimum and sorted. Two cell sets with the same key are the same shape. */
export function shapeKey(cells) {
  const mx = Math.min(...cells.map(([x]) => x));
  const my = Math.min(...cells.map(([, y]) => y));
  return cells
    .map(([x, y]) => `${x - mx},${y - my}`)
    .sort()
    .join(';');
}

function orientations(base) {
  const seen = new Map();
  let cells = base.cells;
  for (let k = 0; k < 4; k++) {
    const key = shapeKey(cells);
    if (!seen.has(key)) seen.set(key, { name: base.name, weight: base.weight, size: cells.length, cells });
    cells = cells.map(([x, y]) => [y, -x]);
  }
  return [...seen.values()];
}

/** Every oriented shape the merge pass may deal (the single cell is the fallback, not a draw). */
export const BLOCK_SHAPES = Object.freeze(BASE_SHAPES.flatMap(orientations));
/** The vocabulary as canonical keys: a dealt block is in the vocabulary iff its key is in this set (the single's key included). */
export const BLOCK_SHAPE_KEYS = new Set([...BLOCK_SHAPES.map((s) => shapeKey(s.cells)), shapeKey([[0, 0]])]);

const WEIGHT_TOTAL = BLOCK_SHAPES.reduce((a, s) => a + s.weight, 0);
function pickShape(rng) {
  let x = rng() * WEIGHT_TOTAL;
  for (const s of BLOCK_SHAPES) {
    x -= s.weight;
    if (x < 0) return s;
  }
  return BLOCK_SHAPES[BLOCK_SHAPES.length - 1];
}

/** cols for a DENSITY. Rows follow the frame height at the same square cell. */
export function blocksCols(density) {
  const d = Math.round(Number(density) || BLOCKS_DEFAULT_DENSITY);
  return Math.max(4, d * BLOCKS_CELLS_PER_DENSITY);
}

/**
 * Ground + the block colour pool, on QUILT's palette rails (paletteRoles): the
 * ground is the palette's darkest swatch — the lattice the reference reads as
 * black — and the pool is every other swatch, in palette order. (GLYPH/TIDES
 * ride the weight-ranked pool instead; the reference's palette is wide, and a
 * ranked cut can leave the lattice a mid colour, so BLOCKS does not.)
 */
export function blocksRoles(palette) {
  const { ground, brights } = paletteRoles(palette);
  return { ground, pool: brights.length ? brights : [palette?.ink || '#ffffff'] };
}

/**
 * The deal: pure function of its inputs. Two seeded streams, consumed in a
 * fixed order — the merge stream walks the cells row-major and deals the
 * partition; the colour stream then walks the blocks in deal order. Neither
 * shifts the other.
 *
 * @returns {{kind:'blocks', cols, rows, ground, groundRgba, pool, blocks, blockAt}}
 *   blocks: [{cells:number[], color, rgba, c0, r0, c1, r1}] in deal order;
 *   blockAt: Int32Array cell index → block index.
 */
export function assignBlocks(seed, density, mix, palette, rows) {
  const cols = blocksCols(density);
  const nrows = Math.max(1, Math.round(rows ?? cols));
  const { ground, pool } = blocksRoles(palette);
  const m = clamp01(mix);
  const count = cols * nrows;
  const blockAt = new Int32Array(count).fill(-1);
  const blocks = [];

  // 1) the merge pass. Row-major anchors: at each free cell, the appetite draw
  //    decides whether a merge is attempted at all; attempts place a drawn
  //    shape over the anchor (a random cell of the shape sits on it) and keep
  //    the first that fits. Nothing fits → the cell stays a single.
  const rng = mkRng(hash32(seed, 0xb10c5));
  for (let r = 0; r < nrows; r++) {
    for (let c = 0; c < cols; c++) {
      const at = r * cols + c;
      if (blockAt[at] !== -1) continue;
      let placed = null;
      if (rng() < m) {
        for (let t = 0; t < BLOCKS_MAX_TRIES && !placed; t++) {
          const shape = pickShape(rng);
          const [ax, ay] = shape.cells[Math.floor(rng() * shape.cells.length)];
          const cells = [];
          let fits = true;
          for (const [sx, sy] of shape.cells) {
            const cc = c + sx - ax;
            const rr = r + sy - ay;
            if (cc < 0 || cc >= cols || rr < 0 || rr >= nrows || blockAt[rr * cols + cc] !== -1) {
              fits = false;
              break;
            }
            cells.push(rr * cols + cc);
          }
          if (fits) placed = cells;
        }
      }
      if (!placed) placed = [at];
      const bi = blocks.length;
      let c0 = cols;
      let r0 = nrows;
      let c1 = -1;
      let r1 = -1;
      for (const i of placed) {
        blockAt[i] = bi;
        const cc = i % cols;
        const rr = (i / cols) | 0;
        if (cc < c0) c0 = cc;
        if (cc > c1) c1 = cc;
        if (rr < r0) r0 = rr;
        if (rr > r1) r1 = rr;
      }
      blocks.push({ cells: placed, color: null, rgba: 0, c0, r0, c1, r1 });
    }
  }

  // 2) colour, once per block. Greedy in deal order: a block never takes a
  //    colour an already-dealt edge-neighbour holds, while the pool offers an
  //    unused one. A wide block can still end up ringed by the whole pool, so
  //    a bounded repair pass then re-deals any block that touches its own
  //    colour, each time to the colour its neighbours use least — touching
  //    blocks stay distinct, so the merges read.
  const crng = mkRng(hash32(seed, 0xc0102));
  const neighbourBlocks = (bi) => {
    const out = new Set();
    for (const i of blocks[bi].cells) {
      const cc = i % cols;
      const rr = (i / cols) | 0;
      for (const [dc, dr] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nc = cc + dc;
        const nr = rr + dr;
        if (nc < 0 || nc >= cols || nr < 0 || nr >= nrows) continue;
        const nb = blockAt[nr * cols + nc];
        if (nb !== -1 && nb !== bi) out.add(nb);
      }
    }
    return out;
  };
  blocks.forEach((b, bi) => {
    const used = new Set([...neighbourBlocks(bi)].map((nb) => blocks[nb].color).filter(Boolean));
    const options = pool.filter((col) => !used.has(col));
    const src = options.length ? options : pool;
    b.color = src[Math.floor(crng() * src.length)];
  });
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    blocks.forEach((b, bi) => {
      const tally = new Map(pool.map((col) => [col, 0]));
      for (const nb of neighbourBlocks(bi)) tally.set(blocks[nb].color, (tally.get(blocks[nb].color) || 0) + 1);
      if (!tally.get(b.color)) return;
      let best = b.color;
      for (const col of pool) if (tally.get(col) < tally.get(best)) best = col;
      if (best !== b.color) {
        b.color = best;
        moved = true;
      }
    });
    if (!moved) break;
  }
  for (const b of blocks) b.rgba = toRgba(b.color);

  return { kind: 'blocks', cols, rows: nrows, ground, groundRgba: toRgba(ground), pool, blocks, blockAt };
}

/**
 * The block index at cell-space point (X, Y), or -1 for the ground: outside
 * the grid, or inside the lattice gap. The gap is the inset on every side
 * facing a different block (or the frame edge), with the outer corners
 * rounded at BLOCKS_CORNER — a block's silhouette is a squircle-ish round of
 * its cells.
 */
function blockIndexAt(grid, X, Y) {
  const { cols, rows, blockAt } = grid;
  const c = Math.floor(X);
  const r = Math.floor(Y);
  if (c < 0 || c >= cols || r < 0 || r >= rows) return -1;
  const bi = blockAt[r * cols + c];
  const fx = X - c;
  const fy = Y - r;
  const other = (cc, rr) => cc < 0 || cc >= cols || rr < 0 || rr >= rows || blockAt[rr * cols + cc] !== bi;
  const outL = other(c - 1, r);
  const outR = other(c + 1, r);
  const outT = other(c, r - 1);
  const outB = other(c, r + 1);
  const R = BLOCKS_CORNER;
  // rounded outer corners first: the arc's centre sits R in from both outer sides
  if (outL && outT && fx < R && fy < R && (fx - R) ** 2 + (fy - R) ** 2 > R * R) return -1;
  if (outR && outT && fx > 1 - R && fy < R && (fx - (1 - R)) ** 2 + (fy - R) ** 2 > R * R) return -1;
  if (outL && outB && fx < R && fy > 1 - R && (fx - R) ** 2 + (fy - (1 - R)) ** 2 > R * R) return -1;
  if (outR && outB && fx > 1 - R && fy > 1 - R && (fx - (1 - R)) ** 2 + (fy - (1 - R)) ** 2 > R * R) return -1;
  const g = BLOCKS_INSET;
  if ((outL && fx < g) || (outR && fx > 1 - g) || (outT && fy < g) || (outB && fy > 1 - g)) return -1;
  return bi;
}

/** The palette colour (hex) at cell-space point (X, Y): the block's one colour, or the ground in the gap. */
export function blocksColorAt(grid, X, Y) {
  const bi = blockIndexAt(grid, X, Y);
  return bi === -1 ? grid.ground : grid.blocks[bi].color;
}

/**
 * Rasterize one deal into a little-endian RGBA Uint32 buffer (top row first),
 * pixel-centre sampled, hard edges like every PATTERN mode. Cells are square:
 * side = bw / cols; rows overflow the bottom edge and clip.
 */
export function rasterBlocks(buf, bw, bh, grid) {
  const cell = bw / grid.cols;
  for (let y = 0; y < bh; y++) {
    const Y = (y + 0.5) / cell;
    let i = y * bw;
    for (let x = 0; x < bw; x++, i++) {
      const bi = blockIndexAt(grid, (x + 0.5) / cell, Y);
      buf[i] = bi === -1 ? grid.groundRgba : grid.blocks[bi].rgba;
    }
  }
  return buf;
}

/**
 * Which block scene point (x, y) is in, for a frame `w` wide: the ground
 * sampler (#1183) uses this so marks lean toward the block colour under them.
 * u / v run across the block's bounding box (a QUILT hero reports its block the
 * same way); side is the cell side in scene units.
 */
export function blocksCellAt(grid, w, x, y) {
  const cell = w / grid.cols;
  const gx = x / cell;
  const gy = y / cell;
  const c = ((Math.floor(gx) % grid.cols) + grid.cols) % grid.cols;
  const r = ((Math.floor(gy) % grid.rows) + grid.rows) % grid.rows;
  const b = grid.blocks[grid.blockAt[r * grid.cols + c]];
  return {
    main: b.color,
    colors: [b.color],
    u: (gx - b.c0) / (b.c1 - b.c0 + 1),
    v: (gy - b.r0) / (b.r1 - b.r0 + 1),
    side: cell,
  };
}

// Cost tier, declared at registration (#1798 asked for it, as #1797 did). A CPU raster, not a GPU pass, so the
// governor's shed ladder never touches it: tier 0 like the kernel's scent grid. A deal is a still — drawn once
// and cached; the partition is ≤ 24×17 cells of integer work and the raster is one per-pixel pass over the frame.
registerCostTier('pattern/blocks', {
  tier: 0,
  memoryBytes: 0,
  timeMs: 60,
  notes:
    '#1798 PATTERN BLOCKS: CPU merged-cell raster — a seeded polyomino partition (≤ ~400 cells) plus one ' +
    "per-pixel pass into the pattern track's own frame buffer. The deal never moves, so the frame is drawn " +
    'once and cached like any still.',
});
