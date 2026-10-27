/**
 * regionPartition.js — #1433 (per-region animation R2): the pixel-level
 * region partition behind the atlas region cells. Pure (no DOM, no GL,
 * no rasterizer): callers hand it a canonical raster (200x200 over the
 * 100-unit asset box, ink #000000 / accent #ff2d95 — the raster #725
 * detection is defined over) plus the asset's committed region records,
 * and get back which record owns every pixel.
 *
 * The committed records are the authority (geometry, ids, cap merges —
 * #1432's bake). Detection runs again here because the records alone
 * don't say which PIXELS each merged region owns: capRegions merged by
 * geometry, so the pixel assignment replays the same merge over the
 * detector's idMap (capRegionsTracked — the one implementation of the
 * cap merge; regionBake.mjs builds its records on it).
 *
 * Owner values index into the records array; -1 is the remainder —
 * background, sub-minimum specks, and any ink the detector didn't claim.
 * Region cells + the remainder cell tile the whole mark exactly: every
 * foreground pixel belongs to precisely one part.
 */

import { detectRegions } from './regionMattes.js';

/** Merge `from` into `into` (area-weighted centroid, union bbox). The kept region's id and colour stay. */
function absorbInto(into, from) {
  const total = into.area + from.area;
  into.cx = (into.cx * into.area + from.cx * from.area) / total;
  into.cy = (into.cy * into.area + from.cy * from.area) / total;
  into.x0 = Math.min(into.x0, from.x0);
  into.y0 = Math.min(into.y0, from.y0);
  into.x1 = Math.max(into.x1, from.x1);
  into.y1 = Math.max(into.y1, from.y1);
  into.area = total;
}

/**
 * The #1432 cap merge, tracked: keep the `cap` largest regions (ties:
 * the earlier in the detector's order) and merge each of the rest into
 * the nearest kept region (nearest by CURRENT centroid — a kept region's
 * centroid moves as it absorbs, exactly as regionBake's bake does).
 *
 * @returns {{ kept: Array, assign: number[] }} kept records in detector
 *   order (absorbed geometry included); assign[i] = index into kept for
 *   detected region i (kept regions assign to themselves).
 */
export function capRegionsTracked(regions, cap) {
  const work = regions.map((r) => ({ ...r }));
  if (work.length <= cap) {
    return { kept: work, assign: work.map((_, i) => i) };
  }
  const order = work.map((r, i) => ({ r, i })).sort((a, b) => b.r.area - a.r.area || a.i - b.i);
  const keptIdx = new Set(order.slice(0, cap).map((e) => e.i));
  const keptWork = order.slice(0, cap).map((e) => e.r);
  const absorbedInto = new Map(); // work object -> kept work object
  for (const e of order.slice(cap)) {
    let best = keptWork[0];
    let bd = Infinity;
    for (const k of keptWork) {
      const d = (k.cx - e.r.cx) ** 2 + (k.cy - e.r.cy) ** 2;
      if (d < bd - 1e-12) {
        bd = d;
        best = k;
      }
    }
    absorbInto(best, e.r);
    absorbedInto.set(e.r, best);
  }
  const kept = work.filter((_, i) => keptIdx.has(i)); // detector order, absorbed values
  const pos = new Map(kept.map((r, k) => [r, k]));
  const assign = work.map((r, i) => (keptIdx.has(i) ? pos.get(r) : pos.get(absorbedInto.get(r))));
  return { kept, assign };
}

/**
 * Build the pixel partition for one asset from a detection result.
 *
 * @param {Array} detected — detectRegions() records (wantMap order)
 * @param {Int32Array} idMap — pixel -> detected index (-1 = none)
 * @param {number} w @param {number} h — raster size
 * @param {Array} records — the asset's committed region records (authority)
 * @returns {{ regions: Array, owner: Int16Array, matched: number, drifted: number }}
 *   owner[p] = index into records, or -1 (remainder). `matched` counts
 *   records whose id the capped detection reproduced; `drifted` counts
 *   pixels assigned by the nearest-centroid fallback (a rasterizer whose
 *   detection disagrees with the committed bake — the Node/resvg path
 *   must report 0; the browser canvas path may wobble at AA edges).
 */
export function partitionFromDetection(detected, idMap, w, h, records) {
  const owner = new Int16Array(w * h).fill(-1);
  if (!detected.length || !idMap || !Array.isArray(records) || !records.length) {
    return { regions: records || [], owner, matched: 0, drifted: 0 };
  }
  // Cap the fresh detection to the record count, then match kept regions
  // to records by id. An unmatched kept region (rasterizer drift) folds
  // into the nearest record by centroid — pixels are never lost.
  const { kept, assign } = capRegionsTracked(detected, records.length);
  const recordById = new Map(records.map((r, i) => [r.id, i]));
  const keptToRecord = kept.map((k) => {
    const hit = recordById.get(k.id);
    if (hit !== undefined) return hit;
    let best = 0;
    let bd = Infinity;
    records.forEach((r, i) => {
      const d = (r.cx - k.cx) ** 2 + (r.cy - k.cy) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  });
  const matched = new Set(kept.filter((k) => recordById.has(k.id)).map((k) => recordById.get(k.id))).size;
  let drifted = 0;
  for (let p = 0; p < w * h; p++) {
    const d = idMap[p];
    if (d < 0) continue;
    const k = assign[d];
    if (k === undefined) continue;
    if (!recordById.has(kept[k].id)) drifted++;
    owner[p] = keptToRecord[k];
  }
  return { regions: records, owner, matched, drifted };
}

/**
 * Detect + partition in one call (the Node/resvg path).
 * @param {Uint8Array|Uint8ClampedArray} pixels — canonical 200x200 raster
 */
export function buildRegionPartition(pixels, w, h, records) {
  const { regions, idMap } = detectRegions(pixels, w, h, { wantMap: true });
  return partitionFromDetection(regions, idMap, w, h, records);
}

/**
 * The atlas-cell geometry of one region (#1433): the region's pixels are
 * baked into their own cell, in a frame CENTRED on the region centroid,
 * so a region-instance is an ordinary instance whose origin (the kineme
 * pivot) sits exactly on the centroid and whose quad covers the smallest
 * centroid-centred rect containing the region bbox.
 *
 * Cell space is the atlas cell: 400 px over asset units [-50, 150] (2 px
 * per unit; the 100-unit asset box occupies px [100, 300)). All inputs
 * are the record's normalized 0..1 geometry.
 *
 * @returns {{ x0: number, y0: number, w: number, h: number,
 *   pivotX: number, pivotY: number, scaleX: number, scaleY: number }}
 *   x0/y0/w/h: the source rect in whole-cell px (integers, inside the
 *   cell, centred on the rounded centroid px). pivotX/pivotY: the pivot
 *   in asset units. scaleX/scaleY: per-axis scale vs the quad shader's
 *   199.5-unit span — the pack multiplies the mark's scale by these.
 */
export function regionCellGeometry(region) {
  const px = (v) => 100 + v * 200; // normalized -> cell px
  const cx = Math.round(px(region.cx));
  const cy = Math.round(px(region.cy));
  let hw = Math.ceil(Math.max(cx - px(region.x0), px(region.x1) - cx));
  let hh = Math.ceil(Math.max(cy - px(region.y0), px(region.y1) - cy));
  // A valid record's bbox lives inside the box, so the rect already fits
  // the cell; clamp anyway so a malformed record can never bake outside.
  hw = Math.max(1, Math.min(hw, cx, 400 - cx));
  hh = Math.max(1, Math.min(hh, cy, 400 - cy));
  const w = hw * 2;
  const h = hh * 2;
  return {
    x0: cx - hw,
    y0: cy - hh,
    w,
    h,
    pivotX: (cx - 100) / 2,
    pivotY: (cy - 100) / 2,
    scaleX: w / 2 / 199.5,
    scaleY: h / 2 / 199.5,
  };
}
