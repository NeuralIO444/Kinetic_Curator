// dishFluidDrift.mjs — the one force seam, slice 1 (docs/design/one-force-seam.md): the ferrofluid moves the stage's
// own marks. Pure.
//
// Matt's ruling (2026-11-16): assets, type, creatures, beasts, DISH LIFE and the ferrofluid are one system — fields are
// never drawn, only the stage's assets move. Bones already lean toward the magnets (engine/dishFluidPull.mjs, #2190);
// this is the same law for a plain mark: a mark standing in field at or above the matter floor LEANS toward the nearest
// magnet, by up to DRIFT_MAX_PX (about a mark's width), and springs back when the field leaves. Lean, not travel: the
// read is stateless, so a mark never leaves its place in the layout and the dealt scene returns exactly at dial 0.
//
// The law, per mark: no magnets, PULL at 0, the mark off the dish, or the cell under it below the floor → no lean. Else
// the lean points at the nearest magnet (the kernel's aspect-corrected metric, bonePullDelta's), its length is
// DRIFT_MAX_PX × PULL × the density's rise above the floor (0 at the floor, so a mark never snaps on), and it never
// overshoots the magnet.
//
// Order (the seam's fixed order): this runs AFTER the culture's LIFE fade — the culture decides presence, the fluid
// moves what is left. It writes x/y, so like every position pass it returns an undo that restores the exact cached
// values (the geometry cache must stay clean).

import { FLUID_GRID_COLS, FLUID_GRID_ROWS } from './dishFluid.mjs';
import { MATTER_DENSITY_FLOOR } from './dishFluidRender.mjs';
import { stampWidthEm } from '../poets/placement.js';

/** The density a mark's cell must reach before the field can lean it (the matter floor, the bone pull's floor). */
export const DRIFT_DENSITY_FLOOR = MATTER_DENSITY_FLOOR;
/** The farthest a mark leans toward a magnet, at saturated field and full PULL, in stage px (about a mark's width). */
export const DRIFT_MAX_PX = 32;

/**
 * The lean on one mark at stage (x, y). `field`: { density (dish grid), magnets (sanitized, dish-normalized), pull
 * (0..1), aspectHW, W, H }. Returns { dx, dy } in stage px, or null (no lean — the mark stands exactly as dealt).
 */
export function markDriftDelta(field, x, y) {
  if (!field || !field.density || field.density.length !== FLUID_GRID_COLS * FLUID_GRID_ROWS) return null;
  const magnets = Array.isArray(field.magnets) ? field.magnets : [];
  const pull = Number(field.pull);
  if (!magnets.length || !(pull > 0)) return null;
  const W = Number(field.W) || 0;
  const H = Number(field.H) || 0;
  if (!(W > 0) || !(H > 0)) return null;
  const nx = x / W;
  const ny = y / H;
  if (!(nx >= 0) || !(nx < 1) || !(ny >= 0) || !(ny < 1)) return null;
  const cx = Math.min(FLUID_GRID_COLS - 1, Math.floor(nx * FLUID_GRID_COLS));
  const cy = Math.min(FLUID_GRID_ROWS - 1, Math.floor(ny * FLUID_GRID_ROWS));
  const d = field.density[cy * FLUID_GRID_COLS + cx];
  if (!(d > DRIFT_DENSITY_FLOOR)) return null;
  const aspectHW =
    Number.isFinite(Number(field.aspectHW)) && Number(field.aspectHW) > 0 ? Number(field.aspectHW) : H / W;
  let best = null;
  let bd = Infinity;
  for (const m of magnets) {
    const ddx = nx - m.x;
    const ddy = (ny - m.y) * aspectHW;
    const dd = ddx * ddx + ddy * ddy;
    if (dd < bd) {
      bd = dd;
      best = m;
    }
  }
  if (!best) return null;
  const vx = best.x * W - x;
  const vy = best.y * H - y;
  const dist = Math.hypot(vx, vy);
  if (!(dist > 1e-6)) return null;
  const rise = Math.min(1, (d - DRIFT_DENSITY_FLOOR) / (1 - DRIFT_DENSITY_FLOOR));
  const len = Math.min(dist, DRIFT_MAX_PX * Math.min(1, pull) * rise);
  if (!(len > 0)) return null;
  return { dx: (vx / dist) * len, dy: (vy / dist) * len };
}

/**
 * Lean the placed marks toward the magnets. Pinned marks (`still[k] === 1`) stand still. Returns an undo that restores
 * the SoA's exact x/y, or null when nothing moved (the SoA is untouched).
 */
export function applyFluidDrift(soa, field, still = null) {
  if (!soa || !field) return null;
  const n = soa.n | 0;
  const idx = [];
  const ox = [];
  const oy = [];
  for (let k = 0; k < n; k++) {
    if (still && still[k] === 1) continue;
    const x = soa.x[k];
    const y = soa.y[k];
    const lean = markDriftDelta(field, x, y);
    if (!lean) continue;
    idx.push(k);
    ox.push(x);
    oy.push(y);
    soa.x[k] = x + lean.dx;
    soa.y[k] = y + lean.dy;
  }
  if (!idx.length) return null;
  return () => {
    for (let j = 0; j < idx.length; j++) {
      soa.x[idx[j]] = ox[j];
      soa.y[idx[j]] = oy[j];
    }
  };
}

// ---------------------------------------------------------------- the poem: whole words (seam slice 3)
//
// Matt (2026-11-16): the poem (an armed FIELD form) leans by WHOLE WORDS — each word moves as one piece toward the
// magnet, so the letters inside it stay intact; the poem is never copied and never culture-faded (a held form is
// present, not a ghost). Placement's law is that glyph ink never overlaps (poets/placement.js); the groups keep it:
//   · a word is never split: a break needs an ink gap wider than POEM_WORD_GAP_EM (a word's letters sit one track
//     apart; a space leaves SPACE_ADV 0.42 em more) AND a centre step 1.5× the line's tightest (a grid's empty cell);
//   · each group's lean is capped at POEM_LEAN_EM of its em, so two groups can close on each other by at most the sum
//     of their caps — and any two groups whose ink is not farther apart than that are MERGED and move as one. So
//     neighbouring words that sit tight (a dense grid, a close line pitch) lean together; ink can never close.

/** A poem group's farthest lean, in its own em. */
export const POEM_LEAN_EM = 0.2;
/** An ink gap between neighbours on one line wider than this (em) is a word break (a track is 0.16–0.26 em). */
export const POEM_WORD_GAP_EM = 0.35;
/** Stamps on one line share their baseline exactly; anything within this (em) is the same line. */
const POEM_LINE_EPS_EM = 0.25;

/** A stamp's ink box in form units (placement's ruler; a rotated stamp takes its square bound). */
function stampBox(s) {
  const em = Number(s.em) || 0;
  const w = Math.max(0, stampWidthEm(s.assetId, s.ch)) * em;
  const rot = Number(s.rotation) || 0;
  const hw = (rot !== 0 ? Math.max(w, em) : w) / 2;
  const hh = (rot !== 0 ? Math.max(w, em) : em) / 2;
  return { l: s.x - hw, r: s.x + hw, t: s.y - hh, b: s.y + hh, em };
}

const WORDS_CACHE = new WeakMap();
/**
 * Group a form's stamps (reading order) into lean groups: arrays of stamp indices. Words first (a new line, or a word
 * gap), then any two groups whose ink is within both caps of each other are merged. Pure; cached per stamps array.
 */
export function poemWords(stamps) {
  if (!Array.isArray(stamps)) return [];
  const hit = WORDS_CACHE.get(stamps);
  if (hit) return hit;
  const n = stamps.length;
  const boxes = stamps.map(stampBox);
  const parent = new Int32Array(n);
  for (let j = 0; j < n; j++) parent[j] = j;
  const find = (j) => {
    while (parent[j] !== j) j = parent[j] = parent[parent[j]];
    return j;
  };
  const join = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };
  // words: neighbours on one line stay together unless BOTH their ink gap is wider than a track (a proportional line's
  // space) AND their centre step is wider than 1.5× the line's tightest step (a grid's empty cell — on a grid every
  // letter sits a cell apart, so ink gap alone cannot tell a letter from a word)
  const sameLine = (j) =>
    Math.abs(stamps[j].y - stamps[j - 1].y) <= POEM_LINE_EPS_EM * Math.max(boxes[j].em, boxes[j - 1].em);
  const minStep = new Float64Array(n).fill(Infinity); // per stamp: its line's tightest centre step
  for (let j = 1, start = 0; j <= n; j++) {
    if (j === n || !sameLine(j)) {
      let m = Infinity;
      for (let k = start + 1; k < j; k++) m = Math.min(m, Math.abs(stamps[k].x - stamps[k - 1].x));
      for (let k = start; k < j; k++) minStep[k] = m;
      start = j;
    }
  }
  for (let j = 1; j < n; j++) {
    if (!sameLine(j)) continue;
    const a = boxes[j - 1];
    const b = boxes[j];
    const em = Math.max(a.em, b.em);
    const gap = Math.max(b.l - a.r, a.l - b.r);
    const step = Math.abs(stamps[j].x - stamps[j - 1].x);
    const wordBreak = gap > POEM_WORD_GAP_EM * em && step > 1.5 * minStep[j];
    if (!wordBreak) join(j - 1, j);
  }
  // merge: groups too close to lean apart safely move as one
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (find(i) === find(j)) continue;
      const a = boxes[i];
      const c = boxes[j];
      const sep = Math.max(c.l - a.r, a.l - c.r, c.t - a.b, a.t - c.b);
      if (sep <= POEM_LEAN_EM * (a.em + c.em)) join(i, j);
    }
  }
  const byRoot = new Map();
  for (let j = 0; j < n; j++) {
    const r = find(j);
    if (!byRoot.has(r)) byRoot.set(r, []);
    byRoot.get(r).push(j);
  }
  const words = [...byRoot.values()];
  WORDS_CACHE.set(stamps, words);
  return words;
}

/**
 * Lean a poem's drawn items by whole words. `items[j]` is stamp j's item (stage px); `field` the marks' lean field
 * (markDriftDelta's); `emPx(j)` stamp j's em in stage px. Mutates the items' x/y (they are built fresh on every build,
 * so nothing is cached past it). Returns the number of words moved.
 */
export function applyPoemLean(items, stamps, field, emPx) {
  if (!field || !Array.isArray(items) || !Array.isArray(stamps) || items.length !== stamps.length) return 0;
  let moved = 0;
  for (const word of poemWords(stamps)) {
    let cx = 0;
    let cy = 0;
    let em = Infinity;
    for (const j of word) {
      cx += items[j].x;
      cy += items[j].y;
      em = Math.min(em, Number(emPx(j)) || 0);
    }
    cx /= word.length;
    cy /= word.length;
    const lean = markDriftDelta(field, cx, cy);
    if (!lean || !(em > 0)) continue;
    const len = Math.hypot(lean.dx, lean.dy);
    const cap = POEM_LEAN_EM * em;
    const k = len > cap ? cap / len : 1;
    for (const j of word) {
      items[j].x += lean.dx * k;
      items[j].y += lean.dy * k;
    }
    moved++;
  }
  return moved;
}
