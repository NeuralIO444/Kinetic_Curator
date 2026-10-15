/**
 * Texture atlas baker — Phase 1 (#187). Node-only (uses resvg).
 *
 * Bakes (asset, ink, accent) combinations into a single premultiplied-RGBA
 * atlas using the exact same substitution and rasterizer as the SVG
 * reference path (studio/render.mjs), so baked texels match the reference
 * analytically — the only divergence is GPU resampling, which the bake
 * resolution keeps inside the parity tolerance.
 *
 * Cell layout: each cell covers the asset-unit rect [-50,-50]x[150,150]
 * (the 100x100 asset box plus 50 units of padding — the largest measured
 * asset overflow is ~15.5 units, see asset audit in #187 notes). Baked at
 * 400x400 px (2 px/unit; ~10x supersample of typical on-screen size).
 *
 * Also measures the per-combo ink bounding box (alpha > 4/255) in asset
 * units — the renderer uses it for SVG filter-region clipping.
 */

import { Resvg } from '@resvg/resvg-js';
import { ASSETS } from '../data/assets/index.js';
import { applyGradient } from '../assets/gradient.js';
import { stripFramesFor } from '../data/cellKinemes.js';
import { buildRegionPartition, regionCellGeometry } from '../assets/regionPartition.js';
import { canonicalSvg } from '../assets/regionBake.mjs';

const ASSET_BY_ID = new Map(ASSETS.map((a) => [a.id, a]));

/** Asset units covered by one cell: [x0, y0, x1, y1]. */
export const CELL_UNITS = Object.freeze({ x0: -50, y0: -50, x1: 150, y1: 150 });
export const CELL_PX = 400;
const ALPHA_CUTOFF = 4;

const subColors = (svg, ink, accent) =>
  svg
    .replace(/var\(--ink[^)]*\)/g, ink)
    .replace(/var\(--accent[^)]*\)/g, accent);

/**
 * Bake one asset/color combination into a CELL_PX square — or, for a
 * strip asset (#1431 KINEME C), into one wide raster holding every frame
 * side by side. Returns {pixels, ink, widthPx} where ink is the bbox in
 * asset units.
 */
function bakeCombo(assetId, ink, accent) {
  const asset = ASSET_BY_ID.get(assetId);
  if (!asset) throw new Error(`[atlas] unknown asset "${assetId}"`);
  const { x0, y0, x1, y1 } = CELL_UNITS;
  // #1431 — a strip asset bakes ALL its frames into one contiguous raster:
  // frame i is translated i frame-widths right, with NO internal gutter,
  // because cellUvWindow splits the cell rect evenly and a gutter would
  // land inside every window but the first. Frame 0 occupies exactly the
  // texels (and the viewBox segment) the single-cell bake used, so its
  // pixels are bit-identical to the pre-#1431 bake. Strip ink sits well
  // inside each frame's edges (the micro-HUD art is centered), so mip
  // box-filtering across a frame boundary never reaches ink.
  const frames = stripFramesFor(assetId);
  const n = frames ? frames.length : 1;
  const widthPx = CELL_PX * n;
  // #701 — the stills path bakes the gradient with the REAL palette colours;
  // the live path bakes the same ramp into its R/G mask. Same module, same
  // stops, so a gradient asset prints what the canvas showed.
  const body = frames
    ? frames.map((f, i) => `<g transform="translate(${(x1 - x0) * i} 0)">${subColors(applyGradient(f, asset.gradient, { ink, accent }), ink, accent)}</g>`).join('')
    : subColors(applyGradient(asset.svg, asset.gradient, { ink, accent }), ink, accent);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${CELL_PX}" ` +
    `viewBox="${x0} ${y0} ${(x1 - x0) * n} ${y1 - y0}">` +
    body +
    `</svg>`;
  const img = new Resvg(svg).render();
  const pixels = Buffer.from(img.pixels);
  // Note: no alpha-bleed. Bleeding ink RGB into transparent texels breaks
  // premultiplied mipmap filtering (saturated RGB at partial alpha reads
  // as brighter/bloated). The gutter + half-texel UVs handle edge filtering.
  // Ink bbox in asset units (for filter-region clipping). For a strip, x
  // folds back into the frame-local cell: ink stays in single-asset units,
  // the union across frames.
  let bx0 = CELL_PX, by0 = CELL_PX, bx1 = -1, by1 = -1;
  for (let y = 0; y < CELL_PX; y++) {
    for (let x = 0; x < widthPx; x++) {
      if (pixels[(y * widthPx + x) * 4 + 3] > ALPHA_CUTOFF) {
        const lx = x % CELL_PX;
        if (lx < bx0) bx0 = lx;
        if (lx > bx1) bx1 = lx;
        if (y < by0) by0 = y;
        if (y > by1) by1 = y;
      }
    }
  }
  const unitsPerPx = (x1 - x0) / CELL_PX;
  const inkBounds = bx1 >= 0
    ? [x0 + bx0 * unitsPerPx, y0 + by0 * unitsPerPx, x0 + (bx1 + 1) * unitsPerPx, y0 + (by1 + 1) * unitsPerPx]
    : null;
  return { pixels, ink: inkBounds, widthPx };
}

export const comboKey = (assetId, ink, accent) => `${assetId}|${ink}|${accent}`;

/**
 * #1433 (R2) — the region cells for one baked combo: a remainder cell
 * (the whole mark minus every region's pixels) plus one cell per tagged
 * region (its pixels only, in the centroid-centred frame
 * regionCellGeometry defines). Together with the whole cell they tile
 * the mark exactly — the partition is over the whole cell's own pixels,
 * so region + remainder bytes sum back to the whole cell's bytes.
 *
 * Strip assets are excluded: their frames are whole-mark animation
 * frames (the needle moves between them), so per-region playback is
 * incoherent there — cell kinemes own strip assets outright.
 *
 * @param {object} asset — the catalogue record (carries `regions`)
 * @param {Buffer} wholePixels — bakeCombo output for a non-strip combo
 * @param {Map} partCache — per-call partition cache keyed by asset id
 * @returns {Array<{suffix: string, cp: Buffer, uvSub: object|null, geo: object|null}>}
 */
function regionCellsFor(asset, wholePixels, partCache) {
  if (!Array.isArray(asset?.regions) || !asset.regions.length) return [];
  if (stripFramesFor(asset.id)) return [];
  let part = partCache.get(asset.id);
  if (!part) {
    const img = new Resvg(canonicalSvg(asset.svg)).render();
    part = buildRegionPartition(new Uint8Array(img.pixels), img.width, img.height, asset.regions);
    partCache.set(asset.id, part);
  }
  // Cell px -> partition owner. The 100-unit box occupies cell px
  // [100, 300) at the same 2 px/unit as the 200px canonical raster, so
  // canonical px = cell px - 100 inside the box; outside it, -1.
  const ownerAt = (x, y) =>
    x >= 100 && x < 300 && y >= 100 && y < 300 ? part.owner[(y - 100) * 200 + (x - 100)] : -1;
  const out = [];
  // The remainder: every whole-cell pixel no region owns.
  {
    const cp = Buffer.alloc(CELL_PX * CELL_PX * 4);
    for (let y = 0; y < CELL_PX; y++) {
      for (let x = 0; x < CELL_PX; x++) {
        if (ownerAt(x, y) !== -1) continue;
        const o = (y * CELL_PX + x) * 4;
        wholePixels.copy(cp, o, o, o + 4);
      }
    }
    out.push({ suffix: '#rem', cp, uvSub: null, geo: null });
  }
  // One cell per region: its pixels, cut from the centroid-centred rect
  // and centred in the slot, so the cell's content rect (uvSub) and the
  // instance geometry (geo) agree by construction.
  asset.regions.forEach((record, rIdx) => {
    const g = regionCellGeometry(record);
    const cp = Buffer.alloc(CELL_PX * CELL_PX * 4);
    const ox = Math.round((CELL_PX - g.w) / 2);
    const oy = Math.round((CELL_PX - g.h) / 2);
    for (let j = 0; j < g.h; j++) {
      for (let i = 0; i < g.w; i++) {
        if (ownerAt(g.x0 + i, g.y0 + j) !== rIdx) continue;
        const s = ((g.y0 + j) * CELL_PX + (g.x0 + i)) * 4;
        wholePixels.copy(cp, ((oy + j) * CELL_PX + (ox + i)) * 4, s, s + 4);
      }
    }
    out.push({
      suffix: `#r:${record.id}`,
      cp,
      uvSub: { ox, oy, w: g.w, h: g.h },
      geo: { px: g.pivotX, py: g.pivotY, sx: g.scaleX, sy: g.scaleY },
    });
  });
  return out;
}

/**
 * Bake an atlas for the given combos.
 * @param {Array<{asset:string, ink:string, accent:string}>} combos
 * @param {{regionAssets?: Set<string>|null}} [opts] region-cell demand:
 *   null/omitted bakes region cells for every regioned combo (direct
 *   callers and tests); a Set bakes them only for the named assets —
 *   the render paths pass the contract's regionAnim assets, so scenes
 *   that never expand a mark never pay for its region cells.
 * @returns {{pixels: Buffer, width: number, height: number,
 *   cells: Map<string, {u0,v0,u1,v1, ink: [x0,y0,x1,y1]|null}>}}
 *   cells map key -> atlas UV rect + ink bbox in asset units.
 */
export function bakeAtlas(combos, { regionAssets = null } = {}) {
  const uniq = [];
  const seen = new Set();
  for (const c of combos) {
    const k = comboKey(c.asset, c.ink, c.accent);
    if (!seen.has(k)) { seen.add(k); uniq.push({ ...c, key: k }); }
  }
  // Gutter between cells: mipmap footprints at the cell edge must not reach
  // the neighbor cell's ink. The gutter is transparent black; combined with
  // the half-texel UV inset, edge filtering stays correct and invisible.
  const GUTTER = 32;
  const stride = CELL_PX + GUTTER;
  // #1431 — slot packing: a strip entry occupies `slots` consecutive grid
  // slots so its frames stay contiguous for cellUvWindow's even split; a
  // strip that doesn't fit the row's remainder wraps whole to the next
  // row. Non-strip entries are 1 slot, so an atlas without strips lays out
  // exactly as before this lane (same cols, same cell rects).
  const baked = uniq.map((c) => {
    const { pixels: cp, ink, widthPx } = bakeCombo(c.asset, c.ink, c.accent);
    return { c, cp, ink, widthPx, slots: Math.max(1, Math.round(widthPx / CELL_PX)) };
  });
  const totalSlots = baked.reduce((s, b) => s + b.slots, 0);
  const maxSlots = baked.reduce((m, b) => Math.max(m, b.slots), 1);
  // #1433 — region cells (remainder + one per tagged region) pack into
  // the SAME sqrt grid as the mains, flowing on after them: the grid is
  // sized on the TOTAL slot count. Combo-rich scenes carry ~4 extra
  // cells per main, and any looser packing overflows the 8192 texture
  // ceiling of 8192-class GPUs — measured: the FX-test default scene at
  // 192 cells packed 5616x8208 in zones (16px over — GL_INVALID_VALUE
  // at upload) vs 6048x6048 joint. Cell CONTENTS are packing-invariant
  // (the pack addresses cells by key), so nothing downstream sees the
  // move; only the atlas' outer dimensions reflect the region cells.
  const partCache = new Map();
  const extras = [];
  for (const b of baked) {
    if (regionAssets && !regionAssets.has(b.c.asset)) continue;
    const asset = ASSET_BY_ID.get(b.c.asset);
    for (const e of regionCellsFor(asset, b.cp, partCache)) {
      extras.push({ key: b.c.key + e.suffix, cp: e.cp, ink: null, widthPx: CELL_PX, slots: 1, uvSub: e.uvSub, geo: e.geo });
    }
  }
  const cols = Math.max(1, Math.ceil(Math.sqrt(totalSlots + extras.length)), maxSlots);
  let col = 0, row = 0;
  for (const b of baked) {
    if (col + b.slots > cols) { row++; col = 0; }
    b.cx = col * stride; b.cy = row * stride;
    col += b.slots;
  }
  for (const e of extras) {
    if (col + 1 > cols) { row++; col = 0; }
    e.cx = col * stride; e.cy = row * stride;
    col += 1;
  }
  const width = cols * stride;
  const height = (row + 1) * stride;
  const pixels = Buffer.alloc(width * height * 4, 0);
  const cells = new Map();
  for (const b of [...baked, ...extras]) {
    for (let y = 0; y < CELL_PX; y++) {
      b.cp.copy(pixels, ((b.cy + y) * width + b.cx) * 4, y * b.widthPx * 4, (y + 1) * b.widthPx * 4);
    }
    // A region cell's content sits inside its slot (uvSub): the UV rect
    // addresses the content, inset by half a texel like every cell.
    const sub = b.uvSub || { ox: 0, oy: 0, w: b.widthPx, h: CELL_PX };
    cells.set(b.key || b.c.key, {
      // Inset by half a texel: the shader quad spans the texel centers
      // (asset units [-49.75, 149.75]), so UVs address texel centers.
      u0: (b.cx + sub.ox + 0.5) / width, v0: (b.cy + sub.oy + 0.5) / height,
      u1: (b.cx + sub.ox + sub.w - 0.5) / width, v1: (b.cy + sub.oy + sub.h - 0.5) / height,
      ink: b.ink,
      // #1433: region-instance geometry (pivot + scale vs the quad span);
      // absent on whole/remainder cells — the pack reads it only for #r: cells.
      ...(b.geo ? { geo: b.geo } : {}),
    });
  }
  // CPU-generated mipmap chain (box filter on premultiplied sRGB bytes).
  const mipmaps = buildMipmaps(pixels, width, height);
  return { pixels, width, height, cells, mipmaps };
}

/**
 * Generate a full mipmap chain on the CPU with a box filter.
 * Each level is half the size (rounded down, min 1). Returns an array
 * of {pixels, width, height}, level 0 first.
 *
 * We generate mips on the CPU (not gl.generateMipmap) so the filtering
 * is a known-correct box filter on the premultiplied sRGB bytes.
 */
export function buildMipmaps(pixels, width, height) {
  const levels = [{ pixels, width, height }];
  let w = width, h = height;
  let src = pixels;
  while (w > 1 || h > 1) {
    const nw = Math.max(1, w >> 1), nh = Math.max(1, h >> 1);
    const dst = Buffer.alloc(nw * nh * 4);
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        // Box filter over 2x2 (clamped at edges for odd sizes).
        let r = 0, g = 0, b = 0, a = 0, n = 0;
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const sx = Math.min(w - 1, x * 2 + dx), sy = Math.min(h - 1, y * 2 + dy);
            const i = (sy * w + sx) * 4;
            r += src[i]; g += src[i + 1]; b += src[i + 2]; a += src[i + 3]; n++;
          }
        }
        const o = (y * nw + x) * 4;
        dst[o] = Math.round(r / n); dst[o + 1] = Math.round(g / n);
        dst[o + 2] = Math.round(b / n); dst[o + 3] = Math.round(a / n);
      }
    }
    levels.push({ pixels: dst, width: nw, height: nh });
    src = dst; w = nw; h = nh;
  }
  return levels;
}
