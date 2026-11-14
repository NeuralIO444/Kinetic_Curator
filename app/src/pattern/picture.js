// picture.js — PATTERN PICTURE mode: an image sampled into a grid of shapes (#1795).
//
// Spec: docs/PATTERN_SPEC.md — Composition (PICTURE). Source loot: Tim Wingert's
// reel of a web tool that turns an image into a grid of shapes. In PATTERN terms
// it sits beside FIELD / QUILT / GLYPH: those generate their fields procedurally;
// this one derives the field from a picture. A sampler wearing a pattern mode's
// clothes — the image's brightness field decides where the mass is, the pool
// decides what the mass is made of.
//
// Matt's three rulings on the issue's open questions (2026-11-05):
//   1. Source: imported stills only, plus a bundled seed image so the mode
//      works out of the box (pictureSeed.js). NO live stage-frame recursion.
//   2. Tone mapping: FULL — the cell's tone drives the mark's scale (primary),
//      its rotation, and its colour, snapped to the active palette.
//   3. Cell geometry: the existing density/spacing controls. No new grid UI.
//
// The pool, as built: the issue says "a shape from the asset pool", and the
// pattern engine's rasterizable shape pool is GLYPH's thirteen constructed
// marks — the stage pool's assets are SVG strings baked to GL sprites for the
// stage renderer; they cannot enter the pure CPU Uint32 raster that
// patternSource, the worker, stills and the selfchecks all share, and baking
// a second mask pipeline would be a parallel system. So PICTURE composes
// GLYPH's marks (#1041) the way the picture dictates: per cell, the image
// picks the mark's size, quarter-turn pose and palette-snapped colours; the
// seed picks which marks appear. Rotation is GLYPH's rail: a seeded static
// pose in quarter turns — here the pose is read off the tone instead of a
// bare draw. Continuous turning lives where it always has, in the KINEME
// movers (SPIN / ROCK), which this mode rides like GLYPH.
//
// An image here is { id, w, h, rgb }: rgb is w*h*3 bytes, row-major, top row
// first. The frame path (patternSource) takes one as an optional argument and
// defaults to the bundled seed. Nothing is persisted on the pattern block —
// the block's ten fields are unchanged; the image is a frame input, the
// same way the palette is.
//
// The rails, ridden not reinvented: DRIFT is GLYPH's phase-offset scale pulse
// on the marks (the picture itself never moves); the DROP gate and the
// bar-quantized shuffle are mode-agnostic; per-element kinemes (#1042) ride
// elements.js exactly as GLYPH's do. MIX is mark entropy in GLYPH's sense:
// low MIX keeps one seeded HERO MARK across the whole picture, high MIX draws
// each cell's mark freely from the thirteen.
//
// Pure: no DOM, no Math.random, no clock. The assignment is a pure function
// of (seed, density, mix, palette, rows, image) — same inputs, same picture
// (the replay law).

import { mkRng } from '../engine/prng.js';
import { registerCostTier } from '../engine/kernel/costRegistry.mjs';
import { hash32, toRgba, parseHex, glyphRoles } from './engine.js';
import { GLYPH_MARKS, POSES, MARK_BOX, buildMark, sampleMark, motifRoles } from './glyph.js';
import { glyphPulse } from './motion.js';
import { pickMovers, elementXform, isRest } from './elements.js';
import { PICTURE_SEED_IMAGE } from './pictureSeed.js';

export { PICTURE_SEED_IMAGE };

/** DENSITY 4..12 → 8..24 cells across (TIDES' / BLOCKS' mapping: a picture wants the fine lattice). */
export const PICTURE_CELLS_PER_DENSITY = 2;
export const PICTURE_DEFAULT_DENSITY = 10;
export const PICTURE_DEFAULT_MIX = 0.55;
/** Tone → scale endpoints: a black cell's mark at 30% of the mark box, a white cell's at 125%. */
export const PICTURE_SCALE_MIN = 0.3;
export const PICTURE_SCALE_MAX = 1.25;

const clamp01 = (v) => Math.min(1, Math.max(0, Number(v) || 0));

/** cols for a DENSITY. Rows follow the frame height at the same square cell. */
export function pictureCols(density) {
  const d = Math.round(Number(density) || PICTURE_DEFAULT_DENSITY);
  return Math.max(4, d * PICTURE_CELLS_PER_DENSITY);
}

/**
 * The image a frame call means: the caller's, validated, or the bundled seed
 * picture when none (or junk) is given. A caller-supplied image keeps its
 * `id` — the identity frame cache keys use; pixels without one share the id
 * 'custom', so a caller that swaps images must supply stable ids.
 */
export function normalizePictureImage(image) {
  if (!image || typeof image !== 'object') return PICTURE_SEED_IMAGE;
  const w = Math.round(Number(image.w) || 0);
  const h = Math.round(Number(image.h) || 0);
  const rgb = image.rgb;
  if (w < 1 || h < 1 || !rgb || typeof rgb.length !== 'number' || rgb.length < w * h * 3) return PICTURE_SEED_IMAGE;
  return { id: typeof image.id === 'string' && image.id ? image.id : 'custom', w, h, rgb };
}

const lum255 = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b; // engine.js's weights

/**
 * Sample an image into a cols × rows grid of mean colours: the image is
 * cover-fit into the grid's aspect (scaled to cover, centre-cropped), and
 * each cell averages the source pixels whose centres fall in its region —
 * a cell finer than the source falls back to its nearest source pixel.
 * Pure and exact: the same image always samples the same.
 * @returns {Array<{r:number, g:number, b:number, tone:number}>} row-major; rgb 0..255, tone 0..1.
 */
export function samplePictureCells(image, cols, rows) {
  const img = normalizePictureImage(image);
  const nc = Math.max(1, Math.round(cols));
  const nr = Math.max(1, Math.round(rows));
  const scale = Math.max(nc / img.w, nr / img.h);
  const sw = nc / scale;
  const sh = nr / scale;
  const ox = (img.w - sw) / 2;
  const oy = (img.h - sh) / 2;
  const out = [];
  for (let r = 0; r < nr; r++) {
    for (let c = 0; c < nc; c++) {
      const x0 = ox + (c * sw) / nc;
      const x1 = ox + ((c + 1) * sw) / nc;
      const y0 = oy + (r * sh) / nr;
      const y1 = oy + ((r + 1) * sh) / nr;
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let n = 0;
      const pxA = Math.max(0, Math.floor(x0));
      const pxB = Math.min(img.w - 1, Math.ceil(x1) - 1);
      const pyA = Math.max(0, Math.floor(y0));
      const pyB = Math.min(img.h - 1, Math.ceil(y1) - 1);
      for (let py = pyA; py <= pyB; py++) {
        if (py + 0.5 < y0 || py + 0.5 >= y1) continue;
        for (let px = pxA; px <= pxB; px++) {
          if (px + 0.5 < x0 || px + 0.5 >= x1) continue;
          const o = (py * img.w + px) * 3;
          sr += img.rgb[o];
          sg += img.rgb[o + 1];
          sb += img.rgb[o + 2];
          n++;
        }
      }
      if (n === 0) {
        const px = Math.min(img.w - 1, Math.max(0, Math.floor((x0 + x1) / 2)));
        const py = Math.min(img.h - 1, Math.max(0, Math.floor((y0 + y1) / 2)));
        const o = (py * img.w + px) * 3;
        sr = img.rgb[o];
        sg = img.rgb[o + 1];
        sb = img.rgb[o + 2];
        n = 1;
      }
      const rr = sr / n;
      const gg = sg / n;
      const bb = sb / n;
      out.push({ r: rr, g: gg, b: bb, tone: lum255(rr, gg, bb) / 255 });
    }
  }
  return out;
}

/** A cell tone's mark scale: linear between the signed endpoints (bright = mass, on the palette's dark ground). */
export function pictureScale(tone) {
  return PICTURE_SCALE_MIN + (PICTURE_SCALE_MAX - PICTURE_SCALE_MIN) * clamp01(tone);
}

/**
 * A cell tone's pose: the tone's quarter band (dark → light) turned by the
 * seed's offset, in GLYPH's quarter turns. Tone 0..¼ is the first pose,
 * ¼..½ the next, and so on — rotation read off the picture, not drawn blind.
 */
export function picturePose(tone, offset = 0) {
  const band = Math.min(3, Math.floor(clamp01(tone) * 4));
  return POSES[(band + offset) % POSES.length];
}

/**
 * The assignment: pure function of its inputs. Colour is GLYPH's restricted
 * role set (glyphRoles — the strongest swatches, the darkest as ground): each
 * cell's mean colour is SNAPPED to the palette — MARK is the pool swatch
 * nearest the cell's colour, CUT the nearest of the rest, ACCENT the nearest
 * of what remains, so every painted colour is an exact palette string and
 * PATTERN still never invents a hue. Marks ride per-cell seeded streams
 * (hash32(seed, 0x7000+i), GLYPH's discipline): the MIX draw chooses the hero
 * mark or a free draw, then the same stream builds the mark's variant.
 *
 * @returns {{kind:'picture', cols, rows, ground, groundRgba, pool, imageId, hero, tiles}}
 *   tiles row-major, each {mark, pose, ops, roles, rgba, tone, scale, rgb, used} — a GLYPH tile
 *   plus the tone and scale the picture read into it.
 */
export function assignPicture(seed, density, mix, palette, rows, image) {
  const img = normalizePictureImage(image);
  const cols = pictureCols(density);
  const nrows = Math.max(1, Math.round(rows ?? cols));
  const { ground, pool } = glyphRoles(palette);
  const poolSafe = pool.length ? pool : [palette?.ink || '#ffffff'];
  const m = clamp01(mix);
  const samples = samplePictureCells(img, cols, nrows);

  // the seed's two picture-wide choices: one hero mark, one pose offset
  const srng = mkRng(hash32(seed, 0x91c7));
  const hero = GLYPH_MARKS[Math.floor(srng() * GLYPH_MARKS.length)];
  const poseOff = Math.floor(srng() * POSES.length);

  const poolRgb = poolSafe.map(parseHex);
  const nearest = (s, exclude) => {
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < poolRgb.length; i++) {
      if (exclude && exclude.has(i)) continue;
      const d = (poolRgb[i][0] - s.r) ** 2 + (poolRgb[i][1] - s.g) ** 2 + (poolRgb[i][2] - s.b) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  };

  const tiles = samples.map((s, i) => {
    const trng = mkRng(hash32(seed, 0x7000 + i));
    const mark = trng() < m ? GLYPH_MARKS[Math.floor(trng() * GLYPH_MARKS.length)] : hero;
    const pose = picturePose(s.tone, poseOff);
    const ops = buildMark(mark, trng, pose);
    const mi = nearest(s, null);
    const ci = nearest(s, new Set([mi]));
    const ai = nearest(s, new Set([mi, ci]));
    const roles = {
      mark: poolSafe[mi],
      cut: ci >= 0 ? poolSafe[ci] : poolSafe[mi],
      accent: ai >= 0 ? poolSafe[ai] : ci >= 0 ? poolSafe[ci] : poolSafe[mi],
      ground,
    };
    return {
      mark,
      pose,
      ops,
      roles,
      rgba: { mark: toRgba(roles.mark), cut: toRgba(roles.cut), accent: toRgba(roles.accent), ground: toRgba(ground) },
      tone: s.tone,
      scale: pictureScale(s.tone),
      rgb: [s.r, s.g, s.b],
      used: [...new Set(motifRoles(ops).map((k) => roles[k]))],
    };
  });

  return {
    kind: 'picture',
    cols,
    rows: nrows,
    ground,
    groundRgba: toRgba(ground),
    pool: poolSafe,
    imageId: img.id,
    hero,
    tiles,
  };
}

/**
 * #1137 — which cells carry a KINEME motion (Map cell index -> {kind, phase}), or null for none.
 * Every glyph is drawn to be turned, so every kind is open to every cell; only a seeded share moves.
 * GLYPH's mover map, cell for cell.
 */
export function pictureMoverMap(grid, seed, kin, movers) {
  if (!kin || kin === 'OFF') return null;
  const m = pickMovers(
    seed,
    kin,
    movers,
    grid.tiles.map((_, i) => ({ at: i, turns: true })),
  );
  return m.size ? m : null;
}

/** A cell's element transform at (drift, t), or null at rest. (engine.js's glyphXform, mirrored.) */
function pictureXform(mv, drift, t) {
  if (!mv) return null;
  const x = elementXform(mv, drift, t);
  return isRest(x) ? null : x;
}

/** sampleMark through a cell's element transform: offset down by dy cells, then turn by a about the mark's center. (engine.js's sampleMarkXf, mirrored.) */
function samplePictureXf(ops, lx, ly, scale, xe) {
  const dy = ly - xe.dy;
  if (xe.a === 0) return sampleMark(ops, lx, dy, scale);
  const cs = Math.cos(xe.a);
  const sn = Math.sin(xe.a);
  return sampleMark(ops, lx * cs + dy * sn, -lx * sn + dy * cs, scale);
}

/**
 * Rasterize the picture into a Uint32Array (RGBA, little-endian) of bw × bh.
 * Cells are square, side = bw / cols, origin top-left; rows overflow the
 * bottom edge and clip (TIDES' / BLOCKS' geometry — a picture fills its
 * frame, it is not letterboxed). A cell's mark scale is its tone scale,
 * pulsed by DRIFT like GLYPH's, turned and shifted by its KINEME if it has
 * one. Only the pixels inside a cell's mark box are sampled — the same
 * culling rasterGlyph is proven with (#1101).
 */
export function rasterPicture(buf, bw, bh, grid, drift = 0, t = 0, movers = null, kinT = t) {
  const { cols, rows, tiles, groundRgba } = grid;
  const cell = bw / cols;
  const count = cols * rows;
  buf.fill(groundRgba); // the frame and every cell's negative space
  for (let i = 0; i < count; i++) {
    const c = i % cols;
    const r = (i / cols) | 0;
    const tl = tiles[i];
    // this cell's own KINEME transform (null: the untouched path, number for number)
    // #2104 step 4 — the transform reads kinT (boil-quantized while a world stands); the
    // tone pulse below (glyphPulse) is a mode motion and keeps smooth t.
    const xe = movers && drift > 0 ? pictureXform(movers.get(i), drift, kinT) : null;
    if (xe && !xe.vis) continue; // blinked out: the ground shows
    const scale = glyphPulse(drift, t, i, count) * tl.scale * (xe ? xe.s : 1);
    // a turned mark needs the diagonal of its box; a bobbing one reaches |dy| cells further down or up
    const half = MARK_BOX * scale * cell * (xe && xe.a !== 0 ? Math.SQRT2 : 1) + (xe ? Math.abs(xe.dy) * cell : 0);
    const cx = (c + 0.5) * cell;
    const cy = (r + 0.5) * cell;
    const xa = Math.max(0, Math.floor(cx - half) - 1);
    const xb = Math.min(bw - 1, Math.ceil(cx + half) + 1);
    const ya = Math.max(0, Math.floor(cy - half) - 1);
    const yb = Math.min(bh - 1, Math.ceil(cy + half) + 1);
    if (xa > xb || ya > yb) continue; // a row that overflows below the frame entirely
    for (let y = ya; y <= yb; y++) {
      const gy = (y + 0.5) / cell;
      if (Math.floor(gy) !== r) continue; // a margin pixel that belongs to the next cell
      for (let x = xa; x <= xb; x++) {
        const gx = (x + 0.5) / cell;
        if (Math.floor(gx) !== c) continue;
        const role = xe
          ? samplePictureXf(tl.ops, gx - c - 0.5, gy - r - 0.5, scale, xe)
          : sampleMark(tl.ops, gx - c - 0.5, gy - r - 0.5, scale);
        if (role) buf[y * bw + x] = tl.rgba[role];
      }
    }
  }
  return buf;
}

/** The REFERENCE picture raster: every pixel of the frame, one at a time. rasterPicture is proven identical to it. */
export function rasterPictureReference(buf, bw, bh, grid, drift = 0, t = 0, movers = null, kinT = t) {
  const { cols, rows, tiles, groundRgba } = grid;
  const cell = bw / cols;
  const count = cols * rows;
  for (let y = 0; y < bh; y++) {
    const gy = (y + 0.5) / cell;
    const r = Math.floor(gy);
    for (let x = 0; x < bw; x++) {
      const gx = (x + 0.5) / cell;
      const c = Math.floor(gx);
      if (c < 0 || c >= cols || r < 0 || r >= rows) {
        buf[y * bw + x] = groundRgba;
        continue;
      }
      const i = r * cols + c;
      const tl = tiles[i];
      const xe = movers && drift > 0 ? pictureXform(movers.get(i), drift, kinT) : null;
      if (xe && !xe.vis) {
        buf[y * bw + x] = groundRgba;
        continue;
      }
      const scale = glyphPulse(drift, t, i, count) * tl.scale * (xe ? xe.s : 1);
      const role = xe
        ? samplePictureXf(tl.ops, gx - c - 0.5, gy - r - 0.5, scale, xe)
        : sampleMark(tl.ops, gx - c - 0.5, gy - r - 0.5, scale);
      buf[y * bw + x] = role ? tl.rgba[role] : groundRgba;
    }
  }
  return buf;
}

/**
 * Which cell scene point (x, y) is in, for a frame `w` wide: the ground
 * sampler (#1183) uses this so marks lean toward the colour the picture
 * snapped to under them. main is the cell's MARK colour (its snapped main);
 * u / v run across the cell; side is the cell side in scene units.
 */
export function pictureCellAt(grid, w, x, y) {
  const cell = w / grid.cols;
  const gx = x / cell;
  const gy = y / cell;
  const c = ((Math.floor(gx) % grid.cols) + grid.cols) % grid.cols;
  const r = ((Math.floor(gy) % grid.rows) + grid.rows) % grid.rows;
  const tl = grid.tiles[r * grid.cols + c];
  return {
    main: tl.roles.mark,
    colors: [...new Set([tl.roles.mark, tl.roles.accent, tl.roles.cut])],
    u: gx - Math.floor(gx),
    v: gy - Math.floor(gy),
    side: cell,
  };
}

// Cost tier, declared at registration (#1795 asked for it, as #1797 / #1798 did). A CPU raster, not a GPU
// pass, so the governor's shed ladder never touches it: tier 0 like the kernel's scent grid. The assignment
// samples the source image once per grid (≤ 24×17 cells over a ≤ 64×48 seed, or the import's own pixels);
// the raster is GLYPH's box-culled mark sampling on a frame-filling grid — measured by picture.selfcheck.
registerCostTier('pattern/picture', {
  tier: 0,
  memoryBytes: 0,
  timeMs: 25,
  notes:
    '#1795 PATTERN PICTURE: CPU image-sampled mark raster — the picture is averaged into ≤ ~400 cells once ' +
    "per grid, then each frame is GLYPH's box-culled mark sampling over them. Stills are drawn once and " +
    'cached like any DRIFT-0 pattern.',
});
