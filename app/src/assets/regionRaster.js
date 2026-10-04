/**
 * regionRaster.js — #725 slice 2 (browser): rasterize an asset SVG and run
 * region detection, with an in-memory cache for picking hit-tests.
 *
 * Canonical colors: var(--ink) → #000000, var(--accent) → #ff2d95 (the same
 * accent ingest normalizes away, so raw art never collides with it).
 * Raster is 200x200 over the 100x100 asset box — the same viewBox the pool
 * thumbnails use.
 *
 * Not in the selfcheck manifest: needs DOM/canvas.
 */
import { detectRegions } from './regionMattes.js';

export const REGION_RASTER_PX = 200;

const INK_CSS = /var\(--ink[^)]*\)/g;
const ACCENT_CSS = /var\(--accent[^)]*\)/g;

/** In-memory cache: key → { regions, idMap, w, h }. Rebuilt on demand. */
const cache = new Map();
const cacheKey = (svg) => `${svg.length}:${hashStr(svg)}`;

function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function canonicalSvg(svg) {
  const body = String(svg || '').replace(INK_CSS, '#000000').replace(ACCENT_CSS, '#ff2d95');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${REGION_RASTER_PX}" height="${REGION_RASTER_PX}">${body}</svg>`;
}

function loadImage(svgText) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

/**
 * Rasterize + detect. Returns { regions, idMap, w, h }.
 * idMap values index into regions (-1 = no region) — for click hit-testing.
 */
export async function rasterizeRegions(svg) {
  const key = cacheKey(String(svg || ''));
  const hit = cache.get(key);
  if (hit) return hit;
  const img = await loadImage(canonicalSvg(svg));
  const canvas = document.createElement('canvas');
  canvas.width = REGION_RASTER_PX;
  canvas.height = REGION_RASTER_PX;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, REGION_RASTER_PX, REGION_RASTER_PX);
  ctx.drawImage(img, 0, 0, REGION_RASTER_PX, REGION_RASTER_PX);
  const px = ctx.getImageData(0, 0, REGION_RASTER_PX, REGION_RASTER_PX).data;
  const { regions, idMap, width, height } = detectRegions(px, REGION_RASTER_PX, REGION_RASTER_PX, { wantMap: true });
  const out = { regions, idMap, w: width, h: height };
  if (cache.size > 64) cache.clear();
  cache.set(key, out);
  return out;
}

/** Synchronous hit-test against a cached rasterization. Returns region id or null. */
export function regionAt(cached, x, y) {
  if (!cached || !cached.idMap) return null;
  const ix = Math.max(0, Math.min(cached.w - 1, Math.floor(x)));
  const iy = Math.max(0, Math.min(cached.h - 1, Math.floor(y)));
  const idx = cached.idMap[iy * cached.w + ix];
  return idx >= 0 ? cached.regions[idx].id : null;
}

export function clearRegionCache() {
  cache.clear();
}

const pending = new Map();

/**
 * Fire-and-forget region detection for an asset id. Deduplicates in-flight
 * work per key; calls cb(id, regions) on success. Failures are silent —
 * regions are enhancement metadata, never load-bearing.
 */
export function queueRegionDetect(id, svg, cb) {
  const key = `${id}:${cacheKey(String(svg || ''))}`;
  if (pending.has(key)) return;
  const p = rasterizeRegions(svg)
    .then((r) => cb(id, r.regions))
    .catch(() => {})
    .finally(() => pending.delete(key));
  pending.set(key, p);
}
