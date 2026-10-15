// regionBake.mjs — #1432: the build-time region-matte bake for the built-in asset library. Node only (resvg).
//
// Every built-in asset gets the cryptomatte-style break-apart that imports have had since #725: the SAME detector
// (regionMattes.detectRegions) over the SAME canonical raster the browser uses (regionRaster.js: var(--ink) -> #000000,
// var(--accent) -> #ff2d95, 200 px over the 100-unit box), run once here and committed as data. No runtime detection
// cost, and the diff is reviewable asset by asset.
//
//   cap       at most REGION_CAP (12) regions per asset: the largest are kept and each of the rest is merged into the
//             nearest kept region (area, bbox and centroid combine; the kept region's id stays). 12 is Matt's
//             amended ruling (2026-10-14, on #1433): tagging is data — up to 12 on every machine — and the
//             GOVERNOR selects which tagged regions animate live (up to 12 desktop, up to 8 iPad-class).
//   slots     A..D take the first four kept regions in READING ORDER (top-left first). No colour is invented: a region
//             is only ever the colour the asset already draws.
//   nothing   an asset that rasterizes to nothing gets no entry: it stays byte-identical to today
//   defaults  #1434: each entry also carries the family-default region kinemes (data/regionDefaults.js — flora
//             sways/pulses, radial pulses, linework bobs; other families none), the same defaults an import
//             receives on arrival. Deterministic from the capped records + category.
// Deterministic: the same SVGs give the same bytes (the selfcheck re-runs it against the committed data).
import { Resvg } from '@resvg/resvg-js';
import { detectRegions } from './regionMattes.js';
import { REGION_SLOTS, normalizeRegionSlots } from './regionSlots.js';
import { capRegionsTracked } from './regionPartition.js';
import { familyDefaultRegionKinemes } from '../data/regionDefaults.js';

export const REGION_CAP = 12;
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

/** Keep the REGION_CAP largest (ties: the earlier in the detector's order); merge the rest into the nearest kept.
 *  The merge itself lives in regionPartition.js (capRegionsTracked) — one implementation, shared with the
 *  renderer's pixel partition (#1433); this wrapper keeps the bake's record-only shape. */
export function capRegions(regions, cap = REGION_CAP) {
  return capRegionsTracked(regions, cap).kept;
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

/** The whole library: { [assetId]: { regions, regionSlots, regionKinemes? } } for the assets that have any, in catalogue order.
 *  #1434 — each entry also carries the family-default region kinemes (data/regionDefaults.js: deterministic from the
 *  capped records + the asset's category), written only when the family table names one. This is the same defaults
 *  step imports get on arrival (tagImportedRegions) — one pipeline, two doors. */
export function bakeLibrary(assets) {
  const out = {};
  for (const a of assets) {
    const m = bakeAsset(a.svg);
    if (!m) continue;
    const defaults = familyDefaultRegionKinemes(a, m.regions);
    out[a.id] = defaults ? { ...m, regionKinemes: defaults } : m;
  }
  return out;
}

/** The committed data module's text (stable: catalogue order, 2-space JSON). */
export function renderModule(baked) {
  return `// GENERATED by app/scripts/bakeRegionMattes.mjs (#1432). Do not edit: re-run \`npm run bake:regions\`.
// Region mattes (#725) for the built-in asset library: the same cryptomatte-style break-apart user imports get.
// Entries may also carry regionKinemes — the family-default per-region motion (#1434), deterministic from the
// records + the asset's category (data/regionDefaults.js). Keyed by asset id; only assets that draw something
// have an entry. regionMattes.selfcheck-style fixtures and the bit-for-bit re-run check live in regionBake.selfcheck.mjs.
export const BAKED_REGIONS = ${JSON.stringify(baked, null, 1)};
`;
}

/** Per-asset report: counts and the summed normalized bbox area (the "atlas bbox area totals"),
 *  plus the #1434 family-default assignment counts (assets = the catalogue, for categories). */
export function renderReport(baked, assets) {
  const total = assets.length;
  const catOf = new Map(assets.map((a) => [a.id, a.category]));
  const rows = Object.entries(baked).map(([id, m]) => {
    const bbox = m.regions.reduce((s, r) => s + (r.x1 - r.x0) * (r.y1 - r.y0), 0);
    return { id, n: m.regions.length, bbox, assigned: m.regionKinemes ? Object.keys(m.regionKinemes).length : 0 };
  });
  const hist = {};
  for (const r of rows) hist[r.n] = (hist[r.n] || 0) + 1;
  const famAssign = {};
  let assignedRegions = 0;
  for (const r of rows) {
    if (!r.assigned) continue;
    assignedRegions += r.assigned;
    const cat = catOf.get(r.id) || '?';
    famAssign[cat] = famAssign[cat] || { assets: 0, regions: 0 };
    famAssign[cat].assets += 1; famAssign[cat].regions += r.assigned;
  }
  const famLine = Object.keys(famAssign).sort().map((c) => `${c}: ${famAssign[c].assets} assets / ${famAssign[c].regions} regions`).join(', ');
  const lines = [
    '# Region mattes: bake report (#1432)',
    '',
    `Assets in the library: ${total}. With regions: ${rows.length}. Without (rasterize to nothing): ${total - rows.length}.`,
    `Region cap: ${REGION_CAP}. Regions in total: ${rows.reduce((s, r) => s + r.n, 0)}.`,
    `Count histogram (regions per asset: assets): ${Object.keys(hist).sort((a, b) => a - b).map((k) => `${k}: ${hist[k]}`).join(', ')}.`,
    `Summed region bbox area (fractions of the 100-unit box): ${rows.reduce((s, r) => s + r.bbox, 0).toFixed(3)}.`,
    `Family-default region kinemes (#1434): ${assignedRegions} regions assigned across ${rows.filter((r) => r.assigned).length} assets (${famLine}).`,
    '',
    '| asset | regions | bbox area | assigned |',
    '|---|---:|---:|---:|',
    ...rows.map((r) => `| ${r.id} | ${r.n} | ${r.bbox.toFixed(3)} | ${r.assigned} |`),
    '',
  ];
  return lines.join('\n');
}
