// engine.js — PATTERN engine, mode-agnostic core + FIELD (#1039) + QUILT (#1040).
//
// GLYPH (#1041) plugs into the same tile grid, seed, palette sampling and
// renderer later; ESCHER stays parked.
//
// Everything that decides WHAT is drawn is pure and seeded: `assign` is a pure
// function of (seed, density, mix, palette), the pan offset is a pure function
// of (seed, drift, t). Nothing here reads Math.random, the clock, or a store.
// SEED is the stored integer, never a hidden rng state.

import { mkRng } from '../engine/prng.js';
import { FIELD_PATTERNS, samplePattern, patternParams } from './field.js';
import { TILE_MOTIFS, HERO_MOTIFS, sampleQuilt, quiltParams } from './quilt.js';

/** FIELD pan at DRIFT 100%, in tiles per second (#1042 owns tuning). */
export const FIELD_PAN_TILES_PER_S = 0.25;

/** Default FIELD grid is 6 tiles across. */
export const FIELD_DEFAULT_DENSITY = 6;

/** QUILT defaults and limits (docs/PATTERN_SPEC.md, #1040). Fractions, not percents. */
export const QUILT_DEFAULT_DENSITY = 8;
export const QUILT_DEFAULT_MIX = 0.55;
export const QUILT_DEFAULT_GROUT = 0.03;
export const QUILT_MAX_GROUT = 0.08;
export const QUILT_DEFAULT_HERO = 0.25;

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

// ── QUILT (#1040) ───────────────────────────────────────────────────────────

const clamp01 = (v) => Math.min(1, Math.max(0, Number(v) || 0));

// Two motif colors from the brights. With a single bright the second motif
// color is the ground, so a two-color motif (stripes, pinwheel) never goes flat.
function motifColors(rng, ground, brights) {
  const c1 = brights[Math.floor(rng() * brights.length)];
  const c2 = brights.length > 1 ? brights[(brights.indexOf(c1) + 1 + Math.floor(rng() * (brights.length - 1))) % brights.length] : ground;
  return [ground, c1, c2];
}

/**
 * The quilt assignment: pure function of its inputs.
 *
 * ONE seeded stream decides the structure, consumed in a fixed order: tile
 * motifs row-major, then the hero walk, then the hero motif picks. Colors and
 * motif params come from a per-tile stream, so they do not shift that order.
 *
 * Heroes sit on the coarser lattice: 2×2 blocks anchored at even (col, row).
 * A candidate is rejected if it touches an accepted hero by edge or corner, and
 * the walk stops at floor(cols / 4).
 *
 * @returns {{cols, rows, tiles, heroes, heroAt, ground}} tiles row-major;
 *   heroAt[i] is the hero index covering cell i, or -1.
 */
export function assignQuilt(seed, density, mix, hero, palette, rows = density) {
  const cols = Math.max(1, Math.round(density));
  const nrows = Math.max(1, Math.round(rows));
  const { ground, brights } = paletteRoles(palette);
  const m = clamp01(mix);
  const rng = mkRng(hash32(seed, 0x9117));

  // 1) tile motifs. Low MIX is a two-motif checkerboard; MIX is the per-tile
  //    probability of a free draw instead. Quilt vocabulary only.
  const A = Math.floor(rng() * TILE_MOTIFS.length);
  let B = Math.floor(rng() * (TILE_MOTIFS.length - 1)); if (B >= A) B += 1;
  const tiles = [];
  for (let r = 0; r < nrows; r++) {
    for (let c = 0; c < cols; c++) {
      const draw = rng(); const free = Math.floor(rng() * TILE_MOTIFS.length);
      const name = TILE_MOTIFS[draw < m ? free : ((c + r) % 2 === 0 ? A : B)];
      const trng = mkRng(hash32(seed, r * cols + c + 1));
      const colors = motifColors(trng, ground, brights);
      tiles.push({ pattern: name, colors, rgba: colors.map(toRgba), params: quiltParams(name, trng) });
    }
  }

  // 2) hero walk: seeded shuffle of the eligible blocks.
  const blocks = [];
  for (let r = 0; r + 1 < nrows; r += 2) for (let c = 0; c + 1 < cols; c += 2) blocks.push({ c, r });
  for (let i = blocks.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
  }
  const cap = Math.floor(cols / 4);
  const h = clamp01(hero);
  const picked = [];
  for (const b of blocks) {
    const roll = rng();
    if (picked.length >= cap || roll >= h) continue;
    // Blocks are 2 cells apart on the fine grid: touching = within one block step.
    if (picked.some((q) => Math.abs(q.c - b.c) <= 2 && Math.abs(q.r - b.r) <= 2)) continue;
    picked.push(b);
  }

  // 3) hero motif picks.
  const heroAt = new Int32Array(cols * nrows).fill(-1);
  const heroes = picked.map((b, i) => {
    const name = HERO_MOTIFS[Math.floor(rng() * HERO_MOTIFS.length)];
    const hrng = mkRng(hash32(seed, 0x4e20 + b.r * cols + b.c));
    const colors = motifColors(hrng, ground, brights);
    for (let dr = 0; dr < 2; dr++) for (let dc = 0; dc < 2; dc++) heroAt[(b.r + dr) * cols + b.c + dc] = i;
    return { c: b.c, r: b.r, pattern: name, colors, rgba: colors.map(toRgba), params: quiltParams(name, hrng) };
  });

  return { cols, rows: nrows, tiles, heroes, heroAt, ground, groundRgba: toRgba(ground) };
}

/**
 * True when tile-space point (X, Y) is on a grout band. Grout runs on INTERIOR
 * seams only (never the outer frame), is centered on the seam, and is absent
 * from the seams inside a hero's 2×2 block.
 */
export function onGrout(grid, X, Y, grout) {
  const g = Math.min(QUILT_MAX_GROUT, Math.max(0, Number(grout) || 0));
  if (g <= 0) return false;
  const { cols, rows, heroAt } = grid;
  const half = g / 2;
  const cellOf = (c, r) => (c >= 0 && c < cols && r >= 0 && r < rows ? heroAt[r * cols + c] : -1);
  const kx = Math.round(X); const ky = Math.round(Y);
  const fc = Math.floor(X); const fr = Math.floor(Y);
  if (Math.abs(X - kx) < half && kx > 0 && kx < cols) {
    const a = cellOf(kx - 1, fr); const b = cellOf(kx, fr);
    if (!(a !== -1 && a === b)) return true;
  }
  if (Math.abs(Y - ky) < half && ky > 0 && ky < rows) {
    const a = cellOf(fc, ky - 1); const b = cellOf(fc, ky);
    if (!(a !== -1 && a === b)) return true;
  }
  return false;
}

/** Which motif covers tile-space point (X, Y): a hero block or the 1×1 tile. */
function quiltCell(grid, X, Y) {
  const c = Math.min(grid.cols - 1, Math.max(0, Math.floor(X)));
  const r = Math.min(grid.rows - 1, Math.max(0, Math.floor(Y)));
  const hi = grid.heroAt[r * grid.cols + c];
  if (hi !== -1) {
    const hero = grid.heroes[hi];
    return { tile: hero, u: (X - hero.c) / 2, v: (Y - hero.r) / 2 };
  }
  return { tile: grid.tiles[r * grid.cols + c], u: X - c, v: Y - r };
}

/** The palette color of the quilt at tile-space point (X, Y). */
export function quiltColorAt(grid, X, Y, grout = 0) {
  if (onGrout(grid, X, Y, grout)) return grid.ground;
  const { tile, u, v } = quiltCell(grid, X, Y);
  return tile.colors[sampleQuilt(tile.pattern, u, v, tile.params)];
}

/**
 * Rasterize the quilt into a Uint32Array (RGBA, little-endian) of bw × bh.
 * Draw order is the spec's: tiles to the full tile rect, heroes over their four
 * cells, grout LAST as an overlay in the darkest role. The grid does not wrap
 * and does not pan (DRIFT in QUILT is #1042).
 */
export function rasterQuilt(buf, bw, bh, grid, tileW, grout = 0) {
  for (let y = 0; y < bh; y++) {
    const Y = (y + 0.5) / tileW;
    for (let x = 0; x < bw; x++) {
      const X = (x + 0.5) / tileW;
      if (onGrout(grid, X, Y, grout)) { buf[y * bw + x] = grid.groundRgba; continue; }
      const { tile, u, v } = quiltCell(grid, X, Y);
      buf[y * bw + x] = tile.rgba[sampleQuilt(tile.pattern, u, v, tile.params)];
    }
  }
  return buf;
}

// Renderer scratch: one small offscreen surface, reused, never reallocated per frame.
let scratch = null;
const BUF_W = 512;

/**
 * Draw a FIELD or QUILT frame to a 2D canvas context.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{mode:'FIELD'|'QUILT', seed:number, density:number, mix:number, drift:number,
 *   grout?:number, hero?:number, palette:object, t:number, w:number, h:number}} o
 *   QUILT reads grout (0–0.08 of a tile) and hero (0–1); it ignores drift and t.
 * Square tiles; rows fill the frame height at the same tile size (partial edge
 * tiles are fine: the field is a textile and pans). GROUT is not a parameter
 * here: FIELD forces it to 0.
 */
export function renderPattern(ctx, o) {
  if (o.mode !== 'FIELD' && o.mode !== 'QUILT') throw new Error(`renderPattern: mode ${o.mode} is not built yet`);
  const quilt = o.mode === 'QUILT';
  const density = Math.max(1, Math.round(o.density || (quilt ? QUILT_DEFAULT_DENSITY : FIELD_DEFAULT_DENSITY)));
  const tileW = o.w / density;
  const rows = Math.max(1, Math.ceil(o.h / tileW));
  const grid = quilt
    ? assignQuilt(o.seed >>> 0, density, o.mix ?? QUILT_DEFAULT_MIX, o.hero ?? QUILT_DEFAULT_HERO, o.palette, rows)
    : assign(o.seed >>> 0, density, o.mix, o.palette, rows);
  const bw = Math.min(BUF_W, Math.max(1, Math.round(o.w)));
  const bh = Math.max(1, Math.round(bw * (o.h / o.w)));
  if (!scratch || scratch.w !== bw || scratch.h !== bh) {
    const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(bw, bh) : Object.assign(document.createElement('canvas'), { width: bw, height: bh });
    const c = canvas.getContext('2d');
    scratch = { canvas, c, image: c.createImageData(bw, bh), w: bw, h: bh };
  }
  const px = new Uint32Array(scratch.image.data.buffer);
  if (quilt) rasterQuilt(px, bw, bh, grid, bw / density, o.grout ?? QUILT_DEFAULT_GROUT);
  else rasterField(px, bw, bh, grid, bw / density, panOffset(o.seed >>> 0, o.drift, o.t));
  scratch.c.putImageData(scratch.image, 0, 0);
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false; // hard edges survive the upscale
  ctx.drawImage(scratch.canvas, 0, 0, o.w, o.h);
  ctx.imageSmoothingEnabled = smooth;
}
