/**
 * liveAtlas.mjs — browser-side texture atlas baker for the live WebGL loop (#224).
 *
 * The offline baker (atlas.mjs) is Node-only (resvg). The live loop needs the
 * same atlas layout in the browser, so this module re-implements the bake with
 * Image + 2D canvas rasterization. Geometry constants MUST match atlas.mjs:
 * the QUAD_VS shader hardcodes the cell geometry (400px for 200 asset units,
 * quad spanning asset units [-49.75, 149.75]), so a cell baked at any other
 * size would sample off-texel-center.
 *
 * Differences from the offline bake (deliberate, "new territory" per #224):
 * - Pixels are premultiplied in JS (canvas 2D hands back straight alpha).
 * - Mipmaps are a CPU box filter on the premultiplied bytes, like the
 *   offline bake — no GPU generateMipmap, so minification filtering matches
 *   the stills path.
 * - The grain LUT rasterizes the same feTurbulence SVG the offline bake
 *   uses; browsers render their own turbulence noise, which is fine — grain
 *   just needs to look like grain.
 *
 * All entry points are async (Image decode). The loop holds the last frame
 * while a bake is in flight.
 */

export const LIVE_CELL_PX = 400;
/** Asset units covered by one cell: [x0, y0, x1, y1]. Mirrors atlas.mjs. */
export const LIVE_CELL_UNITS = Object.freeze({ x0: -50, y0: -50, x1: 150, y1: 150 });
const LIVE_GUTTER = 32;
const ALPHA_CUTOFF = 4;

import { applyGradient } from '../assets/gradient.js';
import { stripFramesFor } from '../data/cellKinemes.js';
import { detectRegions } from '../assets/regionMattes.js';
import { partitionFromDetection, regionCellGeometry } from '../assets/regionPartition.js';
import { canonicalSvg } from '../assets/regionRaster.js';

export const comboKey = (asset) => asset;

/**
 * #701 — an asset that opts into a TE-limited gradient paints its ink with a
 * ramp between palette SLOTS, which is exactly what this mask can carry: the
 * stops bake as the mask primaries and the shader resolves them to the live
 * palette per frame. Assets without the field are untouched.
 */
const withGradient = (svg, gradient) =>
  applyGradient(svg, gradient, { ink: '#ff0000', accent: '#00ff00' });

const subColors = (svg, ink, accent) =>
  svg
    .replace(/var\(--ink[^)]*\)/g, ink)
    .replace(/var\(--accent[^)]*\)/g, accent);

function rasterizeSvg(svgString, w, h) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(ctx.getImageData(0, 0, w, h));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error('[liveAtlas] SVG rasterization failed'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
  });
}

/**
 * Bake one asset as an R/G mask. Ink = red (#ff0000), Accent = green (#00ff00).
 * A strip asset (#1431 KINEME C) bakes all its frames into one wide raster —
 * same composition as the offline bake in atlas.mjs: frames contiguous, no
 * internal gutter, frame 0 on the exact texels the single-cell bake used.
 * Returns { data: Uint8Array (premultiplied RGBA), ink, widthPx }
 */
async function bakeCombo(assetId, svgById, gradientById) {
  const src = svgById.get(assetId);
  if (src == null) throw new Error(`[liveAtlas] unknown asset "${assetId}"`);
  const gradient = gradientById && gradientById.get(assetId);
  const { x0, y0, x1, y1 } = LIVE_CELL_UNITS;
  const frames = stripFramesFor(assetId);
  const n = frames ? frames.length : 1;
  const widthPx = LIVE_CELL_PX * n;
  const body = frames
    ? frames.map((f, i) => `<g transform="translate(${(x1 - x0) * i} 0)">${subColors(withGradient(f, gradient), '#ff0000', '#00ff00')}</g>`).join('')
    : subColors(withGradient(src, gradient), '#ff0000', '#00ff00');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${LIVE_CELL_PX}" ` +
    `viewBox="${x0} ${y0} ${(x1 - x0) * n} ${y1 - y0}">` +
    body +
    `</svg>`;
  const img = await rasterizeSvg(svg, widthPx, LIVE_CELL_PX);
  const d = img.data;
  const out = new Uint8Array(widthPx * LIVE_CELL_PX * 4);
  let bx0 = LIVE_CELL_PX, by0 = LIVE_CELL_PX, bx1 = -1, by1 = -1;
  for (let i = 0, np = widthPx * LIVE_CELL_PX; i < np; i++) {
    const o = i * 4;
    const a = d[o + 3];
    if (a === 0) continue;
    out[o] = Math.round((d[o] * a) / 255);
    out[o + 1] = Math.round((d[o + 1] * a) / 255);
    out[o + 2] = Math.round((d[o + 2] * a) / 255);
    out[o + 3] = a;
    if (a > ALPHA_CUTOFF) {
      // Strip x folds back into the frame-local cell (ink stays in
      // single-asset units, the union across frames — mirrors atlas.mjs).
      const x = (i % widthPx) % LIVE_CELL_PX, y = (i / widthPx) | 0;
      if (x < bx0) bx0 = x;
      if (x > bx1) bx1 = x;
      if (y < by0) by0 = y;
      if (y > by1) by1 = y;
    }
  }
  const unitsPerPx = (x1 - x0) / LIVE_CELL_PX;
  const inkBox = bx1 >= 0
    ? [x0 + bx0 * unitsPerPx, y0 + by0 * unitsPerPx, x0 + (bx1 + 1) * unitsPerPx, y0 + (by1 + 1) * unitsPerPx]
    : null;
  return { data: out, ink: inkBox, widthPx };
}

/** CPU box-filter mipmap chain on premultiplied bytes (mirrors atlas.mjs:
 *  level 0 first, then each halved level — the renderer uploads level 0
 *  from the base pixels and levels 1..n from this array). */
function buildMipmaps(pixels, width, height) {
  const levels = [{ pixels, width, height }];
  let src = pixels, w = width, h = height;
  while (w > 1 || h > 1) {
    const nw = Math.max(1, w >> 1), nh = Math.max(1, h >> 1);
    const dst = new Uint8Array(nw * nh * 4);
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        const o = (y * nw + x) * 4;
        let r = 0, g = 0, b = 0, a = 0, n = 0;
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const sx = Math.min(w - 1, x * 2 + dx), sy = Math.min(h - 1, y * 2 + dy);
            const so = (sy * w + sx) * 4;
            r += src[so]; g += src[so + 1]; b += src[so + 2]; a += src[so + 3];
            n++;
          }
        }
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
 * #1433 (R2) — the region cells for one live combo, mirroring atlas.mjs:
 * a remainder cell (the whole mark minus every region's pixels) plus one
 * cell per tagged region (its pixels only, centroid-centred frame).
 * Detection runs on the canonical raster (regionRaster's canonicalSvg)
 * and the committed records stay the authority — partitionFromDetection
 * matches by id and folds any canvas-vs-resvg drift into the nearest
 * record, so pixels are never lost. Strip assets are excluded (their
 * frames are whole-mark animation; cell kinemes own them).
 *
 * @param {string} src — the asset's raw SVG fragment
 * @param {Array} records — the asset's committed region records
 * @param {Uint8Array} wholeData — bakeCombo's premultiplied cell pixels
 * @returns {Promise<Array<{suffix: string, data: Uint8Array, uvSub: object|null, geo: object|null}>>}
 */
async function regionCellsLive(src, records, wholeData) {
  const img = await rasterizeSvg(canonicalSvg(src), 200, 200);
  const det = detectRegions(img.data, 200, 200, { wantMap: true });
  const part = partitionFromDetection(det.regions, det.idMap, 200, 200, records);
  const ownerAt = (x, y) =>
    x >= 100 && x < 300 && y >= 100 && y < 300 ? part.owner[(y - 100) * 200 + (x - 100)] : -1;
  const out = [];
  {
    const data = new Uint8Array(LIVE_CELL_PX * LIVE_CELL_PX * 4);
    for (let y = 0; y < LIVE_CELL_PX; y++) {
      for (let x = 0; x < LIVE_CELL_PX; x++) {
        if (ownerAt(x, y) !== -1) continue;
        const o = (y * LIVE_CELL_PX + x) * 4;
        data.set(wholeData.subarray(o, o + 4), o);
      }
    }
    out.push({ suffix: '#rem', data, uvSub: null, geo: null });
  }
  records.forEach((record, rIdx) => {
    const g = regionCellGeometry(record);
    const data = new Uint8Array(LIVE_CELL_PX * LIVE_CELL_PX * 4);
    const ox = Math.round((LIVE_CELL_PX - g.w) / 2);
    const oy = Math.round((LIVE_CELL_PX - g.h) / 2);
    for (let j = 0; j < g.h; j++) {
      for (let i = 0; i < g.w; i++) {
        if (ownerAt(g.x0 + i, g.y0 + j) !== rIdx) continue;
        const s = ((g.y0 + j) * LIVE_CELL_PX + (g.x0 + i)) * 4;
        data.set(wholeData.subarray(s, s + 4), ((oy + j) * LIVE_CELL_PX + (ox + i)) * 4);
      }
    }
    out.push({
      suffix: `#r:${record.id}`,
      data,
      uvSub: { ox, oy, w: g.w, h: g.h },
      geo: { px: g.pivotX, py: g.pivotY, sx: g.scaleX, sy: g.scaleY },
    });
  });
  return out;
}

/**
 * Bake an atlas for the given assets as masks.
 * @param {Array<{asset:string}>} combos
 * @param {Map<string,string>} svgById asset id -> SVG fragment
 * @param {Map<string,object>} [gradientById] asset id -> gradient declaration
 * @param {Map<string,Array>} [regionsById] asset id -> region records (#1433;
 *   combos whose asset has records gain remainder + region cells)
 * @returns {Promise<{pixels:Uint8Array,width:number,height:number,cells:Map,mipmaps:Array}>}
 */
export async function bakeLiveAtlas(combos, svgById, gradientById = null, regionsById = null) {
  const uniq = [];
  const seen = new Set();
  for (const c of combos) {
    const k = comboKey(c.asset);
    if (!seen.has(k)) { seen.add(k); uniq.push({ ...c, key: k }); }
  }
  const stride = LIVE_CELL_PX + LIVE_GUTTER;
  // #1431 — slot packing, mirroring atlas.mjs: a strip entry occupies
  // `slots` consecutive grid slots (frames stay contiguous for
  // cellUvWindow's even split); a strip that doesn't fit the row's
  // remainder wraps whole to the next row. Non-strip entries are 1 slot,
  // so an atlas without strips lays out exactly as before this lane.
  const slots = uniq.map((c) => {
    const frames = stripFramesFor(c.asset);
    return frames ? frames.length : 1;
  });
  const totalSlots = slots.reduce((s, k) => s + k, 0);
  const maxSlots = slots.reduce((m, k) => Math.max(m, k), 1);
  // #1433 — region cells pack into the SAME sqrt grid as the mains,
  // flowing on after them (mirrors atlas.mjs): the grid is sized on the
  // TOTAL slot count so combo-rich atlases stay inside the 8192 texture
  // ceiling of 8192-class GPUs. The extras count is known from the
  // records alone (remainder + one per region), so placement precedes
  // baking.
  const regioned = uniq.map((c) => {
    const records = regionsById?.get(c.asset);
    return Array.isArray(records) && records.length && !stripFramesFor(c.asset) ? records : null;
  });
  const extrasTotal = regioned.reduce((s, r) => s + (r ? r.length + 1 : 0), 0);
  const cols = Math.max(1, Math.ceil(Math.sqrt(totalSlots + extrasTotal)), maxSlots);
  const place = [];
  let col = 0, row = 0;
  for (let i = 0; i < uniq.length; i++) {
    if (col + slots[i] > cols) { row++; col = 0; }
    place.push({ cx: col * stride, cy: row * stride });
    col += slots[i];
  }
  const extraPlace = [];
  for (const records of regioned) {
    if (!records) continue;
    for (let n = 0; n < records.length + 1; n++) {
      if (col + 1 > cols) { row++; col = 0; }
      extraPlace.push({ cx: col * stride, cy: row * stride });
      col += 1;
    }
  }
  const width = cols * stride;
  const height = (row + 1) * stride;
  const pixels = new Uint8Array(width * height * 4); // transparent black gutters
  const cells = new Map();
  const cellRect = (cx, cy, sub) => ({
    // Half-texel inset: the shader quad spans texel centers.
    u0: (cx + sub.ox + 0.5) / width, v0: (cy + sub.oy + 0.5) / height,
    u1: (cx + sub.ox + sub.w - 0.5) / width, v1: (cy + sub.oy + sub.h - 0.5) / height,
  });
  // Rasterize sequentially: parallel Image decodes thrash the raster pool
  const bakedData = [];
  for (let i = 0; i < uniq.length; i++) {
    const c = uniq[i];
    const { data, ink, widthPx } = await bakeCombo(c.asset, svgById, gradientById);
    bakedData.push(data);
    const { cx, cy } = place[i];
    for (let y = 0; y < LIVE_CELL_PX; y++) {
      pixels.set(
        data.subarray(y * widthPx * 4, (y + 1) * widthPx * 4),
        ((cy + y) * width + cx) * 4,
      );
    }
    cells.set(c.key, { ...cellRect(cx, cy, { ox: 0, oy: 0, w: widthPx, h: LIVE_CELL_PX }), ink });
  }
  // #1433 — the region cells themselves, in the same order they were placed.
  let xp = 0;
  for (let i = 0; i < uniq.length; i++) {
    const records = regioned[i];
    if (!records) continue;
    const extras = await regionCellsLive(svgById.get(uniq[i].asset), records, bakedData[i]);
    for (const e of extras) {
      const { cx, cy } = extraPlace[xp++];
      for (let y = 0; y < LIVE_CELL_PX; y++) {
        pixels.set(
          e.data.subarray(y * LIVE_CELL_PX * 4, (y + 1) * LIVE_CELL_PX * 4),
          ((cy + y) * width + cx) * 4,
        );
      }
      cells.set(uniq[i].key + e.suffix, {
        ...cellRect(cx, cy, e.uvSub || { ox: 0, oy: 0, w: LIVE_CELL_PX, h: LIVE_CELL_PX }),
        ink: null,
        ...(e.geo ? { geo: e.geo } : {}),
      });
    }
  }
  const mipmaps = buildMipmaps(pixels, width, height);
  return { pixels, width, height, cells, mipmaps };
}
