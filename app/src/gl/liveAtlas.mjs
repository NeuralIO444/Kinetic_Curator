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

export const comboKey = (asset) => asset;

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
 * Returns { data: Uint8Array (premultiplied RGBA), ink: [x0,y0,x1,y1]|null }
 */
async function bakeCombo(assetId, svgById) {
  const src = svgById.get(assetId);
  if (src == null) throw new Error(`[liveAtlas] unknown asset "${assetId}"`);
  const { x0, y0, x1, y1 } = LIVE_CELL_UNITS;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${LIVE_CELL_PX}" height="${LIVE_CELL_PX}" ` +
    `viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}">` +
    subColors(src, '#ff0000', '#00ff00') +
    `</svg>`;
  const img = await rasterizeSvg(svg, LIVE_CELL_PX, LIVE_CELL_PX);
  const d = img.data;
  const out = new Uint8Array(LIVE_CELL_PX * LIVE_CELL_PX * 4);
  let bx0 = LIVE_CELL_PX, by0 = LIVE_CELL_PX, bx1 = -1, by1 = -1;
  for (let i = 0, n = LIVE_CELL_PX * LIVE_CELL_PX; i < n; i++) {
    const o = i * 4;
    const a = d[o + 3];
    if (a === 0) continue;
    out[o] = Math.round((d[o] * a) / 255);
    out[o + 1] = Math.round((d[o + 1] * a) / 255);
    out[o + 2] = Math.round((d[o + 2] * a) / 255);
    out[o + 3] = a;
    if (a > ALPHA_CUTOFF) {
      const x = i % LIVE_CELL_PX, y = (i / LIVE_CELL_PX) | 0;
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
  return { data: out, ink: inkBox };
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
 * Bake an atlas for the given assets as masks.
 * @param {Array<{asset:string}>} combos
 * @param {Map<string,string>} svgById asset id -> SVG fragment
 * @returns {Promise<{pixels:Uint8Array,width:number,height:number,cells:Map,mipmaps:Array}>}
 */
export async function bakeLiveAtlas(combos, svgById) {
  const uniq = [];
  const seen = new Set();
  for (const c of combos) {
    const k = comboKey(c.asset);
    if (!seen.has(k)) { seen.add(k); uniq.push({ ...c, key: k }); }
  }
  const stride = LIVE_CELL_PX + LIVE_GUTTER;
  const cols = Math.max(1, Math.ceil(Math.sqrt(uniq.length)));
  const rows = Math.max(1, Math.ceil(uniq.length / cols));
  const width = cols * stride;
  const height = rows * stride;
  const pixels = new Uint8Array(width * height * 4); // transparent black gutters
  const cells = new Map();
  // Rasterize sequentially: parallel Image decodes thrash the raster pool
  for (let i = 0; i < uniq.length; i++) {
    const c = uniq[i];
    const { data, ink } = await bakeCombo(c.asset, svgById);
    const cx = (i % cols) * stride;
    const cy = Math.floor(i / cols) * stride;
    for (let y = 0; y < LIVE_CELL_PX; y++) {
      pixels.set(
        data.subarray(y * LIVE_CELL_PX * 4, (y + 1) * LIVE_CELL_PX * 4),
        ((cy + y) * width + cx) * 4,
      );
    }
    cells.set(c.key, {
      // Half-texel inset: the shader quad spans texel centers.
      u0: (cx + 0.5) / width, v0: (cy + 0.5) / height,
      u1: (cx + LIVE_CELL_PX - 0.5) / width, v1: (cy + LIVE_CELL_PX - 0.5) / height,
      ink,
    });
  }
  const mipmaps = buildMipmaps(pixels, width, height);
  return { pixels, width, height, cells, mipmaps };
}

/**
 * Bake the grain noise LUT at the render size. Same feTurbulence recipe as
 * the offline bake (fractalNoise, baseFrequency 0.9, 2 octaves, seed 3) —
 * browsers render their own noise, which is fine for grain.
 * @returns {Promise<{pixels:Uint8Array,width:number,height:number}>} premultiplied RGBA
 */
export async function bakeLiveGrainLut(width, height) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 1000 700">` +
    `<defs><filter id="n" filterUnits="userSpaceOnUse" x="0" y="0" width="1000" height="700" ` +
    `color-interpolation-filters="sRGB">` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3"/>` +
    `</filter></defs>` +
    `<rect x="0" y="0" width="1000" height="700" filter="url(#n)"/>` +
    `</svg>`;
  const img = await rasterizeSvg(svg, width, height);
  const d = img.data;
  const out = new Uint8Array(width * height * 4);
  for (let i = 0, n = width * height; i < n; i++) {
    const o = i * 4;
    const a = d[o + 3];
    out[o] = Math.round((d[o] * a) / 255);
    out[o + 1] = Math.round((d[o + 1] * a) / 255);
    out[o + 2] = Math.round((d[o + 2] * a) / 255);
    out[o + 3] = a;
  }
  return { pixels: out, width, height };
}
