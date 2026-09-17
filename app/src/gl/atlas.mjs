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
 * Bake one asset/color combination into a CELL_PX square.
 * Returns {pixels, ink} where ink is the bbox in asset units.
 */
function bakeCombo(assetId, ink, accent) {
  const asset = ASSET_BY_ID.get(assetId);
  if (!asset) throw new Error(`[atlas] unknown asset "${assetId}"`);
  const { x0, y0, x1, y1 } = CELL_UNITS;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL_PX}" height="${CELL_PX}" ` +
    `viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}">` +
    subColors(asset.svg, ink, accent) +
    `</svg>`;
  const img = new Resvg(svg).render();
  const pixels = Buffer.from(img.pixels);
  // Note: no alpha-bleed. Bleeding ink RGB into transparent texels breaks
  // premultiplied mipmap filtering (saturated RGB at partial alpha reads
  // as brighter/bloated). The gutter + half-texel UVs handle edge filtering.
  // Ink bbox in asset units (for filter-region clipping).
  let bx0 = CELL_PX, by0 = CELL_PX, bx1 = -1, by1 = -1;
  for (let y = 0; y < CELL_PX; y++) {
    for (let x = 0; x < CELL_PX; x++) {
      if (pixels[(y * CELL_PX + x) * 4 + 3] > ALPHA_CUTOFF) {
        if (x < bx0) bx0 = x;
        if (x > bx1) bx1 = x;
        if (y < by0) by0 = y;
        if (y > by1) by1 = y;
      }
    }
  }
  const unitsPerPx = (x1 - x0) / CELL_PX;
  const inkBounds = bx1 >= 0
    ? [x0 + bx0 * unitsPerPx, y0 + by0 * unitsPerPx, x0 + (bx1 + 1) * unitsPerPx, y0 + (by1 + 1) * unitsPerPx]
    : null;
  return { pixels, ink: inkBounds };
}

export const comboKey = (assetId, ink, accent) => `${assetId}|${ink}|${accent}`;

/**
 * Bake an atlas for the given combos.
 * @param {Array<{asset:string, ink:string, accent:string}>} combos
 * @returns {{pixels: Buffer, width: number, height: number,
 *   cells: Map<string, {u0,v0,u1,v1, ink: [x0,y0,x1,y1]|null}>}}
 *   cells map key -> atlas UV rect + ink bbox in asset units.
 */
export function bakeAtlas(combos) {
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
  const cols = Math.max(1, Math.ceil(Math.sqrt(uniq.length)));
  const rows = Math.max(1, Math.ceil(uniq.length / cols));
  const width = cols * stride;
  const height = rows * stride;
  const pixels = Buffer.alloc(width * height * 4, 0);
  const cells = new Map();
  uniq.forEach((c, i) => {
    const { pixels: cp, ink } = bakeCombo(c.asset, c.ink, c.accent);
    const cx = (i % cols) * stride;
    const cy = Math.floor(i / cols) * stride;
    for (let y = 0; y < CELL_PX; y++) {
      cp.copy(pixels, ((cy + y) * width + cx) * 4, y * CELL_PX * 4, (y + 1) * CELL_PX * 4);
    }
    cells.set(c.key, {
      // Inset by half a texel: the shader quad spans the texel centers
      // (asset units [-49.75, 149.75]), so UVs address texel centers.
      u0: (cx + 0.5) / width, v0: (cy + 0.5) / height,
      u1: (cx + CELL_PX - 0.5) / width, v1: (cy + CELL_PX - 0.5) / height,
      ink,
    });
  });
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

/**
 * Bake the grain noise LUT — the exact feTurbulence the reference path
 * uses for the grain effect (fractalNoise, baseFrequency 0.9, 2 octaves,
 * seed 3), rendered over the full canvas in user space at the target
 * device size. Sampling this at exact texel centers reproduces the
 * reference noise bit-for-bit (same rasterizer, same seed, same grid).
 *
 * @returns {{pixels: Buffer, width: number, height: number}} premultiplied RGBA
 */
export function bakeGrainLut(width, height) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 1000 700">` +
    `<defs><filter id="n" filterUnits="userSpaceOnUse" x="0" y="0" width="1000" height="700" ` +
    `color-interpolation-filters="sRGB">` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3"/>` +
    `</filter></defs>` +
    `<rect x="0" y="0" width="1000" height="700" filter="url(#n)"/>` +
    `</svg>`;
  const img = new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render();
  if (img.width !== width || img.height !== height) {
    throw new Error(`[atlas] grain LUT size mismatch: ${img.width}x${img.height} != ${width}x${height}`);
  }
  return { pixels: Buffer.from(img.pixels), width: img.width, height: img.height };
}
