/**
 * regionMattes.js — #725: cryptomatte-style region detection (pure).
 *
 * At author/import time, each contiguous color region of an asset gets a
 * stable ID. The ID derives from the region's (quantized) color and where
 * it sits: redraw the shape keeping its flat color → the ID survives;
 * recolor → new ID; same color in two blobs → distinct IDs via position.
 *
 * This module is pure over pixel buffers — rasterization is the caller's
 * job (browser canvas at ingest; synthetic buffers in the selfcheck).
 * No DOM, no store, no GL.
 */

export const REGION_ID_RE = /^rm-[0-9a-f]{6}-\d+-\d+(-\d+)?$/;

/** Alpha below this is background (not a region). */
const ALPHA_CUTOFF = 24;
/** Color quantum per channel (Matt Q1: quantized, AA absorbed). */
const QUANTUM = 48;
/** Position grid for the stable ID (8x8, nearest-cell). */
const POS_GRID = 8;
/** area/perimeter below this ⇒ edge sliver, absorbed into its neighbor. */
const SLIVER_RATIO = 2.5;
/** Default minimum region area: scales with raster size (≈4×4 px at 200²). */
const minAreaFor = (w, h) => Math.max(8, Math.round((w * h) / 2500));

const isBadInput = (pixels, w, h) =>
  (!(pixels instanceof Uint8ClampedArray) && !(pixels instanceof Uint8Array)) ||
  !Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0 ||
  pixels.length < w * h * 4;

const hex2 = (n) => n.toString(16).padStart(2, '0');
const isFg = (pixels, i) => pixels[i * 4 + 3] >= ALPHA_CUTOFF;

/**
 * Detect regions in an RGBA buffer.
 * @returns {{ regions: Array<{id,color,cx,cy,x0,y0,x1,y1,area}>, width, height }}
 *   color is the region's modal exact color as 6-hex; cx/cy and the bbox
 *   are normalized 0..1; area is in pixels.
 */
export function detectRegions(pixels, w, h, opts = {}) {
  if (isBadInput(pixels, w, h)) return { regions: [], width: 0, height: 0 };
  const quantum = opts.quantum ?? QUANTUM;
  const n = w * h;

  // 1. Quantize foreground pixels into color buckets.
  const bucketOf = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    if (!isFg(pixels, i)) continue;
    const qr = Math.floor(pixels[i * 4] / quantum);
    const qg = Math.floor(pixels[i * 4 + 1] / quantum);
    const qb = Math.floor(pixels[i * 4 + 2] / quantum);
    bucketOf[i] = (qr << 16) | (qg << 8) | qb;
  }

  // 2. Flood fill (4-connected) over equal buckets.
  const regionOf = new Int32Array(n).fill(-1);
  const regions = [];
  const stack = [];
  for (let s = 0; s < n; s++) {
    if (!isFg(pixels, s) || regionOf[s] !== -1) continue;
    const bucket = bucketOf[s];
    const rid = regions.length;
    let area = 0, sx = 0, sy = 0, perim = 0;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    const hist = new Map();
    stack.push(s);
    regionOf[s] = rid;
    while (stack.length) {
      const p = stack.pop();
      const x = p % w, y = (p / w) | 0;
      area++; sx += x; sy += y;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      const key = (pixels[p * 4] << 16) | (pixels[p * 4 + 1] << 8) | pixels[p * 4 + 2];
      hist.set(key, (hist.get(key) || 0) + 1);
      // 4 neighbors with row-wrap + bounds guards
      if (x > 0) tryGrow(p - 1); else perim++;
      if (x < w - 1) tryGrow(p + 1); else perim++;
      if (y > 0) tryGrow(p - w); else perim++;
      if (y < h - 1) tryGrow(p + w); else perim++;
      function tryGrow(q) {
        if (!isFg(pixels, q)) { perim++; return; }
        if (regionOf[q] !== -1) return; // visited (any region): not our problem here
        if (bucketOf[q] === bucket) { regionOf[q] = rid; stack.push(q); }
        else perim++;
      }
    }
    let modeKey = 0, modeCount = -1;
    for (const [k, c] of hist) if (c > modeCount) { modeCount = c; modeKey = k; }
    regions.push({
      bucket,
      color: hex2((modeKey >> 16) & 255) + hex2((modeKey >> 8) & 255) + hex2(modeKey & 255),
      cx: sx / area / w, cy: sy / area / h,
      x0: x0 / w, y0: y0 / h, x1: (x1 + 1) / w, y1: (y1 + 1) / h,
      area, perim, alive: true,
    });
  }

  // 3. Symmetric adjacency: shared border length between region pairs.
  //    (Built in a second pass so fill order can't hide an edge.)
  const adj = regions.map(() => new Map());
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const r = regionOf[p];
      if (r === -1) continue;
      if (x < w - 1) link(p, p + 1);
      if (y < h - 1) link(p, p + w);
    }
  }
  function link(p, q) {
    const a = regionOf[p], b = regionOf[q];
    if (a === -1 || b === -1 || a === b) return;
    adj[a].set(b, (adj[a].get(b) || 0) + 1);
    adj[b].set(a, (adj[b].get(a) || 0) + 1);
  }

  // 4. Absorb edge slivers (AA bands): thin regions merge into the neighbor
  //    sharing their longest border. Isolated thin marks are kept — they're
  //    real artwork, not edges.
  const parent = regions.map((_, i) => i);
  const find = (i) => { let r = i; while (parent[r] !== r) r = parent[r]; return r; };
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    for (let i = 0; i < regions.length; i++) {
      const ri = find(i);
      if (ri !== i || !regions[ri].alive) continue;
      const r = regions[ri];
      if (r.perim === 0 || r.area / r.perim >= SLIVER_RATIO) continue;
      let best = -1, bestLen = 0;
      for (const [nb, len] of adj[ri]) {
        const rn = find(nb);
        if (rn === ri || !regions[rn].alive) continue;
        if (len > bestLen) { bestLen = len; best = rn; }
      }
      if (best === -1) continue;
      const t = regions[best];
      const total = t.area + r.area;
      t.cx = (t.cx * t.area + r.cx * r.area) / total;
      t.cy = (t.cy * t.area + r.cy * r.area) / total;
      t.x0 = Math.min(t.x0, r.x0); t.y0 = Math.min(t.y0, r.y0);
      t.x1 = Math.max(t.x1, r.x1); t.y1 = Math.max(t.y1, r.y1);
      t.area = total;
      t.perim = Math.max(1, t.perim + r.perim - 2 * bestLen);
      for (const [nb, len] of adj[ri]) {
        const rn = find(nb);
        if (rn === best || rn === ri || !regions[rn].alive) continue;
        adj[best].set(rn, (adj[best].get(rn) || 0) + len);
        adj[rn].set(best, (adj[rn].get(best) || 0) + len);
        adj[rn].delete(ri);
      }
      adj[best].delete(ri);
      r.alive = false;
      parent[ri] = best;
      changed = true;
    }
    if (!changed) break;
  }

  // 5. Drop sub-minimum specks that absorption couldn't merge: isolated AA
  //    pixels (alpha ≥ cutoff, surrounded by sub-cutoff alpha) have no
  //    adjacent region, so there is nothing to absorb them into. Matt Q1:
  //    minimum region size is explicit — these are not artwork.
  const minArea = opts.minArea ?? minAreaFor(w, h);
  for (let i = 0; i < regions.length; i++) {
    const ri = find(i);
    if (ri !== i || !regions[ri].alive) continue;
    // Leave the parent chain intact: the idMap pass maps dead roots to -1.
    if (regions[ri].area < minArea) regions[ri].alive = false;
  }

  // 6. Stable IDs: rm-<color>-<gx>-<gy> on an 8x8 nearest grid; deterministic
  //    disambiguator when color+cell collide.
  const alive = regions.filter((r) => r.alive);
  alive.sort((a, b) => (a.cy - b.cy) || (a.cx - b.cx));
  const used = new Set();
  const finalIndex = new Map();
  for (const r of alive) {
    const gx = Math.max(0, Math.min(POS_GRID - 1, Math.round(r.cx * POS_GRID)));
    const gy = Math.max(0, Math.min(POS_GRID - 1, Math.round(r.cy * POS_GRID)));
    let id = `rm-${r.color}-${gx}-${gy}`;
    let k = 2;
    while (used.has(id)) id = `rm-${r.color}-${gx}-${gy}-${k++}`;
    used.add(id);
    r.id = id;
    finalIndex.set(regions.indexOf(r), alive.indexOf(r));
  }

  // Optional pixel→region map for hit-testing (picking UI). Values index
  // into the returned regions array; -1 = no region.
  let idMap = null;
  if (opts.wantMap) {
    idMap = new Int32Array(n).fill(-1);
    const rootToFinal = new Map();
    for (let i = 0; i < regions.length; i++) {
      if (regions[i].alive) rootToFinal.set(find(i), finalIndex.get(i));
    }
    for (let i = 0; i < n; i++) {
      const r = regionOf[i];
      if (r !== -1) idMap[i] = rootToFinal.get(find(r)) ?? -1;
    }
  }

  return {
    regions: alive.map((r) => ({
      id: r.id, color: r.color, cx: r.cx, cy: r.cy,
      x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1, area: r.area,
    })),
    width: w,
    height: h,
    ...(idMap ? { idMap } : {}),
  };
}
