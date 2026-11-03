// assets/assetTraits.js — #1942 (asset descriptors, slice 1 of #1941): MEASURED traits of an asset's drawing.
//
// Six numbers in [0, 1], each a pure function of the ink mask of the asset's canonical raster (the 200 px raster the
// region bake reads: assets/regionBake.mjs canonicalSvg in Node, assets/regionRaster.js in the browser). Measurements,
// never taste verdicts:
//
//   elong   principal-axis elongation from the mask's second moments: 0 = round / square, → 1 = a line
//   fill    ink area / convex-hull area: 1 = a solid convex mass, → 0 = open linework or scattered marks
//   stroke  stroke-likeness: the ink's mean half-thickness (area / perimeter) against a disc of the same area; a disc
//           is 0, a thin line → 1
//   sym     the best mirror symmetry (vertical or horizontal axis through the ink's bounding-box centre), as IoU
//   busy    visual busyness: how far the outline wanders (perimeter² / 4π·area, log-scaled) and how many separate
//           pieces the ink falls into
//   mass    ink coverage of the whole box: a big shape → 1, a small mark → 0
//
// Browser-safe and pure. Every trait is rounded to 3 places; an empty drawing measures all zeros.

/** Alpha at or above this is ink (the region detector's own cutoff). */
export const INK_ALPHA = 24;
/** The canonical raster's size (assets/regionRaster.js REGION_RASTER_PX / assets/regionBake.mjs BAKE_PX). */
export const TRAIT_RASTER_PX = 200;
/** The trait names, in the record's order. */
export const TRAIT_NAMES = Object.freeze(['elong', 'fill', 'stroke', 'sym', 'busy', 'mass']);

const r3 = (n) => Math.round(n * 1000) / 1000;
const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);
const ZERO = Object.freeze({ elong: 0, fill: 0, stroke: 0, sym: 0, busy: 0, mass: 0 });

/** The ink mask of an RGBA buffer (Uint8Array, 1 = ink). */
export function inkMask(rgba, w, h) {
  const m = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (rgba[i * 4 + 3] >= INK_ALPHA) m[i] = 1;
  return m;
}

/** Convex hull area (pixel-centre lattice) from each row's leftmost / rightmost ink pixel — Andrew's monotone chain. */
function hullArea(mask, w, h) {
  const pts = [];
  for (let y = 0; y < h; y++) {
    let lo = -1;
    let hi = -1;
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      if (lo < 0) lo = x;
      hi = x;
    }
    if (lo >= 0) {
      // the pixel's corners, so a one-pixel-wide line still has area
      pts.push([lo, y], [hi + 1, y], [lo, y + 1], [hi + 1, y + 1]);
    }
  }
  if (pts.length < 3) return 0;
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  let a = 0;
  for (let i = 0; i < hull.length; i++) {
    const [x1, y1] = hull[i];
    const [x2, y2] = hull[(i + 1) % hull.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

/** 8-connected component count (stack flood fill). */
function components(mask, w, h) {
  const seen = new Uint8Array(w * h);
  const stack = [];
  let n = 0;
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || seen[s]) continue;
    n++;
    seen[s] = 1;
    stack.push(s);
    while (stack.length) {
      const p = stack.pop();
      const x = p % w;
      const y = (p / w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (mask[q] && !seen[q]) {
            seen[q] = 1;
            stack.push(q);
          }
        }
      }
    }
  }
  return n;
}

/**
 * The six traits of an RGBA raster (Uint8Array / Uint8ClampedArray, w × h, straight or premultiplied alpha — only the
 * alpha channel is read, so the browser canvas and Node's resvg agree up to anti-aliasing at the ink's edge).
 */
export function traitsFromRaster(rgba, w, h) {
  const mask = inkMask(rgba, w, h);
  let area = 0;
  let sx = 0;
  let sy = 0;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  let perim = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      area++;
      sx += x;
      sy += y;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      // 4-neighbour edges facing empty space (or the raster's edge)
      if (x === 0 || !mask[y * w + x - 1]) perim++;
      if (x === w - 1 || !mask[y * w + x + 1]) perim++;
      if (y === 0 || !mask[(y - 1) * w + x]) perim++;
      if (y === h - 1 || !mask[(y + 1) * w + x]) perim++;
    }
  }
  if (area < 4) return { ...ZERO };

  // elongation from the covariance's eigenvalues
  const mx = sx / area;
  const my = sy / area;
  let cxx = 0;
  let cyy = 0;
  let cxy = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!mask[y * w + x]) continue;
      const dx = x - mx;
      const dy = y - my;
      cxx += dx * dx;
      cyy += dy * dy;
      cxy += dx * dy;
    }
  }
  cxx /= area;
  cyy /= area;
  cxy /= area;
  const tr = cxx + cyy;
  const disc = Math.sqrt(Math.max(0, ((cxx - cyy) / 2) ** 2 + cxy * cxy));
  const lmax = tr / 2 + disc;
  const lmin = Math.max(0, tr / 2 - disc);
  const elong = lmax > 0 ? 1 - Math.sqrt(lmin / lmax) : 0;

  const hull = hullArea(mask, w, h);
  const fill = hull > 0 ? clamp01(area / hull) : 0;

  // a disc of area A has A/P = r/2 = sqrt(A/π)/2; thinner ink has a smaller ratio
  const discRatio = Math.sqrt(area / Math.PI) / 2;
  const stroke = clamp01(1 - area / perim / discRatio);

  // mirror symmetry about the bounding box's centre lines
  const cx2 = x0 + x1; // mirrored x = cx2 - x
  const cy2 = y0 + y1;
  let interV = 0;
  let interH = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!mask[y * w + x]) continue;
      if (mask[y * w + (cx2 - x)]) interV++;
      if (mask[(cy2 - y) * w + x]) interH++;
    }
  }
  // the mirror has the same area, so IoU = inter / (2·area − inter)
  const iou = (inter) => inter / (2 * area - inter);
  const sym = Math.max(iou(interV), iou(interH));

  const compact = (perim * perim) / (4 * Math.PI * area); // a disc ≈ 1 (a little more on the pixel lattice)
  const wander = clamp01(Math.log(Math.max(1, compact)) / Math.log(60));
  const pieces = clamp01((components(mask, w, h) - 1) / 12);
  const busy = clamp01(0.6 * wander + 0.4 * pieces);

  const mass = clamp01(area / (w * h));

  return {
    elong: r3(clamp01(elong)),
    fill: r3(fill),
    stroke: r3(stroke),
    sym: r3(clamp01(sym)),
    busy: r3(busy),
    mass: r3(mass),
  };
}

/** The trust boundary for a stored traits record (an import's, from the document): six numbers in [0, 1], or null. */
export function sanitizeTraits(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (const k of TRAIT_NAMES) {
    const v = raw[k];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) return null;
    out[k] = r3(v);
  }
  return out;
}
