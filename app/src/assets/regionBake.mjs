// regionBake.mjs — #1432: the build-time region-matte bake for the built-in asset library. Node only (resvg).
//
// Every built-in asset gets the cryptomatte-style break-apart that imports have had since #725: the SAME detector
// (regionMattes.detectRegions) over the SAME canonical raster the browser uses (regionRaster.js: var(--ink) -> #000000,
// var(--accent) -> #ff2d95, 200 px over the 100-unit box), run once here and committed as data. No runtime detection
// cost, and the diff is reviewable asset by asset.
//
//   cap       at most REGION_CAP (8) regions per asset: the largest are kept and each of the rest is merged into the
//             nearest kept region (area, bbox and centroid combine; the kept region's id stays)
//   slots     A..D take the first four kept regions in READING ORDER (top-left first). No colour is invented: a region
//             is only ever the colour the asset already draws.
//   nothing   an asset that rasterizes to nothing gets no entry: it stays byte-identical to today
// Deterministic: the same SVGs give the same bytes (the selfcheck re-runs it against the committed data).
import { Resvg } from '@resvg/resvg-js';
import { detectRegions } from './regionMattes.js';
import { REGION_SLOTS, normalizeRegionSlots } from './regionSlots.js';

export const REGION_CAP = 8;
export const BAKE_PX = 200;
/** Rows of reading order: regions whose centres are within this share of the height read as one line, left to right. */
const ROW_BAND = 0.15;

const INK_CSS = /var\(--ink[^)]*\)/g;
const ACCENT_CSS = /var\(--accent[^)]*\)/g;

/** The same canonical SVG the browser rasterizes (regionRaster.js canonicalSvg). */
export function canonicalSvg(svg) {
  const body = String(svg || '').replace(INK_CSS, '#000000').replace(ACCENT_CSS, '#ff2d95');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${BAKE_PX}" height="${BAKE_PX}">${body}</svg>`;
}

/** Merge `from` into `into` (area-weighted centroid, union bbox). The kept region's id and colour stay. */
function absorb(into, from) {
  const total = into.area + from.area;
  into.cx = (into.cx * into.area + from.cx * from.area) / total;
  into.cy = (into.cy * into.area + from.cy * from.area) / total;
  into.x0 = Math.min(into.x0, from.x0); into.y0 = Math.min(into.y0, from.y0);
  into.x1 = Math.max(into.x1, from.x1); into.y1 = Math.max(into.y1, from.y1);
  into.area = total;
}

/** Keep the REGION_CAP largest (ties: the earlier in the detector's order); merge the rest into the nearest kept. */
export function capRegions(regions, cap = REGION_CAP) {
  if (regions.length <= cap) return regions.map((r) => ({ ...r }));
  const order = regions.map((r, i) => ({ r, i })).sort((a, b) => b.r.area - a.r.area || a.i - b.i);
  const kept = order.slice(0, cap).map((e) => ({ ...e.r }));
  for (const e of order.slice(cap)) {
    let best = kept[0]; let bd = Infinity;
    for (const k of kept) {
      const d = (k.cx - e.r.cx) ** 2 + (k.cy - e.r.cy) ** 2;
      if (d < bd - 1e-12) { bd = d; best = k; }
    }
    absorb(best, e.r);
  }
  // back to the detector's own order, so the output reads the same however the sizes fall
  const keptIds = new Set(kept.map((k) => k.id));
  return regions.filter((r) => keptIds.has(r.id)).map((r) => kept.find((k) => k.id === r.id));
}

/** Reading order: top-left first, by line then left to right. Pure. */
export function readingOrder(regions) {
  return regions.map((r, i) => ({ r, i })).sort((a, b) => {
    const ra = Math.floor(a.r.cy / ROW_BAND); const rb = Math.floor(b.r.cy / ROW_BAND);
    return ra - rb || a.r.cx - b.r.cx || a.i - b.i;
  }).map((e) => e.r);
}

/** The round-trip shape: numbers to 6 places (the renderer never sees more), the same keys normalizeRegions keeps. */
const q = (v) => Math.round(v * 1e6) / 1e6;
const clean = (r) => ({ id: r.id, color: r.color, cx: q(r.cx), cy: q(r.cy), x0: q(r.x0), y0: q(r.y0), x1: q(r.x1), y1: q(r.y1), area: r.area });

/**
 * One asset's matte: { regions, regionSlots } or null when it rasterizes to nothing.
 * `regions` are in reading order; `regionSlots` maps A..D to the first four.
 */
export function bakeAsset(svg) {
  const img = new Resvg(canonicalSvg(svg)).render();
  const px = new Uint8Array(img.pixels);
  const { regions } = detectRegions(px, img.width, img.height);
  if (!regions.length) return null;
  const ordered = readingOrder(capRegions(regions)).map(clean);
  const raw = {};
  REGION_SLOTS.forEach((s, i) => { if (ordered[i]) raw[s] = ordered[i].id; });
  return { regions: ordered, regionSlots: normalizeRegionSlots(raw) }; // the validator's own shape: A..D, empty = null
}

/** The whole library: { [assetId]: { regions, regionSlots } } for the assets that have any, in catalogue order. */
export function bakeLibrary(assets) {
  const out = {};
  for (const a of assets) {
    const m = bakeAsset(a.svg);
    if (m) out[a.id] = m;
  }
  return out;
}

/** The committed data module's text (stable: catalogue order, 2-space JSON). */
export function renderModule(baked) {
  return `// GENERATED by app/scripts/bakeRegionMattes.mjs (#1432). Do not edit: re-run \`npm run bake:regions\`.
// Region mattes (#725) for the built-in asset library: the same cryptomatte-style break-apart user imports get.
// Keyed by asset id; only assets that draw something have an entry. regionMattes.selfcheck-style fixtures and the
// bit-for-bit re-run check live in regionBake.selfcheck.mjs.
export const BAKED_REGIONS = ${JSON.stringify(baked, null, 1)};
`;
}

/** Per-asset report: counts and the summed normalized bbox area (the "atlas bbox area totals"). */
export function renderReport(baked, total) {
  const rows = Object.entries(baked).map(([id, m]) => {
    const bbox = m.regions.reduce((s, r) => s + (r.x1 - r.x0) * (r.y1 - r.y0), 0);
    return { id, n: m.regions.length, bbox };
  });
  const hist = {};
  for (const r of rows) hist[r.n] = (hist[r.n] || 0) + 1;
  const lines = [
    '# Region mattes: bake report (#1432)',
    '',
    `Assets in the library: ${total}. With regions: ${rows.length}. Without (rasterize to nothing): ${total - rows.length}.`,
    `Region cap: ${REGION_CAP}. Regions in total: ${rows.reduce((s, r) => s + r.n, 0)}.`,
    `Count histogram (regions per asset: assets): ${Object.keys(hist).sort((a, b) => a - b).map((k) => `${k}: ${hist[k]}`).join(', ')}.`,
    `Summed region bbox area (fractions of the 100-unit box): ${rows.reduce((s, r) => s + r.bbox, 0).toFixed(3)}.`,
    '',
    '| asset | regions | bbox area |',
    '|---|---:|---:|',
    ...rows.map((r) => `| ${r.id} | ${r.n} | ${r.bbox.toFixed(3)} |`),
    '',
  ];
  return lines.join('\n');
}
