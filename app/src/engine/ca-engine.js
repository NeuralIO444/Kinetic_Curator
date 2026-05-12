// CA Engine — Conway's Game of Life variant with bitwise color mutation
// Extracted from ca-engine.jsx into pure-logic module (no React)

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

/** Flatten grid to list of alive cell coordinates */
export function aliveCells(grid) {
  const cells = [];
  grid.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (cell) cells.push({ x, y });
    });
  });
  return cells;
}

// ── Bitwise color mutations ──────────────────────────────────

/** Parse hex color string → [r, g, b] */
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

/** [r, g, b] → hex string */
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(c => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0')).join('');
}

/** XOR mutation — bitwise XOR with shift key */
export function mutateXor(hex, key = 0x3f) {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r ^ key, g ^ key, b ^ key);
}

/** Rotation — rotate color channels */
export function mutateRotate(hex) {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(b, r, g);
}

/** Invert */
export function mutateInvert(hex) {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(255 - r, 255 - g, 255 - b);
}

/** Apply N mutation steps to a color */
export function mutateColor(hex, steps = 1, method = 'xor') {
  let c = hex;
  const fn = method === 'rotate' ? mutateRotate : method === 'invert' ? mutateInvert : mutateXor;
  for (let i = 0; i < steps; i++) c = fn(c);
  return c;
}
