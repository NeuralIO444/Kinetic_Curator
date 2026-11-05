// dishLifeRender.mjs — DISH LIFE slice 3b (#1923): the culture as marks. Pure.
//
// One world (#1183): the cells are the marks' own grid, drawn through the normal stamp/Look path —
// NOT a pixel overlay. This module turns a culture's published field into ordinary placement items
// (the same { x, y, scale, rotation, alpha, assetId, color, key, … } shape buildPlacements emits), so
// the resolver stamps them exactly as it stamps any other mark and every Look/palette/effect applies.
//
//   THE SCENE'S OWN ASSETS — each live cell takes the asset, colour and tier of the NEAREST original
//   mark (assigned once at wake), so the culture reads as the performer's scene growing, in their
//   palette. Alpha follows the cell's level (alive → decaying → gone) and the nearest mark's alpha;
//   scale shrinks with decay, so colonies rot with tails instead of blinking off. Output alpha is the placement
//   engine's 0..100 (a mark's own alpha is read as 0..100, or 0..1).
//
//   THE SCENE DISSOLVES INTO IT — the original marks fade out over the first DISSOLVE_GENS generations
//   while the cells fade in, so the dish shows the culture, not both. Generation 0 IS the scene; touching
//   restores it exactly (the originals are never edited — dissolve returns new items).
//
//   BOUNDED — at most `maxItems` cells are emitted, the strongest first (level, then cell index), so the
//   instrument's mark budget holds and the cut is deterministic.
//
//   PURE — no clock, no random, no module state. Same (marks, culture, gen) = same items.

import { MARK_FRAC } from './dishLifeSeed.mjs';

/** Generations over which the scene's own marks fade out and the cells fade in. */
export const DISSOLVE_GENS = 8;
/** Most culture cells emitted per frame (the mark budget; strongest first). */
export const MAX_CELL_ITEMS = 600;
/** A live cell's stamp radius, in cells. */
export const CELL_RADIUS = 0.6;
/** Scale of a nearly-dead cell relative to a live one. */
export const DECAY_SCALE_MIN = 0.45;

const alpha01 = (a) => {
  const v = Number.isFinite(Number(a)) ? Number(a) : 1;
  return Math.max(0, Math.min(1, v > 1 ? v / 100 : v));
};

/**
 * For every grid cell, the index of the nearest mark (or -1 with no marks). Brute force, run once per wake:
 * cells × marks is a few million distance checks, never per frame.
 */
export function nearestMarks(marks, { canvasW, canvasH, cols, rows }) {
  const out = new Int32Array(cols * rows).fill(-1);
  if (!Array.isArray(marks) || marks.length === 0) return out;
  const cw = canvasW / cols;
  const ch = canvasH / rows;
  const px = new Float64Array(marks.length);
  const py = new Float64Array(marks.length);
  let any = false;
  for (let k = 0; k < marks.length; k++) {
    const m = marks[k];
    const ok = m && typeof m === 'object' && Number.isFinite(m.x) && Number.isFinite(m.y);
    px[k] = ok ? m.x : NaN;
    py[k] = ok ? m.y : NaN;
    if (ok) any = true;
  }
  if (!any) return out;
  for (let y = 0; y < rows; y++) {
    const cy = (y + 0.5) * ch;
    for (let x = 0; x < cols; x++) {
      const cx = (x + 0.5) * cw;
      let best = -1;
      let bd = Infinity;
      for (let k = 0; k < marks.length; k++) {
        if (px[k] !== px[k]) continue; // NaN: a junk mark
        const dx = px[k] - cx;
        const dy = py[k] - cy;
        const d = dx * dx + dy * dy;
        if (d < bd) {
          bd = d;
          best = k;
        }
      }
      out[y * cols + x] = best;
    }
  }
  return out;
}

/** How much of the scene's own marks remains at generation `gen` (1 → 0 over DISSOLVE_GENS). */
export function sceneKeep(gen, dissolveGens = DISSOLVE_GENS) {
  if (!(gen > 0)) return 1;
  return Math.max(0, 1 - gen / Math.max(1, dissolveGens));
}

/** How much of the culture shows at generation `gen` (0 → 1 over DISSOLVE_GENS; generation 0 is the scene alone). */
export function cultureShow(gen, dissolveGens = DISSOLVE_GENS) {
  if (!(gen > 0)) return 0;
  return Math.min(1, gen / Math.max(1, dissolveGens));
}

/**
 * The scene's own marks, dissolved for generation `gen`. Returns NEW items (the originals are never
 * edited); marks that have fully dissolved are dropped. At generation 0 the original array is returned as-is.
 */
export function dissolveMarks(marks, gen, dissolveGens = DISSOLVE_GENS) {
  if (!Array.isArray(marks)) return [];
  const keep = sceneKeep(gen, dissolveGens);
  if (keep >= 1) return marks;
  if (keep <= 0) return [];
  return marks.map((m) => (m ? { ...m, alpha: alpha01(m.alpha) * keep * 100 } : m));
}

/**
 * The culture's live cells as placement items.
 *   marks — the scene's own marks (assets, colours, tiers come from the nearest of these)
 *   nearest — nearestMarks(...) for this wake
 *   opts — { canvasW, canvasH, maxItems? }
 */
export function cultureItems(
  culture,
  marks,
  nearest,
  { canvasW, canvasH, maxItems = MAX_CELL_ITEMS, dissolveGens = DISSOLVE_GENS } = {},
) {
  if (!culture || !Array.isArray(marks) || marks.length === 0) return [];
  const { cols, rows, field } = culture;
  const show = cultureShow(culture.gen, dissolveGens);
  if (show <= 0) return [];
  const cw = canvasW / cols;
  const ch = canvasH / rows;
  const short = Math.min(canvasW, canvasH);
  const liveScale = (CELL_RADIUS * Math.min(cw, ch)) / (MARK_FRAC * short);
  const level = field.level;
  // strongest first, ties by cell index — the cut is deterministic and keeps the colonies' cores
  const live = [];
  for (let i = 0; i < level.length; i++) if (level[i] > 0 && nearest[i] >= 0) live.push(i);
  live.sort((a, b) => level[b] - level[a] || a - b);
  const n = Math.min(live.length, Math.max(0, maxItems | 0));
  const out = new Array(n);
  for (let k = 0; k < n; k++) {
    const i = live[k];
    const m = marks[nearest[i]];
    const l = level[i];
    const x = i % cols;
    const y = (i - x) / cols;
    const scale = liveScale * (DECAY_SCALE_MIN + (1 - DECAY_SCALE_MIN) * l);
    // the cell IS the nearest mark's kind: every field it carries (asset, colour, tier, glass/plate/wash/stipple,
    // matParams, rotation, t) rides along, so the stamp/Look path draws it exactly as it draws that mark
    out[k] = {
      ...m,
      x: (x + 0.5) * cw,
      y: (y + 0.5) * ch,
      scale,
      scaleY: scale,
      alpha: alpha01(m.alpha) * l * show * 100, // placement alpha is 0..100
      index: i,
      key: `life:${i}`,
    };
  }
  return out;
}

/** The whole frame while a culture runs: the dissolving scene, then the cells. */
export function cultureFrame(marks, culture, nearest, opts = {}) {
  const gen = culture ? culture.gen : 0;
  const scene = dissolveMarks(marks, gen, opts.dissolveGens);
  const cells = cultureItems(culture, marks, nearest, opts);
  return cells.length ? scene.concat(cells) : scene;
}
