// CA Engine — Conway's Game of Life grid (pure logic, no React)

/** Create a new CA grid */
export function createGrid(cols, rows) {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => (Math.random() > 0.55 ? 1 : 0)),
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
