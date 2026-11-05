// dishLifeSeed.selfcheck.mjs — DISH LIFE slice 2 (#1923): picture → grid, density-normalised.
//
//   A coverage   marks paint where they are; alpha 0..100 == 0..1; junk / off-canvas marks are harmless
//   B band       in-band pictures seed exactly their covered cells; too-dense is pulled to the band top
//                keeping the STRONGEST cores; too-sparse is reported, never padded with noise
//   C terrain    bedrock cells are never seeded alive
//   D pure       same composition = same seed; every alive cell sits under a mark
import assert from 'node:assert/strict';
import { coverageField, seedFromMarks, SEED_BAND, MARK_FRAC } from './dishLifeSeed.mjs';

const O = { canvasW: 1000, canvasH: 500, cols: 40, rows: 20 };
const cell = (x, y) => y * O.cols + x;
const mark = (x, y, scale = 1, alpha = 100) => ({ x, y, scale, alpha });

// ---- A: coverage
{
  const cov = coverageField([mark(500, 250)], O);
  const cx = Math.floor(500 / (O.canvasW / O.cols));
  const cy = Math.floor(250 / (O.canvasH / O.rows));
  assert.ok(cov[cell(cx, cy)] > 0.5, 'a mark paints the cell under it');
  assert.equal(cov[cell(0, 0)], 0, 'and nothing far from it');
  const a100 = coverageField([mark(500, 250, 1, 100)], O);
  const a1 = coverageField([mark(500, 250, 1, 1)], O);
  assert.deepEqual([...a100], [...a1], 'alpha 100 (placement scale) == alpha 1 (unit scale)');
  const half = coverageField([mark(500, 250, 1, 50)], O);
  assert.ok(half[cell(cx, cy)] < a100[cell(cx, cy)], 'a fainter mark paints less');
  const two = coverageField([mark(500, 250), mark(500, 250)], O);
  assert.ok(two[cell(cx, cy)] > a100[cell(cx, cy)], 'overlaps add — a pile reads denser than a lone mark');
  const big = coverageField([mark(500, 250, 3)], O);
  const small = coverageField([mark(500, 250, 1)], O);
  const area = (f) => f.reduce((n, v) => n + (v > 0 ? 1 : 0), 0);
  assert.ok(area(big) > area(small), 'a bigger mark covers more cells');
  assert.ok(MARK_FRAC > 0);
  // junk never throws and paints nothing
  for (const junk of [
    null,
    undefined,
    {},
    { x: NaN, y: 1 },
    mark(-9999, -9999),
    mark(99999, 99999),
    mark(5, 5, 1, 0),
    'x',
    7,
  ]) {
    assert.equal(area(coverageField([junk], O)), 0, 'junk or off-canvas paints nothing');
  }
  assert.equal(area(coverageField(null, O)), 0, 'a non-array composition is an empty picture');
  assert.equal(area(coverageField([mark(0, 0, 1)], O)) > 0, true, 'a mark on the edge paints what falls on the grid');
}

// ---- B: band
{
  const n = O.cols * O.rows;
  // in-band: one mark covering ~10% of the grid
  const one = seedFromMarks([mark(500, 250, 5)], O);
  assert.equal(one.clamp, null);
  assert.ok(one.natural >= SEED_BAND.lo && one.natural <= SEED_BAND.hi, `in-band fixture (${one.natural})`);
  assert.equal(one.density, one.natural, 'an in-band picture is seeded as-is');
  let alive = 0;
  for (let i = 0; i < n; i++) if (one.cells[i]) alive++;
  assert.equal(alive / n, one.density);
  // dense: a blanket of marks, plus one extra-strong core far from the blanket's thin edge
  const blanket = [];
  for (let y = 25; y < 500; y += 50) for (let x = 25; x < 1000; x += 50) blanket.push(mark(x, y, 1.4));
  blanket.push(mark(500, 250, 1.4), mark(500, 250, 1.4), mark(500, 250, 1.4)); // a heavy pile in the middle
  const dense = seedFromMarks(blanket, O);
  assert.equal(dense.clamp, 'dense');
  assert.ok(dense.natural > SEED_BAND.hi);
  assert.ok(Math.abs(dense.density - SEED_BAND.hi) < 1 / n + 1e-9, 'pulled to the band top, no further');
  assert.equal(dense.cells[cell(20, 10)], 1, 'the strongest core (the heavy pile) survives the clamp');
  let kept = 0;
  let weakest = Infinity;
  let strongestDropped = 0;
  for (let i = 0; i < n; i++) {
    if (dense.cells[i]) {
      kept++;
      weakest = Math.min(weakest, dense.coverage[i]);
    } else strongestDropped = Math.max(strongestDropped, dense.coverage[i]);
  }
  assert.ok(
    weakest >= strongestDropped,
    'every kept cell is at least as strong as every dropped cell (shape kept, not sampled)',
  );
  assert.equal(kept, Math.round(SEED_BAND.hi * n));
  // sparse: three marks — alive is exactly the covered cells, flagged, never padded
  const sparse = seedFromMarks([mark(100, 100, 0.3), mark(800, 400, 0.3)], O);
  assert.equal(sparse.clamp, 'sparse');
  let covered = 0;
  for (let i = 0; i < n; i++) {
    if (sparse.coverage[i] > 0) covered++;
    if (sparse.cells[i])
      assert.ok(sparse.coverage[i] > 0, 'a sparse picture is never padded with cells that have no mark');
  }
  assert.equal(covered / n, sparse.density, 'every covered cell of a sparse picture is alive');
  // empty picture: no seed, flagged sparse, nothing throws
  const none = seedFromMarks([], O);
  assert.equal(none.density, 0);
  assert.equal(none.clamp, 'sparse');
  // a custom band is honoured
  const wide = seedFromMarks(blanket, { ...O, band: { lo: 0.05, hi: 0.5 } });
  assert.ok(wide.density > SEED_BAND.hi, 'the band is a parameter');
}

// ---- C: terrain
{
  const rock = new Uint8Array(O.cols * O.rows);
  rock[cell(20, 10)] = 1;
  const free = seedFromMarks([mark(500, 250, 5)], O);
  const held = seedFromMarks([mark(500, 250, 5)], { ...O, bedrock: rock });
  assert.equal(free.cells[cell(20, 10)], 1);
  assert.equal(held.cells[cell(20, 10)], 0, 'locked terrain is never seeded alive');
  assert.equal(
    held.coverage[cell(20, 10)],
    free.coverage[cell(20, 10)],
    'terrain is still part of the picture, just never alive',
  );
}

// ---- D: pure
{
  const items = [];
  for (let i = 0; i < 60; i++)
    items.push(mark(((i * 137) % 1000) + 3, ((i * 71) % 500) + 2, 0.6 + (i % 5) * 0.3, 40 + (i % 6) * 10));
  const a = seedFromMarks(items, O);
  const b = seedFromMarks(items, O);
  assert.deepEqual([...a.cells], [...b.cells], 'same composition, same seed');
  assert.equal(a.marks, 60);
  for (let i = 0; i < a.cells.length; i++)
    if (a.cells[i]) assert.ok(a.coverage[i] > 0, 'every alive cell sits under a mark');
}
console.log('dishLifeSeed.selfcheck: ok');
