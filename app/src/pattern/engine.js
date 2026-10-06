// engine.js — PATTERN engine, mode-agnostic core + FIELD (#1039).
//
// QUILT (#1040) and GLYPH (#1041) plug into the same tile grid, seed, palette
// sampling and renderer later; ESCHER stays parked.
//
// Everything that decides WHAT is drawn is pure and seeded: `assign` is a pure
// function of (seed, density, mix, palette), the pan offset is a pure function
// of (seed, drift, t). Nothing here reads Math.random, the clock, or a store.
// SEED is the stored integer, never a hidden rng state.

import { mkRng } from '../engine/prng.js';
import { FIELD_PATTERNS, samplePattern, patternParams } from './field.js';

/** FIELD pan at DRIFT 100%, in tiles per second (#1042 owns tuning). */
export const FIELD_PAN_TILES_PER_S = 0.25;

/** Default FIELD grid is 6 tiles across. */
export const FIELD_DEFAULT_DENSITY = 6;

/** uint32 mix of (seed, i): one independent rng stream per tile. */
export function hash32(seed, i) {
  let h = (Math.imul((seed >>> 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((i | 0) + 0x7f4a7c15, 0xc2b2ae35)) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

export function parseHex(hex) {
  const s = String(hex).replace('#', '');
  const f = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  const n = parseInt(f.slice(0, 6), 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [0, 0, 0];
}

/** '#rrggbb' -> packed RGBA for a little-endian Uint32 view of ImageData. */
export function toRgba(hex) {
  const [r, g, b] = parseHex(hex);
  return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

const lum = (hex) => { const [r, g, b] = parseHex(hex); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

/**
 * Ground = the darkest swatch; brights = the rest, in palette order. Fills are
 * exact palette strings so conformance is an equality check, not a tolerance.
 * (No role-weight ranking exists yet — that is #1049, needed by GLYPH only.)
 */
export function paletteRoles(palette) {
  const sw = (palette && Array.isArray(palette.swatches) ? palette.swatches : []).filter((c) => typeof c === 'string');
  const all = sw.length ? sw : [palette?.bg || '#000000', palette?.ink || '#ffffff'];
  let gi = 0;
  all.forEach((c, i) => { if (lum(c) < lum(all[gi])) gi = i; });
  const ground = all[gi];
  const brights = all.filter((_, i) => i !== gi);
  return { ground, brights: brights.length ? brights : [palette?.ink || '#ffffff'] };
}

/**
 * Which pattern each tile runs. MIX is pattern entropy: low = a repeating
 * rhythm of two patterns, high = a uniform draw over all ten.
 */
function choosePatterns(rng, count, mix) {
  const m = Math.min(1, Math.max(0, Number(mix) || 0));
  const A = Math.floor(rng() * FIELD_PATTERNS.length);
  let B = Math.floor(rng() * (FIELD_PATTERNS.length - 1)); if (B >= A) B += 1;
  const out = [];
  for (let i = 0; i < count; i++) {
    const draw = rng(); const free = Math.floor(rng() * FIELD_PATTERNS.length);
    out.push(draw < m ? free : (i % 2 === 0 ? A : B));
  }
  return out;
}

/**
 * The tile assignment: pure function of its inputs.
 * @returns {Array<{pattern:string, colors:[string,string,string], params:object}>}
 *   row-major, cols × rows. colors = [ground, motif1, motif2] — at most 3 hues.
 */
export function assign(seed, density, mix, palette, rows = density) {
  const cols = Math.max(1, Math.round(density));
  const nrows = Math.max(1, Math.round(rows));
  const count = cols * nrows;
  const { ground, brights } = paletteRoles(palette);
  const kinds = choosePatterns(mkRng(hash32(seed, 0x51)), count, mix);
  const tiles = [];
  for (let i = 0; i < count; i++) {
    const rng = mkRng(hash32(seed, i + 1));
    const name = FIELD_PATTERNS[kinds[i]];
    const c1 = brights[Math.floor(rng() * brights.length)];
    let c2 = brights[Math.floor(rng() * brights.length)];
    if (brights.length > 1 && c2 === c1) c2 = brights[(brights.indexOf(c1) + 1) % brights.length];
    const colors = [ground, c1, c2];
    tiles.push({ pattern: name, colors, rgba: colors.map(toRgba), params: patternParams(name, rng) });
  }
  return { cols, rows: nrows, tiles };
}

/** Pan direction, stable for the seed (radians). */
export function panAngle(seed) { return mkRng(hash32(seed, 0x9a4)) () * Math.PI * 2; }

/** Pan offset in tile units at time t (seconds). Zero at DRIFT 0. */
export function panOffset(seed, drift, t) {
  const d = Math.min(1, Math.max(0, Number(drift) || 0));
  const dist = d * FIELD_PAN_TILES_PER_S * (Number(t) || 0);
  const a = panAngle(seed);
  return { x: Math.cos(a) * dist, y: Math.sin(a) * dist };
}

/**
 * The color of the field at tile-space point (X, Y): which tile (the whole grid
 * wraps, so the field pans forever), then which color of that tile's pattern.
 * X, Y are in tile units, offset already applied; any real number is valid.
 */
export function fieldColorAt(grid, X, Y) {
  const tc = ((Math.floor(X) % grid.cols) + grid.cols) % grid.cols;
  const tr = ((Math.floor(Y) % grid.rows) + grid.rows) % grid.rows;
  const tile = grid.tiles[tr * grid.cols + tc];
  const idx = samplePattern(tile.pattern, X - Math.floor(X), Y - Math.floor(Y), tile.params);
  return tile.colors[idx];
}

/**
 * Rasterize the field into a Uint32Array (RGBA, little-endian) of bw × bh.
 * Pixel centers are sampled; no antialiasing; hard edges.
 * `tileW` is the tile width in buffer pixels.
 */
export function rasterField(buf, bw, bh, grid, tileW, offset = { x: 0, y: 0 }) {
  const { cols, rows, tiles } = grid;
  for (let y = 0; y < bh; y++) {
    const Y = (y + 0.5) / tileW + offset.y;
    const fy = Math.floor(Y); const v = Y - fy;
    const tr = ((fy % rows) + rows) % rows;
    for (let x = 0; x < bw; x++) {
      const X = (x + 0.5) / tileW + offset.x;
      const fx = Math.floor(X);
      const tile = tiles[tr * cols + (((fx % cols) + cols) % cols)];
      buf[y * bw + x] = tile.rgba[samplePattern(tile.pattern, X - fx, v, tile.params)];
    }
  }
  return buf;
}

// Renderer scratch: one small offscreen surface, reused, never reallocated per frame.
let scratch = null;
const BUF_W = 512;

/**
 * Draw a FIELD frame to a 2D canvas context.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{mode:'FIELD', seed:number, density:number, mix:number, drift:number,
 *   palette:object, t:number, w:number, h:number}} o
 * Square tiles; rows fill the frame height at the same tile size (partial edge
 * tiles are fine: the field is a textile and pans). GROUT is not a parameter
 * here: FIELD forces it to 0.
 */
export function renderPattern(ctx, o) {
  if (o.mode !== 'FIELD') throw new Error(`renderPattern: mode ${o.mode} is not built yet`);
  const density = Math.max(1, Math.round(o.density || FIELD_DEFAULT_DENSITY));
  const tileW = o.w / density;
  const rows = Math.max(1, Math.ceil(o.h / tileW));
  const grid = assign(o.seed >>> 0, density, o.mix, o.palette, rows);
  const bw = Math.min(BUF_W, Math.max(1, Math.round(o.w)));
  const bh = Math.max(1, Math.round(bw * (o.h / o.w)));
  if (!scratch || scratch.w !== bw || scratch.h !== bh) {
    const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(bw, bh) : Object.assign(document.createElement('canvas'), { width: bw, height: bh });
    const c = canvas.getContext('2d');
    scratch = { canvas, c, image: c.createImageData(bw, bh), w: bw, h: bh };
  }
  const px = new Uint32Array(scratch.image.data.buffer);
  rasterField(px, bw, bh, grid, bw / density, panOffset(o.seed >>> 0, o.drift, o.t));
  scratch.c.putImageData(scratch.image, 0, 0);
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false; // hard edges survive the upscale
  ctx.drawImage(scratch.canvas, 0, 0, o.w, o.h);
  ctx.imageSmoothingEnabled = smooth;
}
