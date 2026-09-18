/**
 * FIELD spatial hash — same counting-sort grid as ParticleSystem._buildSpatialHash,
 * without importing the swarm. Points are {x,y} in the caller's units.
 *
 * FIELD is short-range: pairs beyond FIELD_RADIUS do not pull. That is the
 * price of not going O(n·m) on two 400-counts. Soften is +FIELD_SOFT.
 */

export const FIELD_RADIUS = 0.35;
export const FIELD_SOFT = 1e-4;
export const FIELD_CELL = 0.35;

export function buildPointHash(points, cellSize = FIELD_CELL) {
  const pts = Array.isArray(points) ? points : [];
  const n = pts.length;
  const cellOf = new Int32Array(n);
  let minCx = 0;
  let minCy = 0;
  let maxCx = 0;
  let maxCy = 0;
  let live = 0;
  for (let i = 0; i < n; i++) {
    const cx = Math.floor((Number(pts[i].x) || 0) / cellSize);
    const cy = Math.floor((Number(pts[i].y) || 0) / cellSize);
    cellOf[i] = 0;
    if (live === 0) {
      minCx = maxCx = cx;
      minCy = maxCy = cy;
    } else {
      if (cx < minCx) minCx = cx;
      if (cx > maxCx) maxCx = cx;
      if (cy < minCy) minCy = cy;
      if (cy > maxCy) maxCy = cy;
    }
    live++;
  }
  const cols = Math.max(1, maxCx - minCx + 1);
  const rows = Math.max(1, maxCy - minCy + 1);
  const numCells = cols * rows;
  const cellStart = new Int32Array(numCells + 1);
  for (let i = 0; i < n; i++) {
    const cx = Math.floor((Number(pts[i].x) || 0) / cellSize) - minCx;
    const cy = Math.floor((Number(pts[i].y) || 0) / cellSize) - minCy;
    const c = cy * cols + cx;
    cellOf[i] = c;
    cellStart[c + 1]++;
  }
  for (let c = 0; c < numCells; c++) cellStart[c + 1] += cellStart[c];
  const fill = new Int32Array(numCells + 1);
  fill.set(cellStart);
  const order = new Int32Array(n);
  for (let i = 0; i < n; i++) order[fill[cellOf[i]]++] = i;
  return { cellStart, order, cols, rows, minCx, minCy, cellSize, n, points: pts };
}

export function forNeighbors(hash, x, y, radius, visit) {
  const { cellStart, order, cols, rows, minCx, minCy, cellSize, points } = hash;
  const ring = Math.max(1, Math.ceil(radius / cellSize));
  const cx = Math.floor(x / cellSize) - minCx;
  const cy = Math.floor(y / cellSize) - minCy;
  let checks = 0;
  for (let ox = -ring; ox <= ring; ox++) {
    const ncx = cx + ox;
    if (ncx < 0 || ncx >= cols) continue;
    for (let oy = -ring; oy <= ring; oy++) {
      const ncy = cy + oy;
      if (ncy < 0 || ncy >= rows) continue;
      const c = ncy * cols + ncx;
      const end = cellStart[c + 1];
      for (let k = cellStart[c]; k < end; k++) {
        const j = order[k];
        checks++;
        visit(points[j], j);
      }
    }
  }
  return checks;
}
