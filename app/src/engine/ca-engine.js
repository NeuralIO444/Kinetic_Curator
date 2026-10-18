// CA Engine — Conway's Game of Life grid (pure logic, no React)

import { hashU01 } from './kernel/rng.js';

/**
 * Create a new CA grid — SEEDED (audit fix 1): a pure function of (cols, rows, seed).
 * Each cell draws on the registered 'ca-grid' channel, so the same take seed deals the
 * same grid on every run and replay cannot diverge at creation time. Callers pass the
 * take's seed; the seed-0 default keeps any unthreaded caller deterministic rather
 * than random. Density is unchanged: a cell is alive when its draw beats 0.55 (~45%).
 */
export function createGrid(cols, rows, seed = 0) {
  let i = 0;
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => (hashU01(seed, 'ca-grid', i++) > 0.55 ? 1 : 0)),
  );
}

/** Step: Conway's Game of Life rules */
export function stepGrid(grid) {
  const rows = grid.length;
  const cols = grid[0].length;
  return grid.map((row, y) =>
    row.map((cell, x) => {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dy === 0 && dx === 0) continue;
          const ny = (y + dy + rows) % rows;
          const nx = (x + dx + cols) % cols;
          n += grid[ny][nx];
        }
      }
      if (cell === 1) return n === 2 || n === 3 ? 1 : 0;
      return n === 3 ? 1 : 0;
    }),
  );
}
