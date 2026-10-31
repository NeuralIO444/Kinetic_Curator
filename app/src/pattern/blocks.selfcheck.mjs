// blocks.selfcheck.mjs — PATTERN BLOCKS: merged-cell blocks, colour once per block (#1798).
//
// What the issue asks, as checks:
//   adjacent cells merge FIRST into polyomino blocks (singles, bars 2–4, 2×2
//   squares, L / T / plus — the reference vocabulary), then colour is assigned
//   once per merged block from the palette; black gaps separate every block so
//   the ground reads as a thin lattice; MIX is the merge appetite (0 = the
//   plain per-cell grid); the same generator re-dealt is just a new seed;
//   seed-deterministic (replay law); a cost tier declared at registration.
import assert from 'node:assert';
import {
  assignBlocks,
  rasterBlocks,
  blocksCols,
  blocksRoles,
  blocksColorAt,
  blocksCellAt,
  shapeKey,
  BLOCK_SHAPE_KEYS,
  BLOCKS_INSET,
  BLOCKS_CORNER,
} from './blocks.js';
import { createPatternFrames, patternPixels, patternKey } from './patternSource.js';
import { patternGround } from './ground.js';
import { dealPattern } from './patternRoll.js';
import { toRgba } from './engine.js';
import { PATTERN_MODES, PATTERN_DEAL_MODES, defaultPattern, sanitizePattern } from '../state/patternTrack.js';
import { getCostTier } from '../engine/kernel/costRegistry.mjs';
import { PALETTES, resolvePalette } from '../data/palettes.js';
import { mkRng } from '../engine/prng.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const PAL_ID = Object.keys(PALETTES).find((k) => (PALETTES[k].swatches || []).length >= 4) || Object.keys(PALETTES)[0];
const PAL = resolvePalette(PAL_ID, null, []);
const W = 400;
const H = 280;
const block = (over = {}) => sanitizePattern({ ...defaultPattern('BLOCKS', 0x1798), ...over });
const cellsOf = (g, b) => b.cells.map((i) => [i % g.cols, (i / g.cols) | 0]);
const neighboursOf = (g, bi) => {
  const out = new Set();
  for (const i of g.blocks[bi].cells) {
    const cc = i % g.cols;
    const rr = (i / g.cols) | 0;
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nc = cc + dc;
      const nr = rr + dr;
      if (nc < 0 || nc >= g.cols || nr < 0 || nr >= g.rows) continue;
      const nb = g.blockAt[nr * g.cols + nc];
      if (nb !== -1 && nb !== bi) out.add(nb);
    }
  }
  return out;
};

ok('BLOCKS is a pattern mode the editor offers, opening at 20 cells across; KIN/CURATOR do not deal it', () => {
  assert.ok(PATTERN_MODES.includes('BLOCKS'));
  assert.ok(!PATTERN_DEAL_MODES.includes('BLOCKS'), 'hand-picked only (parked library work)');
  assert.deepEqual(PATTERN_DEAL_MODES, ['QUILT', 'GLYPH', 'FIELD'], 'existing seeded deals are unchanged');
  const rng = mkRng(7);
  for (let i = 0; i < 400; i++) assert.notEqual(dealPattern(block(), rng).mode, 'BLOCKS');
  assert.equal(blocksCols(block().density), 20);
  assert.equal(blocksCols(4), 8);
  assert.equal(blocksCols(12), 24);
  assert.deepEqual(sanitizePattern(block()), block(), 'a default is a fixed point of the sanitizer');
});

ok('cost tier declared at registration: tier 0 (CPU raster, never shed), with a time estimate', () => {
  const d = getCostTier('pattern/blocks');
  assert.ok(d, 'pattern/blocks is registered');
  assert.equal(d.tier, 0);
  assert.ok(d.timeMs > 0 && /1798/.test(d.notes));
});

ok('the merge pass partitions the grid: every cell in exactly one block, every block in the vocabulary', () => {
  for (const seed of [1, 2, 3, 0x1798, 0xbeef]) {
    for (const mix of [0.3, 0.55, 1]) {
      const g = assignBlocks(seed, 10, mix, PAL, 14);
      const seen = new Int32Array(g.cols * g.rows);
      g.blocks.forEach((b, bi) => {
        assert.ok(BLOCK_SHAPE_KEYS.has(shapeKey(cellsOf(g, b))), `block ${bi} (seed ${seed}) is a vocabulary shape`);
        assert.ok(b.cells.length >= 1 && b.cells.length <= 5, 'blocks run 1–5 cells');
        for (const i of b.cells) {
          seen[i]++;
          assert.equal(g.blockAt[i], bi, 'blockAt agrees with the block list');
        }
      });
      for (let i = 0; i < seen.length; i++) assert.equal(seen[i], 1, `cell ${i} covered exactly once`);
    }
  }
});

ok('the vocabulary actually deals: singles, bars, a 2×2 square, an L, a T and a plus all appear across seeds', () => {
  const bySize = new Map();
  for (let seed = 1; seed <= 30; seed++) {
    const g = assignBlocks(seed, 10, 1, PAL, 14);
    for (const b of g.blocks) {
      const key = shapeKey(cellsOf(g, b));
      if (!bySize.has(b.cells.length)) bySize.set(b.cells.length, new Set());
      bySize.get(b.cells.length).add(key);
    }
  }
  for (const size of [1, 2, 3, 4, 5]) assert.ok(bySize.has(size), `size-${size} blocks are dealt`);
  assert.ok(
    bySize.get(4).has(
      shapeKey([
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ]),
    ),
    'the 2×2 square is dealt',
  );
  assert.ok(
    [...bySize.get(3)].some(
      (k) =>
        k ===
        shapeKey([
          [0, 0],
          [0, 1],
          [1, 1],
        ]),
    ),
    'an L tromino is dealt',
  );
  assert.ok(
    [...bySize.get(4)].some(
      (k) =>
        k ===
        shapeKey([
          [0, 0],
          [1, 0],
          [2, 0],
          [1, 1],
        ]),
    ),
    'a T is dealt',
  );
  assert.ok(
    bySize.get(5).has(
      shapeKey([
        [1, 0],
        [0, 1],
        [1, 1],
        [2, 1],
        [1, 2],
      ]),
    ),
    'the plus is dealt',
  );
});

ok('MIX is the merge appetite: 0 merges nothing, 1 fuses hard, and the appetite grows monotonically', () => {
  const meanSize = (mix) => {
    let cells = 0;
    let blocks = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const g = assignBlocks(seed, 10, mix, PAL, 14);
      cells += g.cols * g.rows;
      blocks += g.blocks.length;
    }
    return cells / blocks;
  };
  const g0 = assignBlocks(5, 10, 0, PAL, 14);
  assert.equal(g0.blocks.length, g0.cols * g0.rows, 'MIX 0: every cell is its own block');
  assert.ok(g0.blocks.every((b) => b.cells.length === 1));
  const [a, b, c] = [meanSize(0.25), meanSize(0.55), meanSize(1)];
  assert.ok(
    a > 1.1 && b > a && c > b,
    `mean block size grows with MIX (${a.toFixed(2)} < ${b.toFixed(2)} < ${c.toFixed(2)})`,
  );
  assert.ok(c > 2, 'at MIX 1 the average block is bigger than a domino');
});

ok(
  'colour once per block: one flat colour per block, from the pool; touching blocks differ unless the pool is exhausted',
  () => {
    const { ground, pool } = blocksRoles(PAL);
    for (let seed = 1; seed <= 20; seed++) {
      const g = assignBlocks(seed, 10, 0.8, PAL, 14);
      assert.equal(g.ground, ground);
      g.blocks.forEach((b, bi) => {
        assert.ok(pool.includes(b.color), 'block colour is a pool swatch');
        // every pixel at the centres of the block's cells paints the block's one colour
        for (const [cc, rr] of cellsOf(g, b)) assert.equal(blocksColorAt(g, cc + 0.5, rr + 0.5), b.color);
        const nbs = neighboursOf(g, bi);
        const touches = [...nbs].some((nb) => g.blocks[nb].color === b.color);
        if (touches) {
          const used = new Set([...nbs].map((nb) => g.blocks[nb].color));
          assert.ok(
            used.size >= pool.length,
            `seed ${seed} block ${bi}: a shared colour only when the pool is exhausted`,
          );
        }
      });
    }
    // a one- or two-swatch palette still renders (pool falls back; never throws)
    const thin = { swatches: ['#000000', '#ff2200'], bg: '#000000', ink: '#ffffff' };
    assert.ok(blocksRoles(thin).pool.length >= 1);
    patternPixels(block(), thin, 64, 48, 0);
  },
);

ok('palette only: every pixel of a frame is the ground or a pool colour', () => {
  const { ground, pool } = blocksRoles(PAL);
  const allowed = new Set([ground, ...pool].map(toRgba));
  for (const over of [{}, { mix: 0 }, { mix: 1, seed: 3 }]) {
    const px = patternPixels(block(over), PAL, W, H, 0);
    for (let i = 0; i < px.length; i++) assert.ok(allowed.has(px[i]), `pixel ${i} is off-palette`);
  }
});

ok(
  'the lattice: seams between blocks and the frame edge are ground; cell centres are the block colour; corners are rounded',
  () => {
    const g = assignBlocks(0x1798, 10, 0.55, PAL, Math.ceil(H / (W / 20)));
    const cell = W / g.cols;
    const groundPx = toRgba(g.ground);
    const buf = rasterBlocks(new Uint32Array(W * H), W, H, g);
    // every cell centre is painted its block's colour
    for (let r = 0; r < g.rows; r++) {
      for (let c = 0; c < g.cols; c++) {
        const cx = Math.floor((c + 0.5) * cell);
        const cy = Math.floor((r + 0.5) * cell);
        if (cy < H) assert.equal(buf[cy * W + cx], g.blocks[g.blockAt[r * g.cols + c]].rgba, `cell ${c},${r} centre`);
      }
    }
    // the midpoint of every seam between two different blocks is ground, at mid-height of a cell
    let seams = 0;
    for (let r = 0; r < g.rows; r++) {
      for (let c = 0; c + 1 < g.cols; c++) {
        if (g.blockAt[r * g.cols + c] === g.blockAt[r * g.cols + c + 1]) continue;
        seams++;
        const x = Math.floor((c + 1) * cell);
        const y = Math.floor((r + 0.5) * cell);
        if (y < H) assert.equal(buf[y * W + x], groundPx, `seam after cell ${c},${r}`);
      }
    }
    assert.ok(seams > 100, `the deal has plenty of seams to check (${seams})`);
    // cell-space: just inside a seam is ground, just past the inset is colour; the frame corner is cut by the radius
    assert.equal(blocksColorAt(g, 1 - BLOCKS_INSET / 2, 0.5), g.ground, 'inside the inset: ground');
    assert.equal(blocksColorAt(g, 0.02, 0.02), g.ground, 'the outer corner is rounded away');
    const b00 = g.blocks[g.blockAt[0]];
    assert.equal(blocksColorAt(g, 0.5, 0.5), b00.color, 'the corner cell centre is its block colour');
  },
);

ok('replay law: same seed + params = identical deal and pixels; another seed re-deals; DRIFT changes nothing', () => {
  const a = patternPixels(block(), PAL, W, H, 0);
  assert.deepEqual(a, patternPixels(block(), PAL, W, H, 0));
  assert.notDeepEqual(a, patternPixels(block({ seed: 0xabc }), PAL, W, H, 0), 'a new seed is a new permutation');
  assert.deepEqual(
    assignBlocks(9, 10, 0.55, PAL, 14).blocks.map((b) => [b.cells, b.color]),
    assignBlocks(9, 10, 0.55, PAL, 14).blocks.map((b) => [b.cells, b.color]),
    'the deal itself is a pure function',
  );
  // a BLOCKS deal is a still: DRIFT and the clock change no pixel, and the frame caches as a still
  assert.deepEqual(
    patternPixels(block({ drift: 0.8 }), PAL, W, H, 1.5),
    patternPixels(block({ drift: 0 }), PAL, W, H, 9),
  );
  assert.equal(patternKey(block({ drift: 0.8 }), PAL, W, H, 0), patternKey(block({ drift: 0.8 }), PAL, W, H, 99));
  // kin / movers are element motion; BLOCKS has no separate elements, so they change nothing
  assert.deepEqual(
    patternPixels(block({ drift: 0.5, kin: 'SPIN', movers: 1 }), PAL, W, H, 1),
    patternPixels(block({ drift: 0.5, kin: 'OFF', movers: 0 }), PAL, W, H, 1),
  );
});

ok('the raster is the sampler: rasterBlocks agrees with blocksColorAt at every pixel centre', () => {
  const g = assignBlocks(42, 10, 0.55, PAL, Math.ceil(H / (W / 20)));
  const cell = W / g.cols;
  const buf = rasterBlocks(new Uint32Array(W * H), W, H, g);
  const rgbaOf = (hex) => toRgba(hex);
  for (let y = 0; y < H; y += 3) {
    for (let x = 0; x < W; x += 3) {
      const want = rgbaOf(blocksColorAt(g, (x + 0.5) / cell, (y + 0.5) / cell));
      assert.equal(buf[y * W + x], want, `pixel ${x},${y}`);
    }
  }
});

ok('ground sampler (#1183) agrees with the pixels: at() is the block colour painted at the cell centre', () => {
  const p = block();
  const ground = patternGround(p, PAL, W, H);
  const frames = createPatternFrames();
  const f = frames.frame(p, PAL, W, H, 0);
  const cell = W / blocksCols(p.density);
  const g = assignBlocks(p.seed, p.density, p.mix, PAL, Math.ceil(H / cell));
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 20; c += 3) {
      const x = (c + 0.5) * cell;
      const y = (r + 0.5) * cell;
      const px = f.pixels[Math.floor(y) * W + Math.floor(x)];
      const want = g.blocks[g.blockAt[r * g.cols + c]].color;
      assert.equal(ground.at(x, y, 0), want, `the block colour under cell ${c},${r}`);
      assert.equal(toRgba(want), px, 'and it is the painted pixel');
      assert.deepEqual(ground.roles(x, y, 0), [want.toLowerCase()], 'one block, one role colour');
    }
  }
  const cl = ground.cell(cell * 2.25, cell * 1.5, 0);
  assert.ok(cl.u >= 0 && cl.u < 1 && cl.v >= 0 && cl.v < 1 && Math.abs(cl.size - cell) < 1e-9);
  const ca = blocksCellAt(g, W, cell * 2.25, cell * 1.5);
  assert.equal(ca.main, g.blocks[g.blockAt[g.cols + 2]].color);
});

ok('cost: a still 1000×700 frame stays inside the declared budget (median of 15)', () => {
  const frames = createPatternFrames();
  frames.frame(block(), PAL, 1000, 700, 0); // build the grid once, like the live loop does
  const p = block({ seed: 99 }); // a fresh deal pays the partition + raster once
  const ms = [];
  for (let i = 0; i < 15; i++) {
    const t0 = performance.now();
    createPatternFrames().frame(p, PAL, 1000, 700, 0);
    ms.push(performance.now() - t0);
  }
  ms.sort((a, b) => a - b);
  const med = ms[7];
  const declared = getCostTier('pattern/blocks').timeMs;
  console.log(`      still frame 1000×700 (fresh deal): median ${med.toFixed(2)} ms (declared ${declared} ms)`);
  // CI machines vary; the gate is generous (4× the declaration), the log line is the honest number
  assert.ok(med < declared * 4, `median ${med.toFixed(2)} ms is far over the ${declared} ms declaration`);
});

console.log(`blocks.selfcheck: ${n} checks passed`);
