// engine.js — PATTERN engine, mode-agnostic core + FIELD (#1039) + QUILT (#1040)
// + GLYPH (#1041). ESCHER stays parked.
//
// Everything that decides WHAT is drawn is pure and seeded: `assign` is a pure
// function of (seed, density, mix, palette), the pan offset is a pure function
// of (seed, drift, t). Nothing here reads Math.random, the clock, or a store.
// SEED is the stored integer, never a hidden rng state.

import { mkRng } from '../engine/prng.js';
import { FIELD_PATTERNS, samplePattern, patternParams } from './field.js';
import { TILE_MOTIFS, HERO_MOTIFS, sampleQuilt, quiltParams } from './quilt.js';
import { GLYPH_MARKS, FILLED_MARKS, RHYTHM_MARKS, POSES, MIN_STROKE, buildMark, sampleMark, motifRoles } from './glyph.js';
import { rankedSwatches } from '../data/swatchWeights.js';
import { motion, glyphPulse, fieldPan, QUILT_ROTATING, FIELD_PAN_TILES_PER_S } from './motion.js';

export { FIELD_PAN_TILES_PER_S }; // the pan speed lives in motion.js now (#1042)

/** Default FIELD grid is 6 tiles across. */
export const FIELD_DEFAULT_DENSITY = 6;

/** QUILT defaults and limits (docs/PATTERN_SPEC.md, #1040). Fractions, not percents. */
export const QUILT_DEFAULT_DENSITY = 8;
export const QUILT_DEFAULT_MIX = 0.55;
export const QUILT_DEFAULT_GROUT = 0.03;
export const QUILT_MAX_GROUT = 0.08;
export const QUILT_DEFAULT_HERO = 0.25;
/** At least one tile DRIFT can rotate per this many tiles (aligned runs, the tail run included). */
export const QUILT_QUOTA_RUN = 16;

/** GLYPH defaults (docs/PATTERN_SPEC.md, #1041). DENSITY 4 is the 5×4 poster grid. */
export const GLYPH_DEFAULT_DENSITY = 4;
export const GLYPH_DEFAULT_MIX = 0.55;
/** GLYPH draws from at most this many of the palette's strongest swatches. */
export const GLYPH_MAX_ROLES = 6;
/** DRIFT pulse depth: scale = 1 + 0.2 × DRIFT × sin(phase + t). */
export const GLYPH_PULSE = 0.2;
/** The filled-mark quota: at least one per aligned run of this many tiles. */
export const GLYPH_QUOTA_RUN = 8;

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
  return fieldPan(drift, t, panAngle(seed));
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

  // 1b) the never-static quota (#1042): every aligned run of 16, tail included, holds a tile DRIFT can
  //     turn (pinwheel or medallion), or the quilt would sit still at DRIFT > 0. The last
  //     tile of a bare run is replaced from its own stream, so the main stream above does
  //     not shift. Hero medallions count too; they are checked after the hero walk below.

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

  // 4) the quota, now that heroes are known: a medallion hero covers its four cells.
  const turns = (i) => (heroAt[i] !== -1 ? heroes[heroAt[i]].pattern === 'medallion' : QUILT_ROTATING.includes(tiles[i].pattern));
  // The tail run counts too: a small grid (4×3 at DENSITY 4) is all tail, and must still move.
  for (let start = 0; start < tiles.length; start += QUILT_QUOTA_RUN) {
    const end = Math.min(start + QUILT_QUOTA_RUN, tiles.length);
    let has = false;
    for (let i = start; i < end && !has; i++) has = turns(i);
    if (has) continue;
    let at = end - 1;
    while (at > start && heroAt[at] !== -1) at -= 1; // never overwrite a cell a hero covers
    const qrng = mkRng(hash32(seed, 0x3a000 + start));
    const name = QUILT_ROTATING[Math.floor(qrng() * QUILT_ROTATING.length)];
    const colors = motifColors(qrng, ground, brights);
    tiles[at] = { pattern: name, colors, rgba: colors.map(toRgba), params: quiltParams(name, qrng) };
  }

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
function quiltCell(grid, X, Y, rot = null) {
  const c = Math.min(grid.cols - 1, Math.max(0, Math.floor(X)));
  const r = Math.min(grid.rows - 1, Math.max(0, Math.floor(Y)));
  const hi = grid.heroAt[r * grid.cols + c];
  let tile; let u; let v; let at;
  if (hi !== -1) {
    tile = grid.heroes[hi]; u = (X - tile.c) / 2; v = (Y - tile.r) / 2; at = tile.r * grid.cols + tile.c;
  } else {
    tile = grid.tiles[r * grid.cols + c]; u = X - c; v = Y - r; at = r * grid.cols + c;
  }
  // DRIFT (#1042): only the motif art turns, about the tile center. A tile's ground is the
  // frame itself, so no corner can show through; the art is sampled, not clipped, and the
  // pinwheel fills the whole plane, so its corners stay motif-colored at any angle.
  const a = rot && QUILT_ROTATING.includes(tile.pattern) ? rot[at] : 0;
  if (a) {
    const cs = Math.cos(a); const sn = Math.sin(a);
    const dx = u - 0.5; const dy = v - 0.5;
    u = 0.5 + dx * cs + dy * sn; v = 0.5 - dx * sn + dy * cs;
  }
  return { tile, u, v };
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
export function rasterQuilt(buf, bw, bh, grid, tileW, grout = 0, drift = 0, t = 0) {
  const m = motion('QUILT', drift, t, { count: grid.cols * grid.rows });
  const rot = m.kind === 'rotate' ? Float64Array.from({ length: grid.cols * grid.rows }, (_, i) => m.angle(i)) : null;
  for (let y = 0; y < bh; y++) {
    const Y = (y + 0.5) / tileW;
    for (let x = 0; x < bw; x++) {
      const X = (x + 0.5) / tileW;
      if (onGrout(grid, X, Y, grout)) { buf[y * bw + x] = grid.groundRgba; continue; }
      const { tile, u, v } = quiltCell(grid, X, Y, rot);
      buf[y * bw + x] = tile.rgba[sampleQuilt(tile.pattern, u, v, tile.params)];
    }
  }
  return buf;
}

// ── GLYPH (#1041) ───────────────────────────────────────────────────────────

/** cols × rows for a DENSITY: 5:4, clamped. DENSITY 4 → 5×4, 8 → 10×8, 12 → 15×12. */
export function glyphGrid(density) {
  const d = Number(density) || GLYPH_DEFAULT_DENSITY;
  return {
    cols: Math.min(16, Math.max(4, Math.round((5 * d) / 4))),
    rows: Math.min(12, Math.max(3, Math.round(d))),
  };
}

/**
 * The restricted set: the palette's strongest swatches by weight (#1049), at
 * most GLYPH_MAX_ROLES, duplicates dropped. Ground is the darkest OF THAT SET;
 * the rest is the MARK / CUT / ACCENT pool, strongest first.
 */
export function glyphRoles(palette) {
  const set = [...new Set(rankedSwatches(palette))].slice(0, GLYPH_MAX_ROLES);
  const all = set.length ? set : [palette?.bg || '#000000', palette?.ink || '#ffffff'];
  let gi = 0;
  all.forEach((c, i) => { if (lum(c) < lum(all[gi])) gi = i; });
  return { ground: all[gi], pool: all.filter((_, i) => i !== gi) };
}

/**
 * The glyph assignment: pure function of its inputs.
 *
 * Marks and colors are two independent seeded walks. MIX is mark entropy only:
 * low MIX alternates sunburst / crossed disc, MIX is the per-tile probability
 * of a free draw from all thirteen. The filled-mark quota then repairs any
 * aligned run of 8 that has no distance anchor. The color walk is row-major
 * and never gives a tile the MARK color of its left or upper neighbor.
 *
 * No heroes: HERO is not a parameter here.
 *
 * @returns {{cols, rows, ground, groundRgba, pool, tiles}} tiles row-major, each
 *   {mark, pose, ops, roles:{mark,cut,accent,ground}, rgba:{...}, used:string[]}.
 */
export function assignGlyph(seed, density, mix, palette) {
  const { cols, rows } = glyphGrid(density);
  const count = cols * rows;
  const { ground, pool } = glyphRoles(palette);
  const m = clamp01(mix);

  // 1) marks
  const mrng = mkRng(hash32(seed, 0x61f));
  const marks = [];
  for (let i = 0; i < count; i++) {
    const draw = mrng(); const free = Math.floor(mrng() * GLYPH_MARKS.length);
    const c = i % cols; const r = Math.floor(i / cols);
    marks.push(draw < m ? GLYPH_MARKS[free] : RHYTHM_MARKS[(c + r) % 2]);
  }
  // quota: every full aligned run of 8 holds a filled mark; a trailing partial run is exempt.
  for (let start = 0; start + GLYPH_QUOTA_RUN <= count; start += GLYPH_QUOTA_RUN) {
    const pickFilled = FILLED_MARKS[Math.floor(mrng() * FILLED_MARKS.length)]; // drawn every run: the stream does not depend on the repair
    const run = marks.slice(start, start + GLYPH_QUOTA_RUN);
    if (!run.some((n) => FILLED_MARKS.includes(n))) marks[start + GLYPH_QUOTA_RUN - 1] = pickFilled;
  }

  // 2) color walk
  const crng = mkRng(hash32(seed, 0xc01));
  const flip = crng() < 0.5 ? 0 : 1; // pool of two: which role takes even parity
  const markCol = [];
  for (let i = 0; i < count; i++) {
    const c = i % cols; const r = Math.floor(i / cols);
    const roll = crng();
    if (pool.length <= 1) { markCol.push(pool[0] ?? ground); continue; } // rule waived
    if (pool.length === 2) { markCol.push(pool[(c + r + flip) % 2]); continue; }
    const left = c > 0 ? markCol[i - 1] : null; const up = r > 0 ? markCol[i - cols] : null;
    const ok = pool.filter((p) => p !== left && p !== up);
    markCol.push(ok[Math.floor(roll * ok.length)]);
  }

  // 3) pose, variant, secondary roles — one stream per tile
  const tiles = marks.map((mark, i) => {
    const trng = mkRng(hash32(seed, 0x7000 + i));
    const pose = POSES[Math.floor(trng() * POSES.length)];
    const ops = buildMark(mark, trng, pose);
    const others = pool.filter((p) => p !== markCol[i]);
    // CUT and ACCENT are distinct from MARK and from each other while the pool allows it.
    const cut = others.length ? others[Math.floor(trng() * others.length)] : markCol[i];
    const rest = others.filter((p) => p !== cut);
    const accent = rest.length ? rest[Math.floor(trng() * rest.length)] : cut;
    const roles = { mark: markCol[i], cut, accent, ground };
    const used = [...new Set(motifRoles(ops).map((k) => roles[k]))];
    return { mark, pose, ops, roles, rgba: { mark: toRgba(roles.mark), cut: toRgba(cut), accent: toRgba(accent), ground: toRgba(ground) }, used };
  });

  return { cols, rows, ground, groundRgba: toRgba(ground), pool, tiles };
}

/** DRIFT pulse for tile i of `count` at loop time t (seconds): 1 at DRIFT 0, within [0.8, 1.2] at 100%. */
export function glyphScale(i, count, drift, t) {
  return glyphPulse(drift, t, i, count);
}

/**
 * Where the grid sits in a bw × bh frame: square tiles, centered, letterboxed.
 * @returns {{tile, x0, y0}} tile size and top-left of the grid, in pixels.
 */
export function glyphLayout(grid, bw, bh) {
  const tile = Math.min(bw / grid.cols, bh / grid.rows);
  return { tile, x0: (bw - tile * grid.cols) / 2, y0: (bh - tile * grid.rows) / 2 };
}

/**
 * Rasterize the glyph board into a Uint32Array (RGBA, little-endian) of bw × bh.
 * Frame outside the grid is the ground role. The grid does not pan; DRIFT is a
 * per-tile scale pulse about the tile center.
 *
 * GROUT is not a parameter: in GLYPH it is a hairline in the GROUND role that
 * never enters the mark box, and a mark never reaches a seam (72% of the tile
 * at most). Ground on ground draws nothing, so there is nothing to draw.
 */
export function rasterGlyph(buf, bw, bh, grid, drift = 0, t = 0) {
  const { cols, rows, tiles, groundRgba } = grid;
  const { tile, x0, y0 } = glyphLayout(grid, bw, bh);
  const count = cols * rows;
  const scales = tiles.map((_, i) => glyphScale(i, count, drift, t));
  for (let y = 0; y < bh; y++) {
    const gy = (y + 0.5 - y0) / tile; const r = Math.floor(gy);
    for (let x = 0; x < bw; x++) {
      const gx = (x + 0.5 - x0) / tile; const c = Math.floor(gx);
      if (c < 0 || c >= cols || r < 0 || r >= rows) { buf[y * bw + x] = groundRgba; continue; }
      const i = r * cols + c;
      const role = sampleMark(tiles[i].ops, gx - c - 0.5, gy - r - 0.5, scales[i]);
      buf[y * bw + x] = role ? tiles[i].rgba[role] : groundRgba;
    }
  }
  return buf;
}

/**
 * Draw the glyph board with canvas paths: the same ops, the same layout and the
 * same DRIFT scale as rasterGlyph, at the output resolution. rasterGlyph is the
 * reference the selfcheck proves; this is what the screen gets, because a board
 * of thin strokes has to stay sharp at any size and animate at frame rate.
 */
export function drawGlyph(ctx, grid, w, h, drift = 0, t = 0) {
  const { cols, rows, tiles, ground } = grid;
  const { tile, x0, y0 } = glyphLayout(grid, w, h);
  const count = cols * rows;
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, w, h); // tiles and letterbox are one ground
  tiles.forEach((tl, i) => {
    const scale = glyphScale(i, count, drift, t);
    const k = tile * scale; // tile-local units → pixels
    const ox = x0 + ((i % cols) + 0.5) * tile; const oy = y0 + (Math.floor(i / cols) + 0.5) * tile;
    const X = (v) => ox + v * k; const Y = (v) => oy + v * k;
    const width = (v) => Math.max(v * scale, MIN_STROKE) * tile; // the floor holds after the scale
    for (const op of tl.ops) {
      const color = tl.roles[op.role];
      ctx.beginPath();
      if (op.type === 'disc') {
        ctx.arc(X(op.cx), Y(op.cy), op.r * k, 0, Math.PI * 2);
        ctx.fillStyle = color; ctx.fill();
      } else if (op.type === 'ring') {
        ctx.arc(X(op.cx), Y(op.cy), op.r * k, 0, Math.PI * 2);
        ctx.strokeStyle = color; ctx.lineWidth = width(op.w); ctx.stroke();
      } else if (op.type === 'seg') {
        ctx.moveTo(X(op.x1), Y(op.y1)); ctx.lineTo(X(op.x2), Y(op.y2));
        ctx.strokeStyle = color; ctx.lineWidth = width(op.w); ctx.lineCap = op.cap; ctx.stroke();
      } else if (op.type === 'poly') {
        op.pts.forEach(([px, py], j) => (j ? ctx.lineTo(X(px), Y(py)) : ctx.moveTo(X(px), Y(py))));
        ctx.closePath(); ctx.fillStyle = color; ctx.fill();
      } else if (op.type === 'lens') {
        // two arcs of radius R whose centers sit d either side of the long axis
        const R = (op.a * op.a + op.h * op.h) / (2 * op.h); const d = R - op.h;
        const half = Math.asin(op.a / R);
        if (op.vertical) {
          ctx.arc(X(d), Y(0), R * k, Math.PI - half, Math.PI + half);
          ctx.arc(X(-d), Y(0), R * k, -half, half);
        } else {
          ctx.arc(X(0), Y(d), R * k, -Math.PI / 2 - half, -Math.PI / 2 + half);
          ctx.arc(X(0), Y(-d), R * k, Math.PI / 2 - half, Math.PI / 2 + half);
        }
        ctx.closePath(); ctx.fillStyle = color; ctx.fill();
      }
    }
  });
}

// Renderer scratch: one small offscreen surface, reused, never reallocated per frame.
let scratch = null;
const BUF_W = 512;

/**
 * Draw a FIELD, QUILT or GLYPH frame to a 2D canvas context.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{mode:'FIELD'|'QUILT'|'GLYPH', seed:number, density:number, mix:number, drift:number,
 *   grout?:number, hero?:number, palette:object, t:number, w:number, h:number}} o
 *   QUILT reads grout (0–0.08 of a tile) and hero (0–1), and drift turns its pinwheels and medallions.
 *   t is LOOP time in seconds for every mode (the loop clock, not wall time).
 *   GLYPH letterboxes a 5:4 grid, ignores grout and hero, and pulses with drift and t.
 * Square tiles; rows fill the frame height at the same tile size (partial edge
 * tiles are fine: the field is a textile and pans). GROUT is not a parameter
 * here: FIELD forces it to 0.
 */
export function renderPattern(ctx, o) {
  if (o.mode !== 'FIELD' && o.mode !== 'QUILT' && o.mode !== 'GLYPH') throw new Error(`renderPattern: mode ${o.mode} is not built yet`);
  const quilt = o.mode === 'QUILT';
  const glyph = o.mode === 'GLYPH';
  const density = Math.max(1, Math.round(o.density || (quilt ? QUILT_DEFAULT_DENSITY : glyph ? GLYPH_DEFAULT_DENSITY : FIELD_DEFAULT_DENSITY)));
  const tileW = o.w / density;
  const rows = Math.max(1, Math.ceil(o.h / tileW));
  const grid = glyph
    ? assignGlyph(o.seed >>> 0, density, o.mix ?? GLYPH_DEFAULT_MIX, o.palette)
    : quilt
      ? assignQuilt(o.seed >>> 0, density, o.mix ?? QUILT_DEFAULT_MIX, o.hero ?? QUILT_DEFAULT_HERO, o.palette, rows)
      : assign(o.seed >>> 0, density, o.mix, o.palette, rows);
  if (glyph) { drawGlyph(ctx, grid, o.w, o.h, o.drift, o.t); return; }
  const bw = Math.min(BUF_W, Math.max(1, Math.round(o.w)));
  const bh = Math.max(1, Math.round(bw * (o.h / o.w)));
  if (!scratch || scratch.w !== bw || scratch.h !== bh) {
    const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(bw, bh) : Object.assign(document.createElement('canvas'), { width: bw, height: bh });
    const c = canvas.getContext('2d');
    scratch = { canvas, c, image: c.createImageData(bw, bh), w: bw, h: bh };
  }
  const px = new Uint32Array(scratch.image.data.buffer);
  if (quilt) rasterQuilt(px, bw, bh, grid, bw / density, o.grout ?? QUILT_DEFAULT_GROUT, o.drift, o.t);
  else rasterField(px, bw, bh, grid, bw / density, panOffset(o.seed >>> 0, o.drift, o.t));
  scratch.c.putImageData(scratch.image, 0, 0);
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false; // hard edges survive the upscale
  ctx.drawImage(scratch.canvas, 0, 0, o.w, o.h);
  ctx.imageSmoothingEnabled = smooth;
}
