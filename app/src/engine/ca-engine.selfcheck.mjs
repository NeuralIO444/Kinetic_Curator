// node src/engine/ca-engine.selfcheck.mjs
// Audit fix 1 — createGrid is SEEDED: a pure function of (cols, rows, seed), drawn on the
// registered 'ca-grid' channel (kernel/rng.js). Before the fix it rolled Math.random per cell,
// so two runs of the same take that both had to create the grid created different grids and
// replay diverged. These assertions are the proof: the determinism blocks fail on the
// pre-fix engine and pass on the fixed one.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createGrid, stepGrid } from './ca-engine.js';

// 1. Determinism: same (cols, rows, seed) -> the identical grid, every time.
{
  assert.deepEqual(createGrid(40, 28, 77), createGrid(40, 28, 77), 'same seed, same grid (40x28)');
  assert.deepEqual(createGrid(8, 6, 1234), createGrid(8, 6, 1234), 'same seed, same grid (8x6)');
  assert.deepEqual(createGrid(10, 10), createGrid(10, 10), 'the default seed is deterministic too');
}

// 2. Seed sensitivity: the seed actually drives the fill.
{
  assert.notDeepEqual(createGrid(40, 28, 77), createGrid(40, 28, 78), 'a different seed deals a different grid');
}

// 3. Shape and alphabet: rows x cols of 0/1, nothing else.
{
  const g = createGrid(7, 3, 5);
  assert.equal(g.length, 3, 'rows');
  assert.ok(g.every((row) => row.length === 7), 'cols');
  assert.ok(g.flat().every((c) => c === 0 || c === 1), 'cells are 0 or 1');
}

// 4. Density holds the pre-fix semantics: alive when the draw beats 0.55, so ~45% alive.
{
  for (const seed of [0, 1, 77, 2026]) {
    const cells = createGrid(40, 28, seed).flat();
    const alive = cells.filter((c) => c === 1).length / cells.length;
    assert.ok(alive > 0.37 && alive < 0.53, `seed ${seed}: alive fraction ${alive.toFixed(3)} in the expected band`);
  }
}

// 5. stepGrid is untouched Conway: a blinker oscillates with period 2.
{
  const g = Array.from({ length: 5 }, () => Array(5).fill(0));
  g[1][2] = 1; g[2][2] = 1; g[3][2] = 1; // vertical bar
  const s1 = stepGrid(g);
  assert.deepEqual([s1[2][1], s1[2][2], s1[2][3]], [1, 1, 1], 'blinker turns horizontal');
  assert.deepEqual(stepGrid(s1), g, 'blinker returns — period 2');
}

// 6. The point of the fix, pinned at the source: no unseeded chance left in this file
//    (comments stripped first, the mathRandomGuard discipline).
{
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'ca-engine.js'), 'utf8');
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, '');
  const code = noBlock.split('\n').map((l) => l.replace(/(^|[^:'"`])\/\/.*$/, '$1')).join('\n');
  assert.ok(!code.includes('Math.random'), 'ca-engine.js must not use Math.random — seeded kernel channels only');
}
